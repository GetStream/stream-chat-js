import { describe, expect, it, vi } from 'vitest';
import { StreamChat } from '../../../../../src/client';
import { TextComposerConfig } from '../../../../../src/messageComposer/configuration';
import {
  CompositionContext,
  MessageComposer,
} from '../../../../../src/messageComposer/messageComposer';
import { createMentionsMiddleware } from '../../../../../src/messageComposer/middleware/textComposer/mentions';
import type { TextComposerSuggestion } from '../../../../../src/messageComposer/';
import type {
  CommandResponse,
  DraftResponse,
  LocalMessage,
  UserResponse,
} from '../../../../../src/types';
import { TextComposerMiddleware } from '../../../../../src';

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
  const client = new StreamChat('apiKey', 'apiSecret');
  client.queryUsers = vi.fn().mockResolvedValue({ users: [] });

  const channel = client.channel('channelType', 'channelId');
  channel.keystroke = vi.fn().mockResolvedValue({});
  channel.getClient = vi.fn().mockReturnValue(client);
  channel.getConfig = vi.fn().mockReturnValue({
    commands: [
      { name: 'ban', description: 'Ban a user' },
      { name: 'mute', description: 'Mute a user' },
    ],
  });

  const messageComposer = new MessageComposer({
    client: client,
    composition,
    compositionContext: compositionContext ?? channel,
    config: { text: config },
  });
  return { client, channel, messageComposer };
};

const initialValue = {
  text: '',
  selection: { start: 0, end: 0 },
  mentionedUsers: [],
};

describe('TextComposerMiddlewareExecutor', () => {
  it('should initialize with default middleware', () => {
    const {
      messageComposer: { textComposer },
    } = setup();
    const middleware = textComposer.middlewareExecutor.middleware;
    expect(middleware.length).toBe(3);
    expect(middleware[0].id).toBe('stream-io/text-composer/pre-validation-middleware');
    expect(middleware[1].id).toBe('stream-io/text-composer/mentions-middleware');
    expect(middleware[2].id).toBe('stream-io/text-composer/commands-middleware');
  });

  it('should handle onChange event with mentions', async () => {
    const {
      messageComposer: { textComposer },
    } = setup();
    let result = await textComposer.middlewareExecutor.execute({
      eventName: 'onChange',
      initialValue: {
        ...initialValue,
        text: '@jo',
        selection: { start: 3, end: 3 },
      },
    });

    expect(result.state.suggestions).toBeDefined();
    expect(result.state.suggestions?.trigger).toBe('@');
    expect(result.state.suggestions?.query).toBe('jo');

    result = await textComposer.middlewareExecutor.execute({
      eventName: 'onChange',
      initialValue: {
        ...initialValue,
        text: 'abcde@ho',
        selection: { start: 8, end: 8 },
      },
    });

    expect(result.state.suggestions).toBeDefined();
    expect(result.state.suggestions?.trigger).toBe('@');
    expect(result.state.suggestions?.query).toBe('ho');

    result = await textComposer.middlewareExecutor.execute({
      eventName: 'onChange',
      initialValue: {
        ...initialValue,
        text: 'abcde@ho',
        selection: { start: 5, end: 5 }, // selection is not where the trigger is
      },
    });

    expect(result.state.suggestions).toBeUndefined();

    result = await textComposer.middlewareExecutor.execute({
      eventName: 'onChange',
      initialValue: {
        ...initialValue,
        text: 'abcde@ho',
        selection: { start: 6, end: 6 }, // selection is where the trigger is but not at the end
      },
    });

    expect(result.state.suggestions).toBeDefined();
    expect(result.state.suggestions?.trigger).toBe('@');
    expect(result.state.suggestions?.query).toBe('');
  });

  it('should handle onChange event with commands', async () => {
    const {
      messageComposer: { textComposer },
    } = setup();
    let result = await textComposer.middlewareExecutor.execute({
      eventName: 'onChange',
      initialValue: {
        ...initialValue,
        text: '/ban',
        selection: { start: 4, end: 4 },
      },
    });

    expect(result.state.suggestions).toBeDefined();
    expect(result.state.suggestions?.trigger).toBe('/');
    expect(result.state.suggestions?.query).toBe('ban');
    expect(result.state.command).toBeDefined();
    expect(result.state.command?.name).toBe('ban');

    result = await textComposer.middlewareExecutor.execute({
      eventName: 'onChange',
      initialValue: {
        ...initialValue,
        change: {
          text: '/ban /ban',
          selection: { start: 9, end: 9 },
        },
      },
    });

    expect(result.state.suggestions).toBeUndefined(); // only one command trigger is allowed
  });

  it('should handle suggestion selection with mentions', async () => {
    const {
      messageComposer: { textComposer },
    } = setup();
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
    const {
      messageComposer: { textComposer },
    } = setup();
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
    expect(textComposer.command).toBeDefined();
    expect(textComposer.command?.name).toBe('ban');
  });

  it('should not be impacted by errors triggered by search source query', async () => {
    const {
      channel,
      messageComposer: { textComposer },
    } = setup();
    const mockSearchSource = {
      search: vi.fn().mockRejectedValue(new Error('Search failed')),
      activate: vi.fn(),
      resetinitialValue: vi.fn(),
      resetState: vi.fn(),
      resetStateAndActivate: vi.fn(),
      config: {},
    };

    textComposer.middlewareExecutor.replace([
      createMentionsMiddleware(channel, {
        searchSource: mockSearchSource as any,
      }),
    ] as TextComposerMiddleware[]);

    const result = await textComposer.middlewareExecutor.execute({
      eventName: 'onChange',
      initialValue: {
        ...initialValue,
        text: '@jo',
        selection: { start: 3, end: 3 },
      },
    });

    expect(mockSearchSource.search).toHaveBeenCalled();
    expect(result.state.suggestions).toBeDefined();
  });

  describe('commands middleware', () => {
    it('should return early if no selection', async () => {
      const {
        messageComposer: { textComposer },
      } = setup();
      const result = await textComposer.middlewareExecutor.execute({
        eventName: 'onChange',
        initialValue: {
          ...initialValue,
          text: '/test',
          selection: { start: 0, end: 0 },
        },
      });

      expect(result.state).toEqual({
        text: '/test',
        selection: { start: 0, end: 0 },
        mentionedUsers: [],
      });
    });

    it('should return early if first char is not command trigger', async () => {
      const {
        messageComposer: { textComposer },
      } = setup();
      const result = await textComposer.middlewareExecutor.execute({
        eventName: 'onChange',
        initialValue: {
          ...initialValue,
          text: 'test',
          selection: { start: 0, end: 4 },
        },
      });

      expect(result.state).toEqual({
        text: 'test',
        selection: { start: 0, end: 4 },
        mentionedUsers: [],
      });
    });

    it('should handle trigger with token', async () => {
      const {
        messageComposer: { textComposer },
      } = setup();
      const result = await textComposer.middlewareExecutor.execute({
        eventName: 'onChange',
        initialValue: {
          ...initialValue,
          text: '/ban',
          selection: { start: 0, end: 4 },
        },
      });

      expect(result.state.suggestions).toBeDefined();
      expect(result.state.suggestions?.trigger).toBe('/');
      expect(result.state.suggestions?.query).toBe('ban');
      expect(result.state.command).toBeDefined();
      expect(result.state.command?.name).toBe('ban');
    });

    it('should handle new search trigger', async () => {
      const {
        messageComposer: { textComposer },
      } = setup();
      const result = await textComposer.middlewareExecutor.execute({
        eventName: 'onChange',
        initialValue: {
          ...initialValue,
          text: '/',
          selection: { start: 0, end: 1 },
        },
      });

      expect(result.state.suggestions).toBeDefined();
      expect(result.state.suggestions?.trigger).toBe('/');
      expect(result.state.suggestions?.query).toBe('');
    });

    it('should handle trigger removal and stale suggestions', async () => {
      const {
        messageComposer: { textComposer },
      } = setup();
      const result = await textComposer.middlewareExecutor.execute({
        eventName: 'onChange',
        initialValue: {
          ...initialValue,
          text: 'test',
          selection: { start: 0, end: 4 },
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
      const {
        messageComposer: { textComposer },
      } = setup();
      const result = await textComposer.middlewareExecutor.execute({
        eventName: 'onChange',
        initialValue: {
          ...initialValue,
          text: '@test',
          selection: { start: 0, end: 0 },
        },
      });

      expect(result.state).toEqual({
        text: '@test',
        selection: { start: 0, end: 0 },
        mentionedUsers: [],
      });
    });

    it('should handle trigger with token', async () => {
      const {
        messageComposer: { textComposer },
      } = setup();
      const result = await textComposer.middlewareExecutor.execute({
        eventName: 'onChange',
        initialValue: {
          ...initialValue,
          text: '@test',
          selection: { start: 0, end: 5 },
        },
      });

      expect(result.state.suggestions).toBeDefined();
      expect(result.state.suggestions?.trigger).toBe('@');
      expect(result.state.suggestions?.query).toBe('test');
    });

    it('should handle new search trigger', async () => {
      const {
        messageComposer: { textComposer },
      } = setup();
      const result = await textComposer.middlewareExecutor.execute({
        eventName: 'onChange',
        initialValue: {
          ...initialValue,
          text: '@',
          selection: { start: 0, end: 1 },
        },
      });

      expect(result.state.suggestions).toBeDefined();
      expect(result.state.suggestions?.trigger).toBe('@');
      expect(result.state.suggestions?.query).toBe('');
    });

    it('should handle trigger removal and stale suggestions', async () => {
      const {
        messageComposer: { textComposer },
      } = setup();
      const result = await textComposer.middlewareExecutor.execute({
        eventName: 'onChange',
        initialValue: {
          ...initialValue,
          text: 'test',
          selection: { start: 0, end: 4 },
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
    const {
      messageComposer: { textComposer },
    } = setup();
    let result = await textComposer.middlewareExecutor.execute({
      eventName: 'onChange',
      initialValue: {
        ...initialValue,
        text: '/ban',
        selection: { start: 4, end: 4 },
      },
    });

    expect(result.state.suggestions).toBeDefined();
    expect(result.state.suggestions?.trigger).toBe('/');
    expect(result.state.suggestions?.query).toBe('ban');

    // Then test a mention after the command
    result = await textComposer.middlewareExecutor.execute({
      eventName: 'onChange',
      initialValue: {
        ...initialValue,
        text: '/ban @jo',
        selection: { start: 9, end: 9 },
      },
    });

    expect(result.state.suggestions).toBeDefined();
    expect(result.state.suggestions?.trigger).toBe('@');
    expect(result.state.suggestions?.query).toBe('jo');

    // Test a command in the middle of text - should not trigger command suggestions
    result = await textComposer.middlewareExecutor.execute({
      eventName: 'onChange',
      initialValue: {
        ...initialValue,
        text: 'hello /ban',
        selection: { start: 11, end: 11 },
      },
    });

    expect(result.state.suggestions).toBeUndefined();

    // Test a mention followed by a command
    result = await textComposer.middlewareExecutor.execute({
      eventName: 'onChange',
      initialValue: {
        ...initialValue,
        text: '@jo /ban',
        selection: { start: 8, end: 8 },
      },
    });

    // Command in middle shouldn't trigger
    expect(result.state.suggestions).toBeDefined();
    expect(result.state.suggestions?.trigger).toBe('@');
    expect(result.state.suggestions?.query).toBe('jo /ban');
  });

  describe('validation middleware', () => {
    it('should truncate text exceeding max length', async () => {
      const {
        messageComposer: { textComposer },
      } = setup();
      // Set max text length
      textComposer.maxLengthOnEdit = 10;

      // Test with text exceeding max length
      const result = await textComposer.middlewareExecutor.execute({
        eventName: 'onChange',
        initialValue: {
          ...initialValue,
          text: 'Hello World This Is Too Long',
          selection: { start: 30, end: 30 },
        },
      });

      // Text should be truncated to maxTextLength
      expect(result.state.text).toBe('Hello Worl');
    });

    it('should not truncate text under max length', async () => {
      const {
        messageComposer: { textComposer },
      } = setup();
      // Set max text length
      textComposer.maxLengthOnEdit = 20;

      // Test with text under max length
      const result = await textComposer.middlewareExecutor.execute({
        eventName: 'onChange',
        initialValue: {
          ...initialValue,
          text: 'Hello World',
          selection: { start: 11, end: 11 },
        },
      });

      // Text should not be truncated
      expect(result.state.text).toBe('Hello World');
    });

    it('should handle validation with zero max length', async () => {
      const {
        messageComposer: { textComposer },
      } = setup();
      // Set max text length to zero
      textComposer.maxLengthOnEdit = 0;

      // Test with any text
      const result = await textComposer.middlewareExecutor.execute({
        eventName: 'onChange',
        initialValue: {
          ...initialValue,
          text: 'Hello World',
          selection: { start: 11, end: 11 },
        },
      });

      // Text should be empty
      expect(result.state.text).toBe('');
    });
  });
});
