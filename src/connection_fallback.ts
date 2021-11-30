import axios, { AxiosRequestConfig, CancelTokenSource } from 'axios';
import { chatCodes, retryInterval, sleep } from './utils';
import { StreamChat } from './client';
import { ConnectionOpen, Event, UnknownType, UR } from './types';

enum ConnectionState {
  Closed = 'CLOSED',
  Connected = 'CONNECTED',
  Connecting = 'CONNECTING',
  Disconnectted = 'DISCONNECTTED',
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

  /** @private */
  _req = <T = UR>(params: UnknownType, config: AxiosRequestConfig) => {
    if (!this.cancelToken && !params.close) {
      this.cancelToken = axios.CancelToken.source();
    }

    return this.client.doAxiosRequest<T>('get', this.client.baseURL + '/longpoll', undefined, {
      params,
      config: {
        ...config,
        cancelToken: this.cancelToken?.token,
      },
    });
  };

  /** @private */
  _poll = async () => {
    this.consecutiveFailures = 0;

    while (this.state === ConnectionState.Connected) {
      try {
        const data = await this._req<{ events: Event[] }>(
          {},
          { timeout: 30000 }, // 30s
        );

        if (data?.events?.length) {
          for (let i = 0; i < data.events.length; i++) {
            this.client.dispatchEvent(data.events[i]);
          }
        }
      } catch (err) {
        if (axios.isCancel(err)) {
          return;
        }

        /** client.doAxiosRequest will take care of TOKEN_EXPIRED error */
        if (err.code === chatCodes.CONNECTION_ID_ERROR) {
          this.state = ConnectionState.Disconnectted;
          this.connect();
          return;
        }

        //TODO: check for non-retryable errors

        this.consecutiveFailures += 1;
        await sleep(retryInterval(this.consecutiveFailures));
      }
    }
  };

  connect = async () => {
    if (this.state === ConnectionState.Connecting) {
      throw new Error('connecting already in progress');
    }
    if (this.state === ConnectionState.Connected) {
      throw new Error('already connected and polling');
    }

    this.state = ConnectionState.Connecting;
    this.connectionID = undefined; // connect should be sent with empty connection_id so API gives us one
    try {
      const { event } = await this._req<{ event: ConnectionOpen<UnknownType> }>(
        { json: this.client._buildWSPayload() },
        { timeout: 10000 }, // 10s
      );

      this.state = ConnectionState.Connected;
      this.connectionID = event.connection_id;
      this._poll();
      return event;
    } catch (err) {
      this.state = ConnectionState.Closed;
      return err;
    }
  };

  isHealthy = () => {
    return this.connectionID && this.state === ConnectionState.Connected;
  };

  disconnect = async (timeout = 2000) => {
    this.state = ConnectionState.Disconnectted;

    this.cancelToken?.cancel('disconnect() is called');
    this.cancelToken = undefined;

    try {
      await this._req({ close: true }, { timeout });
      this.connectionID = undefined;
    } catch (err) {
      console.error(err); //TODO: fire in logger
    }
  };
}
