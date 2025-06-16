import { BaseSearchSource } from './BaseSearchSource';
import type { Channel } from '../channel';
import type { StreamChat } from '../client';
import type { ChannelFilters, ChannelOptions, ChannelSort } from '../types';
import type { SearchSourceOptions } from './types';

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
