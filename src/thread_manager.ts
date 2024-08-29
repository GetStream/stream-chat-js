import type { StreamChat } from './client';
import { StateStore } from './store';
import type { Thread } from './thread';
import type { DefaultGenerics, Event, ExtendableGenerics, QueryThreadsOptions } from './types';
import { throttle } from './utils';

const DEFAULT_CONNECTION_RECOVERY_THROTTLE_DURATION = 1000;
const MAX_QUERY_THREADS_LIMIT = 25;

export type ThreadManagerState<SCG extends ExtendableGenerics = DefaultGenerics> = {
  active: boolean;
  isThreadOrderStale: boolean;
  lastConnectionDropAt: Date | null;
  pagination: ThreadManagerPagination;
  ready: boolean;
  threads: Thread<SCG>[];
  threadsById: Record<string, Thread<SCG> | undefined>;
  unreadThreadsCount: number;
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

export class ThreadManager<SCG extends ExtendableGenerics = DefaultGenerics> {
  public readonly state: StateStore<ThreadManagerState<SCG>>;
  private client: StreamChat<SCG>;
  private unsubscribeFunctions: Set<() => void> = new Set();

  constructor({ client }: { client: StreamChat<SCG> }) {
    this.client = client;
    this.state = new StateStore<ThreadManagerState<SCG>>({
      active: false,
      isThreadOrderStale: false,
      threads: [],
      threadsById: {},
      unreadThreadsCount: 0,
      unseenThreadIds: [],
      lastConnectionDropAt: null,
      pagination: {
        isLoading: false,
        isLoadingNext: false,
        nextCursor: null,
      },
      ready: false,
    });
  }

  public activate = () => {
    this.state.partialNext({ active: true });
  };

  public deactivate = () => {
    this.state.partialNext({ active: false });
  };

  public registerSubscriptions = () => {
    if (this.unsubscribeFunctions.size) return;

    this.unsubscribeFunctions.add(this.subscribeUnreadThreadsCountChange());
    this.unsubscribeFunctions.add(this.subscribeManageThreadSubscriptions());
    this.unsubscribeFunctions.add(this.subscribeReloadOnActivation());
    this.unsubscribeFunctions.add(this.subscribeNewReplies());
    this.unsubscribeFunctions.add(this.subscribeRecoverAfterConnectionDrop());
  };

  private subscribeUnreadThreadsCountChange = () => {
    const unsubscribeFunctions = [
      'health.check',
      'notification.mark_read',
      'notification.thread_message_new',
      'notification.channel_deleted',
    ].map(
      (eventType) =>
        this.client.on(eventType, (event) => {
          const { unread_threads: unreadThreadsCount } = event.me ?? event;
          if (typeof unreadThreadsCount === 'number') {
            this.state.partialNext({ unreadThreadsCount });
          }
        }).unsubscribe,
    );

    return () => unsubscribeFunctions.forEach((unsubscribe) => unsubscribe());
  };

  private subscribeManageThreadSubscriptions = () =>
    this.state.subscribeWithSelector(
      (nextValue) => [nextValue.threads, nextValue.threadsById] as const,
      ([nextThreads, nextThreadsById], prev) => {
        const [prevThreads = []] = prev ?? [];
        // Thread instance was removed if there's no thread with the given id at all,
        // or it was replaced with a new instance
        const removedThreads = prevThreads.filter((thread) => thread !== nextThreadsById[thread.id]);

        nextThreads.forEach((thread) => thread.registerSubscriptions());
        removedThreads.forEach((thread) => thread.unregisterSubscriptions());
      },
    );

  private subscribeReloadOnActivation = () =>
    this.state.subscribeWithSelector(
      (nextValue) => [nextValue.active],
      ([active]) => {
        if (active) this.reload();
      },
    );

  private subscribeNewReplies = () =>
    this.client.on('notification.thread_message_new', (event: Event<SCG>) => {
      const parentId = event.message?.parent_id;
      if (!parentId) return;

      const { threadsById, unseenThreadIds, ready } = this.state.getLatestValue();
      if (!ready) return;

      if (threadsById[parentId]) {
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

    const unsubscribeConnectionRecovered = this.client.on('connection.recovered', throttledHandleConnectionRecovered)
      .unsubscribe;

    return () => {
      unsubscribeConnectionDropped();
      unsubscribeConnectionRecovered();
    };
  };

  public unregisterSubscriptions = () => {
    this.state.getLatestValue().threads.forEach((thread) => thread.unregisterSubscriptions());
    this.unsubscribeFunctions.forEach((cleanupFunction) => cleanupFunction());
    this.unsubscribeFunctions.clear();
  };

  public reload = async ({ force = false } = {}) => {
    const { threads, unseenThreadIds, isThreadOrderStale, pagination, ready } = this.state.getLatestValue();
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

      const response = await this.queryThreads({ limit: Math.min(limit, MAX_QUERY_THREADS_LIMIT) });
      const { threadsById: currentThreads } = this.state.getLatestValue();
      const nextThreads: Thread<SCG>[] = [];

      for (const incomingThread of response.threads) {
        const existingThread = currentThreads[incomingThread.id];

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
        ...prepareThreadsUpdate(current, nextThreads),
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

  public queryThreads = (options: QueryThreadsOptions = {}) => {
    return this.client.queryThreads({
      limit: 25,
      participant_limit: 10,
      reply_limit: 10,
      watch: true,
      ...options,
    });
  };

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
        ...prepareThreadsUpdate(
          current,
          response.threads.length ? current.threads.concat(response.threads) : current.threads,
        ),
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

function prepareThreadsUpdate<SCG extends ExtendableGenerics = DefaultGenerics>(
  state: ThreadManagerState<SCG>,
  threads: Thread<SCG>[],
): Partial<ThreadManagerState<SCG>> {
  if (threads === state.threads) {
    return {};
  }

  return {
    threads,
    threadsById: threads.reduce<Record<string, Thread<SCG>>>((newThreadsById, thread) => {
      newThreadsById[thread.id] = thread;
      return newThreadsById;
    }, {}),
  };
}
