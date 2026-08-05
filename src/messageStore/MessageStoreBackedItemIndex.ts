import type { ItemIndexApi } from '../pagination/ItemIndex';
import type { MessageStore, MessageStoreSubscriber } from './MessageStore';
import type { LocalMessage } from '../types';

export type MessageStoreBackedItemIndexOptions = {
  store: MessageStore;
  /** The paginator that owns this index; used as the store subscriber + refcount holder. */
  owner: MessageStoreSubscriber;
  getId: (item: LocalMessage) => string;
};

/**
 * An {@link ItemIndexApi} implementation that keeps message **content** in a shared,
 * client-global {@link MessageStore} while keeping **membership** local.
 *
 * A paginator sees the exact same CRUD surface as a plain {@link ItemIndex}, but:
 *
 * - `get`/`has`/`values`/`entries` are scoped to *this* paginator's membership
 *   (`memberIds`), so `getItem(id)` still means "does THIS paginator hold the id"
 *   — even though the canonical object lives in the shared store. This is what keeps
 *   e.g. reaction routing (`threadPaginator.getItem(id) ? thread : channel`) correct
 *   and keeps the `.values()` scans from ever walking other channels' messages.
 * - `setOne` writes content once into the shared store and links the owner as a holder
 *   (drives both notification fan-out and refcount GC). The write passes the owner as
 *   `origin`, so the owner is not notified of its own write (it re-emits its window
 *   inline); other holders of the same id ARE notified and re-project.
 * - `remove`/`clear` unlink the owner rather than hard-deleting content, so a message
 *   still held by another paginator (e.g. a `show_in_channel` reply in both the channel
 *   list and its thread) survives; the store GCs it only when the last holder unlinks.
 */
export class MessageStoreBackedItemIndex implements ItemIndexApi<LocalMessage> {
  private memberIds = new Set<string>();
  private readonly store: MessageStore;
  private readonly owner: MessageStoreSubscriber;
  private readonly getId: (item: LocalMessage) => string;

  constructor({ store, owner, getId }: MessageStoreBackedItemIndexOptions) {
    this.store = store;
    this.owner = owner;
    this.getId = getId;
  }

  setMany(items: LocalMessage[]) {
    this.store.transaction(() => {
      for (const item of items) this.setOne(item);
    });
  }

  setOne(item: LocalMessage) {
    const id = this.getId(item);
    this.store.link(id, this.owner);
    this.memberIds.add(id);
    this.store.upsert(item, this.owner);
  }

  get(id: string): LocalMessage | undefined {
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

  entries(): [string, LocalMessage][] {
    const result: [string, LocalMessage][] = [];
    for (const id of this.memberIds) {
      const item = this.store.get(id);
      if (item) result.push([id, item]);
    }
    return result;
  }

  values(): LocalMessage[] {
    const result: LocalMessage[] = [];
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
