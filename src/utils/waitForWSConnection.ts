import type { StreamChat } from '../client';

/**
 * The rejection an aborted wait produces.
 *
 * Shaped like the one `fetch` and `axios` raise for the same signal, so a caller that already
 * recognises an abort keeps recognising it whether the abort landed on the wait or on the request
 * the wait was for.
 */
const abortError = (signal: AbortSignal) => {
  const reason: unknown = signal.reason;
  if (reason instanceof Error) return reason;
  const error = new Error('The wait for a WebSocket connection was aborted.');
  error.name = 'AbortError';
  return error;
};

export type WaitForWSConnectionOptions = {
  /**
   * How long to wait, in milliseconds. Defaults to `client.wsConnection.config.connectTimeoutMs`
   * (15s) — deliberately the same budget the socket itself gets to establish a connection, so the
   * wait is "as long as one connect attempt" rather than an arbitrary number, and it moves if that
   * setting is changed.
   */
  timeout?: number;
  /**
   * Aborts the wait. The same signal the caller passes to the request it is waiting to issue, so
   * abandoning that request abandons the wait with it rather than leaving a timer to run out.
   */
  signal?: AbortSignal;
};

/**
 * Resolves once this client's WebSocket is up, so a caller that needs a live connection ID can wait
 * for one instead of degrading.
 *
 * Waits on `client.wsConnection.state`, which is written on every transition, rather than on
 * `client.wsPromise`, which is already resolved during a socket-internal reconnect.
 *
 * **Rejects immediately when no socket is expected**, rather than burning the timeout: with no user
 * connected there is nothing to wait for, and after `client.closeConnection()` — the documented
 * mobile backgrounding path — the absence of a socket is deliberate.
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
    signal,
    timeout = client.wsConnection.config.connectTimeoutMs,
  }: WaitForWSConnectionOptions = {},
): Promise<void> => {
  // Both, not just `isOnline`. The callers need a connection **id** — it is what the server keys a
  // watch by, and what `api-client` sends as `connection_id`. The socket assigns the id before
  // announcing it is up, so requiring both means a reordering surfaces here as a wait that times out
  // rather than as a 400 from the server.
  const isReady = () =>
    client.wsConnection.isOnline && !!client.wsConnection.connectionID;

  if (isReady()) return Promise.resolve();

  // Before the rejections below, so an already-abandoned call reports the abort rather than
  // complaining about a connection nobody is waiting for.
  if (signal?.aborted) return Promise.reject(abortError(signal));

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
    let removeAbortListener = () => undefined as void;
    // Initialised to a no-op rather than left undefined, because `StateStore.subscribe` invokes the
    // handler synchronously before returning — so on that first call the real unsubscribe does not
    // exist yet and `finish` would have nothing to call.
    let unsubscribe = () => undefined as void;

    const finish = (outcome: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      unsubscribe();
      removeAbortListener();
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

    if (signal) {
      const onAbort = () => finish(() => reject(abortError(signal)));
      signal.addEventListener('abort', onAbort);
      removeAbortListener = () => signal.removeEventListener('abort', onAbort);
    }

    // The synchronous first call cannot have resolved — the check above failed — but the socket can
    // have come up in between. Re-checked rather than assumed.
    if (isReady()) finish(resolve);
  });
};
