import { describe, expect, it, vi } from 'vitest';
import {
  Coords,
  LiveLocationManager,
  LiveLocationManagerConstructorParameters,
  SharedLiveLocationResponse,
  StreamChat,
  UPDATE_LIVE_LOCATION_REQUEST_MIN_THROTTLE_TIMEOUT,
  WatchLocationHandler,
} from '../../src';
import { getClientWithUser } from './test-utils/getClient';
import { sleep } from '../../src/utils';

const makeWatchLocation =
  (
    coords: Coords[],
    captureHandler?: (handler: (c: Coords) => void) => void,
  ): LiveLocationManagerConstructorParameters['watchLocation'] =>
  (handler) => {
    if (captureHandler) {
      captureHandler(handler);
    } else {
      coords.forEach((coord) => handler(coord));
    }

    return () => null;
  };

describe('LiveLocationManager', () => {
  const deviceId = 'deviceId';
  const getDeviceId = vi.fn().mockReturnValue(deviceId);
  const watchLocation = vi.fn().mockReturnValue(() => null);
  const user = { id: 'user-id' };
  const liveLocation: SharedLiveLocationResponse = {
    channel_cid: 'channel_cid',
    created_at: 'created_at',
    created_by_device_id: 'created_by_device_id',
    end_at: '9999-12-31T23:59:59.535Z',
    latitude: 1,
    longitude: 2,
    message_id: 'liveLocation_message_id',
    updated_at: 'updated_at',
    user_id: user.id,
  };
  const liveLocation2: SharedLiveLocationResponse = {
    channel_cid: 'channel_cid2',
    created_at: 'created_at',
    created_by_device_id: 'created_by_device_id',
    end_at: '9999-12-31T23:59:59.535Z',
    latitude: 1,
    longitude: 2,
    message_id: 'liveLocation_message_id2',
    updated_at: 'updated_at',
    user_id: user.id,
  };

  describe('constructor', () => {
    it('throws if the user is unknown', () => {
      expect(
        () =>
          new LiveLocationManager({
            client: {} as StreamChat,
            getDeviceId,
            watchLocation,
          }),
      ).toThrow(expect.any(Error));
    });

    it('sets up the initial state', async () => {
      const client = await getClientWithUser({ id: 'user-abc' });
      const manager = new LiveLocationManager({
        client,
        getDeviceId,
        watchLocation,
      });
      expect(manager.deviceId).toEqual(deviceId);
      expect(manager.getDeviceId).toEqual(getDeviceId);
      expect(manager.watchLocation).toEqual(watchLocation);
      expect(manager.state.getLatestValue()).toEqual({
        messages: new Map(),
        ready: false,
      });
    });
  });

  describe('live location management', () => {
    it('retrieves the active live locations and registers subscriptions on init', async () => {
      const client = await getClientWithUser({ id: 'user-abc' });
      const getSharedLocationsSpy = vi
        .spyOn(client, 'getSharedLocations')
        .mockResolvedValue({ active_live_locations: [], duration: '' });
      const manager = new LiveLocationManager({
        client,
        getDeviceId,
        watchLocation,
      });

      expect(getSharedLocationsSpy).toHaveBeenCalledTimes(0);
      expect(manager.stateIsReady).toBeFalsy();
      await manager.init();
      expect(getSharedLocationsSpy).toHaveBeenCalledTimes(1);
      expect(manager.hasSubscriptions).toBeTruthy();
      // @ts-expect-error accessing private attribute
      expect(manager.refCount).toBe(1);

      await manager.init();
      expect(getSharedLocationsSpy).toHaveBeenCalledTimes(1);
      expect(manager.hasSubscriptions).toBeTruthy();
      expect(manager.stateIsReady).toBeTruthy();
      // @ts-expect-error accessing private attribute
      expect(manager.refCount).toBe(2);
    });

    it('unregisters subscriptions', async () => {
      const client = await getClientWithUser({ id: 'user-abc' });
      const getSharedLocationsSpy = vi
        .spyOn(client, 'getSharedLocations')
        .mockResolvedValue({ active_live_locations: [], duration: '' });
      const manager = new LiveLocationManager({
        client,
        getDeviceId,
        watchLocation,
      });

      await manager.init();
      manager.unregisterSubscriptions();
      expect(manager.hasSubscriptions).toBeFalsy();
    });

    describe('message addition or removal', () => {
      it('does not update active location if there are no active live locations', async () => {
        const client = await getClientWithUser({ id: 'user-abc' });
        const getSharedLocationsSpy = vi
          .spyOn(client, 'getSharedLocations')
          .mockResolvedValue({ active_live_locations: [], duration: '' });
        const updateLocationSpy = vi
          .spyOn(client, 'updateLocation')
          .mockResolvedValue(liveLocation);
        const newCoords = { latitude: 2, longitude: 2 };
        const manager = new LiveLocationManager({
          client,
          getDeviceId,
          watchLocation: makeWatchLocation([newCoords]),
        });

        await manager.init();
        expect(updateLocationSpy).not.toHaveBeenCalled();
      });

      it('does not update active location if there are no coordinate updates', async () => {
        // starting from 0
        const client = await getClientWithUser({ id: 'user-abc' });
        const getSharedLocationsSpy = vi
          .spyOn(client, 'getSharedLocations')
          .mockResolvedValue({ active_live_locations: [liveLocation], duration: '' });
        const updateLocationSpy = vi
          .spyOn(client, 'updateLocation')
          .mockResolvedValue(liveLocation);
        const manager = new LiveLocationManager({
          client,
          getDeviceId,
          watchLocation,
        });

        await manager.init();
        expect(updateLocationSpy).not.toHaveBeenCalled();
      });

      it('updates active location on coordinate updates', async () => {
        const client = await getClientWithUser({ id: 'user-abc' });
        vi.spyOn(client, 'getSharedLocations').mockResolvedValue({
          active_live_locations: [liveLocation],
          duration: '',
        });
        const updateLocationSpy = vi
          .spyOn(client, 'updateLocation')
          .mockResolvedValue(liveLocation);
        const newCoords = { latitude: 2, longitude: 2 };
        const manager = new LiveLocationManager({
          client,
          getDeviceId,
          watchLocation: makeWatchLocation([newCoords]),
        });

        await manager.init();
        expect(updateLocationSpy).toHaveBeenCalledTimes(1);
        expect(updateLocationSpy).toHaveBeenCalledWith({
          created_by_device_id: liveLocation.created_by_device_id,
          message_id: liveLocation.message_id,
          ...newCoords,
        });
        expect(manager.messages).toHaveLength(1);
      });

      it('does not update active location if returning to 0 locations', async () => {
        const client = await getClientWithUser({ id: 'user-abc' });
        vi.spyOn(client, 'getSharedLocations').mockResolvedValue({
          active_live_locations: [liveLocation],
          duration: '',
        });
        const updateLocationSpy = vi
          .spyOn(client, 'updateLocation')
          .mockResolvedValue(liveLocation);
        const newCoords = { latitude: 2, longitude: 2 };
        const manager = new LiveLocationManager({
          client,
          getDeviceId,
          watchLocation: makeWatchLocation([newCoords]),
        });

        await manager.init();

        // @ts-expect-error accessing private property
        manager.unregisterMessage(liveLocation.message_id);
        expect(updateLocationSpy).toHaveBeenCalledTimes(1);
        expect(manager.messages).toHaveLength(0);
      });

      it('requests the live location upon adding a first message', async () => {
        const client = await getClientWithUser(user);
        vi.spyOn(client, 'getSharedLocations').mockResolvedValue({
          active_live_locations: [],
          duration: '',
        });
        const updateLocationSpy = vi
          .spyOn(client, 'updateLocation')
          .mockResolvedValue(liveLocation);
        const newCoords = { latitude: 2, longitude: 2 };
        const manager = new LiveLocationManager({
          client,
          getDeviceId,
          watchLocation: makeWatchLocation([newCoords]),
        });

        await manager.init();
        expect(updateLocationSpy).not.toHaveBeenCalled();
        // @ts-expect-error accessing private property
        manager.registerMessage({
          id: liveLocation.message_id,
          shared_location: liveLocation,
          user,
        });
        vi.waitFor(() => {
          expect(updateLocationSpy).toHaveBeenCalledTimes(1);
          expect(updateLocationSpy).toHaveBeenCalledWith({
            created_by_device_id: manager.deviceId,
            message_id: liveLocation.message_id,
            ...newCoords,
          });
          expect(manager.messages).toHaveLength(1);
        });
      });

      it('does not perform live location update request upon adding subsequent messages within min throttle timeout', async () => {
        const client = await getClientWithUser(user);
        vi.spyOn(client, 'getSharedLocations').mockResolvedValue({
          active_live_locations: [],
          duration: '',
        });
        const updateLocationSpy = vi
          .spyOn(client, 'updateLocation')
          .mockResolvedValue(liveLocation);
        const newCoords = { latitude: 2, longitude: 2 };
        const manager = new LiveLocationManager({
          client,
          getDeviceId,
          watchLocation: makeWatchLocation([newCoords]),
        });

        await manager.init();
        // @ts-expect-error accessing private property
        manager.registerMessage({
          id: liveLocation.message_id,
          shared_location: liveLocation,
          user,
        });
        await sleep(0); // registerMessage is async under the hood
        // @ts-expect-error accessing private property
        manager.registerMessage({
          id: liveLocation2.message_id,
          shared_location: liveLocation2,
          user,
        });

        vi.waitFor(() => {
          expect(updateLocationSpy).toHaveBeenCalledTimes(1);
          expect(updateLocationSpy).toHaveBeenCalledWith({
            created_by_device_id: manager.deviceId,
            message_id: liveLocation.message_id,
            ...newCoords,
          });
          expect(manager.messages).toHaveLength(2);
        });
      });

      it('does not request live location upon adding subsequent messages beyond min throttle timeout', async () => {
        vi.useFakeTimers();
        const client = await getClientWithUser(user);
        vi.spyOn(client, 'getSharedLocations').mockResolvedValue({
          active_live_locations: [],
          duration: '',
        });
        const updateLocationSpy = vi
          .spyOn(client, 'updateLocation')
          .mockResolvedValueOnce(liveLocation)
          .mockResolvedValueOnce(liveLocation2);
        const newCoords = { latitude: 2, longitude: 2 };
        const manager = new LiveLocationManager({
          client,
          getDeviceId,
          watchLocation: makeWatchLocation([newCoords]),
        });

        await manager.init();
        // @ts-expect-error accessing private property
        manager.registerMessage({
          id: liveLocation.message_id,
          shared_location: liveLocation,
          user,
        });
        let sleepPromise = sleep(0); // registerMessage is async under the hood
        vi.advanceTimersByTime(UPDATE_LIVE_LOCATION_REQUEST_MIN_THROTTLE_TIMEOUT);
        await sleepPromise;
        // @ts-expect-error accessing private property
        manager.registerMessage({
          id: liveLocation2.message_id,
          shared_location: liveLocation2,
          user,
        });
        sleepPromise = sleep(0); // registerMessage is async under the hood
        vi.advanceTimersByTime(0);
        await sleepPromise;
        expect(updateLocationSpy).toHaveBeenCalledTimes(1);
        expect(updateLocationSpy).toHaveBeenCalledWith({
          created_by_device_id: liveLocation.created_by_device_id,
          message_id: liveLocation.message_id,
          ...newCoords,
        });
        expect(manager.messages).toHaveLength(2);
        vi.useRealTimers();
      });

      it('throttles live location update requests upon multiple watcher coords emissions under min throttle timeout', async () => {
        const client = await getClientWithUser(user);
        vi.spyOn(client, 'getSharedLocations').mockResolvedValue({
          active_live_locations: [liveLocation],
          duration: '',
        });
        const updateLocationSpy = vi
          .spyOn(client, 'updateLocation')
          .mockResolvedValue(liveLocation);
        let watchHandler: WatchLocationHandler = () => {
          throw new Error('XX');
        };
        const captureHandler = (handler: WatchLocationHandler) => {
          watchHandler = handler;
        };
        const manager = new LiveLocationManager({
          client,
          getDeviceId,
          watchLocation: makeWatchLocation([], captureHandler),
        });

        await manager.init();

        watchHandler({ latitude: 1, longitude: 1 });

        await sleep(0); // async under the hood
        expect(updateLocationSpy).toHaveBeenCalledTimes(1);

        watchHandler({ latitude: 1, longitude: 2 });

        await sleep(0); // async under the hood
        expect(updateLocationSpy).toHaveBeenCalledTimes(1);
      });

      it('allows live location update requests upon multiple watcher coords emissions beyond min throttle timeout', async () => {
        vi.useFakeTimers();
        const client = await getClientWithUser(user);
        vi.spyOn(client, 'getSharedLocations').mockResolvedValue({
          active_live_locations: [liveLocation],
          duration: '',
        });
        const updateLocationSpy = vi
          .spyOn(client, 'updateLocation')
          .mockResolvedValue(liveLocation);
        let watchHandler: WatchLocationHandler = () => {
          throw new Error('XX');
        };
        const captureHandler = (handler: WatchLocationHandler) => {
          watchHandler = handler;
        };
        const manager = new LiveLocationManager({
          client,
          getDeviceId,
          watchLocation: makeWatchLocation([], captureHandler),
        });

        await manager.init();
        watchHandler({ latitude: 1, longitude: 1 });

        vi.waitFor(() => {
          expect(updateLocationSpy).toHaveBeenCalledTimes(1);
        });

        const sleepPromise = sleep(0);
        vi.advanceTimersByTime(UPDATE_LIVE_LOCATION_REQUEST_MIN_THROTTLE_TIMEOUT);
        await sleepPromise;

        watchHandler({ latitude: 3, longitude: 4 });

        vi.waitFor(() => {
          expect(updateLocationSpy).toHaveBeenCalledTimes(2);
        });

        vi.useRealTimers();
      });
    });

    describe('live_location_sharing.started', () => {
      it('registers a new message', async () => {
        const client = await getClientWithUser(user);
        vi.spyOn(client, 'getSharedLocations').mockResolvedValue({
          active_live_locations: [],
          duration: '',
        });
        vi.spyOn(client, 'updateLocation').mockResolvedValue(liveLocation);
        const newCoords = { latitude: 2, longitude: 2 };
        const manager = new LiveLocationManager({
          client,
          getDeviceId,
          watchLocation: makeWatchLocation([newCoords]),
        });

        await manager.init();
        expect(manager.messages.size).toBe(0);
        client.dispatchEvent({
          message: {
            id: liveLocation.message_id,
            shared_location: liveLocation,
            type: 'regular',
            user,
          },
          type: 'live_location_sharing.started',
        });
        vi.waitFor(() => {
          expect(manager.messages.size).toBe(1);
        });
      });
    });

    describe('message.updated', () => {
      it('registers a new message if not yet registered', async () => {
        const client = await getClientWithUser(user);
        vi.spyOn(client, 'getSharedLocations').mockResolvedValue({
          active_live_locations: [],
          duration: '',
        });
        vi.spyOn(client, 'updateLocation').mockResolvedValue(liveLocation);
        const newCoords = { latitude: 2, longitude: 2 };
        const manager = new LiveLocationManager({
          client,
          getDeviceId,
          watchLocation: makeWatchLocation([newCoords]),
        });

        await manager.init();
        expect(manager.messages.size).toBe(0);
        client.dispatchEvent({
          message: {
            id: liveLocation.message_id,
            shared_location: liveLocation,
            type: 'regular',
            user,
          },
          type: 'message.updated',
        });
        vi.waitFor(() => {
          expect(manager.messages.size).toBe(1);
        });
      });

      it('updates location for registered message', async () => {
        const client = await getClientWithUser(user);
        vi.spyOn(client, 'getSharedLocations').mockResolvedValue({
          active_live_locations: [{ ...liveLocation, end_at: new Date().toISOString() }],
          duration: '',
        });
        vi.spyOn(client, 'updateLocation').mockResolvedValue(liveLocation);
        const newCoords = { latitude: 2, longitude: 2 };
        const manager = new LiveLocationManager({
          client,
          getDeviceId,
          watchLocation: makeWatchLocation([newCoords]),
        });

        await manager.init();
        expect(manager.messages).toHaveLength(1);
        client.dispatchEvent({
          message: {
            id: liveLocation.message_id,
            shared_location: liveLocation,
            type: 'regular',
            user,
          },
          type: 'message.updated',
        });
        vi.waitFor(() => {
          expect(manager.messages).toHaveLength(1);
          expect(manager.messages.get(liveLocation.message_id)?.end_at).toBe(
            liveLocation.end_at,
          );
        });
      });

      it('does not register a new message if it does not contain a live location', async () => {
        const client = await getClientWithUser(user);
        vi.spyOn(client, 'getSharedLocations').mockResolvedValue({
          active_live_locations: [],
          duration: '',
        });
        vi.spyOn(client, 'updateLocation').mockResolvedValue(liveLocation);
        const newCoords = { latitude: 2, longitude: 2 };
        const manager = new LiveLocationManager({
          client,
          getDeviceId,
          watchLocation: makeWatchLocation([newCoords]),
        });

        await manager.init();
        expect(manager.messages.size).toBe(0);
        client.dispatchEvent({
          message: { id: liveLocation.message_id, type: 'regular', user },
          type: 'message.updated',
        });
        vi.waitFor(() => {
          expect(manager.messages.size).toBe(0);
        });
      });

      it('does not register a new message if it does not contain user', async () => {
        const client = await getClientWithUser(user);
        vi.spyOn(client, 'getSharedLocations').mockResolvedValue({
          active_live_locations: [],
          duration: '',
        });
        vi.spyOn(client, 'updateLocation').mockResolvedValue(liveLocation);
        const newCoords = { latitude: 2, longitude: 2 };
        const manager = new LiveLocationManager({
          client,
          getDeviceId,
          watchLocation: makeWatchLocation([newCoords]),
        });

        await manager.init();
        expect(manager.messages.size).toBe(0);
        client.dispatchEvent({
          message: {
            id: liveLocation.message_id,
            shared_location: liveLocation,
            type: 'regular',
          },
          type: 'message.updated',
        });
        vi.waitFor(() => {
          expect(manager.messages.size).toBe(0);
        });
      });

      it('unregisters a message if the updated message does not contain a live location', async () => {
        const client = await getClientWithUser(user);
        vi.spyOn(client, 'getSharedLocations').mockResolvedValue({
          active_live_locations: [liveLocation],
          duration: '',
        });
        vi.spyOn(client, 'updateLocation').mockResolvedValue(liveLocation);
        const newCoords = { latitude: 2, longitude: 2 };
        const manager = new LiveLocationManager({
          client,
          getDeviceId,
          watchLocation: makeWatchLocation([newCoords]),
        });

        await manager.init();
        expect(manager.messages).toHaveLength(1);
        client.dispatchEvent({
          message: {
            id: liveLocation.message_id,
            shared_location: undefined,
            type: 'regular',
            user,
          },
          type: 'message.updated',
        });
        vi.waitFor(() => {
          expect(manager.messages).toHaveLength(0);
        });
      });

      it('unregisters a message if its live location has been changed to static location', async () => {
        const client = await getClientWithUser(user);
        vi.spyOn(client, 'getSharedLocations').mockResolvedValue({
          active_live_locations: [liveLocation],
          duration: '',
        });
        vi.spyOn(client, 'updateLocation').mockResolvedValue(liveLocation);
        const newCoords = { latitude: 2, longitude: 2 };
        const manager = new LiveLocationManager({
          client,
          getDeviceId,
          watchLocation: makeWatchLocation([newCoords]),
        });

        await manager.init();
        expect(manager.messages).toHaveLength(1);
        const newEndAt = '1970-01-01T08:08:08.532Z';
        client.dispatchEvent({
          message: {
            id: liveLocation.message_id,
            shared_location: { ...liveLocation, end_at: undefined },
            type: 'regular',
            user,
          },
          type: 'message.updated',
        });
        vi.waitFor(() => {
          expect(manager.messages).toHaveLength(0);
        });
      });

      it('unregisters a message if the updated message has end_at in the past', async () => {
        const client = await getClientWithUser(user);
        vi.spyOn(client, 'getSharedLocations').mockResolvedValue({
          active_live_locations: [liveLocation],
          duration: '',
        });
        vi.spyOn(client, 'updateLocation').mockResolvedValue(liveLocation);
        const newCoords = { latitude: 2, longitude: 2 };
        const manager = new LiveLocationManager({
          client,
          getDeviceId,
          watchLocation: makeWatchLocation([newCoords]),
        });

        await manager.init();
        expect(manager.messages).toHaveLength(1);
        const newEndAt = '1970-01-01T08:08:08.532Z';
        client.dispatchEvent({
          message: {
            id: liveLocation.message_id,
            shared_location: { ...liveLocation, end_at: newEndAt },
            type: 'regular',
            user,
          },
          type: 'message.updated',
        });
        vi.waitFor(() => {
          expect(manager.messages).toHaveLength(0);
        });
      });
    });

    describe('live_location_sharing.stopped', () => {
      it('unregisters a message', async () => {
        const client = await getClientWithUser(user);
        vi.spyOn(client, 'getSharedLocations').mockResolvedValue({
          active_live_locations: [liveLocation],
          duration: '',
        });
        vi.spyOn(client, 'updateLocation').mockResolvedValue(liveLocation);
        const newCoords = { latitude: 2, longitude: 2 };
        const manager = new LiveLocationManager({
          client,
          getDeviceId,
          watchLocation: makeWatchLocation([newCoords]),
        });

        await manager.init();
        expect(manager.messages).toHaveLength(1);
        client.dispatchEvent({
          live_location: liveLocation,
          type: 'live_location_sharing.stopped',
        });
        vi.waitFor(() => {
          expect(manager.messages).toHaveLength(0);
        });
      });
    });

    describe('message.deleted', () => {
      it('unregisters a message', async () => {
        const client = await getClientWithUser(user);
        vi.spyOn(client, 'getSharedLocations').mockResolvedValue({
          active_live_locations: [liveLocation],
          duration: '',
        });
        vi.spyOn(client, 'updateLocation').mockResolvedValue(liveLocation);
        const newCoords = { latitude: 2, longitude: 2 };
        const manager = new LiveLocationManager({
          client,
          getDeviceId,
          watchLocation: makeWatchLocation([newCoords]),
        });

        await manager.init();
        expect(manager.messages).toHaveLength(1);
        client.dispatchEvent({
          message: {
            id: liveLocation.message_id,
            shared_location: liveLocation,
            type: 'regular',
            user,
          },
          type: 'message.deleted',
        });
        vi.waitFor(() => {
          expect(manager.messages).toHaveLength(0);
        });
      });
    });
  });

  describe('getters', async () => {
    it('deviceId is calculated only once', async () => {
      const client = await getClientWithUser(user);
      vi.spyOn(client, 'getSharedLocations').mockResolvedValue({
        active_live_locations: [liveLocation],
        duration: '',
      });
      vi.spyOn(client, 'updateLocation').mockResolvedValue(liveLocation);
      const getDeviceId = vi
        .fn()
        .mockReturnValueOnce(deviceId)
        .mockReturnValueOnce('xxx');
      const manager = new LiveLocationManager({
        client,
        getDeviceId,
        watchLocation,
      });
      expect(manager.deviceId).toBe(deviceId);
      expect(manager.deviceId).toBe(deviceId);
    });
  });
});
