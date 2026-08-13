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
import type { AbortOptions } from '../types';

export type DebounceOptions = {
  /** Applies to both short and long queries unless overridden by the options below. */
  debounceMs?: number;
  shortQueryDebounceMs?: number;
  longQueryDebounceMs?: number;
  shortQueryMaxLength?: number;
};

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

const DEFAULT_SHORT_QUERY_DEBOUNCE_MS = 500;
const DEFAULT_LONG_QUERY_DEBOUNCE_MS = 300;
const DEFAULT_SHORT_QUERY_MAX_LENGTH = 2;

// Debounce defaults are resolved by resolveDebounceOptions, not here.
const DEFAULT_SEARCH_SOURCE_OPTIONS: Required<
  Omit<SearchSourceOptions, keyof DebounceOptions>
> = {
  pageSize: 10,
  allowEmptySearchString: false,
  resetOnNewSearchQuery: true,
} as const;

/**
 * An explicit `debounceMs` applies to both buckets, so integrators who already tuned it
 * keep exactly their configured interval. Only when it is absent do the 500/300 defaults
 * kick in.
 */
const resolveDebounceOptions = ({
  debounceMs,
  shortQueryDebounceMs,
  longQueryDebounceMs,
  shortQueryMaxLength,
}: DebounceOptions) => ({
  shortQueryDebounceMs:
    shortQueryDebounceMs ?? debounceMs ?? DEFAULT_SHORT_QUERY_DEBOUNCE_MS,
  longQueryDebounceMs:
    longQueryDebounceMs ?? debounceMs ?? DEFAULT_LONG_QUERY_DEBOUNCE_MS,
  shortQueryMaxLength: shortQueryMaxLength ?? DEFAULT_SHORT_QUERY_MAX_LENGTH,
});

abstract class BaseSearchSourceBase<
  T,
  TExecuteResult extends void | Promise<void>,
> implements ISearchSource<T> {
  state: StateStore<SearchSourceState<T>>;
  pageSize: number;
  protected allowEmptySearchString: boolean;
  protected resetOnNewSearchQuery: boolean;
  protected shortQueryDebounceMs: number = DEFAULT_SHORT_QUERY_DEBOUNCE_MS;
  protected longQueryDebounceMs: number = DEFAULT_LONG_QUERY_DEBOUNCE_MS;
  protected shortQueryMaxLength: number = DEFAULT_SHORT_QUERY_MAX_LENGTH;
  protected searchDebounced!: DebouncedFunc<(searchString?: string) => TExecuteResult>;
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
    // Field initializers run before this body, so setDebounceOptions is already
    // assigned; it only captures getDebounceMs lazily.
    this.setDebounceOptions(options ?? {});
  }

  abstract executeQuery(newSearchString?: string): TExecuteResult;

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
   * Resolved per call, which is what lets the interval switch as the user keeps typing.
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
  extends BaseSearchSourceBase<T, Promise<void>>
  implements SearchSource<T>
{
  /** Aborts the in-flight request, if any, once a newer query is dispatched. */
  protected queryAbortController: AbortController | null = null;

  protected abstract query(
    searchQuery: string,
    options?: AbortOptions,
  ): Promise<QueryReturnValue<T>>;

  protected abstract filterQueryResults(items: T[]): T[] | Promise<T[]>;

  /** Aborts the in-flight request, if any. Returns true when one was aborted. */
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
    // Checked before anything is dispatched, so that the abort below always has a
    // successor that will clear isLoading.
    if (!this.canExecuteQuery(newSearchString)) return;

    // cancel the previous request before dispatching the new one
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
      // A newer query owns the state now - publishing here would clobber it with a
      // stale result (and with the abort error).
      if (!signal.aborted) {
        this.state.next(this.getStateAfterQuery(stateUpdate, hasNewSearchQuery));
      }
    }
  }

  cancelScheduledQuery() {
    this.searchDebounced.cancel();
    // Nothing will dispatch a successor query, so release the loading state the
    // aborted query owned - its own finally block skips the state write.
    if (this.abortInFlightQuery() && this.isLoading) {
      this.state.partialNext({ isLoading: false });
    }
  }
}

// Queries are resolved locally, so there is nothing to cancel here - only the
// dynamic debounce applies.
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
