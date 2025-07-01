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

export class MessageSearchSource extends BaseSearchSource<MessageResponse> {
  readonly type = 'messages';
  private client: StreamChat;
  messageSearchChannelFilters: ChannelFilters | undefined;
  messageSearchFilters: MessageFilters | undefined;
  messageSearchSort: SearchMessageSort | undefined;
  channelQueryFilters: ChannelFilters | undefined;
  channelQuerySort: ChannelSort | undefined;
  channelQueryOptions: Omit<ChannelOptions, 'limit' | 'offset'> | undefined;

  constructor(client: StreamChat, options?: SearchSourceOptions) {
    super(options);
    this.client = client;
  }

  protected async query(searchQuery: string) {
    if (!this.client.userID) return { items: [] };

    const channelFilters: ChannelFilters = {
      members: { $in: [this.client.userID] },
      ...this.messageSearchChannelFilters,
    } as ChannelFilters;

    const messageFilters: MessageFilters = {
      text: searchQuery,
      type: 'regular', // FIXME: type: 'reply' resp. do not filter by type and allow to jump to a message in a thread - missing support
      ...this.messageSearchFilters,
    } as MessageFilters;

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
      await this.client.queryChannels(
        {
          cid: { $in: cids },
          ...this.channelQueryFilters,
        } as ChannelFilters,
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
