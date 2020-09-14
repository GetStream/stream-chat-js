/* eslint no-unused-vars: "off" */
/* global process */

import axios, { AxiosRequestConfig, AxiosInstance, AxiosResponse } from 'axios';
import FormData from 'form-data';
import http from 'http';
import https from 'https';
import uuidv4 from 'uuid/v4';
import WebSocket from 'isomorphic-ws';
import { Channel } from './channel';
import { ClientState } from './client_state';
import { StableWSConnection } from './connection';
import { isValidEventType } from './events';
import { JWTUserToken, DevToken, CheckSignature } from './signing';
import { TokenManager } from './token_manager';
import { isFunction, chatCodes } from './utils';

import {
  APIResponse,
  AppSettings,
  AppSettingsAPIResponse,
  AscDesc,
  BanUserOptions,
  ChannelAPIResponse,
  ChannelData,
  ChannelFilters,
  ChannelMute,
  ChannelOptions,
  ChannelSort,
  CheckPushResponse,
  Configs,
  ConnectAPIResponse,
  ConnectionChangeEvent,
  CreateChannelOptions,
  CreateChannelResponse,
  CreateCommandOptions,
  CreateCommandResponse,
  CustomPermissionOptions,
  DeleteCommandResponse,
  Device,
  Event,
  EventHandler,
  FlagMessageOptions,
  FlagMessageResponse,
  FlagUserResponse,
  GetChannelTypeResponse,
  GetCommandResponse,
  ListChannelResponse,
  ListCommandsResponse,
  LiteralStringForUnion,
  Logger,
  MarkAllReadOptions,
  Message,
  MessageFilters,
  MessageResponse,
  MuteUserOptions,
  MuteUserResponse,
  PartialUserUpdate,
  PermissionAPIResponse,
  PermissionsAPIResponse,
  ReactionResponse,
  SearchAPIResponse,
  SearchOptions,
  SearchPayload,
  SendFileAPIResponse,
  StreamChatOptions,
  TestPushDataInput,
  TokenOrProvider,
  UnBanUserOptions,
  UnknownType,
  UpdateChannelOptions,
  UpdateChannelResponse,
  UpdateCommandOptions,
  UpdateCommandResponse,
  UpdateMessageAPIResponse,
  UserFilters,
  UserOptions,
  UserResponse,
  UserSort,
} from './types';

function isReadableStream(
  obj: string | NodeJS.ReadableStream | File,
): obj is NodeJS.ReadableStream {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    // @ts-expect-error
    typeof (obj as NodeJS.ReadableStream)._read === 'function' &&
    // @ts-expect-error
    typeof (obj as NodeJS.ReadableStream)._readableState === 'object'
  );
}

function isString(x: unknown): x is string {
  return typeof x === 'string' || x instanceof String;
}

export class StreamChat<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> {
  _user?: UserResponse<UserType>;
  activeChannels: {
    [key: string]: Channel<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >;
  };
  anonymous: boolean;
  axiosInstance: AxiosInstance;
  baseURL?: string;
  browser: boolean;
  cleaningIntervalRef?: NodeJS.Timeout;
  clientID?: string;
  configs: Configs<CommandType>;
  connecting?: boolean;
  connectionEstablishedCount?: number;
  connectionID?: string;
  failures?: number;
  key: string;
  listeners: {
    [key: string]: Array<
      (
        event: Event<
          AttachmentType,
          ChannelType,
          CommandType,
          EventType,
          MessageType,
          ReactionType,
          UserType
        >,
      ) => void
    >;
  };
  logger: Logger;
  mutedChannels: ChannelMute<ChannelType, CommandType, UserType>[];
  node: boolean;
  options: StreamChatOptions;
  secret?: string;
  setUserPromise: ConnectAPIResponse<ChannelType, CommandType, UserType> | null;
  state: ClientState<UserType>;
  tokenManager: TokenManager<UserType>;
  user?: UserResponse<UserType>;
  userAgent?: string;
  userID?: string;
  UUID?: string;
  wsBaseURL?: string;
  wsConnection: StableWSConnection<ChannelType, CommandType, UserType> | null;
  wsPromise: ConnectAPIResponse<ChannelType, CommandType, UserType> | null;

  constructor(key: string, options?: StreamChatOptions);
  constructor(key: string, secret?: string, options?: StreamChatOptions);
  constructor(
    key: string,
    secretOrOptions?: StreamChatOptions | string,
    options?: StreamChatOptions,
  ) {
    // set the key
    this.key = key;
    this.listeners = {};
    this.state = new ClientState<UserType>();
    // a list of channels to hide ws events from
    this.mutedChannels = [];

    // set the secret
    if (secretOrOptions && isString(secretOrOptions)) {
      this.secret = secretOrOptions;
    }

    // set the options... and figure out defaults...
    const inputOptions = options
      ? options
      : secretOrOptions && !isString(secretOrOptions)
      ? secretOrOptions
      : {};

    this.browser =
      typeof inputOptions.browser !== 'undefined'
        ? inputOptions.browser
        : typeof window !== 'undefined';
    this.node = !this.browser;

    const defaultOptions = {
      timeout: 3000,
      withCredentials: false, // making sure cookies are not sent
      warmUp: false,
    };

    if (this.node) {
      const nodeOptions = {
        httpAgent: new http.Agent({ keepAlive: true, keepAliveMsecs: 3000 }),
        httpsAgent: new https.Agent({ keepAlive: true, keepAliveMsecs: 3000 }),
      };
      this.options = { ...nodeOptions, ...defaultOptions, ...inputOptions };
    } else {
      this.options = { ...defaultOptions, ...inputOptions };
      delete this.options.httpAgent;
      delete this.options.httpsAgent;
    }

    this.axiosInstance = axios.create(this.options);

    this.setBaseURL('https://chat-us-east-1.stream-io-api.com');

    if (typeof process !== 'undefined' && process.env.STREAM_LOCAL_TEST_RUN) {
      this.setBaseURL('http://localhost:3030');
    }

    // WS connection is initialized when setUser is called
    this.wsConnection = null;
    this.wsPromise = null;
    this.setUserPromise = null;
    // keeps a reference to all the channels that are in use
    this.activeChannels = {};
    // mapping between channel groups and configs
    this.configs = {};
    this.anonymous = false;

    // If its a server-side client, then lets initialize the tokenManager, since token will be
    // generated from secret.
    this.tokenManager = new TokenManager(this.secret);

    /**
     * logger function should accept 3 parameters:
     * @param logLevel string
     * @param message   string
     * @param extraData object
     *
     * e.g.,
     * const client = new StreamChat('api_key', {}, {
     * 		logger = (logLevel, message, extraData) => {
     * 			console.log(message);
     * 		}
     * })
     *
     * extraData contains tags array attached to log message. Tags can have one/many of following values:
     * 1. api
     * 2. api_request
     * 3. api_response
     * 4. client
     * 5. channel
     * 6. connection
     * 7. event
     *
     * It may also contains some extra data, some examples have been mentioned below:
     * 1. {
     * 		tags: ['api', 'api_request', 'client'],
     * 		url: string,
     * 		payload: object,
     * 		config: object
     * }
     * 2. {
     * 		tags: ['api', 'api_response', 'client'],
     * 		url: string,
     * 		response: object
     * }
     * 3. {
     * 		tags: ['api', 'api_response', 'client'],
     * 		url: string,
     * 		error: object
     * }
     * 4. {
     * 		tags: ['event', 'client'],
     * 		event: object
     * }
     * 5. {
     * 		tags: ['channel'],
     * 		channel: object
     * }
     */
    this.logger = isFunction(inputOptions.logger) ? inputOptions.logger : () => null;
  }

  devToken(userID: string) {
    return DevToken(userID);
  }

  getAuthType() {
    return this.anonymous ? 'anonymous' : 'jwt';
  }

  setBaseURL(baseURL: string) {
    this.baseURL = baseURL;
    this.wsBaseURL = this.baseURL.replace('http', 'ws');
  }

  _setupConnection = () => {
    this.UUID = uuidv4();
    this.clientID = `${this.userID}--${this.UUID}`;
    this.wsPromise = this.connect();
    this._startCleaning();
    return this.wsPromise;
  };

  _hasConnectionID = () => Boolean(this.connectionID);

  /**
   * setUser - Set the current user, this triggers a connection to the API
   *
   * @param {UserResponse<UserType>} user Data about this user. IE {name: "john"}
   * @param {TokenOrProvider} userTokenOrProvider Token or provider
   *
   * @return {ConnectAPIResponse<ChannelType, CommandType, UserType>} Returns a promise that resolves when the connection is setup
   */
  setUser = (
    user: UserResponse<UserType>,
    userTokenOrProvider: TokenOrProvider,
  ): ConnectAPIResponse<ChannelType, CommandType, UserType> => {
    if (this.userID) {
      throw new Error(
        'Use client.disconnect() before trying to connect as a different user. setUser was called twice.',
      );
    }
    // we generate the client id client side
    this.userID = user.id;

    if (!this.userID) {
      throw new Error('The "id" field on the user is missing');
    }

    const setTokenPromise = this._setToken(user, userTokenOrProvider);
    this._setUser(user);

    const wsPromise = this._setupConnection();

    this.anonymous = false;

    this.setUserPromise = Promise.all([setTokenPromise, wsPromise])
      .then(
        result =>
          // We only return connection promise;
          result[1],
      )
      .catch(e => {
        throw e;
      });

    return this.setUserPromise;
  };

  _setToken = (user: UserResponse<UserType>, userTokenOrProvider: TokenOrProvider) =>
    this.tokenManager.setTokenOrProvider(userTokenOrProvider, user);

  _setUser(user: UserResponse<UserType>) {
    // this one is used by the frontend
    this.user = user;
    // this one is actually used for requests...
    this._user = { ...user };
  }

  /**
	 * updateAppSettings - updates application settings
	 *
	 * @param {AppSettings} options App settings.
	 * 		IE: {
	  			"apn_config": {
					"auth_type": "token",
					"auth_key": fs.readFileSync(
						'./apn-push-auth-key.p8',
						'utf-8',
					),
					"key_id": "keyid",
					"team_id": "teamid", //either ALL these 3
					"notification_template": "notification handlebars template",
					"bundle_id": "com.apple.your.app",
					"development": true
				},
				"firebase_config": {
					"server_key": "server key from fcm",
					"notification_template": "notification handlebars template"
					"data_template": "data handlebars template"
				},
				"webhook_url": "https://acme.com/my/awesome/webhook/"
			}
	 */
  async updateAppSettings(options: AppSettings) {
    if (options.apn_config?.p12_cert) {
      options.apn_config.p12_cert = Buffer.from(options.apn_config.p12_cert).toString(
        'base64',
      );
    }
    return await this.patch<APIResponse>(this.baseURL + '/app', options);
  }

  /**
   * getAppSettings - retrieves application settings
   */
  async getAppSettings() {
    return await this.get<AppSettingsAPIResponse<CommandType>>(this.baseURL + '/app');
  }

  /**
	 * testPushSettings - Tests the push settings for a user with a random chat message and the configured push templates
	 *
	 * @param {string} userID User ID. If user has no devices, it will error
	 * @param {TestPushDataInput} [data] Overrides for push templates/message used
	 * 		IE: {
				  messageID: 'id-of-message',//will error if message does not exist
				  apnTemplate: '{}', //if app doesn't have apn configured it will error
				  firebaseTemplate: '{}', //if app doesn't have firebase configured it will error
				  firebaseDataTemplate: '{}', //if app doesn't have firebase configured it will error
			}
	 */
  async testPushSettings(userID: string, data: TestPushDataInput = {}) {
    return await this.post<CheckPushResponse>(this.baseURL + '/check_push', {
      user_id: userID,
      ...(data.messageID ? { message_id: data.messageID } : {}),
      ...(data.apnTemplate ? { apn_template: data.apnTemplate } : {}),
      ...(data.firebaseTemplate ? { firebase_template: data.firebaseTemplate } : {}),
      ...(data.firebaseDataTemplate
        ? { firebase_data_template: data.firebaseDataTemplate }
        : {}),
    });
  }

  /**
   * disconnect - closes the WS connection
   */
  disconnect(timeout?: number) {
    this.logger('info', 'client:disconnect() - Disconnecting the client', {
      tags: ['connection', 'client'],
    });
    // remove the user specific fields
    delete this.user;
    delete this._user;
    delete this.userID;

    if (this.cleaningIntervalRef != null) {
      clearInterval(this.cleaningIntervalRef);
      this.cleaningIntervalRef = undefined;
    }

    this.anonymous = false;

    this.connectionEstablishedCount = 0;

    for (const channel of Object.values(this.activeChannels)) {
      channel._disconnect();
    }
    // ensure we no longer return inactive channels
    this.activeChannels = {};
    // reset client state
    this.state = new ClientState();
    // reset token manager
    this.tokenManager.reset();

    // close the WS connection
    if (this.wsConnection) {
      return this.wsConnection.disconnect(timeout);
    }

    return Promise.resolve();
  }

  setAnonymousUser = () => {
    this.anonymous = true;
    this.userID = uuidv4();
    const anonymousUser = {
      id: this.userID,
      anon: true,
    } as UserResponse<UserType>;

    this._setToken(anonymousUser, '');
    this._setUser(anonymousUser);

    return this._setupConnection();
  };

  /**
   * setGuestUser - Setup a temporary guest user
   *
   * @param {UserResponse<UserType>} user Data about this user. IE {name: "john"}
   *
   * @return {ConnectAPIResponse<ChannelType, CommandType, UserType>} Returns a promise that resolves when the connection is setup
   */
  async setGuestUser(user: UserResponse<UserType>) {
    let response: { access_token: string; user: UserResponse<UserType> } | undefined;
    this.anonymous = true;
    try {
      response = await this.post<
        APIResponse & { access_token: string; user: UserResponse<UserType> }
      >(this.baseURL + '/guest', { user });
    } catch (e) {
      this.anonymous = false;
      throw e;
    }
    this.anonymous = false;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { created_at, updated_at, last_active, online, ...guestUser } = response.user;
    return await this.setUser(guestUser as UserResponse<UserType>, response.access_token);
  }

  /**
   * createToken - Creates a token to authenticate this user. This function is used server side.
   * The resulting token should be passed to the client side when the users registers or logs in
   *
   * @param {string} userID The User ID
   * @param {number} [exp] The expiration time for the token expressed in the number of seconds since the epoch
   *
   * @return {string} Returns a token
   */
  createToken(userID: string, exp?: number) {
    if (this.secret == null) {
      throw Error(`tokens can only be created server-side using the API Secret`);
    }
    const extra: { exp?: number } = {};

    if (exp) {
      extra.exp = exp;
    }

    return JWTUserToken(this.secret, userID, extra, {});
  }

  /**
   * on - Listen to events on all channels and users your watching
   *
   * client.on('message.new', event => {console.log("my new message", event, channel.state.messages)})
   * or
   * client.on(event => {console.log(event.type)})
   *
   * @param {EventHandler<AttachmentType, ChannelType, CommandType, EventType, MessageType, ReactionType, UserType> | string} callbackOrString  The event type to listen for (optional)
   * @param {EventHandler<AttachmentType, ChannelType, CommandType, EventType, MessageType, ReactionType, UserType>} [callbackOrNothing] The callback to call
   *
   * @return {{ unsubscribe: () => void }} Description
   */
  on(
    callback: EventHandler<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >,
  ): { unsubscribe: () => void };
  on(
    eventType: string,
    callback: EventHandler<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >,
  ): { unsubscribe: () => void };
  on(
    callbackOrString:
      | EventHandler<
          AttachmentType,
          ChannelType,
          CommandType,
          EventType,
          MessageType,
          ReactionType,
          UserType
        >
      | string,
    callbackOrNothing?: EventHandler<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >,
  ): { unsubscribe: () => void } {
    const key = callbackOrNothing ? (callbackOrString as string) : 'all';
    const valid = isValidEventType(key);
    if (!valid) {
      throw Error(`Invalid event type ${key}`);
    }
    const callback = callbackOrNothing
      ? callbackOrNothing
      : (callbackOrString as EventHandler<
          AttachmentType,
          ChannelType,
          CommandType,
          EventType,
          MessageType,
          ReactionType,
          UserType
        >);
    if (!(key in this.listeners)) {
      this.listeners[key] = [];
    }
    this.logger('info', `Attaching listener for ${key} event`, {
      tags: ['event', 'client'],
    });
    this.listeners[key].push(callback);
    return {
      unsubscribe: () => {
        this.listeners[key] = this.listeners[key].filter(el => el !== callback);
      },
    };
  }

  /**
   * off - Remove the event handler
   *
   */
  off(
    callback: EventHandler<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >,
  ): void;
  off(
    eventType: string,
    callback: EventHandler<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >,
  ): void;
  off(
    callbackOrString:
      | EventHandler<
          AttachmentType,
          ChannelType,
          CommandType,
          EventType,
          MessageType,
          ReactionType,
          UserType
        >
      | string,
    callbackOrNothing?: EventHandler<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >,
  ) {
    const key = callbackOrNothing ? (callbackOrString as string) : 'all';
    const valid = isValidEventType(key);
    if (!valid) {
      throw Error(`Invalid event type ${key}`);
    }
    const callback = callbackOrNothing
      ? callbackOrNothing
      : (callbackOrString as EventHandler<
          AttachmentType,
          ChannelType,
          CommandType,
          EventType,
          MessageType,
          ReactionType,
          UserType
        >);
    if (!(key in this.listeners)) {
      this.listeners[key] = [];
    }

    this.logger('info', `Removing listener for ${key} event`, {
      tags: ['event', 'client'],
    });
    this.listeners[key] = this.listeners[key].filter(value => value !== callback);
  }

  _logApiRequest(
    type: string,
    url: string,
    data: unknown,
    config: AxiosRequestConfig & {
      config?: AxiosRequestConfig & { maxBodyLength?: number };
    },
  ) {
    this.logger('info', `client: ${type} - Request - ${url}`, {
      tags: ['api', 'api_request', 'client'],
      url,
      payload: data,
      config,
    });
  }

  _logApiResponse<T>(type: string, url: string, response: AxiosResponse<T>) {
    this.logger(
      'info',
      `client:${type} - Response - url: ${url} > status ${response.status}`,
      {
        tags: ['api', 'api_response', 'client'],
        url,
        response,
      },
    );
  }

  _logApiError(type: string, url: string, error: unknown) {
    this.logger('error', `client:${type} - Error - url: ${url}`, {
      tags: ['api', 'api_response', 'client'],
      url,
      error,
    });
  }

  doAxiosRequest = async <T>(
    type: string,
    url: string,
    data?: unknown,
    options: AxiosRequestConfig & {
      config?: AxiosRequestConfig & { maxBodyLength?: number };
    } = {},
  ): Promise<T> => {
    await this.tokenManager.tokenReady();
    const requestConfig = this._enrichAxiosOptions(options);
    try {
      let response: AxiosResponse<T>;
      this._logApiRequest(type, url, data, requestConfig);
      switch (type) {
        case 'get':
          response = await this.axiosInstance.get(url, requestConfig);
          break;
        case 'delete':
          response = await this.axiosInstance.delete(url, requestConfig);
          break;
        case 'post':
          response = await this.axiosInstance.post(url, data, requestConfig);
          break;
        case 'put':
          response = await this.axiosInstance.put(url, data, requestConfig);
          break;
        case 'patch':
          response = await this.axiosInstance.patch(url, data, requestConfig);
          break;
        case 'options':
          // @ts-ignore
          response = await this.axiosInstance.options(url, requestConfig);
          break;
        default:
          throw new Error('Invalid request type');
      }
      this._logApiResponse<T>(type, url, response);

      return this.handleResponse(response);
    } catch (e) {
      this._logApiError(type, url, e);

      if (e.response) {
        if (
          e.response.data.code === chatCodes.TOKEN_EXPIRED &&
          !this.tokenManager.isStatic()
        ) {
          this.tokenManager.loadToken();
          return await this.doAxiosRequest<T>(type, url, data, options);
        }
        return this.handleResponse(e.response);
      } else {
        throw e;
      }
    }
  };

  get<T>(url: string, params?: AxiosRequestConfig['params']) {
    return this.doAxiosRequest<T>('get', url, null, { params });
  }

  put<T>(url: string, data?: unknown) {
    return this.doAxiosRequest<T>('put', url, data);
  }

  post<T>(url: string, data?: unknown) {
    return this.doAxiosRequest<T>('post', url, data);
  }

  patch<T>(url: string, data?: unknown) {
    return this.doAxiosRequest<T>('patch', url, data);
  }

  delete<T>(url: string, params?: AxiosRequestConfig['params']) {
    return this.doAxiosRequest<T>('delete', url, null, { params });
  }

  sendFile(
    url: string,
    uri: string | NodeJS.ReadableStream | File,
    name?: string,
    contentType?: string,
    user?: UserResponse<UserType>,
  ) {
    const data = new FormData();
    let fileField:
      | File
      | NodeJS.ReadableStream
      | { name: string; uri: string; type?: string };

    if (isReadableStream(uri) || uri instanceof File) {
      fileField = uri;
    } else {
      fileField = {
        uri,
        name: name || uri.split('/').reverse()[0],
      };
      if (contentType != null) {
        fileField.type = contentType;
      }
    }

    if (user != null) {
      data.append('user', JSON.stringify(user));
    }
    data.append('file', fileField);
    return this.doAxiosRequest<SendFileAPIResponse>('post', url, data, {
      headers: data.getHeaders ? data.getHeaders() : {}, // node vs browser
      config: {
        timeout: 0,
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
      },
    });
  }

  errorFromResponse<T>(response: AxiosResponse<T & { code?: number; message?: string }>) {
    let err: Error & { code?: number; response?: AxiosResponse<T>; status?: number };
    err = new Error(`StreamChat error HTTP code: ${response.status}`);
    if (response.data && response.data.code) {
      err = new Error(
        `StreamChat error code ${response.data.code}: ${response.data.message}`,
      );
      err.code = response.data.code;
    }
    err.response = response;
    err.status = response.status;
    return err;
  }

  handleResponse<T>(response: AxiosResponse<T>) {
    const data = response.data;
    if ((response.status + '')[0] !== '2') {
      throw this.errorFromResponse<T>(response);
    }
    return data;
  }

  dispatchEvent = (
    event: Event<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >,
  ) => {
    // client event handlers
    this._handleClientEvent(event);

    // channel event handlers
    const cid = event.cid;
    const channel = cid ? this.activeChannels[cid] : undefined;
    if (channel) {
      channel._handleChannelEvent(event);
    }

    this._callClientListeners(event);

    if (channel) {
      channel._callChannelListeners(event);
    }
  };

  handleEvent = (messageEvent: WebSocket.MessageEvent) => {
    // dispatch the event to the channel listeners
    const jsonString = messageEvent.data as string;
    const event = JSON.parse(jsonString) as Event<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >;
    event.received_at = new Date();
    this.dispatchEvent(event);
  };

  _handleClientEvent(
    event: Event<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >,
  ) {
    const client = this;
    this.logger(
      'info',
      `client:_handleClientEvent - Received event of type { ${event.type} }`,
      {
        tags: ['event', 'client'],
        event,
      },
    );

    // update the client.state with any changes to users
    if (
      event.user &&
      (event.type === 'user.presence.changed' || event.type === 'user.updated')
    ) {
      if (event.user?.id === this.userID) {
        this.user = this.user && { ...this.user, ...event.user };
        // Updating only available properties in _user object.
        Object.keys(event.user).forEach(function(key) {
          if (client._user && key in client._user) {
            // @ts-expect-error
            client._user[key] = event.user[key];
          }
        });
      }
      client.state.updateUser(event.user);
      client._updateUserReferences(event.user);
    }
    if (event.type === 'health.check' && event.me) {
      client.user = event.me;
      client.state.updateUser(event.me);
      client.mutedChannels = event.me.channel_mutes;
    }

    if (event.channel && event.type === 'notification.message_new') {
      this.configs[event.channel.type] = event.channel.config;
    }

    if (event.type === 'notification.channel_mutes_updated' && event.me?.channel_mutes) {
      this.mutedChannels = event.me.channel_mutes;
    }
  }

  _muteStatus(cid: string) {
    let muteStatus;
    this.mutedChannels.forEach(function(mute) {
      if (mute.channel?.cid === cid) {
        let muted = true;
        if (mute.expires) {
          muted = new Date(mute.expires).getTime() > new Date().getTime();
        }
        muteStatus = {
          muted,
          createdAt: mute.created_at ? new Date(mute.created_at) : new Date(),
          expiresAt: mute.expires ? new Date(mute.expires) : null,
        };
      }
    });

    if (muteStatus) {
      return muteStatus;
    }

    return {
      muted: false,
      createdAt: null,
      expiresAt: null,
    };
  }

  _callClientListeners = (
    event: Event<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >,
  ) => {
    const client = this;
    // gather and call the listeners
    const listeners: Array<(
      event: Event<
        AttachmentType,
        ChannelType,
        CommandType,
        EventType,
        MessageType,
        ReactionType,
        UserType
      >,
    ) => void> = [];
    if (client.listeners.all) {
      listeners.push(...client.listeners.all);
    }
    if (client.listeners[event.type]) {
      listeners.push(...client.listeners[event.type]);
    }

    // call the event and send it to the listeners
    for (const listener of listeners) {
      listener(event);
    }
  };

  recoverState = async () => {
    this.logger(
      'info',
      `client:recoverState() - Start of recoverState with connectionID ${this.wsConnection?.connectionID}`,
      {
        tags: ['connection'],
      },
    );
    this.connectionID = this.wsConnection?.connectionID;
    const cids = Object.keys(this.activeChannels);
    if (cids.length) {
      this.logger(
        'info',
        `client:recoverState() - Start the querying of ${cids.length} channels`,
        { tags: ['connection', 'client'] },
      );

      await this.queryChannels(
        { cid: { $in: cids } } as ChannelFilters<ChannelType, CommandType, UserType>,
        { last_message_at: -1 },
        { limit: 30 },
      );

      this.logger('info', 'client:recoverState() - Querying channels finished', {
        tags: ['connection', 'client'],
      });

      this.dispatchEvent({
        type: 'connection.recovered',
      } as Event<AttachmentType, ChannelType, CommandType, EventType, MessageType, ReactionType, UserType>);
    }

    this.wsPromise = Promise.resolve();
    this.setUserPromise = Promise.resolve();
  };

  /*
	_updateUserReferences updates the members and watchers of the currently active channels
	that contain this user
	*/
  _updateUserReferences(user: UserResponse<UserType>) {
    const refMap = this.state.userChannelReferences[user.id] || {};
    const refs = Object.keys(refMap);
    for (const channelID of refs) {
      const c = this.activeChannels[channelID];
      // search the members and watchers and update as needed...
      if (c && c.state) {
        if (c.state.members[user.id]) {
          c.state.members = c.state.members.setIn([user.id, 'user'], user);
        }
        if (c.state.watchers[user.id]) {
          c.state.watchers = c.state.watchers.setIn([user.id, 'user'], user);
        }
      }
    }
  }

  async connect() {
    this.connecting = true;
    const client = this;
    this.failures = 0;

    if (client.userID == null || this._user == null) {
      throw Error('Call setUser or setAnonymousUser before starting the connection');
    }

    if (client.wsBaseURL == null) {
      throw Error('Websocket base url not set');
    }

    if (client.clientID == null) {
      throw Error('clientID is not set');
    }

    // The StableWSConnection handles all the reconnection logic.
    this.wsConnection = new StableWSConnection<ChannelType, CommandType, UserType>({
      wsBaseURL: client.wsBaseURL,
      clientID: client.clientID,
      userID: client.userID,
      tokenManager: client.tokenManager,
      user: this._user,
      authType: this.getAuthType(),
      userAgent: this._userAgent(),
      apiKey: this.key,
      recoverCallback: this.recoverState,
      messageCallback: this.handleEvent,
      eventCallback: this.dispatchEvent as (event: ConnectionChangeEvent) => void,
      logger: this.logger,
    });

    let warmUpPromise;
    if (this.options.warmUp) {
      warmUpPromise = this.doAxiosRequest('options', this.baseURL + '/connect');
    }
    const handshake = await this.wsConnection.connect();
    try {
      await warmUpPromise;
    } catch (e) {
      this.logger('error', 'Warmup request failed', {
        error: e,
      });
    }

    this.connectionID = this.wsConnection.connectionID;
    return handshake;
  }

  /**
   * queryUsers - Query users and watch user presence
   *
   * @param {UserFilters<UserType>} filterConditions MongoDB style filter conditions
   * @param {UserSort<UserType>} sort Sort options, for instance {last_active: -1}
   * @param {UserOptions} options Option object, {presence: true}
   *
   * @return {Promise<APIResponse & { users: Array<UserResponse<UserType>> }>} User Query Response
   */
  async queryUsers(
    filterConditions: UserFilters<UserType>,
    sort: UserSort<UserType> = {},
    options: UserOptions = {},
  ) {
    const sortFields: Array<{ field: string; direction?: AscDesc }> = [];
    for (const [k, v] of Object.entries(sort)) {
      sortFields.push({ field: k, direction: v });
    }

    const defaultOptions = {
      presence: false,
    };

    // Make sure we wait for the connect promise if there is a pending one
    await this.setUserPromise;

    if (!this._hasConnectionID()) {
      defaultOptions.presence = false;
    }

    // Return a list of users
    const data = await this.get<
      APIResponse & {
        users: Array<UserResponse<UserType>>;
      }
    >(this.baseURL + '/users', {
      payload: {
        filter_conditions: filterConditions,
        sort: sortFields,
        ...defaultOptions,
        ...options,
      },
    });

    this.state.updateUsers(data.users);

    return data;
  }

  async queryChannels(
    filterConditions: ChannelFilters<ChannelType, CommandType, UserType>,
    sort: ChannelSort = {},
    options: ChannelOptions = {},
  ) {
    const sortFields: { field: string; direction?: AscDesc }[] = [];

    for (const [k, v] of Object.entries(sort)) {
      sortFields.push({ field: k, direction: v });
    }

    const defaultOptions: ChannelOptions = {
      state: true,
      watch: true,
      presence: false,
    };

    // Make sure we wait for the connect promise if there is a pending one
    await this.setUserPromise;

    if (!this._hasConnectionID()) {
      defaultOptions.watch = false;
    }

    // Return a list of channels
    const payload = {
      filter_conditions: filterConditions,
      sort: sortFields,
      user_details: this._user,
      ...defaultOptions,
      ...options,
    };

    const data = await this.get<{
      channels: ChannelAPIResponse<
        AttachmentType,
        ChannelType,
        CommandType,
        MessageType,
        ReactionType,
        UserType
      >[];
    }>(this.baseURL + '/channels', {
      payload,
    });

    const channels: Channel<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >[] = [];

    // update our cache of the configs
    for (const channelState of data.channels) {
      this._addChannelConfig(channelState);
    }

    for (const channelState of data.channels) {
      const c = this.channel(channelState.channel.type, channelState.channel.id);
      c.data = channelState.channel;
      c.initialized = true;
      c._initializeState(channelState);
      channels.push(c);
    }
    return channels;
  }

  /**
   * search - Query messages
   *
   * @param {ChannelFilters<ChannelType, CommandType, UserType>} filterConditions MongoDB style filter conditions
   * @param {MessageFilters<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType> | string} query search query or object MongoDB style filters
   * @param {SearchOptions} [options] Option object, {user_id: 'tommaso'}
   *
   * @return {Promise<SearchAPIResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>>} search messages response
   */
  async search(
    filterConditions: ChannelFilters<ChannelType, CommandType, UserType>,
    query:
      | string
      | MessageFilters<
          AttachmentType,
          ChannelType,
          CommandType,
          MessageType,
          ReactionType,
          UserType
        >,
    options: SearchOptions = {},
  ) {
    // Return a list of channels
    const payload: SearchPayload<
      AttachmentType,
      ChannelType,
      CommandType,
      MessageType,
      ReactionType,
      UserType
    > = {
      filter_conditions: filterConditions,
      ...options,
    };
    if (typeof query === 'string') {
      payload.query = query;
    } else if (typeof query === 'object') {
      payload.message_filter_conditions = query;
    } else {
      throw Error(`Invalid type ${typeof query} for query parameter`);
    }

    // Make sure we wait for the connect promise if there is a pending one
    await this.setUserPromise;

    return await this.get<
      SearchAPIResponse<
        AttachmentType,
        ChannelType,
        CommandType,
        MessageType,
        ReactionType,
        UserType
      >
    >(this.baseURL + '/search', {
      payload,
    });
  }

  /**
   * addDevice - Adds a push device for a user.
   *
   * @param {string} id the device id
   * @param {'apn' | 'firebase'} push_provider the push provider (apn or firebase)
   * @param {string} [userID] the user id (defaults to current user)
   *
   */
  async addDevice(id: string, push_provider: 'apn' | 'firebase', userID?: string) {
    return await this.post<APIResponse>(this.baseURL + '/devices', {
      id,
      push_provider,
      ...(userID != null ? { user_id: userID } : {}),
    });
  }

  /**
   * getDevices - Returns the devices associated with a current user
   *
   * @param {string} [userID] User ID. Only works on serversidex
   *
   * @return {APIResponse & Device<UserType>[]} Array of devices
   */
  async getDevices(userID?: string) {
    return await this.get<APIResponse & { devices?: Device<UserType>[] }>(
      this.baseURL + '/devices',
      userID ? { user_id: userID } : {},
    );
  }

  /**
   * removeDevice - Removes the device with the given id. Clientside users can only delete their own devices
   *
   * @param {string} id The device id
   * @param {string} [userID] The user id. Only specify this for serverside requests
   *
   */
  async removeDevice(id: string, userID?: string) {
    return await this.delete<APIResponse>(this.baseURL + '/devices', {
      id,
      ...(userID ? { user_id: userID } : {}),
    });
  }

  _addChannelConfig(
    channelState: ChannelAPIResponse<
      AttachmentType,
      ChannelType,
      CommandType,
      MessageType,
      ReactionType,
      UserType
    >,
  ) {
    this.configs[channelState.channel.type] = channelState.channel.config;
  }

  /**
   * channel - Returns a new channel with the given type, id and custom data
   *
   * If you want to create a unique conversation between 2 or more users; you can leave out the ID parameter
   * and only provide ID and the list of members
   *
   * ie. client.channel("messaging", {members: ["tommaso", "thierry"]})
   *
   * @param {string} channelType The channel type
   * @param {string} channelID   The channel ID, you can leave this out if you want to create a conversation channel
   * @param {object} [custom]    Custom data to attach to the channel
   *
   * @return {channel} The channel object, initialize it using channel.watch()
   */
  channel(
    channelType: string,
    channelID: string,
    custom: ChannelData<ChannelType> = {} as ChannelData<ChannelType>,
  ) {
    if (!this.userID && !this._isUsingServerAuth()) {
      throw Error('Call setUser or setAnonymousUser before creating a channel');
    }

    if (~channelType.indexOf(':')) {
      throw Error(`Invalid channel group ${channelType}, can't contain the : character`);
    }

    // support channel("messaging", null, {options})
    // support channel("messaging", undefined, {options})
    // support channel("messaging", "", {options})
    if (channelID == null || channelID === '') {
      return new Channel<
        AttachmentType,
        ChannelType,
        CommandType,
        EventType,
        MessageType,
        ReactionType,
        UserType
      >(this, channelType, undefined, custom);
    }
    // support channel("messaging", {options})
    if (typeof channelID === 'object' && arguments.length === 2) {
      return new Channel<
        AttachmentType,
        ChannelType,
        CommandType,
        EventType,
        MessageType,
        ReactionType,
        UserType
      >(this, channelType, undefined, channelID);
    }

    if (typeof channelID === 'string' && ~channelID.indexOf(':')) {
      throw Error(`Invalid channel id ${channelID}, can't contain the : character`);
    }

    // only allow 1 channel object per cid
    const cid = `${channelType}:${channelID}`;
    if (cid in this.activeChannels) {
      const channel = this.activeChannels[cid];
      if (Object.keys(custom).length > 0) {
        channel.data = custom;
        channel._data = custom;
      }
      return channel;
    }
    const channel = new Channel<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >(this, channelType, channelID, custom);
    this.activeChannels[channel.cid] = channel;

    return channel;
  }

  /**
   * @deprecated Please use upsertUser() function instead.
   *
   * updateUser - Update or Create the given user object
   *
   * @param {UserResponse<UserType>} userObject user object, the only required field is the user id. IE {id: "myuser"} is valid
   *
   * @return {Promise<APIResponse & { users: { [key: string]: UserResponse<UserType> } }>}
   */
  async updateUser(userObject: UserResponse<UserType>) {
    return await this.upsertUsers([userObject]);
  }

  /**
   * partialUpdateUser - Update the given user object
   *
   * @param {PartialUserUpdate<UserType>} partialUserObject which should contain id and any of "set" or "unset" params;
   * example: {id: "user1", set:{field: value}, unset:["field2"]}
   *
   * @return {Promise<APIResponse & { users: { [key: string]: UserResponse<UserType> } }>} list of updated users
   */
  async partialUpdateUser(partialUserObject: PartialUserUpdate<UserType>) {
    return await this.partialUpdateUsers([partialUserObject]);
  }

  /**
   * upsertUsers - Batch upsert the list of users
   *
   * @param {UserResponse<UserType>[]} users list of users
   *
   * @return {Promise<APIResponse & { users: { [key: string]: UserResponse<UserType> } }>}
   */
  async upsertUsers(users: UserResponse<UserType>[]) {
    const userMap: { [key: string]: UserResponse<UserType> } = {};
    for (const userObject of users) {
      if (!userObject.id) {
        throw Error('User ID is required when updating a user');
      }
      userMap[userObject.id] = userObject;
    }

    return await this.post<
      APIResponse & {
        users: { [key: string]: UserResponse<UserType> };
      }
    >(this.baseURL + '/users', {
      users: userMap,
    });
  }

  /**
   * upsertUser - Update or Create the given user object
   *
   * @param {UserResponse<UserType>} userObject user object, the only required field is the user id. IE {id: "myuser"} is valid
   *
   * @return {Promise<APIResponse & { users: { [key: string]: UserResponse<UserType> } }>}
   */
  upsertUser(userObject: UserResponse<UserType>) {
    return this.upsertUsers([userObject]);
  }

  /**
   * @deprecated Please use upsertUsers() function instead.
   *
   * updateUsers - Batch update the list of users
   *
   * @param {UserResponse<UserType>[]} users list of users
   *
   * @return {Promise<APIResponse & { users: { [key: string]: UserResponse<UserType> } }>}
   */
  updateUsers(users: UserResponse<UserType>[]) {
    return this.upsertUsers(users);
  }

  /**
   * updateUsers - Batch partial update of users
   *
   * @param {PartialUserUpdate<UserType>[]} users list of partial update requests
   *
   * @return {Promise<APIResponse & { users: { [key: string]: UserResponse<UserType> } }>}
   */
  async partialUpdateUsers(users: PartialUserUpdate<UserType>[]) {
    for (const userObject of users) {
      if (!userObject.id) {
        throw Error('User ID is required when updating a user');
      }
    }

    return await this.patch<
      APIResponse & {
        users: { [key: string]: UserResponse<UserType> };
      }
    >(this.baseURL + '/users', {
      users,
    });
  }

  async deleteUser(
    userID: string,
    params?: { hard_delete?: boolean; mark_messages_deleted?: boolean },
  ) {
    return await this.delete<
      APIResponse & {
        user: UserResponse<UserType>;
      }
    >(this.baseURL + `/users/${userID}`, params);
  }

  async reactivateUser(userID: string, options?: { restore_messages?: boolean }) {
    return await this.post<
      APIResponse & {
        user: UserResponse<UserType>;
      }
    >(this.baseURL + `/users/${userID}/reactivate`, {
      ...options,
    });
  }

  async deactivateUser(userID: string, options?: { mark_messages_deleted?: boolean }) {
    return await this.post<APIResponse & { user: UserResponse<UserType> }>(
      this.baseURL + `/users/${userID}/deactivate`,
      {
        ...options,
      },
    );
  }

  async exportUser(userID: string, options?: Record<string, string>) {
    return await this.get<
      APIResponse & {
        messages: MessageResponse<
          AttachmentType,
          ChannelType,
          CommandType,
          MessageType,
          ReactionType,
          UserType
        >[];
        reactions: ReactionResponse<ReactionType, UserType>[];
        user: UserResponse<UserType>;
      }
    >(this.baseURL + `/users/${userID}/export`, {
      ...options,
    });
  }

  /** banUser - bans a user from all channels
   *
   * @param {string} targetUserID
   * @param {BanUserOptions<UserType>} [options]
   * @returns {Promise<APIResponse>}
   */
  async banUser(targetUserID: string, options?: BanUserOptions<UserType>) {
    return await this.post<APIResponse>(this.baseURL + '/moderation/ban', {
      target_user_id: targetUserID,
      ...options,
    });
  }

  /** unbanUser - revoke global ban for a user
   *
   * @param {string} targetUserID
   * @param {UnBanUserOptions} [options]
   * @returns {Promise<APIResponse>}
   */
  async unbanUser(targetUserID: string, options?: UnBanUserOptions) {
    return await this.delete<APIResponse>(this.baseURL + '/moderation/ban', {
      target_user_id: targetUserID,
      ...options,
    });
  }

  /** muteUser - mutes a user
   *
   * @param {string} targetID
   * @param {string} [userID] Only used with serverside auth
   * @param {MuteUserOptions<UserType>} [options]
   * @returns {Promise<MuteUserResponse<ChannelType, CommandType, UserType>>}
   */
  async muteUser(
    targetID: string,
    userID?: string,
    options: MuteUserOptions<UserType> = {},
  ) {
    return await this.post<MuteUserResponse<ChannelType, CommandType, UserType>>(
      this.baseURL + '/moderation/mute',
      {
        target_id: targetID,
        ...(userID ? { user_id: userID } : {}),
        ...options,
      },
    );
  }

  /** unmuteUser - unmutes a user
   *
   * @param {string} targetID
   * @param {string} [currentUserID] Only used with serverside auth
   * @returns {Promise<APIResponse>}
   */
  async unmuteUser(targetID: string, currentUserID?: string) {
    return await this.post<APIResponse>(this.baseURL + '/moderation/unmute', {
      target_id: targetID,
      ...(currentUserID ? { user_id: currentUserID } : {}),
    });
  }

  async flagMessage(targetMessageID: string, options: FlagMessageOptions<UserType> = {}) {
    return await this.post<FlagMessageResponse<UserType>>(
      this.baseURL + '/moderation/flag',
      {
        target_message_id: targetMessageID,
        ...options,
      },
    );
  }

  async flagUser(userID: string, options: FlagMessageOptions<UserType> = {}) {
    return await this.post<FlagUserResponse<UserType>>(
      this.baseURL + '/moderation/flag',
      {
        target_user_id: userID,
        ...options,
      },
    );
  }

  async unflagMessage(messageID: string, options: FlagMessageOptions<UserType> = {}) {
    return await this.post<FlagMessageResponse<UserType>>(
      this.baseURL + '/moderation/unflag',
      {
        target_message_id: messageID,
        ...options,
      },
    );
  }

  async unflagUser(userID: string, options: FlagMessageOptions<UserType> = {}) {
    return await this.post<FlagUserResponse<UserType>>(
      this.baseURL + '/moderation/unflag',
      {
        target_user_id: userID,
        ...options,
      },
    );
  }

  /**
   * markAllRead - marks all channels for this user as read
   * @param {MarkAllReadOptions<UserType>} [data]
   *
   * @return {Promise<APIResponse>}
   */
  async markAllRead(data: MarkAllReadOptions<UserType> = {}) {
    await this.post<APIResponse>(this.baseURL + '/channels/read', {
      ...data,
    });
  }

  createCommand(data: CreateCommandOptions<CommandType>) {
    return this.post<CreateCommandResponse<CommandType>>(
      this.baseURL + '/commands',
      data,
    );
  }

  getCommand(name: string) {
    return this.get<GetCommandResponse<CommandType>>(this.baseURL + `/commands/${name}`);
  }

  updateCommand(name: string, data: UpdateCommandOptions<CommandType>) {
    return this.put<UpdateCommandResponse<CommandType>>(
      this.baseURL + `/commands/${name}`,
      data,
    );
  }

  deleteCommand(name: string) {
    return this.delete<DeleteCommandResponse<CommandType>>(
      this.baseURL + `/commands/${name}`,
    );
  }

  listCommands() {
    return this.get<ListCommandsResponse<CommandType>>(this.baseURL + `/commands`);
  }

  createChannelType(data: CreateChannelOptions<CommandType>) {
    const channelData = Object.assign({}, { commands: ['all'] }, data);
    return this.post<CreateChannelResponse<CommandType>>(
      this.baseURL + '/channeltypes',
      channelData,
    );
  }

  getChannelType(channelType: string) {
    return this.get<GetChannelTypeResponse<CommandType>>(
      this.baseURL + `/channeltypes/${channelType}`,
    );
  }

  updateChannelType(channelType: string, data: UpdateChannelOptions<CommandType>) {
    return this.put<UpdateChannelResponse<CommandType>>(
      this.baseURL + `/channeltypes/${channelType}`,
      data,
    );
  }

  deleteChannelType(channelType: string) {
    return this.delete<APIResponse>(this.baseURL + `/channeltypes/${channelType}`);
  }

  listChannelTypes() {
    return this.get<ListChannelResponse<CommandType>>(this.baseURL + `/channeltypes`);
  }

  /**
   * translateMessage - adds the translation to the message
   *
   * @param {string} messageId
   * @param {string} language
   *
   * @return {APIResponse & MessageResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>} Response that includes the message
   */
  async translateMessage(messageId: string, language: string) {
    return await this.post<
      APIResponse &
        MessageResponse<
          AttachmentType,
          ChannelType,
          CommandType,
          MessageType,
          ReactionType,
          UserType
        >
    >(this.baseURL + `/messages/${messageId}/translate`, {
      language,
    });
  }

  /**
   * updateMessage - Update the given message
   *
   * @param {Message<AttachmentType, MessageType, UserType>} message object, id needs to be specified
   * @param {string | { id: string }} [userId]
   *
   * @return {APIResponse & { message: MessageResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType> }} Response that includes the message
   */
  async updateMessage(
    message: Message<AttachmentType, MessageType, UserType>,
    userId?: string | { id: string },
  ) {
    if (!message.id) {
      throw Error('Please specify the message id when calling updateMessage');
    }

    const clonedMessage = Object.assign({}, message);
    delete clonedMessage.id;

    const reservedMessageFields: Array<
      | 'command'
      | 'created_at'
      | 'html'
      | 'latest_reactions'
      | 'own_reactions'
      | 'reaction_counts'
      | 'reply_count'
      | 'type'
      | 'updated_at'
      | 'user'
    > = [
      'command',
      'created_at',
      'html',
      'latest_reactions',
      'own_reactions',
      'reaction_counts',
      'reply_count',
      'type',
      'updated_at',
      'user',
    ];

    reservedMessageFields.forEach(function(item) {
      if (clonedMessage[item] != null) {
        delete clonedMessage[item];
      }
    });

    if (userId != null) {
      if (isString(userId)) {
        clonedMessage.user_id = userId;
      } else {
        clonedMessage.user = { id: userId.id } as UserResponse<UserType>;
      }
    }
    return await this.post<
      UpdateMessageAPIResponse<
        AttachmentType,
        ChannelType,
        CommandType,
        MessageType,
        ReactionType,
        UserType
      >
    >(this.baseURL + `/messages/${message.id}`, {
      message: clonedMessage,
    });
  }

  async deleteMessage(messageID: string, hardDelete?: boolean) {
    let params = {};
    if (hardDelete) {
      params = { hard: true };
    }
    return await this.delete<
      APIResponse & {
        message: MessageResponse<
          AttachmentType,
          ChannelType,
          CommandType,
          MessageType,
          ReactionType,
          UserType
        >;
      }
    >(this.baseURL + `/messages/${messageID}`, params);
  }

  async getMessage(messageID: string) {
    return await this.get<
      APIResponse & {
        message: MessageResponse<
          AttachmentType,
          ChannelType,
          CommandType,
          MessageType,
          ReactionType,
          UserType
        >;
      }
    >(this.baseURL + `/messages/${messageID}`);
  }

  /**
   * @deprecated Please use getUserAgent instead
   */
  _userAgent() {
    return this.getUserAgent();
  }

  getUserAgent() {
    return (
      this.userAgent ||
      `stream-chat-javascript-client-${this.node ? 'node' : 'browser'}-${
        process.env.PKG_VERSION
      }`
    );
  }

  setUserAgent(userAgent: string) {
    this.userAgent = userAgent;
  }

  /**
   * _isUsingServerAuth - Returns true if we're using server side auth
   */
  _isUsingServerAuth = () => !!this.secret;

  _enrichAxiosOptions(
    options: AxiosRequestConfig & { config?: AxiosRequestConfig } = {
      params: {},
      headers: {},
      config: {},
    },
  ) {
    const token = this._getToken();

    return {
      params: {
        user_id: this.userID,
        ...options.params,
        api_key: this.key,
        connection_id: this.connectionID,
      },
      headers: {
        Authorization: token,
        'stream-auth-type': this.getAuthType(),
        'x-stream-client': this._userAgent(),
        ...options.headers,
      },
      ...options.config,
    };
  }

  _getToken() {
    if (!this.tokenManager || this.anonymous) return null;

    return this.tokenManager.getToken();
  }

  _startCleaning() {
    const that = this;
    if (this.cleaningIntervalRef != null) {
      return;
    }
    this.cleaningIntervalRef = setInterval(() => {
      // call clean on the channel, used for calling the stop.typing event etc.
      for (const channel of Object.values(that.activeChannels)) {
        channel.clean();
      }
    }, 500);
  }

  verifyWebhook(requestBody: string, xSignature: string) {
    return !!this.secret && CheckSignature(requestBody, this.secret, xSignature);
  }

  /** getPermission - gets the definition for a permission
   *
   * @param {string} name
   * @returns {Promise<PermissionAPIResponse>}
   */
  getPermission(name: string) {
    return this.get<PermissionAPIResponse>(`${this.baseURL}/custom_permission/${name}`);
  }

  /** createPermission - creates a custom permission
   *
   * @param {CustomPermissionOptions} permissionData the permission data
   * @returns {Promise<APIResponse>}
   */
  createPermission(permissionData: CustomPermissionOptions) {
    return this.post<APIResponse>(`${this.baseURL}/custom_permission`, {
      ...permissionData,
    });
  }

  /** updatePermission - updates an existing custom permission
   *
   * @param {string} name
   * @param {CustomPermissionOptions} permissionData the permission data
   * @returns {Promise<APIResponse>}
   */
  updatePermission(name: string, permissionData: CustomPermissionOptions) {
    return this.post<APIResponse>(`${this.baseURL}/custom_permission/${name}`, {
      ...permissionData,
    });
  }

  /** deletePermission - deletes a custom permission
   *
   * @param {string} name
   * @returns {Promise<APIResponse>}
   */
  deletePermission(name: string) {
    return this.delete<APIResponse>(`${this.baseURL}/custom_permission/${name}`);
  }

  /** listPermissions - returns the list of custom permissions for this application
   *
   * @returns {Promise<APIResponse>}
   */
  listPermissions() {
    return this.get<PermissionsAPIResponse>(`${this.baseURL}/custom_permission`);
  }

  /** createRole - creates a custom role
   *
   * @param {string} name the new role name
   * @returns {Promise<APIResponse>}
   */
  createRole(name: string) {
    return this.post<APIResponse>(`${this.baseURL}/custom_role`, { name });
  }

  /** listRoles - returns the list of custom roles for this application
   *
   * @returns {Promise<APIResponse>}
   */
  listRoles() {
    return this.get<APIResponse>(`${this.baseURL}/custom_role`);
  }

  /** deleteRole - deletes a custom role
   *
   * @param {string} name the role name
   * @returns {Promise<APIResponse>}
   */
  deleteRole(name: string) {
    return this.delete<APIResponse>(`${this.baseURL}/custom_role/${name}`);
  }

  /** sync - returns all events that happened for a list of channels since last sync
   * @param {string[]} channel_cids list of channel CIDs
   * @param {string} last_sync_at last time the user was online and in sync. RFC3339 ie. "2020-05-06T15:05:01.207Z"
   */
  sync(channel_cids: string[], last_sync_at: string) {
    return this.post<
      APIResponse & {
        events: Event<
          AttachmentType,
          ChannelType,
          CommandType,
          EventType,
          MessageType,
          ReactionType,
          UserType
        >[];
      }
    >(`${this.baseURL}/sync`, {
      channel_cids,
      last_sync_at,
    });
  }
}
