import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EntityStore } from '../../src/messageStore/EntityStore';
import type { EntityStoreSubscriber } from '../../src/messageStore/EntityStore';
import { StoreBackedItemIndex } from '../../src/messageStore/StoreBackedItemIndex';
import { formatMessage } from '../../src/utils';
import { generateMsg } from './test-utils/generateMessage';
import type { LocalMessage } from '../../src';

const msg = (overrides: Partial<Parameters<typeof generateMsg>[0]> = {}): LocalMessage =>
  formatMessage(generateMsg(overrides));

const spyOwner = (): EntityStoreSubscriber & {
  onEntitiesChanged: ReturnType<typeof vi.fn>;
} => ({
  onEntitiesChanged: vi.fn(),
});

const getId = (m: LocalMessage) => m.id;

describe('StoreBackedItemIndex', () => {
  let store: EntityStore<LocalMessage>;
  let ownerA: ReturnType<typeof spyOwner>;
  let ownerB: ReturnType<typeof spyOwner>;
  let a: StoreBackedItemIndex;
  let b: StoreBackedItemIndex;

  beforeEach(() => {
    store = new EntityStore<LocalMessage>({ getId });
    ownerA = spyOwner();
    ownerB = spyOwner();
    a = new StoreBackedItemIndex({ store, owner: ownerA, getId });
    b = new StoreBackedItemIndex({ store, owner: ownerB, getId });
  });

  describe('membership scoping', () => {
    it('reads content it holds and hides content it does not', () => {
      const m = msg({ id: 'm1' });
      a.setOne(m);
      expect(a.get('m1')).toBe(m);
      expect(a.has('m1')).toBe(true);
      // b never ingested m1: it must not see it, even though the store holds it
      expect(b.get('m1')).toBeUndefined();
      expect(b.has('m1')).toBe(false);
    });

    it('values()/entries() are scoped to this index membership', () => {
      a.setOne(msg({ id: 'm1' }));
      a.setOne(msg({ id: 'm2' }));
      b.setOne(msg({ id: 'm3' }));
      expect(a.values().map(getId).sort()).toEqual(['m1', 'm2']);
      expect(
        a
          .entries()
          .map(([id]) => id)
          .sort(),
      ).toEqual(['m1', 'm2']);
      expect(b.values().map(getId)).toEqual(['m3']);
    });
  });

  describe('shared content', () => {
    it('both indexes read the single canonical copy when both hold the id', () => {
      a.setOne(msg({ id: 'm1', text: 'v1' }));
      b.setOne(msg({ id: 'm1', text: 'v1' }));
      const updated = msg({ id: 'm1', text: 'v2' });
      a.setOne(updated);
      expect(a.get('m1')).toBe(updated);
      expect(b.get('m1')).toBe(updated);
    });
  });

  describe('notification', () => {
    it('does not notify the writing owner but notifies other holders (the fan-out)', () => {
      a.setOne(msg({ id: 'm1', text: 'v1' }));
      b.setOne(msg({ id: 'm1', text: 'v1' }));
      ownerA.onEntitiesChanged.mockClear();
      ownerB.onEntitiesChanged.mockClear();

      a.setOne(msg({ id: 'm1', text: 'v2' }));

      expect(ownerA.onEntitiesChanged).not.toHaveBeenCalled();
      expect(ownerB.onEntitiesChanged).toHaveBeenCalledTimes(1);
      expect([...ownerB.onEntitiesChanged.mock.calls[0][0].changedIds]).toEqual(['m1']);
    });

    it('does not notify a holder of an id it does not hold', () => {
      a.setOne(msg({ id: 'm1' }));
      ownerB.onEntitiesChanged.mockClear();
      a.setOne(msg({ id: 'm1', text: 'again' }));
      expect(ownerB.onEntitiesChanged).not.toHaveBeenCalled();
    });
  });

  describe('refcount via remove/clear', () => {
    it('keeps content alive while another index still holds it', () => {
      a.setOne(msg({ id: 'm1' }));
      b.setOne(msg({ id: 'm1' }));

      a.remove('m1');
      expect(a.get('m1')).toBeUndefined();
      expect(b.get('m1')).toBeDefined();
      expect(store.has('m1')).toBe(true);

      b.remove('m1');
      expect(store.has('m1')).toBe(false);
    });

    it('clear() unlinks only this index membership, leaving the other index untouched', () => {
      a.setOne(msg({ id: 'm1' }));
      a.setOne(msg({ id: 'm2' }));
      b.setOne(msg({ id: 'm2' }));

      a.clear();
      expect(a.values()).toEqual([]);
      expect(store.has('m1')).toBe(false); // only a held m1 -> GC'd
      expect(store.has('m2')).toBe(true); // b still holds m2
      expect(b.get('m2')).toBeDefined();
    });
  });

  describe('batching', () => {
    it('setMany coalesces sibling notifications to one', () => {
      // b holds m1..m3 first so it is a sibling holder for each
      b.setOne(msg({ id: 'm1' }));
      b.setOne(msg({ id: 'm2' }));
      b.setOne(msg({ id: 'm3' }));
      ownerB.onEntitiesChanged.mockClear();

      a.setMany([msg({ id: 'm1' }), msg({ id: 'm2' }), msg({ id: 'm3' })]);

      expect(ownerB.onEntitiesChanged).toHaveBeenCalledTimes(1);
      expect([...ownerB.onEntitiesChanged.mock.calls[0][0].changedIds].sort()).toEqual([
        'm1',
        'm2',
        'm3',
      ]);
    });
  });

  describe('store-less (private store) fallback', () => {
    it('behaves like a plain per-instance index when no shared store is passed', () => {
      const owner = spyOwner();
      const index = new StoreBackedItemIndex<LocalMessage>({ owner, getId });

      const m1 = msg({ id: 'm1', text: 'v1' });
      index.setOne(m1);
      expect(index.get('m1')).toBe(m1);
      expect(index.has('m1')).toBe(true);
      // the owner is the sole holder + the write origin, so it never notifies itself
      expect(owner.onEntitiesChanged).not.toHaveBeenCalled();

      const updated = msg({ id: 'm1', text: 'v2' });
      index.setOne(updated);
      expect(index.get('m1')).toBe(updated);

      // removal GCs immediately: nothing else holds the id
      index.remove('m1');
      expect(index.get('m1')).toBeUndefined();
      expect(index.has('m1')).toBe(false);
    });

    it('two store-less indexes are isolated (each has its own canonical copy)', () => {
      const x = new StoreBackedItemIndex<LocalMessage>({ owner: spyOwner(), getId });
      const y = new StoreBackedItemIndex<LocalMessage>({ owner: spyOwner(), getId });
      x.setOne(msg({ id: 'm1', text: 'x' }));
      y.setOne(msg({ id: 'm1', text: 'y' }));
      expect(x.get('m1')?.text).toBe('x');
      expect(y.get('m1')?.text).toBe('y');
    });
  });
});
