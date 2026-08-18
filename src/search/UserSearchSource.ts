import { BaseSearchSource, type SearchQueryOptions } from './BaseSearchSource';
import { FilterBuilder, type FilterBuilderOptions } from '../pagination';
import type { StreamChat } from '../client';
import type { UserFilters, UserOptions, UserResponse, UserSort } from '../types';
import type { SearchSourceOptions } from './types';

type CustomContext = Record<string, unknown>;

export type UserSearchSourceFilterBuilderContext<
  C extends CustomContext = CustomContext,
> = { searchQuery?: string } & C;

export type UserSearchSourceOptions = SearchSourceOptions & {
  /** Static base filters merged under the dynamically generated ones. */
  filters?: UserFilters;
  sort?: UserSort;
  searchOptions?: Omit<UserOptions, 'limit' | 'offset'>;
};

export class UserSearchSource<
  TFilterContext extends CustomContext = CustomContext,
> extends BaseSearchSource<UserResponse> {
  readonly type = 'users';
  client: StreamChat;
  filters: UserFilters | undefined;
  sort: UserSort | undefined;
  searchOptions: Omit<UserOptions, 'limit' | 'offset'> | undefined;
  filterBuilder: FilterBuilder<
    UserFilters,
    UserSearchSourceFilterBuilderContext<TFilterContext>
  >;

  constructor(
    client: StreamChat,
    options?: UserSearchSourceOptions,
    filterBuilderOptions: FilterBuilderOptions<
      UserFilters,
      UserSearchSourceFilterBuilderContext<TFilterContext>
    > = {},
  ) {
    const { filters, sort, searchOptions, ...restOptions } = options || {};
    super(restOptions);
    this.client = client;
    this.filters = filters;
    this.sort = sort;
    this.searchOptions = searchOptions;
    this.filterBuilder = new FilterBuilder<
      UserFilters,
      UserSearchSourceFilterBuilderContext<TFilterContext>
    >({
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
      ...filterBuilderOptions,
    });
  }

  protected async query(searchQuery: string, queryOptions: SearchQueryOptions = {}) {
    const filters = this.filterBuilder.buildFilters({
      baseFilters: this.filters,
      context: { searchQuery } as UserSearchSourceFilterBuilderContext<TFilterContext>,
    });
    const baseSort = this.sort ?? [];
    const hasIdSort = baseSort.some((entry) => entry.field === 'id');
    const sort: UserSort = hasIdSort
      ? baseSort
      : [...baseSort, { field: 'id', direction: 1 }];
    const options = { ...this.searchOptions, limit: this.pageSize, offset: this.offset };
    const { users } = await this.client.queryUsers(
      {
        payload: {
          filter_conditions: filters,
          sort,
          ...options,
        },
      },
      queryOptions,
    );
    return { items: users };
  }

  protected filterQueryResults(items: UserResponse[]) {
    return items.filter((u) => u.id !== this.client.user?.id);
  }
}
