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
  Mute,
  UserResponse,
  UserFilters,
  MemberFilters,
} from '../../../../../src/types';

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

  beforeEach(() => {
    mockUsers = [
      { id: 'user1', name: 'John Doe' },
      { id: 'user2', name: 'Jane Smith' },
      { id: 'user3', name: 'Bob Wilson' },
      { id: 'currentUser', name: 'Alice Johnson' },
    ];

    mockMembers = {
      user1: { user: { id: 'user1', name: 'John Doe' } },
      user2: { user: { id: 'user2', name: 'Jane Smith' } },
      currentUser: { user: { id: 'currentUser', name: 'Alice Johnson' } },
    };

    client = {
      userID: 'currentUser',
      queryUsers: vi.fn().mockResolvedValue({ users: mockUsers }),
      mutedUsers: [],
    } as any;

    channel = {
      getClient: vi.fn().mockReturnValue(client),
      state: {
        members: mockMembers,
        watchers: {},
      },
      queryMembers: vi.fn().mockResolvedValue({ members: Object.values(mockMembers) }),
    } as any;
  });

  it('should initialize with correct type', () => {
    const source = new MentionsSearchSource(channel);
    expect(source.type).toBe('mentions');
    expect(source.config.mentionAllAppUsers).toBeUndefined;
    expect(source.config.textComposerText).toBeUndefined;
    expect(source.config.transliterate).toBeUndefined;

    const customizedSource = new MentionsSearchSource(channel, {
      mentionAllAppUsers: true,
      textComposerText: '@',
      transliterate: (text: string) => text.toLowerCase(),
    });
    expect(customizedSource.config.mentionAllAppUsers).toBe(true);
    expect(customizedSource.config.textComposerText).toBe('@');
    expect(customizedSource.transliterate).toBeInstanceOf(Function);
  });

  it('should search members locally when all members are loaded', async () => {
    const source = new MentionsSearchSource(channel);
    source.activate();
    source.config.textComposerText = '@jo';

    const result = await source.query('jo');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('John Doe');
  });

  it('should query members from API when not all loaded', async () => {
    const source = new MentionsSearchSource(channel);
    source.activate();

    // Simulate more members than MAX_CHANNEL_MEMBER_COUNT_IN_CHANNEL_QUERY
    const manyMembers: Record<string, ChannelMemberResponse> = {};
    for (let i = 0; i < MAX_CHANNEL_MEMBER_COUNT_IN_CHANNEL_QUERY + 1; i++) {
      manyMembers[`user${i}`] = { user: { id: `user${i}`, name: `User ${i}` } };
    }
    channel.state.members = manyMembers;

    const result = await source.query('john');
    expect(channel.queryMembers).toHaveBeenCalled();
    expect(result.items).toHaveLength(Object.keys(mockMembers).length);
  });

  it('should query all app users when mentionAllAppUsers is true', async () => {
    const source = new MentionsSearchSource(channel, { mentionAllAppUsers: true });
    source.activate();

    const result = await source.query('john');
    expect(client.queryUsers).toHaveBeenCalled();
    expect(result.items).toHaveLength(mockUsers.length);
  });

  it('should filter out current user from results', async () => {
    const source = new MentionsSearchSource(channel);
    source.activate();
    source.config.textComposerText = '@';

    const result = await source.query('');
    expect(result.items.every((item) => item.id !== client.userID)).toBe(true);
  });

  it('should handle transliteration when provided', async () => {
    const transliterate = (text: string) => text.toLowerCase();
    const source = new MentionsSearchSource(channel, { transliterate });
    source.activate();
    source.config.textComposerText = '@john';

    const result = await source.query('john');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('John Doe');
  });

  it('should filter muted users correctly', async () => {
    const source = new MentionsSearchSource(channel);
    source.activate();
    source.config.textComposerText = '@unmute';
    const mute: Mute = {
      target: { id: 'user1' },
      user: { id: 'currentUser' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    client.mutedUsers = [mute];

    const result = await source.query('');
    expect(result.items).toHaveLength(Object.keys(mockMembers).length - 1);
    expect(result.items[0].id).toBe('user2');
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

    const params = source.prepareQueryUsersParams('john');
    expect(params.filters).toEqual({
      $or: [{ id: { $autocomplete: 'john' } }, { name: { $autocomplete: 'john' } }],
      id: { $in: ['admin1', 'admin2'] },
    });
    expect(params.sort).toEqual([{ created_at: -1 }]);
  });

  it('should prepare correct query parameters for members search', () => {
    const source = new MentionsSearchSource(channel);
    source.memberFilters = { name: { $autocomplete: 'john' } } as MemberFilters;
    source.memberSort = { created_at: -1 };

    const params = source.prepareQueryMembersParams('john');
    expect(params.filters).toEqual({ name: { $autocomplete: 'john' } });
    expect(params.sort).toEqual({ created_at: -1 });
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
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('Valid Name');
  });

  it('should handle errors in API queries', async () => {
    const source = new MentionsSearchSource(channel);
    client.queryUsers = vi.fn().mockRejectedValue(new Error('API Error'));

    source.config.mentionAllAppUsers = true;
    await expect(source.query('test')).rejects.toThrow('API Error');
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
    expect(result.items).toHaveLength(2); // Should match John and Johnny
    expect(result.items.map((i) => i.name)).toEqual(['John', 'Johnny']);
  });
});
