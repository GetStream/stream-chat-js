import type { DebouncedFunc } from './utils';
import { debounce } from './utils';
import { StateStore } from './store';
import type { Channel } from './channel';
import type { StreamChat } from './client';
import type {
  ChannelFilters,
  ChannelOptions,
  ChannelSort,
  MessageFilters,
  MessageResponse,
  SearchMessageSort,
  SearchOptions,
  UserFilters,
  UserOptions,
  UserResponse,
  UserSort,
} from './types';

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

export class UserSearchSource extends BaseSearchSource<UserResponse> {
  readonly type = 'users';
  private client: StreamChat;
  filters: UserFilters | undefined;
  sort: UserSort | undefined;
  searchOptions: Omit<UserOptions, 'limit' | 'offset'> | undefined;

  constructor(client: StreamChat, options?: SearchSourceOptions) {
    super(options);
    this.client = client;
  }

  protected async query(searchQuery: string) {
    const filters = {
      $or: [
        { id: { $autocomplete: searchQuery } },
        { name: { $autocomplete: searchQuery } },
      ],
      ...this.filters,
    } as UserFilters;
    const sort = { id: 1, ...this.sort } as UserSort;
    const options = { ...this.searchOptions, limit: this.pageSize, offset: this.offset };
    const { users } = await this.client.queryUsers(filters, sort, options);
    return { items: users };
  }

  protected filterQueryResults(items: UserResponse[]) {
    return items.filter((u) => u.id !== this.client.user?.id);
  }
}

export class ChannelSearchSource extends BaseSearchSource<Channel> {
  readonly type = 'channels';
  private client: StreamChat;
  filters: ChannelFilters | undefined;
  sort: ChannelSort | undefined;
  searchOptions: Omit<ChannelOptions, 'limit' | 'offset'> | undefined;

  constructor(client: StreamChat, options?: SearchSourceOptions) {
    super(options);
    this.client = client;
  }

  protected async query(searchQuery: string) {
    const filters = {
      members: { $in: [this.client.userID] },
      name: { $autocomplete: searchQuery },
      ...this.filters,
    } as ChannelFilters;
    const sort = this.sort ?? {};
    const options = { ...this.searchOptions, limit: this.pageSize, offset: this.offset };
    const items = await this.client.queryChannels(filters, sort, options);
    return { items };
  }

  protected filterQueryResults(items: Channel[]) {
    return items;
  }
}

export class MessageSearchSource extends BaseSearchSource<MessageResponse> {
  readonly type = 'messages';
  private client: StreamChat;
  messageSearchChannelFilters: ChannelFilters | undefined;
  messageSearchFilters: MessageFilters | undefined;
  messageSearchSort: SearchMessageSort | undefined;
  channelQueryFilters: ChannelFilters | undefined;
  channelQuerySort: ChannelSort | undefined;
  channelQueryOptions: Omit<ChannelOptions, 'limit' | 'offset'> | undefined;

  constructor(client: StreamChat, options?: SearchSourceOptions) {
    super(options);
    this.client = client;
  }

  protected async query(searchQuery: string) {
    if (!this.client.userID) return { items: [] };

    const channelFilters: ChannelFilters = {
      members: { $in: [this.client.userID] },
      ...this.messageSearchChannelFilters,
    } as ChannelFilters;

    const messageFilters: MessageFilters = {
      text: searchQuery,
      type: 'regular', // FIXME: type: 'reply' resp. do not filter by type and allow to jump to a message in a thread - missing support
      ...this.messageSearchFilters,
    } as MessageFilters;

    const sort: SearchMessageSort = {
      created_at: -1,
      ...this.messageSearchSort,
    };

    const options = {
      limit: this.pageSize,
      next: this.next,
      sort,
    } as SearchOptions;

    const { next, results } = await this.client.search(
      channelFilters,
      messageFilters,
      options,
    );
    const items = results.map(({ message }) => message);

    const cids = Array.from(
      items.reduce((acc, message) => {
        if (message.cid && !this.client.activeChannels[message.cid]) acc.add(message.cid);
        return acc;
      }, new Set<string>()), // keep the cids unique
    );
    const allChannelsLoadedLocally = cids.length === 0;
    if (!allChannelsLoadedLocally) {
      await this.client.queryChannels(
        {
          cid: { $in: cids },
          ...this.channelQueryFilters,
        } as ChannelFilters,
        {
          last_message_at: -1,
          ...this.channelQuerySort,
        },
        this.channelQueryOptions,
      );
    }

    return { items, next };
  }

  protected filterQueryResults(items: MessageResponse[]) {
    return items;
  }
}

export type SearchControllerState = {
  isActive: boolean;
  searchQuery: string;
  sources: SearchSource[];
};

export type InternalSearchControllerState = {
  // FIXME: focusedMessage should live in a MessageListController class that does not exist yet.
  //  This state prop should be then removed
  focusedMessage?: MessageResponse;
};

export type SearchControllerConfig = {
  // The controller will make sure there is always exactly one active source. Enabled by default.
  keepSingleActiveSource: boolean;
};

export type SearchControllerOptions = {
  config?: Partial<SearchControllerConfig>;
  sources?: SearchSource[];
};

export class SearchController {
  /**
   * Not intended for direct use by integrators, might be removed without notice resulting in
   * broken integrations.
   */
  _internalState: StateStore<InternalSearchControllerState>;
  state: StateStore<SearchControllerState>;
  config: SearchControllerConfig;

  constructor({ config, sources }: SearchControllerOptions = {}) {
    this.state = new StateStore<SearchControllerState>({
      isActive: false,
      searchQuery: '',
      sources: sources ?? [],
    });
    this._internalState = new StateStore<InternalSearchControllerState>({});
    this.config = { keepSingleActiveSource: true, ...config };
  }
  get hasNext() {
    return this.sources.some((source) => source.hasNext);
  }

  get sources() {
    return this.state.getLatestValue().sources;
  }

  get activeSources() {
    return this.state.getLatestValue().sources.filter((s) => s.isActive);
  }

  get isActive() {
    return this.state.getLatestValue().isActive;
  }

  get searchQuery() {
    return this.state.getLatestValue().searchQuery;
  }

  get searchSourceTypes(): Array<SearchSource['type']> {
    return this.sources.map((s) => s.type);
  }

  addSource = (source: SearchSource) => {
    this.state.partialNext({
      sources: [...this.sources, source],
    });
  };

  getSource = (sourceType: SearchSource['type']) =>
    this.sources.find((s) => s.type === sourceType);

  removeSource = (sourceType: SearchSource['type']) => {
    const newSources = this.sources.filter((s) => s.type !== sourceType);
    if (newSources.length === this.sources.length) return;
    this.state.partialNext({ sources: newSources });
  };

  activateSource = (sourceType: SearchSource['type']) => {
    const source = this.getSource(sourceType);
    if (!source || source.isActive) return;
    if (this.config.keepSingleActiveSource) {
      this.sources.forEach((s) => {
        if (s.type !== sourceType) {
          s.deactivate();
        }
      });
    }
    source.activate();
    this.state.partialNext({ sources: [...this.sources] });
  };

  deactivateSource = (sourceType: SearchSource['type']) => {
    const source = this.getSource(sourceType);
    if (!source?.isActive) return;
    if (this.activeSources.length === 1) return;
    source.deactivate();
    this.state.partialNext({ sources: [...this.sources] });
  };

  activate = () => {
    if (!this.activeSources.length) {
      const sourcesToActivate = this.config.keepSingleActiveSource
        ? this.sources.slice(0, 1)
        : this.sources;
      sourcesToActivate.forEach((s) => s.activate());
    }
    if (this.isActive) return;
    this.state.partialNext({ isActive: true });
  };

  search = async (searchQuery?: string) => {
    const searchedSources = this.activeSources;
    this.state.partialNext({
      searchQuery,
    });
    await Promise.all(searchedSources.map((source) => source.search(searchQuery)));
  };

  cancelSearchQueries = () => {
    this.activeSources.forEach((s) => s.cancelScheduledQuery());
  };

  clear = () => {
    this.cancelSearchQueries();
    this.sources.forEach((source) =>
      source.state.next({ ...source.initialState, isActive: source.isActive }),
    );
    this.state.next((current) => ({
      ...current,
      isActive: true,
      queriesInProgress: [],
      searchQuery: '',
    }));
  };

  exit = () => {
    this.cancelSearchQueries();
    this.sources.forEach((source) =>
      source.state.next({ ...source.initialState, isActive: source.isActive }),
    );
    this.state.next((current) => ({
      ...current,
      isActive: false,
      queriesInProgress: [],
      searchQuery: '',
    }));
  };
}
