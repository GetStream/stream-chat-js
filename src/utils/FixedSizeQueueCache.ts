type Dispose<K, T> = (key: K, value: T) => void;
/**
 * Least-recently-used cache holding at most `size` values. `add` and `get` mark a key as most
 * recently used. Adding to a full cache evicts the least recently used entry, calling `dispose`.
 */
export class FixedSizeQueueCache<K, T> {
  private keys: Array<K>;
  private size: number;
  private map: Map<K, T>;
  private dispose: Dispose<K, T> | null;

  constructor(size: number, options?: { dispose: (key: K, value: T) => void }) {
    if (!size) throw new Error('Size must be greater than 0');
    this.keys = [];
    this.size = size;
    this.map = new Map();
    this.dispose = options?.dispose ?? null;
  }

  /**
   * Inserts or updates an entry as the most recently used one.
   *
   * @param key - The cache key.
   * @param value - The value to associate with `key`.
   */
  add(key: K, value: T) {
    const index = this.keys.indexOf(key);

    if (index > -1) {
      this.keys.splice(index, 1);
    } else if (this.keys.length >= this.size) {
      const itemKey = this.keys.shift();

      // Compared with `undefined` and checked with `has`, so falsy keys and values are evicted too.
      if (itemKey !== undefined && this.map.has(itemKey)) {
        this.dispose?.(itemKey, this.map.get(itemKey) as T);
        this.map.delete(itemKey);
      }
    }

    this.keys.push(key);
    this.map.set(key, value);
  }

  /**
   * Retrieves a value without marking it as recently used.
   *
   * @param key - The cache key.
   * @returns The value, or `undefined` when the key is not cached.
   */
  peek(key: K) {
    const value = this.map.get(key);

    return value;
  }

  /**
   * Retrieves a value and marks it as most recently used.
   *
   * @param key - The cache key.
   * @returns The value, or `undefined` when the key is not cached.
   */
  get(key: K) {
    const foundItem = this.peek(key);
    const index = this.keys.indexOf(key);

    if (index > -1 && index !== this.keys.length - 1) {
      this.keys.splice(index, 1);
      this.keys.push(key);
    }

    return foundItem;
  }

  /** Every cached value, as a new array. */
  values(): T[] {
    return Array.from(this.map.values());
  }

  /** Empties the cache, calling `dispose` for each entry. */
  clear() {
    if (this.dispose) {
      this.map.forEach((entry, key) => this.dispose?.(key, entry));
    }
    this.map.clear();
    this.keys = [];
  }
}
