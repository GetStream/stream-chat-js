import { describe, it, expect, vi, beforeEach, afterEach, MockInstance } from 'vitest';
import { ChannelSearchSource } from '../../../src/search/ChannelSearchSource';
import type { Channel } from '../../../src/channel';
import type { StreamChat } from '../../../src/client';
import type { ChannelAPIResponse } from '../../../src/types';
import { generateChannel } from '../test-utils/generateChannel';
import { getClientWithUser } from '../test-utils/getClient';

describe('ChannelSearchSource', () => {
  const user = { id: 'user-123' };
  let client: StreamChat;
  let searchSource: ChannelSearchSource;
  let queryChannelsMock: MockInstance<StreamChat['queryChannels']>;
  let channels: Channel[];
  const mockChannels: ChannelAPIResponse[] = [generateChannel(), generateChannel()];

  beforeEach(() => {
    client = getClientWithUser(user);
    channels = mockChannels.map((data) =>
      client.channel(data.channel.type, data.channel.id),
    );
    queryChannelsMock = vi.spyOn(client, 'queryChannels').mockResolvedValue(channels);
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
    searchSource = new ChannelSearchSource(
      client,
      { pageSize: 100 },
      {
        initialContext: { isAdmin: true, searchQuery: 'abc' },
        initialFilterConfig: {
          customGenerator: {
            enabled: true,
            generate: () => ({ members: { $in: ['member-id'] } }),
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
      members: { $in: ['member-id'] },
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
    searchSource.sort = { last_message_at: -1 };
    searchSource.searchOptions = { message_limit: 5 };

    // @ts-expect-error accessing protected property
    await searchSource.query('channel search');

    expect(queryChannelsMock).toHaveBeenCalledWith(
      {
        'member.user.name': {
          $autocomplete: 'channel search',
        }, // custom
        members: { $in: [user.id] }, // static default
        name: { $autocomplete: 'channel search' }, // dynamic default
      },
      { last_message_at: -1 },
      { message_limit: 5, limit: searchSource.pageSize, offset: searchSource.offset },
    );
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

  it('works without client.userID', async () => {
    searchSource.client.userID = undefined;
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
