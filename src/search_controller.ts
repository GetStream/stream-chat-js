import { debounce, DebouncedFunc } from './utils';
import { StateStore } from './store';
import type { Channel } from './channel';
import type { StreamChat } from './client';
import type {
  ChannelFilters,
  ChannelOptions,
  ChannelSort,
  DefaultGenerics,
  ExtendableGenerics,
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
export type QueryReturnValue<T> = { items: T[]; next?: string };
export type DebounceOptions = {
  debounceMs: number;
};
type DebouncedExecQueryFunction = DebouncedFunc<(searchString?: string) => Promise<void>>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface SearchSource<T = any> {
  activate(): void;
  deactivate(): void;
  readonly hasNext: boolean;
  readonly hasResults: boolean;
  readonly initialState: SearchSourceState<T>;
  readonly isActive: boolean;
  readonly isLoading: boolean;
  readonly items: T[] | undefined;
  readonly lastQueryError: Error | undefined;
  readonly next: string | undefined;
  readonly offset: number | undefined;
  resetState(): void;
  search(text?: string): void;
  searchDebounced: DebouncedExecQueryFunction;
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
  next?: string;
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
  searchDebounced!: DebouncedExecQueryFunction;

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

  async executeQuery(newSearchString?: string) {
    const hasNewSearchQuery = typeof newSearchString !== 'undefined';
    const searchString = newSearchString ?? this.searchQuery;
    if (!this.isActive || this.isLoading || (!this.hasNext && !hasNewSearchQuery) || !searchString) return;

    if (hasNewSearchQuery) {
      this.state.next({
        ...this.initialState,
        isActive: this.isActive,
        isLoading: true,
        searchQuery: newSearchString ?? '',
      });
    } else {
      this.state.partialNext({ isLoading: true });
    }

    const stateUpdate: Partial<SearchSourceState<T>> = {};
    try {
      const results = await this.query(searchString);
      if (!results) return;
      const { items, next } = results;

      if (next) {
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
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      this.state.next(({ lastQueryError, ...current }: SearchSourceState<T>) => ({
        ...current,
        ...stateUpdate,
        isLoading: false,
        items: [...(current.items ?? []), ...(stateUpdate.items || [])],
      }));
    }
  }

  search = (searchQuery?: string) => {
    this.searchDebounced(searchQuery);
  };

  resetState() {
    this.state.next(this.initialState);
  }
}

export class UserSearchSource<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> extends BaseSearchSource<
  UserResponse<StreamChatGenerics>
> {
  readonly type = 'users';
  private client: StreamChat<StreamChatGenerics>;
  filters: UserFilters<StreamChatGenerics> | undefined;
  sort: UserSort<StreamChatGenerics> | undefined;
  searchOptions: Omit<UserOptions, 'limit' | 'offset'> | undefined;

  constructor(client: StreamChat<StreamChatGenerics>, options?: SearchSourceOptions) {
    super(options);
    this.client = client;
  }

  protected async query(searchQuery: string) {
    const filters = {
      $or: [{ id: { $autocomplete: searchQuery } }, { name: { $autocomplete: searchQuery } }],
      ...this.filters,
    } as UserFilters<StreamChatGenerics>;
    const sort = { id: 1, ...this.sort } as UserSort<StreamChatGenerics>;
    const options = { ...this.searchOptions, limit: this.pageSize, offset: this.offset };
    const { users } = await this.client.queryUsers(filters, sort, options);
    return { items: users };
  }

  protected filterQueryResults(items: UserResponse<StreamChatGenerics>[]) {
    return items.filter((u) => u.id !== this.client.user?.id);
  }
}

export class ChannelSearchSource<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> extends BaseSearchSource<Channel<StreamChatGenerics>> {
  readonly type = 'channels';
  private client: StreamChat<StreamChatGenerics>;
  filters: ChannelFilters<StreamChatGenerics> | undefined;
  sort: ChannelSort<StreamChatGenerics> | undefined;
  searchOptions: Omit<ChannelOptions, 'limit' | 'offset'> | undefined;

  constructor(client: StreamChat<StreamChatGenerics>, options?: SearchSourceOptions) {
    super(options);
    this.client = client;
  }

  protected async query(searchQuery: string) {
    const filters = {
      members: { $in: [this.client.userID] },
      name: { $autocomplete: searchQuery },
      ...this.filters,
    } as ChannelFilters<StreamChatGenerics>;
    const sort = this.sort ?? {};
    const options = { ...this.searchOptions, limit: this.pageSize, offset: this.offset };
    const items = await this.client.queryChannels(filters, sort, options);
    return { items };
  }

  protected filterQueryResults(items: Channel<StreamChatGenerics>[]) {
    return items;
  }
}

export class MessageSearchSource<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> extends BaseSearchSource<MessageResponse<StreamChatGenerics>> {
  readonly type = 'messages';
  private client: StreamChat<StreamChatGenerics>;
  messageSearchChannelFilters: ChannelFilters<StreamChatGenerics> | undefined;
  messageSearchFilters: MessageFilters<StreamChatGenerics> | undefined;
  messageSearchSort: SearchMessageSort<StreamChatGenerics> | undefined;
  channelQueryFilters: ChannelFilters<StreamChatGenerics> | undefined;
  channelQuerySort: ChannelSort<StreamChatGenerics> | undefined;
  channelQueryOptions: Omit<ChannelOptions, 'limit' | 'offset'> | undefined;

  constructor(client: StreamChat<StreamChatGenerics>, options?: SearchSourceOptions) {
    super(options);
    this.client = client;
  }

  protected async query(searchQuery: string) {
    if (!this.client.userID) return { items: [] };

    const channelFilters: ChannelFilters<StreamChatGenerics> = {
      members: { $in: [this.client.userID] },
      ...this.messageSearchChannelFilters,
    } as ChannelFilters<StreamChatGenerics>;

    const messageFilters: MessageFilters<StreamChatGenerics> = {
      text: searchQuery,
      type: 'regular', // FIXME: type: 'reply' resp. do not filter by type and allow to jump to a message in a thread - missing support
      ...this.messageSearchFilters,
    } as MessageFilters<StreamChatGenerics>;

    const sort: SearchMessageSort<StreamChatGenerics> = {
      created_at: -1,
      ...this.messageSearchSort,
    };

    const options = {
      limit: this.pageSize,
      next: this.next,
      sort,
    } as SearchOptions<StreamChatGenerics>;

    const { next, results } = await this.client.search(channelFilters, messageFilters, options);
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
        } as ChannelFilters<StreamChatGenerics>,
        {
          last_message_at: -1,
          ...this.channelQuerySort,
        },
        this.channelQueryOptions,
      );
    }

    return { items, next };
  }

  protected filterQueryResults(items: MessageResponse<StreamChatGenerics>[]) {
    return items;
  }
}

export type DefaultSearchSources<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = [
  UserSearchSource<StreamChatGenerics>,
  ChannelSearchSource<StreamChatGenerics>,
  MessageSearchSource<StreamChatGenerics>,
];

export type SearchControllerState = {
  isActive: boolean;
  searchQuery: string;
  sources: SearchSource[];
};

export type InternalSearchControllerState<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  // FIXME: focusedMessage should live in a MessageListController class that does not exist yet.
  //  This state prop should be then removed
  focusedMessage?: MessageResponse<StreamChatGenerics>;
};

export type SearchControllerConfig = {
  // The controller will make sure there is always exactly one active source. Enabled by default.
  keepSingleActiveSource: boolean;
};

export type SearchControllerOptions = {
  config?: Partial<SearchControllerConfig>;
  sources?: SearchSource[];
};

export class SearchController<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> {
  /**
   * Not intended for direct use by integrators, might be removed without notice resulting in
   * broken integrations.
   */
  _internalState: StateStore<InternalSearchControllerState<StreamChatGenerics>>;
  state: StateStore<SearchControllerState>;
  config: SearchControllerConfig;

  constructor({ config, sources }: SearchControllerOptions = {}) {
    this.state = new StateStore<SearchControllerState>({
      isActive: false,
      searchQuery: '',
      sources: sources ?? [],
    });
    this._internalState = new StateStore<InternalSearchControllerState<StreamChatGenerics>>({});
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

  getSource = (sourceType: SearchSource['type']) => this.sources.find((s) => s.type === sourceType);

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
      const sourcesToActivate = this.config.keepSingleActiveSource ? this.sources.slice(0, 1) : this.sources;
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
    this.activeSources.forEach((s) => s.searchDebounced.cancel());
  };

  clear = () => {
    this.cancelSearchQueries();
    this.sources.forEach((source) => source.state.next({ ...source.initialState, isActive: source.isActive }));
    this.state.next((current) => ({
      ...current,
      isActive: true,
      queriesInProgress: [],
      searchQuery: '',
    }));
  };

  exit = () => {
    this.cancelSearchQueries();
    this.sources.forEach((source) => source.state.next({ ...source.initialState, isActive: source.isActive }));
    this.state.next((current) => ({
      ...current,
      isActive: false,
      queriesInProgress: [],
      searchQuery: '',
    }));
  };
}
