import { binarySearchInsertIndex } from '../sortCompiler';
import { itemMatchesFilter } from '../filterCompiler';
import { isPatch, StateStore, type ValueOrPatch } from '../../store';
import { debounce, type DebouncedFunc, sleep } from '../../utils';
import type { FieldToDataResolver } from '../types.normalization';
import {
  locateOnPlateauAlternating,
  locateOnPlateauScanOneSide,
} from '../utility.search';
import { isEqual } from '../../utils/mergeWith/mergeWithCore';
import { DEFAULT_QUERY_CHANNELS_MS_BETWEEN_RETRIES } from '../../constants';

const noOrderChange = () => 0;

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
  protected _executeQueryDebounced!: DebouncedExecQueryFunction<Q>;
  protected _isCursorPagination = false;
  /** Last effective query shape produced by subclass for the most recent request. */
  protected _lastQueryShape?: Q;
  protected _nextQueryShape?: Q;
  /**
   * Comparison function used to keep items in a paginator sorted.
   *
   * The comparator must follow the standard contract of `Array.prototype.sort`:
   *   - return a negative number if `a` should come before `b`
   *   - return a positive number if `a` should come after `b`
   *   - return 0 if they are considered equal for ordering
   *
   * Typical implementations are generated from a "sort spec" (e.g. `{ field: 1, otherField: -1 }`)
   * so that insertion and pagination can maintain the same order as the backend.
   *
   * Notes:
   * - The comparator must be deterministic: the same inputs always return
   *   the same result.
   * - If multiple fields are used, they are evaluated in order of normalized sort ({ direction: AscDesc; field: keyof T }[])
   *   until a non-zero comparison is found.
   * - Equality (0) does not imply object identity; it only means neither item
   *   is considered greater than the other by the sort rules.
   */
  sortComparator: (a: T, b: T) => number;
  /**
   * Allows defining data extraction logic for filter fields like member.user.name or members
   * @protected
   */
  protected _filterFieldToDataResolvers: FieldToDataResolver<T>[];
  /**
   * Ephemeral priority for attention UX without breaking sort invariants
   * @protected
   */
  protected boosts = new Map<string, { until: number; seq: number }>();
  protected _maxBoostSeq: number = 0;

  protected constructor({
    initialCursor,
    initialOffset,
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
  }

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
      hasPrev: true, //todo: check if optimistic value does not cause problems in UI
      isLoading: false,
      items: undefined, // todo: maybe should be null?
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

  /**
   * Decide whether a param change between queries requires a state reset.
   * Default: deep inequality => reset.
   * Subclasses can override to implement domain rules
   * (e.g. ChannelPaginator filters {cid: { $in: string[]}} with different CIDs may be required not to lead to reset).
   */
  protected shouldResetStateBeforeQuery(
    prevQueryShape: unknown | undefined,
    nextQueryShape: unknown | undefined,
  ): boolean {
    return (
      typeof prevQueryShape === 'undefined' ||
      this.config.hasPaginationQueryShapeChanged(prevQueryShape, nextQueryShape)
    );
  }

  protected buildFilters(): object | null {
    return null; // === no filters
  }

  getItemId(item: T): string {
    return (item as { id: string }).id;
  }

  matchesFilter(item: T): boolean {
    const filters = this.buildFilters();

    // no filters => accept all
    if (filters == null) return true;

    return itemMatchesFilter<T>(item, filters, {
      resolvers: this._filterFieldToDataResolvers,
    });
  }

  protected clearExpiredBoosts(now = Date.now()) {
    for (const [id, b] of this.boosts) if (now > b.until) this.boosts.delete(id);
    this._maxBoostSeq = Math.max(
      ...Array.from(this.boosts.values()).map((boost) => boost.seq),
      0,
    );
  }

  /** Comparator that consults boosts first, then falls back to sortComparator */
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
      // higher seq wins
      const seqDistance = (boostB.seq ?? 0) - (boostA.seq ?? 0);
      if (seqDistance !== 0) return seqDistance > 0 ? 1 : -1;
      // fall through to normal comparator for stability
    }
    return this.sortComparator(a, b);
  };

  /** Public API to manage boosts */
  boost(id: string, opts?: { ttlMs?: number; until?: number; seq?: number }) {
    const now = Date.now();
    const until = opts?.until ?? (opts?.ttlMs != null ? now + opts.ttlMs : now + 15000); // default 15s

    if (typeof opts?.seq === 'number' && opts.seq > this._maxBoostSeq) {
      this._maxBoostSeq = opts.seq;
    }

    const seq = opts?.seq ?? 0;
    this.boosts.set(id, { until, seq });
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

  ingestItem(ingestedItem: T): boolean {
    const items = this.items ?? [];
    const id = this.getItemId(ingestedItem);
    const next = items.slice();
    // If it doesn't match this paginator's filters, remove if present and exit.
    const existingIndex = items.findIndex((ch) => this.getItemId(ch) === id);
    if (!this.matchesFilter(ingestedItem)) {
      if (existingIndex >= 0) {
        next.splice(existingIndex, 1);
        this.state.partialNext({ items: next });
        return true; // list changed (item removed)
      }
      return false; // no change
    }

    if (existingIndex >= 0) {
      // Update existing: remove then re-insert at the correct position
      next.splice(existingIndex, 1);
    }

    const insertAt =
      this.config.lockItemOrder && existingIndex >= 0
        ? existingIndex
        : // Find insertion index via binary search: first index where existing > ingestionItem
          binarySearchInsertIndex({
            needle: ingestedItem,
            sortedArray: next,
            compare: this.effectiveComparator,
          });

    next.splice(insertAt, 0, ingestedItem);
    this.state.partialNext({ items: next });
    return true; // list changed (added or repositioned)
  }

  /**
   * Removes item from the paginator's state.
   * It is preferable to provide item for better search performance.
   * @param id
   * @param item
   */
  removeItem({ id, item }: { id?: string; item?: T }): boolean {
    if (!id && !item) return false;
    let index: number;
    if (item) {
      const location = this.locateByItem(item);
      index = location.index;
    } else {
      index = this.items?.findIndex((i) => this.getItemId(i) === id) ?? -1;
    }

    if (index === -1) return false;
    const newItems = [...(this.items ?? [])];
    newItems.splice(index, 1);
    this.state.partialNext({ items: newItems });
    return true;
  }

  contains(item: T): boolean {
    return !!this.items?.find((i) => this.getItemId(i) === this.getItemId(item));
  }

  /**
   * Find the exact index of `needle` by ID (via getItemId) under the current sortComparator.
   *  Returns:
   *   - `index`: actual index if found, otherwise -1
   *   - `insertionIndex`: lower-bound position where `needle` would be inserted
   *     to preserve order (always defined).
   *
   *  Time: O(log n) + O(k) for a tie plateau of size k (unless comparator has ID tiebreaker).
   *
   * ### Usage examples
   *
   * ```ts
   * const { index, insertionIndex } = paginator.locateByItem(channel);
   *
   * if (index > -1) {
   *   // Found -> e.g. remove the item
   *   items.splice(index, 1);
   * } else {
   *   // Insert new at the right position
   *   items.splice(insertionIndex, 0, channel);
   * }
   * ```
   */
  public locateByItem(
    needle: T,
    options?: { alternatePlateauScan?: boolean },
  ): { index: number; insertionIndex: number } {
    const items = this.items ?? [];
    if (items.length === 0) return { index: -1, insertionIndex: 0 };

    const insertionIndex = binarySearchInsertIndex({
      needle,
      sortedArray: items,
      compare: this.effectiveComparator,
    });

    // quick neighbor checks
    const id = this.getItemId(needle);
    const left = insertionIndex - 1;
    if (left >= 0 && this.effectiveComparator(items[left], needle) === 0) {
      if (this.getItemId(items[left]) === id) return { index: left, insertionIndex };
    }
    if (
      insertionIndex < items.length &&
      this.effectiveComparator(items[insertionIndex], needle) === 0
    ) {
      if (this.getItemId(items[insertionIndex]) === id)
        return { index: insertionIndex, insertionIndex };
    }

    // plateau scan
    const index =
      (options?.alternatePlateauScan ?? true)
        ? locateOnPlateauAlternating(
            items,
            needle,
            this.effectiveComparator,
            this.getItemId.bind(this),
            insertionIndex,
          )
        : locateOnPlateauScanOneSide(
            items,
            needle,
            this.effectiveComparator,
            this.getItemId.bind(this),
            insertionIndex,
          );

    return { index, insertionIndex };
  }

  findItem(needle: T, options?: { alternatePlateauScan?: boolean }): T | undefined {
    const { index } = this.locateByItem(needle, options);
    return index > -1 ? (this.items ?? [])[index] : undefined;
  }

  setItems(valueOrFactory: ValueOrPatch<T[]>, cursor?: PaginatorCursor) {
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
      return newState;
    });
  }

  setFilterResolvers(resolvers: FieldToDataResolver<T>[]) {
    this._filterFieldToDataResolvers = resolvers;
  }

  addFilterResolvers(resolvers: FieldToDataResolver<T>[]) {
    this._filterFieldToDataResolvers.push(...resolvers);
  }

  setDebounceOptions = ({ debounceMs }: PaginatorDebounceOptions) => {
    this._executeQueryDebounced = debounce(this.executeQuery.bind(this), debounceMs);
  };

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
      lastQueryError: undefined, // reset lastQueryError that can be overridden by the stateUpdate
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
      // If the offline support is enabled, and there are items in the DB, we should not report the error.
      const isOfflineSupportEnabledWithItems =
        this.isOfflineSupportEnabled && (this.items ?? []).length > 0;
      if (!isOfflineSupportEnabledWithItems) {
        this.state.partialNext({ lastQueryError: e as Error });
      }

      const nextRetryCount = (retryCount ?? 0) - 1;
      if (nextRetryCount > 0) {
        // not swapping isLoading flag to false as the load has not finished yet
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
    queryShape: forcedQueryShape, // todo: remove it?
    reset,
    retryCount = 0,
  }: PaginationQueryParams<Q> = {}) {
    const queryShape = forcedQueryShape ?? this.getNextQueryShape({ direction });
    if (!this.canExecuteQuery({ direction, reset })) return;

    const isFirstPage = this.isFirstPageQuery({ queryShape, reset });
    if (isFirstPage) {
      const state = this.getStateBeforeFirstQuery();
      // preload from the offline DB only if no successful HTTP request has been run previously
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

    // if the request failed the value is null, loading finished
    if (!results) {
      this.state.partialNext({ isLoading: false });
      return;
    }

    const stateUpdate: Partial<PaginatorState<T>> = { lastQueryError: undefined };

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
    const state = this.getStateAfterQuery(stateUpdate, isFirstPage);
    this.state.next(state);
    this.populateOfflineDbAfterQuery({ items: state.items, queryShape });
  }

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
