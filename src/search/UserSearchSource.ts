import { BaseSearchSource } from './BaseSearchSource';
import type { StreamChat } from '../client';
import type { UserFilters, UserOptions, UserResponse, UserSort } from '../types';
import type { SearchSourceOptions } from './types';

export class UserSearchSource extends BaseSearchSource<UserResponse> {
  readonly type = 'users';
  private client: StreamChat;
  filters: UserFilters | undefined;
  sort: UserSort | undefined;
  searchOptions: Omit<UserOptions, 'limit' | 'offset'> | undefined;

  constructor(client: StreamChat, options?: SearchSourceOptions) {
    super(options);
    this.client = client;
  }

  protected async query(searchQuery: string) {
    const filters = {
      $or: [
        { id: { $autocomplete: searchQuery } },
        { name: { $autocomplete: searchQuery } },
      ],
      ...this.filters,
    } as UserFilters;
    const sort = { id: 1, ...this.sort } as UserSort;
    const options = { ...this.searchOptions, limit: this.pageSize, offset: this.offset };
    const { users } = await this.client.queryUsers(filters, sort, options);
    return { items: users };
  }

  protected filterQueryResults(items: UserResponse[]) {
    return items.filter((u) => u.id !== this.client.user?.id);
  }
}
