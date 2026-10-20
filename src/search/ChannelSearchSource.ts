import { BaseSearchSource, type SearchQueryOptions } from './BaseSearchSource';
import type { FilterBuilderOptions } from '../pagination';
import { FilterBuilder } from '../pagination';
import type { Channel } from '../channel';
import type { StreamChat } from '../client';
import type { ChannelFilters, ChannelOptions, SortParamRequest } from '../types';
import type { SearchSourceOptions } from './types';

type CustomContext = Record<string, unknown>;

export type ChannelSearchSourceFilterBuilderContext<
  C extends CustomContext = CustomContext,
> = { searchQuery?: string } & C;

export type ChannelSearchSourceOptions = SearchSourceOptions & {
  /** Static base filters merged under the dynamically generated ones. */
  filters?: ChannelFilters;
  sort?: SortParamRequest[];
  /**
   * Query options. Results are not watched unless `watch: true`: they are previews, and opening
   * one watches it.
   */
  searchOptions?: Omit<ChannelOptions, 'limit' | 'offset'>;
};

export class ChannelSearchSource<
  TFilterContext extends CustomContext = CustomContext,
> extends BaseSearchSource<Channel> {
  readonly type = 'channels';
  client: StreamChat;
  filters: ChannelFilters | undefined;
  sort: SortParamRequest[] | undefined;
  searchOptions: Omit<ChannelOptions, 'limit' | 'offset'> | undefined;
  filterBuilder: FilterBuilder<
    ChannelFilters,
    ChannelSearchSourceFilterBuilderContext<TFilterContext>
  >;

  private removeClaim?: () => void;

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

    // Subscribed to the source's own state, so it goes away with the source.
    this.state.subscribeWithSelector(
      ({ isActive }) => ({ isActive }),
      () => this.registerSubscriptions(),
    );
  }

  /**
   * While active, the results count as used in the channel store (see `EntityStore.addClaim`).
   * Follows `isActive`; `SearchController.registerSubscriptions()` also calls it to re-register
   * after `dispose()`.
   */
  registerSubscriptions() {
    if (!this.isActive) {
      this.dispose();
      return;
    }
    this.removeClaim ??= this.client.channelManager.channelStore.addClaim({
      heldBy: () => this.items ?? [],
      name: 'channel-search',
    });
  }

  /** Removes the channel-store registration, so a dropped active source can be collected. */
  dispose() {
    this.removeClaim?.();
    this.removeClaim = undefined;
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
    const options = {
      watch: false,
      ...this.searchOptions,
      limit: this.pageSize,
      offset: this.offset,
    };
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
