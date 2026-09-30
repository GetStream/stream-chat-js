import type { Unsubscribe } from '@stream-io/state-store';

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
  /**
   * Optional: called by {@link EntityStore.changeId} when this subscriber's link moves from `oldId`
   * to `newId`, before the change notification. A subscriber that keeps its own list of linked ids
   * implements it to rename the entry; otherwise its later `unlink(oldId)` would miss the moved link
   * and the entity would never be released.
   */
  onIdChanged?: (oldId: string, newId: string) => void;
};

export type EntityStoreOptions<T> = {
  /** Extracts the canonical id an entity is stored and addressed under. */
  getEntityId: (entity: T) => string;
  /**
   * Called with an entity after its entry is removed because its last holder unlinked, or because
   * {@link EntityStore.clear} ran. A store of class instances uses it to tear the instance down
   * (unsubscribe listeners, stop timers). Optional.
   */
  onRelease?: (entity: T) => void;
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
 * The store is entity-agnostic: it learns how to extract an id from a `T` via the `getEntityId`
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
  private readonly getEntityId: (entity: T) => string;
  private readonly onRelease?: (entity: T) => void;

  private transactionDepth = 0;
  private pendingChanged = new Map<EntityStoreSubscriber, Set<string>>();
  /** Ids whose {@link EntityStore.flushSubscribers} was requested while a transaction was open. */
  private pendingFlushIds?: Set<string>;

  constructor({ getEntityId, onRelease }: EntityStoreOptions<T>) {
    this.getEntityId = getEntityId;
    this.onRelease = onRelease;
  }

  // ---- reads ----

  get(id: string | undefined): T | undefined {
    return typeof id === 'string' ? this.byId.get(id) : undefined;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  /** Every stored entity, in insertion order. */
  values(): T[] {
    return [...this.byId.values()];
  }

  // ---- writes ----

  /**
   * Replaces the canonical copy of `entity` and notifies every subscriber watching its id —
   * except `subscriber`, the one that performed the write, which is expected to re-render itself
   * (the paginator that performed the write already emits its own window inline, so it must not be
   * notified a second time through the subscription).
   */
  upsert(entity: T, subscriber?: EntityStoreSubscriber): void {
    const id = this.getEntityId(entity);
    const previous = this.byId.get(id);
    // do not notify if the value hasn't changed (mirrors StateStore.next)
    if (previous === entity) return;
    this.byId.set(id, entity);
    this.markDirty(id, subscriber);
    this.autoFlush();
  }

  /**
   * Returns the entity stored under `id`, passing it to `hydrate` first, or stores and returns the
   * result of `create` when `id` is not stored. A stored entity is never replaced, which is what a
   * store of class instances needs: every caller asking for `id` gets the same instance, and fresh
   * data is applied to it through `hydrate`.
   *
   * Storing a new entity notifies the subscribers already linked to `id`. Hydrating does not — the
   * stored reference is unchanged, and the entity publishes its own state changes.
   */
  getOrCreate(id: string, create: () => T, hydrate?: (stored: T) => void): T {
    if (this.byId.has(id)) {
      const stored = this.byId.get(id) as T;
      hydrate?.(stored);
      return stored;
    }
    const entity = create();
    this.byId.set(id, entity);
    this.markDirty(id);
    this.autoFlush();
    return entity;
  }

  /**
   * Moves an entity and its holders from `oldId` to `newId`, for ids assigned after storing. Moved
   * holders get {@link EntityStoreSubscriber.onIdChanged}, then holders of both ids are notified.
   * Returns `false` without changes when `oldId` is not stored, the ids are equal, or `newId` holds
   * another entity (merging is the caller's decision).
   *
   * @example
   * // a channel created from members is stored under a temporary cid until the server assigns one
   * store.getOrCreate('messaging:!members-ann,bob', () => channel);
   * store.changeId('messaging:!members-ann,bob', 'messaging:e3b0c442'); // after `channel.watch()`
   */
  changeId(oldId: string, newId: string): boolean {
    if (oldId === newId || !this.byId.has(oldId) || this.byId.has(newId)) return false;

    const entity = this.byId.get(oldId) as T;
    this.byId.delete(oldId);
    this.byId.set(newId, entity);

    const moved = this.subscribers.get(oldId);
    if (moved) {
      // holders of oldId learn that it now resolves to undefined
      this.markDirty(oldId);
      this.subscribers.delete(oldId);
      // subscribers may link an id before an entity is stored under it
      const existing = this.subscribers.get(newId);
      if (existing) for (const subscriber of moved) existing.add(subscriber);
      else this.subscribers.set(newId, moved);
    }
    this.markDirty(newId);

    if (this.pendingFlushIds?.delete(oldId)) this.pendingFlushIds.add(newId);
    // re-keyed before autoFlush, so a holder handling the notification already reads newId
    if (moved) for (const subscriber of moved) subscriber.onIdChanged?.(oldId, newId);
    this.autoFlush();
    return true;
  }

  /**
   * Removes the entry stored under `id` whatever holds it, drops its holders and calls `onRelease`
   * with the entity. Holders are notified that `id` changed (it now resolves to `undefined`).
   * Removing an ID that isn't stored does nothing.
   */
  remove(id: string): void {
    if (!this.byId.has(id)) return;
    const entity = this.byId.get(id) as T;
    this.byId.delete(id);
    this.markDirty(id);
    this.subscribers.delete(id);
    this.pendingFlushIds?.delete(id);
    this.onRelease?.(entity);
    this.autoFlush();
  }

  /**
   * Removes every entry and holder, then calls `onRelease` for each removed entity. Holders are
   * not notified: they are dropped with the entries. Calling it on an empty store does nothing.
   */
  clear(): void {
    const released = [...this.byId.values()];
    this.byId.clear();
    this.subscribers.clear();
    this.pendingChanged.clear();
    this.pendingFlushIds = undefined;
    // released after the store is emptied, so an onRelease reading the store sees the final state
    if (this.onRelease) for (const entity of released) this.onRelease(entity);
  }

  // ---- subscription registry / refcount ----

  /** Registers `subscriber` for `id` (notification target + refcount). */
  link(id: string, subscriber: EntityStoreSubscriber): void {
    let subscribers = this.subscribers.get(id);
    if (!subscribers) {
      subscribers = new Set();
      this.subscribers.set(id, subscribers);
    }
    subscribers.add(subscriber);
  }

  /**
   * Drops `subscriber` from `id`; GCs the canonical copy when none remain and passes it to
   * `onRelease`. Unlinking a subscriber that is not linked does nothing.
   */
  unlink(id: string, subscriber: EntityStoreSubscriber): void {
    const subscribers = this.subscribers.get(id);
    if (!subscribers?.delete(subscriber)) return;
    if (subscribers.size === 0) {
      this.subscribers.delete(id);
      // refcount GC: nobody holds this entity any longer.
      const released = this.byId.get(id);
      const wasStored = this.byId.delete(id);
      if (wasStored) this.onRelease?.(released as T);
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
      if (this.transactionDepth === 0) {
        this.flush();
        // drained after flush(), because flushState only emits what a subscriber already
        // has pending and markDirty accumulates until flush() hands it over.
        const ids = this.pendingFlushIds;
        this.pendingFlushIds = undefined;
        if (ids) for (const id of ids) this.flushSubscribersNow(id);
      }
    }
  }

  /**
   * Immediately flushes any throttled/pending state publish on the subscribers of `id` (via
   * {@link EntityStoreSubscriber.flushState}). Called after an optimistic (local-user) write to
   * `id` so it renders without the throttle delay. Only that id's own subscribers are flushed — the
   * write touched no other id — and flushing a subscriber with nothing pending is a no-op.
   *
   * Inside a transaction it is deferred to the outermost exit — inline there it would be a no-op,
   * since `markDirty` has not notified anyone yet. Getting this wrong costs the siblings (pinned
   * list, open thread) up to 500ms on an optimistic write, while the writer updates inline.
   */
  flushSubscribers(id: string): void {
    if (this.transactionDepth > 0) {
      (this.pendingFlushIds ??= new Set()).add(id);
      return;
    }
    this.flushSubscribersNow(id);
  }

  private flushSubscribersNow(id: string): void {
    const subscribers = this.subscribers.get(id);
    if (!subscribers) return;
    for (const subscriber of subscribers) subscriber.flushState?.();
  }

  /**
   * Records `id` as changed for every subscriber watching it, except `subscriber` — the one that
   * wrote it and is responsible for updating itself (see {@link EntityStore.upsert}).
   */
  private markDirty(id: string, subscriber?: EntityStoreSubscriber): void {
    const subscribers = this.subscribers.get(id);
    if (!subscribers) return;
    for (const other of subscribers) {
      if (other === subscriber) continue;
      let changed = this.pendingChanged.get(other);
      if (!changed) {
        changed = new Set();
        this.pendingChanged.set(other, changed);
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
