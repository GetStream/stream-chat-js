import { describe, it, expect, beforeEach } from 'vitest';
import { ItemIndex } from '../../../src/pagination/ItemIndex';

interface TestItem {
  id: string;
  value: number;
}

describe('ItemIndex', () => {
  let itemIndex: ItemIndex<TestItem>;
  const getId = (item: TestItem) => item.id;

  beforeEach(() => {
    itemIndex = new ItemIndex({ getId });
  });

  describe('constructor', () => {
    it('should initialize with an empty index', () => {
      expect(itemIndex.entries()).toEqual([]);
    });

    it('should accept a custom getId function', () => {
      const customIndex = new ItemIndex<{ key: string }>({ getId: (item) => item.key });
      const item = { key: '123' };
      customIndex.setOne(item);
      expect(customIndex.get('123')).toBe(item);
    });
  });

  describe('setOne', () => {
    it('should add a single item', () => {
      const item: TestItem = { id: '1', value: 10 };
      itemIndex.setOne(item);
      expect(itemIndex.get('1')).toBe(item);
      expect(itemIndex.has('1')).toBe(true);
    });

    it('should overwrite an existing item with the same ID', () => {
      const item1: TestItem = { id: '1', value: 10 };
      const item2: TestItem = { id: '1', value: 20 };

      itemIndex.setOne(item1);
      expect(itemIndex.get('1')).toBe(item1);

      itemIndex.setOne(item2);
      expect(itemIndex.get('1')).toBe(item2);
      expect(itemIndex.get('1')?.value).toBe(20);
    });
  });

  describe('setMany', () => {
    it('should add multiple items', () => {
      const items: TestItem[] = [
        { id: '1', value: 10 },
        { id: '2', value: 20 },
        { id: '3', value: 30 },
      ];

      itemIndex.setMany(items);

      expect(itemIndex.get('1')).toBe(items[0]);
      expect(itemIndex.get('2')).toBe(items[1]);
      expect(itemIndex.get('3')).toBe(items[2]);
      expect(itemIndex.entries().length).toBe(3);
    });

    it('should handle empty array', () => {
      itemIndex.setMany([]);
      expect(itemIndex.entries().length).toBe(0);
    });

    it('should overwrite existing items when setting many', () => {
      const item1: TestItem = { id: '1', value: 10 };
      itemIndex.setOne(item1);

      const newItems: TestItem[] = [
        { id: '1', value: 99 },
        { id: '2', value: 20 },
      ];

      itemIndex.setMany(newItems);

      expect(itemIndex.get('1')?.value).toBe(99);
      expect(itemIndex.get('2')?.value).toBe(20);
    });
  });

  describe('get', () => {
    it('should return undefined for non-existent item', () => {
      expect(itemIndex.get('non-existent')).toBeUndefined();
    });

    it('should return the correct item for existing ID', () => {
      const item: TestItem = { id: 'abc', value: 123 };
      itemIndex.setOne(item);
      expect(itemIndex.get('abc')).toBe(item);
    });
  });

  describe('has', () => {
    it('should return false for non-existent item', () => {
      expect(itemIndex.has('non-existent')).toBe(false);
    });

    it('should return true for existing item', () => {
      const item: TestItem = { id: 'abc', value: 123 };
      itemIndex.setOne(item);
      expect(itemIndex.has('abc')).toBe(true);
    });
  });

  describe('remove', () => {
    it('should remove an existing item', () => {
      const item: TestItem = { id: '1', value: 10 };
      itemIndex.setOne(item);
      expect(itemIndex.has('1')).toBe(true);

      itemIndex.remove('1');
      expect(itemIndex.has('1')).toBe(false);
      expect(itemIndex.get('1')).toBeUndefined();
    });

    it('should do nothing when removing non-existent item', () => {
      // Should not throw
      itemIndex.remove('non-existent');
      expect(itemIndex.entries().length).toBe(0);
    });
  });

  describe('entries', () => {
    it('should return all entries as an array of [id, item] tuples', () => {
      const items: TestItem[] = [
        { id: '1', value: 10 },
        { id: '2', value: 20 },
      ];
      itemIndex.setMany(items);

      const entries = itemIndex.entries();
      expect(entries).toHaveLength(2);
      expect(entries).toEqual(
        expect.arrayContaining([
          ['1', items[0]],
          ['2', items[1]],
        ]),
      );
    });

    it('should return empty array for empty index', () => {
      expect(itemIndex.entries()).toEqual([]);
    });
  });

  describe('values', () => {
    it('should return all values as an array of items', () => {
      const items: TestItem[] = [
        { id: '1', value: 10 },
        { id: '2', value: 20 },
      ];
      itemIndex.setMany(items);

      const entries = itemIndex.values();
      expect(entries).toHaveLength(2);
      expect(entries).toEqual(
        expect.arrayContaining([
          { id: '1', value: 10 },
          { id: '2', value: 20 },
        ]),
      );
    });

    it('should return empty array for empty index', () => {
      expect(itemIndex.values()).toEqual([]);
    });
  });
});
