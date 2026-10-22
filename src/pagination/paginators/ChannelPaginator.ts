import type {
  AnyInterval,
  ItemCoordinates,
  PaginationQueryParams,
  PaginationQueryReturnValue,
  PaginationQueryShapeChangeIdentifier,
  PaginatorOptions,
  PaginatorState,
  PostQueryReconcileParams,
  SetPaginatorItemsParams,
} from './BasePaginator';
import { BasePaginator } from './BasePaginator';
import { DEFAULT_QUERY_CHANNELS_RETRY_COUNT } from '../../constants';
import { chatLoggerSystem } from '../../logger';
import type { FilterBuilderOptions } from '../FilterBuilder';
import { FilterBuilder } from '../FilterBuilder';
import { makeComparator } from '../sortCompiler';
import { filterConstrainsField, itemMatchesFilter } from '../filterCompiler';
import { StoreBackedItemIndex } from '../../entityStore/StoreBackedItemIndex';
import type { EntityStore } from '../../entityStore/EntityStore';
import { generateUUIDv4 } from '../../utils';
import type { StreamChat } from '../../client';
import type { Channel } from '../../channel';
import type {
  ChannelFilters,
  ChannelOptions,
  ChannelStateOptions,
  ParsedPredefinedFilterResponse,
  QueryChannelsRequest,
  SortParamRequest,
} from '../../types';
import type { FieldToDataResolver, PathResolver } from '../types.normalization';
import { resolveDotPathValue } from '../utility.normalization';
import { isEqual } from '../../utils/mergeWith/mergeWithCore';

const hasSameItems = (current: Channel[] | undefined, next: Channel[] | undefined) => {
  if (current === next) return false;
  if (!current || !next || current.length !== next.length) return false;
  for (let i = 0; i < next.length; i++) if (current[i] !== next[i]) return false;
  return true;
};

/**
 * The most loaded channels a reconnect re-queries (`recoverLoadedItems`). Those loaded past it are
 * dropped, and load again when the list is scrolled to them.
 */
const MAX_RECOVERED_ITEMS = 150;

const DEFAULT_BACKEND_SORT: SortParamRequest[] = [
  { direction: -1, field: 'last_message_at' },
  { direction: -1, field: 'updated_at' },
];

/**
 * The `queryChannels` request this paginator sends, plus the client-only `stateOptions`. It is the
 * request's own shape because the same object goes on the wire, keys the offline-db cache and is
 * compared for query-shape changes.
 */
export type ChannelQueryShape = QueryChannelsRequest & {
  /** Not part of the request: controls how the response is applied to client state. */
  stateOptions?: ChannelStateOptions;
};

export type ChannelPaginatorState = PaginatorState<Channel>;

/**
 * Request options sent with every page query (`state`, `watch`, `presence`, `message_limit`, ...).
 * `limit` and `offset` belong to the paginator: set the page size with `paginatorOptions.pageSize`.
 */
export type ChannelPaginatorRequestOptions = Partial<
  Omit<ChannelOptions, 'offset' | 'limit'>
>;

export type ChannelSortComparatorFactoryParams = {
  /** The effective sort the comparator is built for (a backend-resolved template, if any). */
  sort: SortParamRequest[];
  /** The comparator `ChannelPaginator` would use: delegate to it for the fields you do not handle. */
  defaultComparator: (a: Channel, b: Channel) => number;
};

/**
 * Produces the comparator that orders the channels. Consulted on every rebuild (construction,
 * `sort` change, backend-resolved predefined sort), so later sort changes do not overwrite it.
 */
export type ChannelSortComparatorFactory = (
  params: ChannelSortComparatorFactoryParams,
) => (a: Channel, b: Channel) => number;

export type ChannelPaginatorOptions = {
  client: StreamChat;
  channelStateOptions?: ChannelStateOptions;
  filterBuilderOptions?: FilterBuilderOptions<ChannelFilters>;
  filters?: ChannelFilters;
  id?: string;
  paginatorOptions?: PaginatorOptions<Channel, ChannelQueryShape>;
  requestOptions?: ChannelPaginatorRequestOptions;
  sort?: SortParamRequest[];
  sortComparatorFactory?: ChannelSortComparatorFactory;
  /**
   * The channel store backing the list's index. Defaults to `client.channelManager`'s store, shared
   * by every list.
   *
   * @internal
   */
  store?: EntityStore<Channel>;
};

/** The query without its page: shapes with the same identity continue one pagination. */
const getQueryIdentity = (queryShape: ChannelQueryShape | undefined) => {
  if (!queryShape) return queryShape;
  const {
    limit: _,
    member_limit: __,
    message_limit: ___,
    offset: ____,

    ...identity
  } = queryShape;
  return identity;
};

const hasPaginationQueryShapeChanged: PaginationQueryShapeChangeIdentifier<
  ChannelQueryShape
> = (prevQueryShape, nextQueryShape) =>
  !isEqual(getQueryIdentity(prevQueryShape), getQueryIdentity(nextQueryShape));

const archivedFilterResolver: FieldToDataResolver<Channel> = {
  matchesField: (field) => field === 'archived',
  resolve: (channel) => channel.state.membership.archived_at != null,
};

// Resolvers needing the user or the mute list use the list's client, not `channel.getClient()`: that
// throws on a disposed channel, which must still sort and filter so a list can locate and drop it.

const createAppBannedFilterResolver = (
  client: StreamChat,
): FieldToDataResolver<Channel> => ({
  matchesField: (field) => field === 'app_banned',
  resolve: (channel) => {
    const ownUserId = client.userId;
    const otherMembers = Object.values(channel.state.members).filter(
      ({ user }) => user?.id !== ownUserId,
    );
    // Only applies to channels with exactly 2 members.
    if (otherMembers.length !== 1) return false;
    const otherMember = otherMembers[0];
    return otherMember.user?.banned ? 'only' : 'excluded';
  },
});

const createHasUnreadFilterResolver = (
  client: StreamChat,
): FieldToDataResolver<Channel> => ({
  matchesField: (field) => field === 'has_unread',
  resolve: (channel) => {
    const ownUserId = client.userId;
    return (
      ownUserId &&
      channel.state.read[ownUserId] &&
      channel.state.read[ownUserId].unread_messages > 0
    );
  },
});

const hiddenFilterResolver: FieldToDataResolver<Channel> = {
  matchesField: (field) => field === 'hidden',
  // `hidden` is optional on the response: coerce so `{ hidden: false }` matches channels without it.
  resolve: (channel) => !!channel.data?.hidden,
};

const lastUpdatedFilterResolver: FieldToDataResolver<Channel> = {
  matchesField: (field) => field === 'last_updated',
  // the server uses the creation time for a channel without messages
  resolve: (channel) =>
    channel.messagePaginator.lastMessageAt ?? channel.data?.created_at,
};

const membersFilterResolver: FieldToDataResolver<Channel> = {
  matchesField: (field) => field === 'members',
  resolve: (channel) => {
    const ids = channel.state.members
      ? Object.values(channel.state.members).reduce<string[]>((ids, member) => {
          if (member.user?.id) {
            ids.push(member.user?.id);
          }
          return ids;
        }, [])
      : [];
    // Only a page of a large channel's members may be loaded, but the own membership always is, so
    // `members: { $in: [ownId] }` holds.
    const { membership } = channel.state;
    const ownId = membership?.user?.id ?? membership?.user_id;
    if (ownId && !ids.includes(ownId)) ids.push(ownId);
    return ids;
  },
};

const memberUserNameFilterResolver: FieldToDataResolver<Channel> = {
  matchesField: (field) => field === 'member.user.name',
  resolve: (channel) =>
    channel.state.members
      ? Object.values(channel.state.members).reduce<string[]>((names, member) => {
          if (member.user?.name) {
            names.push(member.user.name);
          }
          return names;
        }, [])
      : [],
};

const pinnedFilterResolver: FieldToDataResolver<Channel> = {
  matchesField: (field) => field === 'pinned',
  resolve: (channel) => channel.state.membership.pinned_at != null,
};

const createMutedFilterResolver = (client: StreamChat): FieldToDataResolver<Channel> => ({
  matchesField: (field) => field === 'muted',
  // Mute state lives on the client (`client.mutedChannels`), not in `channel.data`.
  resolve: (channel) => client._muteStatus(channel.cid).muted,
});

/**
 * A channel field by path: from `channel.data`, else from `channel.data.custom` (where a response
 * keeps `name` and custom fields). `type`, `id` and `cid` come from the instance, since
 * `channel.data` has them only after a query.
 */
const resolveChannelDataValue = (channel: Channel, path: string) => {
  if (path === 'type' || path === 'id' || path === 'cid') return channel[path];
  const value = resolveDotPathValue(channel.data, path);
  return value !== undefined ? value : resolveDotPathValue(channel.data?.custom, path);
};

const dataFieldFilterResolver: FieldToDataResolver<Channel> = {
  matchesField: () => true,
  resolve: resolveChannelDataValue,
};

// Channel data is split between `Channel.data` and `Channel.state`.
const createChannelSortPathResolver = (client: StreamChat): PathResolver<Channel> => {
  const hasUnreadResolver = createHasUnreadFilterResolver(client);
  return (channel, path) => {
    switch (path) {
      case 'last_message_at':
        return channel.messagePaginator.lastMessageAt;
      case 'has_unread': {
        return hasUnreadResolver.resolve(channel, path);
      }
      case 'last_updated': {
        return lastUpdatedFilterResolver.resolve(channel, path) ?? 0;
      }
      case 'pinned_at':
        return channel.state.membership.pinned_at;
      case 'unread_count': {
        const userId = client.userId;
        // a channel without a read entry for the user has nothing unread
        return userId ? (channel.state.read[userId]?.unread_messages ?? 0) : 0;
      }
      default:
        return resolveChannelDataValue(channel, path);
    }
  };
};

/**
 * A paginated channel list. `staticFilters` are the filters this client asked for, `filterBuilder`
 * adds dynamic ones from its reactive context (merged over the static ones on every build). For a
 * `predefined_filter` query the backend reports what it applied (`predefinedFilter`), which wins
 * over `staticFilters` in `effectiveFilters` (and over `sort` in `effectiveSort`).
 *
 * `buildQueryFilters()` (sent to the server, offline-db query key) uses the local filters only and
 * `buildMatchFilters()` (local matching) uses `effectiveFilters`. Do not swap them: sending the
 * resolved filter back changes the query shape mid-pagination, and matching on the local filter
 * admits channels the list excludes.
 *
 * `sortComparator` is derived from `effectiveSort` and rebuilt when it changes, so do not assign
 * it: use `sortComparatorFactory` or override `buildSortComparator`.
 */
export class ChannelPaginator extends BasePaginator<Channel, ChannelQueryShape> {
  private readonly _id: string;
  private client: StreamChat;
  protected _staticFilters: ChannelFilters | undefined;
  protected _sort: SortParamRequest[] | undefined;
  protected _options: ChannelPaginatorRequestOptions | undefined;
  protected _channelStateOptions: ChannelStateOptions | undefined;
  protected _nextQueryShape: ChannelQueryShape | undefined;
  /** Backend-reported metadata of the last `predefined_filter` query (see `predefinedFilter`). */
  protected _predefinedFilter: ParsedPredefinedFilterResponse | undefined;
  /** Metadata of the in-flight response, committed by `postQueryReconcile` on a first page only. */
  private _pendingPredefinedFilter: ParsedPredefinedFilterResponse | undefined;
  /**
   * True while the loaded items came only from the offline cache (seeded by `setItems`, never
   * confirmed by a query). The seed's offset and query shape would make the next query a
   * continuation, but a cache has no pagination position, so `executeQuery` forces a first page that
   * keeps the items.
   */
  private _itemsLoadedFromOfflineDB = false;
  /** The query in flight refreshes a cache-only window, so its response replaces the window. */
  private _replaceOfflineSeedOnResponse = false;
  /** The query handed to the sync manager, from the cache read until it runs. See `executeQuery`. */
  private _queryAwaitingSync: ChannelQueryShape | undefined;
  /** The cids of the page the latest query returned, `undefined` when it failed. */
  private _lastPageCids: string[] | undefined;
  protected _sortComparatorFactory: ChannelSortComparatorFactory | undefined;
  sortComparator: (a: Channel, b: Channel) => number;
  filterBuilder: FilterBuilder<ChannelFilters>;

  constructor({
    channelStateOptions,
    client,
    id,
    filterBuilderOptions,
    filters,
    paginatorOptions,
    requestOptions,
    sort,
    sortComparatorFactory,
    store,
  }: ChannelPaginatorOptions) {
    super({
      hasPaginationQueryShapeChanged,
      // the index is this list's holder in the store: a channel stays stored while the list lists it
      createItemIndex: (owner) =>
        new StoreBackedItemIndex<Channel>({
          getEntityId: (channel) => channel.cid,
          holderName: 'channel-paginator',
          owner: owner as ChannelPaginator,
          store: store ?? client.channelManager?.channelStore,
        }),
      retryCount: DEFAULT_QUERY_CHANNELS_RETRY_COUNT,
      ...paginatorOptions,
    });
    const definedSort = sort?.length ? sort : DEFAULT_BACKEND_SORT;
    this.client = client;
    this._id = id ?? `channel-paginator-${generateUUIDv4()}`;
    this._sort = definedSort;
    this._staticFilters = filters;
    this._options = requestOptions;
    this._channelStateOptions = channelStateOptions;
    this.filterBuilder = new FilterBuilder<ChannelFilters>(filterBuilderOptions);
    this._sortComparatorFactory = sortComparatorFactory;
    this.sortComparator = this.buildSortComparator(definedSort);
    this.setFilterResolvers([
      archivedFilterResolver,
      createAppBannedFilterResolver(client),
      createHasUnreadFilterResolver(client),
      hiddenFilterResolver,
      lastUpdatedFilterResolver,
      pinnedFilterResolver,
      createMutedFilterResolver(client),
      membersFilterResolver,
      memberUserNameFilterResolver,
      dataFieldFilterResolver,
    ]);
    // Channels are reactive objects: republish only when the list's membership or order changes.
    this.state.addPreprocessor((next, previous) => {
      if (previous && hasSameItems(previous.items, next.items))
        next.items = previous.items;
    });
  }

  /**
   * The single construction point of `sortComparator`, so every rebuild keeps the channel path
   * resolver and the cid tiebreaker. Customize it with `sortComparatorFactory` (which may delegate
   * to `defaultComparator`) or by overriding this method: assigning `sortComparator` directly is
   * lost on the next rebuild.
   */
  protected buildSortComparator(sort: SortParamRequest[]) {
    const defaultComparator = makeComparator<Channel>({
      sort,
      resolvePathValue: createChannelSortPathResolver(this.client),
      tiebreaker: (l, r) => {
        const leftId = this.getItemId(l);
        const rightId = this.getItemId(r);
        return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
      },
    });

    return this._sortComparatorFactory
      ? this._sortComparatorFactory({ sort, defaultComparator })
      : defaultComparator;
  }

  get id() {
    return this._id;
  }

  get isOfflineSupportEnabled() {
    return !!this.client.offlineDb;
  }

  get staticFilters(): ChannelFilters | undefined {
    return this._staticFilters;
  }

  get sort(): SortParamRequest[] {
    return this._sort?.length ? this._sort : DEFAULT_BACKEND_SORT;
  }

  /**
   * What the backend reported it filtered and sorted by for the last first-page query
   * (`QueryChannelsResponse.predefined_filter`: `name`, `filter`, and `sort` when the stored filter
   * has a sort template). Set only for `predefined_filter` queries.
   */
  get predefinedFilter(): ParsedPredefinedFilterResponse | undefined {
    return this._predefinedFilter;
  }

  /** Filters items are matched against locally: the backend-resolved one, else `staticFilters`. */
  get effectiveFilters(): ChannelFilters | undefined {
    return (
      (this._predefinedFilter?.filter as ChannelFilters | undefined) ?? this.staticFilters
    );
  }

  /** The sort items are ordered by: the backend-resolved predefined sort template, else `sort`. */
  get effectiveSort(): SortParamRequest[] {
    return (this._predefinedFilter?.sort as SortParamRequest[] | undefined) ?? this.sort;
  }

  get options(): ChannelOptions | undefined {
    return this._options;
  }

  get channelStateOptions(): ChannelStateOptions | undefined {
    return this._channelStateOptions;
  }

  set staticFilters(filters: ChannelFilters | undefined) {
    this._staticFilters = filters;
  }

  set sort(sort: SortParamRequest[] | undefined) {
    this._sort = sort;
    this.sortComparator = this.buildSortComparator(this.effectiveSort);
  }

  set options(options: ChannelPaginatorRequestOptions | undefined) {
    this._options = options;
  }

  set channelStateOptions(options: ChannelStateOptions | undefined) {
    this._channelStateOptions = options;
  }

  get sortComparatorFactory(): ChannelSortComparatorFactory | undefined {
    return this._sortComparatorFactory;
  }

  /**
   * Rebuilds the comparator immediately; later rebuilds consult the factory again, so a sort change
   * does not discard it. `undefined` restores the built-in ordering.
   */
  set sortComparatorFactory(factory: ChannelSortComparatorFactory | undefined) {
    this._sortComparatorFactory = factory;
    this.sortComparator = this.buildSortComparator(this.effectiveSort);
  }

  getItemId(item: Channel): string {
    return item.cid;
  }

  /**
   * Filters sent with the next query and used as the offline-db query key. Built from the local
   * filters only: the backend-resolved filter would change the query shape after the first response,
   * so the next page would look like a first page.
   */
  buildQueryFilters = (): ChannelFilters =>
    this.filterBuilder.buildFilters({
      baseFilters: { ...this.staticFilters },
    });

  /** Filters items are matched against locally (`matchesFilter`), built from `effectiveFilters`. */
  buildMatchFilters = (): ChannelFilters =>
    this.filterBuilder.buildFilters({
      baseFilters: { ...this.effectiveFilters },
    });

  matchesFilter(channel: Channel): boolean {
    const filters = this.buildMatchFilters();

    // Like `queryChannels`, exclude hidden channels unless the filter asks for them. Not a synthetic
    // `hidden: false` entry: with replaced resolvers (`setFilterResolvers`) `hidden` would be
    // unresolvable and reject every channel.
    if (channel.data?.hidden && !filterConstrainsField(filters, 'hidden')) return false;
    return itemMatchesFilter<Channel>(channel, filters, {
      resolvers: this._filterFieldToDataResolvers,
    });
  }

  /** Commits the response's `predefined_filter` metadata, or clears it when there is none. */
  protected applyPredefinedFilterResponse(
    predefinedFilter: ParsedPredefinedFilterResponse | undefined,
  ) {
    this._predefinedFilter = predefinedFilter;
    this.sortComparator = this.buildSortComparator(this.effectiveSort);
  }

  /**
   * The metadata describes the query as a whole, so it is committed only when a first page lands (a
   * failed query keeps the loaded list's). It is committed before `super`, which filters and ingests
   * the page using `matchesFilter` and the comparator this metadata feeds.
   */
  postQueryReconcile(params: PostQueryReconcileParams<Channel, ChannelQueryShape>) {
    this._lastPageCids = params.results?.items.map((channel) => channel.cid);
    const pendingPredefinedFilter = this._pendingPredefinedFilter;
    this._pendingPredefinedFilter = undefined;
    if (params.isFirstPage && params.results) {
      this.applyPredefinedFilterResponse(pendingPredefinedFilter);
    }
    const replaceOfflineSeed = this._replaceOfflineSeedOnResponse;
    this._replaceOfflineSeedOnResponse = false;
    if (replaceOfflineSeed && params.results) {
      // The cache can be arbitrarily old and hold channels the server dropped (hidden, deleted,
      // left): the page replaces the seed instead of merging into it.
      this.clearItemStorage();
      return super.postQueryReconcile({ ...params, keepPreviousItems: false });
    }
    return super.postQueryReconcile(params);
  }

  protected getNextQueryShape({
    pageSize,
  }: { pageSize?: number } = {}): ChannelQueryShape {
    const shape: ChannelQueryShape = {
      filter_conditions: this.buildQueryFilters(),
      ...this.options,
      limit: pageSize ?? this.pageSize,
      offset: this.offset,
    };

    if (this.sort) {
      shape.sort = this.sort;
    }

    if (this.channelStateOptions) {
      shape.stateOptions = this.channelStateOptions;
    }
    return shape;
  }

  /** The query that produced the currently loaded list, i.e. the cache key its cids belong under. */
  protected get loadedQueryRequest(): QueryChannelsRequest {
    const { stateOptions: _, ...request } =
      this._lastQueryShape ?? this.getNextQueryShape();
    return request;
  }

  /**
   * Writes a cid order into the offline cache under the query that produced it. `filters` and `sort`
   * are passed apart from `options` (which already holds them) because the DB implementation derives
   * the cache row key from them, while `options` carries the full request (`predefined_filter`, ...)
   * that tells predefined-filter lists apart. The resolved `predefinedFilter` is stored with the
   * order: a cache-seeded list has no response to learn it from.
   */
  protected cacheCidsForQuery({
    cids,
    request,
  }: {
    cids: string[];
    request: QueryChannelsRequest;
  }) {
    this.client.offlineDb?.executeQuerySafely(
      (db) =>
        db.upsertCidsForQuery({
          cids: cids.slice(0, this.pageSize),
          filters: request.filter_conditions,
          options: request,
          predefinedFilter: this._predefinedFilter,
          sort: request.sort,
        }),
      { method: 'upsertCidsForQuery' },
    );
  }

  /**
   * Persists the current cid order under the query that produced it. Runs after every mutation of
   * the loaded list, including live inserts and removals that reorder it without a query.
   */
  protected persistLoadedCids() {
    // Without a user the list is being emptied by `disconnectUser()`: what stays in the offline DB
    // is the app's call (`resetDB()`).
    if (!this.client.offlineDb || !this.client.userId) return;

    this.cacheCidsForQuery({
      cids: (this.items ?? [])
        .filter((channel) => !channel.isProvisional)
        .map((channel) => channel.cid),
      request: this.loadedQueryRequest,
    });
  }

  preloadFirstPageFromOfflineDb = async ({
    queryShape,
  }: PaginationQueryParams<ChannelQueryShape>) => {
    if (
      !this.client.offlineDb?.getChannelsForQuery ||
      !this.client.user?.id ||
      !queryShape
    )
      return undefined;

    const { stateOptions: _, ...request } = queryShape;

    try {
      const cachedQuery = await this.client.offlineDb.getChannelsForQuery({
        userId: this.client.user.id,
        options: request,
      });

      if (cachedQuery) {
        if (cachedQuery.predefinedFilter) {
          this.applyPredefinedFilterResponse(cachedQuery.predefinedFilter);
        }
        return this.client.hydrateChannels(cachedQuery.channels, {
          offlineMode: true,
          skipInitialization: [], // an empty array clears existing channel messages (no duplicates)
        });
      }
    } catch (error) {
      chatLoggerSystem.getLogger('channel').error((error as Error).message);
      if (this.config.throwErrors) throw error;
    }
    return;
  };

  populateOfflineDbAfterQuery = ({
    items,
    queryShape,
  }: {
    items?: Channel[];
    queryShape?: ChannelQueryShape;
  }) => {
    if (!items || !queryShape) return undefined;
    const { stateOptions: _, ...request } = queryShape;

    this.cacheCidsForQuery({
      cids: items.map((channel) => channel.cid),
      request,
    });
  };

  /**
   * Defers a first-page query (or a page of a cache-seeded list) while the offline sync is in
   * progress: the cached page is shown right away and the network query is handed to the sync
   * manager, which re-runs it after reconciliation. Querying and persisting cids against unsynced
   * local state would race the replay of pending mutations. Paginating a list loaded from the
   * network is not deferred.
   */
  async executeQuery(params: PaginationQueryParams<ChannelQueryShape> = {}) {
    const { offlineDb } = this.client;

    const effectiveParams: PaginationQueryParams<ChannelQueryShape> =
      this._itemsLoadedFromOfflineDB && params.reset !== 'yes'
        ? { ...params, keepPreviousItems: true, reset: 'yes' as const }
        : params;

    const queryShape = effectiveParams.queryShape ?? this.getNextQueryShape();
    const shouldDeferUntilSynced =
      !!offlineDb?.getChannelsForQuery &&
      !!this.client.user?.id &&
      !offlineDb.syncManager.isSynced &&
      // A cache-seeded list is not a loaded one, so paginating it defers too.
      (this._itemsLoadedFromOfflineDB ||
        this.isFirstPageQuery({ queryShape, reset: effectiveParams.reset }));

    if (!shouldDeferUntilSynced) return await super.executeQuery(effectiveParams);

    if (
      this._queryAwaitingSync &&
      !this.config.hasPaginationQueryShapeChanged(this._queryAwaitingSync, queryShape)
    ) {
      return;
    }
    this._queryAwaitingSync = queryShape;

    if (!this.isInitialized) {
      let cachedChannels: Channel[] | undefined;
      try {
        cachedChannels = await this.preloadFirstPageFromOfflineDb({
          ...effectiveParams,
          queryShape,
        });
      } catch (error) {
        this._queryAwaitingSync = undefined;
        throw error;
      }
      if (cachedChannels?.length) {
        // Seed via `setItems`, which ingests the page into the interval/index storage.
        // TODO: Maybe find a better way to do this rather than 2 partialNext invocations
        //       running. This all happens so fast it should never be noticeable but it's
        //       a microoptimization.
        this.setItems({ valueOrFactory: cachedChannels, isFirstPage: true });
        this._itemsLoadedFromOfflineDB = true;
      }
      // Nothing is in flight while waiting for the sync: `isLoading` would make `canExecuteQuery`
      // reject the query scheduled below.
      this.state.partialNext({ isLoading: false });
    }

    const refreshParams: PaginationQueryParams<ChannelQueryShape> = {
      ...effectiveParams,
      keepPreviousItems: true,
      ...(this._itemsLoadedFromOfflineDB ? { reset: 'yes' as const } : {}),
    };

    // Already synced: the sync-status callback would never fire, so run the query now.
    if (offlineDb.syncManager.isSynced) {
      this._queryAwaitingSync = undefined;
      return await super.executeQuery(refreshParams);
    }

    offlineDb.syncManager.scheduleSyncStatusChangeCallback(this.id, async () => {
      this._queryAwaitingSync = undefined;
      await this.executeQuery(refreshParams);
    });
  }

  query = async (): Promise<PaginationQueryReturnValue<Channel>> => {
    if (this._itemsLoadedFromOfflineDB) this._replaceOfflineSeedOnResponse = true;
    // A query is going out: the items stop being cache-only, whatever the response.
    this._itemsLoadedFromOfflineDB = false;
    if (!this._nextQueryShape) {
      this._nextQueryShape = this.getNextQueryShape();
    }
    const { stateOptions, ...request } = this._nextQueryShape;
    let items: Channel[];
    if (this.config.doRequest) {
      items = (await this.config.doRequest(this._nextQueryShape)).items;
    } else {
      // `withResponse` exposes `predefined_filter`, which a predefined-filter list needs.
      const response = await this.client.queryChannelsAndHydrate(request, {
        ...stateOptions,
        withResponse: true,
      });
      items = response.channels;
      this._pendingPredefinedFilter = response.predefined_filter;
    }
    return { items };
  };

  private getLastPageCids() {
    return this._lastPageCids;
  }

  /**
   * The reconnect refresh. Re-queries every loaded page, then drops the loaded channels no page
   * returned: they were deleted, left, hidden, or no longer match the filter.
   *
   * Each page asks for everything still to cover and the next one starts where it ended, so the
   * server's page cap decides the step. A failed page removes nothing. At most
   * {@link MAX_RECOVERED_ITEMS} channels are re-queried: the rest are dropped.
   */
  recoverLoadedItems = async () => {
    const loadedCids = new Set((this.items ?? []).map((channel) => channel.cid));
    const recoveredCount = Math.min(loadedCids.size, MAX_RECOVERED_ITEMS);
    const returnedCids = new Set<string>();
    const shape = this.getNextQueryShape();
    let interval: AnyInterval | null = null;
    let offset = 0;
    let pageCount = 0;
    do {
      this._lastPageCids = undefined;
      // the list's own query path, without publishing as the list is published once, below
      const result = await this.executeQuery({
        keepPreviousItems: true,
        queryShape: {
          ...shape,
          offset,
          limit:
            offset === 0
              ? Math.max(this.pageSize, recoveredCount)
              : recoveredCount - offset,
        },
        reset: offset === 0 ? 'yes' : undefined,
        silent: true,
        updateState: false,
      });
      const page = this.getLastPageCids();
      if (!result || !page) return;
      if (result.targetInterval) {
        interval = result.targetInterval;
        // we update immediately for the first page as most of the stuff that is going
        // to move is going to do it to this page
        this.setActiveInterval(interval, { updateState: offset === 0 });
      }
      if (!page.length) break;
      pageCount++;
      for (const channel of result.stateCandidate.items ?? [])
        returnedCids.add(channel.cid);
      offset += page.length;
    } while (offset < recoveredCount);

    this.batch(
      () => {
        for (const cid of loadedCids) {
          if (!returnedCids.has(cid)) this.removeItem({ id: cid });
        }
      },
      { coalesce: true },
    );
    // the first page was published as it landed, so only later pages are left to show
    if (interval && pageCount > 1) this.setActiveInterval(interval);
    this.state.partialNext({
      offset: this.items?.length ?? 0,
      // optimistically assume we have more pages, at worst it's one extra pagination attempt
      hasMoreTail: true,
    });
  };

  filterQueryResults = (items: Channel[]) => items;

  setItems(params: SetPaginatorItemsParams<Channel>) {
    super.setItems(params);
    this.persistLoadedCids();
  }

  /**
   * Places `channel` in the list if it matches, or drops it when it stops matching. A provisional
   * channel (created from members, no ID yet) is refused: it is stored under a temporary cid. Another
   * instance for a stored cid is replaced by the stored one (`ChannelManager.resolveListedChannel`).
   */
  ingestItem(input: Channel): boolean {
    if (input.isProvisional) return false;
    const channel = this.client.channelManager.resolveListedChannel(input);
    if (!channel) return false;
    const changed = super.ingestItem(channel);
    // A channel outside the result set is not held.
    if (!this.matchesFilter(channel)) this._itemIndex.remove(channel.cid);
    if (changed) this.persistLoadedCids();
    return changed;
  }

  /** Entity-store subscriber. A channel publishes changes via `channel.state`: nothing to do. */
  onEntitiesChanged(): void {
    return;
  }

  /** Entity-store subscriber: the store removed a channel this list holds (e.g. logout). */
  onEntityRemoved(id: string, channel: unknown): void {
    this.removeItem({ id, item: channel as Channel });
  }

  resetState() {
    super.resetState();
    this._itemIndex.clear();
    this._queryAwaitingSync = undefined;
  }

  removeItem(params: { id?: string; item?: Channel }): ItemCoordinates {
    const coordinates = super.removeItem(params);
    if ((coordinates.state?.currentIndex ?? -1) > -1 || coordinates.interval) {
      this.persistLoadedCids();
    }
    return coordinates;
  }
}
