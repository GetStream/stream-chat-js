import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateChannel } from '../test-utils/generateChannel';
import { generateMsg } from '../test-utils/generateMessage';
import { generateThreadResponse } from '../test-utils/generateThreadResponse';
import { getClientWithUser } from '../test-utils/getClient';
import { mockChannelQueryResponse } from '../test-utils/mockChannelQueryResponse';
import { StreamChat } from '../../../src/client';
import { Thread } from '../../../src/thread';
import type { Channel } from '../../../src/channel';
import { convertDateToTimestamp } from '../test-utils/time';

/**
 * Cross-instance coverage: all four built-in keys, both tiers, both registration orders, reset, the
 * deprecated setters, and the server-authority invariant.
 *
 * The whole-tree test below is the important one. The per-key suites each cover their own paths; this is
 * the only place that walks every path in the shipped `InstanceConfigTree` in one pass, which is what
 * catches a declarative path that type-checks, stores its value, and lands nowhere.
 */
describe('instance configuration — cross-instance', () => {
  let client: StreamChat;
  let channelResponse: ReturnType<typeof generateChannel>['channel'];
  let parentMessage: ReturnType<typeof generateMsg>;

  beforeEach(() => {
    client = getClientWithUser({ id: 'user' });
    channelResponse = generateChannel().channel;
    parentMessage = generateMsg();
  });

  const openChannel = (id = channelResponse.id): Channel =>
    client.channel('messaging', id);
  const openThread = () =>
    new Thread({
      client,
      threadData: generateThreadResponse(channelResponse, parentMessage),
    });
  /** Populate the channel's server-side config, as `query`/`watch` would. */
  const setServerConfig = (channel: Channel, config: Record<string, unknown>) =>
    client._addChannelConfig({ cid: channel.cid, config } as never);

  describe('every path in the tree lands on its real target', () => {
    it('applies the whole tree in one call', () => {
      const shapeChanged = vi.fn(() => true);
      const fileUploadFilter = vi.fn(() => true);
      const findURLFn = vi.fn(() => []);
      const getDeviceId = vi.fn(() => 'device');
      const sendValidator = vi.fn();
      const sortComparator = vi.fn(() => 0);
      const sendMessageRequest = vi.fn();
      const markReadRequest = vi.fn();

      client.config.set({
        channel: {
          messagePaginator: {
            debounceMs: 111,
            hasPaginationQueryShapeChanged: shapeChanged,
            initialOffset: 5,
            lockItemOrder: true,
            pageSize: 51,
            retryCount: 2,
            stateThrottleMs: 252,
            throwErrors: true,
            unreadReferencePolicy: 'read-state-only',
          },
          pinnedMessagesPaginator: {
            debounceMs: 222,
            lockItemOrder: true,
            pageSize: 26,
            retryCount: 3,
            stateThrottleMs: 333,
            throwErrors: true,
          },
          requestHandlers: { sendMessageRequest },
        },
        client: {
          notifications: { durations: { error: 10_001, info: 3_001 }, sortComparator },
          reminders: {
            scheduledOffsetsMs: [61_000],
            stopTimerRefreshBoundaryMs: 999_000,
          },
        },
        messageComposer: {
          attachments: {
            acceptedFiles: ['image/png'],
            fileUploadFilter,
            maxNumberOfFilesPerMessage: 5,
            trackUploadProgress: false,
          },
          commands: { sendValidator },
          drafts: { enabled: true },
          linkPreviews: { debounceURLEnrichmentMs: 801, enabled: true, findURLFn },
          location: { getDeviceId },
          text: { enabled: false, publishTypingEvents: false },
        },
        thread: {
          messagePaginator: { debounceMs: 444, pageSize: 27, retryCount: 4 },
          requestHandlers: { markReadRequest },
        },
      });

      const channel = openChannel();
      const thread = openThread();

      // channel.messagePaginator — every field
      expect(channel.messagePaginator.config).toMatchObject({
        debounceMs: 111,
        hasPaginationQueryShapeChanged: shapeChanged,
        initialOffset: 5,
        lockItemOrder: true,
        pageSize: 51,
        retryCount: 2,
        stateThrottleMs: 252,
        throwErrors: true,
      });
      expect(
        (channel.messagePaginator as unknown as { unreadReferencePolicy: string })
          .unreadReferencePolicy,
      ).toBe('read-state-only');

      // channel.pinnedMessagesPaginator — configured independently
      expect(channel.pinnedMessagesPaginator.config).toMatchObject({
        debounceMs: 222,
        lockItemOrder: true,
        pageSize: 26,
        retryCount: 3,
        stateThrottleMs: 333,
        throwErrors: true,
      });

      // channel.configState
      expect(channel.configState.getLatestValue().requestHandlers).toEqual({
        sendMessageRequest,
      });

      // thread
      expect(thread.messagePaginator.config).toMatchObject({
        debounceMs: 444,
        pageSize: 27,
        retryCount: 4,
      });
      expect(thread.configState.getLatestValue().requestHandlers).toEqual({
        markReadRequest,
      });

      // messageComposer — reached through the channel's own composer
      expect(channel.messageComposer.config).toMatchObject({
        attachments: {
          acceptedFiles: ['image/png'],
          fileUploadFilter,
          maxNumberOfFilesPerMessage: 5,
          trackUploadProgress: false,
        },
        commands: { sendValidator },
        drafts: { enabled: true },
        linkPreviews: { debounceURLEnrichmentMs: 801, enabled: true, findURLFn },
        text: { enabled: false, publishTypingEvents: false },
      });
      expect(channel.messageComposer.config.location.getDeviceId).toBe(getDeviceId);

      // client-owned managers
      expect(client.reminders.configState.getLatestValue()).toMatchObject({
        scheduledOffsetsMs: [61_000],
        stopTimerRefreshBoundaryMs: 999_000,
      });
      expect(client.notifications.config.durations).toMatchObject({
        error: 10_001,
        info: 3_001,
      });
      expect(client.notifications.config.sortComparator).toBe(sortComparator);
      // Untouched severities keep their defaults rather than being wiped by the merge.
      expect(client.notifications.config.durations.warning).toBe(3_000);
    });

    it('changes observable behaviour for the read-once paginator fields', () => {
      client.config.set({ channel: { messagePaginator: { stateThrottleMs: 250 } } });
      const channel = openChannel();
      const internals = channel.messagePaginator as unknown as {
        _executeQueryDebounced: unknown;
        _windowPublishThrottle: unknown;
      };
      const debounceBefore = internals._executeQueryDebounced;
      const throttleBefore = internals._windowPublishThrottle;

      client.config.setConfig('channel', { messagePaginator: { debounceMs: 900 } });

      // The debounce is rebuilt, because a plain assignment would be discarded — it is captured in a
      // closure.
      expect(channel.messagePaginator.config.debounceMs).toBe(900);
      expect(internals._executeQueryDebounced).not.toBe(debounceBefore);
      // The throttle is *not*, because 250 did not move. The old code rebuilt it on every derivation
      // regardless, flushing pending publishes each time for nothing.
      expect(channel.messagePaginator.config.stateThrottleMs).toBe(250);
      expect(internals._windowPublishThrottle).toBe(throttleBefore);
    });
  });

  describe('both registration orders, per key', () => {
    it('reaches instances created after registration', () => {
      client.config.set({
        channel: { messagePaginator: { pageSize: 41 } },
        client: { reminders: { scheduledOffsetsMs: [1] } },
        messageComposer: { drafts: { enabled: true } },
        thread: { messagePaginator: { pageSize: 42 } },
      });

      const channel = openChannel();
      expect(channel.messagePaginator.config.pageSize).toBe(41);
      expect(channel.messageComposer.config.drafts.enabled).toBe(true);
      expect(openThread().messagePaginator.config.pageSize).toBe(42);
      expect(client.reminders.configState.getLatestValue().scheduledOffsetsMs).toEqual([
        1,
      ]);
    });

    it('reaches instances that already exist', () => {
      const channel = openChannel();
      const thread = openThread();
      thread.registerSubscriptions();
      channel.messageComposer.registerSubscriptions();

      client.config.set({
        channel: { messagePaginator: { pageSize: 41 } },
        client: { reminders: { scheduledOffsetsMs: [1] } },
        messageComposer: { drafts: { enabled: true } },
        thread: { messagePaginator: { pageSize: 42 } },
      });

      expect(channel.messagePaginator.config.pageSize).toBe(41);
      expect(thread.messagePaginator.config.pageSize).toBe(42);
      expect(channel.messageComposer.config.drafts.enabled).toBe(true);
      expect(client.reminders.configState.getLatestValue().scheduledOffsetsMs).toEqual([
        1,
      ]);
    });
  });

  describe('setup functions', () => {
    it('fires each key with the right argument shape', () => {
      const seen: Record<string, string[]> = {};
      client.config.setSetupFunction('client', ({ client: c }) => {
        seen.client = Object.keys({ reminders: c.reminders });
      });
      client.config.setSetupFunction('channel', ({ channel }) => {
        seen.channel = [channel.cid];
      });
      client.config.setSetupFunction('thread', ({ thread }) => {
        seen.thread = [thread.id];
      });
      client.config.setSetupFunction('messageComposer', ({ composer }) => {
        seen.messageComposer = [composer.channel.cid];
      });

      const channel = openChannel();
      channel.messageComposer.registerSubscriptions();
      const thread = openThread();
      thread.registerSubscriptions();

      expect(seen.client).toEqual(['reminders']);
      expect(seen.channel).toEqual([channel.cid]);
      expect(seen.thread).toEqual([thread.id]);
      expect(seen.messageComposer).toEqual([channel.cid]);
    });

    it('reaches sub-objects the declarative tree does not name', () => {
      const reached: string[] = [];
      client.config.setSetupFunction('channel', ({ channel }) => {
        reached.push(typeof channel.cooldownTimer, typeof channel.messageReceiptsTracker);
      });
      client.config.setSetupFunction('messageComposer', ({ composer }) => {
        reached.push(typeof composer.attachmentManager, typeof composer.textComposer);
      });

      openChannel().messageComposer.registerSubscriptions();

      expect(reached).toEqual(['object', 'object', 'object', 'object']);
    });

    it('wins over a declarative value for the same field', () => {
      client.config.set({ channel: { messagePaginator: { pageSize: 41 } } });
      client.config.setSetupFunction('channel', ({ channel }) => {
        channel.messagePaginator.updateConfig({ pageSize: 202 });
      });

      expect(openChannel().messagePaginator.config.pageSize).toBe(202);
    });

    it('leaves each instance usable when it throws', () => {
      for (const key of ['client', 'channel', 'thread', 'messageComposer'] as const) {
        client.config.setSetupFunction(key, () => {
          throw new Error(`boom-${key}`);
        });
      }

      const channel = openChannel();
      expect(() => channel.messageComposer.registerSubscriptions()).not.toThrow();
      expect(() => openThread().registerSubscriptions()).not.toThrow();
      expect(channel.messagePaginator.config.pageSize).toBe(100);
    });

    it('clearing one key does not disturb the others', () => {
      const channelTeardown = vi.fn();
      const threadSetup = vi.fn();
      client.config.setSetupFunction('channel', () => channelTeardown);
      client.config.setSetupFunction('thread', threadSetup);
      openChannel();
      openThread().registerSubscriptions();
      threadSetup.mockClear();

      client.config.setSetupFunction('channel', null);

      expect(channelTeardown).toHaveBeenCalledTimes(1);
      expect(threadSetup).not.toHaveBeenCalled();
      expect(client.config.getSetupFunction('thread')).toBe(threadSetup);
    });
  });

  describe('teardown, per disposal path', () => {
    it('channel — _disconnect', () => {
      const teardown = vi.fn();
      client.config.setSetupFunction('channel', () => teardown);
      openChannel()._disconnect();
      expect(teardown).toHaveBeenCalledTimes(1);
    });

    it('thread — unregisterSubscriptions', () => {
      const teardown = vi.fn();
      client.config.setSetupFunction('thread', () => teardown);
      const thread = openThread();
      thread.registerSubscriptions();
      thread.unregisterSubscriptions();
      expect(teardown).toHaveBeenCalledTimes(1);
    });

    it('messageComposer — unregisterSubscriptions', () => {
      const teardown = vi.fn();
      client.config.setSetupFunction('messageComposer', () => teardown);
      const composer = openChannel().messageComposer;
      composer.registerSubscriptions();
      composer.unregisterSubscriptions();
      expect(teardown).toHaveBeenCalledTimes(1);
    });

    it('client — disconnectUser', async () => {
      const teardown = vi.fn();
      client.config.setSetupFunction('client', () => teardown);
      await client.disconnectUser().catch(() => undefined);
      expect(teardown).toHaveBeenCalledTimes(1);
    });
  });

  /**
   * Keyed by cid, not by channel type. Most of `ChannelConfigWithInfo` reads as a type-level setting, but
   * a channel's own `config_overrides` narrow it for that channel alone — and this SDK can set them:
   * `client.channel(type, id, { config_overrides })` sends them on `query`/`watch`, and
   * `channel.update()` / `updatePartial()` reach the same state. `ConfigOverridesRequest` covers
   * `shared_locations`, `uploads`, `typing_events`, `replies`, `max_message_length`, `commands` and more —
   * exactly the fields `Channel.serverRestrictions` and `availableCommands` read.
   *
   * A type-keyed cache could not hold two disagreeing channels: they overwrote each other, and because
   * every write woke every `Channel` and `MessageComposer` of the type, the whole set re-derived to a
   * value correct for at most one of them.
   */
  describe('server channel configuration is cached by cid', () => {
    it('does not serve one channel the config of its sibling', () => {
      const a = client.channel('messaging', 'a');
      const b = client.channel('messaging', 'b');

      setServerConfig(a, { shared_locations: false });

      // `b` was never queried. There is deliberately no type-level fallback: the only thing available to
      // fall back on is `a`'s effective config, overrides included.
      expect(b.serverConfig).toBeUndefined();
      expect(Object.keys(client.channelServerConfigs)).toEqual(['messaging:a']);
    });

    it('keeps two channels of one type independent', () => {
      const a = client.channel('messaging', 'a');
      const b = client.channel('messaging', 'b');

      setServerConfig(a, { shared_locations: false });
      setServerConfig(b, { shared_locations: true });

      expect(a.serverConfig?.shared_locations).toBe(false);
      expect(b.serverConfig?.shared_locations).toBe(true);
      expect(a.config.availableCommands).toEqual([]);
    });

    it('does not leak across types', () => {
      const messaging = client.channel('messaging', 'a');
      const livestream = client.channel('livestream', 'b');

      setServerConfig(messaging, { shared_locations: false });

      expect(livestream.serverConfig).toBeUndefined();
    });

    it('reaches a composer built before its own channel config arrived', () => {
      const channel = client.channel('messaging', 'a');
      channel.messageComposer.registerSubscriptions();

      setServerConfig(channel, { shared_locations: false });

      expect(channel.messageComposer.config.location.enabled).toBe(false);
    });

    it('does not narrow a composer from a sibling channel config', () => {
      const a = client.channel('messaging', 'a');
      const b = client.channel('messaging', 'b');
      b.messageComposer.registerSubscriptions();

      // `a`'s override must not reach `b`'s composer — the leak this keying exists to prevent.
      setServerConfig(a, { shared_locations: false });

      expect(b.messageComposer.config.location.enabled).toBe(true);
    });

    it('resolves different channel configs for two channels of one type', () => {
      // The assertion that matters to consumers: not the raw cache, but the *resolved* gates they read.
      // `typing_events` and `read_events` are both overridable per channel.
      const a = client.channel('messaging', 'a');
      const b = client.channel('messaging', 'b');

      setServerConfig(a, { read_events: false, typing_events: false });
      setServerConfig(b, { read_events: true, typing_events: true });

      expect(a.config.typingEvents.enabled).toBe(false);
      expect(a.config.readEvents.enabled).toBe(false);
      expect(b.config.typingEvents.enabled).toBe(true);
      expect(b.config.readEvents.enabled).toBe(true);
    });

    it('keeps two live composers of one type on their own server configs', () => {
      const a = client.channel('messaging', 'a');
      const b = client.channel('messaging', 'b');
      a.messageComposer.registerSubscriptions();
      b.messageComposer.registerSubscriptions();

      setServerConfig(a, { max_message_length: 100, shared_locations: false });
      setServerConfig(b, { max_message_length: 5000, shared_locations: true });

      expect(a.messageComposer.config.location.enabled).toBe(false);
      expect(a.messageComposer.config.text.maxLengthOnSend).toBe(100);
      expect(b.messageComposer.config.location.enabled).toBe(true);
      expect(b.messageComposer.config.text.maxLengthOnSend).toBe(5000);
    });

    it('keeps them apart when each is queried over HTTP', async () => {
      // The same disagreement over the real transport, one `channel.query()` each: the cid the config is
      // filed under is the one on the response, and each channel reads back only its own.
      const restricted = client.channel('messaging', 'http-restricted');
      const permissive = client.channel('messaging', 'http-permissive');

      const responseFor = (channel: Channel, typing_events: boolean) => ({
        body: {
          ...mockChannelQueryResponse,
          channel: {
            ...mockChannelQueryResponse.channel,
            cid: channel.cid,
            id: channel.id,
            type: channel.type,
            config: { ...mockChannelQueryResponse.channel.config, typing_events },
          },
        },
        metadata: {},
      });

      vi.spyOn(client.api, 'sendRequest')
        .mockResolvedValueOnce(responseFor(restricted, false) as never)
        .mockResolvedValueOnce(responseFor(permissive, true) as never);

      await restricted.query();
      await permissive.query();

      expect(restricted.serverConfig?.typing_events).toBe(false);
      expect(permissive.serverConfig?.typing_events).toBe(true);
      expect(restricted.config.typingEvents.enabled).toBe(false);
      expect(permissive.config.typingEvents.enabled).toBe(true);
    });

    it('keeps them apart through the queryChannels hydration path', () => {
      // The realistic route, where the cid comes off `ChannelResponse.cid` rather than being handed in:
      // one page of two same-type channels whose configs disagree. Keyed by type, the second entry
      // overwrote the first and both channels ended up reporting the last one seen.
      const restricted = generateChannel({
        channel: { id: 'restricted', config: { typing_events: false } as never },
      });
      const permissive = generateChannel({
        channel: { id: 'permissive', config: { typing_events: true } as never },
      });

      client.hydrateActiveChannels([restricted, permissive]);

      expect(client.channel('messaging', 'restricted').config.typingEvents.enabled).toBe(
        false,
      );
      expect(client.channel('messaging', 'permissive').config.typingEvents.enabled).toBe(
        true,
      );
    });
  });

  describe('server authority — client configuration narrows, never widens', () => {
    it('cannot re-enable a feature the server disabled (mechanism 1: the ctor merge)', () => {
      const channel = openChannel();
      setServerConfig(channel, { shared_locations: false });

      client.config.set({ messageComposer: { location: { enabled: true } } });
      channel.messageComposer.registerSubscriptions();

      // The merge customizer keeps the server value authoritative — the one silent no-op in this API.
      expect(channel.messageComposer.config.location.enabled).toBe(false);
    });

    it('honours a server flag that arrives after construction (D9)', () => {
      const channel = openChannel();
      channel.messageComposer.registerSubscriptions();
      // Before the config lands, the composer has only its defaults to go on.
      expect(channel.messageComposer.config.location.enabled).toBe(true);

      setServerConfig(channel, { shared_locations: false });

      // Previously this stayed `true` forever: the composer read `getConfig()` exactly once, in its
      // constructor, which for `client.channel()` runs before `watch()` populates it.
      expect(channel.messageComposer.config.location.enabled).toBe(false);
    });

    it('cannot bypass a point-of-use guard (mechanism 2: typing events)', async () => {
      const channel = openChannel();
      setServerConfig(channel, { typing_events: false });
      const sendEvent = vi.spyOn(channel, 'sendEvent').mockResolvedValue({} as never);

      client.config.set({ messageComposer: { text: { publishTypingEvents: true } } });
      channel.messageComposer.registerSubscriptions();
      await channel.keystroke();

      // The composer config says yes; `channel.keystroke` checks the server flag itself and emits
      // nothing. Safe without the declarative tier doing anything.
      expect(channel.messageComposer.config.text.publishTypingEvents).toBe(true);
      expect(sendEvent).not.toHaveBeenCalled();
    });
  });

  describe('reset', () => {
    it('returns every key to its derived baseline', () => {
      client.config.set({
        channel: {
          messagePaginator: { pageSize: 41 },
          requestHandlers: { sendMessageRequest: vi.fn() },
        },
        client: { reminders: { scheduledOffsetsMs: [1] } },
        messageComposer: { drafts: { enabled: true } },
        thread: { messagePaginator: { pageSize: 42 } },
      });
      const channel = openChannel();
      channel.messageComposer.registerSubscriptions();
      const thread = openThread();
      thread.registerSubscriptions();

      client.config.reset();

      expect(channel.messagePaginator.config.pageSize).toBe(100);
      expect(channel.configState.getLatestValue().requestHandlers).toBeUndefined();
      expect(thread.messagePaginator.config.pageSize).toBe(50);
      expect(channel.messageComposer.config.drafts.enabled).toBe(false);
      expect(client.config.getConfig('channel')).toBeNull();
      expect(client.config.getConfig('messageComposer')).toBeNull();
    });

    it('per-key reset leaves the other keys configured', () => {
      client.config.set({
        channel: { messagePaginator: { pageSize: 41 } },
        thread: { messagePaginator: { pageSize: 42 } },
      });
      const channel = openChannel();
      const thread = openThread();
      thread.registerSubscriptions();

      client.config.reset('channel');

      expect(channel.messagePaginator.config.pageSize).toBe(100);
      expect(thread.messagePaginator.config.pageSize).toBe(42);
    });

    it('recovers even when a setup function left no teardown', () => {
      const channel = openChannel();
      client.config.setSetupFunction('channel', ({ channel: c }) => {
        c.messagePaginator.updateConfig({ pageSize: 999 });
        c.messagePaginator.updateConfig({ itemOrderComparator: () => 0 });
        // deliberately returns nothing
      });
      expect(channel.messagePaginator.config.pageSize).toBe(999);

      client.config.reset('channel');

      // Re-derivation, not a snapshot: this is the property that makes reset trustworthy when
      // teardowns are integrator-written.
      expect(channel.messagePaginator.config.pageSize).toBe(100);
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

    it('re-installs a PinnedMessagePaginator’s own behaviour', () => {
      const channel = openChannel();
      client.config.setSetupFunction('channel', ({ channel: c }) => {
        c.pinnedMessagesPaginator.updateConfig({
          doRequest: async () => ({ items: [] }),
        });
      });

      client.config.reset('channel');

      // A config snapshot could never have restored this — it is a closure over the paginator.
      expect(String(channel.pinnedMessagesPaginator.config.doRequest)).toContain(
        'getPinnedMessages',
      );
    });

    it('re-reads current server config rather than a construction-time copy', () => {
      const channel = openChannel();
      channel.messageComposer.registerSubscriptions();
      setServerConfig(channel, { shared_locations: false });

      client.config.reset();

      // A snapshot taken at construction would have restored the pre-query `true`.
      expect(channel.messageComposer.config.location.enabled).toBe(false);
    });
  });

  describe('deprecated setters still work', () => {
    it('setMessageComposerSetupFunction reaches a composer', () => {
      const setup = vi.fn();
      client.setMessageComposerSetupFunction(setup);

      openChannel().messageComposer.registerSubscriptions();

      expect(setup).toHaveBeenCalledTimes(1);
    });

    // `setInstanceConfigurationFunction` and its `SetInstanceConfigurationFunctions` type are gone:
    // they only ever existed on the v10 line (never in a stable release), three of their four keys never
    // functioned, and the one that did duplicates `setMessageComposerSetupFunction` above — which *did*
    // ship in v9.9.0 and is therefore kept. Its `return`-instead-of-`continue`
    // batch bug went with it — `set(tree)` is now the only multi-key path, and it uses `continue`.
    // `instanceConfigurationService` and `configsStore` are gone for the same reason: both were
    // v10-RC-only aliases, so there was no released code for the deprecation to protect (DEC-29).
  });

  it('keeps two clients independent', () => {
    const other = getClientWithUser({ id: 'other' });
    client.config.set({ channel: { messagePaginator: { pageSize: 41 } } });

    expect(other.config.getConfig('channel')).toBeNull();
    expect(other.channel('messaging', 'x').messagePaginator.config.pageSize).toBe(100);
  });

  it('seeds the client key through StreamChatOptions.config', () => {
    // Constructed directly rather than via the test helper, because this is specifically about the
    // constructor option — the only construction-time route for `client`, whose configuration registry
    // is born inside that constructor.
    const seeded = new StreamChat('', {
      config: { client: { reminders: { scheduledOffsetsMs: [7] } } },
    });

    expect(seeded.reminders.configState.getLatestValue().scheduledOffsetsMs).toEqual([7]);
  });
});
