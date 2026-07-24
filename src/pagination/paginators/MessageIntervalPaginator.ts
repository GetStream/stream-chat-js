import type {
  AnyInterval,
  CursorDerivator,
  CursorDeriveResult,
  Interval,
  PaginationDirection,
  PaginationQueryParams,
  PaginatorCursor,
  PaginatorState,
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
  MessagePaginationParams,
  MessageResponse,
  PinnedMessagePaginationOptions,
  ReactionResponse,
  UserResponse,
} from '../../types';
import type { Channel } from '../../channel';
import { StateStore } from '../../store';
import {
  formatMessage,
  generateUUIDv4,
  normalizeQuerySort,
  toDeletedMessage,
} from '../../utils';
import { makeComparator } from '../sortCompiler';
import type { FieldToDataResolver } from '../types.normalization';
import { resolveDotPathValue } from '../utility.normalization';
import { lowerBound } from '../utility.search';
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

export const getMessageCreatedAtTimestamp = (message: LocalMessage): number | null => {
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
};

/**
 * MessageIntervalPaginator allows configuring backend request sort, while keeping internal item ordering stable.
 * Filtering of ingested items is still limited to local predicates (`filterQueryResults`).
 */
export class MessageIntervalPaginator extends BasePaginator<
  LocalMessage,
  MessageQueryShape
> {
  declare state: StateStore<MessagePaginatorState>;
  private readonly _id: string;
  protected channel: Channel;
  protected parentMessageId?: string;
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
        ? await this.channel.getReplies({
            parent_id: this.parentMessageId,
            ...options,
            sort: normalizeQuerySort(this.requestSort),
          })
        : await this.channel.query({
            messages: options as MessagePaginationParams,
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
   * Seed the paginator with the page a channel-open query just fetched (`Channel.query` for
   * `watch`/`create`, and `client.hydrateActiveChannels`).
   *
   * These paths hydrate the channel read state in the SAME synchronous tick they add messages
   * (`Channel._initializeState`), and the read patch drives `MessageReceiptsTracker`, which resolves
   * read/delivered cursors against this paginator (`findItemByTimestamp`) whenever the server omits
   * the `last_read_message_id` / `last_delivered_message_id`. `postQueryReconcile` is fully
   * synchronous (filtering is a local predicate), so seeding here guarantees the paginator is
   * populated before the reconcile runs. First-page reconciliation also takes the unread snapshot.
   *
   * The fetched page is NOT always the latest window: a channel can be opened AROUND a message
   * (`messages: { id_around }` / `{ created_at_around }`), so the original pagination options are
   * threaded through as the query shape. For an around/jump open this lets `postQueryReconcile`
   * apply jump semantics (no forced head/tail; cursor flags derived from the around position)
   * instead of wrongly flagging the window as the head (newest) page.
   */
  seedFirstPageSync(
    messages: LocalMessage[],
    requestedPageSize: number,
    messagePaginationOptions?: MessagePaginationOptions,
  ) {
    const queryShape: MessageQueryShape = {
      ...messagePaginationOptions,
      limit: requestedPageSize,
    };
    const isJump = this.isJumpQueryShape(queryShape);
    this.postQueryReconcile({
      // A jump/around page spans both directions; a plain latest page paginates tailward (older).
      direction: isJump ? undefined : 'tailward',
      isFirstPage: true,
      queryShape,
      requestedPageSize,
      results: {
        items: messages,
        headward: isJump ? messages[messages.length - 1]?.id : undefined,
        tailward: messages[0]?.id,
      },
    });
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

  protected resolveUnreadBoundaryIdsByTimestamp = ({
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

  clearStateAndCache() {
    this.resetState();
    this._itemIndex.clear();
    this.clearMessageFocusSignal();
  }

  /**
   * Partial truncation for `channel.truncated` carrying a `truncated_at`: drop every loaded
   * message strictly older than the cutoff (keeping newer ones) across all loaded windows,
   * mirroring the legacy per-message-set pruning. For a full truncation (no `truncated_at`) use
   * {@link MessageIntervalPaginator.clearStateAndCache} instead.
   *
   * Batched and edge-classified: because messages are chronological, each interval is classified by
   * its `tail` (oldest) and `head` (newest) edges, so only the single interval that *straddles* the
   * cutoff is scanned member-by-member — the rest are kept or dropped wholesale. The straddling
   * interval becomes the new global tail (nothing older than the cutoff exists anymore), so its
   * `isTail`/`hasMoreTail` are set; intervals entirely newer keep their flags (unloaded older
   * messages may still sit between them and the cutoff). The active window is re-emitted once.
   */
  truncate = ({ truncatedAt }: { truncatedAt: Date }) => {
    const cutoff = truncatedAt.getTime();
    if (Number.isNaN(cutoff)) return;

    const isOld = (item: LocalMessage | undefined) => {
      const time = item?.created_at ? new Date(item.created_at).getTime() : undefined;
      return typeof time === 'number' && time < cutoff;
    };

    const removedIds: string[] = [];
    const survivingIntervals: AnyInterval[] = [];
    // iterate from head to tail
    for (const interval of this.itemIntervals) {
      const edges = this.getIntervalPaginationEdges(interval);
      if (!edges || !isOld(edges.tail)) {
        survivingIntervals.push(interval); // oldest edge >= cutoff → nothing to drop
      } else if (isOld(edges.head)) {
        removedIds.push(...interval.itemIds); // newest edge < cutoff → whole interval is older
      } else {
        // determines the cutoff. Items are chronological, so the old ones are at the beginning of the array,
        // binary-search rather than scanning every member.
        const ids = interval.itemIds;
        const splitIndex = lowerBound(
          ids.length,
          (index) => !isOld(this._itemIndex.get(ids[index])),
        );
        removedIds.push(...ids.slice(0, splitIndex));
        const kept = ids.slice(splitIndex);
        survivingIntervals.push(
          isLogicalInterval(interval)
            ? { ...interval, itemIds: kept }
            : { ...interval, itemIds: kept, isTail: true, hasMoreTail: false },
        );
      }
    }

    if (!removedIds.length) return;
    for (const id of removedIds) this._itemIndex.remove(id);

    // No re-sort needed: `survivingIntervals` preserves the order of the already-sorted
    // `itemIntervals` (we only keep/prune/drop, never reorder), and truncation removes only
    // tailward items — an interval's head edge (the intervalComparator sort key) never changes.
    this.setIntervals(survivingIntervals);

    // Single re-emit of the active window (setIntervals does not emit).
    const active = this._activeIntervalId
      ? this._itemIntervals.get(this._activeIntervalId)
      : undefined;
    if (active && !isLogicalInterval(active)) {
      this.setActiveInterval(active);
      return;
    }

    // The active window was truncated away entirely. It sat below the cutoff, so it was older
    // than every survivor — activate the nearest surviving window (the tail-most, i.e. oldest,
    // anchored interval) rather than emitting an empty page, which would blank the message list.
    const anchoredSurvivors = this.itemIntervals.filter(
      (itv): itv is Interval => !isLogicalInterval(itv),
    );

    // If the active interval was truncated, we move to the neareast interval - which is the tail now
    const fallback = this.getTailIntervalFromSortedIntervals(anchoredSurvivors);
    if (fallback) {
      this.setActiveInterval(fallback);
    } else {
      // Nothing loaded survived the truncation.
      this.state.partialNext({ items: [] });
    }
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
            message: formatMessage(message.quoted_message),
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

  /**
   * Reflect an updated `user` object onto every cached message authored by that user, mirroring
   * the legacy `ChannelState.updateUserMessages` for the main message list (does not touch
   * `quoted_message.user` — that is not part of the legacy behavior).
   *
   * Batched: a user rename can affect many messages, so this patches the shared item index and
   * re-emits the active window a single time (if it held an affected message) rather than one
   * `ingestItem` re-emit per message.
   */
  reflectUserUpdate = (user: UserResponse) => {
    const activeIds = new Set((this.items ?? []).map((m) => this.getItemId(m)));
    let activeAffected = false;
    for (const message of this._itemIndex.values()) {
      if (message.user?.id !== user.id) continue;
      this._itemIndex.setOne({ ...message, user });
      if (activeIds.has(this.getItemId(message))) activeAffected = true;
    }
    if (activeAffected) {
      this.state.partialNext({
        items: (this.items ?? []).map((m) => this.getItem(this.getItemId(m)) ?? m),
      });
    }
  };

  /**
   * Apply a reaction WS event (`reaction.new` / `reaction.updated` / `reaction.deleted`) to the
   * cached message. The event's `message` already carries the server-updated
   * `reaction_groups` / `latest_reactions`; only `own_reactions` needs local preservation so a
   * cross-user reaction does not wipe the current user's reactions. This re-homes what
   * `ChannelState.addReaction` / `removeReaction` used to do off the now-removed
   * `channel.state.messages` / `channel.state.threads` caches (the same logic backs the thread
   * paginator via `Thread.messagePaginator`).
   *
   * `own_reactions` is seeded from the currently cached item (so another user's reaction keeps ours),
   * falling back to the event's own_reactions when the message is not loaded — matching the legacy
   * behavior where `_updateMessage` only mutated a message that existed locally.
   *
   * @param params - The reaction event payload.
   * @param params.message - The reaction event's message, carrying the
   *   server-computed `reaction_groups` / `latest_reactions`. Ingested as-is except for `own_reactions`.
   * @param params.reaction - The reaction from the event. Only added to/removed from
   *   `own_reactions` when its `user_id` is the current user; otherwise the current user's
   *   `own_reactions` are left untouched.
   * @param [params.removed=false] - `true` for `reaction.deleted` (remove the reaction from
   *   `own_reactions`); `false` for `reaction.new` / `reaction.updated` (add it).
   * @param [params.enforceUnique=false] - When adding, first clear the current user's existing
   *   `own_reactions` so only the incoming one remains (used by `reaction.updated`, where a user's
   *   reaction replaces their previous one).
   */
  reflectReaction = ({
    enforceUnique = false,
    message,
    reaction,
    removed = false,
  }: {
    message: MessageResponse | LocalMessage;
    reaction: ReactionResponse;
    enforceUnique?: boolean;
    removed?: boolean;
  }) => {
    const formatted = formatMessage(message);
    const existing = this.getItem(formatted.id);
    const baseOwnReactions = existing?.own_reactions ?? formatted.own_reactions ?? [];
    const own_reactions = removed
      ? this.removeOwnReactionOfType(baseOwnReactions, reaction)
      : this.addOwnReaction(baseOwnReactions, reaction, enforceUnique);
    this.ingestItem({ ...formatted, own_reactions });
  };

  private removeOwnReactionOfType(
    ownReactions: ReactionResponse[],
    reaction: ReactionResponse,
  ): ReactionResponse[] {
    return ownReactions.filter(
      (r) => r.user_id !== reaction.user_id || r.type !== reaction.type,
    );
  }

  private addOwnReaction(
    ownReactions: ReactionResponse[],
    reaction: ReactionResponse,
    enforceUnique: boolean,
  ): ReactionResponse[] {
    const base = enforceUnique
      ? []
      : this.removeOwnReactionOfType(ownReactions, reaction);
    if (this.channel.getClient().userID === reaction.user_id) {
      return [...base, reaction];
    }
    return base;
  }

  /**
   * Map a timestamp to a loaded message — the first message in the latest (head) window whose
   * `created_at` is >= `timestampMs` (mirrors the legacy `ChannelState.findMessageByTimestamp`
   * lower-bound search), or the newest loaded message when the timestamp is beyond it. Used by the
   * receipts tracker to resolve read/delivered cursors. Searches the newest loaded window — where
   * read cursors live — which is already sorted, so this is O(log n) with no re-sort.
   */
  findItemByTimestamp = (
    timestampMs: number,
    exactTsMatch = false,
  ): LocalMessage | null => {
    const items = this.headItems; // ascending by created_at
    if (!items.length) return null;
    // Resolve the last message created AT OR BEFORE `timestampMs` (floor). The sole caller is
    // read/delivered cursor resolution (MessageReceiptsTracker): the cursor carries the timestamp of
    // the last message a participant reached, so a message created strictly after the cursor has NOT
    // been reached. A ceil match (first message >= target) would over-count it — e.g. a participant
    // whose read cursor predates every loaded message would be reported as having read the oldest one.
    // `lowerBound` returns the first index whose created_at is strictly greater than the target, so
    // the floor is the item immediately before it.
    const firstAfter = lowerBound(items.length, (i) => {
      const t = getMessageCreatedAtTimestamp(items[i]);
      return t === null || t > timestampMs;
    });
    if (firstAfter === 0) return null; // target precedes every loaded message
    const found = items[firstAfter - 1];
    const foundTimestamp = getMessageCreatedAtTimestamp(found);
    // A message without a resolvable created_at (e.g. an optimistic message still missing its
    // server timestamp) cannot be located by timestamp.
    if (foundTimestamp === null) return null;
    if (!exactTsMatch) return found;
    return foundTimestamp === timestampMs ? found : null;
  };

  filterQueryResults = (items: LocalMessage[]) =>
    items.filter(this.shouldIncludeMessageInInterval.bind(this));

  private getCanonicalQueryItems(items: LocalMessage[]): LocalMessage[] {
    return [...items].sort(this.itemOrderComparator);
  }
}

const makeDeriveCursor =
  (
    paginator: MessageIntervalPaginator,
  ): CursorDerivator<LocalMessage, MessageQueryShape> =>
  (ctx) => {
    // Not included in the interval (filtered out by MessageIntervalPaginator.filterQueryResults).
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
          MessageIntervalPaginator
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
