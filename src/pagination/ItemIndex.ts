/**
 * The ItemIndex is a canonical, ID-addressable storage layer for domain items.
 *
 * It provides a single source of truth for all items managed by one or more
 * paginators, views, or interval caches. Instead of duplicating objects inside
 * multiple paginated ranges, every item is stored exactly once in the ItemIndex
 * and is referenced by ID from interval windows, caches, or UI layers.
 *
 * ## Purpose
 *
 * Pagination flows (especially those supporting random-access page jumps
 * or “load-around-anchor” requests) require representing discontinuous windows
 * of items. Attempting to store full item objects in every interval causes
 * duplication, inconsistent updates, increased memory usage, and difficult
 * merging logic.
 *
 * The ItemIndex solves this by:
 *
 * - Storing each item exactly once.
 * - Making all intervals store only `itemIds: string[]` in sorted order.
 * - Making paginators read visible items through `itemIndex.get(id)`.
 * - Ensuring that any mutation of an item is immediately visible everywhere.
 *
 * ## Benefits
 *
 * - **Consistency:** Updates propagate automatically because intervals reference
 *   items by ID. No need to synchronize multiple arrays of objects.
 * - **Efficiency:** Items are only stored once; intervals are lightweight lists
 *   of IDs.
 * - **Scalability:** Supports multiple disjoint intervals (e.g. random jumps),
 *   merging of ranges, and multiple independent paginators sharing the same
 *   item set.
 * - **Clean separation of concerns:** The paginator manages window boundaries;
 *   the ItemIndex manages object identity and update semantics.
 *
 * ## Typical Usage
 *
 * 1. A paginator fetches a page of items from the server.
 * 2. It calls `itemIndex.setMany(fetchedItems)` to update the canonical store.
 * 3. It constructs or updates an interval using the IDs only:
 *      `{ itemIds: fetchedItems.map(item => itemIndex.getId(item)) }`
 * 4. The UI renders the active interval’s items using:
 *      `interval.itemIds.map(id => itemIndex.get(id))`
 *
 * ## Update Semantics
 *
 * Updates should always be performed through `setOne()` or `setMany()`.
 * This ensures that:
 *
 * - The item object is replaced (immutable semantics).
 * - All consumers reading via ID immediately observe the new value.
 *
 * The ItemIndex does not automatically re-sort intervals; interval or paginator
 * logic may reorder their `itemIds` arrays when necessary.
 *
 * ## Notes
 *
 * - The ItemIndex does not apply filtering or sorting. Those are the paginator’s
 *   responsibilities.
 * - The ItemIndex intentionally exposes only minimal CRUD operations to keep it
 *   predictable and side-effect-free.
 * - Consumers should treat items as immutable snapshots. If mutation is needed,
 *   always create a new item instance and pass it to `setOne()`.
 *
 * @template T The domain item type managed by the index.
 */
export class ItemIndex<T> {
  private byId = new Map<string, T>();

  constructor(private getId: (item: T) => string) {}

  setMany(items: T[]) {
    for (const item of items) {
      this.byId.set(this.getId(item), item);
    }
  }

  setOne(item: T) {
    this.byId.set(this.getId(item), item);
  }

  get(id: string): T | undefined {
    return this.byId.get(id);
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  remove(id: string) {
    this.byId.delete(id);
  }

  entries() {
    return [...this.byId.entries()];
  }
}
