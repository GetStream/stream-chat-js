import { BaseSearchSource, type SearchQueryOptions } from './BaseSearchSource';
import type {
  ChannelFilters,
  ChannelOptions,
  MessageFilters,
  MessageResponse,
  SearchPayload,
  SortParamRequest,
} from '../types';
import type { StreamChat } from '../client';
import type { SearchSourceOptions } from './types';
import { FilterBuilder, type FilterBuilderOptions } from '../pagination';
import type { Channel } from '../channel';

type CustomContext = Record<string, unknown>;

type BuiltInContexts = {
  messageSearchChannel: { searchQuery?: string };
  messageSearch: { searchQuery?: string };
  channelQuery: { cids?: string[] };
};

type MergeContext<
  B extends Record<string, unknown>,
  C extends CustomContext | undefined,
> = B & (C extends object ? C : {});

type MessageSearchSourceContexts = Partial<{
  messageSearchChannelContext: Record<string, unknown>;
  messageSearchContext: Record<string, unknown>;
  channelQueryContext: Record<string, unknown>;
}>;

export type MessageSearchSourceFilterBuilderOptions<
  TContexts extends MessageSearchSourceContexts = {},
> = Partial<{
  messageSearchChannel: FilterBuilderOptions<
    ChannelFilters,
    MergeContext<
      BuiltInContexts['messageSearchChannel'],
      TContexts['messageSearchChannelContext']
    >
  >;
  messageSearch: FilterBuilderOptions<
    MessageFilters,
    MergeContext<BuiltInContexts['messageSearch'], TContexts['messageSearchContext']>
  >;
  channelQuery: FilterBuilderOptions<
    ChannelFilters,
    MergeContext<BuiltInContexts['channelQuery'], TContexts['channelQueryContext']>
  >;
}>;

export type MessageSearchSourceOptions = SearchSourceOptions & {
  /** Static base filters for the channel scope of the message search. */
  messageSearchChannelFilters?: ChannelFilters;
  /** Static base filters for the message search itself. */
  messageSearchFilters?: MessageFilters;
  messageSearchSort?: SortParamRequest[];
  /** Static base filters for the follow-up query that hydrates unknown channels. */
  channelQueryFilters?: ChannelFilters;
  channelQuerySort?: SortParamRequest[];
  /**
   * Options for the follow-up query that hydrates unknown channels. They are not watched unless
   * `watch: true`: a result is a preview, and opening one watches its channel.
   */
  channelQueryOptions?: Omit<ChannelOptions, 'limit' | 'offset'>;
};

export class MessageSearchSource<
  TContexts extends MessageSearchSourceContexts = {},
> extends BaseSearchSource<MessageResponse> {
  readonly type = 'messages';
  private client: StreamChat;

  messageSearchChannelFilters: SearchPayload['filter_conditions'] | undefined;
  messageSearchFilters: MessageFilters | undefined;
  messageSearchSort: SortParamRequest[] | undefined;

  channelQueryFilters: ChannelFilters | undefined;
  channelQuerySort: SortParamRequest[] | undefined;
  channelQueryOptions: Omit<ChannelOptions, 'limit' | 'offset'> | undefined;

  messageSearchChannelFilterBuilder: FilterBuilder<
    SearchPayload['filter_conditions'],
    MergeContext<
      BuiltInContexts['messageSearchChannel'],
      TContexts['messageSearchChannelContext']
    >
  >;
  messageSearchFilterBuilder: FilterBuilder<
    MessageFilters,
    MergeContext<BuiltInContexts['messageSearch'], TContexts['messageSearchContext']>
  >;
  channelQueryFilterBuilder: FilterBuilder<
    ChannelFilters,
    MergeContext<BuiltInContexts['channelQuery'], TContexts['channelQueryContext']>
  >;

  private removeClaim?: () => void;

  constructor(
    client: StreamChat,
    options?: MessageSearchSourceOptions,
    filterBuilderOptions?: MessageSearchSourceFilterBuilderOptions<TContexts>,
  ) {
    const {
      messageSearchChannelFilters,
      messageSearchFilters,
      messageSearchSort,
      channelQueryFilters,
      channelQuerySort,
      channelQueryOptions,
      ...restOptions
    } = options || {};
    super(restOptions);
    this.client = client;
    this.messageSearchChannelFilters = messageSearchChannelFilters;
    this.messageSearchFilters = messageSearchFilters;
    this.messageSearchSort = messageSearchSort;
    this.channelQueryFilters = channelQueryFilters;
    this.channelQuerySort = channelQuerySort;
    this.channelQueryOptions = channelQueryOptions;

    this.messageSearchChannelFilterBuilder = new FilterBuilder<
      ChannelFilters,
      MergeContext<
        BuiltInContexts['messageSearchChannel'],
        TContexts['messageSearchChannelContext']
      >
    >(filterBuilderOptions?.messageSearchChannel);

    this.messageSearchFilterBuilder = new FilterBuilder<
      MessageFilters,
      MergeContext<BuiltInContexts['messageSearch'], TContexts['messageSearchContext']>
    >({
      ...filterBuilderOptions?.messageSearch,
      initialFilterConfig: {
        text: {
          enabled: true,
          generate: ({ searchQuery }) => (searchQuery ? { text: searchQuery } : null),
        },
        ...filterBuilderOptions?.messageSearch?.initialFilterConfig,
      },
    });

    this.channelQueryFilterBuilder = new FilterBuilder<
      ChannelFilters,
      MergeContext<BuiltInContexts['channelQuery'], TContexts['channelQueryContext']>
    >({
      ...filterBuilderOptions?.channelQuery,
      initialFilterConfig: {
        cid: {
          enabled: true,
          generate: ({ cids }) => (cids ? { cid: { $in: cids } } : null),
        },
        ...filterBuilderOptions?.channelQuery?.initialFilterConfig,
      },
    });

    // Subscribed to the source's own state, so it goes away with the source.
    this.state.subscribeWithSelector(
      ({ isActive }) => ({ isActive }),
      () => this.registerSubscriptions(),
    );
  }

  /**
   * While active, the channels the results come from count as used in the channel store (see
   * `EntityStore.addClaim`), so they stay the instances the results open. Follows `isActive`;
   * `SearchController.registerSubscriptions()` also calls it to re-register after `dispose()`.
   */
  registerSubscriptions() {
    if (!this.isActive) {
      this.dispose();
      return;
    }
    this.removeClaim ??= this.client.channelManager.channelStore.addClaim({
      heldBy: () => this.resultChannels(),
      name: 'message-search',
    });
  }

  /** Removes the channel-store registration, so a dropped active source can be collected. */
  dispose() {
    this.removeClaim?.();
    this.removeClaim = undefined;
  }

  private resultChannels() {
    const channels = new Set<Channel>();
    for (const message of this.items ?? []) {
      const channel = message.cid
        ? this.client.channelManager.get(message.cid)
        : undefined;
      if (channel) channels.add(channel);
    }
    return channels;
  }

  protected async query(searchQuery: string, queryOptions: SearchQueryOptions = {}) {
    if (!this.client.userId || this.next === null) return { items: [] };

    const channelFilters = this.messageSearchChannelFilterBuilder.buildFilters({
      baseFilters: {
        ...(this.client.userId ? { members: { $in: [this.client.userId] } } : {}),
        ...this.messageSearchChannelFilters,
      },
      context: { searchQuery } as Partial<
        MergeContext<
          BuiltInContexts['messageSearchChannel'],
          TContexts['messageSearchChannelContext']
        >
      >,
    });

    const messageFilters: MessageFilters = this.messageSearchFilterBuilder.buildFilters({
      baseFilters: {
        type: 'regular',
        ...this.messageSearchFilters,
      },
      context: { searchQuery } as Partial<
        MergeContext<BuiltInContexts['messageSearch'], TContexts['messageSearchContext']>
      >,
    });

    const customSort = this.messageSearchSort ?? [];
    const createdAtSort = customSort.find(({ field }) => field === 'created_at');
    const sort: SortParamRequest[] = [
      { field: 'created_at', direction: createdAtSort?.direction ?? -1 },
      ...customSort.filter(({ field }) => field !== 'created_at'),
    ];

    const { next, results } = await this.client.search(
      {
        payload: {
          filter_conditions: channelFilters,
          message_filter_conditions: messageFilters,
          limit: this.pageSize,
          next: this.next,
          sort,
        },
      },
      queryOptions,
    );

    const items = results
      .map(({ message }) => message)
      .filter((m): m is NonNullable<typeof m> => Boolean(m));

    // Superseded by a newer query: skip the hydration.
    if (queryOptions.signal?.aborted) return { items, next };

    const cids = Array.from(
      items.reduce((acc, message) => {
        if (message.cid && !this.client.channelManager.get(message.cid))
          acc.add(message.cid);
        return acc;
      }, new Set<string>()),
    );

    if (cids.length > 0) {
      const channelQueryFilters = this.channelQueryFilterBuilder.buildFilters({
        baseFilters: this.channelQueryFilters,
        context: { cids } as Partial<
          MergeContext<BuiltInContexts['channelQuery'], TContexts['channelQueryContext']>
        >,
      });
      await this.client.queryChannelsAndHydrate(
        {
          filter_conditions: channelQueryFilters,
          sort: [{ direction: -1, field: 'last_message_at' }],
          watch: false,
          ...this.channelQueryOptions,
        },
        {},
        queryOptions,
      );
    }

    if (queryOptions.signal?.aborted) return { items, next };

    // The hydration query can miss a result's channel (hidden or filtered out): store it from the
    // message's channel data, unwatched, so every result has a channel to open.
    for (const message of items) {
      if (!message.cid) continue;
      const stored = this.client.channelManager.get(message.cid);
      if (stored && !stored.pendingDisposal) continue;
      const [type, id] = message.cid.split(':');
      if (!type || !id) continue;
      const channel = this.client.channelManager.ensure({ id, type });
      if (message.channel) channel.data = message.channel;
    }

    return { items, next };
  }

  protected filterQueryResults(items: MessageResponse[]) {
    return items;
  }
}
