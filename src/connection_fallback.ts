import axios, { AxiosRequestConfig, Canceler } from 'axios';
import { StreamChat } from './client';
import { ConnectionOpen, Event, UnknownType } from './types';

export class WSConnectionFallback {
  client: StreamChat;
  connecting: boolean;
  connected: boolean;
  cancel?: Canceler;

  constructor({ client }: { client: StreamChat }) {
    this.client = client;
    this.connecting = false;
    this.connected = false;
  }

  _newCancelToken = () => new axios.CancelToken((cancel) => (this.cancel = cancel));

  _req<T>(params: UnknownType, options: AxiosRequestConfig) {
    return this.client.doAxiosRequest<T>(
      'get',
      this.client.baseURL + '/longpoll',
      undefined,
      {
        config: options,
        cancelToken: this._newCancelToken(),
        params,
      },
    );
  }

  _poll = async (json: string, connection_id: string) => {
    while (this.connected) {
      try {
        const data = await this._req<{ events: Event[] }>(
          { json, connection_id }, // TODO: remove json
          { timeout: 30 * 1000 }, // 30s
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
        console.error(err);
        // TODO: handle consequent failures
        //TODO: check for error.code 46 and reset the client, for random failures fallback to loop
      }
    }
  };

  connect = async (json: string) => {
    if (this.connecting) {
      throw new Error('connection already in progress');
    }

    this.connecting = true;

    try {
      const { event } = await this._req<{ event: ConnectionOpen<UnknownType> }>(
        { json },
        { timeout: 10 * 1000 }, // 10s
      );
      this.connecting = false;
      this.connected = true;
      this._poll(json, event.connection_id).then();
      return event;
    } catch (err) {
      this.connecting = false;
      return err;
    }
  };

  disconnect = () => {
    this.connected = false;
    if (this.cancel) {
      this.cancel('client.disconnect() is called');
    }
  };
}
