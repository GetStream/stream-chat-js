import { chatLoggerSystem } from '../logger';

// Part of the connection lifecycle, so it shares the `connection` scope rather than adding another
// member to the public `ChatLoggerScope` union for a single debug line.
const logger = chatLoggerSystem.getLogger('connection');

/**
 * Holds the WebSocket connection id and lets callers await one that is still being negotiated.
 *
 * The server keys channel watches and presence subscriptions by connection id, and answers `200`
 * while registering nothing when a request that needs one arrives without it. Requests carrying such
 * a subscription therefore have to wait for the handshake — see `requiresConnectionId` in
 * `api-client.ts` for which those are.
 *
 * The id lives here and nowhere else. A copy kept on the socket outlives the socket it belongs to,
 * and a copy in `client.wsConnection.state` cannot be invalidated by a socket that has already been
 * replaced; either way requests go out keyed to a connection the server has torn down.
 *
 * {@link StableWSConnection} drives the whole lifecycle: {@link arm} before a socket opens,
 * {@link resolveConnectionId} on the hello frame, {@link invalidate} when it drops, {@link reset} on
 * a deliberate close.
 */
export class ConnectionIdManager {
  connectionId?: string;
  loadConnectionIdPromise?: Promise<string>;
  private resolve?: (connectionId: string) => void;
  private reject?: (reason: unknown) => void;

  /**
   * Arms the deferred a connection attempt will settle, so requests issued while the handshake is in
   * flight have something to await.
   */
  arm = () => {
    if (this.connectionId || this.loadConnectionIdPromise) return;

    this.loadConnectionIdPromise = new Promise<string>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
    // A rejected deferred nobody happened to be awaiting is an unhandled rejection in the consumer's
    // application. Real awaiters hold their own reference and still see it; this only keeps the
    // unawaited case quiet.
    this.loadConnectionIdPromise.catch(() => undefined);
  };

  /**
   * Publishes the id the server answered the handshake with, releasing anything waiting on one.
   *
   * @param connectionId - The connection id carried by the `connection.ok` event.
   */
  resolveConnectionId = (connectionId: string) => {
    this.connectionId = connectionId;
    this.resolve?.(connectionId);
    this.settle();
  };

  /**
   * Fails anything waiting on an id, for a connection attempt that will not be retried.
   *
   * @param reason - The error to reject pending waiters with.
   */
  rejectConnectionId = (reason: unknown) => {
    this.connectionId = undefined;
    this.reject?.(reason);
    this.settle();
  };

  /**
   * Drops the id without failing anything waiting on one, for a socket that died but will be
   * retried. Arming a fresh deferred is what makes those requests wait for the reconnect rather than
   * race ahead with a dead id.
   */
  invalidate = () => {
    if (!this.connectionId) return;

    logger
      .withExtraTags('invalidate')
      .debug('Dropping the connection id; the socket is no longer up.');

    this.connectionId = undefined;
    this.arm();
  };

  /**
   * Drops the id and fails any pending waiter, for a socket closed deliberately. The id is dead from
   * that moment, and a request keyed by it would register a subscription on a connection that no
   * longer exists.
   */
  reset = () => {
    logger.withExtraTags('reset').debug('Dropping the connection id.');

    this.rejectConnectionId(
      new Error(
        'The WebSocket connection was closed before a connection id could be resolved. Call `client.openConnection()` to open a new one, or `client.connectUser()` if the user was disconnected.',
      ),
    );
  };

  /**
   * The current id, or a promise for one while the handshake is in flight.
   *
   * Throws when there is neither, because no amount of waiting would produce one: no socket is open
   * and none is being opened.
   *
   * @param signal - Abandons the wait when the caller abandons the request it is waiting to issue.
   *   Only the waiting path honours it; an id already in hand is returned either way, and the
   *   request layer aborts the call itself.
   */
  getConnectionId = (signal?: AbortSignal): string | Promise<string> => {
    if (this.connectionId) return this.connectionId;

    const pending = this.loadConnectionIdPromise;

    if (!pending) {
      throw new Error(
        'No connection id is available: there is no WebSocket connection, and none is being established. A request that watches a channel or subscribes to presence needs one. Call `client.connectUser()` if no user is connected, or `client.openConnection()` if the socket was closed with `client.closeConnection()`.',
      );
    }

    if (!signal) return pending;
    if (signal.aborted) return Promise.reject(abortError(signal));

    return new Promise<string>((resolve, reject) => {
      const onAbort = () => reject(abortError(signal));
      signal.addEventListener('abort', onAbort, { once: true });
      pending
        .then(resolve, reject)
        .finally(() => signal.removeEventListener('abort', onAbort));
    });
  };

  private settle = () => {
    this.loadConnectionIdPromise = undefined;
    this.resolve = undefined;
    this.reject = undefined;
  };
}

/**
 * The rejection an aborted wait produces, shaped like the one `fetch` and `axios` raise for the same
 * signal so a caller recognises it wherever the abort landed.
 */
const abortError = (signal: AbortSignal) => {
  const reason: unknown = signal.reason;
  if (reason instanceof Error) return reason;
  const error = new Error('The wait for a connection id was aborted.');
  error.name = 'AbortError';
  return error;
};
