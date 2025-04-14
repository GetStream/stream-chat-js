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
});
