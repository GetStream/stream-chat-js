/**
 * The CRUD surface a paginator relies on from its item index. The only implementation is
 * `StoreBackedItemIndex`: on a shared client store it dedupes items across collections and fans
 * changes out to every holder, on a private store it is a plain per-instance index.
 */
export interface ItemIndexApi<T> {
  setMany(items: T[]): void;
  setOne(item: T): void;
  get(id: string): T | undefined;
  has(id: string): boolean;
  remove(id: string): void;
  clear(): void;
  entries(): [string, T][];
  values(): T[];
  /** Runs `fn`, coalescing the change notifications it produces into a single flush. */
  batch<R>(fn: () => R): R;
}
