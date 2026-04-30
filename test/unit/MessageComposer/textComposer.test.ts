import { afterEach, describe, expect, it, vi } from 'vitest';
import { StreamChat } from '../../../src/client';
import {
  CompositionContext,
  MessageComposerEffect,
  MessageComposer,
} from '../../../src/messageComposer/messageComposer';
import { textIsEmpty } from '../../../src/messageComposer/textComposer';
import { createCommandStringExtractionMiddleware } from '../../../src/messageComposer/middleware/textComposer/commandStringExtraction';
import { DraftResponse, LocalMessage } from '../../../src/types';
import { logChatPromiseExecution } from '../../../src/utils';
import { TextComposerConfig } from '../../../src/messageComposer/configuration';
import { LinkPreviewStatus } from '../../../src/messageComposer/linkPreviewsManager';
import type { LocalAttachment } from '../../../src/messageComposer/types';

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
        command: null,
        mentionedUsers: [],
        text: '',
        selection: { start: 0, end: 0 },
      });
    });

    it('should initialize with custom config', () => {
      const defaultValue = 'XXX';
      const { messageComposer } = setup({ config: { defaultValue } });
      expect(messageComposer.textComposer.state.getLatestValue()).toEqual({
        command: null,
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
        command: null,
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

  describe('commands', () => {
    const attachment = {
      image_url: 'https://getstream.io/image.png',
      localMetadata: { id: 'attachment-1', uploadState: 'finished' },
      type: 'image',
    } as LocalAttachment;
    const linkPreview = {
      og_scrape_url: 'https://getstream.io',
      status: LinkPreviewStatus.LOADED,
      title: 'Stream',
      type: 'link',
    };

    const setChildComposerState = (messageComposer: MessageComposer) => {
      messageComposer.attachmentManager.state.partialNext({
        attachments: [attachment],
      });
      messageComposer.linkPreviewsManager.state.next({
        previews: new Map([[linkPreview.og_scrape_url, linkPreview]]),
      });
      messageComposer.locationComposer.state.next({
        location: {
          created_by_device_id: 'device-id',
          latitude: 1,
          longitude: 1,
          message_id: messageComposer.id,
        },
      });
      messageComposer.pollComposer.state.next({
        data: {
          ...messageComposer.pollComposer.state.getLatestValue().data,
          name: 'Favorite color?',
          options: [{ id: 'option-1', text: 'Blue' }],
        },
        errors: { name: 'Poll name error' },
      });
      messageComposer.customDataManager.setMessageData({
        priority: 'high',
      } as any);
      messageComposer.customDataManager.setCustomData({
        localOnly: true,
      } as any);
    };

    const expectChildComposerStateToBeCleared = (messageComposer: MessageComposer) => {
      expect(messageComposer.attachmentManager.attachments).toEqual([]);
      expect(messageComposer.linkPreviewsManager.previews.size).toBe(0);
      expect(messageComposer.locationComposer.location).toBeNull();
      expect(messageComposer.pollComposer.name).toBe('');
      expect(messageComposer.pollComposer.options).toEqual([
        { id: 'test-uuid', text: '' },
      ]);
      expect(messageComposer.customDataManager.customMessageData).toEqual({});
      expect(messageComposer.customDataManager.customComposerData).toEqual({});
    };

    const expectChildComposerStateToBeRestored = (messageComposer: MessageComposer) => {
      expect(messageComposer.attachmentManager.attachments).toEqual([attachment]);
      expect(messageComposer.linkPreviewsManager.previews).toEqual(
        new Map([[linkPreview.og_scrape_url, linkPreview]]),
      );
      expect(messageComposer.locationComposer.location).toEqual({
        created_by_device_id: 'device-id',
        latitude: 1,
        longitude: 1,
        message_id: messageComposer.id,
      });
      expect(messageComposer.pollComposer.name).toBe('Favorite color?');
      expect(messageComposer.pollComposer.options).toEqual([
        { id: 'option-1', text: 'Blue' },
      ]);
      expect(messageComposer.pollComposer.state.getLatestValue().errors).toEqual({
        name: 'Poll name error',
      });
      expect(messageComposer.customDataManager.customMessageData).toEqual({
        priority: 'high',
      });
      expect(messageComposer.customDataManager.customComposerData).toEqual({
        localOnly: true,
      });
    };

    it('clears child composer state when setting a command directly', () => {
      const {
        messageComposer,
        messageComposer: { textComposer },
      } = setup();
      textComposer.setText('Hello world');
      textComposer.setMentionedUsers([{ id: 'user-1' }]);
      setChildComposerState(messageComposer);

      textComposer.setCommand({ name: 'ban' });

      expect(textComposer.command?.name).toBe('ban');
      expect(textComposer.text).toBe('');
      expect(textComposer.selection).toEqual({ start: 0, end: 0 });
      expect(textComposer.mentionedUsers).toEqual([]);
      expectChildComposerStateToBeCleared(messageComposer);
    });

    it('resets attachments and link previews through initState when setting a command directly', () => {
      const {
        messageComposer,
        messageComposer: { textComposer },
        mockClient,
      } = setup();
      const attachmentInitStateSpy = vi.spyOn(
        messageComposer.attachmentManager,
        'initState',
      );
      const attachmentClearSpy = vi.spyOn(
        messageComposer.attachmentManager,
        'clearAttachments',
      );
      const linkPreviewsInitStateSpy = vi.spyOn(
        messageComposer.linkPreviewsManager,
        'initState',
      );
      const linkPreviewsCancelSpy = vi.spyOn(
        messageComposer.linkPreviewsManager,
        'cancelURLEnrichment',
      );
      const deleteUploadRecordSpy = vi.spyOn(
        mockClient.uploadManager,
        'deleteUploadRecord',
      );

      messageComposer.attachmentManager.state.partialNext({
        attachments: [
          {
            ...attachment,
            localMetadata: { id: 'attachment-1', uploadState: 'pending' },
          },
        ],
      });
      messageComposer.linkPreviewsManager.state.next({
        previews: new Map([[linkPreview.og_scrape_url, linkPreview]]),
      });

      textComposer.setCommand({ name: 'ban' });

      expect(attachmentInitStateSpy).toHaveBeenCalledTimes(1);
      expect(attachmentClearSpy).not.toHaveBeenCalled();
      expect(deleteUploadRecordSpy).toHaveBeenCalledWith('attachment-1');
      expect(linkPreviewsInitStateSpy).toHaveBeenCalledTimes(1);
      expect(linkPreviewsCancelSpy).toHaveBeenCalledTimes(1);
    });

    it('restores child composer state when canceling a direct command', () => {
      const {
        messageComposer,
        messageComposer: { textComposer },
      } = setup();
      textComposer.setText('Hello world');
      textComposer.setMentionedUsers([{ id: 'user-1' }]);
      textComposer.setSelection({ start: 5, end: 5 });
      setChildComposerState(messageComposer);

      textComposer.setCommand({ name: 'ban' });
      textComposer.setText('command args');
      textComposer.clearCommand();

      expect(textComposer.command).toBeNull();
      expect(textComposer.text).toBe('Hello world');
      expect(textComposer.selection).toEqual({ start: 5, end: 5 });
      expect(textComposer.mentionedUsers).toEqual([{ id: 'user-1' }]);
      expectChildComposerStateToBeRestored(messageComposer);
    });

    it('restores uploading attachments as failed after canceling a direct command', () => {
      const {
        messageComposer,
        messageComposer: { textComposer },
      } = setup();
      const uploadingAttachment = {
        ...attachment,
        localMetadata: {
          ...attachment.localMetadata,
          uploadProgress: 50,
          uploadState: 'uploading',
        },
      } as LocalAttachment;

      messageComposer.attachmentManager.state.partialNext({
        attachments: [uploadingAttachment],
      });

      textComposer.setCommand({ name: 'ban' });
      textComposer.clearCommand();

      expect(messageComposer.attachmentManager.attachments).toEqual([
        expect.objectContaining({
          localMetadata: expect.objectContaining({
            id: 'attachment-1',
            uploadProgress: undefined,
            uploadState: 'failed',
          }),
        }),
      ]);
    });

    it('allows middleware to opt out of snapshot clearing by removing the command activation effect', async () => {
      const {
        messageComposer,
        messageComposer: { textComposer },
        mockChannel,
      } = setup();
      mockChannel.getConfig = vi.fn().mockReturnValue({
        commands: [{ name: 'ban', description: 'Ban a user' }],
      });
      messageComposer.attachmentManager.state.partialNext({ attachments: [attachment] });
      textComposer.setMentionedUsers([{ id: 'user-1' }]);

      const removeCommandActivationEffect = (state: any) => ({
        ...state,
        effects: state.effects?.filter(
          (effect: any) =>
            !(effect.type === 'command.activate' && effect.command.name === 'ban'),
        ),
      });

      textComposer.middlewareExecutor.insert({
        middleware: [
          {
            handlers: {
              onChange: ({ next, state }) => next(removeCommandActivationEffect(state)),
              onSuggestionItemSelect: ({ next, state }) =>
                next(removeCommandActivationEffect(state)),
            },
            id: 'test/remove-command-activation-effect',
          },
          createCommandStringExtractionMiddleware() as any,
        ],
        position: { after: 'stream-io/text-composer/command-effects-middleware' },
        unique: true,
      });

      await textComposer.handleChange({
        text: '/ba',
        selection: { start: 3, end: 3 },
      });
      await textComposer.handleSelect({
        id: 'ban',
        name: 'ban',
        description: 'Ban a user',
      });

      expect(textComposer.command?.name).toBe('ban');
      expect(textComposer.text).toBe('');
      expect(textComposer.mentionedUsers).toEqual([{ id: 'user-1' }]);
      expect(messageComposer.attachmentManager.attachments).toEqual([attachment]);
      expect('effects' in textComposer.state.getLatestValue()).toBe(false);

      textComposer.setText('command args');
      textComposer.clearCommand();

      expect(textComposer.command).toBeNull();
      expect(textComposer.text).toBe('command args');
      expect(textComposer.mentionedUsers).toEqual([{ id: 'user-1' }]);
      expect(messageComposer.attachmentManager.attachments).toEqual([attachment]);
    });

    it('preserves command activation effects when custom middleware preserves state', async () => {
      const {
        messageComposer,
        messageComposer: { textComposer },
        mockChannel,
      } = setup();
      mockChannel.getConfig = vi.fn().mockReturnValue({
        commands: [{ name: 'ban', description: 'Ban a user' }],
      });
      messageComposer.attachmentManager.state.partialNext({ attachments: [attachment] });
      textComposer.setMentionedUsers([{ id: 'user-1' }]);

      let sawCommandActivationEffect = false;
      textComposer.middlewareExecutor.insert({
        middleware: [
          {
            handlers: {
              onChange: ({ forward }) => forward(),
              onSuggestionItemSelect: ({ next, state }) => {
                sawCommandActivationEffect = !!state.effects?.some(
                  (effect) => effect.type === 'command.activate',
                );
                return next({ ...state });
              },
            },
            id: 'test/preserve-effects',
          },
        ],
        position: { after: 'stream-io/text-composer/command-effects-middleware' },
        unique: true,
      });

      await textComposer.handleChange({
        text: '/ba',
        selection: { start: 3, end: 3 },
      });
      await textComposer.handleSelect({
        id: 'ban',
        name: 'ban',
        description: 'Ban a user',
      });

      expect(sawCommandActivationEffect).toBe(true);
      expect(textComposer.command?.name).toBe('ban');
      expect(textComposer.text).toBe('');
      expect(textComposer.mentionedUsers).toEqual([]);
      expect(messageComposer.attachmentManager.attachments).toEqual([]);
      expect('effects' in textComposer.state.getLatestValue()).toBe(false);
    });

    it('allows middleware before command effects to prevent effect attachment', async () => {
      const {
        messageComposer,
        messageComposer: { textComposer },
        mockChannel,
      } = setup();
      mockChannel.getConfig = vi.fn().mockReturnValue({
        commands: [{ name: 'ban', description: 'Ban a user' }],
      });
      textComposer.setText('Hello world');
      setChildComposerState(messageComposer);

      textComposer.middlewareExecutor.insert({
        middleware: [
          {
            handlers: {
              onChange: ({ forward }) => forward(),
              onSuggestionItemSelect: ({ next, state }) =>
                next({ ...state, command: null }),
            },
            id: 'test/prevent-command-effects',
          },
        ],
        position: { after: 'stream-io/text-composer/commands-middleware' },
        unique: true,
      });

      await textComposer.handleChange({
        text: '/ba',
        selection: { start: 3, end: 3 },
      });
      await textComposer.handleSelect({
        id: 'ban',
        name: 'ban',
        description: 'Ban a user',
      });

      expect(textComposer.command).toBeNull();
      expect(textComposer.text).toBe('/ban ');
      expectChildComposerStateToBeRestored(messageComposer);
    });

    it('allows effect handlers to override command activation behavior', () => {
      const {
        messageComposer,
        messageComposer: { textComposer },
      } = setup();
      const handler = vi.fn();
      textComposer.setText('Hello world');
      textComposer.setMentionedUsers([{ id: 'user-1' }]);
      textComposer.setSelection({ start: 5, end: 5 });
      messageComposer.attachmentManager.state.partialNext({ attachments: [attachment] });

      messageComposer.registerEffectHandler('command.activate', handler);
      textComposer.setCommand({ name: 'ban' });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          command: expect.objectContaining({ name: 'ban' }),
          type: 'command.activate',
        }),
        messageComposer,
      );
      expect(textComposer.command?.name).toBe('ban');
      expect(textComposer.text).toBe('Hello world');
      expect(textComposer.selection).toEqual({ start: 5, end: 5 });
      expect(textComposer.mentionedUsers).toEqual([{ id: 'user-1' }]);
      expect(messageComposer.attachmentManager.attachments).toEqual([attachment]);
    });

    it('allows custom effect handlers to be registered', () => {
      const { messageComposer } = setup();
      const handler = vi.fn();
      const effect: MessageComposerEffect = {
        type: 'test.effect',
        payload: 'test-payload',
      };

      messageComposer.registerEffectHandler('test.effect', handler);
      messageComposer.applyEffects([effect]);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith(effect, messageComposer);
    });

    it('overrides effect handlers registered for the same type', () => {
      const { messageComposer } = setup();
      const firstHandler = vi.fn();
      const secondHandler = vi.fn();
      const effect = {
        type: 'test.effect',
        payload: 'test-payload',
      };

      messageComposer.registerEffectHandler<typeof effect>('test.effect', firstHandler);
      messageComposer.registerEffectHandler<typeof effect>('test.effect', secondHandler);

      messageComposer.applyEffects([effect]);

      expect(firstHandler).not.toHaveBeenCalled();
      expect(secondHandler).toHaveBeenCalledTimes(1);
    });

    it('does not restore message composer state when clearing a command', () => {
      const {
        messageComposer,
        messageComposer: { textComposer },
      } = setup();

      textComposer.setCommand({ name: 'ban' });
      messageComposer.state.partialNext({
        draftId: 'draft-after-command-activation',
        showReplyInChannel: true,
      });
      textComposer.clearCommand();

      expect(messageComposer.state.getLatestValue()).toEqual(
        expect.objectContaining({
          draftId: 'draft-after-command-activation',
          showReplyInChannel: true,
        }),
      );
    });

    it('does not restore the slash query used to select a command', async () => {
      const {
        messageComposer,
        messageComposer: { textComposer },
      } = setup();
      messageComposer.attachmentManager.state.partialNext({ attachments: [attachment] });

      await textComposer.handleChange({
        text: '/ba',
        selection: { start: 3, end: 3 },
      });
      await textComposer.handleSelect({
        id: 'ban',
        name: 'ban',
        description: 'Ban a user',
      });
      textComposer.setText('command args');
      textComposer.clearCommand();

      expect(textComposer.command).toBeNull();
      expect(textComposer.text).toBe('');
      expect(textComposer.selection).toEqual({ start: 0, end: 0 });
      expect(messageComposer.attachmentManager.attachments).toEqual([attachment]);
    });

    it('only clears command on cancel when there is no restore snapshot', () => {
      const {
        messageComposer: { textComposer },
      } = setup();
      textComposer.state.partialNext({
        command: { name: 'ban' },
        mentionedUsers: [{ id: 'user-1' }],
        selection: { start: 12, end: 12 },
        text: 'command args',
      });

      textComposer.clearCommand();

      expect(textComposer.command).toBeNull();
      expect(textComposer.text).toBe('command args');
      expect(textComposer.selection).toEqual({ start: 12, end: 12 });
      expect(textComposer.mentionedUsers).toEqual([{ id: 'user-1' }]);
    });

    it('does nothing when clearing without an active command', () => {
      const {
        messageComposer,
        messageComposer: { textComposer },
      } = setup();
      textComposer.setText('draft text');
      const applyEffectsSpy = vi.spyOn(messageComposer, 'applyEffects');

      textComposer.clearCommand();

      expect(applyEffectsSpy).not.toHaveBeenCalled();
      expect(textComposer.command).toBeNull();
      expect(textComposer.text).toBe('draft text');
    });

    it('does not restore stale command snapshots after composer reinitialization', () => {
      const {
        messageComposer,
        messageComposer: { textComposer },
      } = setup();
      textComposer.setText('Hello world');
      textComposer.setMentionedUsers([{ id: 'user-1' }]);
      textComposer.setSelection({ start: 5, end: 5 });
      messageComposer.attachmentManager.state.partialNext({ attachments: [attachment] });

      textComposer.setCommand({ name: 'ban' });
      messageComposer.initState();
      textComposer.state.partialNext({
        command: { name: 'ban' },
        mentionedUsers: [],
        selection: { start: 12, end: 12 },
        text: 'command args',
      });
      textComposer.clearCommand();

      expect(textComposer.command).toBeNull();
      expect(textComposer.text).toBe('command args');
      expect(textComposer.selection).toEqual({ start: 12, end: 12 });
      expect(textComposer.mentionedUsers).toEqual([]);
      expect(messageComposer.attachmentManager.attachments).toEqual([]);
    });

    it('does not set commands while editing a message', () => {
      const message: LocalMessage = {
        id: 'test-message',
        type: 'regular',
        text: 'Hello world',
      };
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });

      textComposer.setCommand({ name: 'ban' });

      expect(textComposer.command).toBeUndefined();
      expect(textComposer.text).toBe('Hello world');
    });

    it('does not set moderation set commands with a quoted message', () => {
      const {
        messageComposer,
        messageComposer: { textComposer },
      } = setup();
      messageComposer.setQuotedMessage({
        id: 'quoted-message-id',
        text: 'quoted message',
      } as LocalMessage);

      textComposer.setCommand({ name: 'ban', set: 'moderation_set' });

      expect(textComposer.command).toBeNull();
      expect(textComposer.text).toBe('');
    });

    it('clears active command when editing starts', () => {
      const {
        messageComposer,
        messageComposer: { textComposer },
      } = setup();

      textComposer.setCommand({ name: 'ban' });
      expect(textComposer.command?.name).toBe('ban');

      messageComposer.setEditedMessage({
        id: 'edited-message-id',
        text: 'edited message',
        type: 'regular',
      } as LocalMessage);

      expect(textComposer.command).toBeNull();
      expect(textComposer.text).toBe('');
    });

    it('clears active moderation set command when setting a quoted message', () => {
      const {
        messageComposer,
        messageComposer: { textComposer },
      } = setup();

      textComposer.setCommand({ name: 'ban', set: 'moderation_set' });
      expect(textComposer.command?.name).toBe('ban');

      messageComposer.setQuotedMessage({
        id: 'quoted-message-id',
        text: 'quoted message',
      } as LocalMessage);

      expect(textComposer.command).toBeNull();
      expect(textComposer.text).toBe('');
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
    it('should not update the text when setting the same value', () => {
      const message: LocalMessage = {
        id: 'test-message',
        type: 'regular',
        text: 'Hello world',
      };
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message, config: { enabled: false } });
      const subscriber = vi.fn();
      const originalText = textComposer.text;
      textComposer.state.subscribeWithSelector(({ text }) => ({ text }), subscriber);
      expect(subscriber).toHaveBeenCalledWith({ text: originalText }, undefined);
      textComposer.setText(originalText);
      expect(textComposer.text).toBe(originalText);
      expect(subscriber).toHaveBeenCalledTimes(1);
    });
  });

  describe('setSelection', () => {
    const message: LocalMessage = {
      id: 'test-message',
      type: 'regular',
      text: 'Hello world',
    };
    it('should update the selection', () => {
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      const subscriber = vi.fn();
      textComposer.state.subscribeWithSelector(
        ({ selection }) => ({ selection }),
        subscriber,
      );
      expect(subscriber).toHaveBeenCalledWith(
        { selection: { end: message.text!.length, start: message.text!.length } },
        undefined,
      );
      expect(textComposer.selection).toEqual({
        end: message.text!.length,
        start: message.text!.length,
      });
      textComposer.setSelection({ end: 2, start: 2 });
      expect(textComposer.selection).toEqual({ end: 2, start: 2 });
      expect(subscriber).toHaveBeenCalledWith(
        { selection: { end: 2, start: 2 } },
        { selection: { end: message.text!.length, start: message.text!.length } },
      );
      expect(subscriber).toHaveBeenCalledTimes(2);
    });

    it('should not update the selection with the same value', () => {
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      const originalSelection = textComposer.selection;
      const subscriber = vi.fn();
      textComposer.state.subscribeWithSelector(
        ({ selection }) => ({ ...selection }),
        subscriber,
      );
      expect(subscriber).toHaveBeenCalledWith(originalSelection, undefined);
      expect(textComposer.selection).toEqual(originalSelection);
      textComposer.setSelection(originalSelection);
      expect(textComposer.selection).toEqual(originalSelection);
      expect(subscriber).toHaveBeenCalledTimes(1);
    });

    it('should not update the selection when text composer disabled', () => {
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message, config: { enabled: false } });
      const originalSelection = textComposer.selection;
      const subscriber = vi.fn();
      textComposer.state.subscribeWithSelector(
        ({ selection }) => ({ selection }),
        subscriber,
      );
      expect(subscriber).toHaveBeenCalledWith(
        { selection: { end: message.text!.length, start: message.text!.length } },
        undefined,
      );

      expect(textComposer.selection).toEqual(originalSelection);
      textComposer.setSelection({ end: 2, start: 2 });
      expect(textComposer.selection).toEqual(originalSelection);
      expect(subscriber).toHaveBeenCalledTimes(1);
    });
  });

  describe('insertText', () => {
    const message: LocalMessage = {
      id: 'test-message',
      type: 'regular',
      text: 'Hello world',
    };

    it('normalizes the Windows newline sequence "\\r\\n" to "\\n"', async () => {
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      await textComposer.insertText({
        text: ' a\r\nb\r\n',
        selection: { start: 5, end: 5 },
      });
      expect(textComposer.text).toBe('Hello a\nb\n world');
      expect(textComposer.selection).toStrictEqual({ start: 10, end: 10 });
    });

    it('should insert text at the specified selection', async () => {
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      await textComposer.insertText({
        text: ' beautiful',
        selection: { start: 5, end: 5 },
      });
      expect(textComposer.text).toBe('Hello beautiful world');
      expect(textComposer.selection).toStrictEqual({ start: 15, end: 15 });
    });

    it('should insert text at the end if no selection provided', async () => {
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      await textComposer.insertText({ text: '!' });
      expect(textComposer.text).toBe('Hello world!');
      expect(textComposer.selection).toStrictEqual({ start: 12, end: 12 });
    });

    it('should respect maxLengthOnEdit', async () => {
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
      await textComposer.insertText({ text: ' beautiful world' });
      expect(textComposer.text).toBe('Hello be');
      expect(textComposer.selection).toStrictEqual({ start: 8, end: 8 });
    });

    it('should handle empty text insertion', async () => {
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      await textComposer.insertText({ text: '', selection: { start: 5, end: 5 } });
      expect(textComposer.text).toBe('Hello world');
      expect(textComposer.selection).toStrictEqual({ start: 5, end: 5 });
    });

    it('should handle insertion at the start of text', async () => {
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      await textComposer.insertText({ text: 'Hi ', selection: { start: 0, end: 0 } });
      expect(textComposer.text).toBe('Hi Hello world');
      expect(textComposer.selection).toStrictEqual({ start: 3, end: 3 });
    });

    it('should handle insertion at end of text', async () => {
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      await textComposer.insertText({ text: '!', selection: { start: 11, end: 11 } });
      expect(textComposer.text).toBe('Hello world!');
      expect(textComposer.selection).toStrictEqual({ start: 12, end: 12 });
    });

    it('should handle insertion with multi-character selection', async () => {
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      await textComposer.insertText({ text: 'Hi', selection: { start: 0, end: 5 } });
      expect(textComposer.text).toBe('Hi world');
      expect(textComposer.selection).toStrictEqual({ start: 2, end: 2 });
    });

    it('should handle insertion with multi-character selection and maxLengthOnEdit restricting the size', async () => {
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
      await textComposer.insertText({
        text: insertedText,
        selection: { start: 7, end: 9 },
      });
      expect(textComposer.text).toBe('Hello wHi ');
      expect(textComposer.selection).toStrictEqual({ start: 10, end: 10 });
    });

    it('should not insert text if disabled', async () => {
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message, config: { enabled: false } });
      await textComposer.insertText({
        text: ' beautiful',
        selection: { start: 5, end: 5 },
      });
      expect(textComposer.text).toBe(message.text);
      expect(textComposer.selection).toStrictEqual({ start: 11, end: 11 });
    });

    it('should reflect pasting of command trigger with partial command name', async () => {
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      await textComposer.insertText({ text: '/giph', selection: { start: 0, end: 11 } });
      expect(textComposer.text).toBe('/giph');
      expect(textComposer.suggestions).toBeDefined();
      expect(textComposer.selection).toStrictEqual({ start: 5, end: 5 });
    });
  });

  describe('wrapSelection', () => {
    const message: LocalMessage = {
      id: 'test-message',
      type: 'regular',
      text: 'Hello world',
    };

    it('should wrap selection from both sides', () => {
      const selection = { start: 0, end: 5 };
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      textComposer.wrapSelection({ head: '**', tail: '**', selection });
      expect(textComposer.text).toBe('**Hello** world');
      expect(textComposer.selection).toEqual({ start: 2, end: 7 });
    });

    it('should wrap selection from the head side', () => {
      const selection = { start: 0, end: 5 };
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      textComposer.wrapSelection({ head: '**', selection });
      expect(textComposer.text).toBe('**Hello world');
      expect(textComposer.selection).toEqual({ start: 2, end: 7 });
    });

    it('should wrap selection from the tail side', () => {
      const selection = { start: 0, end: 5 };
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      textComposer.wrapSelection({ tail: '**', selection });
      expect(textComposer.text).toBe('Hello** world');
      expect(textComposer.selection).toEqual({ start: 0, end: 5 });
    });

    it('should wrap cursor', () => {
      const selection = { start: 5, end: 5 };
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      textComposer.wrapSelection({ head: '**', tail: '**', selection });
      expect(textComposer.text).toBe('Hello**** world');
      expect(textComposer.selection).toEqual({ start: 7, end: 7 });
    });

    it('should avoid changes if text composition is disabled', () => {
      const selection = { start: 5, end: 5 };
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message, config: { enabled: false } });
      const initialSelection = textComposer.selection;
      textComposer.wrapSelection({ head: '**', tail: '**', selection });
      expect(textComposer.text).toBe(message.text);
      expect(selection).not.toEqual(initialSelection);
      expect(textComposer.selection).toEqual(initialSelection);
    });

    it('should use current selection if custom not provided', () => {
      const initialSelection = { start: 2, end: 3 };
      const {
        messageComposer: { textComposer },
      } = setup({ composition: message });
      textComposer.setSelection(initialSelection);
      textComposer.wrapSelection({ head: '**', tail: '**' });
      expect(textComposer.text).toBe('He**l**lo world');
      expect(textComposer.selection).toEqual({ start: 4, end: 5 });
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
