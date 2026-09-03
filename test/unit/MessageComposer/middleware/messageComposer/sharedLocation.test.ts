import { describe, expect, it, vi } from 'vitest';
import {
  createSharedLocationCompositionMiddleware,
  DraftResponse,
  LocalMessage,
  MessageComposer,
  MessageComposerMiddlewareState,
  MiddlewareStatus,
  StreamChat,
} from '../../../../../src';
import { msToNs } from '../../../../../src/utils/time';

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
            created_at: expect.any(Number),
            created_by_device_id: messageComposer.locationComposer.deviceId,
            message_id: messageComposer.id,
            updated_at: expect.any(Number),
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

  it('crosses end_at to nanoseconds for the optimistic message, keeping the request a Date', async () => {
    // Only a live location produces `end_at`, which is why the static-coords tests above miss it.
    const { messageComposer } = setup();
    const middleware = createSharedLocationCompositionMiddleware(messageComposer);
    const durationMs = 60 * 60 * 1000;
    messageComposer.locationComposer.setData({ latitude: 1, longitude: 1, durationMs });

    const result = await middleware.handlers.compose(setupMiddlewareHandlerParams());
    const localEndAt = result.state.localMessage.shared_location?.end_at;
    const requestEndAt = result.state.message.shared_location?.end_at;

    expect(typeof localEndAt).toBe('number');
    expect(requestEndAt).toBeInstanceOf(Date);
    expect(localEndAt).toBe((requestEndAt as Date).getTime() * 1e6);
    // An hour out must not read as already elapsed.
    expect(localEndAt as number).toBeGreaterThan(Date.now() * 1e6);
  });

  it('sends only request fields when the location came off the edited message', async () => {
    // The full chain, not just this middleware: `cleanData` spreads `state.message` OVER the
    // narrowed payload `toUpdatedMessagePayload` builds, so whatever this middleware puts there is
    // what goes on the wire. Hydrating composer state from a response used to carry the response's
    // own `channel_cid` / `user_id` / numeric `created_at` / `updated_at` straight through, and to
    // drop `end_at` — a field `SharedLocation` declares — turning a live location static on edit.
    const endAtIso = '2099-12-31T23:59:59.535Z';
    const editedMessage = {
      created_at: msToNs(Date.parse('2026-01-01T00:00:00.000Z')),
      updated_at: msToNs(Date.parse('2026-01-01T00:00:00.000Z')),
      id: 'edited-message',
      status: 'received',
      text: 'shared',
      type: 'regular',
      shared_location: {
        channel_cid: 'channelType:channelId',
        created_at: msToNs(Date.parse('2026-01-01T00:00:00.000Z')),
        created_by_device_id: 'device',
        end_at: msToNs(Date.parse(endAtIso)),
        latitude: 1,
        longitude: 2,
        message_id: 'edited-message',
        updated_at: msToNs(Date.parse('2026-01-01T00:00:00.000Z')),
        user_id: user.id,
      },
    } as LocalMessage;
    const { messageComposer } = setup({ composition: editedMessage });

    const composition = await messageComposer.compose();

    // Serialized, so a regression reads as the nanosecond number it would actually send.
    expect(
      JSON.parse(JSON.stringify(composition?.message.shared_location)),
    ).toStrictEqual({
      created_by_device_id: 'device',
      end_at: endAtIso,
      latitude: 1,
      longitude: 2,
      message_id: 'edited-message',
    });
    // The optimistic copy is response-shaped, so its `end_at` is back in the wire unit.
    expect(composition?.localMessage.shared_location?.end_at).toBe(
      msToNs(Date.parse(endAtIso)),
    );
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
