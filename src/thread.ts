import { StreamChat } from './client';
import { Channel } from './channel';
import {
  DefaultGenerics,
  ExtendableGenerics,
  MessageResponse,
  ThreadResponse,
  FormatMessageResponse,
  // ReactionResponse,
  UserResponse,
  Event,
  QueryThreadsOptions,
  MessagePaginationOptions,
  AscDesc,
  GetRepliesAPIResponse,
} from './types';
import { addToMessageList, formatMessage, normalizeQuerySort } from './utils';
import { InferStoreValueType, SimpleStateStore } from './store/SimpleStateStore';

type ThreadReadStatus<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = Record<
  string,
  {
    last_read: string;
    last_read_message_id: string;
    lastRead: Date;
    unread_messages: number;
    user: UserResponse<StreamChatGenerics>;
  }
>;

type QueryRepliesApiResponse<T extends ExtendableGenerics> = GetRepliesAPIResponse<T>;

type QueryRepliesOptions<T extends ExtendableGenerics> = {
  sort?: { created_at: AscDesc }[];
} & MessagePaginationOptions & { user?: UserResponse<T>; user_id?: string };

type ThreadState<T extends ExtendableGenerics> = {
  createdAt: string;
  deletedAt: string;
  latestReplies: Array<FormatMessageResponse<T>>;
  loadingNextPage: boolean;
  loadingPreviousPage: boolean;
  nextId: string | null;
  parentMessage: FormatMessageResponse<T> | undefined;
  participants: ThreadResponse<T>['thread_participants'];
  previousId: string | null;
  read: ThreadReadStatus<T>;
  replyCount: number;
  updatedAt: string;

  channel?: Channel<T>;
  channelData?: ThreadResponse<T>['channel'];
};

const DEFAULT_PAGE_LIMIT = 15;
const DEFAULT_SORT: { created_at: AscDesc }[] = [{ created_at: -1 }];

/**
 * IDEA: request batching
 *
 * When the internet connection drops and during downtime threads receive messages, each thread instance should
 * do a re-fetch with the latest known message in its list (loadNextPage) once connection restores. In case there are 20+
 * thread instances this would cause a creation of 20+requests, instead going through a "batching" mechanism this would be aggregated
 * and requested only once.
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
    registerSubscriptions = true,
  }: {
    client: StreamChat<StreamChatGenerics>;
    registerSubscriptions?: boolean;
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
        lastRead: new Date(cv.last_read),
      };
      return pv;
    }, {});

    const placeholderDate = new Date().toISOString();

    this.state = new SimpleStateStore<ThreadState<StreamChatGenerics>>({
      channelData: threadData.channel, // not channel instance
      channel: threadData.channel && client.channel(threadData.channel.type, threadData.channel.id),
      createdAt: threadData.created_at ?? placeholderDate,
      deletedAt: threadData.deleted_at ?? placeholderDate,
      latestReplies: latestReplies.map(formatMessage),
      // TODO: check why this is sometimes undefined
      parentMessage: threadData.parent_message && formatMessage(threadData.parent_message),
      participants: threadParticipants,
      read,
      replyCount,
      updatedAt: threadData.updated_at ?? placeholderDate,

      nextId: latestReplies.at(-1)?.id ?? null,
      previousId: latestReplies.at(0)?.id ?? null,
      loadingNextPage: false,
      loadingPreviousPage: false,
    });

    // parent_message_id is being re-used as thread.id
    this.id = threadData.parent_message_id ?? `thread-no-id-${placeholderDate}`; // FIXME: use nanoid instead
    this.client = client;

    // TODO: temporary - do not register handlers here but rather make ThreadList component have control over this
    if (registerSubscriptions) this.registerSubscriptions();
  }

  get channel() {
    return this.state.getLatestValue().channel;
  }

  private updateLocalState = <T extends InferStoreValueType<Thread>>(key: keyof T, newValue: T[typeof key]) => {
    this.state.next((current) => ({
      ...current,
      [key]: newValue,
    }));
  };

  /**
   * Makes Thread instance listen to events and adjust its state accordingly.
   */
  public registerSubscriptions = () => {
    // check whether this instance has subscriptions and is already listening for changes
    if (this.unsubscribeFunctions.size) return;

    this.unsubscribeFunctions.add(
      this.client.on('notification.thread_message_new', (event) => {
        if (!event.message) return;
        if (event.message.parent_id !== this.id) return;

        // deal with timestampChanged only related to local user (optimistic updates)
        this.upsertReply({ message: event.message, timestampChanged: event.message.user?.id === this.client.user?.id });
      }).unsubscribe,
    );

    const handleMessageUpdate = (event: Event<StreamChatGenerics>) => {
      if (!event.message) return;
      if (event.message.parent_id !== this.id) return;

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
      const newData = { ...current, parentMessage: formatMessage(message) };

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

  public markAsRead = () => {
    // TODO: impl
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

// TODO?:
// class ThreadState
// class ThreadManagerState

type ThreadManagerState<T extends ExtendableGenerics = DefaultGenerics> = {
  loadingNextPage: boolean;
  loadingPreviousPage: boolean;
  threadIdIndexMap: { [key: string]: number }; // TODO: maybe does not need to live here
  threads: Thread<T>[];
  unreadThreads: {
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
      threads: [],
      threadIdIndexMap: {},
      unreadThreads: {
        // new threads or threads which have not been loaded and is not possible to paginate to anymore
        // as these threads received new replies which moved them up in the list - used for the badge
        newIds: [],
        // threads already loaded within the local state but will change positin in `threads` array when
        // `loadUnreadThreads` gets called - used to calculate proper query limit
        existingReorderedIds: [],
      },
      loadingNextPage: false,
      loadingPreviousPage: false,
      nextId: undefined,
      previousId: undefined,
    });

    this.registerSubscriptions();
  }

  public registerSubscriptions = () => {
    this.unsubscribeFunctions.add(
      // re-generate map each time the threads array changes
      this.state.subscribeWithSelector(
        (nextValue) => [nextValue.threads],
        ([threads]) => {
          const newThreadIdIndexMap = threads.reduce<ThreadManagerState['threadIdIndexMap']>((map, thread, index) => {
            map[thread.id] ??= index;
            return map;
          }, {});

          this.state.next((current) => ({ ...current, threadIdIndexMap: newThreadIdIndexMap }));
        },
        true,
      ),
    );

    const handleNewReply = (event: Event) => {
      if (!event.message || !event.message.parent_id) return;
      const parentId = event.message.parent_id;

      const {
        threadIdIndexMap,
        unreadThreads: { newIds, existingReorderedIds },
      } = this.state.getLatestValue();

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
    // TODO: not sure, if this needs to be here, wait for Vish to do the check that "notification.thread_message_new"
    // comes in as expected
    this.unsubscribeFunctions.add(this.client.on('message.new', handleNewReply).unsubscribe);
  };

  public deregisterSubscriptions = () => {
    this.unsubscribeFunctions.forEach((cleanupFunction) => cleanupFunction());
  };

  public loadUnreadThreads = async () => {
    const {
      unreadThreads: { newIds, existingReorderedIds },
    } = this.state.getLatestValue();

    const combinedLimit = newIds.length + existingReorderedIds.length;

    if (!combinedLimit) return;

    try {
      const data = await this.client.queryThreads({ limit: combinedLimit });

      // TODO: test thoroughly
      this.state.next((current) => {
        // merge existing and new threads, filter out re-ordered

        const newThreads: Thread<T>[] = [];

        for (const thread of data.threads) {
          const existingThread: Thread<T> | undefined = current.threads[current.threadIdIndexMap[thread.id]];

          newThreads.push(existingThread ?? thread);

          // TODO: remove from here once registration is moved to ThreadManager.registerThreadSubscriptions() and <Chat> to orchestrate it all
          if (existingThread) thread.deregisterSubscriptions();
        }

        const existingFilteredThreads = current.threads.filter((t) =>
          current.unreadThreads.existingReorderedIds.includes(t.id),
        );

        return {
          ...current,
          unreadThreadIds: { newIds: [], existingReorderedIds: [] }, // reset
          threads: newThreads.concat(existingFilteredThreads),
        };
      });
    } catch (error) {
      // TODO: loading states
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
