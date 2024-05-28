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

export class Thread<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> {
  public readonly state: SimpleStateStore<ThreadState<StreamChatGenerics>>;
  public id: string;
  private client: StreamChat<StreamChatGenerics>;
  private unsubscribeFunctions: Set<() => void> = new Set();

  constructor({
    client,
    threadData = {},
    registerEventHandlers = true,
  }: {
    client: StreamChat<StreamChatGenerics>;
    registerEventHandlers?: boolean;
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
    this.id = threadData.parent_message_id ?? `thread-no-id-${placeholderDate}`; // FIXME: use instead nanoid
    this.client = client;

    // TODO: temporary - do not register handlers here but rather make ThreadList component have control over this
    if (registerEventHandlers) this.registerEventHandlers();
  }

  get channel() {
    return this.state.getLatestValue().channel;
  }

  /**
   * Makes Thread instance listen to events and adjust its state accordingly.
   */
  public registerEventHandlers = () => {
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

  public deregisterEventHandlers = () => {
    this.unsubscribeFunctions.forEach((cleanupFunction) => cleanupFunction());
    // TODO: stop watching
  };

  private updateLocalState = <T extends InferStoreValueType<Thread>>(key: keyof T, newValue: T[typeof key]) => {
    this.state.next((current) => ({
      ...current,
      [key]: newValue,
    }));
  };

  upsertReply = ({
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

  updateParentMessage = (message: MessageResponse<StreamChatGenerics>) => {
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

  updateParentMessageOrReply = (message: MessageResponse<StreamChatGenerics>) => {
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
  loadNextPage = async ({
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

  loadPreviousPage = async ({
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
  threads: Thread<T>[];
  unreadCount: number;
  nextId?: string | null; // null means no next page available
  previousId?: string | null;
};

export class ThreadManager<T extends ExtendableGenerics = DefaultGenerics> {
  public readonly state: SimpleStateStore<ThreadManagerState<T>>;
  private client: StreamChat<T>;

  constructor({ client }: { client: StreamChat<T> }) {
    this.client = client;
    this.state = new SimpleStateStore<ThreadManagerState<T>>({
      threads: [] as Thread<T>[],
      unreadCount: 0,
      loadingNextPage: false,
      loadingPreviousPage: false,
      nextId: undefined,
      previousId: undefined,
    });
  }

  // private threadIndexMap = new Map<string, number>();

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
