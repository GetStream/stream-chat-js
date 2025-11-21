import type { ItemLocation } from '../sortCompiler';
import { binarySearch } from '../sortCompiler';
import { itemMatchesFilter } from '../filterCompiler';
import { isPatch, StateStore, type ValueOrPatch } from '../../store';
import {
  debounce,
  type DebouncedFunc,
  generateUUIDv4,
  normalizeQuerySort,
  sleep,
} from '../../utils';
import type { FieldToDataResolver } from '../types.normalization';
import { ComparisonResult } from '../types.normalization';
import type { ItemIndex } from '../ItemIndex';
import { isEqual } from '../../utils/mergeWith/mergeWithCore';
import { DEFAULT_QUERY_CHANNELS_MS_BETWEEN_RETRIES } from '../../constants';
import type { AscDesc } from '../..';
import {
  normalizeStringAccentInsensitive,
  toEpochMillis,
  toNumberLike,
} from '../utility.normalization';

const noOrderChange = () => 0;

const LIVE_HEAD_INTERVAL_ID = '__live_head__';
const LIVE_TAIL_INTERVAL_ID = '__live_tail__';
const MISSING_LOW = Number.NEGATIVE_INFINITY; // "smaller than anything"
const MISSING_HIGH = Number.POSITIVE_INFINITY; // "bigger than anything"

type SortKeyScalar = number | string | null;

/**
 * Normalize a raw field value into a comparable scalar.
 *
 * Rules:
 * - Date / ISO / epoch-like → epoch millis (number)
 * - numeric-like string → number
 * - boolean → boolean (or 0/1, see below)
 * - string → normalized string (case/accent insensitive)
 * - everything else → stringified fallback
 */
function normalizeForSort(x: unknown): SortKeyScalar {
  // 1) Date-like
  const d = toEpochMillis(x);
  if (d !== null) return d;

  // 2) numeric-like
  const n = toNumberLike(x);
  if (n !== null) return n;

  // 3) boolean
  if (typeof x === 'boolean') return x ? 1 : 0;

  // 4) string (accent-insensitive)
  if (typeof x === 'string') {
    return normalizeStringAccentInsensitive(x);
  }

  // 5) fallback
  return x == null ? null : String(x);
}

/**
 * Sortable value that represents the item according to the paginator’s comparator.
 * A comparable key that lets you determine:
 * “Does this item fall inside the sort boundaries of any given interval?”
 */
export type SortKey = number[];

// Encodes a string into a numeric sequence suitable for lexicographic comparison.
// 0 as a terminal sentinel ensures shorter prefix strings sort before longer ones (e.g. "a" before "aa").
const STRING_SENTINEL_ASC = 0;

function encodeStringComponents(s: string, direction: 1 | -1): number[] {
  // Ascending: [charCode+1, ..., charCode+1, 0]
  const base: number[] = [];
  for (let i = 0; i < s.length; i++) {
    base.push(s.charCodeAt(i) + 1); // > 0
  }
  base.push(STRING_SENTINEL_ASC); // 0 < any charCode+1

  // Descending = element-wise sign flip of the ascending sequence
  if (direction === 1) return base;
  return base.map((v) => -v);
}

/** Compare two SortKeys. */
export function compareSortKeys(a: SortKey, b: SortKey): number {
  if (typeof a !== 'object' && typeof b !== 'object') {
    return a < b
      ? ComparisonResult.A_PRECEDES_B
      : a > b
        ? ComparisonResult.A_COMES_AFTER_B
        : ComparisonResult.A_IS_EQUAL_TO_B;
  }

  const arrA = a as (number | string)[];
  const arrB = b as (number | string)[];

  const len = Math.min(arrA.length, arrB.length);
  for (let i = 0; i < len; i++) {
    if (arrA[i] < arrB[i]) return ComparisonResult.A_PRECEDES_B;
    if (arrA[i] > arrB[i]) return ComparisonResult.A_COMES_AFTER_B;
  }

  return arrA.length - arrB.length;
}

function minSortKey(a: SortKey, b: SortKey): SortKey {
  return compareSortKeys(a, b) <= 0 ? a : b;
}

function maxSortKey(a: SortKey, b: SortKey): SortKey {
  return compareSortKeys(a, b) >= 0 ? a : b;
}

function mergeUniqueStrings(a: string[], b: string[]): string[] {
  const set = new Set(a);
  for (const id of b) {
    if (!set.has(id)) {
      set.add(id);
      a.push(id);
    }
  }
  return a;
}

type Sort = Record<string, AscDesc>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type PathResolver<T> = (item: T, path: string) => any;

export type LogicalInterval = {
  itemIds: string[];
  id: typeof LIVE_HEAD_INTERVAL_ID | typeof LIVE_TAIL_INTERVAL_ID;
  /** Key of the first item according to sorting. */
  startKey: SortKey;
  /** Key of the last item according to sorting. */
  endKey: SortKey;
};

export type Interval = {
  itemIds: string[];
  id: string;
  /** Key of the first item according to sorting. */
  startKey: SortKey;
  /** Key of the last item according to sorting. */
  endKey: SortKey;
  /**
   * True if this interval represents the global head of the dataset
   * under the current sortComparator.
   *
   * Cursor pagination:
   *   prev === null
   *
   * Offset pagination:
   *   offset === 0
   */
  isHead?: boolean;
  /**
   * True if this interval represents the global tail of the dataset
   * under the current sortComparator.
   *
   * Cursor pagination:
   *   next === null
   *
   * Offset pagination:
   *   returnedItems.length < pageSize
   */
  isTail?: boolean;
};

export type AnyInterval = Interval | LogicalInterval;

export type ItemCoordinates = {
  /** Location inside state.items (visible list) */
  state?: ItemLocation;
  /** Location inside an interval (anchored or logical) */
  interval?: ItemLocation & {
    interval: Interval | LogicalInterval;
  };
};

const isLiveHeadInterval = (interval: AnyInterval): interval is LogicalInterval =>
  interval.id === LIVE_HEAD_INTERVAL_ID;

const isLiveTailInterval = (interval: AnyInterval): interval is LogicalInterval =>
  interval.id === LIVE_TAIL_INTERVAL_ID;

/**
 * Returns true if intervals A and B overlap.
 *
 * Overlap condition:
 *   A.startKey ≤ B.endKey  AND  B.startKey ≤ A.endKey
 */
function intervalsOverlap(a: Interval, b: Interval): boolean {
  return (
    compareSortKeys(a.startKey, b.endKey) <= 0 &&
    compareSortKeys(b.startKey, a.endKey) <= 0
  );
}

function cloneInterval(interval: Interval): Interval {
  return {
    ...interval,
    itemIds: [...interval.itemIds],
  };
}

function mergeTwoAnchoredIntervals(preceding: Interval, following: Interval): Interval {
  return {
    ...preceding,
    itemIds: mergeUniqueStrings([...preceding.itemIds], following.itemIds),
    startKey: minSortKey(preceding.startKey, following.startKey),
    endKey: maxSortKey(preceding.endKey, following.endKey),
    isHead: preceding.isHead || following.isHead,
    isTail: preceding.isTail || following.isTail,
  };
}

/**
 * Merges anchored intervals. Returns null if there are no intervals to merge.
 */
function mergeAnchoredIntervals(intervals: Interval[]): Interval | null {
  if (intervals.length === 0) return null;

  const intervalsCopy = [...intervals];
  intervalsCopy.sort((a, b) => compareSortKeys(a.startKey, b.startKey));

  let acc = cloneInterval(intervalsCopy[0]);
  for (let i = 1; i < intervalsCopy.length; i++) {
    const next = intervalsCopy[i];
    acc = mergeTwoAnchoredIntervals(acc, next);
  }

  return acc;
}

/**
 * Whether a SortKey belongs to an anchored interval.
 */
function belongsToInterval(itemSortKey: SortKey, interval: Interval): boolean {
  return (
    compareSortKeys(itemSortKey, interval.startKey) >= 0 &&
    compareSortKeys(itemSortKey, interval.endKey) <= 0
  );
}

export type MakeIntervalParams<T> = {
  page: T[];
  isHead?: boolean;
  isTail?: boolean;
};

export type SetPaginatorItemsParams<T> = {
  valueOrFactory: ValueOrPatch<T[]>;
  cursor?: PaginatorCursor;
  isFirstPage?: boolean;
  isLastPage?: boolean;
};

type MergeIntervalsResult = {
  logicalHead: LogicalInterval | null;
  merged: Interval | null;
  logicalTail: LogicalInterval | null;
};

type PaginationDirection = 'next' | 'prev';
export type PaginatorCursor = { next: string | null; prev: string | null };
type StateResetPolicy = 'auto' | 'yes' | 'no' | (string & {});

export type PaginationQueryShapeChangeIdentifier<S> = (
  prevQueryShape?: S,
  nextQueryShape?: S,
) => boolean;

export type PaginationQueryParams<Q> = {
  direction?: PaginationDirection;
  /** Data that define the query (filters, sort, ...) */
  queryShape?: Q;
  /** Per-call override of the reset behavior. */
  reset?: StateResetPolicy;
  /** Should retry the failed request given number of times. Default is 0. */
  retryCount?: number;
};

export type PaginationQueryReturnValue<T> = { items: T[] } & {
  next?: string;
  prev?: string;
};
export type PaginatorDebounceOptions = {
  debounceMs: number;
};
type DebouncedExecQueryFunction<Q> = DebouncedFunc<
  (params: PaginationQueryParams<Q>) => Promise<void>
>;

export type PaginatorState<T> = {
  hasNext: boolean;
  hasPrev: boolean;
  isLoading: boolean;
  items: T[] | undefined;
  lastQueryError?: Error;
  cursor?: PaginatorCursor;
  offset?: number;
};

export type PaginatorOptions<T, Q> = {
  /** The number of milliseconds to debounce the search query. The default interval is 300ms. */
  debounceMs?: number;
  /**
   * Function containing custom logic that decides, whether the next pagination query to be executed should be considered the first page query.
   * It makes sense to consider the next query as the first page query if filters, sort, options etc. (query params) excluding the page size have changed.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  hasPaginationQueryShapeChanged?: PaginationQueryShapeChangeIdentifier<any>;
  /** Custom function to retrieve items pages and optionally return a cursor in case of cursor pagination. */
  doRequest?: (queryParams: Q) => Promise<{ items: T[]; cursor?: PaginatorCursor }>;
  /** In case of cursor pagination, specify the initial cursor value. */
  initialCursor?: PaginatorCursor;
  /** In case of offset pagination, specify the initial offset value. */
  initialOffset?: number;
  /** If item index is provided, this index ensures updates in place and all consumers have access to a single source of data. */
  itemIndex?: ItemIndex<T>;
  /** Will prevent changing the index of existing items. */
  lockItemOrder?: boolean;
  /** The item page size to be requested from the server. */
  pageSize?: number;
  /** Prevent silencing the errors thrown during the pagination execution. Default is false. */
  throwErrors?: boolean;
};

type OptionalPaginatorConfigFields =
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
   * outside of the paginator.
   */
  protected _itemIndex: ItemIndex<T> | undefined;

  protected _executeQueryDebounced!: DebouncedExecQueryFunction<Q>;
  protected _isCursorPagination = false;
  /** Last effective query shape produced by subclass for the most recent request. */
  protected _lastQueryShape?: Q;
  protected _nextQueryShape?: Q;

  sortComparator: (a: T, b: T) => number;
  protected _filterFieldToDataResolvers: FieldToDataResolver<T>[];

  protected boosts = new Map<string, { until: number; seq: number }>();
  protected _maxBoostSeq = 0;

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
    this._itemIndex = itemIndex;
  }

  // ---------------------------------------------------------------------------
  // Basic getters
  // ---------------------------------------------------------------------------

  get lastQueryError() {
    return this.state.getLatestValue().lastQueryError;
  }

  get hasNext() {
    return this.state.getLatestValue().hasNext;
  }

  get hasPrev() {
    return this.state.getLatestValue().hasPrev;
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

  get initialState(): PaginatorState<T> {
    return {
      hasNext: true,
      hasPrev: true,
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

  get maxBoostSeq() {
    return this._maxBoostSeq;
  }

  protected get itemIntervals(): AnyInterval[] {
    return Array.from(this._itemIntervals.values());
  }

  protected get liveHeadLogical(): LogicalInterval | undefined {
    const itv = this._itemIntervals.get(LIVE_HEAD_INTERVAL_ID);
    return itv && isLiveHeadInterval(itv) ? itv : undefined;
  }

  protected get liveTailLogical(): LogicalInterval | undefined {
    const itv = this._itemIntervals.get(LIVE_TAIL_INTERVAL_ID);
    return itv && isLiveTailInterval(itv) ? itv : undefined;
  }

  protected get usesItemIntervalStorage(): boolean {
    return !!this._itemIndex;
  }

  // ---------------------------------------------------------------------------
  // Abstracts
  // ---------------------------------------------------------------------------

  abstract query(
    params: PaginationQueryParams<Q>,
  ): Promise<PaginationQueryReturnValue<T>>;

  abstract filterQueryResults(items: T[]): T[] | Promise<T[]>;

  /**
   * Should be implemented in child classes from the specific sort requirements followed by the child classes.
   * Should return a value according to which the given item can be correctly inserted into the target item interval
   * based on the current sort rules.
   * @param item
   */
  abstract computeSortKey(item: T): SortKey;

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
  // Sort key generator (optional helper)
  // ---------------------------------------------------------------------------

  /**
   * Factory function to create a sort key generator.
   * Sort key generation must be consistent with the comparator logic.
   *
   * The resulting SortKey is an array of numbers, e.g.
   * [{last_updated_at}, {}]
   */
  makeSortKeyGenerator({
    sort,
    resolvePathValue,
  }: {
    sort: Sort | Sort[];
    resolvePathValue: PathResolver<T>;
  }): (item: T) => SortKey {
    const normalizedSort = normalizeQuerySort(sort); // [{ field, direction }, ...]

    return (item: T): SortKey => {
      const key: SortKey = [];

      for (const { field, direction } of normalizedSort) {
        const raw = resolvePathValue(item, field);
        const normalized = normalizeForSort(raw);
        if (normalized === null) {
          // No usable value → push a sentinel that depends on direction.
          key.push(direction === 1 ? MISSING_LOW : MISSING_HIGH);
        } else if (typeof normalized === 'number') {
          key.push(direction === 1 ? normalized : -normalized);
        } else {
          // string
          // If most of your sorts are numeric/date and string sorts are asc-only,
          // you can just store the string as-is:
          key.push(...encodeStringComponents(normalized, direction));
        }
      }
      return key;
    };
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
  // Interval helpers
  // ---------------------------------------------------------------------------

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  generateIntervalId(page: T[]): string {
    return `interval-${generateUUIDv4()}`;
  }

  intervalToItems(interval: Interval | LogicalInterval): T[] {
    return interval.itemIds
      .map((id) => this._itemIndex?.get(id))
      .filter((item): item is T => !!item);
  }

  makeInterval({ page, isHead, isTail }: MakeIntervalParams<T>): Interval {
    const sorted = [...page].sort((a, b) =>
      compareSortKeys(this.computeSortKey(a), this.computeSortKey(b)),
    );
    return {
      id: this.generateIntervalId(page),
      itemIds: sorted.map(this.getItemId.bind(this)),
      startKey: this.computeSortKey(sorted[0]),
      endKey: this.computeSortKey(sorted[sorted.length - 1]),
      isHead,
      isTail,
    };
  }

  protected recomputeIntervalBoundaries(interval: AnyInterval): {
    startKey: SortKey;
    endKey: SortKey;
  } {
    // Recompute boundaries from the first and last items in the interval.
    // Since ids are kept sorted by effectiveComparator,
    // the first and last items define the correct startKey/endKey.
    const ids = interval.itemIds;
    const first = this.getItem(ids[0]);
    const last = this.getItem(ids[ids.length - 1]);

    if (!first || !last) {
      throw new Error('Invalid interval to recompute boundaries: empty item array');
    }

    const startKey = this.computeSortKey(first);
    const endKey = first === last ? startKey : this.computeSortKey(last);
    return { startKey, endKey };
  }

  // ---------------------------------------------------------------------------
  // Locate items
  // ---------------------------------------------------------------------------

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
      compare: this.effectiveComparator.bind(this),
      plateauScan: true,
    });
  }

  protected locateIntervalForItem(item: T): AnyInterval | undefined {
    if (this._itemIntervals.size === 0) return undefined;

    const itemSortKey = this.computeSortKey(item);

    for (const itv of this.itemIntervals) {
      if (belongsToInterval(itemSortKey, itv)) {
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

  protected locateByItem = (item: T): ItemCoordinates => {
    const result: ItemCoordinates = {};

    // 1. Search in visible state.items
    const stateLoc = this.locateItemInState(item);
    if (stateLoc) {
      result.state = stateLoc;
    }

    // 2. Search in intervals if interval-mode is active
    if (this.usesItemIntervalStorage) {
      const intervalLoc = this.locateByItemInIntervals(item);
      if (intervalLoc) {
        result.interval = intervalLoc;
      }
    }

    return result;
  };

  findItem(needle: T): T | undefined {
    const { state, interval } = this.locateByItem(needle);
    if (state && state.current > -1) {
      return (this.items ?? [])[state.current];
    } else if (interval && interval.current > -1) {
      const id = interval.interval.itemIds[interval.current];
      return this.getItem(id);
    }
    return undefined;
  }

  // ---------------------------------------------------------------------------
  // Item ingestion
  // ---------------------------------------------------------------------------

  /**
   * Inserts an item ID into the interval in the correct sorted position,
   * preserving interval ordering and updating start/end keys.
   * Returns unchaged interval if the correct insertion position could not be determined.
   */
  protected insertItemIdIntoInterval<I extends Interval | LogicalInterval>(
    interval: I,
    item: T,
  ): I {
    const id = this.getItemId(item);
    const itemLocation = this.locateByItemInInterval({ item, interval });

    if (!itemLocation) return interval;

    // If already at the correct position, nothing to change
    if (itemLocation.current >= 0 && itemLocation.current === itemLocation.expected) {
      return interval;
    }

    const ids = [...interval.itemIds];

    // Adjust insertion index if we are removing the item before reinserting index.
    // locateByItemInInterval() computed insertionIndex with the item still in the array.
    let insertionIndex = itemLocation.expected;
    if (itemLocation.current >= 0 && itemLocation.expected > itemLocation.current) {
      insertionIndex--;
    }

    // Remove existing occurrence if present
    if (itemLocation.current >= 0) {
      ids.splice(itemLocation.current, 1);
    }

    // Insert at the new position
    ids.splice(insertionIndex, 0, id);

    const intervalWithUpdatedIds = {
      ...interval,
      itemIds: ids,
    };

    const boundaries = this.recomputeIntervalBoundaries(intervalWithUpdatedIds);

    return {
      ...intervalWithUpdatedIds,
      ...boundaries,
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

      const key = this.computeSortKey(item);

      if (belongsToInterval(key, anchored)) mergeIds.push(id);
      else keepIds.push(id);
    }

    let merged = anchored;
    for (const id of mergeIds) {
      const item = this.getItem(id);
      if (!item) continue;
      merged = this.insertItemIdIntoInterval(merged, item);
    }

    const remainingLogical = keepIds.length > 0 ? { ...logical, itemIds: keepIds } : null;

    return {
      mergedAnchored: merged,
      remainingLogical: remainingLogical && {
        ...remainingLogical,
        ...this.recomputeIntervalBoundaries(remainingLogical),
      },
    };
  }

  /**
   * Merges all intervals (anchored + logical head/tail).
   * Returns:
   *   - merged anchored interval (or null if none)
   *   - possibly reduced logical head / tail intervals
   */
  protected mergeIntervals(intervals: AnyInterval[]): MergeIntervalsResult {
    let logicalHead: LogicalInterval | null = null;
    let logicalTail: LogicalInterval | null = null;
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
    const mergedAnchored = mergeAnchoredIntervals(anchored);

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
  protected ingestPage({
    page,
    isHead,
    isTail,
    targetIntervalId,
  }: {
    page: T[];
    isHead?: boolean;
    isTail?: boolean;
    targetIntervalId?: string;
  }): Interval | null {
    if (!this._itemIndex || !page?.length) return null;

    for (const item of page) {
      this._itemIndex.setOne(item);
    }

    const pageInterval = this.makeInterval({
      page,
      isHead,
      isTail,
    });

    const targetInterval = targetIntervalId
      ? this._itemIntervals.get(targetIntervalId)
      : null;

    // Find intervals that overlap with this page
    const overlapping: Interval[] = [];
    for (const itv of this.itemIntervals) {
      // target will be appended separately
      if (targetInterval?.id === itv.id) continue;
      if (intervalsOverlap(pageInterval, itv)) {
        overlapping.push(itv);
      }
    }
    const toMerge: AnyInterval[] = [...overlapping, pageInterval];

    if (targetInterval) {
      toMerge.push(targetInterval);
    }

    const { logicalHead, merged, logicalTail } = this.mergeIntervals(toMerge);

    // Remove all intervals that participated
    for (const itv of toMerge) {
      this._itemIntervals.delete(itv.id);
    }

    // Decide which anchored interval we keep for this page:
    const resultingInterval = merged ?? pageInterval;
    this._itemIntervals.set(resultingInterval.id, resultingInterval);

    // Store logical head/tail (if any)
    if (logicalHead) {
      this._itemIntervals.set(LIVE_HEAD_INTERVAL_ID, logicalHead);
    } else {
      this._itemIntervals.delete(LIVE_HEAD_INTERVAL_ID);
    }

    if (logicalTail) {
      this._itemIntervals.set(LIVE_TAIL_INTERVAL_ID, logicalTail);
    } else {
      this._itemIntervals.delete(LIVE_TAIL_INTERVAL_ID);
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
    // If we don't have itemIndex, manipulate only items array in paginator state and not intervals
    // as intervals do not store the whole items and have to rely on _itemIndex
    if (!this.usesItemIntervalStorage) {
      const items = this.items ?? [];
      const next = items.slice();
      const { current: existingIndex, expected: insertionIndex } = binarySearch({
        needle: ingestedItem,
        length: items.length,
        getItemAt: (index: number) => items[index],
        itemIdentityEquals: (item1, item2) =>
          this.getItemId(item1) === this.getItemId(item2),
        compare: this.effectiveComparator.bind(this),
        plateauScan: true,
      });

      if (!this.matchesFilter(ingestedItem)) {
        if (existingIndex >= 0) {
          next.splice(existingIndex, 1);
          this.state.partialNext({ items: next });
          return true;
        }
        return false;
      }

      // override the existing item even though it already exists to make sure it is up-to-date
      if (existingIndex >= 0) {
        next.splice(existingIndex, 1);
      }

      const insertAt =
        this.config.lockItemOrder && existingIndex >= 0 ? existingIndex : insertionIndex;

      next.splice(insertAt, 0, ingestedItem);
      this.state.partialNext({ items: next });
      return true;
    }

    // Always update the itemIndex if present
    this._itemIndex?.setOne(ingestedItem);

    // Ingestion into anchored intervals
    let targetInterval = this.locateIntervalForItem(ingestedItem);

    // if no page has been loaded yet or the anchored interval could not be found,
    // because the relevant page has not been loaded yet,
    // keep the incoming items in logical interval if falls outside of the head and tail boundaries
    if (!targetInterval) {
      let targetLogical: LogicalInterval | undefined;
      // add to head or tail if item exceeds the total bounds
      if (this._itemIntervals.size > 0) {
        const intervalsArray = this.itemIntervals;
        const [firstInterval, lastInterval] = [
          intervalsArray[0],
          intervalsArray.slice(-1)[0],
        ];
        const itemSortKey = this.computeSortKey(ingestedItem);
        if (
          isLiveHeadInterval(firstInterval) &&
          compareSortKeys(itemSortKey, firstInterval.startKey) <=
            ComparisonResult.A_PRECEDES_B
        ) {
          targetLogical = firstInterval;
        } else if (
          isLiveTailInterval(lastInterval) &&
          compareSortKeys(itemSortKey, lastInterval.endKey) >=
            ComparisonResult.A_COMES_AFTER_B
        ) {
          targetLogical = lastInterval;
        }
        // ingested item would fall somewhere inside the boundaries but relevant page has not been loaded yet
        // and thus the interval is not identifiable
        if (!targetLogical) return false;

        targetInterval = this.insertItemIdIntoInterval(targetLogical, ingestedItem);
      } else {
        // no page has been loaded yet
        targetInterval = {
          id: LIVE_HEAD_INTERVAL_ID,
          itemIds: [this.getItemId(ingestedItem)],
          startKey: this.computeSortKey(ingestedItem),
          endKey: this.computeSortKey(ingestedItem),
        };

        if (!this._activeIntervalId) {
          this._activeIntervalId = targetInterval.id;
        }
      }
    } else {
      targetInterval = this.insertItemIdIntoInterval(targetInterval, ingestedItem);
    }

    this._itemIntervals.set(targetInterval.id, targetInterval);

    if (this._activeIntervalId === targetInterval.id) {
      this.state.partialNext({ items: this.intervalToItems(targetInterval) });
    }

    return true;
  }

  // ---------------------------------------------------------------------------
  // Remove / contains
  // ---------------------------------------------------------------------------

  removeItem({ id, item: inputItem }: { id?: string; item?: T }): boolean {
    if (!id && !inputItem) return false;
    const item = inputItem ?? this.getItem(id);
    // not in item index, and no item provided (cannot locate by item), so we will not check intervals,
    // only state items and sequentially
    if (!this._itemIndex || !item) {
      const index = this.items?.findIndex((i) => this.getItemId(i) === id) ?? -1;
      if (index === -1) return false;
      const newItems = [...(this.items ?? [])];
      newItems.splice(index, 1);
      this.state.partialNext({ items: newItems });
      return true;
    }

    const { state: stateLocation, interval: intervalLocation } = this.locateByItem(item);

    if (intervalLocation && intervalLocation.current > -1) {
      const itemIds = [...intervalLocation.interval.itemIds];
      itemIds.splice(intervalLocation.current, 1);
      const newInterval: AnyInterval = { ...intervalLocation.interval, itemIds };
      const boundaries = this.recomputeIntervalBoundaries(newInterval);
      this._itemIntervals.set(newInterval.id, { ...newInterval, ...boundaries });
    }

    if (stateLocation && stateLocation.current > -1) {
      const newItems = [...(this.items ?? [])];
      newItems.splice(stateLocation.current, 1);
      this.state.partialNext({ items: newItems });
    }
    return true;
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

      const interval = this.ingestPage({
        page: newItems,
        isHead: isFirstPage,
        isTail: isLastPage,
      });
      if (interval) this._activeIntervalId = interval.id;

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
  }: { direction: PaginationDirection } & Pick<PaginationQueryParams<Q>, 'reset'>) =>
    !this.isLoading &&
    (reset === 'yes' ||
      (direction === 'next' && this.hasNext) ||
      (direction === 'prev' && this.hasPrev));

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

  protected getStateAfterQuery(
    stateUpdate: Partial<PaginatorState<T>>,
    isFirstPage: boolean,
  ): PaginatorState<T> {
    const current = this.state.getLatestValue();
    return {
      ...current,
      lastQueryError: undefined,
      ...stateUpdate,
      isLoading: false,
      items: isFirstPage
        ? stateUpdate.items
        : [...(this.items ?? []), ...(stateUpdate.items || [])],
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

  async executeQuery({
    direction = 'next',
    queryShape: forcedQueryShape,
    reset,
    retryCount = 0,
  }: PaginationQueryParams<Q> = {}) {
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
    this._lastQueryShape = this._nextQueryShape;
    this._nextQueryShape = undefined;

    if (!results) {
      this.state.partialNext({ isLoading: false });
      return;
    }

    const stateUpdate: Partial<PaginatorState<T>> = {
      lastQueryError: undefined,
    };

    const { items, next, prev } = results;
    if (isFirstPage && (next || prev)) {
      this._isCursorPagination = true;
    }

    if (this._isCursorPagination) {
      stateUpdate.cursor = { next: next || null, prev: prev || null };
      stateUpdate.hasNext = !!next;
      stateUpdate.hasPrev = !!prev;
    } else {
      stateUpdate.offset = (this.offset ?? 0) + items.length;
      stateUpdate.hasNext = items.length === this.pageSize;
    }

    stateUpdate.items = await this.filterQueryResults(items);

    // ingest page into intervals if itemIndex is present
    const interval = this.ingestPage({
      page: stateUpdate.items,
      isHead: !stateUpdate.hasNext,
      isTail: !stateUpdate.hasPrev,
      targetIntervalId: this._activeIntervalId,
    });
    // item index is available if an Interval is returned
    if (interval) {
      this._activeIntervalId = interval.id;
      stateUpdate.items = this.intervalToItems(interval);
    }

    const state = this.getStateAfterQuery(stateUpdate, isFirstPage);
    this.state.next(state);
    this.populateOfflineDbAfterQuery({ items: state.items, queryShape });
  }

  // ---------------------------------------------------------------------------
  // Public API: navigation
  // ---------------------------------------------------------------------------

  cancelScheduledQuery() {
    this._executeQueryDebounced.cancel();
  }

  resetState() {
    this.state.next(this.initialState);
  }

  next = (params: Omit<PaginationQueryParams<Q>, 'direction' | 'queryShape'> = {}) =>
    this.executeQuery({ direction: 'next', ...params });

  prev = (params: Omit<PaginationQueryParams<Q>, 'direction' | 'queryShape'> = {}) =>
    this.executeQuery({ direction: 'prev', ...params });

  nextDebounced = (
    params: Omit<PaginationQueryParams<Q>, 'direction' | 'queryShape'> = {},
  ) => {
    this._executeQueryDebounced({ direction: 'next', ...params });
  };

  prevDebounced = (
    params: Omit<PaginationQueryParams<Q>, 'direction' | 'queryShape'> = {},
  ) => {
    this._executeQueryDebounced({ direction: 'prev', ...params });
  };

  reload = async () => {
    await this.next({ reset: 'yes' });
  };
}
