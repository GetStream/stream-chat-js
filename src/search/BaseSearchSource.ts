import { StateStore } from '../store';
import { debounce, type DebouncedFunc } from '../utils';
import type {
  QueryReturnValue,
  SearchSourceOptions,
  SearchSourceState,
  SearchSourceType,
} from './types';
import type { APIError } from '../errors';
import { isAPIError, isErrorRetryable } from '../errors';

export type DebounceOptions = {
  debounceMs: number;
};
type DebouncedExecQueryFunction = DebouncedFunc<(searchString?: string) => Promise<void>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
interface ISearchSource<T = any> {
  activate(): void;

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

  readonly searchQuery: string;

  readonly state: StateStore<SearchSourceState<T>>;
  readonly type: SearchSourceType;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface SearchSource<T = any> extends ISearchSource<T> {
  cancelScheduledQuery(): void;
  setDebounceOptions(options: DebounceOptions): void;
  search(text?: string): Promise<void> | undefined;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface SearchSourceSync<T = any> extends ISearchSource<T> {
  cancelScheduledQuery(): void;
  setDebounceOptions(options: DebounceOptions): void;
  search(text?: string): void;
}

const DEFAULT_SEARCH_SOURCE_OPTIONS: Required<SearchSourceOptions> = {
  debounceMs: 300,
  pageSize: 10,
} as const;

abstract class BaseSearchSourceBase<T> implements ISearchSource<T> {
  state: StateStore<SearchSourceState<T>>;
  pageSize: number;
  abstract readonly type: SearchSourceType;

  protected constructor(options?: SearchSourceOptions) {
    const { pageSize } = { ...DEFAULT_SEARCH_SOURCE_OPTIONS, ...options };
    this.pageSize = pageSize;
    this.state = new StateStore<SearchSourceState<T>>(this.initialState);
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

  protected prepareStateForQuery(newSearchString?: string) {
    const hasNewSearchQuery = typeof newSearchString !== 'undefined';
    const searchString = newSearchString ?? this.searchQuery;

    if (hasNewSearchQuery) {
      this.state.next(this.getStateBeforeFirstQuery(newSearchString ?? ''));
    } else {
      this.state.partialNext({ isLoading: true });
    }

    return { searchString, hasNewSearchQuery };
  }

  protected updatePaginationStateFromQuery(result: QueryReturnValue<T>) {
    const { items, next } = result;

    const stateUpdate: Partial<SearchSourceState<T>> = {};
    if (Object.prototype.hasOwnProperty.call(result, 'next')) {
      stateUpdate.next = next;
      stateUpdate.hasNext = !!next;
    } else {
      stateUpdate.offset = (this.offset ?? 0) + items.length;
      stateUpdate.hasNext = items.length === this.pageSize;
    }

    return stateUpdate;
  }

  resetState() {
    this.state.next(this.initialState);
  }

  resetStateAndActivate() {
    this.resetState();
    this.activate();
  }
}

export abstract class BaseSearchSource<T>
  extends BaseSearchSourceBase<T>
  implements SearchSource<T>
{
  protected searchDebounced!: DebouncedExecQueryFunction;

  constructor(options?: SearchSourceOptions) {
    const { debounceMs } = { ...DEFAULT_SEARCH_SOURCE_OPTIONS, ...options };
    super(options);
    this.setDebounceOptions({ debounceMs });
  }

  protected abstract query(searchQuery: string): Promise<QueryReturnValue<T>>;

  protected abstract filterQueryResults(items: T[]): T[] | Promise<T[]>;

  setDebounceOptions = ({ debounceMs }: DebounceOptions) => {
    this.searchDebounced = debounce(this.executeQuery.bind(this), debounceMs);
  };

  async executeQuery(newSearchString?: string) {
    if (!this.canExecuteQuery(newSearchString)) return;

    const { hasNewSearchQuery, searchString } =
      this.prepareStateForQuery(newSearchString);

    let stateUpdate: Partial<SearchSourceState<T>> = {};
    try {
      const results = await this.query(searchString);
      if (!results) return;

      const { items } = results;
      stateUpdate = this.updatePaginationStateFromQuery(results);
      stateUpdate.items = await this.filterQueryResults(items);
    } catch (e) {
      stateUpdate.lastQueryError = e as Error;
      if (isAPIError(e as Error) && !isErrorRetryable(e as APIError)) {
        stateUpdate.hasNext = false;
      }
    } finally {
      this.state.next(this.getStateAfterQuery(stateUpdate, hasNewSearchQuery));
    }
  }

  search = (searchQuery?: string) => this.searchDebounced(searchQuery);

  cancelScheduledQuery() {
    this.searchDebounced.cancel();
  }
}

export abstract class BaseSearchSourceSync<T>
  extends BaseSearchSourceBase<T>
  implements SearchSourceSync<T>
{
  protected searchDebounced!: DebouncedExecQueryFunction;

  constructor(options?: SearchSourceOptions) {
    const { debounceMs } = { ...DEFAULT_SEARCH_SOURCE_OPTIONS, ...options };
    super(options);
    this.setDebounceOptions({ debounceMs });
  }

  protected abstract query(searchQuery: string): QueryReturnValue<T>;

  protected abstract filterQueryResults(items: T[]): T[];

  setDebounceOptions = ({ debounceMs }: DebounceOptions) => {
    this.searchDebounced = debounce(this.executeQuery.bind(this), debounceMs);
  };

  executeQuery(newSearchString?: string) {
    if (!this.canExecuteQuery(newSearchString)) return;

    const { hasNewSearchQuery, searchString } =
      this.prepareStateForQuery(newSearchString);

    let stateUpdate: Partial<SearchSourceState<T>> = {};
    try {
      const results = this.query(searchString);
      if (!results) return;

      const { items } = results;
      stateUpdate = this.updatePaginationStateFromQuery(results);
      stateUpdate.items = this.filterQueryResults(items);
    } catch (e) {
      stateUpdate.lastQueryError = e as Error;
      if (isAPIError(e as Error) && !isErrorRetryable(e as APIError)) {
        stateUpdate.hasNext = false;
      }
    } finally {
      this.state.next(this.getStateAfterQuery(stateUpdate, hasNewSearchQuery));
    }
  }

  search = (searchQuery?: string) => this.searchDebounced(searchQuery);

  cancelScheduledQuery() {
    this.searchDebounced.cancel();
  }
}
