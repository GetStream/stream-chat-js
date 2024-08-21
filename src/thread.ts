import type { Channel } from './channel';
import type { StreamChat } from './client';
import { StateStore } from './store';
import type {
  AscDesc,
  DefaultGenerics,
  Event,
  ExtendableGenerics,
  FormatMessageResponse,
  MessagePaginationOptions,
  MessageResponse,
  ReadResponse,
  ThreadResponse,
  UserResponse,
} from './types';
import { addToMessageList, findIndexInSortedArray, formatMessage, throttle } from './utils';

type QueryRepliesOptions<SCG extends ExtendableGenerics> = {
  sort?: { created_at: AscDesc }[];
} & MessagePaginationOptions & { user?: UserResponse<SCG>; user_id?: string };

export type ThreadState<SCG extends ExtendableGenerics = DefaultGenerics> = {
  active: boolean;
  channel: Channel<SCG>;
  createdAt: Date;
  isStateStale: boolean;
  pagination: ThreadRepliesPagination;
  parentMessage: FormatMessageResponse<SCG> | undefined;
  participants: ThreadResponse<SCG>['thread_participants'];
  read: ThreadReadState;
  replies: Array<FormatMessageResponse<SCG>>;
  replyCount: number;
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
  user: UserResponse<SCG>;
  lastReadMessageId?: string;
  unreadMessageCount?: number;
};

export type ThreadReadState<SCG extends ExtendableGenerics = DefaultGenerics> = Record<
  string,
  ThreadUserReadState<SCG>
>;

const DEFAULT_PAGE_LIMIT = 50;
const DEFAULT_SORT: { created_at: AscDesc }[] = [{ created_at: -1 }];
export const DEFAULT_MARK_AS_READ_THROTTLE_DURATION = 1000;

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

// TODO: store users someplace and reference them from state as now replies might contain users with stale information

export class Thread<SCG extends ExtendableGenerics = DefaultGenerics> {
  public readonly state: StateStore<ThreadState<SCG>>;
  public id: string;

  private client: StreamChat<SCG>;
  private unsubscribeFunctions: Set<() => void> = new Set();
  private pendingRepliesMap: Map<string, FormatMessageResponse<SCG>> = new Map();

  constructor({ client, threadData }: { client: StreamChat<SCG>; threadData: ThreadResponse<SCG> }) {
    this.state = new StateStore<ThreadState<SCG>>({
      // used as handler helper - actively mark read all of the incoming messages
      // if the thread is active (visibly selected in the UI or main focal point in advanced list)
      active: false,
      channel: client.channel(threadData.channel.type, threadData.channel.id, threadData.channel),
      createdAt: new Date(threadData.created_at),
      replies: threadData.latest_replies.map(formatMessage),
      // thread is "parentMessage"
      parentMessage: formatMessage(threadData.parent_message),
      participants: threadData.thread_participants,
      read: formatReadState(threadData.read ?? []),
      replyCount: threadData.reply_count ?? 0,
      updatedAt: threadData.updated_at ? new Date(threadData.updated_at) : null,
      pagination: repliesPaginationFromInitialThread(threadData),
      // TODO: implement network status handler (network down, isStateStale: true, reset to false once state has been refreshed)
      // review lazy-reload approach (You're viewing de-synchronized thread, click here to refresh) or refresh on notification.thread_message_new
      // reset threads approach (the easiest approach but has to be done with ThreadManager - drops all the state and loads anew)
      isStateStale: false,
    });

    // parent_message_id is being re-used as thread.id
    this.id = threadData.parent_message_id;
    this.client = client;
  }

  get channel() {
    return this.state.getLatestValue().channel;
  }

  get hasStaleState() {
    return this.state.getLatestValue().isStateStale;
  }

  public activate = () => {
    this.state.partialNext({ active: true });
  };

  public deactivate = () => {
    this.state.partialNext({ active: false });
  };

  // take state of one instance and merge it to the current instance
  public hydrateState = (thread: Thread<SCG>) => {
    if (thread === this) return; // skip if the instances are the same
    if (thread.id !== this.id) return; // disallow merging of states of instances that do not match ids

    const {
      read,
      replyCount,
      replies,
      parentMessage,
      participants,
      createdAt,
      updatedAt,
    } = thread.state.getLatestValue();

    this.state.next((current) => {
      const pendingReplies = Array.from(this.pendingRepliesMap.values());

      return {
        ...current,
        read,
        replyCount,
        replies: replies.length ? replies.concat(pendingReplies) : replies,
        parentMessage,
        participants,
        createdAt,
        updatedAt,
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

    // TODO: figure out why markAsRead needs to be wrapped like this (for tests to pass)
    const throttledMarkAsRead = throttle(() => this.markAsRead(), DEFAULT_MARK_AS_READ_THROTTLE_DURATION, {
      leading: true,
      trailing: true,
    });

    this.unsubscribeFunctions.add(
      this.state.subscribeWithSelector(
        (nextValue) => [nextValue.active, this.client.userID && nextValue.read[this.client.userID]?.unreadMessageCount],
        ([active, unreadMessagesCount]) => {
          if (!active || !unreadMessagesCount) return;

          // mark thread as read whenever thread becomes active or is already active and unread messages count increases
          throttledMarkAsRead();
        },
      ),
    );

    const handleStateRecovery = async () => {
      // TODO: add online status to prevent recovery attempts during the time the connection is down
      try {
        const thread = await this.client.getThread(this.id, { watch: true });
        this.hydrateState(thread);
      } catch (error) {
        // TODO: handle recovery fail
        console.warn(error);
      } finally {
        // this.updateLocalState('recovering', false);
      }
    };

    // when the thread becomes active or it becomes stale while active (channel stops being watched or connection drops)
    // the recovery handler pulls its latest state to replace with the current one
    // failed messages are preserved and appended to the newly recovered replies
    this.unsubscribeFunctions.add(
      this.state.subscribeWithSelector(
        (nextValue) => [nextValue.active, nextValue.isStateStale],
        ([active, isStateStale]) => {
          if (active && isStateStale) handleStateRecovery();
        },
      ),
    );

    this.unsubscribeFunctions.add(
      // TODO: figure out why the current user is not receiving this event
      this.client.on('user.watching.stop', (event) => {
        if (!event.channel || !event.user || !this.client.userID || this.client.userID !== event.user.id) return;

        const { channel } = this.state.getLatestValue();

        if (event.channel.cid !== channel.cid) return;

        this.state.partialNext({ isStateStale: true });
      }).unsubscribe,
    );

    this.unsubscribeFunctions.add(
      this.client.on('message.new', (event) => {
        if (!event.message || !this.client.userID) return;
        if (event.message.parent_id !== this.id) return;

        const { isStateStale } = this.state.getLatestValue();

        if (isStateStale) return;

        if (this.pendingRepliesMap.has(event.message.id)) {
          this.pendingRepliesMap.delete(event.message.id);
        }

        this.upsertReplyLocally({
          message: event.message,
          // deal with timestampChanged only related to local user (optimistic updates)
          timestampChanged: event.message.user?.id === this.client.userID,
        });

        if (event.message.user?.id !== this.client.userID) this.incrementOwnUnreadCount();
        // TODO: figure out if event.user is better when it comes to event messages?
        // if (event.user && event.user.id !== currentUserId) this.incrementOwnUnreadCount();
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

    const handleMessageUpdate = (event: Event<SCG>) => {
      if (!event.message) return;

      if (event.hard_delete && event.type === 'message.deleted' && event.message.parent_id === this.id) {
        return this.deleteReplyLocally({ message: event.message });
      }

      this.updateParentMessageOrReplyLocally(event.message);
    };

    ['message.updated', 'message.deleted', 'reaction.new', 'reaction.deleted'].forEach((eventType) => {
      this.unsubscribeFunctions.add(this.client.on(eventType, handleMessageUpdate).unsubscribe);
    });
  };

  public deregisterSubscriptions = () => {
    this.unsubscribeFunctions.forEach((cleanupFunction) => cleanupFunction());
  };

  public incrementOwnUnreadCount = () => {
    const currentUserId = this.client.userID;
    if (!currentUserId) return;

    const channelOwnCapabilities = this.channel.data?.own_capabilities;
    if (Array.isArray(channelOwnCapabilities) && !channelOwnCapabilities.includes('read-events')) return;

    this.state.next((current) => {
      return {
        ...current,
        read: {
          ...current.read,
          [currentUserId]: {
            ...current.read[currentUserId],
            unreadMessageCount: (current.read[currentUserId]?.unreadMessageCount ?? 0) + 1,
          },
        },
      };
    });
  };

  public deleteReplyLocally = ({ message }: { message: MessageResponse<SCG> }) => {
    const { replies: latestReplies } = this.state.getLatestValue();

    const index = findIndexInSortedArray({
      needle: formatMessage(message),
      sortedArray: latestReplies,
      // TODO: make following two configurable (sortDirection and created_at)
      sortDirection: 'ascending',
      selectValueToCompare: (m) => m['created_at'].getTime(),
    });

    const actualIndex =
      latestReplies[index]?.id === message.id ? index : latestReplies[index - 1]?.id === message.id ? index - 1 : null;

    if (actualIndex === null) return;

    this.state.next((current) => {
      // TODO: replace with "Array.toSpliced" when applicable
      const latestRepliesCopy = [...latestReplies];
      latestRepliesCopy.splice(actualIndex, 1);

      return {
        ...current,
        replies: latestRepliesCopy,
      };
    });
  };

  public upsertReplyLocally = ({
    message,
    timestampChanged = false,
  }: {
    message: MessageResponse<SCG> | FormatMessageResponse<SCG>;
    timestampChanged?: boolean;
  }) => {
    if (message.parent_id !== this.id) {
      throw new Error('Message does not belong to this thread');
    }
    const formattedMessage = formatMessage(message);

    // store pending message to reference later in state merging
    if (message.status === 'failed') {
      this.pendingRepliesMap.set(formattedMessage.id, formattedMessage);
    }

    this.state.next((current) => ({
      ...current,
      replies: addToMessageList(current.replies, formattedMessage, timestampChanged),
    }));
  };

  public updateParentMessageLocally = (message: MessageResponse<SCG>) => {
    if (message.id !== this.id) {
      throw new Error('Message does not belong to this thread');
    }

    this.state.next((current) => {
      const formattedMessage = formatMessage(message);

      const newData: typeof current = {
        ...current,
        parentMessage: formattedMessage,
        replyCount: message.reply_count ?? current.replyCount,
      };

      // update channel on channelData change (unlikely but handled anyway)
      if (message.channel) {
        newData['channel'] = this.client.channel(message.channel.type, message.channel.id, message.channel);
      }

      return newData;
    });
  };

  public updateParentMessageOrReplyLocally = (message: MessageResponse<SCG>) => {
    if (message.parent_id === this.id) {
      this.upsertReplyLocally({ message });
    }

    if (!message.parent_id && message.id === this.id) {
      this.updateParentMessageLocally(message);
    }
  };

  public markAsRead = () => {
    const { read } = this.state.getLatestValue();
    const currentUserId = this.client.user?.id;
    const { unreadMessageCount } = (currentUserId && read[currentUserId]) || {};
    if (!unreadMessageCount) return;
    return this.channel.markRead({ thread_id: this.id });
  };

  // moved from channel to thread directly (skipped getClient thing as this call does not need active WS connection)
  public queryReplies = ({
    sort = DEFAULT_SORT,
    limit = DEFAULT_PAGE_LIMIT,
    ...otherOptions
  }: QueryRepliesOptions<SCG> = {}) => {
    if (!this.channel) throw new Error('queryReplies: This Thread intance has no channel bound to it');

    return this.channel.getReplies(this.id, { limit, ...otherOptions }, sort);
  };

  public loadPage = async (count: number) => {
    const { pagination } = this.state.getLatestValue();
    const [loadingKey, cursorKey] =
      count > 0 ? (['isLoadingNext', 'nextCursor'] as const) : (['isLoadingPrev', 'prevCursor'] as const);

    if (pagination[loadingKey] || pagination[cursorKey] === null) return;

    const queryOptions = { [count > 0 ? 'id_gt' : 'id_lt']: Math.abs(count) };
    const limit = Math.abs(count);

    this.state.partialNext({ pagination: { ...pagination, [loadingKey]: true } });

    try {
      const data = await this.queryReplies({ ...queryOptions, limit });
      const replies = data.messages.map(formatMessage);
      const maybeNextCursor = replies.at(count > 0 ? -1 : 0)?.id ?? null;

      this.state.next((current) => ({
        ...current,
        // prevent re-creating array if there's nothing to add to the current one
        replies: replies.length ? current.replies.concat(replies) : current.replies,
        pagination: {
          ...current.pagination,
          [cursorKey]: data.messages.length < limit ? null : maybeNextCursor,
          [loadingKey]: false,
        },
      }));
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
      unreadMessageCount: userRead.unread_messages,
      lastReadAt: new Date(userRead.last_read),
    };
    return state;
  }, {});

const repliesPaginationFromInitialThread = (thread: ThreadResponse): ThreadRepliesPagination => {
  const latestRepliesContainsAllReplies = thread.latest_replies.length === thread.reply_count;

  return {
    nextCursor: latestRepliesContainsAllReplies ? null : thread.latest_replies.at(-1)?.id ?? null,
    prevCursor: latestRepliesContainsAllReplies ? null : thread.latest_replies.at(0)?.id ?? null,
    isLoadingNext: false,
    isLoadingPrev: false,
  };
};
