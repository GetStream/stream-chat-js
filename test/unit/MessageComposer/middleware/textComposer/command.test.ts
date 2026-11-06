import { afterEach, describe, expect, it, vi } from 'vitest';
import { StreamChat } from '../../../../../src/client';
import { TextComposerConfig } from '../../../../../src/messageComposer/configuration';
import {
  CompositionContext,
  MessageComposer,
} from '../../../../../src/messageComposer/messageComposer';
import { textStartsWithCommand } from '../../../../../src/messageComposer/middleware/textComposer/commandUtils';
import type { DraftResponse, LocalMessage } from '../../../../../src/types';
import { getClientWithUser } from '../../../test-utils/getClient';
import { stubServerConfig } from '../../../test-utils/stubServerConfig';

const GIPHY = { args: '[text]', description: 'Post a random gif', name: 'giphy' };
const SHRUG = { args: '', description: 'Shrug', name: 'shrug' };

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
  const client = getClientWithUser({ id: 'user' });
  client.queryUsers = vi.fn().mockResolvedValue({ users: [] });

  const channel = client.channelManager.ensure({ type: 'channelType', id: 'channelId' });
  channel.keystroke = vi.fn().mockResolvedValue({});
  channel.getClient = vi.fn().mockReturnValue(client);
  stubServerConfig(channel, {
    commands: [
      { args: '[@username] [text]', name: 'ban', description: 'Ban a user' },
      { args: '[@username]', name: 'mute', description: 'Mute a user' },
      GIPHY,
      SHRUG,
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
  mentions: [],
};

const COMMAND_INJECTION_ID =
  'stream-io/message-composer-middleware/command-string-injection';
const DRAFT_COMMAND_INJECTION_ID =
  'stream-io/message-composer-middleware/draft-command-string-injection';
const COMMAND_STRING_EXTRACTION_ID = 'stream-io/text-composer/command-string-extraction';

const typeText = (composer: MessageComposer, text: string) =>
  composer.textComposer.handleChange({
    text,
    selection: { start: text.length, end: text.length },
  });

const installedIds = (executor: { installedMiddleware: ReadonlyArray<{ id: string }> }) =>
  executor.installedMiddleware.map(({ id }) => id);

describe('Apply Command Settings Middleware', () => {
  it('should initialize with default middleware', () => {
    const {
      messageComposer: { textComposer },
    } = setup();
    const middleware = textComposer.middlewareExecutor.middleware;
    expect(middleware.length).toBe(6);
    expect(middleware[0].id).toBe('stream-io/text-composer/pre-validation-middleware');
    expect(middleware[1].id).toBe('stream-io/text-composer/mentions-middleware');
    expect(middleware[2].id).toBe('stream-io/text-composer/active-command-guard');
    expect(middleware[3].id).toBe('stream-io/text-composer/commands-middleware');
    expect(middleware[4].id).toBe('stream-io/text-composer/command-string-extraction');
    expect(middleware[5].id).toBe('stream-io/text-composer/command-effects-middleware');
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
    {
      inputText: '/mute     user3',
      inputSelection: { start: 15, end: 15 },
      outputText: 'user3',
      outputSelection: { start: 5, end: 5 },
    },
  ])(
    'should extract command from the text on onChange',
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

  it('execute the active command guard middleware flow', async () => {
    const {
      messageComposer: { textComposer },
    } = setup();

    const result = await textComposer.middlewareExecutor.execute({
      eventName: 'onChange',
      initialValue: {
        ...initialValue,
        text: '/ban ',
        selection: {
          start: 5,
          end: 5,
        },
      },
    });

    expect(result.state.text).toBe('');
    expect(result.state.command?.name).toBe('ban');

    const newResult = await textComposer.middlewareExecutor.execute({
      eventName: 'onChange',
      initialValue: {
        ...result.state,
        text: '/ban',
        selection: {
          start: 4,
          end: 4,
        },
      },
    });

    expect(result.state.command?.name).toBe('ban');
    expect(newResult.state.text).toBe('/ban');
    expect(newResult.state.selection).toEqual({ start: 4, end: 4 });
  });
});

describe('default command middlewares', () => {
  describe('sending a command', () => {
    it('installs the command injection after the attachments in the composition chains', () => {
      const { messageComposer: composer } = setup();
      const composeIds = installedIds(composer.compositionMiddlewareExecutor);
      const draftIds = installedIds(composer.draftCompositionMiddlewareExecutor);

      expect(composeIds.indexOf(COMMAND_INJECTION_ID)).toBe(
        composeIds.indexOf('stream-io/message-composer-middleware/attachments') + 1,
      );
      expect(draftIds.indexOf(DRAFT_COMMAND_INJECTION_ID)).toBe(
        draftIds.indexOf('stream-io/message-composer-middleware/draft-attachments') + 1,
      );
    });

    it('sends a typed /giphy hello as the giphy command', async () => {
      const { messageComposer: composer } = setup();

      await typeText(composer, '/giphy hello');

      expect(composer.textComposer.command?.name).toBe('giphy');
      expect(composer.textComposer.text).toBe('hello');

      const composition = await composer.compose();
      expect(composition?.message.text).toBe('/giphy hello');
      expect(composition?.localMessage.text).toBe('/giphy hello');
    });

    it('sends a command picked from the suggestions with the text typed after it', async () => {
      const { messageComposer: composer } = setup();

      await typeText(composer, '/gi');
      expect(composer.textComposer.suggestions?.trigger).toBe('/');
      await composer.textComposer.handleSelect({ ...GIPHY, id: 'giphy' });

      expect(composer.textComposer.command?.name).toBe('giphy');
      expect(composer.textComposer.text).toBe('');

      await typeText(composer, 'hello');

      const composition = await composer.compose();
      expect(composition?.message.text).toBe('/giphy hello');
    });

    it('sends a command activated with setCommand, as the Commands menu does', async () => {
      const { messageComposer: composer } = setup();

      composer.textComposer.setCommand(GIPHY);
      await typeText(composer, 'hello');

      const composition = await composer.compose();
      expect(composition?.message.text).toBe('/giphy hello');
    });

    it('keeps the active command when another command is typed', async () => {
      const { messageComposer: composer } = setup();

      await typeText(composer, '/giphy ');
      await typeText(composer, '/ban hello');

      expect(composer.textComposer.command?.name).toBe('giphy');
      expect(composer.textComposer.suggestions).toBeUndefined();
    });

    it('keeps the command in the draft', async () => {
      const { messageComposer: composer } = setup();

      composer.textComposer.setCommand(GIPHY);
      await typeText(composer, 'hello');

      const draft = await composer.composeDraft();
      expect(draft?.draft.text).toBe('/giphy hello');
    });

    it('activates and sends a command typed in upper case once', async () => {
      const { messageComposer: composer } = setup();

      await typeText(composer, '/GIPHY hello');

      expect(composer.textComposer.command?.name).toBe('giphy');
      expect(composer.textComposer.text).toBe('hello');

      const composition = await composer.compose();
      expect(composition?.message.text).toBe('/giphy hello');
    });

    it('does not inject the command again when the text already starts with it', async () => {
      const { messageComposer: composer } = setup();
      composer.textComposer.middlewareExecutor.remove(COMMAND_STRING_EXTRACTION_ID);

      await typeText(composer, '/giphy hello');

      expect(composer.textComposer.command?.name).toBe('giphy');
      expect(composer.textComposer.text).toBe('/giphy hello');

      const composition = await composer.compose();
      expect(composition?.message.text).toBe('/giphy hello');
      const draft = await composer.composeDraft();
      expect(draft?.draft.text).toBe('/giphy hello');
    });
  });

  describe('a command that takes no arguments', () => {
    it('is sent on its own when typed', async () => {
      const { messageComposer: composer } = setup();

      await typeText(composer, '/shrug ');

      expect(composer.textComposer.command?.name).toBe('shrug');
      expect(composer.textComposer.text).toBe('');
      expect(composer.hasSendableData).toBe(true);
      expect(composer.contentIsEmpty).toBe(false);

      const composition = await composer.compose();
      expect(composition?.message.text).toBe('/shrug ');
    });

    it('is sent on its own when activated with setCommand', async () => {
      const { messageComposer: composer } = setup();

      composer.textComposer.setCommand(SHRUG);

      expect(composer.hasSendableData).toBe(true);
      const composition = await composer.compose();
      expect(composition?.message.text).toBe('/shrug ');
      const draft = await composer.composeDraft();
      expect(draft?.draft.text).toBe('/shrug ');
    });

    it('deletes the draft when a typed command is cleared from an otherwise empty composer', async () => {
      const { messageComposer: composer } = setup();
      composer.registerSubscriptions();
      const deleteDraft = vi.spyOn(composer, 'deleteDraft').mockResolvedValue(undefined);
      await typeText(composer, '/shrug ');
      deleteDraft.mockClear();
      let changes = 0;
      const unsubscribe = composer.editingAuditState.subscribe((_, previous) => {
        if (previous) changes += 1;
      });

      composer.textComposer.clearCommand();

      expect(composer.compositionIsEmpty).toBe(true);
      expect(changes).toBeGreaterThan(0);
      expect(deleteDraft).toHaveBeenCalled();
      unsubscribe();
      composer.unregisterSubscriptions();
    });
  });

  describe('a command that takes arguments', () => {
    it('is not sent without text', async () => {
      const { messageComposer: composer } = setup();

      composer.textComposer.setCommand(GIPHY);

      expect(composer.hasSendableData).toBe(false);
      expect(composer.contentIsEmpty).toBe(true);
      expect(await composer.compose()).toBeUndefined();
    });
  });

  describe('textStartsWithCommand', () => {
    it.each([
      ['/giphy cats', true],
      ['/giphy', true],
      ['/giphy\ncats', true],
      ['/GIPHY cats', true],
      ['/giphycats', false],
      ['cats /giphy', false],
      ['', false],
    ])('%j starts with the giphy command: %s', (text, expected) => {
      expect(textStartsWithCommand(text, 'giphy')).toBe(expected);
    });
  });
});
