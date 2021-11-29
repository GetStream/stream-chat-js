import axios, { AxiosRequestConfig, Canceler } from 'axios';
import { chatCodes, retryInterval, sleep } from './utils';
import { StreamChat } from './client';
import { ConnectionOpen, Event, UnknownType } from './types';

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
  cancel?: Canceler;

  constructor({ client }: { client: StreamChat }) {
    this.client = client;
    this.state = ConnectionState.Init;
    this.consecutiveFailures = 0;
  }

  /** @private */
  _newCancelToken = () => {
    return new axios.CancelToken((cancel) => (this.cancel = cancel));
  };

  /** @private */
  _req = <T>(params: UnknownType, config: AxiosRequestConfig) => {
    return this.client.doAxiosRequest<T>('get', this.client.baseURL + '/longpoll', undefined, {
      cancelToken: this._newCancelToken(),
      config,
      params,
    });
  };

  /** @private */
  _setConnectionID = (id: string) => {
    if (this.client.wsConnection) {
      this.client.wsConnection.connectionID = id;
    }
  };

  /** @private */
  _poll = async (connection_id: string) => {
    this.consecutiveFailures = 0;

    while (this.state === ConnectionState.Connected) {
      try {
        const data = await this._req<{ events: Event[] }>(
          { connection_id },
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
    try {
      const { event } = await this._req<{ event: ConnectionOpen<UnknownType> }>(
        { json: this.client._buildWSPayload() },
        { timeout: 10000 }, // 10s
      );

      this.state = ConnectionState.Connected;
      this._setConnectionID(event.connection_id);
      this._poll(event.connection_id).then();
      return event;
    } catch (err) {
      this.state = ConnectionState.Closed;
      return err;
    }
  };

  disconnect = () => {
    this.state = ConnectionState.Disconnectted;
    if (this.cancel) {
      this.cancel('client.disconnect() is called');
    }
  };
}
