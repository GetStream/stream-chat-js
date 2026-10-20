import { StateStore } from '@stream-io/state-store';
import { debounce, type DebouncedFunc } from '../utils';
import type {
  QueryReturnValue,
  SearchSourceOptions,
  SearchSourceState,
  SearchSourceType,
} from './types';
import type { APIError } from '../errors';
import { isAPIError, isErrorRetryable } from '../errors';

/**
 * Passed to a search source's `query()`. A source that issues requests forwards it as the request
 * options; one that resolves from local data may ignore the signal.
 */
export type SearchQueryOptions = {
  /** Aborted once a newer query supersedes this one. */
  signal?: AbortSignal;
};

export type DebounceOptions = {
  /** Applies to both short and long queries unless overridden by the options below. */
  debounceMs?: number;
  shortQueryDebounceMs?: number;
  longQueryDebounceMs?: number;
  shortQueryMaxLength?: number;
};

interface ISearchSource<T = any> {
  activate(): void;

  canExecuteQuery(newSearchString?: string): boolean;

  deactivate(): void;

  /** Releases what the source holds outside itself. */
  dispose?(): void;

  readonly hasNext: boolean;
  readonly hasResults: boolean;
  readonly initialState: SearchSourceState<T>;
  readonly isActive: boolean;
  readonly isLoading: boolean;
  readonly items: T[] | undefined;
  readonly lastQueryError: Error | undefined;
  readonly next: string | undefined | null;
  readonly offset: number | undefined;

  /** Takes again what {@link ISearchSource.dispose} released. */
  registerSubscriptions?(): void;

  resetState(): void;

  readonly searchQuery: string;

  readonly state: StateStore<SearchSourceState<T>>;
  readonly type: SearchSourceType;
}

export interface SearchSource<T = any> extends ISearchSource<T> {
  cancelScheduledQuery(): void;
  setDebounceOptions(options: DebounceOptions): void;
  search(text?: string): Promise<void> | undefined;
}

export interface SearchSourceSync<T = any> extends ISearchSource<T> {
  cancelScheduledQuery(): void;
  setDebounceOptions(options: DebounceOptions): void;
  search(text?: string): void;
}

// Debounce defaults are resolved by resolveDebounceOptions, not here.
const DEFAULT_SEARCH_SOURCE_OPTIONS: Required<
  Omit<SearchSourceOptions, keyof DebounceOptions>
> = {
  pageSize: 10,
  allowEmptySearchString: false,
  resetOnNewSearchQuery: true,
} as const;

/** An explicit `debounceMs` applies to both buckets. The 500/300 defaults apply only without it. */
const resolveDebounceOptions = ({
  debounceMs,
  shortQueryDebounceMs,
  longQueryDebounceMs,
  shortQueryMaxLength,
}: DebounceOptions) => ({
  shortQueryDebounceMs: shortQueryDebounceMs ?? debounceMs ?? 500,
  longQueryDebounceMs: longQueryDebounceMs ?? debounceMs ?? 300,
  shortQueryMaxLength: shortQueryMaxLength ?? 2,
});

abstract class BaseSearchSourceBase<
  T,
  R extends void | Promise<void>,
> implements ISearchSource<T> {
  state: StateStore<SearchSourceState<T>>;
  pageSize: number;
  protected allowEmptySearchString: boolean;
  protected resetOnNewSearchQuery: boolean;
  // assigned by setDebounceOptions, which the constructor always calls
  protected shortQueryDebounceMs!: number;
  protected longQueryDebounceMs!: number;
  protected shortQueryMaxLength!: number;
  protected searchDebounced!: DebouncedFunc<(searchString?: string) => R>;
  abstract readonly type: SearchSourceType;

  protected constructor(options?: SearchSourceOptions) {
    const { pageSize, allowEmptySearchString, resetOnNewSearchQuery } = {
      ...DEFAULT_SEARCH_SOURCE_OPTIONS,
      ...options,
    };
    this.pageSize = pageSize;
    this.allowEmptySearchString = allowEmptySearchString;
    this.resetOnNewSearchQuery = resetOnNewSearchQuery;
    this.state = new StateStore<SearchSourceState<T>>(this.initialState);
    // `setDebounceOptions` is a field initializer, so it is already assigned here.
    this.setDebounceOptions(options ?? {});
  }

  abstract executeQuery(newSearchString?: string): R;

  setDebounceOptions = (options: DebounceOptions = {}) => {
    const resolved = resolveDebounceOptions(options);
    this.shortQueryDebounceMs = resolved.shortQueryDebounceMs;
    this.longQueryDebounceMs = resolved.longQueryDebounceMs;
    this.shortQueryMaxLength = resolved.shortQueryMaxLength;
    this.searchDebounced = debounce(this.executeQuery.bind(this), (searchString) =>
      this.getDebounceMs(searchString),
    );
  };

  /**
   * Short queries match too much and are slow server-side, so they get a longer debounce.
   * Resolved per call, so the interval switches as the user keeps typing.
   */
  protected getDebounceMs = (searchString?: string) => {
    const { length } = searchString ?? this.searchQuery;
    return length <= this.shortQueryMaxLength
      ? this.shortQueryDebounceMs
      : this.longQueryDebounceMs;
  };

  /**
   * A new search query preempts an in-flight one; pagination waits for it to finish
   * and needs a next page to fetch.
   */
  protected canDispatchQuery(hasNewSearchQuery: boolean) {
    return hasNewSearchQuery || (!this.isLoading && this.hasNext);
  }

  search = (searchQuery?: string) => this.searchDebounced(searchQuery);

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

  get initialState(): SearchSourceState<T> {
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
      this.canDispatchQuery(hasNewSearchQuery) &&
      (this.allowEmptySearchString || searchString)
    );
  };

  protected getStateBeforeFirstQuery(newSearchString: string): SearchSourceState<T> {
    const initialState = this.initialState;
    const oldItems = this.items;
    const items = this.resetOnNewSearchQuery ? initialState.items : oldItems;
    return {
      ...initialState,
      items,
      isActive: this.isActive,
      isLoading: this.resetOnNewSearchQuery ? true : !oldItems,
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
      lastQueryError: undefined, // cleared unless `stateUpdate` sets it
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
  extends BaseSearchSourceBase<T, Promise<void>>
  implements SearchSource<T>
{
  /** Aborted when a newer query is dispatched. */
  protected queryAbortController: AbortController | null = null;

  protected abstract query(
    searchQuery: string,
    options?: SearchQueryOptions,
  ): Promise<QueryReturnValue<T>>;

  protected abstract filterQueryResults(items: T[]): T[] | Promise<T[]>;

  /** Returns true when a request was aborted. */
  protected abortInFlightQuery() {
    if (!this.queryAbortController) return false;
    this.queryAbortController.abort();
    this.queryAbortController = null;
    return true;
  }

  resetState() {
    // otherwise an in-flight response would repopulate the state we just cleared
    this.abortInFlightQuery();
    super.resetState();
  }

  async executeQuery(newSearchString?: string) {
    // Checked first, so the abort below always has a successor that clears `isLoading`.
    if (!this.canExecuteQuery(newSearchString)) return;

    this.abortInFlightQuery();
    const { signal } = (this.queryAbortController = new AbortController());

    const { hasNewSearchQuery, searchString } =
      this.prepareStateForQuery(newSearchString);

    let stateUpdate: Partial<SearchSourceState<T>> = {};
    try {
      const results = await this.query(searchString, { signal });
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
      // A newer query owns the state: publishing here would overwrite it with a stale result.
      if (!signal.aborted) {
        this.state.next(this.getStateAfterQuery(stateUpdate, hasNewSearchQuery));
      }
    }
  }

  cancelScheduledQuery() {
    this.searchDebounced.cancel();
    // No successor will clear `isLoading`, and the aborted query's `finally` skips the write.
    if (this.abortInFlightQuery() && this.isLoading) {
      this.state.partialNext({ isLoading: false });
    }
  }
}

// Queries resolve locally: nothing to cancel, only the debounce applies.
export abstract class BaseSearchSourceSync<T>
  extends BaseSearchSourceBase<T, void>
  implements SearchSourceSync<T>
{
  protected abstract query(searchQuery: string): QueryReturnValue<T>;

  protected abstract filterQueryResults(items: T[]): T[];

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

  cancelScheduledQuery() {
    this.searchDebounced.cancel();
  }
}
