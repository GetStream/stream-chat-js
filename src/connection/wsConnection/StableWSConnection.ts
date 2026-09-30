import { chatCodes, randomId, retryInterval, sleep } from '../../utils';
import { chatLoggerSystem } from '../../logger';
import { WS_NETWORK_RECOVERY_RETRY_MS } from './config';
import type { ConnectAPIResponse, ConnectedEvent, ConnectionOpen } from '../../types';
import type { WSConnection } from './WSConnection';
import type { StreamChat } from '../../client';
import type { APIError } from '../../errors';
import type { WSEvent } from '../../gen/models';
import type { WSConnectionConfig } from './types';

const logger = chatLoggerSystem.getLogger('connection');

/**
 * Wire frames are handed through as they arrive. Every server-sent date is the unix-nanosecond
 * number the API puts on the wire (the generator runs with `response_dates_as_number=true`), so
 * there is nothing left to decode — the per-model decoders that used to turn those numbers into
 * `Date` objects no longer exist.
 *
 * `connection.ok` is still not published in the OpenAPI spec, so it is typed by the hand-written
 * `ConnectedEvent` overlay in `types.ts` rather than by `src/gen`. Remove that overlay, and this
 * branch, once the backend adds the event to the spec and `src/gen` is regenerated.
 */
const decodeConnectionEvent = (
  data: { type: string } & Record<string, unknown>,
): WSEvent | ConnectedEvent =>
  data.type === 'connection.ok'
    ? (data as unknown as ConnectedEvent)
    : (data as unknown as WSEvent);

// Type guards to check WebSocket error type
const isCloseEvent = (
  res: CloseEvent | MessageEvent | ErrorEvent | Event,
): res is CloseEvent => (res as CloseEvent).code !== undefined;

const isErrorEvent = (
  res: CloseEvent | MessageEvent | ErrorEvent | Event,
): res is ErrorEvent => (res as ErrorEvent).error !== undefined;

class WSCloseError extends Error {
  public reason?: string;
  public wasClean?: boolean;
  public code?: number;
  public target?: EventTarget | null;
  constructor(message?: string, errorOptions?: ErrorOptions) {
    super(message, errorOptions);
  }
}

/**
 * A WS connection that reconnects upon failure.
 *
 * - the WS connection can break and fail; a ping goes out every 25s (`pingInterval`)
 * - sometimes the WS connection seems to work while the device is in fact offline
 * - the device's own network status is a separate fact, owned by `client.networkConnection` and fed by a
 *   platform listener the integrator registers; this class consumes it, it does not detect it
 *
 * There are 4 ways in which this connection can go down:
 * - WebSocket.onerror is called
 * - WebSocket.onclose is called
 * - no frame arrives for 35s, so the health-check loop gives up (`connectionCheckTimeout`)
 * - the device reports its network went offline
 *
 * There are 2 assumptions we make about the server:
 * - state can be recovered by querying the channel again
 * - if the servers fails to publish a message to the client, the WS connection is destroyed
 */
export class StableWSConnection {
  /**
   * The `WSConnection` this socket belongs to. Held instead of the client, because the status store
   * lives here and everything the socket needs from the client is reachable through it.
   */
  wsConnection: WSConnection;

  // local vars
  connectionOpen?: ConnectAPIResponse;
  consecutiveFailures: number;
  healthCheckTimeoutRef?: NodeJS.Timeout;
  isConnecting: boolean;
  isDisconnected: boolean;
  isHealthy: boolean;
  isResolved?: boolean;
  lastEvent: Date | null;
  connectionCheckTimeoutRef?: NodeJS.Timeout;
  rejectPromise?: (
    reason?: Error & {
      code?: string | number;
      isWSFailure?: boolean;
      StatusCode?: string | number;
    },
  ) => void;
  requestID: string | undefined;
  resolvePromise?: (value: ConnectionOpen) => void;
  totalFailures: number;
  ws?: WebSocket;
  wsID: number;

  constructor({ wsConnection }: { wsConnection: WSConnection }) {
    /** The `WSConnection` that owns this socket */
    this.wsConnection = wsConnection;
    /** consecutive failures influence the duration of the timeout */
    this.consecutiveFailures = 0;
    /** keep track of the total number of failures */
    this.totalFailures = 0;
    /** We only make 1 attempt to reconnect at the same time.. */
    this.isConnecting = false;
    /** To avoid reconnect if client is disconnected */
    this.isDisconnected = false;
    /** Boolean that indicates if the connection promise is resolved */
    this.isResolved = false;
    /** Boolean that indicates if we have a working connection to the server */
    this.isHealthy = false;
    /** Incremented when a new WS connection is made */
    this.wsID = 1;
    /** Store the last event time for health checks */
    this.lastEvent = null;
  }

  /**
   * The timing knobs, read from the parent **live** rather than snapshotted, so an `updateConfig`
   * reaches the socket that is already open instead of only the next one.
   */
  private get config(): WSConnectionConfig {
    return this.wsConnection.config;
  }

  /** How often a health-check ping goes out. Configurable as `pingIntervalMs`. */
  get pingInterval(): number {
    return this.config.pingIntervalMs;
  }

  /**
   * How long the connection check tolerates silence before tearing the socket down.
   *
   * Derived at read time rather than stored, so changing the ping interval moves the connection check
   * with it instead of leaving the socket to kill itself between pings.
   */
  get connectionCheckTimeout(): number {
    return this.config.pingIntervalMs + this.config.healthCheckGracePeriodMs;
  }

  /** The client, reached through the parent. See {@link wsConnection}. */
  get client(): StreamChat {
    return this.wsConnection.client;
  }

  /**
   * Re-parents this socket, for one supplied through `config.connection` and built against a
   * different `WSConnection` than the client adopting it.
   */
  setWSConnection(wsConnection: WSConnection) {
    this.wsConnection = wsConnection;
  }

  /**
   * Connects to the WS URL.
   *
   * @param timeout - Connect timeout in milliseconds. Defaults to `config.connectTimeoutMs` (15s),
   *   which allows between 2 and 3 tries.
   * @returns A promise that resolves once the server's `connection.ok` hello event arrives.
   */
  async connect(timeout: number = this.config.connectTimeoutMs) {
    if (this.isConnecting) {
      throw Error(
        `You've called connect twice, can only attempt 1 connection at the time`,
      );
    }

    this.isDisconnected = false;

    try {
      const healthCheck = await this._connect();
      this.consecutiveFailures = 0;

      logger
        .withExtraTags('connect')
        .info(`Established a WebSocket connection. Health check: ${healthCheck}.`);
    } catch (error: any) {
      this._applyHealth(false);
      this.consecutiveFailures += 1;

      const e = error as APIError;

      if (e.code === chatCodes.TOKEN_EXPIRED && !this.client.tokenManager.isStatic()) {
        logger
          .withExtraTags('connect')
          .warn(
            'WebSocket connection failed due to an expired token. Reloading the token and reconnecting.',
          );
        this._reconnect({ refreshToken: true });
      } else if (!e.isWSFailure) {
        // API rejected the connection and we should not retry
        throw new Error(
          JSON.stringify({
            code: e.code,
            StatusCode: e.StatusCode,
            message: e.message,
            isWSFailure: e.isWSFailure,
          }),
        );
      }
    }

    return await this._waitForHealthy(timeout);
  }

  /**
   * _waitForHealthy polls the promise connection to see if its resolved until it times out.
   *
   * @param timeout - duration (ms). Defaults to `config.connectTimeoutMs` (15s), which allows
   *   between 2~3 tries.
   */
  _waitForHealthy(timeout: number = this.config.connectTimeoutMs) {
    return Promise.race([
      (async () => {
        const interval = 50; // ms
        for (let i = 0; i <= timeout; i += interval) {
          try {
            return await this.connectionOpen;
          } catch (error: any) {
            if (i === timeout) {
              throw new Error(
                JSON.stringify({
                  code: error.code,
                  StatusCode: error.StatusCode,
                  message: error.message,
                  isWSFailure: error.isWSFailure,
                }),
              );
            }
            await sleep(interval);
          }
        }
      })(),
      (async () => {
        await sleep(timeout);
        this.isConnecting = false;
        throw new Error(
          JSON.stringify({
            code: '',
            StatusCode: '',
            message: 'initial WS connection could not be established',
            isWSFailure: true,
          }),
        );
      })(),
    ]);
  }

  /**
   * Builds and returns the URL for the WebSocket connection.
   *
   * @private
   * @returns url string
   */
  _buildUrl = () => {
    const params = new URLSearchParams(this.config.urlParams);
    params.set('api_key', this.client.key);
    params.set('stream-auth-type', this.client.getAuthType());
    // Browsers cannot set headers on the WS handshake, so the server reads this
    // from the query string too.
    params.set('X-Stream-Client', this.client.getUserAgent());

    return `${this.client.wsBaseURL}/api/v2/connect?${params.toString()}`;
  };

  /**
   * Disconnects the connection without attempting to recover.
   *
   * @param timeout - Optional timeout in milliseconds to wait for the close frame from the server.
   */
  disconnect(timeout?: number) {
    logger
      .withExtraTags('disconnect')
      .info(`Closing the WebSocket connection for wsID ${this.wsID}.`);

    this.wsID += 1;
    this.isConnecting = false;
    this.isDisconnected = true;
    // A deliberate close still expects a reopen - mobile backgrounding is the reason this method
    // exists - so anything already waiting for a connection id keeps waiting. Invalidating drops the
    // dead id and arms a fresh deferred for the socket `openConnection()` will build.
    this.client.connectionIdManager.invalidate();

    // start by removing all the listeners
    if (this.healthCheckTimeoutRef) {
      clearInterval(this.healthCheckTimeoutRef);
    }
    if (this.connectionCheckTimeoutRef) {
      clearInterval(this.connectionCheckTimeoutRef);
    }

    // Through `_applyHealth`, not a bare assignment: the store must tell the truth on this path too.
    // It is what `closeConnection()` uses, and a deliberate shutdown is still a transition.
    this._applyHealth(false);

    let isClosedPromise: Promise<void>;
    // and finally close...
    // Assigning to local here because we will remove it from this before the
    // promise resolves.
    const { ws } = this;
    if (ws && ws.close && ws.readyState === ws.OPEN) {
      isClosedPromise = new Promise((resolve) => {
        const onclose = (event: CloseEvent) => {
          logger
            .withExtraTags('disconnect')
            .debug(
              `Resolving the close promise ${event ? 'with' : 'without'} a close frame.`,
              { event },
            );
          resolve();
        };

        ws.onclose = onclose;
        // In case we don't receive a close frame from the WebSocket server in time,
        // lets not wait for more than 1 seconds.
        setTimeout(onclose, timeout != null ? timeout : 1000);
      });

      logger
        .withExtraTags('disconnect')
        .debug('Manually closing the connection via client.disconnect().');

      ws.close(
        chatCodes.WS_CLOSED_SUCCESS,
        'Manually closed connection by calling client.disconnect()',
      );
    } else {
      logger
        .withExtraTags('disconnect')
        .debug('The WebSocket connection does not exist or is already closed.');
      isClosedPromise = Promise.resolve();
    }

    delete this.ws;

    return isClosedPromise;
  }

  /**
   * Connects to the WS endpoint.
   *
   * @returns A promise that resolves once the server's `connection.ok` hello event arrives.
   */
  async _connect() {
    // simply ignore _connect if it's currently connecting, or if disconnect() was called
    if (this.isConnecting || this.isDisconnected) return;
    this.isConnecting = true;
    this.requestID = randomId();
    // Arm before anything can await a connection id. A no-op on a reconnect that still holds one -
    // those requests keep flowing against the old id rather than blocking for the whole outage.
    this.client.connectionIdManager.arm();
    let isTokenReady = false;
    try {
      logger.withExtraTags('_connect').debug('Waiting for the auth token.');
      await this.client.tokenManager.tokenReady();
      isTokenReady = true;
    } catch (e) {
      // token provider has failed before, so try again
    }

    try {
      if (!isTokenReady) {
        logger
          .withExtraTags('_connect')
          .warn('The token provider failed previously. Retrying.');
        await this.client.tokenManager.loadToken();
      }

      this._setupConnectionPromise();
      const wsURL = this._buildUrl();
      // Built before the socket exists on purpose: the token is guaranteed loaded by
      // this point, and a failure here must reject _connect rather than leave an open
      // socket to die against the server's 10s auth-message deadline.
      const authMessage = this.client._buildWSAuthMessage();
      logger.withExtraTags('_connect').info(`Connecting to ${wsURL}.`, {
        wsURL,
        requestID: this.requestID,
      });

      const WS = this.config.webSocketImpl ?? WebSocket;
      this.ws = new WS(wsURL);

      this.ws.onopen = this.onopen.bind(this, this.wsID, authMessage);
      this.ws.onclose = this.onclose.bind(this, this.wsID);
      this.ws.onerror = this.onerror.bind(this, this.wsID);
      this.ws.onmessage = this.onmessage.bind(this, this.wsID);
      const response = await this.connectionOpen;
      this.isConnecting = false;

      if (response) {
        // The id is published to the ConnectionIdManager and nowhere else. A copy kept here would
        // outlive the socket it belongs to - `invalidate()` / `reset()` cannot reach it - which is
        // exactly the staleness this manager exists to end.
        this.client.connectionIdManager.resolveConnectionId(response.connection_id);
        return response;
      }
    } catch (error: any) {
      this.isConnecting = false;
      logger
        .withExtraTags('_connect')
        .warn('An error occurred while connecting.', { error });
      throw error;
    }
  }

  /**
   * Retries the connection to the WS endpoint.
   *
   * @param options - Reconnect options.
   * @param options.interval - Number of milliseconds to wait before reconnecting.
   * @param options.refreshToken - Reload/refresh the user token before attempting to reconnect.
   */
  async _reconnect(
    options: { interval?: number; refreshToken?: boolean } = {},
  ): Promise<void> {
    logger.withExtraTags('_reconnect').info('Initiating a reconnect.');

    // only allow 1 connection at the time
    if (this.isConnecting || this.isHealthy) {
      logger
        .withExtraTags('_reconnect')
        .debug('Aborting reconnect: already connecting or healthy (check 1).');
      return;
    }

    // reconnect in case of on error or on close
    // also reconnect if the health check cycle fails
    let interval = options.interval;
    if (!interval) {
      interval = retryInterval(this.consecutiveFailures);
    }
    // reconnect, or try again after a little while...
    await sleep(interval);

    // Check once again if by some other call to _reconnect is active or connection is
    // already restored, then no need to proceed.
    if (this.isConnecting || this.isHealthy) {
      logger
        .withExtraTags('_reconnect')
        .debug('Aborting reconnect: already connecting or healthy (check 2).');
      return;
    }

    if (this.isDisconnected) {
      logger
        .withExtraTags('_reconnect')
        .debug('Aborting reconnect: disconnect() was called.');
      return;
    }

    logger
      .withExtraTags('_reconnect')
      .info('Destroying the current WebSocket connection.');

    // cleanup the old connection
    this._destroyCurrentWSConnection();

    if (options.refreshToken) {
      await this.client.tokenManager.loadToken();
    }

    try {
      await this._connect();
      this.client._settleConnectPromises();

      this.consecutiveFailures = 0;
    } catch (error: any) {
      this._applyHealth(false);
      this.consecutiveFailures += 1;
      if (
        error.code === chatCodes.TOKEN_EXPIRED &&
        !this.client.tokenManager.isStatic()
      ) {
        logger
          .withExtraTags('_reconnect')
          .warn(
            'WebSocket connection failed due to an expired token. Reloading the token and reconnecting.',
          );

        return this._reconnect({ refreshToken: true });
      }

      // reconnect on WS failures, don't reconnect if there is a code bug
      if (error.isWSFailure) {
        logger
          .withExtraTags('_reconnect')
          .warn('WebSocket connection failed. Retrying the reconnect.');

        this._reconnect();
      } else {
        // Giving up. Going down armed a deferred on the assumption that a reconnect would settle it,
        // and nothing will now — leaving it pending hangs every request waiting for an id, with no
        // retry coming and no error to show for it.
        this.client.connectionIdManager.rejectConnectionId(error);
      }
    }
    logger.withExtraTags('_reconnect').debug('Reconnect attempt finished.');
  }

  /**
   * Handles a change reported for the `'network'` connection — the device's own — and applies it to
   * the `'ws'` connection this class owns.
   *
   * The logs name both by their {@link ConnectionType} value rather than by prose, so a reader is
   * never left guessing which connection a line is about. The effect clause is conditional because there may not be an effect: `_setHealth` returns
   * early when the status is unchanged, and a `'network'` report commonly arrives after the socket has
   * already died on its own.
   *
   * @deprecated Report network status through `client.networkConnection.setStatus(isOnline)` instead, or
   *   register a listener with `client.networkConnection.setStatusReporter(…)`. This entry point takes
   *   a DOM-shaped object and reaches into the socket, neither of which a caller should need. Kept
   *   for one major because `stream-chat-react-native` calls it directly.
   *
   * @param event - A DOM-shaped object whose `type` is `'online'` or `'offline'`. It carries no
   *   connection identifier and never has: it was fed by `window`'s own `online`/`offline` events,
   *   which are always about the device's network, and React Native synthesizes the same shape from
   *   `NetInfo`.
   */
  onlineStatusChanged = (event: Event) => {
    if (event.type === 'offline') this._applyNetworkStatus(false);
    else if (event.type === 'online') this._applyNetworkStatus(true);
  };

  /**
   * Applies a reported change in the `'network'` connection to the `'ws'` connection this class owns.
   *
   * The single body behind both entry points — the network-store subscription the parent owns, and
   * the deprecated {@link onlineStatusChanged} shim React Native still calls — so the two cannot
   * drift.
   *
   * @internal
   */
  public _applyNetworkStatus(online: boolean) {
    if (!online) {
      logger
        .withExtraTags('onlineStatusChanged')
        .info(`The 'network' connection went offline.`);
      this._setHealth(false);
      return;
    }

    // A socket still carrying traffic has probably missed nothing, so replacing it would cost a
    // handshake and a fresh connection ID for no gain. Only reconnect if it is actually down.
    logger
      .withExtraTags('onlineStatusChanged')
      .info(
        `The 'network' connection went online; ${
          this.isHealthy
            ? `leaving the 'ws' connection as it is`
            : `reconnecting the 'ws' connection now`
        }.`,
      );

    if (!this.isHealthy) {
      this._reconnect({ interval: WS_NETWORK_RECOVERY_RETRY_MS });
    }
  }

  onopen = (wsId: number, authMessage: string) => {
    if (this.wsID !== wsId) return;

    logger.withExtraTags('onopen').debug('WebSocket onopen callback fired.', {
      wsID: wsId,
    });

    // `/api/v2/connect` authenticates off the first frame the client sends, not off
    // the query string. The server closes the socket if it does not arrive in 10s.
    const { ws } = this;
    // disconnect() deletes this.ws synchronously; the wsID guard above covers
    // reconnects, this covers a socket torn down before `open` was dispatched.
    if (!ws || ws.readyState !== ws.OPEN) return;

    try {
      ws.send(authMessage);
    } catch (error) {
      logger
        .withExtraTags('onopen')
        .error('Failed to send the WebSocket auth message.', { error });
      this.rejectPromise?.(this._errorFromWSEvent(error as Event));
      this._destroyCurrentWSConnection();
    }
  };

  onmessage = (wsId: number, event: MessageEvent) => {
    if (this.wsID !== wsId) return;

    logger.withExtraTags('onmessage').trace('WebSocket onmessage callback fired.', {
      event,
      wsID: wsId,
    });
    if (typeof event.data !== 'string') return;
    const data = JSON.parse(event.data);
    const decodedData = decodeConnectionEvent(data);

    // we wait till the first message before we consider the connection open..
    // the reason for this is that auth errors and similar errors trigger a ws.onopen and immediately
    // after that a ws.onclose..
    if (!this.isResolved) {
      this.isResolved = true;
      if (data.error) {
        this.rejectPromise?.(this._errorFromWSEvent(data, false));
        return;
      }

      // Published before going online, so "the socket is up" implies "there is an id to watch on".
      this.client.connectionIdManager.resolveConnectionId(
        (decodedData as ConnectionOpen).connection_id,
      );

      this.resolvePromise?.(decodedData as ConnectionOpen);
      this._setHealth(true);
    }

    // trigger the event..
    this.lastEvent = new Date();

    // `connection.ok` is the v2 hello event. The server only echoes health checks in
    // response to an inbound frame, so failing to schedule here means we never ping
    // and scheduleConnectionCheck tears the socket down 35s later, in a loop.
    if (data.type === 'health.check' || data.type === 'connection.ok') {
      this.scheduleNextPing();
    }

    this.client.dispatchEvent(decodedData);
    this.scheduleConnectionCheck();
  };

  onclose = (wsId: number, event: CloseEvent) => {
    if (this.wsID !== wsId) return;

    logger
      .withExtraTags('onclose')
      .debug(`WebSocket onclose callback fired with code ${event.code}.`, {
        event,
        wsID: wsId,
      });

    if (event.code === chatCodes.WS_CLOSED_SUCCESS) {
      // this is a permanent error raised by stream..
      // usually caused by invalid auth details
      const error = new WSCloseError(`WS connection reject with error ${event.reason}`);

      error.reason = event.reason;
      error.code = event.code;
      error.wasClean = event.wasClean;
      error.target = event.target;

      this.rejectPromise?.(error);
      logger
        .withExtraTags('onclose')
        .warn(`The WebSocket connection was rejected: ${event.reason}.`, { event });
    } else {
      this.consecutiveFailures += 1;
      this.totalFailures += 1;
      this._setHealth(false);
      this.isConnecting = false;

      this.rejectPromise?.(this._errorFromWSEvent(event));

      logger
        .withExtraTags('onclose')
        .warn('The WebSocket connection was closed. Attempting to reconnect.', {
          event,
        });

      // reconnect if its an abnormal failure
      this._reconnect();
    }
  };

  onerror = (wsId: number, event: Event) => {
    if (this.wsID !== wsId) return;

    this.consecutiveFailures += 1;
    this.totalFailures += 1;
    this._setHealth(false);
    this.isConnecting = false;

    this.rejectPromise?.(this._errorFromWSEvent(event));
    logger
      .withExtraTags('onerror')
      .warn('The WebSocket connection raised an error.', { event });

    this._reconnect();
  };

  /**
   * Writes this connection's status to the field and to `client.wsConnection.state`, and drops the
   * connection id when it goes down. Returns whether the status changed.
   *
   * Every path that transitions the status goes through here — including `disconnect()`, which
   * `closeConnection()` uses, and the two error paths. Covering all of them is why the store exists,
   * and why invalidating the id belongs here rather than beside any one of those paths.
   *
   * Construction is not routed through here: initializing the field is not a transition, and stamping
   * `lastUnhealthyAt` because a socket object was built would be a lie.
   */
  private _applyHealth(healthy: boolean): boolean {
    if (healthy === this.isHealthy) return false;

    this.isHealthy = healthy;

    if (!healthy) {
      // The id those watches were keyed by is dead, so no further request may carry it. Invalidating
      // arms a fresh deferred, so requests needing one wait for the reconnect instead of racing
      // ahead with the old one.
      this.client.connectionIdManager.invalidate();
    }

    this.wsConnection._setStatus({ isHealthy: healthy });

    return true;
  }

  /**
   * Applies a status change and does the bookkeeping that goes with it.
   *
   * Announcing it is not this class's job. The status lives in `client.wsConnection.state`, which
   * {@link _applyHealth} writes on every transition — including the ones that were always silent —
   * so a consumer subscribes there rather than waiting to be told.
   *
   * The five-second wait before announcing a drop moved to whoever renders the banner, its length
   * configurable as `offlineNotificationDisplayDelayMs`. The timer here outlived the socket that
   * armed it, so a replaced connection announced a drop its replacement had already recovered from.
   */
  _setHealth = (healthy: boolean) => {
    if (!this._applyHealth(healthy)) return;
    if (this.isHealthy) return;

    // The server keys channel watches by connection ID, so they are gone the moment the socket is.
    this.client._markActiveChannelsWatchInterrupted();
  };

  /**
   * Creates an error object for the WS event.
   *
   * @param event - The raw WebSocket close / data / error event.
   * @param isWSFailure - Whether the underlying cause is a WebSocket failure (optional, defaults to `true`).
   * @returns A normalized error describing the WS failure.
   */
  _errorFromWSEvent = (
    event: CloseEvent | MessageEvent | ErrorEvent | Event,
    isWSFailure = true,
  ) => {
    let code;
    let statusCode;
    let message;
    if (isCloseEvent(event)) {
      code = event.code;
      statusCode = 'unknown';
      message = event.reason;
    }

    if (isErrorEvent(event)) {
      code = event.error.code;
      statusCode = event.error.StatusCode;
      message = event.error.message;
    }

    // Keeping this `warn` level log, to avoid cluttering of error logs from ws failures.
    logger
      .withExtraTags('_errorFromWSEvent')
      .warn(`The WebSocket failed with code ${code}.`, { event });

    const error = new Error(
      `WS failed with code ${code} and reason - ${message}`,
    ) as Error & {
      code?: string | number;
      isWSFailure?: boolean;
      StatusCode?: string | number;
    };
    error.code = code;
    /**
     * StatusCode does not exist on any event types but has been left
     * as is to preserve JS functionality during the TS implementation
     */
    error.StatusCode = statusCode;
    error.isWSFailure = isWSFailure;
    return error;
  };

  /**
   * Removes the current WS connection.
   */
  _destroyCurrentWSConnection() {
    // increment the ID, meaning we will ignore all messages from the old
    // ws connection from now on.
    this.wsID += 1;

    try {
      this?.ws?.close();
    } catch (e) {
      // we don't care
    }
  }

  /**
   * Sets up the `this.connectionOpen` promise.
   */
  _setupConnectionPromise = () => {
    this.isResolved = false;
    /** a promise that is resolved once ws.open is called */
    this.connectionOpen = new Promise<ConnectionOpen>((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
    });
  };

  /**
   * Schedules the next health check ping for the WebSocket connection.
   */
  scheduleNextPing = () => {
    if (this.healthCheckTimeoutRef) {
      clearTimeout(this.healthCheckTimeoutRef);
    }

    // Sent every `config.pingIntervalMs` (25s by default); the server answers with a health check event.
    this.healthCheckTimeoutRef = setTimeout(() => {
      // send the healthcheck.., server replies with a health check event
      const data = [{ type: 'health.check', client_id: this.client.clientId }];
      // try to send on the connection
      try {
        this.ws?.send(JSON.stringify(data));
      } catch (e) {
        // error will already be detected elsewhere
      }
    }, this.pingInterval);
  };

  /**
   * Schedules a check for the time difference between the last received event and now. If the
   * difference is more than 35 seconds, it means our health check logic has failed and the
   * WebSocket needs to be reconnected.
   */
  scheduleConnectionCheck = () => {
    if (this.connectionCheckTimeoutRef) {
      clearTimeout(this.connectionCheckTimeoutRef);
    }

    this.connectionCheckTimeoutRef = setTimeout(() => {
      const now = new Date();
      if (
        this.lastEvent &&
        now.getTime() - this.lastEvent.getTime() > this.connectionCheckTimeout
      ) {
        logger
          .withExtraTags('scheduleConnectionCheck')
          .warn('No events received within the health-check window. Reconnecting.');
        this._setHealth(false);
        this._reconnect();
      }
    }, this.connectionCheckTimeout);
  };
}
