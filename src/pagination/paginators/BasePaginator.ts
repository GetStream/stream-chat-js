import type { ItemLocation } from '../sortCompiler';
import { binarySearch } from '../sortCompiler';
import { itemMatchesFilter } from '../filterCompiler';
import { isPatch, StateStore, type ValueOrPatch } from '../../store';
import { debounce, type DebouncedFunc, generateUUIDv4, sleep } from '../../utils';
import { throttle, type Throttled } from '../../utils/throttling/throttle';
import { isStateThrottlingEnabled } from './stateThrottling';
import type { FieldToDataResolver } from '../types.normalization';
import { ComparisonResult } from '../types.normalization';
import { ItemIndex, type ItemIndexApi } from '../ItemIndex';
import { isEqual } from '../../utils/mergeWith/mergeWithCore';
import { DEFAULT_QUERY_CHANNELS_MS_BETWEEN_RETRIES } from '../../constants';

const noOrderChange = () => 0;

export const LOGICAL_HEAD_INTERVAL_ID = '__logical_head__';
export const LOGICAL_TAIL_INTERVAL_ID = '__logical_tail__';

type IntervalSortBounds<T> = { start: T; end: T };
type IntervalPaginationEdges<T> = { head: T; tail: T };

export type LogicalInterval = {
  itemIds: string[];
  id: typeof LOGICAL_HEAD_INTERVAL_ID | typeof LOGICAL_TAIL_INTERVAL_ID;
};

export type Interval = {
  hasMoreHead: boolean;
  hasMoreTail: boolean;
  itemIds: string[];
  id: string;
  /**
   * True if this interval represents the global head of the dataset
   * under the current sortComparator.
   *
   * Cursor pagination:
   *   headward === null
   *
   * Offset pagination:
   *   offset === 0
   */
  isHead: boolean;
  /**
   * True if this interval represents the global tail of the dataset
   * under the current sortComparator.
   *
   * Cursor pagination:
   *   tailward === null
   *
   * Offset pagination:
   *   returnedItems.length < pageSize
   */
  isTail: boolean;
};

export type AnyInterval = Interval | LogicalInterval;

export type IntervalMergePolicy = 'auto' | 'strict-overlap-only';

type ItemIntervalCoordinates = ItemLocation & {
  interval: Interval | LogicalInterval;
};

export type ItemCoordinates = {
  /** Location inside state.items (visible list) */
  state?: ItemLocation;
  /** Location inside an interval (anchored or logical) */
  interval?: ItemIntervalCoordinates;
};

export const isLiveHeadInterval = (interval: AnyInterval): interval is LogicalInterval =>
  interval.id === LOGICAL_HEAD_INTERVAL_ID;

export const isLiveTailInterval = (interval: AnyInterval): interval is LogicalInterval =>
  interval.id === LOGICAL_TAIL_INTERVAL_ID;

export const isLogicalInterval = (interval: AnyInterval): interval is LogicalInterval =>
  isLiveHeadInterval(interval) || isLiveTailInterval(interval);

function cloneInterval(interval: Interval): Interval {
  return {
    ...interval,
    itemIds: [...interval.itemIds],
  };
}

export type MakeIntervalParams<T> = {
  page: T[];
  isHead?: boolean;
  isTail?: boolean;
};

export type SetPaginatorItemsParams<T> = {
  valueOrFactory: ValueOrPatch<T[]>;
  cursor?: PaginatorCursor;
  /**
   * Relevant only is using item interval storage in the paginator.
   * Indicates that the page would be the head of pagination intervals array.
   * Items falling outside this intervals head bound will be merged into this interval.
   */
  isFirstPage?: boolean;
  /**
   * Relevant only is using item interval storage in the paginator.
   * Indicates that the page would be the tail of pagination intervals array
   * Items falling outside this intervals tail bound will be merged into this interval.
   */
  isLastPage?: boolean;
};

type MergeIntervalsResult = {
  logicalHead: LogicalInterval | null;
  merged: Interval | null;
  logicalTail: LogicalInterval | null;
};

/**
 * headward - going from page  X -> X-Y -> 0
 * tailward - goring from page 0 -> X -> X + Y ...
 *
 * Head is the place where new items are added - same as git.
 * Tail is the place where retrieved pages are appended.
 */
export type PaginationDirection = 'headward' | 'tailward';

export type CursorDeriveContext<T, Q> = {
  /**
   * Current cursor to be merged with the newly derived cursor.
   * Allows to preserve the direction we have not paginated with the given request.
   */
  cursor: PaginatorCursor | undefined;
  /**
   * Direction we just paginated in.
   *
   * May be undefined for non-directional queries (e.g. jump-to / *_around).
   */
  direction: PaginationDirection | undefined;
  hasMoreTail: boolean;
  hasMoreHead: boolean;
  /** The parent interval the page was ingested into (if any) */
  interval: Interval;
  /** The page we just received after filtering */
  page: T[];
  /** Last query shape (sometimes useful for bespoke logic) */
  queryShape: Q | undefined;
  /** Number we asked for */
  requestedPageSize: number;
};

export type PaginationFlags = {
  hasMoreHead: boolean;
  hasMoreTail: boolean;
};

export type CursorDeriveResult = PaginationFlags & {
  cursor: PaginatorCursor | undefined;
};

export type CursorDerivator<T, Q> = (
  ctx: CursorDeriveContext<T, Q>,
) => CursorDeriveResult;
/**
 * string - there is a next page in the given direction
 * null - pagination in the given direction has been exhausted
 * undefined - no page has been requested in the given pagination direction
 */
export type PaginatorCursor = {
  tailward: string | null | undefined;
  headward: string | null | undefined;
};
export const ZERO_PAGE_CURSOR: PaginatorCursor = {
  tailward: undefined,
  headward: undefined,
};

type StateResetPolicy = 'auto' | 'yes' | 'no' | (string & {});

export type PaginationQueryShapeChangeIdentifier<S> = (
  toHeadQueryShape?: S,
  toTailQueryShape?: S,
) => boolean;

export type PaginationQueryParams<Q> = {
  direction?: PaginationDirection;
  /**
   * Keep the currently loaded items (and cursor/flags) visible while a first-page query runs
   * instead of blanking to the empty initial state. The freshly fetched page is merged into the
   * active interval by `postQueryReconcile` (upserting changed items, appending new ones), so the
   * list is refreshed in place with no loading-screen flash. Used by the non-destructive refresh.
   */
  keepPreviousItems?: boolean;
  /** Data that define the query (filters, sort, ...) */
  queryShape?: Q;
  /** Per-call override of the reset behavior. */
  reset?: StateResetPolicy;
  /**
   * How many times to **retry** a failed request, i.e. `retryCount + 1` attempts in total. Per-call
   * override of `PaginatorOptions.retryCount`, which defaults to 0 (no retry).
   */
  retryCount?: number;
  /**
   * Suppress `isLoading` transitions for this query (a silent, background refresh). When falsy
   * (default) the usual loading state is surfaced so the UI can show a spinner.
   */
  silent?: boolean;
  /** Determines, whether the page loaded with the query will be committed to the paginator state. Default: true. */
  updateState?: boolean;
};

export type PostQueryReconcileParams<T, Q> = Pick<
  PaginationQueryParams<Q>,
  'direction' | 'queryShape' | 'updateState' | 'keepPreviousItems'
> & {
  isFirstPage: boolean;
  requestedPageSize: number;
  results: PaginationQueryReturnValue<T> | null;
};

export type ExecuteQueryReturnValue<T> = {
  /**
   * State object resulting from the post query processing.
   * The object is committed to the state if PaginationQueryParams<Q>['updateState'] === true.
   */
  stateCandidate: Partial<PaginatorState<T>>;
  /** In case the items are kept in intervals, the interval into which the page has been merged, will be returned. */
  targetInterval: AnyInterval | null;
};

export type PaginationQueryReturnValue<T> = { items: T[] } & {
  headward?: string;
  tailward?: string;
  /**
   * @deprecated Use `tailward` instead.
   */
  next?: string;
  /**
   * @deprecated Use `headward` instead.
   */
  prev?: string;
};
export type PaginatorDebounceOptions = {
  debounceMs: number;
};
type DebouncedExecQueryFunction<Q> = DebouncedFunc<
  (params: PaginationQueryParams<Q>) => Promise<void>
>;

export type PaginatorState<T> = {
  hasMoreHead: boolean;
  hasMoreTail: boolean;
  isLoading: boolean;
  items: T[] | undefined;
  lastQueryError?: Error;
  cursor?: PaginatorCursor;
  offset?: number;
};

/**
 * Reactive projections of specific (fixed-identity) intervals, published independently of the
 * paginated `state` (which tracks only the *active* interval). See {@link BasePaginator.intervalViews}.
 * A field is rewritten only when its own interval changes, so a `useStateStore`/`subscribeWithSelector`
 * consumer selecting one field only wakes when *that* interval changes. (The head-most window that can
 * be either a logical or an anchored interval is a derived *role*, not a fixed interval, so it is not
 * published here — read it one-shot via {@link BasePaginator.headItems} / {@link BasePaginator.headmostItem}.)
 */
export type PaginatorIntervalViews<T> = {
  /** Live logical-head interval — out-of-order items above the loaded window. */
  logicalHead: T[];
  /** Live logical-tail interval — out-of-order items below the loaded window. */
  logicalTail: T[];
  /**
   * Anchored head interval — the loaded page bounded at the dataset head (`isHead`), i.e. the newest
   * loaded page; empty when the head is not loaded. Its content updates when that page ingests/removes
   * an item, and its identity updates when a page's `isHead` flag flips during query reconciliation.
   */
  anchoredHead: T[];
};

// todo: think whether plugins are necessary. Maybe we could just document how to add

export type PaginatorItemsChangeProcessor<T> = (params: {
  nextItems: T[] | undefined;
  previousItems: T[] | undefined;
}) => T[] | undefined;

export interface PaginatorPlugin<T> {
  /**
   * Optional plugin hook invoked immediately before the paginator emits a new
   * `items` value to subscribers, but only when the `items` array has actually
   * changed by reference.
   *
   * This hook allows plugins to post-process the visible items—such as
   * deduplicating, normalizing, sorting, enriching, or otherwise transforming
   * the array—at the final stage of state emission. The processed value becomes
   * the `items` value delivered to subscribers.
   *
   * Return a new array to replace `nextState.items`, or return `undefined`
   * to leave the items unchanged.
   *
   * Executed in the order plugins are registered.
   */
  onBeforeItemsEmitted?: PaginatorItemsChangeProcessor<T>;

  // future hooks (examples)
  // onQueryStart?(ctx: { params: PaginationQueryParams<Q>; paginator: BasePaginator<T, Q> }): void | Promise<void>;
  // onQuerySuccess?(ctx: { state: PaginatorState<T>; results: PaginationQueryReturnValue<T>; paginator: BasePaginator<T, Q> }): void | Promise<void>;
  // onQueryError?(ctx: { error: unknown; paginator: BasePaginator<T, Q> }): void | Promise<void>;
}

/**
 * Optional list of plugins that can hook into paginator lifecycle events.
 *
 * Plugins allow you to encapsulate cross-cutting behavior (such as items
 * post-processing, analytics, offline caching, etc.) without modifying
 * the core paginator logic. Each plugin can register handlers like
 * `onItemsChange` that are invoked when relevant events occur.
 *
 * All registered plugins are executed in the order they appear in this array.
 */
// plugins?: PaginatorPlugin<T, Q>[];

export type PaginatorOptions<T, Q> = {
  /** The number of milliseconds to debounce the search query. The default interval is 300ms. */
  debounceMs?: number;
  /**
   * When set (and not disabled for tests — see `stateThrottling.ts`), coalesces the paginator's own
   * live `state.items` publishes to at most once per `stateThrottleMs` (leading + trailing edge): a
   * burst of live mutations (WS `message.new`, reactions, reads) re-projects the active window and
   * publishes it ~2×/sec instead of once per event. Only the paginator's OWN writes to `state.items`
   * are batched — `state.getLatestValue()` is untouched (no `StateStore` change), pagination / jump /
   * query publishes stay immediate, and an immediate flush past it is available via
   * {@link flushPendingPublishes}. Unset ⇒ no throttle (default). Enabled at
   * 500ms for the message list — see {@link MessagePaginator}.
   */
  stateThrottleMs?: number;
  /**
   * Function containing custom logic that decides, whether the next pagination query to be executed should be considered the first page query.
   * It makes sense to consider the next query as the first page query if filters, sort, options etc. (query params) excluding the page size have changed.
   */

  hasPaginationQueryShapeChanged?: PaginationQueryShapeChangeIdentifier<any>;
  /**
   * Optional hook to fully control cursor + hasMore logic in 'derived' mode.
   * If not provided, BasePaginator uses its own default implementation.
   */
  deriveCursor?: CursorDerivator<T, Q>;
  /** Custom function to retrieve items pages and optionally return a cursor in case of cursor pagination. */
  doRequest?: (queryParams: Q) => Promise<{ items: T[]; cursor?: PaginatorCursor }>;
  /** In case of cursor pagination, specify the initial cursor value. */
  initialCursor?: PaginatorCursor;
  /** In case of offset pagination, specify the initial offset value. */
  initialOffset?: number;
  /** If item index is provided, this index ensures updates in a single place and all consumers have access to a single source of data. */
  itemIndex?: ItemIndexApi<T>;
  /**
   * Factory for the item index, invoked with the fully-constructed paginator as `owner`.
   * Lets a subclass back the paginator with an adapter that needs a reference to the
   * owner (e.g. a shared, client-global store) without the `this`-before-`super` problem.
   * Ignored when an explicit `itemIndex` is supplied.
   */
  createItemIndex?: (owner: BasePaginator<T, Q>) => ItemIndexApi<T>;
  /**
   * Comparator defining in-memory item ordering for interval math and visible list rendering.
   * Defaults to `sortComparator` to preserve existing paginator behavior.
   */
  itemOrderComparator?: (a: T, b: T) => number;
  /**
   * Will prevent changing the index of existing items in state.
   * If true, an item that is already visible keeps its relative position in the current items array when updated.
   * It does not guarantee global stability across interval changes or page jumps.
   */
  lockItemOrder?: boolean;
  /** The item page size to be requested from the server. */
  pageSize?: number;
  /**
   * How many times to **retry** a failed request before giving up, i.e. `retryCount + 1` attempts in
   * total, with `DEFAULT_QUERY_CHANNELS_MS_BETWEEN_RETRIES` between them. Defaults to 0 (no retry);
   * `PaginationQueryParams.retryCount` overrides it per call.
   */
  retryCount?: number;
  /** Prevent silencing the errors thrown during the pagination execution. Default is false. */
  throwErrors?: boolean;
};

type OptionalPaginatorConfigFields =
  | 'stateThrottleMs'
  | 'deriveCursor'
  | 'doRequest'
  | 'initialCursor'
  | 'initialOffset'
  | 'itemIndex'
  | 'createItemIndex'
  | 'itemOrderComparator'
  | 'throwErrors';

export type BasePaginatorConfig<T, Q> = Pick<
  PaginatorOptions<T, Q>,
  OptionalPaginatorConfigFields
> &
  Required<Omit<PaginatorOptions<T, Q>, OptionalPaginatorConfigFields>>;

const baseHasPaginationQueryShapeChanged: PaginationQueryShapeChangeIdentifier<
  unknown
> = (prevQueryShape, nextQueryShape) => !isEqual(prevQueryShape, nextQueryShape);

export const DEFAULT_PAGINATION_OPTIONS: BasePaginatorConfig<any, any> = {
  debounceMs: 300,
  lockItemOrder: false,
  pageSize: 10,
  hasPaginationQueryShapeChanged: baseHasPaginationQueryShapeChanged,
  retryCount: 0,
  throwErrors: false,
} as const;

export abstract class BasePaginator<T, Q> {
  state: StateStore<PaginatorState<T>>;
  /**
   * Reactive projections of specific intervals — see {@link PaginatorIntervalViews}. Unlike `state`
   * (which only re-emits when the *active* interval is impacted), a field here is rewritten whenever
   * its own interval changes, regardless of which interval is active — so consumers can reactively
   * render off-window "sideloaded" content (`logicalHead`/`logicalTail`) and the newest loaded page
   * (`anchoredHead`). Kept separate from `state` so the paginated-list contract stays focused on the
   * active window + pagination status.
   */
  intervalViews: StateStore<PaginatorIntervalViews<T>>;
  config: BasePaginatorConfig<T, Q>;

  /**
   * Throttle for the active-window `state.items` publish (message list). Created only when
   * `config.stateThrottleMs` is set; drives {@link scheduleWindowPublish} / {@link flushPendingPublishes}. See
   * `stateThrottleMs` in {@link PaginatorOptions}.
   */
  private _windowPublishThrottle?: Throttled<[]>;

  /**
   * Throttle for the interval-view publishes (`anchoredHead` / `logicalHead` / `logicalTail`) driven
   * by sibling store updates. Independent of {@link _windowPublishThrottle} so a view refresh lands on
   * its own trailing edge even when `state.items` stays quiet. Created alongside it (only when
   * `config.stateThrottleMs` is set); buffers changed ids in {@link _pendingViewChangedIds}.
   */
  private _viewPublishThrottle?: Throttled<[]>;

  /** Changed ids buffered since the last {@link flushIntervalViewPublish} (throttled paginators only). */
  private _pendingViewChangedIds = new Set<string>();

  /**
   * Intervals keep items in disconnected ranges.
   * That is a scenario of jumping to non-sequential pages.
   * Intervals are populated only if itemIndex is provided.
   */
  protected _itemIntervals: Map<string, AnyInterval> = new Map();
  protected _activeIntervalId: string | undefined;

  /**
   * ItemIndex is a canonical, ID-addressable storage layer for domain items.
   * It serves as a single source of truth for all those that need to access the items
   * outside the paginator.
   */
  protected _itemIndex: ItemIndexApi<T>;

  protected _executeQueryDebounced!: DebouncedExecQueryFunction<Q>;
  /** Last effective query shape produced by subclass for the most recent request. */
  protected _lastQueryShape?: Q;
  protected _nextQueryShape?: Q;

  /**
   * Stable, performs purely item data-driven (age, last_message_at, etc.) comparison.
   * Used under the hood
   * 1. as a fallback by effectiveComparator / boostComparator if boost comparison is not conclusive
   * 2. interval comparator
   *
   * Intervals cannot be sorted using boostComparator, because boosting the interval boundary (top item)
   * would lead to the boosting of the entire interval when sorting the intervals.
   *
   * Sorting within a single interval should be done using effectiveComparator, which by default uses boostComparator.
   */
  sortComparator: (a: T, b: T) => number;
  protected _filterFieldToDataResolvers: FieldToDataResolver<T>[];

  protected boosts = new Map<string, { until: number; seq: number }>();
  protected _maxBoostSeq = 0;

  /**
   * Describes how `interval.itemIds` are oriented relative to pagination semantics.
   *
   * - `true`  => `itemIds[0]` is the pagination head edge (default)
   * - `false` => `itemIds[itemIds.length - 1]` is the pagination head edge
   *
   * NOTE: This does not affect the *sorting* of `itemIds` (they are always kept
   * in `sortComparator` order). It only affects which side is considered
   * "head" for interval ordering and live ingestion decisions.
   */
  protected get intervalItemIdsAreHeadFirst(): boolean {
    return true;
  }

  /**
   * Determines the ordering of intervals in the internal interval list.
   *
   * This controls only the ordering of intervals relative to each other (by comparing
   * their head edges using `sortComparator`). It is intentionally decoupled from:
   * - the ordering of itemIds inside an interval
   * - the meaning of the head edge (controlled by `intervalItemIdsAreHeadFirst`)
   */
  protected get intervalSortDirection(): 'asc' | 'desc' {
    return 'asc';
  }

  protected constructor({
    initialCursor,
    initialOffset,
    itemIndex,
    createItemIndex,
    ...options
  }: PaginatorOptions<T, Q> = {}) {
    this.config = {
      ...DEFAULT_PAGINATION_OPTIONS,
      initialCursor,
      initialOffset,
      ...options,
    };
    const { debounceMs } = this.config;
    this.state = new StateStore<PaginatorState<T>>({
      ...this.initialState,
      cursor: initialCursor,
      offset: initialOffset ?? 0,
    });
    if (this.config.stateThrottleMs) {
      // Coalesce the paginator's own live `state.items` publishes (see `stateThrottleMs` doc). The
      // trailing edge re-projects the active window fresh, so a burst emits ~once per interval.
      this._windowPublishThrottle = throttle(
        () => this.flushWindowPublish(),
        this.config.stateThrottleMs,
        { leading: true, trailing: true },
      );
      // Interval view publishes ride their own throttle so they coalesce like `state.items` but land
      // on an independent trailing edge (see {@link _viewPublishThrottle}).
      this._viewPublishThrottle = throttle(
        () => this.flushIntervalViewPublish(),
        this.config.stateThrottleMs,
        { leading: true, trailing: true },
      );
    }
    this.intervalViews = new StateStore<PaginatorIntervalViews<T>>({
      logicalHead: [],
      logicalTail: [],
      anchoredHead: [],
    });
    this.setDebounceOptions({ debounceMs });
    this.sortComparator = noOrderChange;
    this._filterFieldToDataResolvers = [];
    this._itemIndex =
      itemIndex ??
      createItemIndex?.(this) ??
      new ItemIndex({ getId: this.getItemId.bind(this) });
  }

  // ---------------------------------------------------------------------------
  // Basic getters
  // ---------------------------------------------------------------------------

  get lastQueryError() {
    return this.state.getLatestValue().lastQueryError;
  }

  get hasMoreTail() {
    return this.state.getLatestValue().hasMoreTail;
  }

  get hasMoreHead() {
    return this.state.getLatestValue().hasMoreHead;
  }

  /**
   * @deprecated Use `hasMoreTail` instead.
   */
  get hasNext() {
    return this.hasMoreTail;
  }

  /**
   * @deprecated Use `hasMoreHead` instead.
   */
  get hasPrev() {
    return this.hasMoreHead;
  }

  get hasResults() {
    return Array.isArray(this.state.getLatestValue().items);
  }

  get isLoading() {
    return this.state.getLatestValue().isLoading;
  }

  /** Signals that the paginator has not performed any query so far */
  get isInitialized() {
    return typeof this._lastQueryShape !== 'undefined';
  }

  get isOfflineSupportEnabled() {
    return false;
  }

  get isCursorPagination() {
    return !!this.cursor;
  }

  get initialState(): PaginatorState<T> {
    return {
      hasMoreHead: true,
      hasMoreTail: true,
      isLoading: false,
      items: undefined,
      lastQueryError: undefined,
      cursor: this.config.initialCursor,
      offset: this.config.initialOffset ?? 0,
    };
  }

  get items() {
    return this.state.getLatestValue().items;
  }

  /**
   * The newest loaded window of items, independent of which window is currently *active*
   * (`items` follows the active interval, which may point at a jumped-to / searched window). This is
   * the head-most loaded interval under the paginator's ordering (anchored or the live-head logical
   * interval).
   *
   * NOTE: this deliberately uses the head-*most loaded* interval rather than requiring the
   * `isHead` flag — the query/hydration seed does not reliably mark a freshly loaded latest page
   * as `isHead`, so an isHead-only check would miss channel-list channels entirely. The trade-off
   * is that after jumping to an older window with the latest window not loaded, this reports that
   * older window as "latest" (best effort). Use for "latest"-derived reads: last message, unread
   * counting, delivery candidates, channel-list previews.
   */
  get headItems(): T[] {
    const head = this.getHeadIntervalFromSortedIntervals(this.itemIntervals);
    return head ? this.intervalToItems(head) : [];
  }

  /**
   * The item on the head edge of the head pagination interval (of {@link BasePaginator.headItems}).
   * `undefined` when nothing is loaded.
   */
  get headmostItem(): T | undefined {
    const head = this.getHeadIntervalFromSortedIntervals(this.itemIntervals);
    return head ? (this.getIntervalPaginationEdges(head)?.head ?? undefined) : undefined;
  }

  get cursor() {
    return this.state.getLatestValue().cursor;
  }

  get offset() {
    return this.state.getLatestValue().offset;
  }

  get pageSize() {
    return this.config.pageSize;
  }

  set pageSize(size: number) {
    this.config.pageSize = size;
  }

  set initialCursor(cursor: PaginatorCursor) {
    this.config.initialCursor = cursor;
  }

  set initialOffset(offset: number) {
    this.config.initialOffset = offset;
  }

  /** Single point of truth: always use the effective comparator */
  get effectiveComparator() {
    return this.boostComparator;
  }

  protected get itemOrderComparator() {
    return this.config.itemOrderComparator ?? this.sortComparator;
  }

  get intervalComparator() {
    return (a: AnyInterval, b: AnyInterval) => {
      const aEdges = this.getIntervalPaginationEdges(a);
      const bEdges = this.getIntervalPaginationEdges(b);
      if (!aEdges || !bEdges) return 0;
      if (!aEdges) return 1; // move interval without bounds to the end
      if (!bEdges) return -1; // keep interval a preceding b
      return this.compareIntervalHeadEdges(aEdges.head, bEdges.head);
    };
  }

  get maxBoostSeq() {
    return this._maxBoostSeq;
  }

  protected get itemIntervals(): AnyInterval[] {
    return Array.from(this._itemIntervals.values());
  }

  protected get liveHeadLogical(): LogicalInterval | undefined {
    const itv = this._itemIntervals.get(LOGICAL_HEAD_INTERVAL_ID);
    return itv && isLiveHeadInterval(itv) ? itv : undefined;
  }

  protected get liveTailLogical(): LogicalInterval | undefined {
    const itv = this._itemIntervals.get(LOGICAL_TAIL_INTERVAL_ID);
    return itv && isLiveTailInterval(itv) ? itv : undefined;
  }

  /**
   * The current contents of the live logical-head interval (items ingested out of pagination order).
   * Reads the same value published to {@link BasePaginator.intervalViews}.`logicalHead`.
   */
  get logicalHeadItems(): T[] {
    return this.intervalViews.getLatestValue().logicalHead;
  }

  /**
   * The current contents of the live logical-tail interval (out-of-order items below the loaded
   * window). Reads the same value published to {@link BasePaginator.intervalViews}.`logicalTail`.
   */
  get logicalTailItems(): T[] {
    return this.intervalViews.getLatestValue().logicalTail;
  }

  /**
   * The current contents of the anchored head interval (the loaded page bounded at the dataset head,
   * `isHead`). Reads the same value published to {@link BasePaginator.intervalViews}.`anchoredHead`.
   */
  get anchoredHeadItems(): T[] {
    return this.intervalViews.getLatestValue().anchoredHead;
  }

  /**
   * Commit an interval into storage. Single choke point for adding/updating an interval, so it also
   * republishes the matching {@link intervalViews} field when the committed interval is a tracked one
   * (logical head / logical tail / anchored head). Use this instead of writing `_itemIntervals`
   * directly — bulk re-sorting (which does not change any interval's membership) goes through
   * {@link setIntervals}.
   */
  protected commitInterval(interval: AnyInterval) {
    this._itemIntervals.set(interval.id, interval);
    this.publishIntervalViewFor(interval);
  }

  /** Drop an interval from storage, republishing the matching {@link intervalViews} field if tracked. */
  protected dropInterval(id: string) {
    const removed = this._itemIntervals.get(id);
    this._itemIntervals.delete(id);
    if (removed) this.publishIntervalViewFor(removed, { removed: true });
  }

  /**
   * Republish the {@link intervalViews} field backed by the given interval — called from
   * {@link commitInterval} / {@link dropInterval} (i.e. when that interval ingests or removes an item).
   * A write to an untracked interval touches nothing here. (The anchored head is also published
   * directly via {@link publishAsAnchoredHead} from the reconciliation points that flip `isHead` —
   * see {@link postQueryReconcile}.)
   */
  private publishIntervalViewFor(interval: AnyInterval, { removed = false } = {}) {
    if (interval.id === LOGICAL_HEAD_INTERVAL_ID) {
      this.intervalViews.partialNext({
        logicalHead: this.intervalItemsOrEmpty(this.liveHeadLogical),
      });
    } else if (interval.id === LOGICAL_TAIL_INTERVAL_ID) {
      this.intervalViews.partialNext({
        logicalTail: this.intervalItemsOrEmpty(this.liveTailLogical),
      });
    } else if ((interval as Interval).isHead) {
      // On removal the head page is gone (no other interval is `isHead`) → clear; otherwise the
      // committed page IS the head.
      this.publishAsAnchoredHead(removed ? undefined : interval);
    }
  }

  /**
   * Publish `interval` as the anchored head — the loaded page bounded at the dataset head (`isHead`),
   * or `undefined` to clear it (the head page was removed or a page stopped being the head). Callers
   * pass the interval they already have, so this does not re-scan storage for the head. Its content
   * changes via ingest/remove (routed through {@link commitInterval}/{@link dropInterval}) and its
   * identity changes when a page's `isHead` flag flips during query reconciliation — both call here.
   */
  protected publishAsAnchoredHead(interval: AnyInterval | undefined) {
    this.intervalViews.partialNext({ anchoredHead: this.intervalItemsOrEmpty(interval) });
  }

  /**
   * Keep `anchoredHead` in sync after a page's `isHead` flag was (re)computed during query
   * reconciliation, given its value `wasHead` beforehand. Acts only on an actual transition:
   * - became the head page → publish it as the anchored head;
   * - stopped being the head page → clear the anchored head;
   * - unchanged → nothing (a content change, if any, was already published when the interval was
   *   committed — see {@link commitInterval}).
   */
  protected syncAnchoredHeadAfterHeadFlip(interval: Interval, wasHead: boolean) {
    if (interval.isHead === wasHead) return;
    this.publishAsAnchoredHead(interval.isHead ? interval : undefined);
  }

  private intervalItemsOrEmpty(interval: AnyInterval | undefined): T[] {
    return interval ? this.intervalToItems(interval) : [];
  }

  /**
   * Empty every {@link intervalViews} field. Used by reset paths that clear intervals in bulk (via
   * {@link setIntervals}), which bypasses the per-interval {@link commitInterval}/{@link dropInterval}
   * publishing. No-ops when the views are already empty so a reset does not emit needlessly.
   */
  protected clearIntervalViews() {
    this._pendingViewChangedIds.clear();
    const { logicalHead, logicalTail, anchoredHead } =
      this.intervalViews.getLatestValue();
    // Clear whenever any view holds items; skip only when all are already empty, so a reset on an
    // empty paginator does not emit a redundant empty→empty change (new `[]` refs would wake selectors).
    const alreadyEmpty =
      logicalHead.length === 0 && logicalTail.length === 0 && anchoredHead.length === 0;
    if (alreadyEmpty) return;
    this.intervalViews.partialNext({
      logicalHead: [],
      logicalTail: [],
      anchoredHead: [],
    });
  }

  // ---------------------------------------------------------------------------
  // Abstracts
  // ---------------------------------------------------------------------------

  abstract query(
    params: PaginationQueryParams<Q>,
  ): Promise<PaginationQueryReturnValue<T>>;

  abstract filterQueryResults(items: T[]): T[];

  /**
   * Subclasses must return the query shape.
   */
  protected getNextQueryShape(
    _params: Pick<PaginationQueryParams<Q>, 'direction'> = {},
  ): Q {
    throw new Error('Paginator.getNextQueryShape() is not implemented');
  }

  /**
   * Filters an item is matched against locally (`matchesFilter`) — NOT the filters sent to the server.
   * A paginator whose backend query is filtered has to build the request filters separately (see
   * `ChannelPaginator.buildQueryFilters`), because the two can differ: the backend may resolve a
   * server-side stored filter of its own, and some paginators filter locally without sending anything.
   */
  protected buildMatchFilters(): object | null {
    return null; // === no filters
  }

  matchesFilter(item: T): boolean {
    const filters = this.buildMatchFilters();
    if (filters == null) return true;
    return itemMatchesFilter<T>(item, filters, {
      resolvers: this._filterFieldToDataResolvers,
    });
  }

  setFilterResolvers(resolvers: FieldToDataResolver<T>[]) {
    this._filterFieldToDataResolvers = resolvers;
  }

  addFilterResolvers(resolvers: FieldToDataResolver<T>[]) {
    this._filterFieldToDataResolvers.push(...resolvers);
  }

  // ---------------------------------------------------------------------------
  // Item accessors
  // ---------------------------------------------------------------------------
  getItemId(item: T): string {
    return (item as { id: string }).id;
  }

  getItem(id: string | undefined): T | undefined {
    return typeof id === 'string' ? this._itemIndex?.get(id) : undefined;
  }

  /**
   * Whether this paginator's live `state.items` publishes are currently throttled — `stateThrottleMs`
   * is set, throttling is not globally disabled (tests), and item order is not locked (a locked-order
   * list must emit the caller-computed, order-preserved array, not a re-projection). When false, every
   * live mutation publishes immediately, exactly as before this feature.
   */
  protected get isStateThrottled(): boolean {
    return (
      isStateThrottlingEnabled() &&
      !!this._windowPublishThrottle &&
      !this.config.lockItemOrder
    );
  }

  /** Re-project the active window from its (live, source-of-truth) interval. `undefined` when inactive. */
  private projectActiveWindow(): T[] | undefined {
    if (!this._activeIntervalId) return undefined;
    const active = this._itemIntervals.get(this._activeIntervalId);
    return active ? this.intervalToItems(active) : undefined;
  }

  /**
   * Publish the active window to `state`, re-projecting it fresh from the active interval at call time
   * (the throttle boundary / flush). Because the intervals are mutated synchronously by every live op,
   * this always reflects the latest settled state, so intermediate values within a window coalesce
   * away. Clears the visible window when the active interval is gone (e.g. the last item was removed).
   */
  private flushWindowPublish(): void {
    const items = this.projectActiveWindow();
    if (items) {
      this.state.partialNext({ items });
      return;
    }
    if ((this.state.getLatestValue().items?.length ?? 0) > 0) {
      this.state.partialNext({ items: [] });
    }
  }

  /**
   * Schedule a throttled active-window publish (leading + trailing). Called from live mutations
   * (ingest / content-change / remove) INSTEAD of an inline `state.partialNext({ items })` when
   * {@link isStateThrottled}. Safe to call many times within one op — they coalesce to a single emit.
   */
  protected scheduleWindowPublish(): void {
    this._windowPublishThrottle?.throttledFn();
  }

  /**
   * Flush any pending throttled window + interval-view publishes immediately. No-op when nothing
   * is pending or throttling is off.
   */
  protected flushPendingPublishes(): void {
    this._windowPublishThrottle?.flush();
    this._viewPublishThrottle?.flush();
  }

  /**
   * {@link _viewPublishThrottle} boundary: apply every interval-view change buffered since the last
   * flush, then clear the buffer. Independent of the `state.items` window publish, so a view update
   * lands within one throttle interval even when the active window stays quiet (e.g. a reaction on a
   * head message while a non-head window is active). No-op when nothing was buffered.
   */
  private flushIntervalViewPublish(): void {
    if (!this._pendingViewChangedIds.size) return;
    this.refreshIntervalViewsForChangedIds(this._pendingViewChangedIds);
    this._pendingViewChangedIds.clear();
  }

  /**
   * Refresh any tracked {@link intervalViews} field (logical head, logical tail, anchored head) that
   * holds one of `changedIds`. A sibling holder writing new content through the shared item store
   * swaps the item object those views reference, but only this paginator's own ingest/remove
   * ({@link commitInterval}/{@link dropInterval}) republish them — so a reaction/edit made elsewhere
   * would otherwise leave stale references in `anchoredHead`/`logicalHead`/`logicalTail` even though
   * the active window (`state.items`, see {@link reconcileChangedIds}) was refreshed.
   *
   * Called immediately for un-throttled paginators, or from {@link flushIntervalViewPublish} at the
   * view-publish throttle boundary when throttled — see {@link reconcileChangedIds}. Handled
   * independently of `state.items`. When the anchored head is also the active interval its content is
   * projected here as well as into `state.items`; deduping that double projection is a separate,
   * deferred perf follow-up.
   */
  private refreshIntervalViewsForChangedIds(changedIds: ReadonlySet<string>): void {
    const head = this.liveHeadLogical;
    if (head && this.intervalHoldsAnyChangedId(head, changedIds)) {
      this.intervalViews.partialNext({ logicalHead: this.intervalToItems(head) });
    }
    const tail = this.liveTailLogical;
    if (tail && this.intervalHoldsAnyChangedId(tail, changedIds)) {
      this.intervalViews.partialNext({ logicalTail: this.intervalToItems(tail) });
    }
    let anchored: Interval | undefined;
    for (const itv of this._itemIntervals.values()) {
      if (!isLogicalInterval(itv) && itv.isHead) {
        anchored = itv;
        break;
      }
    }
    if (anchored && this.intervalHoldsAnyChangedId(anchored, changedIds)) {
      this.publishAsAnchoredHead(anchored);
    }
  }

  private intervalHoldsAnyChangedId(
    interval: AnyInterval,
    changedIds: ReadonlySet<string>,
  ): boolean {
    for (const id of interval.itemIds) if (changedIds.has(id)) return true;
    return false;
  }

  /**
   * Reconcile the projected window + interval views against a set of changed ids: another holder
   * swapped the shared item object those views reference. Refreshes any tracked interval view that
   * holds a changed id and re-projects (or slot-swaps) the active window — coalesced through the
   * publish throttles when throttling is on.
   */
  protected reconcileChangedIds(changedIds: ReadonlySet<string>): void {
    // A sibling holder changed shared content: refresh any tracked interval view (logical head/tail,
    // anchored head) holding a changed id — independent of the active window below, since a view can
    // hold a changed id the active window does not. When throttled, buffer the ids and tick the
    // view-publish throttle so refreshes coalesce (once per interval) yet still land on their own
    // trailing edge even if `state.items` never publishes again; otherwise publish immediately.
    if (this.isStateThrottled) {
      for (const id of changedIds) this._pendingViewChangedIds.add(id);
      this._viewPublishThrottle?.throttledFn();
    } else {
      this.refreshIntervalViewsForChangedIds(changedIds);
    }

    if (!this._activeIntervalId) return;
    const activeInterval = this._itemIntervals.get(this._activeIntervalId);
    if (!activeInterval) return;

    // Throttled (message list): the slot-swap fast path below reads the last-published `items`, which
    // lags the live intervals while throttled — so skip it. Gate on membership only and schedule a
    // single coalesced re-projection; the boundary re-derives the window fresh from the interval.
    if (this.isStateThrottled) {
      for (const id of activeInterval.itemIds) {
        if (changedIds.has(id)) {
          this.scheduleWindowPublish();
          return;
        }
      }
      return;
    }

    // Fast path: a content update (an in-place edit written through a sibling holder) changes
    // items in place without changing membership or order. When the current window still lines
    // up with the interval one-to-one, shallow-copy it and swap only the changed slots — this
    // preserves every unchanged item reference (so memoized rows bail) and avoids re-mapping and
    // re-sorting the whole active window on every event. Skipped when a boost is active (a boost
    // can reorder the visible window, which a slot-swap would not reflect) — then we fall through
    // to the full projection below, which applies the boost order.
    const currentItems = this.items;
    this.clearExpiredBoosts();
    if (
      currentItems &&
      currentItems.length === activeInterval.itemIds.length &&
      (this.config.lockItemOrder || this.boosts.size === 0)
    ) {
      let next: T[] | undefined;
      let needsFullProjection = false;
      for (let i = 0; i < currentItems.length; i++) {
        const id = this.getItemId(currentItems[i]);
        if (!changedIds.has(id)) continue;
        const updated = this._itemIndex.get(id);
        if (!updated) {
          // The id left the store (a removal, not an in-place update) — resync via a full projection.
          needsFullProjection = true;
          break;
        }
        if (updated === currentItems[i]) continue;
        if (!next) next = currentItems.slice();
        next[i] = updated;
      }
      if (!needsFullProjection) {
        if (next) this.state.partialNext({ items: next });
        return;
      }
    }

    // Fallback: membership/order drifted (or no window to patch, or a boost is active). Re-project,
    // but only if a changed id is actually in the active interval.
    for (const id of activeInterval.itemIds) {
      if (changedIds.has(id)) {
        this.state.partialNext({ items: this.intervalToItems(activeInterval) });
        return;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Boosts
  // ---------------------------------------------------------------------------

  protected clearExpiredBoosts(now = Date.now()) {
    for (const [id, b] of this.boosts) if (now > b.until) this.boosts.delete(id);
    this._maxBoostSeq = Math.max(
      ...Array.from(this.boosts.values()).map((boost) => boost.seq),
      0,
    );
  }

  /**
   * Applied by the effectiveComparator to take into consideration item boosts when sorting items.
   *
   * @param a - The first item to compare.
   * @param b - The second item to compare.
   */
  protected boostComparator = (a: T, b: T): number => {
    const now = Date.now();
    this.clearExpiredBoosts(now);

    const idA = this.getItemId(a);
    const idB = this.getItemId(b);
    const boostA = this.getBoost(idA);
    const boostB = this.getBoost(idB);

    const aIsBoosted = !!(boostA && now <= boostA.until);
    const bIsBoosted = !!(boostB && now <= boostB.until);

    if (aIsBoosted && !bIsBoosted) return -1;
    if (!aIsBoosted && bIsBoosted) return 1;

    if (aIsBoosted && bIsBoosted) {
      const seqDistance = (boostB.seq ?? 0) - (boostA.seq ?? 0);
      if (seqDistance !== 0) return seqDistance > 0 ? 1 : -1;
    }
    return this.itemOrderComparator(a, b);
  };

  /**
   * Increases the item's importance when sorting.
   * Boost affects position inside an item interval (if used), but should not redefine interval boundaries.
   *
   * @param itemId - Id of the item to boost.
   * @param opts - Boost options: `ttlMs` / `until` control expiry and `seq` orders concurrent boosts.
   */
  boost(itemId: string, opts?: { ttlMs?: number; until?: number; seq?: number }) {
    const now = Date.now();
    const until = opts?.until ?? (opts?.ttlMs != null ? now + opts.ttlMs : now + 15000);

    if (typeof opts?.seq === 'number' && opts.seq > this._maxBoostSeq) {
      this._maxBoostSeq = opts.seq;
    }

    const seq = opts?.seq ?? 0;
    this.boosts.set(itemId, { until, seq });
  }

  getBoost(id: string) {
    return this.boosts.get(id);
  }

  removeBoost(id: string) {
    this.boosts.delete(id);
    this._maxBoostSeq = Math.max(
      ...Array.from(this.boosts.values()).map((boost) => boost.seq),
      0,
    );
  }

  isBoosted(id: string) {
    const boost = this.getBoost(id);
    return !!(boost && Date.now() <= boost.until);
  }

  // ---------------------------------------------------------------------------
  // Interval manipulation
  // ---------------------------------------------------------------------------

  generateIntervalId(_page: (T | string)[]): string {
    return `interval-${generateUUIDv4()}`;
  }

  intervalToItems(interval: Interval | LogicalInterval): T[] {
    const items = interval.itemIds
      .map((id) => this._itemIndex?.get(id))
      .filter((item): item is T => !!item);

    // When lockItemOrder is true, we must *not* reflect boosts in state.items.
    if (this.config.lockItemOrder) {
      return items;
    }

    // itemIds are maintained in itemOrder, so the mapped items are already ordered; only an active
    // boost can reorder the visible window. Skip the otherwise-redundant full re-sort when none are
    // active (the common case), so a page ingest / full projection is a map, not a map + sort.
    this.clearExpiredBoosts();
    if (this.boosts.size === 0) {
      return items;
    }

    // Visible ordering uses boost-aware comparator
    return items.sort(this.effectiveComparator.bind(this));
  }

  makeInterval({ page, isHead, isTail }: MakeIntervalParams<T>): Interval {
    const sorted = [...page].sort((a, b) => this.itemOrderComparator(a, b));
    return {
      id: this.generateIntervalId(page),
      // Default semantics:
      // - if interval is known global head/tail, there is no more data in that direction
      // - otherwise treat it as unknown => "has more" (until proven otherwise by a query)
      hasMoreHead: isHead ? false : true,
      hasMoreTail: isTail ? false : true,
      itemIds: sorted.map(this.getItemId.bind(this)),
      isHead: !!isHead,
      isTail: !!isTail,
    };
  }

  protected getCursorFromInterval(interval: Interval): PaginatorCursor {
    // Prefer resolving edge items via sort bounds, because:
    // - interval ordering can differ from interval sorting (intervalSortDirection)
    // - "head" is a semantic concept (where new items appear), not necessarily `itemIds[0]`
    // - itemIds are stored in sortComparator order, but we want the *pagination* edges
    const edges = this.getIntervalPaginationEdges(interval);

    const fallbackFirstId = interval.itemIds[0] ?? null;
    const fallbackLastId = interval.itemIds.slice(-1)[0] ?? null;

    const fallbackHeadId = this.intervalItemIdsAreHeadFirst
      ? fallbackFirstId
      : fallbackLastId;
    const fallbackTailId = this.intervalItemIdsAreHeadFirst
      ? fallbackLastId
      : fallbackFirstId;

    const headId = edges?.head ? this.getItemId(edges.head) : fallbackHeadId;
    const tailId = edges?.tail ? this.getItemId(edges.tail) : fallbackTailId;

    return {
      headward: interval.hasMoreHead ? headId : null,
      tailward: interval.hasMoreTail ? tailId : null,
    };
  }

  isActiveInterval(interval: AnyInterval): boolean {
    return this._activeIntervalId === interval.id;
  }

  /**
   * Whether the currently active (viewed) interval is the anchored head. Used to decide if it is
   * safe to re-seed an already-loaded paginator with a fresh newest page: only when at the head
   * (the newest page overlaps it, so the re-seed reconciles + re-derives cursors in place). When the
   * caller has jumped to an older window (active interval is NOT the head), a first-page re-seed
   * would force-merge the newest page into that window across the gap - so the re-seed is skipped.
   */
  get isActiveIntervalAtHead(): boolean {
    const head = this.getHeadIntervalFromSortedIntervals(this.itemIntervals);
    return (
      !!head &&
      !isLogicalInterval(head) &&
      !!(head as Interval).isHead &&
      this.isActiveInterval(head)
    );
  }

  setActiveInterval(interval: AnyInterval | undefined, opts?: { updateState?: boolean }) {
    this._activeIntervalId = interval?.id;

    // Public API expectation: activating an anchored interval should immediately
    // reflect its pagination ability in paginator state.
    //
    // Internal callers that are in the middle of a transactional `state.next()`
    // update must pass `{ updateState: false }` and project these flags into the
    // state object directly.
    if (opts?.updateState === false) return;
    if (!interval || isLogicalInterval(interval)) return;

    this.state.partialNext({
      items: this.intervalToItems(interval),
      hasMoreHead: interval.hasMoreHead,
      hasMoreTail: interval.hasMoreTail,
    });
  }

  protected getIntervalSortBounds(
    interval: Interval | LogicalInterval,
  ): IntervalSortBounds<T> | null {
    const ids = interval.itemIds;
    if (!this._itemIndex || ids.length === 0) return null;
    const start = this._itemIndex?.get?.(ids[0]);
    const end = this._itemIndex?.get?.(ids[ids.length - 1]);
    return { start, end } as IntervalSortBounds<T>;
  }

  /**
   * Returns pagination head/tail edges of an interval.
   *
   * IMPORTANT:
   * - Edges are derived from the *sort bounds* of the interval (min/max under `sortComparator`).
   * - Which bound is treated as the pagination "head" is controlled by `intervalItemIdsAreHeadFirst`.
   * - This is a semantic notion of head/tail (where new items are expected to appear),
   *   not necessarily "min/max under sortComparator".
   * New items are always expected to appear at the head of the interval.
   */
  protected getIntervalPaginationEdges(
    interval: Interval | LogicalInterval,
  ): IntervalPaginationEdges<T> | null {
    const bounds = this.getIntervalSortBounds(interval);
    if (!bounds) return null;
    return this.intervalItemIdsAreHeadFirst
      ? { head: bounds.start, tail: bounds.end }
      : { head: bounds.end, tail: bounds.start };
  }

  protected compareIntervalHeadEdges(a: T, b: T): number {
    const cmp = this.itemOrderComparator(a, b);
    return this.intervalSortDirection === 'asc' ? cmp : -cmp;
  }

  protected aIsMoreHeadwardThanB(a: T, b: T): boolean {
    return this.intervalItemIdsAreHeadFirst
      ? this.itemOrderComparator(a, b) === ComparisonResult.A_PRECEDES_B
      : this.itemOrderComparator(b, a) === ComparisonResult.A_PRECEDES_B;
  }

  protected aIsMoreTailwardThanB(a: T, b: T): boolean {
    return this.intervalItemIdsAreHeadFirst
      ? this.itemOrderComparator(b, a) === ComparisonResult.A_PRECEDES_B
      : this.itemOrderComparator(a, b) === ComparisonResult.A_PRECEDES_B;
  }

  protected getHeadIntervalFromSortedIntervals(
    intervals: AnyInterval[],
  ): AnyInterval | undefined {
    if (intervals.length === 0) return undefined;
    if (intervals.length === 1) return intervals[0];

    const headIsLowerSortValue = this.intervalItemIdsAreHeadFirst;
    const intervalsSortedAsc = this.intervalSortDirection === 'asc';

    const headIndex =
      headIsLowerSortValue === intervalsSortedAsc ? 0 : intervals.length - 1;
    return intervals[headIndex];
  }

  protected getTailIntervalFromSortedIntervals(
    intervals: AnyInterval[],
  ): AnyInterval | undefined {
    if (intervals.length === 0) return undefined;
    if (intervals.length === 1) return intervals[0];

    const headIsLowerSortValue = this.intervalItemIdsAreHeadFirst;
    const intervalsSortedAsc = this.intervalSortDirection === 'asc';

    const tailIndex =
      headIsLowerSortValue === intervalsSortedAsc ? intervals.length - 1 : 0;
    return intervals[tailIndex];
  }

  protected sortIntervals<I extends AnyInterval>(intervals: I[]): I[] {
    const intervalsCopy = [...intervals];
    intervalsCopy.sort(this.intervalComparator.bind(this));
    return intervalsCopy;
  }

  protected setIntervals(intervals: AnyInterval[]) {
    this._itemIntervals = new Map(intervals.map((i) => [i.id, i]));
  }

  protected intervalsStrictlyOverlap(a: AnyInterval, b: AnyInterval): boolean {
    const aBounds = this.getIntervalSortBounds(a);
    const bBounds = this.getIntervalSortBounds(b);
    if (!aBounds || !bBounds) return false;
    return (
      this.itemOrderComparator(aBounds.start, bBounds.end) <= 0 &&
      this.itemOrderComparator(bBounds.start, aBounds.end) <= 0
    );
  }

  /**
   * Returns true if intervals A and B should be merged.
   *
   * 1) Strict overlap (range overlap in `sortComparator` order):
   *    A.min ≤ B.max  AND  B.min ≤ A.max
   *
   * 2) Forced merge (policy: 'auto' only):
   *    If one interval is marked as `isHead`/`isTail`, treat the other as mergeable
   *    when it extends beyond that interval's pagination head/tail edge
   *    (computed via `getIntervalPaginationEdges` + headward/tailward helpers).
   *
   * In 'strict-overlap-only' policy, only (1) applies.
   */
  protected intervalsOverlap(
    a: AnyInterval,
    b: AnyInterval,
    policy: IntervalMergePolicy = 'auto',
  ): boolean {
    const aBounds = this.getIntervalSortBounds(a);
    const bBounds = this.getIntervalSortBounds(b);
    if (!aBounds || !bBounds) return false;

    // Strict overlap if:
    // a.first <= b.last && b.first <= a.last
    if (
      this.itemOrderComparator(aBounds.start, bBounds.end) <= 0 &&
      this.itemOrderComparator(bBounds.start, aBounds.end) <= 0
    )
      return true;

    // If policy is strict-overlap-only, return false if the intervals do not strictly overlap.
    if (policy === 'strict-overlap-only') return false;

    const aIsHead = (a as Interval).isHead;
    const bIsHead = (b as Interval).isHead;
    const aIsTail = (a as Interval).isTail;
    const bIsTail = (b as Interval).isTail;

    const aEdges = this.getIntervalPaginationEdges(a);
    const bEdges = this.getIntervalPaginationEdges(b);
    if (!aEdges || !bEdges) return false;

    if (bIsHead && this.aIsMoreHeadwardThanB(aEdges.head, bEdges.head)) return true;
    if (aIsHead && this.aIsMoreHeadwardThanB(bEdges.head, aEdges.head)) return true;
    if (bIsTail && this.aIsMoreTailwardThanB(aEdges.tail, bEdges.tail)) return true;
    if (aIsTail && this.aIsMoreTailwardThanB(bEdges.tail, aEdges.tail)) return true;

    return false;
  }

  /**
   * Whether an item belongs to an anchored interval.
   */
  protected belongsToInterval(item: T, interval: AnyInterval): boolean {
    const sortBounds = this.getIntervalSortBounds(interval);
    if (!sortBounds) return false;
    const { start, end } = sortBounds;
    if (
      this.itemOrderComparator(start, item) <= 0 &&
      this.itemOrderComparator(item, end) <= 0
    )
      return true;

    const edges = this.getIntervalPaginationEdges(interval);
    if (!edges) return false;

    // Items beyond head/tail edges are considered belonging to the head/tail pages.
    if ((interval as Interval).isHead && this.aIsMoreHeadwardThanB(item, edges.head))
      return true;

    return (interval as Interval).isTail && this.aIsMoreTailwardThanB(item, edges.tail);
  }

  protected mergeTwoAnchoredIntervals(
    preceding: Interval,
    following: Interval,
  ): Interval {
    const mergeIds = (a: string[], b: string[]): string[] => {
      const itemIndex = this._itemIndex;
      if (!itemIndex) return a;

      const seen = new Set<string>();
      const merged: T[] = [];
      const mergedIds: string[] = [];

      const pushId = (id: string) => {
        if (seen.has(id)) return;
        const item = itemIndex.get(id);
        if (!item) return;
        seen.add(id);
        const { insertionIndex } = binarySearch({
          needle: item,
          length: merged.length,
          getItemAt: (index: number) => merged[index],
          itemIdentityEquals: (item1, item2) =>
            this.getItemId(item1) === this.getItemId(item2),
          // inter-interval operation sorts using the base comparator
          compare: this.itemOrderComparator.bind(this),
        });
        if (insertionIndex > -1) {
          merged.splice(insertionIndex, 0, item);
          mergedIds.splice(insertionIndex, 0, this.getItemId(item));
        }
      };

      a.forEach(pushId);
      b.forEach(pushId);

      return mergedIds;
    };

    const mergedItemIds = mergeIds(preceding.itemIds, following.itemIds);

    const precedingEdges = this.getIntervalPaginationEdges(preceding);
    const followingEdges = this.getIntervalPaginationEdges(following);

    const isHead = preceding.isHead || following.isHead;
    const isTail = preceding.isTail || following.isTail;

    // Default conservative merge:
    // - if any contributor already concluded "no more" in a direction, keep that
    let hasMoreHead = preceding.hasMoreHead && following.hasMoreHead;
    let hasMoreTail = preceding.hasMoreTail && following.hasMoreTail;

    if (precedingEdges && followingEdges) {
      const headMost = this.aIsMoreHeadwardThanB(precedingEdges.head, followingEdges.head)
        ? preceding
        : following;
      const tailMost = this.aIsMoreTailwardThanB(precedingEdges.tail, followingEdges.tail)
        ? preceding
        : following;

      hasMoreHead = headMost.hasMoreHead;
      hasMoreTail = tailMost.hasMoreTail;
    }

    return {
      ...preceding,
      itemIds: mergedItemIds,
      // Boundary intervals stay boundaries even if their edge shifts due to forced merges.
      hasMoreHead: isHead ? false : hasMoreHead,
      hasMoreTail: isTail ? false : hasMoreTail,
      isHead,
      isTail,
    };
  }

  /**
   * Merges anchored intervals. Returns null if there are no intervals to merge.
   */
  protected mergeAnchoredIntervals(
    intervals: Interval[],
    baseInterval?: Interval,
  ): Interval | null {
    if (intervals.length === 0) return null;

    const intervalsCopy = this.sortIntervals(intervals);

    let acc = cloneInterval(baseInterval ?? intervalsCopy[0]);
    for (let i = baseInterval ? 0 : 1; i < intervalsCopy.length; i++) {
      const next = intervalsCopy[i];
      acc = this.mergeTwoAnchoredIntervals(acc, next);
    }

    return acc;
  }

  // ---------------------------------------------------------------------------
  // Locate items and intervals
  // ---------------------------------------------------------------------------

  protected locateIntervalIndex(interval: Interval): number {
    const intervals = this.itemIntervals.filter(
      (i) => !isLogicalInterval(i),
    ) as Interval[];
    if (intervals.length === 0) return -1;
    if (intervals.length === 1) return interval.id === intervals[0].id ? 0 : -1;

    return binarySearch({
      needle: interval,
      length: intervals.length,
      // eslint-disable-next-line
      getItemAt: (index: number) => {
        return intervals[index];
      },
      itemIdentityEquals: (item1, item2) => item1.id === item2.id,
      compare: this.intervalComparator.bind(this),
      plateauScan: true,
    }).currentIndex;
  }
  /**
   * Locate item inside a specific interval using the same logic as locateByItem,
   * but scoped to interval items.
   */
  protected locateByItemInInterval({
    item,
    interval,
  }: {
    item: T;
    interval: Interval | LogicalInterval;
  }): ItemLocation | null {
    const ids = interval.itemIds;

    return binarySearch({
      needle: item,
      length: ids.length,
      getItemAt: (index: number) => this.getItem(ids[index]),
      itemIdentityEquals: (item1, item2) =>
        this.getItemId(item1) === this.getItemId(item2),
      // items in intervals are not sorted by effectiveComparator
      compare: this.itemOrderComparator.bind(this),
      plateauScan: true,
    });
  }

  protected locateIntervalForItem(item: T): AnyInterval | undefined {
    if (this._itemIntervals.size === 0) return undefined;

    for (const itv of this.itemIntervals) {
      if (this.belongsToInterval(item, itv)) {
        return itv;
      }
    }
  }

  /**
   * The interval whose `itemIds` lists this id, regardless of where the item now sorts.
   */
  protected findIntervalHoldingItem(item: T): AnyInterval | undefined {
    const id = this.getItemId(item);
    for (const interval of this.itemIntervals) {
      if (interval.itemIds.includes(id)) return interval;
    }
    return undefined;
  }

  protected locateByItemInIntervals(item: T): ItemCoordinates['interval'] | undefined {
    // Two different questions, asked in this order:
    //  1. which interval's sort bounds does this item fall into (`locateIntervalForItem`)? The only
    //     one that can answer for an item this paginator has never stored.
    //  2. which interval actually lists this id (`findIntervalHoldingItem`)?
    //
    // They disagree when an item is updated in place: the interval holds the very object being
    // ingested, so it already carries the item's NEW sort value, and an item that moved outside its
    // own window's bounds is no longer found by (1) — even though (2) still lists it. The fallback
    // is what lets `ingestItem` take the old entry out before re-inserting; without it the id stays
    // behind in that interval and ends up stored in two places at once.
    const interval =
      this.locateIntervalForItem(item) ?? this.findIntervalHoldingItem(item);
    if (!interval) return undefined;
    const itemLocation = this.locateByItemInInterval({ item, interval });
    if (!itemLocation) return undefined;
    return { interval, ...itemLocation };
  }

  /**
   * Locates the current position of the item and the index at which the item should be inserted
   * according to effectiveComparator.
   *
   * @param item - The item to locate within the current state.
   */
  protected locateItemInState(item: T): ItemLocation | null {
    const items = [...(this.items ?? [])];

    return binarySearch({
      needle: item,
      length: items.length,
      getItemAt: (index: number) => items[index],
      itemIdentityEquals: (item1, item2) =>
        this.getItemId(item1) === this.getItemId(item2),
      compare: this.effectiveComparator.bind(this),
      plateauScan: true,
    });
  }

  locateByItem = (item: T): ItemCoordinates => {
    const result: ItemCoordinates = {};

    // 1. Search in visible state.items
    const stateLoc = this.locateItemInState(item);
    if (stateLoc) {
      result.state = stateLoc;
    }

    // 2. Search in intervals if interval-mode is active
    const intervalLoc = this.locateByItemInIntervals(item);
    if (intervalLoc) {
      result.interval = intervalLoc;
    }

    return result;
  };

  // ---------------------------------------------------------------------------
  // Item ingestion
  // ---------------------------------------------------------------------------

  protected removeItemIdFromInterval({
    interval,
    ...itemLocation
  }: ItemIntervalCoordinates): ItemIntervalCoordinates {
    if (
      // If already at the correct position, nothing to change
      itemLocation.currentIndex >= 0 &&
      itemLocation.currentIndex === itemLocation.insertionIndex
    )
      return { interval, ...itemLocation };

    const itemIds = [...interval.itemIds];

    // Adjust insertion index if we are removing the item before reinserting index.
    // locateByItemInInterval() computed insertionIndex with the item still in the array.
    let insertionIndex = itemLocation.insertionIndex;
    if (
      itemLocation.currentIndex >= 0 &&
      itemLocation.insertionIndex > itemLocation.currentIndex
    ) {
      insertionIndex--;
    }

    // Remove existing occurrence if present
    if (itemLocation.currentIndex >= 0) {
      itemIds.splice(itemLocation.currentIndex, 1);
    }
    return {
      interval: { ...interval, itemIds },
      currentIndex: itemLocation.currentIndex,
      insertionIndex,
    };
  }

  /**
   * Inserts an item ID into the interval in the correct sorted position.
   * Returns unchanged interval if the correct insertion position could not be determined.
   */
  protected insertItemIdIntoInterval<I extends Interval | LogicalInterval>(
    interval: I,
    item: T,
  ): I {
    const itemLocation = this.locateByItemInInterval({ item, interval });
    let insertionIndex = itemLocation?.insertionIndex;
    let itemIds = [...interval.itemIds];

    if (itemLocation && itemLocation.insertionIndex > -1) {
      const removal = this.removeItemIdFromInterval({ interval, ...itemLocation });
      insertionIndex = removal.insertionIndex;
      itemIds = removal.interval.itemIds;
    }

    const id = this.getItemId(item);

    // Insert at the new position
    if (typeof insertionIndex !== 'undefined' && insertionIndex > -1) {
      itemIds.splice(insertionIndex, 0, id);
    }

    return {
      ...interval,
      itemIds,
    };
  }

  /**
   * Re-evaluates what the logical (live head / tail) intervals still hold against a freshly ingested
   * page, returning the resulting anchored interval. Live updates park items there before any page
   * exists — a channel archived while the archived list is untouched lands in the live head — and
   * once a page covers such an item, leaving it gives the same id two homes, which is what renders
   * as a duplicated row. The merge in `ingestPage` only folds logical intervals in when its
   * `isHead`/overlap heuristics fire; this pass is unconditional and idempotent.
   */
  protected reconcileLogicalIntervalsAgainst(anchored: Interval): Interval {
    let merged = anchored;

    for (const logical of [this.liveHeadLogical, this.liveTailLogical]) {
      if (!logical?.itemIds.length) continue;

      const { mergedAnchored, remainingLogical } = this.mergeItemsFromLogicalInterval(
        logical,
        merged,
      );
      merged = mergedAnchored;

      if (!remainingLogical) {
        this.dropInterval(logical.id);
        continue;
      }
      if (remainingLogical.itemIds.length !== logical.itemIds.length) {
        this.commitInterval(remainingLogical);
      }
      this.moveMisfiledItemsToOppositeSide(remainingLogical, merged);
    }

    return merged;
  }

  /**
   * Moves items the loaded window proves are parked on the wrong side: an item sitting in the live
   * head that actually sorts past the tail edge of everything loaded belongs to the live tail (the
   * unloaded region on that side), and vice versa. Leaving it claims the wrong end of the list —
   * the archived channel would render above a page it sorts below.
   *
   * Compared against the outermost anchored interval, not the page just ingested: an item that
   * lands between two loaded pages is not "beyond" either side, it is a gap item, and those stay
   * where they are (`ingestPage` turns them into their own island once the merge reaches the edge).
   */
  protected moveMisfiledItemsToOppositeSide(
    logical: LogicalInterval,
    ingested: Interval,
  ) {
    const isHeadSide = isLiveHeadInterval(logical);
    const anchoredIntervals = this.sortIntervals([
      ...this.itemIntervals.filter(
        (itv) => !isLogicalInterval(itv) && itv.id !== ingested.id,
      ),
      ingested,
    ]) as Interval[];
    const outermost = isHeadSide
      ? this.getTailIntervalFromSortedIntervals(anchoredIntervals)
      : this.getHeadIntervalFromSortedIntervals(anchoredIntervals);
    const edges = outermost ? this.getIntervalPaginationEdges(outermost) : null;
    if (!edges) return;

    const stayIds: string[] = [];
    const movedIds: string[] = [];
    for (const id of logical.itemIds) {
      const item = this.getItem(id);
      const isBeyondOutermostEdge =
        !!item &&
        (isHeadSide
          ? this.aIsMoreTailwardThanB(item, edges.tail)
          : this.aIsMoreHeadwardThanB(item, edges.head));
      (isBeyondOutermostEdge ? movedIds : stayIds).push(id);
    }
    if (!movedIds.length) return;

    const oppositeId = isHeadSide ? LOGICAL_TAIL_INTERVAL_ID : LOGICAL_HEAD_INTERVAL_ID;
    let opposite: LogicalInterval = (isHeadSide
      ? this.liveTailLogical
      : this.liveHeadLogical) ?? { id: oppositeId, itemIds: [] };
    for (const id of movedIds) {
      const item = this.getItem(id);
      opposite = item
        ? this.insertItemIdIntoInterval(opposite, item)
        : { ...opposite, itemIds: [...opposite.itemIds, id] };
    }

    this.commitInterval(opposite);
    if (stayIds.length) this.commitInterval({ ...logical, itemIds: stayIds });
    else this.dropInterval(logical.id);
  }

  /**
   * Splits a logical interval by checking each item individually.
   * Items overlapping anchoredInterval are merged into it.
   * Others stay in a retained logical interval.
   */
  protected mergeItemsFromLogicalInterval(
    logical: LogicalInterval,
    anchored: Interval,
  ): { mergedAnchored: Interval; remainingLogical: LogicalInterval | null } {
    const mergeIds: string[] = [];
    const keepIds: string[] = [];

    for (const id of logical.itemIds) {
      const item = this.getItem(id);
      if (!item) {
        keepIds.push(id);
        continue;
      }

      if (this.belongsToInterval(item, anchored)) mergeIds.push(id);
      else keepIds.push(id);
    }

    let merged = anchored;
    for (const id of mergeIds) {
      const item = this.getItem(id);
      if (!item) continue;
      merged = this.insertItemIdIntoInterval(merged, item);
    }

    return {
      mergedAnchored: merged,
      remainingLogical: keepIds.length > 0 ? { ...logical, itemIds: keepIds } : null,
    };
  }

  /**
   * Merges all intervals (anchored + logical head/tail).
   * Returns:
   *   - merged anchored interval (or null if none merged)
   *   - possibly reduced logical head / tail intervals
   */
  protected mergeIntervals(
    intervals: AnyInterval[],
    baseInterval?: Interval,
  ): MergeIntervalsResult {
    let logicalHead: LogicalInterval | null = null;
    let logicalTail: LogicalInterval | null = null;

    if (intervals.length <= 1 && !baseInterval)
      return { logicalHead, merged: null, logicalTail };

    const anchored: Interval[] = [];

    // Separate logical vs anchored
    for (const itv of intervals) {
      if (isLiveHeadInterval(itv)) logicalHead = itv;
      else if (isLiveTailInterval(itv)) logicalTail = itv;
      else anchored.push(itv);
    }

    // nothing to merge
    if (anchored.length === 0 && logicalHead && logicalTail) {
      return { logicalHead, merged: null, logicalTail };
    }

    // Merge anchored intervals into one interval (if possible)
    const mergedAnchored = this.mergeAnchoredIntervals(anchored, baseInterval);

    // No anchored intervals → just return logical ones
    if (!mergedAnchored) {
      return { logicalHead, merged: null, logicalTail };
    }

    let merged = mergedAnchored;

    // Merge items from logical HEAD interval
    if (logicalHead) {
      const { mergedAnchored, remainingLogical } = this.mergeItemsFromLogicalInterval(
        logicalHead,
        merged,
      );
      merged = mergedAnchored;
      logicalHead = remainingLogical;
    }

    // Merge items from logical TAIL interval
    if (logicalTail) {
      const { mergedAnchored, remainingLogical } = this.mergeItemsFromLogicalInterval(
        logicalTail,
        merged,
      );
      merged = mergedAnchored;
      logicalTail = remainingLogical;
    }

    return { logicalHead, merged, logicalTail };
  }

  // ---------------------------------------------------------------------------
  // Consume and manage items
  // ---------------------------------------------------------------------------

  /**
   * Ingests the whole page into intervals and returns the resulting anchored interval.
   */
  ingestPage({
    page,
    policy = 'auto',
    isHead,
    isTail,
    targetIntervalId,
    setActive,
  }: {
    page: T[];
    /**
     * Describes the policy for merging intervals.
     * - 'auto' (default): Merge intervals if they overlap.
     * - 'strict-overlap-only': Merge intervals only if they strictly overlap. Useful for jumping to a specific message.
     *   - This is useful for jumping to a specific message.
     */
    policy?: IntervalMergePolicy;
    isHead?: boolean;
    isTail?: boolean;
    targetIntervalId?: string;
    setActive?: boolean;
  }): Interval | null {
    if (!page?.length) return null;

    const pageInterval = this.makeInterval({
      page,
      isHead,
      isTail,
    });

    // Coalesce per-item change notifications into a single flush, so a page of N
    // items wakes each subscribing paginator once rather than N times.
    this._itemIndex.batch(() => {
      for (const item of page) {
        this._itemIndex.setOne(item);
      }
    });

    const targetInterval = targetIntervalId
      ? this._itemIntervals.get(targetIntervalId)
      : undefined;

    // Set the base interval in the following order of importance
    // 1. if target interval
    //  a) is not logical interval and
    //  b) merge would not lead to corrupted interval sorting
    //  (pages: [a], [b,c], merging page [x] to [a] -> [a,x], [b,c] or pages: [b,c], [x] and merging [a] to [x] => [b,c], [a,x] )
    // 2. if one of the overlappingLogical is an active interval, use it as a base
    // 3. if existing single anchored interval use it as a base
    let baseInterval: Interval | undefined;

    // Find intervals that overlap with this page
    const overlappingAnchored: Interval[] = [];
    const overlappingLogical: LogicalInterval[] = [];
    for (const itv of this.itemIntervals) {
      // target interval will be used as base
      if (targetInterval?.id === itv.id) continue;
      if (this.intervalsOverlap(pageInterval, itv, policy)) {
        if (this.isActiveInterval(itv) && !isLogicalInterval(itv)) {
          baseInterval = itv;
        } else {
          if (!isLogicalInterval(itv)) overlappingAnchored.push(itv);
          else overlappingLogical.push(itv);
        }
      } else if (
        (isHead && isLiveHeadInterval(itv)) ||
        (isTail && isLiveTailInterval(itv))
      ) {
        overlappingLogical.push(itv);
      }
    }

    // If caller specifies an anchored target interval, treat it as the merge anchor.
    // The role of ingestPage method is to merge intervals that overlap + the target
    // interval. Decision, whether target interval is a correct base interval is
    // upon the ingestPage method caller, not ingestPage method, because the method
    // does not know, in which context it has been invoked and cannot reliably tell,
    // whether it is a valid move to merge into the target interval as when
    // paginating linearly, the ingested page will never overlap with the previous page.
    if (targetInterval && !isLogicalInterval(targetInterval)) {
      baseInterval = targetInterval;
    } else if (!baseInterval && overlappingAnchored.length === 1) {
      baseInterval = overlappingAnchored[0];
      overlappingAnchored.length = 0;
    }

    const toMerge: AnyInterval[] = [
      ...overlappingLogical,
      ...overlappingAnchored,
      pageInterval,
    ];

    const { logicalHead, merged, logicalTail } = this.mergeIntervals(
      toMerge,
      baseInterval,
    );

    let resultingInterval = pageInterval;
    // Remove all intervals that participated
    if (merged) {
      resultingInterval = merged;
      for (const itv of toMerge) {
        if (merged.id === itv.id) continue;
        this.dropInterval(itv.id);
      }
    }

    // Store logical head/tail (if any)
    if (logicalHead) {
      // the leftovers that do not pertain to the first page should be migrated to a separate anchored interval
      if (merged?.isHead) {
        const convertedInterval = {
          id: this.generateIntervalId(logicalHead.itemIds),
          hasMoreHead: true,
          hasMoreTail: true,
          itemIds: logicalHead.itemIds,
          isHead: false,
          isTail: false,
        };
        this.commitInterval(convertedInterval);
      } else {
        this.commitInterval(logicalHead);
      }
    }

    if (logicalTail) {
      // the leftovers that do not pertain to the last page should be migrated to a separate anchored interval
      if (merged?.isTail) {
        const convertedInterval = {
          id: this.generateIntervalId(logicalTail.itemIds),
          hasMoreHead: true,
          hasMoreTail: true,
          itemIds: logicalTail.itemIds,
          isHead: false,
          isTail: false,
        };
        this.commitInterval(convertedInterval);
      } else {
        this.commitInterval(logicalTail);
      }
    }

    resultingInterval = this.reconcileLogicalIntervalsAgainst(resultingInterval);

    this.commitInterval(resultingInterval);
    // keep the intervals sorted
    this.setIntervals(this.sortIntervals(this.itemIntervals));

    if (
      resultingInterval &&
      setActive // || this.isActiveInterval(resultingInterval)
    ) {
      this.setActiveInterval(resultingInterval, { updateState: false });
      this.state.partialNext({
        items: this.intervalToItems(resultingInterval),
        hasMoreHead: resultingInterval.hasMoreHead,
        hasMoreTail: resultingInterval.hasMoreTail,
      });
    }

    return resultingInterval;
  }

  /**
   * Ingests a single item on live update:
   *  - update the ItemIndex
   *  - find an anchored interval whose sort bounds contain the item
   *  - insert the item into that interval using locate+plateau logic
   *  - if this is the active interval, re-emit state.items from interval
   */
  ingestItem(ingestedItem: T): boolean {
    const id = this.getItemId(ingestedItem);
    const previousItem = this._itemIndex.get(id);

    // 0. PRE-ANALYSIS: capture previous coordinates BEFORE any mutations
    const previousCoords = this.locateByItem(previousItem || ingestedItem);

    const originalIndexInState = previousCoords?.state?.currentIndex ?? -1;
    const keepOrderInState = this.config.lockItemOrder && originalIndexInState >= 0;

    // 1. Remove the old snapshot from state & intervals.
    const activeIntervalIdBeforeRemoval = this._activeIntervalId;
    let removedItemCoordinates: ItemCoordinates | undefined;
    if (previousCoords) {
      removedItemCoordinates = this.removeItemAtCoordinates(previousCoords);
    }
    const itemHasBeenRemoved =
      !!removedItemCoordinates?.state && removedItemCoordinates.state.currentIndex > -1;

    // 2. Update canonical storage (ItemIndex) to the *new* snapshot,
    //    regardless of filters – this keeps the index authoritative.
    this._itemIndex.setOne(ingestedItem);

    // 3. If it no longer matches the filter, we’re done (it has been removed above).
    if (!this.matchesFilter(ingestedItem)) {
      // Throttled: the removal above deferred its emit — publish the (settled) window once.
      if (this.isStateThrottled && itemHasBeenRemoved) this.scheduleWindowPublish();
      return itemHasBeenRemoved;
    }

    const previousInterval = previousCoords?.interval?.interval;

    const onlyLogicalIntervals =
      this.itemIntervals.length <= 2 &&
      this.itemIntervals.every((itv) => isLogicalInterval(itv));
    // IMPORTANT: decide if the new snapshot still belongs to the same anchored interval,
    // using the OLD bounds.
    const stillBelongsToPreviousAnchoredInterval =
      previousInterval &&
      // 1) If we *only* have logical intervals and the item used to live in one of them,
      //    keep it there. This prevents items from disappearing on update.
      ((onlyLogicalIntervals && isLogicalInterval(previousInterval)) ||
        // 2) Normal: for anchored intervals, only reuse if the new snapshot is still
        //    within that interval's sort bounds.
        (!isLogicalInterval(previousInterval) &&
          this.belongsToInterval(ingestedItem, previousInterval)));

    let targetInterval = stillBelongsToPreviousAnchoredInterval
      ? previousInterval
      : this.locateIntervalForItem(ingestedItem);

    const { liveHeadLogical, liveTailLogical } = this;

    if (!targetInterval) {
      // No anchored interval currently contains the new snapshot.
      // Decide whether it belongs to logical head, logical tail,
      // or to a brand-new anchored interval.
      if (this._itemIntervals.size === 0) {
        // No pages at all yet → keep in logical head.
        targetInterval = {
          id: LOGICAL_HEAD_INTERVAL_ID,
          itemIds: [this.getItemId(ingestedItem)],
        };
        if (!this._activeIntervalId) {
          this.setActiveInterval(targetInterval);
        }
      } else {
        const intervals = this.itemIntervals;
        const headInterval = this.getHeadIntervalFromSortedIntervals(intervals);
        const tailInterval = this.getTailIntervalFromSortedIntervals(intervals);
        const headEdges = headInterval && this.getIntervalPaginationEdges(headInterval);
        const tailEdges = tailInterval && this.getIntervalPaginationEdges(tailInterval);

        if (headEdges && this.aIsMoreHeadwardThanB(ingestedItem, headEdges.head)) {
          // Falls before the loaded head → logical head.
          targetInterval = liveHeadLogical
            ? this.insertItemIdIntoInterval(liveHeadLogical, ingestedItem)
            : {
                id: LOGICAL_HEAD_INTERVAL_ID,
                itemIds: [this.getItemId(ingestedItem)],
              };
        } else if (tailEdges && this.aIsMoreTailwardThanB(ingestedItem, tailEdges.tail)) {
          // Falls after the loaded tail: normally the item moved into a page this paginator has
          // not loaded, so it waits in the pending tail region. Not so when the window it left is
          // anchored at the head — that window is "the first N items" and the item is one of them,
          // it only slid to the bottom. Exiling it is what made unpinning the bottom-most loaded
          // channel look like a deletion; its rank is then approximate until the next page settles
          // it. A floating middle window has unloaded pages on both sides, so there it really is
          // on another page.
          const slidOutOfHeadAnchoredWindow =
            !!previousInterval &&
            !isLogicalInterval(previousInterval) &&
            previousInterval.isHead &&
            previousInterval.id === tailInterval?.id &&
            (previousCoords?.interval?.currentIndex ?? -1) > -1;

          targetInterval = slidOutOfHeadAnchoredWindow
            ? this.insertItemIdIntoInterval(previousInterval, ingestedItem)
            : liveTailLogical
              ? this.insertItemIdIntoInterval(liveTailLogical, ingestedItem)
              : {
                  id: LOGICAL_TAIL_INTERVAL_ID,
                  itemIds: [this.getItemId(ingestedItem)],
                };
        } else {
          // Falls somewhere *inside* the global bounds, but we don't have that page loaded.
          // We’ve already removed any old occurrence, so from the paginator's perspective
          // this item won't be visible again until the relevant page is fetched.
          if (this.isStateThrottled && itemHasBeenRemoved) this.scheduleWindowPublish();
          return itemHasBeenRemoved;
        }
      }
    } else {
      // Found an anchored interval whose bounds contain the new snapshot.
      targetInterval = this.insertItemIdIntoInterval(targetInterval, ingestedItem);
    }

    // If removing the previous snapshot emptied and dropped what was the active interval
    // (e.g. the sole reply in a freshly-opened thread), and we are re-adding the item into
    // that same interval, restore it as the active interval. Otherwise the re-added item is
    // never emitted to state.items below — the emit is gated on _activeIntervalId — so it
    // silently disappears from the visible list until the interval is reloaded.
    const removedIntervalId = removedItemCoordinates?.interval?.interval.id;
    if (
      !this._activeIntervalId &&
      !!activeIntervalIdBeforeRemoval &&
      activeIntervalIdBeforeRemoval === removedIntervalId &&
      targetInterval.id === removedIntervalId
    ) {
      this.setActiveInterval(targetInterval);
    }

    const addedNewInterval = !this._itemIntervals.has(targetInterval.id);
    this.commitInterval(targetInterval);

    if (addedNewInterval) {
      this.setIntervals(this.sortIntervals(this.itemIntervals));
    }

    // emit new state if active interval impacted by ingestion
    if (
      this._activeIntervalId &&
      [targetInterval.id, removedItemCoordinates?.interval?.interval.id].includes(
        this._activeIntervalId,
      )
    ) {
      if (this.isStateThrottled) {
        this.scheduleWindowPublish();
      } else {
        const items = this.items ?? [];
        /**
         * Having config.lockItemOrder enabled when working with intervals will lead to
         * discrepancies once active intervals are switched:
         * 1. state.items [a,b,c] intervals [a,b,c], [d]
         * 2. a changed and is moved to another interval state.items is now [a,b,c], intervals [b,c,], [d, a]
         * 3. jumping / changing active interval to [d,a] - state.items is now [d,a], intervals  [b,c], [d,a]
         */
        if (keepOrderInState) {
          // Item was visible before → reinsert at its old index
          const nextView = items.slice();
          const insertAt = Math.min(originalIndexInState, nextView.length);
          nextView.splice(insertAt, 0, ingestedItem);
          this.state.partialNext({ items: nextView });
        } else {
          /**
           * Select a correct interval from which the state.items array is derived
           */
          this.state.partialNext({
            items: this.intervalToItems(
              this._activeIntervalId === removedItemCoordinates?.interval?.interval.id &&
                this._activeIntervalId !== targetInterval.id
                ? removedItemCoordinates.interval.interval
                : targetInterval,
            ),
          });
        }
      }
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Remove / contains
  // ---------------------------------------------------------------------------

  protected removeItemAtCoordinates(coords: ItemCoordinates): ItemCoordinates {
    const { state: stateLocation, interval: intervalLocation } = coords;

    const result: ItemCoordinates = {
      state: { currentIndex: -1, insertionIndex: -1 },
    };

    // 1) Remove from interval, if present
    if (intervalLocation && intervalLocation.currentIndex > -1) {
      const updatedInterval = this.removeItemIdFromInterval(intervalLocation);
      const { interval } = updatedInterval;
      if (interval.itemIds.length === 0) {
        // Drop empty interval
        this.dropInterval(interval.id);

        // If it was active -> clear active
        if (this.isActiveInterval(interval)) {
          this.setActiveInterval(undefined);
        }
      } else {
        this.commitInterval(updatedInterval.interval);
      }
      result.interval = updatedInterval;
    }

    // 2) Remove from visible state.items, if present
    if (stateLocation && stateLocation.currentIndex > -1) {
      if (!this.isStateThrottled) {
        const newItems = [...(this.items ?? [])];
        newItems.splice(stateLocation.currentIndex, 1);
        this.state.partialNext({ items: newItems });
      }

      // keep insertionIndex consistent if someone uses it later
      if (stateLocation.insertionIndex > stateLocation.currentIndex) {
        stateLocation.insertionIndex--;
      }

      result.state = stateLocation;
    }

    return result;
  }

  /**
   * Meaning of location values
   * - currentIndex === -1 could not be found
   * - insertionIndex === -1 insertion index was no intended to be determined
   *
   * If we are removing the last item from the currently active interval, we do not search for a new active interval.
   * If the number of items approach 0 in an active interval, we expect from the UI to load new pages to populate
   * the active interval.
   */
  removeItem({ id, item: inputItem }: { id?: string; item?: T }): ItemCoordinates {
    const noAction = { state: { currentIndex: -1, insertionIndex: -1 } };
    if (!id && !inputItem) return noAction;

    const item = inputItem ?? this.getItem(id);

    if (item) {
      const coords = this.locateByItem(item);
      if (!coords.state && !coords.interval) return noAction;
      const result = this.removeItemAtCoordinates(coords);
      this._itemIndex.remove(this.getItemId(item));
      // Throttled: removeItemAtCoordinates deferred its emit — publish the (settled) window once.
      if (this.isStateThrottled) this.scheduleWindowPublish();
      return result;
    }

    return noAction;
  }

  /** Sets the items in the state, ingesting them so the active interval is updated. */
  setItems({
    valueOrFactory,
    cursor,
    isFirstPage,
    isLastPage,
  }: SetPaginatorItemsParams<T>) {
    this.state.next((current) => {
      const { items: currentItems = [] } = current;
      const newItems = isPatch(valueOrFactory)
        ? valueOrFactory(currentItems)
        : valueOrFactory;

      // If the references between the two values are the same, just return the
      // current state; otherwise trigger a state change.
      if (currentItems === newItems) {
        return current;
      }
      const newState = { ...current, items: newItems };

      if (cursor) {
        newState.cursor = cursor;
      } else {
        newState.offset = newItems.length;
      }

      const interval = this.ingestPage({
        page: newItems,
        isHead: isFirstPage,
        isTail: isLastPage,
      });
      if (interval) {
        this.setActiveInterval(interval, { updateState: false });
        newState.hasMoreHead = interval.hasMoreHead;
        newState.hasMoreTail = interval.hasMoreTail;
      }

      return newState;
    });

    // A populated page means a first page is effectively "loaded". Record a query shape so the
    // paginator counts as initialized and the next pagination continues from this page - otherwise
    // an undefined `_lastQueryShape` makes the first query look like a shape change, triggering a
    // first page reset that wipes the seeded items and re-fetches the first page before paginating.
    if (
      typeof this._lastQueryShape === 'undefined' &&
      (this.state.getLatestValue().items?.length ?? 0) > 0
    ) {
      this._lastQueryShape = this.getNextQueryShape({});
    }
  }

  // ---------------------------------------------------------------------------
  // Debounce & query execution
  // ---------------------------------------------------------------------------

  setDebounceOptions = ({ debounceMs }: PaginatorDebounceOptions) => {
    this._executeQueryDebounced = debounce(this.executeQuery.bind(this), debounceMs);
  };

  protected shouldResetStateBeforeQuery(
    prevQueryShape: unknown | undefined,
    nextQueryShape: unknown | undefined,
  ): boolean {
    return (
      typeof prevQueryShape === 'undefined' ||
      this.config.hasPaginationQueryShapeChanged(prevQueryShape, nextQueryShape)
    );
  }

  protected canExecuteQuery = ({
    direction,
    reset,
  }: { direction?: PaginationDirection } & Pick<PaginationQueryParams<Q>, 'reset'>) =>
    !this.isLoading &&
    (reset === 'yes' ||
      // If direction is undefined, we are jumping to a specific message.
      typeof direction === 'undefined' ||
      (direction === 'tailward' && this.hasMoreTail) ||
      (direction === 'headward' && this.hasMoreHead));

  isFirstPageQuery = (
    params: { queryShape?: unknown } & Pick<PaginationQueryParams<Q>, 'reset'>,
  ): boolean => {
    // A paginator with no loaded window starts its pagination from the first page. Note the third
    // branch below covers the case where items are present without any page having been loaded (a
    // live event ingested one into a never-queried list): no query shape has been recorded yet, so
    // `shouldResetStateBeforeQuery` reports a first page for it too.
    if (typeof this.items === 'undefined') return true;
    if (params.reset === 'yes') return true;
    if (params.reset === 'no') return false;

    return this.shouldResetStateBeforeQuery(this._lastQueryShape, params.queryShape);
  };

  protected getStateBeforeFirstQuery(): PaginatorState<T> {
    const state: PaginatorState<T> = {
      ...this.initialState,
      isLoading: true,
    };
    // This is the one moment the loaded window is (re)established from its start offset. For offset
    // pagination the head (beginning) is loaded exactly when that window starts at offset 0, so
    // hasMoreHead is a constant known before the query runs — anchor it here, once. It must NOT be
    // re-derived per page in postQueryReconcile, because the offset only grows tailward from here and
    // would then read as "more headward" even for a list that started at the head. Cursor pagination
    // learns hasMoreHead from the query response, so leave the optimistic default for it.
    if (!this.isCursorPagination) {
      state.hasMoreHead = (this.config.initialOffset ?? 0) > 0;
    }
    return state;
  }

  isJumpQueryShape(_queryShape: Q): boolean {
    return false;
  }

  protected getStateAfterQuery(
    stateUpdate: Partial<PaginatorState<T>>,

    _isFirstPage: boolean,
  ): PaginatorState<T> {
    const current = this.state.getLatestValue();
    return {
      ...current,
      lastQueryError: undefined,
      ...stateUpdate,
      isLoading: false,
      items: stateUpdate.items,
    };
  }

  preloadFirstPageFromOfflineDb = (
    _params: PaginationQueryParams<Q>,
  ): Promise<T[] | undefined> | T[] | undefined => undefined;

  populateOfflineDbAfterQuery = (_params: {
    items: T[] | undefined;
    queryShape: Q | undefined;
  }): Promise<T[] | undefined> | T[] | undefined => undefined;

  protected async runQueryRetryable(
    params: PaginationQueryParams<Q> = {},
  ): Promise<PaginationQueryReturnValue<T> | null> {
    const remainingRetries = params.retryCount ?? 0;
    try {
      return await this.query(params);
    } catch (e) {
      const isOfflineSupportEnabledWithItems =
        this.isOfflineSupportEnabled && (this.items ?? []).length > 0;
      if (!isOfflineSupportEnabledWithItems) {
        this.state.partialNext({ lastQueryError: e as Error });
      }

      if (remainingRetries > 0) {
        await sleep(DEFAULT_QUERY_CHANNELS_MS_BETWEEN_RETRIES);
        return await this.runQueryRetryable({
          ...params,
          retryCount: remainingRetries - 1,
        });
      }
      if (this.config.throwErrors) {
        this.state.partialNext({ isLoading: false });
        throw e;
      }
      return null;
    }
  }

  /**
   * Falsy return value means query was not successful.
   *
   * @param params - Query parameters.
   * @param params.direction - Direction to paginate in (headward or tailward).
   * @param params.keepPreviousItems - Keep already-loaded items instead of clearing them on a first-page query.
   * @param params.queryShape - Explicit query shape overriding the one derived from current state.
   * @param params.reset - Whether to reset the loaded state before querying.
   * @param params.retryCount - Number of remaining retry attempts on failure.
   * @param params.silent - Suppress loading/state updates for this query.
   * @param params.updateState - Whether to write the query results back to state.
   */
  async executeQuery({
    direction,
    keepPreviousItems,
    queryShape: forcedQueryShape,
    reset,
    retryCount = this.config.retryCount,
    silent,
    updateState = true,
  }: PaginationQueryParams<Q> = {}): Promise<ExecuteQueryReturnValue<T> | void> {
    if (!this.canExecuteQuery({ direction, reset })) return;

    // A forced reset must happen BEFORE the request is built: `getNextQueryShape()` reads the
    // pagination position (offset / cursor) out of state, so building first would re-query the page
    // the previous pagination stopped at — a `reload()` at offset 20 would return the third page.
    // `reset: 'yes'` is a first page by definition, so no query shape is needed to decide.
    //
    // Clearing the interval storage here also stops the incoming page from merging into stale
    // intervals. Only a forced reset clears it: a first page reached through ordinary shape-change
    // detection (cursor pagination looks like a new shape every page) must keep the cache so
    // adjacent pages merge; filter/sort changes clear it via `resetState()` in their setters.
    const isForcedReset = reset === 'yes' && !keepPreviousItems;
    if (isForcedReset) {
      this.setIntervals([]);
      this.setActiveInterval(undefined);
      this._itemIndex.clear();
      this.clearIntervalViews();
      this.state.next(this.getStateBeforeFirstQuery());
    } else if (reset === 'yes' && !forcedQueryShape) {
      // A `keepPreviousItems` refresh (reconnect / pull-to-refresh) must still restart pagination from
      // page 1, but WITHOUT clearing the loaded window — the list stays visible while the fresh first
      // page loads. Reset only the pagination position; `getNextQueryShape()` below reads it from state.
      this.state.partialNext({
        cursor: this.config.initialCursor,
        offset: this.config.initialOffset ?? 0,
      });
    }

    const queryShape = forcedQueryShape ?? this.getNextQueryShape({ direction });

    const isFirstPage = this.isFirstPageQuery({ queryShape, reset });

    if (isFirstPage && !keepPreviousItems) {
      const state = this.getStateBeforeFirstQuery();
      let items: T[] | undefined = undefined;
      if (!this.isInitialized) {
        items =
          (await this.preloadFirstPageFromOfflineDb({
            direction,
            queryShape,
            reset,
            retryCount,
          })) ?? state.items;
      }
      // A forced reset already published this state above; re-publishing an identical value would
      // only emit a second time. Publish again solely when the offline preload produced items.
      if (!isForcedReset || items !== undefined) {
        this.state.next({ ...state, items });
      }
    } else if (!silent) {
      // Non-first-page, or a keepPreviousItems refresh: surface loading without blanking the list. The
      // freshly fetched page is merged into the still-loaded intervals in postQueryReconcile.
      this.state.partialNext({ isLoading: true });
    }

    this._nextQueryShape = queryShape;
    const results = await this.runQueryRetryable({
      direction,
      queryShape,
      reset,
      retryCount,
    });
    return this.postQueryReconcile({
      direction,
      isFirstPage,
      keepPreviousItems,
      queryShape,
      requestedPageSize: this.pageSize,
      results,
      updateState,
    });
  }

  postQueryReconcile({
    direction,
    isFirstPage,
    keepPreviousItems,
    queryShape,
    requestedPageSize,
    results,
    updateState = true,
  }: PostQueryReconcileParams<T, Q>): ExecuteQueryReturnValue<T> {
    this._lastQueryShape = queryShape;
    this._nextQueryShape = undefined;

    const stateUpdate: Partial<PaginatorState<T>> = {
      isLoading: false,
    };

    if (!results) {
      this.state.partialNext(stateUpdate);
      return { stateCandidate: stateUpdate, targetInterval: null };
    }

    // Backward compatibility for custom BasePaginator subclasses:
    // - old PaginationQueryReturnValue used next/prev
    // - new contract uses tailward/headward
    //
    // Internal SDK paginators already return tailward/headward, so this fallback is
    // only to keep non-migrated external subclasses working during transition.
    const { items, headward, tailward, next, prev } = results;
    const resolvedHeadward = headward ?? prev;
    const resolvedTailward = tailward ?? next;

    stateUpdate.lastQueryError = undefined;
    // Filtering is a synchronous local predicate (see filterQueryResults), so the whole
    // reconciliation runs in a single tick. The channel-open seed relies on this to populate the
    // paginator synchronously (MessagePaginator.seedFirstPageSync) before read-state hydration.
    const filteredItems = this.filterQueryResults(items);
    stateUpdate.items = filteredItems;

    const isJumpQuery = !!queryShape && this.isJumpQueryShape(queryShape);
    const interval = this.ingestPage({
      page: stateUpdate.items,
      policy: isJumpQuery ? 'strict-overlap-only' : 'auto',
      // the first page should be always marked as head
      isHead: isJumpQuery
        ? undefined //head/tail doesn't apply / is unknown for this ingestion
        : isFirstPage ||
          (direction === 'headward' ? requestedPageSize > items.length : undefined),
      // even though the page is first, we have to compare the requested vs returned page size
      isTail: isJumpQuery
        ? undefined //head/tail doesn't apply / is unknown for this ingestion
        : isFirstPage || direction === 'tailward'
          ? requestedPageSize > items.length
          : undefined,
      targetIntervalId: isJumpQuery ? undefined : this._activeIntervalId,
    });
    if (interval && updateState) {
      this.setActiveInterval(interval, { updateState: false });
      stateUpdate.items = this.intervalToItems(interval);
    } else if (updateState && !items.length && (keepPreviousItems || !isFirstPage)) {
      // An empty page must NOT wipe the loaded items on a non-destructive refresh
      // (keepPreviousItems) or an incremental query. `ingestPage` returns null for an empty page
      // (leaving the active interval untouched), so `stateUpdate.items` still holds the empty
      // `filteredItems` here and committing that would blank the list. This happens when a refresh
      // finds nothing, or when a paginate hits the dataset edge. Preserve the current view instead.
      // A genuine reset (isFirstPage without keepPreviousItems) still blanks, so an emptied dataset
      // shows empty.
      stateUpdate.items = this.items;
    }

    /**
     * Cursor can be calculated client-side or returned from the server.
     * Therefore, the BasePaginator.cursorSource can be 'derived' | 'query'
     * - derived - the BasePaginator applies the default client-side logic based on the pagination options (id_lt, id_gt, id_around...)
     * - query - BasePaginator.query() resp. BasePaginator.config.doRequest (called inside query()) is expected to provide the cursor and abide by the rules that when the wall is hit in
     * a given direction, the cursor will be set to null.
     *
     * The 'derived' calculation will perform the following steps:
     * 1. After ingesting into the parent interval determine the cursor candidate values from the first and the last item in the interval.
     * 2. Decide, whether the candidates can be set based on the requested vs real page size
     * 3. If the page size from the response is smaller that the requested page size, then in the given direction
     * the cursor will be set to null.
     */
    if (this.isCursorPagination) {
      if (this.config.deriveCursor && interval) {
        const { cursor, hasMoreTail, hasMoreHead } = this.config.deriveCursor({
          direction,
          interval,
          queryShape,
          page: results.items,
          requestedPageSize,
          cursor: this.cursor,
          hasMoreHead: this.hasMoreHead,
          hasMoreTail: this.hasMoreTail,
        });
        stateUpdate.cursor = cursor;
        stateUpdate.hasMoreTail = hasMoreTail;
        stateUpdate.hasMoreHead = hasMoreHead;
      } else {
        stateUpdate.cursor = {
          tailward: resolvedTailward || null,
          headward: resolvedHeadward || null,
        };
        stateUpdate.hasMoreTail = !!resolvedTailward;
        stateUpdate.hasMoreHead = !!resolvedHeadward;
      }
    } else {
      // todo: we could keep the offset in two directions (initial tailward offset would be taken from config.initialOffset)
      const startOffset = this.offset ?? 0;
      stateUpdate.offset = startOffset + items.length;
      // Only hasMoreTail depends on the page result. hasMoreHead is fixed by where the loaded window
      // starts (offset 0 => head loaded) and was anchored once at the reset (getStateBeforeFirstQuery);
      // the offset only grows tailward from here, so leave hasMoreHead untouched.
      stateUpdate.hasMoreTail = items.length === this.pageSize;
    }

    if (interval) {
      const current = this.state.getLatestValue();
      const resolvedHasMoreHead =
        typeof stateUpdate.hasMoreHead === 'boolean'
          ? stateUpdate.hasMoreHead
          : current.hasMoreHead;
      const resolvedHasMoreTail =
        typeof stateUpdate.hasMoreTail === 'boolean'
          ? stateUpdate.hasMoreTail
          : current.hasMoreTail;

      const wasHead = interval.isHead;
      interval.hasMoreHead = resolvedHasMoreHead;
      interval.hasMoreTail = resolvedHasMoreTail;
      interval.isHead = resolvedHasMoreHead === false;
      interval.isTail = resolvedHasMoreTail === false;
      // `isHead` is decided here (not at ingest); reflect any head-status flip in `anchoredHead`.
      this.syncAnchoredHeadAfterHeadFlip(interval, wasHead);
    } else if (!items.length && direction) {
      // An empty directional response means the dataset edge was reached in `direction`, but
      // `ingestPage` returns no interval for an empty page so the block above never runs. Flag the
      // currently active interval as reaching that edge; otherwise its `isHead`/`isTail` stay stale
      // (e.g. `jumpToTheLatestMessage` would never see the head as loaded, and a "scroll to latest"
      // affordance would never clear).
      const activeInterval = this._activeIntervalId
        ? this._itemIntervals.get(this._activeIntervalId)
        : undefined;
      if (activeInterval && !isLogicalInterval(activeInterval)) {
        if (direction === 'headward') {
          const wasHead = activeInterval.isHead;
          activeInterval.isHead = true;
          activeInterval.hasMoreHead = false;
          // The active page just reached the dataset head; reflect the flip in `anchoredHead`.
          this.syncAnchoredHeadAfterHeadFlip(activeInterval, wasHead);
        } else if (direction === 'tailward') {
          activeInterval.isTail = true;
          activeInterval.hasMoreTail = false;
        }
      }
    }

    const state = this.getStateAfterQuery(stateUpdate, isFirstPage);
    if (updateState) this.state.next(state);
    this.populateOfflineDbAfterQuery({ items: state.items, queryShape });

    return {
      stateCandidate: state,
      targetInterval: interval,
    };
  }

  // ---------------------------------------------------------------------------
  // Public API: navigation
  // ---------------------------------------------------------------------------

  cancelScheduledQuery() {
    this._executeQueryDebounced.cancel();
  }

  resetState() {
    this.state.next(this.initialState);
    this.setIntervals([]);
    this.setActiveInterval(undefined);
    this.clearIntervalViews();
    // Nothing is loaded anymore, so the next query is a first page again. Without this the reset
    // paginator would still report itself as initialized and a re-query with an unchanged shape
    // (a filter/sort setter that resets, `ChannelManager.resetPaginatorStates()` on disconnect)
    // would be treated as a continuation — ingested without `isHead`, leaving any live-updated
    // logical interval unreconciled.
    this._lastQueryShape = undefined;
  }

  /**
   * Releases this paginator's hold on its item content. With a shared, refcounted item index this
   * unlinks every member id from the backing store, so the store no longer strong-references this
   * paginator through its subscriber registry — otherwise a discarded owner stays pinned, keeps
   * receiving change notifications, and its items never garbage-collect. Call on teardown of the
   * owner: a discard, not a reset (the owner is not reused; a re-appearing id gets a fresh instance;
   * leftover interval/state caches die with the paginator when it is dropped). Also cancels any
   * pending throttled window/view publish, so nothing emits after teardown.
   */
  dispose(): void {
    this._windowPublishThrottle?.cancelTimer();
    this._viewPublishThrottle?.cancelTimer();
    this._pendingViewChangedIds.clear();
    this._itemIndex.clear();
  }

  toTail = (params: Omit<PaginationQueryParams<Q>, 'direction' | 'queryShape'> = {}) =>
    this.executeQuery({ direction: 'tailward', ...params });

  toHead = (params: Omit<PaginationQueryParams<Q>, 'direction' | 'queryShape'> = {}) =>
    this.executeQuery({ direction: 'headward', ...params });

  /**
   * @deprecated Use `toTail` instead.
   */
  next = (params: Omit<PaginationQueryParams<Q>, 'direction' | 'queryShape'> = {}) =>
    this.toTail(params);

  /**
   * @deprecated Use `toHead` instead.
   */
  prev = (params: Omit<PaginationQueryParams<Q>, 'direction' | 'queryShape'> = {}) =>
    this.toHead(params);

  toTailDebounced = (
    params: Omit<PaginationQueryParams<Q>, 'direction' | 'queryShape'> = {},
  ) => {
    this._executeQueryDebounced({ direction: 'tailward', ...params });
  };

  toHeadDebounced = (
    params: Omit<PaginationQueryParams<Q>, 'direction' | 'queryShape'> = {},
  ) => {
    this._executeQueryDebounced({ direction: 'headward', ...params });
  };

  /**
   * @deprecated Use `toTailDebounced` instead.
   */
  nextDebounced = (
    params: Omit<PaginationQueryParams<Q>, 'direction' | 'queryShape'> = {},
  ) => {
    this.toTailDebounced(params);
  };

  /**
   * @deprecated Use `toHeadDebounced` instead.
   */
  prevDebounced = (
    params: Omit<PaginationQueryParams<Q>, 'direction' | 'queryShape'> = {},
  ) => {
    this.toHeadDebounced(params);
  };

  reload = async () => {
    await this.toTail({ reset: 'yes' });
  };
}
