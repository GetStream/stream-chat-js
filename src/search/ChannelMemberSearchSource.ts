import { BaseSearchSource, type SearchQueryOptions } from './BaseSearchSource';
import { FilterBuilder, type FilterBuilderOptions } from '../pagination';
import type { Channel } from '../channel';
import type {
  ChannelMemberResponse,
  MemberFilters,
  MemberSort,
  QueryMembersOptions,
} from '../types';
import type { SearchSourceOptions } from './types';

type CustomContext = Record<string, unknown>;

export type ChannelMemberSearchSourceFilterBuilderContext<
  C extends CustomContext = CustomContext,
> = { searchQuery?: string } & C;

export type ChannelMemberSearchSourceOptions = SearchSourceOptions & {
  /** Static base filters merged under the dynamically generated ones. */
  filters?: MemberFilters;
  sort?: MemberSort;
  searchOptions?: Omit<QueryMembersOptions, 'limit' | 'offset'>;
};

export class ChannelMemberSearchSource<
  TFilterContext extends CustomContext = CustomContext,
> extends BaseSearchSource<ChannelMemberResponse> {
  readonly type = 'members';
  channel: Channel;
  filters: MemberFilters | undefined;
  sort: MemberSort | undefined;
  searchOptions: Omit<QueryMembersOptions, 'limit' | 'offset'> | undefined;
  filterBuilder: FilterBuilder<
    MemberFilters,
    ChannelMemberSearchSourceFilterBuilderContext<TFilterContext>
  >;

  constructor(
    channel: Channel,
    options?: ChannelMemberSearchSourceOptions,
    filterBuilderOptions: FilterBuilderOptions<
      MemberFilters,
      ChannelMemberSearchSourceFilterBuilderContext<TFilterContext>
    > = {},
  ) {
    const { filters, sort, searchOptions, ...restOptions } = options || {};
    super(restOptions);
    this.channel = channel;
    this.filters = filters;
    this.sort = sort;
    this.searchOptions = searchOptions;
    this.filterBuilder = new FilterBuilder<
      MemberFilters,
      ChannelMemberSearchSourceFilterBuilderContext<TFilterContext>
    >({
      initialFilterConfig: {
        default: {
          enabled: true,
          generate: ({ searchQuery }) =>
            searchQuery
              ? {
                  $or: [
                    { name: { $autocomplete: searchQuery } },
                    { id: { $eq: searchQuery } },
                  ],
                }
              : null,
        },
      },
      ...filterBuilderOptions,
    });
  }

  canExecuteQuery = (newSearchString?: string) => {
    const hasNewSearchQuery = typeof newSearchString !== 'undefined';

    return this.isActive && this.canDispatchQuery(hasNewSearchQuery);
  };

  protected async query(searchQuery: string, queryOptions: SearchQueryOptions = {}) {
    const filters = this.filterBuilder.buildFilters({
      baseFilters: this.filters,
      context: {
        searchQuery,
      } as ChannelMemberSearchSourceFilterBuilderContext<TFilterContext>,
    });
    const sort = this.sort ?? [];
    const options = { ...this.searchOptions, limit: this.pageSize, offset: this.offset };
    const { members } = await this.channel.queryMembers(
      filters ?? {},
      sort,
      options,
      queryOptions,
    );
    return { items: members };
  }

  protected filterQueryResults(items: ChannelMemberResponse[]) {
    return items;
  }
}
