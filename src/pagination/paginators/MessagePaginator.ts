import type { BasePaginatorConfig, Interval, QueryPagePlacement } from './BasePaginator';
import {
  type MessagePaginatorOptions as BaseMessagePaginatorOptions,
  getMessageCreatedAtTimestamp,
  type JumpToMessageOptions,
  MessageIntervalPaginator,
  type MessageQueryResponse,
  type MessageQueryShape,
} from './MessageIntervalPaginator';
import type { LocalMessage, TimestampNS, UserResponse } from '../../types';
import type { EntityStoreChangeBatch } from '../../entityStore/EntityStore';
import { asTimestampNS, nsToDate } from '../../utils/time';
import { StateStore } from '@stream-io/state-store';

export type {
  JumpToMessageOptions,
  MessageFocusReason,
  MessageFocusSignal,
  MessageFocusSignalState,
  MessagePaginatorFilter,
  MessagePaginatorSort,
  MessagePaginatorState,
  MessageQueryShape,
  PreparedExternalQuery,
  ReconcileNewestMessagesOptions,
} from './MessageIntervalPaginator';
export { MessageIntervalPaginator } from './MessageIntervalPaginator';

/**
 * Whole-collection aggregates, independent of the active pagination window. `latestMessageAt` is
 * the time of the channel's latest message and orders the channel list
 * (`channel.messagePaginator.latestMessageAt`): the later of
 * {@link MessagePaginatorAggregateState.latestMessage}'s `created_at` and the `last_message_at` of
 * the latest channel or thread response.
 */
export type MessagePaginatorAggregateState = {
  /**
   * The newest message the client holds that counts as the channel's latest, from any loaded window
   * or from an event. Not necessarily the server's latest message: when the client does not hold
   * that one, {@link MessagePaginator.latestMessageAt} is later than its `created_at` (see
   * {@link MessagePaginator.latestMessage}). For display (latest-message preview, latest-reply
   * avatar). A live reference: it advances to a strictly newer message, is refreshed in place on
   * edit, soft-delete or reaction, and is recomputed when hard-removed. Follows
   * `shouldAdvanceLatestMessage` (skips system messages per `skip_last_msg_update_for_system_msgs`,
   * and thread-only replies). `null` until one is ingested.
   *
   * It lives outside pagination `state`, which only emits when the active interval is affected: a
   * message landing in the head interval while an older window is active would go stale there.
   */
  latestMessage: LocalMessage | null;
  /**
   * The `last_message_at` of the latest channel or thread query result (`ChannelResponse` or
   * `ThreadStateResponse`). It comes with the channel or thread data rather than with a message, so
   * the message it refers to may not be loaded. Each query result that carries it replaces it (see
   * {@link MessagePaginator.setQueriedLatestMessageAt}); events never set it, as a new message from
   * an event updates {@link latestMessage} instead. When the newest message is hard-deleted, it
   * moves back to the previous loaded message; a truncation clears it. `null` when the query
   * reported no messages.
   *
   * {@link MessagePaginator.latestMessageAt} is the later of this and {@link latestMessage}'s
   * `created_at`, so it can be later than the message shown as the latest.
   */
  queriedLatestMessageAt: TimestampNS | null;
};

export type MessagePaginatorOptions = BaseMessagePaginatorOptions & {
  /**
   * Where `jumpToTheFirstUnreadMessage()` reads the unread reference from: `'snapshot'`
   * prefers `unreadStateSnapshot`, `'read-state-only'` uses only `channel.state.read[...]`.
   * Defaults to `'snapshot'`.
   */
  unreadReferencePolicy?: 'snapshot' | 'read-state-only';
};

export type UnreadSnapshotState = {
  lastReadAt: TimestampNS | null;
  unreadCount: number;
  /**
   * First unread message ID. Decoupled from `channel.state.read[...]` because apps may mark the
   * channel read on open yet still want UI that jumps to the previously unread location.
   */
  firstUnreadMessageId: string | null;
  /** Last read message ID, a fallback when the first unread is unknown. */
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
  /**
   * Unread reference state, independent of `channel.state.read`. Seeded on each first page;
   * consumers may also set it before `markRead`.
   */
  readonly unreadStateSnapshot: StateStore<UnreadSnapshotState>;
  /**
   * The "viewing the latest messages" signal ({@link LiveViewState}), set via {@link setViewingLive}
   * and read by the channel to gate the unread bump on `message.new`.
   */
  readonly liveViewState: StateStore<LiveViewState>;
  /**
   * {@link MessagePaginatorAggregateState}, in a store apart from `state` so `latestMessage` can
   * advance from inside a `state.next` updater (`ingestPage`) and subscribers only see aggregate
   * changes.
   */
  readonly aggregateState: StateStore<MessagePaginatorAggregateState>;

  constructor(
    { unreadReferencePolicy = 'snapshot', ...options }: MessagePaginatorOptions,
    builtInDefaults: Partial<BasePaginatorConfig<LocalMessage, MessageQueryShape>> = {},
  ) {
    super(options, {
      // Coalesce live `state.items` publishes to one per 500ms (leading + trailing). Optimistic
      // (local-user) writes bypass it via `EntityStore.flushSubscribers`. A default, so
      // `stateThrottleMs` options and declarative registrations override it and a re-derivation
      // restores it.
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
      latestMessage: null,
      queriedLatestMessageAt: null,
    });
  }

  /**
   * The time of the channel's latest message as far as the client knows: the later of
   * {@link latestMessage}'s `created_at` and the `last_message_at` of the latest response (see
   * {@link setQueriedLatestMessageAt}). Later than {@link latestMessage} when the server has newer
   * messages the client does not hold. The channel-list sort key. **Derived** (never stored) so it
   * cannot drift from {@link latestMessage}. `null` until a query sets it or a message is ingested.
   */
  get latestMessageAt(): TimestampNS | null {
    return this.latestMessageAtIncluding(this.latestMessage);
  }

  /**
   * {@link latestMessageAt} as the server knows it (see {@link pageReachesHead}): an unsent latest
   * message carries the device's clock, so the latest server-known message counts in its place.
   */
  private get latestServerMessageAt(): TimestampNS | null {
    const { latestMessage } = this.aggregateState.getLatestValue();
    const isUnsent = !!latestMessage && !this.isServerConfirmedMessage(latestMessage);
    return this.latestMessageAtIncluding(
      isUnsent
        ? this.recomputeLatestMessage({ serverConfirmedOnly: true })
        : latestMessage,
    );
  }

  /** The later of `message`'s `created_at` and the queried `last_message_at`. */
  private latestMessageAtIncluding(message: LocalMessage | null): TimestampNS | null {
    const { queriedLatestMessageAt } = this.aggregateState.getLatestValue();
    const fromMessage = getMessageCreatedAtTimestamp(message);
    if (fromMessage !== null && queriedLatestMessageAt !== null) {
      return asTimestampNS(Math.max(fromMessage, queriedLatestMessageAt));
    }
    return fromMessage ?? queriedLatestMessageAt;
  }

  /**
   * The newest message the client holds that counts as the channel's latest (see
   * {@link shouldAdvanceLatestMessage}), from any loaded window or from an event. Not necessarily
   * the server's latest message: {@link latestMessageAt} is later than its `created_at` when the
   * server has newer messages the client does not hold. `null` until a message is ingested (a
   * `last_message_at` from a query sets {@link latestMessageAt} but leaves this `null`).
   * Convenience read of {@link aggregateState}; subscribe to `aggregateState` for reactivity.
   *
   * It differs from {@link anchoredHeadItem}, the newest message of the window known to reach the
   * server's latest message, in two ways:
   * - It skips messages that do not count. With system messages skipped, a system message can be
   *   `anchoredHeadItem` but never `latestMessage`.
   * - It does not need that window. A channel opened at its first unread message loads m40–m60
   *   while the server's newest is m95: `latestMessage` is m60, `latestMessageAt` is m95's time and
   *   `anchoredHeadItem` is `undefined`.
   */
  get latestMessage(): LocalMessage | null {
    return this.aggregateState.getLatestValue().latestMessage;
  }

  /**
   * Whether `message` counts as the channel's latest message: not shadowed and, in the main list,
   * not a thread-only reply nor (with `skip_last_msg_update_for_system_msgs`, which the server also
   * applies to `last_message_at`) a system message. A reply list (`parentMessageId` set) holds only
   * thread replies, so only the shadow rule applies there.
   */
  protected shouldAdvanceLatestMessage(message: LocalMessage): boolean {
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
   * Advances {@link latestMessage} (and so {@link latestMessageAt}) to `message` when it is newer
   * and {@link shouldAdvanceLatestMessage} permits. Writes {@link aggregateState} only, so it is
   * safe inside a `state.next` updater (`ingestPage`). Returns `true` when the value moved. Public
   * for callers that advance it without an in-window ingest, e.g. offline pending-message replay.
   */
  trackLatestMessage(message: LocalMessage): boolean {
    if (!this.shouldAdvanceLatestMessage(message)) return false;
    const incoming = getMessageCreatedAtTimestamp(message);
    if (incoming === null) return false;
    const current = this.aggregateState.getLatestValue().latestMessage;
    // An edit, soft-delete, reaction or quote update re-ingests the current latest (same ID and
    // `created_at`): refresh it in place so `latestMessage` stays live.
    if (current && current.id === message.id) {
      this.aggregateState.partialNext({ latestMessage: message });
      return true;
    }
    // Otherwise only a strictly newer message advances. Compare against the current message's own
    // timestamp, not `latestMessageAt`: a queried `last_message_at` newer than the loaded window
    // would reject the message.
    const currentTs = current ? getMessageCreatedAtTimestamp(current) : null;
    if (currentTs !== null && incoming <= currentTs) return false;
    this.aggregateState.partialNext({ latestMessage: message });
    return true;
  }

  /**
   * Sets {@link MessagePaginatorAggregateState.queriedLatestMessageAt} from a query result's
   * `last_message_at` (a channel's, or a thread's for a reply list), which {@link latestMessageAt}
   * then takes into account. Each result replaces the previous value, even with an earlier one:
   * the newest message may have been hard-deleted, which no event reports with the new value. A
   * message ingested after the result was produced, such as a new one from an event, still counts,
   * through {@link latestMessage}. `null` clears it (no messages); `undefined` (not in the result)
   * leaves it.
   */
  setQueriedLatestMessageAt(value: TimestampNS | null | undefined) {
    if (value === undefined) return;
    const next = value !== null && Number.isFinite(value) ? value : null;
    if (next === this.aggregateState.getLatestValue().queriedLatestMessageAt) return;
    this.aggregateState.partialNext({ queriedLatestMessageAt: next });
  }

  /**
   * Clears the head mark of the head window when it is stale (see {@link unmarkHead}). It is stale
   * when its newest message is older than the `last_message_at` the latest query returned (see
   * {@link setQueriedLatestMessageAt}): the channel has newer messages the window lacks. The window
   * then stops being the head window ({@link anchoredHeadItem} becomes `undefined`) and can load
   * newer messages, and a message that then arrives from an event starts a separate head window
   * instead of joining it across the gap. Messages that exist only locally, such as a failed send,
   * are left out of the comparison: they carry the device's clock.
   *
   * For example, the window holds m1–m20 and the channel is not watched while m21–m25 are sent. A
   * query returns m25's time: the window can now load m21–m25, and m26 from an event does not land
   * right after m20.
   *
   * Call it with each response that does not bring the newest messages up to date, before any page
   * the response carries is placed: a page that reaches the newest message marks its own window as
   * the head. Call it only when the channel was not watched before the response: while it is
   * watched, events are arriving, and a message the window lacks is still on its way.
   */
  unmarkStaleHead() {
    const head = this.anchoredHeadInterval;
    const { queriedLatestMessageAt } = this.aggregateState.getLatestValue();
    if (!head || queriedLatestMessageAt === null) return;
    let headNewestAt: TimestampNS | null = null;
    for (const message of this.intervalToItems(head)) {
      if (!this.isServerConfirmedMessage(message)) continue;
      const createdAt = getMessageCreatedAtTimestamp(message);
      if (createdAt !== null && (headNewestAt === null || createdAt > headNewestAt))
        headNewestAt = createdAt;
    }
    if (headNewestAt !== null && headNewestAt >= queriedLatestMessageAt) return;
    this.unmarkHead(head);
  }

  /**
   * A page reaches the newest message when its newest message is at or after
   * {@link latestServerMessageAt}, as known before the page is ingested; one older than that is not
   * the newest. That value comes from the latest response (`ChannelResponse` for a channel,
   * `ThreadStateResponse` for a reply list, through {@link setQueriedLatestMessageAt}) and from the
   * messages ingested since, such as new ones from events. `undefined` while it is not known.
   */
  protected override pageReachesHead(page: LocalMessage[]): boolean | undefined {
    const latestServerMessageAt = this.latestServerMessageAt;
    if (latestServerMessageAt === null) return undefined;
    // the page's newest message is at its head edge
    const createdAt = getMessageCreatedAtTimestamp(
      this.getPagePaginationEdges(page).head,
    );
    return createdAt !== null && createdAt >= latestServerMessageAt;
  }

  ingestItem(item: LocalMessage): boolean {
    // Only items passing the filter advance the aggregate (`ingestItem` also removes the others).
    if (this.matchesFilter(item)) {
      if (this.isNewNewestMessage(item)) return this.ingestAsNewestInterval(item);
      this.trackLatestMessage(item);
    }
    return super.ingestItem(item);
  }

  /**
   * A message the paginator does not hold yet, at or after {@link latestMessageAt} (as known before
   * it arrives), while no loaded window reaches the newest message. It is then the newest message,
   * so it starts the newest window, as a page holding it would (see {@link pageReachesHead}).
   */
  private isNewNewestMessage(message: LocalMessage): boolean {
    if (this.anchoredHeadItem !== undefined || this.getItem(message.id)) return false;
    const latestMessageAt = this.latestMessageAt;
    const createdAt = getMessageCreatedAtTimestamp(message);
    return latestMessageAt !== null && createdAt !== null && createdAt >= latestMessageAt;
  }

  /**
   * The logical-head items (ingested one by one, usually from events, rather than as part of a
   * page) not older than `queriedLatestMessageAt`, the `last_message_at` of the latest channel or
   * thread response; all of them when no response has set it. They were ingested after that
   * response, one after another, so nothing is missing between them. Items older than that, such as
   * a message arriving out of order, are left out.
   */
  private get logicalHeadItemsSinceQueriedLatestMessageAt(): LocalMessage[] {
    const { queriedLatestMessageAt } = this.aggregateState.getLatestValue();
    return this.logicalHeadItems.filter((item) => {
      const createdAt = getMessageCreatedAtTimestamp(item);
      return (
        queriedLatestMessageAt === null ||
        (createdAt !== null && createdAt >= queriedLatestMessageAt)
      );
    });
  }

  /**
   * Starts the newest window with `message`, together with the
   * {@link logicalHeadItemsSinceQueriedLatestMessageAt} ingested before it. The messages before
   * the window are not loaded, so it can still load older ones. It becomes the active window only
   * when no window was active, or the logical head it takes items from was.
   */
  private ingestAsNewestInterval(message: LocalMessage): boolean {
    const liveHead = this.liveHeadLogical;
    const interval = this.ingestPage({
      page: [...this.logicalHeadItemsSinceQueriedLatestMessageAt, message],
      isHead: true,
      setActive: false,
    });
    if (!interval) return false;

    const takeOverView =
      !this._activeIntervalId || (!!liveHead && this.isActiveInterval(liveHead));
    if (takeOverView) {
      this.setActiveInterval(interval, { updateState: false });
      this.state.partialNext({
        items: this.intervalToItems(interval),
        hasMoreHead: false,
        hasMoreTail: interval.hasMoreTail,
        cursor: this.getCursorFromInterval(interval),
      });
    }
    return true;
  }

  ingestPage(
    params: Parameters<MessageIntervalPaginator['ingestPage']>[0],
  ): Interval | null {
    const interval = super.ingestPage(params);
    if (params.page?.length) {
      for (const item of params.page) this.trackLatestMessage(item);
    }
    return interval;
  }

  onEntitiesChanged(batch: EntityStoreChangeBatch) {
    super.onEntitiesChanged(batch);
    const { latestMessage } = this.aggregateState.getLatestValue();
    if (!latestMessage || !batch.changedIds.has(latestMessage.id)) return;
    const stored = this.getItem(latestMessage.id);
    if (stored) this.aggregateState.partialNext({ latestMessage: stored });
  }

  reflectUserUpdate(user: UserResponse) {
    super.reflectUserUpdate(user);
    const { latestMessage } = this.aggregateState.getLatestValue();
    if (latestMessage?.user?.id !== user.id) return;
    this.aggregateState.partialNext({ latestMessage: { ...latestMessage, user } });
  }

  removeItem(
    params: Parameters<MessageIntervalPaginator['removeItem']>[0],
  ): ReturnType<MessageIntervalPaginator['removeItem']> {
    const removedId =
      params.id ?? (params.item ? this.getItemId(params.item) : undefined);
    const { latestMessage, queriedLatestMessageAt } =
      this.aggregateState.getLatestValue();
    const wasLatest = !!removedId && latestMessage?.id === removedId;
    const result = super.removeItem(params);
    if (wasLatest) {
      // The tracked latest was hard-removed; fall back to the newest still-loaded message that
      // passes the filter, which `trackLatestMessage` cannot do (it only advances).
      const previous = this.recomputeLatestMessage();
      const previousAt = getMessageCreatedAtTimestamp(previous);
      const removedAt = getMessageCreatedAtTimestamp(latestMessage);
      const isQueriedFromRemovedMessage =
        queriedLatestMessageAt !== null &&
        removedAt !== null &&
        queriedLatestMessageAt <= removedAt;
      // The server moves `last_message_at` back to the previous message without sending it, so the
      // queried value takes the previous loaded message's time. With none loaded the new value is
      // unknown, and it stays.
      this.aggregateState.partialNext({
        latestMessage: previous,
        queriedLatestMessageAt:
          isQueriedFromRemovedMessage && previousAt !== null
            ? previousAt
            : queriedLatestMessageAt,
      });
    }
    return result;
  }

  truncate(params: Parameters<MessageIntervalPaginator['truncate']>[0]) {
    super.truncate(params);
    const { latestMessage, queriedLatestMessageAt } =
      this.aggregateState.getLatestValue();
    const isTruncated = (timestamp: TimestampNS | null) =>
      timestamp !== null && timestamp < params.truncatedAt;
    const isLatestMessageTruncated = isTruncated(
      getMessageCreatedAtTimestamp(latestMessage),
    );
    const isQueriedLatestMessageAtTruncated = isTruncated(queriedLatestMessageAt);
    if (!isLatestMessageTruncated && !isQueriedLatestMessageAtTruncated) return;
    this.aggregateState.partialNext({
      latestMessage: isLatestMessageTruncated
        ? this.recomputeLatestMessage()
        : latestMessage,
      queriedLatestMessageAt: isQueriedLatestMessageAtTruncated
        ? null
        : queriedLatestMessageAt,
    });
  }

  /**
   * The still-loaded message with the greatest `created_at` that passes
   * {@link shouldAdvanceLatestMessage} (skips system / thread-only per config), from the window
   * that reaches the newest message and the {@link logicalHeadItemsSinceQueriedLatestMessageAt}.
   * A window reached by a jump is not searched, nor an out-of-order older message: neither is the
   * channel's previous message. Used to recompute the tracked latest after the current one is
   * removed; `serverConfirmedOnly` skips unsent messages. `null` when nothing loaded qualifies.
   * It compares timestamps rather than positions, so it holds for any `itemOrder` / `requestSort`.
   */
  private recomputeLatestMessage({
    serverConfirmedOnly = false,
  }: { serverConfirmedOnly?: boolean } = {}): LocalMessage | null {
    let latest: LocalMessage | null = null;
    let latestTimestamp = -Infinity;
    for (const item of [
      ...this.anchoredHeadItems,
      ...this.logicalHeadItemsSinceQueriedLatestMessageAt,
    ]) {
      if (!this.shouldAdvanceLatestMessage(item)) continue;
      if (serverConfirmedOnly && !this.isServerConfirmedMessage(item)) continue;
      const timestamp = getMessageCreatedAtTimestamp(item);
      if (timestamp === null || timestamp <= latestTimestamp) continue;
      latest = item;
      latestTimestamp = timestamp;
    }
    return latest;
  }

  /**
   * (Re)seeds the unread snapshot from the own read state. Runs once a first page and the rest of
   * its response are in (the paginator's own first-page queries, `watch()` and the channel-list
   * hydrate, when these place one), and the SDK calls it again when a channel is reopened from a
   * cached paginator (no first-page query), so the separator, unread count and jump target follow
   * the current read boundary.
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

  /**
   * Applies the rest of the response, then takes the unread snapshot after a first-page query, from
   * the read state the response brought. A viewed channel is marked read right after it opens, so
   * the snapshot keeps the unread state from before, for unread UI indicators.
   */
  protected override applyQueryResponseRest(
    response: MessageQueryResponse,
    placeParams: QueryPagePlacement<MessageQueryShape>,
  ) {
    super.applyQueryResponseRest(response, placeParams);
    if (placeParams.isFirstPage) this.seedUnreadSnapshot();
  }

  /**
   * Jumps to the unread reference message. It does not rely on `channel.state.read` alone, since
   * apps may mark a channel read on open yet keep "jump to unread" UI alive from the snapshot.
   *
   * Resolution order:
   * 1. an explicit first-unread ID (snapshot or read state): jump to it;
   * 2. the last-read timestamp: infer the first unread message from the loaded window, or from a
   *    `created_at_around` query when the window does not straddle the boundary, and jump to it;
   * 3. the last-read ID, when no timestamp is known.
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
          claimsActiveInterval: true,
          queryShape: {
            // `created_at_around` is a request field and still takes a `Date`.
            created_at_around: nsToDate(lastReadBoundary),
            limit: options?.pageSize ?? this.pageSize,
          },
          updateState: false,
        });
        // a later claim decides the active interval, and the page stays stored
        if (result?.isSuperseded) return false;
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
    this.aggregateState.next({ latestMessage: null, queriedLatestMessageAt: null });
  }
}
