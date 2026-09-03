import { describe, expect, it, vi } from 'vitest';
import {
  Coords,
  LiveLocationManager,
  LiveLocationManagerConstructorParameters,
  msToNs,
  SharedLiveLocationResponse,
  StreamChat,
  UPDATE_LIVE_LOCATION_REQUEST_MIN_THROTTLE_TIMEOUT,
  WatchLocationHandler,
} from '../../src';
import { getClientWithUser } from './test-utils/getClient';
import { convertDateToTimestamp } from './test-utils/time';
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
    created_at: convertDateToTimestamp('2026-01-01T00:00:00.000Z'),
    created_by_device_id: 'created_by_device_id',
    end_at: convertDateToTimestamp('9999-12-31T23:59:59.535Z'),
    latitude: 1,
    longitude: 2,
    message_id: 'liveLocation_message_id',
    updated_at: convertDateToTimestamp('2026-01-01T00:00:00.000Z'),
    user_id: user.id,
  };
  const liveLocation2: SharedLiveLocationResponse = {
    channel_cid: 'channel_cid2',
    created_at: convertDateToTimestamp('2026-01-01T00:00:00.000Z'),
    created_by_device_id: 'created_by_device_id',
    end_at: convertDateToTimestamp('9999-12-31T23:59:59.535Z'),
    latitude: 1,
    longitude: 2,
    message_id: 'liveLocation_message_id2',
    updated_at: convertDateToTimestamp('2026-01-01T00:00:00.000Z'),
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
      // @ts-expect-error accessing private property
      expect(manager.getDeviceId).toEqual(getDeviceId);
      // @ts-expect-error accessing private property
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
      const getUserLiveLocationsSpy = vi
        .spyOn(client, 'getUserLiveLocations')
        .mockResolvedValue({ active_live_locations: [], duration: '' });
      const manager = new LiveLocationManager({
        client,
        getDeviceId,
        watchLocation,
      });

      expect(getUserLiveLocationsSpy).toHaveBeenCalledTimes(0);
      expect(manager.stateIsReady).toBeFalsy();
      await manager.init();
      expect(getUserLiveLocationsSpy).toHaveBeenCalledTimes(1);
      expect(manager.hasSubscriptions).toBeTruthy();
      // @ts-expect-error accessing private attribute
      expect(manager.refCount).toBe(1);

      await manager.init();
      expect(getUserLiveLocationsSpy).toHaveBeenCalledTimes(1);
      expect(manager.hasSubscriptions).toBeTruthy();
      expect(manager.stateIsReady).toBeTruthy();
      // @ts-expect-error accessing private attribute
      expect(manager.refCount).toBe(2);
    });

    it('unregisters subscriptions', async () => {
      const client = await getClientWithUser({ id: 'user-abc' });
      const getUserLiveLocationsSpy = vi
        .spyOn(client, 'getUserLiveLocations')
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

    /**
     * The configuration subscription is registered by the constructor, not by `registerSubscriptions`, and
     * nothing re-registers it — so releasing it while another caller still holds the manager stops a
     * still-live instance from ever seeing `client.config` again. `super.unregisterSubscriptions()` returns
     * the same marker symbol on both paths, so only `hasSubscriptions` can tell a decrement from a real
     * teardown.
     */
    describe('configuration subscription lifecycle', () => {
      const makeManager = async (client: StreamChat) => {
        vi.spyOn(client, 'getUserLiveLocations').mockResolvedValue({
          active_live_locations: [],
          duration: '',
        });
        const manager = new LiveLocationManager({
          client,
          getDeviceId,
          watchLocation,
        });
        await manager.init();
        return manager;
      };

      it('survives a caller leaving while another still holds the manager', async () => {
        const client = await getClientWithUser({ id: 'user-refcount' });
        const manager = await makeManager(client);

        // A second consumer joins, then leaves. The first is still holding on.
        manager.registerSubscriptions();
        manager.unregisterSubscriptions();

        expect(manager.hasSubscriptions).toBeTruthy();

        client.config.set({ liveLocationManager: { minUpdateThrottleMs: 7000 } });

        expect(manager.config.minUpdateThrottleMs).toBe(7000);
      });

      it('still reaches the manager after several overlapping callers leave', async () => {
        const client = await getClientWithUser({ id: 'user-refcount-many' });
        const manager = await makeManager(client);

        manager.registerSubscriptions();
        manager.registerSubscriptions();
        manager.unregisterSubscriptions();
        manager.unregisterSubscriptions();

        expect(manager.hasSubscriptions).toBeTruthy();

        client.config.set({ liveLocationManager: { minUpdateThrottleMs: 9000 } });

        expect(manager.config.minUpdateThrottleMs).toBe(9000);
      });

      it('keeps tracking config after a full unregister', async () => {
        const client = await getClientWithUser({ id: 'user-last-caller' });
        const manager = await makeManager(client);

        // Event subscriptions are ref-counted and this releases them; configuration is not, and lives for
        // the instance. A manager whose subscriptions are re-registered later is still configurable.
        manager.unregisterSubscriptions();
        expect(manager.hasSubscriptions).toBeFalsy();

        client.config.set({ liveLocationManager: { minUpdateThrottleMs: 7000 } });

        expect(manager.config.minUpdateThrottleMs).toBe(7000);
      });

      it('stops tracking config after dispose', async () => {
        const client = await getClientWithUser({ id: 'user-dispose' });
        const manager = await makeManager(client);
        const before = manager.config.minUpdateThrottleMs;

        manager.dispose();

        client.config.set({ liveLocationManager: { minUpdateThrottleMs: 7000 } });

        expect(manager.config.minUpdateThrottleMs).toBe(before);
      });

      it('is configurable again after dispose and re-registration', async () => {
        const client = await getClientWithUser({ id: 'user-strictmode' });
        const manager = await makeManager(client);

        // React StrictMode runs mount → cleanup → mount against one instance. If dispose were
        // unrecoverable, the re-mounted manager would be permanently deaf to `client.config`.
        manager.unregisterSubscriptions();
        manager.dispose();
        manager.registerSubscriptions();

        client.config.set({ liveLocationManager: { minUpdateThrottleMs: 7000 } });

        expect(manager.config.minUpdateThrottleMs).toBe(7000);
      });

      it('re-runs the setup function when re-registered after dispose', async () => {
        const client = await getClientWithUser({ id: 'user-strictmode-setup' });
        const teardown = vi.fn();
        const setup = vi.fn(() => teardown);
        client.config.setSetupFunction('liveLocationManager', setup);

        const manager = await makeManager(client);
        expect(setup).toHaveBeenCalledTimes(1);

        manager.dispose();
        expect(teardown).toHaveBeenCalledTimes(1);

        manager.registerSubscriptions();

        expect(setup).toHaveBeenCalledTimes(2);
      });

      it('leaves event subscriptions alone on dispose', async () => {
        const client = await getClientWithUser({ id: 'user-dispose-subs' });
        const manager = await makeManager(client);

        manager.dispose();

        // `dispose` is the configuration teardown only — the ref-counted half stays with
        // `unregisterSubscriptions`.
        expect(manager.hasSubscriptions).toBeTruthy();
      });
    });

    describe('message addition or removal', () => {
      it('does not update active location if there are no active live locations', async () => {
        const client = await getClientWithUser({ id: 'user-abc' });
        const getUserLiveLocationsSpy = vi
          .spyOn(client, 'getUserLiveLocations')
          .mockResolvedValue({ active_live_locations: [], duration: '' });
        const updateLocationSpy = vi
          .spyOn(client, 'updateLiveLocation')
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
        const getUserLiveLocationsSpy = vi
          .spyOn(client, 'getUserLiveLocations')
          .mockResolvedValue({ active_live_locations: [liveLocation], duration: '' });
        const updateLocationSpy = vi
          .spyOn(client, 'updateLiveLocation')
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
        vi.spyOn(client, 'getUserLiveLocations').mockResolvedValue({
          active_live_locations: [liveLocation],
          duration: '',
        });
        const updateLocationSpy = vi
          .spyOn(client, 'updateLiveLocation')
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
          message_id: liveLocation.message_id,
          ...newCoords,
        });
        expect(manager.messages).toHaveLength(1);
      });

      it('does not update active location if returning to 0 locations', async () => {
        const client = await getClientWithUser({ id: 'user-abc' });
        vi.spyOn(client, 'getUserLiveLocations').mockResolvedValue({
          active_live_locations: [liveLocation],
          duration: '',
        });
        const updateLocationSpy = vi
          .spyOn(client, 'updateLiveLocation')
          .mockResolvedValue(liveLocation);
        const newCoords = { latitude: 2, longitude: 2 };
        const manager = new LiveLocationManager({
          client,
          getDeviceId,
          watchLocation: makeWatchLocation([newCoords]),
        });

        await manager.init();

        // @ts-expect-error accessing private property
        manager.unregisterMessages([liveLocation.message_id]);
        expect(updateLocationSpy).toHaveBeenCalledTimes(1);
        expect(manager.messages).toHaveLength(0);
      });

      it('requests the live location upon adding a first message', async () => {
        const client = await getClientWithUser(user);
        vi.spyOn(client, 'getUserLiveLocations').mockResolvedValue({
          active_live_locations: [],
          duration: '',
        });
        const updateLocationSpy = vi
          .spyOn(client, 'updateLiveLocation')
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
        vi.spyOn(client, 'getUserLiveLocations').mockResolvedValue({
          active_live_locations: [],
          duration: '',
        });
        const updateLocationSpy = vi
          .spyOn(client, 'updateLiveLocation')
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
        vi.spyOn(client, 'getUserLiveLocations').mockResolvedValue({
          active_live_locations: [],
          duration: '',
        });
        const updateLocationSpy = vi
          .spyOn(client, 'updateLiveLocation')
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

        vi.waitFor(() => {
          expect(updateLocationSpy).toHaveBeenCalledTimes(1);
          expect(updateLocationSpy).toHaveBeenCalledWith({
            created_by_device_id: liveLocation.created_by_device_id,
            message_id: liveLocation.message_id,
            ...newCoords,
          });
          expect(manager.messages).toHaveLength(2);
        });
        vi.useRealTimers();
      });

      it('throttles live location update requests upon multiple watcher coords emissions under min throttle timeout', async () => {
        const client = await getClientWithUser(user);
        vi.spyOn(client, 'getUserLiveLocations').mockResolvedValue({
          active_live_locations: [liveLocation],
          duration: '',
        });
        const updateLocationSpy = vi
          .spyOn(client, 'updateLiveLocation')
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
        vi.spyOn(client, 'getUserLiveLocations').mockResolvedValue({
          active_live_locations: [liveLocation],
          duration: '',
        });
        const updateLocationSpy = vi
          .spyOn(client, 'updateLiveLocation')
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

      it('prevents live location update requests for expired live locations', async () => {
        vi.useFakeTimers();
        const client = await getClientWithUser(user);
        vi.spyOn(client, 'getUserLiveLocations').mockResolvedValue({
          active_live_locations: [
            {
              ...liveLocation,
              end_at: msToNs(
                Date.now() + UPDATE_LIVE_LOCATION_REQUEST_MIN_THROTTLE_TIMEOUT - 1000,
              ),
            },
          ],
          duration: '',
        });
        const updateLocationSpy = vi
          .spyOn(client, 'updateLiveLocation')
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
          expect(updateLocationSpy).toHaveBeenCalledTimes(1);
        });

        vi.useRealTimers();
      });
    });

    describe('live_location_sharing.started', () => {
      it('registers a new message', async () => {
        const client = await getClientWithUser(user);
        vi.spyOn(client, 'getUserLiveLocations').mockResolvedValue({
          active_live_locations: [],
          duration: '',
        });
        vi.spyOn(client, 'updateLiveLocation').mockResolvedValue(liveLocation);
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
        vi.spyOn(client, 'getUserLiveLocations').mockResolvedValue({
          active_live_locations: [],
          duration: '',
        });
        vi.spyOn(client, 'updateLiveLocation').mockResolvedValue(liveLocation);
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
        vi.spyOn(client, 'getUserLiveLocations').mockResolvedValue({
          active_live_locations: [{ ...liveLocation, end_at: msToNs(Date.now()) }],
          duration: '',
        });
        vi.spyOn(client, 'updateLiveLocation').mockResolvedValue(liveLocation);
        const newCoords = { latitude: 2, longitude: 2 };
        const manager = new LiveLocationManager({
          client,
          getDeviceId,
          watchLocation: makeWatchLocation([newCoords]),
        });

        await manager.init();
        vi.waitFor(() => {
          expect(manager.messages).toHaveLength(1);
        });
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
        vi.spyOn(client, 'getUserLiveLocations').mockResolvedValue({
          active_live_locations: [],
          duration: '',
        });
        vi.spyOn(client, 'updateLiveLocation').mockResolvedValue(liveLocation);
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
        vi.spyOn(client, 'getUserLiveLocations').mockResolvedValue({
          active_live_locations: [],
          duration: '',
        });
        vi.spyOn(client, 'updateLiveLocation').mockResolvedValue(liveLocation);
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
        vi.spyOn(client, 'getUserLiveLocations').mockResolvedValue({
          active_live_locations: [liveLocation],
          duration: '',
        });
        vi.spyOn(client, 'updateLiveLocation').mockResolvedValue(liveLocation);
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
        vi.spyOn(client, 'getUserLiveLocations').mockResolvedValue({
          active_live_locations: [liveLocation],
          duration: '',
        });
        vi.spyOn(client, 'updateLiveLocation').mockResolvedValue(liveLocation);
        const newCoords = { latitude: 2, longitude: 2 };
        const manager = new LiveLocationManager({
          client,
          getDeviceId,
          watchLocation: makeWatchLocation([newCoords]),
        });

        await manager.init();
        expect(manager.messages).toHaveLength(1);
        const newEndAt = convertDateToTimestamp('1970-01-01T08:08:08.532Z');
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
        vi.spyOn(client, 'getUserLiveLocations').mockResolvedValue({
          active_live_locations: [liveLocation],
          duration: '',
        });
        vi.spyOn(client, 'updateLiveLocation').mockResolvedValue(liveLocation);
        const newCoords = { latitude: 2, longitude: 2 };
        const manager = new LiveLocationManager({
          client,
          getDeviceId,
          watchLocation: makeWatchLocation([newCoords]),
        });

        await manager.init();
        expect(manager.messages).toHaveLength(1);
        const newEndAt = convertDateToTimestamp('1970-01-01T08:08:08.532Z');
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
        vi.spyOn(client, 'getUserLiveLocations').mockResolvedValue({
          active_live_locations: [liveLocation],
          duration: '',
        });
        vi.spyOn(client, 'updateLiveLocation').mockResolvedValue(liveLocation);
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
        vi.spyOn(client, 'getUserLiveLocations').mockResolvedValue({
          active_live_locations: [liveLocation],
          duration: '',
        });
        vi.spyOn(client, 'updateLiveLocation').mockResolvedValue(liveLocation);
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
      vi.spyOn(client, 'getUserLiveLocations').mockResolvedValue({
        active_live_locations: [liveLocation],
        duration: '',
      });
      vi.spyOn(client, 'updateLiveLocation').mockResolvedValue(liveLocation);
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
  describe('stop-sharing timer', () => {
    // `setTimeout` clamps a delay past 2^31-1 ms (~24.9 days) to 1 ms, and only a minimum share
    // duration is enforced, so a long share used to unregister itself on the next tick.
    it('keeps a share whose expiry is beyond the maximum timeout delay', async () => {
      vi.useFakeTimers();
      try {
        const client = await getClientWithUser(user);
        const farFuture = { ...liveLocation, end_at: msToNs(Date.now() + 90 * 86400000) };
        vi.spyOn(client, 'getUserLiveLocations').mockResolvedValue({
          active_live_locations: [farFuture],
          duration: '',
        });
        const manager = new LiveLocationManager({ client, getDeviceId, watchLocation });

        await manager.init();
        expect(manager.messages.size).toBe(1);

        await vi.advanceTimersByTimeAsync(2 ** 31 - 1);
        // Re-armed rather than expired: still tracked, and holding a fresh handle to clear.
        expect(manager.messages.size).toBe(1);
        expect(
          manager.messages.get(farFuture.message_id)?.stopSharingTimeout,
        ).not.toBeNull();
      } finally {
        vi.useRealTimers();
      }
    });

    it('unregisters a share once its expiry actually arrives', async () => {
      vi.useFakeTimers();
      try {
        const client = await getClientWithUser(user);
        const soon = { ...liveLocation, end_at: msToNs(Date.now() + 60_000) };
        vi.spyOn(client, 'getUserLiveLocations').mockResolvedValue({
          active_live_locations: [soon],
          duration: '',
        });
        const manager = new LiveLocationManager({ client, getDeviceId, watchLocation });

        await manager.init();
        expect(manager.messages.size).toBe(1);

        await vi.advanceTimersByTimeAsync(60_001);
        expect(manager.messages.size).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    // `end_at` is optional on the wire even though the overlay type marks it required, and
    // `undefined < nowNs()` is `false` — so an unguarded filter kept it and scheduled NaN.
    it.each([
      ['absent', undefined],
      ['non-finite', Number.NaN],
    ])('does not track a share whose end_at is %s', async (_label, endAt) => {
      const client = await getClientWithUser(user);
      vi.spyOn(client, 'getUserLiveLocations').mockResolvedValue({
        active_live_locations: [
          { ...liveLocation, end_at: endAt } as unknown as SharedLiveLocationResponse,
        ],
        duration: '',
      });
      const manager = new LiveLocationManager({ client, getDeviceId, watchLocation });

      await manager.init();
      expect(manager.messages.size).toBe(0);
    });
  });
});
