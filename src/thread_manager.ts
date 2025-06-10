import { StateStore } from './store';
import { throttle } from './utils';

import type { StreamChat } from './client';
import type { Thread } from './thread';
import type { Event, OwnUserResponse, QueryThreadsOptions } from './types';
import { WithSubscriptions } from './utils/WithSubscriptions';

const DEFAULT_CONNECTION_RECOVERY_THROTTLE_DURATION = 1000;
const MAX_QUERY_THREADS_LIMIT = 25;
export const THREAD_MANAGER_INITIAL_STATE = {
  active: false,
  isThreadOrderStale: false,
  threads: [],
  unreadThreadCount: 0,
  unseenThreadIds: [],
  lastConnectionDropAt: null,
  pagination: {
    isLoading: false,
    isLoadingNext: false,
    nextCursor: null,
  },
  ready: false,
};

export type ThreadManagerState = {
  active: boolean;
  isThreadOrderStale: boolean;
  lastConnectionDropAt: Date | null;
  pagination: ThreadManagerPagination;
  ready: boolean;
  threads: Thread[];
  unreadThreadCount: number;
  /**
   * List of threads that haven't been loaded in the list, but have received new messages
   * since the latest reload. Useful to display a banner prompting to reload the thread list.
   */
  unseenThreadIds: string[];
};

export type ThreadManagerPagination = {
  isLoading: boolean;
  isLoadingNext: boolean;
  nextCursor: string | null;
};

export class ThreadManager extends WithSubscriptions {
  public readonly state: StateStore<ThreadManagerState>;
  private client: StreamChat;
  private threadsByIdGetterCache: {
    threads: ThreadManagerState['threads'];
    threadsById: Record<string, Thread | undefined>;
  };
  // cache used in combination with threadsById
  // used for threads which are not stored in the list
  // private threadCache: Record<string, Thread | undefined> = {};

  constructor({ client }: { client: StreamChat }) {
    super();

    this.client = client;
    this.state = new StateStore<ThreadManagerState>(THREAD_MANAGER_INITIAL_STATE);

    this.threadsByIdGetterCache = { threads: [], threadsById: {} };
  }

  public get threadsById() {
    const { threads } = this.state.getLatestValue();

    if (threads === this.threadsByIdGetterCache.threads) {
      return this.threadsByIdGetterCache.threadsById;
    }

    const threadsById = threads.reduce<Record<string, Thread>>(
      (newThreadsById, thread) => {
        newThreadsById[thread.id] = thread;
        return newThreadsById;
      },
      {},
    );

    this.threadsByIdGetterCache.threads = threads;
    this.threadsByIdGetterCache.threadsById = threadsById;

    return threadsById;
  }

  public resetState = () => {
    this.state.next(THREAD_MANAGER_INITIAL_STATE);
  };

  public activate = () => {
    this.state.partialNext({ active: true });
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
    this.addUnsubscribeFunction(this.subscribeRecoverAfterConnectionDrop());
    this.addUnsubscribeFunction(this.subscribeChannelDeleted());
  };

  private subscribeUnreadThreadsCountChange = () => {
    // initiate
    const { unread_threads: unreadThreadCount = 0 } =
      (this.client.user as OwnUserResponse) ?? {};
    this.state.partialNext({ unreadThreadCount });

    const unsubscribeFunctions = [
      'health.check',
      'notification.mark_read',
      'notification.thread_message_new',
      'notification.channel_deleted',
    ].map(
      (eventType) =>
        this.client.on(eventType, (event) => {
          const { unread_threads: unreadThreadCount } = event.me ?? event;
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
      const { threads } = this.state.getLatestValue();

      const newThreads = threads.filter((thread) => thread.channel.cid !== cid);
      this.state.partialNext({ threads: newThreads });
    }).unsubscribe;

  private subscribeManageThreadSubscriptions = () =>
    this.state.subscribeWithSelector(
      (nextValue) => ({ threads: nextValue.threads }),
      ({ threads: nextThreads }, prev) => {
        const { threads: prevThreads = [] } = prev ?? {};
        // Thread instance was removed if there's no thread with the given id at all,
        // or it was replaced with a new instance
        const removedThreads = prevThreads.filter(
          (thread) => thread !== this.threadsById[thread.id],
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
    this.client.on('notification.thread_message_new', (event: Event) => {
      const parentId = event.message?.parent_id;
      if (!parentId) return;

      const { unseenThreadIds, ready } = this.state.getLatestValue();
      if (!ready) return;

      if (this.threadsById[parentId]) {
        this.state.partialNext({ isThreadOrderStale: true });
      } else if (!unseenThreadIds.includes(parentId)) {
        this.state.partialNext({ unseenThreadIds: unseenThreadIds.concat(parentId) });
      }
    }).unsubscribe;

  private subscribeRecoverAfterConnectionDrop = () => {
    const unsubscribeConnectionDropped = this.client.on('connection.changed', (event) => {
      if (event.online === false) {
        this.state.next((current) =>
          current.lastConnectionDropAt
            ? current
            : {
                ...current,
                lastConnectionDropAt: new Date(),
              },
        );
      }
    }).unsubscribe;

    const throttledHandleConnectionRecovered = throttle(
      () => {
        const { lastConnectionDropAt } = this.state.getLatestValue();
        if (!lastConnectionDropAt) return;
        this.reload({ force: true });
      },
      DEFAULT_CONNECTION_RECOVERY_THROTTLE_DURATION,
      { trailing: true },
    );

    const unsubscribeConnectionRecovered = this.client.on(
      'connection.recovered',
      throttledHandleConnectionRecovered,
    ).unsubscribe;

    return () => {
      unsubscribeConnectionDropped();
      unsubscribeConnectionRecovered();
    };
  };

  public unregisterSubscriptions = () => {
    this.state
      .getLatestValue()
      .threads.forEach((thread) => thread.unregisterSubscriptions());
    return super.unregisterSubscriptions();
  };

  public reload = async ({ force = false } = {}) => {
    const { threads, unseenThreadIds, isThreadOrderStale, pagination, ready } =
      this.state.getLatestValue();
    if (pagination.isLoading) return;
    if (!force && ready && !unseenThreadIds.length && !isThreadOrderStale) return;
    const limit = threads.length + unseenThreadIds.length;

    try {
      this.state.next((current) => ({
        ...current,
        pagination: {
          ...current.pagination,
          isLoading: true,
        },
      }));

      const response = await this.queryThreads({
        limit: Math.min(limit, MAX_QUERY_THREADS_LIMIT) || MAX_QUERY_THREADS_LIMIT,
      });

      const nextThreads: Thread[] = [];

      for (const incomingThread of response.threads) {
        const existingThread = this.threadsById[incomingThread.id];

        if (existingThread) {
          // Reuse thread instances if possible
          nextThreads.push(existingThread);
          if (existingThread.hasStaleState) {
            existingThread.hydrateState(incomingThread);
          }
        } else {
          nextThreads.push(incomingThread);
        }
      }

      this.state.next((current) => ({
        ...current,
        threads: nextThreads,
        unseenThreadIds: [],
        isThreadOrderStale: false,
        pagination: {
          ...current.pagination,
          isLoading: false,
          nextCursor: response.next ?? null,
        },
        ready: true,
      }));
    } catch (error) {
      this.client.logger('error', (error as Error).message);
      this.state.next((current) => ({
        ...current,
        pagination: {
          ...current.pagination,
          isLoading: false,
        },
      }));
    }
  };

  public queryThreads = (options: QueryThreadsOptions = {}) =>
    this.client.queryThreads({
      limit: 25,
      participant_limit: 10,
      reply_limit: 10,
      watch: true,
      ...options,
    });

  public loadNextPage = async (options: Omit<QueryThreadsOptions, 'next'> = {}) => {
    const { pagination } = this.state.getLatestValue();

    if (pagination.isLoadingNext || !pagination.nextCursor) return;

    try {
      this.state.partialNext({ pagination: { ...pagination, isLoadingNext: true } });

      const response = await this.queryThreads({
        ...options,
        next: pagination.nextCursor,
      });

      this.state.next((current) => ({
        ...current,
        threads: response.threads.length
          ? current.threads.concat(response.threads)
          : current.threads,
        pagination: {
          ...current.pagination,
          nextCursor: response.next ?? null,
          isLoadingNext: false,
        },
      }));
    } catch (error) {
      this.client.logger('error', (error as Error).message);
      this.state.next((current) => ({
        ...current,
        pagination: {
          ...current.pagination,
          isLoadingNext: false,
        },
      }));
    }
  };
}
