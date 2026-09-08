import { chatCodes, convertErrorToJson, randomId, retryInterval, sleep } from './utils';
import {
  buildWsFatalInsight,
  buildWsSuccessAfterFailureInsight,
  postInsights,
} from './insights';
import { chatLoggerSystem } from './logger';
import {
  DEFAULT_WS_CONNECTION_CONFIG,
  WS_NETWORK_RECOVERY_RETRY_MS,
  WS_OFFLINE_ANNOUNCE_DELAY_MS,
} from './wsConnection/config';
import type { ConnectAPIResponse, ConnectedEvent, ConnectionOpen } from './types';
import type { StreamChat } from './client';
import type { APIError } from './errors';
import type { WSEvent } from './gen/models';
import type { WSConnectionConfig } from './wsConnection/types';

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
  // global from constructor
  client: StreamChat;

  // local vars
  connectionID?: string;
  connectionOpen?: ConnectAPIResponse;
  consecutiveFailures: number;
  healthCheckTimeoutRef?: NodeJS.Timeout;
  isConnecting: boolean;
  isDisconnected: boolean;
  isOnline: boolean;
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

  constructor({ client }: { client: StreamChat }) {
    /** StreamChat client */
    this.client = client;
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
    this.isOnline = false;
    /** Incremented when a new WS connection is made */
    this.wsID = 1;
    /** Store the last event time for health checks */
    this.lastEvent = null;
  }

  /**
   * The timing knobs, read from `client.wsConnection.config` **live** rather than snapshotted, so an
   * `updateConfig` reaches the socket that is already open instead of only the next one.
   *
   * Falls back to the package defaults when there is no client to ask. That is not hypothetical:
   * `options.wsConnection` lets a socket be constructed before its client exists and handed one later
   * through {@link setClient}, so between those two moments there is nothing to read from.
   */
  private get config(): WSConnectionConfig {
    return this.client?.wsConnection?.config ?? DEFAULT_WS_CONNECTION_CONFIG;
  }

  /** How often a health-check ping goes out. Configurable as `pingIntervalMs`. */
  get pingInterval(): number {
    return this.config.pingIntervalMs;
  }

  /**
   * How long the connection check tolerates silence before tearing the socket down.
   *
   * Derived at read time, not stored: it used to be computed once in the constructor from
   * `pingInterval`, which meant changing the ping interval left the connection check behind and the socket
   * killing itself between pings.
   */
  get connectionCheckTimeout(): number {
    return this.config.pingIntervalMs + this.config.healthCheckGracePeriodMs;
  }

  setClient(client: StreamChat) {
    this.client = client;
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
      this._applyOnline(false);
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

    // start by removing all the listeners
    if (this.healthCheckTimeoutRef) {
      clearInterval(this.healthCheckTimeoutRef);
    }
    if (this.connectionCheckTimeoutRef) {
      clearInterval(this.connectionCheckTimeoutRef);
    }

    // Through `_applyOnline`, not a bare assignment: this path deliberately does **not** dispatch
    // `connection.changed` (it is what `closeConnection()` uses, and announcing a deliberate shutdown
    // as a connection drop would be wrong), but the store must still tell the truth. That asymmetry
    // is exactly why `client.wsConnection.state` is worth having.
    this._applyOnline(false);

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
    this.client.insightMetrics.connectionStartTimestamp = new Date().getTime();
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
        this.connectionID = response.connection_id;
        if (
          this.client.insightMetrics.wsConsecutiveFailures > 0 &&
          this.client.options.enableInsights
        ) {
          postInsights(
            'ws_success_after_failure',
            buildWsSuccessAfterFailureInsight(this as unknown as StableWSConnection),
          );
          this.client.insightMetrics.wsConsecutiveFailures = 0;
        }
        return response;
      }
    } catch (error: any) {
      this.isConnecting = false;
      logger
        .withExtraTags('_connect')
        .warn('An error occurred while connecting.', { error });
      if (this.client.options.enableInsights) {
        this.client.insightMetrics.wsConsecutiveFailures++;
        this.client.insightMetrics.wsTotalFailures++;

        const insights = buildWsFatalInsight(
          this as unknown as StableWSConnection,
          convertErrorToJson(error as Error),
        );
        postInsights?.('ws_fatal', insights);
      }
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
    if (this.isConnecting || this.isOnline) {
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
    if (this.isConnecting || this.isOnline) {
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
      this._applyOnline(false);
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
      }
    }
    logger.withExtraTags('_reconnect').debug('Reconnect attempt finished.');
  }

  /**
   * Handles a change reported for the `'network'` connection — the device's own — and applies it to
   * the `'ws'` connection this class owns.
   *
   * The logs name both by their {@link ConnectionType} value rather than by prose, so the words match
   * what `connection.changed` carries and a reader is never left guessing which connection a line is
   * about. The effect clause is conditional because there may not be an effect: `_setOnline` returns
   * early when the status is unchanged, and a `'network'` report commonly arrives after the socket has
   * already died on its own.
   *
   * @deprecated Report network status through `client.networkConnection.setStatus(isOnline)` instead, or
   *   register a listener with `client.networkConnection.setStatusListenerRegistrar(…)`. This entry point takes
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
   * The single body behind both entry points — the `connection.changed` subscription that
   * `client.wsConnection` owns, and the deprecated {@link onlineStatusChanged} shim React Native still
   * calls — so the two cannot drift.
   *
   * @internal
   */
  public _applyNetworkStatus(online: boolean) {
    if (!online) {
      logger
        .withExtraTags('onlineStatusChanged')
        .info(`The 'network' connection went offline.`);
      this._setOnline(false);
      return;
    }

    // A socket still carrying traffic has probably missed nothing, so replacing it would cost a
    // handshake and a fresh connection ID for no gain. Only reconnect if it is actually down.
    logger
      .withExtraTags('onlineStatusChanged')
      .info(
        `The 'network' connection went online; ${
          this.isOnline
            ? `leaving the 'ws' connection as it is`
            : `reconnecting the 'ws' connection now`
        }.`,
      );

    if (!this.isOnline) {
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

      this.resolvePromise?.(decodedData as ConnectionOpen);
      this._setOnline(true);
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
      this._setOnline(false);
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
    this._setOnline(false);
    this.isConnecting = false;

    this.rejectPromise?.(this._errorFromWSEvent(event));
    logger
      .withExtraTags('onerror')
      .warn('The WebSocket connection raised an error.', { event });

    this._reconnect();
  };

  /**
   * Marks this WebSocket up or down, and broadcasts the change if it is one.
   *
   * The event carries `connection: 'ws'`: `connection.changed` reports **either** connection, and a
   * consumer that means the device's network wants `connection: 'network'` from `client.networkConnection`
   * instead. Nothing here is a statement about the network.
   *
   * Note the asymmetry, which is deliberate and depended upon: going up dispatches immediately,
   * going down waits 5s and dispatches only if still down. That debounce suppresses flapping for
   * UI, which is also why the watch bookkeeping below does **not** go through the event.
   *
   * @param online - Whether this WebSocket is up.
   */
  /**
   * Writes this connection's status to the field and to `client.wsConnection.state`, and nothing
   * else. Returns whether it changed.
   *
   * Every path that transitions the status goes through here — including the ones that deliberately
   * do **not** dispatch `connection.changed`: `disconnect()` (what `closeConnection()` uses) and the
   * two error paths. That is what makes the store truthful on paths the event has always been silent
   * about, which is the reason the store exists.
   *
   * Construction is not routed through here: initializing the field is not a transition, and stamping
   * `lastOfflineAt` because a socket object was built would be a lie.
   */
  private _applyOnline(online: boolean): boolean {
    if (online === this.isOnline) return false;

    this.isOnline = online;

    // Optional chaining because `options.wsConnection` lets a socket be constructed before its
    // client exists, and handed one later through `setClient`.
    this.client?.wsConnection._setStatus({
      isOnline: online,
      connectionId: this.connectionID,
    });

    return true;
  }

  _setOnline = (online: boolean) => {
    if (!this._applyOnline(online)) return;

    if (this.isOnline) {
      this.client.dispatchEvent({
        type: 'connection.changed',
        connection: 'ws',
        online: this.isOnline,
      });
      return;
    }

    // The server keys channel watches by connection ID, so they are gone the moment the socket is.
    // Done here rather than off the `connection.changed` event below, which is debounced by
    // `WS_OFFLINE_ANNOUNCE_DELAY_MS`.
    this.client._markActiveChannelsWatchInterrupted();

    // we're down; wait a few seconds and fire the event only if still down
    setTimeout(() => {
      if (this.isOnline) return;
      this.client.dispatchEvent({
        type: 'connection.changed',
        connection: 'ws',
        online: this.isOnline,
      });
    }, WS_OFFLINE_ANNOUNCE_DELAY_MS);
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
        this._setOnline(false);
        this._reconnect();
      }
    }, this.connectionCheckTimeout);
  };
}
