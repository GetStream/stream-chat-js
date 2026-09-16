import type { StableWSConnection } from '../../connection';

export type WSConnectionState = {
  /**
   * Is this client's WebSocket up.
   *
   * Deliberately the same field name as `client.networkConnection.state`'s — both answer the same
   * question about a different connection, which is why the two objects are named as parallels. The
   * types differ only where they must: this one is never `undefined`, because a socket always has a
   * state, so `!isOnline` is safe here where the network's equivalent needs `=== false`.
   */
  isOnline: boolean;
  /**
   * The id the server keys channel watches by.
   *
   * Assigned when the socket announces itself and cleared when it goes down, so it always names a
   * connection the server still holds. It has to be: the server keys channel watches by this id and
   * rejects a request carrying one it has already closed, and this object outlives every socket it
   * wraps, so nothing else would clear it.
   *
   * `undefined` therefore means "no live connection", which is `isOnline === false` said a second
   * way. Both are required by `waitForWSConnection`, whose callers need the id rather than the
   * boolean.
   */
  connectionId: string | undefined;
  lastOnlineAt: Date | null;
  lastOfflineAt: Date | null;
};

/**
 * The WebSocket's timing knobs.
 *
 * Three of them were already public mutable fields before they were configuration —
 * `client.defaultWSTimeout`, `StableWSConnection.pingInterval` and
 * `StableWSConnection.connectionCheckTimeout`. Assigning to them worked, which is the only reason any
 * of this was tunable. So for those the change is that the capability is now declared, validated and
 * durable across the reconnects that used to silently reset it, rather than that new capability was
 * added.
 *
 * {@link offlineNotificationDisplayDelayMs} is the exception, and genuinely new. It is the only one
 * this package does not act on itself, which is why it was a constant first: see its own note.
 *
 * One timing is deliberately **not** here — the retry delay after the network returns. It was a bare
 * literal inside the socket, reachable by nobody, and inventing configuration for it would be adding
 * surface rather than preserving it. It lives as a constant in `src/wsConnection/config.ts`.
 *
 * All in **milliseconds**, and named with the unit, because a bare `pingInterval` reads equally well
 * as seconds and was in fact documented in seconds while being stored in milliseconds — for four
 * years, from 2019 until this branch.
 */
export type WSConnectionConfig = {
  /**
   * How long `connect()` waits for the server's `connection.ok` hello before giving up. The default
   * of 15s allows between two and three attempts of the underlying retry.
   *
   * Was `client.defaultWSTimeout`.
   */
  connectTimeoutMs: number;
  /**
   * How often a health-check ping goes out while the socket is up.
   *
   * Was `StableWSConnection.pingInterval` — reachable, but reset to the default by every reconnect,
   * because each connect built a fresh socket whose constructor reassigned it.
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
   * Replaces `StableWSConnection.connectionCheckTimeout`, which held the sum. Expressed as a grace
   * period rather than as the absolute deadline because the absolute form allowed a connection check *shorter* than
   * the ping interval, which makes the socket declare itself dead on a perfectly healthy connection
   * and do it again after every reconnect. A grace period cannot express that.
   */
  healthCheckGracePeriodMs: number;
  /**
   * How long a drop must last before a UI tells anyone about it. Defaults to 5s; zero shows it at
   * once.
   *
   * The socket retries on its own and most drops resolve in well under a second, so reporting them
   * immediately makes a working application look broken. A banner should wait this long and drop the
   * notification entirely if `client.wsConnection.state` reports the socket back inside the window,
   * which is what `stream-chat-react`'s `<Chat>` does.
   *
   * **Nothing in this package waits on it.** It is here rather than in each UI SDK so that they do
   * not drift apart, and so an integrator has one place to change it. Read as a property of the
   * connection — how long a drop must persist before it counts as one worth reporting — rather than
   * as a property of the banner that happens to render it.
   *
   * The socket used to own this wait, holding the announcement behind a timer that outlived the
   * socket that armed it. A discarded socket's status stays `false` forever, so a replaced connection
   * announced a drop that its replacement had already recovered from.
   */
  offlineNotificationDisplayDelayMs: number;
  /**
   * The `WebSocket` constructor to open the socket with. Defaults to the global one.
   *
   * For hosts that have no usable global — a Node process, or a test wanting a fake socket. Was
   * `StreamChatOptions.WebSocketImpl`; `webSocketImpl` here, because a config object of camelCase
   * fields should not have one PascalCase outlier.
   */
  webSocketImpl: typeof WebSocket | undefined;
  /**
   * Extra query parameters to append to the WebSocket URL.
   *
   * Was `StreamChatOptions.wsUrlParams`, and the `ws` prefix is dropped because this namespace
   * already says which connection it is about.
   */
  urlParams: URLSearchParams | undefined;
  /**
   * A pre-built socket to use instead of constructing one, handed the client through
   * {@link StableWSConnection.setClient} when {@link WSConnection.connect} first runs.
   *
   * Was `StreamChatOptions.wsConnection`. It lives here because this is the only WebSocket input the
   * socket's owner had to reach into the client's options bag to find, and nothing about the
   * configuration machinery objects to an instance: `copyConfigPatch` passes class instances through
   * by reference so identity is preserved, only package defaults are deep-frozen, and the equality
   * check that guards a config write short-circuits on `===`.
   *
   * `client.config.reset()` restores this to `undefined`, as it does every field, so a later
   * `connect()` builds a real socket and opens a live WebSocket. A socket already open is unaffected —
   * only the next connect. The catch is that the failure lands at that connect rather than at the
   * reset, so a test that injected a fake socket to stay off the network breaks somewhere other than
   * where it went wrong.
   */
  connection: StableWSConnection | undefined;
};
