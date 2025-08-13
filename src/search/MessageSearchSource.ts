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
import { FilterBuilder } from '../pagination';

export class MessageSearchSource extends BaseSearchSource<MessageResponse> {
  readonly type = 'messages';
  private client: StreamChat;
  messageSearchChannelFilters: ChannelFilters | undefined;
  messageSearchFilters: MessageFilters | undefined;
  messageSearchSort: SearchMessageSort | undefined;
  channelQueryFilters: ChannelFilters | undefined;
  channelQuerySort: ChannelSort | undefined;
  channelQueryOptions: Omit<ChannelOptions, 'limit' | 'offset'> | undefined;
  messageSearchFilterBuilder: FilterBuilder<MessageFilters, { searchQuery: string }>;
  messageSearchChannelFilterBuilder: FilterBuilder<
    ChannelFilters,
    { searchQuery: string }
  >;
  channelQueryFilterBuilder: FilterBuilder<ChannelFilters, { cids: string[] }>;

  constructor(client: StreamChat, options?: SearchSourceOptions) {
    super(options);
    this.client = client;
    this.messageSearchChannelFilterBuilder = new FilterBuilder<
      ChannelFilters,
      { searchQuery: string }
    >();
    this.messageSearchFilterBuilder = new FilterBuilder<
      MessageFilters,
      { searchQuery: string }
    >({
      initialFilterConfig: {
        text: {
          enabled: true,
          generate: ({ searchQuery }) => ({ text: searchQuery }),
        },
      },
    });
    this.channelQueryFilterBuilder = new FilterBuilder<
      ChannelFilters,
      { cids: string[] }
    >({
      initialFilterConfig: {
        cid: {
          enabled: true,
          generate: ({ cids }) => ({ cid: { $in: cids } }),
        },
      },
    });
  }

  protected async query(searchQuery: string) {
    if (!this.client.userID || !searchQuery) return { items: [] };

    const channelFilters = this.messageSearchChannelFilterBuilder.buildFilters({
      baseFilters: {
        ...(this.client.userID ? { members: { $in: [this.client.userID] } } : {}),
        ...this.messageSearchChannelFilters,
      },
      context: { searchQuery },
    });

    const messageFilters: MessageFilters = this.messageSearchFilterBuilder.buildFilters({
      baseFilters: {
        type: 'regular', // FIXME: type: 'reply' resp. do not filter by type and allow to jump to a message in a thread - missing support
        ...this.messageSearchFilters,
      },
      context: { searchQuery },
    });

    const sort: SearchMessageSort = {
      created_at: -1,
      ...this.messageSearchSort,
    };

    const options = {
      limit: this.pageSize,
      next: this.next,
      sort,
    } as SearchOptions;

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
      }, new Set<string>()), // keep the cids unique
    );

    const allChannelsLoadedLocally = cids.length === 0;

    if (!allChannelsLoadedLocally) {
      const channelQueryFilters = this.channelQueryFilterBuilder.buildFilters({
        baseFilters: this.channelQueryFilters,
        context: { cids },
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
