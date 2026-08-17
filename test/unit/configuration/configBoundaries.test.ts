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
