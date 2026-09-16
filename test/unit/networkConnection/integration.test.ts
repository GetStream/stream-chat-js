import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamChat } from '../../../src';
import { StableWSConnection } from '../../../src/connection';
import { WS_NETWORK_RECOVERY_RETRY_MS } from '../../../src/connection';
import type { NetworkStatusReporter } from '../../../src';

/**
 * The whole chain, through public API only: an integrator-supplied registration function reports the
 * device's network, and the WebSocket reacts.
 *
 * Deliberately no DOM anywhere — no `window.addEventListener`, no `window.dispatchEvent`, no
 * synthesized `Event`. That is the point of the feature: before it, the only way to tell the SDK about
 * the network was to fake a browser event at a private member, which is what React Native does today.
 *
 * The pieces are unit-tested next door. What is proven here is that they compose, and — in the last
 * block — that the socket does not become *dependent* on the new signal.
 */

/** An integrator's registration function, of the shape a platform API would be wrapped in. */
const platformListener = () => {
  const unsubscribe = vi.fn();
  let report: ((isOnline: boolean) => void) | undefined;
  const reporter: NetworkStatusReporter = (onStatusChange) => {
    report = onStatusChange;
    return unsubscribe;
  };
  return {
    reporter,
    unsubscribe,
    report: (isOnline: boolean) => {
      if (!report) throw new Error('the reporter was never installed');
      report(isOnline);
    },
  };
};

const clientWithSocket = () => {
  const client = new StreamChat('api-key-e2e');
  const connection = new StableWSConnection({ client });
  client.wsConnection.connection = connection;
  client.wsConnection.registerSubscriptions();
  const reconnect = vi.spyOn(connection, '_reconnect').mockResolvedValue(undefined);
  return { client, connection, reconnect };
};

describe('network connection, end to end', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  describe('a reporter supplied through declarative configuration', () => {
    it('carries the device going offline and back through to a reconnect', () => {
      const { client, connection, reconnect } = clientWithSocket();
      const platform = platformListener();

      // The supported route in: no setter call, no private member, no DOM event.
      client.config.set({
        client: { networkConnection: { statusReporter: platform.reporter } },
      });

      // Nothing has been reported yet, so the network is *unknown* rather than online.
      expect(client.networkConnection.isOnline).toBeUndefined();

      connection._setOnline(true);
      expect(client.wsConnection.isOnline).toBe(true);

      platform.report(false);

      expect(client.networkConnection.isOnline).toBe(false);
      // The socket is marked down off the device's report, without waiting for its own 35s
      // connection check to notice.
      expect(client.wsConnection.isOnline).toBe(false);
      expect(reconnect).not.toHaveBeenCalled();

      platform.report(true);

      expect(client.networkConnection.isOnline).toBe(true);
      // A network that has just returned is the one moment an immediate retry is worth making, which
      // is what the short interval is for.
      expect(reconnect).toHaveBeenCalledWith({ interval: WS_NETWORK_RECOVERY_RETRY_MS });
    });

    it('leaves a healthy socket alone when the device network returns', () => {
      const { client, connection, reconnect } = clientWithSocket();
      const platform = platformListener();
      client.config.set({
        client: { networkConnection: { statusReporter: platform.reporter } },
      });

      connection._setOnline(true);
      platform.report(true);

      expect(reconnect).not.toHaveBeenCalled();
      expect(client.wsConnection.isOnline).toBe(true);
    });

    it('releases the platform listener when the client tears its subscriptions down', () => {
      const client = new StreamChat('api-key-teardown');
      const platform = platformListener();
      client.config.set({
        client: { networkConnection: { statusReporter: platform.reporter } },
      });

      // No `registerSubscriptions()` here: the client's constructor already made the one reference,
      // and `WithSubscriptions` is ref-counted — an extra register would take the count to two and
      // leave the platform listener installed after a single unregister.
      client.networkConnection.unregisterSubscriptions();

      expect(platform.unsubscribe).toHaveBeenCalled();
    });
  });

  describe('setStatus, the migration target for React Native', () => {
    it('reaches the socket the same way a reporter does', () => {
      const { client, connection, reconnect } = clientWithSocket();
      connection._setOnline(true);

      // No reporter at all here. This is the replacement for reaching into
      // `client.wsConnection.onlineStatusChanged` with a synthesized DOM event.
      client.networkConnection.setStatus(false);
      expect(client.wsConnection.isOnline).toBe(false);

      client.networkConnection.setStatus(true);
      expect(reconnect).toHaveBeenCalledWith({ interval: WS_NETWORK_RECOVERY_RETRY_MS });
    });
  });

  describe('with no reporter, network status is an accelerator and not a precondition', () => {
    it('keeps the network unknown rather than assuming either answer', () => {
      const { client } = clientWithSocket();

      expect(client.networkConnection.isOnline).toBeUndefined();
      expect(client.networkConnection.state.getLatestValue()).toEqual({
        isOnline: undefined,
        lastOnlineAt: null,
        lastOfflineAt: null,
      });
    });

    it('drops and recovers the socket exactly as it would without this feature', () => {
      const { client, connection } = clientWithSocket();
      const published: (boolean | undefined)[] = [];
      client.wsConnection.state.subscribeWithSelector(
        ({ isOnline }) => ({ isOnline }),
        ({ isOnline }) => published.push(isOnline),
      );
      published.length = 0;

      connection._setOnline(true);
      connection._setOnline(false);
      connection._setOnline(true);

      // Every transition, as it happens. There is no delayed announcement to wait out any more: a UI
      // that wants to sit on a drop debounces its own rendering.
      expect(published).toEqual([true, false, true]);
      expect(client.wsConnection.isOnline).toBe(true);
      // Unknown throughout — nothing fabricated a value to make the socket work.
      expect(client.networkConnection.isOnline).toBeUndefined();
    });

    it('still notices a dead socket on its own connection check', () => {
      // The guard that matters: every network check in the socket tests `=== false`, so an unknown
      // network must not read as offline *or* keep the socket from tearing itself down. This is the
      // recovery path that exists with or without a reporter.
      vi.useFakeTimers();
      const { client, connection, reconnect } = clientWithSocket();
      connection._setOnline(true);
      connection.lastEvent = new Date(0);

      connection.scheduleConnectionCheck();
      vi.advanceTimersByTime(connection.connectionCheckTimeout + 1);

      expect(reconnect).toHaveBeenCalled();
      expect(client.wsConnection.isOnline).toBe(false);
      expect(client.networkConnection.isOnline).toBeUndefined();
    });
  });
});
