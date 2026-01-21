import type { ItemLocation } from '../sortCompiler';
import { binarySearch } from '../sortCompiler';
import { itemMatchesFilter } from '../filterCompiler';
import { isPatch, StateStore, type ValueOrPatch } from '../../store';
import { debounce, type DebouncedFunc, generateUUIDv4, sleep } from '../../utils';
import type { FieldToDataResolver } from '../types.normalization';
import { ComparisonResult } from '../types.normalization';
import { ItemIndex } from '../ItemIndex';
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
  /** Data that define the query (filters, sort, ...) */
  queryShape?: Q;
  /** Per-call override of the reset behavior. */
  reset?: StateResetPolicy;
  /** Should retry the failed request given number of times. Default is 0. */
  retryCount?: number;
  /** Determines, whether the page loaded with the query will be committed to the paginator state. Default: true. */
  updateState?: boolean;
};

export type PostQueryReconcileParams<T, Q> = Pick<
  PaginationQueryParams<Q>,
  'direction' | 'queryShape' | 'updateState'
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
   * Function containing custom logic that decides, whether the next pagination query to be executed should be considered the first page query.
   * It makes sense to consider the next query as the first page query if filters, sort, options etc. (query params) excluding the page size have changed.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  itemIndex?: ItemIndex<T>;
  /**
   * Will prevent changing the index of existing items in state.
   * If true, an item that is already visible keeps its relative position in the current items array when updated.
   * It does not guarantee global stability across interval changes or page jumps.
   */
  lockItemOrder?: boolean;
  /** The item page size to be requested from the server. */
  pageSize?: number;
  /** Prevent silencing the errors thrown during the pagination execution. Default is false. */
  throwErrors?: boolean;
};

type OptionalPaginatorConfigFields =
  | 'deriveCursor'
  | 'doRequest'
  | 'initialCursor'
  | 'initialOffset'
  | 'itemIndex'
  | 'throwErrors';

export type BasePaginatorConfig<T, Q> = Pick<
  PaginatorOptions<T, Q>,
  OptionalPaginatorConfigFields
> &
  Required<Omit<PaginatorOptions<T, Q>, OptionalPaginatorConfigFields>>;

const baseHasPaginationQueryShapeChanged: PaginationQueryShapeChangeIdentifier<
  unknown
> = (prevQueryShape, nextQueryShape) => !isEqual(prevQueryShape, nextQueryShape);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const DEFAULT_PAGINATION_OPTIONS: BasePaginatorConfig<any, any> = {
  debounceMs: 300,
  lockItemOrder: false,
  pageSize: 10,
  hasPaginationQueryShapeChanged: baseHasPaginationQueryShapeChanged,
  throwErrors: false,
} as const;

export abstract class BasePaginator<T, Q> {
  state: StateStore<PaginatorState<T>>;
  config: BasePaginatorConfig<T, Q>;

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
  protected _itemIndex: ItemIndex<T>;
  /**
   * Whether the paginator should maintain interval storage.
   *
   * Intervals are populated only when a caller provides an `itemIndex` instance.
   * Otherwise the paginator behaves as a classic list paginator and mutates
   * only `state.items`.
   */
  protected _usesItemIntervalStorage: boolean;

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
    this.setDebounceOptions({ debounceMs });
    this.sortComparator = noOrderChange;
    this._filterFieldToDataResolvers = [];
    this._usesItemIntervalStorage = !!itemIndex;
    this._itemIndex = itemIndex ?? new ItemIndex({ getId: this.getItemId.bind(this) });
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

  protected get usesItemIntervalStorage(): boolean {
    return this._usesItemIntervalStorage;
  }

  protected get liveHeadLogical(): LogicalInterval | undefined {
    const itv = this._itemIntervals.get(LOGICAL_HEAD_INTERVAL_ID);
    return itv && isLiveHeadInterval(itv) ? itv : undefined;
  }

  protected get liveTailLogical(): LogicalInterval | undefined {
    const itv = this._itemIntervals.get(LOGICAL_TAIL_INTERVAL_ID);
    return itv && isLiveTailInterval(itv) ? itv : undefined;
  }

  // ---------------------------------------------------------------------------
  // Abstracts
  // ---------------------------------------------------------------------------

  abstract query(
    params: PaginationQueryParams<Q>,
  ): Promise<PaginationQueryReturnValue<T>>;

  abstract filterQueryResults(items: T[]): T[] | Promise<T[]>;

  /**
   * Subclasses must return the query shape.
   */
  protected getNextQueryShape({
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    direction,
  }: Pick<PaginationQueryParams<Q>, 'direction'> = {}): Q {
    throw new Error('Paginator.getNextQueryShape() is not implemented');
  }

  protected buildFilters(): object | null {
    return null; // === no filters
  }

  matchesFilter(item: T): boolean {
    const filters = this.buildFilters();
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
   * @param a
   * @param b
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
    return this.sortComparator(a, b);
  };

  /**
   * Increases the item's importance when sorting.
   * Boost affects position inside an item interval (if used), but should not redefine interval boundaries.
   * @param itemId
   * @param opts
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  generateIntervalId(page: (T | string)[]): string {
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

    // Visible ordering uses boost-aware comparator
    return items.sort(this.effectiveComparator.bind(this));
  }

  makeInterval({ page, isHead, isTail }: MakeIntervalParams<T>): Interval {
    const sorted = [...page].sort((a, b) => this.sortComparator(a, b));
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
    if (!this.usesItemIntervalStorage) return null;
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
    if (!this.usesItemIntervalStorage) return null;
    const bounds = this.getIntervalSortBounds(interval);
    if (!bounds) return null;
    return this.intervalItemIdsAreHeadFirst
      ? { head: bounds.start, tail: bounds.end }
      : { head: bounds.end, tail: bounds.start };
  }

  protected compareIntervalHeadEdges(a: T, b: T): number {
    const cmp = this.sortComparator(a, b);
    return this.intervalSortDirection === 'asc' ? cmp : -cmp;
  }

  protected aIsMoreHeadwardThanB(a: T, b: T): boolean {
    return this.intervalItemIdsAreHeadFirst
      ? this.sortComparator(a, b) === ComparisonResult.A_PRECEDES_B
      : this.sortComparator(b, a) === ComparisonResult.A_PRECEDES_B;
  }

  protected aIsMoreTailwardThanB(a: T, b: T): boolean {
    return this.intervalItemIdsAreHeadFirst
      ? this.sortComparator(b, a) === ComparisonResult.A_PRECEDES_B
      : this.sortComparator(a, b) === ComparisonResult.A_PRECEDES_B;
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
      this.sortComparator(aBounds.start, bBounds.end) <= 0 &&
      this.sortComparator(bBounds.start, aBounds.end) <= 0
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
      this.sortComparator(aBounds.start, bBounds.end) <= 0 &&
      this.sortComparator(bBounds.start, aBounds.end) <= 0
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
    if (this.sortComparator(start, item) <= 0 && this.sortComparator(item, end) <= 0)
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
          compare: this.sortComparator.bind(this),
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
      compare: this.sortComparator.bind(this),
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

  protected locateByItemInIntervals(item: T): ItemCoordinates['interval'] | undefined {
    const interval = this.locateIntervalForItem(item);
    if (!interval) return undefined;
    const itemLocation = this.locateByItemInInterval({ item, interval });
    if (!itemLocation) return undefined;
    return { interval, ...itemLocation };
  }

  /**
   * Locates the current position of the item and the index at which the item should be inserted
   * according to effectiveComparator.
   * @param item
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
    if (!this.usesItemIntervalStorage) return null;
    if (!page?.length) return null;

    const pageInterval = this.makeInterval({
      page,
      isHead,
      isTail,
    });

    for (const item of page) {
      this._itemIndex.setOne(item);
    }

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
        this._itemIntervals.delete(itv.id);
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
        this._itemIntervals.set(convertedInterval.id, convertedInterval);
      } else {
        this._itemIntervals.set(LOGICAL_HEAD_INTERVAL_ID, logicalHead);
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
        this._itemIntervals.set(convertedInterval.id, convertedInterval);
      } else {
        this._itemIntervals.set(LOGICAL_TAIL_INTERVAL_ID, logicalTail);
      }
    }

    this._itemIntervals.set(resultingInterval.id, resultingInterval);
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
   * Ingests a single item on live update.
   *
   * If intervals + itemIndex exist, tries to:
   *  - update the ItemIndex
   *  - find an anchored interval whose sort bounds contain the item
   *  - insert the item into that interval using locate+plateau logic
   *  - if this is the active interval, re-emit state.items from interval
   *
   * If no intervals or no itemIndex exist, falls back to the legacy list-based ingestion.
   */
  ingestItem(ingestedItem: T): boolean {
    if (!this.usesItemIntervalStorage) {
      const items = this.items ?? [];
      const id = this.getItemId(ingestedItem);
      const existingIndex = items.findIndex((i) => this.getItemId(i) === id);
      const hadItem = existingIndex > -1;

      const nextItems = items.slice();
      if (hadItem) nextItems.splice(existingIndex, 1);

      // If it no longer matches the filter, we only commit the removal (if any).
      if (!this.matchesFilter(ingestedItem)) {
        if (hadItem) this.state.partialNext({ items: nextItems });
        return hadItem;
      }

      // Determine insertion index against the list without the old snapshot.
      const insertionIndex =
        binarySearch({
          needle: ingestedItem,
          length: nextItems.length,
          getItemAt: (index: number) => nextItems[index],
          itemIdentityEquals: (item1, item2) =>
            this.getItemId(item1) === this.getItemId(item2),
          compare: this.effectiveComparator.bind(this),
          plateauScan: true,
        }).insertionIndex ?? -1;

      const keepOrderInState = this.config.lockItemOrder && hadItem;
      const insertAt = keepOrderInState ? existingIndex : insertionIndex;
      if (insertAt < 0) return false;

      nextItems.splice(insertAt, 0, ingestedItem);
      this.state.partialNext({ items: nextItems });
      return true;
    }

    const id = this.getItemId(ingestedItem);
    const previousItem = this._itemIndex.get(id);

    // 0. PRE-ANALYSIS: capture previous coordinates BEFORE any mutations
    const previousCoords = this.locateByItem(previousItem || ingestedItem);

    const originalIndexInState = previousCoords?.state?.currentIndex ?? -1;
    const keepOrderInState = this.config.lockItemOrder && originalIndexInState >= 0;

    // 1. Remove the old snapshot from state & intervals.
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
      return itemHasBeenRemoved;
    }

    // If we don't have itemIndex, manipulate only items array in paginator state and not intervals
    // as intervals do not store the whole items and have to rely on _itemIndex
    // if (!this.usesItemIntervalStorage) {
    //   const items = this.items ?? [];
    //   const newItems = items.slice();
    //
    //   // Recompute insertionIndex for the *new* snapshot against the updated list (original removed).
    //   const insertionIndex = this.locateItemInState(ingestedItem)?.insertionIndex ?? -1;
    //
    //   const insertAt = keepOrderInState ? originalIndexInState : insertionIndex;
    //
    //   if (insertAt < 0) return false; // corruption guard
    //
    //   newItems.splice(insertAt, 0, ingestedItem);
    //   this.state.partialNext({ items: newItems });
    //   return true;
    // }

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
          // Falls after the loaded tail → logical tail.
          targetInterval = liveTailLogical
            ? this.insertItemIdIntoInterval(liveTailLogical, ingestedItem)
            : {
                id: LOGICAL_TAIL_INTERVAL_ID,
                itemIds: [this.getItemId(ingestedItem)],
              };
        } else {
          // Falls somewhere *inside* the global bounds, but we don't have that page loaded.
          // We’ve already removed any old occurrence, so from the paginator's perspective
          // this item won't be visible again until the relevant page is fetched.
          return itemHasBeenRemoved;
        }
      }
    } else {
      // Found an anchored interval whose bounds contain the new snapshot.
      targetInterval = this.insertItemIdIntoInterval(targetInterval, ingestedItem);
    }

    const addedNewInterval = !this._itemIntervals.has(targetInterval.id);
    this._itemIntervals.set(targetInterval.id, targetInterval);

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
        this._itemIntervals.delete(interval.id);

        // If it was active -> clear active
        if (this.isActiveInterval(interval)) {
          this.setActiveInterval(undefined);
        }
      } else {
        this._itemIntervals.set(updatedInterval.interval.id, updatedInterval.interval);
      }
      result.interval = updatedInterval;
    }

    // 2) Remove from visible state.items, if present
    if (stateLocation && stateLocation.currentIndex > -1) {
      const newItems = [...(this.items ?? [])];
      newItems.splice(stateLocation.currentIndex, 1);
      this.state.partialNext({ items: newItems });

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
      return this.removeItemAtCoordinates(coords);
    }

    // Fallback for state-only mode (sequential scan in state.items)
    if (!this.usesItemIntervalStorage) {
      const index = this.items?.findIndex((i) => this.getItemId(i) === id) ?? -1;
      if (index === -1) return noAction;
      const newItems = [...(this.items ?? [])];
      newItems.splice(index, 1);
      this.state.partialNext({ items: newItems });
      return { state: { currentIndex: index, insertionIndex: -1 } };
    }

    return noAction;
  }

  /** Sets the items in the state. If intervals are kept, the active interval will be updated */
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

      if (this.usesItemIntervalStorage) {
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
      }

      return newState;
    });
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
    if (typeof this.items === 'undefined') return true;
    if (params.reset === 'yes') return true;
    if (params.reset === 'no') return false;

    return this.shouldResetStateBeforeQuery(this._lastQueryShape, params.queryShape);
  };

  protected getStateBeforeFirstQuery(): PaginatorState<T> {
    return {
      ...this.initialState,
      isLoading: true,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  isJumpQueryShape(queryShape: Q): boolean {
    return false;
  }

  protected getStateAfterQuery(
    stateUpdate: Partial<PaginatorState<T>>,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    isFirstPage: boolean,
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    params: PaginationQueryParams<Q>,
  ): Promise<T[] | undefined> | T[] | undefined => undefined;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  populateOfflineDbAfterQuery = (params: {
    items: T[] | undefined;
    queryShape: Q | undefined;
  }): Promise<T[] | undefined> | T[] | undefined => undefined;

  protected async runQueryRetryable(
    params: PaginationQueryParams<Q> = {},
  ): Promise<PaginationQueryReturnValue<T> | null> {
    const { retryCount } = params;
    try {
      return await this.query(params);
    } catch (e) {
      const isOfflineSupportEnabledWithItems =
        this.isOfflineSupportEnabled && (this.items ?? []).length > 0;
      if (!isOfflineSupportEnabledWithItems) {
        this.state.partialNext({ lastQueryError: e as Error });
      }

      const nextRetryCount = (retryCount ?? 0) - 1;
      if (nextRetryCount > 0) {
        await sleep(DEFAULT_QUERY_CHANNELS_MS_BETWEEN_RETRIES);
        return await this.runQueryRetryable({
          ...params,
          retryCount: nextRetryCount,
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
   * @param direction
   * @param forcedQueryShape
   * @param reset
   * @param retryCount
   * @param updateState
   */
  async executeQuery({
    direction,
    queryShape: forcedQueryShape,
    reset,
    retryCount = 0,
    updateState = true,
  }: PaginationQueryParams<Q> = {}): Promise<ExecuteQueryReturnValue<T> | void> {
    const queryShape = forcedQueryShape ?? this.getNextQueryShape({ direction });
    if (!this.canExecuteQuery({ direction, reset })) return;

    const isFirstPage = this.isFirstPageQuery({ queryShape, reset });
    if (isFirstPage) {
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
      this.state.next({ ...state, items });
    } else {
      this.state.partialNext({ isLoading: true });
    }

    this._nextQueryShape = queryShape;
    const results = await this.runQueryRetryable({
      direction,
      queryShape,
      reset,
      retryCount,
    });

    return await this.postQueryReconcile({
      direction,
      isFirstPage,
      queryShape,
      requestedPageSize: this.pageSize,
      results,
      updateState,
    });
  }

  async postQueryReconcile({
    direction,
    isFirstPage,
    queryShape,
    requestedPageSize,
    results,
    updateState = true,
  }: PostQueryReconcileParams<T, Q>): Promise<ExecuteQueryReturnValue<T>> {
    this._lastQueryShape = queryShape;
    this._nextQueryShape = undefined;

    const stateUpdate: Partial<PaginatorState<T>> = {
      isLoading: false,
    };

    if (!results) {
      this.state.partialNext(stateUpdate);
      return { stateCandidate: stateUpdate, targetInterval: null };
    }

    const { items, headward, tailward } = results;

    stateUpdate.lastQueryError = undefined;
    const filteredItems = await this.filterQueryResults(items);
    stateUpdate.items = filteredItems;

    // State-only mode: merge pages into a single list.
    if (!this.usesItemIntervalStorage) {
      const currentItems = this.items ?? [];
      if (!isFirstPage) {
        // In state-only mode we treat pagination as a growing list.
        // Both directions extend the same list (cursor semantics are expressed by the cursor, not by list "side").
        stateUpdate.items = [...currentItems, ...filteredItems];
      }
    }

    const isJumpQuery = !!queryShape && this.isJumpQueryShape(queryShape);
    const interval = this.usesItemIntervalStorage
      ? this.ingestPage({
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
        })
      : null;
    if (interval && updateState) {
      this.setActiveInterval(interval, { updateState: false });
      stateUpdate.items = this.intervalToItems(interval);
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
        stateUpdate.cursor = { tailward: tailward || null, headward: headward || null };
        stateUpdate.hasMoreTail = !!tailward;
        stateUpdate.hasMoreHead = !!headward;
      }
    } else {
      // todo: we could keep the offset in two directions (initial tailward offset would be taken from config.initialOffset)
      stateUpdate.offset = (this.offset ?? 0) + items.length;
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

      interval.hasMoreHead = resolvedHasMoreHead;
      interval.hasMoreTail = resolvedHasMoreTail;
      interval.isHead = resolvedHasMoreHead === false;
      interval.isTail = resolvedHasMoreTail === false;
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
  }

  toTail = (params: Omit<PaginationQueryParams<Q>, 'direction' | 'queryShape'> = {}) =>
    this.executeQuery({ direction: 'tailward', ...params });

  toHead = (params: Omit<PaginationQueryParams<Q>, 'direction' | 'queryShape'> = {}) =>
    this.executeQuery({ direction: 'headward', ...params });

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

  reload = async () => {
    await this.toTail({ reset: 'yes' });
  };
}
