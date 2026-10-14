import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { LiveLocationManager } from '../../../../../src';
import type { Coords, StreamChat } from '../../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { uniqueId } from '../../../helpers/ids';
import { grantMessagingMembers } from '../../../helpers/grants';
import { retry, waitForChannelTypePropagation } from '../../../helpers/wait';

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
    await grantMessagingMembers(serverClient, cleanup, ['share-location']);
    await waitForChannelTypePropagation();
    await serverClient.upsertUsers([{ id: otherId }]);
    client = await getClientSideClient({ id: userId });
    cleanup.channels.push(`${channelType}:${channelId}`);
    await client
      .channel(channelType, channelId, {
        members: [{ user_id: userId }, { user_id: otherId }],
      })
      .create();
    // config_overrides can only be set server-side
    await serverClient.chat
      .channel(channelType, channelId)
      .updateChannelPartial({ set: { config_overrides: { shared_locations: true } } });
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('sends a static location', async () => {
    const messageId = uniqueId('message');

    // #region snippet docs="chat/_default/05-features/08-location_sharing.md" heading="Sending static location" tab="JavaScript" index=1
    // COPY: channelType="type", channelId="id", messageId="message-id"
    const channel = client.channel(channelType, channelId);

    // Send a message with a static location.
    await channel.sendSharedLocation({
      created_by_device_id: 'device-id',
      latitude: 10,
      longitude: 10,
      message_id: messageId,
    });
    // #endregion snippet

    const { message } = await client.getMessage({ id: messageId });
    expect(message.shared_location).toMatchObject({ latitude: 10, longitude: 10 });
    expect(message.shared_location?.end_at).toBeUndefined();
  });

  it('starts, updates and stops live location sharing', async () => {
    const messageId = uniqueId('message');

    {
      // #region snippet docs="chat/_default/05-features/08-location_sharing.md" heading="Starting live location sharing" tab="JavaScript" index=1
      // COPY: channelType="type", channelId="id", messageId="message-id"
      const channel = client.channel(channelType, channelId);

      // Send a message with a live location.
      // Live location differs from the static location by the termination timestamp end_at.
      await channel.sendSharedLocation({
        created_by_device_id: 'device-id',
        end_at: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
        latitude: 10,
        longitude: 10,
        message_id: messageId,
      });
      // #endregion snippet
    }

    const { message: started } = await client.getMessage({ id: messageId });
    // `end_at` comes back as unix nanoseconds, about an hour from now.
    const endAtMs = (started.shared_location?.end_at ?? 0) / 1e6;
    expect(endAtMs).toBeGreaterThan(Date.now() + 50 * 60 * 1000);
    expect(endAtMs).toBeLessThan(Date.now() + 70 * 60 * 1000);

    // #region snippet docs="chat/_default/05-features/08-location_sharing.md" heading="Updating live location" tab="JavaScript" index=1
    // COPY: messageId="message-id"
    // simple call to update a location
    await client.updateLiveLocation({
      latitude: 1,
      longitude: 2,
      message_id: messageId,
    });
    // #endregion snippet

    const { active_live_locations } = await client.getUserLiveLocations();
    expect(
      active_live_locations.find((location) => location.message_id === messageId),
    ).toMatchObject({ latitude: 1, longitude: 2 });

    {
      // #region snippet docs="chat/_default/05-features/08-location_sharing.md" heading="Stopping live location sharing" tab="JavaScript" index=1
      // COPY: channelType="type", channelId="id", messageId="message-id"
      const channel = client.channel(channelType, channelId);

      // to stop location sharing at least message id has to be provided
      await channel.stopLiveLocationSharing({
        message_id: messageId,
      });
      // #endregion snippet
    }

    await retry(async () => {
      const { active_live_locations: active } = await client.getUserLiveLocations();
      expect(active.map((location) => location.message_id)).not.toContain(messageId);
    });
  });

  it('reports live locations with LiveLocationManager', async () => {
    const coords: Coords = { latitude: 1, longitude: 2 };
    // App-specific placeholders the docs leave undefined.
    const getCurrentPosition = (callback: (position: { coords: Coords }) => void) =>
      callback({ coords });
    const getDeviceId = () => 'device-id';

    // #region snippet docs="chat/_default/05-features/08-location_sharing.md" heading="Updating live location" tab="JavaScript" index=2
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
    await manager.init();

    // to stop watching and reporting the manager subscriptions have cleaned up
    manager.unregisterSubscriptions();

    // release the manager when it is no longer needed
    manager.dispose();
    // #endregion snippet

    expect(manager.stateIsReady).toBe(true);
    // the stop step removed the subscriptions that init() registered
    expect(manager.hasSubscriptions).toBe(false);
  });

  it('listens for location messages', async () => {
    const channel = client.channel(channelType, channelId);
    await channel.watch();
    const onSpy = vi.spyOn(channel, 'on');

    try {
      // #region snippet docs="chat/_default/05-features/08-location_sharing.md" heading="Events" tab="JavaScript" index=1
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

      // Check that the handlers' condition holds for a live location message and its update.
      const seen: Array<[string, boolean]> = [];
      channel.on((event) => {
        if (event.type === 'message.new' || event.type === 'message.updated') {
          seen.push([event.type, Boolean(event.message?.shared_location)]);
        }
      });
      const messageId = uniqueId('message');
      await channel.sendSharedLocation({
        created_by_device_id: 'device-id',
        end_at: new Date(Date.now() + 60 * 60 * 1000),
        latitude: 10,
        longitude: 10,
        message_id: messageId,
      });
      await client.updateLiveLocation({
        latitude: 1,
        longitude: 2,
        message_id: messageId,
      });

      await retry(() => {
        expect(seen).toContainEqual(['message.new', true]);
        expect(seen).toContainEqual(['message.updated', true]);
        return Promise.resolve();
      });
    } finally {
      // Remove the listeners registered here (the snippet doesn't keep the unsubscribes).
      onSpy.mock.results.forEach((r) => {
        if (r.type === 'return') r.value.unsubscribe();
      });
      onSpy.mockRestore();
    }
  });
});
