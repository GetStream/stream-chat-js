import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TextComposer } from '../../../../../src/messageComposer/textComposer';
import { MessageComposer } from '../../../../../src/messageComposer/messageComposer';
import { Channel } from '../../../../../src/channel';
import { StreamChat } from '../../../../../src/client';
import { createCommandsMiddleware } from '../../../../../src/messageComposer/middleware/textComposer/commands';
import { createMentionsMiddleware } from '../../../../../src/messageComposer/middleware/textComposer/mentions';
import type { TextComposerSuggestion } from '../../../../../src/messageComposer/types';
import type { UserResponse, CommandResponse } from '../../../../../src/types';

describe('TextComposer with Middleware', () => {
  let channel: Channel;
  let client: StreamChat;
  let messageComposer: MessageComposer;
  let textComposer: TextComposer;

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
  });

  it('should handle mentions with default middleware', async () => {
    await textComposer.handleChange({
      text: '@jo',
      selection: { start: 3, end: 3 },
    });

    expect(textComposer.suggestions).toBeDefined();
    expect(textComposer.suggestions?.trigger).toBe('@');
    expect(textComposer.suggestions?.query).toBe('jo');
  });

  it('should handle commands with default middleware', async () => {
    await textComposer.handleChange({
      text: '/ban',
      selection: { start: 4, end: 4 },
    });

    expect(textComposer.suggestions).toBeDefined();
    expect(textComposer.suggestions?.trigger).toBe('/');
    expect(textComposer.suggestions?.query).toBe('ban');
  });

  it('should handle suggestion selection with mentions', async () => {
    await textComposer.handleChange({
      text: '@jo',
      selection: { start: 3, end: 3 },
    });

    const selectedSuggestion: TextComposerSuggestion<UserResponse> = {
      id: 'user1',
      name: 'John Doe',
    } as UserResponse;

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

    const selectedSuggestion: TextComposerSuggestion<CommandResponse> = {
      id: 'ban',
      name: 'ban',
      description: 'Ban a user',
    } as CommandResponse & { id: string };

    await textComposer.handleSelect(selectedSuggestion);

    expect(textComposer.text).toBe('/ban ');
    expect(textComposer.suggestions).toBeUndefined();
  });

  it('should handle combination of commands and mentions', async () => {
    // Test a command followed by a mention
    await textComposer.handleChange({
      text: '/ban @jo',
      selection: { start: 9, end: 9 },
    });

    expect(textComposer.suggestions).toBeDefined();
    expect(textComposer.suggestions?.trigger).toBe('@');
    expect(textComposer.suggestions?.query).toBe('jo');

    // Select the mention
    const selectedMention = {
      id: 'user1',
      name: 'John Doe',
    } as TextComposerSuggestion<UserResponse>;

    await textComposer.handleSelect(selectedMention);

    expect(textComposer.text).toBe('/ban @John Doe ');
    expect(textComposer.suggestions).toBeUndefined();
    expect(textComposer.mentionedUsers).toContainEqual(selectedMention);

    // Test a command in the middle of text - should not trigger command suggestions
    await textComposer.handleChange({
      text: 'hello /ban',
      selection: { start: 11, end: 11 },
    });

    expect(textComposer.suggestions).toBeUndefined();

    // Test a mention followed by a command
    await textComposer.handleChange({
      text: '@John Doe /ban',
      selection: { start: 12, end: 12 },
    });

    expect(textComposer.suggestions).toBeUndefined(); // Command in middle shouldn't trigger
  });

  it('should demonstrate middleware order impact', async () => {
    // Create a custom middleware that intercepts @ and / characters
    const customMiddleware = {
      id: 'custom-middleware',
      onChange: vi.fn().mockImplementation(({ input, nextHandler }) => {
        if (input.state.text.startsWith('@') || input.state.text.startsWith('/')) {
          return Promise.resolve({
            state: { ...input.state, text: 'intercepted' },
            stop: true,
          });
        }
        return nextHandler(input);
      }),
    };

    // Create a new TextComposer with custom middleware
    const customTextComposer = new TextComposer({ composer: messageComposer });
    customTextComposer.middlewareExecutor.insert({
      middleware: [customMiddleware],
      position: { before: 'stream-io/mentions-middleware' },
    });

    // Test with @ character
    await customTextComposer.handleChange({
      text: '@user',
      selection: { start: 5, end: 5 },
    });

    expect(customTextComposer.text).toBe('intercepted');
    expect(customTextComposer.suggestions).toBeUndefined();

    // Test with / character
    await customTextComposer.handleChange({
      text: '/command',
      selection: { start: 8, end: 8 },
    });

    expect(customTextComposer.text).toBe('intercepted');
    expect(customTextComposer.suggestions).toBeUndefined();
  });
});
