import axios, { AxiosRequestConfig, CancelTokenSource } from 'axios';
import { StreamChat } from './client';
import { addConnectionEventListeners, removeConnectionEventListeners, retryInterval, sleep } from './utils';
import { isAPIError, isConnectionIDError, isErrorRetryable } from './errors';
import { ConnectionOpen, Event, UR, ExtendableGenerics, DefaultGenerics, LogLevel } from './types';

export enum ConnectionState {
  Closed = 'CLOSED',
  Connected = 'CONNECTED',
  Connecting = 'CONNECTING',
  Disconnected = 'DISCONNECTED',
  Init = 'INIT',
}

export class WSConnectionFallback<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> {
  client: StreamChat<StreamChatGenerics>;
  state: ConnectionState;
  consecutiveFailures: number;
  connectionID?: string;
  cancelToken?: CancelTokenSource;

  constructor({ client }: { client: StreamChat<StreamChatGenerics> }) {
    this.client = client;
    this.state = ConnectionState.Init;
    this.consecutiveFailures = 0;

    addConnectionEventListeners(this._onlineStatusChanged);
  }

  _log(msg: string, extra: UR = {}, level: LogLevel = 'info') {
    this.client.logger(level, 'WSConnectionFallback:' + msg, { tags: ['connection_fallback', 'connection'], ...extra });
  }

  _setState(state: ConnectionState) {
    this._log(`_setState() - ${state}`);

    // transition from connecting => connected
    if (this.state === ConnectionState.Connecting && state === ConnectionState.Connected) {
      this.client.dispatchEvent({ type: 'connection.changed', online: true });
    }

    if (state === ConnectionState.Closed || state === ConnectionState.Disconnected) {
      this.client.dispatchEvent({ type: 'connection.changed', online: false });
    }

    this.state = state;
  }

  /** @private */
  _onlineStatusChanged = (event: { type: string }) => {
    this._log(`_onlineStatusChanged() - ${event.type}`);

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
  _req = async <T = UR>(params: UR, config: AxiosRequestConfig, retry: boolean): Promise<T> => {
    if (!this.cancelToken && !params.close) {
      this.cancelToken = axios.CancelToken.source();
    }

    try {
      const res = await this.client.doAxiosRequest<T>(
        'get',
        (this.client.baseURL as string).replace(':3030', ':8900') + '/longpoll', // replace port if present for testing with local API
        undefined,
        {
          config: { ...config, cancelToken: this.cancelToken?.token },
          params,
        },
      );

      this.consecutiveFailures = 0; // always reset in case of no error
      return res;
    } catch (err) {
      this.consecutiveFailures += 1;

      if (retry && isErrorRetryable(err)) {
        this._log(`_req() - Retryable error, retrying request`);
        await sleep(retryInterval(this.consecutiveFailures));
        return this._req<T>(params, config, retry);
      }

      throw err;
    }
  };

  /** @private */
  _poll = async () => {
    while (this.state === ConnectionState.Connected) {
      try {
        const data = await this._req<{
          events: Event<StreamChatGenerics>[];
        }>({}, { timeout: 30000 }, true); // 30s => API responds in 20s if there is no event

        if (data.events?.length) {
          for (let i = 0; i < data.events.length; i++) {
            this.client.dispatchEvent(data.events[i]);
          }
        }
      } catch (err) {
        if (axios.isCancel(err)) {
          this._log(`_poll() - axios canceled request`);
          return;
        }

        /** client.doAxiosRequest will take care of TOKEN_EXPIRED error */

        if (isConnectionIDError(err)) {
          this._log(`_poll() - ConnectionID error, connecting without ID...`);
          this._setState(ConnectionState.Disconnected);
          this.connect(true);
          return;
        }

        if (isAPIError(err) && !isErrorRetryable(err)) {
          this._setState(ConnectionState.Closed);
          return;
        }

        await sleep(retryInterval(this.consecutiveFailures));
      }
    }
  };

  /**
   * connect try to open a longpoll request
   * @param reconnect should be false for first call and true for subsequent calls to keep the connection alive and call recoverState
   */
  connect = async (reconnect = false) => {
    if (this.state === ConnectionState.Connecting) {
      this._log('connect() - connecting already in progress', { reconnect }, 'warn');
      return;
    }
    if (this.state === ConnectionState.Connected) {
      this._log('connect() - already connected and polling', { reconnect }, 'warn');
      return;
    }

    this._setState(ConnectionState.Connecting);
    this.connectionID = undefined; // connect should be sent with empty connection_id so API creates one
    try {
      const { event } = await this._req<{ event: ConnectionOpen<StreamChatGenerics> }>(
        { json: this.client._buildWSPayload() },
        { timeout: 8000 }, // 8s
        reconnect,
      );

      this._setState(ConnectionState.Connected);
      this.connectionID = event.connection_id;
      // @ts-expect-error
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
  isHealthy = () => {
    return !!this.connectionID && this.state === ConnectionState.Connected;
  };

  disconnect = async (timeout = 2000) => {
    removeConnectionEventListeners(this._onlineStatusChanged);

    this._setState(ConnectionState.Disconnected);
    this.cancelToken?.cancel('disconnect() is called');
    this.cancelToken = undefined;

    const connection_id = this.connectionID;
    this.connectionID = undefined;

    try {
      await this._req({ close: true, connection_id }, { timeout }, false);
      this._log(`disconnect() - Closed connectionID`);
    } catch (err) {
      this._log(`disconnect() - Failed`, { err }, 'error');
    }
  };
}
