import type { ItemIndexApi } from '../pagination/ItemIndex';
import { EntityStore, type EntityStoreSubscriber } from './EntityStore';

export type StoreBackedItemIndexOptions<T> = {
  getEntityId: (item: T) => string;
  /** The list that owns this index; the store's notifications, ID renames and removals reach it. */
  owner?: EntityStoreSubscriber;
  /** The holder's name in the store, for debugging tools: no spaces, e.g. `channel-paginator`. */
  holderName?: string;
  /**
   * The store the items live in, shared with other lists. Without it the index makes a private
   * store and behaves like a plain per-list map (e.g. paginators built without a client).
   */
  store?: EntityStore<T>;
};

/**
 * The item index of one list (a paginator). Items live in an {@link EntityStore}, which can be
 * shared with other lists; the index only records which IDs belong to this list (`memberIds`) and
 * stands for the list in the store with one `holder`. Reads see only this list's items, even when a
 * shared store holds other lists' items (e.g. `thread.messagePaginator` sees only its replies).
 *
 * Store callbacks reach the owner through the holder: changes to held items (except the owner's own
 * writes), removals (with the removed item), and ID renames, which are also applied to `memberIds`.
 *
 * @template T The item type held by the index and its store.
 */
export class StoreBackedItemIndex<T> implements ItemIndexApi<T> {
  private memberIds = new Set<string>();
  private readonly store: EntityStore<T>;
  /**
   * This index's identity in the store: linked per ID while the index lists it, and unlinked on
   * remove or clear. The store tells holders apart by object, so every index has its own, even with
   * the same owner or none.
   */
  private readonly holder: EntityStoreSubscriber;
  private readonly getEntityId: (item: T) => string;

  constructor({ store, owner, getEntityId, holderName }: StoreBackedItemIndexOptions<T>) {
    this.store = store ?? new EntityStore<T>({ getEntityId });
    this.holder = {
      name: holderName,
      onEntitiesChanged: (batch) => owner?.onEntitiesChanged(batch),
      flushState: () => owner?.flushState?.(),
      onIdChanged: (oldId, newId) => {
        if (this.memberIds.delete(oldId)) this.memberIds.add(newId);
        owner?.onIdChanged?.(oldId, newId);
      },
      onEntityRemoved: (id, entity) => {
        // Owner first: dropping the item from its windows still reads it through this index.
        owner?.onEntityRemoved?.(id, entity);
        this.memberIds.delete(id);
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
