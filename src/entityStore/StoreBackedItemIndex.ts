import type { ItemIndexApi } from '../pagination/ItemIndex';
import { EntityStore, type EntityStoreSubscriber } from './EntityStore';

export type StoreBackedItemIndexOptions<T> = {
  getEntityId: (item: T) => string;
  /**
   * The list that owns this index; the index's holder passes the store's notifications, id renames
   * and removals on to it. Paginators pass themselves, so updates from other lists and removals from
   * the store reach them.
   */
  owner?: EntityStoreSubscriber;
  /**
   * The name the index's holder goes by in the store, for debugging tools; no spaces, e.g.
   * `channel-paginator`.
   */
  holderName?: string;
  /**
   * The store the items live in, shared with other lists (the message store, the channel store).
   * Optional: without it the index makes a private store and behaves like a plain per-list map, as
   * single-home collections and paginators built without a client (in tests) do.
   */
  store?: EntityStore<T>;
};

/**
 * The item index of one list (a paginator). The list's items live in an {@link EntityStore}, which
 * can be shared with other lists; the index itself only records which ids belong to this list
 * (`memberIds`) and stands for the list in the store with one `holder` object.
 *
 * Example: the "Inbox" and "Work" channel lists both show channel C.
 *
 * 1. Inbox adds C (`setOne`): its index adds C's id to `memberIds`, links Inbox's holder for C in
 *    the store, and saves C there. Work does the same with its own holder, so the store keeps one C
 *    with the holders {Inbox, Work}.
 * 2. Inbox reads (`get`, `has`, `values`, `entries`): the index checks its own `memberIds` first,
 *    then takes the item from the store. A list only ever sees its own items, which is what lets
 *    `threadPaginator.getItem(id)` tell a thread's reply from a channel message.
 * 3. Inbox drops C (`remove`, `clear`): its index forgets the id and unlinks Inbox's holder. C stays
 *    while Work holds it; once the last holder unlinks, the store drops C (and calls its
 *    `onRelease`). The store tells holders apart by object, so every index has its own.
 *
 * The store also talks back through the holder:
 *
 * - "an item you hold changed": passed on to the owner, so a list re-renders when another list
 *   updates a shared item (a reaction written by the channel list reaches the open thread). The list
 *   that made the change is skipped; it updates itself.
 * - "an id you hold was renamed" ({@link EntityStore.changeId}): applied to `memberIds`, so a later
 *   remove unlinks the renamed entry rather than missing it.
 * - "an item you hold was removed" ({@link EntityStore.remove}, {@link EntityStore.clear}): the id
 *   leaves `memberIds`, and the owner gets the removed item so it can drop it from its windows.
 *
 * Without a shared store, the index makes a private one and behaves like a plain per-list map.
 *
 * @template T The item type held by the index and its store.
 */
export class StoreBackedItemIndex<T> implements ItemIndexApi<T> {
  private memberIds = new Set<string>();
  private readonly store: EntityStore<T>;
  /**
   * This index's identity in the store. Linking it for an id keeps that entity stored while the
   * index lists it; unlinking it on remove or clear lets the store drop the entity once no other
   * holder remains. The store tells holders apart by object reference, so every index gets its own,
   * even two indexes with the same owner or with none.
   *
   * It also receives what the store sends this index: change notifications and removals, passed on
   * to the owner, and id renames ({@link EntityStore.changeId}), applied to `memberIds` so a later
   * remove unlinks the renamed entry.
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
        // the owner first: dropping the item from its windows still reads it through this index
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
