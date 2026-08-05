/**
 * The minimal CRUD surface a paginator relies on from its item index.
 *
 * The sole implementation is {@link StoreBackedItemIndex}: backed by a shared, client-global store
 * it dedupes content across collections and fans changes out to every holder; backed by a private
 * store (the default, owner-less mode) it behaves as a plain per-instance index. Keeping this as an
 * interface lets `BasePaginator` stay agnostic to which backing a given paginator uses.
 *
 * @template T The domain item type managed by the index.
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
  /**
   * Runs `fn`, coalescing any change notifications it produces into a single flush. A private-store
   * (owner-less) index has nothing to fan out and simply runs `fn`.
   */
  batch<R>(fn: () => R): R;
}
