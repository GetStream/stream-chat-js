import { BaseSearchSource, type SearchQueryOptions } from './BaseSearchSource';
import type { FilterBuilderOptions } from '../pagination';
import { FilterBuilder } from '../pagination';
import type { Channel } from '../channel';
import type { StreamChat } from '../client';
import type { ChannelFilters, ChannelOptions, ChannelSort } from '../types';
import type { SearchSourceOptions } from './types';

type CustomContext = Record<string, unknown>;

export type ChannelSearchSourceFilterBuilderContext<
  C extends CustomContext = CustomContext,
> = { searchQuery?: string } & C;

export type ChannelSearchSourceOptions = SearchSourceOptions & {
  /** Static base filters merged under the dynamically generated ones. */
  filters?: ChannelFilters;
  sort?: ChannelSort;
  searchOptions?: Omit<ChannelOptions, 'limit' | 'offset'>;
};

export class ChannelSearchSource<
  TFilterContext extends CustomContext = CustomContext,
> extends BaseSearchSource<Channel> {
  readonly type = 'channels';
  client: StreamChat;
  filters: ChannelFilters | undefined;
  sort: ChannelSort | undefined;
  searchOptions: Omit<ChannelOptions, 'limit' | 'offset'> | undefined;
  filterBuilder: FilterBuilder<
    ChannelFilters,
    ChannelSearchSourceFilterBuilderContext<TFilterContext>
  >;

  constructor(
    client: StreamChat,
    options?: ChannelSearchSourceOptions,
    filterBuilderOptions: FilterBuilderOptions<
      ChannelFilters,
      ChannelSearchSourceFilterBuilderContext<TFilterContext>
    > = {},
  ) {
    const { filters, sort, searchOptions, ...restOptions } = options || {};
    super(restOptions);
    this.client = client;
    this.filters = filters;
    this.sort = sort;
    this.searchOptions = searchOptions;
    this.filterBuilder = new FilterBuilder<
      ChannelFilters,
      ChannelSearchSourceFilterBuilderContext<TFilterContext>
    >({
      ...filterBuilderOptions,
      initialFilterConfig: {
        name: {
          enabled: true,
          generate: ({ searchQuery }) =>
            searchQuery ? { name: { $autocomplete: searchQuery } } : null,
        },
        ...filterBuilderOptions.initialFilterConfig,
      },
    });
  }

  protected async query(searchQuery: string, queryOptions: SearchQueryOptions = {}) {
    const filters = this.filterBuilder.buildFilters({
      baseFilters: {
        ...(this.client.userId ? { members: { $in: [this.client.userId] } } : {}),
        ...this.filters,
      },
      context: { searchQuery } as Partial<
        ChannelSearchSourceFilterBuilderContext<TFilterContext>
      >,
    });
    const sort = this.sort;
    const options = { ...this.searchOptions, limit: this.pageSize, offset: this.offset };
    const items = await this.client.queryChannelsAndHydrate(
      {
        filter_conditions: filters,
        sort,
        ...options,
      },
      { withResponse: false },
      queryOptions,
    );
    return { items };
  }

  protected filterQueryResults(items: Channel[]) {
    return items;
  }
}
