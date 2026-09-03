import { describe, expect, it, vi } from 'vitest';
import {
  DraftResponse,
  LocalMessage,
  LocationComposerConfig,
  MessageComposer,
  StreamChat,
} from '../../../src';
import { convertDateToTimestamp } from '../test-utils/time';

const deviceId = 'deviceId';

const defaultConfig: LocationComposerConfig = {
  enabled: true,
  getDeviceId: () => deviceId,
  minShareDurationMs: 60 * 1000,
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
// Wire-shaped, because that is the whole point: a `shared_location` read off a message carries the
// response-only fields below and a unix-**nanosecond** `end_at`. A fixture written with ISO strings
// or `Date`s cannot catch either thing leaking back into a request.
const END_AT_ISO = '2099-12-31T23:59:59.535Z';
const sharedLocationResponse = {
  channel_cid: 'channelType:channelId',
  created_at: convertDateToTimestamp('2026-01-01T00:00:00.000Z'),
  created_by_device_id: 'created_by_device_id',
  end_at: convertDateToTimestamp(END_AT_ISO),
  latitude: 1,
  longitude: 2,
  message_id: 'liveLocation_message_id',
  updated_at: convertDateToTimestamp('2026-01-01T00:00:00.000Z'),
  user_id: user.id,
};
const locationMessage: LocalMessage = {
  created_at: convertDateToTimestamp('2026-01-01T00:00:00.000Z'),
  updated_at: convertDateToTimestamp('2026-01-01T00:00:00.000Z'),
  deleted_at: undefined,
  pinned_at: undefined,
  type: 'regular',
  status: 'received',
  id: 'messageId',
  shared_location: sharedLocationResponse,
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

  it('overrides state with initState, narrowed to the request shape', () => {
    const {
      messageComposer: { locationComposer },
    } = setup();
    locationComposer.initState({ message: locationMessage });
    // Not the response object: the response-only fields are dropped and the nanosecond `end_at`
    // becomes the `Date` a `SharedLocation` request declares. Storing the response verbatim is how
    // `channel_cid` / `user_id` / a numeric `created_at` reached the API on the next composition.
    expect(locationComposer.state.getLatestValue()).toStrictEqual({
      location: {
        created_by_device_id: 'created_by_device_id',
        end_at: new Date(END_AT_ISO),
        latitude: 1,
        longitude: 2,
        message_id: 'liveLocation_message_id',
      },
    });
  });

  it('keeps a hydrated live location live rather than silently making it static', () => {
    const {
      messageComposer: { locationComposer },
    } = setup();
    locationComposer.initState({ message: locationMessage });

    // A location off a message has an absolute `end_at` and no `durationMs`. Resolving the expiry
    // from `durationMs` alone dropped it here, so editing the message unshared the live location.
    expect(locationComposer.validLocation?.end_at).toStrictEqual(new Date(END_AT_ISO));
  });

  it('emits only request fields for a hydrated location', () => {
    const {
      messageComposer: { locationComposer },
    } = setup();
    locationComposer.initState({ message: locationMessage });

    expect(locationComposer.validLocation).toStrictEqual({
      created_by_device_id: 'created_by_device_id',
      end_at: new Date(END_AT_ISO),
      latitude: 1,
      longitude: 2,
      message_id: 'liveLocation_message_id',
    });
    // Serialized, so a regression shows up as the nanosecond number it would put on the wire.
    expect(JSON.parse(JSON.stringify(locationComposer.validLocation))).toStrictEqual({
      created_by_device_id: 'created_by_device_id',
      end_at: END_AT_ISO,
      latitude: 1,
      longitude: 2,
      message_id: 'liveLocation_message_id',
    });
  });

  it('hydrates a static location without inventing an expiry', () => {
    const {
      messageComposer: { locationComposer },
    } = setup();
    locationComposer.initState({
      message: {
        ...locationMessage,
        shared_location: { ...sharedLocationResponse, end_at: undefined },
      },
    });

    expect(locationComposer.location).not.toHaveProperty('end_at');
    expect(locationComposer.validLocation).not.toHaveProperty('end_at');
  });

  it('drops a non-finite end_at rather than storing an Invalid Date', () => {
    const {
      messageComposer: { locationComposer },
    } = setup();
    locationComposer.initState({
      message: {
        ...locationMessage,
        shared_location: { ...sharedLocationResponse, end_at: NaN },
      },
    });

    expect(locationComposer.location).not.toHaveProperty('end_at');
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
      end_at: expect.any(Date),
    });

    const endAt = locationComposer.validLocation!.end_at as Date;
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
