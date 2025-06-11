import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Channel,
  LocalMessage,
  MessageComposerConfig,
  StreamChat,
  Thread,
} from '../../../src';
import { DeepPartial } from '../../../src/types.utility';
import { MessageComposer } from '../../../src/messageComposer/messageComposer';
import { StateStore } from '../../../src/store';
import { DraftResponse, MessageResponse } from '../../../src/types';

const generateUuidV4Output = 'test-uuid';
// Mock dependencies
vi.mock('../../../src/utils', () => ({
  axiosParamsSerializer: vi.fn(),
  isFunction: vi.fn(),
  isString: vi.fn(),
  isObject: vi.fn(),
  isArray: vi.fn(),
  isDate: vi.fn(),
  isNumber: vi.fn(),
  debounce: vi.fn().mockImplementation((fn) => fn),
  generateUUIDv4: vi.fn().mockReturnValue('test-uuid'),
  isLocalMessage: vi.fn().mockReturnValue(true),
  formatMessage: vi.fn().mockImplementation((msg) => msg),
  randomId: vi.fn().mockReturnValue('test-uuid'),
  throttle: vi.fn().mockImplementation((fn) => fn),
}));

vi.mock('../../../src/messageComposer/attachmentManager', () => ({
  AttachmentManager: vi.fn().mockImplementation(() => ({
    state: new StateStore({ attachments: [] }),
    initState: vi.fn(),
    clear: vi.fn(),
    attachments: [],
  })),
}));

vi.mock('../../../src/messageComposer/pollComposer', () => ({
  PollComposer: vi.fn().mockImplementation(() => ({
    state: new StateStore({ poll: null }),
    initState: vi.fn(),
    clear: vi.fn(),
    compose: vi.fn(),
  })),
}));

vi.mock('../../../src/messageComposer/middleware/messageComposer', () => ({
  MessageComposerMiddlewareExecutor: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({ state: {} }),
  })),
  MessageDraftComposerMiddlewareExecutor: vi.fn().mockImplementation(() => ({
    execute: vi.fn().mockResolvedValue({ state: {} }),
  })),
}));

const quotedMessage = {
  id: 'quoted-message-id',
  type: 'regular' as const,
  created_at: new Date(),
  deleted_at: null,
  pinned_at: null,
  updated_at: new Date(),
  status: 'received',
  text: 'Quoted message',
  user: { id: 'user-id', name: 'User Name' },
};

const user = { id: 'user-id', name: 'User Name' };

const getThread = (channel: Channel, client: StreamChat, threadId: string) =>
  new Thread({
    client,
    threadData: {
      parent_message_id: threadId,
      parent_message: {
        id: threadId,
        text: 'Test message',
        type: 'regular' as const,
        user,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      channel: {
        id: channel.id,
        type: channel.type,
        cid: channel.cid,
        disabled: false,
        frozen: false,
      },
      title: 'Test Thread',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      channel_cid: channel.cid,
      latest_replies: [],
      thread_participants: [],
      created_by_user_id: user.id,
    },
  });

const setup = ({
  composition,
  compositionContext,
  config,
}: {
  composition?: LocalMessage | DraftResponse | MessageResponse | undefined;
  compositionContext?: Channel | Thread | LocalMessage | undefined;
  config?: DeepPartial<MessageComposerConfig>;
} = {}) => {
  const mockClient = new StreamChat('test-api-key');
  mockClient.user = user;
  mockClient.userID = user.id;
  // Create a proper Channel instance with only the necessary attributes mocked
  const mockChannel = new Channel(mockClient, 'messaging', 'test-channel-id', {
    id: 'test-channel-id',
    type: 'messaging',
    cid: 'messaging:test-channel-id',
  });

  // Mock the getClient method
  vi.spyOn(mockChannel, 'getClient').mockReturnValue(mockClient);

  const messageComposer = new MessageComposer({
    client: mockClient,
    compositionContext: compositionContext || mockChannel,
    composition,
    config,
  });

  return { mockClient, mockChannel, messageComposer };
};

describe('MessageComposer', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with default values', () => {
      const { messageComposer, mockChannel } = setup();
      expect(messageComposer).toBeDefined();
      expect(messageComposer.channel).toBe(mockChannel);
      expect(messageComposer.config).toBeDefined();
      expect(messageComposer.attachmentManager).toBeDefined();
      expect(messageComposer.linkPreviewsManager).toBeDefined();
      expect(messageComposer.textComposer).toBeDefined();
      expect(messageComposer.pollComposer).toBeDefined();
      expect(messageComposer.customDataManager).toBeDefined();
    });

    it('should initialize with custom config', () => {
      const customConfig = {
        publishTypingEvents: false,
        text: {
          maxLengthOnEdit: 1000,
        },
      };

      const { messageComposer } = setup({ config: customConfig });

      expect(messageComposer.config.publishTypingEvents).toBe(false);
      expect(messageComposer.config.text?.maxLengthOnEdit).toBe(1000);
    });

    it('should initialize with message', () => {
      const message = {
        id: 'test-message-id',
        text: 'Hello world',
        attachments: [],
        mentioned_users: [],
      };

      const { messageComposer } = setup({ composition: message });

      expect(messageComposer.editedMessage).toBeDefined();
      expect(messageComposer.id).toBe('test-message-id');
    });

    it('should initialize with draft message', () => {
      const draftMessage: DraftResponse = {
        message: {
          id: 'test-draft-id',
          text: 'Draft message',
          attachments: [],
          mentioned_users: [],
        },
        channel_cid: 'test-channel-id',
        created_at: new Date().toISOString(),
      };

      const { messageComposer } = setup({ composition: draftMessage });

      expect(messageComposer.draftId).toBe(draftMessage.message.id);
      expect(messageComposer.id).not.toBe(draftMessage.message.id);
    });
  });

  describe('static methods', () => {
    it('should evaluate context type', () => {
      const { mockChannel, mockClient } = setup();
      expect(MessageComposer.evaluateContextType(mockChannel)).toBe('channel');

      const mockThread = getThread(mockChannel, mockClient, 'test-thread-id');

      expect(MessageComposer.evaluateContextType(mockThread)).toBe('thread');

      const mockReplyInLegacyThread = {
        id: 'test-message-id',
        legacyThreadId: 'test-thread-id',
        text: 'Hello world',
      };
      expect(MessageComposer.evaluateContextType(mockReplyInLegacyThread as any)).toBe(
        'legacy_thread',
      );

      const mockMessage = {
        id: 'test-message-id',
      };
      expect(MessageComposer.evaluateContextType(mockMessage as any)).toBe('message');
    });

    it('should construct tag', () => {
      const { mockChannel, mockClient } = setup();
      expect(MessageComposer.constructTag(mockChannel)).toBe('channel_test-channel-id');

      const mockThread = getThread(mockChannel, mockClient, 'test-thread-id');
      expect(MessageComposer.constructTag(mockThread as any)).toBe(
        'thread_test-thread-id',
      );

      const mockLegacyThread = {
        cid: mockChannel.cid,
        id: 'test-message-id',
        legacyThreadId: 'test-legacy-thread-id',
      };
      expect(MessageComposer.constructTag(mockLegacyThread as any)).toBe(
        'legacy_thread_test-message-id',
      );

      const mockMessage = {
        cid: mockChannel.cid,
        id: 'test-message-id',
      };
      expect(MessageComposer.constructTag(mockMessage as any)).toBe(
        'message_test-message-id',
      );
    });

    it('should generate id', () => {
      expect(MessageComposer.generateId()).toBe(generateUuidV4Output);
    });
  });

  describe('getters', () => {
    it('should return the correct values from state', () => {
      const { messageComposer } = setup();
      expect(messageComposer.threadId).toBeNull();
      messageComposer.state.next({
        id: 'test-id',
        quotedMessage,
        pollId: 'test-poll-id',
        draftId: 'test-draft-id',
      });

      expect(messageComposer.id).toBe('test-id');
      expect(messageComposer.quotedMessage).toEqual({
        id: 'quoted-message-id',
        type: 'regular',
        created_at: expect.any(Date),
        deleted_at: null,
        pinned_at: null,
        updated_at: expect.any(Date),
        status: 'received',
        text: 'Quoted message',
        user: { id: 'user-id', name: 'User Name' },
      });
      expect(messageComposer.pollId).toBe('test-poll-id');
      expect(messageComposer.draftId).toBe('test-draft-id');
    });

    it('should return the correct context type', () => {
      const { messageComposer } = setup();
      expect(messageComposer.contextType).toBe('channel');
    });

    it('should return the correct tag', () => {
      const { messageComposer } = setup();
      expect(messageComposer.tag).toBe('channel_test-channel-id');
    });

    it('should return the correct thread id', () => {
      const { mockChannel, mockClient } = setup();
      const mockThread = getThread(mockChannel, mockClient, 'test-thread-id');
      const { messageComposer: threadComposer } = setup({
        compositionContext: mockThread,
      });
      expect(threadComposer.threadId).toBe('test-thread-id');

      const mockLegacyThread = {
        cid: mockChannel.cid,
        id: 'test-message-id',
        legacyThreadId: 'test-legacy-thread-id',
      };
      const { messageComposer: legacyThreadComposer } = setup({
        compositionContext: mockLegacyThread as any,
      });
      expect(legacyThreadComposer.threadId).toBe('test-legacy-thread-id');

      const mockMessage = {
        cid: mockChannel.cid,
        id: 'test-message-id',
        parent_id: 'test-parent-id',
      };
      const { messageComposer: messageComposer } = setup({
        compositionContext: mockMessage as any,
      });
      expect(messageComposer.threadId).toBe('test-parent-id');
    });

    it('should return the correct client', () => {
      const { messageComposer, mockClient } = setup();
      expect(messageComposer.client).toBe(mockClient);
    });

    it('should return the correct last change', () => {
      const { messageComposer } = setup();
      messageComposer.editingAuditState.next({
        lastChange: {
          draftUpdate: 123456789,
          stateUpdate: 987654321,
        },
      });

      expect(messageComposer.lastChange).toEqual({
        draftUpdate: 123456789,
        stateUpdate: 987654321,
      });
    });

    it('should return the correct lastChangeOriginIsLocal', () => {
      const { messageComposer } = setup();
      messageComposer.editingAuditState.next({
        lastChange: {
          draftUpdate: 123456789,
          stateUpdate: new Date().getTime(),
        },
      });

      expect(messageComposer.lastChangeOriginIsLocal).toBe(true);
    });

    it('should return the correct compositionIsEmpty', () => {
      const { messageComposer } = setup();
      const spyTextComposerTextIsEmpty = vi
        .spyOn(messageComposer.textComposer, 'textIsEmpty', 'get')
        .mockReturnValueOnce(true)
        .mockReturnValueOnce(false);
      // First case - empty composition
      messageComposer.textComposer.state.partialNext({
        text: '',
        mentionedUsers: [],
        selection: { start: 0, end: 0 },
      });
      expect(messageComposer.compositionIsEmpty).toBe(true);

      // Second case - non-empty composition
      messageComposer.textComposer.state.partialNext({
        text: 'Hello world',
        mentionedUsers: [],
        selection: { start: 0, end: 0 },
      });
      expect(messageComposer.compositionIsEmpty).toBe(false);
      spyTextComposerTextIsEmpty.mockRestore();
    });
  });

  describe('methods', () => {
    it('should initialize state', () => {
      const { messageComposer } = setup();
      messageComposer.initState();
      expect(messageComposer.state.getLatestValue()).toEqual({
        id: generateUuidV4Output,
        pollId: null,
        quotedMessage: null,
        draftId: null,
      });
    });

    it('should initialize state with composition', () => {
      const { messageComposer } = setup();
      const message = {
        id: 'test-message-id',
        text: 'Hello world',
        attachments: [],
        mentioned_users: [],
      };

      messageComposer.initState({ composition: message });
      expect(messageComposer.state.getLatestValue()).toEqual({
        id: 'test-message-id',
        pollId: null,
        quotedMessage: null,
        draftId: null,
      });
    });

    it('should initialize editing audit state', () => {
      const { messageComposer } = setup();

      messageComposer.initEditingAuditState();

      const result = messageComposer.editingAuditState.getLatestValue();
      expect(result).toEqual({
        lastChange: {
          draftUpdate: null,
          stateUpdate: expect.any(Number),
        },
      });
    });

    it('should register subscriptions', () => {
      const { messageComposer } = setup();
      const unsubscribeFunctions = messageComposer[
        'unsubscribeFunctions'
      ] as unknown as Set<() => void>;

      messageComposer.registerSubscriptions();

      expect(unsubscribeFunctions.size).toBeGreaterThan(0);
    });

    it('should unregister subscriptions', () => {
      const { messageComposer } = setup();
      const unsubscribeFunctions = messageComposer[
        'unsubscribeFunctions'
      ] as unknown as Set<() => void>;
      const unsubscribeFn = vi.fn();
      unsubscribeFunctions.add(unsubscribeFn);

      messageComposer.unregisterSubscriptions();

      expect(unsubscribeFn).toHaveBeenCalled();
      expect(unsubscribeFunctions.size).toBe(0);
    });

    it('should set quoted message', () => {
      const { messageComposer } = setup();
      const quotedMessage = {
        id: 'quoted-message-id',
        type: 'regular',
        text: 'Quoted message',
        attachments: [],
        mentioned_users: [],
      };

      messageComposer.setQuotedMessage(quotedMessage);
      expect(messageComposer.state.getLatestValue().quotedMessage).toEqual(quotedMessage);
    });

    it('should clear state', () => {
      const { messageComposer } = setup();
      const spyAttachmentManager = vi.spyOn(
        messageComposer.attachmentManager,
        'initState',
      );
      const spyLinkPreviewsManager = vi.spyOn(
        messageComposer.linkPreviewsManager,
        'initState',
      );
      const spyTextComposer = vi.spyOn(messageComposer.textComposer, 'initState');
      const spyPollComposer = vi.spyOn(messageComposer.pollComposer, 'initState');
      const spyCustomDataManager = vi.spyOn(
        messageComposer.customDataManager,
        'initState',
      );
      const spyInitState = vi.spyOn(messageComposer, 'initState');

      messageComposer.clear();

      expect(spyAttachmentManager).toHaveBeenCalled();
      expect(spyLinkPreviewsManager).toHaveBeenCalled();
      expect(spyTextComposer).toHaveBeenCalled();
      expect(spyPollComposer).toHaveBeenCalled();
      expect(spyCustomDataManager).toHaveBeenCalled();
      expect(spyInitState).toHaveBeenCalled();
    });

    it('should restore state from edited message if available', () => {
      const editedMessage = {
        id: 'edited-message-id',
        type: 'regular',
        text: 'Edited message',
        poll_id: 'test-poll-id',
        attachments: [],
        mentioned_users: [],
      };
      const { messageComposer } = setup({ composition: editedMessage });
      messageComposer.state.partialNext({
        id: 'edited-message-id',
        pollId: null,
        draftId: null,
      });
      messageComposer.restore();

      expect(messageComposer.state.getLatestValue()).toEqual({
        id: 'edited-message-id',
        pollId: 'test-poll-id',
        quotedMessage: null,
        draftId: null,
      });
    });

    it('should clear state if no edited message available', () => {
      const { messageComposer } = setup();
      const spyClear = vi.spyOn(messageComposer, 'clear');

      messageComposer.restore();

      expect(spyClear).toHaveBeenCalled();
    });

    it('should compose message', async () => {
      const { messageComposer } = setup();
      const mockResult = {
        state: {
          message: {
            id: 'test-message-id',
            text: 'Test message',
          },
        },
        status: '',
      };

      const spyExecute = vi.spyOn(
        messageComposer.compositionMiddlewareExecutor,
        'execute',
      );
      spyExecute.mockResolvedValue(mockResult);

      const result = await messageComposer.compose();

      expect(spyExecute).toHaveBeenCalledWith({
        eventName: 'compose',
        initialValue: expect.any(Object),
      });
      expect(result).toEqual(mockResult.state);
    });

    it('should return undefined when compose middleware returns discard status', async () => {
      const { messageComposer } = setup();
      const mockResult = {
        state: {},
        status: 'discard',
      };

      const spyExecute = vi.spyOn(
        messageComposer.compositionMiddlewareExecutor,
        'execute',
      );
      spyExecute.mockResolvedValue(mockResult);

      const result = await messageComposer.compose();

      expect(spyExecute).toHaveBeenCalledWith({
        eventName: 'compose',
        initialValue: expect.any(Object),
      });
      expect(result).toBeUndefined();
    });

    it('should compose draft', async () => {
      const { messageComposer } = setup();
      const mockResult = {
        state: {
          draft: {
            id: 'test-draft-id',
            text: 'Test draft',
          },
        },
        status: '',
      };

      const spyExecute = vi.spyOn(
        messageComposer.draftCompositionMiddlewareExecutor,
        'execute',
      );
      spyExecute.mockResolvedValue(mockResult);

      const result = await messageComposer.composeDraft();

      expect(spyExecute).toHaveBeenCalledWith({
        eventName: 'compose',
        initialValue: expect.any(Object),
      });
      expect(result).toEqual(mockResult.state);
    });

    it('should return undefined when draft compose middleware returns discard status', async () => {
      const { messageComposer } = setup();
      const mockResult = {
        state: {},
        status: 'discard',
      };

      const spyExecute = vi.spyOn(
        messageComposer.draftCompositionMiddlewareExecutor,
        'execute',
      );
      spyExecute.mockResolvedValue(mockResult);

      const result = await messageComposer.composeDraft();

      expect(spyExecute).toHaveBeenCalledWith({
        eventName: 'compose',
        initialValue: expect.any(Object),
      });
      expect(result).toBeUndefined();
    });

    it('should create draft', async () => {
      const { messageComposer, mockChannel } = setup({
        config: { drafts: { enabled: true } },
      });
      const mockDraft = {
        id: 'test-draft-id',
        text: 'Test draft',
      };

      const spyComposeDraft = vi.spyOn(messageComposer, 'composeDraft');
      spyComposeDraft.mockResolvedValue({ draft: mockDraft });

      const spyCreateDraft = vi.spyOn(mockChannel, 'createDraft');
      spyCreateDraft.mockResolvedValue({ draft: mockDraft });

      const spyLogDraftUpdateTimestamp = vi.spyOn(
        messageComposer,
        'logDraftUpdateTimestamp',
      );

      await messageComposer.createDraft();

      expect(spyComposeDraft).toHaveBeenCalled();
      expect(spyCreateDraft).toHaveBeenCalledWith(mockDraft);
      expect(spyLogDraftUpdateTimestamp).toHaveBeenCalled();
      expect(messageComposer.state.getLatestValue().draftId).toBe('test-draft-id');
    });

    it('should not create draft if edited message exists', async () => {
      const editedMessage = {
        id: 'edited-message-id',
        type: 'regular',
        text: 'Edited message',
        attachments: [],
        mentioned_users: [],
      };

      const { messageComposer } = setup({ composition: editedMessage });

      const spyComposeDraft = vi.spyOn(messageComposer, 'composeDraft');
      await messageComposer.createDraft();

      expect(spyComposeDraft).not.toHaveBeenCalled();
    });

    it('should delete draft', async () => {
      const { messageComposer, mockChannel } = setup({
        config: { drafts: { enabled: true } },
      });
      const draftId = 'test-draft-id';

      messageComposer.state.next({
        id: '',
        pollId: null,
        quotedMessage: null,
        draftId,
      });

      const spyChannelDeleteDraft = vi.spyOn(mockChannel, 'deleteDraft');
      spyChannelDeleteDraft.mockResolvedValue({});

      const spyLogDraftUpdateTimestamp = vi.spyOn(
        messageComposer,
        'logDraftUpdateTimestamp',
      );

      await messageComposer.deleteDraft();

      expect(spyChannelDeleteDraft).toHaveBeenCalledWith({ parent_id: undefined });
      expect(spyLogDraftUpdateTimestamp).toHaveBeenCalled();
      expect(messageComposer.state.getLatestValue().draftId).toBeNull();
    });

    it('should not delete draft if no draftId exists', async () => {
      const { messageComposer, mockChannel } = setup();
      const spyChannelDeleteDraft = vi.spyOn(mockChannel, 'deleteDraft');

      await messageComposer.deleteDraft();

      expect(spyChannelDeleteDraft).not.toHaveBeenCalled();
    });

    it('should create a poll', async () => {
      const { messageComposer, mockClient } = setup();
      const mockPoll = {
        id: 'test-poll-id',
        name: 'Test Poll',
        options: [],
      };

      const spyCompose = vi.spyOn(messageComposer.pollComposer, 'compose');
      spyCompose.mockResolvedValue({ data: mockPoll });

      const spyCreatePoll = vi.spyOn(mockClient, 'createPoll');
      spyCreatePoll.mockResolvedValue({ poll: mockPoll });

      await messageComposer.createPoll();

      expect(spyCompose).toHaveBeenCalled();
      expect(spyCreatePoll).toHaveBeenCalledWith(mockPoll);
      expect(messageComposer.pollComposer.initState).not.toHaveBeenCalled();
      expect(messageComposer.state.getLatestValue().pollId).toBe('test-poll-id');
    });

    it('should not create poll if compose returns no data', async () => {
      const { messageComposer, mockClient } = setup();
      const spyCompose = vi.spyOn(messageComposer.pollComposer, 'compose');
      spyCompose.mockResolvedValue({ data: {} });

      const spyCreatePoll = vi.spyOn(mockClient, 'createPoll');

      await messageComposer.createPoll();

      expect(spyCompose).toHaveBeenCalled();
      expect(spyCreatePoll).not.toHaveBeenCalled();
    });

    it('should handle poll creation error', async () => {
      const { messageComposer, mockClient } = setup();
      const mockPoll = {
        id: 'test-poll-id',
        name: 'Test Poll',
        options: [],
      };

      const spyCompose = vi.spyOn(messageComposer.pollComposer, 'compose');
      spyCompose.mockResolvedValue({ data: mockPoll });

      const spyCreatePoll = vi.spyOn(mockClient, 'createPoll');
      spyCreatePoll.mockRejectedValue(new Error('Failed to create poll'));

      const spyAddNotification = vi.spyOn(mockClient.notifications, 'add');

      await expect(messageComposer.createPoll()).rejects.toThrow('Failed to create poll');
      expect(spyAddNotification).toHaveBeenCalledWith({
        message: 'Failed to create the poll',
        origin: {
          emitter: 'MessageComposer',
          context: { composer: messageComposer },
        },
        options: {
          type: 'api:poll:create:failed',
          metadata: {
            reason: 'Failed to create poll',
          },
          originalError: expect.any(Error),
          severity: 'error',
        },
      });
    });
  });

  describe('subscriptions', () => {
    describe('subscribeMessageUpdated', () => {
      it('should update state when message.updated event is received', () => {
        const { messageComposer, mockClient } = setup();
        const updatedMessage = {
          id: messageComposer.id,
          poll_id: 'test-poll-id',
        };

        messageComposer.registerSubscriptions();
        mockClient.dispatchEvent({ type: 'message.updated', message: updatedMessage });

        expect(messageComposer.state.getLatestValue().pollId).toEqual(
          updatedMessage.poll_id,
        );
      });

      it('should update quoted message when quoted message is updated', () => {
        const { messageComposer, mockClient } = setup();
        const quotedMessage = {
          id: 'quoted-message-id',
          text: 'Quoted message',
          attachments: [],
          mentioned_users: [],
        };

        messageComposer.setQuotedMessage(quotedMessage);
        messageComposer.registerSubscriptions();
        mockClient.dispatchEvent({
          type: 'message.updated',
          message: { ...quotedMessage, text: 'Updated quoted message' },
        });

        expect(messageComposer.state.getLatestValue().quotedMessage?.text).toBe(
          'Updated quoted message',
        );
      });
    });

    describe('subscribeMessageComposerSetupStateChange', () => {
      it('should apply modifications when setup state changes', () => {
        const { messageComposer, mockClient } = setup();
        const mockModifications = vi.fn();

        messageComposer.registerSubscriptions();
        mockClient._messageComposerSetupState.next({
          setupFunction: mockModifications,
        });

        expect(mockModifications).toHaveBeenCalledWith({ composer: messageComposer });
      });
    });

    describe('subscribeMessageDeleted', () => {
      it('should clear state when message is deleted', () => {
        const { messageComposer, mockClient } = setup();
        const message = {
          id: messageComposer.id,
          text: 'Test message',
          attachments: [],
          mentioned_users: [],
        };

        messageComposer.initState({ composition: message });
        messageComposer.registerSubscriptions();
        mockClient.dispatchEvent({ type: 'message.deleted', message });

        expect(messageComposer.state.getLatestValue().id).toBe(generateUuidV4Output);
      });

      it('should clear quoted message when quoted message is deleted', () => {
        const { messageComposer, mockClient } = setup();
        const quotedMessage = {
          id: 'quoted-message-id',
          text: 'Quoted message',
          attachments: [],
          mentioned_users: [],
        };

        messageComposer.setQuotedMessage(quotedMessage);
        messageComposer.registerSubscriptions();
        mockClient.dispatchEvent({ type: 'message.deleted', message: quotedMessage });

        expect(messageComposer.state.getLatestValue().quotedMessage).toBeNull();
      });
    });

    describe('subscribeDraftUpdated', () => {
      it('should update state when draft is updated', () => {
        const { messageComposer, mockClient } = setup({
          config: { drafts: { enabled: true } },
        });
        const draft = {
          message: {
            id: 'test-draft-id',
            text: 'Draft message',
            attachments: [],
            mentioned_users: [],
          },
          channel_cid: 'messaging:test-channel-id',
        };

        messageComposer.registerSubscriptions();
        mockClient.dispatchEvent({ type: 'draft.updated', draft });

        expect(messageComposer.state.getLatestValue().draftId).toBe('test-draft-id');
      });
    });

    describe('subscribeDraftDeleted', () => {
      it('should clear state when draft is deleted and composition is empty', () => {
        const { messageComposer, mockChannel, mockClient } = setup({
          config: { drafts: { enabled: true } },
        });
        const draft = {
          message: {
            id: messageComposer.id,
          },
          channel_cid: mockChannel.cid,
        };

        messageComposer.initState({ composition: draft });
        Object.defineProperty(messageComposer.textComposer, 'textIsEmpty', {
          get: () => false,
        });
        messageComposer.registerSubscriptions();
        mockClient.dispatchEvent({ type: 'draft.deleted', draft });

        expect(messageComposer.state.getLatestValue().draftId).toBeNull();
      });
    });

    describe('subscribeTextComposerStateChanged', () => {
      it('should log state update timestamp when text changes', () => {
        const { messageComposer } = setup();
        const spy = vi.spyOn(messageComposer, 'logStateUpdateTimestamp');

        messageComposer.registerSubscriptions();
        messageComposer.textComposer.state.next({
          text: 'New text',
          mentionedUsers: [],
          selection: { start: 0, end: 0 },
        });

        expect(spy).toHaveBeenCalled();
      });

      it('should find and enrich URLs when text changes and link previews are enabled', () => {
        const { mockChannel, messageComposer } = setup({
          config: { linkPreviews: { enabled: true } },
        });
        mockChannel.getConfig = vi
          .fn()
          .mockImplementation(() => ({ url_enrichment: true }));
        const spy = vi.spyOn(messageComposer.linkPreviewsManager, 'findAndEnrichUrls');

        messageComposer.registerSubscriptions();
        Object.defineProperty(messageComposer.textComposer, 'textIsEmpty', {
          get: () => false,
        });
        messageComposer.textComposer.state.next({
          text: 'https://example.com',
          mentionedUsers: [],
          selection: { start: 0, end: 0 },
        });

        expect(spy).toHaveBeenCalledWith('https://example.com');
      });
    });

    describe('subscribeAttachmentManagerStateChanged', () => {
      it('should log state update timestamp when attachments change', () => {
        const { messageComposer } = setup();
        const spy = vi.spyOn(messageComposer, 'logStateUpdateTimestamp');

        messageComposer.registerSubscriptions();
        messageComposer.attachmentManager.state.next({
          attachments: [{ id: 'new-attachment' }],
        });

        expect(spy).toHaveBeenCalled();
      });
    });

    describe('subscribeLinkPreviewsManagerStateChanged', () => {
      it('should log state update timestamp when link previews change', () => {
        const { messageComposer } = setup();
        const spy = vi.spyOn(messageComposer, 'logStateUpdateTimestamp');

        messageComposer.registerSubscriptions();
        messageComposer.linkPreviewsManager.state.next({
          previews: new Map([['https://example.com', { data: {}, status: 'loaded' }]]),
        });

        expect(spy).toHaveBeenCalled();
      });
    });

    describe('subscribePollComposerStateChanged', () => {
      it('should log state update timestamp when poll data changes', () => {
        const { messageComposer } = setup();
        const spy = vi.spyOn(messageComposer, 'logStateUpdateTimestamp');

        messageComposer.registerSubscriptions();
        messageComposer.pollComposer.state.next({
          data: {
            id: 'new-poll-id',
            name: 'New Poll',
            options: [],
            allow_answers: true,
            allow_user_suggested_options: false,
            description: '',
            enforce_unique_vote: false,
            is_closed: false,
            max_votes_allowed: '1',
            user_id: 'user-id',
            voting_visibility: 'public',
          },
        });

        expect(spy).toHaveBeenCalled();
      });
    });

    describe('subscribeCustomDataManagerStateChanged', () => {
      it('should log state update timestamp when custom data changes', () => {
        const { messageComposer } = setup();
        const spy = vi.spyOn(messageComposer, 'logStateUpdateTimestamp');

        messageComposer.registerSubscriptions();
        messageComposer.customDataManager.state.next({
          data: {
            field1: 'value1',
          },
        });

        expect(spy).toHaveBeenCalled();
      });
    });

    describe('subscribeMessageComposerStateChanged', () => {
      it('should log state update timestamp when poll ID or quoted message changes', () => {
        const { messageComposer } = setup();
        const spy = vi.spyOn(messageComposer, 'logStateUpdateTimestamp');

        messageComposer.registerSubscriptions();
        messageComposer.state.next({
          id: '',
          pollId: 'new-poll-id',
          quotedMessage: null,
          draftId: null,
        });

        expect(spy).toHaveBeenCalled();
      });
    });

    describe('subscribeMessageComposerConfigStateChanged', () => {
      const defaultValue = 'Default text';

      it('should insert default text when text is empty and config has a default value', () => {
        const { messageComposer } = setup();
        const spy = vi.spyOn(messageComposer.textComposer, 'insertText');
        messageComposer.registerSubscriptions();
        expect(spy).not.toHaveBeenCalled();

        messageComposer.textComposer.defaultValue = defaultValue;

        expect(spy).toHaveBeenCalledWith({
          text: defaultValue,
          selection: { start: 0, end: 0 },
        });
        spy.mockRestore();
      });

      it('should not insert default text when text is not empty', () => {
        const { messageComposer } = setup();
        messageComposer.registerSubscriptions();
        const spy = vi.spyOn(messageComposer.textComposer, 'insertText');

        messageComposer.textComposer.state.next({
          text: 'Hello world',
          mentionedUsers: [],
          selection: { start: 0, end: 0 },
        });
        expect(spy).not.toHaveBeenCalled();

        messageComposer.textComposer.defaultValue = defaultValue;

        expect(spy).not.toHaveBeenCalled();
        spy.mockRestore();
      });
    });

    it('should toggle the registration of draft WS event subscriptions when drafts are disabled / enabled', () => {
      const { messageComposer } = setup({
        config: { drafts: { enabled: false } },
      });

      const unsubscribeDraftUpdated = vi.fn();
      const unsubscribeDraftDeleted = vi.fn();

      // @ts-expect-error - we are testing private properties
      const subscribeDraftUpdatedSpy = vi
        .spyOn(messageComposer, 'subscribeDraftUpdated')
        .mockImplementation(() => unsubscribeDraftUpdated);
      // @ts-expect-error - we are testing private properties
      const subscribeDraftDeletedSpy = vi
        .spyOn(messageComposer, 'subscribeDraftDeleted')
        .mockImplementation(() => unsubscribeDraftDeleted);

      messageComposer.registerSubscriptions();

      expect(subscribeDraftUpdatedSpy).not.toHaveBeenCalled();
      expect(subscribeDraftDeletedSpy).not.toHaveBeenCalled();

      messageComposer.updateConfig({ drafts: { enabled: true } });

      expect(subscribeDraftUpdatedSpy).toHaveBeenCalledTimes(1);
      expect(subscribeDraftDeletedSpy).toHaveBeenCalledTimes(1);

      subscribeDraftUpdatedSpy.mockClear();
      subscribeDraftDeletedSpy.mockClear();

      messageComposer.updateConfig({ drafts: { enabled: false } });

      expect(unsubscribeDraftUpdated).toHaveBeenCalledTimes(1);
      expect(unsubscribeDraftDeleted).toHaveBeenCalledTimes(1);
      expect(subscribeDraftUpdatedSpy).not.toHaveBeenCalled();
      expect(subscribeDraftDeletedSpy).not.toHaveBeenCalled();
    });
  });
});
