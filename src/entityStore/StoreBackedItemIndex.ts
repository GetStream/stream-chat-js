import type { ItemIndexApi } from '../pagination/ItemIndex';
import { EntityStore, type EntityStoreSubscriber } from './EntityStore';

export type StoreBackedItemIndexOptions<T> = {
  getEntityId: (item: T) => string;
  /**
   * The entity that owns this index; the index's store subscriber forwards notifications and id
   * changes to it. Optional: an index over a private store (see `store`) has no one to fan out to.
   * Message paginators pass themselves so cross-collection updates reach them; single-home
   * collections (channels, reminders, …) omit it.
   */
  owner?: EntityStoreSubscriber;
  /**
   * The shared, client-global store that holds the canonical content. Optional: when omitted the
   * index provisions a **private** {@link EntityStore} of its own, so it behaves exactly like a
   * plain, per-instance index — same code path, no shared content, no fan-out. This is the mode used
   * by single-home collections and by detached paginators (e.g. built without a client, in tests).
   */
  store?: EntityStore<T>;
};

/**
 * An {@link ItemIndexApi} implementation that keeps entity **content** in an {@link EntityStore}
 * while keeping **membership** local.
 *
 * A consumer sees the same minimal CRUD surface ({@link ItemIndexApi}), but:
 *
 * - `get`/`has`/`values`/`entries` are scoped to *this* index's membership (`memberIds`), so
 *   `getItem(id)` still means "does THIS index hold the id" — even though the canonical object
 *   lives in the (possibly shared) store. This is what keeps e.g. reaction routing
 *   (`threadPaginator.getItem(id) ? thread : channel`) correct and keeps the `.values()` scans
 *   from ever walking other channels' entities.
 * - `setOne` writes content once into the store and links the index's holder as a subscriber
 *   (drives both notification fan-out and refcount GC). The write passes the holder as the
 *   `subscriber` to skip, so the owner is not notified of its own write (it re-emits its window
 *   inline); other subscribers of the same id ARE notified and re-project.
 * - `remove`/`clear` unlink the holder rather than hard-deleting content, so an entity still held by
 *   another index (e.g. a `show_in_channel` reply in both the channel list and its thread) survives;
 *   the store GCs it only when the last subscriber unlinks.
 * - When the store renames an id ({@link EntityStore.changeId}), the holder renames it in
 *   `memberIds` too, so later reads and unlinks use the new id.
 *
 * When no shared store is supplied the index holds a private store — every id it links has exactly
 * one subscriber (its own holder), so no fan-out ever fires and removal GCs immediately, matching a
 * plain per-instance index.
 *
 * @template T The domain item type held by the index; collocated with the {@link EntityStore}'s.
 */
export class StoreBackedItemIndex<T> implements ItemIndexApi<T> {
  private memberIds = new Set<string>();
  private readonly store: EntityStore<T>;
  /**
   * The subscriber this index links in the store: forwards notifications to the owner and keeps
   * `memberIds` in step when the store renames an id. Its own object per index, so two indexes
   * sharing an owner (or having none) still hold their links separately.
   */
  private readonly holder: EntityStoreSubscriber;
  private readonly getEntityId: (item: T) => string;

  constructor({ store, owner, getEntityId }: StoreBackedItemIndexOptions<T>) {
    this.store = store ?? new EntityStore<T>({ getEntityId });
    this.holder = {
      onEntitiesChanged: (batch) => owner?.onEntitiesChanged(batch),
      flushState: () => owner?.flushState?.(),
      onIdChanged: (oldId, newId) => {
        if (this.memberIds.delete(oldId)) this.memberIds.add(newId);
        owner?.onIdChanged?.(oldId, newId);
      },
    };
    this.getEntityId = getEntityId;
  }

  setMany(items: T[]) {
    this.store.transaction(() => {
      for (const item of items) this.setOne(item);
    });
  }

  setOne(item: T) {
    const id = this.getEntityId(item);
    this.store.link(id, this.holder);
    this.memberIds.add(id);
    this.store.upsert(item, this.holder);
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
    this.store.unlink(id, this.holder);
  }

  clear() {
    for (const id of this.memberIds) this.store.unlink(id, this.holder);
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
