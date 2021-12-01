import axios, { AxiosRequestConfig, CancelTokenSource } from 'axios';
import { StreamChat } from './client';
import { addConnectionEventListeners, removeConnectionEventListeners, retryInterval, sleep } from './utils';
import { isAPIError, isConnectionIDError, isErrorRetryable } from './errors';
import { ConnectionOpen, Event, UnknownType, UR, LiteralStringForUnion } from './types';

enum ConnectionState {
  Closed = 'CLOSED',
  Connected = 'CONNECTED',
  Connecting = 'CONNECTING',
  Disconnected = 'DISCONNECTED',
  Init = 'INIT',
}

export class WSConnectionFallback<
  AttachmentType extends UR = UR,
  ChannelType extends UR = UR,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UR = UR,
  MessageType extends UR = UR,
  ReactionType extends UR = UR,
  UserType extends UR = UR
> {
  client: StreamChat<AttachmentType, ChannelType, CommandType, EventType, MessageType, ReactionType, UserType>;
  state: ConnectionState;
  consecutiveFailures: number;
  connectionID?: string;
  cancelToken?: CancelTokenSource;

  constructor({
    client,
  }: {
    client: StreamChat<AttachmentType, ChannelType, CommandType, EventType, MessageType, ReactionType, UserType>;
  }) {
    this.client = client;
    this.state = ConnectionState.Init;
    this.consecutiveFailures = 0;

    addConnectionEventListeners(this._onlineStatusChanged);
  }

  _setState(state: ConnectionState) {
    if (state === ConnectionState.Connected || this.state === ConnectionState.Connecting) {
      //@ts-expect-error
      this.client.dispatchEvent({ type: 'connection.changed', online: true });
    }

    if (state === ConnectionState.Closed || state === ConnectionState.Disconnected) {
      //@ts-expect-error
      this.client.dispatchEvent({ type: 'connection.changed', online: false });
    }

    this.state = state;
  }

  /** @private */
  _onlineStatusChanged = (event: { type: string }) => {
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
  _req = async <T = UR>(params: UnknownType, config: AxiosRequestConfig, retry: boolean): Promise<T> => {
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
          events: Event<AttachmentType, ChannelType, CommandType, EventType, MessageType, ReactionType, UserType>[];
        }>(
          {},
          { timeout: 30000 }, // 30s => API responds in 20s if there is no event
          true,
        );

        if (data.events?.length) {
          for (let i = 0; i < data.events.length; i++) {
            this.client.dispatchEvent(data.events[i]);
          }
        }
      } catch (err) {
        if (axios.isCancel(err)) {
          return;
        }

        /** client.doAxiosRequest will take care of TOKEN_EXPIRED error */

        if (isConnectionIDError(err)) {
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
      throw new Error('connecting already in progress');
    }
    if (this.state === ConnectionState.Connected) {
      throw new Error('already connected and polling');
    }

    this._setState(ConnectionState.Connecting);
    this.connectionID = undefined; // connect should be sent with empty connection_id so API creates one
    try {
      const { event } = await this._req<{ event: ConnectionOpen<ChannelType, CommandType, UserType> }>(
        { json: this.client._buildWSPayload() },
        { timeout: 8000 }, // 8s
        reconnect,
      );

      this._setState(ConnectionState.Connected);
      this.connectionID = event.connection_id;
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
    return this.connectionID && this.state === ConnectionState.Connected;
  };

  disconnect = async (timeout = 2000) => {
    removeConnectionEventListeners(this._onlineStatusChanged);

    this._setState(ConnectionState.Disconnected);
    this.cancelToken?.cancel('disconnect() is called');
    this.cancelToken = undefined;

    try {
      await this._req({ close: true }, { timeout }, false);
      this.connectionID = undefined;
    } catch (err) {
      console.error(err); //TODO: fire in logger
    }
  };
}
