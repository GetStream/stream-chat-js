import { chatCodes, randomId, retryInterval, sleep } from '../../utils';
import { chatLoggerSystem } from '../../logger';
import { WS_NETWORK_RECOVERY_RETRY_MS } from './config';
import type { ConnectAPIResponse, ConnectionOpen } from '../../types';
import type { WSConnection } from './WSConnection';
import type { StreamChat } from '../../client';
import type { APIError } from '../../errors';
import type { WSEvent } from '../../gen/models';
import type { WSConnectionConfig } from './types';

const logger = chatLoggerSystem.getLogger('connection');

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
 * A WS connection that reconnects upon failure. A ping goes out every `pingIntervalMs`, and the
 * connection goes down on `onerror`, `onclose`, no frame within `connectionCheckTimeout`, or when
 * `client.networkConnection` reports the device offline (this class consumes that status, it does not
 * detect it).
 *
 * It assumes state can be recovered by querying the channel again, and that the server destroys the
 * connection when it fails to publish a message to the client.
 */
export class StableWSConnection {
  /** The owning `WSConnection`, through which the client is reached. */
  wsConnection: WSConnection;

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
    this.wsConnection = wsConnection;
    this.consecutiveFailures = 0;
    this.totalFailures = 0;
    this.isConnecting = false;
    /** Set by `disconnect()` so a pending reconnect gives up. */
    this.isDisconnected = false;
    this.isResolved = false;
    this.isHealthy = false;
    /** Incremented when the current socket is closed or destroyed; older ids' callbacks are ignored. */
    this.wsID = 1;
    this.lastEvent = null;
  }

  /** Read live from the parent, so a config update reaches an already open socket. */
  private get config(): WSConnectionConfig {
    return this.wsConnection.config;
  }

  get pingInterval(): number {
    return this.config.pingIntervalMs;
  }

  /** Silence tolerated before the socket is torn down: `pingIntervalMs + healthCheckGracePeriodMs`. */
  get connectionCheckTimeout(): number {
    return this.config.pingIntervalMs + this.config.healthCheckGracePeriodMs;
  }

  get client(): StreamChat {
    return this.wsConnection.client;
  }

  /** Re-parents a socket supplied through `config.connection`. */
  setWSConnection(wsConnection: WSConnection) {
    this.wsConnection = wsConnection;
  }

  /**
   * Connects to the WS URL, resolving once the server's `connection.ok` hello event arrives.
   *
   * @param timeout - Connect timeout in milliseconds. Defaults to `config.connectTimeoutMs`.
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
   * Polls the connection promise until it resolves or `timeout` (ms, default
   * `config.connectTimeoutMs`) elapses.
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

  _buildUrl = () => {
    const params = new URLSearchParams(this.config.urlParams);
    params.set('api_key', this.client.key);
    params.set('stream-auth-type', this.client.getAuthType());
    // Browsers cannot set headers on the WS handshake, so the server reads this from the query too.
    params.set('X-Stream-Client', this.client.getUserAgent());

    return `${this.client.wsBaseURL}/api/v2/connect?${params.toString()}`;
  };

  /**
   * Closes the socket without attempting to recover.
   *
   * @param timeout - How long to wait for the server's close frame, in milliseconds. Defaults to 1s.
   */
  disconnect(timeout?: number) {
    logger
      .withExtraTags('disconnect')
      .info(`Closing the WebSocket connection for wsID ${this.wsID}.`);

    this.wsID += 1;
    this.isConnecting = false;
    this.isDisconnected = true;
    // A deliberate close still expects a reopen (mobile backgrounding), so waiters keep waiting:
    // invalidating drops the dead id and arms a fresh deferred for the next socket.
    this.client.connectionIdManager.invalidate();

    // Stop the ping and connection-check timers.
    if (this.healthCheckTimeoutRef) {
      clearInterval(this.healthCheckTimeoutRef);
    }
    if (this.connectionCheckTimeoutRef) {
      clearInterval(this.connectionCheckTimeoutRef);
    }

    // Through `_applyHealth` so the store records a deliberate close as a transition too.
    this._applyHealth(false);

    let isClosedPromise: Promise<void>;
    // Local copy: `this.ws` is deleted before the promise resolves.
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
        // Don't wait longer than the timeout for the server's close frame.
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

  /** Connects to the WS endpoint, resolving with the server's `connection.ok` hello event. */
  async _connect() {
    // Ignored while connecting, or after `disconnect()`.
    if (this.isConnecting || this.isDisconnected) return;
    this.isConnecting = true;
    this.requestID = randomId();
    // Arm before anything can await a connection id. A no-op while one is still held.
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
      // Built before the socket exists, so a failure rejects `_connect` instead of leaving an open
      // socket to hit the server's 10s auth-message deadline.
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
        // The id lives only in the ConnectionIdManager, so no stale copy outlives this socket.
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
   * Retries the connection.
   *
   * @param options.interval - Milliseconds to wait first. Defaults to a randomised backoff.
   * @param options.refreshToken - Reload the user token before reconnecting.
   */
  async _reconnect(
    options: { interval?: number; refreshToken?: boolean } = {},
  ): Promise<void> {
    logger.withExtraTags('_reconnect').info('Initiating a reconnect.');

    if (this.isConnecting || this.isHealthy) {
      logger
        .withExtraTags('_reconnect')
        .debug('Aborting reconnect: already connecting or healthy (check 1).');
      return;
    }

    let interval = options.interval;
    if (!interval) {
      interval = retryInterval(this.consecutiveFailures);
    }
    await sleep(interval);

    // Re-check: another `_reconnect` may have started, or the connection been restored, meanwhile.
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
        // Giving up: reject the deferred armed when the socket went down, or waiting requests hang.
        this.client.connectionIdManager.rejectConnectionId(error);
      }
    }
    logger.withExtraTags('_reconnect').debug('Reconnect attempt finished.');
  }

  /**
   * Only `event.type` (`'online'` or `'offline'`) is read.
   *
   * @deprecated Use `client.networkConnection.setStatus(isOnline)` or
   *   `client.networkConnection.setStatusReporter(…)` instead.
   */
  onlineStatusChanged = (event: Event) => {
    if (event.type === 'offline') this._applyNetworkStatus(false);
    else if (event.type === 'online') this._applyNetworkStatus(true);
  };

  /**
   * Applies a network status change to this socket. Shared by the parent's network-store
   * subscription and the deprecated {@link onlineStatusChanged}.
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

    // A socket still carrying traffic has probably missed nothing: reconnect only if it is down.
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

    // `/api/v2/connect` authenticates off the first frame the client sends, not the query string.
    // The server closes the socket if it does not arrive in 10s.
    const { ws } = this;
    // `disconnect()` deletes `this.ws` synchronously: the wsID guard above covers reconnects, this
    // covers a socket torn down before `open` was dispatched.
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
    const decodedData = data as WSEvent;

    // The first message, not `onopen`, marks the connection open: auth errors fire `onopen` and
    // then `onclose`.
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

    this.lastEvent = new Date();

    // The ping loop starts from the hello and continues on each health check. Without it the
    // connection check would tear the socket down every `connectionCheckTimeout`.
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
      // A permanent error raised by Stream, usually invalid auth details.
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
   * Writes the status to the field and to `client.wsConnection.state`, and drops the connection id
   * when it goes down. Returns whether the status changed. Every transition goes through here
   * (`disconnect()` and the error paths included); the constructor does not, since initializing the
   * field is not a transition.
   */
  private _applyHealth(healthy: boolean): boolean {
    if (healthy === this.isHealthy) return false;

    this.isHealthy = healthy;

    if (!healthy) {
      // The id is dead; invalidating arms a fresh deferred so requests wait for the reconnect.
      this.client.connectionIdManager.invalidate();
    }

    this.wsConnection._setStatus({ isHealthy: healthy });

    return true;
  }

  /** Applies a status change; on a drop, marks the channel watches as interrupted. */
  _setHealth = (healthy: boolean) => {
    if (!this._applyHealth(healthy)) return;
    if (this.isHealthy) return;

    // The server keys channel watches by connection ID, so they are gone the moment the socket is.
    this.client.channelManager.markChannelsWatchInterrupted();
  };

  /**
   * Turns a raw WebSocket close, message or error event into an `Error` carrying `code`,
   * `StatusCode` and `isWSFailure`.
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

    // `warn`, not `error`, to avoid cluttering error logs with WS failures.
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
    // `StatusCode` is not on any event type; kept for JS compatibility.
    error.StatusCode = statusCode;
    error.isWSFailure = isWSFailure;
    return error;
  };

  _destroyCurrentWSConnection() {
    // Callbacks bound to the old id are ignored.
    this.wsID += 1;

    try {
      this?.ws?.close();
    } catch (e) {
      // we don't care
    }
  }

  _setupConnectionPromise = () => {
    this.isResolved = false;
    // Resolved by the first message (`connection.ok`), rejected on an error or close.
    this.connectionOpen = new Promise<ConnectionOpen>((resolve, reject) => {
      this.resolvePromise = resolve;
      this.rejectPromise = reject;
    });
  };

  scheduleNextPing = () => {
    if (this.healthCheckTimeoutRef) {
      clearTimeout(this.healthCheckTimeoutRef);
    }

    this.healthCheckTimeoutRef = setTimeout(() => {
      // The server answers with a health check event.
      const data = [{ type: 'health.check', client_id: this.client.clientId }];
      try {
        this.ws?.send(JSON.stringify(data));
      } catch (e) {
        // error will already be detected elsewhere
      }
    }, this.pingInterval);
  };

  /** Reconnects when no event has arrived for more than `connectionCheckTimeout`. */
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
