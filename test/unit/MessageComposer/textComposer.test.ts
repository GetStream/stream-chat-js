import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  TextComposer,
  TextComposerConfig,
  textIsEmpty,
} from '../../../src/messageComposer/textComposer';
import { logChatPromiseExecution } from '../../../src/utils';
import { DraftMessage, LocalMessage } from '../../../src/types';

const textComposerMiddlewareExecuteOutput = {
  state: {
    mentionedUsers: [],
    text: 'Test message',
    selection: { start: 12, end: 12 },
  },
  status: '',
};

// Mock dependencies
vi.mock('../../../src/utils', () => ({
  logChatPromiseExecution: vi.fn(),
  generateUUIDv4: vi.fn().mockReturnValue('test-uuid'),
  debounce: vi.fn().mockImplementation((fn) => fn),
}));

vi.mock('../.././src/messageComposer/middleware', () => ({
  TextComposerMiddlewareExecutor: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue(textComposerMiddlewareExecuteOutput),
  })),
}));

const setup = ({
  config,
  message,
}: {
  config?: Partial<TextComposerConfig>;
  message?: DraftMessage | LocalMessage;
} = {}) => {
  const mockComposer = {
    channel: {
      keystroke: vi.fn().mockResolvedValue({}),
      getClient: vi.fn().mockReturnValue({
        user: { id: 'test-user' },
        queryUsers: vi.fn().mockResolvedValue({ users: [] }),
      }),
    },
    config: {
      maxTextLength: 1000,
      publishTypingEvents: true,
      ...config,
    },
    threadId: 'thread-123',
  };

  const textComposer = new TextComposer({ composer: mockComposer, message });
  return { mockComposer, textComposer };
};

describe('TextComposer', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('textIsEmpty', () => {
    it('should return true for empty strings', () => {
      expect(textIsEmpty('')).toBe(true);
      expect(textIsEmpty('   ')).toBe(true);
    });

    it('should return true for special markdown patterns', () => {
      expect(textIsEmpty('>')).toBe(true);
      expect(textIsEmpty('``````')).toBe(true);
      expect(textIsEmpty('``')).toBe(true);
      expect(textIsEmpty('**')).toBe(true);
      expect(textIsEmpty('____')).toBe(true);
      expect(textIsEmpty('__')).toBe(true);
      expect(textIsEmpty('****')).toBe(true);
    });

    it('should return false for non-empty strings', () => {
      expect(textIsEmpty('Hello')).toBe(false);
      expect(textIsEmpty('> Hello')).toBe(false);
      expect(textIsEmpty('**Hello**')).toBe(false);
    });
  });

  describe('constructor', () => {
    it('should initialize with default config', () => {
      const { textComposer, mockComposer } = setup();
      expect(textComposer.composer).toBe(mockComposer);
      expect(textComposer.state.getLatestValue()).toEqual({
        mentionedUsers: [],
        text: '',
        selection: { start: 0, end: 0 },
      });
    });

    it('should initialize with message', () => {
      const message = {
        id: 'test-message',
        type: 'regular',
        text: 'Hello world',
        mentioned_users: [{ id: 'user-1' }, { id: 'user-2', name: 'User 2' }],
      };

      const { textComposer } = setup({ message });

      expect(textComposer.text).toBe('Hello world');
      expect(textComposer.selection).toEqual({
        start: message.text.length,
        end: message.text.length,
      });
      expect(textComposer.mentionedUsers).toEqual([
        { id: 'user-1' },
        { id: 'user-2', name: 'User 2' },
      ]);
    });
  });

  describe('getters', () => {
    it('should return the correct values from state', () => {
      const { textComposer } = setup();
      const state = {
        mentionedUsers: [{ id: 'user-1' }],
        text: 'Hello world',
        selection: { start: 5, end: 5 },
        suggestions: { query: 'test' },
      };
      textComposer.state.partialNext(state);

      expect(textComposer.mentionedUsers).toEqual([{ id: 'user-1' }]);
      expect(textComposer.text).toBe('Hello world');
      expect(textComposer.selection).toEqual({ start: 5, end: 5 });
      expect(textComposer.suggestions).toEqual({ query: 'test' });
      expect(textComposer.textIsEmpty).toBe(false);
    });

    it('should return true for textIsEmpty when text is empty', () => {
      const { textComposer } = setup();
      textComposer.state.partialNext({ text: '' });
      expect(textComposer.textIsEmpty).toBe(true);
    });
  });

  describe('initState', () => {
    it('should reset the state to initial state', () => {
      const message = {
        id: 'test-message',
        type: 'regular',
        text: 'Hello world',
        mentioned_users: [{ id: 'user-1' }, { id: 'user-2', name: 'User 2' }],
      };
      const initialState = {
        mentionedUsers: [],
        text: '',
        selection: { start: 0, end: 0 },
      };
      const { textComposer } = setup({ message });
      textComposer.initState();
      expect(textComposer.state.getLatestValue()).toEqual(initialState);
    });

    it('should initialize with message', () => {
      const message = {
        text: 'Hello world',
        mentioned_users: [{ id: 'user-1' }],
      };
      const { textComposer } = setup();
      textComposer.initState({ message });
      expect(textComposer.text).toBe('Hello world');
      expect(textComposer.mentionedUsers).toEqual([{ id: 'user-1' }]);
    });
  });

  describe('setMentionedUsers', () => {
    it('should update mentioned users', () => {
      const message = {
        id: 'test-message',
        type: 'regular',
        text: 'Hello world',
        mentioned_users: [{ id: 'user-1' }, { id: 'user-2', name: 'User 2' }],
      };
      const users = [{ id: 'user-1' }, { id: 'user-3' }];
      const { textComposer } = setup({ message });
      textComposer.setMentionedUsers(users);
      expect(textComposer.mentionedUsers).toEqual(users);
    });
  });

  describe('upsertMentionedUser', () => {
    it('should add a new mentioned user', () => {
      const message = {
        id: 'test-message',
        type: 'regular',
        text: 'Hello world',
        mentioned_users: [{ id: 'user-1' }, { id: 'user-2', name: 'User 2' }],
      };
      const user = { id: 'user-3', name: 'User 3' };
      const { textComposer } = setup({ message });
      textComposer.upsertMentionedUser(user);
      expect(textComposer.mentionedUsers).toEqual([...message.mentioned_users, user]);
    });

    it('should update an existing mentioned user', () => {
      const message = {
        id: 'test-message',
        type: 'regular',
        text: 'Hello world',
        mentioned_users: [{ id: 'user-1' }, { id: 'user-2', name: 'User 2' }],
      };
      const updatedUser = { id: 'user-1', name: 'New Name' };
      const { textComposer } = setup({ message });
      textComposer.upsertMentionedUser(updatedUser);
      expect(textComposer.mentionedUsers).toEqual([
        { id: 'user-1', name: 'New Name' },
        { id: 'user-2', name: 'User 2' },
      ]);
    });
  });

  describe('getMentionedUser', () => {
    it('should return the mentioned user if found', () => {
      const message = {
        id: 'test-message',
        type: 'regular',
        text: 'Hello world',
        mentioned_users: [{ id: 'user-1' }, { id: 'user-2', name: 'User 2' }],
      };
      const { textComposer } = setup({ message });
      expect(textComposer.getMentionedUser('user-1')).toEqual(message.mentioned_users[0]);
    });

    it('should return undefined if user not found', () => {
      const message = {
        id: 'test-message',
        type: 'regular',
        text: 'Hello world',
        mentioned_users: [{ id: 'user-1' }, { id: 'user-2', name: 'User 2' }],
      };
      const { textComposer } = setup({ message });
      expect(textComposer.getMentionedUser('user-3')).toBeUndefined();
    });
  });

  describe('removeMentionedUser', () => {
    it('should remove the mentioned user if found', () => {
      const message = {
        id: 'test-message',
        type: 'regular',
        text: 'Hello world',
        mentioned_users: [{ id: 'user-1' }, { id: 'user-2', name: 'User 2' }],
      };
      const { textComposer } = setup({ message });
      textComposer.removeMentionedUser('user-1');
      expect(textComposer.mentionedUsers).toEqual([
        ...message.mentioned_users.filter((user) => user.id !== 'user-1'),
      ]);
    });

    it('should not update state if user not found', () => {
      const message = {
        id: 'test-message',
        type: 'regular',
        text: 'Hello world',
        mentioned_users: [{ id: 'user-1' }, { id: 'user-2', name: 'User 2' }],
      };
      const { textComposer } = setup({ message });
      textComposer.removeMentionedUser('user-3');
      expect(textComposer.mentionedUsers).toEqual(message.mentioned_users);
    });
  });

  describe('setText', () => {
    it('should update the text', () => {
      const message = {
        id: 'test-message',
        type: 'regular',
        text: 'Hello world',
      };
      const { textComposer } = setup({ message });
      textComposer.setText('New text');
      expect(textComposer.text).toBe('New text');
    });
  });

  describe('insertText', () => {
    const message = {
      id: 'test-message',
      type: 'regular',
      text: 'Hello world',
    };
    it('should insert text at the specified selection', () => {
      const { textComposer } = setup({ message });
      textComposer.insertText({ text: ' beautiful', selection: { start: 5, end: 5 } });
      expect(textComposer.text).toBe('Hello beautiful world');
    });

    it('should insert text at the end if no selection provided', () => {
      const { textComposer } = setup({ message });
      textComposer.insertText({ text: '!' });
      expect(textComposer.text).toBe('Hello world!');
    });

    it('should respect maxTextLength', () => {
      const message = {
        id: 'test-message',
        type: 'regular',
        text: 'Hello',
      };
      const { textComposer } = setup({ config: { maxTextLength: 8 }, message });
      textComposer.insertText({ text: ' beautiful world' });
      expect(textComposer.text).toBe('Hello be');
    });

    it('should handle empty text insertion', () => {
      const { textComposer } = setup({ message });
      textComposer.insertText({ text: '', selection: { start: 5, end: 5 } });
      expect(textComposer.text).toBe('Hello world');
    });

    it('should handle insertion at the start of text', () => {
      const { textComposer } = setup({ message });
      textComposer.insertText({ text: 'Hi ', selection: { start: 0, end: 0 } });
      expect(textComposer.text).toBe('Hi Hello world');
    });

    it('should handle insertion at end of text', () => {
      const { textComposer } = setup({ message });
      textComposer.insertText({ text: '!', selection: { start: 11, end: 11 } });
      expect(textComposer.text).toBe('Hello world!');
    });

    it('should handle insertion with multi-character selection', () => {
      const { textComposer } = setup({ message });
      textComposer.insertText({ text: 'Hi', selection: { start: 0, end: 5 } });
      expect(textComposer.text).toBe('Hi world');
    });
  });

  describe('closeSuggestions', () => {
    const message = {
      id: 'test-message',
      type: 'regular',
      text: '@query',
    };

    it('should close suggestions if they exist', () => {
      const { textComposer } = setup({ message });
      textComposer.state.next({ suggestions: { query: 'test', trigger: '@' } });
      textComposer.closeSuggestions();
      expect(textComposer.suggestions).toBeUndefined();
    });

    it('should not update state if no suggestions exist', () => {
      const { textComposer } = setup({ message });
      expect(textComposer.suggestions).toBeUndefined();
      textComposer.closeSuggestions();
      expect(textComposer.suggestions).toBeUndefined();
    });
  });

  describe('handleChange', () => {
    const initialState = {
      mentionedUsers: [],
      text: '',
      selection: { start: 0, end: 0 },
    };

    it('should update state with middleware result', async () => {
      const { textComposer } = setup();
      textComposer.state.next(initialState);

      await textComposer.handleChange({
        text: 'Test message',
        selection: { start: 12, end: 12 },
      });

      expect(textComposer.text).toBe(textComposerMiddlewareExecuteOutput.state.text);
      expect(textComposer.selection).toEqual(
        textComposerMiddlewareExecuteOutput.state.selection,
      );
    });

    it('should not update state if middleware returns discard status', async () => {
      const { textComposer } = setup();
      textComposer.state.next(initialState);

      const executeSpy = vi.spyOn(textComposer.middlewareExecutor, 'execute');
      executeSpy.mockResolvedValueOnce({
        state: {},
        status: 'discard',
      });

      await textComposer.handleChange({
        text: 'Test message',
        selection: { start: 12, end: 12 },
      });

      expect(textComposer.text).toBe('');
      expect(textComposer.selection).toEqual({ start: 0, end: 0 });
    });

    it('should trigger keystroke event if publishTypingEvents is true', async () => {
      const { textComposer } = setup();
      textComposer.state.next(initialState);

      await textComposer.handleChange({
        text: 'Test message',
        selection: { start: 12, end: 12 },
      });

      expect(textComposer.composer.channel.keystroke).toHaveBeenCalledWith('thread-123');
      expect(logChatPromiseExecution).toHaveBeenCalled();
    });

    it('should not trigger keystroke event if publishTypingEvents is false', async () => {
      const { textComposer } = setup({ config: { publishTypingEvents: false } });
      textComposer.state.next(initialState);

      await textComposer.handleChange({
        text: 'Test message',
        selection: { start: 12, end: 12 },
      });

      expect(textComposer.composer.channel.keystroke).not.toHaveBeenCalled();
      expect(logChatPromiseExecution).not.toHaveBeenCalled();
    });

    it('should not trigger keystroke event with empty text', async () => {
      const { textComposer } = setup();
      textComposer.state.next(initialState);

      await textComposer.handleChange({
        text: '',
        selection: { start: 0, end: 0 },
      });

      expect(textComposer.composer.channel.keystroke).not.toHaveBeenCalled();
      expect(logChatPromiseExecution).not.toHaveBeenCalled();
    });
  });

  describe('handleSelect', () => {
    const initialState = {
      mentionedUsers: [],
      text: '',
      selection: { start: 0, end: 0 },
    };

    it('should update state with middleware result', async () => {
      const { textComposer } = setup();
      textComposer.state.next(initialState);

      const target = { id: 'user-1' };
      const executeSpy = vi.spyOn(textComposer.middlewareExecutor, 'execute');
      executeSpy.mockResolvedValueOnce(textComposerMiddlewareExecuteOutput);
      await textComposer.handleSelect(target);

      expect(textComposer.state.getLatestValue()).toEqual(
        textComposerMiddlewareExecuteOutput.state,
      );
    });

    it('should not update state if middleware returns discard status', async () => {
      const { textComposer } = setup();
      textComposer.state.next(initialState);

      const executeSpy = vi.spyOn(textComposer.middlewareExecutor, 'execute');
      executeSpy.mockResolvedValueOnce({
        state: {},
        status: 'discard',
      });

      const target = { id: 'user-1' };
      await textComposer.handleSelect(target);

      expect(textComposer.state.getLatestValue()).toEqual(initialState);
    });
  });
});
