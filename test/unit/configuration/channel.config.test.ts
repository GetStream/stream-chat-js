import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getClientWithUser } from '../test-utils/getClient';
import type { Channel } from '../../../src/channel';
import type { StreamChat } from '../../../src/client';
import { convertDateToTimestamp } from '../test-utils/time';

describe("the 'channel' configuration key", () => {
  let client: StreamChat;

  beforeEach(() => {
    client = getClientWithUser({ id: 'user' });
  });

  const openChannel = (id = 'channel-id'): Channel => client.channel('messaging', id);

  describe('declarative configuration', () => {
    it('reaches a channel created after registration', () => {
      client.config.set({ channel: { messagePaginator: { pageSize: 50 } } });

      expect(openChannel().messagePaginator.config.pageSize).toBe(50);
    });

    it('reaches a channel that already exists', () => {
      const channel = openChannel();

      client.config.set({ channel: { messagePaginator: { pageSize: 50 } } });

      expect(channel.messagePaginator.config.pageSize).toBe(50);
    });

    it('configures the pinned-message paginator independently of the main list', () => {
      client.config.set({
        channel: {
          messagePaginator: { pageSize: 50 },
          pinnedMessagesPaginator: { pageSize: 25 },
        },
      });
      const channel = openChannel();

      expect(channel.messagePaginator.config.pageSize).toBe(50);
      expect(channel.pinnedMessagesPaginator.config.pageSize).toBe(25);
    });

    it('installs request handlers into configState', () => {
      const sendMessageRequest = vi.fn();
      client.config.set({ channel: { requestHandlers: { sendMessageRequest } } });

      expect(openChannel().configState.getLatestValue().requestHandlers).toEqual({
        sendMessageRequest,
      });
    });

    it('changes observable throttling behaviour, not just the stored value', () => {
      // `stateThrottleMs` is read once, when the throttles are built — a plain assignment would be
      // silently discarded, so this asserts the rebuild setter was actually used.
      client.config.set({ channel: { messagePaginator: { stateThrottleMs: 250 } } });

      expect(openChannel().messagePaginator.config.stateThrottleMs).toBe(250);
    });

    it('changes observable debouncing behaviour', () => {
      const channel = openChannel();
      const setDebounceOptions = vi.spyOn(channel.messagePaginator, 'setDebounceOptions');

      client.config.set({ channel: { messagePaginator: { debounceMs: 900 } } });

      expect(setDebounceOptions).toHaveBeenCalledWith({ debounceMs: 900 });
      expect(channel.messagePaginator.config.debounceMs).toBe(900);
    });
  });

  describe('construction-time injection', () => {
    it('applies a read-once field when registered before the channel exists', () => {
      client.config.set({
        channel: { messagePaginator: { unreadReferencePolicy: 'read-state-only' } },
      });

      const channel = openChannel();

      // Read once by the constructor — reachable only because the channel passes the declarative slice
      // through as a constructor option.
      expect(
        (channel.messagePaginator as unknown as { unreadReferencePolicy: string })
          .unreadReferencePolicy,
      ).toBe('read-state-only');
    });

    it('leaves an already-built channel on the default for a read-once field', () => {
      const channel = openChannel();

      client.config.set({
        channel: { messagePaginator: { unreadReferencePolicy: 'read-state-only' } },
      });

      // Order-dependent by design; the registry warns in this case rather than failing silently.
      expect(
        (channel.messagePaginator as unknown as { unreadReferencePolicy: string })
          .unreadReferencePolicy,
      ).toBe('snapshot');
    });

    it('does not accept composer configuration under the channel key', () => {
      client.config.set({ messageComposer: { drafts: { enabled: true } } });

      // Composer configuration is a top-level key, never nested under `channel` — one path only.
      expect(openChannel().messageComposer.config.drafts.enabled).toBe(true);
    });
  });

  describe('setup functions', () => {
    it('runs for a channel created afterwards', () => {
      const seen: string[] = [];
      client.config.setSetupFunction('channel', ({ channel }) => {
        seen.push(channel.cid);
      });

      openChannel('later');

      expect(seen).toEqual(['messaging:later']);
    });

    it('runs for every channel that already exists', () => {
      const a = openChannel('a');
      const b = openChannel('b');
      const seen: string[] = [];

      client.config.setSetupFunction('channel', ({ channel }) => {
        seen.push(channel.cid);
      });

      expect(seen.sort()).toEqual([a.cid, b.cid].sort());
    });

    it('overrides a declarative value for the same field', () => {
      client.config.set({ channel: { messagePaginator: { pageSize: 50 } } });
      client.config.setSetupFunction('channel', ({ channel }) => {
        channel.messagePaginator.updateConfig({ pageSize: 200 });
      });

      // Tier 2 is applied after tier 1, so it wins.
      expect(openChannel().messagePaginator.config.pageSize).toBe(200);
    });

    it('cannot break client.channel() by throwing', () => {
      client.config.setSetupFunction('channel', () => {
        throw new Error('boom');
      });

      expect(() => openChannel()).not.toThrow();
    });

    it('is torn down by _disconnect, exactly once', () => {
      const teardown = vi.fn();
      client.config.setSetupFunction('channel', () => teardown);
      const channel = openChannel();

      channel._disconnect();
      channel._disconnect();

      expect(teardown).toHaveBeenCalledTimes(1);
    });

    it('stops reaching a disconnected channel', () => {
      const channel = openChannel();
      channel._disconnect();
      const setup = vi.fn();

      client.config.setSetupFunction('channel', setup);

      expect(setup).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('returns the paginators to their derived baseline', () => {
      client.config.set({ channel: { messagePaginator: { pageSize: 50 } } });
      const channel = openChannel();

      client.config.reset('channel');

      expect(channel.messagePaginator.config.pageSize).toBe(100); // channel message list default
    });

    it('clears declaratively installed request handlers', () => {
      client.config.set({
        channel: { requestHandlers: { sendMessageRequest: vi.fn() } },
      });
      const channel = openChannel();

      client.config.reset('channel');

      expect(channel.configState.getLatestValue().requestHandlers).toBeUndefined();
    });

    it('recovers even when a setup function left no teardown', () => {
      const channel = openChannel();
      const original = channel.messagePaginator.config.itemOrderComparator;
      client.config.setSetupFunction('channel', ({ channel: c }) => {
        c.messagePaginator.updateConfig({ itemOrderComparator: () => 0 });
        // deliberately no teardown
      });

      client.config.reset('channel');

      // Re-derivation re-installs it; a snapshot of config values never could have.
      //
      // Asserted as `toBe(original)` rather than `not.toBe`. The old expectation pinned an
      // implementation detail — the overlay used to rebuild its closures on every install, so the
      // restored comparator was merely an equivalent one. The paginator now memoizes them, which the
      // guard in `initializeConfig` needs to recognise an unchanged derivation, and which makes this the
      // stronger claim: the reset restored *the* comparator, not a lookalike.
      expect(channel.messagePaginator.config.itemOrderComparator).toBe(original);
      expect(typeof channel.messagePaginator.config.itemOrderComparator).toBe('function');
      const older = {
        id: 'a',
        created_at: convertDateToTimestamp(new Date('2020-01-01')),
      } as never;
      const newer = {
        id: 'b',
        created_at: convertDateToTimestamp(new Date('2021-01-01')),
      } as never;
      expect(
        channel.messagePaginator.config.itemOrderComparator?.(older, newer),
      ).toBeLessThan(0);
    });

    // A `Channel` is a live instance of three keys — `channel` plus the shared `messagePaginator` and
    // `messageOperations`. One reset must re-derive it once. It used to re-derive 5–6 times: three
    // distinct handles in `reset`'s de-duplicating Set, plus a cycle per watched key whose store
    // published a `null → null` clear.
    it('re-derives a channel exactly once, despite three registered keys', () => {
      const channel = openChannel();
      const initializeConfig = vi.spyOn(channel, 'initializeConfig');

      client.config.reset();

      expect(initializeConfig).toHaveBeenCalledTimes(1);
    });

    it('re-derives exactly once when all three keys carry configuration', () => {
      client.config.set({
        channel: { messagePaginator: { pageSize: 11 } },
        messageOperations: { failedSendCacheMaxSize: 7 },
        messagePaginator: { retryCount: 4 },
      });
      const channel = openChannel();
      // the probe can see the bug: all three registrations landed
      expect(channel.messagePaginator.config.pageSize).toBe(11);
      expect(channel.messagePaginator.config.retryCount).toBe(4);
      expect(channel.messageOperations.config.failedSendCacheMaxSize).toBe(7);
      const initializeConfig = vi.spyOn(channel, 'initializeConfig');

      client.config.reset();

      expect(initializeConfig).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * `typing_events` and `read_events` were the last two channel-type flags with no declarative
   * counterpart. The SDK already gated its *actions* on them (`keystroke`, `markRead`, `markUnread`), so
   * this is not a correctness gap being closed — it is the two things that were missing: an off-switch
   * for the integrator, and one reconciled value to read instead of the raw flag.
   */
  /**
   * `Readonly<ChannelConfig>` rejects `channel.config.availableCommands = []` but is shallow, so it accepts
   * the nested form — which is the one that escapes the instance. The five gates below are copied on every
   * derivation (the server's restrictions name them), so the frozen package defaults never covered them.
   */
  /**
   * The `channel` slice also carries `messagePaginator`, `pinnedMessagesPaginator` and
   * `messageOperations`. Those are handed to the sub-objects directly; the channel used to resolve them
   * onto its own config as well, where nothing read them — `ChannelConfig` does not declare them — and a
   * registration against one notified every `configState` subscriber for a change that did not concern
   * the channel.
   */
  describe('resolves only its own fields', () => {
    it('keeps the sub-object keys off channel.config', () => {
      client.config.set({
        channel: {
          messageOperations: { optimisticUpdate: false } as never,
          messagePaginator: { pageSize: 50 },
          pinnedMessagesPaginator: { pageSize: 5 },
        },
      });

      const channel = openChannel();

      // The scoped overrides still reach the objects they are for.
      expect(channel.messagePaginator.config.pageSize).toBe(50);
      expect(channel.pinnedMessagesPaginator.config.pageSize).toBe(5);
      // Asserted as absences rather than an exact key list, so adding a field to `ChannelConfig` does
      // not fail this test for an unrelated reason.
      expect(channel.config).not.toHaveProperty('messagePaginator');
      expect(channel.config).not.toHaveProperty('pinnedMessagesPaginator');
      expect(channel.config).not.toHaveProperty('messageOperations');
    });

    it('does not notify channel.configState when a sub-object key is registered', () => {
      const channel = openChannel();
      const listener = vi.fn();
      channel.configState.subscribe(listener);
      listener.mockClear();

      client.config.set({ channel: { messagePaginator: { pageSize: 50 } } });

      expect(channel.messagePaginator.config.pageSize).toBe(50);
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('the resolved config is frozen', () => {
    it.each([
      'deliveryEvents',
      'readEvents',
      'replies',
      'typingEvents',
      'userMessageReminders',
    ] as const)('refuses a nested write to %s', (gate) => {
      const channel = openChannel();

      expect(() => {
        (channel.config[gate] as { enabled: boolean }).enabled = false;
      }).toThrow(TypeError);
      expect(channel.config[gate].enabled).toBe(true);
    });

    it('refuses a write to availableCommands, and does not share the array with the cache', () => {
      const channel = openChannel();
      client.channelServerConfigsStore.partialNext({
        configs: {
          [channel.cid]: { commands: [{ name: 'giphy' }] } as never,
        },
      });

      expect(channel.config.availableCommands).toEqual([{ name: 'giphy' }]);
      expect(() => channel.config.availableCommands.push({ name: 'ban' })).toThrow(
        TypeError,
      );
      // A copy, so freezing the resolved value cannot freeze the cache every channel of the type reads.
      expect(channel.config.availableCommands).not.toBe(
        client.channelServerConfigs[channel.cid]?.commands,
      );
      expect(Object.isFrozen(client.channelServerConfigs[channel.cid]?.commands)).toBe(
        false,
      );
    });

    it('leaves the declarative slice writable — only the resolved copy is frozen', () => {
      // The order in `applyAuthority` matters: copy, then freeze. Freezing in place reached the subtree
      // held by `client.config`, and a paginator resolving from that same object could no longer merge
      // into it.
      client.config.set({ channel: { messagePaginator: { pageSize: 50 } } });
      const channel = openChannel();

      expect(channel.messagePaginator.config.pageSize).toBe(50);
      expect(Object.isFrozen(client.config.getConfig('channel')?.messagePaginator)).toBe(
        false,
      );
    });
  });

  describe('typing and read events', () => {
    const withServerConfig = (config: Record<string, unknown>, id = 'channel-id') => {
      client.channelServerConfigsStore.partialNext({
        configs: { [`messaging:${id}`]: config as never },
      });
      return openChannel(id);
    };

    it('defaults both to enabled when the server states nothing', () => {
      const { readEvents, typingEvents } = openChannel().configState.getLatestValue();

      expect(typingEvents.enabled).toBe(true);
      expect(readEvents.enabled).toBe(true);
    });

    it.each([
      { expected: true, requested: undefined, server: undefined },
      { expected: false, requested: false, server: undefined },
      { expected: false, requested: undefined, server: false },
      { expected: false, requested: true, server: false },
      { expected: true, requested: undefined, server: true },
      { expected: false, requested: false, server: true },
      { expected: true, requested: true, server: true },
    ])(
      'ANDs both gates: requested=$requested server=$server -> $expected',
      ({ expected, requested, server }) => {
        client.config.set({
          channel: {
            readEvents: { enabled: requested },
            typingEvents: { enabled: requested },
          },
        });

        const channel = withServerConfig({
          read_events: server,
          typing_events: server,
        });
        const { readEvents, typingEvents } = channel.configState.getLatestValue();

        expect(typingEvents.enabled).toBe(expected);
        expect(readEvents.enabled).toBe(expected);
      },
    );

    it('re-derives when the server config arrives after construction', () => {
      // The case the subscription exists for: a channel built before it has been queried reads
      // `serverConfig` as undefined, so the restriction states nothing and the defaults stand. Without
      // re-deriving, an app that disables read events server-side keeps a channel that believes they
      // are on.
      const channel = openChannel();
      expect(channel.configState.getLatestValue().readEvents.enabled).toBe(true);

      client.channelServerConfigsStore.partialNext({
        configs: { [channel.cid]: { read_events: false } as never },
      });

      expect(channel.configState.getLatestValue().readEvents.enabled).toBe(false);
    });

    describe('_isTypingIndicatorsEnabled', () => {
      // The other two axes have to be satisfied or the gate short-circuits before reaching configuration
      // and the assertions below pass for the wrong reason — which they did, until reverting the gate to
      // the raw server flag failed to break anything.
      beforeEach(() => {
        client.wsConnection = { isHealthy: true } as never;
        client.user = { id: 'user' } as never;
      });

      it('is true when both the server and the integrator allow it', () => {
        const channel = withServerConfig({ typing_events: true });

        expect(channel._isTypingIndicatorsEnabled()).toBe(true);
      });

      it('is false when the integrator disables them, with a permissive server', () => {
        client.config.set({ channel: { typingEvents: { enabled: false } } });
        const channel = withServerConfig({ typing_events: true });

        expect(channel._isTypingIndicatorsEnabled()).toBe(false);
      });

      it('is false when the server disables them, whatever the integrator asked', () => {
        client.config.set({ channel: { typingEvents: { enabled: true } } });
        const channel = withServerConfig({ typing_events: false });

        expect(channel._isTypingIndicatorsEnabled()).toBe(false);
      });
    });

    it('refuses markRead when the integrator disables read events', async () => {
      client.config.set({ channel: { readEvents: { enabled: false } } });
      const channel = withServerConfig({ read_events: true });
      channel.initialized = true;

      await expect(channel.markRead()).rejects.toThrow('Read events are disabled');
    });

    it('leaves the sibling group alone when only one is registered', () => {
      // `mergeSlice: 'deep'` — naming one nested group must not drop the other.
      client.config.set({ channel: { typingEvents: { enabled: false } } });

      const { readEvents, typingEvents } = openChannel().configState.getLatestValue();

      expect(typingEvents.enabled).toBe(false);
      expect(readEvents.enabled).toBe(true);
    });

    it('mirrors the server command list, which the integrator cannot set', () => {
      // A list, not a gate: nothing to AND and no intent to express, so the server's answer *is* the
      // value. It lives on the resolved config anyway so consumers never need a second place to look.
      const commands = [{ args: '', description: 'Ban', name: 'ban', set: 'moderation' }];
      const channel = withServerConfig({ commands });

      expect(channel.config.availableCommands).toEqual(commands);
      // absent from the declarative tree, so registering it is not offered and does not take
      client.config.set({ channel: { availableCommands: [] } } as never);
      expect(channel.config.availableCommands).toEqual(commands);
    });

    it('ANDs the replies gate like the others', () => {
      client.config.set({ channel: { replies: { enabled: true } } });
      const channel = withServerConfig({ replies: false });

      expect(channel.config.replies.enabled).toBe(false);
    });

    it('restores both on reset', () => {
      client.config.set({
        channel: {
          readEvents: { enabled: false },
          typingEvents: { enabled: false },
        },
      });
      const channel = openChannel();

      client.config.reset();

      const { readEvents, typingEvents } = channel.configState.getLatestValue();
      expect(typingEvents.enabled).toBe(true);
      expect(readEvents.enabled).toBe(true);
    });
  });
});
