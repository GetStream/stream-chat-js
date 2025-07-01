import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CustomDataManager } from '../../../src/messageComposer/CustomDataManager';
import { MessageComposer } from '../../../src/messageComposer/messageComposer';
import { Channel } from '../../../src/channel';
import { StreamChat } from '../../../src/client';
import { LocalMessage } from '../../../src/types';

describe('CustomDataManager', () => {
  let customDataManager: CustomDataManager;
  let mockComposer: MessageComposer;
  let mockChannel: Channel;
  let mockClient: StreamChat;

  beforeEach(() => {
    // Reset mocks
    vi.clearAllMocks();

    // Setup mocks
    mockClient = new StreamChat('apiKey', 'apiSecret');
    mockClient.user = { id: 'user-id', name: 'Test User' };

    mockChannel = mockClient.channel('channelType', 'channelId');
    mockComposer = new MessageComposer({
      client: mockClient,
      compositionContext: mockChannel,
    });

    // Create instance
    customDataManager = new CustomDataManager({
      composer: mockComposer,
    });
  });

  describe('constructor', () => {
    it('should initialize with empty data', () => {
      expect(customDataManager.customMessageData).toEqual({});
    });

    it('should initialize with message data if provided', () => {
      const message: LocalMessage = {
        custom_field: 'test-value',
        id: 'test-message-id',
        text: 'Test message',
        type: 'regular',
        attachments: [],
        mentioned_users: [],
        created_at: new Date(),
        deleted_at: null,
        pinned_at: null,
        status: 'sent',
        updated_at: new Date(),
      };

      const managerWithMessage = new CustomDataManager({
        composer: mockComposer,
        message,
      });

      expect(managerWithMessage.customMessageData).toEqual({});
    });
  });

  describe('initState', () => {
    it('should reset state to empty data', () => {
      // Set some data first
      customDataManager.setMessageData({ test: 'value' });
      expect(customDataManager.customMessageData).toEqual({ test: 'value' });

      // Reset state
      customDataManager.initState();
      expect(customDataManager.customMessageData).toEqual({});
    });

    it('should reset state with message data if provided', () => {
      const message: LocalMessage = {
        custom_field: 'test-value',
        id: 'test-message-id',
        text: 'Test message',
        type: 'regular',
        attachments: [],
        mentioned_users: [],
        created_at: new Date(),
        deleted_at: null,
        pinned_at: null,
        status: 'sent',
        updated_at: new Date(),
      };

      customDataManager.initState({ message });
      expect(customDataManager.customMessageData).toEqual({});
    });
  });

  describe('setCustomData', () => {
    it('should update data with new values', () => {
      customDataManager.setMessageData({ field1: 'value1' });
      expect(customDataManager.customMessageData).toEqual({ field1: 'value1' });

      customDataManager.setMessageData({ field2: 'value2' });
      expect(customDataManager.customMessageData).toEqual({
        field1: 'value1',
        field2: 'value2',
      });
    });

    it('should override existing values', () => {
      customDataManager.setMessageData({ field1: 'value1' });
      customDataManager.setMessageData({ field1: 'new-value' });
      expect(customDataManager.customMessageData).toEqual({ field1: 'new-value' });
    });
  });

  describe('isDataEqual', () => {
    it('should return true for equal data', () => {
      const state1 = { message: { field1: 'value1' } };
      const state2 = { message: { field1: 'value1' } };
      expect(customDataManager.isMessageDataEqual(state1, state2)).toBe(true);
    });

    it('should return false for different data', () => {
      const state1 = { message: { field1: 'value1' } };
      const state2 = { message: { field1: 'value2' } };
      expect(customDataManager.isMessageDataEqual(state1, state2)).toBe(false);
    });

    it('should handle undefined previous state', () => {
      const state1 = { message: { field1: 'value1' } };
      expect(customDataManager.isMessageDataEqual(state1, undefined)).toBe(false);
    });
  });
});
