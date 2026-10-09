import { describe, it, expect, vi, beforeEach, afterEach, MockInstance } from 'vitest';
import { MessageSearchSource } from '../../../src/search/MessageSearchSource';
import { SearchController } from '../../../src/search/SearchController';
import type { StreamChat } from '../../../src/client';
import type { MessageResponse, SearchAPIResponse } from '../../../src/types';
import { getClientWithUser } from '../test-utils/getClient';
import { generateMsg } from '../test-utils/generateMessage';

/** query() invoked directly in tests is not driven by executeQuery, so it has none. */
const withoutSignal = {};

describe('MessageSearchSource', () => {
  const user = { id: 'user-123' };
  let client: StreamChat;
  let searchSource: MessageSearchSource;
  let searchMock: MockInstance<StreamChat['search']>;
  let queryChannelsMock: MockInstance<StreamChat['queryChannelsAndHydrate']>;
  let messages: MessageResponse[];
  let searchResponse: SearchAPIResponse;

  beforeEach(() => {
    client = getClientWithUser(user);
    messages = [generateMsg(), generateMsg()];
    searchResponse = {
      results: messages.map((m) => ({ message: m })),
      next: 'next-token',
    } as any;
    searchMock = vi.spyOn(client, 'search').mockResolvedValue(searchResponse);
    queryChannelsMock = vi.spyOn(client, 'queryChannelsAndHydrate').mockResolvedValue([]);
    searchSource = new MessageSearchSource(client);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('initializes correctly', () => {
    expect(searchSource.type).toBe('messages');
    expect(searchSource['client']).toBe(client);
    expect(searchSource.messageSearchFilterBuilder).toBeDefined();
    expect(searchSource.messageSearchChannelFilterBuilder).toBeDefined();
    expect(searchSource.channelQueryFilterBuilder).toBeDefined();
    expect(searchSource.pageSize).toBe(10);
  });

  it('initializes with custom options', () => {
    const searchSource = new MessageSearchSource<{
      messageSearchChannelContext: { a: string };
      messageSearchContext: { b: string };
      channelQueryContext: { c: string };
    }>(
      client,
      { pageSize: 3000 },
      {
        messageSearchChannel: {
          initialContext: { a: 'messageSearchChannelFilterBuilder' },
          initialFilterConfig: {
            custom: {
              enabled: true,
              generate: ({ searchQuery, a }) =>
                searchQuery ? { name: { $autocomplete: searchQuery + a } } : null,
            },
          },
        },
        messageSearch: {
          initialContext: { b: 'messageSearchFilterBuilder' },
          initialFilterConfig: {
            text: {
              enabled: true,
              generate: ({ searchQuery, b }) =>
                searchQuery ? { text: searchQuery + b } : null,
            },
          },
        },
        channelQuery: {
          initialContext: { c: 'channelQueryFilterBuilder' },
          initialFilterConfig: {
            cid: {
              enabled: true,
              generate: ({ cids, c }) =>
                cids ? { cid: { $in: cids.concat([c as string]) } } : null,
            },
          },
        },
      },
    );
    expect(searchSource.type).toBe('messages');
    expect(searchSource['client']).toBe(client);
    expect(searchSource.messageSearchFilterBuilder.filterConfig.getLatestValue()).toEqual(
      {
        text: { enabled: true, generate: expect.any(Function) },
      },
    );
    expect(
      searchSource.messageSearchFilterBuilder.filterConfig
        .getLatestValue()
        .text.generate({ searchQuery: 'searchQuery', b: 'hello' }),
    ).toEqual({
      text: 'searchQueryhello',
    });
    expect(searchSource.messageSearchFilterBuilder.context.getLatestValue()).toEqual({
      b: 'messageSearchFilterBuilder',
    });

    expect(
      searchSource.messageSearchChannelFilterBuilder.filterConfig.getLatestValue(),
    ).toEqual({
      custom: { enabled: true, generate: expect.any(Function) },
    });
    expect(
      searchSource.messageSearchChannelFilterBuilder.filterConfig
        .getLatestValue()
        .custom.generate({ searchQuery: 'sq', a: 'hi' }),
    ).toEqual({
      name: { $autocomplete: 'sqhi' },
    });
    expect(
      searchSource.messageSearchChannelFilterBuilder.context.getLatestValue(),
    ).toEqual({
      a: 'messageSearchChannelFilterBuilder',
    });

    expect(searchSource.channelQueryFilterBuilder.filterConfig.getLatestValue()).toEqual({
      cid: { enabled: true, generate: expect.any(Function) },
    });

    expect(
      searchSource.channelQueryFilterBuilder.filterConfig
        .getLatestValue()
        .cid.generate({ cids: ['1', '2'], c: '5' }),
    ).toEqual({
      cid: { $in: ['1', '2', '5'] },
    });

    expect(searchSource.channelQueryFilterBuilder.context.getLatestValue()).toEqual({
      c: 'channelQueryFilterBuilder',
    });

    expect(searchSource.pageSize).toBe(3000);
  });

  it('uses default options and custom filter builder options', () => {
    const searchSource = new MessageSearchSource<{
      messageSearchChannelContext: { a: string };
      messageSearchContext: { b: string };
      channelQueryContext: { c: string };
    }>(
      client,
      {},
      {
        messageSearchChannel: {
          initialContext: { a: 'messageSearchChannelFilterBuilder' },
        },
        messageSearch: {
          initialContext: { b: 'messageSearchFilterBuilder' },
        },
        channelQuery: {
          initialContext: { c: 'channelQueryFilterBuilder' },
        },
      },
    );
    expect(searchSource.type).toBe('messages');
    expect(searchSource['client']).toBe(client);
    expect(searchSource.pageSize).toBe(10);

    expect(searchSource.messageSearchFilterBuilder.filterConfig.getLatestValue()).toEqual(
      {
        text: { enabled: true, generate: expect.any(Function) },
      },
    );
    expect(
      searchSource.messageSearchFilterBuilder.filterConfig
        .getLatestValue()
        .text.generate({ searchQuery: 'searchQuery', b: 'hello' }),
    ).toEqual({
      text: 'searchQuery',
    });
    expect(searchSource.messageSearchFilterBuilder.context.getLatestValue()).toEqual({
      b: 'messageSearchFilterBuilder',
    });

    expect(
      searchSource.messageSearchChannelFilterBuilder.filterConfig.getLatestValue(),
    ).toEqual({});

    expect(
      searchSource.messageSearchChannelFilterBuilder.context.getLatestValue(),
    ).toEqual({
      a: 'messageSearchChannelFilterBuilder',
    });

    expect(searchSource.channelQueryFilterBuilder.filterConfig.getLatestValue()).toEqual({
      cid: { enabled: true, generate: expect.any(Function) },
    });

    expect(
      searchSource.channelQueryFilterBuilder.filterConfig
        .getLatestValue()
        .cid.generate({ cids: ['1', '2'], c: '5' }),
    ).toEqual({
      cid: { $in: ['1', '2'] },
    });

    expect(searchSource.channelQueryFilterBuilder.context.getLatestValue()).toEqual({
      c: 'channelQueryFilterBuilder',
    });
  });

  it('returns empty items when client.userId is missing', async () => {
    searchSource['client'].user = undefined;
    // @ts-expect-error protected access
    const result = await searchSource.query('test');
    expect(result).toEqual({ items: [] });
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('returns empty items when next is null', async () => {
    searchSource.state.partialNext({ next: null });

    // @ts-expect-error protected access
    const result = await searchSource.query('test');

    expect(result).toEqual({ items: [] });
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('executes search with empty search query', async () => {
    // @ts-expect-error protected access
    const result = await searchSource.query('');

    expect(searchMock).toHaveBeenCalledWith(
      {
        payload: expect.objectContaining({
          filter_conditions: {
            members: { $in: [user.id] },
          },
          message_filter_conditions: { type: 'regular' },
          limit: searchSource.pageSize,
          next: undefined,
          sort: [{ field: 'created_at', direction: -1 }],
        }),
      },
      withoutSignal,
    );
    expect(result.items).toEqual(messages);
    expect(result.next).toBe('next-token');
  });

  it('builds filters and calls client.search with correct args', async () => {
    searchSource.messageSearchFilters = { 'mentioned_users.id': { $contains: 'abc' } };
    searchSource.messageSearchChannelFilters = { type: 'messaging' };
    searchSource.channelQueryFilters = { type: 'abc' };
    searchSource.messageSearchSort = [{ field: 'created_at', direction: 1 }];
    searchSource.state.partialNext({ next: 'next-token-old' });

    // @ts-expect-error protected access
    await searchSource.query('hello');

    expect(searchMock).toHaveBeenCalledWith(
      {
        payload: expect.objectContaining({
          filter_conditions: {
            members: { $in: [user.id] },
            type: 'messaging',
          },
          message_filter_conditions: {
            'mentioned_users.id': { $contains: 'abc' },
            type: 'regular',
            text: 'hello',
          },
          limit: searchSource.pageSize,
          next: 'next-token-old',
          sort: [
            { field: 'created_at', direction: -1 },
            { field: 'created_at', direction: 1 },
          ],
        }),
      },
      withoutSignal,
    );
  });

  it('overrides the static filters with dynamic ones', async () => {
    searchSource.messageSearchFilters = { 'mentioned_users.id': { $contains: 'abc' } };
    searchSource.messageSearchFilterBuilder.updateFilterConfig({
      'mentioned_users.id': {
        enabled: true,
        generate: ({ searchQuery }) =>
          searchQuery
            ? {
                'mentioned_users.id': { $contains: searchQuery },
              }
            : null,
      },
    });
    searchSource.messageSearchChannelFilters = { type: 'messaging' };
    searchSource.messageSearchChannelFilterBuilder.updateFilterConfig({
      type: {
        enabled: true,
        generate: ({ searchQuery }) =>
          searchQuery ? { type: { $in: [searchQuery] } } : null,
      },
    });
    searchSource.messageSearchSort = [{ field: 'created_at', direction: 1 }];
    searchSource.state.partialNext({ next: 'next-token-old' });

    const searchQuery = 'hello';
    // @ts-expect-error protected access
    await searchSource.query(searchQuery);

    expect(searchMock).toHaveBeenCalledWith(
      {
        payload: expect.objectContaining({
          filter_conditions: {
            members: { $in: [user.id] },
            type: { $in: [searchQuery] },
          },
          message_filter_conditions: {
            'mentioned_users.id': { $contains: searchQuery },
            type: 'regular',
            text: searchQuery,
          },
          limit: searchSource.pageSize,
          next: 'next-token-old',
          sort: [
            { field: 'created_at', direction: -1 },
            { field: 'created_at', direction: 1 },
          ],
        }),
      },
      withoutSignal,
    );
  });

  it('overrides the message type', async () => {
    searchSource.messageSearchFilters = { type: 'deleted' };
    searchSource.state.partialNext({ next: 'next-token-old' });

    // @ts-expect-error protected access
    await searchSource.query('hello');

    expect(searchMock).toHaveBeenCalledWith(
      {
        payload: expect.objectContaining({
          filter_conditions: {
            members: { $in: [user.id] },
          },
          message_filter_conditions: {
            type: 'deleted',
            text: 'hello',
          },
          limit: searchSource.pageSize,
          next: 'next-token-old',
          sort: [{ field: 'created_at', direction: -1 }],
        }),
      },
      withoutSignal,
    );
  });

  it('calls queryChannels when some cids are missing locally', async () => {
    const m1 = generateMsg({ cid: 'cid1' });
    const m2 = generateMsg({ cid: 'cid2' });
    searchSource.channelQueryFilters = { type: 'abc' };
    client.channelManager.getOrCreateChannel('cid1', () => ({}) as any);
    searchMock.mockResolvedValueOnce({
      results: [{ message: m1 }, { message: m2 }],
      next: undefined,
    } as any);

    // @ts-expect-error protected access
    await searchSource.query('query');

    expect(queryChannelsMock).toHaveBeenCalledWith(
      {
        filter_conditions: { cid: { $in: ['cid2'] }, type: 'abc' },
        sort: [{ direction: -1, field: 'last_message_at' }],
        watch: false,
      },
      {},
      withoutSignal,
    );
  });

  it('watches the channels it queries when channelQueryOptions ask for it', async () => {
    searchSource.channelQueryOptions = { watch: true };
    searchMock.mockResolvedValueOnce({
      results: [{ message: generateMsg({ cid: 'cid2' }) }],
      next: undefined,
    } as any);

    // @ts-expect-error protected access
    await searchSource.query('query');

    expect(queryChannelsMock).toHaveBeenCalledWith(
      expect.objectContaining({ watch: true }),
      {},
      withoutSignal,
    );
  });

  it("stores a result's channel the follow-up query didn't return, from the result's channel data", async () => {
    const hidden = generateMsg({ cid: 'messaging:hidden' }) as ReturnType<
      typeof generateMsg
    >;
    searchMock.mockResolvedValueOnce({
      results: [
        {
          message: {
            ...hidden,
            channel: {
              cid: 'messaging:hidden',
              id: 'hidden',
              name: 'Hidden',
              type: 'messaging',
            },
          },
        },
      ],
      next: undefined,
    } as any);

    // @ts-expect-error protected access
    await searchSource.query('query');

    const channel = client.channelManager.get('messaging:hidden');
    expect(channel).toBeDefined();
    expect(channel?.data?.name).toBe('Hidden');
    expect(channel?.watchStatus).not.toBe('watching');
  });

  it('keeps a stored result channel as it is', async () => {
    const stored = client.channelManager.ensure({ id: 'kept', type: 'messaging' });
    searchMock.mockResolvedValueOnce({
      results: [
        {
          message: {
            ...generateMsg({ cid: 'messaging:kept' }),
            channel: {
              cid: 'messaging:kept',
              id: 'kept',
              name: 'From search',
              type: 'messaging',
            },
          },
        },
      ],
      next: undefined,
    } as any);

    // @ts-expect-error protected access
    await searchSource.query('query');

    expect(client.channelManager.get('messaging:kept')).toBe(stored);
    expect(stored.data?.name).not.toBe('From search');
  });

  it('does not call queryChannels if all channels are loaded locally', async () => {
    const m1 = generateMsg({ cid: 'cid1' });
    client.channelManager.getOrCreateChannel('cid1', () => ({}) as any);
    searchMock.mockResolvedValueOnce({
      results: [{ message: m1 }],
      next: undefined,
    } as any);

    // @ts-expect-error protected access
    await searchSource.query('query');

    expect(queryChannelsMock).not.toHaveBeenCalled();
  });

  it('overrides static channel query filters with dynamic ones', async () => {
    searchSource.channelQueryFilters = { type: 'abc' };
    searchSource.channelQueryFilterBuilder.updateFilterConfig({
      type: {
        enabled: true,
        generate: () => ({ type: 'efg' }),
      },
    });
    const m1 = generateMsg({ cid: 'cid1' });
    const m2 = generateMsg({ cid: 'cid2' });
    client.channelManager.getOrCreateChannel('cid1', () => ({}) as any);
    searchMock.mockResolvedValueOnce({
      results: [{ message: m1 }, { message: m2 }],
      next: undefined,
    } as any);

    // @ts-expect-error protected access
    await searchSource.query('query');

    expect(queryChannelsMock).toHaveBeenCalledWith(
      {
        filter_conditions: { cid: { $in: ['cid2'] }, type: 'efg' },
        sort: [{ direction: -1, field: 'last_message_at' }],
        watch: false,
      },
      {},
      withoutSignal,
    );
  });

  it('returns items and next from search', async () => {
    // @ts-expect-error protected access
    const result = await searchSource.query('anything');
    expect(result.items).toEqual(messages);
    expect(result.next).toBe('next-token');
  });

  it('filterQueryResults returns items unmodified', () => {
    // @ts-expect-error protected access
    const result = searchSource.filterQueryResults(messages);
    expect(result).toBe(messages);
  });

  describe('keeping the channels of its results', () => {
    const storeResultChannels = () => {
      messages[0].cid = 'messaging:first';
      messages[1].cid = 'messaging:second';
      return [
        client.channelManager.ensure({ type: 'messaging', id: 'first' }),
        client.channelManager.ensure({ type: 'messaging', id: 'second' }),
      ];
    };

    it('keeps them in the channel store while it is active', async () => {
      const channels = storeResultChannels();
      searchSource.activate();
      await searchSource.executeQuery('any');

      client.channelManager.releaseUnusedChannels();
      expect(client.channelManager.values()).toEqual(channels);

      searchSource.deactivate();
      client.channelManager.releaseUnusedChannels();
      expect(client.channelManager.values()).toEqual([]);
    });

    it('stops keeping them once disposed, and keeps them again when registered', async () => {
      const channels = storeResultChannels();
      searchSource.activate();
      await searchSource.executeQuery('any');

      // checked through the usage, not a release, which would disconnect the channels for good
      const keptBySearch = () =>
        client.channelManager
          .getChannelUsage()
          .filter(({ keptBy }) => keptBy.includes('message-search'))
          .map(({ channel }) => channel);
      expect(keptBySearch()).toEqual(channels);

      searchSource.dispose();
      expect(keptBySearch()).toEqual([]);

      searchSource.registerSubscriptions();
      expect(keptBySearch()).toEqual(channels);
    });

    it('is disposed and registered again through its search controller', async () => {
      const channels = storeResultChannels();
      const controller = new SearchController({ client, sources: [searchSource] });
      searchSource.activate();
      await searchSource.executeQuery('any');

      // the cleanup and second mount a UI's StrictMode runs on the same instance
      controller.dispose();
      controller.registerSubscriptions();
      client.channelManager.releaseUnusedChannels();

      expect(client.channelManager.values()).toEqual(channels);
    });
  });
});
