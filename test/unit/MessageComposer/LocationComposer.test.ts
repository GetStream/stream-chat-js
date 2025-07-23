import { describe, expect, it, vi } from 'vitest';
import {
  DraftResponse,
  LocalMessage,
  LocationComposerConfig,
  MessageComposer,
  StreamChat,
} from '../../../src';

const deviceId = 'deviceId';

const defaultConfig: LocationComposerConfig = {
  enabled: true,
  getDeviceId: () => deviceId,
};

const user = { id: 'user-id' };

const setup = ({
  composition,
  config,
}: {
  composition?: DraftResponse | LocalMessage;
  config?: Partial<LocationComposerConfig>;
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
    config: { location: { ...defaultConfig, ...config } },
  });
  return { mockClient, mockChannel, messageComposer };
};
const locationMessage: LocalMessage = {
  created_at: new Date(),
  updated_at: new Date(),
  deleted_at: null,
  pinned_at: null,
  type: 'regular',
  status: 'received',
  id: 'messageId',
  shared_location: {
    channel_cid: 'channel_cid',
    created_at: 'created_at',
    created_by_device_id: 'created_by_device_id',
    end_at: '9999-12-31T23:59:59.535Z',
    latitude: 1,
    longitude: 2,
    message_id: 'liveLocation_message_id',
    updated_at: 'updated_at',
    user_id: user.id,
  },
};
describe('LocationComposer', () => {
  it('constructor initiates state and variables', () => {
    const {
      messageComposer: { locationComposer },
    } = setup();
    expect(locationComposer.state.getLatestValue()).toEqual({
      location: null,
    });
    expect(locationComposer.deviceId).toBe(deviceId);
    expect(locationComposer.config).toEqual(defaultConfig);
  });

  it('overrides state with initState', () => {
    const {
      messageComposer: { locationComposer },
    } = setup();
    locationComposer.initState({ message: locationMessage });
    expect(locationComposer.state.getLatestValue()).toEqual({
      location: locationMessage.shared_location,
    });
  });

  it('does not override state with initState with message without shared_location', () => {
    const {
      messageComposer: { locationComposer },
    } = setup();
    locationComposer.initState({
      message: { ...locationMessage, shared_location: undefined },
    });
    expect(locationComposer.state.getLatestValue()).toEqual({
      location: null,
    });
  });

  it('does not override state with initState without message', () => {
    const {
      messageComposer: { locationComposer },
    } = setup();
    locationComposer.initState();
    expect(locationComposer.state.getLatestValue()).toEqual({
      location: null,
    });
  });

  it('sets the data', () => {
    const {
      messageComposer: { locationComposer },
    } = setup();
    const data = {
      durationMs: 1,
      latitude: 2,
      longitude: 3,
    };
    locationComposer.setData(data);
    const messageId = locationComposer.composer.id;
    expect(locationComposer.location).toEqual({
      message_id: messageId,
      created_by_device_id: deviceId,
      ...data,
    });
  });

  it('does not set the data in case latitude or longitude is missing', () => {
    const {
      messageComposer: { locationComposer },
    } = setup();
    locationComposer.setData({});
    expect(locationComposer.location).toBeNull();
  });

  it('does not generate location payload for send message request if expires in less than 60 seconds', () => {
    const {
      messageComposer: { locationComposer },
    } = setup();
    const data = {
      durationMs: 59 * 1000,
      latitude: 2,
      longitude: 3,
    };
    locationComposer.setData(data);
    expect(locationComposer.validLocation).toEqual(null);
  });

  it('generate location payload for send message request', () => {
    const {
      messageComposer: { locationComposer },
    } = setup();
    const data = {
      durationMs: 60 * 1000,
      latitude: 2,
      longitude: 3,
    };
    const messageId = locationComposer.composer.id;
    locationComposer.setData(data);
    expect(locationComposer.validLocation).toEqual({
      message_id: messageId,
      created_by_device_id: deviceId,
      latitude: data.latitude,
      longitude: data.longitude,
      end_at: expect.any(String),
    });

    const endAt = new Date(locationComposer.validLocation!.end_at);
    const expectedEndAt = new Date(Date.now() + data.durationMs);
    expect(endAt.getTime()).toBeCloseTo(expectedEndAt.getTime(), -2); // Within 100ms
  });

  it('generates null in case of invalid location state', () => {
    const {
      messageComposer: { locationComposer },
    } = setup();
    const invalidStates = [
      {
        location: {
          latitude: 1,
          created_by_device_id: deviceId,
          message_id: locationComposer.composer.id,
        },
      },
      {
        location: {
          longitude: 1,
          created_by_device_id: deviceId,
          message_id: locationComposer.composer.id,
        },
      },
      {
        location: {
          latitude: 1,
          longitude: 1,
          message_id: locationComposer.composer.id,
        },
      },
      {
        location: {
          latitude: 1,
          longitude: 1,
          created_by_device_id: deviceId,
        },
      },
    ];
    invalidStates.forEach((state) => {
      locationComposer.state.next(state);
      expect(locationComposer.validLocation).toBeNull();
    });
  });
});
