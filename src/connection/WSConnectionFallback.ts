import type { AxiosRequestConfig, CancelTokenSource } from 'axios';
import axios from 'axios';
import type { StreamChat } from '../client';
import { retryInterval, sleep } from '../utils';
import { isAPIError, isConnectionIDError, isErrorRetryable } from '../errors';
import { chatLoggerSystem } from '../logger';
import type { LogLevel } from '../logger';
import type { ConnectionOpen, Event } from '../types';

type UR = Record<string, unknown>;

const logger = chatLoggerSystem.getLogger('connection');

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
  }

  _log(msg: string, extra: UR = {}, level: LogLevel = 'info') {
    const log = logger.withExtraTags('connection_fallback');
    log[level]('WSConnectionFallback:' + msg, extra);
  }

  _setState(state: ConnectionState) {
    this._log(`_setState() - ${state}`);

    // transition from connecting => connected
    if (
      this.state === ConnectionState.Connecting &&
      state === ConnectionState.Connected
    ) {
      this.client.wsConnection._setStatus({ isHealthy: true });
    }

    if (state === ConnectionState.Closed || state === ConnectionState.Disconnected) {
      // The server keyed watches by this connection id, so no request may carry it any more.
      this.client.connectionIdManager.invalidate();
      if (this.client.wsConnection._setStatus({ isHealthy: false })) {
        this.client._markActiveChannelsWatchInterrupted();
      }
    }

    this.state = state;
  }

  /**
   * Applies a change in the device's network status. Stands in for v9's `window` online/offline
   * listeners: `WSConnection` routes the network-status store here once it has switched to this
   * long-poll.
   *
   * @internal
   */
  _applyNetworkStatus = (online: boolean) => {
    // Closed on purpose by `disconnect()`: going offline would move it to `Closed`, and the next
    // online would reconnect it.
    if (this.state === ConnectionState.Disconnected) return;

    this._log(`_applyNetworkStatus() - ${online ? 'online' : 'offline'}`);

    if (!online) {
      this._setState(ConnectionState.Closed);
      this.cancelToken?.cancel('disconnect() is called');
      this.cancelToken = undefined;
      return;
    }

    if (this.state === ConnectionState.Closed) {
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
        (this.client.baseURL as string).replace(':3030', ':8900') + '/api/v2/longpoll', // replace port if present for testing with local API
        undefined,
        { ...config, cancelToken: this.cancelToken?.token, params },
      );

      this.consecutiveFailures = 0; // always reset in case of no error
      return res;
    } catch (error: any) {
      this.consecutiveFailures += 1;

      if (retry && isErrorRetryable(error)) {
        this._log(`_req() - Retryable error, retrying request`);
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
          events: Event[];
        }>({ connection_id: this.connectionID }, { timeout: 30000 }, true); // 30s => API responds in 20s if there is no event

        if (data.events?.length) {
          for (let i = 0; i < data.events.length; i++) {
            this.client.dispatchEvent(data.events[i]);
          }
        }
      } catch (error: any) {
        if (axios.isCancel(error)) {
          this._log(`_poll() - axios canceled request`);
          return;
        }

        /** client.api.doAxiosRequest will take care of TOKEN_EXPIRED error */

        if (isConnectionIDError(error)) {
          this._log(`_poll() - ConnectionID error, connecting without ID...`);
          this._setState(ConnectionState.Disconnected);
          this.connect(true);
          return;
        }

        if (isAPIError(error) && !isErrorRetryable(error)) {
          this._setState(ConnectionState.Closed);
          // Nothing reconnects from here, so fail whatever is waiting for a connection id.
          this.client.connectionIdManager.rejectConnectionId(error);
          return;
        }

        await sleep(retryInterval(this.consecutiveFailures));
      }
    }
  };

  /**
   * connect try to open a longpoll request
   *
   * @param reconnect - should be false for first call and true for subsequent calls to keep the connection alive and settle the connect promises
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
    // Before anything awaits, so a watch issued now waits for this connection's id.
    this.client.connectionIdManager.arm();
    this.connectionID = undefined; // connect should be sent with empty connection_id so API creates one
    try {
      const { event } = await this._req<{ event: ConnectionOpen }>(
        { json: this.client._buildWSAuthMessage() },
        { timeout: 8000 }, // 8s
        reconnect,
      );

      // The id is published before the status says the connection is up, as the WebSocket does.
      this.connectionID = event.connection_id;
      this.client.connectionIdManager.resolveConnectionId(event.connection_id);
      this._setState(ConnectionState.Connected);
      this.client.dispatchEvent(event);
      this._poll();
      if (reconnect) {
        this.client._settleConnectPromises();
      }
      return event;
    } catch (err) {
      this._setState(ConnectionState.Closed);
      // Nothing retries a failed connect, so fail whatever is waiting for a connection id. A cancel
      // comes from `disconnect()`, which leaves them waiting for the next connection instead.
      if (!axios.isCancel(err)) this.client.connectionIdManager.rejectConnectionId(err);
      throw err;
    }
  };

  /**
   * isHealthy checks if there is a connectionID and connection is in Connected state
   */
  isHealthy = () => !!this.connectionID && this.state === ConnectionState.Connected;

  /** Whether a connect request is in flight. */
  get isConnecting() {
    return this.state === ConnectionState.Connecting;
  }

  disconnect = async (timeout = 2000) => {
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
