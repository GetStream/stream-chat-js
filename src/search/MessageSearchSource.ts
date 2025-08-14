import { BaseSearchSource } from './BaseSearchSource';
import type {
  ChannelFilters,
  ChannelOptions,
  ChannelSort,
  MessageFilters,
  MessageResponse,
  SearchMessageSort,
  SearchOptions,
} from '../types';
import type { StreamChat } from '../client';
import type { SearchSourceOptions } from './types';
import { FilterBuilder, type FilterBuilderOptions } from '../pagination';

type CustomContext = Record<string, unknown>;

// Built-in contexts per builder
type BuiltInContexts = {
  messageSearchChannel: { searchQuery?: string };
  messageSearch: { searchQuery?: string };
  channelQuery: { cids?: string[] };
};

// Merge Built-in with user-provided Custom context
type MergeContext<
  B extends Record<string, unknown>,
  C extends CustomContext | undefined,
> = B & (C extends object ? C : {});

// User can provide custom context for each builder
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

export class MessageSearchSource<
  TContexts extends MessageSearchSourceContexts = {},
> extends BaseSearchSource<MessageResponse> {
  readonly type = 'messages';
  private client: StreamChat;

  messageSearchChannelFilters: ChannelFilters | undefined;
  messageSearchFilters: MessageFilters | undefined;
  messageSearchSort: SearchMessageSort | undefined;

  channelQueryFilters: ChannelFilters | undefined;
  channelQuerySort: ChannelSort | undefined;
  channelQueryOptions: Omit<ChannelOptions, 'limit' | 'offset'> | undefined;

  messageSearchChannelFilterBuilder: FilterBuilder<
    ChannelFilters,
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

  constructor(
    client: StreamChat,
    options?: SearchSourceOptions,
    filterBuilderOptions?: MessageSearchSourceFilterBuilderOptions<TContexts>,
  ) {
    super(options);
    this.client = client;

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
  }

  protected async query(searchQuery: string) {
    if (!this.client.userID || !searchQuery || this.next === null) return { items: [] };

    const channelFilters = this.messageSearchChannelFilterBuilder.buildFilters({
      baseFilters: {
        ...(this.client.userID ? { members: { $in: [this.client.userID] } } : {}),
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

    const sort: SearchMessageSort = {
      created_at: -1,
      ...this.messageSearchSort,
    };

    const options: SearchOptions = {
      limit: this.pageSize,
      next: this.next,
      sort,
    };

    const { next, results } = await this.client.search(
      channelFilters,
      messageFilters,
      options,
    );
    const items = results.map(({ message }) => message);

    const cids = Array.from(
      items.reduce((acc, message) => {
        if (message.cid && !this.client.activeChannels[message.cid]) acc.add(message.cid);
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
      await this.client.queryChannels(
        channelQueryFilters,
        {
          last_message_at: -1,
          ...this.channelQuerySort,
        },
        this.channelQueryOptions,
      );
    }

    return { items, next };
  }

  protected filterQueryResults(items: MessageResponse[]) {
    return items;
  }
}
