import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { LiveLocationManager } from '../../../../src';
import type { Coords, StreamChat } from '../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../helpers/clients';
import { Cleanup } from '../../helpers/cleanup';
import { uniqueId } from '../../helpers/ids';
import { retry } from '../../helpers/wait';

// Location sharing is an app-level feature flag that this test app doesn't have:
// every location call (sendMessage with shared_location, PUT/GET /users/live_locations)
// fails with 403 code 17 "location sharing is not enabled for this app, please contact
// support to enable it", server-side too, even with `shared_locations: true` on the
// channel type or in `config_overrides`.
const BLOCKED =
  'BLOCKED: location sharing is not enabled for this app (code 17), needs Stream support';

describe('_default/05-features/08-location_sharing.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('john');
  const otherId = uniqueId('other');
  const channelType = 'messaging';
  const channelId = uniqueId('channel');
  let client: StreamChat;

  beforeAll(async () => {
    cleanup.users.push(userId, otherId);
    await serverClient.upsertUser({ id: otherId });
    client = await getClientSideClient({ id: userId });
    cleanup.channels.push(`${channelType}:${channelId}`);
    await client.channel(channelType, channelId, { members: [userId, otherId] }).create();
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it.skip(`${BLOCKED} (static location)`, async () => {
    const messageId = uniqueId('message');

    // #region snippet docs="_default/05-features/08-location_sharing.md" heading="Sending static location" tab="JavaScript" index=1
    // COPY: channelType="type", channelId="id", messageId="message-id"
    const channel = client.channel(channelType, channelId);

    // Send a message with a static location.
    channel.sendSharedLocation({
      created_by_device_id: 'device-id',
      latitude: 10,
      longitude: 10,
      message_id: messageId,
    });
    // #endregion snippet

    const message = await retry(async () => (await client.getMessage(messageId)).message);
    expect(message.shared_location).toMatchObject({ latitude: 10, longitude: 10 });
    expect(message.shared_location?.end_at).toBeUndefined();
  });

  it.skip(`${BLOCKED} (live location: start, update, stop)`, async () => {
    const messageId = uniqueId('message');

    {
      // #region snippet docs="_default/05-features/08-location_sharing.md" heading="Starting live location sharing" tab="JavaScript" index=1
      // COPY: channelType="type", channelId="id", messageId="message-id"
      const channel = client.channel(channelType, channelId);

      // Send a message with a live location.
      // Live location differs from the static location by the termination timestamp end_at.
      channel.sendSharedLocation({
        created_by_device_id: 'device-id',
        end_at: '2225-07-22T09:30:12.507Z',
        latitude: 10,
        longitude: 10,
        message_id: messageId,
      });
      // #endregion snippet
    }

    const started = await retry(async () => (await client.getMessage(messageId)).message);
    expect(started.shared_location?.end_at).toMatch(/^2225-07-22T09:30:12/);

    // #region snippet docs="_default/05-features/08-location_sharing.md" heading="Updating live location" tab="JavaScript" index=1
    // COPY: messageId="message-id"
    // simple call to update a location
    await client.updateLocation({
      latitude: 1,
      longitude: 2,
      message_id: messageId,
    });
    // #endregion snippet

    const { active_live_locations } = await client.getSharedLocations();
    expect(
      active_live_locations.find((location) => location.message_id === messageId),
    ).toMatchObject({ latitude: 1, longitude: 2 });

    {
      // #region snippet docs="_default/05-features/08-location_sharing.md" heading="Stopping live location sharing" tab="JavaScript" index=1
      // COPY: channelType="type", channelId="id", messageId="message-id"
      const channel = client.channel(channelType, channelId);

      // to stop location sharing at least message id has to be provided
      channel.stopLiveLocationSharing({
        message_id: messageId,
      });
      // #endregion snippet
    }

    await retry(async () => {
      const { active_live_locations: active } = await client.getSharedLocations();
      expect(active.map((location) => location.message_id)).not.toContain(messageId);
    });
  });

  it.skip(`${BLOCKED} (LiveLocationManager)`, async () => {
    const coords: Coords = { latitude: 1, longitude: 2 };
    // App-specific placeholders the docs leave undefined.
    const getCurrentPosition = (callback: (position: { coords: Coords }) => void) =>
      callback({ coords });
    const getDeviceId = () => 'device-id';

    // #region snippet docs="_default/05-features/08-location_sharing.md" heading="Updating live location" tab="JavaScript" index=2
    // the manager takes care of registering/ unregistering and reporting location updates
    const manager = new LiveLocationManager({
      client,
      getDeviceId, // function should generate a unique device id
      // reporter function: should retrieve the location and pass it to the handler function
      watchLocation: (handler) => {
        const timer = setInterval(() => {
          // retrieval of current location is a app-specific logic
          getCurrentPosition((position) => {
            handler({
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
            });
          });
        }, 5000);

        return () => {
          clearInterval(timer);
        };
      },
    });

    // to start watching and reporting the manager subscriptions have to be initiated
    manager.init();

    // to stop watching and reporting the manager subscriptions have cleaned up
    manager.unregisterSubscriptions();
    // #endregion snippet

    await retry(() => {
      expect(manager.stateIsReady).toBe(true);
      return Promise.resolve();
    });
  });

  it('listens for location messages', async () => {
    const channel = client.channel(channelType, channelId);
    await channel.watch();
    const onSpy = vi.spyOn(channel, 'on');

    try {
      // #region snippet docs="_default/05-features/08-location_sharing.md" heading="Events" tab="JavaScript" index=1
      // Listen for new and updated location messages on the watched channel.
      channel.on('message.new', (event) => {
        if (event.message?.shared_location) {
          // Add a new location to the map.
        }
      });

      channel.on('message.updated', (event) => {
        if (event.message?.shared_location) {
          // Update the existing location on the map.
        }
      });
      // #endregion snippet

      expect(onSpy.mock.calls.map(([eventType]) => eventType)).toEqual([
        'message.new',
        'message.updated',
      ]);

      // Location messages can't be sent in this app (see BLOCKED), so check that the
      // handlers run on a plain message and its update.
      const seen: string[] = [];
      channel.on((event) => {
        seen.push(event.type);
      });
      const { message } = await serverClient
        .channel(channelType, channelId)
        .sendMessage({ text: 'hi', user_id: otherId });
      await serverClient.updateMessage({ id: message.id, text: 'edited' }, otherId);

      await retry(() => {
        expect(seen).toContain('message.new');
        expect(seen).toContain('message.updated');
        return Promise.resolve();
      });
    } finally {
      onSpy.mockRestore();
      channel.listeners = {};
    }
  });
});
