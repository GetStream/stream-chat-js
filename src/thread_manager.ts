import { chatLoggerSystem } from './logger';
import { deepFreezeConfig } from './configuration/utils/deepFreezeConfig';
import { StateStore, type Unsubscribe } from '@stream-io/state-store';
import { ConfigController } from './configuration/ConfigController';
import { throttle } from './utils';
import { EntityStore, type EntityStoreSubscriber } from './entityStore/EntityStore';
import { StoreBackedItemIndex } from './entityStore/StoreBackedItemIndex';
import { ThreadPaginator } from './pagination/paginators/ThreadPaginator';

import type { Channel } from './channel';
import type { StreamChat } from './client';
import { Thread } from './thread';
import type {
  Event,
  EventPayload,
  EventType,
  LocalMessage,
  MessageResponse,
  OwnUserResponse,
} from './types';
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
  unreadThreadCount: number;
  /**
   * List of threads that haven't been loaded in the list, but have received new messages
   * since the latest reload. Useful to display a banner prompting to reload the thread list.
   */
  unseenThreadIds: string[];
};

export const THREAD_MANAGER_INITIAL_STATE: ThreadManagerState = {
  active: false,
  isThreadOrderStale: false,
  unreadThreadCount: 0,
  unseenThreadIds: [],
  wasActivatedAtLeastOnce: false,
};

const logger = chatLoggerSystem.getLogger('thread-manager');

const getThreadId = (thread: Thread) => thread.id;
/** `threadStore` holder for list membership. */
const LIST_HOLDER: EntityStoreSubscriber = { onEntitiesChanged: () => undefined };
/** `threadStore` holder for a thread opened this session (`register()`, from `thread.activate()`). */
const REGISTERED_HOLDER: EntityStoreSubscriber = { onEntitiesChanged: () => undefined };

export class ThreadManager extends WithSubscriptions {
  public readonly state: StateStore<ThreadManagerState>;
  /** The thread list, in server order. */
  public readonly paginator: ThreadPaginator;
  private client: StreamChat;
  /**
   * Every live thread, held by the list (`listIndex`) and/or `REGISTERED_HOLDER` (opened this session).
   * A thread leaves once neither holds it.
   */
  private readonly threadStore = new EntityStore<Thread>({ getEntityId: getThreadId });
  /** Which registered threads the list holds: the paginator's item index. */
  private readonly listIndex = new StoreBackedItemIndex<Thread>({
    getEntityId: getThreadId,
    owner: LIST_HOLDER,
    store: this.threadStore,
  });
  /** A reload is in flight; a second one is dropped (`master`'s `pagination.isLoading` guard). */
  private isReloadInFlight = false;
  /**
   * A local `pendingDisposal` listener (a state subscription, not a server watch) per channel instance
   * that has had a listed or opened thread; removed when that channel is disposed or on reset.
   */
  private readonly disposalListeners = new Map<Channel, Unsubscribe>();

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
   * list). Resolve threads through this, not `paginator.items`, which is the list only; list
   * membership is `paginator.getItem(id)`.
   */
  public get = (id: string): Thread | undefined => this.threadStore.get(id);

  /**
   * Returns the thread for `parentMessage`, creating it if it doesn't exist yet. Use this to open a
   * thread instead of calling `new Thread()`.
   *
   * The returned thread is registered right away. If the thread list loads it before the UI
   * activates it, the list reuses this instance instead of creating a duplicate.
   */
  public ensure = ({
    channel,
    parentMessage,
  }: {
    channel: Channel;
    parentMessage: LocalMessage | MessageResponse;
  }): Thread => {
    const thread =
      this.threadStore.get(parentMessage.id) ??
      new Thread({ channel, client: this.client, parentMessage });
    this.register(thread);
    return thread;
  };

  /**
   * Every registered thread — the list's plus the opened ones.
   *
   * @internal
   */
  public get registeredThreads(): Thread[] {
    return this.threadStore.values();
  }

  /**
   * Called by `thread.activate()`. Keeps `thread` for the session: it resolves through
   * {@link ThreadManager.get} and stays subscribed whether or not the list holds it, until its
   * channel is disposed or the user disconnects.
   *
   * @internal
   */
  public register = (thread: Thread) => {
    const { id } = thread;
    const registered = this.threadStore.get(id);
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

    this.threadStore.link(id, REGISTERED_HOLDER);
    this.threadStore.upsert(thread, REGISTERED_HOLDER);
    if (this.hasSubscriptions) thread.registerSubscriptions();
    this.listenForDisposal(thread);
  };

  /** Releases the `REGISTERED_HOLDER` hold on `thread`; the list's own diff unsubscribes it if it is still listed. */
  private release = (thread: Thread) => {
    this.threadStore.unlink(thread.id, REGISTERED_HOLDER);
    if (this.hasSubscriptions && !this.paginator.items?.includes(thread)) {
      thread.unregisterSubscriptions();
    }
  };

  /** Listens for its channel's disposal the first time a thread on that channel is seen. */
  private listenForDisposal = (thread: Thread) => {
    const { channel } = thread;
    if (this.disposalListeners.has(channel)) return;
    if (channel.pendingDisposal) {
      this.releaseChannel(channel);
      return;
    }
    this.disposalListeners.set(
      channel,
      channel.state.subscribeWithSelector(
        ({ pendingDisposal }) => ({ pendingDisposal }),
        ({ pendingDisposal }) => {
          if (pendingDisposal) this.releaseChannel(channel);
        },
      ),
    );
  };

  /** The channel was disposed, so its threads are unusable: release every one of them. */
  private releaseChannel = (channel: Channel) => {
    this.disposalListeners.get(channel)?.();
    this.disposalListeners.delete(channel);
    const onChannel = (thread: Thread) => thread.channel === channel;
    this.threadStore.values().filter(onChannel).forEach(this.release);
    const listed = (this.paginator.items ?? []).filter(onChannel);
    if (!listed.length) return;
    this.paginator.batch(
      () => listed.forEach(({ id }) => this.paginator.removeItem({ id })),
      { coalesce: true },
    );
  };

  /**
   * The live instance for a queried thread: the registered one (rehydrated if stale), else
   * `incoming`. Every thread entering the list passes through here, which is what keeps one instance
   * per id: the index upserts, so a second instance would replace the registered one.
   */
  private resolveQueriedThread = (incoming: Thread) => {
    const existing = this.threadStore.get(incoming.id);
    const thread = existing ?? incoming;
    if (existing?.hasStaleState && !existing.state.getLatestValue().active) {
      existing.hydrateState(incoming);
    }
    this.listenForDisposal(thread);
    return thread;
  };

  public resetState = () => {
    this.threadStore.values().forEach(this.release);
    this.paginator.resetState();
    this.disposalListeners.forEach((unsubscribe) => unsubscribe());
    this.disposalListeners.clear();
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
    // The list's threads are registered by `subscribeManageThreadSubscriptions`; this covers the
    // opened ones it does not hold.
    this.threadStore.values().forEach((thread) => thread.registerSubscriptions());
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

  private subscribeManageThreadSubscriptions = () =>
    this.paginator.state.subscribeWithSelector(
      (nextValue) => ({ threads: nextValue.items ?? [] }),
      ({ threads: nextThreads }, prev) => {
        const { threads: prevThreads = [] } = prev ?? {};
        // Left the list and wasn't opened. Asks for `REGISTERED_HOLDER`, not `threadStore.get`: `removeItem`
        // publishes before it unlinks the list's hold.
        const listed = new Set(nextThreads);
        const removedThreads = prevThreads.filter(
          (thread) =>
            !listed.has(thread) &&
            !this.threadStore.isHeldBy(thread.id, REGISTERED_HOLDER),
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
    this.threadStore.values().forEach((thread) => thread.unregisterSubscriptions());
    return super.unregisterSubscriptions();
  };

  /** A page has landed: `master`'s `ready`. A failed first load or a reset leaves it unset. */
  private get isListLoaded() {
    return this.paginator.items !== undefined;
  }

  /**
   * Loads the first page, or re-queries a loaded list in place, sized to what is loaded plus the
   * unseen threads. Skipped once loaded unless forced or something changed; the list survives a
   * failure. Guarded only against another reload, as on `master`. A reload of a loaded list shows
   * no loading state; the first load shows through `paginator.isLoading`.
   */
  public reload = async ({ force = false } = {}) => {
    if (this.isReloadInFlight) return;
    const { isThreadOrderStale, unseenThreadIds } = this.state.getLatestValue();
    if (!force && this.isListLoaded && !unseenThreadIds.length && !isThreadOrderStale)
      return;
    const { items, pageSize } = this.paginator;
    const limit = (items?.length ?? 0) + unseenThreadIds.length;

    this.isReloadInFlight = true;
    try {
      await this.paginator.reload({ limit: Math.min(limit, pageSize) || pageSize });
    } finally {
      this.isReloadInFlight = false;
      const error = this.paginator.lastQueryError;
      if (error) {
        logger
          .withExtraTags('reload')
          .error('Failed to reload the thread list.', { error });
      } else {
        this.state.partialNext({ isThreadOrderStale: false, unseenThreadIds: [] });
      }
    }
  };
}
