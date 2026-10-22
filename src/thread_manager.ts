import { chatLoggerSystem } from './logger';
import { deepFreezeConfig } from './configuration/utils/deepFreezeConfig';
import { StateStore, type Unsubscribe } from '@stream-io/state-store';
import { ConfigController } from './configuration/ConfigController';
import { throttle } from './utils';
import { EntityStore, type EntityStoreSubscriber } from './entityStore/EntityStore';
import { ThreadPaginator } from './pagination/paginators/ThreadPaginator';

import type { Channel } from './channel';
import type { StreamChat } from './client';
import { ensureThreadChannel, Thread } from './thread';
import type {
  Event,
  EventPayload,
  EventType,
  LocalMessage,
  MessageResponse,
  OwnUserResponse,
  ThreadStateResponse,
} from './types';
import { WithSubscriptions } from './utils/WithSubscriptions';

const eventCarriesOwnUser = (
  event: Event,
): event is EventPayload<'health.check'> | EventPayload<'connection.ok'> =>
  Object.hasOwn(event, 'me');

export type ThreadManagerConfig = {
  /**
   * Minimum gap between thread-list reloads triggered by connection recovery, in milliseconds.
   * Defaults to 1000. Read in `registerSubscriptions()`, so a change applies from the next call.
   */
  connectionRecoveryThrottleMs: number;
};

export const DEFAULT_THREAD_MANAGER_CONFIG: ThreadManagerConfig = deepFreezeConfig({
  connectionRecoveryThrottleMs: 1000,
});

/** Manager-level state. The list itself lives on {@link ThreadManager.paginator}. */
export type ThreadManagerState = {
  active: boolean;
  /** Whether `activate()` was called this session. Recovery skips the reload when it never was. */
  wasActivatedAtLeastOnce: boolean;
  /** A listed thread got a reply since the latest reload, so the list order may be out of date. */
  isThreadOrderStale: boolean;
  unreadThreadCount: number;
  /** Threads not in the list that got new messages since the latest reload (for a banner). */
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

/** `threadStore` holder for a thread opened this session (`register()`, from `thread.activate()`). */
const REGISTERED_HOLDER: EntityStoreSubscriber = { onEntitiesChanged: () => undefined };

export class ThreadManager extends WithSubscriptions {
  public readonly state: StateStore<ThreadManagerState>;
  /** The thread list, in server order. */
  public readonly paginator: ThreadPaginator;
  private client: StreamChat;
  /**
   * Every live thread, held by the list and/or `REGISTERED_HOLDER` (opened this session). A thread
   * leaves once neither holds it.
   */
  private readonly threadStore = new EntityStore<Thread>({ getEntityId: getThreadId });
  /** A reload is in flight; a second one is dropped. */
  private isReloadInFlight = false;
  /**
   * A local `pendingDisposal` listener per channel with a listed or opened thread, removed when the
   * channel is disposed or on reset.
   */
  private readonly disposalListeners = new Map<Channel, Unsubscribe>();

  private readonly configController: ConfigController<ThreadManagerConfig>;

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
    this.paginator = new ThreadPaginator({ client, store: this.threadStore });
    // A listed or opened thread keeps its channel.
    client.channelManager.channelStore.addClaim({
      heldBy: () => this.registeredThreads.map((thread) => thread.channel),
      name: 'threads',
    });
    // Every listed thread gets its channel's disposal listener, independent of
    // `registerSubscriptions()`.
    this.paginator.state.subscribeWithSelector(
      ({ items }) => ({ items }),
      ({ items }) => items?.forEach(this.listenForDisposal),
    );
  }

  public get config(): Readonly<ThreadManagerConfig> {
    return this.configState.getLatestValue();
  }

  /**
   * Merges a partial configuration into the resolved config.
   *
   * @param config - The fields to change.
   */
  public updateConfig(config: Partial<ThreadManagerConfig>) {
    this.configController.patch(config);
  }

  /**
   * Re-derives the configuration from the declarative slice.
   *
   * @param config - The declarative slice (optional).
   */
  public initializeConfig(config?: Partial<ThreadManagerConfig>) {
    this.configController.initialize(config);
  }

  /**
   * The live thread for `id`: one in the list, or one opened this session. `paginator.items` holds
   * the list only; list membership is `paginator.getItem(id)`.
   */
  public get = (id: string): Thread | undefined => this.threadStore.get(id);

  /**
   * Returns the thread for `parentMessage`, creating and registering it if needed. Use it instead
   * of `new Thread()`: the thread list reuses this instance if it later loads the same thread. A
   * created thread starts stale and loads its data when first opened, unless the parent has no
   * replies in a watched channel (nothing to load: `getThread` would 404, the first reply arrives
   * as an event). In an unwatched channel the parent's `reply_count` may miss newer replies, so it
   * always loads.
   *
   * @param params.channel - The channel of the parent message.
   * @param params.parentMessage - The thread's parent message.
   * @returns The registered thread.
   */
  public ensure = ({
    channel,
    parentMessage,
  }: {
    channel: Channel;
    parentMessage: LocalMessage | MessageResponse;
  }): Thread => {
    let thread = this.threadStore.get(parentMessage.id);
    if (!thread) {
      thread = new Thread({ channel, client: this.client, parentMessage });
    }
    this.register(thread);
    return thread;
  };

  /**
   * The registered thread, or a new one when none is registered. Only a stale thread nobody has
   * open is hydrated from `threadData`: an open one reloads itself, and events keep any other
   * current (an answer that was in flight would roll them back). The channel's members and custom
   * data are applied either way, as the constructor does for a new thread.
   *
   * @internal
   */
  public resolveQueried = (threadData: ThreadStateResponse): Thread => {
    const registered = this.threadStore.get(threadData.parent_message_id);
    if (!registered) return new Thread({ client: this.client, threadData });

    const { active, isStateStale } = registered.state.getLatestValue();
    if (isStateStale && !active) registered.hydrateState(threadData);
    else ensureThreadChannel(this.client, threadData);
    return registered;
  };

  /**
   * Every registered thread: the list's plus the opened ones.
   *
   * @internal
   */
  public get registeredThreads(): Thread[] {
    return this.threadStore.values();
  }

  /**
   * Keeps `thread` for the session: resolvable through {@link ThreadManager.get} and subscribed
   * whether or not the list holds it, until its channel is disposed or the user disconnects.
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

  /** Releases the `REGISTERED_HOLDER` hold, and unsubscribes the thread unless listed. */
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
      this.releaseThreadsOfChannel(channel);
      return;
    }
    this.disposalListeners.set(
      channel,
      channel.state.subscribeWithSelector(
        ({ pendingDisposal }) => ({ pendingDisposal }),
        ({ pendingDisposal }) => {
          if (pendingDisposal) this.releaseThreadsOfChannel(channel);
        },
      ),
    );
  };

  /** The channel was disposed, so its threads are unusable: release every one of them. */
  private releaseThreadsOfChannel = (channel: Channel) => {
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
    this.addUnsubscribeFunction(this.subscribeThreadEvents());
    // The list's threads are registered by `subscribeManageThreadSubscriptions`; this covers the
    // opened ones it does not hold.
    this.threadStore.values().forEach((thread) => thread.registerSubscriptions());
  };

  /**
   * Routes client events to the threads in the store by ID. A message event reaches the thread the
   * message replies in and the thread it starts; quoted-message updates stay within the reply's own
   * thread. A thread follows its channel's `watchStatus` itself.
   */
  private subscribeThreadEvents = () => {
    const threadsOf = (message?: { id: string; parent_id?: string }) =>
      message
        ? [
            message.parent_id ? this.get(message.parent_id) : undefined,
            this.get(message.id),
          ]
        : [];

    const unsubscribeFunctions = [
      this.client.on('message.new', (event) => {
        if (event.message?.parent_id)
          this.get(event.message.parent_id)?.handleNewReply(event);
      }),
      this.client.on('message.read', (event) => {
        if (event.thread)
          this.get(event.thread.parent_message_id)?.handleRepliesRead(event);
      }),
      this.client.on('notification.mark_unread', (event) => {
        if (event.thread_id) this.get(event.thread_id)?.handleRepliesUnread(event);
      }),
      this.client.on('thread.updated', (event) => {
        if (event.thread)
          this.get(event.thread.parent_message_id)?.handleThreadUpdated(event);
      }),
      this.client.on('message.deleted', (event) =>
        threadsOf(event.message).forEach((thread) => thread?.handleMessageDeleted(event)),
      ),
      ...(['message.updated', 'message.undeleted'] as const).map((eventType) =>
        this.client.on(eventType, (event) =>
          threadsOf(event.message).forEach((thread) =>
            thread?.handleMessageUpdated(event),
          ),
        ),
      ),
      ...(['reaction.new', 'reaction.deleted', 'reaction.updated'] as const).map(
        (eventType) =>
          this.client.on(eventType, (event) =>
            threadsOf(event.message).forEach((thread) =>
              thread?.handleReactionChanged(event),
            ),
          ),
      ),
      // A banned or deleted user's replies can be in any thread, so these two are the exception.
      ...(['user.messages.deleted', 'user.deleted'] as const).map((eventType) =>
        this.client.on(eventType, (event) =>
          this.threadStore
            .values()
            .forEach((thread) => thread.handleUserMessagesDeleted(event)),
        ),
      ),
    ].map(({ unsubscribe }) => unsubscribe);

    return () => unsubscribeFunctions.forEach((unsubscribe) => unsubscribe());
  };

  private subscribeUnreadThreadsCountChange = () => {
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
        // Left the list and not opened. Checks `REGISTERED_HOLDER`, not `threadStore.get`:
        // `removeItem` publishes before it unlinks the list's hold.
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

      if (!this.paginator.hasResults) return;
      const { unseenThreadIds } = this.state.getLatestValue();

      if (this.paginator.getItem(parentId)) {
        this.state.partialNext({ isThreadOrderStale: true });
      } else if (!unseenThreadIds.includes(parentId)) {
        this.state.partialNext({ unseenThreadIds: unseenThreadIds.concat(parentId) });
      }
    }).unsubscribe;

  /** Reloads the thread list once recovery after a reconnect finished (`connection.recovered`). */
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

  /**
   * Loads the first page, or re-queries a loaded list in place, sized to what is loaded plus the
   * unseen threads. Skipped once loaded unless forced or something changed; the list survives a
   * failure. Dropped while another reload is in flight. Only the first load shows
   * `paginator.isLoading`.
   */
  public reload = async ({ force = false } = {}) => {
    if (this.isReloadInFlight) return;
    const { isThreadOrderStale, unseenThreadIds } = this.state.getLatestValue();
    if (
      !force &&
      this.paginator.hasResults &&
      !unseenThreadIds.length &&
      !isThreadOrderStale
    )
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
