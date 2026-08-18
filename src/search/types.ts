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
  /**
   * Legacy single debounce interval. When set, it applies to both short and long queries,
   * unless overridden by `shortQueryDebounceMs` / `longQueryDebounceMs`.
   */
  debounceMs?: number;
  /**
   * Debounce interval for queries no longer than `shortQueryMaxLength`. Such queries have
   * low selectivity and are expensive server-side, so they are debounced harder.
   * Defaults to 500ms.
   */
  shortQueryDebounceMs?: number;
  /** Debounce interval for queries longer than `shortQueryMaxLength`. Defaults to 300ms. */
  longQueryDebounceMs?: number;
  /** Query length (inclusive) that still counts as short. Defaults to 2. */
  shortQueryMaxLength?: number;
  pageSize?: number;
  /** When `true`, the source can execute queries with an empty search string (defaults to `false`). */
  allowEmptySearchString?: boolean;
  /** When `true`, previously loaded items are cleared at the start of a new search query (defaults to `true`). */
  resetOnNewSearchQuery?: boolean;
};

export type SearchSourceType = 'channels' | 'users' | 'messages' | (string & {});
export type QueryReturnValue<T> = { items: T[]; next?: string | null };
