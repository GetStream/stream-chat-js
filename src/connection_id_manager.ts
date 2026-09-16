import { chatLoggerSystem } from './logger';

// Part of the connection lifecycle, so it shares the `connection` scope rather than adding
// another member to the public `ChatLoggerScope` union for a single debug line.
const logger = chatLoggerSystem.getLogger('connection');

/**
 * ConnectionIdManager
 *
 * Holds the WebSocket connection id and lets callers await one that is still being negotiated.
 *
 * The server keys channel watches and presence subscriptions by connection id, and answers `200`
 * while registering nothing when a request that needs one arrives without it. Requests that carry
 * such a subscription therefore have to wait for the handshake, which is what
 * {@link ConnectionIdManager.getConnectionId} exists for - see `requiresConnectionId` in
 * `api-client.ts` for which requests those are.
 *
 * The lifecycle is driven entirely by {@link StableWSConnection}: {@link arm} before a socket is
 * opened, {@link resolveConnectionId} once the server answers with one, {@link reset} on disconnect.
 */
export class ConnectionIdManager {
  connectionId?: string;
  loadConnectionIdPromise?: Promise<string>;
  private resolve?: (connectionId: string) => void;
  private reject?: (reason: unknown) => void;

  /**
   * Arms the deferred a connection attempt will settle, so requests issued while the handshake is
   * in flight have something to await.
   *
   * Called at the start of a connection attempt, and by {@link invalidate} the moment a live socket
   * goes unhealthy - by then a reconnect is already on its way, and the requests that need an id
   * have to wait for it rather than be sent with the dead one.
   *
   * A no-op while a deferred is already pending, so those two callers can overlap freely, and a
   * no-op while an id is known, which by then means the socket is healthy and nothing needs to wait.
   */
  arm = () => {
    if (this.connectionId || this.loadConnectionIdPromise) return;

    this.loadConnectionIdPromise = new Promise<string>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
    // A rejected deferred that nobody happened to be awaiting is an unhandled rejection in the
    // consumer's app. Real awaiters hold their own reference to the promise and still see the
    // rejection; this handler only keeps the unawaited case quiet.
    this.loadConnectionIdPromise.catch(() => undefined);
  };

  /**
   * Publishes the connection id the server answered the handshake with, releasing anything waiting
   * on it.
   *
   * @param connectionId - The connection id carried by the `connection.ok` event.
   */
  resolveConnectionId = (connectionId: string) => {
    this.connectionId = connectionId;
    this.resolve?.(connectionId);
    this.settle();
  };

  /**
   * Fails anything waiting on a connection id, for a connection attempt that will not be retried.
   *
   * @param reason - The error to reject the pending waiters with.
   */
  rejectConnectionId = (reason: unknown) => {
    this.connectionId = undefined;
    this.reject?.(reason);
    this.settle();
  };

  /**
   * Drops the connection id without failing anything waiting on one, for a socket that died but
   * will be retried.
   *
   * The server tears a connection's watches down with the socket, so the id is dead the moment the
   * connection stops being healthy - a request still carrying it registers a subscription against a
   * connection that no longer exists, and is answered `200` for it. Dropping it here is what makes
   * the next such request wait for the replacement instead of racing ahead with a dead one.
   *
   * Arms in the same step. Dropping without arming would leave the manager holding neither an id
   * nor a deferred, which {@link getConnectionId} reports as "nothing is being opened" - the right
   * answer for a client that never connected, the wrong one for a socket that is about to be
   * retried. The waiters are released by the next handshake.
   *
   * Contrast {@link reset}, for a socket that will *not* come back: that one rejects the waiters
   * rather than leaving them for a reconnect that is not coming.
   */
  invalidate = () => {
    if (!this.connectionId) return;

    logger
      .withExtraTags('invalidate')
      .debug('Dropping the connection id; the socket is no longer healthy.');

    this.connectionId = undefined;
    this.arm();
  };

  /**
   * Drops the connection id and fails any pending waiter. Called when the socket is deliberately
   * closed - the id is dead from that moment, and a request keyed by it would register a
   * subscription on a connection that no longer exists.
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
   * Returns the current connection id, or a promise for one if the handshake is still in flight.
   *
   * Throws when there is neither, because no amount of waiting would produce one - there is no
   * socket open and none being opened.
   */
  getConnectionId = (): string | Promise<string> => {
    if (this.connectionId) return this.connectionId;

    if (this.loadConnectionIdPromise) return this.loadConnectionIdPromise;

    throw new Error(
      'No connection id is available: there is no WebSocket connection, and none is being established. A request that watches a channel or subscribes to presence needs one. Call `client.connectUser()` if no user is connected, or `client.openConnection()` if the socket was closed with `client.closeConnection()`.',
    );
  };

  private settle = () => {
    this.loadConnectionIdPromise = undefined;
    this.resolve = undefined;
    this.reject = undefined;
  };
}
