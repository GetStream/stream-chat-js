import type { ItemIndexApi } from '../pagination/ItemIndex';
import { EntityStore, type EntityStoreSubscriber } from './EntityStore';

export type StoreBackedItemIndexOptions<T> = {
  /** The paginator that owns this index; used as the store subscriber + refcount holder. */
  owner: EntityStoreSubscriber;
  getId: (item: T) => string;
  /**
   * The shared, client-global store that holds the canonical content. Optional: when omitted the
   * index provisions a **private** {@link EntityStore} of its own, so a detached consumer (e.g. a
   * paginator built without a client, as in tests) behaves exactly like a plain, per-instance index
   * — same code path, no shared fan-out.
   */
  store?: EntityStore<T>;
};

/**
 * An {@link ItemIndexApi} implementation that keeps entity **content** in an {@link EntityStore}
 * while keeping **membership** local.
 *
 * A paginator sees the exact same CRUD surface as a plain {@link ItemIndex}, but:
 *
 * - `get`/`has`/`values`/`entries` are scoped to *this* index's membership (`memberIds`), so
 *   `getItem(id)` still means "does THIS index hold the id" — even though the canonical object
 *   lives in the (possibly shared) store. This is what keeps e.g. reaction routing
 *   (`threadPaginator.getItem(id) ? thread : channel`) correct and keeps the `.values()` scans
 *   from ever walking other channels' entities.
 * - `setOne` writes content once into the store and links the owner as a holder (drives both
 *   notification fan-out and refcount GC). The write passes the owner as `origin`, so the owner is
 *   not notified of its own write (it re-emits its window inline); other holders of the same id ARE
 *   notified and re-project.
 * - `remove`/`clear` unlink the owner rather than hard-deleting content, so an entity still held by
 *   another index (e.g. a `show_in_channel` reply in both the channel list and its thread) survives;
 *   the store GCs it only when the last holder unlinks.
 *
 * When no shared store is supplied the index holds a private store — every id it links has exactly
 * one holder (its own owner), so no fan-out ever fires and removal GCs immediately, matching a plain
 * per-instance index.
 *
 * @template T The domain item type held by the index; collocated with the {@link EntityStore}'s.
 */
export class StoreBackedItemIndex<T> implements ItemIndexApi<T> {
  private memberIds = new Set<string>();
  private readonly store: EntityStore<T>;
  private readonly owner: EntityStoreSubscriber;
  private readonly getId: (item: T) => string;

  constructor({ store, owner, getId }: StoreBackedItemIndexOptions<T>) {
    this.store = store ?? new EntityStore<T>({ getId });
    this.owner = owner;
    this.getId = getId;
  }

  setMany(items: T[]) {
    this.store.transaction(() => {
      for (const item of items) this.setOne(item);
    });
  }

  setOne(item: T) {
    const id = this.getId(item);
    this.store.link(id, this.owner);
    this.memberIds.add(id);
    this.store.upsert(item, this.owner);
  }

  get(id: string): T | undefined {
    return this.memberIds.has(id) ? this.store.get(id) : undefined;
  }

  has(id: string): boolean {
    return this.memberIds.has(id);
  }

  remove(id: string) {
    if (!this.memberIds.has(id)) return;
    this.memberIds.delete(id);
    this.store.unlink(id, this.owner);
  }

  clear() {
    for (const id of this.memberIds) this.store.unlink(id, this.owner);
    this.memberIds.clear();
  }

  entries(): [string, T][] {
    const result: [string, T][] = [];
    for (const id of this.memberIds) {
      const item = this.store.get(id);
      if (item) result.push([id, item]);
    }
    return result;
  }

  values(): T[] {
    const result: T[] = [];
    for (const id of this.memberIds) {
      const item = this.store.get(id);
      if (item) result.push(item);
    }
    return result;
  }

  batch<R>(fn: () => R): R {
    return this.store.transaction(fn);
  }
}
