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
import type { LocalMessage } from '../../types';
import { nsToDate } from '../../utils/time';
import { StateStore } from '../../store';

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
 * Auxiliary (non-pagination) state for the message paginator: whole-collection aggregates that are
 * independent of the active pagination window (the dual of pagination — values over the entire set,
 * not a page of it). `lastMessageAt` is effectively `MAX(created_at)` over the channel-relevant
 * messages and is the source of truth for channel-list ordering
 * (`channel.messagePaginator.lastMessageAt`): seeded from `ChannelResponse.last_message_at`, then
 * advanced monotonically as newer messages are ingested.
 */
export type MessagePaginatorAggregateState = {
  /**
   * The newest channel-relevant message, for display (e.g. a channel/thread list item's last-message
   * preview or latest-reply avatar). A LIVE reference: it advances to a strictly newer message, is
   * refreshed in place when that message is edited/soft-deleted/reacted-to, and is recomputed to the
   * next newest when it is hard-removed. Respects `shouldAdvanceLastMessage` (skips system messages
   * per `skip_last_msg_update_for_system_msgs`, and thread-only replies). `null` until one is ingested.
   *
   * Lives here, NOT derived from pagination `state`, so it stays reactive when a WS message lands in
   * the head interval while an older window is active — the pagination store only emits when the
   * active* interval is impacted (see `BasePaginator.ingestItem`), so a `state`-derived latest would
   * go stale in that case.
   */
  lastMessage: LocalMessage | null;
  /**
   * Server-provided `ChannelResponse.last_message_at` floor, for channels whose newest message is not
   * loaded (e.g. surfaced by a channel-list query). Kept SEPARATE from {@link lastMessage} so it can
   * outrank a stale/absent loaded message for sorting without overwriting the display message. The
   * sort key {@link MessagePaginator.lastMessageAt} is derived as the max of the two, so the two can
   * never drift out of sync.
   */
  seededLastMessageAt: number | null;
};

export type MessagePaginatorOptions = BaseMessagePaginatorOptions & {
  /**
   * Controls whether `jumpToTheFirstUnreadMessage()` should prefer the `unreadStateSnapshot`
   * state over `channel.state.read[...]`.
   *
   * - 'snapshot' (default): retrieve the first unread message id from the unreadStateSnapshot state when jumping to the first unread message
   * - 'read-state-only': retrieve the last read message id from the channel read state when jumping to the first unread message
   */
  unreadReferencePolicy?: 'snapshot' | 'read-state-only';
};

export type UnreadSnapshotState = {
  lastReadAt: number | null;
  unreadCount: number;
  /**
   * Snapshot of the first unread message id for the user.
   * This is intentionally decoupled from `channel.state.read[...]` because apps
   * may mark the channel read immediately on open, while still wanting to render
   * UI indicators that jump to the previously-unread location.
   */
  firstUnreadMessageId: string | null;
  /**
   * Snapshot of the last read message id for the user (fallback when first unread
   * is not known).
   */
  lastReadMessageId: string | null;
};

/**
 * External, UI-driven signal: `true` while the user is actively viewing the latest messages of
 * this collection (app foregrounded AND the newest message on screen). The owning SDK sets it — the
 * state layer has no viewport. When live, an incoming message is NOT counted as unread (the count /
 * snapshot bump is skipped), so the "N new" separator/banner never flash for a message the user is
 * already looking at. Defaults to `false` (assume not viewing until the SDK proves otherwise).
 */
export type LiveViewState = {
  isViewingLive: boolean;
};

/**
 * MessagePaginator extends {@link MessageIntervalPaginator} with the unread/live-view concern:
 * an independent unread reference snapshot, the UI-driven "viewing the latest messages" signal, and
 * the "jump to first unread" navigation built on top of them.
 */
export class MessagePaginator extends MessageIntervalPaginator {
  private unreadReferencePolicy: 'snapshot' | 'read-state-only';
  /**
   * Independent unread reference state (not tied to `channel.state.read`).
   * Consumers may set this right before calling markRead / when opening a channel.
   */
  readonly unreadStateSnapshot: StateStore<UnreadSnapshotState>;
  /**
   * UI-driven "viewing the latest messages" signal (see {@link LiveViewState}). Set by the SDK via
   * {@link setViewingLive}; read by the channel to gate the unread bump on `message.new`. Subscribe to
   * this store for reactivity, or read the current boolean directly via the {@link isViewingLive} getter.
   */
  readonly liveViewState: StateStore<LiveViewState>;
  /**
   * Auxiliary (non-pagination) state — see {@link MessagePaginatorAggregateState}. A store separate
   * from `state` so `lastMessageAt` can be advanced from inside a `state.next` updater
   * (`ingestPage`) without being clobbered, and so consumers subscribe to a quiet signal that only
   * emits when the aggregate actually changes (not on every scroll/pagination emission). This is
   * distinct from the base's `intervalViews` interval-projection store.
   */
  readonly aggregateState: StateStore<MessagePaginatorAggregateState>;

  constructor(
    { unreadReferencePolicy = 'snapshot', ...options }: MessagePaginatorOptions,
    builtInDefaults: Partial<BasePaginatorConfig<LocalMessage, MessageQueryShape>> = {},
  ) {
    super(
      // NB: the store-backed item index is provided by MessageIntervalPaginator (the common
      // ancestor), so both the main list and the pinned list share the client-global message store.
      options,
      {
        // Throttle message-list `state` publishes to at most once per 500ms (leading + trailing), so a
        // burst of events coalesces into ~2 renders/sec instead of one per event. Optimistic
        // (local-user) writes bypass the throttle via EntityStore.flushSubscribers → flushState.
        // A default rather than a construction argument, so `paginatorOptions.stateThrottleMs` and a
        // declarative registration both override it — and so a re-derivation restores it without the
        // subclass having to re-inject it, which is what the old `initializeConfig` override existed for.
        stateThrottleMs: 500,
        ...builtInDefaults,
      },
    );
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
   * **Derived** (never stored) so it cannot drift from {@link lastMessage}. `null` until seeded or a
   * message is ingested.
   */
  get lastMessageAt(): number | null {
    const { lastMessage, seededLastMessageAt } = this.aggregateState.getLatestValue();
    const fromMessage = getMessageCreatedAtTimestamp(lastMessage);
    if (fromMessage !== null && seededLastMessageAt !== null) {
      return Math.max(fromMessage, seededLastMessageAt);
    }
    return fromMessage ?? seededLastMessageAt;
  }

  /**
   * The newest channel-relevant message (the monotonic tracked latest), for display. Convenience read
   * of {@link aggregateState}; subscribe to `aggregateState` for reactivity. `null` until a message is
   * ingested (a server-only seed advances {@link lastMessageAt} but leaves this `null`).
   */
  get lastMessage(): LocalMessage | null {
    return this.aggregateState.getLatestValue().lastMessage;
  }

  /**
   * The main channel list's notion of "latest message" for `channel.state.last_message_at`: on top of
   * the base rule (not shadowed) this excludes thread-only replies (a reply with a `parent_id` that is
   * not shown in the channel is not part of the channel list) and, when the channel is configured with
   * `skip_last_msg_update_for_system_msgs`, system messages. Mirrors the legacy
   * `Channel._trackLastMessage` skip logic.
   *
   * These exclusions are specific to the MAIN channel list. A reply list (thread paginator, which has
   * a `parentMessageId`) is made ENTIRELY of thread replies — there the newest reply is exactly the
   * "latest message", so the exclusions are skipped and only the base rule applies.
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
   * Monotonically advance {@link lastMessageAt} to `message.created_at` when it is newer than the
   * current value and {@link shouldAdvanceLastMessage} permits it. Writes the dedicated
   * {@link aggregateState} store (not `state`), so it is safe to call from inside a `state.next`
   * updater (`ingestPage`). Returns `true` when the value moved.
   *
   * Called internally on ingest; also public for callers that advance the aggregate without a normal
   * in-window ingest — e.g. offline pending-message replay, where the sent message has not yet been
   * ingested via the `message.new` event.
   */
  trackLastMessage(message: LocalMessage): boolean {
    if (!this.shouldAdvanceLastMessage(message)) return false;
    const incoming = getMessageCreatedAtTimestamp(message);
    if (incoming === null) return false;
    const current = this.aggregateState.getLatestValue().lastMessage;
    // Refresh in place when this IS the current latest being updated — an edit, soft-delete,
    // reaction, or quoted-message update all re-ingest the same id (same `created_at`). This keeps
    // `lastMessage` a LIVE reference (so a preview shows "deleted"/edited text), and because
    // `aggregateState` emits regardless of the active interval, it stays reactive off-window.
    if (current && current.id === message.id) {
      this.aggregateState.partialNext({ lastMessage: message });
      return true;
    }
    // Otherwise only advance to a strictly newer message. Guard against the current message's own
    // timestamp — NOT `lastMessageAt` (which the server seed can inflate); otherwise a seed newer than
    // the loaded window would reject the very message it was derived from.
    const currentTs = current ? getMessageCreatedAtTimestamp(current) : null;
    if (currentTs !== null && incoming <= currentTs) return false;
    this.aggregateState.partialNext({ lastMessage: message });
    return true;
  }

  /**
   * Seed {@link lastMessageAt} from the server-provided `ChannelResponse.last_message_at`, the
   * authoritative whole-channel aggregate. Monotonic: a no-op when the paginator already advanced
   * past it (e.g. from ingested messages), so seed order does not matter.
   */
  seedLastMessageAt(value: number | null | undefined) {
    if (!value || !Number.isFinite(value)) return;
    const current = this.aggregateState.getLatestValue().seededLastMessageAt;
    if (current !== null && value <= current) return;
    this.aggregateState.partialNext({ seededLastMessageAt: value });
  }

  ingestItem(item: LocalMessage): boolean {
    // Only items that survive the filter advance the aggregate (`ingestItem` also handles removals
    // of items that no longer match). The advance writes the separate `aggregateState` store, so it
    // is independent of `super`'s `state`/index mutations.
    if (this.matchesFilter(item)) {
      this.trackLastMessage(item);
    }
    return super.ingestItem(item);
  }

  ingestPage(
    params: Parameters<MessageIntervalPaginator['ingestPage']>[0],
  ): Interval | null {
    const interval = super.ingestPage(params);
    // Advance from each page item; the monotonic max over the page yields the newest. Comparison is
    // by `created_at` against `aggregateState` (no index lookup), so order vs `super` is irrelevant.
    if (params.page?.length) {
      for (const item of params.page) this.trackLastMessage(item);
    }
    return interval;
  }

  removeItem(
    params: Parameters<MessageIntervalPaginator['removeItem']>[0],
  ): ReturnType<MessageIntervalPaginator['removeItem']> {
    const removedId =
      params.id ?? (params.item ? this.getItemId(params.item) : undefined);
    const wasLatest =
      !!removedId && this.aggregateState.getLatestValue().lastMessage?.id === removedId;
    const result = super.removeItem(params);
    if (wasLatest) {
      // The tracked latest was hard-removed; fall back to the newest still-loaded message that
      // passes the filter. `trackLastMessage` cannot do this (it only advances), so recompute here.
      this.aggregateState.partialNext({ lastMessage: this.recomputeLastMessage() });
    }
    return result;
  }

  /**
   * The still-loaded message with the greatest `created_at` that passes
   * {@link shouldAdvanceLastMessage} (skips system / thread-only per config), from the newest-loaded
   * window. Used to recompute the tracked latest after the current one is removed. `null` when nothing
   * loaded qualifies.
   *
   * "Latest" is defined by `created_at` (matching {@link trackLastMessage}), NOT by the paginator's
   * display order — so this compares timestamps rather than assuming a position, and stays correct
   * whatever `itemOrder` / `requestSort` are configured to.
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
   * (Re)seed the unread state snapshot from the current own read state.
   *
   * Called after the first-page query, and can be called again by the SDK whenever a channel is
   * (re)opened from a cached paginator — where no fresh first-page query runs — so the snapshot
   * reflects the CURRENT read boundary rather than one frozen at the very first open. Without a
   * re-seed the separator position, unread count and "jump to first unread" target all go stale
   * across reopens.
   *
   * `firstUnreadMessageId` is intentionally reset to `null`: it represents an EXPLICIT mark-unread
   * (set by `notification.mark_unread`), not a live/computed boundary. Persisting a computed value
   * here would make the channel look explicitly marked-unread and suppress auto-mark-read.
   */
  seedUnreadSnapshot = () => {
    // A paginator query (BasePaginator.executeQuery) awaits the network before running its
    // synchronous postQueryReconcile, which calls this on the first page. If the channel was
    // torn down while that request was in flight, reading the client below throws (the channel is
    // pending disposal), so guard against that.
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

  /**
   * Invokes super.postQueryReconcile() and takes an unread state snapshot on the first-page query.
   * The snapshot has to be taken immediately after the query as the viewed channel is marked read
   * immediately after opening it. The snapshot can be used to display unread UI indicators.
   */
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
   * Jumps to the unread reference message.
   *
   * IMPORTANT: This intentionally does *not* rely on `channel.state.read[ownUserId]` only,
   * because apps may mark a channel read immediately after opening it, while still
   * wanting to keep "jump to unread" UI indicators alive (based on a snapshot).
   *
   * Resolution order:
   * 1) explicit first-unread id from snapshot/read-state (mark-unread) — jump straight to it
   * 2) last-read timestamp: infer the FIRST UNREAD message from it — using the already-loaded
   *    window when it straddles the boundary, otherwise a `created_at_around` query — and jump there
   * 3) last read id from snapshot/read-state (last-resort fallback when no timestamp is available)
   *
   * The timestamp inference (2) is preferred over jumping to the last-read id so that the jump lands
   * ON (and highlights) the first unread message rather than the last read one. The last-read id is
   * only used as a fallback when we cannot infer an unread boundary. The inference is NOT persisted
   * back into the snapshot (that is reserved for explicit mark-unread).
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

    // 1) A stable first-unread id is known (mark-unread, or a previously persisted inference):
    // jump straight to it.
    const firstUnreadMessageId = firstUnreadFromSnapshot ?? firstUnreadFromReadState;
    if (firstUnreadMessageId) {
      return await this.jumpToMessage(firstUnreadMessageId, {
        ...options,
        focusReason: 'jump-to-first-unread',
      });
    }

    const lastReadMessageId = lastReadIdFromSnapshot ?? lastReadIdFromReadState;
    // Prefer the SNAPSHOT timestamp over the fresh read-state one. The snapshot is the frozen UI
    // boundary the "N new" separator/banner render from, so a banner tap must jump to where that
    // indicator points. On (re)open the SDK marks the channel read (`markReadOnMount`) which advances
    // the read-state `last_read` to ~now and clears the server unread — so preferring read-state
    // would make a later banner tap infer "nothing unread" and jump to the latest message. The
    // snapshot is kept fresh on genuine catch-up (the SDK's mark-read resets it), so it is only
    // "frozen" precisely while there are unreads to jump to.
    const lastReadAt = lastReadAtFromSnapshot ?? lastReadAtFromReadState;

    // 2) No explicit first-unread id, but we know when the channel was last read. Infer the first
    // unread message from that timestamp so we land ON (and highlight) the first unread message
    // instead of the last read one. Prefer the already-loaded window (the common "a few unreads at
    // the bottom" case — no extra request); only query a page around last-read when the loaded
    // window does not straddle the boundary (i.e. every loaded message is newer than last-read).
    //
    // We deliberately do NOT persist the inferred boundary back into the snapshot: writing
    // `firstUnreadMessageId` would make the channel look explicitly marked-unread and suppress
    // auto-mark-read at the bottom. The separator reads the (re-seeded) snapshot directly.
    if (lastReadAt) {
      let {
        firstUnreadMessageId: inferredFirstUnreadMessageId,
        lastReadMessageId: inferredLastReadMessageId,
      } = this.resolveUnreadBoundaryIdsByTimestamp({
        lastReadAt,
        messages: this.state.getLatestValue().items ?? [],
      });

      if (!inferredLastReadMessageId) {
        const result = await this.executeQuery({
          queryShape: {
            // `created_at_around` is a request field and still takes a `Date`.
            created_at_around: nsToDate(lastReadAt),
            limit: options?.pageSize,
          },
          updateState: false,
        });
        if (result) {
          ({
            firstUnreadMessageId: inferredFirstUnreadMessageId,
            lastReadMessageId: inferredLastReadMessageId,
          } = this.resolveUnreadBoundaryIdsByTimestamp({
            lastReadAt,
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

    // 3) Last resort: jump to the known last-read message when that is all we have.
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

  /**
   * Set the UI-driven "viewing the latest messages" signal (see {@link LiveViewState}). Called by
   * the SDK from its message-list viewability + app-state tracking. No-ops when unchanged.
   *
   * Intentionally NOT reset by `clearStateAndCache` — it is an external input owned by the SDK, not
   * derived pagination state.
   */
  /** Current "viewing the latest messages" boolean (convenience read of {@link liveViewState}). */
  get isViewingLive(): boolean {
    return this.liveViewState.getLatestValue().isViewingLive;
  }

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
