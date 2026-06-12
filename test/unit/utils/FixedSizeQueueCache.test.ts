import { describe, expect, it, vi } from 'vitest';
import { FixedSizeQueueCache } from '../../../src/utils/FixedSizeQueueCache';

describe('FixedSizeQueueCache', () => {
  it('should throw an error if size is not provided', () => {
    expect(() => new FixedSizeQueueCache(0)).toThrow('Size must be greater than 0');
  });

  it('should initialize with the correct size', () => {
    const cache = new FixedSizeQueueCache(3);
    expect(cache).toBeInstanceOf(FixedSizeQueueCache);
  });

  it('should add and retrieve items', () => {
    const cache = new FixedSizeQueueCache(3);

    cache.add('key1', 'value1');
    cache.add('key2', 'value2');

    expect(cache.get('key1')).toBe('value1');
    expect(cache.get('key2')).toBe('value2');
    expect(cache.get('key3')).toBeUndefined();
  });

  it('should respect the size limit', () => {
    const cache = new FixedSizeQueueCache(2);

    cache.add('key1', 'value1');
    cache.add('key2', 'value2');
    cache.add('key3', 'value3');

    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key2')).toBe('value2');
    expect(cache.get('key3')).toBe('value3');
  });

  it('should update existing keys', () => {
    const cache = new FixedSizeQueueCache(3);

    cache.add('key1', 'value1');
    cache.add('key2', 'value2');
    cache.add('key1', 'updated-value1');

    expect(cache.get('key1')).toBe('updated-value1');
    expect(cache.get('key2')).toBe('value2');
  });

  it('should move accessed items to the top of the queue', () => {
    const cache = new FixedSizeQueueCache(3);

    cache.add('key1', 'value1');
    cache.add('key2', 'value2');
    cache.add('key3', 'value3');

    // Access key1, which should move it to the end
    cache.get('key1');

    // Add a new item, which should evict key2 (now the oldest)
    cache.add('key4', 'value4');

    expect(cache.get('key1')).toBe('value1');
    expect(cache.get('key2')).toBeUndefined();
    expect(cache.get('key3')).toBe('value3');
    expect(cache.get('key4')).toBe('value4');
  });

  it('should call provided dispose function when queue overflows', () => {
    const cache = new FixedSizeQueueCache<string, { unsubscribe: typeof vi.fn }>(2, {
      dispose: (_, v) => {
        v.unsubscribe();
      },
    });

    const complexEntity1 = { unsubscribe: vi.fn() };
    const complexEntity2 = { unsubscribe: vi.fn() };
    const complexEntity3 = { unsubscribe: vi.fn() };

    cache.add('ce1', complexEntity1);
    cache.add('ce2', complexEntity2);
    cache.add('ce3', complexEntity3);

    expect(complexEntity1.unsubscribe).toHaveBeenCalledTimes(1);
    expect(complexEntity2.unsubscribe).not.toHaveBeenCalled();
    expect(complexEntity3.unsubscribe).not.toHaveBeenCalled();
  });

  it('should not move items to the top when using peek', () => {
    const cache = new FixedSizeQueueCache(3);

    cache.add('key1', 'value1');
    cache.add('key2', 'value2');
    cache.add('key3', 'value3');

    // Peek at key1, which should NOT move it to the end
    cache.peek('key1');

    // Add a new item, which should evict key1 (still the oldest)
    cache.add('key4', 'value4');

    expect(cache.get('key1')).toBeUndefined();
    expect(cache.get('key2')).toBe('value2');
    expect(cache.get('key3')).toBe('value3');
    expect(cache.get('key4')).toBe('value4');
  });

  it('should handle different key and value types', () => {
    const cache = new FixedSizeQueueCache(3);

    cache.add(1, 'string value');
    cache.add('string key', 42);
    cache.add({ id: 1 }, { data: 'object value' });

    expect(cache.get(1)).toBe('string value');
    expect(cache.get('string key')).toBe(42);
    expect(cache.get({ id: 1 })).toBeUndefined(); // Objects are compared by reference
  });

  it('should handle multiple operations in sequence', () => {
    const cache = new FixedSizeQueueCache(3);

    // Add items
    cache.add('key1', 'value1');
    cache.add('key2', 'value2');
    cache.add('key3', 'value3');

    // Access an item
    expect(cache.get('key1')).toBe('value1');

    // Update an item
    cache.add('key2', 'updated-value2');

    // Add a new item (should evict key3)
    cache.add('key4', 'value4');

    // Verify final state
    expect(cache.get('key1')).toBe('value1');
    expect(cache.get('key2')).toBe('updated-value2');
    expect(cache.get('key3')).toBeUndefined();
    expect(cache.get('key4')).toBe('value4');
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      const cache = new FixedSizeQueueCache(3);
      cache.add('key1', 'value1');
      cache.add('key2', 'value2');
      cache.add('key3', 'value3');

      cache.clear();

      expect(cache.get('key1')).toBeUndefined();
      expect(cache.get('key2')).toBeUndefined();
      expect(cache.get('key3')).toBeUndefined();
    });

    it('should leave the cache reusable at full capacity', () => {
      const cache = new FixedSizeQueueCache(2);
      cache.add('key1', 'value1');
      cache.add('key2', 'value2');

      cache.clear();

      cache.add('key3', 'value3');
      cache.add('key4', 'value4');

      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });

    it('should respect eviction order after clear (LRU state is reset)', () => {
      const cache = new FixedSizeQueueCache(2);
      cache.add('key1', 'value1');
      cache.add('key2', 'value2');

      cache.clear();

      // After clear, key3 is the oldest entry and should be evicted by key5
      cache.add('key3', 'value3');
      cache.add('key4', 'value4');
      cache.add('key5', 'value5');

      expect(cache.get('key3')).toBeUndefined();
      expect(cache.get('key4')).toBe('value4');
      expect(cache.get('key5')).toBe('value5');
    });

    it('should call dispose for every remaining entry when dispose is configured', () => {
      const dispose = vi.fn();
      const cache = new FixedSizeQueueCache<string, number>(3, { dispose });

      cache.add('key1', 1);
      cache.add('key2', 2);
      cache.add('key3', 3);

      cache.clear();

      expect(dispose).toHaveBeenCalledTimes(3);
      expect(dispose).toHaveBeenCalledWith('key1', 1);
      expect(dispose).toHaveBeenCalledWith('key2', 2);
      expect(dispose).toHaveBeenCalledWith('key3', 3);
    });

    it('should not throw when dispose is not configured', () => {
      const cache = new FixedSizeQueueCache(2);
      cache.add('key1', 'value1');
      cache.add('key2', 'value2');

      expect(() => cache.clear()).not.toThrow();
    });

    it('should not re-dispose items already evicted via overflow', () => {
      const dispose = vi.fn();
      const cache = new FixedSizeQueueCache<string, number>(2, { dispose });

      cache.add('key1', 1);
      cache.add('key2', 2);
      cache.add('key3', 3); // evicts key1 - dispose called for key1

      expect(dispose).toHaveBeenCalledTimes(1);
      expect(dispose).toHaveBeenCalledWith('key1', 1);

      dispose.mockClear();
      cache.clear();

      expect(dispose).toHaveBeenCalledTimes(2);
      expect(dispose).toHaveBeenCalledWith('key2', 2);
      expect(dispose).toHaveBeenCalledWith('key3', 3);
    });

    it('should be a no-op on an empty cache', () => {
      const dispose = vi.fn();
      const cache = new FixedSizeQueueCache(2, { dispose });

      expect(() => cache.clear()).not.toThrow();
      expect(dispose).not.toHaveBeenCalled();
    });

    it('should not double-dispose when called consecutively', () => {
      const dispose = vi.fn();
      const cache = new FixedSizeQueueCache<string, number>(2, { dispose });

      cache.add('key1', 1);
      cache.clear();
      cache.clear();

      expect(dispose).toHaveBeenCalledTimes(1);
      expect(dispose).toHaveBeenCalledWith('key1', 1);
    });
  });
});
