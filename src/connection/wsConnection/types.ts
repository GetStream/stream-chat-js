import type { StableWSConnection } from '../../connection';

export type WSConnectionState = {
  /** Whether the WebSocket, or the long-poll after an `enableWSFallback` switch, is up. */
  isHealthy: boolean;
  lastHealthyAt: Date | null;
  lastUnhealthyAt: Date | null;
};

/** The WebSocket's settings. Timings are in milliseconds. */
export type WSConnectionConfig = {
  /** How long `connect()` waits for the server's `connection.ok` before giving up. Default 15s. */
  connectTimeoutMs: number;
  /**
   * Falls back to HTTP long-polling, for networks that block WebSockets, when the WebSocket cannot
   * connect within {@link connectTimeoutMs} (lower it to switch sooner) and the device is not known
   * to be offline. Defaults to `false`; most integrators do not need it. The client dispatches
   * `connection.fallback_activated` (`mode: 'longpoll'`) on the switch and stays on long-poll.
   */
  enableWSFallback: boolean;
  /**
   * How often a health-check ping goes out while the socket is up. Defaults to 25s, which is also the
   * maximum (a slower ping risks an idle close), so it can only be lowered. See
   * {@link WS_CONNECTION_CONFIG_BOUNDS}.
   */
  pingIntervalMs: number;
  /**
   * Extra time on top of {@link pingIntervalMs} before the health check declares the socket dead
   * (the check fires after `pingIntervalMs + healthCheckGracePeriodMs` of silence).
   */
  healthCheckGracePeriodMs: number;
  /**
   * How long a drop must last before a UI reports it. Defaults to 5s. Nothing in this package waits
   * on it; it is configuration so the UI SDKs share one value.
   */
  offlineNotificationDisplayDelayMs: number;
  /** The `WebSocket` constructor to open the socket with. Defaults to the global one. */
  webSocketImpl: typeof WebSocket | undefined;
  /** Extra query parameters appended to the WebSocket URL. */
  urlParams: URLSearchParams | undefined;
  /**
   * A pre-built socket to use instead of constructing one (honoured only when `client.node` is true).
   * `client.config.reset()` clears it, so the next `connect()` opens a live WebSocket.
   */
  connection: StableWSConnection | undefined;
};
