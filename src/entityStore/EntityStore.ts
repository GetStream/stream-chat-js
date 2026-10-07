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
 * Anything that observes entities held in an {@link EntityStore}, linked to them by id
 * ({@link EntityStore.link}).
 *
 * A subscriber watches a *set* of entity ids (a paginator watches all ids in its
 * intervals; a thread watches its single parent id). It is notified at most once
 * per store transaction with the subset of its watched ids that changed. While linked, it also
 * holds those entities; see {@link EntityStoreClaim} for holding without being notified.
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
  /**
   * Optional: called when the store removes an entity this subscriber holds, through
   * {@link EntityStore.remove} or {@link EntityStore.clear}, with the removed entity. Called after
   * its holders are dropped but while the entity can still be read, so a list can locate the item
   * and drop it on its side, and its unlink changes nothing. Not called when the last holder
   * unlinks: nobody holds the entity then.
   */
  onEntityRemoved?: (id: string, entity: unknown) => void;
  /**
   * Optional: what this subscriber is, for debugging tools that list who holds an entity. A
   * kebab-case identifier with no spaces, e.g. `channel-paginator`.
   */
  name?: string;
};

/**
 * A standing claim on entities in an {@link EntityStore}, added once with
 * {@link EntityStore.addClaim}. Unlike a subscriber it isn't linked per id and gets no
 * notifications: the store asks {@link EntityStoreClaim.heldBy} whenever it needs to know what is
 * held, so the claim never reports a change.
 */
export type EntityStoreClaim<T> = {
  /** The entities held by this claim right now. Matched by identity against the stored ones. */
  heldBy: () => Iterable<T>;
  /**
   * Optional: what makes the claim, for debugging tools that list who holds an entity. A kebab-case
   * identifier with no spaces, e.g. `message-composer-cache`.
   */
  name?: string;
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
  /**
   * Whether an entry is removed when its last holder unlinks (the default). A store that decides
   * on its own when to remove entries sets it to `false`; holders then only receive notifications,
   * and entries leave through {@link EntityStore.remove} or {@link EntityStore.clear}.
   */
  releaseOnLastUnlink?: boolean;
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
/**
 * Runs callbacks so one that throws doesn't stop the ones after it, and rethrows the first error once
 * they all ran.
 */
class RunnerWithErrorCollector {
  private first: { error: unknown } | undefined;

  run(callback: () => void) {
    try {
      callback();
    } catch (error) {
      this.first ??= { error };
    }
  }

  rethrowFirst() {
    if (this.first) throw this.first.error;
  }
}

export class EntityStore<T> {
  private byId = new Map<string, T>();
  private subscribers = new Map<string, Set<EntityStoreSubscriber>>();
  private readonly claims = new Set<EntityStoreClaim<T>>();
  private readonly getEntityId: (entity: T) => string;
  private readonly onRelease?: (entity: T) => void;
  private readonly releaseOnLastUnlink: boolean;

  private transactionDepth = 0;
  private pendingChanged = new Map<EntityStoreSubscriber, Set<string>>();
  /** Ids whose {@link EntityStore.flushSubscribers} was requested while a transaction was open. */
  private pendingFlushIds?: Set<string>;

  constructor({
    getEntityId,
    onRelease,
    releaseOnLastUnlink = true,
  }: EntityStoreOptions<T>) {
    this.getEntityId = getEntityId;
    this.onRelease = onRelease;
    this.releaseOnLastUnlink = releaseOnLastUnlink;
  }

  // ---- reads ----

  get(id: string | undefined): T | undefined {
    return typeof id === 'string' ? this.byId.get(id) : undefined;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  /** Whether `subscriber` is one of the holders of `id`. */
  isHeldBy(id: string, subscriber: EntityStoreSubscriber): boolean {
    return this.subscribers.get(id)?.has(subscriber) ?? false;
  }

  /** Whether a subscriber linked to `id`, or a claim listing its entity, holds it. */
  isHeld(id: string): boolean {
    if (this.subscribers.has(id)) return true;
    const entity = this.byId.get(id);
    return entity !== undefined && this.claimsByEntity().has(entity);
  }

  /**
   * The names of what holds `id`: the subscribers linked to it and the claims listing its entity;
   * unnamed ones are left out. For debugging tools.
   */
  holderNames(id: string): string[] {
    const names: string[] = [];
    for (const subscriber of this.subscribers.get(id) ?? []) {
      if (subscriber.name) names.push(subscriber.name);
    }
    const entity = this.byId.get(id);
    const claims = entity === undefined ? [] : (this.claimsByEntity().get(entity) ?? []);
    for (const claim of claims) {
      if (claim.name) names.push(claim.name);
    }
    return names;
  }

  /**
   * Every stored entity that neither a linked subscriber nor a claim holds, with the id it is stored
   * under. Each claim is asked once for the whole list.
   */
  unheldEntries(): [string, T][] {
    const claimed = this.claimsByEntity();
    return this.entries().filter(
      ([id, entity]) => !this.subscribers.has(id) && !claimed.has(entity),
    );
  }

  /**
   * Adds `claim`, which holds the entities its {@link EntityStoreClaim.heldBy} lists, until the
   * returned function removes it. Entities are matched by identity, so one stored under an id other
   * than its own (a temporary id) is still found.
   */
  addClaim(claim: EntityStoreClaim<T>): () => void {
    this.claims.add(claim);
    return () => {
      this.claims.delete(claim);
    };
  }

  /**
   * Each entity the claims list, with the claims listing it, each once: a claim may list an entity
   * several times, e.g. the threads claim lists a channel once per thread.
   */
  private claimsByEntity() {
    const claimed = new Map<T, EntityStoreClaim<T>[]>();
    for (const claim of this.claims) {
      for (const entity of claim.heldBy()) {
        const claims = claimed.get(entity);
        if (!claims) claimed.set(entity, [claim]);
        else if (!claims.includes(claim)) claims.push(claim);
      }
    }
    return claimed;
  }

  /** Every entity currently in the store. */
  values(): T[] {
    return Array.from(this.byId.values());
  }

  /** Every stored entity with the id it is stored under, which can differ from its own id. */
  entries(): [string, T][] {
    return Array.from(this.byId.entries());
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
   * Returns `false` without changes when `oldId` is not stored or the ids are equal.
   *
   * When `newId` holds another entity, nothing changes unless `replace` is set (merging is the
   * caller's decision). With `replace`, the moved entity takes that entity's place: the holders of
   * `newId` stay linked and now hold the moved one, and the replaced entity is passed to
   * `onRelease`. Its holders are not told it was removed, so a list can swap the item in place.
   *
   * @example
   * // A channel created from members has no id until the server creates it, so it is stored under a
   * // temporary cid built from its member ids.
   * store.getOrCreate('messaging:!members-ann,bob', () => channel);
   * // `channel.watch()` returns the cid the server assigned; the entry moves there, holders included.
   * store.changeId('messaging:!members-ann,bob', 'messaging:!members-kL9pQ2vX7wZ');
   */
  changeId(
    oldId: string,
    newId: string,
    { replace = false }: { replace?: boolean } = {},
  ): boolean {
    if (oldId === newId || !this.byId.has(oldId)) return false;
    const replaced = this.byId.get(newId);
    if (replaced !== undefined && !replace) return false;

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
    if (replaced !== undefined) this.onRelease?.(replaced);
    return true;
  }

  /**
   * Stores `entity` in place of another entity stored under the same id. The holders of that id stay
   * linked and now hold `entity`; they are notified of a change, not told of a removal, so a list
   * can swap the item in place. The replaced entity is passed to `onRelease`. Storing an entity
   * under an id nothing holds yet stores it, as {@link EntityStore.upsert} does.
   */
  replace(entity: T): void {
    const id = this.getEntityId(entity);
    const replaced = this.byId.get(id);
    if (replaced === entity) return;
    this.byId.set(id, entity);
    this.markDirty(id);
    this.autoFlush();
    if (replaced !== undefined) this.onRelease?.(replaced);
  }

  /**
   * Removes the entry stored under `id` whatever holds it, drops its holders and calls `onRelease`
   * with the entity. Each holder gets {@link EntityStoreSubscriber.onEntityRemoved}, and is notified
   * that `id` changed (it now resolves to `undefined`). Removing an ID that isn't stored does nothing.
   *
   * A holder or `onRelease` that throws doesn't stop the removal: every holder is told, the entry is
   * deleted and released, and then the first error is rethrown.
   */
  remove(id: string): void {
    this.dropEntry(id, { release: true });
  }

  /**
   * Like {@link EntityStore.remove}, except the entity is not passed to `onRelease`: it left this
   * entry but is still in use elsewhere, so whoever detaches it decides when it is released.
   * Detaching an ID that isn't stored does nothing.
   */
  detach(id: string): void {
    this.dropEntry(id, { release: false });
  }

  private dropEntry(id: string, { release }: { release: boolean }) {
    if (!this.byId.has(id)) return;
    const entity = this.byId.get(id) as T;
    const holders = this.subscribers.get(id);
    this.markDirty(id);
    this.subscribers.delete(id);
    this.pendingFlushIds?.delete(id);
    const runner = new RunnerWithErrorCollector();
    if (holders) {
      for (const holder of holders)
        runner.run(() => holder.onEntityRemoved?.(id, entity));
    }
    this.byId.delete(id);
    if (release) runner.run(() => this.onRelease?.(entity));
    this.autoFlush();
    runner.rethrowFirst();
  }

  /**
   * Removes every entry and holder. Each holder gets {@link EntityStoreSubscriber.onEntityRemoved}
   * for every entity it held, then `onRelease` is called for each removed entity. Calling it on an
   * empty store does nothing.
   *
   * A holder or `onRelease` that throws doesn't stop the clear: every holder is told, the store is
   * emptied and every entity released, and then the first error is rethrown.
   */
  clear(): void {
    const holdersById = this.subscribers;
    this.subscribers = new Map();
    this.pendingChanged.clear();
    this.pendingFlushIds = undefined;
    const runner = new RunnerWithErrorCollector();
    // holders are dropped first, so a list removing the item on its side unlinks nothing
    for (const [id, holders] of holdersById) {
      const entity = this.byId.get(id);
      if (entity === undefined) continue;
      for (const holder of holders)
        runner.run(() => holder.onEntityRemoved?.(id, entity));
    }
    const released = [...this.byId.values()];
    this.byId = new Map();
    // released after the store is emptied, so an onRelease reading the store sees the final state
    const { onRelease } = this;
    if (onRelease) for (const entity of released) runner.run(() => onRelease(entity));
    runner.rethrowFirst();
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
   * `onRelease`, unless the store keeps unheld entries (`releaseOnLastUnlink: false`). Unlinking a
   * subscriber that is not linked does nothing.
   */
  unlink(id: string, subscriber: EntityStoreSubscriber): void {
    const subscribers = this.subscribers.get(id);
    if (!subscribers?.delete(subscriber)) return;
    if (subscribers.size === 0) {
      this.subscribers.delete(id);
      if (!this.releaseOnLastUnlink) return;
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
