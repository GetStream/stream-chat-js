import { describe, expect, it, vi } from 'vitest';
import { getClientWithUser } from '../test-utils/getClient';
import { MessageComposer } from '../../../src/messageComposer/messageComposer';

/**
 * Three boundaries, one rule each, all found by a second review pass over the same feature.
 *
 * The first two are the other half of the fix recorded as **F9**, which copied caller patches at
 * `InstanceConfigurationService.setConfig` on the reasoning that it was "the single boundary at which
 * caller objects enter the SDK". It is not: `MessageComposer.updateConfig` and the composer's
 * constructor argument are two more, and both are read on *every* resolution for the composer's whole
 * life, so an aliased object there is longer-lived than one in the registry.
 *
 * The third is the freeze guarantee. `deepFreezeConfig(DEFAULT_COMPOSER_CONFIG)` only protects subtrees
 * the merge never copies — and `serverRestrictions` names `location` while `serverUpperBounds` names
 * `text` on every single resolution, so those two were always copied and always writable. They are also
 * the two subtrees callers actually touch.
 */
describe('configuration boundaries', () => {
  describe('caller-owned patches do not stay aliased', () => {
    it('updateConfig copies the patch', () => {
      const client = getClientWithUser({ id: 'user' });
      const composer = client.channel('messaging', 'c1').messageComposer;

      const patch = { text: { maxLengthOnSend: 100 } };
      composer.updateConfig(patch);
      expect(composer.config.text.maxLengthOnSend).toBe(100);

      patch.text.maxLengthOnSend = 5;
      composer.updateConfig({}); // any ordinary re-resolution

      expect(composer.config.text.maxLengthOnSend).toBe(100);
    });

    it('the constructor config argument is copied', () => {
      const client = getClientWithUser({ id: 'user' });
      const channel = client.channel('messaging', 'c2');

      const explicit = { text: { maxLengthOnSend: 100 } };
      const composer = new MessageComposer({
        client,
        compositionContext: channel,
        config: explicit,
      });
      expect(composer.config.text.maxLengthOnSend).toBe(100);

      explicit.text.maxLengthOnSend = 7;
      composer.updateConfig({});

      expect(composer.config.text.maxLengthOnSend).toBe(100);
    });

    it('still passes functions through by reference', () => {
      const client = getClientWithUser({ id: 'user' });
      const composer = client.channel('messaging', 'c3').messageComposer;
      const findURLFn = () => [];

      composer.updateConfig({ linkPreviews: { findURLFn } });

      expect(composer.config.linkPreviews.findURLFn).toBe(findURLFn);
    });
  });

  describe('the published composer config is frozen throughout', () => {
    it('freezes every subtree, not only the ones the merge left untouched', () => {
      const client = getClientWithUser({ id: 'user' });
      const composer = client.channel('messaging', 'c4').messageComposer;

      for (const [key, value] of Object.entries(composer.config)) {
        if (value && typeof value === 'object') {
          expect(Object.isFrozen(value), `config.${key} should be frozen`).toBe(true);
        }
      }
    });

    it('throws on a nested write to text, the subtree serverUpperBounds always copies', () => {
      const client = getClientWithUser({ id: 'user' });
      const composer = client.channel('messaging', 'c5').messageComposer;

      expect(() => {
        (composer.config.text as { maxLengthOnSend?: number }).maxLengthOnSend = 5;
      }).toThrow(TypeError);
      expect(composer.config.text.maxLengthOnSend).not.toBe(5);
    });

    it('stays frozen after a resolution that actually moves a value', () => {
      const client = getClientWithUser({ id: 'user' });
      const composer = client.channel('messaging', 'c6').messageComposer;

      composer.updateConfig({ text: { maxLengthOnSend: 42 } });

      expect(composer.config.text.maxLengthOnSend).toBe(42);
      expect(Object.isFrozen(composer.config.text)).toBe(true);
    });
  });

  describe("the 'client' key survives a disconnect/connect cycle", () => {
    // `disconnectUser` releases the subscription to run the setup function's teardown. It used to clear
    // the handle and never re-arm, so on a client that reconnects — `getInstance` hands the same object
    // back, and disconnect/connect is the documented multi-user flow — the key went permanently dead:
    // `setConfig`, `setSetupFunction` and `reset` all stopped reaching any manager, silently.
    const reconnect = async (client: ReturnType<typeof getClientWithUser>) => {
      vi.spyOn(client, 'closeConnection').mockResolvedValue(undefined as never);
      await client.disconnectUser().catch(() => undefined);
      client._setUser({ id: 'user' });
    };

    it('declarative configuration still reaches the managers', async () => {
      const client = getClientWithUser({ id: 'user' });
      await reconnect(client);

      client.config.setConfig('client', {
        reminders: { stopTimerRefreshBoundaryMs: 2222 },
      });

      expect(client.reminders.config.stopTimerRefreshBoundaryMs).toBe(2222);
    });

    it('a setup function registered afterwards still applies', async () => {
      const client = getClientWithUser({ id: 'user' });
      await reconnect(client);

      const setup = vi.fn();
      client.config.setSetupFunction('client', setup);

      expect(setup).toHaveBeenCalledTimes(1);
    });

    it('reset re-derives the managers again', async () => {
      const client = getClientWithUser({ id: 'user' });
      const defaultBoundary = client.reminders.config.stopTimerRefreshBoundaryMs;
      await reconnect(client);

      client.config.setConfig('client', {
        reminders: { stopTimerRefreshBoundaryMs: 3333 },
      });
      // Asserted before the reset too, so this cannot pass by the value never having moved.
      expect(client.reminders.config.stopTimerRefreshBoundaryMs).toBe(3333);

      client.config.reset();

      expect(client.reminders.config.stopTimerRefreshBoundaryMs).toBe(defaultBoundary);
    });

    it('does not double-wire when connectUser follows the constructor', () => {
      const client = getClientWithUser({ id: 'user' });
      const setup = vi.fn();
      client.config.setSetupFunction('client', setup);
      setup.mockClear();

      client._setUser({ id: 'user' });

      expect(setup).not.toHaveBeenCalled();
    });
  });
});

describe('the composer resolves through the shared controller', () => {
  /**
   * Nine of `MessageComposer`'s config members were the generic pipeline under different names. Two are
   * genuinely extra, and are declared hooks the controller offers and only this entity passes:
   * `retainPatches` and `applyAuthority`.
   *
   * A third, `finalizeRequest`, was added for `commands.sendValidator` and then deleted along with the
   * `applyCommandValidatorOverride` it called: both reached the same answer as the plain deep merge on
   * every layer shape, because a merge only writes keys that are present, so a silent later layer cannot
   * erase an earlier choice. The validator case below is the guard that the *behaviour* still holds.
   */
  it('retains an updateConfig request across a re-resolution (retainPatches)', () => {
    const client = getClientWithUser({ id: 'user' });
    client._addChannelConfig({
      type: 'messaging',
      config: { shared_locations: false } as never,
    });
    const composer = client.channel('messaging', 'c-layer').messageComposer;
    // Without this the composer never hears the server change — it is the subscription, not the
    // controller, that decides *when* to re-resolve.
    composer.registerSubscriptions();

    composer.updateConfig({ location: { enabled: true } });
    // The server says no, so the effective value is false…
    expect(composer.config.location.enabled).toBe(false);
    // …but the request is retained, which is the whole point of DV-18.
    expect(composer.requestedConfig.location.enabled).toBe(true);

    client._addChannelConfig({
      type: 'messaging',
      config: { shared_locations: true } as never,
    });

    // The server changes its mind and the original request re-emerges, rather than having been
    // overwritten by the server's earlier `false`.
    expect(composer.config.location.enabled).toBe(true);
  });

  it('drops retained requests on reset, but not on a re-resolution', () => {
    const client = getClientWithUser({ id: 'user' });
    const composer = client.channel('messaging', 'c-reset').messageComposer;
    composer.registerSubscriptions();
    const defaultMax = composer.config.text.maxLengthOnSend;
    composer.updateConfig({ text: { maxLengthOnSend: 7 } });

    composer.applyServerRestrictions(); // a re-resolution — keeps the layer
    expect(composer.config.text.maxLengthOnSend).toBe(7);

    client.config.reset(); // a reset — clears it
    expect(composer.config.text.maxLengthOnSend).toBe(defaultMax);
  });

  it('picks a sendValidator from the most specific layer that names one', () => {
    const client = getClientWithUser({ id: 'user' });
    const declarative = () => undefined;
    const imperative = () => undefined;
    client.config.set({ messageComposer: { commands: { sendValidator: declarative } } });
    const composer = client.channel('messaging', 'c-validator').messageComposer;

    expect(composer.config.commands.sendValidator).toBe(declarative);

    composer.updateConfig({ commands: { sendValidator: imperative } });

    // A function is chosen, never merged — and the most specific layer naming one wins.
    expect(composer.config.commands.sendValidator).toBe(imperative);
  });

  it.each([
    ['a later layer that says nothing about commands', { text: { enabled: true } }],
    ['a later layer naming commands without a validator', { commands: {} }],
    [
      'a later layer setting the validator to undefined',
      { commands: { sendValidator: undefined } },
    ],
  ])('does not lose an earlier validator to %s', (_name, laterLayer) => {
    // These three shapes are exactly what `applyCommandValidatorOverride` was written to protect against.
    // The merge handles them on its own — it only writes keys that are present, and skips `undefined` —
    // which is why the helper was deleted. Pinned here so the deletion cannot silently regress.
    const client = getClientWithUser({ id: 'user' });
    const declarative = () => undefined;
    client.config.set({ messageComposer: { commands: { sendValidator: declarative } } });
    const composer = client.channel(
      'messaging',
      `c-silent-${_name.length}`,
    ).messageComposer;

    composer.updateConfig(laterLayer as never);

    expect(composer.config.commands.sendValidator).toBe(declarative);
  });

  it('applies the server ceiling on every resolution (applyAuthority)', () => {
    const client = getClientWithUser({ id: 'user' });
    client._addChannelConfig({
      type: 'messaging',
      config: { max_message_length: 100 } as never,
    });
    const composer = client.channel('messaging', 'c-bounds').messageComposer;

    composer.updateConfig({ text: { maxLengthOnSend: 5000 } });

    // Tightest wins, and it is re-applied rather than accumulated, so the request stays 5000.
    expect(composer.config.text.maxLengthOnSend).toBe(100);
    expect(composer.requestedConfig.text.maxLengthOnSend).toBe(5000);
  });

  it('still resolves the documented layer order — construction argument over declarative', () => {
    const client = getClientWithUser({ id: 'user' });
    client.config.set({ messageComposer: { text: { maxLengthOnSend: 10 } } });

    const composer = new MessageComposer({
      client,
      compositionContext: client.channel('messaging', 'c-order'),
      config: { text: { maxLengthOnSend: 20 } },
    });

    // docs §3: the construction argument is stage 3, the declarative tree stage 2.
    expect(composer.config.text.maxLengthOnSend).toBe(20);
  });
});
