import { BaseSearchSource } from './BaseSearchSource';
import { FilterBuilder } from '../pagination';
import type { Channel } from '../channel';
import type { StreamChat } from '../client';
import type { ChannelFilters, ChannelOptions, ChannelSort } from '../types';
import type { SearchSourceOptions } from './types';

export class ChannelSearchSource extends BaseSearchSource<Channel> {
  readonly type = 'channels';
  client: StreamChat;
  filters: ChannelFilters | undefined;
  sort: ChannelSort | undefined;
  searchOptions: Omit<ChannelOptions, 'limit' | 'offset'> | undefined;
  filterBuilder: FilterBuilder<ChannelFilters, { searchQuery?: string }>;

  constructor(client: StreamChat, options?: SearchSourceOptions) {
    super(options);
    this.client = client;
    this.filterBuilder = new FilterBuilder<ChannelFilters, { searchQuery?: string }>();
  }

  protected async query(searchQuery: string) {
    const filters = this.filterBuilder.buildFilters({
      baseFilters: {
        ...(this.client.userID ? { members: { $in: [this.client.userID] } } : {}),
        ...this.filters,
      },
      context: { searchQuery },
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
