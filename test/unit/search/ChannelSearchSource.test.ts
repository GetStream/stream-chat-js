import { describe, it, expect, vi, beforeEach, afterEach, MockInstance } from 'vitest';
import { ChannelSearchSource } from '../../../src/search/ChannelSearchSource';
import { SearchController } from '../../../src/search/SearchController';
import type { Channel } from '../../../src/channel';
import type { StreamChat } from '../../../src/client';
import type { ChannelStateResponseFields, ChannelFilters } from '../../../src/types';
import { generateChannel } from '../test-utils/generateChannel';
import { getClientWithUser } from '../test-utils/getClient';

describe('ChannelSearchSource', () => {
  const user = { id: 'user-123' };
  let client: StreamChat;
  let searchSource: ChannelSearchSource;
  let queryChannelsMock: MockInstance<StreamChat['queryChannelsAndHydrate']>;
  let channels: Channel[];
  const mockChannels: ChannelStateResponseFields[] = [
    generateChannel(),
    generateChannel(),
  ];

  beforeEach(() => {
    client = getClientWithUser(user);
    channels = mockChannels.map((data) =>
      client.channelManager.ensure({ type: data.channel.type, id: data.channel.id }),
    );
    queryChannelsMock = vi
      .spyOn(client, 'queryChannelsAndHydrate')
      .mockResolvedValue(channels);
    searchSource = new ChannelSearchSource(client);
  });

  afterEach(vi.clearAllMocks);

  it('initializes correctly', () => {
    expect(searchSource.type).toBe('channels');
    expect(searchSource.client).toBe(client);
    expect(searchSource.filterBuilder).toBeDefined();
    expect(searchSource.pageSize).toBe(10);
    expect(searchSource.offset).toBe(0);
  });

  it('initializes with custom options', () => {
    const searchSource = new ChannelSearchSource<{ isAdmin?: boolean }>(
      client,
      { pageSize: 100 },
      {
        initialContext: { isAdmin: true, searchQuery: 'abc' },
        initialFilterConfig: {
          customGenerator: {
            enabled: true,
            generate: ({ searchQuery }) => {
              return searchQuery
                ? {
                    $and: [
                      { members: { $in: ['member-id'] } },
                      { name: { $autocomplete: searchQuery } },
                    ],
                  }
                : { members: { $in: ['member-id'] } };
            },
          },
        },
      },
    );
    expect(searchSource.type).toBe('channels');
    expect(searchSource.client).toBe(client);
    expect(searchSource.filterBuilder).toBeDefined();
    expect(searchSource.pageSize).toBe(100);
    expect(searchSource.offset).toBe(0);

    expect(searchSource.filterBuilder.context.getLatestValue()).toEqual({
      isAdmin: true,
      searchQuery: 'abc',
    });

    expect(
      searchSource.filterBuilder.filterConfig.getLatestValue().customGenerator,
    ).toEqual({
      enabled: true,
      generate: expect.any(Function),
    });

    expect(
      searchSource.filterBuilder.filterConfig
        .getLatestValue()
        .customGenerator.generate({ searchQuery: 'xxx' }),
    ).toEqual({
      $and: [{ members: { $in: ['member-id'] } }, { name: { $autocomplete: 'xxx' } }],
    });

    expect(
      searchSource.filterBuilder.filterConfig
        .getLatestValue()
        .customGenerator.generate({}),
    ).toEqual({
      members: { $in: ['member-id'] },
    });
  });

  it('uses default options and custom filter builder options', () => {
    const searchSource = new ChannelSearchSource(
      client,
      {},
      {
        initialContext: { isAdmin: true, searchQuery: 'abc' },
      },
    );
    expect(searchSource.type).toBe('channels');
    expect(searchSource.client).toBe(client);
    expect(searchSource.filterBuilder).toBeDefined();
    expect(searchSource.pageSize).toBe(10);
    expect(searchSource.offset).toBe(0);

    expect(searchSource.filterBuilder.context.getLatestValue()).toEqual({
      isAdmin: true,
      searchQuery: 'abc',
    });

    expect(searchSource.filterBuilder.filterConfig.getLatestValue()).toEqual({
      name: { enabled: true, generate: expect.any(Function) },
    });
  });

  it('builds filters including membership filter with client userID', async () => {
    const spyBuildFilters = vi
      .spyOn(searchSource.filterBuilder, 'buildFilters')
      .mockReturnValue({});

    // @ts-expect-error accessing protected property
    await searchSource.query('test-search');

    expect(spyBuildFilters).toHaveBeenCalledWith({
      baseFilters: { members: { $in: [user.id] } },
      context: { searchQuery: 'test-search' },
    });
  });

  it('passes filters, sort, and options to client.queryChannels', async () => {
    searchSource.filters = { name: { $autocomplete: 'channel' } };
    searchSource.filterBuilder.updateFilterConfig({
      'member.user.name': {
        enabled: true,
        generate: ({ searchQuery }) =>
          searchQuery ? { 'member.user.name': { $autocomplete: searchQuery } } : null,
      },
    });
    searchSource.sort = [{ field: 'last_message_at', direction: -1 }];
    searchSource.searchOptions = { message_limit: 5 };

    // @ts-expect-error accessing protected property
    await searchSource.query('channel search');

    expect(queryChannelsMock).toHaveBeenCalledWith(
      {
        filter_conditions: {
          'member.user.name': {
            $autocomplete: 'channel search',
          },
          members: { $in: [user.id] },
          name: { $autocomplete: 'channel search' },
        },
        sort: [{ field: 'last_message_at', direction: -1 }],
        watch: false,
        message_limit: 5,
        limit: searchSource.pageSize,
        offset: searchSource.offset,
      },
      { withResponse: false },
      // query() invoked directly in tests is not driven by executeQuery, so it has none.
      {},
    );
  });

  it('watches its results only when searchOptions asks for it', async () => {
    // @ts-expect-error accessing protected property
    await searchSource.query('any');
    expect(queryChannelsMock.mock.calls[0][0]).toMatchObject({ watch: false });

    searchSource.searchOptions = { watch: true };
    // @ts-expect-error accessing protected property
    await searchSource.query('any');
    expect(queryChannelsMock.mock.calls[1][0]).toMatchObject({ watch: true });
  });

  it('keeps its results in the channel store while it is active', async () => {
    searchSource.activate();
    await searchSource.executeQuery('any');

    client.channelManager.releaseUnusedChannels();
    expect(client.channelManager.values()).toEqual(channels);

    searchSource.deactivate();
    client.channelManager.releaseUnusedChannels();
    expect(client.channelManager.values()).toEqual([]);
  });

  it('stops keeping its results once disposed, and keeps them again when registered', async () => {
    searchSource.activate();
    await searchSource.executeQuery('any');

    searchSource.dispose();
    client.channelManager.releaseUnusedChannels();
    expect(client.channelManager.values()).toEqual([]);

    channels.forEach((channel) =>
      client.channelManager.getOrCreateChannel(channel.cid, () => channel),
    );
    searchSource.registerSubscriptions();
    client.channelManager.releaseUnusedChannels();
    expect(client.channelManager.values()).toEqual(channels);
  });

  it('is disposed and registered again through its search controller', async () => {
    const controller = new SearchController({ client, sources: [searchSource] });
    searchSource.activate();
    await searchSource.executeQuery('any');

    // the cleanup and second mount a UI's StrictMode runs on the same instance
    controller.dispose();
    controller.registerSubscriptions();
    client.channelManager.releaseUnusedChannels();

    expect(client.channelManager.values()).toEqual(channels);
  });

  it('returns items from query', async () => {
    // @ts-expect-error accessing protected property
    const result = await searchSource.query('any');

    expect(result.items).toEqual(channels);
  });

  it('filterQueryResults returns items unmodified', () => {
    // @ts-expect-error accessing protected property
    const result = searchSource.filterQueryResults(channels);
    expect(result).toBe(channels);
  });

  it('works without client.userId', async () => {
    searchSource.client.user = undefined;
    const spyBuildFilters = vi
      .spyOn(searchSource.filterBuilder, 'buildFilters')
      .mockReturnValue({});

    // @ts-expect-error accessing protected property
    await searchSource.query('no-user');

    expect(spyBuildFilters).toHaveBeenCalledWith({
      baseFilters: {},
      context: { searchQuery: 'no-user' },
    });
  });
});
