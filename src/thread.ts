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

/**
 * Targeted events?
 *
 * <message.id>.message.updated | <message.parent_id>.message.updated
 */

export class Thread<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> {
  public readonly state: SimpleStateStore<ThreadState<StreamChatGenerics>>;
  public id: string;

  private client: StreamChat<StreamChatGenerics>;
  private unsubscribeFunctions: Set<() => void> = new Set();
  private failedRepliesMap: Map<string, FormatMessageResponse<StreamChatGenerics>> = new Map();

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
      deletedAt: threadData.parent_message?.deleted_at ? new Date(threadData.parent_message.deleted_at) : null,
      latestReplies: latestReplies.map(formatMessage),
      // TODO: check why this is sometimes undefined
      parentMessage: threadData.parent_message && formatMessage(threadData.parent_message),
      participants: threadParticipants,
      // actual read state in-sync with BE values
      read,
      staggeredRead: read,
      replyCount,
      updatedAt: threadData.updated_at ? new Date(threadData.updated_at) : null,

      nextId: latestReplies.at(-1)?.id ?? null,
      // TODO: check whether the amount of replies is less than replies_limit (thread.queriedWithOptions = {...})
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

  // take state of one instance and merge it to the current instance
  public partiallyReplaceState = ({ thread }: { thread: Thread<StreamChatGenerics> }) => {
    if (thread === this) return; // skip if the instances are the same
    if (thread.id !== this.id) return; // disallow merging of states of instances that do not match ids

    const {
      read,
      staggeredRead,
      replyCount,
      latestReplies,
      parentMessage,
      participants,
      createdAt,
      deletedAt,
      updatedAt,
      nextId,
      previousId,
      channelData,
    } = thread.state.getLatestValue();

    this.state.next((current) => {
      const failedReplies = Array.from(this.failedRepliesMap.values());

      return {
        ...current,
        read,
        staggeredRead,
        replyCount,
        latestReplies: latestReplies.concat(failedReplies),
        parentMessage,
        participants,
        createdAt,
        deletedAt,
        updatedAt,
        nextId,
        previousId,
        channelData,
        isStateStale: false,
      };
    });
  };

  /**
   * Makes Thread instance listen to events and adjust its state accordingly.
   */
  // eslint-disable-next-line sonarjs/cognitive-complexity
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

    // TODO: use debounce instead
    const throttledHandleStateRecovery = throttle(
      async () => {
        // this.updateLocalState('recovering', true);

        // TODO: add online status to prevent recovery attempts during the time the connection is down
        try {
          const thread = await this.client.getThread(this.id, { watch: true });

          this.partiallyReplaceState({ thread });
        } catch (error) {
          // TODO: handle recovery fail
          console.warn(error);
        } finally {
          // this.updateLocalState('recovering', false);
        }
      },
      DEFAULT_CONNECTION_RECOVERY_THROTTLE_DURATION,
      {
        leading: true,
        trailing: true,
      },
    );

    // when the thread becomes active or it becomes stale while active (channel stops being watched or connection drops)
    // the recovery handler pulls its latest state to replace with the current one
    // failed messages are preserved and appended to the newly recovered replies
    this.unsubscribeFunctions.add(
      this.state.subscribeWithSelector(
        (nextValue) => [nextValue.active, nextValue.isStateStale],
        async ([active, isStateStale]) => {
          // TODO: cancel in-progress recovery?
          if (active && isStateStale) throttledHandleStateRecovery();
        },
      ),
    );

    // this.unsubscribeFunctions.add(
    //   // mark local state as stale when connection drops
    //   this.client.on('connection.changed', (event) => {
    //     if (typeof event.online === 'undefined') return;

    //     // state is already stale or connection recovered
    //     if (this.state.getLatestValue().isStateStale || event.online) return;

    //     this.updateLocalState('isStateStale', true);
    //   }).unsubscribe,
    // );

    this.unsubscribeFunctions.add(
      // TODO: figure out why the current user is not receiving this event
      this.client.on('user.watching.stop', (event) => {
        const currentUserId = this.client.user?.id;
        if (!event.channel || !event.user || !currentUserId || currentUserId !== event.user.id) return;

        const { channelData } = this.state.getLatestValue();

        if (!channelData || event.channel.cid !== channelData.cid) return;

        this.updateLocalState('isStateStale', true);
      }).unsubscribe,
    );

    this.unsubscribeFunctions.add(
      this.client.on('message.new', (event) => {
        const currentUserId = this.client.user?.id;
        if (!event.message || !currentUserId) return;
        if (event.message.parent_id !== this.id) return;

        if (this.failedRepliesMap.has(event.message.id)) {
          this.failedRepliesMap.delete(event.message.id);
        }

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
  };

  public incrementOwnUnreadCount = () => {
    const currentUserId = this.client.user?.id;
    if (!currentUserId) return;
    // TODO: permissions (read events) - use channel._countMessageAsUnread
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
    const formattedMessage = formatMessage(message);

    // store failed message to reference in state merging
    if (message.status === 'failed') {
      this.failedRepliesMap.set(formattedMessage.id, formattedMessage);
    }

    this.state.next((current) => ({
      ...current,
      latestReplies: addToMessageList(current.latestReplies, formattedMessage, timestampChanged),
    }));
  };

  public updateParentMessage = (message: MessageResponse<StreamChatGenerics>) => {
    if (message.id !== this.id) {
      throw new Error('Message does not belong to this thread');
    }

    this.state.next((current) => {
      const formattedMessage = formatMessage(message);

      const newData: typeof current = {
        ...current,
        parentMessage: formattedMessage,
        replyCount: message.reply_count ?? current.replyCount,
        // TODO: probably should not have to do this
        deletedAt: formattedMessage.deleted_at,
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
  isOnline: boolean;
  lastConnectionDownAt: Date | null;
  loadingNextPage: boolean;
  loadingPreviousPage: boolean;
  threadIdIndexMap: { [key: string]: number };
  threads: Thread<T>[];
  unreadThreadsCount: number;
  unseenThreadIds: string[];
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
      isOnline: false,
      unreadThreadsCount: 0,
      // new threads or threads which have not been loaded and is not possible to paginate to anymore
      // as these threads received new replies which moved them up in the list - used for the badge
      unseenThreadIds: [],
      lastConnectionDownAt: null,
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

  // eslint-disable-next-line sonarjs/cognitive-complexity
  public registerSubscriptions = () => {
    if (this.unsubscribeFunctions.size) return;

    const handleUnreadThreadsCountChange = (event: Event) => {
      const { unread_threads: unreadThreadsCount } = event.me ?? event;

      if (typeof unreadThreadsCount === 'undefined') return;

      this.state.next((current) => ({
        ...current,
        unreadThreadsCount,
      }));
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

        try {
          // FIXME: syncing does not work for me
          await this.client.sync(Array.from(channelCids), lastConnectionDownAt.toISOString(), { watch: true });
          this.updateLocalState('lastConnectionDownAt', null);
        } catch (error) {
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
          this.updateLocalState('lastConnectionDownAt', new Date());
        }

        this.updateLocalState('isOnline', event.online);
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

    // TODO: handle parent message hard-deleted (extend state with \w hardDeletedThreadIds?)

    const handleNewReply = (event: Event) => {
      if (!event.message || !event.message.parent_id) return;
      const parentId = event.message.parent_id;

      const { threadIdIndexMap, nextId, threads, unseenThreadIds } = this.state.getLatestValue();

      // prevents from handling replies until the threads have been loaded
      // (does not fill information for "unread threads" banner to appear)
      if (!threads.length && nextId !== null) return;

      const existsLocally = typeof threadIdIndexMap[parentId] !== 'undefined';

      if (existsLocally || unseenThreadIds.includes(parentId)) return;

      return this.state.next((current) => ({
        ...current,
        unseenThreadIds: current.unseenThreadIds.concat(parentId),
      }));
    };

    this.unsubscribeFunctions.add(this.client.on('notification.thread_message_new', handleNewReply).unsubscribe);
  };

  public deregisterSubscriptions = () => {
    // TODO: think about state reset or at least invalidation
    this.unsubscribeFunctions.forEach((cleanupFunction) => cleanupFunction());
  };

  public reload = async () => {
    const { threads, unseenThreadIds } = this.state.getLatestValue();

    if (!unseenThreadIds.length) return;

    const combinedLimit = threads.length + unseenThreadIds.length;

    try {
      const data = await this.client.queryThreads({
        limit: combinedLimit <= MAX_QUERY_THREADS_LIMIT ? combinedLimit : MAX_QUERY_THREADS_LIMIT,
      });

      const { threads, threadIdIndexMap } = this.state.getLatestValue();

      const newThreads: Thread<T>[] = [];
      // const existingThreadIdsToFilterOut: string[] = [];

      for (const thread of data.threads) {
        const existingThread: Thread<T> | undefined = threads[threadIdIndexMap[thread.id]];

        newThreads.push(existingThread ?? thread);

        // replace state of threads which report stale state
        // *(state can be considered as stale when channel associated with the thread stops being watched)
        if (existingThread && existingThread.hasStaleState) {
          existingThread.partiallyReplaceState({ thread });
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
        // TODO: extract merging logic and allow loadNextPage to merge as well (in combination with the cache thing)
        threads: newThreads, //.concat(existingFilteredThreads),
        nextId: data.next ?? null, // re-adjust next cursor
      }));
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
        threads: data.threads.length ? current.threads.concat(data.threads) : current.threads,
        nextId: data.next ?? null,
      }));
    } catch (error) {
      this.client.logger('error', (error as Error).message);
    } finally {
      this.state.next((current) => ({ ...current, loadingNextPage: false }));
    }
  };

  private loadPreviousPage = () => {
    // TODO: impl?
  };
}
