import type { StreamChat } from '../client';

export type WaitForWSConnectionOptions = {
  /**
   * How long to wait, in milliseconds. Defaults to `client.wsConnection.config.connectTimeoutMs`
   * (15s) — deliberately the same budget the socket itself gets to establish a connection, so the
   * wait is "as long as one connect attempt" rather than an arbitrary number, and it moves if that
   * setting is changed.
   */
  timeout?: number;
};

/**
 * Resolves once this client's WebSocket is up, so a caller that needs a live connection ID can wait
 * for one instead of degrading.
 *
 * `channel.watch()` and `client.queryChannels()` used to `await client.wsPromise` and then downgrade
 * to `watch: false` if there was no connection ID. That did not work in either direction: `wsPromise`
 * is only a pending promise while `openConnection()` is in flight and is already resolved during a
 * socket-internal reconnect, so the wait covered the wrong case — and the guard read the connection
 * ID, which is never cleared, so during a reconnect it did not downgrade at all and sent
 * `watch: true` against a dead connection. This waits on `client.wsConnection.state` instead, which
 * is written on every transition.
 *
 * **Rejects immediately when no socket is expected**, rather than burning the timeout: with no user
 * connected there is nothing to wait for, and after `client.closeConnection()` — the documented
 * mobile backgrounding path — the absence of a socket is deliberate. Without this, opening a channel
 * on a backgrounded app would block for the full timeout before failing.
 *
 * On timeout it rejects too, and the caller is expected to let that propagate: a failed watch leaves
 * the channel unwatched, offline support renders it from the local database, and
 * `ConnectionRecoveryManager` reloads it on the next reconnect — its `recoverableActiveChannels` is
 * filtered on `active`, never on `watchStatus`, precisely so a channel that failed to watch is not
 * abandoned.
 *
 * @internal
 */
export const waitForWSConnection = (
  client: StreamChat,
  {
    timeout = client.wsConnection.config.connectTimeoutMs,
  }: WaitForWSConnectionOptions = {},
): Promise<void> => {
  // Both, not just `isOnline`. The callers need a connection **id** — it is what the server keys a
  // watch by, and what `api-client` sends as `connection_id` — so resolving on the boolean alone let
  // a watched query go out before the id existed, and the server rejected it with "Watch or
  // ChatPresence requires an active websocket connection". The socket now assigns the id before
  // announcing it is up, so these move together; requiring both means a future reordering surfaces
  // as a wait that times out rather than as a 400.
  const isReady = () =>
    client.wsConnection.isOnline && !!client.wsConnection.connectionID;

  if (isReady()) return Promise.resolve();

  if (!client.userId) {
    return Promise.reject(
      new Error(
        'Cannot wait for a WebSocket connection: no user is connected. Call client.connectUser() first.',
      ),
    );
  }

  // No socket was ever built, so nothing is coming: `connect()` assigns `connection` synchronously
  // before it awaits anything, so a `null` here means `client.connect()` has not been called at all.
  // Waiting for a socket nobody asked to open would burn the whole timeout to reach the same failure.
  if (!client.wsConnection.connection) {
    return Promise.reject(
      new Error(
        'Cannot wait for a WebSocket connection: none has been opened. Call client.connectUser() or client.openConnection() first.',
      ),
    );
  }

  // `isDisconnected` is set only by `disconnect()`, which is what `closeConnection()` calls — so it
  // distinguishes "deliberately closed" from "down and trying to come back".
  if (client.wsConnection.connection?.isDisconnected) {
    return Promise.reject(
      new Error(
        'Cannot wait for a WebSocket connection: the connection was closed deliberately. Call client.openConnection() to reopen it.',
      ),
    );
  }

  return new Promise<void>((resolve, reject) => {
    let settled = false;
    // Initialised to a no-op rather than left undefined, because `StateStore.subscribe` invokes the
    // handler synchronously before returning — so on that first call the real unsubscribe does not
    // exist yet and `finish` would have nothing to call.
    let unsubscribe = () => undefined as void;

    const finish = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      outcome();
    };

    const timer = setTimeout(
      () =>
        finish(() =>
          reject(
            new Error(
              `Timed out after ${timeout}ms waiting for the WebSocket connection to come up.`,
            ),
          ),
        ),
      timeout,
    );

    unsubscribe = client.wsConnection.state.subscribe(() => {
      if (isReady()) finish(resolve);
    });

    // The synchronous first call cannot have resolved — the check above failed — but the socket can
    // have come up in between. Re-checked rather than assumed.
    if (isReady()) finish(resolve);
  });
};
