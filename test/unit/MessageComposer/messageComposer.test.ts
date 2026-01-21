import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AbstractOfflineDB,
  Channel,
  ChannelAPIResponse,
  ChannelConfigWithInfo,
  ChannelResponse,
  DEFAULT_COMPOSER_CONFIG,
  LocalMessage,
  MessageComposerConfig,
  StaticLocationPayload,
  StreamChat,
  Thread,
} from '../../../src';
import { DeepPartial } from '../../../src/types.utility';
import { MessageComposer } from '../../../src/messageComposer/messageComposer';
import { DraftResponse, MessageResponse } from '../../../src/types';
import { MockOfflineDB } from '../offline-support/MockOfflineDB';
import { generateMsg } from '../test-utils/generateMessage';

const generateUuidV4Output = 'test-uuid';
// Mock dependencies
vi.mock('../../../src/utils', async (importOriginal) => ({
  ...(await importOriginal()),
  axiosParamsSerializer: vi.fn(),
  isFunction: vi.fn(),
  isString: vi.fn(),
  isObject: vi.fn(),
  isArray: vi.fn(),
  isDate: vi.fn(),
  isNumber: vi.fn(),
  debounce: vi.fn().mockImplementation((fn) => {
    fn.cancel = () => {};
    fn.flush = () => {};
    return fn;
  }),
  generateUUIDv4: vi.fn().mockReturnValue('test-uuid'),
  isLocalMessage: vi.fn().mockReturnValue(true),
  randomId: vi.fn().mockReturnValue('test-uuid'),
  throttle: vi.fn().mockImplementation((fn) => fn),
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
  channelConfig,
  config,
}: {
  composition?: LocalMessage | DraftResponse | MessageResponse | undefined;
  compositionContext?: Channel | Thread | LocalMessage | undefined;
  channelConfig?: {
    polls?: boolean;
    shared_locations?: boolean;
  };
  config?: DeepPartial<MessageComposerConfig>;
} = {}) => {
  const mockClient = new StreamChat('test-api-key');
  mockClient.user = user;
  mockClient.userID = user.id;
  const cid = 'messaging:test-channel-id';
  if (channelConfig) {
    // @ts-expect-error incomplete channel config object
    mockClient.configs[cid] = channelConfig;
  }
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

const offlineModeMessageComposerSetup = ({
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
  mockClient.setOfflineDBApi(new MockOfflineDB({ client: mockClient }));
  vi.spyOn(mockClient.offlineDb!, 'initializeDB').mockResolvedValue(false);
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
      expect(messageComposer.config).toStrictEqual(DEFAULT_COMPOSER_CONFIG);
      expect(messageComposer.attachmentManager).toBeDefined();
      expect(messageComposer.linkPreviewsManager).toBeDefined();
      expect(messageComposer.textComposer).toBeDefined();
      expect(messageComposer.pollComposer).toBeDefined();
      expect(messageComposer.customDataManager).toBeDefined();
    });

    it('should initialize with custom config', () => {
      const customConfig: DeepPartial<MessageComposerConfig> = {
        attachments: {
          maxNumberOfFilesPerMessage: 1,
        },
        drafts: { enabled: true },
        linkPreviews: { debounceURLEnrichmentMs: 20 },
        location: { enabled: false },
        text: {
          maxLengthOnEdit: 1000,
          publishTypingEvents: false,
        },
        sendMessageRequestFn: () => Promise.resolve({ message: generateMsg() }),
      };

      const { messageComposer } = setup({ config: customConfig });

      expect(messageComposer.config).toStrictEqual({
        attachments: {
          acceptedFiles: DEFAULT_COMPOSER_CONFIG.attachments.acceptedFiles,
          fileUploadFilter: DEFAULT_COMPOSER_CONFIG.attachments.fileUploadFilter,
          maxNumberOfFilesPerMessage:
            customConfig.attachments!.maxNumberOfFilesPerMessage,
        },
        drafts: customConfig.drafts,
        linkPreviews: {
          debounceURLEnrichmentMs: customConfig.linkPreviews!.debounceURLEnrichmentMs,
          enabled: DEFAULT_COMPOSER_CONFIG.linkPreviews.enabled,
          findURLFn: DEFAULT_COMPOSER_CONFIG.linkPreviews.findURLFn,
        },
        location: {
          enabled: customConfig.location!.enabled,
          getDeviceId: DEFAULT_COMPOSER_CONFIG.location!.getDeviceId,
        },
        sendMessageRequestFn: customConfig.sendMessageRequestFn,
        text: {
          enabled: DEFAULT_COMPOSER_CONFIG.text.enabled,
          maxLengthOnEdit: customConfig.text!.maxLengthOnEdit,
          publishTypingEvents: customConfig.text!.publishTypingEvents,
        },
      });
    });

    it('should initialize with custom config overridden with back-end configuration', () => {
      [
        {
          customConfig: { location: { enabled: true } },
          channelConfig: { shared_locations: undefined },
          expectedResult: { location: { enabled: true } }, // default is true
        },
        {
          customConfig: { location: { enabled: true } },
          channelConfig: { shared_locations: false },
          expectedResult: { location: { enabled: false } },
        },
        {
          customConfig: { location: { enabled: true } },
          channelConfig: { shared_locations: true },
          expectedResult: { location: { enabled: true } },
        },
        {
          customConfig: { location: { enabled: undefined } },
          channelConfig: { shared_locations: undefined },
          expectedResult: { location: { enabled: true } }, // default is true
        },
        {
          customConfig: { location: { enabled: undefined } },
          channelConfig: { shared_locations: false },
          expectedResult: { location: { enabled: false } },
        },
        {
          customConfig: { location: { enabled: undefined } },
          channelConfig: { shared_locations: true },
          expectedResult: { location: { enabled: true } },
        },
        {
          customConfig: { location: { enabled: false } },
          channelConfig: { shared_locations: false },
          expectedResult: { location: { enabled: false } },
        },
        {
          customConfig: { location: { enabled: false } },
          channelConfig: { shared_locations: undefined },
          expectedResult: { location: { enabled: false } },
        },
        {
          customConfig: { location: { enabled: false } },
          channelConfig: { shared_locations: true },
          expectedResult: { location: { enabled: false } },
        },
      ].forEach(({ customConfig, channelConfig, expectedResult }) => {
        const { messageComposer } = setup({ channelConfig, config: customConfig });
        expect(messageComposer.config.location.enabled).toBe(
          expectedResult.location.enabled,
        );
      });
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

  describe('initStateFromChannelResponse', () => {
    let composer: MessageComposer;

    beforeEach(() => {
      composer = setup({
        config: { drafts: { enabled: true } },
      }).messageComposer;
      composer.state.partialNext({ draftId: 'draft-abc' });
      composer.client.setOfflineDBApi(new MockOfflineDB({ client: composer.client }));

      vi.spyOn(composer, 'initState').mockImplementation(vi.fn());
      vi.spyOn(composer, 'clear').mockImplementation(vi.fn());
    });

    it('does nothing if cids do not match', () => {
      const response = {
        channel: { cid: 'messaging:other' },
      } as unknown as ChannelAPIResponse;

      composer.initStateFromChannelResponse(response);

      expect(composer.initState).not.toHaveBeenCalled();
      expect(composer.clear).not.toHaveBeenCalled();
      expect(composer.client.offlineDb!.deleteDraft).not.toHaveBeenCalled();
    });

    it('calls initState if response contains a draft', () => {
      const draft = { text: 'draft message' };

      const response = {
        channel: { cid: composer.channel.cid },
        draft,
      } as unknown as ChannelAPIResponse;

      composer.initStateFromChannelResponse(response);

      expect(composer.initState).toHaveBeenCalledWith({ composition: draft });
      expect(composer.clear).not.toHaveBeenCalled();
      expect(composer.client.offlineDb!.deleteDraft).not.toHaveBeenCalled();
    });

    it('clears and deletes draft if no draft in response but draftId exists in state', () => {
      const response = {
        channel: { cid: composer.channel.cid },
      } as unknown as ChannelAPIResponse;
      const executeQuerySafelySpy = vi
        .spyOn(composer.client.offlineDb!, 'executeQuerySafely')
        .mockImplementation(vi.fn());

      composer.initStateFromChannelResponse(response);

      expect(composer.initState).not.toHaveBeenCalled();
      expect(composer.clear).toHaveBeenCalled();
      expect(executeQuerySafelySpy).toHaveBeenCalledOnce();

      // simulate the db call
      const queryFn = executeQuerySafelySpy.mock.calls[0][0];
      const dbMock = { deleteDraft: vi.fn() } as unknown as AbstractOfflineDB;
      queryFn(dbMock);
      expect(dbMock.deleteDraft).toHaveBeenCalledWith({
        cid: response.channel.cid,
        parent_id: undefined,
      });
    });

    it('does nothing if no draft and no draftId in state', () => {
      composer.state.partialNext({ draftId: null });

      const response = {
        channel: { cid: composer.channel.cid },
      } as unknown as ChannelAPIResponse;

      composer.initStateFromChannelResponse(response);

      expect(composer.initState).not.toHaveBeenCalled();
      expect(composer.clear).not.toHaveBeenCalled();
      expect(composer.client.offlineDb!.deleteDraft).not.toHaveBeenCalled();
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

    it('should return the correct hasSendableData', () => {
      const { messageComposer } = setup();

      messageComposer.textComposer.state.partialNext({
        text: '',
        mentionedUsers: [],
        selection: { start: 0, end: 0 },
      });
      expect(messageComposer.hasSendableData).toBe(false);

      messageComposer.textComposer.state.partialNext({
        text: 'Hello world',
      });
      expect(messageComposer.hasSendableData).toBe(true);
      messageComposer.textComposer.state.partialNext({
        text: '',
      });

      messageComposer.setQuotedMessage({
        id: 'id',
        type: 'regular',
        status: 'delivered',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
        pinned_at: null,
      });
      expect(messageComposer.hasSendableData).toBe(false);
      messageComposer.setQuotedMessage(null);

      messageComposer.attachmentManager.state.partialNext({
        attachments: [
          { type: 'x', localMetadata: { id: 'x,', uploadState: 'finished', file: {} } },
        ],
      });
      expect(messageComposer.hasSendableData).toBe(true);
      messageComposer.attachmentManager.state.partialNext({
        attachments: [
          { type: 'x', localMetadata: { id: 'x,', uploadState: 'finished', file: {} } },
          { type: 'x', localMetadata: { id: 'x,', uploadState: 'uploading', file: {} } },
        ],
      });
      expect(messageComposer.hasSendableData).toBe(false);
      messageComposer.attachmentManager.state.partialNext({
        attachments: [],
      });

      messageComposer.state.partialNext({ pollId: 'pollId' });
      expect(messageComposer.hasSendableData).toBe(true);
      messageComposer.state.partialNext({ pollId: null });

      messageComposer.updateConfig({ location: { enabled: true } });
      messageComposer.locationComposer.setData({ latitude: 1, longitude: 1 });
      expect(messageComposer.hasSendableData).toBe(true);
      messageComposer.locationComposer.initState();

      expect(messageComposer.hasSendableData).toBe(false);
    });

    it('should return the correct compositionIsEmpty', () => {
      const { messageComposer } = setup();

      messageComposer.textComposer.state.partialNext({
        text: '',
        mentionedUsers: [],
        selection: { start: 0, end: 0 },
      });
      expect(messageComposer.compositionIsEmpty).toBe(true);

      messageComposer.textComposer.state.partialNext({
        text: 'Hello world',
      });
      expect(messageComposer.compositionIsEmpty).toBe(false);
      messageComposer.textComposer.state.partialNext({
        text: '',
      });

      messageComposer.setQuotedMessage({
        id: 'id',
        type: 'regular',
        status: 'delivered',
        created_at: new Date(),
        updated_at: new Date(),
        deleted_at: null,
        pinned_at: null,
      });
      expect(messageComposer.compositionIsEmpty).toBe(false);
      messageComposer.setQuotedMessage(null);

      messageComposer.attachmentManager.state.partialNext({
        attachments: [
          { type: 'x', localMetadata: { id: 'x,', uploadState: 'finished', file: {} } },
        ],
      });
      expect(messageComposer.compositionIsEmpty).toBe(false);
      messageComposer.attachmentManager.state.partialNext({
        attachments: [],
      });

      messageComposer.state.partialNext({ pollId: 'pollId' });
      expect(messageComposer.compositionIsEmpty).toBe(false);
      messageComposer.state.partialNext({ pollId: null });

      messageComposer.updateConfig({ location: { enabled: true } });
      messageComposer.locationComposer.setData({ latitude: 1, longitude: 1 });
      expect(messageComposer.compositionIsEmpty).toBe(false);
      messageComposer.locationComposer.initState();

      expect(messageComposer.compositionIsEmpty).toBe(true);
    });
  });

  describe('offlineDB enabled', () => {
    it('hasSendableData should return false if the composition is empty', () => {
      const { messageComposer } = offlineModeMessageComposerSetup();

      const spyCompositionIsEmpty = vi
        .spyOn(messageComposer, 'compositionIsEmpty', 'get')
        .mockReturnValue(true);

      expect(messageComposer.hasSendableData).toBe(false);
      spyCompositionIsEmpty.mockRestore();
    });

    it('hasSendableData should return true if the composition is not empty', () => {
      const { messageComposer } = offlineModeMessageComposerSetup();

      const spyCompositionIsEmpty = vi
        .spyOn(messageComposer, 'compositionIsEmpty', 'get')
        .mockReturnValue(false);

      expect(messageComposer.hasSendableData).toBe(true);
      spyCompositionIsEmpty.mockRestore();
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
        showReplyInChannel: false,
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
        showReplyInChannel: false,
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

    it('should unregister subscriptions only if refCount drops to 1', () => {
      const { messageComposer } = setup();

      const spy = vi.spyOn(messageComposer, 'incrementRefCount');

      const unsub1 = messageComposer.registerSubscriptions();
      const unsub2 = messageComposer.registerSubscriptions();

      expect(spy).toHaveBeenCalledTimes(2);
      const lastResult = spy.mock.results.at(-1);

      expect(lastResult?.value).toEqual(2);

      unsub1();

      expect(messageComposer.hasSubscriptions).toBe(true);

      unsub2();

      expect(messageComposer.hasSubscriptions).toBe(false);
    });

    it('should register draft subscriptions only once if done through registerSubscriptions', () => {
      const { messageComposer } = setup({
        config: { drafts: { enabled: true } },
      });

      const draftEventSubscriptionsSpy = vi.spyOn(
        messageComposer,
        'registerDraftEventSubscriptions',
      );

      messageComposer.registerSubscriptions();
      messageComposer.registerSubscriptions();

      expect(draftEventSubscriptionsSpy).toHaveBeenCalledOnce();
    });

    it('should allow multiple registrations of draft ws events if done through registerDraftEventSubscriptions', () => {
      const { messageComposer } = setup({
        config: { drafts: { enabled: true } },
      });

      const subscribeDraftUpdatedSpy = vi
        // @ts-expect-error - we are testing private properties
        .spyOn(messageComposer, 'subscribeDraftUpdated');
      const subscribeDraftDeletedSpy = vi
        // @ts-expect-error - we are testing private properties
        .spyOn(messageComposer, 'subscribeDraftDeleted');

      messageComposer.registerSubscriptions();

      expect(subscribeDraftUpdatedSpy).toHaveBeenCalledOnce();
      expect(subscribeDraftDeletedSpy).toHaveBeenCalledOnce();

      subscribeDraftUpdatedSpy.mockClear();
      subscribeDraftDeletedSpy.mockClear();

      messageComposer.registerDraftEventSubscriptions();

      expect(subscribeDraftUpdatedSpy).toHaveBeenCalledOnce();
      expect(subscribeDraftDeletedSpy).toHaveBeenCalledOnce();
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

    it('should toggle showReplyInChannel value with toggleShowReplyInChannel', () => {
      const { messageComposer } = setup();

      messageComposer.toggleShowReplyInChannel();
      expect(messageComposer.state.getLatestValue().showReplyInChannel).toBe(true);
      messageComposer.toggleShowReplyInChannel();
      expect(messageComposer.state.getLatestValue().showReplyInChannel).toBe(false);
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
      const spyLocationComposer = vi.spyOn(messageComposer.locationComposer, 'initState');
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
      expect(spyLocationComposer).toHaveBeenCalled();
      expect(messageComposer.quotedMessage).to.be.null;
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
        showReplyInChannel: false,
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
      messageComposer.textComposer.setText('Test message');

      const result = await messageComposer.compose();

      expect(result).toEqual({
        localMessage: {
          attachments: [],
          created_at: expect.any(Date),
          deleted_at: null,
          error: null,
          id: 'test-uuid',
          mentioned_users: [],
          parent_id: undefined,
          pinned_at: null,
          quoted_message: null,
          reaction_groups: null,
          status: 'sending',
          text: 'Test message',
          type: 'regular',
          updated_at: expect.any(Date),
          user: {
            id: 'user-id',
            name: 'User Name',
          },
          user_id: 'user-id',
        },
        message: {
          id: 'test-uuid',
          mentioned_users: [],
          parent_id: undefined,
          text: 'Test message',
          type: 'regular',
        },
        sendOptions: {},
      });
    });

    it('should compose edited message', async () => {
      const date = new Date();
      const { messageComposer } = setup({
        composition: {
          attachments: [{ type: 'file' }],
          created_at: date,
          deleted_at: null,
          id: 'test-uuid',
          mentioned_users: [],
          pinned: true,
          pinned_at: date,
          // reaction_counts has to be available to infer reaction_groups
          reaction_counts: {
            like: 1,
          },
          // reaction_groups: { like: { count: 1, sum_scores: 1 } },
          // reaction_scores has to be available to infer reaction_groups
          reaction_scores: {
            like: 1,
          },
          status: 'received',
          text: 'Test message',
          type: 'regular',
          updated_at: date,
          user: {
            id: 'user-id',
            name: 'User Name',
          },
          user_id: 'user-id',
        },
      });

      const result = await messageComposer.compose();

      expect(result).toEqual({
        localMessage: {
          attachments: [{ type: 'file' }],
          created_at: date,
          deleted_at: null,
          error: null,
          id: 'test-uuid',
          mentioned_users: [],
          parent_id: undefined,
          pinned: true,
          pinned_at: date,
          quoted_message: null,
          reaction_counts: {
            like: 1,
          },
          reaction_groups: { like: { count: 1, sum_scores: 1 } },
          reaction_scores: {
            like: 1,
          },
          status: 'received',
          text: 'Test message',
          type: 'regular',
          updated_at: date,
          user: {
            id: 'user-id',
            name: 'User Name',
          },
          user_id: 'user-id',
        },
        message: {
          attachments: [
            {
              type: 'file',
            },
          ],
          id: 'test-uuid',
          mentioned_users: [],
          parent_id: undefined,
          pinned: true,
          reaction_groups: {
            like: {
              count: 1,
              sum_scores: 1,
            },
          },
          reaction_scores: {
            like: 1,
          },
          status: 'received',
          text: 'Test message',
          type: 'regular',
          user_id: 'user-id',
        },
        sendOptions: {},
      });
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

    describe('sendMessage', () => {
      it.fails('performs optimistic update before sending the message');
      it.fails(
        'updates the message in state after successful response if message has not arrived over WS',
      );
      it.fails(
        'does not update the message in state after successful response if message has arrived over WS and the update timestamp is <= existing message timestamp',
      );
      it.fails(
        'does not update the message in state if it already exists on the server and in the local state as not delivered',
      );
      it.fails(
        'does not update the message in state if it already exists on the server and in the local state as not failed',
      );
      it.fails(
        'updates the message in state if it already exists on the server and in the local state with status sending',
      );
      it.fails(
        'updates the message in state if it does not exist on the server and the send request failed',
      );
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

    it('optimistically updates draft in db if offline support is enabled', async () => {
      const { messageComposer, mockChannel } = setup({
        config: { drafts: { enabled: true } },
      });
      messageComposer.client.setOfflineDBApi(
        new MockOfflineDB({ client: messageComposer.client }),
      );
      const mockDraft = {
        id: 'test-draft-id',
        text: 'Test draft',
      };

      const spyComposeDraft = vi
        .spyOn(messageComposer, 'composeDraft')
        .mockResolvedValue({ draft: mockDraft });
      const spyCreateDraft = vi
        .spyOn(mockChannel, 'createDraft')
        .mockResolvedValue({ draft: mockDraft });
      const spyUpsertDraft = vi
        .spyOn(messageComposer.client.offlineDb!, 'upsertDraft')
        .mockImplementation(vi.fn());

      const spyLogDraftUpdateTimestamp = vi.spyOn(
        messageComposer,
        'logDraftUpdateTimestamp',
      );

      await messageComposer.createDraft();

      expect(spyComposeDraft).toHaveBeenCalled();
      expect(spyCreateDraft).toHaveBeenCalledWith(mockDraft);
      expect(spyLogDraftUpdateTimestamp).toHaveBeenCalled();
      expect(messageComposer.state.getLatestValue().draftId).toBe('test-draft-id');

      expect(spyUpsertDraft).toHaveBeenCalledTimes(1);
      const { draft } = spyUpsertDraft.mock.calls[0][0];
      const { created_at, ...draftWithoutDate } = draft;
      expect(draftWithoutDate).to.deep.equal({
        channel_cid: messageComposer.channel.cid,
        message: mockDraft,
        parent_id: undefined,
        quoted_message: undefined,
      });
    });

    it('logs error if offlineDb.upsertDraft fails and proceeds with normal flow', async () => {
      const { messageComposer, mockChannel } = setup({
        config: { drafts: { enabled: true } },
      });
      messageComposer.client.setOfflineDBApi(
        new MockOfflineDB({ client: messageComposer.client }),
      );
      const mockDraft = {
        id: 'test-draft-id',
        text: 'Test draft',
      };

      const spyComposeDraft = vi
        .spyOn(messageComposer, 'composeDraft')
        .mockResolvedValue({ draft: mockDraft });
      const spyCreateDraft = vi
        .spyOn(mockChannel, 'createDraft')
        .mockResolvedValue({ draft: mockDraft });
      const spyUpsertDraft = vi
        .spyOn(messageComposer.client.offlineDb!, 'upsertDraft')
        .mockRejectedValueOnce(new Error('offline insert failed'));
      const spyLogger = vi
        .spyOn(messageComposer.client, 'logger')
        .mockImplementation(vi.fn());

      const spyLogDraftUpdateTimestamp = vi.spyOn(
        messageComposer,
        'logDraftUpdateTimestamp',
      );

      await messageComposer.createDraft();

      expect(spyComposeDraft).toHaveBeenCalled();
      expect(spyCreateDraft).toHaveBeenCalledWith(mockDraft);
      expect(spyLogDraftUpdateTimestamp).toHaveBeenCalled();
      expect(messageComposer.state.getLatestValue().draftId).toBe('test-draft-id');

      expect(spyUpsertDraft).toHaveBeenCalledTimes(1);
      expect(spyLogger).toHaveBeenCalledWith(
        'error',
        'offlineDb:upsertDraft',
        expect.objectContaining({
          error: expect.any(Error),
        }),
      );
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
        showReplyInChannel: false,
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

    it('optimistically deletes draft in db if offline support is enabled', async () => {
      const { messageComposer, mockChannel } = setup({
        config: { drafts: { enabled: true } },
      });
      messageComposer.client.setOfflineDBApi(
        new MockOfflineDB({ client: messageComposer.client }),
      );
      const draftId = 'test-draft-id';

      messageComposer.state.next({
        id: '',
        pollId: null,
        quotedMessage: null,
        draftId,
        showReplyInChannel: false,
      });

      const spyChannelDeleteDraft = vi
        .spyOn(mockChannel, 'deleteDraft')
        .mockResolvedValue({});
      const spyDeleteDraftFromDB = vi
        .spyOn(messageComposer.client.offlineDb!, 'deleteDraft')
        .mockImplementation(vi.fn());

      const spyLogDraftUpdateTimestamp = vi.spyOn(
        messageComposer,
        'logDraftUpdateTimestamp',
      );

      await messageComposer.deleteDraft();

      expect(spyChannelDeleteDraft).toHaveBeenCalledWith({ parent_id: undefined });
      expect(spyLogDraftUpdateTimestamp).toHaveBeenCalled();
      expect(messageComposer.state.getLatestValue().draftId).toBeNull();

      expect(spyDeleteDraftFromDB).toHaveBeenCalledWith({
        cid: messageComposer.channel.cid,
        parent_id: undefined,
      });
    });

    it('uses threadId as parent_id in optimistic delete in the offline db if defined', async () => {
      const { messageComposer, mockChannel } = setup({
        config: { drafts: { enabled: true } },
      });
      messageComposer.client.setOfflineDBApi(
        new MockOfflineDB({ client: messageComposer.client }),
      );
      const draftId = 'test-draft-id';

      messageComposer.state.next({
        id: '',
        pollId: null,
        quotedMessage: null,
        draftId,
        showReplyInChannel: false,
      });

      vi.spyOn(messageComposer, 'threadId', 'get').mockReturnValue('thread-123');
      const spyChannelDeleteDraft = vi
        .spyOn(mockChannel, 'deleteDraft')
        .mockResolvedValue({});
      const spyDeleteDraftFromDB = vi
        .spyOn(messageComposer.client.offlineDb!, 'deleteDraft')
        .mockImplementation(vi.fn());

      await messageComposer.deleteDraft();

      expect(spyChannelDeleteDraft).toHaveBeenCalledWith({
        parent_id: 'thread-123',
      });
      expect(spyDeleteDraftFromDB).toHaveBeenCalledWith({
        cid: messageComposer.channel.cid,
        parent_id: 'thread-123',
      });
    });

    it('logs error if offlineDb.deleteDraft throws but still calls online delete', async () => {
      const { messageComposer, mockChannel } = setup({
        config: { drafts: { enabled: true } },
      });
      messageComposer.client.setOfflineDBApi(
        new MockOfflineDB({ client: messageComposer.client }),
      );
      const draftId = 'test-draft-id';

      messageComposer.state.next({
        id: '',
        pollId: null,
        quotedMessage: null,
        draftId,
        showReplyInChannel: false,
      });

      vi.spyOn(messageComposer, 'threadId', 'get').mockReturnValue('thread-123');
      vi.spyOn(messageComposer.client.offlineDb!, 'deleteDraft').mockRejectedValueOnce(
        new Error('Offline deletion failed'),
      );
      const spyChannelDeleteDraft = vi
        .spyOn(mockChannel, 'deleteDraft')
        .mockResolvedValue({});
      const spyLogger = vi
        .spyOn(messageComposer.client, 'logger')
        .mockImplementation(vi.fn());

      await messageComposer.deleteDraft();

      expect(spyChannelDeleteDraft).toHaveBeenCalled();
      expect(spyLogger).toHaveBeenCalledWith(
        'error',
        'offlineDb:deleteDraft',
        expect.objectContaining({
          error: expect.any(Error),
        }),
      );
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
      const spyPollComposerInitState = vi.spyOn(
        messageComposer.pollComposer,
        'initState',
      );

      const spyCreatePoll = vi.spyOn(mockClient, 'createPoll');
      spyCreatePoll.mockResolvedValue({ poll: mockPoll });

      await messageComposer.createPoll();

      expect(spyCompose).toHaveBeenCalled();
      expect(spyCreatePoll).toHaveBeenCalledWith(mockPoll);
      expect(spyPollComposerInitState).not.toHaveBeenCalled();
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

    it('sends location message', async () => {
      const { messageComposer, mockChannel } = setup();
      messageComposer.locationComposer.setData({ latitude: 1, longitude: 1 });
      const messageId = messageComposer.id;
      const spySendSharedLocation = vi
        .spyOn(mockChannel, 'sendSharedLocation')
        .mockResolvedValue({
          message: { id: 'x', status: 'received', type: 'regular' },
          duration: '',
        });

      await messageComposer.sendLocation();

      expect(spySendSharedLocation).toHaveBeenCalled();
      expect(spySendSharedLocation).toHaveBeenCalledWith({
        message_id: messageId,
        created_by_device_id: messageComposer.locationComposer.deviceId,
        latitude: 1,
        longitude: 1,
      } as StaticLocationPayload);
      expect(messageComposer.locationComposer.state.getLatestValue()).toEqual({
        location: null,
      });
    });

    it('prevents sending location message when location data is invalid', async () => {
      const { messageComposer, mockChannel } = setup();
      const spySendSharedLocation = vi
        .spyOn(mockChannel, 'sendSharedLocation')
        .mockResolvedValue({
          message: { id: 'x', status: 'received', type: 'regular' },
          duration: '',
        });

      await messageComposer.sendLocation();

      expect(spySendSharedLocation).not.toHaveBeenCalled();
    });
    it('prevents sending location message in thread', async () => {
      const { mockChannel, mockClient } = setup();
      const mockThread = getThread(mockChannel, mockClient, 'test-thread-id');
      const { messageComposer: threadComposer } = setup({
        compositionContext: mockThread,
      });
      threadComposer.locationComposer.setData({ latitude: 1, longitude: 1 });
      const spySendSharedLocation = vi
        .spyOn(mockChannel, 'sendSharedLocation')
        .mockResolvedValue({
          message: { id: 'x', status: 'received', type: 'regular' },
          duration: '',
        });

      await threadComposer.sendLocation();

      expect(spySendSharedLocation).not.toHaveBeenCalled();
    });

    it('handles failed location message request', async () => {
      const { messageComposer, mockChannel, mockClient } = setup();
      const error = new Error('Failed location request');
      messageComposer.locationComposer.setData({ latitude: 1, longitude: 1 });
      const messageId = messageComposer.id;
      const spySendSharedLocation = vi
        .spyOn(mockChannel, 'sendSharedLocation')
        .mockRejectedValue(error);
      const spyAddNotification = vi.spyOn(mockClient.notifications, 'add');

      await expect(messageComposer.sendLocation()).rejects.toThrow(error.message);
      expect(spyAddNotification).toHaveBeenCalledWith({
        message: 'Failed to share the location',
        origin: {
          emitter: 'MessageComposer',
          context: { composer: messageComposer },
        },
        options: {
          type: 'api:location:create:failed',
          metadata: {
            reason: error.message,
          },
          originalError: expect.any(Error),
          severity: 'error',
        },
      });
    });
  });

  describe('getDraft', () => {
    const draftResponse: DraftResponse = {
      channel_cid: 'messaging:test-channel-id',
      message: {
        id: 'test-message-id',
        text: 'Test message',
        attachments: [],
        mentioned_users: [],
      },
      created_at: new Date().toISOString(),
    };
    it('should not create draft if edited message exists', async () => {
      const editedMessage = {
        id: 'edited-message-id',
        type: 'regular',
        text: 'Edited message',
        attachments: [],
        mentioned_users: [],
      };

      const { messageComposer } = offlineModeMessageComposerSetup({
        composition: editedMessage,
      });

      const spyGetDraft = vi.spyOn(messageComposer.channel, 'getDraft');
      await messageComposer.getDraft();

      expect(messageComposer.client.offlineDb!.getDraft).not.toHaveBeenCalled();
      expect(spyGetDraft).not.toHaveBeenCalled();
    });

    it("should return if draft config isn't enabled", async () => {
      const { messageComposer } = offlineModeMessageComposerSetup({
        config: { drafts: { enabled: false } },
      });

      const spyGetDraft = vi.spyOn(messageComposer.channel, 'getDraft');

      await messageComposer.getDraft();

      expect(messageComposer.client.offlineDb!.getDraft).not.toHaveBeenCalled();
      expect(spyGetDraft).not.toHaveBeenCalled();
    });

    it('should rely on offline db if draft exists in offline DB', async () => {
      const { messageComposer, mockChannel } = offlineModeMessageComposerSetup({
        config: { drafts: { enabled: true } },
      });

      const initStateSpy = vi.spyOn(messageComposer, 'initState');
      const spyGetDraftFromOfflineDB = vi.spyOn(
        messageComposer.client.offlineDb!,
        'getDraft',
      );
      spyGetDraftFromOfflineDB.mockResolvedValue(draftResponse);

      const spyChannelGetDraft = vi.spyOn(mockChannel, 'getDraft');
      spyChannelGetDraft.mockResolvedValue({
        draft: draftResponse,
        duration: '10',
      });

      await messageComposer.getDraft();

      expect(spyGetDraftFromOfflineDB).toHaveBeenCalled();
      expect(initStateSpy).toHaveBeenCalledWith({
        composition: draftResponse,
      });
      expect(initStateSpy).toHaveBeenCalledTimes(2);
      expect(spyChannelGetDraft).toHaveBeenCalled();
      expect(messageComposer.state.getLatestValue().draftId).toBe('test-message-id');
    });

    it('should rely on http API if draft not found in offline DB', async () => {
      const { messageComposer, mockChannel } = offlineModeMessageComposerSetup({
        config: { drafts: { enabled: true } },
      });

      const initStateSpy = vi.spyOn(messageComposer, 'initState');
      const spyGetDraftFromOfflineDB = vi.spyOn(
        messageComposer.client.offlineDb!,
        'getDraft',
      );
      spyGetDraftFromOfflineDB.mockResolvedValue(null);

      const spyChannelGetDraft = vi.spyOn(mockChannel, 'getDraft');
      spyChannelGetDraft.mockResolvedValue({
        draft: draftResponse,
        duration: '10',
      });

      await messageComposer.getDraft();

      expect(spyGetDraftFromOfflineDB).toHaveBeenCalled();
      expect(initStateSpy).toHaveBeenCalledWith({
        composition: draftResponse,
      });
      expect(initStateSpy).toHaveBeenCalledTimes(1);
      expect(spyChannelGetDraft).toHaveBeenCalled();
      expect(messageComposer.state.getLatestValue().draftId).toBe('test-message-id');
    });

    it('should reach catch block if getDraft fails', async () => {
      const { mockClient, messageComposer, mockChannel } =
        offlineModeMessageComposerSetup({
          config: { drafts: { enabled: true } },
        });

      const initStateSpy = vi.spyOn(messageComposer, 'initState');
      const spyGetDraftFromOfflineDB = vi.spyOn(
        messageComposer.client.offlineDb!,
        'getDraft',
      );
      spyGetDraftFromOfflineDB.mockResolvedValue(draftResponse);

      const spyChannelGetDraft = vi.spyOn(mockChannel, 'getDraft');
      spyChannelGetDraft.mockRejectedValue(new Error('Failed to get draft'));

      const spyLogger = vi.spyOn(mockClient, 'logger');

      await messageComposer.getDraft();

      expect(spyGetDraftFromOfflineDB).toHaveBeenCalled();
      expect(initStateSpy).toHaveBeenCalledWith({
        composition: draftResponse,
      });
      expect(initStateSpy).toHaveBeenCalledTimes(1);
      expect(spyChannelGetDraft).toHaveBeenCalled();
      expect(messageComposer.state.getLatestValue().draftId).toBe('test-message-id');
      expect(spyLogger).toHaveBeenCalledTimes(1);
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

      it('should only update the corresponding threadComposer when draft.updated is fired with a parent_id', () => {
        const { mockChannel, mockClient } = setup();
        const mockThread1 = getThread(mockChannel, mockClient, 'test-thread-id1');
        const mockThread2 = getThread(mockChannel, mockClient, 'test-thread-id2');
        const { messageComposer: threadComposer1 } = setup({
          config: { drafts: { enabled: true } },
          compositionContext: mockThread1,
        });
        const { messageComposer: threadComposer2 } = setup({
          config: { drafts: { enabled: true } },
          compositionContext: mockThread2,
        });

        const draft1 = {
          message: {
            id: threadComposer1.id,
          },
          parent_id: 'test-thread-id1',
          channel_cid: mockChannel.cid,
        };
        const draft2 = {
          message: {
            id: threadComposer2.id,
          },
          parent_id: 'test-thread-id2',
          channel_cid: mockChannel.cid,
        };

        threadComposer1.initState({ composition: draft1 });
        threadComposer2.initState({ composition: draft2 });

        Object.defineProperty(threadComposer1.textComposer, 'textIsEmpty', {
          get: () => false,
        });
        Object.defineProperty(threadComposer2.textComposer, 'textIsEmpty', {
          get: () => false,
        });

        threadComposer1.registerSubscriptions();
        threadComposer2.registerSubscriptions();

        draft1.message.id = 'test-uuid-2';

        mockClient.dispatchEvent({ type: 'draft.updated', draft: draft1 });

        expect(threadComposer1.state.getLatestValue().draftId).to.equal('test-uuid-2');
        expect(threadComposer2.state.getLatestValue().draftId).to.equal('test-uuid');
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

      it('should only update the corresponding threadComposer when draft.deleted is fired with a parent_id', () => {
        const { mockChannel, mockClient } = setup();
        const mockThread1 = getThread(mockChannel, mockClient, 'test-thread-id1');
        const mockThread2 = getThread(mockChannel, mockClient, 'test-thread-id2');
        const { messageComposer: threadComposer1 } = setup({
          config: { drafts: { enabled: true } },
          compositionContext: mockThread1,
        });
        const { messageComposer: threadComposer2 } = setup({
          config: { drafts: { enabled: true } },
          compositionContext: mockThread2,
        });

        const draft1 = {
          message: {
            id: threadComposer1.id,
          },
          parent_id: 'test-thread-id1',
          channel_cid: mockChannel.cid,
        };
        const draft2 = {
          message: {
            id: threadComposer2.id,
          },
          parent_id: 'test-thread-id2',
          channel_cid: mockChannel.cid,
        };

        threadComposer1.initState({ composition: draft1 });
        threadComposer2.initState({ composition: draft2 });

        Object.defineProperty(threadComposer1.textComposer, 'textIsEmpty', {
          get: () => false,
        });
        Object.defineProperty(threadComposer2.textComposer, 'textIsEmpty', {
          get: () => false,
        });

        threadComposer1.registerSubscriptions();
        threadComposer2.registerSubscriptions();

        mockClient.dispatchEvent({ type: 'draft.deleted', draft: draft1 });

        expect(threadComposer1.state.getLatestValue().draftId).toBeNull();
        expect(threadComposer2.state.getLatestValue().draftId).not.toBeNull();
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

    describe('subscribeLocationComposerStateChanged', () => {
      it('should log state update timestamp when attachments change', () => {
        const { messageComposer } = setup();
        const spy = vi.spyOn(messageComposer, 'logStateUpdateTimestamp');
        const spyDeleteDraft = vi.spyOn(messageComposer, 'deleteDraft');

        messageComposer.registerSubscriptions();
        messageComposer.locationComposer.setData({
          latitude: 1,
          longitude: 1,
        });

        expect(spy).toHaveBeenCalled();
        expect(spyDeleteDraft).not.toHaveBeenCalled();
      });
      it('deletes the draft when composition becomes empty', () => {
        const { messageComposer } = setup();
        vi.spyOn(messageComposer, 'logStateUpdateTimestamp');
        const spyDeleteDraft = vi.spyOn(messageComposer, 'deleteDraft');
        messageComposer.registerSubscriptions();
        messageComposer.locationComposer.setData({
          latitude: 1,
          longitude: 1,
        });

        messageComposer.locationComposer.state.next({ location: null });

        expect(spyDeleteDraft).toHaveBeenCalled();
      });
    });

    it('should toggle the registration of draft WS event subscriptions when drafts are disabled / enabled', () => {
      const { messageComposer } = setup({
        config: { drafts: { enabled: false } },
      });

      const unsubscribeDraftEvents = vi.fn();

      const registerDraftEventSubscriptionsSpy = vi
        .spyOn(messageComposer, 'registerDraftEventSubscriptions')
        .mockImplementation(() => unsubscribeDraftEvents);

      messageComposer.registerSubscriptions();

      expect(registerDraftEventSubscriptionsSpy).not.toHaveBeenCalled();

      messageComposer.updateConfig({ drafts: { enabled: true } });

      expect(registerDraftEventSubscriptionsSpy).toHaveBeenCalledTimes(1);

      registerDraftEventSubscriptionsSpy.mockClear();

      messageComposer.updateConfig({ drafts: { enabled: false } });

      expect(unsubscribeDraftEvents).toHaveBeenCalledTimes(1);
      expect(registerDraftEventSubscriptionsSpy).not.toHaveBeenCalled();
    });
  });
});
