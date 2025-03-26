import WebSocket from 'isomorphic-ws';
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
import type { ConnectAPIResponse, ConnectionOpen, LogLevel, UR } from './types';
import type { StreamChat } from './client';
import type { APIError } from './errors';

// Type guards to check WebSocket error type
const isCloseEvent = (
  res: WebSocket.CloseEvent | WebSocket.Data | WebSocket.ErrorEvent,
): res is WebSocket.CloseEvent => (res as WebSocket.CloseEvent).code !== undefined;

const isErrorEvent = (
  res: WebSocket.CloseEvent | WebSocket.Data | WebSocket.ErrorEvent,
): res is WebSocket.ErrorEvent => (res as WebSocket.ErrorEvent).error !== undefined;

/**
 * StableWSConnection - A WS connection that reconnects upon failure.
 * - the browser will sometimes report that you're online or offline
 * - the WS connection can break and fail (there is a 30s health check)
 * - sometimes your WS connection will seem to work while the user is in fact offline
 * - to speed up online/offline detection you can use the window.addEventListener('offline');
 *
 * There are 4 ways in which a connection can become unhealthy:
 * - websocket.onerror is called
 * - websocket.onclose is called
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

  _log(msg: string, extra: UR = {}, level: LogLevel = 'info') {
    this.client.logger(level, 'connection:' + msg, { tags: ['connection'], ...extra });
  }

  setClient(client: StreamChat) {
    this.client = client;
  }

  /**
   * connect - Connect to the WS URL
   * the default 15s timeout allows between 2~3 tries
   * @return {ConnectAPIResponse<ChannelType, CommandType, UserType>} Promise that completes once the first health check message is received
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

      this._log(`connect() - Established ws connection with healthcheck: ${healthCheck}`);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      this.isHealthy = false;
      this.consecutiveFailures += 1;

      const e = error as APIError;

      if (e.code === chatCodes.TOKEN_EXPIRED && !this.client.tokenManager.isStatic()) {
        this._log(
          'connect() - WS failure due to expired token, so going to try to reload token and reconnect',
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
   * @param timeout duration(ms)
   */
  _waitForHealthy(timeout = 15000) {
    return Promise.race([
      (async () => {
        const interval = 50; // ms
        for (let i = 0; i <= timeout; i += interval) {
          try {
            return await this.connectionOpen;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
   * Builds and returns the url for websocket.
   * @private
   * @returns url string
   */
  _buildUrl = () => {
    const qs = this.client._buildWSPayload(this.requestID);
    const token = this.client.tokenManager.getToken();
    const wsUrlParams = this.client.options.wsUrlParams;

    const params = new URLSearchParams(wsUrlParams);
    params.set('json', qs);
    params.set('api_key', this.client.key);
    // it is expected that the autorization parameter exists even if
    // the token is undefined, so we interpolate it to be safe
    params.set('authorization', `${token}`);
    params.set('stream-auth-type', this.client.getAuthType());
    params.set('X-Stream-Client', this.client.getUserAgent());

    return `${this.client.wsBaseURL}/connect?${params.toString()}`;
  };

  /**
   * disconnect - Disconnect the connection and doesn't recover...
   *
   */
  disconnect(timeout?: number) {
    this._log(`disconnect() - Closing the websocket connection for wsID ${this.wsID}`);

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

    // remove ws handlers...
    if (this.ws && this.ws.removeAllListeners) {
      this.ws.removeAllListeners();
    }

    let isClosedPromise: Promise<void>;
    // and finally close...
    // Assigning to local here because we will remove it from this before the
    // promise resolves.
    const { ws } = this;
    if (ws && ws.close && ws.readyState === ws.OPEN) {
      isClosedPromise = new Promise((resolve) => {
        const onclose = (event: WebSocket.CloseEvent) => {
          this._log(
            `disconnect() - resolving isClosedPromise ${event ? 'with' : 'without'} close frame`,
            { event },
          );
          resolve();
        };

        ws.onclose = onclose;
        // In case we don't receive close frame websocket server in time,
        // lets not wait for more than 1 seconds.
        setTimeout(onclose, timeout != null ? timeout : 1000);
      });

      this._log(
        `disconnect() - Manually closed connection by calling client.disconnect()`,
      );

      ws.close(
        chatCodes.WS_CLOSED_SUCCESS,
        'Manually closed connection by calling client.disconnect()',
      );
    } else {
      this._log(`disconnect() - ws connection doesn't exist or it is already closed.`);
      isClosedPromise = Promise.resolve();
    }

    delete this.ws;

    return isClosedPromise;
  }

  /**
   * _connect - Connect to the WS endpoint
   *
   * @return {ConnectAPIResponse<ChannelType, CommandType, UserType>} Promise that completes once the first health check message is received
   */
  async _connect() {
    if (
      this.isConnecting ||
      (this.isDisconnected && this.client.options.enableWSFallback)
    )
      return; // simply ignore _connect if it's currently trying to connect
    this.isConnecting = true;
    this.requestID = randomId();
    this.client.insightMetrics.connectionStartTimestamp = new Date().getTime();
    let isTokenReady = false;
    try {
      this._log(`_connect() - waiting for token`);
      await this.client.tokenManager.tokenReady();
      isTokenReady = true;
    } catch (e) {
      // token provider has failed before, so try again
    }

    try {
      if (!isTokenReady) {
        this._log(`_connect() - tokenProvider failed before, so going to retry`);
        await this.client.tokenManager.loadToken();
      }

      this._setupConnectionPromise();
      const wsURL = this._buildUrl();
      this._log(`_connect() - Connecting to ${wsURL}`, {
        wsURL,
        requestID: this.requestID,
      });
      this.ws = new WebSocket(wsURL);
      this.ws.onopen = this.onopen.bind(this, this.wsID);
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
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      this.isConnecting = false;
      this._log(`_connect() - Error - `, error);
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
   * _reconnect - Retry the connection to WS endpoint
   *
   * @param {{ interval?: number; refreshToken?: boolean }} options Following options are available
   *
   * - `interval`	{int}			number of ms that function should wait before reconnecting
   * - `refreshToken` {boolean}	reload/refresh user token be refreshed before attempting reconnection.
   */
  async _reconnect(
    options: { interval?: number; refreshToken?: boolean } = {},
  ): Promise<void> {
    this._log('_reconnect() - Initiating the reconnect');

    // only allow 1 connection at the time
    if (this.isConnecting || this.isHealthy) {
      this._log('_reconnect() - Abort (1) since already connecting or healthy');
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
      this._log('_reconnect() - Abort (2) since already connecting or healthy');
      return;
    }

    if (this.isDisconnected && this.client.options.enableWSFallback) {
      this._log('_reconnect() - Abort (3) since disconnect() is called');
      return;
    }

    this._log('_reconnect() - Destroying current WS connection');

    // cleanup the old connection
    this._destroyCurrentWSConnection();

    if (options.refreshToken) {
      await this.client.tokenManager.loadToken();
    }

    try {
      await this._connect();
      this._log('_reconnect() - Waiting for recoverCallBack');
      await this.client.recoverState();
      this._log('_reconnect() - Finished recoverCallBack');

      this.consecutiveFailures = 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (error: any) {
      this.isHealthy = false;
      this.consecutiveFailures += 1;
      if (
        error.code === chatCodes.TOKEN_EXPIRED &&
        !this.client.tokenManager.isStatic()
      ) {
        this._log(
          '_reconnect() - WS failure due to expired token, so going to try to reload token and reconnect',
        );

        return this._reconnect({ refreshToken: true });
      }

      // reconnect on WS failures, don't reconnect if there is a code bug
      if (error.isWSFailure) {
        this._log('_reconnect() - WS failure, so going to try to reconnect');

        this._reconnect();
      }
    }
    this._log('_reconnect() - == END ==');
  }

  /**
   * onlineStatusChanged - this function is called when the browser connects or disconnects from the internet.
   *
   * @param {Event} event Event with type online or offline
   *
   */
  onlineStatusChanged = (event: Event) => {
    if (event.type === 'offline') {
      // mark the connection as down
      this._log('onlineStatusChanged() - Status changing to offline');
      this._setHealth(false);
    } else if (event.type === 'online') {
      // retry right now...
      // We check this.isHealthy, not sure if it's always
      // smart to create a new WS connection if the old one is still up and running.
      // it's possible we didn't miss any messages, so this process is just expensive and not needed.
      this._log(
        `onlineStatusChanged() - Status changing to online. isHealthy: ${this.isHealthy}`,
      );
      if (!this.isHealthy) {
        this._reconnect({ interval: 10 });
      }
    }
  };

  onopen = (wsID: number) => {
    if (this.wsID !== wsID) return;

    this._log('onopen() - onopen callback', { wsID });
  };

  onmessage = (wsID: number, event: WebSocket.MessageEvent) => {
    if (this.wsID !== wsID) return;

    this._log('onmessage() - onmessage callback', { event, wsID });
    const data = typeof event.data === 'string' ? JSON.parse(event.data) : null;

    // we wait till the first message before we consider the connection open..
    // the reason for this is that auth errors and similar errors trigger a ws.onopen and immediately
    // after that a ws.onclose..
    if (!this.isResolved && data) {
      this.isResolved = true;
      if (data.error) {
        this.rejectPromise?.(this._errorFromWSEvent(data, false));
        return;
      }

      this.resolvePromise?.(data);
      this._setHealth(true);
    }

    // trigger the event..
    this.lastEvent = new Date();

    if (data && data.type === 'health.check') {
      this.scheduleNextPing();
    }

    this.client.handleEvent(event);
    this.scheduleConnectionCheck();
  };

  onclose = (wsID: number, event: WebSocket.CloseEvent) => {
    if (this.wsID !== wsID) return;

    this._log('onclose() - onclose callback - ' + event.code, { event, wsID });

    if (event.code === chatCodes.WS_CLOSED_SUCCESS) {
      // this is a permanent error raised by stream..
      // usually caused by invalid auth details
      const error = new Error(
        `WS connection reject with error ${event.reason}`,
      ) as Error & WebSocket.CloseEvent;

      error.reason = event.reason;
      error.code = event.code;
      error.wasClean = event.wasClean;
      error.target = event.target;

      this.rejectPromise?.(error);
      this._log(`onclose() - WS connection reject with error ${event.reason}`, { event });
    } else {
      this.consecutiveFailures += 1;
      this.totalFailures += 1;
      this._setHealth(false);
      this.isConnecting = false;

      this.rejectPromise?.(this._errorFromWSEvent(event));

      this._log(`onclose() - WS connection closed. Calling reconnect ...`, { event });

      // reconnect if its an abnormal failure
      this._reconnect();
    }
  };

  onerror = (wsID: number, event: WebSocket.ErrorEvent) => {
    if (this.wsID !== wsID) return;

    this.consecutiveFailures += 1;
    this.totalFailures += 1;
    this._setHealth(false);
    this.isConnecting = false;

    this.rejectPromise?.(this._errorFromWSEvent(event));
    this._log(`onerror() - WS connection resulted into error`, { event });

    this._reconnect();
  };

  /**
   * _setHealth - Sets the connection to healthy or unhealthy.
   * Broadcasts an event in case the connection status changed.
   *
   * @param {boolean} healthy boolean indicating if the connection is healthy or not
   *
   */
  _setHealth = (healthy: boolean) => {
    if (healthy === this.isHealthy) return;

    this.isHealthy = healthy;

    if (this.isHealthy) {
      this.client.dispatchEvent({ type: 'connection.changed', online: this.isHealthy });
      return;
    }

    // we're offline, wait few seconds and fire and event if still offline
    setTimeout(() => {
      if (this.isHealthy) return;
      this.client.dispatchEvent({ type: 'connection.changed', online: this.isHealthy });
    }, 5000);
  };

  /**
   * _errorFromWSEvent - Creates an error object for the WS event
   *
   */
  _errorFromWSEvent = (
    event: WebSocket.CloseEvent | WebSocket.Data | WebSocket.ErrorEvent,
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
    this._log(`_errorFromWSEvent() - WS failed with code ${code}`, { event }, 'warn');

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
   * _destroyCurrentWSConnection - Removes the current WS connection
   *
   */
  _destroyCurrentWSConnection() {
    // increment the ID, meaning we will ignore all messages from the old
    // ws connection from now on.
    this.wsID += 1;

    try {
      this?.ws?.removeAllListeners();
      this?.ws?.close();
    } catch (e) {
      // we don't care
    }
  }

  /**
   * _setupPromise - sets up the this.connectOpen promise
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
   * Schedules a next health check ping for websocket.
   */
  scheduleNextPing = () => {
    if (this.healthCheckTimeoutRef) {
      clearTimeout(this.healthCheckTimeoutRef);
    }

    // 30 seconds is the recommended interval (messenger uses this)
    this.healthCheckTimeoutRef = setTimeout(() => {
      // send the healthcheck.., server replies with a health check event
      const data = [{ type: 'health.check', client_id: this.client.clientID }];
      // try to send on the connection
      try {
        this.ws?.send(JSON.stringify(data));
      } catch (e) {
        // error will already be detected elsewhere
      }
    }, this.pingInterval);
  };

  /**
   * scheduleConnectionCheck - schedules a check for time difference between last received event and now.
   * If the difference is more than 35 seconds, it means our health check logic has failed and websocket needs
   * to be reconnected.
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
        this._log('scheduleConnectionCheck - going to reconnect');
        this._setHealth(false);
        this._reconnect();
      }
    }, this.connectionCheckTimeout);
  };
}
