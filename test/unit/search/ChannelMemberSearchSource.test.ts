import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Channel } from '../../../src/channel';
import { ChannelMemberSearchSource } from '../../../src/search/ChannelMemberSearchSource';
import type {
  ChannelMemberResponse,
  MemberFilters,
  MemberSort,
} from '../../../src/types';

const createChannelMember = (
  overrides: Partial<ChannelMemberResponse> = {},
): ChannelMemberResponse => ({
  created_at: '2026-01-01T00:00:00.000000000Z',
  updated_at: '2026-01-01T00:00:00.000000000Z',
  user_id: 'user-1',
  ...overrides,
});

const createChannel = () =>
  ({
    queryMembers: vi.fn(),
  }) as unknown as Channel;

const getAutocompleteFilters = (searchQuery: string): Partial<MemberFilters> => ({
  $or: [{ id: { $eq: searchQuery } }, { name: { $autocomplete: searchQuery } }],
});

describe('ChannelMemberSearchSource', () => {
  const mockMembers: ChannelMemberResponse[] = [
    createChannelMember({ user_id: 'user-1', user: { id: 'user-1', name: 'Alice' } }),
    createChannelMember({ user_id: 'user-2', user: { id: 'user-2', name: 'Bob' } }),
  ];
  let channel: Channel;
  let searchSource: ChannelMemberSearchSource;

  beforeEach(() => {
    vi.useFakeTimers();
    channel = createChannel();
    vi.spyOn(channel, 'queryMembers').mockResolvedValue({
      duration: '0.01s',
      members: mockMembers,
    });
    searchSource = new ChannelMemberSearchSource(channel);
    searchSource.activate();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('initializes with member search source defaults', () => {
    expect(searchSource.type).toBe('members');
    expect(searchSource.channel).toBe(channel);
    expect(searchSource.pageSize).toBe(10);
    expect(searchSource.offset).toBe(0);
    expect(searchSource.filterBuilder.filterConfig.getLatestValue()).toEqual({
      default: {
        enabled: true,
        generate: expect.any(Function),
      },
    });
    expect(
      searchSource.filterBuilder.filterConfig.getLatestValue().default.generate({
        searchQuery: 'jo',
      }),
    ).toEqual(getAutocompleteFilters('jo'));
    expect(
      searchSource.filterBuilder.filterConfig.getLatestValue().default.generate({
        searchQuery: undefined,
      }),
    ).toBeNull();
  });

  it('initializes with custom options', () => {
    const customSource = new ChannelMemberSearchSource(channel, { pageSize: 30 });

    expect(customSource.pageSize).toBe(30);
  });

  it('initializes with custom filter builder options', () => {
    const customSource = new ChannelMemberSearchSource<{ joined: boolean }>(
      channel,
      { pageSize: 25 },
      {
        initialContext: { joined: true },
        initialFilterConfig: {
          joined: {
            enabled: true,
            generate: ({ joined }) => ({ joined: joined as boolean }),
          },
          default: {
            enabled: true,
            generate: ({ searchQuery }) =>
              searchQuery ? getAutocompleteFilters(searchQuery) : null,
          },
        },
      },
    );

    expect(customSource.pageSize).toBe(25);
    expect(customSource.filterBuilder.context.getLatestValue()).toEqual({ joined: true });
    expect(
      customSource.filterBuilder.filterConfig.getLatestValue().joined.generate({
        joined: false,
      }),
    ).toEqual({ joined: false });
    expect(
      customSource.filterBuilder.filterConfig.getLatestValue().default.generate({
        searchQuery: 'x',
        joined: false,
      }),
    ).toEqual(getAutocompleteFilters('x'));
  });

  describe('canExecuteQuery', () => {
    it('allows empty search queries for initial load', () => {
      expect(searchSource.canExecuteQuery('')).toBe(true);
    });

    it('allows pagination when there is another page', () => {
      expect(searchSource.canExecuteQuery()).toBe(true);
    });

    it('returns false when inactive', () => {
      searchSource.deactivate();

      expect(searchSource.canExecuteQuery('')).toBe(false);
      expect(searchSource.canExecuteQuery()).toBe(false);
    });

    it('returns false while loading', () => {
      searchSource.state.partialNext({ isLoading: true });

      expect(searchSource.canExecuteQuery('')).toBe(false);
      expect(searchSource.canExecuteQuery()).toBe(false);
    });

    it('returns false when there is no next page and no new search query', () => {
      searchSource.state.partialNext({ hasNext: false });

      expect(searchSource.canExecuteQuery()).toBe(false);
    });
  });

  describe('query', () => {
    it('calls buildFilters internally', async () => {
      const spyBuildFilters = vi
        .spyOn(searchSource.filterBuilder, 'buildFilters')
        .mockReturnValue({});

      // @ts-expect-error accessing protected method
      await searchSource.query('test-search');

      expect(spyBuildFilters).toHaveBeenCalledWith({
        baseFilters: undefined,
        context: { searchQuery: 'test-search' },
      });
    });

    it('passes filters, sort, and options to channel.queryMembers', async () => {
      const filters: MemberFilters = { user_id: 'user-2' };
      const sort: MemberSort = [{ name: 1 }];
      searchSource.filters = filters;
      searchSource.sort = sort;
      searchSource.searchOptions = { user_id_gt: 'user-0' };

      // @ts-expect-error accessing protected method
      await searchSource.query('John');

      expect(channel.queryMembers).toHaveBeenCalledWith(
        {
          ...getAutocompleteFilters('John'),
          user_id: 'user-2',
        },
        sort,
        {
          user_id_gt: 'user-0',
          limit: searchSource.pageSize,
          offset: searchSource.offset,
        },
      );
    });

    it('returns items from query', async () => {
      // @ts-expect-error accessing protected method
      const result = await searchSource.query('any');

      expect(result.items).toEqual(mockMembers);
    });
  });

  describe('search', () => {
    it('executes empty search queries after debounce', async () => {
      searchSource.search('');
      await vi.advanceTimersByTimeAsync(300);

      expect(searchSource.items).toEqual(mockMembers);
      expect(searchSource.searchQuery).toBe('');
      expect(channel.queryMembers).toHaveBeenCalledWith({}, [], {
        limit: 10,
        offset: 0,
      });
    });

    it('executes typed search queries with autocomplete filters', async () => {
      searchSource.search('john');
      await vi.advanceTimersByTimeAsync(300);

      expect(searchSource.searchQuery).toBe('john');
      expect(channel.queryMembers).toHaveBeenCalledWith(
        getAutocompleteFilters('john'),
        [],
        { limit: 10, offset: 0 },
      );
    });

    it('debounces rapid search calls and only executes the last query', async () => {
      searchSource.search('j');
      searchSource.search('jo');
      searchSource.search('john');

      await vi.advanceTimersByTimeAsync(300);

      expect(channel.queryMembers).toHaveBeenCalledTimes(1);
      expect(channel.queryMembers).toHaveBeenCalledWith(
        getAutocompleteFilters('john'),
        [],
        { limit: 10, offset: 0 },
      );
    });

    it('resets state for a new search query', async () => {
      searchSource.search('first');
      await vi.advanceTimersByTimeAsync(300);

      searchSource.search('second');
      await vi.advanceTimersByTimeAsync(300);

      expect(searchSource.searchQuery).toBe('second');
      expect(channel.queryMembers).toHaveBeenLastCalledWith(
        getAutocompleteFilters('second'),
        [],
        { limit: 10, offset: 0 },
      );
    });

    it('paginates without starting a new search query', async () => {
      const queryMembersMock = vi.spyOn(channel, 'queryMembers');
      const firstPage = [
        createChannelMember({ user_id: 'user-3' }),
        createChannelMember({ user_id: 'user-4' }),
      ];
      const secondPage = [createChannelMember({ user_id: 'user-5' })];

      queryMembersMock
        .mockResolvedValueOnce({ duration: '0.01s', members: firstPage })
        .mockResolvedValueOnce({ duration: '0.01s', members: secondPage });

      const paginatedSource = new ChannelMemberSearchSource(channel, { pageSize: 2 });
      paginatedSource.activate();

      paginatedSource.search('');
      await vi.advanceTimersByTimeAsync(300);

      expect(paginatedSource.items).toEqual(firstPage);
      expect(paginatedSource.hasNext).toBe(true);

      paginatedSource.search();
      await vi.advanceTimersByTimeAsync(300);

      expect(queryMembersMock).toHaveBeenNthCalledWith(2, {}, [], {
        limit: 2,
        offset: 2,
      });
      expect(paginatedSource.items).toEqual([...firstPage, ...secondPage]);
      expect(paginatedSource.hasNext).toBe(false);
    });

    it('cancels scheduled search queries', async () => {
      searchSource.search('john');
      searchSource.cancelScheduledQuery();

      await vi.advanceTimersByTimeAsync(300);

      expect(channel.queryMembers).not.toHaveBeenCalled();
    });
  });

  it('returns items unchanged from filterQueryResults', () => {
    // @ts-expect-error accessing protected method
    const result = searchSource.filterQueryResults(mockMembers);

    expect(result).toEqual(mockMembers);
  });
});
