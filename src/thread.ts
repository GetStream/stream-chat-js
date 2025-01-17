import type { Channel } from './channel';
import type { StreamChat } from './client';
import { StateStore } from './store';
import type {
  AscDesc,
  DefaultGenerics,
  EventTypes,
  ExtendableGenerics,
  FormatMessageResponse,
  MessagePaginationOptions,
  MessageResponse,
  ReadResponse,
  ThreadResponse,
  ThreadResponseCustomData,
  UserResponse,
} from './types';
import { addToMessageList, findIndexInSortedArray, formatMessage, throttle } from './utils';

type QueryRepliesOptions<SCG extends ExtendableGenerics> = {
  sort?: { created_at: AscDesc }[];
} & MessagePaginationOptions & { user?: UserResponse<SCG>; user_id?: string };

export type ThreadState<SCG extends ExtendableGenerics = DefaultGenerics> = {
  /**
   * Determines if the thread is currently opened and on-screen. When the thread is active,
   * all new messages are immediately marked as read.
   */
  active: boolean;
  channel: Channel<SCG>;
  createdAt: Date;
  custom: ThreadResponseCustomData;
  deletedAt: Date | null;
  isLoading: boolean;
  isStateStale: boolean;
  pagination: ThreadRepliesPagination;
  /**
   * Thread is identified by and has a one-to-one relation with its parent message.
   * We use parent message id as a thread id.
   */
  parentMessage: FormatMessageResponse<SCG>;
  participants: ThreadResponse<SCG>['thread_participants'];
  read: ThreadReadState;
  replies: Array<FormatMessageResponse<SCG>>;
  replyCount: number;
  title: string;
  updatedAt: Date | null;
};

export type ThreadRepliesPagination = {
  isLoadingNext: boolean;
  isLoadingPrev: boolean;
  nextCursor: string | null;
  prevCursor: string | null;
};

export type ThreadUserReadState<SCG extends ExtendableGenerics = DefaultGenerics> = {
  lastReadAt: Date;
  unreadMessageCount: number;
  user: UserResponse<SCG>;
  lastReadMessageId?: string;
};

export type ThreadReadState<SCG extends ExtendableGenerics = DefaultGenerics> = Record<
  string,
  ThreadUserReadState<SCG> | undefined
>;

const DEFAULT_PAGE_LIMIT = 50;
const DEFAULT_SORT: { created_at: AscDesc }[] = [{ created_at: -1 }];
const MARK_AS_READ_THROTTLE_TIMEOUT = 1000;
// TODO: remove this once we move to API v2
export const THREAD_RESPONSE_RESERVED_KEYS: Record<keyof ThreadResponse, true> = {
  channel: true,
  channel_cid: true,
  created_at: true,
  created_by_user_id: true,
  parent_message_id: true,
  title: true,
  updated_at: true,
  latest_replies: true,
  active_participant_count: true,
  deleted_at: true,
  last_message_at: true,
  participant_count: true,
  reply_count: true,
  read: true,
  thread_participants: true,
  created_by: true,
  parent_message: true,
};

// TODO: remove this once we move to API v2
const constructCustomDataObject = <T extends ThreadResponse>(threadData: T) => {
  const custom: ThreadResponseCustomData = {};

  for (const key in threadData) {
    if (THREAD_RESPONSE_RESERVED_KEYS[key as keyof ThreadResponse]) {
      continue;
    }

    const customKey = key as keyof ThreadResponseCustomData;

    custom[customKey] = threadData[customKey];
  }

  return custom;
};

export class Thread<SCG extends ExtendableGenerics = DefaultGenerics> {
  public readonly state: StateStore<ThreadState<SCG>>;
  public readonly id: string;

  private client: StreamChat<SCG>;
  private unsubscribeFunctions: Set<() => void> = new Set();
  private failedRepliesMap: Map<string, FormatMessageResponse<SCG>> = new Map();

  constructor({ client, threadData }: { client: StreamChat<SCG>; threadData: ThreadResponse<SCG> }) {
    const channel = client.channel(threadData.channel.type, threadData.channel.id, {
      name: threadData.channel.name,
    });
    channel._hydrateMembers({ members: threadData.channel.members ?? [], overrideCurrentState: false });

    // For when read object is undefined and due to that unreadMessageCount for
    // the current user isn't being incremented on message.new
    const placeholderReadResponse: ReadResponse[] = client.userID
      ? [{ user: { id: client.userID }, unread_messages: 0, last_read: new Date().toISOString() }]
      : [];

    this.state = new StateStore<ThreadState<SCG>>({
      // local only
      active: false,
      isLoading: false,
      isStateStale: false,
      // 99.9% should never change
      channel,
      createdAt: new Date(threadData.created_at),
      // rest
      deletedAt: threadData.deleted_at ? new Date(threadData.deleted_at) : null,
      pagination: repliesPaginationFromInitialThread(threadData),
      parentMessage: formatMessage(threadData.parent_message),
      participants: threadData.thread_participants,
      read: formatReadState(
        !threadData.read || threadData.read.length === 0 ? placeholderReadResponse : threadData.read,
      ),
      replies: threadData.latest_replies.map(formatMessage),
      replyCount: threadData.reply_count ?? 0,
      updatedAt: threadData.updated_at ? new Date(threadData.updated_at) : null,
      title: threadData.title,
      custom: constructCustomDataObject(threadData),
    });

    this.id = threadData.parent_message_id;
    this.client = client;
  }

  get channel() {
    return this.state.getLatestValue().channel;
  }

  get hasStaleState() {
    return this.state.getLatestValue().isStateStale;
  }

  get ownUnreadCount() {
    return ownUnreadCountSelector(this.client.userID)(this.state.getLatestValue());
  }

  public activate = () => {
    this.state.partialNext({ active: true });
  };

  public deactivate = () => {
    this.state.partialNext({ active: false });
  };

  public reload = async () => {
    if (this.state.getLatestValue().isLoading) {
      return;
    }

    this.state.partialNext({ isLoading: true });

    try {
      const thread = await this.client.getThread(this.id, { watch: true });
      this.hydrateState(thread);
    } finally {
      this.state.partialNext({ isLoading: false });
    }
  };

  public hydrateState = (thread: Thread<SCG>) => {
    if (thread === this) {
      // skip if the instances are the same
      return;
    }

    if (thread.id !== this.id) {
      throw new Error("Cannot hydrate thread state with using thread's state");
    }

    const {
      read,
      replyCount,
      replies,
      parentMessage,
      participants,
      createdAt,
      deletedAt,
      updatedAt,
    } = thread.state.getLatestValue();

    // Preserve pending replies and append them to the updated list of replies
    const pendingReplies = Array.from(this.failedRepliesMap.values());

    this.state.partialNext({
      read,
      replyCount,
      replies: pendingReplies.length ? replies.concat(pendingReplies) : replies,
      parentMessage,
      participants,
      createdAt,
      deletedAt,
      updatedAt,
      isStateStale: false,
    });
  };

  public registerSubscriptions = () => {
    if (this.unsubscribeFunctions.size) {
      // Thread is already listening for events and changes
      return;
    }

    this.unsubscribeFunctions.add(this.subscribeThreadUpdated());
    this.unsubscribeFunctions.add(this.subscribeMarkActiveThreadRead());
    this.unsubscribeFunctions.add(this.subscribeReloadActiveStaleThread());
    this.unsubscribeFunctions.add(this.subscribeMarkThreadStale());
    this.unsubscribeFunctions.add(this.subscribeNewReplies());
    this.unsubscribeFunctions.add(this.subscribeRepliesRead());
    this.unsubscribeFunctions.add(this.subscribeMessageDeleted());
    this.unsubscribeFunctions.add(this.subscribeMessageUpdated());
  };

  private subscribeThreadUpdated = () => {
    return this.client.on('thread.updated', (event) => {
      if (!event.thread || event.thread.parent_message_id !== this.id) {
        return;
      }

      const threadData = event.thread;

      this.state.partialNext({
        title: threadData.title,
        updatedAt: new Date(threadData.updated_at),
        deletedAt: threadData.deleted_at ? new Date(threadData.deleted_at) : null,
        // TODO: use threadData.custom once we move to API v2
        custom: constructCustomDataObject(threadData),
      });
    }).unsubscribe;
  };

  private subscribeMarkActiveThreadRead = () => {
    return this.state.subscribeWithSelector(
      (nextValue) => ({
        active: nextValue.active,
        unreadMessageCount: ownUnreadCountSelector(this.client.userID)(nextValue),
      }),
      ({ active, unreadMessageCount }) => {
        if (!active || !unreadMessageCount) return;
        this.throttledMarkAsRead();
      },
    );
  };

  private subscribeReloadActiveStaleThread = () =>
    this.state.subscribeWithSelector(
      (nextValue) => ({ active: nextValue.active, isStateStale: nextValue.isStateStale }),
      ({ active, isStateStale }) => {
        if (active && isStateStale) {
          this.reload();
        }
      },
    );

  private subscribeMarkThreadStale = () =>
    this.client.on('user.watching.stop', (event) => {
      const { channel } = this.state.getLatestValue();

      if (!this.client.userID || this.client.userID !== event.user?.id || event.channel?.cid !== channel.cid) {
        return;
      }

      this.state.partialNext({ isStateStale: true });
    }).unsubscribe;

  private subscribeNewReplies = () =>
    this.client.on('message.new', (event) => {
      if (!this.client.userID || event.message?.parent_id !== this.id) {
        return;
      }

      const isOwnMessage = event.message.user?.id === this.client.userID;
      const { active, read } = this.state.getLatestValue();

      this.upsertReplyLocally({
        message: event.message,
        // Message from current user could have been added optimistically,
        // so the actual timestamp might differ in the event
        timestampChanged: isOwnMessage,
      });

      if (active) {
        this.throttledMarkAsRead();
      }

      const nextRead: ThreadReadState = {};

      for (const userId of Object.keys(read)) {
        const userRead = read[userId];

        if (userRead) {
          let nextUserRead: ThreadUserReadState = userRead;

          if (userId === event.user?.id) {
            // The user who just sent a message to the thread has no unread messages
            // in that thread
            nextUserRead = {
              ...nextUserRead,
              lastReadAt: event.created_at ? new Date(event.created_at) : new Date(),
              user: event.user,
              unreadMessageCount: 0,
            };
          } else if (active && userId === this.client.userID) {
            // Do not increment unread count for the current user in an active thread
          } else {
            // Increment unread count for all users except the author of the new message
            nextUserRead = {
              ...nextUserRead,
              unreadMessageCount: userRead.unreadMessageCount + 1,
            };
          }

          nextRead[userId] = nextUserRead;
        }
      }

      this.state.partialNext({ read: nextRead });
    }).unsubscribe;

  private subscribeRepliesRead = () =>
    this.client.on('message.read', (event) => {
      if (!event.user || !event.created_at || !event.thread) return;
      if (event.thread.parent_message_id !== this.id) return;

      const userId = event.user.id;
      const createdAt = event.created_at;
      const user = event.user;

      this.state.next((current) => ({
        ...current,
        read: {
          ...current.read,
          [userId]: {
            lastReadAt: new Date(createdAt),
            user,
            lastReadMessageId: event.last_read_message_id,
            unreadMessageCount: 0,
          },
        },
      }));
    }).unsubscribe;

  private subscribeMessageDeleted = () =>
    this.client.on('message.deleted', (event) => {
      if (!event.message) return;

      // Deleted message is a reply of this thread
      if (event.message.parent_id === this.id) {
        if (event.hard_delete) {
          this.deleteReplyLocally({ message: event.message });
        } else {
          // Handle soft delete (updates deleted_at timestamp)
          this.upsertReplyLocally({ message: event.message });
        }
      }

      // Deleted message is parent message of this thread
      if (event.message.id === this.id) {
        this.updateParentMessageLocally({ message: event.message });
      }
    }).unsubscribe;

  private subscribeMessageUpdated = () => {
    const eventTypes: EventTypes[] = ['message.updated', 'reaction.new', 'reaction.deleted', 'reaction.updated'];

    const unsubscribeFunctions = eventTypes.map(
      (eventType) =>
        this.client.on(eventType, (event) => {
          if (event.message) {
            this.updateParentMessageOrReplyLocally(event.message);
          }
        }).unsubscribe,
    );

    return () => unsubscribeFunctions.forEach((unsubscribe) => unsubscribe());
  };

  public unregisterSubscriptions = () => {
    this.unsubscribeFunctions.forEach((cleanupFunction) => cleanupFunction());
    this.unsubscribeFunctions.clear();
  };

  public deleteReplyLocally = ({ message }: { message: MessageResponse<SCG> }) => {
    const { replies } = this.state.getLatestValue();

    const index = findIndexInSortedArray({
      needle: formatMessage(message),
      sortedArray: replies,
      sortDirection: 'ascending',
      selectValueToCompare: (reply) => reply.created_at.getTime(),
      selectKey: (reply) => reply.id,
    });

    if (replies[index]?.id !== message.id) {
      return;
    }

    const updatedReplies = [...replies];
    updatedReplies.splice(index, 1);

    this.state.partialNext({
      replies: updatedReplies,
    });
  };

  public upsertReplyLocally = ({
    message,
    timestampChanged = false,
  }: {
    message: MessageResponse<SCG>;
    timestampChanged?: boolean;
  }) => {
    if (message.parent_id !== this.id) {
      throw new Error('Reply does not belong to this thread');
    }

    const formattedMessage = formatMessage(message);

    if (message.status === 'failed') {
      // store failed reply so that it's not lost when reloading or hydrating
      this.failedRepliesMap.set(formattedMessage.id, formattedMessage);
    } else if (this.failedRepliesMap.has(message.id)) {
      this.failedRepliesMap.delete(message.id);
    }

    this.state.next((current) => ({
      ...current,
      replies: addToMessageList(current.replies, formattedMessage, timestampChanged),
    }));
  };

  public updateParentMessageLocally = ({ message }: { message: MessageResponse<SCG> }) => {
    if (message.id !== this.id) {
      throw new Error('Message does not belong to this thread');
    }

    this.state.next((current) => {
      const formattedMessage = formatMessage(message);

      return {
        ...current,
        deletedAt: formattedMessage.deleted_at,
        parentMessage: formattedMessage,
        replyCount: message.reply_count ?? current.replyCount,
      };
    });
  };

  public updateParentMessageOrReplyLocally = (message: MessageResponse<SCG>) => {
    if (message.parent_id === this.id) {
      this.upsertReplyLocally({ message });
    }

    if (!message.parent_id && message.id === this.id) {
      this.updateParentMessageLocally({ message });
    }
  };

  public markAsRead = async ({ force = false }: { force?: boolean } = {}) => {
    if (this.ownUnreadCount === 0 && !force) {
      return null;
    }

    return await this.channel.markRead({ thread_id: this.id });
  };

  private throttledMarkAsRead = throttle(() => this.markAsRead(), MARK_AS_READ_THROTTLE_TIMEOUT, { trailing: true });

  public queryReplies = ({
    limit = DEFAULT_PAGE_LIMIT,
    sort = DEFAULT_SORT,
    ...otherOptions
  }: QueryRepliesOptions<SCG> = {}) => {
    return this.channel.getReplies(this.id, { limit, ...otherOptions }, sort);
  };

  public loadNextPage = ({ limit = DEFAULT_PAGE_LIMIT }: { limit?: number } = {}) => {
    return this.loadPage(limit);
  };

  public loadPrevPage = ({ limit = DEFAULT_PAGE_LIMIT }: { limit?: number } = {}) => {
    return this.loadPage(-limit);
  };

  private loadPage = async (count: number) => {
    const { pagination } = this.state.getLatestValue();
    const [loadingKey, cursorKey, insertionMethodKey] =
      count > 0
        ? (['isLoadingNext', 'nextCursor', 'push'] as const)
        : (['isLoadingPrev', 'prevCursor', 'unshift'] as const);

    if (pagination[loadingKey] || pagination[cursorKey] === null) return;

    const queryOptions = { [count > 0 ? 'id_gt' : 'id_lt']: pagination[cursorKey] };
    const limit = Math.abs(count);

    this.state.partialNext({ pagination: { ...pagination, [loadingKey]: true } });

    try {
      const data = await this.queryReplies({ ...queryOptions, limit });
      const replies = data.messages.map(formatMessage);
      const maybeNextCursor = replies.at(count > 0 ? -1 : 0)?.id ?? null;

      this.state.next((current) => {
        let nextReplies = current.replies;

        // prevent re-creating array if there's nothing to add to the current one
        if (replies.length > 0) {
          nextReplies = [...current.replies];
          nextReplies[insertionMethodKey](...replies);
        }

        return {
          ...current,
          replies: nextReplies,
          pagination: {
            ...current.pagination,
            [cursorKey]: data.messages.length < limit ? null : maybeNextCursor,
            [loadingKey]: false,
          },
        };
      });
    } catch (error) {
      this.client.logger('error', (error as Error).message);
      this.state.next((current) => ({
        ...current,
        pagination: {
          ...current.pagination,
          [loadingKey]: false,
        },
      }));
    }
  };
}

const formatReadState = (read: ReadResponse[]): ThreadReadState =>
  read.reduce<ThreadReadState>((state, userRead) => {
    state[userRead.user.id] = {
      user: userRead.user,
      lastReadMessageId: userRead.last_read_message_id,
      unreadMessageCount: userRead.unread_messages ?? 0,
      lastReadAt: new Date(userRead.last_read),
    };
    return state;
  }, {});

const repliesPaginationFromInitialThread = (thread: ThreadResponse): ThreadRepliesPagination => {
  const latestRepliesContainsAllReplies = thread.latest_replies.length === thread.reply_count;

  return {
    nextCursor: null,
    prevCursor: latestRepliesContainsAllReplies ? null : thread.latest_replies.at(0)?.id ?? null,
    isLoadingNext: false,
    isLoadingPrev: false,
  };
};

const ownUnreadCountSelector = (currentUserId: string | undefined) => <
  SCG extends ExtendableGenerics = DefaultGenerics
>(
  state: ThreadState<SCG>,
) => (currentUserId && state.read[currentUserId]?.unreadMessageCount) || 0;
