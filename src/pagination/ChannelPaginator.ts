import type {
  PaginationQueryParams,
  PaginationQueryReturnValue,
  PaginatorOptions,
  PaginatorState,
} from './BasePaginator';
import { BasePaginator } from './BasePaginator';
import type { FilterBuilderOptions } from './FilterBuilder';
import { FilterBuilder } from './FilterBuilder';
import { makeComparator } from './sortCompiler';
import { generateUUIDv4 } from '../utils';
import type { StreamChat } from '../client';
import type { Channel } from '../channel';
import type { ChannelFilters, ChannelOptions, ChannelSort } from '../types';
import type { FieldToDataResolver, PathResolver } from './types.normalization';
import { resolveDotPathValue } from './utility.normalization';

const DEFAULT_BACKEND_SORT: ChannelSort = { last_message_at: -1, updated_at: -1 }; // {last_updated: -1}

export type ChannelPaginatorState = PaginatorState<Channel>;

export type ChannelPaginatorRequestOptions = Partial<
  Omit<ChannelOptions, 'offset' | 'limit'>
>;

export type ChannelPaginatorOptions = {
  client: StreamChat;
  filterBuilderOptions?: FilterBuilderOptions<ChannelFilters>;
  filters?: ChannelFilters;
  id?: string;
  paginatorOptions?: PaginatorOptions;
  requestOptions?: ChannelPaginatorRequestOptions;
  sort?: ChannelSort | ChannelSort[];
};

const pinnedFilterResolver: FieldToDataResolver<Channel> = {
  matchesField: (field) => field === 'pinned',
  resolve: (channel) => !!channel.state.membership.pinned_at,
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
      const userId = channel.getClient().user?.id;
      return !!(userId && channel.state.read[userId].unread_messages);
    }
    case 'last_updated': {
      // combination of last_message_at and updated_at
      const lastMessageAt = channel.state.last_message_at?.getTime() ?? 0;
      const updatedAt = channel.data?.updated_at
        ? new Date(channel.data?.updated_at).getTime()
        : 0;
      return lastMessageAt >= updatedAt ? lastMessageAt : updatedAt;
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
export class ChannelPaginator extends BasePaginator<Channel> {
  // state: StateStore<ChannelPaginatorState>;
  private client: StreamChat;
  protected _filters: ChannelFilters | undefined;
  protected _sort: ChannelSort | ChannelSort[] | undefined;
  protected _options: ChannelPaginatorRequestOptions | undefined;
  private _id: string;
  sortComparator: (a: Channel, b: Channel) => number;
  filterBuilder: FilterBuilder<ChannelFilters>;

  constructor({
    client,
    id,
    filterBuilderOptions,
    filters,
    paginatorOptions,
    requestOptions,
    sort,
  }: ChannelPaginatorOptions) {
    super(paginatorOptions);
    const definedSort = sort ?? DEFAULT_BACKEND_SORT;
    this.client = client;
    this._id = id ?? `channel-paginator-${generateUUIDv4()}`;
    this._sort = definedSort;
    this._filters = filters;
    this._options = requestOptions;
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
      pinnedFilterResolver,
      membersFilterResolver,
      memberUserNameFilterResolver,
      dataFieldFilterResolver,
    ]);
  }

  get id() {
    return this._id;
  }

  get filters(): ChannelFilters | undefined {
    return this._filters;
  }

  get sort(): ChannelSort | undefined {
    return this._sort;
  }

  get options(): ChannelOptions | undefined {
    return this._options;
  }

  set filters(filters: ChannelFilters | undefined) {
    this._filters = filters;
    this.resetState();
  }

  set sort(sort: ChannelSort | ChannelSort[] | undefined) {
    this._sort = sort;
    this.sortComparator = makeComparator<Channel, ChannelSort>({
      sort: this.sort ?? DEFAULT_BACKEND_SORT,
    });
    this.resetState();
  }

  set options(options: ChannelPaginatorRequestOptions | undefined) {
    this._options = options;
    this.resetState();
  }

  getItemId(item: Channel): string {
    return item.cid;
  }

  buildFilters = (): ChannelFilters =>
    this.filterBuilder.buildFilters({
      baseFilters: { ...this.filters },
    });

  query = async ({ direction }: PaginationQueryParams = {}): Promise<
    PaginationQueryReturnValue<Channel>
  > => {
    if (direction) {
      console.warn('Direction is not supported with channel pagination.');
    }
    const filters = this.buildFilters();
    const options: ChannelOptions = {
      ...this.options,
      limit: this.pageSize,
      offset: this.offset,
    };
    const items = await this.client.queryChannels(filters, this.sort, options);
    return { items };
  };

  filterQueryResults = (items: Channel[]) => items;
}
