import { StateStore } from '../store';
import { debounce, type DebouncedFunc } from '../utils';

export type SearchSourceType = 'channels' | 'users' | 'messages' | (string & {});
export type QueryReturnValue<T> = { items: T[]; next?: string | null };
export type DebounceOptions = {
  debounceMs: number;
};
type DebouncedExecQueryFunction = DebouncedFunc<(searchString?: string) => Promise<void>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface SearchSource<T = any> {
  activate(): void;

  cancelScheduledQuery(): void;

  canExecuteQuery(newSearchString?: string): boolean;

  deactivate(): void;

  readonly hasNext: boolean;
  readonly hasResults: boolean;
  readonly initialState: SearchSourceState<T>;
  readonly isActive: boolean;
  readonly isLoading: boolean;
  readonly items: T[] | undefined;
  readonly lastQueryError: Error | undefined;
  readonly next: string | undefined | null;
  readonly offset: number | undefined;

  resetState(): void;

  search(text?: string): Promise<void> | undefined;

  readonly searchQuery: string;

  setDebounceOptions(options: DebounceOptions): void;

  readonly state: StateStore<SearchSourceState<T>>;
  readonly type: SearchSourceType;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type SearchSourceState<T = any> = {
  hasNext: boolean;
  isActive: boolean;
  isLoading: boolean;
  items: T[] | undefined;
  searchQuery: string;
  lastQueryError?: Error;
  next?: string | null;
  offset?: number;
};
export type SearchSourceOptions = {
  /** The number of milliseconds to debounce the search query. The default interval is 300ms. */
  debounceMs?: number;
  pageSize?: number;
};
const DEFAULT_SEARCH_SOURCE_OPTIONS: Required<SearchSourceOptions> = {
  debounceMs: 300,
  pageSize: 10,
} as const;

export abstract class BaseSearchSource<T> implements SearchSource<T> {
  state: StateStore<SearchSourceState<T>>;
  protected pageSize: number;
  abstract readonly type: SearchSourceType;
  protected searchDebounced!: DebouncedExecQueryFunction;

  protected constructor(options?: SearchSourceOptions) {
    const { debounceMs, pageSize } = { ...DEFAULT_SEARCH_SOURCE_OPTIONS, ...options };
    this.pageSize = pageSize;
    this.state = new StateStore<SearchSourceState<T>>(this.initialState);
    this.setDebounceOptions({ debounceMs });
  }

  get lastQueryError() {
    return this.state.getLatestValue().lastQueryError;
  }

  get hasNext() {
    return this.state.getLatestValue().hasNext;
  }

  get hasResults() {
    return Array.isArray(this.state.getLatestValue().items);
  }

  get isActive() {
    return this.state.getLatestValue().isActive;
  }

  get isLoading() {
    return this.state.getLatestValue().isLoading;
  }

  get initialState() {
    return {
      hasNext: true,
      isActive: false,
      isLoading: false,
      items: undefined,
      lastQueryError: undefined,
      next: undefined,
      offset: 0,
      searchQuery: '',
    };
  }

  get items() {
    return this.state.getLatestValue().items;
  }

  get next() {
    return this.state.getLatestValue().next;
  }

  get offset() {
    return this.state.getLatestValue().offset;
  }

  get searchQuery() {
    return this.state.getLatestValue().searchQuery;
  }

  protected abstract query(searchQuery: string): Promise<QueryReturnValue<T>>;

  protected abstract filterQueryResults(items: T[]): T[] | Promise<T[]>;

  setDebounceOptions = ({ debounceMs }: DebounceOptions) => {
    this.searchDebounced = debounce(this.executeQuery.bind(this), debounceMs);
  };

  activate = () => {
    if (this.isActive) return;
    this.state.partialNext({ isActive: true });
  };

  deactivate = () => {
    if (!this.isActive) return;
    this.state.partialNext({ isActive: false });
  };

  canExecuteQuery = (newSearchString?: string) => {
    const hasNewSearchQuery = typeof newSearchString !== 'undefined';
    const searchString = newSearchString ?? this.searchQuery;
    return !!(
      this.isActive &&
      !this.isLoading &&
      (this.hasNext || hasNewSearchQuery) &&
      searchString
    );
  };

  protected getStateBeforeFirstQuery(newSearchString: string): SearchSourceState<T> {
    return {
      ...this.initialState,
      isActive: this.isActive,
      isLoading: true,
      searchQuery: newSearchString,
    };
  }

  protected getStateAfterQuery(
    stateUpdate: Partial<SearchSourceState<T>>,
    isFirstPage: boolean,
  ): SearchSourceState<T> {
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

  async executeQuery(newSearchString?: string) {
    if (!this.canExecuteQuery(newSearchString)) return;
    const hasNewSearchQuery = typeof newSearchString !== 'undefined';
    const searchString = newSearchString ?? this.searchQuery;

    if (hasNewSearchQuery) {
      this.state.next(this.getStateBeforeFirstQuery(newSearchString ?? ''));
    } else {
      this.state.partialNext({ isLoading: true });
    }

    const stateUpdate: Partial<SearchSourceState<T>> = {};
    try {
      const results = await this.query(searchString);
      if (!results) return;
      const { items, next } = results;

      if (next || next === null) {
        stateUpdate.next = next;
        stateUpdate.hasNext = !!next;
      } else {
        stateUpdate.offset = (this.offset ?? 0) + items.length;
        stateUpdate.hasNext = items.length === this.pageSize;
      }

      stateUpdate.items = await this.filterQueryResults(items);
    } catch (e) {
      stateUpdate.lastQueryError = e as Error;
    } finally {
      this.state.next(this.getStateAfterQuery(stateUpdate, hasNewSearchQuery));
    }
  }

  search = (searchQuery?: string) => this.searchDebounced(searchQuery);

  cancelScheduledQuery() {
    this.searchDebounced.cancel();
  }

  resetState() {
    this.state.next(this.initialState);
  }

  resetStateAndActivate() {
    this.resetState();
    this.activate();
  }
}
