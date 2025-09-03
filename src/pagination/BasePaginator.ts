import { binarySearchInsertIndex } from './sortCompiler';
import { itemMatchesFilter } from './filterCompiler';
import { StateStore } from '../store';
import { debounce, type DebouncedFunc } from '../utils';
import type { FieldToDataResolver } from './types.normalization';
import { locateOnPlateauAlternating, locateOnPlateauScanOneSide } from './utility.search';

const noOrderChange = () => 0;

type PaginationDirection = 'next' | 'prev';
type Cursor = { next: string | null; prev: string | null };
export type PaginationQueryParams = { direction?: PaginationDirection };
export type PaginationQueryReturnValue<T> = { items: T[] } & {
  next?: string;
  prev?: string;
};
export type PaginatorDebounceOptions = {
  debounceMs: number;
};
type DebouncedExecQueryFunction = DebouncedFunc<
  (params: { direction: PaginationDirection }) => Promise<void>
>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type PaginatorState<T = any> = {
  hasNext: boolean;
  hasPrev: boolean;
  isLoading: boolean;
  items: T[] | undefined;
  lastQueryError?: Error;
  cursor?: Cursor;
  offset?: number;
};

export type PaginatorOptions = {
  /** The number of milliseconds to debounce the search query. The default interval is 300ms. */
  debounceMs?: number;
  pageSize?: number;
};
export const DEFAULT_PAGINATION_OPTIONS: Required<PaginatorOptions> = {
  debounceMs: 300,
  pageSize: 10,
} as const;

export abstract class BasePaginator<T> {
  state: StateStore<PaginatorState<T>>;
  pageSize: number;
  protected _executeQueryDebounced!: DebouncedExecQueryFunction;
  protected _isCursorPagination = false;
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

  protected constructor(options?: PaginatorOptions) {
    const { debounceMs, pageSize } = { ...DEFAULT_PAGINATION_OPTIONS, ...options };
    this.pageSize = pageSize;
    this.state = new StateStore<PaginatorState<T>>(this.initialState);
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

  get initialState(): PaginatorState {
    return {
      hasNext: true,
      hasPrev: true, //todo: check if optimistic value does not cause problems in UI
      isLoading: false,
      items: undefined,
      lastQueryError: undefined,
      cursor: undefined,
      offset: 0,
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

  abstract query(params: PaginationQueryParams): Promise<PaginationQueryReturnValue<T>>;

  abstract filterQueryResults(items: T[]): T[] | Promise<T[]>;

  protected buildFilters(): object | null {
    return null; // === no filters'
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

  ingestItem(ingestedItem: T): boolean {
    const items = this.items ?? [];
    const id = this.getItemId(ingestedItem);

    // If it doesn't match this paginator's filters, remove if present and exit.
    const existingIndex = items.findIndex((ch) => this.getItemId(ch) === id);
    if (!this.matchesFilter(ingestedItem)) {
      if (existingIndex >= 0) {
        const next = items.slice();
        next.splice(existingIndex, 1);
        this.state.partialNext({ items: next });
        return true; // list changed (item removed)
      }
      return false; // no change
    }

    // Build comparator once per call (you can cache it when sort changes).

    const next = items.slice();

    if (existingIndex >= 0) {
      // Update existing: remove then re-insert at the correct position
      next.splice(existingIndex, 1);
    }

    // Find insertion index via binary search: first index where existing > ingestionItem
    const insertAt = binarySearchInsertIndex({
      needle: ingestedItem,
      sortedArray: next,
      compare: this.sortComparator,
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
      compare: this.sortComparator,
    });

    // quick neighbor checks
    const id = this.getItemId(needle);
    const left = insertionIndex - 1;
    if (left >= 0 && this.sortComparator(items[left], needle) === 0) {
      if (this.getItemId(items[left]) === id) return { index: left, insertionIndex };
    }
    if (
      insertionIndex < items.length &&
      this.sortComparator(items[insertionIndex], needle) === 0
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
            this.sortComparator,
            this.getItemId.bind(this),
            insertionIndex,
          )
        : locateOnPlateauScanOneSide(
            items,
            needle,
            this.sortComparator,
            this.getItemId.bind(this),
            insertionIndex,
          );

    return { index, insertionIndex };
  }

  findItem(needle: T, options?: { alternatePlateauScan?: boolean }): T | undefined {
    const { index } = this.locateByItem(needle, options);
    return index > -1 ? (this.items ?? [])[index] : undefined;
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

  canExecuteQuery = (direction: PaginationDirection) =>
    (!this.isLoading && direction === 'next' && this.hasNext) ||
    (direction === 'prev' && this.hasPrev);

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

  async executeQuery({ direction }: { direction: PaginationDirection }) {
    if (!this.canExecuteQuery(direction)) return;
    const isFirstPage = typeof this.items === 'undefined';
    if (isFirstPage) {
      this.state.next(this.getStateBeforeFirstQuery());
    } else {
      this.state.partialNext({ isLoading: true });
    }

    const stateUpdate: Partial<PaginatorState<T>> = {};
    try {
      const results = await this.query({ direction });
      if (!results) return;
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
    } catch (e) {
      stateUpdate.lastQueryError = e as Error;
    } finally {
      this.state.next(this.getStateAfterQuery(stateUpdate, isFirstPage));
    }
  }

  cancelScheduledQuery() {
    this._executeQueryDebounced.cancel();
  }

  resetState() {
    this.state.next(this.initialState);
  }

  next = () => this.executeQuery({ direction: 'next' });

  prev = () => this.executeQuery({ direction: 'prev' });

  nextDebounced = () => {
    this._executeQueryDebounced({ direction: 'next' });
  };
  prevDebounced = () => {
    this._executeQueryDebounced({ direction: 'prev' });
  };
}
