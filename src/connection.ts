import WebSocket from 'isomorphic-ws';
import { chatCodes, sleep, retryInterval } from './utils';
import { TokenManager } from './token_manager';
import {
  BaseDeviceFields,
  ConnectAPIResponse,
  ConnectionChangeEvent,
  ConnectionOpen,
  LiteralStringForUnion,
  Logger,
  UnknownType,
  UserResponse,
} from './types';

// Type guards to check WebSocket error type
const isCloseEvent = (
  res: WebSocket.CloseEvent | WebSocket.Data | WebSocket.ErrorEvent,
): res is WebSocket.CloseEvent => (res as WebSocket.CloseEvent).code !== undefined;

const isErrorEvent = (
  res: WebSocket.CloseEvent | WebSocket.Data | WebSocket.ErrorEvent,
): res is WebSocket.ErrorEvent => (res as WebSocket.ErrorEvent).error !== undefined;

type Constructor<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType extends UnknownType = UnknownType
> = {
  apiKey: string;
  authType: 'anonymous' | 'jwt';
  clientID: string;
  eventCallback: (event: ConnectionChangeEvent) => void;
  logger: Logger | (() => void);
  messageCallback: (messageEvent: WebSocket.MessageEvent) => void;
  recoverCallback: (
    open?: ConnectionOpen<ChannelType, CommandType, UserType>,
  ) => Promise<void>;
  tokenManager: TokenManager<UserType>;
  user: UserResponse<UserType>;
  userAgent: string;
  userID: string;
  wsBaseURL: string;
  device?: BaseDeviceFields;
};

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
export class StableWSConnection<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType extends UnknownType = UnknownType
> {
  apiKey: Constructor<ChannelType, CommandType, UserType>['apiKey'];
  authType: Constructor<ChannelType, CommandType, UserType>['authType'];
  clientID: Constructor<ChannelType, CommandType, UserType>['clientID'];
  eventCallback: Constructor<ChannelType, CommandType, UserType>['eventCallback'];
  logger: Constructor<ChannelType, CommandType, UserType>['logger'];
  messageCallback: Constructor<ChannelType, CommandType, UserType>['messageCallback'];
  recoverCallback: Constructor<ChannelType, CommandType, UserType>['recoverCallback'];
  tokenManager: Constructor<ChannelType, CommandType, UserType>['tokenManager'];
  user: Constructor<ChannelType, CommandType, UserType>['user'];
  userAgent: Constructor<ChannelType, CommandType, UserType>['userAgent'];
  userID: Constructor<ChannelType, CommandType, UserType>['userID'];
  wsBaseURL: Constructor<ChannelType, CommandType, UserType>['wsBaseURL'];
  device: Constructor<ChannelType, CommandType, UserType>['device'];

  connectionID?: string;
  connectionOpen?: ConnectAPIResponse<ChannelType, CommandType, UserType>;
  consecutiveFailures: number;
  pingInterval: number;
  healthCheckTimeoutRef?: NodeJS.Timeout;
  isConnecting: boolean;
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
  resolvePromise?: (value: WebSocket.MessageEvent) => void;
  totalFailures: number;
  ws?: WebSocket;
  wsID: number;

  constructor({
    apiKey,
    authType,
    clientID,
    eventCallback,
    logger,
    messageCallback,
    recoverCallback,
    tokenManager,
    user,
    userAgent,
    userID,
    wsBaseURL,
    device,
  }: Constructor<ChannelType, CommandType, UserType>) {
    this.wsBaseURL = wsBaseURL;
    this.clientID = clientID;
    this.userID = userID;
    this.user = user;
    this.authType = authType;
    this.userAgent = userAgent;
    this.apiKey = apiKey;
    this.tokenManager = tokenManager;
    this.device = device;
    /** consecutive failures influence the duration of the timeout */
    this.consecutiveFailures = 0;
    /** keep track of the total number of failures */
    this.totalFailures = 0;
    /** We only make 1 attempt to reconnect at the same time.. */
    this.isConnecting = false;
    /** Boolean that indicates if we have a working connection to the server */
    this.isHealthy = false;
    /** Callback when the connection fails and recovers */
    this.recoverCallback = recoverCallback;
    this.messageCallback = messageCallback;
    this.eventCallback = eventCallback;
    this.logger = logger;
    /** Incremented when a new WS connection is made */
    this.wsID = 1;
    /** Store the last event time for health checks */
    this.lastEvent = null;
    /** Send a health check message every 25 seconds */
    this.pingInterval = 25 * 1000;
    this.connectionCheckTimeout = this.pingInterval + 10 * 1000;
    this._listenForConnectionChanges();
  }

  /**
   * connect - Connect to the WS URL
   *
   * @return {ConnectAPIResponse<ChannelType, CommandType, UserType>} Promise that completes once the first health check message is received
   */
  async connect() {
    let healthCheck: ConnectionOpen<ChannelType, CommandType, UserType> | undefined;
    if (this.isConnecting) {
      throw Error(
        `You've called connect twice, can only attempt 1 connection at the time`,
      );
    }
    try {
      healthCheck = await this._connect();
      this.isConnecting = false;
      this.consecutiveFailures = 0;

      this.logger(
        'info',
        `connection:connect() - Established ws connection with healthcheck: ${healthCheck}`,
        {
          tags: ['connection'],
        },
      );
      return healthCheck;
    } catch (error) {
      this.isConnecting = false;
      this.isHealthy = false;
      this.consecutiveFailures += 1;
      if (error.code === chatCodes.TOKEN_EXPIRED && !this.tokenManager.isStatic()) {
        this.logger(
          'info',
          'connection:connect() - WS failure due to expired token, so going to try to reload token and reconnect',
          {
            tags: ['connection'],
          },
        );
        return this._reconnect({ refreshToken: true });
      }

      if (!error.isWSFailure) {
        // This is a permanent failure, throw the error...
        // We are keeping the error consistent with http error.
        throw new Error(
          JSON.stringify({
            code: error.code,
            StatusCode: error.StatusCode,
            message: error.message,
            isWSFailure: error.isWSFailure,
          }),
        );
      }
    }
  }

  _buildUrl = () => {
    const params = {
      user_id: this.user.id,
      user_details: this.user,
      user_token: this.tokenManager.getToken(),
      server_determines_connection_id: true,
      device: this.device,
    };
    const qs = encodeURIComponent(JSON.stringify(params));
    const token = this.tokenManager.getToken();
    return `${this.wsBaseURL}/connect?json=${qs}&api_key=${this.apiKey}&authorization=${token}&stream-auth-type=${this.authType}&X-Stream-Client=${this.userAgent}`;
  };

  /**
   * disconnect - Disconnect the connection and doesn't recover...
   *
   */
  disconnect(timeout?: number) {
    this.logger(
      'info',
      `connection:disconnect() - Closing the websocket connection for wsID ${this.wsID}`,
      {
        tags: ['connection'],
      },
    );

    this.wsID += 1;

    // start by removing all the listeners
    if (this.healthCheckTimeoutRef) {
      clearInterval(this.healthCheckTimeoutRef);
    }
    if (this.connectionCheckTimeoutRef) {
      clearInterval(this.connectionCheckTimeoutRef);
    }

    this._removeConnectionListeners();

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
          this.logger(
            'info',
            `connection:disconnect() - resolving isClosedPromise ${
              event ? 'with' : 'without'
            } close frame`,
            {
              tags: ['connection'],
              event,
            },
          );
          resolve();
        };

        ws.onclose = onclose;
        // In case we don't receive close frame websocket server in time,
        // lets not wait for more than 1 seconds.
        setTimeout(onclose, timeout != null ? timeout : 1000);
      });

      this.logger(
        'info',
        `connection:disconnect() - Manually closed connection by calling client.disconnect()`,
        {
          tags: ['connection'],
        },
      );

      ws.close(
        chatCodes.WS_CLOSED_SUCCESS,
        'Manually closed connection by calling client.disconnect()',
      );
    } else {
      this.logger(
        'info',
        `connection:disconnect() - ws connection doesn't exist or it is already closed.`,
        {
          tags: ['connection'],
        },
      );
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
    await this.tokenManager.tokenReady();
    this._setupConnectionPromise();
    const wsURL = this._buildUrl();
    this.ws = new WebSocket(wsURL);
    this.ws.onopen = this.onopen.bind(this, this.wsID);
    this.ws.onclose = this.onclose.bind(this, this.wsID);
    this.ws.onerror = this.onerror.bind(this, this.wsID);
    this.ws.onmessage = this.onmessage.bind(this, this.wsID);
    const response = await this.connectionOpen;

    if (response) {
      this.connectionID = response.connection_id;

      return response;
    }

    return undefined;
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
    this.logger('info', 'connection:_reconnect() - Initiating the reconnect', {
      tags: ['connection'],
    });
    // only allow 1 connection at the time
    if (this.isConnecting || this.isHealthy) {
      this.logger(
        'info',
        'connection:_reconnect() - Abort (1) since already connecting or healthy',
        {
          tags: ['connection'],
        },
      );
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
      this.logger(
        'info',
        'connection:_reconnect() - Abort (2) since already connecting or healthy',
        {
          tags: ['connection'],
        },
      );
      return;
    }

    this.isConnecting = true;

    // cleanup the old connection
    this.logger('info', 'connection:_reconnect() - Destroying current WS connection', {
      tags: ['connection'],
    });

    this._destroyCurrentWSConnection();

    if (options.refreshToken) {
      await this.tokenManager.loadToken();
    }

    try {
      const open = await this._connect();
      if (this.recoverCallback) {
        this.logger('info', 'connection:_reconnect() - Waiting for recoverCallBack', {
          tags: ['connection'],
        });
        await this.recoverCallback(open);
        this.logger('info', 'connection:_reconnect() - Finished recoverCallBack', {
          tags: ['connection'],
        });
      }
      this.isConnecting = false;
      this.consecutiveFailures = 0;
    } catch (error) {
      this.isConnecting = false;
      this.isHealthy = false;
      this.consecutiveFailures += 1;
      if (error.code === chatCodes.TOKEN_EXPIRED && !this.tokenManager.isStatic()) {
        this.logger(
          'info',
          'connection:_reconnect() - WS failure due to expired token, so going to try to reload token and reconnect',
          {
            tags: ['connection'],
          },
        );

        return this._reconnect({ refreshToken: true });
      }

      // reconnect on WS failures, don't reconnect if there is a code bug
      if (error.isWSFailure) {
        this.logger(
          'info',
          'connection:_reconnect() - WS failure, so going to try to reconnect',
          {
            tags: ['connection'],
          },
        );

        this._reconnect();
      }
    }
    this.logger('info', 'connection:_reconnect() - == END ==', {
      tags: ['connection'],
    });
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
      this.logger(
        'info',
        'connection:onlineStatusChanged() - Status changing to offline',
        {
          tags: ['connection'],
        },
      );
      this._setHealth(false);
    } else if (event.type === 'online') {
      // retry right now...
      // We check this.isHealthy, not sure if it's always
      // smart to create a new WS connection if the old one is still up and running.
      // it's possible we didn't miss any messages, so this process is just expensive and not needed.
      this.logger(
        'info',
        `connection:onlineStatusChanged() - Status changing to online. isHealthy: ${this.isHealthy}`,
        {
          tags: ['connection'],
        },
      );
      if (!this.isHealthy) {
        this._reconnect({ interval: 10 });
      }
    }
  };

  onopen = (wsID: number) => {
    if (this.wsID !== wsID) return;

    this.logger('info', 'connection:onopen() - onopen callback', {
      tags: ['connection'],
      wsID,
    });
  };

  onmessage = (wsID: number, event: WebSocket.MessageEvent) => {
    if (this.wsID !== wsID) return;

    const data = typeof event.data === 'string' ? JSON.parse(event.data) : null;

    // we wait till the first message before we consider the connection open..
    // the reason for this is that auth errors and similar errors trigger a ws.onopen and immediately
    // after that a ws.onclose..
    if (!this.isResolved && data) {
      if (data.error != null) {
        this.rejectPromise?.(this._errorFromWSEvent(data, false));
        return;
      } else {
        this.resolvePromise?.(event);
        // set healthy..
        this._setHealth(true);
      }
    }

    // trigger the event..
    this.lastEvent = new Date();
    this.logger('info', 'connection:onmessage() - onmessage callback', {
      tags: ['connection'],
      event,
      wsID,
    });

    if (data && data.type === 'health.check') {
      this.scheduleNextPing();
    }

    this.messageCallback(event);
    this.scheduleConnectionCheck();
  };

  onclose = (wsID: number, event: WebSocket.CloseEvent) => {
    this.logger('info', 'connection:onclose() - onclose callback - ' + event.code, {
      tags: ['connection'],
      event,
      wsID,
    });

    if (this.wsID !== wsID) return;

    if (event.code === chatCodes.WS_CLOSED_SUCCESS) {
      // this is a permanent error raised by stream..
      // usually caused by invalid auth details
      const error = new Error(
        `WS connection reject with error ${event.reason}`,
      ) as Error & { reason?: string };
      error.reason = event.reason;
      this.rejectPromise?.(error);
      this.logger(
        'info',
        `connection:onclose() - WS connection reject with error ${event.reason}`,
        {
          tags: ['connection'],
          event,
        },
      );
    } else {
      this.consecutiveFailures += 1;
      this.totalFailures += 1;
      this._setHealth(false);

      this.rejectPromise?.(this._errorFromWSEvent(event));

      this.logger(
        'info',
        `connection:onclose() - WS connection closed. Calling reconnect ...`,
        {
          tags: ['connection'],
          event,
        },
      );

      // reconnect if its an abnormal failure
      this._reconnect();
    }
  };

  onerror = (wsID: number, event: WebSocket.ErrorEvent) => {
    if (this.wsID !== wsID) return;

    this.consecutiveFailures += 1;
    this.totalFailures += 1;
    this._setHealth(false);

    this.rejectPromise?.(this._errorFromWSEvent(event));
    this.logger('info', `connection:onerror() - WS connection resulted into error`, {
      tags: ['connection'],
      event,
    });

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
    if (healthy && !this.isHealthy) {
      // yes we are online:
      this.isHealthy = true;
      this.eventCallback({
        type: 'connection.changed',
        online: true,
      });
    }

    if (!healthy && this.isHealthy) {
      // bummer we are offline
      this.isHealthy = false;
      setTimeout(() => {
        if (!this.isHealthy) {
          this.eventCallback({
            type: 'connection.changed',
            online: false,
          });
        }
      }, 5000);
    }
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
    this.logger('warn', `connection:_errorFromWSEvent() - WS failed with code ${code}`, {
      tags: ['connection'],
      event,
    });

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
   * _listenForConnectionChanges - Adds an event listener for the browser going online or offline
   *
   */
  _listenForConnectionChanges = () => {
    if (
      typeof window !== 'undefined' &&
      window != null &&
      window.addEventListener != null
    ) {
      window.addEventListener('offline', this.onlineStatusChanged);
      window.addEventListener('online', this.onlineStatusChanged);
    }
  };

  _removeConnectionListeners = () => {
    if (
      typeof window !== 'undefined' &&
      window != null &&
      window.addEventListener != null
    ) {
      window.removeEventListener('offline', this.onlineStatusChanged);
      window.removeEventListener('online', this.onlineStatusChanged);
    }
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
      if (this.ws && this.ws.removeAllListeners) {
        this.ws.removeAllListeners();
      }

      if (this.ws && this.ws.close) {
        this.ws.close();
      }
    } catch (e) {
      // we don't care
    }
  }

  /**
   * _setupPromise - sets up the this.connectOpen promise
   */
  _setupConnectionPromise = () => {
    const that = this;
    this.isResolved = false;
    /** a promise that is resolved once ws.open is called */
    this.connectionOpen = new Promise<WebSocket.MessageEvent>(function (resolve, reject) {
      that.resolvePromise = resolve;
      that.rejectPromise = reject;
    }).then(
      (e) => {
        if (e.data && typeof e.data === 'string') {
          const data = JSON.parse(e.data) as ConnectionOpen<
            ChannelType,
            CommandType,
            UserType
          > & {
            error?: unknown;
          };
          if (data && data.error != null) {
            throw new Error(JSON.stringify(data.error));
          }
          return data;
        } else {
          return undefined;
        }
      },
      (error) => {
        throw error;
      },
    );
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
      const data = [
        {
          type: 'health.check',
          client_id: this.clientID,
          user_id: this.userID,
        },
      ];
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
        this.logger('info', 'connection:scheduleConnectionCheck - going to reconnect', {
          tags: ['connection'],
        });
        this._setHealth(false);
        this._reconnect();
      }
    }, this.connectionCheckTimeout);
  };
}
