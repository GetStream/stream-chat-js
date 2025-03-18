import type { ChannelAPIResponse, ChannelFilters, ChannelSort } from './types';
import type { StreamChat } from './client';

// const noop = async <T, R = unknown>(_: T): Promise<R> => undefined as unknown as R;

export type UpsertCidsForQueryType = {
  cids: string[];
  filters?: ChannelFilters;
  flush?: boolean;
  sort?: ChannelSort;
};

export type UpsertChannelsType = {
  channels: ChannelAPIResponse[];
  filters?: ChannelFilters;
  flush?: boolean;
  isLatestMessagesSet?: boolean;
  sort?: ChannelSort;
};

export type GetChannelsType = {
  cids: string[];
  userId: string;
};

export type GetChannelsForQueryType = {
  userId: string;
  filters?: ChannelFilters;
  sort?: ChannelSort;
};

export interface OfflineDBApi {
  upsertCidsForQuery: ((options: UpsertCidsForQueryType) => Promise<unknown>) | undefined;
  upsertChannels: ((options: UpsertChannelsType) => Promise<unknown>) | undefined;
  getChannels: ((options: GetChannelsType) => Promise<unknown>) | undefined;
  getChannelsForQuery:
    | ((options: GetChannelsForQueryType) => Promise<unknown>)
    | undefined;
}

export abstract class AbstractOfflineDB implements OfflineDBApi {
  private client: StreamChat;

  constructor({ client }: { client: StreamChat }) {
    this.client = client;
  }

  upsertCidsForQuery = undefined;

  upsertChannels = undefined;

  getChannels = undefined;

  getChannelsForQuery = undefined;
}

export class DefaultOfflineDB extends AbstractOfflineDB {
  constructor({ client }: { client: StreamChat }) {
    super({ client });
  }
}
