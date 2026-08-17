import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MessagePaginator } from '../../../src/pagination/paginators/MessagePaginator';
import { PinnedMessagePaginator } from '../../../src/pagination/paginators/PinnedMessagePaginator';
import type { Channel } from '../../../src/channel';

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

      // Behavioural fields are re-installed as fresh closures over `this`, so their identities differ
      // by design — what matters is that they are present rather than lost.
      for (const field of ['deriveCursor', 'itemOrderComparator'] as const) {
        expect(typeof fromConstructor[field]).toBe('function');
        expect(typeof paginator.config[field]).toBe('function');
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
      paginator.ingestItem({ id: 'm1', created_at: new Date() } as never);

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

      const older = { id: 'a', pinned_at: new Date('2020-01-01') } as never;
      const newer = { id: 'b', pinned_at: new Date('2021-01-01') } as never;
      expect(paginator.config.itemOrderComparator?.(older, newer)).toBeLessThan(0);
    });

    it('does not acquire a state throttle from the message paginator default', () => {
      const paginator = new PinnedMessagePaginator({ channel });

      paginator.initializeConfig();

      expect(paginator.config.stateThrottleMs).toBeUndefined();
    });
  });
});
