import { describe, expect, it, vi } from 'vitest';
import { StreamChat } from '../../../../../src/client';
import { TextComposerConfig } from '../../../../../src/messageComposer/configuration';
import {
  CompositionContext,
  MessageComposer,
} from '../../../../../src/messageComposer/messageComposer';
import type { DraftResponse, LocalMessage } from '../../../../../src/types';
import { TextComposerMiddleware } from '../../../../../src';
import { createCommandStringExtractionMiddleware } from '../../../../../src/messageComposer/middleware/textComposer/commandStringExtraction';

// Mock dependencies

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
  messageComposer.textComposer.middlewareExecutor.insert({
    middleware: [createCommandStringExtractionMiddleware() as TextComposerMiddleware],
    position: { after: 'stream-io/text-composer/commands-middleware' },
  });
  return { client, channel, messageComposer };
};

const initialValue = {
  text: '',
  selection: { start: 0, end: 0 },
  mentionedUsers: [],
};

describe('Apply Command Settings Middleware', () => {
  it('should initialize with default middleware', () => {
    const {
      messageComposer: { textComposer },
    } = setup();
    const middleware = textComposer.middlewareExecutor.middleware;
    expect(middleware.length).toBe(4);
    expect(middleware[0].id).toBe('stream-io/text-composer/pre-validation-middleware');
    expect(middleware[1].id).toBe('stream-io/text-composer/mentions-middleware');
    expect(middleware[2].id).toBe('stream-io/text-composer/commands-middleware');
    expect(middleware[3].id).toBe('stream-io/text-composer/command-string-extraction');
  });

  it.each([
    {
      inputText: '/ban user1',
      inputSelection: { start: 10, end: 10 },
      outputText: 'user1',
      outputSelection: { start: 5, end: 5 },
    },
    {
      inputText: '/mute user2',
      inputSelection: { start: 11, end: 11 },
      outputText: 'user2',
      outputSelection: { start: 5, end: 5 },
    },
    {
      inputText: '/banuser1',
      inputSelection: { start: 9, end: 9 },
      outputText: '/banuser1',
      outputSelection: { start: 9, end: 9 },
    },
  ])(
    'should remove command trigger from text on onChange',
    async ({ inputText, inputSelection, outputText, outputSelection }) => {
      const {
        messageComposer: { textComposer },
      } = setup();

      const result = await textComposer.middlewareExecutor.execute({
        eventName: 'onChange',
        initialValue: {
          ...initialValue,
          text: inputText,
          selection: inputSelection,
        },
      });

      expect(result.state.text).toBe(outputText);
      expect(result.state.selection).toEqual(outputSelection);
    },
  );
});
