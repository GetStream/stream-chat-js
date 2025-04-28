import { beforeEach, describe, expect, it } from 'vitest';
import { Channel } from '../../../../../src/channel';
import { StreamChat } from '../../../../../src/client';
import { MessageComposer } from '../../../../../src/messageComposer/messageComposer';
import {
  createCustomDataCompositionMiddleware,
  createDraftCustomDataCompositionMiddleware,
} from '../../../../../src/messageComposer/middleware/messageComposer/customData';
import type {
  MessageComposerMiddlewareValueState,
  MessageDraftComposerMiddlewareValueState,
} from '../../../../../src/messageComposer/middleware/messageComposer/types';

describe('Custom Data Middleware', () => {
  let channel: Channel;
  let client: StreamChat;
  let composer: MessageComposer;

  beforeEach(() => {
    client = new StreamChat('apiKey', 'apiSecret');
    client.user = { id: 'user-id', name: 'Test User' };
    channel = client.channel('channelType', 'channelId');
    composer = new MessageComposer({
      client,
      compositionContext: channel,
    });
  });

  describe('createCustomDataCompositionMiddleware', () => {
    it('should initialize with custom data', async () => {
      const data = { key: 'value' };
      composer.customDataManager.setData(data);
      const middleware = createCustomDataCompositionMiddleware(composer);
      const state: MessageComposerMiddlewareValueState = {
        message: { id: '1', type: 'regular' },
        localMessage: {
          id: '1',
          text: '',
          type: 'regular',
          status: 'sending',
          created_at: new Date(),
          updated_at: new Date(),
          attachments: [],
          mentioned_users: [],
          reaction_groups: null,
          pinned_at: null,
          deleted_at: null,
        },
        sendOptions: {},
      };

      const result = await middleware.compose({
        input: { state },
        nextHandler: async (input) => input,
      });

      expect(result.state.message).toEqual(expect.objectContaining(data));
      expect(result.state.localMessage).toEqual(expect.objectContaining(data));
    });

    it('should add empty custom data if no data is set', async () => {
      const middleware = createCustomDataCompositionMiddleware(composer);
      const state: MessageComposerMiddlewareValueState = {
        message: { id: '1', type: 'regular' },
        localMessage: {
          id: '1',
          text: '',
          type: 'regular',
          status: 'sending',
          created_at: new Date(),
          updated_at: new Date(),
          attachments: [],
          mentioned_users: [],
          reaction_groups: null,
          pinned_at: null,
          deleted_at: null,
        },
        sendOptions: {},
      };

      const result = await middleware.compose({
        input: { state },
        nextHandler: async (input) => input,
      });

      expect(result.state.message).toEqual(state.message);
      expect(result.state.localMessage).toEqual(state.localMessage);
    });
  });

  describe('createDraftCustomDataCompositionMiddleware', () => {
    it('should initialize with custom data', async () => {
      const data = { key: 'value' };
      composer.customDataManager.setData(data);
      const middleware = createDraftCustomDataCompositionMiddleware(composer);
      const state: MessageDraftComposerMiddlewareValueState = {
        draft: {
          id: '1',
          text: '',
          type: 'regular',
        },
      };

      const result = await middleware.compose({
        input: { state },
        nextHandler: async (input) => input,
      });

      expect(result.state.draft).toEqual(expect.objectContaining(data));
    });

    it('should add empty custom data if no data is set', async () => {
      const middleware = createDraftCustomDataCompositionMiddleware(composer);
      const state: MessageDraftComposerMiddlewareValueState = {
        draft: { id: '1', text: '', type: 'regular' },
      };

      const result = await middleware.compose({
        input: { state },
        nextHandler: async (input) => input,
      });

      expect(result.state.draft).toEqual(state.draft);
    });
  });
});
