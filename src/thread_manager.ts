import { chatLoggerSystem } from './logger';
import { deepFreezeConfig } from './configuration/utils/deepFreezeConfig';
import { StateStore } from '@stream-io/state-store';
import { ConfigController } from './configuration/ConfigController';
import { throttle } from './utils';
import { EntityStore, type EntityStoreSubscriber } from './entityStore/EntityStore';
import { StoreBackedItemIndex } from './entityStore/StoreBackedItemIndex';
import { ThreadPaginator } from './pagination/paginators/ThreadPaginator';

import type { StreamChat } from './client';
import type { Thread } from './thread';
import type { Event, EventPayload, EventType, OwnUserResponse } from './types';
import { WithSubscriptions } from './utils/WithSubscriptions';

const eventCarriesOwnUser = (
  event: Event,
): event is EventPayload<'health.check'> | EventPayload<'connection.ok'> =>
  Object.hasOwn(event, 'me');

export type ThreadManagerConfig = {
  /**
   * Minimum gap between thread-list reloads triggered by connection recovery (defaults to 1000ms).
   *
   * Read when subscriptions are registered, since the throttle captures the interval in a closure — a
   * change applies from the next `registerSubscriptions()`, not retroactively.
   */
  connectionRecoveryThrottleMs: number;
};

export const DEFAULT_THREAD_MANAGER_CONFIG: ThreadManagerConfig = deepFreezeConfig({
  connectionRecoveryThrottleMs: 1000,
});

/** Manager-level state. The list itself lives on {@link ThreadManager.paginator}. */
export type ThreadManagerState = {
  active: boolean;
  /**
   * Whether the thread manager has been activated at least once in the current
   * session (i.e. `activate()` was called). Used to avoid requerying threads
   * on connection recovery for consumers that never actually activate the manager.
   */
  wasActivatedAtLeastOnce: boolean;
  /** A listed thread got a reply since the latest reload, so the list order may be out of date. */
  isThreadOrderStale: boolean;
  /**
   * The list is loading its first page or being re-queried (`master`'s `pagination.isLoading`). A
   * re-query keeps the list in `paginator.items` until it is replaced, so this is the reload signal.
   */
  isReloading: boolean;
  unreadThreadCount: number;
  /**
   * List of threads that haven't been loaded in the list, but have received new messages
   * since the latest reload. Useful to display a banner prompting to reload the thread list.
   */
  unseenThreadIds: string[];
};

export const THREAD_MANAGER_INITIAL_STATE: ThreadManagerState = {
  active: false,
  isReloading: false,
  isThreadOrderStale: false,
  unreadThreadCount: 0,
  unseenThreadIds: [],
  wasActivatedAtLeastOnce: false,
};

const logger = chatLoggerSystem.getLogger('thread-manager');

const getThreadId = (thread: Thread) => thread.id;
/** Registry holder for list membership. */
const LIST_HOLDER: EntityStoreSubscriber = { onEntitiesChanged: () => undefined };
/** Registry holder for a thread that has been opened (`thread.activate()`). */
const OPENED_HOLDER: EntityStoreSubscriber = { onEntitiesChanged: () => undefined };

export class ThreadManager extends WithSubscriptions {
  public readonly state: StateStore<ThreadManagerState>;
  /** The thread list, in server order. */
  public readonly paginator: ThreadPaginator;
  private client: StreamChat;
  /**
   * Every live thread: the list's plus every thread opened this session. Refcounted by holder, so a
   * thread leaves once neither the list holds it nor it counts as opened.
   */
  private readonly registry = new EntityStore<Thread>({ getEntityId: getThreadId });
  /** Which registered threads the list holds: the paginator's item index. */
  private readonly listIndex = new StoreBackedItemIndex<Thread>({
    getEntityId: getThreadId,
    owner: LIST_HOLDER,
    store: this.registry,
  });
  /** Threads opened this session, kept until their channel is torn down or the user disconnects. */
  private readonly openedThreads = new Map<string, Thread>();

  /** The shared configuration machinery — see {@link ConfigController}. */
  private readonly configController: ConfigController<ThreadManagerConfig>;
  /**
   * Resolved configuration, as a store — the shape every configurable class exposes
   * (`configState` / `config` / `updateConfig`).
   */
  get configState(): StateStore<ThreadManagerConfig> {
    return this.configController.state;
  }

  constructor({ client }: { client: StreamChat }) {
    super();

    this.configController = new ConfigController<ThreadManagerConfig>({
      defaults: DEFAULT_THREAD_MANAGER_CONFIG,
    });
    this.client = client;
    this.state = new StateStore<ThreadManagerState>(THREAD_MANAGER_INITIAL_STATE);
    this.paginator = new ThreadPaginator({
      client,
      paginatorOptions: { itemIndex: this.listIndex },
      resolveThread: this.resolveQueriedThread,
    });
  }

  /** The current resolved configuration. `Readonly` — change it through {@link updateConfig}. */
  public get config(): Readonly<ThreadManagerConfig> {
    return this.configState.getLatestValue();
  }

  /** Merges a partial configuration into the resolved config and notifies subscribers. */
  public updateConfig(config: Partial<ThreadManagerConfig>) {
    this.configController.patch(config);
  }

  /**
   * Rebuilds the resolved configuration from package defaults plus the declarative slice.
   *
   * The derivation entry point every configurable entity exposes, so the owner routes a slice here and
   * knows nothing about ThreadManager's defaults or merge semantics. This logic used to live in the owner,
   * which is how `reset()` became a no-op for the client key (F4) and how a registered
   * `notifications.sortComparator` became unremovable (G8) — an owner writing another object's
   * derivation gets that object's rules wrong sooner or later.
   *
   * Routed through {@link updateConfig} rather than replacing the store, which is exact here because
   * every field of `ThreadManagerConfig` is required and present in the defaults, so a patch naming all of
   * them amounts to a replacement. `NotificationManager` cannot do this — its `sortComparator` is
   * optional with no default, so a patch can never remove one — which is why it replaces outright.
   */
  public initializeConfig(config?: Partial<ThreadManagerConfig>) {
    this.configController.initialize(config);
  }

  /**
   * The live thread for `id`: one in the list, or one opened this session (e.g. from a message
   * list). Resolve threads through this, not `paginator.items`, which is the list only.
   */
  public get = (id: string): Thread | undefined => this.registry.get(id);

  /** Whether the thread list holds `id`. */
  public isListed = (id: string) => this.listIndex.has(id);

  /**
   * Every registered thread — the list's plus the opened ones.
   *
   * @internal
   */
  public get registeredThreads(): Thread[] {
    return this.registry.values();
  }

  /**
   * Called by `thread.activate()`. Registers `thread` for good: it resolves through
   * {@link ThreadManager.get} and stays subscribed whether or not the list holds it, until its
   * channel is torn down or the user disconnects.
   *
   * @internal
   */
  public register = (thread: Thread) => {
    const { id } = thread;
    if (this.openedThreads.get(id) === thread) return;

    const registered = this.registry.get(id);
    if (registered && registered !== thread) {
      logger
        .withExtraTags('register')
        .warn(
          'Another instance of this thread is registered; this one stays unmanaged.',
          {
            threadId: id,
          },
        );
      return;
    }

    this.openedThreads.set(id, thread);
    this.registry.link(id, OPENED_HOLDER);
    this.registry.upsert(thread, OPENED_HOLDER);
    if (this.hasSubscriptions) thread.registerSubscriptions();
  };

  /**
   * Drops the opened threads of a channel being torn down; called by `channel._disconnect()`.
   *
   * @internal
   */
  public forgetChannel = (cid: string) =>
    this.forgetOpenedThreads((thread) => thread.channel.cid === cid);

  private forgetOpenedThreads = (predicate: (thread: Thread) => boolean) => {
    for (const [id, thread] of this.openedThreads) {
      if (!predicate(thread)) continue;
      this.openedThreads.delete(id);
      this.registry.unlink(id, OPENED_HOLDER);
      if (this.hasSubscriptions && this.registry.get(id) !== thread) {
        thread.unregisterSubscriptions();
      }
    }
  };

  /**
   * The live instance for a queried thread: the registered one (rehydrated if stale), else
   * `incoming`. Every thread entering the list passes through here, which is what keeps one instance
   * per id: the index upserts, so a second instance would replace the registered one.
   */
  private resolveQueriedThread = (incoming: Thread) => {
    const existing = this.registry.get(incoming.id);
    if (!existing) return incoming;
    if (existing.hasStaleState) existing.hydrateState(incoming);
    return existing;
  };

  public resetState = () => {
    this.forgetOpenedThreads(() => true);
    this.paginator.resetState();
    this.state.next(THREAD_MANAGER_INITIAL_STATE);
  };

  public activate = () => {
    this.state.partialNext({ active: true, wasActivatedAtLeastOnce: true });
  };

  public deactivate = () => {
    this.state.partialNext({ active: false });
  };

  public registerSubscriptions = () => {
    if (this.hasSubscriptions) return;

    this.addUnsubscribeFunction(this.subscribeUnreadThreadsCountChange());
    this.addUnsubscribeFunction(this.subscribeManageThreadSubscriptions());
    this.addUnsubscribeFunction(this.subscribeReloadOnActivation());
    this.addUnsubscribeFunction(this.subscribeNewReplies());
    this.addUnsubscribeFunction(this.subscribeReloadOnConnectionRecovered());
    this.addUnsubscribeFunction(this.subscribeChannelDeleted());
    // The list's threads are registered by `subscribeManageThreadSubscriptions`; this covers the
    // opened ones it does not hold.
    this.registry.values().forEach((thread) => thread.registerSubscriptions());
  };

  private subscribeUnreadThreadsCountChange = () => {
    // initiate
    const { unread_threads: unreadThreadCount = 0 } =
      (this.client.user as OwnUserResponse) ?? {};
    this.state.partialNext({ unreadThreadCount });

    const unsubscribeFunctions = (
      [
        'health.check',
        'connection.ok',
        'notification.mark_read',
        'notification.mark_unread',
        'notification.thread_message_new',
        'notification.channel_deleted',
      ] as const satisfies EventType[]
    ).map(
      (eventType) =>
        this.client.on(eventType, (event) => {
          const { unread_threads: unreadThreadCount } =
            (eventCarriesOwnUser(event) && event.me) ||
            (event as Extract<typeof event, { unread_threads?: any }>);

          if (typeof unreadThreadCount === 'number') {
            this.state.partialNext({ unreadThreadCount });
          }
        }).unsubscribe,
    );

    return () => unsubscribeFunctions.forEach((unsubscribe) => unsubscribe());
  };

  private subscribeChannelDeleted = () =>
    this.client.on('notification.channel_deleted', (event) => {
      const { cid } = event;
      this.paginator.batch(
        () => {
          for (const thread of this.paginator.items ?? []) {
            if (thread.channel.cid === cid) this.paginator.removeItem({ id: thread.id });
          }
        },
        { coalesce: true },
      );
    }).unsubscribe;

  private subscribeManageThreadSubscriptions = () =>
    this.paginator.state.subscribeWithSelector(
      (nextValue) => ({ threads: nextValue.items ?? [] }),
      ({ threads: nextThreads }, prev) => {
        const { threads: prevThreads = [] } = prev ?? {};
        // Left the list and was never opened. Read off the items rather than the registry, so it does
        // not depend on whether a paginator path publishes before or after updating its index.
        const listed = new Set(nextThreads);
        const removedThreads = prevThreads.filter(
          (thread) => !listed.has(thread) && this.openedThreads.get(thread.id) !== thread,
        );

        nextThreads.forEach((thread) => thread.registerSubscriptions());
        removedThreads.forEach((thread) => thread.unregisterSubscriptions());
      },
    );

  private subscribeReloadOnActivation = () =>
    this.state.subscribeWithSelector(
      (nextValue) => ({ active: nextValue.active }),
      ({ active }) => {
        if (active) this.reload();
      },
    );

  private subscribeNewReplies = () =>
    this.client.on('notification.thread_message_new', (event) => {
      const parentId = event.message?.parent_id;
      if (!parentId) return;

      if (!this.isListLoaded) return;
      const { unseenThreadIds } = this.state.getLatestValue();

      if (this.listIndex.has(parentId)) {
        this.state.partialNext({ isThreadOrderStale: true });
      } else if (!unseenThreadIds.includes(parentId)) {
        this.state.partialNext({ unseenThreadIds: unseenThreadIds.concat(parentId) });
      }
    }).unsubscribe;

  /**
   * Reloads the thread list once recovery after a reconnect has finished.
   *
   * `connection.recovered` on its own is the whole condition, with no drop timestamp to gate on:
   * `ConnectionRecoveryManager` dispatches it on every reconnect path, so it already implies a drop.
   *
   * Anything that does need the drop timestamp should read `client.wsConnection.state.lastUnhealthyAt`,
   * which is written on every status transition.
   */
  private subscribeReloadOnConnectionRecovered = () => {
    const throttledHandleConnectionRecovered = throttle(
      () => {
        if (!this.state.getLatestValue().wasActivatedAtLeastOnce) return;
        this.reload({ force: true });
      },
      this.config.connectionRecoveryThrottleMs,
      { trailing: true },
    ).throttledFn;

    return this.client.on('connection.recovered', throttledHandleConnectionRecovered)
      .unsubscribe;
  };

  public unregisterSubscriptions = () => {
    this.registry.values().forEach((thread) => thread.unregisterSubscriptions());
    return super.unregisterSubscriptions();
  };

  /** A page has landed: `master`'s `ready`. A failed first load or a reset leaves it unset. */
  private get isListLoaded() {
    return this.paginator.items !== undefined;
  }

  /**
   * Loads the first page, or re-queries a loaded list in place, sized to what is loaded plus the
   * unseen threads. Skipped once loaded unless forced or something changed; the list survives a
   * failure. Guarded only against another reload, as on `master`.
   */
  public reload = async ({ force = false } = {}) => {
    const { isReloading, isThreadOrderStale, unseenThreadIds } =
      this.state.getLatestValue();
    if (isReloading) return;
    if (!force && this.isListLoaded && !unseenThreadIds.length && !isThreadOrderStale)
      return;
    const { items, pageSize } = this.paginator;
    const limit = (items?.length ?? 0) + unseenThreadIds.length;

    this.state.partialNext({ isReloading: true });
    try {
      await this.paginator.reload({ limit: Math.min(limit, pageSize) || pageSize });
    } finally {
      const error = this.paginator.lastQueryError;
      if (error) {
        logger
          .withExtraTags('reload')
          .error('Failed to reload the thread list.', { error });
      }
      this.state.partialNext({
        isReloading: false,
        ...(error ? {} : { isThreadOrderStale: false, unseenThreadIds: [] }),
      });
    }
  };
}
