import { afterEach, describe, expect, it, vi } from 'vitest';
import { StreamChat } from '../../../src/client';
import {
  CompositionContext,
  MessageComposer,
} from '../../../src/messageComposer/messageComposer';
import { textIsEmpty } from '../../../src/messageComposer/textComposer';
import { DraftResponse, LocalMessage } from '../../../src/types';
import { logChatPromiseExecution } from '../../../src/utils';
import { TextComposerConfig } from '../../../src/messageComposer/configuration';

const textComposerMiddlewareExecuteOutput = {
  state: {
    mentionedUsers: [],
    text: 'Test message',
    selection: { start: 12, end: 12 },
  },
  status: '',
};

vi.mock('../.././src/messageComposer/middleware', () => ({
  TextComposerMiddlewareExecutor: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue(textComposerMiddlewareExecuteOutput),
  })),
}));

// Mock dependencies
vi.mock('../../../src/utils', () => ({
  axiosParamsSerializer: vi.fn(),
  isFunction: vi.fn(),
  isString: vi.fn(),
  isObject: vi.fn(),
  isArray: vi.fn(),
  isDate: vi.fn(),
  isNumber: vi.fn(),
  logChatPromiseExecution: vi.fn(),
  generateUUIDv4: vi.fn().mockReturnValue('test-uuid'),
  debounce: vi.fn().mockImplementation((fn) => fn),
  randomId: vi.fn().mockReturnValue('test-uuid'),
  isLocalMessage: vi.fn().mockReturnValue(true),
  formatMessage: vi.fn().mockImplementation((msg) => msg),
  throttle: vi.fn().mockImplementation((fn) => fn),
}));

const setup = ({
  config,
  composition,
  compositionContext,
}: {
  config?: Partial<TextComposerConfig>;
  composition?: DraftResponse | LocalMessage;
  compositionContext?: CompositionContext;
} = {}) => {
  // Reset mocks
  vi.clearAllMocks();

  // Setup mocks
  const mockClient = new StreamChat('apiKey', 'apiSecret');
  mockClient.queryUsers = vi.fn().mockResolvedValue({ users: [] });

  const mockChannel = mockClient.channel('channelType', 'channelId');
  mockChannel.keystroke = vi.fn().mockResolvedValue({});
  mockChannel.getClient = vi.fn().mockReturnValue(mockClient);

  const messageComposer = new MessageComposer({
    client: mockClient,
    composition,
    compositionContext: compositionContext ?? mockChannel,
    config: { text: config },
  });
  return { mockClient, mockChannel, messageComposer };
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
      const { messageComposer } = setup();
      expect(messageComposer.textComposer.state.getLatestValue()).toEqual({
        mentionedUsers: [],
        text: '',
        selection: { start: 0, end: 0 },
      });
    });

    it('should initialize with custom config', () => {
      const defaultValue = 'XXX';
      const { messageComposer } = setup({ config: { defaultValue } });
      expect(messageComposer.textComposer.state.getLatestValue()).toEqual({
        mentionedUsers: [],
        text: defaultValue,
        selection: { start: defaultValue.length, end: defaultValue.length },
      });
    });

    it('should initialize with message', () => {
      const message: LocalMessage = {
        id: 'test-message',
        type: 'regular',
        text: 'Hello world',
        mentioned_users: [{ id: 'user-1' }, { id: 'user-2', name: 'User 2' }],
        created_at: new Date(),
        deleted_at: null,
        pinned_at: null,
        status: 'pending',
        updated_at: new Date(),
      };

      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });

      expect(textComposer.text).toBe('Hello world');
      expect(textComposer.selection).toEqual({
        start: message.text?.length,
        end: message.text?.length,
      });
      expect(textComposer.mentionedUsers).toEqual([
        { id: 'user-1' },
        { id: 'user-2', name: 'User 2' },
      ]);
    });

    it('should ignore default value when initialized with message', () => {
      const defaultValue = 'XXX';
      const message: LocalMessage = {
        id: 'test-message',
        type: 'regular',
        text: 'Hello world',
        created_at: new Date(),
        deleted_at: null,
        pinned_at: null,
        status: 'pending',
        updated_at: new Date(),
      };

      const {
        messageComposer: { textComposer },
      } = setup({ composition: message, config: { defaultValue } });

      expect(textComposer.text).toBe('Hello world');
      expect(textComposer.selection).toEqual({
        start: message.text?.length,
        end: message.text?.length,
      });
    });
  });

  describe('getters', () => {
    it('should return the correct values from state', () => {
      const {
        messageComposer: { textComposer },
      } = setup();
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
      const {
        messageComposer: { textComposer },
      } = setup();
      textComposer.state.partialNext({ text: '' });
      expect(textComposer.textIsEmpty).toBe(true);
    });

    it('gets the current value of enabled', () => {
      const {
        messageComposer: { textComposer },
      } = setup();
      expect(textComposer.enabled).toBe(true);
      textComposer.enabled = false;
      expect(textComposer.enabled).toBe(false);
    });
  });

  describe('initState', () => {
    it('should reset the state to initial state', () => {
      const message: LocalMessage = {
        id: 'test-message',
        type: 'regular',
        text: 'Hello world',
        mentioned_users: [{ id: 'user-1' }, { id: 'user-2', name: 'User 2' }],
        created_at: new Date(),
        deleted_at: null,
        pinned_at: null,
        status: 'pending',
        updated_at: new Date(),
      };
      const initialState = {
        mentionedUsers: [],
        text: '',
        selection: { start: 0, end: 0 },
      };
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      textComposer.initState();
      expect(textComposer.state.getLatestValue()).toEqual(initialState);
    });

    it('should initialize with message', () => {
      const message: LocalMessage = {
        id: 'test-message',
        type: 'regular',
        text: 'Hello world',
        mentioned_users: [{ id: 'user-1' }],
        created_at: new Date(),
        deleted_at: null,
        pinned_at: null,
        status: 'pending',
        updated_at: new Date(),
      };
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      textComposer.initState({ message });
      expect(textComposer.text).toBe('Hello world');
      expect(textComposer.mentionedUsers).toEqual([{ id: 'user-1' }]);
    });
  });

  describe('setMentionedUsers', () => {
    it('should update mentioned users', () => {
      const message: LocalMessage = {
        id: 'test-message',
        type: 'regular',
        text: 'Hello world',
        mentioned_users: [{ id: 'user-1' }, { id: 'user-2', name: 'User 2' }],
      };
      const users = [{ id: 'user-1' }, { id: 'user-3' }];
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      textComposer.setMentionedUsers(users);
      expect(textComposer.mentionedUsers).toEqual(users);
    });
  });

  describe('upsertMentionedUser', () => {
    it('should add a new mentioned user', () => {
      const message: LocalMessage = {
        id: 'test-message',
        type: 'regular',
        text: 'Hello world',
        mentioned_users: [{ id: 'user-1' }, { id: 'user-2', name: 'User 2' }],
      };
      const user = { id: 'user-3', name: 'User 3' };
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      textComposer.upsertMentionedUser(user);
      expect(textComposer.mentionedUsers).toEqual([...message.mentioned_users, user]);
    });

    it('should update an existing mentioned user', () => {
      const message: LocalMessage = {
        id: 'test-message',
        type: 'regular',
        text: 'Hello world',
        mentioned_users: [{ id: 'user-1' }, { id: 'user-2', name: 'User 2' }],
      };
      const updatedUser = { id: 'user-1', name: 'New Name' };
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      textComposer.upsertMentionedUser(updatedUser);
      expect(textComposer.mentionedUsers).toEqual([
        { id: 'user-1', name: 'New Name' },
        { id: 'user-2', name: 'User 2' },
      ]);
    });
  });

  describe('getMentionedUser', () => {
    it('should return the mentioned user if found', () => {
      const message: LocalMessage = {
        id: 'test-message',
        type: 'regular',
        text: 'Hello world',
        mentioned_users: [{ id: 'user-1' }, { id: 'user-2', name: 'User 2' }],
      };
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      expect(textComposer.getMentionedUser('user-1')).toEqual(message.mentioned_users[0]);
    });

    it('should return undefined if user not found', () => {
      const message: LocalMessage = {
        id: 'test-message',
        type: 'regular',
        text: 'Hello world',
        mentioned_users: [{ id: 'user-1' }, { id: 'user-2', name: 'User 2' }],
      };
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      expect(textComposer.getMentionedUser('user-3')).toBeUndefined();
    });
  });

  describe('removeMentionedUser', () => {
    it('should remove the mentioned user if found', () => {
      const message: LocalMessage = {
        id: 'test-message',
        type: 'regular',
        text: 'Hello world',
        mentioned_users: [{ id: 'user-1' }, { id: 'user-2', name: 'User 2' }],
      };
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      textComposer.removeMentionedUser('user-1');
      expect(textComposer.mentionedUsers).toEqual([
        ...message.mentioned_users.filter((user) => user.id !== 'user-1'),
      ]);
    });

    it('should not update state if user not found', () => {
      const message: LocalMessage = {
        id: 'test-message',
        type: 'regular',
        text: 'Hello world',
        mentioned_users: [{ id: 'user-1' }, { id: 'user-2', name: 'User 2' }],
      };
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      textComposer.removeMentionedUser('user-3');
      expect(textComposer.mentionedUsers).toEqual(message.mentioned_users);
    });
  });

  describe('setText', () => {
    it('should update the text', () => {
      const message: LocalMessage = {
        id: 'test-message',
        type: 'regular',
        text: 'Hello world',
      };
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      textComposer.setText('New text');
      expect(textComposer.text).toBe('New text');
    });
    it('should not update the text when disabled', () => {
      const message: LocalMessage = {
        id: 'test-message',
        type: 'regular',
        text: 'Hello world',
      };
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message, config: { enabled: false } });
      textComposer.setText('New text');
      expect(textComposer.text).toBe(message.text);
    });
  });

  describe('insertText', () => {
    const message: LocalMessage = {
      id: 'test-message',
      type: 'regular',
      text: 'Hello world',
    };
    it('should insert text at the specified selection', () => {
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      textComposer.insertText({ text: ' beautiful', selection: { start: 5, end: 5 } });
      expect(textComposer.text).toBe('Hello beautiful world');
    });

    it('should insert text at the end if no selection provided', () => {
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      textComposer.insertText({ text: '!' });
      expect(textComposer.text).toBe('Hello world!');
    });

    it('should respect maxLengthOnEdit', () => {
      const message: LocalMessage = {
        id: 'test-message',
        type: 'regular',
        text: 'Hello',
      };
      const {
        messageComposer: { textComposer },
      } = setup({
        config: { maxLengthOnEdit: 8 },
        composition: message,
      });
      textComposer.insertText({ text: ' beautiful world' });
      expect(textComposer.text).toBe('Hello be');
    });

    it('should handle empty text insertion', () => {
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      textComposer.insertText({ text: '', selection: { start: 5, end: 5 } });
      expect(textComposer.text).toBe('Hello world');
    });

    it('should handle insertion at the start of text', () => {
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      textComposer.insertText({ text: 'Hi ', selection: { start: 0, end: 0 } });
      expect(textComposer.text).toBe('Hi Hello world');
    });

    it('should handle insertion at end of text', () => {
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      textComposer.insertText({ text: '!', selection: { start: 11, end: 11 } });
      expect(textComposer.text).toBe('Hello world!');
    });

    it('should handle insertion with multi-character selection', () => {
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      textComposer.insertText({ text: 'Hi', selection: { start: 0, end: 5 } });
      expect(textComposer.text).toBe('Hi world');
    });

    it('should handle insertion with multi-character selection and maxLengthOnEdit restricting the size', () => {
      const message: LocalMessage = {
        id: 'test-message',
        type: 'regular',
        text: 'Hello world',
      };
      const {
        messageComposer: { textComposer },
      } = setup({
        config: { maxLengthOnEdit: 10 },
        composition: message,
      });
      const insertedText = 'Hi world';
      textComposer.insertText({ text: insertedText, selection: { start: 7, end: 9 } });
      expect(textComposer.text).toBe('Hello wHi ');
    });

    it('should not insert text if disabled', () => {
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message, config: { enabled: false } });
      textComposer.insertText({ text: ' beautiful', selection: { start: 5, end: 5 } });
      expect(textComposer.text).toBe(message.text);
    });
  });

  describe('closeSuggestions', () => {
    const message: LocalMessage = {
      id: 'test-message',
      type: 'regular',
      text: '@query',
    };

    it('should close suggestions if they exist', () => {
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      textComposer.state.next({ suggestions: { query: 'test', trigger: '@' } });
      textComposer.closeSuggestions();
      expect(textComposer.suggestions).toBeUndefined();
    });

    it('should not update state if no suggestions exist', () => {
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
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
      const {
        messageComposer: { textComposer },
      } = setup();
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

    it('should not update state with middleware result if disabled', async () => {
      const {
        messageComposer: { textComposer },
      } = setup({ config: { enabled: false } });
      textComposer.state.next(initialState);
      const initialText = textComposer.text;
      const initialSelection = textComposer.selection;
      await textComposer.handleChange({
        text: 'Test message',
        selection: { start: 12, end: 12 },
      });

      expect(textComposer.text).toBe(initialText);
      expect(textComposer.selection).toEqual(initialSelection);
    });

    it('should not update state if middleware returns discard status', async () => {
      const {
        messageComposer: { textComposer },
      } = setup();
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

    it('should trigger keystroke event with thread id if publishTypingEvents is true and editing a message', async () => {
      const composition: LocalMessage = {
        cid: 'channelType:channelId',
        id: 'reply-123',
        parent_id: 'thread-123',
        type: 'reply',
        text: 'Test message',
      };
      const {
        messageComposer: { textComposer },
      } = setup({ composition, compositionContext: composition });
      textComposer.state.next(initialState);

      await textComposer.handleChange({
        text: 'Test message',
        selection: { start: 12, end: 12 },
      });

      expect(textComposer.composer.channel.keystroke).toHaveBeenCalledWith('thread-123');
      expect(logChatPromiseExecution).toHaveBeenCalled();
    });

    it('should trigger keystroke event with undefined if publishTypingEvents is true and not editing a message', async () => {
      const composition: LocalMessage = {
        cid: 'channelType:channelId',
        id: 'reply-123',
        parent_id: 'thread-123',
        type: 'reply',
        text: 'Test message',
      };
      const {
        messageComposer: { textComposer },
      } = setup({ composition });
      textComposer.state.next(initialState);

      await textComposer.handleChange({
        text: 'Test message',
        selection: { start: 12, end: 12 },
      });

      expect(textComposer.composer.channel.keystroke).toHaveBeenCalledWith(undefined);
      expect(logChatPromiseExecution).toHaveBeenCalled();
    });

    it('should not trigger keystroke event if publishTypingEvents is false', async () => {
      const {
        messageComposer: { textComposer },
      } = setup({ config: { publishTypingEvents: false } });
      textComposer.state.next(initialState);

      await textComposer.handleChange({
        text: 'Test message',
        selection: { start: 12, end: 12 },
      });

      expect(textComposer.composer.channel.keystroke).not.toHaveBeenCalled();
      expect(logChatPromiseExecution).not.toHaveBeenCalled();
    });

    it('should not trigger keystroke event with empty text', async () => {
      const {
        messageComposer: { textComposer },
      } = setup();
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
      const {
        messageComposer: { textComposer },
      } = setup();
      textComposer.state.next(initialState);

      const target = { id: 'user-1' };
      const executeSpy = vi.spyOn(textComposer.middlewareExecutor, 'execute');
      executeSpy.mockResolvedValueOnce(textComposerMiddlewareExecuteOutput);
      await textComposer.handleSelect(target);

      expect(textComposer.state.getLatestValue()).toEqual(
        textComposerMiddlewareExecuteOutput.state,
      );
    });

    it('should not update state with middleware result if disabled', async () => {
      const {
        messageComposer: { textComposer },
      } = setup({ config: { enabled: false } });
      textComposer.state.next(initialState);

      const target = { id: 'user-1' };
      const executeSpy = vi.spyOn(textComposer.middlewareExecutor, 'execute');
      executeSpy.mockResolvedValueOnce(textComposerMiddlewareExecuteOutput);
      await textComposer.handleSelect(target);

      expect(textComposer.state.getLatestValue()).toEqual(initialState);
    });

    it('should not update state if middleware returns discard status', async () => {
      const {
        messageComposer: { textComposer },
      } = setup();
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
