import { StreamChat } from './client';
import { Channel } from './channel';
import {
  DefaultGenerics,
  ExtendableGenerics,
  MessageResponse,
  ThreadResponse,
  FormatMessageResponse,
  ReactionResponse,
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

// const formatReadState = () =>

type QueryRepliesApiResponse<T extends ExtendableGenerics> = GetRepliesAPIResponse<T>;

type ThreadState<StreamChatGenerics extends ExtendableGenerics> = {
  createdAt: string;
  deletedAt: string;
  latestReplies: Array<FormatMessageResponse<StreamChatGenerics>>;
  loadingNextPage: boolean;
  loadingPreviousPage: boolean;
  nextId: string | null;
  parentMessage: FormatMessageResponse<StreamChatGenerics> | undefined;
  participants: ThreadResponse<StreamChatGenerics>['thread_participants'];
  previousId: string | null;
  read: ThreadReadStatus<StreamChatGenerics>;
  replyCount: number;
  updatedAt: string;

  channel?: Channel<StreamChatGenerics>;
  channelData?: ThreadResponse<StreamChatGenerics>['channel'];
};

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
    // TODO: move to function "formatReadStatus"
    const {
      read: unformattedRead = [],
      latest_replies: latestReplies = [],
      thread_participants: threadParticipants = [],
      reply_count: replyCount = 0,
    } = threadData;
    // TODO: check why this one is sometimes undefined (should return empty array instead)
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
    this.id = threadData.parent_message_id ?? `thread-${placeholderDate}`; // FIXME: use instead nanoid
    this.client = client;

    if (registerEventHandlers) this.registerEventHandlers();
  }

  get channel() {
    return this.state.getLatestValue().channel;
  }

  private registerEventHandlers = () => {
    this.unsubscribeFunctions.add(
      this.client.on('notification.thread_message_new', (event) => {
        if (!event.message) return;
        if (event.message.parent_id !== this.id) return;

        this.addReply({ message: event.message });
      }).unsubscribe,
    );

    const handleMessageUpdate = (event: Event<StreamChatGenerics>) => {
      if (!event.message) return;
      if (event.message.parent_id !== this.id) return;

      this.updateParentMessageOrReply(event.message);
    };
    this.unsubscribeFunctions.add(this.client.on('message.updated', handleMessageUpdate).unsubscribe);
    this.unsubscribeFunctions.add(this.client.on('message.deleted', handleMessageUpdate).unsubscribe);
    this.unsubscribeFunctions.add(this.client.on('reaction.new', handleMessageUpdate).unsubscribe);
    this.unsubscribeFunctions.add(this.client.on('reaction.deleted', handleMessageUpdate).unsubscribe);
  };

  private updateLocalState = <T extends InferStoreValueType<Thread>>(key: keyof T, newValue: T[typeof key]) => {
    this.state.next((current) => ({
      ...current,
      [key]: newValue,
    }));
  };

  // TODO: rename to upsert?
  // does also update through addToMessageList function
  addReply = ({ message }: { message: MessageResponse<StreamChatGenerics> }) => {
    if (message.parent_id !== this.id) {
      throw new Error('Message does not belong to this thread');
    }

    this.state.next((current) => ({
      ...current,
      latestReplies: addToMessageList(
        current.latestReplies,
        formatMessage(message),
        message.user?.id === this.client.user?.id, // deal with timestampChanged only related to local user (optimistic updates)
      ),
    }));
  };

  /**
   * @deprecated not sure whether we need this
   */
  updateReply = (message: MessageResponse<StreamChatGenerics>) => {
    this.state.next((current) => ({
      ...current,
      latestReplies: current.latestReplies.map((m) => {
        if (m.id === message.id) return formatMessage(message);
        return m;
      }),
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
        newData['channel'] = this.client.channel(message.channel.type, message.channel.id);
      }
      return newData;
    });
  };

  updateParentMessageOrReply(message: MessageResponse<StreamChatGenerics>) {
    if (message.parent_id === this.id) {
      this.updateReply(message);
    }

    if (!message.parent_id && message.id === this.id) {
      this.updateParentMessage(message);
    }
  }

  addReaction(
    reaction: ReactionResponse<StreamChatGenerics>,
    message?: MessageResponse<StreamChatGenerics>,
    enforceUnique?: boolean,
  ) {
    if (!message) return;

    this.state.next((current) => ({
      ...current,
      latestReplies: current.latestReplies.map((reply) => {
        if (reply.id !== message.id) return reply;

        // FIXME: this addReaction API weird (maybe clean it up later)
        const updatedMessage = current.channel?.state.addReaction(reaction, message, enforceUnique);
        if (updatedMessage) return formatMessage(updatedMessage);

        return reply;
      }),
    }));
  }

  removeReaction(reaction: ReactionResponse<StreamChatGenerics>, message?: MessageResponse<StreamChatGenerics>) {
    if (!message) return;

    this.state.next((current) => ({
      ...current,
      latestReplies: current.latestReplies.map((reply) => {
        if (reply.id !== message.id) return reply;

        // FIXME: this removeReaction API is weird (maybe clean it up later)
        const updatedMessage = current.channel?.state.removeReaction(reaction, message);
        if (updatedMessage) return formatMessage(updatedMessage);

        return reply;
      }),
    }));
  }

  public queryReplies = ({
    sort = [{ created_at: -1 }],
    ...otherOptions
  }: {
    sort?: { created_at: AscDesc }[];
  } & MessagePaginationOptions & { user?: UserResponse<StreamChatGenerics>; user_id?: string } = {}) =>
    this.client.get<QueryRepliesApiResponse<StreamChatGenerics>>(`${this.client.baseURL}/messages/${this.id}/replies`, {
      sort: normalizeQuerySort(sort),
      ...otherOptions,
    });

  loadNextPage = async (/* TODO: options? */) => {
    this.updateLocalState('loadingNextPage', true);

    const { loadingNextPage, nextId } = this.state.getLatestValue();

    if (loadingNextPage || nextId === null) return;

    try {
      const data = await this.queryReplies({
        id_gt: nextId,
        limit: 10,
      });
    } catch (error) {
      this.client.logger('error', (error as Error).message);
    } finally {
      this.updateLocalState('loadingNextPage', false);
    }
  };

  loadPreviousPage = async (/* TODO: options? */) => {
    const { loadingPreviousPage, previousId } = this.state.getLatestValue();
    if (loadingPreviousPage || previousId === null) return;

    this.updateLocalState('loadingPreviousPage', true);

    try {
      const data = await this.queryReplies({
        id_lt: previousId,
        limit: 10,
      });

      this.state.next((current) => ({
        ...current,
        latestReplies: data.messages.map(formatMessage).concat(current.latestReplies),
        // TODO: previousId: res.len < opts.limit ? null : res.at(0).id
      }));
    } catch (error) {
      this.client.logger('error', (error as Error).message);
      console.log(error);
    } finally {
      this.updateLocalState('loadingPreviousPage', false);
    }
  };
}

// TODO:
// class ThreadState
// class ThreadManagerState

export class ThreadManager<T extends ExtendableGenerics = DefaultGenerics> {
  public readonly state: SimpleStateStore<{
    loadingNextPage: boolean;
    loadingPreviousPage: boolean;
    threads: Thread<T>[];
    unreadCount: number;
    nextId?: string | null; // null means no next page available
    previousId?: string | null;
  }>;
  private client: StreamChat<T>;

  constructor({ client }: { client: StreamChat<T> }) {
    this.client = client;
    this.state = new SimpleStateStore({
      threads: [] as Thread<T>[],
      unreadCount: 0,
      loadingNextPage: false as boolean, // WHAT IN THE FUCK?
      loadingPreviousPage: false as boolean,
      // nextId: undefined,
      // previousId: undefined,
    });
  }

  // TODO: maybe will use?
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
