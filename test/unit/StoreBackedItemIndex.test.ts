import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageStore } from '../../src/messageStore/MessageStore';
import type { MessageStoreSubscriber } from '../../src/messageStore/MessageStore';
import { StoreBackedItemIndex } from '../../src/messageStore/StoreBackedItemIndex';
import { formatMessage } from '../../src/utils';
import { generateMsg } from './test-utils/generateMessage';
import type { LocalMessage } from '../../src';

const msg = (overrides: Partial<Parameters<typeof generateMsg>[0]> = {}): LocalMessage =>
  formatMessage(generateMsg(overrides));

const spyOwner = (): MessageStoreSubscriber & {
  onMessagesChanged: ReturnType<typeof vi.fn>;
} => ({
  onMessagesChanged: vi.fn(),
});

const getId = (m: LocalMessage) => m.id;

describe('StoreBackedItemIndex', () => {
  let store: MessageStore;
  let ownerA: ReturnType<typeof spyOwner>;
  let ownerB: ReturnType<typeof spyOwner>;
  let a: StoreBackedItemIndex;
  let b: StoreBackedItemIndex;

  beforeEach(() => {
    store = new MessageStore();
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
      ownerA.onMessagesChanged.mockClear();
      ownerB.onMessagesChanged.mockClear();

      a.setOne(msg({ id: 'm1', text: 'v2' }));

      expect(ownerA.onMessagesChanged).not.toHaveBeenCalled();
      expect(ownerB.onMessagesChanged).toHaveBeenCalledTimes(1);
      expect([...ownerB.onMessagesChanged.mock.calls[0][0].changedIds]).toEqual(['m1']);
    });

    it('does not notify a holder of an id it does not hold', () => {
      a.setOne(msg({ id: 'm1' }));
      ownerB.onMessagesChanged.mockClear();
      a.setOne(msg({ id: 'm1', text: 'again' }));
      expect(ownerB.onMessagesChanged).not.toHaveBeenCalled();
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
      ownerB.onMessagesChanged.mockClear();

      a.setMany([msg({ id: 'm1' }), msg({ id: 'm2' }), msg({ id: 'm3' })]);

      expect(ownerB.onMessagesChanged).toHaveBeenCalledTimes(1);
      expect([...ownerB.onMessagesChanged.mock.calls[0][0].changedIds].sort()).toEqual([
        'm1',
        'm2',
        'm3',
      ]);
    });
  });
});
