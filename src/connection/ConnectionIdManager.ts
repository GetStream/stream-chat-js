import { chatLoggerSystem } from '../logger';

const logger = chatLoggerSystem.getLogger('connection');

/**
 * Holds the connection ID (the WebSocket's, or the long-poll's after an `enableWSFallback` switch)
 * and lets callers await one that is still being negotiated.
 *
 * The server keys channel watches and presence subscriptions by connection ID and answers `200`
 * while registering nothing when a request that needs one carries none (see `requiresConnectionId`
 * in `api-client.ts`), so such requests wait for the handshake. The ID lives only here, so a
 * replaced socket cannot leave a stale copy behind.
 *
 * Driven by {@link StableWSConnection}, or by `WSConnectionFallback` after a fallback switch.
 */
export class ConnectionIdManager {
  connectionId?: string;
  loadConnectionIdPromise?: Promise<string>;
  private resolve?: (connectionId: string) => void;
  private reject?: (reason: unknown) => void;

  /** Creates the deferred a connection attempt settles, so mid-handshake requests can await it. */
  arm = () => {
    if (this.connectionId || this.loadConnectionIdPromise) return;

    this.loadConnectionIdPromise = new Promise<string>((resolve, reject) => {
      this.resolve = resolve;
      this.reject = reject;
    });
    // Keeps an unawaited rejection from surfacing as unhandled. Awaiters still see it.
    this.loadConnectionIdPromise.catch(() => undefined);
  };

  /**
   * Publishes the ID from the `connection.ok` event and releases anything waiting on one.
   *
   * @param connectionId - The connection ID carried by the `connection.ok` event.
   */
  resolveConnectionId = (connectionId: string) => {
    this.connectionId = connectionId;
    this.resolve?.(connectionId);
    this.settle();
  };

  /**
   * Rejects pending waiters, for a connection attempt that will not be retried.
   *
   * @param reason - The error to reject pending waiters with.
   */
  rejectConnectionId = (reason: unknown) => {
    this.connectionId = undefined;
    this.reject?.(reason);
    this.settle();
  };

  /** Drops the ID for a socket that died but will be retried. New requests wait for the reconnect. */
  invalidate = () => {
    if (!this.connectionId) return;

    logger
      .withExtraTags('invalidate')
      .debug('Dropping the connection id; the socket is no longer up.');

    this.connectionId = undefined;
    this.arm();
  };

  /** Drops the ID and rejects any pending waiter with a "connection closed" error. */
  reset = () => {
    logger.withExtraTags('reset').debug('Dropping the connection id.');

    this.rejectConnectionId(
      new Error(
        'The WebSocket connection was closed before a connection id could be resolved. Call `client.openConnection()` to open a new one, or `client.connectUser()` if the user was disconnected.',
      ),
    );
  };

  /**
   * Returns the connection ID, waiting for the handshake when one is in flight.
   *
   * @param signal - Abandons the wait. Only the waiting path honours it; an ID already in hand is
   *   returned either way.
   * @returns The current connection ID, or a promise for it while the handshake is in flight.
   * @throws When no socket is open or being opened.
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

/** The rejection for an aborted wait, shaped like the one `fetch` and `axios` raise. */
const abortError = (signal: AbortSignal) => {
  const reason: unknown = signal.reason;
  if (reason instanceof Error) return reason;
  const error = new Error('The wait for a connection id was aborted.');
  error.name = 'AbortError';
  return error;
};
