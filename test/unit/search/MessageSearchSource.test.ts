import { describe, it, expect, vi, beforeEach, afterEach, MockInstance } from 'vitest';
import { MessageSearchSource } from '../../../src/search/MessageSearchSource';
import type { StreamChat } from '../../../src/client';
import type { MessageResponse, SearchAPIResponse } from '../../../src/types';
import { getClientWithUser } from '../test-utils/getClient';
import { generateMsg } from '../test-utils/generateMessage';

describe('MessageSearchSource', () => {
  const user = { id: 'user-123' };
  let client: StreamChat;
  let searchSource: MessageSearchSource;
  let searchMock: MockInstance<StreamChat['search']>;
  let queryChannelsMock: MockInstance<StreamChat['queryChannels']>;
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
    queryChannelsMock = vi.spyOn(client, 'queryChannels').mockResolvedValue([]);
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
    const searchSource = new MessageSearchSource(
      client,
      { pageSize: 3000 },
      {
        messageSearchChannelFilterBuilder: {
          initialContext: { a: 'messageSearchChannelFilterBuilder' },
          initialFilterConfig: {
            custom: {
              enabled: true,
              generate: ({ searchQuery, a }) =>
                searchQuery ? { name: { $autocomplete: searchQuery + a } } : null,
            },
          },
        },
        messageSearchFilterBuilder: {
          initialContext: { b: 'messageSearchFilterBuilder' },
          initialFilterConfig: {
            text: {
              enabled: true,
              generate: ({ searchQuery, b }) =>
                searchQuery ? { text: searchQuery + b } : null,
            },
          },
        },
        channelQueryFilterBuilder: {
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

  it('returns empty items when client.userID is missing', async () => {
    searchSource['client'].userID = undefined;
    // @ts-expect-error protected access
    const result = await searchSource.query('test');
    expect(result).toEqual({ items: [] });
    expect(searchMock).not.toHaveBeenCalled();
  });

  it('builds filters and calls client.search with correct args', async () => {
    searchSource.messageSearchFilters = { 'mentioned_users.id': { $contains: 'abc' } };
    searchSource.messageSearchChannelFilters = { type: 'messaging' };
    searchSource.channelQueryFilters = { type: 'abc' };
    searchSource.messageSearchSort = { created_at: 1 };
    searchSource.state.partialNext({ next: 'next-token-old' });

    // @ts-expect-error protected access
    await searchSource.query('hello');

    expect(searchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        members: { $in: [user.id] },
        type: 'messaging',
      }),
      expect.objectContaining({
        'mentioned_users.id': { $contains: 'abc' },
        type: 'regular',
        text: 'hello',
      }),
      expect.objectContaining({
        limit: searchSource.pageSize,
        next: 'next-token-old',
        sort: { created_at: 1 }, // note: merges created_at with default -1, order may vary
      }),
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
    searchSource.messageSearchSort = { created_at: 1 };
    searchSource.state.partialNext({ next: 'next-token-old' });

    const searchQuery = 'hello';
    // @ts-expect-error protected access
    await searchSource.query(searchQuery);

    expect(searchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        members: { $in: [user.id] },
        type: { $in: [searchQuery] },
      }),
      expect.objectContaining({
        'mentioned_users.id': { $contains: searchQuery },
        type: 'regular',
        text: searchQuery,
      }),
      expect.objectContaining({
        limit: searchSource.pageSize,
        next: 'next-token-old',
        sort: { created_at: 1 }, // note: merges created_at with default -1, order may vary
      }),
    );
  });

  it('overrides the message type', async () => {
    searchSource.messageSearchFilters = { type: 'deleted' };
    searchSource.state.partialNext({ next: 'next-token-old' });

    // @ts-expect-error protected access
    await searchSource.query('hello');

    expect(searchMock).toHaveBeenCalledWith(
      expect.objectContaining({
        members: { $in: [user.id] },
      }),
      expect.objectContaining({
        type: 'deleted',
        text: 'hello',
      }),
      expect.objectContaining({
        limit: searchSource.pageSize,
        next: 'next-token-old',
        sort: { created_at: -1 }, // note: merges created_at with default -1, order may vary
      }),
    );
  });

  it('calls queryChannels when some cids are missing locally', async () => {
    const m1 = generateMsg({ cid: 'cid1' });
    const m2 = generateMsg({ cid: 'cid2' });
    searchSource.channelQueryFilters = { type: 'abc' };
    client.activeChannels = { cid1: {} as any };
    searchMock.mockResolvedValueOnce({
      results: [{ message: m1 }, { message: m2 }],
      next: undefined,
    } as any);

    // @ts-expect-error protected access
    await searchSource.query('query');

    expect(queryChannelsMock).toHaveBeenCalledWith(
      { cid: { $in: ['cid2'] }, type: 'abc' },
      { last_message_at: -1 },
      undefined,
    );
  });

  it('does not call queryChannels if all channels are loaded locally', async () => {
    const m1 = generateMsg({ cid: 'cid1' });
    client.activeChannels = { cid1: {} as any };
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
    client.activeChannels = { cid1: {} as any };
    searchMock.mockResolvedValueOnce({
      results: [{ message: m1 }, { message: m2 }],
      next: undefined,
    } as any);

    // @ts-expect-error protected access
    await searchSource.query('query');

    expect(queryChannelsMock).toHaveBeenCalledWith(
      { cid: { $in: ['cid2'] }, type: 'efg' },
      { last_message_at: -1 },
      undefined,
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
});
