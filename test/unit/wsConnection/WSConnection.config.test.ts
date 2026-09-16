import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamChat } from '../../../src/client';
import { chatLoggerSystem } from '../../../src/logger';
import { StableWSConnection } from '../../../src/connection';
import {
  DEFAULT_WS_CONNECTION_CONFIG,
  WS_NETWORK_RECOVERY_RETRY_MS,
  WS_OFFLINE_ANNOUNCE_DELAY_MS,
} from '../../../src/connection';

describe('client.wsConnection configuration', () => {
  let client: StreamChat;

  beforeEach(() => {
    client = new StreamChat('api-key-ws-config');
  });

  describe('defaults', () => {
    it('carries the exact timings release-v10 used', () => {
      // Literals on purpose, not the constants — asserting `X === X` would let a value change
      // through, and these five *are* the contract. Centralizing them was meant to make them
      // findable, not to be an opportunity to retune them. Change one only deliberately, and expect
      // this test to be the thing that asks whether you meant to.
      expect(client.wsConnection.config.connectTimeoutMs).toBe(15000);
      expect(client.wsConnection.config.pingIntervalMs).toBe(25000);
      expect(
        new StableWSConnection({ wsConnection: client.wsConnection })
          .connectionCheckTimeout,
      ).toBe(35000);
      expect(WS_OFFLINE_ANNOUNCE_DELAY_MS).toBe(5000);
      expect(WS_NETWORK_RECOVERY_RETRY_MS).toBe(10);
    });

    it('resolves the package defaults', () => {
      // Every field listed, including the `undefined` ones: Vitest's `toEqual` treats an
      // `undefined` property as absent, so omitting them here would silently stop covering them.
      expect(client.wsConnection.config).toEqual({
        connectTimeoutMs: 15_000,
        pingIntervalMs: 25_000,
        healthCheckGracePeriodMs: 10_000,
        webSocketImpl: undefined,
        urlParams: undefined,
        connection: undefined,
      });
      expect(Object.keys(client.wsConnection.config)).toHaveLength(6);
    });

    it('keeps the 25s ping / 35s connection check pair the socket documents', () => {
      const socket = new StableWSConnection({ wsConnection: client.wsConnection });

      expect(socket.pingInterval).toBe(25_000);
      expect(socket.connectionCheckTimeout).toBe(35_000);
    });
  });

  describe('the health-check derivation', () => {
    it('moves the connection check when the ping interval changes', () => {
      // The trap this test exists for: `connectionCheckTimeout` used to be computed once in the
      // constructor, so changing the ping interval left the connection check behind.
      // Downward, because 25s is the ceiling as well as the default.
      const socket = new StableWSConnection({ wsConnection: client.wsConnection });

      client.config.set({ client: { wsConnection: { pingIntervalMs: 10_000 } } });

      expect(socket.pingInterval).toBe(10_000);
      expect(socket.connectionCheckTimeout).toBe(20_000);
    });

    it('lets the grace period be widened without touching the ping interval', () => {
      const socket = new StableWSConnection({ wsConnection: client.wsConnection });

      client.wsConnection.updateConfig({ healthCheckGracePeriodMs: 30_000 });

      expect(socket.pingInterval).toBe(25_000);
      expect(socket.connectionCheckTimeout).toBe(55_000);
    });
  });

  describe('reading live rather than snapshotting', () => {
    it('reaches a socket that is already built', () => {
      const socket = new StableWSConnection({ wsConnection: client.wsConnection });

      client.wsConnection.updateConfig({ connectTimeoutMs: 1234 });

      // Not just the store — the value the socket would actually use.
      expect(socket.pingInterval).toBe(25_000);
      expect(client.wsConnection.config.connectTimeoutMs).toBe(1234);
    });

    it('falls back to the package defaults when the socket has no client yet', () => {
      // `options.wsConnection` allows this: a socket built before its client, handed one later
      // through `setClient`. Between those two moments there is nothing to read configuration from.
      const orphan = new StableWSConnection({} as never);

      expect(orphan.pingInterval).toBe(DEFAULT_WS_CONNECTION_CONFIG.pingIntervalMs);
      expect(orphan.connectionCheckTimeout).toBe(35_000);
    });
  });

  describe('what is deliberately not configurable', () => {
    it('exposes every WebSocket input that was already reachable, and nothing invented', () => {
      // The line this draws: everything the socket reads is here, and nothing that was previously
      // unreachable is. The three timings were public mutable fields (`client.defaultWSTimeout`,
      // `StableWSConnection.pingInterval`, `.connectionCheckTimeout`); `webSocketImpl`, `urlParams`
      // and `connection` were `StreamChatOptions` entries read only by the socket. All six were
      // already reachable — the change is that they are declared, typed and validated in one place.
      //
      // Excluded: the going-offline announce delay and the network-recovery retry. Both were bare
      // literals inside the socket that no caller could reach, so exposing them would be new surface
      // rather than a preserved capability.
      expect(Object.keys(client.wsConnection.config).sort()).toEqual([
        'connectTimeoutMs',
        'connection',
        'healthCheckGracePeriodMs',
        'pingIntervalMs',
        'urlParams',
        'webSocketImpl',
      ]);
    });

    it('leaves the internal timings inert when a slice names them anyway', () => {
      // Note what is *not* asserted: that the key is absent from the resolved config. The declarative
      // tree copies unknown keys straight through — `layer()` writes every own entry of the slice — so
      // the declared-key boundary is enforced by the compiler, not at runtime. A plain-JS caller can
      // therefore land a dead key in the resolved config. What matters is that nothing reads it.
      client.config.set({
        client: {
          // @ts-expect-error not part of the config — the point of the test
          wsConnection: { networkRecoveryRetryMs: 999 },
        },
      });
      const socket = new StableWSConnection({ wsConnection: client.wsConnection });
      const reconnect = vi.spyOn(socket, '_reconnect').mockResolvedValue(undefined);

      socket._applyNetworkStatus(true);

      // The constant, not the 999ms the slice asked for.
      expect(reconnect).toHaveBeenCalledWith({ interval: WS_NETWORK_RECOVERY_RETRY_MS });
    });
  });

  describe('bounds', () => {
    let warnings: string[];

    beforeEach(() => {
      warnings = [];
      // A sink rather than a spy on the logger: `withExtraTags()` returns a new object, so a spy on
      // the base logger's `warn` never sees the call.
      chatLoggerSystem.configureLoggers({
        client: {
          level: 'warn',
          sink: (level, message) => {
            if (level === 'warn') warnings.push(String(message));
          },
        },
      });
    });

    afterEach(() => {
      chatLoggerSystem.restoreDefaults();
    });

    it('refuses to raise the ping interval above the default, warning once', () => {
      // The cap *is* the default, so this setting can only ever ping more often, never less — a
      // slower ping risks the connection being closed for idleness.
      const capped = new StreamChat('api-key-ws-cap');
      const socket = new StableWSConnection({ wsConnection: capped.wsConnection });

      capped.config.set({ client: { wsConnection: { pingIntervalMs: 60_000 } } });

      expect(capped.wsConnection.config.pingIntervalMs).toBe(25_000);
      expect(socket.connectionCheckTimeout).toBe(35_000);
      // Once, not once per derivation — configuration is re-derived more than once at construction
      // alone, and a repeated warning for one bad value is noise.
      expect(warnings.filter((m) => m.includes('pingIntervalMs'))).toHaveLength(1);
    });

    it('floors the ping interval, so a few-millisecond interval cannot flood the server', () => {
      client.wsConnection.updateConfig({ pingIntervalMs: 5 });

      expect(client.wsConnection.config.pingIntervalMs).toBe(1_000);
    });

    it('floors the health-check grace period, which at zero kills a healthy socket', () => {
      // A grace period of zero puts the connection check exactly on the moment the next ping is due, so the socket
      // declares itself dead on a working connection and does it again after every reconnect. The
      // old absolute `connectionCheckTimeout` field allowed precisely this.
      client.wsConnection.updateConfig({ healthCheckGracePeriodMs: 0 });

      expect(client.wsConnection.config.healthCheckGracePeriodMs).toBe(1_000);
    });

    it('treats a non-finite value as out of range rather than passing it to setTimeout', () => {
      // `setTimeout(fn, NaN)` fires immediately, so an unclamped NaN would spin rather than fail.
      client.wsConnection.updateConfig({ pingIntervalMs: Number.NaN });

      expect(client.wsConnection.config.pingIntervalMs).toBe(1_000);
    });

    it('leaves connectTimeoutMs unbounded, which the tests rely on', () => {
      client.wsConnection.updateConfig({ connectTimeoutMs: 20 });

      expect(client.wsConnection.config.connectTimeoutMs).toBe(20);
    });
  });

  describe('the going-offline announce delay', () => {
    it('is advice for the UI and nothing this package waits on', () => {
      // The socket used to sit on a drop for this long before announcing it, so a brief flap did not
      // strobe a "connection lost" banner. That is a presentation decision, and the timer that
      // implemented it outlived the socket that armed it. The constant stays exported so the UI SDKs
      // debounce by the same amount; the status itself is published the moment it changes.
      vi.useFakeTimers();
      try {
        const socket = new StableWSConnection({ wsConnection: client.wsConnection });
        socket._setOnline(true);
        const dispatch = vi.spyOn(client, 'dispatchEvent');

        socket._setOnline(false);

        expect(client.wsConnection.state.getLatestValue().isOnline).toBe(false);
        vi.advanceTimersByTime(WS_OFFLINE_ANNOUNCE_DELAY_MS * 2);
        expect(dispatch).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe('the network-recovery retry', () => {
    it('is what the network-online path schedules its reconnect with', () => {
      const socket = new StableWSConnection({ wsConnection: client.wsConnection });
      const reconnect = vi.spyOn(socket, '_reconnect').mockResolvedValue(undefined);

      socket._applyNetworkStatus(true);

      expect(reconnect).toHaveBeenCalledWith({
        interval: WS_NETWORK_RECOVERY_RETRY_MS,
      });
    });
  });

  describe('declarative routing', () => {
    it('applies a slice given at construction', () => {
      const configured = new StreamChat('api-key-ws-declarative');
      configured.config.set({ client: { wsConnection: { connectTimeoutMs: 3_000 } } });

      expect(configured.wsConnection.config.connectTimeoutMs).toBe(3_000);
      // Untouched fields keep their defaults — this is a derivation from defaults plus the slice,
      // not a replacement of the whole config.
      expect(configured.wsConnection.config.pingIntervalMs).toBe(25_000);
    });

    it('restores the defaults on reset', () => {
      client.config.set({ client: { wsConnection: { connectTimeoutMs: 3_000 } } });
      expect(client.wsConnection.config.connectTimeoutMs).toBe(3_000);

      client.config.reset('client');

      expect(client.wsConnection.config.connectTimeoutMs).toBe(15_000);
    });
  });
});
