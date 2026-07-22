import type { AxiosRequestConfig, CancelTokenSource } from 'axios';
import axios from 'axios';
import type { StreamChat } from './client';
import {
  addConnectionEventListeners,
  removeConnectionEventListeners,
  retryInterval,
  sleep,
} from './utils';
import { isAPIError, isConnectionIDError, isErrorRetryable } from './errors';
import { chatLoggerSystem } from './logger';
import type { ConnectionOpen, UR } from './types';
import type { WSEvent } from './gen/models';

const logger = chatLoggerSystem.getLogger('connection-fallback');

export enum ConnectionState {
  Closed = 'CLOSED',
  Connected = 'CONNECTED',
  Connecting = 'CONNECTING',
  Disconnected = 'DISCONNECTED',
  Init = 'INIT',
}

export class WSConnectionFallback {
  client: StreamChat;
  state: ConnectionState;
  consecutiveFailures: number;
  connectionID?: string;
  cancelToken?: CancelTokenSource;

  constructor({ client }: { client: StreamChat }) {
    this.client = client;
    this.state = ConnectionState.Init;
    this.consecutiveFailures = 0;

    addConnectionEventListeners(this._onlineStatusChanged);
  }

  _setState(state: ConnectionState) {
    logger.withExtraTags('_setState').debug(`Transitioning to state: ${state}.`);

    // transition from connecting => connected
    if (
      this.state === ConnectionState.Connecting &&
      state === ConnectionState.Connected
    ) {
      this.client.dispatchEvent({ type: 'connection.changed', online: true });
    }

    if (state === ConnectionState.Closed || state === ConnectionState.Disconnected) {
      this.client.dispatchEvent({ type: 'connection.changed', online: false });
    }

    this.state = state;
  }

  /** @private */
  _onlineStatusChanged = (event: { type: string }) => {
    logger
      .withExtraTags('_onlineStatusChanged')
      .info(`Network status changed to ${event.type}.`);

    if (event.type === 'offline') {
      this._setState(ConnectionState.Closed);
      this.cancelToken?.cancel('disconnect() is called');
      this.cancelToken = undefined;
      return;
    }

    if (event.type === 'online' && this.state === ConnectionState.Closed) {
      this.connect(true);
    }
  };

  /** @private */
  _req = async <T = UR>(
    params: UR,
    config: AxiosRequestConfig,
    retry: boolean,
  ): Promise<T> => {
    if (!this.cancelToken && !params.close) {
      this.cancelToken = axios.CancelToken.source();
    }

    try {
      const res = await this.client.api.doAxiosRequest<T>(
        'get',
        (this.client.baseURL as string).replace(':3030', ':8900') + '/longpoll', // replace port if present for testing with local API
        undefined,
        { ...config, cancelToken: this.cancelToken?.token, params },
      );

      this.consecutiveFailures = 0; // always reset in case of no error
      return res;
    } catch (error: any) {
      this.consecutiveFailures += 1;

      if (retry && isErrorRetryable(error)) {
        logger
          .withExtraTags('_req')
          .debug('Encountered a retryable error. Retrying the request.');
        await sleep(retryInterval(this.consecutiveFailures));
        return this._req<T>(params, config, retry);
      }

      throw error;
    }
  };

  /** @private */
  _poll = async () => {
    while (this.state === ConnectionState.Connected) {
      try {
        const data = await this._req<{
          events: WSEvent[];
        }>({}, { timeout: 30000 }, true); // 30s => API responds in 20s if there is no event

        if (data.events?.length) {
          for (let i = 0; i < data.events.length; i++) {
            this.client.dispatchEvent(data.events[i]);
          }
        }
      } catch (error: any) {
        if (axios.isCancel(error)) {
          logger.withExtraTags('_poll').debug('Axios canceled the request.');
          return;
        }

        /** client.doAxiosRequest will take care of TOKEN_EXPIRED error */

        if (isConnectionIDError(error)) {
          logger
            .withExtraTags('_poll')
            .warn('Received a connection ID error. Reconnecting without an ID.');
          this._setState(ConnectionState.Disconnected);
          this.connect(true);
          return;
        }

        if (isAPIError(error) && !isErrorRetryable(error)) {
          this._setState(ConnectionState.Closed);
          return;
        }

        await sleep(retryInterval(this.consecutiveFailures));
      }
    }
  };

  /**
   * connect try to open a longpoll request
   *
   * @param reconnect - should be false for first call and true for subsequent calls to keep the connection alive and call recoverState
   */
  connect = async (reconnect = false) => {
    if (this.state === ConnectionState.Connecting) {
      logger
        .withExtraTags('connect')
        .warn('A connection attempt is already in progress.', { reconnect });
      return;
    }
    if (this.state === ConnectionState.Connected) {
      logger
        .withExtraTags('connect')
        .warn('Already connected and polling.', { reconnect });
      return;
    }

    this._setState(ConnectionState.Connecting);
    this.connectionID = undefined; // connect should be sent with empty connection_id so API creates one
    try {
      const { event } = await this._req<{ event: ConnectionOpen }>(
        { json: this.client._buildWSPayload() },
        { timeout: 8000 }, // 8s
        reconnect,
      );

      this._setState(ConnectionState.Connected);
      this.connectionID = event.connection_id;
      this.client.dispatchEvent(event);
      this._poll();
      if (reconnect) {
        this.client.recoverState();
      }
      return event;
    } catch (err) {
      this._setState(ConnectionState.Closed);
      throw err;
    }
  };

  /**
   * isHealthy checks if there is a connectionID and connection is in Connected state
   */
  isHealthy = () => !!this.connectionID && this.state === ConnectionState.Connected;

  disconnect = async (timeout = 2000) => {
    removeConnectionEventListeners(this._onlineStatusChanged);

    this._setState(ConnectionState.Disconnected);
    this.cancelToken?.cancel('disconnect() is called');
    this.cancelToken = undefined;

    const connection_id = this.connectionID;
    this.connectionID = undefined;

    try {
      await this._req({ close: true, connection_id }, { timeout }, false);
      logger.withExtraTags('disconnect').info('Closed the connection ID.');
    } catch (err) {
      logger.withExtraTags('disconnect').error('Disconnect failed.', { error: err });
    }
  };
}
