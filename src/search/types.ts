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
  /** Debounce interval for short and long queries, unless overridden by the options below. */
  debounceMs?: number;
  /**
   * Debounce interval for queries no longer than `shortQueryMaxLength` (low selectivity, expensive
   * server-side). Defaults to `debounceMs`, else 500ms.
   */
  shortQueryDebounceMs?: number;
  /** Debounce interval for longer queries. Defaults to `debounceMs`, else 300ms. */
  longQueryDebounceMs?: number;
  /** Query length (inclusive) that still counts as short. Defaults to 2. */
  shortQueryMaxLength?: number;
  pageSize?: number;
  /** Allows queries with an empty search string. Defaults to `false`. */
  allowEmptySearchString?: boolean;
  /** Clears loaded items when a new search query starts. Defaults to `true`. */
  resetOnNewSearchQuery?: boolean;
};

export type SearchSourceType = 'channels' | 'users' | 'messages' | (string & {});
export type QueryReturnValue<T> = { items: T[]; next?: string | null };
