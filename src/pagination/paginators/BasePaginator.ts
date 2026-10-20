import type { ItemLocation } from '../sortCompiler';
import { deepFreezeConfig } from '../../configuration/utils/deepFreezeConfig';
import { binarySearch } from '../sortCompiler';
import { itemMatchesFilter } from '../filterCompiler';
import { isPatch, StateStore, type ValueOrPatch } from '@stream-io/state-store';
import { debounce, type DebouncedFunc, generateUUIDv4, sleep } from '../../utils';
import { throttle, type Throttled } from '../../utils/throttling/throttle';
import { isStateThrottlingEnabled } from './stateThrottling';
import type { FieldToDataResolver } from '../types.normalization';
import { ComparisonResult } from '../types.normalization';
import type { ItemIndexApi } from '../ItemIndex';
import { StoreBackedItemIndex } from '../../entityStore/StoreBackedItemIndex';
import { isEqual } from '../../utils/mergeWith/mergeWithCore';
import { ConfigController } from '../../configuration/ConfigController';
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
  /** Reaches the dataset head (cursor: `headward === null`, offset: `offset === 0`). */
  isHead: boolean;
  /** Reaches the dataset tail (cursor: `tailward === null`, offset: a short page). */
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
  /** The page is the head interval: items beyond its head bound merge into it. */
  isFirstPage?: boolean;
  /** The page is the tail interval: items beyond its tail bound merge into it. */
  isLastPage?: boolean;
};

type MergeIntervalsResult = {
  logicalHead: LogicalInterval | null;
  merged: Interval | null;
  logicalTail: LogicalInterval | null;
};

/**
 * `headward` moves toward page 0, `tailward` away from it. New items are added at the head,
 * retrieved pages are appended at the tail.
 */
export type PaginationDirection = 'headward' | 'tailward';

export type CursorDeriveContext<T, Q> = {
  /** Current cursor, merged with the derived one to keep the direction not paginated. */
  cursor: PaginatorCursor | undefined;
  /** Direction just paginated in. Undefined for non-directional queries (jump-to, `*_around`). */
  direction: PaginationDirection | undefined;
  hasMoreTail: boolean;
  hasMoreHead: boolean;
  interval: Interval;
  /** The page received, after filtering. */
  page: T[];
  queryShape: Q | undefined;
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
   * Keeps loaded items (and cursor/flags) visible during a first-page query instead of resetting;
   * `postQueryReconcile` merges the fetched page into the active interval.
   */
  keepPreviousItems?: boolean;
  /** Data that define the query (filters, sort, ...) */
  queryShape?: Q;
  /** Per-call override: 'yes' forces a first page, 'no' continues, else the query shape decides. */
  reset?: StateResetPolicy;
  /**
   * Request options outside the query shape, so they never make the query a new first page. Each
   * paginator reads the ones it documents. Resent on retries.
   */
  requestOptions?: Record<string, unknown>;
  /** Number of retries after a failure. Overrides `PaginatorOptions.retryCount`. */
  retryCount?: number;
  /** Suppresses `isLoading` transitions for this query (background refresh). */
  silent?: boolean;
  /** Whether the loaded page is committed to the paginator state. Default: true. */
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
  /** State from post-query processing, committed when `updateState` is true. */
  stateCandidate: Partial<PaginatorState<T>>;
  /** The interval the page was merged into, when items are kept in intervals. */
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
 * Projections of fixed-identity intervals, published independently of `state` (which tracks only
 * the active interval; see {@link BasePaginator.intervalViews}). A field is rewritten only when its
 * own interval changes. The head-most window (logical or anchored) is a role, not a fixed interval,
 * so read it via {@link BasePaginator.headItems} / {@link BasePaginator.headmostItem}.
 */
export type PaginatorIntervalViews<T> = {
  /** Out-of-order items above the loaded window. */
  logicalHead: T[];
  /** Out-of-order items below the loaded window. */
  logicalTail: T[];
  /** The loaded page bounded at the dataset head (`isHead`); empty when the head is not loaded. */
  anchoredHead: T[];
};

// todo: think whether plugins are necessary. Maybe we could just document how to add

export type PaginatorItemsChangeProcessor<T> = (params: {
  nextItems: T[] | undefined;
  previousItems: T[] | undefined;
}) => T[] | undefined;

export interface PaginatorPlugin<T> {
  /**
   * Runs before `items` are emitted, only when the array changed by reference. Return a new array
   * to replace `nextState.items`, or `undefined` to keep it. Runs in registration order.
   */
  onBeforeItemsEmitted?: PaginatorItemsChangeProcessor<T>;

  // future hooks (examples)
  // onQueryStart?(ctx: { params: PaginationQueryParams<Q>; paginator: BasePaginator<T, Q> }): void | Promise<void>;
  // onQuerySuccess?(ctx: { state: PaginatorState<T>; results: PaginationQueryReturnValue<T>; paginator: BasePaginator<T, Q> }): void | Promise<void>;
  // onQueryError?(ctx: { error: unknown; paginator: BasePaginator<T, Q> }): void | Promise<void>;
}

/** Plugins hook into the paginator lifecycle and run in array order. */
// plugins?: PaginatorPlugin<T, Q>[];

/**
 * The value-level subset of paginator options that `client.config` can supply declaratively.
 * Structural inputs (`itemIndex`, `createItemIndex`) and subclass overrides (`doRequest`,
 * `itemOrderComparator`, `deriveCursor`) are excluded. Declared standalone to avoid a circular type
 * with `PaginatorOptions`.
 */
export type DeclarativePaginatorConfig = {
  debounceMs?: number;
  hasPaginationQueryShapeChanged?: PaginationQueryShapeChangeIdentifier<any>;
  initialCursor?: PaginatorCursor;
  initialOffset?: number;
  lockItemOrder?: boolean;
  maxLoadedItems?: number;
  pageSize?: number;
  retryCount?: number;
  stateThrottleMs?: number;
  throwErrors?: boolean;
};

export type PaginatorOptions<T, Q> = {
  /**
   * Declarative values from `client.config`, kept apart so a reset (`initializeConfig` with a fresh
   * slice) drops them but keeps injected options. Not part of {@link BasePaginatorConfig}.
   */
  declarativeConfig?: DeclarativePaginatorConfig;
  /** Debounce of the search query in milliseconds. Default: 300. */
  debounceMs?: number;
  /**
   * Coalesces the paginator's own live `state.items` publishes to one per `stateThrottleMs`
   * (leading and trailing edge). Pagination, jump and query publishes stay immediate. Disabled
   * under test runners. Unset: no throttle (`MessagePaginator` defaults to 500).
   */
  stateThrottleMs?: number;
  /**
   * Decides whether the next query is a first-page query. It should be when filters, sort or
   * options (the query params except page size) changed.
   */
  hasPaginationQueryShapeChanged?: PaginationQueryShapeChangeIdentifier<any>;
  /**
   * Derives the cursor and `hasMore` flags from the ingested interval. Without it, the cursor comes
   * from the query response (`headward`/`tailward`, falsy meaning exhausted).
   */
  deriveCursor?: CursorDerivator<T, Q>;
  /** Fetches a page of items; returns a cursor when paginating by cursor. */
  doRequest?: (queryParams: Q) => Promise<{ items: T[]; cursor?: PaginatorCursor }>;
  initialCursor?: PaginatorCursor;
  initialOffset?: number;
  /** Shared item index: a single source of data for all consumers. */
  itemIndex?: ItemIndexApi<T>;
  /**
   * Builds the item index with the fully-constructed paginator as `owner`, for adapters that need
   * the owner (e.g. a client-global store). Ignored when `itemIndex` is supplied.
   */
  createItemIndex?: (owner: BasePaginator<T, Q>) => ItemIndexApi<T>;
  /** Orders items in memory for interval math and the visible list. Default: `sortComparator`. */
  itemOrderComparator?: (a: T, b: T) => number;
  /**
   * An already visible item keeps its relative position in the current items array when updated.
   * Does not hold across interval changes or page jumps.
   */
  lockItemOrder?: boolean;
  /**
   * Caps the loaded items: when the head window exceeds it, the oldest are released as new ones
   * arrive and the tailward edge re-opens, so scrolling back re-fetches. Unset: unbounded. Values
   * below `pageSize` are clamped up to it. See {@link BasePaginator.pruneTailToLimit}.
   */
  maxLoadedItems?: number;
  /** Items requested per page. Default: 10. */
  pageSize?: number;
  /**
   * Retries after a failed request (`retryCount + 1` attempts),
   * `DEFAULT_QUERY_CHANNELS_MS_BETWEEN_RETRIES` apart. Default: 0.
   * `PaginationQueryParams.retryCount` overrides it per call.
   */
  retryCount?: number;
  /** Rethrows errors from pagination execution instead of swallowing them. Default: false. */
  throwErrors?: boolean;
};

type OptionalPaginatorConfigFields =
  | 'stateThrottleMs'
  | 'maxLoadedItems'
  | 'deriveCursor'
  | 'doRequest'
  | 'initialCursor'
  | 'initialOffset'
  | 'itemOrderComparator'
  | 'throwErrors';

/**
 * Options minus the construction-only inputs: the constructor resolves `itemIndex` and
 * `createItemIndex` once into {@link BasePaginator._itemIndex}, so they are not config.
 */
type ResolvedPaginatorOptions<T, Q> = Omit<
  PaginatorOptions<T, Q>,
  'createItemIndex' | 'declarativeConfig' | 'itemIndex'
>;

export type BasePaginatorConfig<T, Q> = Pick<
  ResolvedPaginatorOptions<T, Q>,
  OptionalPaginatorConfigFields
> &
  Required<Omit<ResolvedPaginatorOptions<T, Q>, OptionalPaginatorConfigFields>>;

const baseHasPaginationQueryShapeChanged: PaginationQueryShapeChangeIdentifier<
  unknown
> = (prevQueryShape, nextQueryShape) => !isEqual(prevQueryShape, nextQueryShape);

export const DEFAULT_PAGINATION_OPTIONS: BasePaginatorConfig<any, any> = deepFreezeConfig(
  {
    debounceMs: 300,
    lockItemOrder: false,
    pageSize: 10,
    hasPaginationQueryShapeChanged: baseHasPaginationQueryShapeChanged,
    retryCount: 0,
    throwErrors: false,
  } as const,
);

export abstract class BasePaginator<T, Q> {
  state: StateStore<PaginatorState<T>>;
  /**
   * Projections of specific intervals ({@link PaginatorIntervalViews}). Unlike `state`, a field is
   * rewritten whenever its own interval changes, active or not.
   */
  intervalViews: StateStore<PaginatorIntervalViews<T>>;

  private readonly configController: ConfigController<BasePaginatorConfig<T, Q>>;
  get configState(): StateStore<BasePaginatorConfig<T, Q>> {
    return this.configController.state;
  }

  /** Constructor options minus the declarative slice, for `initializeConfig` to rebuild from. */
  private readonly explicitOptions: Omit<
    PaginatorOptions<T, Q>,
    'createItemIndex' | 'declarativeConfig' | 'itemIndex'
  >;

  /** Throttle for the active-window `state.items` publish. Set only with `stateThrottleMs`. */
  private _windowPublishThrottle?: Throttled<[]>;

  /**
   * Throttle for interval-view publishes. Independent of {@link _windowPublishThrottle} so a view
   * refresh lands on its own trailing edge even when `state.items` is quiet. Created with it.
   */
  private _viewPublishThrottle?: Throttled<[]>;

  /** Changed ids buffered since the last {@link flushIntervalViewPublish} (throttled only). */
  private _pendingViewChangedIds = new Set<string>();

  /**
   * Depth of active {@link batch} `coalesce` scopes. While > 0, `ingestItem`/`removeItem` mark the
   * window dirty ({@link _suspendedWindowDirty}) instead of publishing.
   */
  private _windowPublishSuspendDepth = 0;
  /**
   * The interval a prune just shortened. Its `hasMoreTail` and `cursor` ride on the next
   * `state.items` publish, which can be a throttle interval late, so
   * {@link consumePendingPrunePaginationState} rereads them from the interval by id when it fires.
   */
  private _prunedIntervalId?: string;
  /** Set when a suspended op changed the active window, so {@link batch} publishes on exit. */
  private _suspendedWindowDirty = false;

  /** Disconnected ranges of items, e.g. after jumping to non-sequential pages. */
  protected _itemIntervals: Map<string, AnyInterval> = new Map();
  protected _activeIntervalId: string | undefined;

  /** Canonical, ID-addressable item storage: the single source of truth outside the paginator. */
  protected _itemIndex: ItemIndexApi<T>;

  protected _executeQueryDebounced!: DebouncedExecQueryFunction<Q>;
  /** Last effective query shape produced by the subclass for the most recent request. */
  protected _lastQueryShape?: Q;
  protected _nextQueryShape?: Q;

  /**
   * Stable, purely data-driven comparison (age, last_message_at, ...). Orders intervals and is the
   * fallback when `boostComparator` is inconclusive. Intervals are never ordered by the boost
   * comparator, since boosting a boundary item would boost its whole interval.
   */
  sortComparator: (a: T, b: T) => number;
  protected _filterFieldToDataResolvers: FieldToDataResolver<T>[];

  protected boosts = new Map<string, { until: number; seq: number }>();
  protected _maxBoostSeq = 0;

  /**
   * Whether `itemIds[0]` (true, default) or the last id (false) is the pagination head edge.
   * `itemIds` stay in `sortComparator` order either way.
   */
  protected get intervalItemIdsAreHeadFirst(): boolean {
    return true;
  }

  /**
   * Order of intervals relative to each other, comparing head edges under `sortComparator`.
   * Independent of the `itemIds` order and of `intervalItemIdsAreHeadFirst`.
   */
  protected get intervalSortDirection(): 'asc' | 'desc' {
    return 'asc';
  }

  /**
   * @param options - What the integrator passed. Outranks the declarative `client.config` tree.
   * @param builtInDefaults - What the SDK supplies on the instance's behalf (a subclass's or an
   *   owner's defaults). A `client.config.set()` overrides these.
   */
  protected constructor(
    {
      declarativeConfig,
      initialCursor,
      initialOffset,
      itemIndex,
      createItemIndex,
      ...options
    }: PaginatorOptions<T, Q> = {},
    builtInDefaults: Partial<BasePaginatorConfig<T, Q>> = {},
  ) {
    this.explicitOptions = { initialCursor, initialOffset, ...options };
    this.configController = new ConfigController<BasePaginatorConfig<T, Q>>({
      defaults: DEFAULT_PAGINATION_OPTIONS as BasePaginatorConfig<T, Q>,
      builtInDefaults,
      constructorOptions: this.explicitOptions as Partial<BasePaginatorConfig<T, Q>>,
      initialSlice: declarativeConfig as Partial<BasePaginatorConfig<T, Q>> | undefined,
      getBehaviourOverrides: () => this.getBehaviourOverrides(),
      // Both values are captured in closures, so a change must rebuild them.
      onChanged: (next, previous) => {
        if (next.debounceMs !== previous.debounceMs) {
          this.setDebounceOptions({ debounceMs: next.debounceMs });
        }
        if (next.stateThrottleMs !== previous.stateThrottleMs) {
          this.rebuildStatePublishThrottles(next.stateThrottleMs);
        }
      },
    });
    const { debounceMs } = this.config;
    this.state = new StateStore<PaginatorState<T>>({
      ...this.initialState,
      // Seeded from the resolved config (subclass defaults, declarative values), not the raw
      // argument.
      cursor: this.config.initialCursor,
      offset: this.config.initialOffset ?? 0,
    });
    // Called directly: `onChanged` fires on changes, not on the initial build.
    this.rebuildStatePublishThrottles(this.config.stateThrottleMs);
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
      new StoreBackedItemIndex({
        getEntityId: this.getItemId.bind(this),
        holderName: 'base-paginator',
      });
  }

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

  /** True once a query has run. */
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
   * The newest loaded window, independent of the active interval: the head-most loaded interval
   * under the paginator's ordering. It does not require `isHead` (seeds do not reliably set it), so
   * after a jump to an older window with the latest not loaded, that older window is returned.
   */
  get headItems(): T[] {
    const head = this.getHeadIntervalFromSortedIntervals(this.itemIntervals);
    return head ? this.intervalToItems(head) : [];
  }

  /** The item on the head edge of the `headItems` interval; `undefined` when nothing is loaded. */
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

  get config(): Readonly<BasePaginatorConfig<T, Q>> {
    return this.configState.getLatestValue();
  }

  updateConfig(config: Partial<BasePaginatorConfig<T, Q>>) {
    this.configController.patch(config);
  }

  get pageSize() {
    return this.config.pageSize;
  }

  set pageSize(size: number) {
    this.updateConfig({ pageSize: size });
  }

  set initialCursor(cursor: PaginatorCursor) {
    this.updateConfig({ initialCursor: cursor });
  }

  set initialOffset(offset: number) {
    this.updateConfig({ initialOffset: offset });
  }

  /** The boost-aware comparator to use for ordering items. */
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
      if (!aEdges) return 1;
      if (!bEdges) return -1;
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

  /** `intervalViews.logicalHead`: items ingested out of pagination order. */
  get logicalHeadItems(): T[] {
    return this.intervalViews.getLatestValue().logicalHead;
  }

  /** `intervalViews.logicalTail`: out-of-order items below the loaded window. */
  get logicalTailItems(): T[] {
    return this.intervalViews.getLatestValue().logicalTail;
  }

  /** `intervalViews.anchoredHead`: the page bounded at the dataset head. */
  get anchoredHeadItems(): T[] {
    return this.intervalViews.getLatestValue().anchoredHead;
  }

  /**
   * Commits an interval to storage and republishes its {@link intervalViews} field when tracked.
   * Use it instead of writing `_itemIntervals` (bulk re-sorting goes through {@link setIntervals}).
   */
  protected commitInterval(interval: AnyInterval) {
    this._itemIntervals.set(interval.id, interval);
    this.publishIntervalViewFor(interval);
  }

  /** Drops an interval from storage, republishing its {@link intervalViews} field if tracked. */
  protected dropInterval(id: string) {
    const removed = this._itemIntervals.get(id);
    this._itemIntervals.delete(id);
    if (removed) this.publishIntervalViewFor(removed, { removed: true });
  }

  /**
   * Republishes the {@link intervalViews} field backed by the interval (untracked ones change
   * nothing). {@link postQueryReconcile} also publishes the anchored head when `isHead` flips.
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
      // On removal the head page is gone (no other interval is `isHead`): clear it.
      this.publishAsAnchoredHead(removed ? undefined : interval);
    }
  }

  /** Publishes `interval` as the anchored head, or `undefined` to clear it. */
  protected publishAsAnchoredHead(interval: AnyInterval | undefined) {
    this.intervalViews.partialNext({ anchoredHead: this.intervalItemsOrEmpty(interval) });
  }

  /**
   * Keeps `anchoredHead` in sync after `isHead` was recomputed in query reconciliation (`wasHead`
   * is the previous value): publishes the page on becoming the head, clears it on losing that.
   */
  protected syncAnchoredHeadAfterHeadFlip(interval: Interval, wasHead: boolean) {
    if (interval.isHead === wasHead) return;
    this.publishAsAnchoredHead(interval.isHead ? interval : undefined);
  }

  private intervalItemsOrEmpty(interval: AnyInterval | undefined): T[] {
    return interval ? this.intervalToItems(interval) : [];
  }

  /**
   * Drops every loaded interval and item without publishing `state`, so the next ingest starts from
   * empty storage while `state.items` keeps showing the previous window until the caller publishes.
   */
  protected clearItemStorage() {
    this.setIntervals([]);
    this.setActiveInterval(undefined);
    this._itemIndex.clear();
    this.clearIntervalViews();
  }

  /** Empties every {@link intervalViews} field, bypassing `commitInterval`/`dropInterval`. */
  protected clearIntervalViews() {
    this._pendingViewChangedIds.clear();
    const { logicalHead, logicalTail, anchoredHead } =
      this.intervalViews.getLatestValue();
    // Skip when all views are already empty: fresh `[]` refs would wake selectors for nothing.
    const alreadyEmpty =
      logicalHead.length === 0 && logicalTail.length === 0 && anchoredHead.length === 0;
    if (alreadyEmpty) return;
    this.intervalViews.partialNext({
      logicalHead: [],
      logicalTail: [],
      anchoredHead: [],
    });
  }

  abstract query(
    params: PaginationQueryParams<Q>,
  ): Promise<PaginationQueryReturnValue<T>>;

  abstract filterQueryResults(items: T[]): T[];

  /** Subclasses must override it and return the query shape. */
  protected getNextQueryShape(
    _params: Pick<PaginationQueryParams<Q>, 'direction'> & { pageSize?: number } = {},
  ): Q {
    throw new Error('Paginator.getNextQueryShape() is not implemented');
  }

  /**
   * Filters that `matchesFilter` applies locally, not the ones sent to the server (see
   * `ChannelPaginator.buildQueryFilters`). `null`: no filters.
   */
  protected buildMatchFilters(): object | null {
    return null;
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

  getItemId(item: T): string {
    return (item as { id: string }).id;
  }

  getItem(id: string | undefined): T | undefined {
    return typeof id === 'string' ? this._itemIndex?.get(id) : undefined;
  }

  /**
   * Whether live `state.items` publishes are throttled: `stateThrottleMs` is set, throttling is not
   * disabled (tests) and item order is not locked (its emit is not a re-projection).
   */
  protected get isStateThrottled(): boolean {
    return (
      isStateThrottlingEnabled() &&
      !!this._windowPublishThrottle &&
      !this.config.lockItemOrder
    );
  }

  protected get isWindowPublishSuspended(): boolean {
    return this._windowPublishSuspendDepth > 0;
  }

  /** Re-projects the active window from its live interval; `undefined` when none is active. */
  private projectActiveWindow(): T[] | undefined {
    if (!this._activeIntervalId) return undefined;
    const active = this._itemIntervals.get(this._activeIntervalId);
    return active ? this.intervalToItems(active) : undefined;
  }

  /**
   * Publishes the active window to `state`, re-projected from the active interval at call time.
   * Clears the visible window when the active interval is gone.
   */
  private flushWindowPublish(): void {
    const items = this.projectActiveWindow();
    if (items) {
      this.state.partialNext({ items, ...this.consumePendingPrunePaginationState() });
      return;
    }
    if ((this.state.getLatestValue().items?.length ?? 0) > 0) {
      this.state.partialNext({ items: [], ...this.consumePendingPrunePaginationState() });
    }
  }

  /**
   * Schedules a throttled (leading and trailing) active-window publish. Live mutations call it
   * instead of publishing inline when {@link isStateThrottled}. Repeated calls coalesce.
   */
  protected scheduleWindowPublish(): void {
    this._windowPublishThrottle?.throttledFn();
  }

  /**
   * Runs `fn` with window publishes suspended and emits once on exit (a replace is
   * remove-then-insert, which would emit twice). Only the outermost scope emits. `exit: 'auto'`
   * rides the throttle when there is one, `'sync'` always flushes ({@link batch}). Skipped for
   * `lockItemOrder` lists, whose emit republishes the last array and must not be re-derived from
   * the interval.
   */
  protected withSingleWindowPublish(
    fn: () => void,
    { exit = 'auto' }: { exit?: 'auto' | 'sync' } = {},
  ): void {
    if (this.config.lockItemOrder) {
      fn();
      return;
    }
    const isOutermost = this._windowPublishSuspendDepth === 0;
    this._windowPublishSuspendDepth += 1;
    try {
      fn();
    } finally {
      this._windowPublishSuspendDepth -= 1;
    }
    if (!isOutermost || !this._suspendedWindowDirty) return;
    this._suspendedWindowDirty = false;
    if (exit === 'auto' && this.isStateThrottled) this.scheduleWindowPublish();
    else this.flushWindowPublish();
  }

  /** Immediately flushes the pending throttled window and interval-view publishes. */
  protected flushPendingPublishes(): void {
    this._windowPublishThrottle?.flush();
    this._viewPublishThrottle?.flush();
  }

  /**
   * Whether pruning is on hold, e.g. a UI that wants it only near the tail edge. False: the
   * configured cap always applies.
   */
  protected get isPruningSuspended(): boolean {
    return false;
  }

  /**
   * Whether the server knows `item`, so its id is safe as a cursor. Prunes drop and anchor on such
   * items only. Subclasses holding locally-created items (an unsent message) narrow it.
   */
  protected isPaginationAnchorable(item: T | undefined): boolean {
    return !!item;
  }

  /**
   * The window cap, or `undefined` when unbounded. Clamped up to `pageSize`: a smaller cap would
   * prune each tailward page as it lands and `onEndReached` would refetch it in a loop.
   */
  protected get effectiveMaxLoadedItems(): number | undefined {
    const { maxLoadedItems, pageSize } = this.config;
    if (typeof maxLoadedItems !== 'number' || maxLoadedItems <= 0) return undefined;
    return Math.max(maxLoadedItems, pageSize);
  }

  /**
   * Drops the oldest items from `interval` until at most `maxLoadedItems` remain, releasing them
   * from the item index. Returns whether anything was pruned.
   *
   * Runs from `ingestItem` on the uncommitted interval copy, so the following `commitInterval` and
   * publish carry it (see {@link _prunedIntervalId}). No-op unless a cap is set, pruning is not
   * suspended ({@link isPruningSuspended}) and the interval is the anchored, active head interval
   * and over the cap. Assumes cursor pagination (`removeItem` is bypassed, so
   * {@link shrinkOffsetAfterRemoval} never runs). Items the server does not know
   * ({@link isPaginationAnchorable}) are skipped, so the window may sit a few items above the cap.
   */
  protected pruneTailToLimit(interval: AnyInterval): boolean {
    const limit = this.effectiveMaxLoadedItems;
    if (typeof limit === 'undefined' || this.isPruningSuspended) return false;

    // Also narrows the type: `LogicalInterval` has no `isHead`/`isTail`/`hasMore*`.
    if (isLogicalInterval(interval)) return false;

    if (
      !interval.isHead ||
      this._activeIntervalId !== interval.id ||
      interval.itemIds.length <= limit
    )
      return false;

    const ids = interval.itemIds;
    // The tail (oldest) edge is index 0 unless the interval stores ids head-first.
    const tailEdgeIsFirst = !this.intervalItemIdsAreHeadFirst;
    const step = tailEdgeIsFirst ? 1 : -1;
    const dropped = new Set<string>();

    let remaining = ids.length - limit;
    for (
      let i = tailEdgeIsFirst ? 0 : ids.length - 1;
      remaining > 0 && i >= 0 && i < ids.length;
      i += step
    ) {
      const id = ids[i];
      const item = this._itemIndex.get(id);
      if (item && !this.isPaginationAnchorable(item)) continue;
      dropped.add(id);
      remaining -= 1;
    }

    if (!dropped.size) return false;

    // Rebuild rather than splice: skipped local items leave the dropped ids non-contiguous.
    interval.itemIds = ids.filter((id) => !dropped.has(id));

    // One transaction so sibling holders re-project once. `remove` releases only this paginator's
    // reference: content still held elsewhere (e.g. an open thread) survives.
    this._itemIndex.batch(() => {
      for (const id of dropped) this._itemIndex.remove(id);
    });

    // Older items exist on the server again: re-open the tail edge, even if the window had reached
    // it (a stale `isTail` would also mislead interval merging).
    interval.isTail = false;
    interval.hasMoreTail = true;

    // Only the id is recorded: the `state` fields are derived at publish time.
    this._prunedIntervalId = interval.id;

    return true;
  }

  /**
   * The edge-most id at `edge` that the server knows, so it is usable as a cursor. Not simply
   * `itemIds[0]`: a prune skips locally-created items, so the outermost id may be client-generated.
   */
  private getPaginationEdgeId(interval: Interval, edge: 'head' | 'tail'): string | null {
    const ids = interval.itemIds;
    const fromFirst =
      edge === 'tail'
        ? !this.intervalItemIdsAreHeadFirst
        : this.intervalItemIdsAreHeadFirst;
    const step = fromFirst ? 1 : -1;
    for (let i = fromFirst ? 0 : ids.length - 1; i >= 0 && i < ids.length; i += step) {
      const id = ids[i];
      if (this.isPaginationAnchorable(this._itemIndex.get(id))) return id;
    }
    return null;
  }

  /** Keeps the `items` that are members of `interval`, in order. */
  private retainIntervalMembers(items: T[], interval: AnyInterval): T[] {
    const members = new Set(interval.itemIds);
    return items.filter((item) => members.has(this.getItemId(item)));
  }

  /**
   * Returns the `state` pagination fields a prune moved, derived from the committed active interval
   * at call time, and clears the pending prune. Publishes of the active window spread it in. Only
   * changed fields are returned, so an unchanged `cursor` keeps its identity. Left alone: another
   * window than the pruned one, `cursor.headward` (a `deriveCursor` verdict survives), and a null
   * tail edge (every item is locally created: `null` would read as exhausted, so the cursor stays).
   */
  private consumePendingPrunePaginationState(): Partial<PaginatorState<T>> {
    const prunedIntervalId = this._prunedIntervalId;
    if (!prunedIntervalId) return {};
    this._prunedIntervalId = undefined;

    if (this._activeIntervalId !== prunedIntervalId) return {};

    const active = this._itemIntervals.get(prunedIntervalId);
    if (!active || isLogicalInterval(active)) return {};

    const current = this.state.getLatestValue();
    const next: Partial<PaginatorState<T>> = {};

    // Read from the interval, not the prune's `true`: this publish can be a throttle interval late
    // and a `toTail()` in between may have loaded the rest of the history.
    if (current.hasMoreTail !== active.hasMoreTail) next.hasMoreTail = active.hasMoreTail;

    if (this.isCursorPagination) {
      const tailward = this.getPaginationEdgeId(active, 'tail');
      if (tailward !== null && current.cursor?.tailward !== tailward) {
        next.cursor = { headward: current.cursor?.headward, tailward };
      }
    }

    return next;
  }

  /** {@link _viewPublishThrottle} boundary: applies the buffered interval-view changes. */
  private flushIntervalViewPublish(): void {
    if (!this._pendingViewChangedIds.size) return;
    this.refreshIntervalViewsForChangedIds(this._pendingViewChangedIds);
    this._pendingViewChangedIds.clear();
  }

  /**
   * Refreshes the tracked {@link intervalViews} fields holding one of `changedIds`. A sibling
   * holder writing through the shared item store swaps the item objects the views reference, and
   * only this paginator's own ingest/remove republishes them. Immediate unless throttled, then from
   * {@link flushIntervalViewPublish}.
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
   * Reconciles the window and interval views after another holder swapped the shared item objects
   * they reference: refreshes views holding a changed id and re-projects (or slot-swaps) the active
   * window, coalesced through the publish throttles when throttling is on.
   */
  protected reconcileChangedIds(changedIds: ReadonlySet<string>): void {
    // Views refresh independently of the active window (they can hold ids it does not). Throttled:
    // buffer the ids so refreshes coalesce.
    if (this.isStateThrottled) {
      for (const id of changedIds) this._pendingViewChangedIds.add(id);
      this._viewPublishThrottle?.throttledFn();
    } else {
      this.refreshIntervalViewsForChangedIds(changedIds);
    }

    if (!this._activeIntervalId) return;
    const activeInterval = this._itemIntervals.get(this._activeIntervalId);
    if (!activeInterval) return;

    // Throttled: `this.items` lags the intervals, so no slot swap. Schedule a re-projection, but
    // only if something changed (a sibling may have written the object the window already shows).
    if (this.isStateThrottled) {
      const currentItems = this.items;
      if (!currentItems || currentItems.length !== activeInterval.itemIds.length) {
        // Positions only line up when the lengths match: gate on membership alone.
        if (this.intervalHoldsAnyChangedId(activeInterval, changedIds)) {
          this.scheduleWindowPublish();
        }
        return;
      }
      for (let i = 0; i < currentItems.length; i++) {
        const id = this.getItemId(currentItems[i]);
        if (!changedIds.has(id)) continue;
        const updated = this._itemIndex.get(id);
        if (!updated || updated !== currentItems[i]) {
          this.scheduleWindowPublish();
          return;
        }
      }
      return;
    }

    // Fast path: an in-place update keeps membership and order, so when the window lines up with
    // the interval, swap only the changed slots (unchanged item references survive). Skipped when a
    // boost is active: it can reorder the window, which the full projection below applies.
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
          // The id left the store (a removal): resync via a full projection.
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

    // Fallback (membership or order drifted, no window to patch, or a boost is active): re-project
    // only if a changed id is in the active interval.
    if (this.intervalHoldsAnyChangedId(activeInterval, changedIds)) {
      this.state.partialNext({ items: this.intervalToItems(activeInterval) });
    }
  }

  protected clearExpiredBoosts(now = Date.now()) {
    for (const [id, b] of this.boosts) if (now > b.until) this.boosts.delete(id);
    this._maxBoostSeq = Math.max(
      ...Array.from(this.boosts.values()).map((boost) => boost.seq),
      0,
    );
  }

  /** Boosted items first (higher `seq` first), then `itemOrderComparator`. */
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
   * Raises the item's priority in `effectiveComparator`. Affects position inside an interval, not
   * interval boundaries. `opts.ttlMs` or `opts.until` set the expiry (default: 15s from now),
   * `opts.seq` orders concurrent boosts.
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

  generateIntervalId(_page: (T | string)[]): string {
    return `interval-${generateUUIDv4()}`;
  }

  intervalToItems(interval: Interval | LogicalInterval): T[] {
    const items = interval.itemIds
      .map((id) => this._itemIndex?.get(id))
      .filter((item): item is T => !!item);

    // A locked order ignores boosts.
    if (this.config.lockItemOrder) {
      return items;
    }

    // `itemIds` are already in item order: only an active boost can reorder, so skip the re-sort
    // otherwise.
    this.clearExpiredBoosts();
    if (this.boosts.size === 0) {
      return items;
    }

    return items.sort(this.effectiveComparator.bind(this));
  }

  makeInterval({ page, isHead, isTail }: MakeIntervalParams<T>): Interval {
    const sorted = [...page].sort((a, b) => this.itemOrderComparator(a, b));
    return {
      id: this.generateIntervalId(page),
      // A known global head/tail has no more data that way, otherwise assume more until a query
      // proves not.
      hasMoreHead: isHead ? false : true,
      hasMoreTail: isTail ? false : true,
      itemIds: sorted.map(this.getItemId.bind(this)),
      isHead: !!isHead,
      isTail: !!isTail,
    };
  }

  protected getCursorFromInterval(interval: Interval): PaginatorCursor {
    // Resolve edges via sort bounds: "head" is where new items appear, not necessarily
    // `itemIds[0]`.
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
   * Whether the active interval is the anchored head. Re-seeding a loaded paginator with a fresh
   * newest page is only safe then (the page overlaps it). After a jump to an older window it would
   * force-merge the newest page across the gap, so the re-seed is skipped.
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

    // Activating an anchored interval immediately reflects its pagination flags in `state`. Callers
    // inside a transactional `state.next()` pass `{ updateState: false }` and project the flags
    // themselves.
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
   * Pagination head/tail edges of an interval, taken from its sort bounds.
   * `intervalItemIdsAreHeadFirst` decides which bound is the head: where new items appear, not
   * necessarily the min under `sortComparator`.
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
   * Whether intervals A and B should be merged: they strictly overlap in `sortComparator` order
   * (`A.min <= B.max && B.min <= A.max`) or, under policy 'auto' only, one is marked
   * `isHead`/`isTail` and the other extends beyond its pagination head/tail edge.
   */
  protected intervalsOverlap(
    a: AnyInterval,
    b: AnyInterval,
    policy: IntervalMergePolicy = 'auto',
  ): boolean {
    const aBounds = this.getIntervalSortBounds(a);
    const bBounds = this.getIntervalSortBounds(b);
    if (!aBounds || !bBounds) return false;

    if (
      this.itemOrderComparator(aBounds.start, bBounds.end) <= 0 &&
      this.itemOrderComparator(bBounds.start, aBounds.end) <= 0
    )
      return true;

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

    // Items beyond the edge of a head/tail page belong to it.
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
          // Inter-interval operations use the base comparator.
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

    // Conservative default: "no more" in either interval stays "no more".
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
      // Boundary intervals stay boundaries even when forced merges shift their edge.
      hasMoreHead: isHead ? false : hasMoreHead,
      hasMoreTail: isTail ? false : hasMoreTail,
      isHead,
      isTail,
    };
  }

  /** Merges anchored intervals; `null` when there are none. */
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
  protected locateByItemInInterval({
    item,
    interval,
    plateauScan = true,
  }: {
    item: T;
    interval: Interval | LogicalInterval;
    /** Walk the interval for an item the binary search missed. Off when it cannot be there. */
    plateauScan?: boolean;
  }): ItemLocation | null {
    const ids = interval.itemIds;

    return binarySearch({
      needle: item,
      length: ids.length,
      getItemAt: (index: number) => this.getItem(ids[index]),
      itemIdentityEquals: (item1, item2) =>
        this.getItemId(item1) === this.getItemId(item2),
      // Interval items are not sorted by `effectiveComparator`.
      compare: this.itemOrderComparator.bind(this),
      plateauScan,
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

  /** The interval whose `itemIds` lists this id, regardless of where the item sorts. */
  protected findIntervalHoldingItem(item: T): AnyInterval | undefined {
    const id = this.getItemId(item);
    for (const interval of this.itemIntervals) {
      if (interval.itemIds.includes(id)) return interval;
    }
    return undefined;
  }

  protected locateByItemInIntervals(item: T): ItemCoordinates['interval'] | undefined {
    const locateIn = (interval: AnyInterval | undefined, plateauScan?: boolean) => {
      const location =
        interval && this.locateByItemInInterval({ item, interval, plateauScan });
      return interval && location ? { interval, ...location } : undefined;
    };
    const boundsInterval = this.locateIntervalForItem(item);
    // Not held by this list, so in no interval: locate where it would go.
    if (!this._itemIndex.has(this.getItemId(item)))
      return locateIn(boundsInterval, false);
    // Held and unmoved: its sort value points at the interval, no scan needed.
    const inBounds = locateIn(boundsInterval);
    if (inBounds && inBounds.currentIndex > -1) return inBounds;
    // Held but moved: scan all intervals for it.
    const holdingInterval = this.findIntervalHoldingItem(item);
    return holdingInterval ? locateIn(holdingInterval) : inBounds;
  }

  /** Position of the item in `state.items` and its insertion index under `effectiveComparator`. */
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

    const stateLoc = this.locateItemInState(item);
    if (stateLoc) {
      result.state = stateLoc;
    }

    const intervalLoc = this.locateByItemInIntervals(item);
    if (intervalLoc) {
      result.interval = intervalLoc;
    }

    return result;
  };

  protected removeItemIdFromInterval({
    interval,
    ...itemLocation
  }: ItemIntervalCoordinates): ItemIntervalCoordinates {
    if (
      itemLocation.currentIndex >= 0 &&
      itemLocation.currentIndex === itemLocation.insertionIndex
    )
      return { interval, ...itemLocation };

    const itemIds = [...interval.itemIds];

    // `insertionIndex` was computed with the item still in the array: shift it when removing before
    // it.
    let insertionIndex = itemLocation.insertionIndex;
    if (
      itemLocation.currentIndex >= 0 &&
      itemLocation.insertionIndex > itemLocation.currentIndex
    ) {
      insertionIndex--;
    }

    if (itemLocation.currentIndex >= 0) {
      itemIds.splice(itemLocation.currentIndex, 1);
    }
    return {
      interval: { ...interval, itemIds },
      currentIndex: itemLocation.currentIndex,
      insertionIndex,
    };
  }

  /** Inserts the item id at its sorted position; no-op when none can be determined. */
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

    if (typeof insertionIndex !== 'undefined' && insertionIndex > -1) {
      itemIds.splice(insertionIndex, 0, id);
    }

    return {
      ...interval,
      itemIds,
    };
  }

  /**
   * Re-evaluates what the logical (live head/tail) intervals hold against a freshly ingested page
   * and returns the resulting anchored interval. Live updates park items there before any page
   * exists; once a page covers one, leaving it gives the same id two homes (a duplicated row).
   * Unlike the `ingestPage` merge, whose heuristics fire only sometimes, this pass is unconditional
   * and idempotent.
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
   * Moves items the loaded window proves are parked on the wrong side: an item in the live head
   * that sorts past the tail edge of everything loaded belongs to the live tail, and vice versa.
   * Compared against the outermost anchored interval, not the page just ingested: an item between
   * two loaded pages is a gap item and stays.
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

  /** Merges the logical interval's items that belong to `anchored` into it; the rest stay. */
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
   * Merges the anchored intervals and folds in the logical head/tail items that belong to the
   * result. Returns the merged interval (`null` if none) and the possibly reduced logical
   * intervals.
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

    for (const itv of intervals) {
      if (isLiveHeadInterval(itv)) logicalHead = itv;
      else if (isLiveTailInterval(itv)) logicalTail = itv;
      else anchored.push(itv);
    }

    if (anchored.length === 0 && logicalHead && logicalTail) {
      return { logicalHead, merged: null, logicalTail };
    }

    const mergedAnchored = this.mergeAnchoredIntervals(anchored, baseInterval);

    if (!mergedAnchored) {
      return { logicalHead, merged: null, logicalTail };
    }

    let merged = mergedAnchored;

    if (logicalHead) {
      const { mergedAnchored, remainingLogical } = this.mergeItemsFromLogicalInterval(
        logicalHead,
        merged,
      );
      merged = mergedAnchored;
      logicalHead = remainingLogical;
    }

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

  /** Ingests the page into intervals; returns the resulting anchored interval (`null` if empty). */
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
     * 'auto' (default) merges overlapping intervals. 'strict-overlap-only' merges only strictly
     * overlapping ones, e.g. when jumping to a specific message.
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

    // One flush for the whole page: subscribing paginators wake once, not per item.
    this._itemIndex.batch(() => {
      for (const item of page) {
        this._itemIndex.setOne(item);
      }
    });

    const targetInterval = targetIntervalId
      ? this._itemIntervals.get(targetIntervalId)
      : undefined;

    // Base interval, in order of preference: an anchored target interval, an overlapping active
    // anchored interval, the single overlapping anchored interval.
    let baseInterval: Interval | undefined;

    const overlappingAnchored: Interval[] = [];
    const overlappingLogical: LogicalInterval[] = [];
    for (const itv of this.itemIntervals) {
      // The target interval is the base.
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

    // An anchored target interval is always the merge base: whether that is valid is the caller's
    // call (linear pagination never overlaps the previous page).
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
    if (merged) {
      resultingInterval = merged;
      for (const itv of toMerge) {
        if (merged.id === itv.id) continue;
        this.dropInterval(itv.id);
      }
    }

    if (logicalHead) {
      // Leftovers that do not belong to the first page become a separate anchored interval.
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
      // Leftovers that do not belong to the last page become a separate anchored interval.
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
   * Ingests a single live-updated item: updates the item index, inserts the item into the anchored
   * interval whose sort bounds contain it, and re-emits `state.items` when that interval is active.
   */
  ingestItem(ingestedItem: T): boolean {
    let ingested = false;
    this.withSingleWindowPublish(() => {
      ingested = this.applyItemIngestion(ingestedItem);
    });
    return ingested;
  }

  private applyItemIngestion(ingestedItem: T): boolean {
    const id = this.getItemId(ingestedItem);
    const previousItem = this._itemIndex.get(id);

    // Capture the previous coordinates before any mutation.
    const previousCoords = this.locateByItem(previousItem || ingestedItem);

    const originalIndexInState = previousCoords?.state?.currentIndex ?? -1;
    const keepOrderInState = this.config.lockItemOrder && originalIndexInState >= 0;

    const activeIntervalIdBeforeRemoval = this._activeIntervalId;
    let removedItemCoordinates: ItemCoordinates | undefined;
    if (previousCoords) {
      removedItemCoordinates = this.removeItemAtCoordinates(previousCoords);
    }
    const itemHasBeenRemoved =
      !!removedItemCoordinates?.state && removedItemCoordinates.state.currentIndex > -1;

    // Stored only if already present or it matches the paginator's filter.
    if (this._itemIndex.has(id) || this.matchesFilter(ingestedItem)) {
      this._itemIndex.setOne(ingestedItem);
    }

    // No longer matches the filter: it was removed above.
    if (!this.matchesFilter(ingestedItem)) {
      // It left the result set, not just this list.
      this.shrinkOffsetAfterRemoval(removedItemCoordinates);
      // Throttled: the removal deferred its emit, so publish the settled window once. Suspended
      // (coalescing batch): `removeItemAtCoordinates` recorded it and `batch()` emits on exit.
      if (!this.isWindowPublishSuspended && this.isStateThrottled && itemHasBeenRemoved)
        this.scheduleWindowPublish();
      return itemHasBeenRemoved;
    }

    const previousInterval = previousCoords?.interval?.interval;

    const onlyLogicalIntervals =
      this.itemIntervals.length <= 2 &&
      this.itemIntervals.every((itv) => isLogicalInterval(itv));
    // Decide with the old bounds whether the new snapshot still belongs to the same interval.
    const stillBelongsToPreviousAnchoredInterval =
      previousInterval &&
      // Only logical intervals exist and the item was in one: keep it there so it does not
      // disappear on update.
      ((onlyLogicalIntervals && isLogicalInterval(previousInterval)) ||
        // Anchored: reuse only while the new snapshot is within the interval's sort bounds.
        (!isLogicalInterval(previousInterval) &&
          this.belongsToInterval(ingestedItem, previousInterval)));

    let targetInterval = stillBelongsToPreviousAnchoredInterval
      ? previousInterval
      : this.locateIntervalForItem(ingestedItem);

    const { liveHeadLogical, liveTailLogical } = this;

    if (!targetInterval) {
      // No anchored interval contains the new snapshot: it goes to the logical head or tail.
      if (this._itemIntervals.size === 0) {
        // No pages yet: keep it in the logical head.
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
          // Before the loaded head: logical head.
          targetInterval = liveHeadLogical
            ? this.insertItemIdIntoInterval(liveHeadLogical, ingestedItem)
            : {
                id: LOGICAL_HEAD_INTERVAL_ID,
                itemIds: [this.getItemId(ingestedItem)],
              };
        } else if (tailEdges && this.aIsMoreTailwardThanB(ingestedItem, tailEdges.tail)) {
          // After the loaded tail: normally the item moved to an unloaded page, so it waits in the
          // logical tail. Not when it slid out of a head-anchored window (the "first N items"): it
          // is still one of them, and exiling it looked like a deletion. Its rank is approximate
          // until the next page settles it.
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
          // Inside the global bounds but on an unloaded page: it stays invisible until that page is
          // fetched.
          if (
            !this.isWindowPublishSuspended &&
            this.isStateThrottled &&
            itemHasBeenRemoved
          )
            this.scheduleWindowPublish();
          return itemHasBeenRemoved;
        }
      }
    } else {
      targetInterval = this.insertItemIdIntoInterval(targetInterval, ingestedItem);
    }

    // Removing the previous snapshot may have dropped the (now empty) active interval. Re-adding
    // the item into it restores it as active: the emit below is gated on `_activeIntervalId`.
    const removedIntervalId = removedItemCoordinates?.interval?.interval.id;
    if (
      !this._activeIntervalId &&
      !!activeIntervalIdBeforeRemoval &&
      activeIntervalIdBeforeRemoval === removedIntervalId &&
      targetInterval.id === removedIntervalId
    ) {
      this.setActiveInterval(
        targetInterval,
        this.isWindowPublishSuspended ? { updateState: false } : undefined,
      );
    }

    // Prune before committing: `targetInterval` is still the uncommitted copy, so the
    // `commitInterval` below stores the pruned interval (see {@link pruneTailToLimit}).
    const prunedNow = this.pruneTailToLimit(targetInterval);

    const addedNewInterval = !this._itemIntervals.has(targetInterval.id);
    this.commitInterval(targetInterval);

    if (addedNewInterval) {
      this.setIntervals(this.sortIntervals(this.itemIntervals));
    }

    if (
      this._activeIntervalId &&
      [targetInterval.id, removedItemCoordinates?.interval?.interval.id].includes(
        this._activeIntervalId,
      )
    ) {
      if (this.isWindowPublishSuspended) {
        // Coalescing batch: record the change; `batch()` emits the settled window once on exit.
        this._suspendedWindowDirty = true;
      } else if (this.isStateThrottled) {
        this.scheduleWindowPublish();
      } else {
        const items = this.items ?? [];
        // With `lockItemOrder`, `state.items` can keep an item the intervals moved elsewhere, so
        // switching the active interval then shows a different list.
        if (keepOrderInState) {
          // The item was visible: reinsert it at its old index.
          const nextView = items.slice();
          const insertAt = Math.min(originalIndexInState, nextView.length);
          nextView.splice(insertAt, 0, ingestedItem);
          this.state.partialNext({
            // This branch republishes the last published array rather than re-projecting, so ids a
            // prune just removed would resurrect: drop them, keeping survivors' relative positions.
            items: prunedNow
              ? this.retainIntervalMembers(nextView, targetInterval)
              : nextView,
            ...this.consumePendingPrunePaginationState(),
          });
        } else {
          // Derive from the active interval (the one the item left, or the target).
          this.state.partialNext({
            items: this.intervalToItems(
              this._activeIntervalId === removedItemCoordinates?.interval?.interval.id &&
                this._activeIntervalId !== targetInterval.id
                ? removedItemCoordinates.interval.interval
                : targetInterval,
            ),
            ...this.consumePendingPrunePaginationState(),
          });
        }
      }
    }

    return true;
  }

  /**
   * Runs `fn` as one batched mutation: per-item store notifications fold into one flush, so sibling
   * holders of the same ids re-project once. With `coalesce: true` the active window also emits
   * exactly once on exit ({@link flushWindowPublish}), independent of throttling: for one-shot
   * operations. Omit it in WS event handlers so events ride the throttle.
   */
  batch(fn: () => void, { coalesce = false }: { coalesce?: boolean } = {}): void {
    if (!coalesce) {
      this._itemIndex.batch(fn);
      return;
    }
    this.withSingleWindowPublish(() => this._itemIndex.batch(fn), { exit: 'sync' });
  }

  protected removeItemAtCoordinates(coords: ItemCoordinates): ItemCoordinates {
    const { state: stateLocation, interval: intervalLocation } = coords;

    const result: ItemCoordinates = {
      state: { currentIndex: -1, insertionIndex: -1 },
    };

    if (intervalLocation && intervalLocation.currentIndex > -1) {
      const updatedInterval = this.removeItemIdFromInterval(intervalLocation);
      const { interval } = updatedInterval;
      if (interval.itemIds.length === 0) {
        this.dropInterval(interval.id);

        if (this.isActiveInterval(interval)) {
          this.setActiveInterval(undefined);
        }
      } else {
        this.commitInterval(updatedInterval.interval);
      }
      result.interval = updatedInterval;
    }

    if (stateLocation && stateLocation.currentIndex > -1) {
      if (this.isWindowPublishSuspended) {
        this._suspendedWindowDirty = true;
      } else if (!this.isStateThrottled) {
        const newItems = [...(this.items ?? [])];
        newItems.splice(stateLocation.currentIndex, 1);
        this.state.partialNext({ items: newItems });
      }

      // Keep `insertionIndex` consistent after the removal.
      if (stateLocation.insertionIndex > stateLocation.currentIndex) {
        stateLocation.insertionIndex--;
      }

      result.state = stateLocation;
    }

    return result;
  }

  /**
   * Keeps `offset` addressing the same position in the *server's* result set after an item left the
   * loaded window.
   */
  protected shrinkOffsetAfterRemoval(coordinates?: ItemCoordinates) {
    // cursor pagination does not address items by position, so nothing can drift
    if (this.isCursorPagination) return;
    // not part of the loaded window, so no page ever counted it
    if ((coordinates?.state?.currentIndex ?? -1) < 0) return;

    const { offset } = this.state.getLatestValue();
    if (typeof offset !== 'number') return;

    this.state.partialNext({ offset: Math.max(0, offset - 1) });
  }

  /**
   * In the returned coordinates `currentIndex === -1` means not found and `insertionIndex === -1`
   * that none was determined. Removing the last item of the active interval does not activate
   * another one: the UI is expected to load pages to repopulate it.
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
      this.shrinkOffsetAfterRemoval(result);
      // Throttled: the removal deferred its emit, so publish the settled window once.
      if (!this.isWindowPublishSuspended && this.isStateThrottled)
        this.scheduleWindowPublish();
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

    this.recordLoadedWindowQueryShape();
  }

  /**
   * Records the query shape of the loaded window so the next pagination continues it. Data that
   * arrives without a query (`setItems`, `mergeNewestPage`) would otherwise make the next query a
   * first page that publishes `items: undefined` first, and an empty response then loses the
   * window. Needs items: an empty window has no shape to continue from.
   */
  protected recordLoadedWindowQueryShape() {
    if (
      typeof this._lastQueryShape === 'undefined' &&
      (this.state.getLatestValue().items?.length ?? 0) > 0
    ) {
      this._lastQueryShape = this.getNextQueryShape({});
    }
  }

  setDebounceOptions = ({ debounceMs }: PaginatorDebounceOptions) => {
    this._executeQueryDebounced = debounce(this.executeQuery.bind(this), debounceMs);
  };

  /** Changes `stateThrottleMs` at runtime. The config controller rebuilds the throttles. */
  setStateThrottleOptions = ({ stateThrottleMs }: { stateThrottleMs?: number }) => {
    this.updateConfig({ stateThrottleMs } as Partial<BasePaginatorConfig<T, Q>>);
  };

  /**
   * Rebuilds the state-publish throttles for a new interval, or drops them when it is unset.
   * Pending publishes are flushed first so a swap cannot swallow a scheduled trailing-edge emit.
   */
  private rebuildStatePublishThrottles(stateThrottleMs?: number) {
    this.flushPendingPublishes();

    this._windowPublishThrottle = undefined;
    this._viewPublishThrottle = undefined;

    if (!stateThrottleMs) return;

    // The trailing edge re-projects the active window, so a burst emits about once per interval.
    this._windowPublishThrottle = throttle(
      () => this.flushWindowPublish(),
      stateThrottleMs,
      {
        leading: true,
        trailing: true,
      },
    );
    this._viewPublishThrottle = throttle(
      () => this.flushIntervalViewPublish(),
      stateThrottleMs,
      { leading: true, trailing: true },
    );
  }

  initializeConfig(declarativeConfig?: DeclarativePaginatorConfig): void {
    this.configController.initialize(
      declarativeConfig as Partial<BasePaginatorConfig<T, Q>> | undefined,
    );
  }

  /**
   * Behavior a subclass installs that options cannot express (a comparator, `deriveCursor` or
   * `doRequest` closed over `this`). Applied last in `initializeConfig`. Must return stable
   * references (memoize them), or every derivation republishes. Called only after construction.
   */
  protected getBehaviourOverrides(): Partial<BasePaginatorConfig<T, Q>> {
    return {};
  }

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
      // No direction: a jump query.
      typeof direction === 'undefined' ||
      (direction === 'tailward' && this.hasMoreTail) ||
      (direction === 'headward' && this.hasMoreHead));

  isFirstPageQuery = (
    params: { queryShape?: unknown } & Pick<PaginationQueryParams<Q>, 'reset'>,
  ): boolean => {
    // No loaded window: first page. Items without a loaded page (a live event ingested one into a
    // never-queried list) have no recorded query shape, so `shouldResetStateBeforeQuery` reports a
    // first page for them too.
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
    // Offset pagination: the head is loaded exactly when the window starts at offset 0, so
    // `hasMoreHead` is anchored here, not re-derived per page (the growing offset would read as
    // "more headward"). Cursor pagination learns it from the response.
    if (!this.isCursorPagination) {
      state.hasMoreHead = (this.config.initialOffset ?? 0) > 0;
    }
    return state;
  }

  isJumpQueryShape(_queryShape: Q): boolean {
    return false;
  }

  /** The page size a query's results are measured against when deriving the head/tail flags. */
  protected getRequestedPageSize(_queryShape: Q | undefined): number {
    return this.pageSize;
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
      if (remainingRetries > 0) {
        await sleep(DEFAULT_QUERY_CHANNELS_MS_BETWEEN_RETRIES);
        return await this.runQueryRetryable({
          ...params,
          retryCount: remainingRetries - 1,
        });
      }

      // run only once all retries are exhausted
      const isOfflineSupportEnabledWithItems =
        this.isOfflineSupportEnabled && (this.items ?? []).length > 0;
      if (!isOfflineSupportEnabledWithItems) {
        this.state.partialNext({ lastQueryError: e as Error });
      }

      if (this.config.throwErrors) {
        this.state.partialNext({ isLoading: false });
        throw e;
      }
      return null;
    }
  }

  /** A falsy return value means the query was not successful. */
  async executeQuery({
    direction,
    keepPreviousItems,
    queryShape: forcedQueryShape,
    requestOptions,
    reset,
    retryCount = this.config.retryCount,
    silent,
    updateState = true,
  }: PaginationQueryParams<Q> = {}): Promise<ExecuteQueryReturnValue<T> | void> {
    if (!this.canExecuteQuery({ direction, reset })) return;

    // A forced reset happens before the request is built: `getNextQueryShape()` reads the
    // offset/cursor from state. Only a forced reset clears the interval storage: a first page
    // reached through shape-change detection (cursor pagination looks like a new shape every page)
    // keeps it so adjacent pages merge. Filter/sort setters clear it via `resetState()`.
    const isForcedReset = reset === 'yes' && !keepPreviousItems;
    if (isForcedReset) {
      this.clearItemStorage();
      this.state.next(this.getStateBeforeFirstQuery());
    } else if (reset === 'yes' && !forcedQueryShape) {
      // A `keepPreviousItems` refresh restarts from page 1 without clearing the loaded window:
      // reset only the pagination position that `getNextQueryShape()` reads.
      this.state.partialNext({
        cursor: this.config.initialCursor,
        offset: this.config.initialOffset ?? 0,
      });
    }

    // A non-destructive refresh asks for the whole loaded list at once (the server may return less).
    const isRefresh = reset === 'yes' && keepPreviousItems && !forcedQueryShape;
    const pageSize = isRefresh
      ? Math.max(this.pageSize, this.items?.length ?? 0)
      : this.pageSize;
    const queryShape =
      forcedQueryShape ?? this.getNextQueryShape({ direction, pageSize });

    const isFirstPage = this.isFirstPageQuery({ queryShape, reset });

    if (isFirstPage && !keepPreviousItems) {
      const state = this.getStateBeforeFirstQuery();
      // Publish the loading flag before the offline preload is awaited: `canExecuteQuery` gates on
      // `isLoading`, so a second call in the same tick (`toTail` and `toHead` on an empty list)
      // would issue an identical request. Only the flag: `state` has `items: undefined`, which
      // would blank a list the offline data is about to fill. A forced reset already published it.
      if (!isForcedReset) {
        this.state.partialNext({ isLoading: true });
      }
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
      // A forced reset already published this state: publish again only when the offline preload
      // produced items.
      if (!isForcedReset || items !== undefined) {
        this.state.next({ ...state, items });
      }
    } else if (!silent) {
      // Non-first-page or `keepPreviousItems` refresh: surface loading without blanking the list.
      this.state.partialNext({ isLoading: true });
    }

    this._nextQueryShape = queryShape;
    const results = await this.runQueryRetryable({
      direction,
      queryShape,
      requestOptions,
      reset,
      retryCount,
    });
    return this.postQueryReconcile({
      direction,
      isFirstPage,
      keepPreviousItems,
      queryShape,
      requestedPageSize: this.getRequestedPageSize(queryShape),
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

    // Custom subclasses may still return the deprecated `next`/`prev` instead of
    // `tailward`/`headward`.
    const { items, headward, tailward, next, prev } = results;
    const resolvedHeadward = headward ?? prev;
    const resolvedTailward = tailward ?? next;

    stateUpdate.lastQueryError = undefined;
    // Filtering is synchronous, so reconciliation runs in a single tick (`seedFirstPageSync` relies
    // on it).
    const filteredItems = this.filterQueryResults(items);
    stateUpdate.items = filteredItems;

    const isJumpQuery = !!queryShape && this.isJumpQueryShape(queryShape);
    // Read the kept window's ids before the ingest below adds the refreshed page to it.
    const keptItemIds =
      isFirstPage && keepPreviousItems && !this.isCursorPagination && this.items?.length
        ? new Set(this.items.map((item) => this.getItemId(item)))
        : undefined;
    const interval = this.ingestPage({
      page: stateUpdate.items,
      policy: isJumpQuery ? 'strict-overlap-only' : 'auto',
      // The first page is always the head.
      isHead: isJumpQuery
        ? undefined // unknown for a jump
        : isFirstPage ||
          (direction === 'headward' ? requestedPageSize > items.length : undefined),
      // Even a first page compares the requested vs returned page size.
      isTail: isJumpQuery
        ? undefined // unknown for a jump
        : isFirstPage || direction === 'tailward'
          ? requestedPageSize > items.length
          : undefined,
      targetIntervalId: isJumpQuery ? undefined : this._activeIntervalId,
    });
    if (interval && updateState) {
      this.setActiveInterval(interval, { updateState: false });
      stateUpdate.items = this.intervalToItems(interval);
    } else if (updateState && !items.length && (keepPreviousItems || !isFirstPage)) {
      // An empty page must not wipe the loaded items on a `keepPreviousItems` refresh or an
      // incremental query (`ingestPage` returns null for it). A genuine reset still blanks.
      stateUpdate.items = this.items;
    }

    // The cursor comes from `config.deriveCursor` (derived from the ingested interval) or from the
    // query response (`headward`/`tailward`, falsy meaning the edge was hit).
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
      } else if (this.config.deriveCursor && direction && !isFirstPage) {
        // Nothing was ingested, so there is no interval to derive from: only the direction
        // paginated in is resolved and the other side keeps its cursor.
        stateUpdate.cursor =
          direction === 'headward'
            ? {
                headward: resolvedHeadward || null,
                tailward: this.cursor?.tailward ?? null,
              }
            : {
                headward: this.cursor?.headward ?? null,
                tailward: resolvedTailward || null,
              };
        if (direction === 'headward') stateUpdate.hasMoreHead = !!resolvedHeadward;
        else stateUpdate.hasMoreTail = !!resolvedTailward;
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
      // After a `keepPreviousItems` refresh whose page connects to the kept window, continue from
      // the window's end instead of re-fetching it.
      const lastPageItem = items[items.length - 1];
      if (
        interval &&
        keptItemIds &&
        lastPageItem &&
        keptItemIds.has(this.getItemId(lastPageItem))
      ) {
        stateUpdate.offset = Math.max(
          stateUpdate.offset,
          startOffset + this.intervalToItems(interval).length,
        );
      }
      // Only `hasMoreTail` depends on the page result: `hasMoreHead` was anchored at the reset
      // ({@link getStateBeforeFirstQuery}).
      stateUpdate.hasMoreTail = items.length >= this.pageSize;
      // A `keepPreviousItems` first page never publishes `getStateBeforeFirstQuery()`, so anchor
      // its `hasMoreHead` from the start offset here.
      if (isFirstPage) stateUpdate.hasMoreHead = (this.config.initialOffset ?? 0) > 0;
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
      // `isHead` is decided here, not at ingest: reflect a flip in `anchoredHead`.
      this.syncAnchoredHeadAfterHeadFlip(interval, wasHead);
    } else if (!items.length && direction) {
      // An empty directional response means the dataset edge was reached, but `ingestPage` returns
      // no interval for an empty page: flag the active interval, or its `isHead`/`isTail` stay
      // stale (`jumpToTheLatestMessage` would never see the head as loaded).
      const activeInterval = this._activeIntervalId
        ? this._itemIntervals.get(this._activeIntervalId)
        : undefined;
      if (activeInterval && !isLogicalInterval(activeInterval)) {
        if (direction === 'headward') {
          const wasHead = activeInterval.isHead;
          activeInterval.isHead = true;
          activeInterval.hasMoreHead = false;
          this.syncAnchoredHeadAfterHeadFlip(activeInterval, wasHead);
        } else if (direction === 'tailward') {
          activeInterval.isTail = true;
          activeInterval.hasMoreTail = false;
        }
      }
    }

    const state = this.getStateAfterQuery(stateUpdate, isFirstPage);
    // A caller that commits its own state (`updateState: false`) must not be left with the
    // `isLoading` that `executeQuery` published.
    if (updateState) this.state.next(state);
    else if (this.isLoading) this.state.partialNext({ isLoading: false });
    // Only the first page is cached and a later page cannot change it.
    if (isFirstPage) this.populateOfflineDbAfterQuery({ items: state.items, queryShape });

    return {
      stateCandidate: state,
      targetInterval: interval,
    };
  }

  cancelScheduledQuery() {
    this._executeQueryDebounced.cancel();
  }

  resetState() {
    this.state.next(this.initialState);
    this.setIntervals([]);
    this.setActiveInterval(undefined);
    this.clearIntervalViews();
    // Nothing is loaded, so the next query is a first page again. A stale shape would make a
    // re-query with an unchanged shape a continuation, ingested without `isHead`.
    this._lastQueryShape = undefined;
  }

  /**
   * Releases this paginator's hold on its item content (unlinks every member id from the shared
   * store, which otherwise pins a discarded owner) and cancels pending throttled publishes. A
   * teardown, not a reset: the owner is not reused.
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
