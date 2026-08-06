import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntityStore } from '../../src/entityStore/EntityStore';
import type { EntityStoreSubscriber } from '../../src/entityStore/EntityStore';
import { formatMessage } from '../../src/utils';
import { generateMsg } from './test-utils/generateMessage';
import type { LocalMessage } from '../../src';

const msg = (overrides: Partial<Parameters<typeof generateMsg>[0]> = {}): LocalMessage =>
  formatMessage(generateMsg(overrides));

const getId = (m: LocalMessage) => m.id;

const spySubscriber = (): EntityStoreSubscriber & {
  onEntitiesChanged: ReturnType<typeof vi.fn>;
} => ({
  onEntitiesChanged: vi.fn(),
});

describe('EntityStore', () => {
  let store: EntityStore<LocalMessage>;

  beforeEach(() => {
    store = new EntityStore<LocalMessage>({ getId });
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
      expect(a.onEntitiesChanged).toHaveBeenCalledTimes(1);
      expect(b.onEntitiesChanged).not.toHaveBeenCalled();

      const batch = a.onEntitiesChanged.mock.calls[0][0];
      expect([...batch.changedIds]).toEqual(['m1']);
    });

    it('skips the origin subscriber but notifies other holders', () => {
      const origin = spySubscriber();
      const sibling = spySubscriber();
      store.link('m1', origin);
      store.link('m1', sibling);

      store.upsert(msg({ id: 'm1' }), origin);
      expect(origin.onEntitiesChanged).not.toHaveBeenCalled();
      expect(sibling.onEntitiesChanged).toHaveBeenCalledTimes(1);
    });

    it('does not notify a subscriber after it unlinks', () => {
      const a = spySubscriber();
      store.link('m1', a);
      store.unlink('m1', a);
      store.upsert(msg({ id: 'm1' }));
      expect(a.onEntitiesChanged).not.toHaveBeenCalled();
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

      expect(a.onEntitiesChanged).toHaveBeenCalledTimes(1);
      const batch = a.onEntitiesChanged.mock.calls[0][0];
      expect([...batch.changedIds].sort()).toEqual(['m1', 'm2', 'm3']);
    });

    it('flushes only when the outermost transaction exits', () => {
      const a = spySubscriber();
      store.link('m1', a);

      store.transaction(() => {
        store.transaction(() => {
          store.upsert(msg({ id: 'm1' }));
        });
        expect(a.onEntitiesChanged).not.toHaveBeenCalled();
      });
      expect(a.onEntitiesChanged).toHaveBeenCalledTimes(1);
    });

    it('does not notify a subscriber whose watched ids were untouched', () => {
      const a = spySubscriber();
      const b = spySubscriber();
      store.link('m1', a);
      store.link('m2', b);

      store.transaction(() => {
        store.upsert(msg({ id: 'm1' }));
      });

      expect(a.onEntitiesChanged).toHaveBeenCalledTimes(1);
      expect(b.onEntitiesChanged).not.toHaveBeenCalled();
    });
  });
});
