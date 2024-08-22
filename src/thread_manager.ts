import type { StreamChat } from './client';
import type { Handler } from './store';
import { StateStore } from './store';
import type { Thread } from './thread';
import type { DefaultGenerics, Event, ExtendableGenerics, QueryThreadsOptions } from './types';
import { throttle } from './utils';

const DEFAULT_CONNECTION_RECOVERY_THROTTLE_DURATION = 1000;
const MAX_QUERY_THREADS_LIMIT = 25;

export type ThreadManagerState<SCG extends ExtendableGenerics = DefaultGenerics> = {
  active: boolean;
  existingReorderedThreadIds: string[];
  lastConnectionDownAt: Date | null;
  loadingNextPage: boolean;
  threadIdIndexMap: { [key: string]: number };
  threads: Thread<SCG>[];
  unreadThreadsCount: number;
  unseenThreadIds: string[];
  nextCursor?: string | null; // null means no next page available
  // TODO?: implement once supported by BE
  // previousCursor?: string | null;
  // loadingPreviousPage: boolean;
};

type WithRequired<T, K extends keyof T> = T & { [P in K]-?: T[P] };

export class ThreadManager<SCG extends ExtendableGenerics = DefaultGenerics> {
  public readonly state: StateStore<ThreadManagerState<SCG>>;
  private client: StreamChat<SCG>;
  private unsubscribeFunctions: Set<() => void> = new Set();

  constructor({ client }: { client: StreamChat<SCG> }) {
    this.client = client;
    this.state = new StateStore<ThreadManagerState<SCG>>({
      active: false,
      // existing threads which have gotten recent activity during the time the manager was inactive
      existingReorderedThreadIds: [],
      threads: [],
      threadIdIndexMap: {},
      unreadThreadsCount: 0,
      // new threads or threads which have not been loaded and is not possible to paginate to anymore
      // as these threads received new replies which moved them up in the list - used for the badge
      unseenThreadIds: [],
      lastConnectionDownAt: null,
      loadingNextPage: false,
      nextCursor: undefined,
    });
  }

  public activate = () => {
    this.state.partialNext({ active: true });
  };

  public deactivate = () => {
    this.state.partialNext({ active: false });
  };

  // eslint-disable-next-line sonarjs/cognitive-complexity
  public registerSubscriptions = () => {
    if (this.unsubscribeFunctions.size) return;

    const handleUnreadThreadsCountChange = (event: Event<SCG>) => {
      const { unread_threads: unreadThreadsCount } = event.me ?? event;

      if (typeof unreadThreadsCount === 'undefined') return;

      this.state.partialNext({ unreadThreadsCount });
    };

    [
      'health.check',
      'notification.mark_read',
      'notification.thread_message_new',
      'notification.channel_deleted',
    ].forEach((eventType) =>
      this.unsubscribeFunctions.add(this.client.on(eventType, handleUnreadThreadsCountChange).unsubscribe),
    );

    // TODO: return to previous recovery option as state merging is now in place
    const throttledHandleConnectionRecovery = throttle(
      async () => {
        const { lastConnectionDownAt, threads } = this.state.getLatestValue();

        if (!lastConnectionDownAt) return;

        const channelCids = new Set<string>();
        for (const thread of threads) {
          if (!thread.channel) continue;

          channelCids.add(thread.channel.cid);
        }

        if (!channelCids.size) return;

        try {
          // FIXME: syncing does not work for me
          await this.client.sync(Array.from(channelCids), lastConnectionDownAt.toISOString(), { watch: true });
          this.state.partialNext({ lastConnectionDownAt: null });
        } catch (error) {
          // TODO: if error mentions that the amount of events is more than 2k
          // do a reload-type recovery (re-query threads and merge states)

          console.warn(error);
        }
      },
      DEFAULT_CONNECTION_RECOVERY_THROTTLE_DURATION,
      {
        leading: true,
        trailing: true,
      },
    );

    this.unsubscribeFunctions.add(
      this.client.on('connection.recovered', throttledHandleConnectionRecovery).unsubscribe,
    );

    this.unsubscribeFunctions.add(
      this.client.on('connection.changed', (event) => {
        if (typeof event.online === 'undefined') return;

        const { lastConnectionDownAt } = this.state.getLatestValue();

        if (!event.online && !lastConnectionDownAt) {
          this.state.partialNext({ lastConnectionDownAt: new Date() });
        }
      }).unsubscribe,
    );

    this.unsubscribeFunctions.add(
      this.state.subscribeWithSelector(
        (nextValue) => [nextValue.active],
        ([active]) => {
          if (!active) return;

          // automatically clear all the changes that happened "behind the scenes"
          this.reload();
        },
      ),
    );

    const handleThreadsChange: Handler<readonly [Thread<SCG>[]]> = ([newThreads], previouslySelectedValue) => {
      // create new threadIdIndexMap
      const newThreadIdIndexMap = newThreads.reduce<ThreadManagerState['threadIdIndexMap']>((map, thread, index) => {
        map[thread.id] ??= index;
        return map;
      }, {});

      //  handle individual thread subscriptions
      if (previouslySelectedValue) {
        const [previousThreads] = previouslySelectedValue;
        previousThreads.forEach((t) => {
          // thread with registered handlers has been removed or its signature changed (new instance)
          // deregister and let gc do its thing
          if (typeof newThreadIdIndexMap[t.id] === 'undefined' || newThreads[newThreadIdIndexMap[t.id]] !== t) {
            t.deregisterSubscriptions();
          }
        });
      }
      newThreads.forEach((t) => t.registerSubscriptions());

      // publish new threadIdIndexMap
      this.state.next((current) => ({ ...current, threadIdIndexMap: newThreadIdIndexMap }));
    };

    this.unsubscribeFunctions.add(
      // re-generate map each time the threads array changes
      this.state.subscribeWithSelector((nextValue) => [nextValue.threads] as const, handleThreadsChange),
    );

    // TODO: handle parent message hard-deleted (extend state with \w hardDeletedThreadIds?)

    const handleNewReply = (event: Event<SCG>) => {
      if (!event.message || !event.message.parent_id) return;
      const parentId = event.message.parent_id;

      const {
        threadIdIndexMap,
        nextCursor,
        threads,
        unseenThreadIds,
        existingReorderedThreadIds,
        active,
      } = this.state.getLatestValue();

      // prevents from handling replies until the threads have been loaded
      // (does not fill information for "unread threads" banner to appear)
      if (!threads.length && nextCursor !== null) return;

      const existsLocally = typeof threadIdIndexMap[parentId] !== 'undefined';

      // only register these changes during the time the thread manager is inactive
      if (existsLocally && !existingReorderedThreadIds.includes(parentId) && !active) {
        return this.state.next((current) => ({
          ...current,
          existingReorderedThreadIds: current.existingReorderedThreadIds.concat(parentId),
        }));
      }

      if (!existsLocally && !unseenThreadIds.includes(parentId)) {
        return this.state.next((current) => ({
          ...current,
          unseenThreadIds: current.unseenThreadIds.concat(parentId),
        }));
      }
    };

    this.unsubscribeFunctions.add(this.client.on('notification.thread_message_new', handleNewReply).unsubscribe);
  };

  public deregisterSubscriptions = () => {
    // TODO: think about state reset or at least invalidation
    this.unsubscribeFunctions.forEach((cleanupFunction) => cleanupFunction());
  };

  public reload = async () => {
    const { threads, unseenThreadIds, existingReorderedThreadIds } = this.state.getLatestValue();

    if (!unseenThreadIds.length && !existingReorderedThreadIds.length) return;

    const combinedLimit = threads.length + unseenThreadIds.length;

    try {
      const data = await this.queryThreads({
        limit: combinedLimit <= MAX_QUERY_THREADS_LIMIT ? combinedLimit : MAX_QUERY_THREADS_LIMIT,
      });

      const { threads, threadIdIndexMap } = this.state.getLatestValue();

      const newThreads: Thread<SCG>[] = [];
      // const existingThreadIdsToFilterOut: string[] = [];

      for (const thread of data.threads) {
        const existingThread: Thread<SCG> | undefined = threads[threadIdIndexMap[thread.id]];

        newThreads.push(existingThread ?? thread);

        // replace state of threads which report stale state
        // *(state can be considered as stale when channel associated with the thread stops being watched)
        if (existingThread && existingThread.hasStaleState) {
          existingThread.hydrateState(thread);
        }

        // if (existingThread) existingThreadIdsToFilterOut.push(existingThread.id);
      }

      // TODO: use some form of a "cache" for unused threads
      // to reach for upon next pagination or re-query
      // keep them subscribed and "running" behind the scenes but
      // not in the list for multitude of reasons (clean cache on last pagination which returns empty array - nothing to pair cached threads to)
      // (this.loadedThreadIdMap)
      // const existingFilteredThreads = threads.filter(({ id }) => !existingThreadIdsToFilterOut.includes(id));

      this.state.next((current) => ({
        ...current,
        unseenThreadIds: [], // reset
        existingReorderedThreadIds: [], // reset
        // TODO: extract merging logic and allow loadNextPage to merge as well (in combination with the cache thing)
        threads: newThreads, //.concat(existingFilteredThreads),
        nextCursor: data.next ?? null, // re-adjust next cursor
      }));
    } catch (error) {
      // TODO: loading states
      console.error(error);
    } finally {
      // ...
    }
  };

  public queryThreads = async ({
    limit = 25,
    participant_limit = 10,
    reply_limit = 10,
    watch = true,
    ...restOfTheOptions
  }: QueryThreadsOptions = {}) => {
    const optionsWithDefaults: WithRequired<
      QueryThreadsOptions,
      'reply_limit' | 'limit' | 'participant_limit' | 'watch'
    > = {
      limit,
      participant_limit,
      reply_limit,
      watch,
      ...restOfTheOptions,
    };

    const { threads, next } = await this.client.queryThreads(optionsWithDefaults);

    // FIXME: currently this is done within threads based on reply_count property
    // but that does not take into consideration sorting (only oldest -> newest)
    // re-enable functionality bellow, and take into consideration sorting

    // re-adjust next/previous cursors based on query options
    // data.threads.forEach((thread) => {
    //   thread.state.next((current) => ({
    //     ...current,
    //     nextCursor: current.latestReplies.length < optionsWithDefaults.reply_limit ? null : current.nextCursor,
    //     previousCursor:
    //       current.latestReplies.length < optionsWithDefaults.reply_limit ? null : current.previousCursor,
    //   }));
    // });

    return { threads, next };
  };

  // remove `next` from options as that is handled internally
  public loadNextPage = async (options: Omit<QueryThreadsOptions, 'next'> = {}) => {
    const { nextCursor, loadingNextPage } = this.state.getLatestValue();

    if (nextCursor === null || loadingNextPage) return;

    const optionsWithNextCursor: QueryThreadsOptions = {
      ...options,
      next: nextCursor,
    };

    this.state.next((current) => ({ ...current, loadingNextPage: true }));

    try {
      const data = await this.queryThreads(optionsWithNextCursor);

      this.state.next((current) => ({
        ...current,
        threads: data.threads.length ? current.threads.concat(data.threads) : current.threads,
        nextCursor: data.next ?? null,
      }));
    } catch (error) {
      this.client.logger('error', (error as Error).message);
    } finally {
      this.state.next((current) => ({ ...current, loadingNextPage: false }));
    }
  };
}
