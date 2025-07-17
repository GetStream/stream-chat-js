import { describe, expect, it, vi } from 'vitest';
import {
  createDraftSharedLocationCompositionMiddleware,
  createSharedLocationCompositionMiddleware,
  DraftResponse,
  LocalMessage,
  MessageComposer,
  MessageComposerMiddlewareState,
  type MessageCompositionMiddleware,
  MessageDraftComposerMiddlewareValueState,
  MiddlewareStatus,
  StreamChat,
} from '../../../../../src';

const user = { id: 'user-id' };

const setup = ({
  composition,
}: {
  composition?: DraftResponse | LocalMessage;
} = {}) => {
  // Reset mocks
  vi.clearAllMocks();

  // Setup mocks
  const mockClient = new StreamChat('apiKey', 'apiSecret');
  mockClient.user = user;

  const mockChannel = mockClient.channel('channelType', 'channelId');
  mockChannel.getClient = vi.fn().mockReturnValue(mockClient);
  const messageComposer = new MessageComposer({
    client: mockClient,
    composition,
    compositionContext: mockChannel,
    config: { location: { enabled: true } },
  });
  return { mockClient, mockChannel, messageComposer };
};

const setupMiddlewareHandlerParams = (
  initialState: MessageComposerMiddlewareState = {
    message: {},
    localMessage: {},
    sendOptions: {},
  },
) => {
  return {
    state: initialState,
    next: async (state: MessageComposerMiddlewareState) => ({ state }),
    complete: async (state: MessageComposerMiddlewareState) => ({
      state,
      status: 'complete' as MiddlewareStatus,
    }),
    discard: async () => ({ state: initialState, status: 'discard' as MiddlewareStatus }),
    forward: async () => ({ state: initialState }),
  };
};

describe('stream-io/message-composer-middleware/shared-location', () => {
  it('injects shared_location to localMessage and message payloads', async () => {
    const { messageComposer } = setup();
    const middleware = createSharedLocationCompositionMiddleware(messageComposer);
    const coords = { latitude: 1, longitude: 1 };
    messageComposer.locationComposer.setData(coords);
    const result = await middleware.handlers.compose(setupMiddlewareHandlerParams());
    expect(result).toEqual({
      state: {
        localMessage: {
          shared_location: {
            channel_cid: messageComposer.channel.cid,
            created_at: expect.any(String),
            created_by_device_id: messageComposer.locationComposer.deviceId,
            message_id: messageComposer.id,
            updated_at: expect.any(String),
            user_id: user.id,
            ...coords,
          },
        },
        message: {
          shared_location: {
            created_by_device_id: messageComposer.locationComposer.deviceId,
            message_id: messageComposer.id,
            ...coords,
          },
        },
        sendOptions: {},
      },
    });
  });

  it('does not inject shared_location to localMessage and message payloads if none is set', async () => {
    const { messageComposer } = setup();
    const middleware = createSharedLocationCompositionMiddleware(messageComposer);
    const result = await middleware.handlers.compose(setupMiddlewareHandlerParams());
    expect(result).toEqual({
      state: {
        localMessage: {},
        message: {},
        sendOptions: {},
      },
    });
  });

  it('does not inject shared_location to localMessage and message payloads if the location state is corrupted', async () => {
    const { messageComposer } = setup();
    const middleware = createSharedLocationCompositionMiddleware(messageComposer);
    // @ts-expect-error invalid location payload
    messageComposer.locationComposer.state.next({
      location: {
        latitude: 1,
        created_by_device_id: 'da',
        message_id: messageComposer.id,
      },
    });
    const result = await middleware.handlers.compose(setupMiddlewareHandlerParams());
    expect(result).toEqual({
      state: {
        localMessage: {},
        message: {},
        sendOptions: {},
      },
    });
  });

  it('does not inject shared_location to localMessage and message payloads if the user is unknown', async () => {
    const { messageComposer, mockClient } = setup();
    const middleware = createSharedLocationCompositionMiddleware(messageComposer);
    const coords = { latitude: 1, longitude: 1 };
    messageComposer.locationComposer.setData(coords);
    // @ts-expect-error setting user to invalid value
    mockClient.user = null;
    const result = await middleware.handlers.compose(setupMiddlewareHandlerParams());
    expect(result).toEqual({
      state: {
        localMessage: {},
        message: {},
        sendOptions: {},
      },
    });
  });
});

const setupDraftMiddlewareHandlerParams = (
  initialState: MessageDraftComposerMiddlewareValueState = {},
) => {
  return {
    state: initialState,
    next: async (state: MessageDraftComposerMiddlewareValueState) => ({ state }),
    complete: async (state: MessageDraftComposerMiddlewareValueState) => ({
      state,
      status: 'complete' as MiddlewareStatus,
    }),
    discard: async () => ({ state: initialState, status: 'discard' as MiddlewareStatus }),
    forward: async () => ({ state: initialState }),
  };
};

describe('stream-io/message-composer-middleware/draft-shared-location', () => {
  it('injects shared_location to localMessage and message payloads', async () => {
    const { messageComposer } = setup();
    const middleware = createDraftSharedLocationCompositionMiddleware(messageComposer);
    const coords = { latitude: 1, longitude: 1 };
    messageComposer.locationComposer.setData(coords);
    const result = await middleware.handlers.compose(setupDraftMiddlewareHandlerParams());
    expect(result).toEqual({
      state: {
        draft: {
          shared_location: {
            created_by_device_id: messageComposer.locationComposer.deviceId,
            message_id: messageComposer.id,
            ...coords,
          },
        },
      },
    });
  });

  it('does not inject shared_location to localMessage and message payloads if none is set', async () => {
    const { messageComposer } = setup();
    const middleware = createDraftSharedLocationCompositionMiddleware(messageComposer);
    const result = await middleware.handlers.compose(setupDraftMiddlewareHandlerParams());
    expect(result).toEqual({
      state: {},
    });
  });

  it('does not inject shared_location to localMessage and message payloads if the location state is corrupted', async () => {
    const { messageComposer } = setup();
    const middleware = createDraftSharedLocationCompositionMiddleware(messageComposer);
    // @ts-expect-error invalid location payload
    messageComposer.locationComposer.state.next({
      location: {
        latitude: 1,
        created_by_device_id: 'da',
        message_id: messageComposer.id,
      },
    });
    const result = await middleware.handlers.compose(setupDraftMiddlewareHandlerParams());
    expect(result).toEqual({
      state: {},
    });
  });
});
