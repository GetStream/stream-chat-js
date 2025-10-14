import { BaseSearchSource } from './BaseSearchSource';
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
    options?: SearchSourceOptions,
    filterBuilderOptions: FilterBuilderOptions<
      ChannelFilters,
      ChannelSearchSourceFilterBuilderContext<TFilterContext>
    > = {},
  ) {
    super(options);
    this.client = client;
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

  protected async query(searchQuery: string) {
    const filters = this.filterBuilder.buildFilters({
      baseFilters: {
        ...(this.client.userID ? { members: { $in: [this.client.userID] } } : {}),
        ...this.filters,
      },
      context: { searchQuery } as Partial<
        ChannelSearchSourceFilterBuilderContext<TFilterContext>
      >,
    });
    const sort = this.sort ?? {};
    const options = { ...this.searchOptions, limit: this.pageSize, offset: this.offset };
    const items = await this.client.queryChannels(filters, sort, options);
    return { items };
  }

  protected filterQueryResults(items: Channel[]) {
    return items;
  }
}
