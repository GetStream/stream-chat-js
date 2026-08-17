import { beforeEach, describe, expect, it, vi } from 'vitest';
import { generateChannel } from '../test-utils/generateChannel';
import { generateMsg } from '../test-utils/generateMessage';
import { generateThreadResponse } from '../test-utils/generateThreadResponse';
import { getClientWithUser } from '../test-utils/getClient';
import { MessagePaginator } from '../../../src/pagination/paginators/MessagePaginator';
import { Thread } from '../../../src/thread';
import {
  mergeDeclarativeMessageOperationsConfig,
  mergeDeclarativePaginatorConfig,
} from '../../../src/configuration/utils/declarativeSlices';
import type { StreamChat } from '../../../src/client';

/**
 * The shared `messagePaginator` key exists because a `MessagePaginator` has two parent types — it backs
 * the channel message list *and* thread replies — while `stateThrottleMs`, `retryCount` and friends have
 * no reason to differ between them. Per-parent slices still override it, because `pageSize` legitimately
 * does differ.
 */
describe("the shared 'messagePaginator' configuration key", () => {
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
   * `unreadReferencePolicy` is read once, when `MessagePaginator` copies it into a private field, and it
   * is offered on the shared key *and* both per-parent slices — so the late-registration warning has to
   * fire on all three routes. It originally fired only for the parents: the warning is gated on
   * `hasLiveInstances(key)`, and a key reached through `alsoWatch` had no instances registered against it.
   */
  it('warns about construction-only paths registered through the shared key', () => {
    const warned: string[] = [];
    const spy = vi.spyOn(console, 'warn').mockImplementation((...args) => {
      warned.push(args.map(String).join(' '));
    });

    // A consumer has to exist: the warning is about instances that already missed the value.
    openChannel();

    warned.length = 0;
    client.config.set({ messagePaginator: { unreadReferencePolicy: 'read-state-only' } });

    spy.mockRestore();

    expect(warned.filter((m) => /read once during construction/.test(m))).toHaveLength(1);
  });

  /**
   * `unreadReferencePolicy` rides in the `messagePaginator` subtree but is **not** a
   * `BasePaginatorConfig` field — the paginator reads it once into a private member. It used to be passed
   * straight through to `initializeConfig`, which spreads the slice, so it landed in the published config
   * as an untyped key nothing reads. Worse on a late registration: the config reported the new value while
   * the paginator kept behaving on the constructed one, so resolved configuration contradicted behaviour.
   */
  /**
   * `docs/instance-configuration.md` §3 puts the declarative tree at stage 2 and the construction
   * argument at stage 3. `MessageComposer` always followed that; `BasePaginator` layered them the other
   * way round, so the same registration answered differently depending on which object read it.
   *
   * The order was never the problem — the layer contents were. A paginator built with no configuration
   * at all already carried `pageSize`, `stateThrottleMs`, `initialCursor` and
   * `hasPaginationQueryShapeChanged` as "construction arguments", because its subclasses spread their own
   * defaults into `super({…})`. Promoting that layer wholesale broke 33 tests. Only what an *integrator*
   * passes is stage 3 now; what the SDK supplies on the instance's behalf is stage 1.
   */
  describe('the documented layer order', () => {
    it('lets a declarative registration beat an SDK-supplied default', () => {
      client.config.set({ messagePaginator: { pageSize: 41 } });

      expect(openChannel().messagePaginator.config.pageSize).toBe(41);
      // Thread replies default to 50, supplied by `Thread` rather than by the integrator — so the
      // registration wins there too.
      expect(openThread().messagePaginator.config.pageSize).toBe(41);
    });

    it('lets an integrator construction argument beat a declarative registration', () => {
      client.config.set({ messagePaginator: { pageSize: 41 } });

      const paginator = new MessagePaginator({
        channel: openChannel(),
        paginatorOptions: {
          declarativeConfig: { pageSize: 41 },
          pageSize: 7,
        },
      });

      expect(paginator.config.pageSize).toBe(7);
    });

    it('keeps the SDK default when nothing else names the field', () => {
      expect(openChannel().messagePaginator.config.pageSize).toBe(100);
      expect(openThread().messagePaginator.config.pageSize).toBe(50);
      expect(openChannel().messagePaginator.config.stateThrottleMs).toBe(500);
    });
  });

  describe('the construction-only argument does not leak into resolved config', () => {
    it('is absent from config even when registered before construction', () => {
      client.config.set({
        messagePaginator: { unreadReferencePolicy: 'read-state-only' },
      });

      const paginator = openChannel().messagePaginator;

      expect('unreadReferencePolicy' in paginator.config).toBe(false);
      // …and the policy still arrived, through the constructor argument where it belongs.
      expect(
        (paginator as unknown as { unreadReferencePolicy: string }).unreadReferencePolicy,
      ).toBe('read-state-only');
    });

    it('never reports a value the paginator is not using', () => {
      const paginator = openChannel().messagePaginator;

      // Registered too late to apply — the SDK warns about exactly this.
      client.config.set({
        messagePaginator: { unreadReferencePolicy: 'read-state-only' },
      });

      expect(
        (paginator as unknown as { unreadReferencePolicy: string }).unreadReferencePolicy,
      ).toBe('snapshot');
      expect('unreadReferencePolicy' in paginator.config).toBe(false);
    });

    it('keeps carrying the paginator fields that share the subtree', () => {
      // The split must take only the construction-only key with it.
      client.config.set({
        messagePaginator: { pageSize: 21, unreadReferencePolicy: 'read-state-only' },
      });

      expect(openChannel().messagePaginator.config.pageSize).toBe(21);
    });
  });

  it('still reaches both parents when set through the shared key', () => {
    client.config.set({ messagePaginator: { unreadReferencePolicy: 'read-state-only' } });

    const channel = openChannel();
    const thread = openThread();

    // Read through the private field the paginator copies it into — the only observable of the policy.
    for (const paginator of [channel.messagePaginator, thread.messagePaginator]) {
      expect(
        (paginator as unknown as { unreadReferencePolicy: string }).unreadReferencePolicy,
      ).toBe('read-state-only');
    }
  });

  it('reaches both the channel list and thread replies from one call', () => {
    client.config.set({ messagePaginator: { stateThrottleMs: 250, retryCount: 3 } });

    const channel = openChannel();
    const thread = openThread();

    expect(channel.messagePaginator.config).toMatchObject({
      retryCount: 3,
      stateThrottleMs: 250,
    });
    expect(thread.messagePaginator.config).toMatchObject({
      retryCount: 3,
      stateThrottleMs: 250,
    });
  });

  it('reaches instances that already exist', () => {
    const channel = openChannel();
    const thread = openThread();

    client.config.set({ messagePaginator: { retryCount: 4 } });

    expect(channel.messagePaginator.config.retryCount).toBe(4);
    expect(thread.messagePaginator.config.retryCount).toBe(4);
  });

  it('leaves the pinned-message paginator alone — it has a single parent', () => {
    client.config.set({ messagePaginator: { retryCount: 3 } });

    // Not a MessagePaginator, and reachable only through `channel`, so by the rule it stays nested.
    expect(openChannel().pinnedMessagesPaginator.config.retryCount).toBe(0);
  });

  describe('per-parent overrides', () => {
    it('lets each parent override a shared value', () => {
      client.config.set({
        messagePaginator: { pageSize: 30, retryCount: 3 },
        channel: { messagePaginator: { pageSize: 60 } },
        thread: { messagePaginator: { pageSize: 15 } },
      });

      const channel = openChannel();
      const thread = openThread();

      expect(channel.messagePaginator.config.pageSize).toBe(60);
      expect(thread.messagePaginator.config.pageSize).toBe(15);
      // The un-overridden shared value still reaches both.
      expect(channel.messagePaginator.config.retryCount).toBe(3);
      expect(thread.messagePaginator.config.retryCount).toBe(3);
    });

    it('keeps shared values a partial per-parent slice does not mention', () => {
      client.config.set({
        messagePaginator: { pageSize: 30, retryCount: 3, stateThrottleMs: 100 },
        channel: { messagePaginator: { stateThrottleMs: 400 } },
      });

      expect(openChannel().messagePaginator.config).toMatchObject({
        pageSize: 30,
        retryCount: 3,
        stateThrottleMs: 400,
      });
    });

    it('falls back to the shared value when a per-parent slice is cleared', () => {
      client.config.set({
        messagePaginator: { retryCount: 3 },
        channel: { messagePaginator: { retryCount: 9 } },
      });
      const channel = openChannel();
      expect(channel.messagePaginator.config.retryCount).toBe(9);

      client.config.reset('channel');

      expect(channel.messagePaginator.config.retryCount).toBe(3);
    });

    /**
     * The layering rule at its own level, because the tests above reach it only through the store — and the
     * store cannot hold an explicit `undefined` (`mergeWith` skips undefined source values), so they exercise
     * the *absent-key* path and leave the `undefined` path unguarded. Removing the skip from
     * `mergeDeclarativeSlice` left all 318 configuration tests green, which is how this gap surfaced.
     *
     * It matters because the failure is silent: a per-parent slice carrying `retryCount: undefined` would
     * erase the shared value rather than defer to it. Both helpers share one implementation, so this covers
     * `messageOperations` too.
     */
    it('defers to the shared value for a field the slice sets to undefined', () => {
      expect(
        mergeDeclarativePaginatorConfig(
          { pageSize: 30, retryCount: 3 },
          { pageSize: 50, retryCount: undefined },
        ),
      ).toEqual({ pageSize: 50, retryCount: 3 });

      expect(
        mergeDeclarativeMessageOperationsConfig(
          { failedSendCacheMaxSize: 100, failedSendCacheTtlMs: 5_000 },
          { failedSendCacheTtlMs: undefined },
        ),
      ).toEqual({ failedSendCacheMaxSize: 100, failedSendCacheTtlMs: 5_000 });
    });

    it('returns whichever side is present when the other is absent', () => {
      const shared = { pageSize: 30 };
      const specific = { pageSize: 50 };

      expect(mergeDeclarativePaginatorConfig(undefined, specific)).toBe(specific);
      expect(mergeDeclarativePaginatorConfig(shared, undefined)).toBe(shared);
      expect(mergeDeclarativePaginatorConfig(undefined, undefined)).toBeUndefined();
    });
  });

  it('applies read-once fields at construction', () => {
    client.config.set({ messagePaginator: { unreadReferencePolicy: 'read-state-only' } });

    for (const paginator of [
      openChannel().messagePaginator,
      openThread().messagePaginator,
    ]) {
      expect(
        (paginator as unknown as { unreadReferencePolicy: string }).unreadReferencePolicy,
      ).toBe('read-state-only');
    }
  });

  it('rebuilds the read-once fields when set late', () => {
    // Asserted on the throttle itself rather than on whichever method rebuilds it. The pairing of "store
    // the value" with "make it take effect" is no longer owned by one setter — it hangs off the config
    // controller's change hook, so every route gets it.
    const channel = openChannel();
    const internals = channel.messagePaginator as unknown as {
      _windowPublishThrottle: unknown;
    };
    const before = internals._windowPublishThrottle;

    client.config.set({ messagePaginator: { stateThrottleMs: 350 } });

    expect(channel.messagePaginator.config.stateThrottleMs).toBe(350);
    expect(internals._windowPublishThrottle).not.toBe(before);
  });

  it('does not rebuild a read-once field whose value did not move', () => {
    const channel = openChannel();
    const internals = channel.messagePaginator as unknown as {
      _windowPublishThrottle: unknown;
    };
    const before = internals._windowPublishThrottle;

    client.config.set({ messagePaginator: { pageSize: 33 } });

    expect(channel.messagePaginator.config.pageSize).toBe(33);
    // The old code re-ran the rebuild on every derivation regardless; flushing and swapping a throttle
    // that nothing changed is pure churn on a path that runs per channel, per registration.
    expect(internals._windowPublishThrottle).toBe(before);
  });

  describe('interaction with setup functions', () => {
    // A change to the shared key must run the *whole* apply cycle for the owning key, not just a
    // re-derivation — otherwise tier 2 loses its overrides.
    it('keeps a channel setup function on top of a shared change', () => {
      client.config.setSetupFunction('channel', ({ channel }) => {
        channel.messagePaginator.updateConfig({ retryCount: 7 });
      });
      const channel = openChannel();

      client.config.set({ messagePaginator: { retryCount: 3 } });

      expect(channel.messagePaginator.config.retryCount).toBe(7);
    });

    it('keeps a thread setup function on top of a shared change', () => {
      client.config.setSetupFunction('thread', ({ thread }) => {
        thread.messagePaginator.updateConfig({ retryCount: 8 });
      });
      const thread = openThread();

      client.config.set({ messagePaginator: { retryCount: 3 } });

      expect(thread.messagePaginator.config.retryCount).toBe(8);
    });
  });

  describe('teardown', () => {
    it('stops reaching a disconnected channel', () => {
      const channel = openChannel();
      channel._disconnect();

      client.config.set({ messagePaginator: { retryCount: 5 } });

      expect(channel.messagePaginator.config.retryCount).toBe(0);
    });

    it('stops reaching an unsubscribed thread', () => {
      const thread = openThread();
      thread.unregisterSubscriptions();

      client.config.set({ messagePaginator: { retryCount: 5 } });

      expect(thread.messagePaginator.config.retryCount).toBe(0);
    });
  });

  it('is cleared by a global reset', () => {
    client.config.set({ messagePaginator: { retryCount: 3 } });
    const channel = openChannel();

    client.config.reset();

    expect(client.config.getConfig('messagePaginator')).toBeNull();
    expect(channel.messagePaginator.config.retryCount).toBe(0);
  });
});
