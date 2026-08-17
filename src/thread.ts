import { StateStore } from './store';
import {
  computeOwnReactions,
  formatMessage,
  localMessageToNewMessagePayload,
} from './utils';
import { applyReactionLocally } from './entityStore';
import type {
  DraftResponse,
  EventAPIResponse,
  EventType,
  LocalMessage,
  MarkReadRequest,
  MessageResponse,
  ReactionRequest,
  ReadStateResponse,
  SendReactionRequest,
  SortParamRequest,
  ThreadStateResponse,
  UserResponse,
} from './types';
import { isEphemeral } from './errors';
import type {
  Channel,
  DeleteMessageWithStateUpdateParams,
  SendMessageWithStateUpdateParams,
  UpdateMessageWithStateUpdateParams,
} from './channel';
import type { StreamChat } from './client';
import type { CustomThreadData } from './custom_types';
import { MessageComposer } from './messageComposer';
import { MessageOperations } from './messageOperations';
import { WithSubscriptions } from './utils/WithSubscriptions';
import { isEqual } from './utils/mergeWith/mergeWithCore';
import { MessagePaginator } from './pagination';
import { applyInstanceConfiguration } from './configuration/applyInstanceConfiguration';
import type { ThreadDeclarativeConfig } from './configuration/types';
import {
  mergeDeclarativeMessageOperationsConfig,
  mergeDeclarativePaginatorConfig,
  toDeclarativePaginatorConfig,
} from './configuration/declarativeSlices';
import type { PipelineEvent } from './EventHandlerPipeline';

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
  /**
   * Thread is identified by and has a one-to-one relation with its parent message.
   * We use parent message id as a thread id.
   */
  parentMessage: LocalMessage;
  participants: ThreadStateResponse['thread_participants'];
  read: ThreadReadState;
  replyCount: number;
  title: string;
  updatedAt: Date | null;
};

export type ThreadUserReadState = {
  lastReadAt: Date;
  unreadMessageCount: number;
  user: UserResponse;
  lastReadMessageId?: string;
  firstUnreadMessageId?: string;
};

export type ThreadReadState = Record<string, ThreadUserReadState | undefined>;

const DEFAULT_PAGE_LIMIT = 50;
const DEFAULT_SORT: SortParamRequest[] = [{ field: 'created_at', direction: -1 }];
const DEFAULT_ITEM_ORDER: SortParamRequest[] = [{ field: 'created_at', direction: 1 }];

export type CustomThreadMarkReadRequestFn = (params: {
  thread: Thread;
  options?: MarkReadRequest;
}) => Promise<EventAPIResponse | null> | void;

export type ThreadInstanceConfig = {
  requestHandlers?: {
    markReadRequest?: CustomThreadMarkReadRequestFn;
  };
};

export class Thread extends WithSubscriptions {
  public readonly configState = new StateStore<ThreadInstanceConfig>({});
  public readonly state: StateStore<ThreadState>;
  public readonly id: string;
  public readonly messageComposer: MessageComposer;
  public readonly messagePaginator: MessagePaginator;
  public readonly messageOperations: MessageOperations;

  private client: StreamChat;
  private failedRepliesMap: Map<string, LocalMessage> = new Map();

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
      if (!threadData.channel) {
        throw new Error('Thread channel is required when threadData is provided');
      }
      if (!threadData.parent_message) {
        throw new Error('Thread parent_message is required when threadData is provided');
      }
      const threadChannel = client.channel(
        threadData.channel.type,
        threadData.channel.id,
        { custom: threadData.channel.custom },
      );
      threadChannel._hydrateMembers({
        members: threadData.channel.members ?? [],
        overrideCurrentState: false,
      });

      this.state = new StateStore<ThreadState>({
        // local only
        active: false,
        isLoading: false,
        isStateStale: false,
        // 99.9% should never change
        channel: threadChannel,
        createdAt: new Date(threadData.created_at),
        // rest
        deletedAt: threadData.deleted_at ? new Date(threadData.deleted_at) : null,
        parentMessage: formatMessage(threadData.parent_message),
        participants: threadData.thread_participants,
        read: formatReadState(
          !threadData.read || threadData.read.length === 0
            ? getPlaceholderReadResponse(client.userID)
            : threadData.read,
        ),
        // Use the parent message's reply_count, not the top-level threadData.reply_count. The
        // thread endpoints (getThread/queryThreads) return a top level reply_count that EXCLUDES
        // soft-deleted replies, while parent_message.reply_count (and the channel's own copy)
        // INCLUDE them so the top level value renders fewer replies than the channel badge shows.
        // parent_message.reply_count is the authoritative, channel consistent count.
        replyCount: threadData.parent_message.reply_count ?? 0,
        updatedAt: threadData.updated_at ? new Date(threadData.updated_at) : null,
        title: threadData.title,
        custom: threadData.custom ?? {},
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
      const createdAt = parentMessage.created_at
        ? new Date(parentMessage.created_at)
        : new Date();

      this.state = new StateStore<ThreadState>({
        active: false,
        channel,
        createdAt,
        custom: {},
        deletedAt: formattedParentMessage.deleted_at ?? null,
        isLoading: false,
        isStateStale: false,
        parentMessage: formattedParentMessage,
        participants: [],
        read: formatReadState(getPlaceholderReadResponse(client.userID)),
        replyCount: parentMessage.reply_count ?? 0,
        title: '',
        updatedAt: parentMessage.updated_at ? new Date(parentMessage.updated_at) : null,
      });

      this.id = parentMessage.id;
    }

    this.client = client;

    // Read the declarative configuration before the sub-objects exist, so it can go in as constructor
    // options — the reply paginator's `unreadReferencePolicy` and initial cursor are read once.
    const declarativeConfig = client.config.getConfig('thread') ?? undefined;
    // Thread replies are backed by a MessagePaginator too, so the general key applies here as well;
    // the per-parent slice overrides it (thread replies default to a smaller page than a channel).
    const messagePaginatorConfig = mergeDeclarativePaginatorConfig(
      client.config.getConfig('messagePaginator') ?? undefined,
      declarativeConfig?.messagePaginator,
    );

    this.messagePaginator = new MessagePaginator(
      {
        channel: this.channel,
        parentMessageId: this.id,
        requestSort: DEFAULT_SORT,
        itemOrder: DEFAULT_ITEM_ORDER,
        // Split as in `Channel`: the policy is a constructor argument, not paginator configuration.
        unreadReferencePolicy: messagePaginatorConfig?.unreadReferencePolicy,
        paginatorOptions: {
          declarativeConfig: toDeclarativePaginatorConfig(messagePaginatorConfig),
        },
      },
      // Thread replies default to a smaller page than a channel list. Supplied by the SDK, not by the
      // integrator, so it sits at stage 1 — `client.config.set({ messagePaginator: { pageSize } })`
      // overrides it, which would not be true of a construction argument.
      { pageSize: DEFAULT_PAGE_LIMIT },
    );

    // Seed the reply paginator from the thread's `latest_replies` so a thread we already hold
    // data for (queried via the ThreadManager or hydrated from a ThreadResponse) renders its
    // first reply page instantly, without a network fetch on open. `latest_replies` is the most
    // recent window of replies, so it reaches the head (nothing newer to load); it reaches the
    // tail only when it already contains every reply. Threads built from a bare parent message
    // carry no replies to seed and fall back to a paginator fetch on first open.
    if (threadData?.latest_replies?.length) {
      this.messagePaginator.setItems({
        valueOrFactory: threadData.latest_replies.map(formatMessage),
        isFirstPage: true,
        isLastPage: threadData.latest_replies.length === (threadData.reply_count ?? 0),
      });
    }

    // Seed the reply paginator's lastMessageAt floor from the thread's server-provided
    // `last_message_at` (analogous to the channel seed in Channel._initializeState), so a thread whose
    // newest reply is not among `latest_replies` still reports the correct latest-activity timestamp.
    this.messagePaginator.seedLastMessageAt(threadData?.last_message_at);

    this.messageComposer = new MessageComposer({
      client,
      composition: threadData?.draft ?? draft,
      compositionContext: this,
    });

    this.messageOperations = new MessageOperations({
      ingest: (m) => {
        this.messagePaginator.ingestItem(m);
        this.channel.getClient().messageStore.flushSubscribers(m.id);
      },
      get: (id) => this.messagePaginator.getItem(id),
      normalizeOutgoingMessage: (m) => ({
        ...m,
        parent_id: this.id,
      }),
      handlers: () => {
        const { requestHandlers } = this.channel.configState.getLatestValue();
        const deleteMessageRequest = requestHandlers?.deleteMessageRequest;
        const sendMessageRequest = requestHandlers?.sendMessageRequest;
        const retrySendMessageRequest = requestHandlers?.retrySendMessageRequest;
        const updateMessageRequest = requestHandlers?.updateMessageRequest;
        return {
          delete: deleteMessageRequest
            ? (p) =>
                deleteMessageRequest({
                  localMessage: p.localMessage,
                  options: p.options,
                })
            : undefined,
          send: sendMessageRequest
            ? (p) =>
                sendMessageRequest({
                  localMessage: p.localMessage,
                  message: p.message,
                  options: p.options,
                })
            : undefined,
          retry: retrySendMessageRequest
            ? (p) =>
                retrySendMessageRequest({
                  localMessage: p.localMessage,
                  message: p.message,
                  options: p.options,
                })
            : undefined,
          update: updateMessageRequest
            ? (p) =>
                updateMessageRequest({
                  localMessage: p.localMessage,
                  options: p.options,
                })
            : undefined,
        };
      },
      defaults: {
        delete: async (id, o) => {
          const result = await this.channel.getClient().deleteMessage({ id, ...o });
          return { message: result.message };
        },
        send: async (m, o) => {
          const result = await this.channel.sendMessage({ message: m, ...o });
          return { message: result.message };
        },
        update: async (m, o) => {
          const result = await this.channel.getClient().updateMessage({
            id: m.id,
            message: localMessageToNewMessagePayload(m),
            ...o,
          });
          return { message: result.message };
        },
      },
    });

    // Share one derivation path with `config.reset()`. Idempotent — the paginator was already
    // configured through its constructor above; this re-applies the mutable half the way a reset does.
    this.initializeConfig(declarativeConfig);
  }

  /**
   * Derives this thread's configuration — and its reply paginator's — from the declarative slice.
   *
   * Called by the constructor and by `client.config.reset()`. The thread owns only its own
   * `requestHandlers`; the paginator derives its own configuration.
   */
  initializeConfig(declarativeConfig?: ThreadDeclarativeConfig): void {
    // Replaces rather than merges: a handler dropped from the declarative tree must disappear.
    // Guarded against a no-op publish exactly as `Channel.initializeConfig` is — same freshly allocated
    // object, same `alsoWatch` re-run, and `useThreadRequestHandlers` subscribes to this store too.
    const nextRequestHandlers = declarativeConfig?.requestHandlers;
    if (
      !isEqual(this.configState.getLatestValue().requestHandlers, nextRequestHandlers)
    ) {
      this.configState.next({ requestHandlers: nextRequestHandlers });
    }

    this.messagePaginator.initializeConfig(
      toDeclarativePaginatorConfig(
        mergeDeclarativePaginatorConfig(
          this.client.config.getConfig('messagePaginator') ?? undefined,
          declarativeConfig?.messagePaginator,
        ),
      ),
    );

    // A thread sends messages too, so it owns a `MessageOperations` of its own and takes the same shared
    // key the channel does, with its own per-parent override.
    this.messageOperations.initializeConfig(
      mergeDeclarativeMessageOperationsConfig(
        this.client.config.getConfig('messageOperations') ?? undefined,
        declarativeConfig?.messageOperations,
      ),
    );
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
      const loadedReplyCount = this.messagePaginator.items?.length ?? 0;
      const thread = await this.client.getThreadAndHydrate(this.id, {
        watch: true,
        reply_limit: loadedReplyCount || this.messagePaginator.pageSize,
      });
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
      updatedAt,
    } = thread.state.getLatestValue();

    // Preserve pending (failed) replies so they survive the hydrate. The messagePaginator is now
    // the sole reply source, so we merge the incoming newest page into it and re-ingest the
    // pending replies (mirrors the previous state.replies concat behavior).
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
      updatedAt,
      isStateStale: false,
    });

    if (parentMessage && this.hasSubscriptions) {
      this.client.messageStore.upsert(parentMessage);
    }

    this.messagePaginator.mergeNewestPage(
      thread.messagePaginator.state.getLatestValue().items ?? [],
    );
    pendingReplies.forEach((reply) => this.messagePaginator.ingestItem(reply));
    // Carry the re-queried thread's last-activity floor so lastMessageAt stays fresh even when the
    // merged page does not include the newest reply. Monotonic, so an older value is a no-op.
    this.messagePaginator.seedLastMessageAt(thread.messagePaginator.lastMessageAt);
  };

  public registerSubscriptions = () => {
    if (this.hasSubscriptions) {
      // Thread is already listening for events and changes
      return;
    }

    this.addUnsubscribeFunction(this.subscribeThreadSetupStateChange());
    this.addUnsubscribeFunction(this.subscribeParentMessageFromStore());
    this.addUnsubscribeFunction(this.subscribeThreadUpdated());
    this.addUnsubscribeFunction(this.subscribeMarkActiveThreadRead());
    this.addUnsubscribeFunction(this.subscribeReloadActiveStaleThread());
    this.addUnsubscribeFunction(this.subscribeMarkThreadStale());
    this.addUnsubscribeFunction(this.subscribeNewReplies());
    this.addUnsubscribeFunction(this.subscribeRepliesRead());
    this.addUnsubscribeFunction(this.subscribeRepliesUnread());
    this.addUnsubscribeFunction(this.subscribeMessageDeleted());
    this.addUnsubscribeFunction(this.subscribeMessageUpdated());
    this.addUnsubscribeFunction(this.subscribeUserMessagesDeleted());
  };

  /**
   * Subscribes this thread to the `'thread'` configuration key. Registered through
   * `WithSubscriptions`, so `unregisterSubscriptions()` runs the setup function's teardown.
   *
   * **This is where `Thread` differs from `Channel`,** which subscribes from its constructor. Everything
   * below follows from that, and applies to a thread that never calls `registerSubscriptions()`:
   *
   * - no *setup function* runs for it — matching how `MessageComposer` already behaves;
   * - it sees the declarative slice **as it stood when the thread was constructed**, because the
   *   constructor applies it directly, but no *later* `client.config.set({ thread: … })` or
   *   `set({ messagePaginator: … })` reaches it;
   * - it is absent from the service's `liveInstances`, so `client.config.reset()` skips it, and
   *   `hasLiveInstances('thread')` does not count it when deciding whether to warn about a
   *   construction-only path registered too late.
   *
   * So read "declarative configuration is unaffected" as *at construction only*. A thread held by a
   * `ThreadManager` that has itself registered is covered — `subscribeManageThreadSubscriptions` calls
   * `registerSubscriptions()` on every thread entering its state — so the common path is fine. A thread
   * constructed directly, or held by an unregistered manager, is not.
   *
   * The alternative — applying the setup function at construction — would break the teardown symmetry
   * `WithSubscriptions` provides, which is why the asymmetry stands.
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
      // The reply paginator also derives from the shared `messagePaginator` key — run the full cycle
      // on a change there, so the setup function's overrides survive.
      alsoWatch: ['messagePaginator', 'messageOperations'],
    });

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
        custom: threadData.custom ?? {},
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

  private subscribeMarkThreadStale = () =>
    this.client.on('user.watching.stop', (event: PipelineEvent) => {
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

  private subscribeRepliesUnread = () =>
    this.client.on('notification.mark_unread', (event) => {
      if (!event.user || !event.created_at || !event.thread_id) return;
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
            lastReadAt:
              typeof event.last_read_at !== 'undefined'
                ? new Date(event.last_read_at)
                : new Date(createdAt),
            user,
            firstUnreadMessageId: event.first_unread_message_id,
            unreadMessageCount: event.unread_messages ?? 0,
          },
        },
      }));
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
        // MessageRequest from current user could have been added optimistically,
        // so the actual timestamp might differ in the event
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
      const formattedMessage = formatMessage(event.message);

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

      this.messagePaginator.reflectQuotedMessageUpdate(formattedMessage);
    }).unsubscribe;

  private subscribeMessageUpdated = () => {
    const messageUpdateTypes: EventType[] = ['message.updated', 'message.undeleted'];
    const reactionTypes: EventType[] = [
      'reaction.new',
      'reaction.deleted',
      'reaction.updated',
    ];

    const unsubscribeMessageUpdated = messageUpdateTypes.map(
      (eventType) =>
        this.client.on(eventType, (event: PipelineEvent) => {
          if (!event.message) return;
          // A `message.updated` WS event carries `own_reactions: []`; upserting it verbatim would
          // wipe the current user's reactions on an edit. Preserve them off the copy we already hold
          // — the reply paginator for a reply, `state.parentMessage` for the parent (the parent is
          // not held in any paginator, so it needs the same treatment directly).
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
        }).unsubscribe,
    );

    const unsubscribeReactions = reactionTypes.map(
      (eventType) =>
        this.client.on(eventType, (event: PipelineEvent) => {
          if (!event.message || !event.reaction) return;
          const { message, reaction } = event;
          if (message.parent_id === this.id) {
            // Preserve/apply the current user's `own_reactions` off the reply paginator itself,
            // independently of the channel (mirrors the channel's main-list reflectReaction).
            this.messagePaginator.reflectReaction({
              enforceUnique: eventType === 'reaction.updated',
              message,
              reaction,
              removed: eventType === 'reaction.deleted',
            });
          } else if (!message.parent_id && message.id === this.id) {
            // Reaction on the PARENT. The parent isn't in a paginator, so apply the current user's
            // own_reactions delta here (mirroring the reply path's reflectReaction) rather than
            // copying the WS event verbatim — which would drop own_reactions the event omits.
            const own_reactions = computeOwnReactions({
              current:
                this.state.getLatestValue().parentMessage?.own_reactions ??
                message.own_reactions ??
                [],
              enforceUnique: eventType === 'reaction.updated',
              reaction,
              removed: eventType === 'reaction.deleted',
              userId: this.client.userID,
            });
            this.updateParentMessageLocally({ message: { ...message, own_reactions } });
          }
          this.messagePaginator.reflectQuotedMessageUpdate(formatMessage(message));
        }).unsubscribe,
    );

    const unsubscribeFunctions = [...unsubscribeMessageUpdated, ...unsubscribeReactions];

    return () => unsubscribeFunctions.forEach((unsubscribe) => unsubscribe());
  };

  private subscribeUserMessagesDeleted = () => {
    // Apply a user ban / deletion to this thread's own reply list. Previously
    // channel.state.deleteUserMessages marked banned-user replies deleted in the (now removed)
    // channel.state.threads shadow; the reply paginator is the thread's source of truth now.
    const eventTypes: EventType[] = ['user.messages.deleted', 'user.deleted'];

    const unsubscribeFunctions = eventTypes.map(
      (eventType) =>
        this.client.on(eventType, (event: PipelineEvent) => {
          if (!event.user) return;
          // user.deleted carries the deletion time on the user; user.messages.deleted on the event.
          const deletedAtSource =
            eventType === 'user.deleted' ? event.user.deleted_at : event.created_at;
          this.messagePaginator.applyMessageDeletionForUser({
            userId: event.user.id,
            hardDelete: !!event.hard_delete,
            deletedAt: deletedAtSource ? new Date(deletedAtSource) : new Date(),
          });
        }).unsubscribe,
    );

    return () => unsubscribeFunctions.forEach((unsubscribe) => unsubscribe());
  };

  // The parent message lives in the client-global message store (one canonical POJO per id);
  // `state.parentMessage` and the fields derived from it are a projection of that copy. Every update
  // to the parent — optimistic reaction, WS reaction/edit/delete, reply-count bump — writes the
  // store, which reflects it here through this single subscription (one per thread, not one per
  // message). Seeds the store on first subscribe when no other collection holds the parent yet
  // (e.g. a thread opened from a notification, its parent not in the channel window).
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
        participants:
          normalizeThreadParticipants(message.thread_participants, current.channel.cid) ??
          current.participants,
        replyCount: message.reply_count ?? current.replyCount,
      }));
    });
  };

  public unregisterSubscriptions = () => {
    const symbol = super.unregisterSubscriptions();
    // Release the reply paginator's hold on the shared message store. The parent subscription is
    // torn down by `super.unregisterSubscriptions()` (it was added as an unsubscribe function), but
    // the reply paginator's per-id links live in its item index, not in the subscription list — so a
    // removed thread would otherwise stay pinned by `messageStore.subscribers` and keep its replies
    // alive. `getThread` builds a fresh instance if this thread is re-opened, so this is a discard.
    this.messagePaginator.dispose();
    this.state.partialNext({ isStateStale: true });
    return symbol;
  };

  // todo: can be removed with the next breaking change and use MessagePaginator only
  public deleteReplyLocally = ({ message }: { message: MessageResponse }) => {
    // The reply messagePaginator is the reply list source. removeItem is a no-op when the reply
    // isn't loaded, so it's safe to run unconditionally.
    this.messagePaginator.removeItem({ id: message.id });
  };

  // todo: can be removed with the next breaking change and use MessagePaginator only
  public upsertReplyLocally = ({
    message,
  }: {
    message: MessageResponse | LocalMessage;
    // Accepted for backward compatibility but no longer used — the messagePaginator repositions
    // by created_at on ingest, so a changed timestamp is handled without an explicit flag.
    timestampChanged?: boolean;
  }) => {
    if (message.parent_id !== this.id) {
      throw new Error('Reply does not belong to this thread');
    }

    const formattedMessage = formatMessage(message);

    // todo: do we really need to keep the failedRepliesMap?
    if (formattedMessage.status === 'failed') {
      // store failed reply so that it's not lost when reloading or hydrating
      this.failedRepliesMap.set(formattedMessage.id, formattedMessage);
    } else if (this.failedRepliesMap.has(message.id)) {
      this.failedRepliesMap.delete(message.id);
    }

    // The reply messagePaginator is the reply list source.
    this.messagePaginator.ingestItem(formattedMessage);
  };

  // todo: can be removed with the next breaking change and use MessagePaginator only
  public updateParentMessageLocally = ({ message }: { message: MessageResponse }) => {
    if (message.id !== this.id) {
      throw new Error('Message does not belong to this thread');
    }

    // The parent's content lives in the client-global message store; `state.parentMessage` (and the
    // fields derived from it) is a projection kept in sync by `subscribeParentMessageFromStore`.
    // Writing the store fans the change out to every collection holding this id and reflects it here.
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

  /**
   * Sends a message with optimistic local state update.
   */
  async sendMessageWithLocalUpdate({
    localMessage,
    message,
    options,
    sendMessageRequestFn,
  }: SendMessageWithStateUpdateParams): Promise<void> {
    await this.messageOperations.send(
      {
        localMessage,
        message,
        options,
      },
      sendMessageRequestFn,
    );
  }

  /**
   * Retry sending a failed message.
   */
  async retrySendMessageWithLocalUpdate(
    params: Omit<SendMessageWithStateUpdateParams, 'message'>,
  ) {
    await this.messageOperations.retry(
      {
        localMessage: { ...params.localMessage, type: 'regular' },
        options: params.options,
      },
      params.sendMessageRequestFn,
    );
  }

  /**
   * Updates a message with optimistic local state update.
   *
   * The update flows through `messagePaginator`, which is the sole reply source.
   */
  async updateMessageWithLocalUpdate(params: UpdateMessageWithStateUpdateParams) {
    await this.messageOperations.update(
      {
        localMessage: params.localMessage,
        options: params.options,
      },
      params.updateMessageRequestFn,
    );
  }

  /**
   * Deletes a message with local state update.
   */
  async deleteMessageWithLocalUpdate(params: DeleteMessageWithStateUpdateParams) {
    await this.messageOperations.delete(
      {
        localMessage: params.localMessage,
        options: params.options,
      },
      params.deleteMessageRequestFn,
    );
  }

  /**
   * Adds a reaction to a reply with an optimistic local state update, mirroring
   * {@link Channel.addReactionWithLocalUpdate}. The optimistic message is applied to THIS thread's
   * paginator (so pure replies get optimism the channel paginator can't give); the request routes
   * through the parent channel since reactions are channel-level.
   */
  async addReactionWithLocalUpdate({
    messageId,
    reaction,
    options,
  }: {
    messageId: string;
    reaction: ReactionRequest;
    options?: Pick<SendReactionRequest, 'enforce_unique' | 'skip_push'>;
  }) {
    const client = this.channel.getClient();
    const undo = applyReactionLocally(client, {
      enforceUnique: options?.enforce_unique ?? false,
      messageId,
      reaction,
    });

    try {
      const response = await this.channel.sendReaction({
        id: messageId,
        reaction,
        ...options,
      });
      // reconcile the server copy only if we still hold it — a bare upsert of an unheld id would
      // orphan it (the store's refcount GC only reclaims held ids).
      if (response?.message && client.messageStore.has(response.message.id)) {
        client.messageStore.upsert(formatMessage(response.message));
      }
    } catch (error) {
      if (undo && (!client.offlineDb || !isEphemeral(error as Error))) {
        undo();
      }
      throw error;
    }
  }

  /**
   * Removes the current user's reaction from a reply with an optimistic local state update,
   * mirroring {@link Thread.addReactionWithLocalUpdate}.
   */
  async deleteReactionWithLocalUpdate({
    messageId,
    type,
  }: {
    messageId: string;
    type: string;
  }) {
    const client = this.channel.getClient();
    const undo = applyReactionLocally(client, {
      messageId,
      reaction: { type },
      removed: true,
    });

    try {
      const response = await this.channel.deleteReaction({ id: messageId, type });
      // reconcile the server copy only if we still hold it — a bare upsert of an unheld id would
      // orphan it (the store's refcount GC only reclaims held ids).
      if (response?.message && client.messageStore.has(response.message.id)) {
        client.messageStore.upsert(formatMessage(response.message));
      }
    } catch (error) {
      if (undo && (!client.offlineDb || !isEphemeral(error as Error))) {
        undo();
      }
      throw error;
    }
  }

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

  const now = new Date();

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

const formatReadState = (read: ReadStateResponse[]): ThreadReadState =>
  read.reduce<ThreadReadState>((state, userRead) => {
    state[userRead.user.id] = {
      user: userRead.user,
      lastReadMessageId: userRead.last_read_message_id,
      unreadMessageCount: userRead.unread_messages ?? 0,
      lastReadAt: new Date(userRead.last_read),
    };
    return state;
  }, {});

const getPlaceholderReadResponse = (currentUserId?: string): ReadStateResponse[] =>
  currentUserId
    ? [
        {
          user: { id: currentUserId } as UserResponse,
          unread_messages: 0,
          last_read: new Date(),
        },
      ]
    : [];

const ownUnreadCountSelector =
  (currentUserId: string | undefined) => (state: ThreadState) =>
    (currentUserId && state.read[currentUserId]?.unreadMessageCount) || 0;
