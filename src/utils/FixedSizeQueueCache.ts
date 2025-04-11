/**
 * A cache that stores a fixed number of values in a queue.
 * The most recently added or retrieved value is kept at the front of the queue.
 * @template K - The type of the keys.
 * @template T - The type of the values.
 */
export class FixedSizeQueueCache<K, T> {
  private keys: Array<K>;
  private size: number;
  private valueByKey: Map<K, T>;
  constructor(size: number) {
    if (!size) throw new Error('Size must be greater than 0');
    this.keys = [];
    this.size = size;
    this.valueByKey = new Map();
  }

  /**
   * Adds a new or moves the existing reference to the front of the queue
   * @param key
   * @param value
   */
  add(key: K, value: T) {
    const index = this.keys.indexOf(key);

    if (index > -1) {
      this.keys.splice(this.keys.indexOf(key), 1);
    } else if (this.keys.length >= this.size) {
      const elementKey = this.keys.shift();

      if (elementKey) {
        this.valueByKey.delete(elementKey);
      }
    }

    this.keys.push(key);
    this.valueByKey.set(key, value);
  }

  /**
   * Retrieves the value by key.
   * @param key
   */
  peek(key: K) {
    const value = this.valueByKey.get(key);

    return value;
  }

  /**
   * Retrieves the value and moves it to the front of the queue.
   * @param key
   */
  get(key: K) {
    const foundElement = this.peek(key);

    if (foundElement && this.keys.indexOf(key) !== this.size - 1) {
      this.keys.splice(this.keys.indexOf(key), 1);
      this.keys.push(key);
    }

    return foundElement;
  }
}
