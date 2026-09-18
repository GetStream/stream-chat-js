import type { StableWSConnection } from '../../connection';

export type WSConnectionState = {
  /**
   * Is this client's WebSocket up.
   *
   * Deliberately the same field name as `client.networkConnection.state`'s — both answer the same
   * question about a different connection, which is why the two objects are named as parallels. The
   * types differ only where they must: this one is never `undefined`, because a socket always has a
   * state, so `!isHealthy` is safe here where the network's `isOnline` needs `=== false`.
   */
  isHealthy: boolean;
  lastHealthyAt: Date | null;
  lastUnhealthyAt: Date | null;
};

/**
 * The WebSocket's timing knobs.
 *
 * Declared, validated, and durable across reconnects. {@link offlineNotificationDisplayDelayMs} is
 * the odd one out: the only field here this package does not act on itself.
 *
 * The network-recovery retry is deliberately **not** configurable, and stays a constant in
 * `config.ts`: nothing could reach it, so exposing it would add surface rather than preserve it.
 *
 * All in **milliseconds**, and named with the unit, because a bare `pingInterval` reads equally well
 * as seconds.
 */
export type WSConnectionConfig = {
  /**
   * How long `connect()` waits for the server's `connection.ok` hello before giving up. The default
   * of 15s allows between two and three attempts of the underlying retry.
   */
  connectTimeoutMs: number;
  /**
   * How often a health-check ping goes out while the socket is up.
   *
   * **Can only be lowered.** 25s is both the default and the maximum, because a slower ping risks the
   * connection being closed for idleness. Shortening it makes a dead socket noticed sooner, since
   * {@link healthCheckGracePeriodMs} moves the connection check along with it. See
   * {@link WS_CONNECTION_CONFIG_BOUNDS}.
   */
  pingIntervalMs: number;
  /**
   * Extra room on top of {@link pingIntervalMs} before the health-check loop declares the socket
   * dead — the time a ping has to make its round trip. The connection check fires at
   * `pingIntervalMs + healthCheckGracePeriodMs`, so changing the ping interval moves the connection check with it.
   *
   * A grace period rather than an absolute deadline, because a deadline can be set shorter than the
   * ping interval, which makes the socket declare itself dead on a healthy connection and do it again
   * after every reconnect. A grace period cannot express that.
   */
  healthCheckGracePeriodMs: number;
  /**
   * How long a drop must last before a UI reports it. Defaults to 5s. Zero holds nothing back,
   * though a `setTimeout(…, 0)` still lands on the next task rather than synchronously.
   *
   * Most drops resolve in under a second, so a banner showing all of them makes a working application
   * look broken. **Nothing here waits on it** — it is configuration so the UI SDKs share one value.
   * `stream-chat-react`'s `<Chat>` reads it.
   */
  offlineNotificationDisplayDelayMs: number;
  /**
   * The `WebSocket` constructor to open the socket with. Defaults to the global one.
   *
   * For hosts that have no usable global — a Node process, or a test wanting a fake socket.
   */
  webSocketImpl: typeof WebSocket | undefined;
  /**
   * Extra query parameters to append to the WebSocket URL.
   */
  urlParams: URLSearchParams | undefined;
  /**
   * A pre-built socket to use instead of constructing one, re-parented through
   * {@link StableWSConnection.setWSConnection} when {@link WSConnection.connect} first runs.
   *
   * An instance is safe to hold here: `copyConfigPatch` passes class instances by reference so
   * identity is preserved, only package defaults are deep-frozen, and the equality check guarding a
   * config write short-circuits on `===`.
   *
   * `client.config.reset()` restores this to `undefined`, as it does every field, so a later
   * `connect()` builds a real socket and opens a live WebSocket. A socket already open is unaffected —
   * only the next connect. The catch is that the failure lands at that connect rather than at the
   * reset, so a test that injected a fake socket to stay off the network breaks somewhere other than
   * where it went wrong.
   */
  connection: StableWSConnection | undefined;
};
