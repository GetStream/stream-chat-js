import { StateStore } from '../store';
import { debounce, type DebouncedFunc } from '../utils';

type PaginationDirection = 'next' | 'prev';
type Cursor = { next: string | null; prev: string | null };
export type PaginationQueryParams = { direction: PaginationDirection };
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

  protected constructor(options?: PaginatorOptions) {
    const { debounceMs, pageSize } = { ...DEFAULT_PAGINATION_OPTIONS, ...options };
    this.pageSize = pageSize;
    this.state = new StateStore<PaginatorState<T>>(this.initialState);
    this.setDebounceOptions({ debounceMs });
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
