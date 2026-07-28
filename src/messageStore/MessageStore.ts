import type { LocalMessage } from '../types';
import type { Unsubscribe } from '../store';

/**
 * A batch of message-store changes delivered to a subscriber in a single notification.
 *
 * `changedIds` are the ids the subscriber watches whose canonical object changed
 * reference this flush (an upsert or a removal). `removedIds` is the subset that
 * was removed (so `store.get(id)` now returns `undefined`).
 */
export type MessageStoreChangeBatch = {
  changedIds: ReadonlySet<string>;
  removedIds: ReadonlySet<string>;
};

/**
 * Anything that observes messages held in the {@link MessageStore}.
 *
 * A subscriber watches a *set* of message ids (a paginator watches all ids in its
 * intervals; a thread watches its single parent id). It is notified at most once
 * per store transaction with the subset of its watched ids that changed.
 */
export type MessageStoreSubscriber = {
  onMessagesChanged: (batch: MessageStoreChangeBatch) => void;
};

const EMPTY_ID_SET: ReadonlySet<string> = new Set<string>();

/**
 * A client-global, normalized store for message content.
 *
 * The store holds exactly **one** canonical {@link LocalMessage} per id and lets any
 * number of entities (paginators, threads, ad-hoc consumers) subscribe to individual
 * ids. Every message mutation in the SDK becomes a single `upsert`, and the store
 * fans the change out to exactly the entities holding that id — replacing the manual
 * copy-to-copy fan-out that keeping N per-paginator copies in sync required.
 *
 * ## Design
 *
 * - **Content:** `byId` (`Map<id, LocalMessage>`) is the single source of truth.
 *   Objects are immutable snapshots: `upsert` *replaces*, never mutates in place, so
 *   the reference-equality short-circuit (mirroring {@link StateStore.next}) and every
 *   downstream selector keep working.
 * - **Subscription registry / refcount:** `subscribers` (`Map<id, Set<subscriber>>`)
 *   is both the per-id notification list and the reference count — when the last
 *   subscriber of an id unlinks, the canonical copy is garbage-collected.
 * - **Batching:** `transaction` coalesces a bulk write (e.g. a page of N messages) so
 *   each affected subscriber is notified **once** with the full changed-id set, instead
 *   of N times.
 * - **Signal-then-pull:** subscribers receive the set of changed ids and pull the new
 *   content via `get`; the store never pushes objects.
 *
 * This is deliberately a hand-rolled per-id registry rather than a {@link StateStore}:
 * a single `StateStore` would run every subscriber's selector on every change
 * (O(all subscribers) per emit), and a store-per-message would allocate a full
 * `StateStore` per id with no cross-id batching. The `Map<id, Set>` gives
 * O(subscribers-of-changed-id) fan-out — the same idiom as `PollManager`'s cache.
 */
export class MessageStore {
  private byId = new Map<string, LocalMessage>();
  private subscribers = new Map<string, Set<MessageStoreSubscriber>>();

  private transactionDepth = 0;
  private pendingChanged = new Map<MessageStoreSubscriber, Set<string>>();
  private pendingRemoved = new Map<MessageStoreSubscriber, Set<string>>();

  // ---- reads ----

  get(id: string | undefined): LocalMessage | undefined {
    return typeof id === 'string' ? this.byId.get(id) : undefined;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  // ---- writes ----

  /**
   * Replaces the canonical copy of `message` and notifies every subscriber watching
   * its id — except `origin`, which is expected to re-render itself (the paginator
   * that performed the write already emits its own window inline, so it must not be
   * notified a second time through the subscription).
   */
  upsert(message: LocalMessage, origin?: MessageStoreSubscriber): void {
    const { id } = message;
    const previous = this.byId.get(id);
    // do not notify if the value hasn't changed (mirrors StateStore.next)
    if (previous === message) return;
    this.byId.set(id, message);
    this.markDirty(id, false, origin);
    this.autoFlush();
  }

  /**
   * Hard-removes the canonical copy of `id` and signals its removal to subscribers.
   * (Refcount GC in {@link unlink} handles the softer "no holder left" case.)
   */
  remove(id: string, origin?: MessageStoreSubscriber): void {
    if (!this.byId.has(id)) return;
    this.byId.delete(id);
    this.markDirty(id, true, origin);
    this.autoFlush();
  }

  // ---- subscription registry / refcount ----

  /** Registers `subscriber` as a holder of `id` (notification target + refcount). */
  link(id: string, subscriber: MessageStoreSubscriber): void {
    let holders = this.subscribers.get(id);
    if (!holders) {
      holders = new Set();
      this.subscribers.set(id, holders);
    }
    holders.add(subscriber);
  }

  /** Drops `subscriber` as a holder of `id`; GCs the canonical copy when none remain. */
  unlink(id: string, subscriber: MessageStoreSubscriber): void {
    const holders = this.subscribers.get(id);
    if (!holders) return;
    holders.delete(subscriber);
    if (holders.size === 0) {
      this.subscribers.delete(id);
      // refcount GC: nobody holds this message any longer.
      this.byId.delete(id);
    }
  }

  /**
   * Sugar for atomic / ad-hoc consumers that watch a single id (e.g. a thread watching
   * its parent message). Fires `handler` immediately with the current value (mirroring
   * {@link StateStore.subscribe}) and on every subsequent change.
   */
  subscribe(
    id: string,
    handler: (message: LocalMessage | undefined) => void,
  ): Unsubscribe {
    const subscriber: MessageStoreSubscriber = {
      onMessagesChanged: () => handler(this.byId.get(id)),
    };
    this.link(id, subscriber);
    handler(this.byId.get(id));
    return () => this.unlink(id, subscriber);
  }

  // ---- batching ----

  /**
   * Runs `fn`, coalescing all notifications produced by writes inside it into a single
   * flush on exit. Re-entrant: nested transactions flush only when the outermost exits.
   */
  transaction<T>(fn: () => T): T {
    this.transactionDepth += 1;
    try {
      return fn();
    } finally {
      this.transactionDepth -= 1;
      if (this.transactionDepth === 0) this.flush();
    }
  }

  private markDirty(id: string, removed: boolean, origin?: MessageStoreSubscriber): void {
    const holders = this.subscribers.get(id);
    if (!holders) return;
    for (const holder of holders) {
      if (holder === origin) continue;
      let changed = this.pendingChanged.get(holder);
      if (!changed) {
        changed = new Set();
        this.pendingChanged.set(holder, changed);
      }
      changed.add(id);
      if (removed) {
        let removedSet = this.pendingRemoved.get(holder);
        if (!removedSet) {
          removedSet = new Set();
          this.pendingRemoved.set(holder, removedSet);
        }
        removedSet.add(id);
      }
    }
  }

  private autoFlush(): void {
    if (this.transactionDepth === 0) this.flush();
  }

  private flush(): void {
    if (this.pendingChanged.size === 0) return;
    // swap out the pending maps before notifying so writes made from within a
    // subscriber accumulate into the next flush rather than mutating this one.
    const changedBySubscriber = this.pendingChanged;
    const removedBySubscriber = this.pendingRemoved;
    this.pendingChanged = new Map();
    this.pendingRemoved = new Map();
    for (const [subscriber, changedIds] of changedBySubscriber) {
      subscriber.onMessagesChanged({
        changedIds,
        removedIds: removedBySubscriber.get(subscriber) ?? EMPTY_ID_SET,
      });
    }
  }
}
