import { StateStore } from './store';
import {
  addToMessageList,
  findIndexInSortedArray,
  formatMessage,
  throttle,
} from './utils';
import type {
  AscDesc,
  EventTypes,
  LocalMessage,
  MessagePaginationOptions,
  MessageResponse,
  ReadResponse,
  ThreadResponse,
  UserResponse,
} from './types';
import type { Channel } from './channel';
import type { StreamChat } from './client';
import type { CustomThreadData } from './custom_types';
import { MessageComposer } from './messageComposer';
import { WithSubscriptions } from './utils/WithSubscriptions';

type QueryRepliesOptions = {
  sort?: { created_at: AscDesc }[];
} & MessagePaginationOptions & { user?: UserResponse; user_id?: string };

export type ThreadState = {
  /**
   * Determines if the thread is currently opened and on-screen. When the thread is active,
   * all new messages are immediately marked as read.
   */
  active: boolean;
  channel: Channel;
  createdAt: Date;
  custom: CustomThreadData;
  deletedAt: Date | null;
  isLoading: boolean;
  isStateStale: boolean;
  pagination: ThreadRepliesPagination;
  /**
   * Thread is identified by and has a one-to-one relation with its parent message.
   * We use parent message id as a thread id.
   */
  parentMessage: LocalMessage;
  participants: ThreadResponse['thread_participants'];
  read: ThreadReadState;
  replies: Array<LocalMessage>;
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

export type ThreadUserReadState = {
  lastReadAt: Date;
  unreadMessageCount: number;
  user: UserResponse;
  lastReadMessageId?: string;
};

export type ThreadReadState = Record<string, ThreadUserReadState | undefined>;

const DEFAULT_PAGE_LIMIT = 50;
const DEFAULT_SORT: { created_at: AscDesc }[] = [{ created_at: -1 }];
const MARK_AS_READ_THROTTLE_TIMEOUT = 1000;
// TODO: remove this once we move to API v2
export const THREAD_RESPONSE_RESERVED_KEYS: Record<keyof ThreadResponse, true> = {
  active_participant_count: true,
  channel: true,
  channel_cid: true,
  created_at: true,
  created_by: true,
  created_by_user_id: true,
  deleted_at: true,
  draft: true,
  last_message_at: true,
  latest_replies: true,
  parent_message: true,
  parent_message_id: true,
  participant_count: true,
  read: true,
  reply_count: true,
  thread_participants: true,
  title: true,
  updated_at: true,
};

// TODO: remove this once we move to API v2
const constructCustomDataObject = <T extends ThreadResponse>(threadData: T) => {
  const custom: CustomThreadData = {};

  for (const key in threadData) {
    if (THREAD_RESPONSE_RESERVED_KEYS[key as keyof ThreadResponse]) {
      continue;
    }

    const customKey = key as keyof CustomThreadData;

    custom[customKey] = threadData[customKey];
  }

  return custom;
};

export class Thread extends WithSubscriptions {
  public readonly state: StateStore<ThreadState>;
  public readonly id: string;
  public readonly messageComposer: MessageComposer;

  private client: StreamChat;
  private failedRepliesMap: Map<string, LocalMessage> = new Map();

  constructor({
    client,
    threadData,
  }: {
    client: StreamChat;
    threadData: ThreadResponse;
  }) {
    super();

    const channel = client.channel(threadData.channel.type, threadData.channel.id, {
      // @ts-expect-error name is a "custom" property
      name: threadData.channel.name,
    });
    channel._hydrateMembers({
      members: threadData.channel.members ?? [],
      overrideCurrentState: false,
    });

    // For when read object is undefined and due to that unreadMessageCount for
    // the current user isn't being incremented on message.new
    const placeholderReadResponse: ReadResponse[] = client.userID
      ? [
          {
            user: { id: client.userID },
            unread_messages: 0,
            last_read: new Date().toISOString(),
          },
        ]
      : [];

    this.state = new StateStore<ThreadState>({
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
        !threadData.read || threadData.read.length === 0
          ? placeholderReadResponse
          : threadData.read,
      ),
      replies: threadData.latest_replies.map(formatMessage),
      replyCount: threadData.reply_count ?? 0,
      updatedAt: threadData.updated_at ? new Date(threadData.updated_at) : null,
      title: threadData.title,
      custom: constructCustomDataObject(threadData),
    });

    this.id = threadData.parent_message_id;
    this.client = client;

    this.messageComposer = new MessageComposer({
      client,
      composition: threadData.draft,
      compositionContext: this,
    });
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

  public hydrateState = (thread: Thread) => {
    if (thread === this) {
      // skip if the instances are the same
      return;
    }

    if (thread.id !== this.id) {
      throw new Error(
        "Cannot hydrate thread's state using thread with different threadId",
      );
    }

    const {
      createdAt,
      custom,
      title,
      deletedAt,
      parentMessage,
      participants,
      read,
      replyCount,
      replies,
      updatedAt,
    } = thread.state.getLatestValue();

    // Preserve pending replies and append them to the updated list of replies
    const pendingReplies = Array.from(this.failedRepliesMap.values());

    this.state.partialNext({
      title,
      createdAt,
      custom,
      deletedAt,
      parentMessage,
      participants,
      read,
      replyCount,
      replies: pendingReplies.length ? replies.concat(pendingReplies) : replies,
      updatedAt,
      isStateStale: false,
    });
  };

  public registerSubscriptions = () => {
    if (this.hasSubscriptions) {
      // Thread is already listening for events and changes
      return;
    }

    this.addUnsubscribeFunction(this.subscribeThreadUpdated());
    this.addUnsubscribeFunction(this.subscribeMarkActiveThreadRead());
    this.addUnsubscribeFunction(this.subscribeReloadActiveStaleThread());
    this.addUnsubscribeFunction(this.subscribeMarkThreadStale());
    this.addUnsubscribeFunction(this.subscribeNewReplies());
    this.addUnsubscribeFunction(this.subscribeRepliesRead());
    this.addUnsubscribeFunction(this.subscribeMessageDeleted());
    this.addUnsubscribeFunction(this.subscribeMessageUpdated());
  };

  private subscribeThreadUpdated = () =>
    this.client.on('thread.updated', (event) => {
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

  private subscribeMarkActiveThreadRead = () =>
    this.state.subscribeWithSelector(
      (nextValue) => ({
        active: nextValue.active,
        unreadMessageCount: ownUnreadCountSelector(this.client.userID)(nextValue),
      }),
      ({ active, unreadMessageCount }) => {
        if (!active || !unreadMessageCount) return;
        this.throttledMarkAsRead();
      },
    );

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

      if (
        !this.client.userID ||
        this.client.userID !== event.user?.id ||
        event.channel?.cid !== channel.cid
      ) {
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
    const eventTypes: EventTypes[] = [
      'message.updated',
      'reaction.new',
      'reaction.deleted',
      'reaction.updated',
    ];

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
    const symbol = super.unregisterSubscriptions();
    this.state.partialNext({ isStateStale: true });
    return symbol;
  };

  public deleteReplyLocally = ({ message }: { message: MessageResponse }) => {
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
    message: MessageResponse | LocalMessage;
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

  public updateParentMessageLocally = ({ message }: { message: MessageResponse }) => {
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

  public updateParentMessageOrReplyLocally = (message: MessageResponse) => {
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

    return await this.client.messageDeliveryReporter.markRead(this);
  };

  private throttledMarkAsRead = throttle(
    () => this.markAsRead(),
    MARK_AS_READ_THROTTLE_TIMEOUT,
    { trailing: true },
  );

  public queryReplies = ({
    limit = DEFAULT_PAGE_LIMIT,
    sort = DEFAULT_SORT,
    ...otherOptions
  }: QueryRepliesOptions = {}) =>
    this.channel.getReplies(this.id, { limit, ...otherOptions }, sort);

  public loadNextPage = ({ limit = DEFAULT_PAGE_LIMIT }: { limit?: number } = {}) =>
    this.loadPage(limit);

  public loadPrevPage = ({ limit = DEFAULT_PAGE_LIMIT }: { limit?: number } = {}) =>
    this.loadPage(-limit);

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

const repliesPaginationFromInitialThread = (
  thread: ThreadResponse,
): ThreadRepliesPagination => {
  const latestRepliesContainsAllReplies =
    thread.latest_replies.length === thread.reply_count;

  return {
    nextCursor: null,
    prevCursor: latestRepliesContainsAllReplies
      ? null
      : (thread.latest_replies.at(0)?.id ?? null),
    isLoadingNext: false,
    isLoadingPrev: false,
  };
};

const ownUnreadCountSelector =
  (currentUserId: string | undefined) => (state: ThreadState) =>
    (currentUserId && state.read[currentUserId]?.unreadMessageCount) || 0;
