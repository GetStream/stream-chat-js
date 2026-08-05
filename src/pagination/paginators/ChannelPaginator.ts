import type {
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
import { chatLoggerSystem } from '../../logger';
import type { FilterBuilderOptions } from '../FilterBuilder';
import { FilterBuilder } from '../FilterBuilder';
import { makeComparator } from '../sortCompiler';
import { itemMatchesFilter } from '../filterCompiler';
import { ItemIndex } from '../ItemIndex';
import { generateUUIDv4 } from '../../utils';
import type { StreamChat } from '../../client';
import type { Channel } from '../../channel';
import type {
  ChannelFilters,
  ChannelOptions,
  ChannelSort,
  ChannelStateOptions,
  ParsedPredefinedFilterResponse,
  QueryChannelsRequest,
} from '../../types';
import type { FieldToDataResolver, PathResolver } from '../types.normalization';
import { resolveDotPathValue } from '../utility.normalization';
import { isEqual } from '../../utils/mergeWith/mergeWithCore';

const DEFAULT_BACKEND_SORT: ChannelSort = [
  { direction: -1, field: 'last_message_at' },
  { direction: -1, field: 'updated_at' },
];

/**
 * The `queryChannels` request this paginator will send, plus the client-only `stateOptions`.
 *
 * Deliberately the request's own shape (`filter_conditions`, `sort`, `limit`, `predefined_filter`, …)
 * rather than a `{ filters, sort, options }` wrapper: the same object goes on the wire, keys the
 * offline-db cache and is compared for query-shape changes, so any field mapping in between would be a
 * place for those three to drift apart. `MessageQueryShape` is likewise the request params themselves.
 */
export type ChannelQueryShape = QueryChannelsRequest & {
  /** Not part of the request — controls how the response is applied to client state. */
  stateOptions?: ChannelStateOptions;
};

export type ChannelPaginatorState = PaginatorState<Channel>;

export type ChannelPaginatorRequestOptions = Partial<
  Omit<ChannelOptions, 'offset' | 'limit'>
>;

export type ChannelSortComparatorFactoryParams = {
  /** Sort the comparator is being built for — the effective sort, so a backend-resolved sort template. */
  sort: ChannelSort;
  /**
   * The comparator `ChannelPaginator` would use for this sort. Delegate to it for the fields you do not
   * want to handle yourself instead of reimplementing channel field resolution and the cid tiebreaker.
   */
  defaultComparator: (a: Channel, b: Channel) => number;
};

/**
 * Produces the comparator that orders this paginator's channels. Consulted on **every** comparator
 * rebuild (construction, `sort` change, backend-resolved predefined sort), so unlike assigning
 * `sortComparator` directly, a factory is not overwritten by later sort changes.
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
  sort?: ChannelSort;
  sortComparatorFactory?: ChannelSortComparatorFactory;
};

/**
 * What identifies the query itself, as opposed to which page of it is being requested. Two shapes with
 * the same identity continue one pagination; a different identity restarts it from the first page.
 */
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
  resolve: (channel) => !!channel.state.membership.archived_at,
};

const appBannedFilterResolver: FieldToDataResolver<Channel> = {
  matchesField: (field) => field === 'app_banned',
  resolve: (channel) => {
    const ownUserId = channel.getClient().user?.id;
    const otherMembers = Object.values(channel.state.members).filter(
      ({ user }) => user?.id !== ownUserId,
    );
    // Only applies to channels with exactly 2 members.
    if (otherMembers.length !== 1) return false;
    const otherMember = otherMembers[0];
    return otherMember.user?.banned ? 'only' : 'excluded';
  },
};

const hasUnreadFilterResolver: FieldToDataResolver<Channel> = {
  matchesField: (field) => field === 'has_unread',
  resolve: (channel) => {
    const ownUserId = channel.getClient().user?.id;
    return (
      ownUserId &&
      channel.state.read[ownUserId] &&
      channel.state.read[ownUserId].unread_messages > 0
    );
  },
};

const hiddenFilterResolver: FieldToDataResolver<Channel> = {
  matchesField: (field) => field === 'hidden',
  // `hidden` is optional on ChannelResponse, so a response that omits it (and a channel that was never
  // hidden or shown) leaves `channel.data.hidden` undefined. Coerce to a boolean so `{ hidden: false }`
  // matches those channels instead of comparing undefined against false.
  resolve: (channel) => !!channel.data?.hidden,
};

const lastUpdatedFilterResolver: FieldToDataResolver<Channel> = {
  matchesField: (field) => field === 'last_updated',
  resolve: (channel) => {
    // combination of last_message_at and updated_at
    const lastMessageAt = channel.messagePaginator.lastMessageAt?.getTime() ?? null;
    const updatedAt = channel.data?.updated_at
      ? new Date(channel.data?.updated_at).getTime()
      : undefined;
    return lastMessageAt !== null && updatedAt !== undefined
      ? Math.max(lastMessageAt, updatedAt)
      : (lastMessageAt ?? updatedAt);
  },
};

const membersFilterResolver: FieldToDataResolver<Channel> = {
  matchesField: (field) => field === 'members',
  resolve: (channel) =>
    channel.state.members
      ? Object.values(channel.state.members).reduce<string[]>((ids, member) => {
          if (member.user?.id) {
            ids.push(member.user?.id);
          }
          return ids;
        }, [])
      : [],
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
  resolve: (channel) => !!channel.state.membership.pinned_at,
};

const mutedFilterResolver: FieldToDataResolver<Channel> = {
  matchesField: (field) => field === 'muted',
  // UserMuteResponse state lives on the client (client.mutedChannels), not on channel.data — resolve it via
  // the client so `{ muted: true/false }` matches client-side, rather than letting the generic
  // data resolver read a non-existent `channel.data.muted` (which would resolve to undefined and
  // never equal a boolean filter value).
  resolve: (channel) => channel.getClient()._muteStatus(channel.cid).muted,
};

const dataFieldFilterResolver: FieldToDataResolver<Channel> = {
  matchesField: () => true,
  resolve: (channel, path) => resolveDotPathValue(channel.data, path),
};

// very, very unfortunately channel data is dispersed btw Channel.data and Channel.state
const channelSortPathResolver: PathResolver<Channel> = (channel, path) => {
  switch (path) {
    case 'last_message_at':
      return channel.messagePaginator.lastMessageAt;
    case 'has_unread': {
      return hasUnreadFilterResolver.resolve(channel, path);
    }
    case 'last_updated': {
      return lastUpdatedFilterResolver.resolve(channel, path) ?? 0;
    }
    case 'pinned_at':
      return channel.state.membership.pinned_at;
    case 'unread_count': {
      const userId = channel.getClient().user?.id;
      return userId ? channel.state.read[userId].unread_messages : 0;
    }
    default:
      return resolveDotPathValue(channel.data, path);
  }
};

// todo: maybe items could be just an array of {cid: string} and the data would be retrieved from client.activeChannels
// todo: maybe we should introduce client._cache.channels  that would be reactive and orchestrator would subscribe to client._cache.channels state to keep all the dependent state in sync
/**
 * A paginated channel list. Filters are described along three independent axes — the names follow them:
 *
 * - origin: `staticFilters` are supplied at construction and fixed; `filterBuilder` generates the
 *   dynamic ones from its reactive context on every build. Every build merges dynamic over static.
 * - authority: `staticFilters` are what this client asked for; `predefinedFilter` is what the backend
 *   reports it actually applied for a `predefined_filter` query. `effectiveFilters` is the winner of the
 *   two (and `effectiveSort` likewise for ordering).
 * - purpose: `buildQueryFilters()` produces the filters sent to the server (and the offline-db query
 *   key), built from the local filters only; `buildMatchFilters()` produces the filters items are
 *   matched against locally, built from `effectiveFilters`. They are not interchangeable: sending the
 *   resolved filter back changes the query shape mid-pagination, and matching against the local filter
 *   admits channels the queried list excludes.
 *
 * Ordering follows the same authority rule: `sortComparator` is derived from `effectiveSort` and is
 * rebuilt whenever that changes, so it must not be assigned to. Customize it through
 * `sortComparatorFactory` (constructor option or setter, consulted on every rebuild) or by overriding
 * `buildSortComparator` in a subclass.
 */
export class ChannelPaginator extends BasePaginator<Channel, ChannelQueryShape> {
  private readonly _id: string;
  private client: StreamChat;
  protected _staticFilters: ChannelFilters | undefined;
  protected _sort: ChannelSort | undefined;
  protected _options: ChannelPaginatorRequestOptions | undefined;
  protected _channelStateOptions: ChannelStateOptions | undefined;
  protected _nextQueryShape: ChannelQueryShape | undefined;
  /** Backend-reported metadata of the last `predefined_filter` query (see `predefinedFilter`). */
  protected _predefinedFilter: ParsedPredefinedFilterResponse | undefined;
  /**
   * Predefined-filter metadata from the response of the query currently in flight. Held until
   * `postQueryReconcile` decides whether it should be committed (first page only).
   */
  private _pendingPredefinedFilter: ParsedPredefinedFilterResponse | undefined;
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
  }: ChannelPaginatorOptions) {
    super({
      hasPaginationQueryShapeChanged,
      itemIndex: new ItemIndex<Channel>({ getId: (channel) => channel.cid }),
      ...paginatorOptions,
    });
    const definedSort = sort ?? DEFAULT_BACKEND_SORT;
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
      appBannedFilterResolver,
      hasUnreadFilterResolver,
      hiddenFilterResolver,
      lastUpdatedFilterResolver,
      pinnedFilterResolver,
      mutedFilterResolver,
      membersFilterResolver,
      memberUserNameFilterResolver,
      dataFieldFilterResolver,
    ]);
  }

  /**
   * Builds the comparator for the given sort — the single construction point, so every rebuild (the
   * `sort` setter, a backend-resolved predefined sort) keeps the channel-specific path resolver and the
   * cid tiebreaker; omitting either makes ordering fall back to raw `channel.data` lookups and become
   * non-deterministic for equal sort values.
   *
   * `sortComparator` is derived state and is therefore reassigned on every rebuild — assigning to it
   * directly does not survive a sort change or a predefined-filter response. To customize ordering,
   * supply `sortComparatorFactory` (it is consulted on every rebuild and may delegate to
   * `defaultComparator`), or override this method in a subclass.
   */
  protected buildSortComparator(sort: ChannelSort) {
    const defaultComparator = makeComparator<Channel>({
      sort,
      resolvePathValue: channelSortPathResolver,
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

  get sort(): ChannelSort {
    return this._sort ?? DEFAULT_BACKEND_SORT;
  }

  /**
   * What the backend reported it actually filtered and sorted by for the last first-page query —
   * `QueryChannelsResponse.predefined_filter` (`name`, `filter`, and `sort` when the stored filter
   * carries its own sort template). Set only for `predefined_filter` queries: the raw `filter_conditions`
   * of a normal query are not echoed back.
   */
  get predefinedFilter(): ParsedPredefinedFilterResponse | undefined {
    return this._predefinedFilter;
  }

  /**
   * Filters this paginator matches items against client-side. A predefined filter resolved by the backend
   * wins over the locally configured one: for such a query the local `filters` are not what the server
   * applied, so matching against them would admit items the queried list excludes.
   */
  get effectiveFilters(): ChannelFilters | undefined {
    return (
      (this._predefinedFilter?.filter as ChannelFilters | undefined) ?? this.staticFilters
    );
  }

  /**
   * Sort this paginator orders items by. Mirrors `effectiveFilters`: a sort template carried by a
   * backend-resolved predefined filter takes precedence over the requested sort, matching backend
   * precedence rules.
   */
  get effectiveSort(): ChannelSort {
    return (this._predefinedFilter?.sort as ChannelSort | undefined) ?? this.sort;
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

  set sort(sort: ChannelSort | undefined) {
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
   * Take over channel ordering at any point in the paginator's life. The comparator is rebuilt
   * immediately and the factory is consulted again on every later rebuild, so — unlike assigning
   * `sortComparator` — a sort change or a backend-resolved predefined sort will not discard it. Set to
   * `undefined` to go back to the built-in ordering.
   */
  set sortComparatorFactory(factory: ChannelSortComparatorFactory | undefined) {
    this._sortComparatorFactory = factory;
    this.sortComparator = this.buildSortComparator(this.effectiveSort);
  }

  getItemId(item: Channel): string {
    return item.cid;
  }

  /**
   * Filters sent to the server with the next query (and used as the offline-db query key). Deliberately
   * built from the locally configured filters only — feeding the backend-resolved filter back in would
   * change the query shape after the first response and make the following page look like a new first
   * page to `hasPaginationQueryShapeChanged`.
   */
  buildQueryFilters = (): ChannelFilters =>
    this.filterBuilder.buildFilters({
      baseFilters: { ...this.staticFilters },
    });

  /**
   * Filters items are matched against locally — the `BasePaginator.buildMatchFilters` hook consumed by
   * `matchesFilter`. Built from `effectiveFilters`, so a `predefined_filter` list matches what the
   * backend applied rather than the local filters, which are not what produced the list.
   */
  buildMatchFilters = (): ChannelFilters =>
    this.filterBuilder.buildFilters({
      baseFilters: { ...this.effectiveFilters },
    });

  matchesFilter(channel: Channel): boolean {
    const filters = this.buildMatchFilters();

    const LOGICAL_FILTER_OPERATORS = ['$and', '$or', '$nor'] as const;

    /**
     * Whether a filter constrains `hidden` anywhere — at the top level or nested inside a logical
     * operator, both of which the filter compiler evaluates. A filter that mentions `hidden` at all opts
     * out of the "exclude hidden channels" default (see `ChannelPaginator.matchesFilter`), so
     * `{ $or: [{ hidden: true }, …] }` is not silently overruled by it.
     *
     * Recursion is limited to logical operators on purpose: a `hidden` key anywhere else (e.g. inside
     * `{ custom: { hidden: … } }`) is a different field, not a constraint on the channel's hidden state.
     */
    const filterConstrainsHidden = (filters: unknown): boolean => {
      if (!filters || typeof filters !== 'object') return false;
      if (Array.isArray(filters)) return filters.some(filterConstrainsHidden);
      const node = filters as Record<string, unknown>;
      if ('hidden' in node) return true;
      return LOGICAL_FILTER_OPERATORS.some((operator) =>
        filterConstrainsHidden(node[operator]),
      );
    };
    // Mirror `queryChannels`, which excludes hidden channels unless the filter asks for them —
    // otherwise a channel hidden while the list is open keeps matching and stays visible until the next
    // query. Applied here rather than as a synthetic `hidden: false` filter entry so the default also
    // holds for a paginator whose filter resolvers were replaced (`setFilterResolvers`), which would
    // otherwise leave `hidden` unresolvable and reject every channel.
    if (channel.data?.hidden && !filterConstrainsHidden(filters)) return false;
    return itemMatchesFilter<Channel>(channel, filters, {
      resolvers: this._filterFieldToDataResolvers,
    });
  }

  /**
   * Commits the `predefined_filter` metadata of the response, or clears it when the response carried
   * none (a plain `filter_conditions` query), so a switch away from a predefined filter cannot leave
   * stale matching/ordering semantics behind.
   */
  protected applyPredefinedFilterResponse(
    predefinedFilter: ParsedPredefinedFilterResponse | undefined,
  ) {
    this._predefinedFilter = predefinedFilter;
    this.sortComparator = this.buildSortComparator(this.effectiveSort);
  }

  /**
   * The response metadata describes the query as a whole, so it is (re)committed only when a first page
   * lands — matching the legacy `ChannelManager`, which kept it untouched while paginating. A failed
   * query (`results === null`) must not drop the metadata of the already loaded list either.
   *
   * Committing before `super` matters: the base implementation filters and ingests the page using
   * `matchesFilter` and the comparators this metadata feeds.
   */
  postQueryReconcile(params: PostQueryReconcileParams<Channel, ChannelQueryShape>) {
    const pendingPredefinedFilter = this._pendingPredefinedFilter;
    this._pendingPredefinedFilter = undefined;
    if (params.isFirstPage && params.results) {
      this.applyPredefinedFilterResponse(pendingPredefinedFilter);
    }
    return super.postQueryReconcile(params);
  }

  // invoked inside BasePaginator.executeQuery() to keep it as a query descriptor;
  protected getNextQueryShape(): ChannelQueryShape {
    const shape: ChannelQueryShape = {
      filter_conditions: this.buildQueryFilters(),
      ...this.options,
      limit: this.pageSize,
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
   * Writes a cid order into the offline cache under the query that produced it.
   *
   * `filters` and `sort` are passed separately even though `options` already contains them: the DB
   * derives the cache row key from those two top-level arguments (see the TODO at
   * `channel_manager.ts:276`), while `options` carries the full request — the only place
   * `predefined_filter` / `filter_values` / `sort_values` appear, without which two predefined-filter
   * lists cannot be told apart. The duplication goes away once `convertFilterSortToQuery` derives the
   * key from `options`, which is a change in the concrete (RN) DB implementation plus a schema bump.
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
          cids,
          filters: request.filter_conditions,
          options: request,
          sort: request.sort,
        }),
      { method: 'upsertCidsForQuery' },
    );
  }

  /**
   * Persists the current cid order under the query that produced it. Called after every mutation of the
   * loaded list — including live WS-driven inserts/removals, which reorder the list without any query
   * running; skipping those would leave the cached order stale until the next full re-query.
   */
  protected persistLoadedCids() {
    if (!this.client.offlineDb) return;

    this.cacheCidsForQuery({
      cids: (this.items ?? []).map((channel) => channel.cid),
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
      const channelsFromDB = await this.client.offlineDb.getChannelsForQuery({
        userId: this.client.user.id,
        options: request,
      });

      if (channelsFromDB) {
        return this.client.hydrateActiveChannels(channelsFromDB, {
          offlineMode: true,
          skipInitialization: [], // passing empty array will clear out the existing messages from channel state, this removes the possibility of duplicate messages
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
   * Postpones a first-page query while the offline sync is still in progress: the cached page is
   * surfaced right away and the network query is handed to the sync manager, which re-runs it once
   * reconciliation finished — querying (and persisting cids) against unsynced local state would race
   * with the replay of pending local mutations. Mirrors `ChannelManager.queryChannels`, which deferred
   * on every unsynced call and read the cache only when it had nothing loaded yet.
   *
   * Only first-page queries defer; paginating an already loaded list is unaffected (as was the legacy
   * `loadNext`).
   */
  async executeQuery(params: PaginationQueryParams<ChannelQueryShape> = {}) {
    const { offlineDb } = this.client;
    const queryShape = params.queryShape ?? this.getNextQueryShape();
    const shouldDeferUntilSynced =
      !!offlineDb?.getChannelsForQuery &&
      !!this.client.user?.id &&
      !offlineDb.syncManager.syncStatus &&
      this.isFirstPageQuery({ queryShape, reset: params.reset });

    if (!shouldDeferUntilSynced) return await super.executeQuery(params);

    if (!this.isInitialized) {
      const state = this.getStateBeforeFirstQuery();
      const cachedChannels = await this.preloadFirstPageFromOfflineDb({
        ...params,
        queryShape,
      });
      // `isLoading: false` — nothing is in flight while we wait for the sync, and leaving it set would
      // make `canExecuteQuery` reject the query this schedules below.
      this.state.next({
        ...state,
        isLoading: false,
        items: cachedChannels ?? state.items,
      });
    }

    offlineDb.syncManager.scheduleSyncStatusChangeCallback(this.id, async () => {
      await this.executeQuery(params);
    });
  }

  query = async (): Promise<PaginationQueryReturnValue<Channel>> => {
    // get the params only if they were not generated previously
    if (!this._nextQueryShape) {
      this._nextQueryShape = this.getNextQueryShape();
    }
    const { stateOptions, ...request } = this._nextQueryShape;
    let items: Channel[];
    if (this.config.doRequest) {
      items = (await this.config.doRequest(this._nextQueryShape)).items;
    } else {
      // withResponse gives access to response-level metadata (`predefined_filter`) which a
      // predefined-filter list needs to know what the backend actually filtered and sorted by.
      const response = await this.client.queryChannelsAndHydrate(request, {
        ...stateOptions,
        withResponse: true,
      });
      items = response.channels;
      this._pendingPredefinedFilter = response.predefined_filter;
    }
    return { items };
  };

  filterQueryResults = (items: Channel[]) => items;

  setItems(params: SetPaginatorItemsParams<Channel>) {
    super.setItems(params);
    this.persistLoadedCids();
  }

  ingestItem(channel: Channel): boolean {
    const changed = super.ingestItem(channel);
    if (changed) this.persistLoadedCids();
    return changed;
  }

  removeItem(params: { id?: string; item?: Channel }): ItemCoordinates {
    const coordinates = super.removeItem(params);
    if ((coordinates.state?.currentIndex ?? -1) > -1 || coordinates.interval) {
      this.persistLoadedCids();
    }
    return coordinates;
  }
}
