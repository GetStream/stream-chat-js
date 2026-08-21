import { beforeEach, describe, expect, it } from 'vitest';
import { generateChannel } from '../test-utils/generateChannel';
import { getClientWithUser } from '../test-utils/getClient';
import { MessageComposer } from '../../../src/messageComposer';
import type { StreamChat } from '../../../src/client';

/**
 * The stage table in `docs/instance-configuration.md` §3, asserted rather than described.
 *
 * Later stages win: defaults, the declarative tree, the construction argument, a setup function, imperative
 * changes, and the server last. Only the server row had tests; the rest was documentation, and one row was
 * simply false — a declarative change arriving after an imperative one used to overwrite it, because the
 * declarative slice was copied in through `updateConfig` and so filed under imperative changes.
 *
 * Ordering is worth pinning per pair rather than in one big case: a single scenario touching all six stages
 * passes as long as the *last* one wins, and would miss an inversion in the middle.
 */
describe('configuration resolution order (MessageComposer)', () => {
  let client: StreamChat;
  let channelId: string;

  beforeEach(() => {
    client = getClientWithUser({ id: 'user' });
    channelId = generateChannel().channel.id;
  });

  const composerFor = (config?: Parameters<typeof MessageComposer>[0]['config']) => {
    const channel = client.channel('messaging', channelId);
    if (!config) {
      channel.messageComposer.registerSubscriptions();
      return channel.messageComposer;
    }
    // A construction argument only exists for a composer somebody builds deliberately — `channel
    // .messageComposer` is built by the SDK without one, which is stage 3's whole caveat in the docs.
    const composer = new MessageComposer({
      client,
      composition: undefined,
      compositionContext: channel,
      config,
    });
    composer.registerSubscriptions();
    return composer;
  };

  it('1 → 2: the declarative tree beats package defaults', () => {
    expect(composerFor().config.text.publishTypingEvents).toBe(true);

    client.config.set({ messageComposer: { text: { publishTypingEvents: false } } });

    expect(composerFor().config.text.publishTypingEvents).toBe(false);
  });

  it('2 → 3: the construction argument beats the declarative tree', () => {
    client.config.set({ messageComposer: { text: { publishTypingEvents: false } } });

    const composer = composerFor({ text: { publishTypingEvents: true } });

    expect(composer.config.text.publishTypingEvents).toBe(true);
  });

  it('3 → 5: an imperative change beats the construction argument', () => {
    const composer = composerFor({ text: { publishTypingEvents: true } });

    composer.updateConfig({ text: { publishTypingEvents: false } });

    expect(composer.config.text.publishTypingEvents).toBe(false);
  });

  it('5 over a later 2: a declarative change does not overwrite an imperative one', () => {
    // The row that was false. The declarative slice is read live when the configuration is resolved, so it
    // stays in its own layer instead of being copied into the imperative one.
    const composer = composerFor();
    composer.updateConfig({ text: { publishTypingEvents: false } });

    client.config.set({ messageComposer: { text: { publishTypingEvents: true } } });

    expect(composer.config.text.publishTypingEvents).toBe(false);
  });

  it('a later declarative change still lands on a field nobody claimed imperatively', () => {
    // The other side of the previous test: staying in its own layer must not mean being ignored.
    const composer = composerFor();
    composer.updateConfig({ text: { publishTypingEvents: false } });

    client.config.set({ messageComposer: { drafts: { enabled: true } } });

    expect(composer.config.drafts.enabled).toBe(true);
    expect(composer.config.text.publishTypingEvents).toBe(false);
  });

  describe('reset', () => {
    it('discards imperative changes and keeps what is registered', () => {
      client.config.set({ messageComposer: { text: { publishTypingEvents: false } } });
      const composer = composerFor();
      composer.updateConfig({
        text: { publishTypingEvents: true },
        drafts: { enabled: true },
      });

      client.config.reset();

      // Both imperative fields go; the declarative one is gone too, because `reset` clears the tree — what
      // remains is stage 1.
      expect(composer.config.text.publishTypingEvents).toBe(true); // package default
      expect(composer.config.drafts.enabled).toBe(false); // package default
    });

    it('keeps a construction argument, which a reset does not own', () => {
      const composer = composerFor({ text: { publishTypingEvents: false } });
      composer.updateConfig({ drafts: { enabled: true } });

      client.config.reset();

      expect(composer.config.text.publishTypingEvents).toBe(false);
      expect(composer.config.drafts.enabled).toBe(false);
    });
  });
});

/**
 * The asymmetry the stage table does *not* describe, pinned so it is visible rather than folded.
 *
 * Only `MessageComposer` stores the stages separately (**DEC-38**), because only it has a server restriction
 * to re-apply without destroying the request underneath. Every other configurable object re-derives from its
 * registered inputs, so an imperative `updateConfig()` lasts until the next cycle and no longer. The docs
 * asserted both behaviours as general rules at one point (**DV-22**); these tests are what would catch that
 * again, and what will fail — informatively — if **FU-35** ever extends the composer's model to the rest.
 */
describe('imperative changes through a cycle: composer vs everything else', () => {
  let client: StreamChat;
  let channelId: string;

  beforeEach(() => {
    client = getClientWithUser({ id: 'asymmetry' });
    channelId = generateChannel().channel.id;
  });

  it('the composer keeps one', () => {
    const channel = client.channel('messaging', channelId);
    channel.messageComposer.registerSubscriptions();
    channel.messageComposer.updateConfig({ text: { maxLengthOnSend: 77 } });

    // A cycle, triggered by a declarative change to an unrelated field under the same key.
    client.config.set({ messageComposer: { drafts: { enabled: true } } });

    expect(channel.messageComposer.config.text.maxLengthOnSend).toBe(77);
  });

  it('a paginator drops one', () => {
    const channel = client.channel('messaging', channelId);
    channel.messagePaginator.updateConfig({ retryCount: 7 });

    client.config.set({ channel: { messagePaginator: { pageSize: 33 } } });

    // Back to the package default: the re-derivation reads the registered inputs, and 7 was not among them.
    expect(channel.messagePaginator.config.retryCount).toBe(0);
    expect(channel.messagePaginator.config.pageSize).toBe(33);
  });

  it('a setup function persists for the paginator, which is the documented way round it', () => {
    const channel = client.channel('messaging', channelId);
    client.config.setSetupFunction('channel', ({ channel: target }) => {
      target.messagePaginator.updateConfig({ retryCount: 7 });
    });

    client.config.set({ channel: { messagePaginator: { pageSize: 33 } } });

    // Re-run as part of the cycle rather than remembered, so the effect is reapplied.
    expect(channel.messagePaginator.config.retryCount).toBe(7);
    expect(channel.messagePaginator.config.pageSize).toBe(33);
  });
});
