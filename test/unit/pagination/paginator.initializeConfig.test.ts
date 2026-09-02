import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessagePaginator } from '../../../src/pagination/paginators/MessagePaginator';
import { PinnedMessagePaginator } from '../../../src/pagination/paginators/PinnedMessagePaginator';
import type { Channel } from '../../../src/channel';
import { convertDateToTimestamp } from '../test-utils/time';

/** Matches the lightweight channel stub the sibling paginator suites use. */
const stubChannel = () =>
  ({
    cid: 'messaging:channel-id',
    getPinnedMessages: vi.fn().mockResolvedValue({ messages: [] }),
    getReplies: vi.fn(),
    query: vi.fn(),
  }) as unknown as Channel;

describe('paginator initializeConfig', () => {
  let channel: Channel;

  beforeEach(() => {
    channel = stubChannel();
  });

  describe('BasePaginator', () => {
    it('produces the same config from the constructor and from initializeConfig', () => {
      const paginator = new MessagePaginator({ channel });
      const fromConstructor = { ...paginator.config };

      paginator.initializeConfig();

      // Same keys — a missing one would mean a re-derivation silently dropped configuration.
      expect(Object.keys(paginator.config).sort()).toEqual(
        Object.keys(fromConstructor).sort(),
      );

      // Value fields must be identical.
      const valueFields = [
        'debounceMs',
        'initialOffset',
        'lockItemOrder',
        'pageSize',
        'retryCount',
        'stateThrottleMs',
        'throwErrors',
      ] as const;
      for (const field of valueFields) {
        expect(paginator.config[field]).toEqual(fromConstructor[field]);
      }

      // Behavioural fields come from the memoized subclass overlay, so a re-derivation reinstates the
      // very same functions — which is what lets `initializeConfig` recognise an unchanged derivation
      // and skip the publish.
      for (const field of ['deriveCursor', 'itemOrderComparator'] as const) {
        expect(typeof fromConstructor[field]).toBe('function');
        expect(paginator.config[field]).toBe(fromConstructor[field]);
      }
    });

    it('applies a declarative slice', () => {
      const paginator = new MessagePaginator({ channel });

      paginator.initializeConfig({ pageSize: 50, retryCount: 3 });

      expect(paginator.config.pageSize).toBe(50);
      expect(paginator.config.retryCount).toBe(3);
    });

    it('reads a declarative slice passed at construction', () => {
      const paginator = new MessagePaginator({
        channel,
        paginatorOptions: { declarativeConfig: { pageSize: 77 } },
      });

      expect(paginator.config.pageSize).toBe(77);
    });

    it('drops a previous declarative slice when re-derived without one', () => {
      const paginator = new MessagePaginator({ channel });
      paginator.initializeConfig({ pageSize: 50 });

      paginator.initializeConfig();

      // Back to the subclass's own construction default rather than the base's 10 — that value came
      // through the constructor, so it is preserved while the declarative slice is dropped.
      expect(paginator.config.pageSize).toBe(100);
    });

    it('preserves constructor-injected options across a re-derivation', () => {
      const paginator = new MessagePaginator({
        channel,
        paginatorOptions: { pageSize: 33 },
      });

      paginator.initializeConfig();

      expect(paginator.config.pageSize).toBe(33);
    });

    it('never swaps the item index — loaded items would be lost', () => {
      // Asserted on the live index rather than on `config.itemIndex`. That field was typed as part of
      // the resolved config but never written to it — the constructor destructures `itemIndex` and
      // `createItemIndex` out of its options and resolves them once into `_itemIndex` — so the previous
      // version of this test compared `undefined` to `undefined` and passed for any implementation,
      // including one with the preservation branch deleted. The field is gone from the type now.
      const paginator = new MessagePaginator({ channel });
      const before = paginator._itemIndex;
      paginator.ingestItem({
        id: 'm1',
        created_at: convertDateToTimestamp(new Date()),
      } as never);

      paginator.initializeConfig({ pageSize: 50 });

      expect(paginator._itemIndex).toBe(before);
      expect(paginator.getItem('m1')).toBeDefined();
    });

    it('rebuilds the debounced query rather than only assigning debounceMs', () => {
      const paginator = new MessagePaginator({ channel });
      const setDebounceOptions = vi.spyOn(paginator, 'setDebounceOptions');

      paginator.initializeConfig({ debounceMs: 900 });

      expect(setDebounceOptions).toHaveBeenCalledWith({ debounceMs: 900 });
      expect(paginator.config.debounceMs).toBe(900);
    });
  });

  describe('MessagePaginator', () => {
    it('defaults stateThrottleMs to 500', () => {
      expect(new MessagePaginator({ channel }).config.stateThrottleMs).toBe(500);
    });

    it('keeps its 500ms default across a bare re-derivation', () => {
      const paginator = new MessagePaginator({ channel });

      paginator.initializeConfig();

      // A bare `super.initializeConfig` would fall back to the base's `undefined` and silently drop
      // the message list's render coalescing.
      expect(paginator.config.stateThrottleMs).toBe(500);
    });

    it('lets a declarative slice override the subclass default', () => {
      const paginator = new MessagePaginator({ channel });

      paginator.initializeConfig({ stateThrottleMs: 250 });

      expect(paginator.config.stateThrottleMs).toBe(250);
    });

    it('honours an explicit stateThrottleMs from construction on re-derivation', () => {
      const paginator = new MessagePaginator({
        channel,
        paginatorOptions: { stateThrottleMs: 120 },
      });

      paginator.initializeConfig();

      expect(paginator.config.stateThrottleMs).toBe(120);
    });
  });

  describe('PinnedMessagePaginator', () => {
    it('re-installs doRequest after a re-derivation', () => {
      const paginator = new PinnedMessagePaginator({ channel });
      const original = paginator.config.doRequest;
      expect(original).toBeDefined();

      paginator.initializeConfig();

      expect(paginator.config.doRequest).toBeDefined();
    });

    it('restores doRequest that a setup function replaced without a teardown', () => {
      const paginator = new PinnedMessagePaginator({ channel });
      paginator.updateConfig({ doRequest: async () => ({ items: [] }) });

      paginator.initializeConfig();

      // Proves re-derivation beats a snapshot: the original is a closure over `this`, which no
      // captured config object could have restored.
      const restored = paginator.config.doRequest;
      expect(restored).toBeDefined();
      expect(String(restored)).toContain('getPinnedMessages');
    });

    it('re-installs the pinned_at item order comparator', () => {
      const paginator = new PinnedMessagePaginator({ channel });
      paginator.updateConfig({ itemOrderComparator: () => 0 });

      paginator.initializeConfig();

      const older = {
        id: 'a',
        pinned_at: convertDateToTimestamp(new Date('2020-01-01')),
      } as never;
      const newer = {
        id: 'b',
        pinned_at: convertDateToTimestamp(new Date('2021-01-01')),
      } as never;
      expect(paginator.config.itemOrderComparator?.(older, newer)).toBeLessThan(0);
    });

    it('does not acquire a state throttle from the message paginator default', () => {
      const paginator = new PinnedMessagePaginator({ channel });

      paginator.initializeConfig();

      expect(paginator.config.stateThrottleMs).toBeUndefined();
    });
  });
  describe('read-once fields take effect however they are set', () => {
    // `updateConfig` used to store these and rebuild nothing, because the rebuild lived only in
    // `initializeConfig`. So `paginator.updateConfig({ debounceMs: 900 })` reported 900 while the
    // debounce kept running at 300 — resolved configuration contradicting behaviour, the same shape as
    // the `unreadReferencePolicy` leak. Pairing the write with the rebuild is now the controller's job,
    // so it holds for every route rather than the one someone remembered.
    it('rebuilds the debounced query on a plain updateConfig', () => {
      const paginator = new MessagePaginator({ channel });
      const internals = paginator as unknown as { _executeQueryDebounced: unknown };
      const before = internals._executeQueryDebounced;

      paginator.updateConfig({ debounceMs: 900 });

      expect(paginator.config.debounceMs).toBe(900);
      expect(internals._executeQueryDebounced).not.toBe(before);
    });

    it('rebuilds the publish throttles on a plain updateConfig', () => {
      const paginator = new MessagePaginator({ channel });
      const internals = paginator as unknown as { _windowPublishThrottle: unknown };
      const before = internals._windowPublishThrottle;

      paginator.updateConfig({ stateThrottleMs: 111 });

      expect(paginator.config.stateThrottleMs).toBe(111);
      expect(internals._windowPublishThrottle).not.toBe(before);
    });

    it('drops the throttles when the interval is cleared', () => {
      const paginator = new MessagePaginator({ channel });

      paginator.updateConfig({ stateThrottleMs: undefined });

      expect(
        (paginator as unknown as { _windowPublishThrottle: unknown })
          ._windowPublishThrottle,
      ).toBeUndefined();
    });
  });

  describe('one re-derivation is one complete publish', () => {
    // The subclass overlay used to be a *second* write from an `initializeConfig` override. The base
    // derivation knows nothing of that overlay, so its publish carried the config with `doRequest`,
    // `deriveCursor` and `itemOrderComparator` stripped, and the subclass then put them back — three
    // notifications for a pinned paginator, the first with no request function at all. The JSDoc claimed
    // "both carry a complete config, so no subscriber sees a half-applied state"; it did not hold.
    it('never publishes a pinned config missing its request function or comparators', () => {
      const paginator = new PinnedMessagePaginator({ channel });
      const publishes: {
        deriveCursor: string;
        doRequest: string;
        itemOrderComparator: string;
      }[] = [];
      paginator.configState.subscribe((config) =>
        publishes.push({
          deriveCursor: typeof config.deriveCursor,
          doRequest: typeof config.doRequest,
          itemOrderComparator: typeof config.itemOrderComparator,
        }),
      );
      publishes.length = 0;

      paginator.initializeConfig({ pageSize: 42 });

      expect(publishes).toEqual([
        {
          deriveCursor: 'function',
          doRequest: 'function',
          itemOrderComparator: 'function',
        },
      ]);
      expect(paginator.config.pageSize).toBe(42);
    });

    it('does not publish at all when the derivation has not moved', () => {
      const paginator = new PinnedMessagePaginator({ channel });
      const listener = vi.fn();
      paginator.configState.subscribe(listener);
      listener.mockClear();

      paginator.initializeConfig();
      paginator.initializeConfig();

      expect(listener).not.toHaveBeenCalled();
      // …and the overlay is still installed, so the skip is a genuine no-op rather than a lost write.
      expect(typeof paginator.config.doRequest).toBe('function');
    });

    it('keeps the overlay winning over a constructor-supplied doRequest', () => {
      // Precedence used to come from the overlay being written *after* the base derivation. It now comes
      // from being spread last inside it — same result, and worth pinning since the mechanism changed.
      const ownDoRequest = vi.fn();
      const paginator = new PinnedMessagePaginator({
        channel,
        paginatorOptions: { doRequest: ownDoRequest },
      });

      paginator.initializeConfig();

      expect(paginator.config.doRequest).not.toBe(ownDoRequest);
    });

    it('updateConfig skips a patch whose every field is already equal', () => {
      const paginator = new MessagePaginator({ channel });
      const listener = vi.fn();
      paginator.configState.subscribe(listener);
      listener.mockClear();

      paginator.updateConfig({ pageSize: paginator.config.pageSize });
      expect(listener).not.toHaveBeenCalled();

      paginator.updateConfig({ pageSize: paginator.config.pageSize + 1 });
      expect(listener).toHaveBeenCalledTimes(1);
    });
  });
});
