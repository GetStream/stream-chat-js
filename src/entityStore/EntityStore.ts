import type { Unsubscribe } from '@stream-io/state-store';

/**
 * The ids a subscriber watches whose canonical object changed reference in this flush (an upsert or
 * a removal; after a removal `store.get(id)` returns `undefined`).
 */
export type EntityStoreChangeBatch = {
  changedIds: ReadonlySet<string>;
};

/**
 * Observes entities in an {@link EntityStore}, linked to them by id ({@link EntityStore.link}). It
 * is notified at most once per store transaction with the subset of its watched ids that changed,
 * and while linked it holds those entities (see {@link EntityStoreClaim} to hold without being
 * notified).
 */
export type EntityStoreSubscriber = {
  onEntitiesChanged: (batch: EntityStoreChangeBatch) => void;
  /**
   * Emits any throttled pending state immediately. Called by {@link EntityStore.flushSubscribers}
   * after an optimistic (local-user) write.
   */
  flushState?: () => void;
  /**
   * Called by {@link EntityStore.changeId} when this subscriber's link moves from `oldId` to
   * `newId`, before the change notification. A subscriber keeping its own list of linked ids renames
   * the entry here, or its later `unlink(oldId)` misses the moved link.
   */
  onIdChanged?: (oldId: string, newId: string) => void;
  /**
   * Called when the store removes an entity this subscriber holds ({@link EntityStore.remove},
   * {@link EntityStore.clear}), after its holders are dropped but while the entity can still be
   * read. Not called when the last holder unlinks.
   */
  onEntityRemoved?: (id: string, entity: unknown) => void;
  /** What this subscriber is, for debugging tools: a kebab-case id, e.g. `channel-paginator`. */
  name?: string;
};

/**
 * A standing claim on entities, added with {@link EntityStore.addClaim}. Unlike a subscriber it is
 * not linked per id and never notified: the store asks {@link EntityStoreClaim.heldBy} whenever it
 * needs to know what is held.
 */
export type EntityStoreClaim<T> = {
  /** The entities held by this claim right now, matched by identity against the stored ones. */
  heldBy: () => Iterable<T>;
  /** What makes the claim, for debugging tools: a kebab-case id, e.g. `message-composer-cache`. */
  name?: string;
};

export type EntityStoreOptions<T> = {
  getEntityId: (entity: T) => string;
  /**
   * Called with an entity removed because its last holder unlinked or {@link EntityStore.clear} ran.
   * A store of class instances uses it to tear them down (listeners, timers).
   */
  onRelease?: (entity: T) => void;
  /**
   * Whether an entry is removed when its last holder unlinks (the default). Set `false` when the
   * store decides itself: entries then leave through {@link EntityStore.remove} or
   * {@link EntityStore.clear}, and holders only receive notifications.
   */
  releaseOnLastUnlink?: boolean;
};

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

/**
 * A client-global, normalized store of entities addressed by id: one canonical, immutable `T` per id
 * (`upsert` replaces, never mutates), shared by any number of subscribers linked to individual ids.
 * A write notifies exactly the subscribers holding that id, with the changed ids only (they pull
 * content via `get`). Links are also the refcount: by default an entity is dropped when its last
 * holder unlinks. {@link EntityStore.transaction} coalesces notifications into one flush.
 *
 * @template T The domain entity type held by the store.
 */
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

  get(id: string | undefined): T | undefined {
    return typeof id === 'string' ? this.byId.get(id) : undefined;
  }

  has(id: string): boolean {
    return this.byId.has(id);
  }

  isHeldBy(id: string, subscriber: EntityStoreSubscriber): boolean {
    return this.subscribers.get(id)?.has(subscriber) ?? false;
  }

  /** Whether a subscriber linked to `id`, or a claim listing its entity, holds it. */
  isHeld(id: string): boolean {
    if (this.subscribers.has(id)) return true;
    const entity = this.byId.get(id);
    return entity !== undefined && this.claimsByEntity().has(entity);
  }

  /** The names of the subscribers linked to `id` and claims listing its entity, for debugging. */
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
   * Adds `claim` until the returned function removes it. Entities are matched by identity, so one
   * stored under an id other than its own (a temporary id) is still found.
   */
  addClaim(claim: EntityStoreClaim<T>): () => void {
    this.claims.add(claim);
    return () => {
      this.claims.delete(claim);
    };
  }

  /** Maps each claimed entity to the claims listing it, each once (a claim may repeat an entity). */
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

  values(): T[] {
    return Array.from(this.byId.values());
  }

  /** Every stored entity with the id it is stored under, which can differ from its own id. */
  entries(): [string, T][] {
    return Array.from(this.byId.entries());
  }

  /**
   * Replaces the canonical copy of `entity` and notifies the subscribers watching its id, except
   * `subscriber`: the writer, which updates itself.
   */
  upsert(entity: T, subscriber?: EntityStoreSubscriber): void {
    const id = this.getEntityId(entity);
    const previous = this.byId.get(id);
    // No-op on an unchanged reference, like `StateStore.next`.
    if (previous === entity) return;
    this.byId.set(id, entity);
    this.markDirty(id, subscriber);
    this.autoFlush();
  }

  /**
   * Returns the entity stored under `id` (after passing it to `hydrate`), or stores and returns
   * `create()`. A stored entity is never replaced, so every caller gets the same instance and fresh
   * data goes in through `hydrate`. Storing a new entity notifies the subscribers already linked to
   * `id`; hydrating does not, since the reference is unchanged.
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
   * When `newId` holds another entity, nothing changes unless `replace` is set. With `replace`, the
   * moved entity takes its place: the holders of `newId` stay linked and hold the moved one, and
   * the replaced entity goes to `onRelease`. Its holders are not told it was removed, so a list can
   * swap the item in place.
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
      // Holders of `oldId` learn it resolves to `undefined`.
      this.markDirty(oldId);
      this.subscribers.delete(oldId);
      // Subscribers may link an id before an entity is stored under it.
      const existing = this.subscribers.get(newId);
      if (existing) for (const subscriber of moved) existing.add(subscriber);
      else this.subscribers.set(newId, moved);
    }
    this.markDirty(newId);

    if (this.pendingFlushIds?.delete(oldId)) this.pendingFlushIds.add(newId);
    // Re-keyed before `autoFlush`, so a holder handling the notification already reads `newId`.
    if (moved) for (const subscriber of moved) subscriber.onIdChanged?.(oldId, newId);
    this.autoFlush();
    if (replaced !== undefined) this.onRelease?.(replaced);
    return true;
  }

  /**
   * Stores `entity` in place of another stored under the same id. The holders of that id stay linked
   * and hold `entity`; they are notified of a change, not a removal, so a list can swap the item
   * in place. The replaced entity goes to `onRelease`. With nothing under the id it stores like
   * {@link EntityStore.upsert}.
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
   * Removes the entry stored under `id` whatever holds it, drops its holders and calls `onRelease`.
   * Each holder gets {@link EntityStoreSubscriber.onEntityRemoved} and a change notification for
   * `id`. Does nothing when `id` is not stored. A throwing holder or `onRelease` does not stop the
   * removal: the first error is rethrown at the end.
   */
  remove(id: string): void {
    this.dropEntry(id, { release: true });
  }

  /**
   * Like {@link EntityStore.remove}, but the entity is not passed to `onRelease`: it is still in use
   * elsewhere, so whoever detaches it decides when it is released.
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
   * for every entity it held, then `onRelease` is called for each removed entity. A throwing holder
   * or `onRelease` does not stop the clear: the first error is rethrown at the end.
   */
  clear(): void {
    const holdersById = this.subscribers;
    this.subscribers = new Map();
    this.pendingChanged.clear();
    this.pendingFlushIds = undefined;
    const runner = new RunnerWithErrorCollector();
    // Holders are dropped first, so a list removing the item on its side unlinks nothing.
    for (const [id, holders] of holdersById) {
      const entity = this.byId.get(id);
      if (entity === undefined) continue;
      for (const holder of holders)
        runner.run(() => holder.onEntityRemoved?.(id, entity));
    }
    const released = [...this.byId.values()];
    this.byId = new Map();
    // Released after the store is emptied, so an `onRelease` reading the store sees the final state.
    const { onRelease } = this;
    if (onRelease) for (const entity of released) runner.run(() => onRelease(entity));
    runner.rethrowFirst();
  }

  /** Registers `subscriber` as a holder of `id` (notification target and refcount). */
  link(id: string, subscriber: EntityStoreSubscriber): void {
    let subscribers = this.subscribers.get(id);
    if (!subscribers) {
      subscribers = new Set();
      this.subscribers.set(id, subscribers);
    }
    subscribers.add(subscriber);
  }

  /**
   * Drops `subscriber` from `id`. When none remain, the canonical copy is dropped and passed to
   * `onRelease`, unless `releaseOnLastUnlink` is `false`. Does nothing if it is not linked.
   */
  unlink(id: string, subscriber: EntityStoreSubscriber): void {
    const subscribers = this.subscribers.get(id);
    if (!subscribers?.delete(subscriber)) return;
    if (subscribers.size === 0) {
      this.subscribers.delete(id);
      if (!this.releaseOnLastUnlink) return;
      const released = this.byId.get(id);
      const wasStored = this.byId.delete(id);
      if (wasStored) this.onRelease?.(released as T);
    }
  }

  /**
   * Watches a single id. Fires `handler` immediately with the current value (like
   * {@link StateStore.subscribe}) and on every change.
   */
  subscribe(id: string, handler: (entity: T | undefined) => void): Unsubscribe {
    const subscriber: EntityStoreSubscriber = {
      onEntitiesChanged: () => handler(this.byId.get(id)),
    };
    this.link(id, subscriber);
    handler(this.byId.get(id));
    return () => this.unlink(id, subscriber);
  }

  /**
   * Runs `fn`, coalescing the notifications of writes inside it into a single flush on exit. Nested
   * transactions flush only when the outermost exits.
   */
  transaction<R>(fn: () => R): R {
    this.transactionDepth += 1;
    try {
      return fn();
    } finally {
      this.transactionDepth -= 1;
      if (this.transactionDepth === 0) {
        this.flush();
        // Drained after `flush()`: `flushState` only emits what a subscriber already has pending.
        const ids = this.pendingFlushIds;
        this.pendingFlushIds = undefined;
        if (ids) for (const id of ids) this.flushSubscribersNow(id);
      }
    }
  }

  /**
   * Immediately flushes any throttled state publish ({@link EntityStoreSubscriber.flushState}) on
   * the subscribers of `id`, so an optimistic (local-user) write renders without the throttle delay.
   * Inside a transaction it is deferred to the outermost exit, since inline it would be a no-op
   * (nobody has been notified yet).
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

  /** Records `id` as changed for every subscriber watching it, except the writer `subscriber`. */
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
    // Swapped out first, so writes made by a subscriber accumulate into the next flush.
    const changedBySubscriber = this.pendingChanged;
    this.pendingChanged = new Map();
    for (const [subscriber, changedIds] of changedBySubscriber) {
      subscriber.onEntitiesChanged({ changedIds });
    }
  }
}
