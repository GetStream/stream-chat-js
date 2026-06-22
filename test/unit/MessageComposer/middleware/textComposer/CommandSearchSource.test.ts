import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandSearchSource } from '../../../../../src/messageComposer/middleware/textComposer/commands';
import { Channel } from '../../../../../src/channel';
import type { ChannelConfigWithInfo } from '../../../../../src/types';

describe('CommandSearchSource', () => {
  let channel: Channel;
  let mockCommands: any[];
  let getConfigMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockCommands = [
      { name: 'giphy', description: 'Post a random gif' },
      { name: 'ban', description: 'Ban a user' },
      { name: 'mute', description: 'Mute a user' },
      { name: 'unmute', description: 'Unmute a user' },
    ];

    getConfigMock = vi.fn().mockReturnValue({ commands: mockCommands });
    channel = {
      getConfig: getConfigMock,
    } as any;
  });

  it('should initialize with correct type', () => {
    const source = new CommandSearchSource(channel);
    expect(source.type).toBe('commands');
  });

  it('should filter commands based on search query', async () => {
    const source = new CommandSearchSource(channel);
    source.activate();

    const result = await source.query('gi');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('giphy');
  });

  it('should sort commands with prefix matches first', async () => {
    const source = new CommandSearchSource(channel);
    source.activate();

    const result = await source.query('m');
    expect(result.items).toHaveLength(2);
    expect(result.items[0].name).toBe('mute');
    expect(result.items[1].name).toBe('unmute');
  });

  it('should return empty array for no matches', async () => {
    const source = new CommandSearchSource(channel);
    source.activate();

    const result = await source.query('nonexistent');
    expect(result.items).toHaveLength(0);
  });

  it('should handle case-insensitive search', async () => {
    const source = new CommandSearchSource(channel);
    source.activate();

    const result = await source.query('GI');
    expect(result.items).toHaveLength(1);
    expect(result.items[0].name).toBe('giphy');

    getConfigMock.mockReturnValueOnce({
      commands: mockCommands.map((command) => ({
        ...command,
        name: command.name.toUpperCase(),
      })),
    });
    const result2 = await source.query('gi');
    expect(result2.items).toHaveLength(1);
    expect(result2.items[0].name).toBe('GIPHY');
  });

  it('should preserve items in state before first query', () => {
    const source = new CommandSearchSource(channel);
    source.activate();

    const initialState = source.state.getLatestValue();
    const newState = source.getStateBeforeFirstQuery('test');

    expect(newState.items).toEqual(initialState.items);
  });

  describe('sorting', () => {
    it('preserves the configured command order when the search query is empty', async () => {
      const source = new CommandSearchSource(channel);
      source.activate();

      // The configured order (giphy, ban, mute, unmute) is intentionally not
      // alphabetical. With an empty query every command matches, and the result
      // must keep the configured order rather than being sorted alphabetically
      // (which would be ban, giphy, mute, unmute).
      const result = await source.query('');

      expect(result.items.map((item) => item.name)).toEqual([
        'giphy',
        'ban',
        'mute',
        'unmute',
      ]);
    });

    it('does not sort when the query is empty even if the config order is already non-alphabetical', async () => {
      mockCommands = [
        { name: 'zeta', description: '' },
        { name: 'alpha', description: '' },
        { name: 'gamma', description: '' },
      ];
      getConfigMock.mockReturnValue({ commands: mockCommands });
      const source = new CommandSearchSource(channel);
      source.activate();

      const result = await source.query('');

      expect(result.items.map((item) => item.name)).toEqual(['zeta', 'alpha', 'gamma']);
    });

    it('still sorts matches (prefix first, then alphabetical) when a query is provided', async () => {
      const source = new CommandSearchSource(channel);
      source.activate();

      // 'u' matches 'mute' (config index 2) and 'unmute' (config index 3).
      // 'unmute' is a prefix match, so it floats above 'mute' despite appearing
      // later in the configured order.
      const result = await source.query('u');

      expect(result.items.map((item) => item.name)).toEqual(['unmute', 'mute']);
    });
  });

  it('should not decorate commands with disabled state', async () => {
    mockCommands = [
      { name: 'ban', description: 'Ban a user', set: 'moderation_set' },
      { name: 'giphy', description: 'Post a random gif', set: 'fun_set' },
      { name: 'mute', description: 'Mute a user', set: 'fun_set' },
      { name: 'moderation_set', description: 'Moderate a user' },
    ];
    getConfigMock.mockReturnValue({ commands: mockCommands });
    const source = new CommandSearchSource(channel);

    const result = await source.query('');

    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'ban',
          name: 'ban',
          set: 'moderation_set',
        }),
        expect.objectContaining({
          id: 'moderation_set',
          name: 'moderation_set',
        }),
        expect.objectContaining({
          id: 'mute',
          name: 'mute',
          set: 'fun_set',
        }),
        expect.objectContaining({
          id: 'giphy',
          name: 'giphy',
          set: 'fun_set',
        }),
      ]),
    );
    expect(
      result.items.some(
        (command) => 'disabled' in command || 'disabledReason' in command,
      ),
    ).toBe(false);
  });
});
