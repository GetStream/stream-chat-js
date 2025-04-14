import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Channel } from '../../../../../src/channel';
import { StreamChat } from '../../../../../src/client';
import { MessageComposer } from '../../../../../src/messageComposer/messageComposer';
import { TextComposerMiddlewareExecutor } from '../../../../../src/messageComposer/middleware/textComposer/TextComposerMiddlewareExecutor';
import { TextComposer } from '../../../../../src/messageComposer/textComposer';
import { createMentionsMiddleware } from '../../../../../src/messageComposer/middleware/textComposer/mentions';
import type { TextComposerSuggestion } from '../../../../../src/messageComposer/types';
import type { UserResponse, CommandResponse } from '../../../../../src/types';

describe('TextComposerMiddlewareExecutor', () => {
  let channel: Channel;
  let client: StreamChat;
  let messageComposer: MessageComposer;
  let textComposer: TextComposer;
  let middlewareExecutor: TextComposerMiddlewareExecutor;

  beforeEach(() => {
    client = {
      userID: 'currentUser',
    } as any;

    channel = {
      getClient: vi.fn().mockReturnValue(client),
      state: {
        members: {},
        watchers: {},
      },
      getConfig: vi.fn().mockReturnValue({ commands: [] }),
    } as any;

    messageComposer = {
      channel,
      config: {},
      threadId: undefined,
    } as any;

    textComposer = new TextComposer({ composer: messageComposer });
    middlewareExecutor = new TextComposerMiddlewareExecutor({
      composer: messageComposer,
    });
  });

  it('should initialize with default middleware', () => {
    const middleware = (middlewareExecutor as any).middleware;
    expect(middleware.length).toBe(2);
    expect(middleware[0].id).toBe('stream-io/mentions-middleware');
    expect(middleware[1].id).toBe('stream-io/commands-middleware');
  });

  it('should handle onChange event with mentions', async () => {
    let result = await middlewareExecutor.execute('onChange', {
      state: {
        text: '@jo',
        selection: { start: 3, end: 3 },
        mentionedUsers: [],
      },
    });

    expect(result.state.suggestions).toBeDefined();
    expect(result.state.suggestions?.trigger).toBe('@');
    expect(result.state.suggestions?.query).toBe('jo');

    result = await middlewareExecutor.execute('onChange', {
      state: {
        text: 'abcde@ho',
        selection: { start: 8, end: 8 },
        mentionedUsers: [],
      },
    });

    expect(result.state.suggestions).toBeDefined();
    expect(result.state.suggestions?.trigger).toBe('@');
    expect(result.state.suggestions?.query).toBe('ho');

    result = await middlewareExecutor.execute('onChange', {
      state: {
        text: 'abcde@ho',
        selection: { start: 5, end: 5 }, // selection is not where the trigger is
        mentionedUsers: [],
      },
    });

    expect(result.state.suggestions).toBeUndefined();

    result = await middlewareExecutor.execute('onChange', {
      state: {
        text: 'abcde@ho',
        selection: { start: 6, end: 6 }, // selection is where the trigger is but not at the end
        mentionedUsers: [],
      },
    });

    expect(result.state.suggestions).toBeDefined();
    expect(result.state.suggestions?.trigger).toBe('@');
    expect(result.state.suggestions?.query).toBe('');
  });

  it('should handle onChange event with commands', async () => {
    let result = await middlewareExecutor.execute('onChange', {
      state: {
        text: '/ban',
        selection: { start: 4, end: 4 },
        mentionedUsers: [],
      },
    });

    expect(result.state.suggestions).toBeDefined();
    expect(result.state.suggestions?.trigger).toBe('/');
    expect(result.state.suggestions?.query).toBe('ban');

    result = await middlewareExecutor.execute('onChange', {
      state: {
        text: '/ban /ban',
        selection: { start: 9, end: 9 },
        mentionedUsers: [],
      },
    });

    expect(result.state.suggestions).toBeUndefined();
  });

  it('should handle suggestion selection with mentions', async () => {
    await textComposer.handleChange({
      text: '@jo',
      selection: { start: 3, end: 3 },
    });

    const selectedSuggestion = {
      id: 'user1',
      name: 'John Doe',
    } as TextComposerSuggestion<UserResponse>;

    await textComposer.handleSelect(selectedSuggestion);

    expect(textComposer.text).toBe('@John Doe ');
    expect(textComposer.suggestions).toBeUndefined();
    expect(textComposer.mentionedUsers).toContainEqual(selectedSuggestion);
  });

  it('should handle suggestion selection with commands', async () => {
    await textComposer.handleChange({
      text: '/ba',
      selection: { start: 3, end: 3 },
    });

    const selectedSuggestion = {
      id: 'ban',
      name: 'ban',
      description: 'Ban a user',
    } as TextComposerSuggestion<CommandResponse>;

    await textComposer.handleSelect(selectedSuggestion);

    expect(textComposer.text).toBe('/ban ');
    expect(textComposer.suggestions).toBeUndefined();
  });

  it('should handle search errors and cancellations', async () => {
    const mockSearchSource = {
      search: vi.fn().mockImplementation(() => {
        throw new Error('Search failed');
      }),
      activate: vi.fn(),
      resetState: vi.fn(),
      resetStateAndActivate: vi.fn(),
      config: {},
    };

    middlewareExecutor.replace([
      createMentionsMiddleware(channel, {
        searchSource: mockSearchSource as any,
      }),
    ]);

    const result = await middlewareExecutor.execute('onChange', {
      state: {
        text: '@jo',
        selection: { start: 3, end: 3 },
        mentionedUsers: [],
      },
    });

    expect(mockSearchSource.search).toHaveBeenCalled();
    expect(result.state.suggestions).toBeUndefined();
  });

  describe('commands middleware', () => {
    it('should return early if no selection', async () => {
      const result = await middlewareExecutor.execute('onChange', {
        state: {
          text: '/test',
          selection: { start: 0, end: 0 },
          mentionedUsers: [],
        },
      });

      expect(result.state).toEqual({
        text: '/test',
        selection: { start: 0, end: 0 },
        mentionedUsers: [],
      });
    });

    it('should return early if first char is not command trigger', async () => {
      const result = await middlewareExecutor.execute('onChange', {
        state: {
          text: 'test',
          selection: { start: 0, end: 4 },
          mentionedUsers: [],
        },
      });

      expect(result.state).toEqual({
        text: 'test',
        selection: { start: 0, end: 4 },
        mentionedUsers: [],
      });
    });

    it('should handle trigger with token', async () => {
      const result = await middlewareExecutor.execute('onChange', {
        state: {
          text: '/test',
          selection: { start: 0, end: 5 },
          mentionedUsers: [],
        },
      });

      expect(result.state.suggestions).toBeDefined();
      expect(result.state.suggestions?.trigger).toBe('/');
      expect(result.state.suggestions?.query).toBe('test');
    });

    it('should handle new search trigger', async () => {
      const result = await middlewareExecutor.execute('onChange', {
        state: {
          text: '/',
          selection: { start: 0, end: 1 },
          mentionedUsers: [],
        },
      });

      expect(result.state.suggestions).toBeDefined();
      expect(result.state.suggestions?.trigger).toBe('/');
      expect(result.state.suggestions?.query).toBe('');
    });

    it('should handle trigger removal and stale suggestions', async () => {
      const result = await middlewareExecutor.execute('onChange', {
        state: {
          text: 'test',
          selection: { start: 0, end: 4 },
          mentionedUsers: [],
          suggestions: {
            trigger: '/',
            query: 'test',
            searchSource: {} as any,
          },
        },
      });

      expect(result.state.suggestions).toBeUndefined();
    });
  });

  describe('mentions middleware', () => {
    it('should return early if no selection', async () => {
      const result = await middlewareExecutor.execute('onChange', {
        state: {
          text: '@test',
          selection: { start: 0, end: 0 },
          mentionedUsers: [],
        },
      });

      expect(result.state).toEqual({
        text: '@test',
        selection: { start: 0, end: 0 },
        mentionedUsers: [],
      });
    });

    it('should handle trigger with token', async () => {
      const result = await middlewareExecutor.execute('onChange', {
        state: {
          text: '@test',
          selection: { start: 0, end: 5 },
          mentionedUsers: [],
        },
      });

      expect(result.state.suggestions).toBeDefined();
      expect(result.state.suggestions?.trigger).toBe('@');
      expect(result.state.suggestions?.query).toBe('test');
    });

    it('should handle new search trigger', async () => {
      const result = await middlewareExecutor.execute('onChange', {
        state: {
          text: '@',
          selection: { start: 0, end: 1 },
          mentionedUsers: [],
        },
      });

      expect(result.state.suggestions).toBeDefined();
      expect(result.state.suggestions?.trigger).toBe('@');
      expect(result.state.suggestions?.query).toBe('');
    });

    it('should handle trigger removal and stale suggestions', async () => {
      const result = await middlewareExecutor.execute('onChange', {
        state: {
          text: 'test',
          selection: { start: 0, end: 4 },
          mentionedUsers: [],
          suggestions: {
            trigger: '@',
            query: 'test',
            searchSource: {} as any,
          },
        },
      });

      expect(result.state.suggestions).toBeUndefined();
    });
  });

  it('should handle combination of commands and mentions', async () => {
    // First test a command
    let result = await middlewareExecutor.execute('onChange', {
      state: {
        text: '/ban',
        selection: { start: 4, end: 4 },
        mentionedUsers: [],
      },
    });

    expect(result.state.suggestions).toBeDefined();
    expect(result.state.suggestions?.trigger).toBe('/');
    expect(result.state.suggestions?.query).toBe('ban');

    // Then test a mention after the command
    result = await middlewareExecutor.execute('onChange', {
      state: {
        text: '/ban @jo',
        selection: { start: 9, end: 9 },
        mentionedUsers: [],
      },
    });

    expect(result.state.suggestions).toBeDefined();
    expect(result.state.suggestions?.trigger).toBe('@');
    expect(result.state.suggestions?.query).toBe('jo');

    // Test a command in the middle of text - should not trigger command suggestions
    result = await middlewareExecutor.execute('onChange', {
      state: {
        text: 'hello /ban',
        selection: { start: 11, end: 11 },
        mentionedUsers: [],
      },
    });

    expect(result.state.suggestions).toBeUndefined();

    // Test a mention followed by a command
    result = await middlewareExecutor.execute('onChange', {
      state: {
        text: '@jo /ban',
        selection: { start: 8, end: 8 },
        mentionedUsers: [],
      },
    });

    // Command in middle shouldn't trigger
    expect(result.state.suggestions).toBeDefined();
    expect(result.state.suggestions?.trigger).toBe('@');
    expect(result.state.suggestions?.query).toBe('jo /ban');
  });
});
