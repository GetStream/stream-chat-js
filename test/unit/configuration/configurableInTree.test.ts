import { beforeEach, describe, expect, it } from 'vitest';
import { generateChannel } from '../test-utils/generateChannel';
import { generateMsg } from '../test-utils/generateMessage';
import { generateThreadResponse } from '../test-utils/generateThreadResponse';
import { getClientWithUser } from '../test-utils/getClient';
import { Thread } from '../../../src/thread';
import { LiveLocationManager } from '../../../src/LiveLocationManager';
import { SearchController } from '../../../src/search/SearchController';
import { INSTANCE_CONFIG_TREE_KEYS } from '../../../src/configuration/keys';
import type { StreamChat } from '../../../src/client';

/**
 * The invariant: **if it is configurable, it is in the tree.**
 *
 * The configuration tree is only trustworthy as a discovery surface if it is complete. Nothing enforces
 * that by construction — a class can grow a `config` field and simply never be represented, and the only
 * signal would be an integrator failing to find the setting. These tests are that signal.
 *
 * Scope: *plain-data* configuration. Functions and instances cannot travel through the declarative tier
 * (**DV-1**), so their surface is the setup-function argument, not the tree.
 */
describe('every configurable object has a path in the configuration tree', () => {
  let client: StreamChat;
  let channelResponse: ReturnType<typeof generateChannel>['channel'];

  beforeEach(() => {
    client = getClientWithUser({ id: 'user' });
    channelResponse = generateChannel().channel;
  });

  const openChannel = () => client.channel('messaging', channelResponse.id);
  const openThread = () => {
    const thread = new Thread({
      client,
      threadData: generateThreadResponse(channelResponse, generateMsg()),
    });
    thread.registerSubscriptions();
    return thread;
  };

  /**
   * Every configurable object, with the tree path that reaches it and a plain-data field to prove the
   * path actually lands. Adding a `configState` to a class without adding it here is the failure this
   * suite exists to produce — the last test checks the inventory itself is complete.
   */
  const CONFIGURABLE = [
    {
      apply: () => client.config.set({ messagePaginator: { retryCount: 6 } }),
      expected: 6,
      name: 'channel.messagePaginator (shared key)',
      read: () => openChannel().messagePaginator.config.retryCount,
    },
    {
      apply: () => client.config.set({ channel: { messagePaginator: { pageSize: 13 } } }),
      expected: 13,
      name: 'channel.messagePaginator (per-parent)',
      read: () => openChannel().messagePaginator.config.pageSize,
    },
    {
      apply: () =>
        client.config.set({ channel: { pinnedMessagesPaginator: { pageSize: 14 } } }),
      expected: 14,
      name: 'channel.pinnedMessagesPaginator',
      read: () => openChannel().pinnedMessagesPaginator.config.pageSize,
    },
    {
      apply: () =>
        client.config.set({ messageOperations: { failedSendCacheMaxSize: 9 } }),
      expected: 9,
      name: 'channel.messageOperations (shared key)',
      read: () => openChannel().messageOperations.config.failedSendCacheMaxSize,
    },
    {
      apply: () =>
        client.config.set({ messageOperations: { failedSendCacheMaxSize: 9 } }),
      expected: 9,
      name: 'thread.messageOperations (shared key — a thread sends messages too)',
      read: () => openThread().messageOperations.config.failedSendCacheMaxSize,
    },
    {
      apply: () =>
        client.config.set({
          channel: { messageOperations: { failedSendCacheMaxSize: 7 } },
        }),
      expected: 7,
      name: 'channel.messageOperations (per-parent override)',
      read: () => openChannel().messageOperations.config.failedSendCacheMaxSize,
    },
    {
      apply: () =>
        client.config.set({
          thread: { messageOperations: { failedSendCacheMaxSize: 8 } },
        }),
      expected: 8,
      name: 'thread.messageOperations (per-parent override)',
      read: () => openThread().messageOperations.config.failedSendCacheMaxSize,
    },
    {
      apply: () => client.config.set({ thread: { messagePaginator: { pageSize: 15 } } }),
      expected: 15,
      name: 'thread.messagePaginator',
      read: () => openThread().messagePaginator.config.pageSize,
    },
    {
      // Neither of these is constructed by this package — an app or a downstream SDK builds them — so
      // they register themselves against their key rather than being handed a slice by an owner.
      apply: () =>
        client.config.set({ liveLocationManager: { minUpdateThrottleMs: 9_000 } }),
      expected: 9_000,
      name: 'liveLocationManager',
      read: () =>
        new LiveLocationManager({
          client,
          getDeviceId: () => 'device',
          watchLocation: () => () => undefined,
        }).config.minUpdateThrottleMs,
    },
    {
      apply: () =>
        client.config.set({ searchController: { keepSingleActiveSource: false } }),
      expected: false,
      name: 'searchController (constructed with a client)',
      read: () => new SearchController({ client }).config.keepSingleActiveSource,
    },
    {
      apply: () =>
        client.config.set({ messageComposer: { text: { publishTypingEvents: false } } }),
      expected: false,
      name: 'messageComposer',
      read: () => openChannel().messageComposer.config.text.publishTypingEvents,
    },
    {
      apply: () =>
        client.config.set({
          messageComposer: { location: { minShareDurationMs: 30_000 } },
        }),
      expected: 30_000,
      name: 'messageComposer.location (was a module constant)',
      read: () => openChannel().messageComposer.config.location.minShareDurationMs,
    },
    {
      apply: () =>
        client.config.set({ client: { notifications: { durations: { error: 42 } } } }),
      expected: 42,
      name: 'client.notifications',
      read: () => client.notifications.config.durations.error,
    },
    {
      apply: () =>
        client.config.set({ client: { reminders: { stopTimerRefreshBoundaryMs: 99 } } }),
      expected: 99,
      name: 'client.reminders',
      read: () => client.reminders.config.stopTimerRefreshBoundaryMs,
    },
    {
      apply: () =>
        client.config.set({ client: { threads: { connectionRecoveryThrottleMs: 250 } } }),
      expected: 250,
      name: 'client.threads (was a module constant)',
      read: () => client.threads.config.connectionRecoveryThrottleMs,
    },
    {
      apply: () =>
        client.config.set({
          client: { messageDelivery: { maxDeliveredMessageCountInPayload: 5 } },
        }),
      expected: 5,
      name: 'client.messageDelivery (was a module constant)',
      read: () => client.messageDeliveryReporter.config.maxDeliveredMessageCountInPayload,
    },
  ] as const;

  it.each(CONFIGURABLE)(
    '$name is reachable through the tree',
    ({ apply, expected, read }) => {
      apply();
      expect(read()).toBe(expected);
    },
  );

  it('the tree reports back everything that was registered', () => {
    client.config.set({
      channel: { messageOperations: { failedSendCacheTtlMs: 1 } },
      client: { messageDelivery: { markAsDeliveredBufferTimeoutMs: 2 } },
      messagePaginator: { pageSize: 3 },
    });

    // `getTree()` is the enumeration primitive this suite — and any settings UI — depends on. Without it
    // callers have to know the keys up front, which is exactly the discoverability gap being closed.
    expect(client.config.getTree()).toEqual({
      channel: { messageOperations: { failedSendCacheTtlMs: 1 } },
      client: { messageDelivery: { markAsDeliveredBufferTimeoutMs: 2 } },
      messagePaginator: { pageSize: 3 },
    });
  });

  it('omits keys with nothing registered, so an empty tree means nothing configured', () => {
    expect(client.config.getTree()).toEqual({});

    client.config.set({ messagePaginator: { pageSize: 3 } });

    expect(Object.keys(client.config.getTree())).toEqual(['messagePaginator']);
  });

  it('includes custom keys, which are as real as the built-in ones', () => {
    client.config.setConfig('myFeature', { enabled: true } as never);

    expect(client.config.getTree()).toEqual({ myFeature: { enabled: true } });
  });

  /**
   * The guard on the guard: every top-level key must be exercised above. A new key added to the tree
   * without a case here would otherwise leave the invariant unverified for it.
   */
  it('exercises every top-level key of the tree', () => {
    const exercised = new Set<string>();
    for (const { apply } of CONFIGURABLE) {
      const before = new Set(Object.keys(client.config.getTree()));
      apply();
      for (const key of Object.keys(client.config.getTree())) {
        if (!before.has(key)) exercised.add(key);
      }
    }

    expect([...exercised].sort()).toEqual([...INSTANCE_CONFIG_TREE_KEYS].sort());
  });
});
