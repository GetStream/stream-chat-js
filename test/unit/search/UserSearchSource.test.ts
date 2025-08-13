import { describe, it, expect, vi, beforeEach, afterEach, MockInstance } from 'vitest';
import { UserSearchSource } from '../../../src/search/UserSearchSource';
import type { StreamChat } from '../../../src/client';
import type {
  UserFilters,
  UserSort,
  UserResponse,
  UsersAPIResponse,
} from '../../../src/types';
import { getClientWithUser } from '../test-utils/getClient';

describe('UserSearchSource', () => {
  const user = { id: 'user-123', name: 'Test User' } as UserResponse;
  let client: StreamChat;
  let searchSource: UserSearchSource;
  let queryUsersMock: MockInstance<StreamChat['queryUsers']>;
  let users: UserResponse[];
  const mockUsers: UserResponse[] = [
    user,
    { id: 'user-456', name: 'Another User' } as UserResponse,
  ];

  beforeEach(() => {
    client = getClientWithUser(user);
    users = [...mockUsers];
    queryUsersMock = vi
      .spyOn(client, 'queryUsers')
      .mockResolvedValue({ users } as UsersAPIResponse);
    searchSource = new UserSearchSource(client as StreamChat);
  });

  afterEach(vi.clearAllMocks);

  it('initializes correctly', () => {
    expect(searchSource.type).toBe('users');
    expect(searchSource.client).toBe(client);
    expect(searchSource.filterBuilder).toBeDefined();
    expect(searchSource.filterBuilder.filterConfig.getLatestValue()).toEqual({
      $or: {
        enabled: true,
        generate: expect.any(Function),
      },
    });
    expect(
      searchSource.filterBuilder.filterConfig
        .getLatestValue()
        .$or.generate({ searchQuery: 'hi' }),
    ).toEqual({
      $or: [{ id: { $autocomplete: 'hi' } }, { name: { $autocomplete: 'hi' } }],
    });
    expect(searchSource.pageSize).toBe(10);
    expect(searchSource.offset).toBe(0);
  });

  it('initializes with custom options', () => {
    const searchSource = new UserSearchSource(
      client,
      { pageSize: 101 },
      {
        initialContext: { banned: true },
        initialFilterConfig: {
          role: {
            enabled: true,
            generate: () => ({ role: { $in: ['abc', 'efg'] } }),
          },
          $or: {
            enabled: true,
            generate: ({ banned, searchQuery }) =>
              searchQuery
                ? {
                    $or: [
                      { id: { $autocomplete: searchQuery } },
                      { name: { $autocomplete: searchQuery } },
                      { banned: banned as boolean },
                    ],
                  }
                : null,
          },
        },
      },
    );
    expect(searchSource.type).toBe('users');
    expect(searchSource.client).toBe(client);
    expect(searchSource.pageSize).toBe(101);
    expect(searchSource.offset).toBe(0);

    expect(searchSource.filterBuilder.context.getLatestValue()).toEqual({ banned: true });

    expect(searchSource.filterBuilder.filterConfig.getLatestValue()).toEqual({
      role: { enabled: true, generate: expect.any(Function) },
      $or: { enabled: true, generate: expect.any(Function) },
    });
    expect(
      searchSource.filterBuilder.filterConfig.getLatestValue().role.generate({}),
    ).toEqual({
      role: { $in: ['abc', 'efg'] },
    });
    expect(
      searchSource.filterBuilder.filterConfig
        .getLatestValue()
        .$or.generate({ searchQuery: 'x', banned: false }),
    ).toEqual({
      $or: [
        { id: { $autocomplete: 'x' } },
        { name: { $autocomplete: 'x' } },
        { banned: false },
      ],
    });
  });

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

  it('passes filters, sort, and options to client.queryUsers', async () => {
    searchSource.filters = { role: { $eq: 'admin' } } as UserFilters;
    searchSource.filterBuilder.updateFilterConfig({
      name: {
        enabled: true,
        generate: ({ searchQuery }) =>
          searchQuery ? { name: { $autocomplete: searchQuery } } : null,
      },
    });
    searchSource.sort = { created_at: -1 } as UserSort;
    searchSource.searchOptions = { presence: true };

    // @ts-expect-error accessing protected method
    await searchSource.query('John');

    expect(queryUsersMock).toHaveBeenCalledWith(
      {
        $or: [{ id: { $autocomplete: 'John' } }, { name: { $autocomplete: 'John' } }],
        name: { $autocomplete: 'John' },
        role: { $eq: 'admin' },
      },
      { id: 1, created_at: -1 },
      { presence: true, limit: searchSource.pageSize, offset: searchSource.offset },
    );
  });

  it('returns items from query', async () => {
    // @ts-expect-error accessing protected method
    const result = await searchSource.query('any');
    expect(result.items).toEqual(users);
  });

  it('filterQueryResults removes current user', () => {
    // @ts-expect-error accessing protected method
    const result = searchSource.filterQueryResults(users);
    expect(result).toEqual([{ id: 'user-456', name: 'Another User' }]);
  });

  it('works without client.user', async () => {
    searchSource.client.user = undefined;
    const spyBuildFilters = vi
      .spyOn(searchSource.filterBuilder, 'buildFilters')
      .mockReturnValue({});

    // @ts-expect-error accessing protected method
    await searchSource.query('no-user');

    expect(spyBuildFilters).toHaveBeenCalledWith({
      baseFilters: undefined,
      context: { searchQuery: 'no-user' },
    });
  });
});
