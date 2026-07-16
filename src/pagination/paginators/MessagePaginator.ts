import type {
  AnyInterval,
  CursorDerivator,
  CursorDeriveResult,
  ExecuteQueryReturnValue,
  Interval,
  PaginationDirection,
  PaginationQueryParams,
  PaginatorCursor,
  PaginatorState,
  PostQueryReconcileParams,
} from './BasePaginator';
import {
  BasePaginator,
  isLogicalInterval,
  type PaginationQueryReturnValue,
  type PaginationQueryShapeChangeIdentifier,
  type PaginatorOptions,
  ZERO_PAGE_CURSOR,
} from './BasePaginator';
import type {
  AscDesc,
  LocalMessage,
  MessagePaginationOptions,
  PinnedMessagePaginationOptions,
} from '../../types';
import type { Channel } from '../../channel';
import { StateStore } from '../../store';
import { formatMessage, generateUUIDv4, toDeletedMessage } from '../../utils';
import { makeComparator } from '../sortCompiler';
import type { FieldToDataResolver } from '../types.normalization';
import { resolveDotPathValue } from '../utility.normalization';
import { ItemIndex } from '../ItemIndex';
import { deriveCreatedAtAroundPaginationFlags } from '../cursorDerivation';
import { deriveIdAroundPaginationFlags } from '../cursorDerivation/idAroundPaginationFlags';
import { deriveLinearPaginationFlags } from '../cursorDerivation/linearPaginationFlags';

export type MessageFocusReason =
  | 'jump-to-message'
  | 'jump-to-first-unread'
  | 'jump-to-latest';

export type MessageFocusSignal = {
  messageId: string;
  reason: MessageFocusReason;
  token: number;
  createdAt: number;
  ttlMs: number;
};

export type MessageFocusSignalState = {
  signal: MessageFocusSignal | null;
};

export type JumpToMessageOptions = {
  pageSize?: number;
  /**
   * Optional reason attached to emitted focus signal.
   * Defaults to `jump-to-message`.
   */
  focusReason?: MessageFocusReason;
  /**
   * TTL for the emitted focus signal in milliseconds.
   * Defaults to `3000`.
   */
  focusSignalTtlMs?: number;
  /**
   * If true, suppresses focus signal emission after a successful jump.
   */
  suppressFocusSignal?: boolean;
};

export type MessagePaginatorSort = { created_at: AscDesc } | { created_at: AscDesc }[];

export type MessagePaginatorFilter = {
  cid: string;
  parent_id?: string;
};

const DEFAULT_BACKEND_SORT: MessagePaginatorSort = {
  created_at: 1,
};

// server's default size is 100
const DEFAULT_CHANNEL_MESSAGE_LIST_PAGE_SIZE = 100;

export type MessagePaginatorState = PaginatorState<LocalMessage>;
export type MessageQueryShape = MessagePaginationOptions | PinnedMessagePaginationOptions;

/**
 * At the moment all the pagination parameters are just different types of cursors, e.g.
 * id_lt, id_gt, ...
 * But we always paginate within the same list without changing the sorting params.
 * It is currently not possible to change the sorting params.
 */
const hasPaginationQueryShapeChanged: PaginationQueryShapeChangeIdentifier<
  MessageQueryShape
> = () => false;

const dataFieldFilterResolver: FieldToDataResolver<LocalMessage> = {
  matchesField: () => true,
  resolve: (message, path) => resolveDotPathValue(message, path),
};

const getMessageCreatedAtTimestamp = (message: LocalMessage): number | null => {
  if (!(message.created_at instanceof Date)) return null;
  const timestamp = message.created_at.getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

export type MessagePaginatorOptions = {
  channel: Channel;
  id?: string;
  itemIndex?: ItemIndex<LocalMessage>;
  parentMessageId?: string;
  /**
   * Sort passed to backend message/replies query.
   * Does not affect in-memory item ordering.
   */
  requestSort?: MessagePaginatorSort;
  /**
   * @deprecated Use `requestSort` instead.
   */
  sort?: MessagePaginatorSort;
  /**
   * In-memory ordering for items exposed by paginator state.
   */
  itemOrder?: MessagePaginatorSort;
  paginatorOptions?: PaginatorOptions<LocalMessage, MessageQueryShape>;
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
  lastReadAt: Date | null;
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
 * MessagePaginator allows configuring backend request sort, while keeping internal item ordering stable.
 * Filtering of ingested items is still limited to local predicates (`filterQueryResults`).
 */
export class MessagePaginator extends BasePaginator<LocalMessage, MessageQueryShape> {
  private readonly _id: string;
  private channel: Channel;
  private parentMessageId?: string;
  private unreadReferencePolicy: 'snapshot' | 'read-state-only';
  /**
   * Independent unread reference state (not tied to `channel.state.read`).
   * Consumers may set this right before calling markRead / when opening a channel.
   */
  readonly unreadStateSnapshot: StateStore<UnreadSnapshotState>;
  /**
   * UI-driven "viewing the latest messages" signal (see {@link LiveViewState}). Set by the SDK via
   * {@link setViewingLive}; read by the channel to gate the unread bump on `message.new`.
   */
  readonly isViewingLive: StateStore<LiveViewState>;
  readonly messageFocusSignal: StateStore<MessageFocusSignalState>;
  private clearMessageFocusSignalTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private messageFocusSignalToken = 0;
  protected _requestSort = DEFAULT_BACKEND_SORT;
  protected _itemOrder: MessagePaginatorSort = DEFAULT_BACKEND_SORT;
  protected _nextQueryShape: MessageQueryShape | undefined;
  sortComparator: (a: LocalMessage, b: LocalMessage) => number;
  /**
   * Single source of truth for whether a message should be included in paginator intervals/state.
   * Keep this consistent with `filterQueryResults` AND cursor flag derivation.
   */
  shouldIncludeMessageInInterval(message: LocalMessage): boolean {
    return !message.shadowed;
  }

  protected get intervalItemIdsAreHeadFirst(): boolean {
    // Messages are stored in chronological order (created_at asc) within an interval.
    // Pagination "head" (newest side) is therefore at the END of the `itemIds` array.
    return false;
  }

  protected get intervalSortDirection(): 'asc' | 'desc' {
    // Head edge is newest, but sortComparator is created_at asc => newer head edges
    // should come first => reverse interval ordering.
    return 'desc';
  }

  constructor({
    channel,
    id,
    itemIndex = new ItemIndex({ getId: (item) => item.id }),
    parentMessageId,
    requestSort,
    sort,
    itemOrder,
    paginatorOptions,
    unreadReferencePolicy = 'snapshot',
  }: MessagePaginatorOptions) {
    const resolvedRequestSort = requestSort ?? sort ?? DEFAULT_BACKEND_SORT;
    const resolvedItemOrder = itemOrder ?? resolvedRequestSort;
    super({
      hasPaginationQueryShapeChanged,
      initialCursor: ZERO_PAGE_CURSOR,
      itemIndex,
      ...paginatorOptions,
      pageSize: paginatorOptions?.pageSize ?? DEFAULT_CHANNEL_MESSAGE_LIST_PAGE_SIZE,
    });
    this.config.deriveCursor = makeDeriveCursor(this);
    this.channel = channel;
    this.parentMessageId = parentMessageId;
    this._id = id ?? `message-paginator-${generateUUIDv4()}`;
    this._requestSort = resolvedRequestSort;
    this._itemOrder = resolvedItemOrder;
    this.unreadReferencePolicy = unreadReferencePolicy;
    this.unreadStateSnapshot = new StateStore<UnreadSnapshotState>({
      lastReadAt: null,
      firstUnreadMessageId: null,
      lastReadMessageId: null,
      unreadCount: 0,
    });
    this.isViewingLive = new StateStore<LiveViewState>({
      isViewingLive: false,
    });
    this.messageFocusSignal = new StateStore<MessageFocusSignalState>({
      signal: null,
    });
    this.sortComparator = makeComparator<LocalMessage, MessagePaginatorSort>({
      sort: this._requestSort,
      resolvePathValue: resolveDotPathValue,
      tiebreaker: (l, r) => {
        const leftId = this.getItemId(l);
        const rightId = this.getItemId(r);
        return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
      },
    });
    this.config.itemOrderComparator = makeComparator<LocalMessage, MessagePaginatorSort>({
      sort: this._itemOrder,
      resolvePathValue: resolveDotPathValue,
      tiebreaker: (l, r) => {
        const leftId = this.getItemId(l);
        const rightId = this.getItemId(r);
        return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
      },
    });
    this.setFilterResolvers([dataFieldFilterResolver]);
  }

  get id() {
    return this._id;
  }

  get sort() {
    return this._requestSort ?? DEFAULT_BACKEND_SORT;
  }

  get requestSort() {
    return this._requestSort ?? DEFAULT_BACKEND_SORT;
  }

  get itemOrder() {
    return this._itemOrder ?? this._requestSort ?? DEFAULT_BACKEND_SORT;
  }

  /**
   * Even though we do not send filters object to the server, we need to have filters for client-side item ingestion logic.
   */
  buildFilters = (): MessagePaginatorFilter => ({
    cid: this.channel.cid,
    ...(this.parentMessageId ? { parent_id: this.parentMessageId } : {}),
  });

  // invoked inside BasePaginator.executeQuery() to keep it as a query descriptor;
  protected getNextQueryShape({
    direction,
  }: Omit<
    PaginationQueryParams<MessageQueryShape>,
    'isFirstPageQuery'
  >): MessageQueryShape {
    return {
      limit: this.pageSize,
      [direction === 'tailward' ? 'id_lt' : 'id_gt']:
        direction && this.cursor?.[direction],
    };
  }

  getCursorFromQueryResults = ({
    direction,
    items,
  }: {
    direction?: PaginationDirection;
    items: LocalMessage[];
  }) => {
    if (!items.length) {
      return {
        tailward: undefined,
        headward: undefined,
      };
    }

    const start = items[0];
    const end = items[items.length - 1];

    // Newer side is the pagination head for messages. Which bound is considered "head"
    // is determined by intervalItemIdsAreHeadFirst (see BasePaginator.getIntervalPaginationEdges).
    const head = this.intervalItemIdsAreHeadFirst ? start : end;
    const tail = this.intervalItemIdsAreHeadFirst ? end : start;

    // if there is no direction, then we are jumping, and we want to set both directions in the cursor
    return {
      tailward: !direction || direction === 'tailward' ? this.getItemId(tail) : undefined,
      headward: !direction || direction === 'headward' ? this.getItemId(head) : undefined,
    };
  };

  query = async ({
    direction,
  }: PaginationQueryParams<MessageQueryShape>): Promise<
    PaginationQueryReturnValue<LocalMessage>
  > => {
    // get the params only if they were not generated previously
    if (!this._nextQueryShape) {
      this._nextQueryShape = this.getNextQueryShape({ direction });
    }

    const options = this._nextQueryShape;
    let items: LocalMessage[];
    let tailward: string | undefined;
    let headward: string | undefined;
    if (this.config.doRequest) {
      const result = await this.config.doRequest(options);
      items = this.getCanonicalQueryItems(result?.items ?? []);
      // if there is no direction, then we are jumping, and we want to set both directions in the cursor
      tailward =
        !direction || direction === 'tailward'
          ? (result.cursor?.tailward ?? undefined)
          : undefined;
      headward =
        !direction || direction === 'headward'
          ? (result.cursor?.headward ?? undefined)
          : undefined;
    } else {
      const { messages } = this.parentMessageId
        ? await this.channel.getReplies(
            this.parentMessageId,
            options,
            Array.isArray(this.requestSort) ? this.requestSort : [this.requestSort],
          )
        : await this.channel.query({
            messages: options,
            // todo: why do we query for watchers?
            // watchers: { limit: this.pageSize },
          });
      items = this.getCanonicalQueryItems(messages.map(formatMessage));
      const cursor = this.getCursorFromQueryResults({ direction, items });
      tailward = cursor.tailward;
      headward = cursor.headward;
    }

    return { items, headward, tailward };
  };

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
   * Invokes the super.postQueryReconcile() and takes an unread state snapshot on the first page
   * query. The snapshot has to be taken immediately after the query as the viewed channel is marked
   * read immediately after opening it. The snapshot can be used to display unread UI indicators.
   */
  async postQueryReconcile(
    params: PostQueryReconcileParams<LocalMessage, MessageQueryShape>,
  ): Promise<ExecuteQueryReturnValue<LocalMessage>> {
    const result = await super.postQueryReconcile(params);

    if (params.isFirstPage) {
      this.seedUnreadSnapshot();
    }
    return result;
  }

  isJumpQueryShape(queryShape: MessageQueryShape): boolean {
    return (
      !!queryShape?.id_around ||
      !!(queryShape as MessagePaginationOptions)?.created_at_around
    );
  }

  jumpToMessage = async (
    messageId: string,
    {
      focusReason,
      focusSignalTtlMs,
      pageSize,
      suppressFocusSignal,
    }: JumpToMessageOptions = {},
  ): Promise<boolean> => {
    let localMessage = this.getItem(messageId);
    let interval: AnyInterval | undefined;
    let state: Partial<PaginatorState<LocalMessage>> | undefined;
    if (localMessage) {
      interval = this.locateIntervalForItem(localMessage);
      if (
        interval &&
        !isLogicalInterval(interval) &&
        !interval.itemIds.includes(messageId)
      ) {
        // locateIntervalForItem can match by created_at RANGE and return an interval whose range
        // spans the target while its loaded itemIds do NOT contain it (e.g. a neighbouring interval
        // grew across the target's position without merging). Prefer the interval that actually
        // holds the id so the jump activates the window the message really lives in - otherwise, if
        // the range-matched interval happens to be active, the jump becomes a no-op.
        interval = this.itemIntervals.find(
          (candidate) =>
            !isLogicalInterval(candidate) && candidate.itemIds.includes(messageId),
        );
      }
    }

    if (localMessage && interval && !isLogicalInterval(interval)) {
      state = {
        hasMoreHead: interval.hasMoreHead,
        hasMoreTail: interval.hasMoreTail,
        cursor: this.getCursorFromInterval(interval),
        items: this.intervalToItems(interval),
      };
    } else if (!localMessage || !interval || isLogicalInterval(interval)) {
      const result = await this.executeQuery({
        queryShape: { id_around: messageId, limit: pageSize },
        updateState: false,
      });
      localMessage = this.getItem(messageId);
      if (!localMessage || !result || !result.targetInterval) {
        this.channel.getClient().notifications.addError({
          message: 'Jump to message unsuccessful',
          origin: { emitter: 'MessagePaginator.jumpToMessage', context: { messageId } },
          options: { type: 'api:messages:query:failed' },
        });
        return false;
      }
      interval = result.targetInterval;
      state = isLogicalInterval(interval)
        ? result.stateCandidate
        : {
            ...result.stateCandidate,
            hasMoreHead: interval.hasMoreHead,
            hasMoreTail: interval.hasMoreTail,
            // Prefer the cursor derived during postQueryReconcile, but fall back to
            // interval-derived cursor to keep jumps consistent if the stateCandidate
            // is partial.
            cursor: result.stateCandidate.cursor ?? this.getCursorFromInterval(interval),
            items: this.intervalToItems(interval),
          };
    }

    if (!this.isActiveInterval(interval)) {
      this.setActiveInterval(interval, { updateState: false });
    }
    if (state) this.state.partialNext(state);
    if (!suppressFocusSignal) {
      this.emitMessageFocusSignal({
        messageId,
        reason: focusReason ?? 'jump-to-message',
        ttlMs: focusSignalTtlMs,
      });
    }
    return true;
  };

  jumpToTheLatestMessage = async (options?: JumpToMessageOptions): Promise<boolean> => {
    let latestMessageId: string | undefined;
    if (!(this.itemIntervals[0] as Interval)?.isHead) {
      // load the newest page in case pagination is currently on an older window (an empty/partial
      // headward response marks the interval as the head)
      await this.executeQuery({ direction: 'headward', updateState: false });
    }

    // Re-read itemIntervals AFTER the query: the getter returns a fresh array each call, so a
    // reference captured before executeQuery would be stale and miss the head we just loaded.
    const headInterval = this.itemIntervals[0] as Interval | undefined;
    if (headInterval?.isHead) {
      latestMessageId = headInterval.itemIds.slice(-1)[0];
    }

    if (!latestMessageId) {
      this.channel.getClient().notifications.addError({
        message: 'Jump to latest message unsuccessful',
        origin: { emitter: 'MessagePaginator.jumpToTheLatestMessage' },
        options: { type: 'api:message:query:failed' },
      });
      return false;
    }

    return await this.jumpToMessage(latestMessageId, {
      suppressFocusSignal: true,
      ...options,
      focusReason: 'jump-to-latest',
    });
  };

  /**
   * Fold an already fetched newest (head) page into the currently loaded items without issuing a
   * query. The caller supplies a page it obtained on its own and this reconciles it against what is
   * loaded, instead of rerunning the first page query, so the loaded set is updated in place rather
   * than blanked and reloaded. Two cases, decided by whether the incoming page overlaps the loaded
   * head:
   *
   * 1. OVERLAP - the incoming page shares at least one id with the loaded head (fewer than a full
   *    page is new). Merge in place: existing items are reconciled by id (edits, soft deletes), new
   *    items are appended and every already loaded item (including older pages already paged in) is
   *    kept. `hasMoreTail`/`cursor.tailward` are left as-is so the page can be any size, so deriving
   *    "has older items" from its length would wrongly clear it while older items remain.
   *
   * 2. DISJOINT - the incoming page shares no id with the loaded head (at least a full page is new).
   *    Merging would weld the two across the gap (the interval merge treats two head intervals as
   *    overlapping when one reaches further headward), hiding the items in between with no way to
   *    reach them. Instead the loaded set is discarded and rebuilt from the incoming page as a fresh
   *    contiguous head (`hasMoreTail: true`, cursor reanchored to the page's oldest item) so the
   *    gap and older history load again when paginating older.
   *
   * Both paths emit exactly once and never blank the loaded set. Noop unless the page is non empty
   * and the newest slice is both loaded AND the interval currently in view (the head interval is
   * anchored at the head and active); when the caller has jumped to a separate older window the
   * merge is skipped so their position is preserved, and the incoming page is picked up on a later
   * load.
   */
  mergeNewestPage = (page: LocalMessage[]) => {
    if (!page?.length) return;
    const headInterval = this.itemIntervals[0] as Interval | undefined;
    if (!headInterval?.isHead) return;
    // Only reconcile when the head is the interval currently in view. If the caller jumped to a
    // separate (older) window, that window is active and the head is merely still-loaded underneath;
    // reconciling would switch the view to the head and yank them to the newest. Skip to preserve
    // their position (the newest page is picked up on scroll / a later load).
    if (!this.isActiveInterval(headInterval)) return;

    const loadedIds = new Set(headInterval.itemIds);
    const overlapsLoadedHead = page.some((item) => loadedIds.has(this.getItemId(item)));

    if (!overlapsLoadedHead) {
      // Disjoint window: rebuild from the fetched page as a fresh newest slice. Clearing
      // the stale intervals first ensures `ingestPage` builds a single head interval instead of
      // merging across the gap so reanchoring the cursor to this page's oldest item keeps the next
      // "load older" contiguous.
      this.setIntervals([]);
      this.setActiveInterval(undefined);
      const resetInterval = this.ingestPage({
        page,
        isHead: true,
        // Disjoint means the previously loaded head was entirely OLDER than this newest window, so
        // there is always older data to load (the gap + the prior history) - keep hasMoreTail true.
        isTail: false,
        setActive: false,
      });
      if (!resetInterval) return;
      this.setActiveInterval(resetInterval, { updateState: false });
      this.state.partialNext({
        items: this.intervalToItems(resetInterval),
        cursor: this.getCursorFromInterval(resetInterval),
        hasMoreHead: resetInterval.hasMoreHead,
        hasMoreTail: resetInterval.hasMoreTail,
      });
      return;
    }

    // Overlapping window: merge in place, preserving the older boundary.
    const interval = this.ingestPage({ page, isHead: true, setActive: false });
    if (!interval) return;

    this.setActiveInterval(interval, { updateState: false });
    this.state.partialNext({
      items: this.intervalToItems(interval),
      // The newest slice is loaded (head anchored), so after merging the head window there is
      // nothing newer to load. hasMoreTail / cursor are deliberately preserved (see above).
      hasMoreHead: false,
    });
  };

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
            created_at_around: lastReadAt.toISOString(),
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

  private resolveUnreadBoundaryIdsByTimestamp = ({
    lastReadAt,
    messages,
  }: {
    lastReadAt: Date;
    messages: LocalMessage[];
  }): { firstUnreadMessageId: string | null; lastReadMessageId: string | null } => {
    // Messages are expected in chronological order. We find:
    // - lastReadMessageId: newest message with created_at <= lastReadAt
    // - firstUnreadMessageId: first message with created_at > lastReadAt
    //
    // If the page starts after lastReadAt, the entire page is unread and the first message is
    // used as unread anchor (legacy "whole channel is unread" behavior for this queried window).
    const lastReadTimestamp = lastReadAt.getTime();
    if (!Number.isFinite(lastReadTimestamp) || !messages.length) {
      return { firstUnreadMessageId: null, lastReadMessageId: null };
    }

    let firstUnreadMessageId: string | null = null;
    let lastReadMessageId: string | null = null;

    for (const message of messages) {
      const messageTimestamp = getMessageCreatedAtTimestamp(message);
      if (messageTimestamp === null) continue;

      if (messageTimestamp <= lastReadTimestamp) {
        lastReadMessageId = message.id;
      } else if (!firstUnreadMessageId) {
        firstUnreadMessageId = message.id;
      }
    }

    const firstMessageWithTimestamp = messages.find(
      (message) => getMessageCreatedAtTimestamp(message) !== null,
    );
    const firstMessageTimestamp =
      firstMessageWithTimestamp &&
      getMessageCreatedAtTimestamp(firstMessageWithTimestamp);
    if (
      firstMessageWithTimestamp &&
      typeof firstMessageTimestamp === 'number' &&
      lastReadTimestamp < firstMessageTimestamp
    ) {
      return {
        firstUnreadMessageId: firstMessageWithTimestamp.id,
        lastReadMessageId,
      };
    }

    return { firstUnreadMessageId, lastReadMessageId };
  };

  emitMessageFocusSignal = ({
    messageId,
    reason,
    ttlMs = 3000,
  }: {
    messageId: string;
    reason: MessageFocusReason;
    ttlMs?: number;
  }): MessageFocusSignal => {
    this.messageFocusSignalToken += 1;
    const signal: MessageFocusSignal = {
      messageId,
      reason,
      token: this.messageFocusSignalToken,
      createdAt: Date.now(),
      ttlMs,
    };

    if (this.clearMessageFocusSignalTimeoutId) {
      clearTimeout(this.clearMessageFocusSignalTimeoutId);
      this.clearMessageFocusSignalTimeoutId = null;
    }

    this.messageFocusSignal.next({ signal });

    // NOTE: the auto-dismissal countdown is intentionally NOT started here. A focused message may
    // be emitted while its message list is not yet visible (e.g. the channel is covered by a thread
    // panel when a "view in channel" jump resolves), so measuring the highlight lifetime from the
    // moment the jump resolved would burn it while the message is still off-screen. The consumer
    // starts the countdown via `scheduleMessageFocusSignalClear` once the message is actually
    // viewed.
    return signal;
  };

  /**
   * Starts the auto-dismissal countdown for the currently active focus signal. Call this once the
   * focused message has been viewed (rendered and visible), so the highlight's lifetime is measured
   * from when the user could actually see it rather than from when the jump resolved. No-op if the
   * signal has already been cleared or superseded (guarded by `token`).
   */
  scheduleMessageFocusSignalClear = ({
    token,
    ttlMs,
  }: { token?: number; ttlMs?: number } = {}) => {
    const current = this.messageFocusSignal.getLatestValue().signal;
    if (!current) return;
    if (typeof token !== 'undefined' && current.token !== token) return;

    if (this.clearMessageFocusSignalTimeoutId) {
      clearTimeout(this.clearMessageFocusSignalTimeoutId);
      this.clearMessageFocusSignalTimeoutId = null;
    }

    this.clearMessageFocusSignalTimeoutId = setTimeout(() => {
      this.clearMessageFocusSignal({ token: current.token });
    }, ttlMs ?? current.ttlMs);
  };

  clearMessageFocusSignal = ({ token }: { token?: number } = {}) => {
    const current = this.messageFocusSignal.getLatestValue().signal;
    if (!current) return;
    if (typeof token !== 'undefined' && current.token !== token) return;

    if (this.clearMessageFocusSignalTimeoutId) {
      clearTimeout(this.clearMessageFocusSignalTimeoutId);
      this.clearMessageFocusSignalTimeoutId = null;
    }

    this.messageFocusSignal.next({ signal: null });
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
  setViewingLive = (isViewingLive: boolean) => {
    if (this.isViewingLive.getLatestValue().isViewingLive === isViewingLive) return;
    this.isViewingLive.next({ isViewingLive });
  };

  clearUnreadSnapshot = () => {
    this.unreadStateSnapshot.next({
      firstUnreadMessageId: null,
      lastReadMessageId: null,
      lastReadAt: null,
      unreadCount: 0,
    });
  };

  clearStateAndCache = () => {
    this.resetState();
    this._itemIndex.clear();
    this.clearUnreadSnapshot();
    this.clearMessageFocusSignal();
  };

  applyMessageDeletionForUser = ({
    userId,
    hardDelete = false,
    deletedAt,
  }: {
    userId: string;
    hardDelete?: boolean;
    deletedAt: Date;
  }) => {
    const loadedMessages = this.items ?? [];

    for (const message of loadedMessages) {
      if (message.user?.id === userId) {
        if (hardDelete) {
          this.removeItem({ id: message.id });
        } else {
          this.ingestItem(
            toDeletedMessage({
              message,
              hardDelete,
              deletedAt,
            }) as LocalMessage,
          );
        }
        continue;
      }

      if (
        message.quoted_message?.user?.id === userId &&
        message.quoted_message.type !== 'deleted'
      ) {
        this.ingestItem({
          ...message,
          quoted_message: toDeletedMessage({
            message: message.quoted_message,
            hardDelete,
            deletedAt,
          }) as LocalMessage,
        });
      }
    }
  };

  /**
   * Ensures quoted-message snapshots across loaded paginator cache are in sync
   * with the provided message.
   *
   * Scans cached messages and updates any item where `quoted_message_id`
   * matches `message.id`.
   */
  reflectQuotedMessageUpdate = (message: LocalMessage) => {
    const cachedMessages = this._itemIndex.values();

    for (const cachedMessage of cachedMessages) {
      if (cachedMessage.quoted_message_id !== message.id) continue;

      this.ingestItem({
        ...cachedMessage,
        quoted_message: message,
      });
    }
  };

  filterQueryResults = (items: LocalMessage[]) =>
    items.filter(this.shouldIncludeMessageInInterval.bind(this));

  private getCanonicalQueryItems(items: LocalMessage[]): LocalMessage[] {
    return [...items].sort(this.itemOrderComparator);
  }
}

const makeDeriveCursor =
  (paginator: MessagePaginator): CursorDerivator<LocalMessage, MessageQueryShape> =>
  (ctx) => {
    // Not included in the interval (filtered out by MessagePaginator.filterQueryResults).
    //
    // IMPORTANT: We must keep cursor derivation consistent with the ingested interval.
    // The interval is built from the filtered page, but ctx.page contains the raw response.
    // Around/linear derivators compare page edges and lengths against interval.itemIds. If we
    // pass a page that includes locally filtered messages (e.g. shadowed), those comparisons
    // can incorrectly conclude that the page is not at the dataset bounds.
    const pageWithPermittedMessages: LocalMessage[] = [];
    let filteredLocallyCount = 0;
    for (const message of ctx.page) {
      if (!paginator.shouldIncludeMessageInInterval(message)) {
        filteredLocallyCount++;
      } else {
        pageWithPermittedMessages.push(message);
      }
    }

    const requestedPageSizeAfterAdjustment = Math.max(
      0,
      ctx.requestedPageSize - filteredLocallyCount,
    );

    if (
      ctx.interval &&
      ctx.interval.itemIds.length + filteredLocallyCount < ctx.page.length
    ) {
      console.error(
        'error',
        'Corrupted message set state: parent set size < returned page size',
      );
      return {
        cursor: ctx.cursor,
        hasMoreHead: ctx.hasMoreHead,
        hasMoreTail: ctx.hasMoreTail,
      };
    }

    const injectCursor = ({
      hasMoreHead,
      hasMoreTail,
    }: {
      hasMoreHead: boolean;
      hasMoreTail: boolean;
    }): CursorDeriveResult => {
      const cursor: PaginatorCursor = {
        headward: !hasMoreHead ? null : (ctx.interval?.itemIds.slice(-1)[0] ?? null),
        tailward: !hasMoreTail ? null : (ctx.interval?.itemIds[0] ?? null),
      };
      return { cursor, hasMoreHead, hasMoreTail };
    };

    if ((ctx.queryShape as MessagePaginationOptions)?.created_at_around) {
      return injectCursor(
        deriveCreatedAtAroundPaginationFlags<
          LocalMessage,
          MessagePaginationOptions,
          MessagePaginator
        >({
          ...ctx,
          paginator,
          page: pageWithPermittedMessages,
          requestedPageSize: requestedPageSizeAfterAdjustment,
        }),
      );
    } else if (ctx.queryShape?.id_around) {
      return injectCursor(
        deriveIdAroundPaginationFlags({
          ...ctx,
          page: pageWithPermittedMessages,
          requestedPageSize: requestedPageSizeAfterAdjustment,
        }),
      );
    } else {
      return injectCursor(
        deriveLinearPaginationFlags({
          ...ctx,
          page: pageWithPermittedMessages,
          requestedPageSize: requestedPageSizeAfterAdjustment,
        }),
      );
    }
  };
