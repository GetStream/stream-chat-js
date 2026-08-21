import {
  addConnectionEventListeners,
  chatCodes,
  convertErrorToJson,
  randomId,
  removeConnectionEventListeners,
  retryInterval,
  sleep,
} from './utils';
import {
  buildWsFatalInsight,
  buildWsSuccessAfterFailureInsight,
  postInsights,
} from './insights';
import { chatLoggerSystem } from './logger';
import type { ConnectAPIResponse, ConnectedEvent, ConnectionOpen } from './types';
import type { StreamChat } from './client';
import type { APIError } from './errors';
import { decoders } from './gen/model-decoders/decoders';
import { decodeWSEvent } from './gen/model-decoders/event-decoder-mapping';
import type { WSEvent } from './gen/models';

const logger = chatLoggerSystem.getLogger('connection');

/**
 * `connection.ok` is not published in the OpenAPI spec yet, so `decodeWSEvent` passes
 * it through raw and its `created_at` / `me` fields would stay strings. Its payload is
 * field-for-field what the `HealthCheckEvent` decoder already handles.
 *
 * Remove this once the backend adds the event to the spec and `src/gen` is regenerated.
 */
const decodeConnectionEvent = (
  data: { type: string } & Record<string, unknown>,
): WSEvent | ConnectedEvent =>
  data.type === 'connection.ok'
    ? (decoders.HealthCheckEvent(data) as ConnectedEvent)
    : (decodeWSEvent(data) as WSEvent);

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
 * - the browser will sometimes report that you're online or offline
 * - the WS connection can break and fail (there is a 30s health check)
 * - sometimes your WS connection will seem to work while the user is in fact offline
 * - to speed up online/offline detection you can use the `window.addEventListener('offline')`
 *
 * There are 4 ways in which a connection can become unhealthy:
 * - WebSocket.onerror is called
 * - WebSocket.onclose is called
 * - the health check fails and no event is received for ~40 seconds
 * - the browser indicates the connection is now offline
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
  pingInterval: number;
  healthCheckTimeoutRef?: NodeJS.Timeout;
  isConnecting: boolean;
  isDisconnected: boolean;
  isHealthy: boolean;
  isResolved?: boolean;
  lastEvent: Date | null;
  connectionCheckTimeout: number;
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
    this.isHealthy = false;
    /** Incremented when a new WS connection is made */
    this.wsID = 1;
    /** Store the last event time for health checks */
    this.lastEvent = null;
    /** Send a health check message every 25 seconds */
    this.pingInterval = 25 * 1000;
    this.connectionCheckTimeout = this.pingInterval + 10 * 1000;

    addConnectionEventListeners(this.onlineStatusChanged);
  }

  setClient(client: StreamChat) {
    this.client = client;
  }

  /**
   * Connects to the WS URL. The default 15s timeout allows between 2 and 3 tries.
   *
   * @param timeout - Connect timeout in milliseconds (optional, defaults to `15000`).
   * @returns A promise that resolves once the first health check message is received.
   */
  async connect(timeout = 15000) {
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
      this.isHealthy = false;
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
   * _waitForHealthy polls the promise connection to see if its resolved until it times out
   * the default 15s timeout allows between 2~3 tries
   *
   * @param timeout - duration (ms)
   */
  _waitForHealthy(timeout = 15000) {
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
    const params = new URLSearchParams(this.client.options.wsUrlParams);
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

    removeConnectionEventListeners(this.onlineStatusChanged);

    this.isHealthy = false;

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
   * @returns A promise that resolves once the first health check message is received.
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

      const WS = this.client.options.WebSocketImpl ?? WebSocket;
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
      logger.withExtraTags('_reconnect').debug('Waiting for the recover callback.');
      await this.client.recoverState();
      logger.withExtraTags('_reconnect').debug('Finished the recover callback.');

      this.consecutiveFailures = 0;
    } catch (error: any) {
      this.isHealthy = false;
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
   * Called when the browser connects or disconnects from the internet.
   *
   * @param event - The DOM event whose `type` is `'online'` or `'offline'`.
   */
  onlineStatusChanged = (event: Event) => {
    if (event.type === 'offline') {
      // mark the connection as down
      logger
        .withExtraTags('onlineStatusChanged')
        .info('Network status changed to offline.');
      this._setHealth(false);
    } else if (event.type === 'online') {
      // retry right now...
      // We check this.isHealthy, not sure if it's always
      // smart to create a new WS connection if the old one is still up and running.
      // it's possible we didn't miss any messages, so this process is just expensive and not needed.
      logger
        .withExtraTags('onlineStatusChanged')
        .info(`Network status changed to online. isHealthy: ${this.isHealthy}.`);
      if (!this.isHealthy) {
        this._reconnect({ interval: 10 });
      }
    }
  };

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
   * Sets the connection to healthy or unhealthy. Broadcasts an event if the connection status changed.
   *
   * @param healthy - Whether the connection is healthy.
   */
  _setHealth = (healthy: boolean) => {
    if (healthy === this.isHealthy) return;

    this.isHealthy = healthy;

    if (this.isHealthy) {
      this.client.dispatchEvent({ type: 'connection.changed', online: this.isHealthy });
      return;
    }

    // The server keys channel watches by connection ID, so they are gone the moment the socket is.
    // Done here rather than off the `connection.changed` event below, which is debounced by 5s.
    this.client._markActiveChannelsWatchInterrupted();

    // we're offline, wait few seconds and fire and event if still offline
    setTimeout(() => {
      if (this.isHealthy) return;
      this.client.dispatchEvent({ type: 'connection.changed', online: this.isHealthy });
    }, 5000);
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

    // 30 seconds is the recommended interval (messenger uses this)
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
