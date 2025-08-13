import { BaseSearchSource } from './BaseSearchSource';
import { FilterBuilder } from '../pagination';
import type { StreamChat } from '../client';
import type { UserFilters, UserOptions, UserResponse, UserSort } from '../types';
import type { SearchSourceOptions } from './types';

export class UserSearchSource extends BaseSearchSource<UserResponse> {
  readonly type = 'users';
  client: StreamChat;
  filters: UserFilters | undefined;
  sort: UserSort | undefined;
  searchOptions: Omit<UserOptions, 'limit' | 'offset'> | undefined;
  filterBuilder: FilterBuilder<UserFilters, { searchQuery?: string }>;

  constructor(client: StreamChat, options?: SearchSourceOptions) {
    super(options);
    this.client = client;
    this.filterBuilder = new FilterBuilder<UserFilters, { searchQuery?: string }>({
      initialFilterConfig: {
        $or: {
          enabled: true,
          generate: ({ searchQuery }) =>
            searchQuery
              ? {
                  $or: [
                    { id: { $autocomplete: searchQuery } },
                    { name: { $autocomplete: searchQuery } },
                  ],
                }
              : null,
        },
      },
    });
  }

  protected async query(searchQuery: string) {
    const filters = this.filterBuilder.buildFilters({
      baseFilters: this.filters,
      context: { searchQuery },
    });
    const sort = { id: 1, ...this.sort } as UserSort;
    const options = { ...this.searchOptions, limit: this.pageSize, offset: this.offset };
    const { users } = await this.client.queryUsers(filters, sort, options);
    return { items: users };
  }

  protected filterQueryResults(items: UserResponse[]) {
    return items.filter((u) => u.id !== this.client.user?.id);
  }
}
