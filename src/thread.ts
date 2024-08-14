import type { Channel } from './channel';
import type { StreamChat } from './client';
import { SimpleStateStore } from './store/SimpleStateStore';
import type {
  AscDesc,
  DefaultGenerics,
  Event,
  ExtendableGenerics,
  FormatMessageResponse,
  MessagePaginationOptions,
  MessageResponse,
  ThreadResponse,
  UserResponse,
} from './types';
import {
  addToMessageList,
  findIndexInSortedArray,
  formatMessage,
  throttle,
  transformReadArrayToDictionary,
} from './utils';

type ThreadReadStatus<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  [key: string]: {
    last_read: string;
    last_read_message_id: string;
    lastReadAt: Date;
    unread_messages: number;
    user: UserResponse<StreamChatGenerics>;
  };
};

type QueryRepliesOptions<T extends ExtendableGenerics> = {
  sort?: { created_at: AscDesc }[];
} & MessagePaginationOptions & { user?: UserResponse<T>; user_id?: string };

export type ThreadState<T extends ExtendableGenerics = DefaultGenerics> = {
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

  // messageId as cursor
  nextCursor?: string | null;
  previousCursor?: string | null;
};

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

export class Thread<Scg extends ExtendableGenerics = DefaultGenerics> {
  public readonly state: SimpleStateStore<ThreadState<Scg>>;
  public id: string;

  private client: StreamChat<Scg>;
  private unsubscribeFunctions: Set<() => void> = new Set();
  private failedRepliesMap: Map<string, FormatMessageResponse<Scg>> = new Map();

  constructor({ client, threadData = {} }: { client: StreamChat<Scg>; threadData?: Partial<ThreadResponse<Scg>> }) {
    const {
      read: unformattedRead = [],
      latest_replies: latestReplies = [],
      thread_participants: threadParticipants = [],
      reply_count: replyCount = 0,
    } = threadData;

    const read = transformReadArrayToDictionary(unformattedRead);

    const placeholderDate = new Date();

    this.state = new SimpleStateStore<ThreadState<Scg>>({
      // used as handler helper - actively mark read all of the incoming messages
      // if the thread is active (visibly selected in the UI or main focal point in advanced list)
      active: false,
      channelData: threadData.channel, // not channel instance
      channel: threadData.channel && client.channel(threadData.channel.type, threadData.channel.id),
      createdAt: threadData.created_at ? new Date(threadData.created_at) : placeholderDate,
      deletedAt: threadData.parent_message?.deleted_at ? new Date(threadData.parent_message.deleted_at) : null,
      latestReplies: latestReplies.map(formatMessage),
      // thread is "parentMessage"
      parentMessage: threadData.parent_message && formatMessage(threadData.parent_message),
      participants: threadParticipants,
      // actual read state in-sync with BE values
      read,
      // also read state but staggered - used for UI purposes (unread count banner)
      staggeredRead: read,
      replyCount,
      updatedAt: threadData.updated_at ? new Date(threadData.updated_at) : null,

      nextCursor: latestReplies.length === replyCount ? null : latestReplies.at(-1)?.id ?? null,
      // TODO: check whether the amount of replies is less than replies_limit (thread.queriedWithOptions = {...})
      // otherwise we perform one extra query (not a big deal but preventable)
      previousCursor: latestReplies.length === replyCount ? null : latestReplies.at(0)?.id ?? null,
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

  public activate = () => {
    this.state.patchedNext('active', true);
  };

  public deactivate = () => {
    this.state.patchedNext('active', false);
  };

  // take state of one instance and merge it to the current instance
  public partiallyReplaceState = ({ thread }: { thread: Thread<Scg> }) => {
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
      nextCursor,
      previousCursor,
      channelData,
    } = thread.state.getLatestValue();

    this.state.next((current) => {
      const failedReplies = Array.from(this.failedRepliesMap.values());

      return {
        ...current,
        read,
        staggeredRead,
        replyCount,
        latestReplies: latestReplies.length ? latestReplies.concat(failedReplies) : latestReplies,
        parentMessage,
        participants,
        createdAt,
        deletedAt,
        updatedAt,
        nextCursor,
        previousCursor,
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

    // TODO: figure out why markAsRead needs to be wrapped like this (for tests to pass)
    const throttledMarkAsRead = throttle(() => this.markAsRead(), DEFAULT_MARK_AS_READ_THROTTLE_DURATION, {
      leading: true,
      trailing: true,
    });

    const currentuserId = this.client.user?.id;

    if (currentuserId)
      this.unsubscribeFunctions.add(
        this.state.subscribeWithSelector(
          (nextValue) => [nextValue.active, nextValue.read[currentuserId]?.unread_messages],
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

        this.partiallyReplaceState({ thread });
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
        async ([active, isStateStale]) => {
          // TODO: cancel in-progress recovery?
          if (active && isStateStale) handleStateRecovery();
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

        this.state.patchedNext('isStateStale', true);
      }).unsubscribe,
    );

    this.unsubscribeFunctions.add(
      this.client.on('message.new', (event) => {
        const currentUserId = this.client.user?.id;
        if (!event.message || !currentUserId) return;
        if (event.message.parent_id !== this.id) return;

        const { isStateStale } = this.state.getLatestValue();

        if (isStateStale) return;

        if (this.failedRepliesMap.has(event.message.id)) {
          this.failedRepliesMap.delete(event.message.id);
        }

        this.upsertReplyLocally({
          message: event.message,
          // deal with timestampChanged only related to local user (optimistic updates)
          timestampChanged: event.message.user?.id === currentUserId,
        });

        if (event.message.user?.id !== currentUserId) this.incrementOwnUnreadCount();
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

    const handleMessageUpdate = (event: Event<Scg>) => {
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

  public deleteReplyLocally = ({ message }: { message: MessageResponse<Scg> }) => {
    const { latestReplies } = this.state.getLatestValue();

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
        latestReplies: latestRepliesCopy,
      };
    });
  };

  public upsertReplyLocally = ({
    message,
    timestampChanged = false,
  }: {
    message: MessageResponse<Scg> | FormatMessageResponse<Scg>;
    timestampChanged?: boolean;
  }) => {
    if (message.parent_id !== this.id) {
      throw new Error('Message does not belong to this thread');
    }
    const formattedMessage = formatMessage(message);

    // store failed message to reference later in state merging
    if (message.status === 'failed') {
      this.failedRepliesMap.set(formattedMessage.id, formattedMessage);
    }

    this.state.next((current) => ({
      ...current,
      latestReplies: addToMessageList(current.latestReplies, formattedMessage, timestampChanged),
    }));
  };

  public updateParentMessageLocally = (message: MessageResponse<Scg>) => {
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

  public updateParentMessageOrReplyLocally = (message: MessageResponse<Scg>) => {
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

    const { unread_messages: unreadMessagesCount } = (currentUserId && read[currentUserId]) || {};

    if (!unreadMessagesCount) return;

    if (!this.channel) throw new Error('markAsRead: This Thread intance has no channel bound to it');

    return this.channel.markRead({ thread_id: this.id });
  };

  // moved from channel to thread directly (skipped getClient thing as this call does not need active WS connection)
  public queryReplies = ({
    sort = DEFAULT_SORT,
    limit = DEFAULT_PAGE_LIMIT,
    ...otherOptions
  }: QueryRepliesOptions<Scg> = {}) => {
    if (!this.channel) throw new Error('queryReplies: This Thread intance has no channel bound to it');

    return this.channel.getReplies(this.id, { limit, ...otherOptions }, sort);
  };

  // loadNextPage and loadPreviousPage rely on pagination id's calculated from previous requests
  // these functions exclude these options (id_lt, id_lte...) from their options to prevent unexpected pagination behavior
  public loadNextPage = async ({
    sort,
    limit = DEFAULT_PAGE_LIMIT,
  }: Pick<QueryRepliesOptions<Scg>, 'sort' | 'limit'> = {}) => {
    this.state.patchedNext('loadingNextPage', true);

    const { loadingNextPage, nextCursor } = this.state.getLatestValue();

    if (loadingNextPage || nextCursor === null) return;

    try {
      const data = await this.queryReplies({
        id_gt: nextCursor,
        limit,
        sort,
      });

      const lastMessageId = data.messages.at(-1)?.id;

      this.state.next((current) => ({
        ...current,
        // prevent re-creating array if there's nothing to add to the current one
        latestReplies: data.messages.length
          ? current.latestReplies.concat(data.messages.map(formatMessage))
          : current.latestReplies,
        nextCursor: data.messages.length < limit || !lastMessageId ? null : lastMessageId,
      }));
    } catch (error) {
      this.client.logger('error', (error as Error).message);
    } finally {
      this.state.patchedNext('loadingNextPage', false);
    }
  };

  public loadPreviousPage = async ({
    sort,
    limit = DEFAULT_PAGE_LIMIT,
  }: Pick<QueryRepliesOptions<Scg>, 'sort' | 'limit'> = {}) => {
    const { loadingPreviousPage, previousCursor } = this.state.getLatestValue();

    if (loadingPreviousPage || previousCursor === null) return;

    this.state.patchedNext('loadingPreviousPage', true);

    try {
      const data = await this.queryReplies({
        id_lt: previousCursor,
        limit,
        sort,
      });

      const firstMessageId = data.messages.at(0)?.id;

      this.state.next((current) => ({
        ...current,
        latestReplies: data.messages.length
          ? data.messages.map(formatMessage).concat(current.latestReplies)
          : current.latestReplies,
        previousCursor: data.messages.length < limit || !firstMessageId ? null : firstMessageId,
      }));
    } catch (error) {
      this.client.logger('error', (error as Error).message);
    } finally {
      this.state.patchedNext('loadingPreviousPage', false);
    }
  };
}
