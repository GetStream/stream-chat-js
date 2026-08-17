import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getClientWithUser } from '../test-utils/getClient';
import { LiveLocationManager } from '../../../src/LiveLocationManager';
import { SearchController } from '../../../src/search/SearchController';
import { DEFAULT_LIVE_LOCATION_MANAGER_CONFIG } from '../../../src/LiveLocationManager';
import { DEFAULT_SEARCH_CONTROLLER_CONFIG } from '../../../src/search/SearchController';
import type { StreamChat } from '../../../src/client';

/**
 * `LiveLocationManager` and `SearchController` are the two configurable classes this package never
 * constructs — an app or a downstream SDK does (`useLiveLocationSharingManager` and `<Chat>` in
 * `stream-chat-react`). There is no owner to hand them a declarative slice, so they register themselves
 * against their own key, the way a `MessageComposer` does.
 *
 * That is also why they were absent from the tree until now: not an oversight about *whether* they were
 * configurable, but no route by which configuration could reach them.
 */
describe('entities that register themselves', () => {
  let client: StreamChat;

  beforeEach(() => {
    client = getClientWithUser({ id: 'user' });
  });

  const makeLiveLocation = () =>
    new LiveLocationManager({
      client,
      getDeviceId: () => 'device',
      watchLocation: () => () => undefined,
    });

  describe('LiveLocationManager', () => {
    it('reads a registration made before it was constructed', () => {
      client.config.set({ liveLocationManager: { minUpdateThrottleMs: 9_000 } });

      expect(makeLiveLocation().config.minUpdateThrottleMs).toBe(9_000);
    });

    it('reacts to a registration made afterwards', () => {
      const manager = makeLiveLocation();

      client.config.set({ liveLocationManager: { minUpdateThrottleMs: 7_000 } });

      expect(manager.config.minUpdateThrottleMs).toBe(7_000);
    });

    it('takes part in reset', () => {
      const manager = makeLiveLocation();
      client.config.set({ liveLocationManager: { minUpdateThrottleMs: 7_000 } });

      client.config.reset();

      expect(manager.config.minUpdateThrottleMs).toBe(
        DEFAULT_LIVE_LOCATION_MANAGER_CONFIG.minUpdateThrottleMs,
      );
    });

    it('runs a setup function, and its teardown on unregister', () => {
      const teardown = vi.fn();
      const setup = vi.fn(() => teardown);
      client.config.setSetupFunction('liveLocationManager', setup);

      const manager = makeLiveLocation();
      expect(setup).toHaveBeenCalledWith({ liveLocationManager: manager });

      manager.registerSubscriptions();
      manager.unregisterSubscriptions();

      expect(teardown).toHaveBeenCalledTimes(1);
    });

    it('stops hearing changes once unregistered', () => {
      const manager = makeLiveLocation();
      manager.registerSubscriptions();
      manager.unregisterSubscriptions();

      client.config.set({ liveLocationManager: { minUpdateThrottleMs: 7_000 } });

      expect(manager.config.minUpdateThrottleMs).toBe(
        DEFAULT_LIVE_LOCATION_MANAGER_CONFIG.minUpdateThrottleMs,
      );
    });
  });

  describe('SearchController', () => {
    it('reads a registration when constructed with a client', () => {
      client.config.set({ searchController: { keepSingleActiveSource: false } });

      expect(new SearchController({ client }).config.keepSingleActiveSource).toBe(false);
    });

    it('reacts to a registration made afterwards', () => {
      const controller = new SearchController({ client });

      client.config.set({ searchController: { keepSingleActiveSource: false } });

      expect(controller.config.keepSingleActiveSource).toBe(false);
    });

    it('lets a construction argument outrank the declarative tree', () => {
      // docs §3: stage 3 beats stage 2, the same rule every other entity follows.
      client.config.set({ searchController: { keepSingleActiveSource: false } });

      const controller = new SearchController({
        client,
        config: { keepSingleActiveSource: true },
      });

      expect(controller.config.keepSingleActiveSource).toBe(true);
    });

    it('without a client, still works but hears nothing', () => {
      // The documented caveat. `updateConfig` keeps working; only the declarative key goes unheard.
      const controller = new SearchController();

      client.config.set({ searchController: { keepSingleActiveSource: false } });
      expect(controller.config.keepSingleActiveSource).toBe(
        DEFAULT_SEARCH_CONTROLLER_CONFIG.keepSingleActiveSource,
      );

      controller.updateConfig({ keepSingleActiveSource: false });
      expect(controller.config.keepSingleActiveSource).toBe(false);
    });

    it('stops hearing changes after dispose', () => {
      const controller = new SearchController({ client });
      controller.dispose();

      client.config.set({ searchController: { keepSingleActiveSource: false } });

      expect(controller.config.keepSingleActiveSource).toBe(true);
    });
  });
});
