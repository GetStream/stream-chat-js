import type { Unsubscribe } from '../store';

/**
 * A batch of entity-store changes delivered to a subscriber in a single notification.
 *
 * `changedIds` are the ids the subscriber watches whose canonical object changed reference this
 * flush (an upsert, or a removal — a removal makes `store.get(id)` return `undefined`).
 */
export type EntityStoreChangeBatch = {
  changedIds: ReadonlySet<string>;
};

/**
 * Anything that observes entities held in an {@link EntityStore}.
 *
 * A subscriber watches a *set* of entity ids (a paginator watches all ids in its
 * intervals; a thread watches its single parent id). It is notified at most once
 * per store transaction with the subset of its watched ids that changed.
 */
export type EntityStoreSubscriber = {
  onEntitiesChanged: (batch: EntityStoreChangeBatch) => void;
  /**
   * Optional: emit any throttled/pending state notification immediately. Called by
   * {@link EntityStore.flushSubscribers} after an optimistic (local-user) write so the change
   * renders without throttle delay. A paginator implements this by flushing its throttled window
   * publish.
   */
  flushState?: () => void;
};

export type EntityStoreOptions<T> = {
  /** Extracts the canonical id an entity is stored and addressed under. */
  getId: (entity: T) => string;
};

/**
 * A client-global, normalized store for domain entities addressed by id.
 *
 * The store holds exactly **one** canonical `T` per id and lets any number of entities
 * (paginators, threads, ad-hoc consumers) subscribe to individual ids. Every mutation of a
 * stored entity becomes a single `upsert`, and the store fans the change out to exactly the
 * subscribers holding that id — replacing the manual copy-to-copy fan-out that keeping N
 * per-consumer copies in sync required.
 *
 * The store is entity-agnostic: it learns how to extract an id from a `T` via the `getId`
 * function passed to its constructor. The client holds one as `client.messageStore`, an
 * `EntityStore<LocalMessage>`, for message content.
 *
 * ## Design
 *
 * - **Content:** `byId` (`Map<id, T>`) is the single source of truth. Objects are immutable
 *   snapshots: `upsert` *replaces*, never mutates in place, so the reference-equality
 *   short-circuit (mirroring {@link StateStore.next}) and every downstream selector keep working.
 * - **Subscription registry / refcount:** `subscribers` (`Map<id, Set<subscriber>>`) is both the
 *   per-id notification list and the reference count — when the last subscriber of an id unlinks,
 *   the canonical copy is garbage-collected.
 * - **Batching:** `transaction` coalesces a bulk write (e.g. a page of N entities) so each affected
 *   subscriber is notified **once** with the full changed-id set, instead of N times.
 * - **Signal-then-pull:** subscribers receive the set of changed ids and pull the new content via
 *   `get`; the store never pushes objects.
 *
 * This is deliberately a hand-rolled per-id registry rather than a {@link StateStore}: a single
 * `StateStore` would run every subscriber's selector on every change (O(all subscribers) per emit),
 * and a store-per-entity would allocate a full `StateStore` per id with no cross-id batching. The
 * `Map<id, Set>` gives O(subscribers-of-changed-id) fan-out — the same idiom as `PollManager`'s
 * cache.
 *
 * @template T The domain entity type held by the store.
 */
export class EntityStore<T> {
  private byId = new Map<string, T>();
  private subscribers = new Map<string, Set<EntityStoreSubscriber>>();
  private readonly getId: (entity: T) => string;

  private transactionDepth = 0;
  private pendingChanged = new Map<EntityStoreSubscriber, Set<string>>();

  constructor({ getId }: EntityStoreOptions<T>) {
    this.getId = getId;
  }

  // ---- reads ----

  get(id: string | undefined): T | undefined {
    return typeof id === 'string' ? this.byId.get(id) : undefined;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  // ---- writes ----

  /**
   * Replaces the canonical copy of `entity` and notifies every subscriber watching its id —
   * except `origin`, which is expected to re-render itself (the paginator that performed the
   * write already emits its own window inline, so it must not be notified a second time through
   * the subscription).
   */
  upsert(entity: T, origin?: EntityStoreSubscriber): void {
    const id = this.getId(entity);
    const previous = this.byId.get(id);
    // do not notify if the value hasn't changed (mirrors StateStore.next)
    if (previous === entity) return;
    this.byId.set(id, entity);
    this.markDirty(id, origin);
    this.autoFlush();
  }

  // ---- subscription registry / refcount ----

  /** Registers `subscriber` as a holder of `id` (notification target + refcount). */
  link(id: string, subscriber: EntityStoreSubscriber): void {
    let holders = this.subscribers.get(id);
    if (!holders) {
      holders = new Set();
      this.subscribers.set(id, holders);
    }
    holders.add(subscriber);
  }

  /** Drops `subscriber` as a holder of `id`; GCs the canonical copy when none remain. */
  unlink(id: string, subscriber: EntityStoreSubscriber): void {
    const holders = this.subscribers.get(id);
    if (!holders) return;
    holders.delete(subscriber);
    if (holders.size === 0) {
      this.subscribers.delete(id);
      // refcount GC: nobody holds this entity any longer.
      this.byId.delete(id);
    }
  }

  /**
   * Sugar for atomic / ad-hoc consumers that watch a single id (e.g. a thread watching its parent
   * message). Fires `handler` immediately with the current value (mirroring
   * {@link StateStore.subscribe}) and on every subsequent change.
   */
  subscribe(id: string, handler: (entity: T | undefined) => void): Unsubscribe {
    const subscriber: EntityStoreSubscriber = {
      onEntitiesChanged: () => handler(this.byId.get(id)),
    };
    this.link(id, subscriber);
    handler(this.byId.get(id));
    return () => this.unlink(id, subscriber);
  }

  // ---- batching ----

  /**
   * Runs `fn`, coalescing all notifications produced by writes inside it into a single flush on
   * exit. Re-entrant: nested transactions flush only when the outermost exits.
   */
  transaction<R>(fn: () => R): R {
    this.transactionDepth += 1;
    try {
      return fn();
    } finally {
      this.transactionDepth -= 1;
      if (this.transactionDepth === 0) this.flush();
    }
  }

  /**
   * Immediately flushes any throttled/pending state publish on the holders of `id` (via
   * {@link EntityStoreSubscriber.flushState}). Called after an optimistic (local-user) write to
   * `id` so it renders without the throttle delay. Only that id's own holders are flushed — the
   * write touched no other id — and flushing a holder with nothing pending is a no-op.
   */
  flushSubscribers(id: string): void {
    const holders = this.subscribers.get(id);
    if (!holders) return;
    for (const holder of holders) holder.flushState?.();
  }

  private markDirty(id: string, origin?: EntityStoreSubscriber): void {
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
    }
  }

  private autoFlush(): void {
    if (this.transactionDepth === 0) this.flush();
  }

  private flush(): void {
    if (this.pendingChanged.size === 0) return;
    // swap out the pending map before notifying so writes made from within a
    // subscriber accumulate into the next flush rather than mutating this one.
    const changedBySubscriber = this.pendingChanged;
    this.pendingChanged = new Map();
    for (const [subscriber, changedIds] of changedBySubscriber) {
      subscriber.onEntitiesChanged({ changedIds });
    }
  }
}
