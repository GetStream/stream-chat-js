import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MentionsSearchSource,
  calculateLevenshtein,
} from '../../../../../src/messageComposer/middleware/textComposer/mentions';
import { Channel } from '../../../../../src/channel';
import { StreamChat } from '../../../../../src/client';
import { MAX_CHANNEL_MEMBER_COUNT_IN_CHANNEL_QUERY } from '../../../../../src/constants';
import type {
  ChannelMemberResponse,
  SearchUserGroupsOptions,
  SearchUserGroupsResponse,
  Mute,
  UserGroupResponse,
  UserResponse,
  UserFilters,
  MemberFilters,
} from '../../../../../src/types';
import type { MentionSuggestion } from '../../../../../src/messageComposer/middleware/textComposer/types';

describe('calculateLevenshtein', () => {
  it('should return length of first string if second is empty', () => {
    expect(calculateLevenshtein('test', '')).toBe(4);
  });

  it('should return length of second string if first is empty', () => {
    expect(calculateLevenshtein('', 'test')).toBe(4);
  });

  it('should return 0 for identical strings', () => {
    expect(calculateLevenshtein('test', 'test')).toBe(0);
  });

  it('should calculate correct distance for single character difference', () => {
    expect(calculateLevenshtein('test', 'tost')).toBe(1);
  });

  it('should calculate correct distance for insertion', () => {
    expect(calculateLevenshtein('test', 'tests')).toBe(1);
  });

  it('should calculate correct distance for deletion', () => {
    expect(calculateLevenshtein('tests', 'test')).toBe(1);
  });

  it('should calculate correct distance for substitution', () => {
    expect(calculateLevenshtein('test', 'tost')).toBe(1);
  });

  it('should calculate correct distance for multiple operations', () => {
    expect(calculateLevenshtein('kitten', 'sitting')).toBe(3);
  });

  it('should handle case sensitivity', () => {
    expect(calculateLevenshtein('Test', 'test')).toBe(1);
  });

  it('should handle special characters', () => {
    expect(calculateLevenshtein('test!', 'test?')).toBe(1);
  });
});

describe('MentionsSearchSource', () => {
  let channel: Channel;
  let client: StreamChat;
  let mockUsers: UserResponse[];
  let mockMembers: Record<string, ChannelMemberResponse>;
  let mockUserGroups: UserGroupResponse[];

  beforeEach(() => {
    mockUsers = [
      {
        id: 'user1',
        name: 'John Doe',
        role: 'user',
        teams_role: { engineering: 'admin' },
      },
      { id: 'user2', name: 'Jane Smith', role: 'moderator' },
      { id: 'user3', name: 'Bob Wilson', role: 'user' },
      { id: 'currentUser', name: 'Alice Johnson', role: 'user' },
    ];

    mockMembers = {
      user1: { user: mockUsers[0] },
      user2: { channel_role: 'channel_moderator', user: mockUsers[1] },
      currentUser: { user: mockUsers[3] },
    };

    mockUserGroups = [
      {
        created_at: '2026-05-08T12:00:00.000Z',
        id: 'backend-team',
        members: [
          { created_at: '2026-05-08T12:00:00.000Z', id: 'member-1', is_admin: false },
        ],
        name: 'Backend Team',
      },
      {
        created_at: '2026-05-08T12:01:00.000Z',
        id: 'admins-group',
        members: [
          { created_at: '2026-05-08T12:00:00.000Z', id: 'member-1', is_admin: false },
          { created_at: '2026-05-08T12:01:00.000Z', id: 'member-2', is_admin: false },
        ],
        name: 'Admins',
      },
    ];

    client = {
      userID: 'currentUser',
      userId: 'currentUser',
      searchRoles: vi.fn().mockImplementation(async ({ query }: { query: string }) => ({
        roles: [
          { name: 'admin' },
          { name: 'channel_moderator' },
          { name: 'moderator' },
        ].filter((role) => role.name.includes(query)),
      })),
      queryUsers: vi.fn().mockResolvedValue({ users: mockUsers }),
      searchUserGroups: vi.fn().mockImplementation(
        async (options: SearchUserGroupsOptions): Promise<SearchUserGroupsResponse> => ({
          user_groups: mockUserGroups.filter((group) =>
            group.name.toLowerCase().includes(options.query.toLowerCase()),
          ),
        }),
      ),
      mutedUsers: [],
    } as unknown as StreamChat;

    channel = {
      data: { team: 'engineering' },
      getClient: vi.fn().mockReturnValue(client),
      state: {
        members: mockMembers,
        watchers: {},
      },
      queryMembers: vi.fn().mockResolvedValue({ members: Object.values(mockMembers) }),
    } as unknown as Channel;
  });

  const getSuggestion = (
    suggestions: MentionSuggestion[],
    mentionType: MentionSuggestion['mentionType'],
    id: string,
  ) => suggestions.find((item) => item.mentionType === mentionType && item.id === id);

  it('should initialize with correct type', () => {
    const source = new MentionsSearchSource(channel);
    expect(source.type).toBe('mentions');
    expect(source.config.allowedMentionTypes).toEqual({
      channel: true,
      here: true,
      role: true,
      user: true,
      user_group: true,
    });
    expect(source.config.mentionAllAppUsers).toBeUndefined;
    expect(source.config.textComposerText).toBeUndefined;
    expect(source.config.transliterate).toBeUndefined;

    const customizedSource = new MentionsSearchSource(channel, {
      allowedMentionTypes: { role: false, user_group: false },
      mentionAllAppUsers: true,
      suggestionFactoryMappers: {
        role: (value, { searchToken }) => ({
          id: value,
          mentionType: 'role',
          name: `custom-${value}`,
          tokenizedDisplayName: {
            parts: [`custom-${value}`],
            token: searchToken,
          },
        }),
      },
      textComposerText: '@',
      transliterate: (text: string) => text.toLowerCase(),
    });
    expect(customizedSource.config.allowedMentionTypes).toEqual({
      channel: true,
      here: true,
      role: false,
      user: true,
      user_group: false,
    });
    expect(customizedSource.config.mentionAllAppUsers).toBe(true);
    expect(customizedSource.config.suggestionFactoryMappers?.role).toBeInstanceOf(
      Function,
    );
    expect(customizedSource.config.textComposerText).toBe('@');
    expect(customizedSource.transliterate).toBeInstanceOf(Function);
  });

  it('should return built-ins and users on empty query without role or user group search', async () => {
    const source = new MentionsSearchSource(channel);
    source.activate();
    source.config.textComposerText = '@';

    const result = await source.query('');

    expect(client.searchUserGroups).not.toHaveBeenCalled();
    expect(client.searchRoles).not.toHaveBeenCalled();
    expect(getSuggestion(result.items, 'channel', 'channel')).toBeDefined();
    expect(getSuggestion(result.items, 'here', 'here')).toBeDefined();
    expect(result.items.some((item) => item.mentionType === 'role')).toBe(false);
    expect(getSuggestion(result.items, 'user_group', 'backend-team')).toBeUndefined();
    expect(getSuggestion(result.items, 'user', 'user1')).toBeDefined();
  });

  it('should search members locally when all members are loaded', async () => {
    const source = new MentionsSearchSource(channel);
    source.activate();
    source.config.textComposerText = '@jo';

    const result = await source.query('jo');
    expect(getSuggestion(result.items, 'user', 'user1')?.name).toBe('John Doe');
  });

  it('should match broadcast mentions by prefix only', async () => {
    const source = new MentionsSearchSource(channel);
    source.activate();
    source.config.textComposerText = '@a';

    const noPrefixMatchResult = await source.query('a');

    expect(
      getSuggestion(noPrefixMatchResult.items, 'channel', 'channel'),
    ).toBeUndefined();
    expect(getSuggestion(noPrefixMatchResult.items, 'here', 'here')).toBeUndefined();

    source.config.textComposerText = '@ch';
    const prefixMatchResult = await source.query('ch');

    expect(getSuggestion(prefixMatchResult.items, 'channel', 'channel')).toBeDefined();
  });

  it('should match multi-word user names by exact words plus final-word prefix', async () => {
    const source = new MentionsSearchSource(channel);
    source.activate();
    source.config.textComposerText = '@john do';

    const result = await source.query('john do');

    expect(getSuggestion(result.items, 'user', 'user1')?.name).toBe('John Doe');
  });

  it('should allow repeated non-final query words to match the same name word', async () => {
    const source = new MentionsSearchSource(channel);
    source.activate();
    source.config.textComposerText = '@john john do';

    const result = await source.query('john john do');

    expect(getSuggestion(result.items, 'user', 'user1')?.name).toBe('John Doe');
  });

  it('should allow repeated non-final query words to match the same name word', async () => {
    const source = new MentionsSearchSource(channel);
    source.activate();
    source.config.textComposerText = '@john john do';

    const result = await source.query('john john do');

    expect(getSuggestion(result.items, 'user', 'user1')?.name).toBe('John Doe');
  });

  it('should not prefix-match non-final user-name words during local search', async () => {
    const source = new MentionsSearchSource(channel);
    source.activate();
    source.config.textComposerText = '@jo do';

    const result = await source.query('jo do');

    expect(getSuggestion(result.items, 'user', 'user1')).toBeUndefined();
  });

  it('should match broadcast mentions by prefix only', async () => {
    const source = new MentionsSearchSource(channel);
    source.activate();
    source.config.textComposerText = '@a';

    const noPrefixMatchResult = await source.query('a');

    expect(
      getSuggestion(noPrefixMatchResult.items, 'channel', 'channel'),
    ).toBeUndefined();
    expect(getSuggestion(noPrefixMatchResult.items, 'here', 'here')).toBeUndefined();

    source.config.textComposerText = '@ch';
    const prefixMatchResult = await source.query('ch');

    expect(getSuggestion(prefixMatchResult.items, 'channel', 'channel')).toBeDefined();
  });

  it('should match multi-word user names by exact words plus final-word prefix', async () => {
    const source = new MentionsSearchSource(channel);
    source.activate();
    source.config.textComposerText = '@john do';

    const result = await source.query('john do');

    expect(getSuggestion(result.items, 'user', 'user1')?.name).toBe('John Doe');
  });

  it('should not prefix-match non-final user-name words during local search', async () => {
    const source = new MentionsSearchSource(channel);
    source.activate();
    source.config.textComposerText = '@jo do';

    const result = await source.query('jo do');

    expect(getSuggestion(result.items, 'user', 'user1')).toBeUndefined();
  });

  it('should search user groups by query and keep mixed result shape', async () => {
    const source = new MentionsSearchSource(channel);
    source.activate();
    source.config.textComposerText = '@adm';

    const result = await source.query('adm');

    expect(client.searchUserGroups).toHaveBeenCalledWith({
      limit: 10,
      query: 'adm',
      team_id: 'engineering',
    } satisfies SearchUserGroupsOptions);
    expect(client.searchRoles).toHaveBeenCalledWith({ query: 'adm' });
    expect(getSuggestion(result.items, 'role', 'admin')).toBeDefined();
    expect(getSuggestion(result.items, 'user_group', 'admins-group')).toBeDefined();
    expect(getSuggestion(result.items, 'channel', 'channel')).toBeUndefined();
    expect(getSuggestion(result.items, 'here', 'here')).toBeUndefined();
  });

  it('should source role suggestions from client.searchRoles', async () => {
    const source = new MentionsSearchSource(channel);
    source.activate();
    source.config.textComposerText = '@mod';

    const result = await source.query('mod');

    expect(client.searchRoles).toHaveBeenCalledWith({ query: 'mod' });
    expect(getSuggestion(result.items, 'role', 'moderator')).toBeDefined();
    expect(getSuggestion(result.items, 'role', 'channel_moderator')).toBeDefined();
  });

  it('should not cache role names across different search queries', async () => {
    const source = new MentionsSearchSource(channel);
    source.activate();
    source.config.textComposerText = '@adm';

    const firstResult = await source.query('adm');
    const secondResult = await source.query('mod');

    expect(client.searchRoles).toHaveBeenNthCalledWith(1, { query: 'adm' });
    expect(client.searchRoles).toHaveBeenNthCalledWith(2, { query: 'mod' });
    expect(getSuggestion(firstResult.items, 'role', 'admin')).toBeDefined();
    expect(getSuggestion(firstResult.items, 'role', 'moderator')).toBeUndefined();
    expect(getSuggestion(secondResult.items, 'role', 'moderator')).toBeDefined();
    expect(getSuggestion(secondResult.items, 'role', 'admin')).toBeUndefined();
  });

  it('should allow overriding built-in suggestion mappers from options', async () => {
    const source = new MentionsSearchSource(channel, {
      suggestionFactoryMappers: {
        role: (value, { searchToken }) => ({
          id: value,
          mentionType: 'role',
          name: `role:${value}`,
          tokenizedDisplayName: {
            parts: [`role:${value}`],
            token: searchToken,
          },
        }),
      },
    });
    source.activate();
    source.config.textComposerText = '@mod';

    const result = await source.query('mod');

    expect(getSuggestion(result.items, 'role', 'moderator')?.name).toBe('role:moderator');
    expect(getSuggestion(result.items, 'role', 'channel_moderator')?.name).toBe(
      'role:channel_moderator',
    );
  });

  it('should respect allowedMentionTypes and skip disabled source queries', async () => {
    const source = new MentionsSearchSource(channel, {
      allowedMentionTypes: {
        channel: false,
        here: false,
        role: false,
        user_group: false,
      },
    });
    source.activate();
    source.config.textComposerText = '@adm';

    const result = await source.query('adm');

    expect(client.searchRoles).not.toHaveBeenCalled();
    expect(client.searchUserGroups).not.toHaveBeenCalled();
    expect(getSuggestion(result.items, 'channel', 'channel')).toBeUndefined();
    expect(getSuggestion(result.items, 'here', 'here')).toBeUndefined();
    expect(result.items.every((item) => item.mentionType === 'user')).toBe(true);
  });

  it('should skip user queries when user mentions are disabled', async () => {
    const source = new MentionsSearchSource(channel, {
      allowedMentionTypes: { user: false },
      mentionAllAppUsers: true,
    });
    source.activate();
    source.config.textComposerText = '@john';

    const result = await source.query('john');

    expect(client.queryUsers).not.toHaveBeenCalled();
    expect(result.items.some((item) => item.mentionType === 'user')).toBe(false);
  });

  it('should query members from API when not all members are loaded', async () => {
    const source = new MentionsSearchSource(channel);
    source.activate();
    source.config.textComposerText = '@john';

    const manyMembers: Record<string, ChannelMemberResponse> = {};
    for (let i = 0; i < MAX_CHANNEL_MEMBER_COUNT_IN_CHANNEL_QUERY + 1; i++) {
      manyMembers[`user${i}`] = { user: { id: `user${i}`, name: `User ${i}` } };
    }
    channel.state.members = manyMembers;

    const result = await source.query('john');

    expect(channel.queryMembers).toHaveBeenCalled();
    expect(result.items.some((item) => item.mentionType === 'user')).toBe(true);
  });

  it('should query all app users when mentionAllAppUsers is true', async () => {
    const source = new MentionsSearchSource(channel, { mentionAllAppUsers: true });
    source.activate();
    source.config.textComposerText = '@john';

    const result = await source.query('john');

    expect(client.queryUsers).toHaveBeenCalled();
    expect(getSuggestion(result.items, 'user', 'user1')?.name).toBe('John Doe');
  });

  it('should handle transliteration when provided', async () => {
    const transliterate = (text: string) => text.toLowerCase();
    const source = new MentionsSearchSource(channel, { transliterate });
    source.activate();
    source.config.textComposerText = '@john';

    const result = await source.query('john');
    expect(getSuggestion(result.items, 'user', 'user1')?.name).toBe('John Doe');
  });

  it('should preserve special mentions while filtering muted users', () => {
    const source = new MentionsSearchSource(channel);
    const mute: Mute = {
      target: { id: 'user1' },
      user: { id: 'currentUser' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    client.mutedUsers = [mute];

    source.config.textComposerText = '@john';
    const result = source.filterMutes([
      source.toUserSuggestion(mockUsers[0], 'john'),
      source.toUserSuggestion(mockUsers[1], 'john'),
      source.toChannelMentionSuggestion('john'),
    ]);

    expect(result).toEqual([
      source.toUserSuggestion(mockUsers[1], 'john'),
      source.toChannelMentionSuggestion('john'),
    ]);
  });

  it('should return only muted users for /unmute and hide special mentions', () => {
    const source = new MentionsSearchSource(channel);
    const mute: Mute = {
      target: { id: 'user1' },
      user: { id: 'currentUser' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    client.mutedUsers = [mute];

    source.config.textComposerText = '/unmute @';
    const result = source.filterMutes([
      source.toUserSuggestion(mockUsers[0]),
      source.toUserSuggestion(mockUsers[1]),
      source.toHereMentionSuggestion(),
    ]);

    expect(result).toEqual([source.toUserSuggestion(mockUsers[0])]);
  });

  it('should preserve items in state before first query', () => {
    const source = new MentionsSearchSource(channel);
    source.activate();

    const initialState = source.state.getLatestValue();
    const newState = source.getStateBeforeFirstQuery('test');

    expect(newState.items).toEqual(initialState.items);
  });

  it('should correctly determine if query can be executed', () => {
    const source = new MentionsSearchSource(channel);
    source.activate();

    expect(source.canExecuteQuery('test')).toBe(true);
    source.state.partialNext({ isLoading: true });
    expect(source.canExecuteQuery('test')).toBe(false);
    source.state.partialNext({ isLoading: false });
    source.deactivate();
    expect(source.canExecuteQuery('test')).toBe(false);
  });

  it('should keep public pagination state offset-based while paginating user groups privately', async () => {
    const source = new MentionsSearchSource(channel, { mentionAllAppUsers: true });
    source.activate();
    source.config.textComposerText = '@adm';
    source.state.partialNext({
      hasNext: true,
      offset: 3,
      searchQuery: 'adm',
    });
    (source as unknown as { userGroupCursor?: string }).userGroupCursor = JSON.stringify({
      id_gt: 'group-0',
      name_gt: 'Admins',
    });

    await source.executeQuery();

    expect(client.queryUsers).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({ limit: 10, offset: 3 }),
    );
    expect(client.searchUserGroups).toHaveBeenCalledWith({
      id_gt: 'group-0',
      limit: 10,
      name_gt: 'Admins',
      query: 'adm',
      team_id: 'engineering',
    } satisfies SearchUserGroupsOptions);
    expect(source.state.getLatestValue().next).toBeUndefined();
    expect(source.state.getLatestValue().offset).toBe(7);
  });

  it('should correctly get members and watchers without duplicates', () => {
    const source = new MentionsSearchSource(channel);
    channel.state.watchers = {
      user1: mockUsers[0], // Duplicate with member
      user4: { id: 'user4', name: 'New User' }, // New user
    };

    const result = source.getMembersAndWatchers();
    expect(result).toHaveLength(Object.keys(mockMembers).length + 1); // 2 members + 1 new watcher
    expect(result.find((u) => u.id === 'user4')).toBeDefined();
  });

  it('should prepare correct query parameters for users search', () => {
    const source = new MentionsSearchSource(channel);
    source.userFilters = { id: { $in: ['admin1', 'admin2'] } } as UserFilters;
    source.userSort = [{ created_at: -1 }];

    const params = source.prepareQueryUsersParams('john', 7);
    expect(params.filters).toEqual({
      $or: [{ id: { $autocomplete: 'john' } }, { name: { $autocomplete: 'john' } }],
      id: { $in: ['admin1', 'admin2'] },
    });
    expect(params.sort).toEqual([{ created_at: -1 }]);
    expect(params.options).toEqual(expect.objectContaining({ limit: 10, offset: 7 }));
  });

  it('should prepare correct query parameters for members search', () => {
    const source = new MentionsSearchSource(channel);
    source.memberFilters = { name: { $autocomplete: 'john' } } as MemberFilters;
    source.memberSort = { created_at: -1 };

    const params = source.prepareQueryMembersParams('john', 5);
    expect(params.filters).toEqual({ name: { $autocomplete: 'john' } });
    expect(params.sort).toEqual({ created_at: -1 });
    expect(params.options).toEqual(expect.objectContaining({ limit: 10, offset: 5 }));
  });

  it('should handle empty or invalid user names in local search', () => {
    const source = new MentionsSearchSource(channel);
    source.config.textComposerText = '@user';
    mockUsers = [
      { id: 'user1' }, // No name
      { id: 'user2', name: '' }, // Empty name
      { id: 'user3', name: 'Valid Name' },
    ];
    mockMembers = {
      user1: { user: mockUsers[0] },
      user2: { user: mockUsers[1] },
      user3: { user: mockUsers[2] },
    };
    channel.state.members = mockMembers;

    const result = source.searchMembersLocally('valid');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Valid Name');
  });

  it('should keep partial mention results when one source query fails', async () => {
    const source = new MentionsSearchSource(channel);
    client.queryUsers = vi.fn().mockRejectedValue(new Error('API Error'));

    source.config.mentionAllAppUsers = true;
    const result = await source.query('adm');

    expect(getSuggestion(result.items, 'role', 'admin')).toBeDefined();
    expect(getSuggestion(result.items, 'user_group', 'admins-group')).toBeDefined();
    expect(getSuggestion(result.items, 'user', 'user1')).toBeUndefined();
  });

  it('should apply custom search options', async () => {
    const source = new MentionsSearchSource(channel);
    source.searchOptions = { presence: true };
    source.config.mentionAllAppUsers = true;

    await source.query('test');
    expect(client.queryUsers).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Object),
      expect.objectContaining({ presence: true }),
    );
  });

  it('should correctly calculate Levenshtein distance for fuzzy matching', () => {
    const source = new MentionsSearchSource(channel);
    source.config.textComposerText = '@joh';
    channel.state.members = {
      user1: { user: { id: 'user1', name: 'John' } },
      user2: { user: { id: 'user2', name: 'Johnny' } },
      user3: { user: { id: 'user3', name: 'osep' } },
    };

    const result = source.searchMembersLocally('joh');
    expect(result).toHaveLength(2); // Should match John and Johnny
    expect(result.map((i) => i.name)).toEqual(['John', 'Johnny']);
  });
});
