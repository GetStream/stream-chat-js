import throttle from 'lodash.throttle';

import { StreamChat } from './client';
import { Channel } from './channel';
import {
  DefaultGenerics,
  ExtendableGenerics,
  MessageResponse,
  ThreadResponse,
  FormatMessageResponse,
  UserResponse,
  Event,
  QueryThreadsOptions,
  MessagePaginationOptions,
  AscDesc,
  GetRepliesAPIResponse,
  EventAPIResponse,
} from './types';
import { addToMessageList, formatMessage, normalizeQuerySort } from './utils';
import { Handler, InferStoreValueType, SimpleStateStore } from './store/SimpleStateStore';

type ThreadReadStatus<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  [key: string]: {
    last_read: string;
    last_read_message_id: string;
    lastReadAt: Date;
    unread_messages: number;
    user: UserResponse<StreamChatGenerics>;
  };
};

type QueryRepliesApiResponse<T extends ExtendableGenerics> = GetRepliesAPIResponse<T>;

type QueryRepliesOptions<T extends ExtendableGenerics> = {
  sort?: { created_at: AscDesc }[];
} & MessagePaginationOptions & { user?: UserResponse<T>; user_id?: string };

type ThreadState<T extends ExtendableGenerics> = {
  active: boolean;

  createdAt: Date;
  deletedAt: Date | null;
  isStateStale: boolean;
  latestReplies: Array<FormatMessageResponse<T>>;
  loadingNextPage: boolean;
  loadingPreviousPage: boolean;
  parentMessage: FormatMessageResponse<T> | undefined;
  participants: ThreadResponse<T>['thread_participants'];
  read: ThreadReadStatus<T>;
  replyCount: number;
  staggeredRead: ThreadReadStatus<T>;
  updatedAt: Date | null;

  channel?: Channel<T>;
  channelData?: ThreadResponse<T>['channel'];

  nextId?: string | null;
  previousId?: string | null;
};

const DEFAULT_PAGE_LIMIT = 50;
const DEFAULT_MARK_AS_READ_THROTTLE_DURATION = 1000;
const DEFAULT_CONNECTION_RECOVERY_THROTTLE_DURATION = 1000;
const MAX_QUERY_THREADS_LIMIT = 25;
const DEFAULT_SORT: { created_at: AscDesc }[] = [{ created_at: -1 }];

/**
 * Request batching?
 *
 * When the internet connection drops and during downtime threads receive messages, each thread instance should
 * do a re-fetch with the latest known message in its list (loadNextPage) once connection restores. In case there are 20+
 * thread instances this would cause a creation of 20+requests. Going through a "batching" mechanism instead - these
 * requests would get aggregated and sent only once.
 *
 * batched req: {[threadId]: { id_gt: "lastKnownMessageId" }, ...}
 * batched res: {[threadId]: { messages: [...] }, ...}
 *
 * Obviously this requires BE support and a batching mechanism on the client-side.
 */

export class Thread<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> {
  public readonly state: SimpleStateStore<ThreadState<StreamChatGenerics>>;
  public id: string;

  private client: StreamChat<StreamChatGenerics>;
  private unsubscribeFunctions: Set<() => void> = new Set();

  constructor({
    client,
    threadData = {},
  }: {
    client: StreamChat<StreamChatGenerics>;
    threadData?: Partial<ThreadResponse<StreamChatGenerics>>;
  }) {
    const {
      // TODO: check why this one is sometimes undefined (should return empty array instead)
      read: unformattedRead = [],
      latest_replies: latestReplies = [],
      thread_participants: threadParticipants = [],
      reply_count: replyCount = 0,
    } = threadData;

    // TODO: move to a function "formatReadStatus" and figure out whether this format is even useful
    const read = unformattedRead.reduce<ThreadReadStatus<StreamChatGenerics>>((pv, cv) => {
      pv[cv.user.id] ??= {
        ...cv,
        lastReadAt: new Date(cv.last_read),
      };
      return pv;
    }, {});

    const placeholderDate = new Date();

    this.state = new SimpleStateStore<ThreadState<StreamChatGenerics>>({
      // used as handler helper - actively mark read all of the incoming messages
      // if the thread is active (visibly selected in the UI)
      // TODO: figure out whether this API will work with the scrollable list (based on visibility maybe?)
      active: false,
      channelData: threadData.channel, // not channel instance
      channel: threadData.channel && client.channel(threadData.channel.type, threadData.channel.id),
      createdAt: threadData.created_at ? new Date(threadData.created_at) : placeholderDate,
      deletedAt: threadData.parent_message?.deleted_at?.length ? new Date(threadData.parent_message.deleted_at) : null,
      latestReplies: latestReplies.map(formatMessage),
      // TODO: check why this is sometimes undefined
      parentMessage: threadData.parent_message && formatMessage(threadData.parent_message),
      participants: threadParticipants,
      // actual read state representing BE values
      read,
      //
      staggeredRead: read,
      replyCount,
      updatedAt: threadData.updated_at?.length ? new Date(threadData.updated_at) : null,

      nextId: latestReplies.at(-1)?.id ?? null,
      previousId: latestReplies.at(0)?.id ?? null,
      loadingNextPage: false,
      loadingPreviousPage: false,
      // TODO: implement network status handler (network down, isStateStale: true, reset to false once state has been refreshed)
      // review lazy-reload approach (You're viewing de-synchronized thread, click here to refresh) or refresh on notification.thread_message_new
      // reset threads approach (the easiest approach but has to be done with ThreadManager - drops all the state and loads anew)
      isStateStale: false,
    });

    // parent_message_id is being re-used as thread.id
    this.id = threadData.parent_message_id ?? `thread-no-id-${placeholderDate}`; // FIXME: use nanoid instead
    this.client = client;
  }

  get channel() {
    return this.state.getLatestValue().channel;
  }

  get hasStaleState() {
    return this.state.getLatestValue().isStateStale;
  }

  private updateLocalState = <T extends InferStoreValueType<Thread>>(key: keyof T, newValue: T[typeof key]) => {
    this.state.next((current) => ({
      ...current,
      [key]: newValue,
    }));
  };

  public activate = () => {
    this.updateLocalState('active', true);
  };

  public deactivate = () => {
    this.updateLocalState('active', false);
  };

  /**
   * Makes Thread instance listen to events and adjust its state accordingly.
   */
  public registerSubscriptions = () => {
    // check whether this instance has subscriptions and is already listening for changes
    if (this.unsubscribeFunctions.size) return;

    const throttledMarkAsRead = throttle(this.markAsRead, DEFAULT_MARK_AS_READ_THROTTLE_DURATION, {
      leading: true,
      trailing: true,
    });

    const currentuserId = this.client.user?.id;

    if (currentuserId)
      this.unsubscribeFunctions.add(
        this.state.subscribeWithSelector(
          (nextValue) => [nextValue.read[currentuserId]?.unread_messages],
          ([unreadMessagesCount]) => {
            const { active } = this.state.getLatestValue();

            if (!active || !unreadMessagesCount) return;

            throttledMarkAsRead();
          },
        ),
      );

    this.unsubscribeFunctions.add(
      // TODO: re-visit this behavior, not sure whether I like the solution
      this.state.subscribeWithSelector(
        (nextValue) => [nextValue.active, nextValue.isStateStale],
        ([active, isStateStale]) => {
          if (active && isStateStale) {
            // reset state and re-load first page

            this.state.next((current) => ({
              ...current,
              previousId: undefined,
              nextId: undefined,
              latestReplies: [],
              isStateStale: false,
            }));

            this.loadPreviousPage();
          }
        },
      ),
    );

    this.unsubscribeFunctions.add(
      // TODO: figure out why the current user is not receiving this event
      this.client.on('user.watching.stop', (event) => {
        const currentUserId = this.client.user?.id;
        if (!event.channel_id || !event.user || !currentUserId || currentUserId !== event.user.id) return;

        const { channelData } = this.state.getLatestValue();

        if (!channelData || event.channel_id !== channelData.id) return;

        this.updateLocalState('isStateStale', true);
      }).unsubscribe,
    );

    this.unsubscribeFunctions.add(
      this.client.on('message.new', (event) => {
        const currentUserId = this.client.user?.id;
        if (!event.message || !currentUserId) return;
        if (event.message.parent_id !== this.id) return;

        this.upsertReply({
          message: event.message,
          // deal with timestampChanged only related to local user (optimistic updates)
          timestampChanged: event.message.user?.id === this.client.user?.id,
        });

        if (event.user && event.user.id !== currentUserId) this.incrementOwnUnreadCount();
      }).unsubscribe,
    );

    this.unsubscribeFunctions.add(
      this.client.on('message.read', (event) => {
        if (!event.user || !event.created_at || !event.thread) return;
        if (event.thread.parent_message_id !== this.id) return;

        const userId = event.user.id;
        const createdAt = event.created_at;
        const user = event.user;

        // FIXME: not sure if this is correct at all
        this.state.next((current) => ({
          ...current,
          read: {
            ...current.read,
            [userId]: {
              last_read: createdAt,
              lastReadAt: new Date(createdAt),
              user,
              // TODO: rename all of these since it's formatted (find out where it's being used in the SDK)
              unread_messages: 0,
              // TODO: fix this (lastestReplies.at(-1) might include message that is still being sent, which is wrong)
              last_read_message_id: 'unknown',
            },
          },
        }));
      }).unsubscribe,
    );

    const handleMessageUpdate = (event: Event<StreamChatGenerics>) => {
      if (!event.message) return;

      this.updateParentMessageOrReply(event.message);
    };

    ['message.updated', 'message.deleted', 'reaction.new', 'reaction.deleted'].forEach((eventType) => {
      this.unsubscribeFunctions.add(this.client.on(eventType, handleMessageUpdate).unsubscribe);
    });
  };

  public deregisterSubscriptions = () => {
    this.unsubscribeFunctions.forEach((cleanupFunction) => cleanupFunction());
    // TODO: stop watching
  };

  public incrementOwnUnreadCount = () => {
    const currentUserId = this.client.user?.id;
    if (!currentUserId) return;
    // TODO: permissions (read events) - use channel._countMessageAsUnread
    // only define side effect function if the message does not belong to the current user
    this.state.next((current) => {
      return {
        ...current,
        read: {
          ...current.read,
          [currentUserId]: {
            ...current.read[currentUserId],
            unread_messages: (current.read[currentUserId]?.unread_messages ?? 0) + 1,
          },
        },
      };
    });
  };

  public upsertReply = ({
    message,
    timestampChanged = false,
  }: {
    message: MessageResponse<StreamChatGenerics> | FormatMessageResponse<StreamChatGenerics>;
    timestampChanged?: boolean;
  }) => {
    if (message.parent_id !== this.id) {
      throw new Error('Message does not belong to this thread');
    }

    this.state.next((current) => ({
      ...current,
      latestReplies: addToMessageList(current.latestReplies, formatMessage(message), timestampChanged),
    }));
  };

  public updateParentMessage = (message: MessageResponse<StreamChatGenerics>) => {
    if (message.id !== this.id) {
      throw new Error('Message does not belong to this thread');
    }

    this.state.next((current) => {
      const newData: typeof current = {
        ...current,
        parentMessage: formatMessage(message),
        replyCount: message.reply_count ?? current.replyCount,
      };

      // update channel on channelData change (unlikely but handled anyway)
      if (message.channel) {
        newData['channelData'] = message.channel;
        newData['channel'] = this.client.channel(message.channel.type, message.channel.id);
      }

      return newData;
    });
  };

  public updateParentMessageOrReply = (message: MessageResponse<StreamChatGenerics>) => {
    if (message.parent_id === this.id) {
      this.upsertReply({ message });
    }

    if (!message.parent_id && message.id === this.id) {
      this.updateParentMessage(message);
    }
  };

  /* 
  TODO: merge and rename to toggleReaction instead (used for optimistic updates and WS only)
  & move optimistic logic from stream-chat-react to here
  */
  // addReaction = ({
  //   reaction,
  //   message,
  //   enforceUnique,
  // }: {
  //   reaction: ReactionResponse<StreamChatGenerics>;
  //   enforceUnique?: boolean;
  //   message?: MessageResponse<StreamChatGenerics>;
  // }) => {
  //   if (!message) return;

  //   this.state.next((current) => ({
  //     ...current,
  //     latestReplies: current.latestReplies.map((reply) => {
  //       if (reply.id !== message.id) return reply;

  //       // FIXME: this addReaction API weird (maybe clean it up later)
  //       const updatedMessage = current.channel?.state.addReaction(reaction, message, enforceUnique);
  //       if (updatedMessage) return formatMessage(updatedMessage);

  //       return reply;
  //     }),
  //   }));
  // };

  // removeReaction = (reaction: ReactionResponse<StreamChatGenerics>, message?: MessageResponse<StreamChatGenerics>) => {
  //   if (!message) return;

  //   this.state.next((current) => ({
  //     ...current,
  //     latestReplies: current.latestReplies.map((reply) => {
  //       if (reply.id !== message.id) return reply;

  //       // FIXME: this removeReaction API is weird (maybe clean it up later)
  //       const updatedMessage = current.channel?.state.removeReaction(reaction, message);
  //       if (updatedMessage) return formatMessage(updatedMessage);

  //       return reply;
  //     }),
  //   }));
  // };

  public markAsRead = async () => {
    const { channelData, read } = this.state.getLatestValue();
    const currentUserId = this.client.user?.id;

    const { unread_messages: unreadMessagesCount } = (currentUserId && read[currentUserId]) || {};

    if (!unreadMessagesCount) return;

    try {
      await this.client.post<EventAPIResponse<StreamChatGenerics>>(
        `${this.client.baseURL}/channels/${channelData?.type}/${channelData?.id}/read`,
        {
          thread_id: this.id,
        },
      );
    } catch {
      // ...
    } finally {
      // ...
    }
  };

  // moved from channel to thread directly (skipped getClient thing as this call does not need active WS connection)
  public queryReplies = ({
    sort = DEFAULT_SORT,
    limit = DEFAULT_PAGE_LIMIT,
    ...otherOptions
  }: QueryRepliesOptions<StreamChatGenerics> = {}) =>
    this.client.get<QueryRepliesApiResponse<StreamChatGenerics>>(`${this.client.baseURL}/messages/${this.id}/replies`, {
      sort: normalizeQuerySort(sort),
      limit,
      ...otherOptions,
    });

  // loadNextPage and loadPreviousPage rely on pagination id's calculated from previous requests
  // these functions exclude these options (id_lt, id_lte...) from their options to prevent unexpected pagination behavior
  public loadNextPage = async ({
    sort,
    limit = DEFAULT_PAGE_LIMIT,
  }: Pick<QueryRepliesOptions<StreamChatGenerics>, 'sort' | 'limit'> = {}) => {
    this.updateLocalState('loadingNextPage', true);

    const { loadingNextPage, nextId } = this.state.getLatestValue();

    if (loadingNextPage || nextId === null) return;

    try {
      const data = await this.queryReplies({
        id_gt: nextId,
        limit,
        sort,
      });

      const lastMessageId = data.messages.at(-1)?.id;

      this.state.next((current) => ({
        ...current,
        latestReplies: current.latestReplies.concat(data.messages.map(formatMessage)),
        nextId: data.messages.length < limit || !lastMessageId ? null : lastMessageId,
      }));
    } catch (error) {
      this.client.logger('error', (error as Error).message);
    } finally {
      this.updateLocalState('loadingNextPage', false);
    }
  };

  public loadPreviousPage = async ({
    sort,
    limit = DEFAULT_PAGE_LIMIT,
  }: Pick<QueryRepliesOptions<StreamChatGenerics>, 'sort' | 'limit'> = {}) => {
    const { loadingPreviousPage, previousId } = this.state.getLatestValue();

    if (loadingPreviousPage || previousId === null) return;

    this.updateLocalState('loadingPreviousPage', true);

    try {
      const data = await this.queryReplies({
        id_lt: previousId,
        limit,
        sort,
      });

      const firstMessageId = data.messages.at(0)?.id;

      this.state.next((current) => ({
        ...current,
        latestReplies: data.messages.map(formatMessage).concat(current.latestReplies),
        previousId: data.messages.length < limit || !firstMessageId ? null : firstMessageId,
      }));
    } catch (error) {
      this.client.logger('error', (error as Error).message);
      console.log(error);
    } finally {
      this.updateLocalState('loadingPreviousPage', false);
    }
  };
}

type ThreadManagerState<T extends ExtendableGenerics = DefaultGenerics> = {
  active: boolean;
  loadingNextPage: boolean;
  loadingPreviousPage: boolean;
  threadIdIndexMap: { [key: string]: number };
  threads: Thread<T>[];
  unreadThreads: {
    combinedCount: number;
    existingReorderedIds: string[];
    newIds: string[];
  };
  nextId?: string | null; // null means no next page available
  previousId?: string | null;
};

export class ThreadManager<T extends ExtendableGenerics = DefaultGenerics> {
  public readonly state: SimpleStateStore<ThreadManagerState<T>>;
  private client: StreamChat<T>;
  private unsubscribeFunctions: Set<() => void> = new Set();

  constructor({ client }: { client: StreamChat<T> }) {
    this.client = client;
    this.state = new SimpleStateStore<ThreadManagerState<T>>({
      active: false,
      threads: [],
      threadIdIndexMap: {},
      // TODO: re-think the naming
      unreadThreads: {
        // new threads or threads which have not been loaded and is not possible to paginate to anymore
        // as these threads received new replies which moved them up in the list - used for the badge
        newIds: [],
        // threads already loaded within the local state but will change position in `threads` array when
        // `loadUnreadThreads` gets called - used to calculate proper query limit
        existingReorderedIds: [],
        combinedCount: 0,
      },
      loadingNextPage: false,
      loadingPreviousPage: false,
      nextId: undefined,
      previousId: undefined,
    });

    // TODO: temporary - do not register handlers here but rather make Chat component have control over this
    this.registerSubscriptions();
  }

  // eslint-disable-next-line sonarjs/no-identical-functions
  private updateLocalState = <T extends InferStoreValueType<ThreadManager>>(key: keyof T, newValue: T[typeof key]) => {
    this.state.next((current) => ({
      ...current,
      [key]: newValue,
    }));
  };

  public activate = () => {
    this.updateLocalState('active', true);
  };

  public deactivate = () => {
    this.updateLocalState('active', false);
  };

  public registerSubscriptions = () => {
    if (this.unsubscribeFunctions.size) return;

    this.unsubscribeFunctions.add(
      // TODO: find out if there's a better version of doing this (client.user is obviously not reactive and unitialized during construction)
      this.client.on('health.check', (event) => {
        if (!event.me) return;

        const { unread_threads: unreadThreadsCount } = event.me;

        // TODO: extract to a reusable function
        this.state.next((current) => ({
          ...current,
          unreadThreads: { ...current.unreadThreads, combinedCount: unreadThreadsCount },
        }));
      }).unsubscribe,
    );

    this.unsubscribeFunctions.add(
      this.client.on('notification.mark_read', (event) => {
        if (typeof event.unread_threads === 'undefined') return;

        const { unread_threads: unreadThreadsCount } = event;

        this.state.next((current) => ({
          ...current,
          unreadThreads: { ...current.unreadThreads, combinedCount: unreadThreadsCount },
        }));
      }).unsubscribe,
    );

    // TODO: maybe debounce instead?
    const throttledHandleConnectionRecovery = throttle(
      () => {
        // TODO: cancel possible in-progress queries (loadNextPage...)

        this.state.next((current) => ({
          ...current,
          threads: [],
          unreadThreads: { ...current.unreadThreads, newIds: [], existingReorderedIds: [] },
          nextId: undefined,
          previousId: undefined,
          isStateStale: false,
        }));

        this.loadNextPage();
      },
      DEFAULT_CONNECTION_RECOVERY_THROTTLE_DURATION,
      { leading: true, trailing: true },
    );

    this.unsubscribeFunctions.add(
      this.client.on('connection.recovered', throttledHandleConnectionRecovery).unsubscribe,
    );

    this.unsubscribeFunctions.add(
      this.state.subscribeWithSelector(
        (nextValue) => [nextValue.active],
        ([active]) => {
          if (!active) return;

          // automatically clear all the changes that happened "behind the scenes"
          this.loadUnreadThreads();
        },
      ),
    );

    const handleThreadsChange: Handler<readonly [Thread<T>[]]> = ([newThreads], previouslySelectedValue) => {
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

    // TODO?: handle parent message deleted (extend unreadThreads \w deletedIds?)
    // delete locally (manually) and run rest of the query loadUnreadThreads
    // requires BE support (filter deleted threads)

    const handleNewReply = (event: Event) => {
      if (!event.message || !event.message.parent_id) return;
      const parentId = event.message.parent_id;

      const {
        threadIdIndexMap,
        nextId,
        threads,
        unreadThreads: { newIds, existingReorderedIds },
      } = this.state.getLatestValue();

      // prevents from handling replies until the threads have been loaded
      // (does not fill information for "unread threads" banner to appear)
      if (!threads.length && nextId !== null) return;

      const existsLocally = typeof threadIdIndexMap[parentId] !== 'undefined';

      if (existsLocally && !existingReorderedIds.includes(parentId)) {
        return this.state.next((current) => ({
          ...current,
          unreadThreads: {
            ...current.unreadThreads,
            existingReorderedIds: current.unreadThreads.existingReorderedIds.concat(parentId),
          },
        }));
      }

      if (!existsLocally && !newIds.includes(parentId)) {
        return this.state.next((current) => ({
          ...current,
          unreadThreads: {
            ...current.unreadThreads,
            newIds: current.unreadThreads.newIds.concat(parentId),
          },
        }));
      }
    };

    this.unsubscribeFunctions.add(this.client.on('notification.thread_message_new', handleNewReply).unsubscribe);
  };

  public deregisterSubscriptions = () => {
    this.unsubscribeFunctions.forEach((cleanupFunction) => cleanupFunction());
  };

  // TODO: add activity status, trigger this method when this instance becomes active
  public loadUnreadThreads = async () => {
    // TODO: redo this whole thing
    // - do reload with limit which is currently loaded amount of threads but less than max (25) - not working well
    // - ask BE to allow you to do {id: {$in: [...]}} (always push new to the top) - custom ordering might not work
    // - re-load 25 at most, drop rest? - again, might not fit custom ordering - at which point the "in" option seems better
    const {
      threads,
      unreadThreads: { newIds, existingReorderedIds },
    } = this.state.getLatestValue();

    const triggerLimit = newIds.length + existingReorderedIds.length;

    if (!triggerLimit) return;

    const combinedLimit = threads.length + newIds.length;

    try {
      const data = await this.client.queryThreads({
        limit: combinedLimit <= MAX_QUERY_THREADS_LIMIT ? combinedLimit : MAX_QUERY_THREADS_LIMIT,
      });

      this.state.next((current) => {
        // merge existing and new threads, filter out re-ordered
        const newThreads: Thread<T>[] = [];
        const existingThreadIdsToFilterOut: string[] = [];

        for (const thread of data.threads) {
          const existingThread: Thread<T> | undefined = current.threads[current.threadIdIndexMap[thread.id]];

          // ditch threads which report stale state and use new one
          // *(state can be considered as stale when channel associated with the thread stops being watched)
          newThreads.push(existingThread && !existingThread.hasStaleState ? existingThread : thread);

          if (existingThread) existingThreadIdsToFilterOut.push(existingThread.id);
        }

        const existingFilteredThreads = current.threads.filter(({ id }) => !existingThreadIdsToFilterOut.includes(id));

        return {
          ...current,
          unreadThreads: { ...current.unreadThreads, newIds: [], existingReorderedIds: [] }, // reset
          threads: newThreads.concat(existingFilteredThreads),
        };
      });
    } catch (error) {
      // TODO: loading states
      console.error(error);
    } finally {
      console.log('...');
    }
  };

  // remove `next` from options as that is handled internally
  public loadNextPage = async (options: Omit<QueryThreadsOptions, 'next'> = {}) => {
    const { nextId, loadingNextPage } = this.state.getLatestValue();

    if (nextId === null || loadingNextPage) return;

    // FIXME: redo defaults
    const optionsWithDefaults: QueryThreadsOptions = {
      limit: 10,
      participant_limit: 10,
      reply_limit: 10,
      watch: true,
      next: nextId,
      ...options,
    };

    this.state.next((current) => ({ ...current, loadingNextPage: true }));

    try {
      const data = await this.client.queryThreads(optionsWithDefaults);
      this.state.next((current) => ({
        ...current,
        threads: current.threads.concat(data.threads),
        nextId: data.next ?? null,
      }));
    } catch (error) {
      this.client.logger('error', (error as Error).message);
    } finally {
      this.state.next((current) => ({ ...current, loadingNextPage: false }));
    }
  };

  public loadPreviousPage = () => {
    // TODO: impl
  };
}
