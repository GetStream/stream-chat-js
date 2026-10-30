import { StateStore } from '@stream-io/state-store';
import { formatMessage } from './utils';
import type {
  DraftResponse,
  EventPayload,
  LocalMessage,
  MarkReadRequest,
  MarkReadResponse,
  MessageResponse,
  ReadStateResponse,
  SortParamRequest,
  StreamResponse,
  ThreadStateResponse,
  TimestampNS,
  UserResponse,
} from './types';
import { isDoesNotExistError } from './errors';
import type { Channel } from './channel';
import { ChannelWatchStatus } from './channel_state';
import type { StreamChat } from './client';
import type { CustomThreadData } from './custom_types';
import { MessageComposer } from './messageComposer';
import { createMessageOperations } from './messageOperations';
import type { MessageOperations } from './messageOperations';
import { nowNs } from './utils/time';
import { WithSubscriptions } from './utils/WithSubscriptions';
import { MessagePaginator } from './pagination';
import type { PaginatorCursor, ReconcileNewestMessagesOptions } from './pagination';
import { applyInstanceConfiguration } from './configuration/utils/applyInstanceConfiguration';
import { ConfigController } from './configuration/ConfigController';
import { deepFreezeConfig } from './configuration/utils/deepFreezeConfig';
import type { ThreadDeclarativeConfig } from './configuration/types';
import {
  mergeDeclarativeMessageOperationsConfig,
  mergeDeclarativePaginatorConfig,
  toDeclarativePaginatorConfig,
} from './configuration/utils/declarativeSlices';
import type { PipelineEvent } from './EventHandlerPipeline';

const getCursorFromReplies = (
  replies: LocalMessage[],
  reachesTail: boolean,
): PaginatorCursor => {
  const oldest = replies.reduce<LocalMessage | undefined>(
    (acc, reply) => (!acc || reply.created_at < acc.created_at ? reply : acc),
    undefined,
  );
  return { headward: null, tailward: reachesTail ? null : (oldest?.id ?? null) };
};

export type ThreadState = {
  /** Whether the thread is open and on-screen. While active, new messages are marked read. */
  active: boolean;
  channel: Channel;
  /** Unix nanoseconds, as the API sends it. */
  createdAt: TimestampNS;
  custom: CustomThreadData;
  /** Unix nanoseconds, as the API sends it. */
  deletedAt: TimestampNS | null;
  isLoading: boolean;
  isStateStale: boolean;
  /** A thread maps one-to-one to its parent message, whose ID is the thread ID. */
  parentMessage: LocalMessage;
  participants: ThreadStateResponse['thread_participants'];
  read: ThreadReadState;
  replyCount: number;
  title: string;
  /** Unix nanoseconds, as the API sends it. */
  updatedAt: TimestampNS | null;
};

export type ThreadUserReadState = {
  /** Unix nanoseconds, as the API sends it. */
  lastReadAt: TimestampNS;
  unreadMessageCount: number;
  user: UserResponse;
  lastReadMessageId?: string;
  firstUnreadMessageId?: string;
};

export type ThreadReadState = Record<string, ThreadUserReadState | undefined>;

const timestampOr = (
  value: TimestampNS | undefined,
  fallback: TimestampNS,
): TimestampNS =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback;

const DEFAULT_PAGE_LIMIT = 50;
const DEFAULT_SORT: SortParamRequest[] = [{ field: 'created_at', direction: -1 }];
const DEFAULT_ITEM_ORDER: SortParamRequest[] = [{ field: 'created_at', direction: 1 }];

export type CustomThreadMarkReadRequestFn = (params: {
  thread: Thread;
  options?: MarkReadRequest;
}) => Promise<Partial<StreamResponse<MarkReadResponse>> | null> | void;

export type ThreadConfig = {
  requestHandlers?: {
    markReadRequest?: CustomThreadMarkReadRequestFn;
  };
};

/** Empty: every field of `ThreadConfig` is optional. */
export const DEFAULT_THREAD_CONFIG: ThreadConfig = deepFreezeConfig({});

export class Thread extends WithSubscriptions {
  private readonly configController = new ConfigController<ThreadConfig>({
    defaults: DEFAULT_THREAD_CONFIG,
  });
  public readonly state: StateStore<ThreadState>;
  public readonly id: string;
  public readonly messageComposer: MessageComposer;
  public readonly messageOperations: MessageOperations;
  public readonly messagePaginator: MessagePaginator;

  private client: StreamChat;
  private failedRepliesMap: Map<string, LocalMessage> = new Map();
  private _activeRefCount = 0;

  constructor({
    client,
    threadData,
    channel,
    parentMessage,
    draft,
  }: {
    client: StreamChat;
    threadData?: ThreadStateResponse;
    channel?: Channel;
    parentMessage?: MessageResponse | LocalMessage;
    draft?: DraftResponse;
  }) {
    super();
    if (threadData) {
      this.state = new StateStore<ThreadState>({
        active: false,
        isLoading: false,
        isStateStale: false,
        ...formatThreadState(threadData, client.userId),
        channel: ensureThreadChannel(client, threadData),
      });

      this.id = threadData.parent_message_id;
    } else {
      if (!channel) {
        throw new Error('Channel is required when threadData is not provided');
      }

      if (!parentMessage || !parentMessage.id) {
        throw new Error(
          'Parent message with a valid id is required when threadData is not provided',
        );
      }

      const formattedParentMessage = formatMessage(parentMessage);
      const createdAt = timestampOr(parentMessage.created_at, nowNs());
      const replyCount = parentMessage.reply_count ?? 0;

      this.state = new StateStore<ThreadState>({
        active: false,
        channel,
        createdAt,
        custom: {},
        deletedAt: formattedParentMessage.deleted_at ?? null,
        isLoading: false,
        // Loads its data once when opened. A parent without replies in a watched channel has nothing
        // on the server yet (`getThread` would answer 404); in an unwatched channel `reply_count` may
        // miss newer replies, so it loads.
        isStateStale:
          replyCount > 0 || channel.watchStatus !== ChannelWatchStatus.Watching,
        parentMessage: formattedParentMessage,
        participants: [],
        read: formatReadState(getPlaceholderReadResponse(client.userId)),
        replyCount,
        title: '',
        updatedAt: parentMessage.updated_at ?? null,
      });

      this.id = parentMessage.id;
    }

    this.client = client;

    // Read up front: the reply paginator takes `unreadReferencePolicy` as a constructor argument.
    const declarativeConfig = client.config.getConfig('thread') ?? undefined;
    // The general `messagePaginator` key applies to replies; the thread's own slice overrides it.
    const messagePaginatorConfig = mergeDeclarativePaginatorConfig(
      client.config.getConfig('messagePaginator') ?? undefined,
      declarativeConfig?.messagePaginator,
    );

    this.messagePaginator = new MessagePaginator(
      {
        channel: this.channel,
        thread: this,
        parentMessageId: this.id,
        requestSort: DEFAULT_SORT,
        itemOrder: DEFAULT_ITEM_ORDER,
        // A constructor argument, not paginator configuration.
        unreadReferencePolicy: messagePaginatorConfig?.unreadReferencePolicy,
        paginatorOptions: {
          declarativeConfig: toDeclarativePaginatorConfig(messagePaginatorConfig),
        },
      },
      // SDK default page size. Overridable through `client.config.set`
      // (`messagePaginator.pageSize`).
      { pageSize: DEFAULT_PAGE_LIMIT },
    );

    // Seeds the first reply page without a fetch. `latest_replies` is the newest interval: it
    // reaches the head, and the tail only if it holds every reply.
    if (threadData?.latest_replies?.length) {
      const replies = threadData.latest_replies.map(formatMessage);
      const isLastPage = holdsEveryReply(replies, threadData);
      this.messagePaginator.setItems({
        valueOrFactory: replies,
        cursor: getCursorFromReplies(replies, isLastPage),
        isFirstPage: true,
        isLastPage,
      });
    }

    // Floor for `latestMessageAt`, for when the newest reply is not among `latest_replies`.
    this.messagePaginator.setQueriedLatestMessageAt(threadData?.last_message_at);

    this.messageComposer = new MessageComposer({
      client,
      composition: threadData?.draft ?? draft,
      compositionContext: this,
    });

    this.messageOperations = createMessageOperations(this);

    // Same derivation path as `config.reset()`. Idempotent: re-applies what the constructors set.
    this.initializeConfig(declarativeConfig);
  }

  /**
   * Derives this thread's configuration, and its reply paginator's, from the declarative slice.
   * Called by the constructor and by `client.config.reset()`.
   */
  initializeConfig(declarativeConfig?: ThreadDeclarativeConfig): void {
    // Only the thread's own slice: the paginator and operations keys go to those objects below.
    // Replaces rather than merges, so a handler dropped from the declarative tree disappears.
    this.configController.initialize({
      requestHandlers: declarativeConfig?.requestHandlers,
    });

    this.messagePaginator.initializeConfig(
      toDeclarativePaginatorConfig(
        mergeDeclarativePaginatorConfig(
          this.client.config.getConfig('messagePaginator') ?? undefined,
          declarativeConfig?.messagePaginator,
        ),
      ),
    );

    // Takes the shared `messageOperations` key like the channel does, with its own override.
    this.messageOperations.initializeConfig(
      mergeDeclarativeMessageOperationsConfig(
        this.client.config.getConfig('messageOperations') ?? undefined,
        declarativeConfig?.messageOperations,
      ),
    );
  }

  get configState(): StateStore<ThreadConfig> {
    return this.configController.state;
  }

  get config(): Readonly<ThreadConfig> {
    return this.configController.value;
  }

  /**
   * Merges a partial configuration into the resolved config.
   *
   * @param config - The fields to change.
   */
  updateConfig(config: Partial<ThreadConfig>): void {
    this.configController.patch(config);
  }

  get channel() {
    return this.state.getLatestValue().channel;
  }

  get hasStaleState() {
    return this.state.getLatestValue().isStateStale;
  }

  get ownUnreadCount() {
    return ownUnreadCountSelector(this.client.userId)(this.state.getLatestValue());
  }

  /** See {@link Thread.activate}. */
  get active() {
    return this.state.getLatestValue().active;
  }

  /**
   * Declares that a consumer is displaying this thread and returns the function that ends it (as
   * `channel.activate()`). Refcounted: the thread stays active until the last release, and each
   * release is idempotent. `active` selects the threads reloaded on reconnect, so release it.
   *
   * The first activation keeps the thread in `client.threads` for the session, subscribed and
   * resolvable through `client.threads.get(id)` after release.
   */
  public activate = (): (() => void) => {
    this._activeRefCount += 1;
    if (this._activeRefCount === 1) {
      this.client.threads.register(this);
      this.state.partialNext({ active: true });
    }

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this._activeRefCount -= 1;
      if (this._activeRefCount === 0) {
        this.state.partialNext({ active: false });
      }
    };
  };

  /**
   * Re-queries the replies, sized to the loaded interval, and reconciles them in place (the thread
   * analogue of {@link Channel.reload}; recovery calls it for active threads). The thread applies
   * the response to itself ({@link Thread.hydrateState}), whether or not it is registered in
   * `client.threads`. Failed replies are kept: those loaded in the reply paginator or in the
   * offline DB before the request that are no longer loaded after it are ingested again (the
   * offline DB read is best effort). Rethrows, except for a not-found answer on a thread that never
   * had replies.
   */
  public reload = async () => {
    if (this.state.getLatestValue().isLoading) {
      return;
    }

    this.state.partialNext({ isLoading: true });

    try {
      const loadedReplyCount = this.messagePaginator.items?.length ?? 0;
      const requestedReplyLimit =
        Math.max(loadedReplyCount, this.messagePaginator.pageSize ?? 0) || undefined;
      const offlineDb = this.client.offlineDb;
      // best effort: a failing read must not fail the reload
      const failedInDb = offlineDb
        ? await offlineDb.getFailedMessages({ cid: this.channel.cid }).catch(() => [])
        : [];
      // after the read: a reply that fails meanwhile is loaded by then
      const failedBefore = this.messagePaginator.getFailedMessagesToRestore(failedInDb);
      const headIntervalItemIdsAtRequest =
        this.messagePaginator.getHeadIntervalItemIdsAtRequest();
      const { thread: threadData } = await this.client.getThread(
        { message_id: this.id },
        {
          participant_limit: DEFAULT_THREAD_PARTICIPANT_LIMIT,
          watch: true,
          reply_limit: requestedReplyLimit,
        },
      );
      this.channel.watchStatus = ChannelWatchStatus.Watching;
      this.hydrateState(threadData, {
        reconcile: {
          requestedLimit: requestedReplyLimit,
          headIntervalItemIdsAtRequest,
        },
      });
      this.messagePaginator.restoreFailedMessages(failedBefore);
    } catch (error) {
      const notFound =
        isDoesNotExistError(error as Error) ||
        (error as { status?: number })?.status === 404;
      const neverExisted = notFound && this.state.getLatestValue().replyCount === 0;
      // Not found while the parent has no replies: the thread was never created, not an error.
      if (neverExisted) return;

      throw error;
    } finally {
      this.state.partialNext({ isLoading: false });
    }
  };

  /**
   * Updates the thread's state and its channel's members and custom data, and merges the replies
   * into the loaded interval (with `reconcile`) or replaces it (without).
   */
  public hydrateState = (
    threadData: ThreadStateResponse,
    options?: { reconcile?: ReconcileNewestMessagesOptions },
  ) => {
    if (threadData.parent_message_id !== this.id) {
      throw new Error("Cannot hydrate thread's state from another thread's response");
    }

    const serverState = formatThreadState(threadData, this.client.userId);
    const reconcile = options?.reconcile;

    // Failed replies survive the hydrate: they are re-ingested after the incoming page is merged.
    const pendingReplies = Array.from(this.failedRepliesMap.values());

    ensureThreadChannel(this.client, threadData);
    this.state.partialNext({ ...serverState, isStateStale: false });

    if (this.hasSubscriptions) {
      this.client.messageStore.upsert(serverState.parentMessage);
    }

    const incomingReplies = (threadData.latest_replies ?? []).map(formatMessage);
    if (!reconcile) this.messagePaginator.clearStateAndCache();
    // The response's newest reply time replaces what was known, so latestMessageAt is right even
    // when the merged page lacks the newest reply, or that reply was hard-deleted.
    this.messagePaginator.setQueriedLatestMessageAt(threadData.last_message_at);
    if (typeof this.messagePaginator.items === 'undefined') {
      // Nothing loaded yet (e.g. a thread opened from a message): `reconcileNewestMessages` no-ops
      // without a loaded interval and would drop the fetched replies, so set them as the constructor
      // does.
      const isLastPage = holdsEveryReply(incomingReplies, threadData);
      this.messagePaginator.setItems({
        valueOrFactory: incomingReplies,
        cursor: getCursorFromReplies(incomingReplies, isLastPage),
        isFirstPage: true,
        isLastPage,
      });
    } else {
      this.messagePaginator.reconcileNewestMessages(incomingReplies, reconcile);
    }
    pendingReplies.forEach((reply) => this.messagePaginator.ingestItem(reply));
  };

  public registerSubscriptions = () => {
    if (this.hasSubscriptions) {
      return;
    }

    this.addUnsubscribeFunction(this.subscribeThreadSetupStateChange());
    this.addUnsubscribeFunction(this.subscribeParentMessageFromStore());
    this.addUnsubscribeFunction(this.subscribeMarkActiveThreadRead());
    this.addUnsubscribeFunction(this.subscribeReloadActiveStaleThread());
    this.addUnsubscribeFunction(this.subscribeMarkStaleOnStopWatching());
  };

  /**
   * Subscribes to the `'thread'` configuration key. Unlike `Channel`, which subscribes in its
   * constructor, a thread that never registers sees the declarative slice only as of construction:
   * no setup function runs, later `client.config.set` calls miss it and `client.config.reset()`
   * skips it. `ThreadManager` registers the threads it holds (listed, `ensure()`d or active) while
   * its own subscriptions are registered.
   */
  private subscribeThreadSetupStateChange = () =>
    applyInstanceConfiguration({
      args: { thread: this },
      config: this.client.config,
      key: 'thread',
      applyConfig: (config) => this.initializeConfig(config),
      // Read fresh: by the time reset calls this, the declarative store has been cleared.
      reinitializeConfig: () =>
        this.initializeConfig(this.client.config.getConfig('thread') ?? undefined),
      // Also rerun on the shared keys the reply paginator and operations derive from, so the setup
      // function's overrides survive.
      alsoWatch: ['messagePaginator', 'messageOperations'],
    });

  public handleThreadUpdated = (event: EventPayload<'thread.updated'>) => {
    if (!event.thread || event.thread.parent_message_id !== this.id) {
      return;
    }

    const threadData = event.thread;

    this.state.partialNext({
      title: threadData.title,
      updatedAt: threadData.updated_at,
      deletedAt: threadData.deleted_at ?? null,
      custom: threadData.custom ?? {},
    });
  };

  private subscribeMarkActiveThreadRead = () =>
    this.state.subscribeWithSelector(
      (nextValue) => ({
        active: nextValue.active,
        unreadMessageCount: ownUnreadCountSelector(this.client.userId)(nextValue),
      }),
      ({ active, unreadMessageCount }) => {
        if (!active || !unreadMessageCount) return;
        this.throttledMarkRead();
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

  /**
   * A watch stopped while the connection stays up (`NotWatching`) ends the channel's events with no
   * reconnect to catch it. A dropped connection (`WasWatching`) is left to recovery.
   */
  private subscribeMarkStaleOnStopWatching = () =>
    this.channel.state.subscribeWithSelector(
      ({ watchStatus }) => ({ watchStatus }),
      ({ watchStatus }, previous) => {
        if (
          previous?.watchStatus === ChannelWatchStatus.Watching &&
          watchStatus === ChannelWatchStatus.NotWatching
        ) {
          this.state.partialNext({ isStateStale: true });
        }
      },
    );

  public handleRepliesUnread = (event: EventPayload<'notification.mark_unread'>) => {
    if (!event.user || event.created_at == null || !event.thread_id) return;
    if (event.thread_id !== this.id) return;

    const userId = event.user.id;
    const createdAt = event.created_at;
    const user = event.user;

    this.state.next((current) => ({
      ...current,
      read: {
        ...current.read,
        [userId]: {
          ...current.read[userId],
          lastReadAt: timestampOr(event.last_read_at, createdAt),
          user,
          firstUnreadMessageId: event.first_unread_message_id,
          unreadMessageCount: event.unread_messages ?? 0,
        },
      },
    }));
  };

  public handleNewReply = (event: EventPayload<'message.new'>) => {
    if (!this.client.userId || event.message?.parent_id !== this.id) {
      return;
    }

    const isOwnMessage = event.message.user?.id === this.client.userId;
    const { active, read } = this.state.getLatestValue();

    this.upsertReplyLocally({
      message: event.message,
      timestampChanged: isOwnMessage,
    });

    if (active) {
      this.throttledMarkRead();
    }

    const nextRead: ThreadReadState = {};

    for (const userId of Object.keys(read)) {
      const userRead = read[userId];

      if (userRead) {
        let nextUserRead: ThreadUserReadState = userRead;

        if (userId === event.user?.id) {
          // The sender has no unread messages.
          nextUserRead = {
            ...nextUserRead,
            lastReadAt: timestampOr(event.created_at, nowNs()),
            user: event.user,
            unreadMessageCount: 0,
          };
        } else if (active && userId === this.client.userId) {
          // Do not increment unread count for the current user in an active thread
        } else {
          nextUserRead = {
            ...nextUserRead,
            unreadMessageCount: userRead.unreadMessageCount + 1,
          };
        }

        nextRead[userId] = nextUserRead;
      }
    }

    this.state.partialNext({ read: nextRead });
  };

  public handleRepliesRead = (event: EventPayload<'message.read'>) => {
    if (!event.user || event.created_at == null || !event.thread) return;
    if (event.thread.parent_message_id !== this.id) return;

    const userId = event.user.id;
    const createdAt = event.created_at;
    const user = event.user;

    this.state.next((current) => ({
      ...current,
      read: {
        ...current.read,
        [userId]: {
          lastReadAt: createdAt,
          user,
          lastReadMessageId: event.last_read_message_id,
          unreadMessageCount: 0,
        },
      },
    }));
  };

  public handleMessageDeleted = (event: EventPayload<'message.deleted'>) => {
    if (!event.message) return;
    const formattedMessage = formatMessage(event.message);

    if (event.message.parent_id === this.id) {
      if (event.hard_delete) {
        this.deleteReplyLocally({ message: event.message });
      } else {
        this.upsertReplyLocally({ message: event.message });
      }
    }

    if (event.message.id === this.id) {
      this.updateParentMessageLocally({ message: event.message });
    }

    this.messagePaginator.reflectQuotedMessageUpdate(formattedMessage);
  };

  public handleMessageUpdated = (event: PipelineEvent) => {
    if (!event.message) return;
    // A `message.updated` event carries `own_reactions: []`, which would wipe the current user's
    // reactions: keep them from the held copy (the reply paginator, or `state.parentMessage`).
    const message =
      event.message.parent_id === this.id
        ? {
            ...event.message,
            own_reactions:
              this.messagePaginator.getItem(event.message.id)?.own_reactions ??
              event.message.own_reactions,
          }
        : !event.message.parent_id && event.message.id === this.id
          ? {
              ...event.message,
              own_reactions:
                this.state.getLatestValue().parentMessage?.own_reactions ??
                event.message.own_reactions,
            }
          : event.message;
    this.updateParentMessageOrReplyLocally(message);
    this.messagePaginator.reflectQuotedMessageUpdate(formatMessage(event.message));
  };

  public handleReactionChanged = (event: PipelineEvent) => {
    if (!event.message || !event.reaction) return;
    const { message } = event;
    this.messagePaginator.reflectQuotedMessageUpdate(formatMessage(message));
  };

  // Applies a user ban or deletion to this thread's replies.
  public handleUserMessagesDeleted = (event: PipelineEvent) => {
    if (!event.user) return;
    // user.deleted carries the deletion time on the user; user.messages.deleted on the event.
    const deletedAtSource =
      event.type === 'user.deleted' ? event.user.deleted_at : event.created_at;
    this.messagePaginator.applyMessageDeletionForUser({
      userId: event.user.id,
      hardDelete: !!event.hard_delete,
      deletedAt: deletedAtSource ?? nowNs(),
    });
  };

  // `state.parentMessage` and its derived fields project the parent in the client-global message
  // store, so every update to the parent reaches them through this one subscription. Seeds the
  // store when no other collection holds the parent yet (e.g. a thread opened from a notification).
  private subscribeParentMessageFromStore = () => {
    const store = this.client.messageStore;
    const parent = this.state.getLatestValue().parentMessage;
    if (parent && !store.has(parent.id)) store.upsert(parent);

    return store.subscribe(this.id, (message) => {
      if (!message) return;
      this.state.next((current) => ({
        ...current,
        deletedAt: message.deleted_at ?? null,
        parentMessage: message,
        participants: mergeThreadParticipants(
          current.participants,
          normalizeThreadParticipants(message.thread_participants, current.channel.cid),
        ),
        replyCount: message.reply_count ?? current.replyCount,
      }));
    });
  };

  public unregisterSubscriptions = () => {
    const symbol = super.unregisterSubscriptions();
    // Releases the reply paginator's per-ID links on the shared message store (they are not in the
    // subscription list), which would otherwise pin a removed thread and its replies. `getThread`
    // builds a fresh instance if the thread is re-opened.
    this.messagePaginator.dispose();
    this.state.partialNext({ isStateStale: true });
    return symbol;
  };

  // todo: can be removed with the next breaking change and use MessagePaginator only
  public deleteReplyLocally = ({ message }: { message: MessageResponse }) => {
    // A no-op when the reply is not loaded.
    this.messagePaginator.removeItem({ id: message.id });
  };

  // todo: can be removed with the next breaking change and use MessagePaginator only
  public upsertReplyLocally = ({
    message,
  }: {
    message: MessageResponse | LocalMessage;
    // Unused: the reply paginator repositions by `created_at` on ingest.
    timestampChanged?: boolean;
  }) => {
    if (message.parent_id !== this.id) {
      throw new Error('Reply does not belong to this thread');
    }

    const formattedMessage = formatMessage(message);

    // todo: do we really need to keep the failedRepliesMap?
    if (formattedMessage.status === 'failed') {
      // Kept so a failed reply survives a reload or hydrate.
      this.failedRepliesMap.set(formattedMessage.id, formattedMessage);
    } else if (this.failedRepliesMap.has(message.id)) {
      this.failedRepliesMap.delete(message.id);
    }

    // Already showing this snapshot (a holder sharing the store wrote it first): skip the ingest.
    // TODO: This can probably be generalized as a safeguard up in ingestItem or maybe even EntityStore
    //       (so if a collection exists that holds this referential entity already, just use that or maybe
    //       even skip ingestion sometimes when it makes sense). But leaving that for a separate change.
    if (this.messagePaginator.getItem(formattedMessage.id) === formattedMessage) return;

    this.messagePaginator.ingestItem(formattedMessage);
  };

  // todo: can be removed with the next breaking change and use MessagePaginator only
  public updateParentMessageLocally = ({ message }: { message: MessageResponse }) => {
    if (message.id !== this.id) {
      throw new Error('Message does not belong to this thread');
    }

    // Written to the message store; `subscribeParentMessageFromStore` projects it into the state.
    if (this.client.messageStore.has(message.id)) {
      this.client.messageStore.upsert(formatMessage(message));
    }
  };

  // todo: can be removed with the next breaking change and use MessagePaginator only
  public updateParentMessageOrReplyLocally = (message: MessageResponse) => {
    if (message.parent_id === this.id) {
      this.upsertReplyLocally({ message });
    }

    if (!message.parent_id && message.id === this.id) {
      this.updateParentMessageLocally({ message });
    }
  };

  public markRead = async ({ force = false }: { force?: boolean } = {}) => {
    if (this.ownUnreadCount === 0 && !force) {
      return null;
    }

    return await this.client.messageDeliveryReporter.markRead(this);
  };

  private throttledMarkRead = () => {
    this.client.messageDeliveryReporter.throttledMarkRead(this);
  };

  /**
   * @deprecated Use `thread.markRead` instead.
   */
  public markAsRead = ({ force = false }: { force?: boolean } = {}) =>
    this.markRead({ force });
}

type MessageThreadParticipant = NonNullable<
  MessageResponse['thread_participants']
>[number];
type ThreadParticipant = NonNullable<ThreadStateResponse['thread_participants']>[number];

const normalizeThreadParticipants = (
  participants: MessageResponse['thread_participants'] | undefined,
  channelCid: string,
): ThreadStateResponse['thread_participants'] | undefined => {
  if (!participants) return undefined;

  const now = nowNs();

  return participants.map(
    (participant: MessageThreadParticipant) =>
      ({
        channel_cid: channelCid,
        created_at: now,
        last_read_at: now,
        user: participant as UserResponse,
        user_id: participant.id,
      }) as ThreadParticipant,
  );
};

/**
 * Adds the participants a parent message lists to the thread's. The message lists only the users who
 * replied, while a thread response also counts the parent's author, so replacing the thread's list
 * with the message's would drop that author.
 */
const mergeThreadParticipants = (
  current: ThreadStateResponse['thread_participants'],
  fromMessage: ThreadStateResponse['thread_participants'],
): ThreadStateResponse['thread_participants'] => {
  if (!fromMessage) return current;
  if (!current?.length) return fromMessage;
  const known = new Set(current.map((participant) => participant.user_id));
  const added = fromMessage.filter((participant) => !known.has(participant.user_id));
  return added.length ? [...current, ...added] : current;
};

/** `participant_limit` of the single-thread requests (`getThreadAndHydrate`, `reload()`). */
export const DEFAULT_THREAD_PARTICIPANT_LIMIT = 100;

/** The thread's channel, with the members and custom data of `threadData` applied. */
export const ensureThreadChannel = (
  client: StreamChat,
  threadData: ThreadStateResponse,
) => {
  if (!threadData.channel) {
    throw new Error('Thread channel is required when threadData is provided');
  }
  const channel = client.channelManager.ensure({
    type: threadData.channel.type,
    id: threadData.channel.id,
    data: { custom: threadData.channel.custom },
  });
  channel._hydrateMembers({
    members: threadData.channel.members ?? [],
    overrideCurrentState: false,
  });
  return channel;
};

/** Against the top-level `reply_count`: unlike the parent's, it excludes soft-deleted replies. */
const holdsEveryReply = (replies: LocalMessage[], threadData: ThreadStateResponse) =>
  replies.length === (threadData.reply_count ?? 0);

const formatThreadState = (threadData: ThreadStateResponse, currentUserId?: string) => {
  const parentMessage = threadData.parent_message;
  if (!parentMessage) {
    throw new Error('Thread parent_message is required when threadData is provided');
  }

  return {
    createdAt: threadData.created_at,
    custom: threadData.custom ?? {},
    deletedAt: threadData.deleted_at ?? null,
    parentMessage: formatMessage(parentMessage),
    participants: threadData.thread_participants,
    read: formatReadState(
      !threadData.read || threadData.read.length === 0
        ? getPlaceholderReadResponse(currentUserId)
        : threadData.read,
    ),
    // From the parent message: the top-level `threadData.reply_count` excludes soft-deleted
    // replies, the parent's (like the channel's) includes them.
    replyCount: parentMessage.reply_count ?? 0,
    title: threadData.title,
    updatedAt: threadData.updated_at ?? null,
  };
};

const formatReadState = (read: ReadStateResponse[]): ThreadReadState =>
  read.reduce<ThreadReadState>((state, userRead) => {
    state[userRead.user.id] = {
      user: userRead.user,
      lastReadMessageId: userRead.last_read_message_id,
      unreadMessageCount: userRead.unread_messages ?? 0,
      lastReadAt: userRead.last_read,
    };
    return state;
  }, {});

const getPlaceholderReadResponse = (currentUserId?: string): ReadStateResponse[] =>
  currentUserId
    ? [
        {
          user: { id: currentUserId } as UserResponse,
          unread_messages: 0,
          last_read: nowNs(),
        },
      ]
    : [];

const ownUnreadCountSelector =
  (currentUserId: string | undefined) => (state: ThreadState) =>
    (currentUserId && state.read[currentUserId]?.unreadMessageCount) || 0;
