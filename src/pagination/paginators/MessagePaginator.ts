import type {
  BasePaginatorConfig,
  ExecuteQueryReturnValue,
  Interval,
  PostQueryReconcileParams,
} from './BasePaginator';
import {
  type MessagePaginatorOptions as BaseMessagePaginatorOptions,
  getMessageCreatedAtTimestamp,
  type JumpToMessageOptions,
  MessageIntervalPaginator,
  type MessageQueryShape,
} from './MessageIntervalPaginator';
import type { LocalMessage, TimestampNS, UserResponse } from '../../types';
import type { EntityStoreChangeBatch } from '../../entityStore/EntityStore';
import { asTimestampNS, nsToDate } from '../../utils/time';
import { StateStore } from '@stream-io/state-store';

export type {
  JumpToMessageOptions,
  MergeNewestPageOptions,
  MessageFocusReason,
  MessageFocusSignal,
  MessageFocusSignalState,
  MessagePaginatorFilter,
  MessagePaginatorSort,
  MessagePaginatorState,
  MessageQueryShape,
  SeedFirstPageOptions,
} from './MessageIntervalPaginator';
export { MessageIntervalPaginator } from './MessageIntervalPaginator';

/**
 * Whole-collection aggregates, independent of the active pagination window. `lastMessageAt` is the
 * max `created_at` over the channel-relevant messages and orders the channel list
 * (`channel.messagePaginator.lastMessageAt`): seeded from `ChannelResponse.last_message_at`, then
 * advanced monotonically as newer messages are ingested.
 */
export type MessagePaginatorAggregateState = {
  /**
   * The newest channel-relevant message, for display (last-message preview, latest-reply avatar). A
   * live reference: it advances to a strictly newer message, is refreshed in place on edit,
   * soft-delete or reaction, and is recomputed when hard-removed. Follows `shouldAdvanceLastMessage`
   * (skips system messages per `skip_last_msg_update_for_system_msgs`, and thread-only replies).
   * `null` until one is ingested.
   *
   * It lives outside pagination `state`, which only emits when the active interval is affected: a
   * message landing in the head interval while an older window is active would go stale there.
   */
  lastMessage: LocalMessage | null;
  /**
   * `ChannelResponse.last_message_at` floor, for channels whose newest message is not loaded. Kept
   * apart from {@link lastMessage} so it can outrank a stale or absent loaded message for sorting
   * without replacing the display message. {@link MessagePaginator.lastMessageAt} is the max of
   * the two.
   */
  seededLastMessageAt: TimestampNS | null;
};

export type MessagePaginatorOptions = BaseMessagePaginatorOptions & {
  /**
   * Where `jumpToTheFirstUnreadMessage()` reads the unread reference from: `'snapshot'` (default)
   * prefers `unreadStateSnapshot`, `'read-state-only'` uses only `channel.state.read[...]`.
   */
  unreadReferencePolicy?: 'snapshot' | 'read-state-only';
};

export type UnreadSnapshotState = {
  lastReadAt: TimestampNS | null;
  unreadCount: number;
  /**
   * First unread message id. Decoupled from `channel.state.read[...]` because apps may mark the
   * channel read on open yet still want UI that jumps to the previously unread location.
   */
  firstUnreadMessageId: string | null;
  /** Last read message id, a fallback when the first unread is unknown. */
  lastReadMessageId: string | null;
};

/**
 * Set by the owning SDK (the state layer has no viewport): `true` while the user views the latest
 * messages (app foregrounded and newest message on screen). While live, an incoming message does
 * not bump the unread count or snapshot. Defaults to `false`.
 */
export type LiveViewState = {
  isViewingLive: boolean;
};

/**
 * Adds the unread snapshot, the UI-driven live-view signal and "jump to first unread" navigation to
 * {@link MessageIntervalPaginator}.
 */
export class MessagePaginator extends MessageIntervalPaginator {
  protected get holderName() {
    return 'message-paginator';
  }
  private unreadReferencePolicy: 'snapshot' | 'read-state-only';
  /** Unread reference state, independent of `channel.state.read`. Set it before `markRead`. */
  readonly unreadStateSnapshot: StateStore<UnreadSnapshotState>;
  /**
   * The "viewing the latest messages" signal ({@link LiveViewState}), set via {@link setViewingLive}
   * and read by the channel to gate the unread bump on `message.new`.
   */
  readonly liveViewState: StateStore<LiveViewState>;
  /**
   * {@link MessagePaginatorAggregateState}, in a store apart from `state` so `lastMessageAt` can
   * advance from inside a `state.next` updater (`ingestPage`) and subscribers only see aggregate
   * changes.
   */
  readonly aggregateState: StateStore<MessagePaginatorAggregateState>;

  constructor(
    { unreadReferencePolicy = 'snapshot', ...options }: MessagePaginatorOptions,
    builtInDefaults: Partial<BasePaginatorConfig<LocalMessage, MessageQueryShape>> = {},
  ) {
    super(options, {
      // Publish `state` at most every 500ms (leading + trailing). Optimistic (local-user) writes
      // bypass it via `EntityStore.flushSubscribers`. A default, so `stateThrottleMs` options and
      // declarative registrations override it and a re-derivation restores it.
      stateThrottleMs: 500,
      ...builtInDefaults,
    });
    this.unreadReferencePolicy = unreadReferencePolicy;
    this.unreadStateSnapshot = new StateStore<UnreadSnapshotState>({
      lastReadAt: null,
      firstUnreadMessageId: null,
      lastReadMessageId: null,
      unreadCount: 0,
    });
    this.liveViewState = new StateStore<LiveViewState>({
      isViewingLive: false,
    });
    this.aggregateState = new StateStore<MessagePaginatorAggregateState>({
      lastMessage: null,
      seededLastMessageAt: null,
    });
  }

  /**
   * Channel-list sort key: the later of the newest loaded message's `created_at` and the server seed.
   * Derived, so it cannot drift from {@link lastMessage}. `null` until seeded or a message arrives.
   */
  get lastMessageAt(): TimestampNS | null {
    const { lastMessage, seededLastMessageAt } = this.aggregateState.getLatestValue();
    const fromMessage = getMessageCreatedAtTimestamp(lastMessage);
    if (fromMessage !== null && seededLastMessageAt !== null) {
      return asTimestampNS(Math.max(fromMessage, seededLastMessageAt));
    }
    return fromMessage ?? seededLastMessageAt;
  }

  /**
   * The tracked newest channel-relevant message ({@link aggregateState}), for display. `null` until
   * one is ingested (a server-only seed advances {@link lastMessageAt} but not this).
   */
  get lastMessage(): LocalMessage | null {
    return this.aggregateState.getLatestValue().lastMessage;
  }

  /**
   * Whether `message` may become the "latest message" behind `channel.state.last_message_at`: not
   * shadowed and, in the main list, not a thread-only reply nor (with
   * `skip_last_msg_update_for_system_msgs`) a system message. A reply list (`parentMessageId` set)
   * holds only thread replies, so only the shadow rule applies there.
   */
  protected shouldAdvanceLastMessage(message: LocalMessage): boolean {
    if (message.shadowed) return false;
    if (this.parentMessageId) return true;
    const isThreadOnlyReply = !!message.parent_id && !message.show_in_channel;
    if (isThreadOnlyReply) return false;
    const skipSystemMessage =
      !!this.channel.serverConfig?.skip_last_msg_update_for_system_msgs &&
      message.type === 'system';
    return !skipSystemMessage;
  }

  /**
   * Advances the tracked latest message (and so {@link lastMessageAt}) to `message` when it is newer
   * and {@link shouldAdvanceLastMessage} permits. Writes {@link aggregateState} only, so it is safe
   * inside a `state.next` updater (`ingestPage`). Returns `true` when the value moved. Public for
   * callers that advance it without an in-window ingest, e.g. offline pending-message replay.
   */
  trackLastMessage(message: LocalMessage): boolean {
    if (!this.shouldAdvanceLastMessage(message)) return false;
    const incoming = getMessageCreatedAtTimestamp(message);
    if (incoming === null) return false;
    const current = this.aggregateState.getLatestValue().lastMessage;
    // An edit, soft-delete, reaction or quote update re-ingests the current latest (same id and
    // `created_at`): refresh it in place so `lastMessage` stays live.
    if (current && current.id === message.id) {
      this.aggregateState.partialNext({ lastMessage: message });
      return true;
    }
    // Otherwise only a strictly newer message advances. Compare against the current message's own
    // timestamp, not `lastMessageAt`: a seed newer than the loaded window would reject the message.
    const currentTs = current ? getMessageCreatedAtTimestamp(current) : null;
    if (currentTs !== null && incoming <= currentTs) return false;
    this.aggregateState.partialNext({ lastMessage: message });
    return true;
  }

  /**
   * Seeds {@link lastMessageAt} from `ChannelResponse.last_message_at`. Monotonic: a value not newer
   * than the current seed is ignored, so seed order does not matter.
   */
  seedLastMessageAt(value: TimestampNS | null | undefined) {
    if (value == null || !Number.isFinite(value)) return;
    const current = this.aggregateState.getLatestValue().seededLastMessageAt;
    if (current !== null && value <= current) return;
    this.aggregateState.partialNext({ seededLastMessageAt: value });
  }

  ingestItem(item: LocalMessage): boolean {
    // Only items passing the filter advance the aggregate (`ingestItem` also removes the others).
    if (this.matchesFilter(item)) {
      this.trackLastMessage(item);
    }
    return super.ingestItem(item);
  }

  ingestPage(
    params: Parameters<MessageIntervalPaginator['ingestPage']>[0],
  ): Interval | null {
    const interval = super.ingestPage(params);
    if (params.page?.length) {
      for (const item of params.page) this.trackLastMessage(item);
    }
    return interval;
  }

  onEntitiesChanged(batch: EntityStoreChangeBatch) {
    super.onEntitiesChanged(batch);
    const { lastMessage } = this.aggregateState.getLatestValue();
    if (!lastMessage || !batch.changedIds.has(lastMessage.id)) return;
    const stored = this.getItem(lastMessage.id);
    if (stored) this.aggregateState.partialNext({ lastMessage: stored });
  }

  reflectUserUpdate(user: UserResponse) {
    super.reflectUserUpdate(user);
    const { lastMessage } = this.aggregateState.getLatestValue();
    if (lastMessage?.user?.id !== user.id) return;
    this.aggregateState.partialNext({ lastMessage: { ...lastMessage, user } });
  }

  removeItem(
    params: Parameters<MessageIntervalPaginator['removeItem']>[0],
  ): ReturnType<MessageIntervalPaginator['removeItem']> {
    const removedId =
      params.id ?? (params.item ? this.getItemId(params.item) : undefined);
    const { lastMessage, seededLastMessageAt } = this.aggregateState.getLatestValue();
    const wasLatest = !!removedId && lastMessage?.id === removedId;
    const result = super.removeItem(params);
    if (wasLatest) {
      // The tracked latest was hard-removed: recompute it, since `trackLastMessage` only advances.
      const previous = this.recomputeLastMessage();
      const previousAt = getMessageCreatedAtTimestamp(previous);
      const removedAt = getMessageCreatedAtTimestamp(lastMessage);
      const isSeedFromRemovedMessage =
        seededLastMessageAt !== null &&
        removedAt !== null &&
        seededLastMessageAt <= removedAt;
      // The server moves `last_message_at` back to the previous message without sending it, so the
      // seed takes the previous loaded message's time. With none loaded the new value is unknown,
      // and the seed stays.
      this.aggregateState.partialNext({
        lastMessage: previous,
        seededLastMessageAt:
          isSeedFromRemovedMessage && previousAt !== null
            ? previousAt
            : seededLastMessageAt,
      });
    }
    return result;
  }

  truncate(params: Parameters<MessageIntervalPaginator['truncate']>[0]) {
    super.truncate(params);
    const { lastMessage, seededLastMessageAt } = this.aggregateState.getLatestValue();
    const isTruncated = (timestamp: TimestampNS | null) =>
      timestamp !== null && timestamp < params.truncatedAt;
    const isLastMessageTruncated = isTruncated(getMessageCreatedAtTimestamp(lastMessage));
    const isSeedTruncated = isTruncated(seededLastMessageAt);
    if (!isLastMessageTruncated && !isSeedTruncated) return;
    this.aggregateState.partialNext({
      lastMessage: isLastMessageTruncated ? this.recomputeLastMessage() : lastMessage,
      seededLastMessageAt: isSeedTruncated ? null : seededLastMessageAt,
    });
  }

  /**
   * The message in `headItems` with the greatest `created_at` that passes
   * {@link shouldAdvanceLastMessage}, or `null`. It compares timestamps rather than positions, so it
   * holds for any `itemOrder` / `requestSort`.
   */
  private recomputeLastMessage(): LocalMessage | null {
    let latest: LocalMessage | null = null;
    let latestTimestamp = -Infinity;
    for (const item of this.headItems) {
      if (!this.shouldAdvanceLastMessage(item)) continue;
      const timestamp = getMessageCreatedAtTimestamp(item);
      if (timestamp === null || timestamp <= latestTimestamp) continue;
      latest = item;
      latestTimestamp = timestamp;
    }
    return latest;
  }

  /**
   * (Re)seeds the unread snapshot from the own read state. Runs after the first-page query, and the
   * SDK calls it again when a channel is reopened from a cached paginator (no first-page query), so
   * the separator, unread count and jump target follow the current read boundary.
   *
   * `firstUnreadMessageId` is reset to `null`: it holds only an explicit mark-unread
   * (`notification.mark_unread`), and a computed value would suppress auto-mark-read.
   */
  seedUnreadSnapshot = () => {
    // The query awaits the network before this runs: the channel may be pending disposal by then,
    // and `getClient()` throws.
    if (this.channel.pendingDisposal) return;
    const ownUserId = this.channel.getClient().user?.id;
    const ownReadState = ownUserId ? this.channel.state.read[ownUserId] : undefined;
    if (!ownReadState) return;
    this.setUnreadSnapshot({
      firstUnreadMessageId: null,
      lastReadAt: ownReadState.last_read ?? null,
      lastReadMessageId: ownReadState.last_read_message_id ?? null,
      unreadCount: ownReadState.unread_messages ?? 0,
    });
  };

  /** Also seeds the unread snapshot on a first page, before the opened channel is marked read. */
  postQueryReconcile(
    params: PostQueryReconcileParams<LocalMessage, MessageQueryShape>,
  ): ExecuteQueryReturnValue<LocalMessage> {
    const result = super.postQueryReconcile(params);

    if (params.isFirstPage) {
      this.seedUnreadSnapshot();
    }
    return result;
  }

  /**
   * Jumps to the unread reference message. It does not rely on `channel.state.read` alone, since
   * apps may mark a channel read on open yet keep "jump to unread" UI alive from the snapshot.
   *
   * Resolution order:
   * 1. an explicit first-unread id (snapshot or read state): jump to it;
   * 2. the last-read timestamp: infer the first unread message from the loaded window, or from a
   *    `created_at_around` query when the window does not straddle the boundary, and jump to it;
   * 3. the last-read id, when no timestamp is known.
   *
   * The inference is not written to the snapshot: `firstUnreadMessageId` is reserved for an explicit
   * mark-unread (it would suppress auto-mark-read).
   */
  jumpToTheFirstUnreadMessage = async (options?: JumpToMessageOptions) => {
    const ownUserId = this.channel.getClient().user?.id;
    if (!ownUserId) return false;

    const unreadSnapshot =
      this.unreadReferencePolicy === 'snapshot'
        ? this.unreadStateSnapshot.getLatestValue()
        : { firstUnreadMessageId: null, lastReadAt: null, lastReadMessageId: null };
    const firstUnreadFromSnapshot = unreadSnapshot.firstUnreadMessageId;
    const lastReadAtFromSnapshot = unreadSnapshot.lastReadAt;
    const lastReadIdFromSnapshot = unreadSnapshot.lastReadMessageId;

    const ownReadState = this.channel.state.read[ownUserId];
    const firstUnreadFromReadState = ownReadState?.first_unread_message_id ?? null;
    const lastReadAtFromReadState = ownReadState?.last_read ?? null;
    const lastReadIdFromReadState = ownReadState?.last_read_message_id ?? null;

    const firstUnreadMessageId = firstUnreadFromSnapshot ?? firstUnreadFromReadState;
    if (firstUnreadMessageId) {
      return await this.jumpToMessage(firstUnreadMessageId, {
        ...options,
        focusReason: 'jump-to-first-unread',
      });
    }

    const lastReadMessageId = lastReadIdFromSnapshot ?? lastReadIdFromReadState;
    // The snapshot timestamp wins over the read state's: the snapshot is the frozen boundary the
    // "N new" banner renders from, while mark-read on open advances the read state to ~now, so a
    // banner tap would infer nothing unread and jump to the latest message.
    const lastReadAt = lastReadAtFromSnapshot ?? lastReadAtFromReadState;

    const lastReadBoundary =
      lastReadAt != null && Number.isFinite(lastReadAt) ? lastReadAt : null;

    if (lastReadBoundary !== null) {
      let {
        firstUnreadMessageId: inferredFirstUnreadMessageId,
        lastReadMessageId: inferredLastReadMessageId,
      } = this.resolveUnreadBoundaryIdsByTimestamp({
        lastReadAt: lastReadBoundary,
        messages: this.state.getLatestValue().items ?? [],
      });

      if (!inferredLastReadMessageId) {
        const result = await this.executeQuery({
          queryShape: {
            // `created_at_around` is a request field and still takes a `Date`.
            created_at_around: nsToDate(lastReadBoundary),
            limit: options?.pageSize ?? this.pageSize,
          },
          updateState: false,
        });
        if (result) {
          ({
            firstUnreadMessageId: inferredFirstUnreadMessageId,
            lastReadMessageId: inferredLastReadMessageId,
          } = this.resolveUnreadBoundaryIdsByTimestamp({
            lastReadAt: lastReadBoundary,
            messages: result.stateCandidate.items ?? [],
          }));
        }
      }

      const targetMessageId =
        inferredFirstUnreadMessageId ?? inferredLastReadMessageId ?? lastReadMessageId;
      if (targetMessageId) {
        return await this.jumpToMessage(targetMessageId, {
          ...options,
          focusReason: 'jump-to-first-unread',
        });
      }
    }

    if (lastReadMessageId) {
      return await this.jumpToMessage(lastReadMessageId, {
        ...options,
        focusReason: 'jump-to-first-unread',
      });
    }

    return false;
  };

  setUnreadSnapshot = (next: Partial<UnreadSnapshotState>): UnreadSnapshotState => {
    this.unreadStateSnapshot.partialNext(next);
    return this.unreadStateSnapshot.getLatestValue();
  };

  get isViewingLive(): boolean {
    return this.liveViewState.getLatestValue().isViewingLive;
  }

  /**
   * Sets the live-view signal ({@link LiveViewState}). Not reset by `clearStateAndCache`: it is an
   * external input owned by the SDK.
   */
  setViewingLive = (isViewingLive: boolean) => {
    if (this.isViewingLive === isViewingLive) return;
    this.liveViewState.next({ isViewingLive });
  };

  clearUnreadSnapshot = () => {
    this.unreadStateSnapshot.next({
      firstUnreadMessageId: null,
      lastReadMessageId: null,
      lastReadAt: null,
      unreadCount: 0,
    });
  };

  clearStateAndCache() {
    super.clearStateAndCache();
    this.clearUnreadSnapshot();
    this.aggregateState.next({ lastMessage: null, seededLastMessageAt: null });
  }
}
