import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageStore } from '../../src/messageStore/MessageStore';
import type { MessageStoreSubscriber } from '../../src/messageStore/MessageStore';
import { formatMessage } from '../../src/utils';
import { generateMsg } from './test-utils/generateMessage';
import type { LocalMessage } from '../../src';

const msg = (overrides: Partial<Parameters<typeof generateMsg>[0]> = {}): LocalMessage =>
  formatMessage(generateMsg(overrides));

const spySubscriber = (): MessageStoreSubscriber & {
  onMessagesChanged: ReturnType<typeof vi.fn>;
} => ({
  onMessagesChanged: vi.fn(),
});

describe('MessageStore', () => {
  let store: MessageStore;

  beforeEach(() => {
    store = new MessageStore();
  });

  describe('reads / writes', () => {
    it('stores and reads a message by id', () => {
      const m = msg({ id: 'm1' });
      store.upsert(m);
      expect(store.get('m1')).toBe(m);
      expect(store.has('m1')).toBe(true);
    });

    it('returns undefined for missing / non-string ids', () => {
      expect(store.get('nope')).toBeUndefined();
      expect(store.get(undefined)).toBeUndefined();
      expect(store.has('nope')).toBe(false);
    });

    it('replaces the canonical copy on upsert (immutable)', () => {
      const first = msg({ id: 'm1', text: 'a' });
      const second = { ...first, text: 'b' };
      store.upsert(first);
      store.upsert(second);
      expect(store.get('m1')).toBe(second);
    });
  });

  describe('subscribe (atomic)', () => {
    it('fires immediately with current value, then on change, and stops after unsubscribe', () => {
      const handler = vi.fn();
      store.upsert(msg({ id: 'm1', text: 'a' }));

      const unsubscribe = store.subscribe('m1', handler);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'a' }));

      store.upsert(msg({ id: 'm1', text: 'b' }));
      expect(handler).toHaveBeenCalledTimes(2);
      expect(handler).toHaveBeenLastCalledWith(expect.objectContaining({ text: 'b' }));

      unsubscribe();
      store.upsert(msg({ id: 'm1', text: 'c' }));
      expect(handler).toHaveBeenCalledTimes(2);
    });

    it('fires immediately with undefined when the id is absent', () => {
      const handler = vi.fn();
      store.subscribe('ghost', handler);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenLastCalledWith(undefined);
    });
  });

  describe('link / unlink notification routing', () => {
    it('notifies only subscribers linked to the changed id', () => {
      const a = spySubscriber();
      const b = spySubscriber();
      store.link('m1', a);
      store.link('m2', b);

      store.upsert(msg({ id: 'm1' }));
      expect(a.onMessagesChanged).toHaveBeenCalledTimes(1);
      expect(b.onMessagesChanged).not.toHaveBeenCalled();

      const batch = a.onMessagesChanged.mock.calls[0][0];
      expect([...batch.changedIds]).toEqual(['m1']);
      expect([...batch.removedIds]).toEqual([]);
    });

    it('skips the origin subscriber but notifies other holders', () => {
      const origin = spySubscriber();
      const sibling = spySubscriber();
      store.link('m1', origin);
      store.link('m1', sibling);

      store.upsert(msg({ id: 'm1' }), origin);
      expect(origin.onMessagesChanged).not.toHaveBeenCalled();
      expect(sibling.onMessagesChanged).toHaveBeenCalledTimes(1);
    });

    it('does not notify a subscriber after it unlinks', () => {
      const a = spySubscriber();
      store.link('m1', a);
      store.unlink('m1', a);
      store.upsert(msg({ id: 'm1' }));
      expect(a.onMessagesChanged).not.toHaveBeenCalled();
    });
  });

  describe('refcount GC', () => {
    it('drops the canonical copy when the last holder unlinks', () => {
      const a = spySubscriber();
      store.upsert(msg({ id: 'm1' }));
      store.link('m1', a);

      store.unlink('m1', a);
      expect(store.has('m1')).toBe(false);
      expect(store.get('m1')).toBeUndefined();
    });

    it('keeps the message alive while another holder remains', () => {
      const a = spySubscriber();
      const b = spySubscriber();
      store.upsert(msg({ id: 'm1' }));
      store.link('m1', a);
      store.link('m1', b);

      store.unlink('m1', a);
      expect(store.has('m1')).toBe(true);

      store.unlink('m1', b);
      expect(store.has('m1')).toBe(false);
    });
  });

  describe('remove', () => {
    it('deletes content and signals removal to holders', () => {
      const a = spySubscriber();
      store.upsert(msg({ id: 'm1' }));
      store.link('m1', a);

      store.remove('m1');
      expect(store.get('m1')).toBeUndefined();
      const batch = a.onMessagesChanged.mock.calls[0][0];
      expect([...batch.changedIds]).toEqual(['m1']);
      expect([...batch.removedIds]).toEqual(['m1']);
    });

    it('is a no-op for an absent id', () => {
      const a = spySubscriber();
      store.link('m1', a);
      store.remove('m1');
      expect(a.onMessagesChanged).not.toHaveBeenCalled();
    });
  });

  describe('transaction batching', () => {
    it('coalesces multiple writes into one notification per subscriber', () => {
      const a = spySubscriber();
      store.link('m1', a);
      store.link('m2', a);
      store.link('m3', a);

      store.transaction(() => {
        store.upsert(msg({ id: 'm1' }));
        store.upsert(msg({ id: 'm2' }));
        store.upsert(msg({ id: 'm3' }));
      });

      expect(a.onMessagesChanged).toHaveBeenCalledTimes(1);
      const batch = a.onMessagesChanged.mock.calls[0][0];
      expect([...batch.changedIds].sort()).toEqual(['m1', 'm2', 'm3']);
    });

    it('flushes only when the outermost transaction exits', () => {
      const a = spySubscriber();
      store.link('m1', a);

      store.transaction(() => {
        store.transaction(() => {
          store.upsert(msg({ id: 'm1' }));
        });
        expect(a.onMessagesChanged).not.toHaveBeenCalled();
      });
      expect(a.onMessagesChanged).toHaveBeenCalledTimes(1);
    });

    it('does not notify a subscriber whose watched ids were untouched', () => {
      const a = spySubscriber();
      const b = spySubscriber();
      store.link('m1', a);
      store.link('m2', b);

      store.transaction(() => {
        store.upsert(msg({ id: 'm1' }));
      });

      expect(a.onMessagesChanged).toHaveBeenCalledTimes(1);
      expect(b.onMessagesChanged).not.toHaveBeenCalled();
    });
  });
});
