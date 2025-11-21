import type {
  PaginationQueryParams,
  PaginationQueryReturnValue,
  PaginationQueryShapeChangeIdentifier,
  PaginatorOptions,
  PaginatorState,
  SetPaginatorItemsParams,
  SortKey,
} from './BasePaginator';
import { BasePaginator } from './BasePaginator';
import type { FilterBuilderOptions } from '../FilterBuilder';
import { FilterBuilder } from '../FilterBuilder';
import { makeComparator } from '../sortCompiler';
import { generateUUIDv4 } from '../../utils';
import type { StreamChat } from '../../client';
import type { Channel } from '../../channel';
import type {
  ChannelFilters,
  ChannelOptions,
  ChannelSort,
  ChannelStateOptions,
} from '../../types';
import type { FieldToDataResolver, PathResolver } from '../types.normalization';
import { resolveDotPathValue } from '../utility.normalization';
import { isEqual } from '../../utils/mergeWith/mergeWithCore';

const DEFAULT_BACKEND_SORT: ChannelSort = { last_message_at: -1, updated_at: -1 }; // {last_updated: -1}

export type ChannelQueryShape = {
  filters: ChannelFilters;
  sort?: ChannelSort;
  options?: ChannelOptions;
  stateOptions?: ChannelStateOptions;
};

export type ChannelPaginatorState = PaginatorState<Channel>;

export type ChannelPaginatorRequestOptions = Partial<
  Omit<ChannelOptions, 'offset' | 'limit'>
>;

export type ChannelPaginatorOptions = {
  client: StreamChat;
  channelStateOptions?: ChannelStateOptions;
  filterBuilderOptions?: FilterBuilderOptions<ChannelFilters>;
  filters?: ChannelFilters;
  id?: string;
  paginatorOptions?: PaginatorOptions<Channel, ChannelQueryShape>;
  requestOptions?: ChannelPaginatorRequestOptions;
  sort?: ChannelSort | ChannelSort[];
};

const getQueryShapeRelevantChannelOptions = (options: ChannelOptions) => {
  const {
    /* eslint-disable @typescript-eslint/no-unused-vars */
    limit: _,
    member_limit: __,
    message_limit: ___,
    offset: ____,
    /* eslint-enable @typescript-eslint/no-unused-vars */
    ...relevantShape
  } = options;
  return relevantShape;
};

const hasPaginationQueryShapeChanged: PaginationQueryShapeChangeIdentifier<
  ChannelQueryShape
> = (prevQueryShape, nextQueryShape) =>
  !isEqual(
    {
      ...prevQueryShape,
      options: getQueryShapeRelevantChannelOptions(prevQueryShape?.options ?? {}),
    },
    {
      ...nextQueryShape,
      options: getQueryShapeRelevantChannelOptions(nextQueryShape?.options ?? {}),
    },
  );

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

const lastUpdatedFilterResolver: FieldToDataResolver<Channel> = {
  matchesField: (field) => field === 'last_updated',
  resolve: (channel) => {
    // combination of last_message_at and updated_at
    const lastMessageAt = channel.state.last_message_at?.getTime() ?? null;
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

const dataFieldFilterResolver: FieldToDataResolver<Channel> = {
  matchesField: () => true,
  resolve: (channel, path) => resolveDotPathValue(channel.data, path),
};

// very, very unfortunately channel data is dispersed btw Channel.data and Channel.state
const channelSortPathResolver: PathResolver<Channel> = (channel, path) => {
  switch (path) {
    case 'last_message_at':
      return channel.state.last_message_at;
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
export class ChannelPaginator extends BasePaginator<Channel, ChannelQueryShape> {
  private readonly _id: string;
  private client: StreamChat;
  protected _staticFilters: ChannelFilters | undefined;
  protected _sort: ChannelSort | ChannelSort[] | undefined;
  protected _options: ChannelPaginatorRequestOptions | undefined;
  protected _channelStateOptions: ChannelStateOptions | undefined;
  protected _nextQueryShape: ChannelQueryShape | undefined;
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
  }: ChannelPaginatorOptions) {
    super({ hasPaginationQueryShapeChanged, ...paginatorOptions });
    const definedSort = sort ?? DEFAULT_BACKEND_SORT;
    this.client = client;
    this._id = id ?? `channel-paginator-${generateUUIDv4()}`;
    this._sort = definedSort;
    this._staticFilters = filters;
    this._options = requestOptions;
    this._channelStateOptions = channelStateOptions;
    this.filterBuilder = new FilterBuilder<ChannelFilters>(filterBuilderOptions);
    this.sortComparator = makeComparator<Channel, ChannelSort>({
      sort: definedSort,
      resolvePathValue: channelSortPathResolver,
      tiebreaker: (l, r) => {
        const leftId = this.getItemId(l);
        const rightId = this.getItemId(r);
        return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
      },
    });
    this.setFilterResolvers([
      archivedFilterResolver,
      appBannedFilterResolver,
      hasUnreadFilterResolver,
      lastUpdatedFilterResolver,
      pinnedFilterResolver,
      membersFilterResolver,
      memberUserNameFilterResolver,
      dataFieldFilterResolver,
    ]);
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

  get options(): ChannelOptions | undefined {
    return this._options;
  }

  get channelStateOptions(): ChannelStateOptions | undefined {
    return this._channelStateOptions;
  }

  set staticFilters(filters: ChannelFilters | undefined) {
    this._staticFilters = filters;
  }

  set sort(sort: ChannelSort | ChannelSort[] | undefined) {
    this._sort = sort;
    this.sortComparator = makeComparator<Channel, ChannelSort>({
      sort: this.sort ?? DEFAULT_BACKEND_SORT,
    });
  }

  set options(options: ChannelPaginatorRequestOptions | undefined) {
    this._options = options;
  }

  set channelStateOptions(options: ChannelStateOptions | undefined) {
    this._channelStateOptions = options;
  }

  getItemId(item: Channel): string {
    return item.cid;
  }

  buildFilters = (): ChannelFilters =>
    this.filterBuilder.buildFilters({
      baseFilters: { ...this.staticFilters },
    });

  computeSortKey(item: Channel): SortKey {
    const generateSortKey = super.makeSortKeyGenerator({
      sort: this.sort,
      resolvePathValue: channelSortPathResolver,
    });
    return generateSortKey(item);
  }

  // invoked inside BasePaginator.executeQuery() to keep it as a query descriptor;
  protected getNextQueryShape(): ChannelQueryShape {
    const shape: ChannelQueryShape = {
      filters: this.buildFilters(),
      options: {
        ...this.options,
        limit: this.pageSize,
        offset: this.offset,
      },
    };

    if (this.sort) {
      shape.sort = this.sort;
    }

    if (this.channelStateOptions) {
      shape.stateOptions = this.channelStateOptions;
    }
    return shape;
  }

  preloadFirstPageFromOfflineDb = async ({
    direction,
    queryShape,
    reset,
  }: PaginationQueryParams<ChannelQueryShape>) => {
    if (
      !this.client.offlineDb?.getChannelsForQuery ||
      !this.client.user?.id ||
      !queryShape
    )
      return undefined;

    try {
      const channelsFromDB = await this.client.offlineDb.getChannelsForQuery({
        userId: this.client.user.id,
        filters: queryShape.filters,
        sort: queryShape.sort,
      });

      if (channelsFromDB) {
        const offlineChannels = this.client.hydrateActiveChannels(channelsFromDB, {
          offlineMode: true,
          skipInitialization: [], // passing empty array will clear out the existing messages from channel state, this removes the possibility of duplicate messages
        });

        return offlineChannels;
      }

      if (!this.client.offlineDb.syncManager.syncStatus) {
        this.client.offlineDb.syncManager.scheduleSyncStatusChangeCallback(
          this.id,
          async () => {
            await this.executeQuery({ direction, queryShape, reset });
          },
        );
        return;
      }
    } catch (error) {
      this.client.logger('error', (error as Error).message);
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

    this.client.offlineDb?.executeQuerySafely(
      (db) =>
        db.upsertCidsForQuery({
          cids: items.map((channel) => channel.cid),
          filters: queryShape.filters,
          sort: queryShape.sort,
        }),
      { method: 'upsertCidsForQuery' },
    );
  };

  query = async (): Promise<PaginationQueryReturnValue<Channel>> => {
    // get the params only if they were not generated previously
    if (!this._nextQueryShape) {
      this._nextQueryShape = this.getNextQueryShape();
    }
    const { filters, sort, options, stateOptions } = this._nextQueryShape;
    let items: Channel[];
    if (this.config.doRequest) {
      items = (await this.config.doRequest(this._nextQueryShape)).items;
    } else {
      items = await this.client.queryChannels(filters, sort, options, stateOptions);
    }
    return { items };
  };

  filterQueryResults = (items: Channel[]) => items;

  setItems(params: SetPaginatorItemsParams<Channel>) {
    super.setItems(params);

    if (!this.client.offlineDb) return;

    const { items: channels = [], sort } = this;
    const filters = this.buildFilters();

    this.client.offlineDb?.executeQuerySafely(
      (db) =>
        db.upsertCidsForQuery({
          cids: channels.map((channel) => channel.cid),
          filters,
          sort,
        }),
      { method: 'upsertCidsForQuery' },
    );
  }
}
