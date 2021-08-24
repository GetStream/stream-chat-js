/* eslint no-unused-vars: "off" */
/* global process */

import axios, { AxiosRequestConfig, AxiosInstance, AxiosResponse } from 'axios';
import https from 'https';
import WebSocket from 'isomorphic-ws';

import { Channel } from './channel';
import { ClientState } from './client_state';
import { StableWSConnection } from './connection';
import { isValidEventType } from './events';
import { JWTUserToken, DevToken, CheckSignature } from './signing';
import { TokenManager } from './token_manager';
import {
  isFunction,
  isOwnUserBaseProperty,
  addFileToFormData,
  chatCodes,
  normalizeQuerySort,
  randomId,
  sleep,
  retryInterval,
} from './utils';

import {
  APIResponse,
  AppSettings,
  AppSettingsAPIResponse,
  BaseDeviceFields,
  BannedUsersFilters,
  BannedUsersPaginationOptions,
  BannedUsersResponse,
  BannedUsersSort,
  BanUserOptions,
  BlockList,
  BlockListResponse,
  ChannelAPIResponse,
  ChannelData,
  ChannelFilters,
  ChannelMute,
  ChannelOptions,
  ChannelSort,
  ChannelStateOptions,
  CheckPushResponse,
  CheckSQSResponse,
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
  EndpointName,
  Event,
  EventHandler,
  ExportChannelRequest,
  ExportChannelResponse,
  ExportChannelStatusResponse,
  MessageFlagsFilters,
  MessageFlagsPaginationOptions,
  MessageFlagsResponse,
  FlagMessageResponse,
  FlagUserResponse,
  GetChannelTypeResponse,
  GetCommandResponse,
  GetRateLimitsResponse,
  ListChannelResponse,
  ListCommandsResponse,
  LiteralStringForUnion,
  Logger,
  MarkAllReadOptions,
  Message,
  MessageFilters,
  MessageResponse,
  Mute,
  MuteUserOptions,
  MuteUserResponse,
  OwnUserResponse,
  PartialMessageUpdate,
  PartialUserUpdate,
  PermissionAPIResponse,
  PermissionsAPIResponse,
  ReactionResponse,
  SearchOptions,
  SearchPayload,
  SearchAPIResponse,
  SendFileAPIResponse,
  StreamChatOptions,
  TestPushDataInput,
  TestSQSDataInput,
  TokenOrProvider,
  UnBanUserOptions,
  UnknownType,
  UpdateChannelOptions,
  UpdateChannelResponse,
  UpdateCommandOptions,
  UpdateCommandResponse,
  UpdatedMessage,
  UpdateMessageAPIResponse,
  UserCustomEvent,
  UserFilters,
  UserOptions,
  UserResponse,
  UserSort,
  SearchMessageSortBase,
  SegmentData,
  Segment,
  Campaign,
  CampaignData,
} from './types';

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
  private static _instance?: unknown | StreamChat; // type is undefined|StreamChat, unknown is due to TS limitations with statics

  _user?: OwnUserResponse<ChannelType, CommandType, UserType> | UserResponse<UserType>;
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
  /**
   * When network is recovered, we re-query the active channels on client. But in single query, you can recover
   * only 30 channels. So its not guaranteed that all the channels in activeChannels object have updated state.
   * Thus in UI sdks, state recovery is managed by components themselves, they don't rely on js client for this.
   *
   * `recoverStateOnReconnect` parameter can be used in such cases, to disable state recovery within js client.
   * When false, user/consumer of this client will need to make sure all the channels present on UI by
   * manually calling queryChannels endpoint.
   */
  recoverStateOnReconnect?: boolean;
  mutedChannels: ChannelMute<ChannelType, CommandType, UserType>[];
  mutedUsers: Mute<UserType>[];
  node: boolean;
  options: StreamChatOptions;
  secret?: string;
  setUserPromise: ConnectAPIResponse<ChannelType, CommandType, UserType> | null;
  state: ClientState<UserType>;
  tokenManager: TokenManager<UserType>;
  user?: OwnUserResponse<ChannelType, CommandType, UserType> | UserResponse<UserType>;
  userAgent?: string;
  userID?: string;
  wsBaseURL?: string;
  wsConnection: StableWSConnection<ChannelType, CommandType, UserType> | null;
  wsPromise: ConnectAPIResponse<ChannelType, CommandType, UserType> | null;
  consecutiveFailures: number;

  /**
   * Initialize a client
   *
   * **Only use constructor for advanced usages. It is strongly advised to use `StreamChat.getInstance()` instead of `new StreamChat()` to reduce integration issues due to multiple WebSocket connections**
   * @param {string} key - the api key
   * @param {string} [secret] - the api secret
   * @param {StreamChatOptions} [options] - additional options, here you can pass custom options to axios instance
   * @param {boolean} [options.browser] - enforce the client to be in browser mode
   * @param {boolean} [options.warmUp] - default to false, if true, client will open a connection as soon as possible to speed up following requests
   * @param {Logger} [options.Logger] - custom logger
   * @param {number} [options.timeout] - default to 3000
   * @param {httpsAgent} [options.httpsAgent] - custom httpsAgent, in node it's default to https.agent()
   * @example <caption>initialize the client in user mode</caption>
   * new StreamChat('api_key')
   * @example <caption>initialize the client in user mode with options</caption>
   * new StreamChat('api_key', { warmUp:true, timeout:5000 })
   * @example <caption>secret is optional and only used in server side mode</caption>
   * new StreamChat('api_key', "secret", { httpsAgent: customAgent })
   */
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
    this.mutedUsers = [];

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

    this.options = {
      timeout: 3000,
      withCredentials: false, // making sure cookies are not sent
      warmUp: false,
      recoverStateOnReconnect: true,
      ...inputOptions,
    };

    if (this.node && !this.options.httpsAgent) {
      this.options.httpsAgent = new https.Agent({
        keepAlive: true,
        keepAliveMsecs: 3000,
      });
    }

    this.axiosInstance = axios.create(this.options);

    this.setBaseURL(this.options.baseURL || 'https://chat-us-east-1.stream-io-api.com');

    if (typeof process !== 'undefined' && process.env.STREAM_LOCAL_TEST_RUN) {
      this.setBaseURL('http://localhost:3030');
    }

    if (typeof process !== 'undefined' && process.env.STREAM_LOCAL_TEST_HOST) {
      this.setBaseURL('http://' + process.env.STREAM_LOCAL_TEST_HOST);
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
    this.consecutiveFailures = 0;

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
    this.recoverStateOnReconnect = this.options.recoverStateOnReconnect;
  }

  /**
   * Get a client instance
   *
   * This function always returns the same Client instance to avoid issues raised by multiple Client and WS connections
   *
   * **After the first call, the client configuration will not change if the key or options parameters change**
   *
   * @param {string} key - the api key
   * @param {string} [secret] - the api secret
   * @param {StreamChatOptions} [options] - additional options, here you can pass custom options to axios instance
   * @param {boolean} [options.browser] - enforce the client to be in browser mode
   * @param {boolean} [options.warmUp] - default to false, if true, client will open a connection as soon as possible to speed up following requests
   * @param {Logger} [options.Logger] - custom logger
   * @param {number} [options.timeout] - default to 3000
   * @param {httpsAgent} [options.httpsAgent] - custom httpsAgent, in node it's default to https.agent()
   * @example <caption>initialize the client in user mode</caption>
   * StreamChat.getInstance('api_key')
   * @example <caption>initialize the client in user mode with options</caption>
   * StreamChat.getInstance('api_key', { timeout:5000 })
   * @example <caption>secret is optional and only used in server side mode</caption>
   * StreamChat.getInstance('api_key', "secret", { httpsAgent: customAgent })
   */
  public static getInstance<
    AttachmentType extends UnknownType = UnknownType,
    ChannelType extends UnknownType = UnknownType,
    CommandType extends string = LiteralStringForUnion,
    EventType extends UnknownType = UnknownType,
    MessageType extends UnknownType = UnknownType,
    ReactionType extends UnknownType = UnknownType,
    UserType extends UnknownType = UnknownType
  >(
    key: string,
    options?: StreamChatOptions,
  ): StreamChat<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  public static getInstance<
    AttachmentType extends UnknownType = UnknownType,
    ChannelType extends UnknownType = UnknownType,
    CommandType extends string = LiteralStringForUnion,
    EventType extends UnknownType = UnknownType,
    MessageType extends UnknownType = UnknownType,
    ReactionType extends UnknownType = UnknownType,
    UserType extends UnknownType = UnknownType
  >(
    key: string,
    secret?: string,
    options?: StreamChatOptions,
  ): StreamChat<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  public static getInstance<
    AttachmentType extends UnknownType = UnknownType,
    ChannelType extends UnknownType = UnknownType,
    CommandType extends string = LiteralStringForUnion,
    EventType extends UnknownType = UnknownType,
    MessageType extends UnknownType = UnknownType,
    ReactionType extends UnknownType = UnknownType,
    UserType extends UnknownType = UnknownType
  >(
    key: string,
    secretOrOptions?: StreamChatOptions | string,
    options?: StreamChatOptions,
  ): StreamChat<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  > {
    if (!StreamChat._instance) {
      if (typeof secretOrOptions === 'string') {
        StreamChat._instance = new StreamChat<
          AttachmentType,
          ChannelType,
          CommandType,
          EventType,
          MessageType,
          ReactionType,
          UserType
        >(key, secretOrOptions, options);
      } else {
        StreamChat._instance = new StreamChat<
          AttachmentType,
          ChannelType,
          CommandType,
          EventType,
          MessageType,
          ReactionType,
          UserType
        >(key, secretOrOptions);
      }
    }

    return StreamChat._instance as StreamChat<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >;
  }

  devToken(userID: string) {
    return DevToken(userID);
  }

  getAuthType() {
    return this.anonymous ? 'anonymous' : 'jwt';
  }

  setBaseURL(baseURL: string) {
    this.baseURL = baseURL;
    this.wsBaseURL = this.baseURL.replace('http', 'ws').replace(':3030', ':8800');
  }

  _hasConnectionID = () => Boolean(this.wsConnection?.connectionID);

  /**
   * connectUser - Set the current user and open a WebSocket connection
   *
   * @param {OwnUserResponse<ChannelType, CommandType, UserType> | UserResponse<UserType>} user Data about this user. IE {name: "john"}
   * @param {TokenOrProvider} userTokenOrProvider Token or provider
   *
   * @return {ConnectAPIResponse<ChannelType, CommandType, UserType>} Returns a promise that resolves when the connection is setup
   */
  connectUser = async (
    user: OwnUserResponse<ChannelType, CommandType, UserType> | UserResponse<UserType>,
    userTokenOrProvider: TokenOrProvider,
  ) => {
    if (!user.id) {
      throw new Error('The "id" field on the user is missing');
    }

    /**
     * Calling connectUser multiple times is potentially the result of a  bad integration, however,
     * If the user id remains the same we don't throw error
     */
    if (this.userID === user.id && this.setUserPromise) {
      console.warn(
        'Consecutive calls to connectUser is detected, ideally you should only call this function once in your app.',
      );
      return this.setUserPromise;
    }

    if (this.userID) {
      throw new Error(
        'Use client.disconnect() before trying to connect as a different user. connectUser was called twice.',
      );
    }

    if (
      (this._isUsingServerAuth() || this.node) &&
      !this.options.allowServerSideConnect
    ) {
      console.warn(
        'Please do not use connectUser server side. connectUser impacts MAU and concurrent connection usage and thus your bill. If you have a valid use-case, add "allowServerSideConnect: true" to the client options to disable this warning.',
      );
    }

    // we generate the client id client side
    this.userID = user.id;
    this.anonymous = false;

    const setTokenPromise = this._setToken(user, userTokenOrProvider);
    this._setUser(user);

    const wsPromise = this.openConnection();

    this.setUserPromise = Promise.all([setTokenPromise, wsPromise]).then(
      (result) => result[1], // We only return connection promise;
    );

    try {
      return await this.setUserPromise;
    } catch (err) {
      // cleanup client to allow the user to retry connectUser again
      this.disconnectUser();
      throw err;
    }
  };

  /**
   * @deprecated Please use connectUser() function instead. Its naming is more consistent with its functionality.
   *
   * setUser - Set the current user and open a WebSocket connection
   *
   * @param {OwnUserResponse<ChannelType, CommandType, UserType> | UserResponse<UserType>} user Data about this user. IE {name: "john"}
   * @param {TokenOrProvider} userTokenOrProvider Token or provider
   *
   * @return {ConnectAPIResponse<ChannelType, CommandType, UserType>} Returns a promise that resolves when the connection is setup
   */
  setUser = this.connectUser;

  _setToken = (user: UserResponse<UserType>, userTokenOrProvider: TokenOrProvider) =>
    this.tokenManager.setTokenOrProvider(userTokenOrProvider, user);

  _setUser(
    user: OwnUserResponse<ChannelType, CommandType, UserType> | UserResponse<UserType>,
  ) {
    /**
     * This one is used by the frontend. This is a copy of the current user object stored on backend.
     * It contains reserved properties and own user properties which are not present in `this._user`.
     */
    this.user = user;
    // this one is actually used for requests. This is a copy of current user provided to `connectUser` function.
    this._user = { ...user };
  }

  /**
   * Disconnects the websocket connection, without removing the user set on client.
   * client.closeConnection will not trigger default auto-retry mechanism for reconnection. You need
   * to call client.openConnection to reconnect to websocket.
   *
   * This is mainly useful on mobile side. You can only receive push notifications
   * if you don't have active websocket connection.
   * So when your app goes to background, you can call `client.closeConnection`.
   * And when app comes back to foreground, call `client.openConnection`.
   *
   * @param timeout Max number of ms, to wait for close event of websocket, before forcefully assuming succesful disconnection.
   *                https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent
   */
  closeConnection = (timeout?: number) => {
    if (this.cleaningIntervalRef != null) {
      clearInterval(this.cleaningIntervalRef);
      this.cleaningIntervalRef = undefined;
    }

    if (!this.wsConnection) {
      return Promise.resolve();
    }

    return this.wsConnection.disconnect(timeout);
  };

  /**
   * Creates a new WebSocket connection with the current user. Returns empty promise, if there is an active connection
   */
  openConnection = async () => {
    if (!this.userID) {
      throw Error(
        'User is not set on client, use client.connectUser or client.connectAnonymousUser instead',
      );
    }

    if (this.wsConnection?.isHealthy && this._hasConnectionID()) {
      this.logger(
        'info',
        'client:openConnection() - openConnection called twice, healthy connection already exists',
        {
          tags: ['connection', 'client'],
        },
      );

      return Promise.resolve();
    }

    this.clientID = `${this.userID}--${randomId()}`;
    this.wsPromise = this.connect();
    this._startCleaning();
    return this.wsPromise;
  };

  /**
   * @deprecated Please use client.openConnction instead.
   * @private
   *
   * Creates a new websocket connection with current user.
   */
  _setupConnection = this.openConnection;

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

  _normalizeDate = (before: Date | string | null): string | null => {
    if (before instanceof Date) {
      before = before.toISOString();
    }

    if (before === '') {
      throw new Error(
        "Don't pass blank string for since, use null instead if resetting the token revoke",
      );
    }

    return before;
  };

  /**
   * Revokes all tokens on application level issued before given time
   */
  async revokeTokens(before: Date | string | null) {
    return await this.updateAppSettings({
      revoke_tokens_issued_before: this._normalizeDate(before),
    });
  }

  /**
   * Revokes token for a user issued before given time
   */
  async revokeUserToken(userID: string, before?: Date | string | null) {
    return await this.revokeUsersToken([userID], before);
  }

  /**
   * Revokes tokens for a list of users issued before given time
   */
  async revokeUsersToken(userIDs: string[], before?: Date | string | null) {
    if (before === undefined) {
      before = new Date().toISOString();
    } else {
      before = this._normalizeDate(before);
    }

    const users: PartialUserUpdate<UserType>[] = [];
    for (const userID of userIDs) {
      users.push({
        id: userID,
        set: <Partial<UserResponse<UserType>>>{
          revoke_tokens_issued_before: before,
        },
      });
    }

    return await this.partialUpdateUsers(users);
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
				  skipDevices: true, // skip config/device checks and sending to real devices
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
      ...(data.skipDevices ? { skip_devices: true } : {}),
    });
  }

  /**
   * testSQSSettings - Tests that the given or configured SQS configuration is valid
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
  async testSQSSettings(data: TestSQSDataInput = {}) {
    return await this.post<CheckSQSResponse>(this.baseURL + '/check_sqs', data);
  }

  /**
   * Disconnects the websocket and removes the user from client.
   *
   * @param timeout Max number of ms, to wait for close event of websocket, before forcefully assuming successful disconnection.
   *                https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent
   */
  disconnectUser = async (timeout?: number) => {
    this.logger('info', 'client:disconnect() - Disconnecting the client', {
      tags: ['connection', 'client'],
    });

    // remove the user specific fields
    delete this.user;
    delete this._user;
    delete this.userID;

    this.anonymous = false;

    const closePromise = this.closeConnection(timeout);

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
    return closePromise;
  };

  /**
   *
   * @deprecated Please use client.disconnectUser instead.
   *
   * Disconnects the websocket and removes the user from client.
   */
  disconnect = this.disconnectUser;

  /**
   * connectAnonymousUser - Set an anonymous user and open a WebSocket connection
   */
  connectAnonymousUser = () => {
    if (
      (this._isUsingServerAuth() || this.node) &&
      !this.options.allowServerSideConnect
    ) {
      console.warn(
        'Please do not use connectUser server side. connectUser impacts MAU and concurrent connection usage and thus your bill. If you have a valid use-case, add "allowServerSideConnect: true" to the client options to disable this warning.',
      );
    }

    this.anonymous = true;
    this.userID = randomId();
    const anonymousUser = {
      id: this.userID,
      anon: true,
    } as UserResponse<UserType>;

    this._setToken(anonymousUser, '');
    this._setUser(anonymousUser);

    return this._setupConnection();
  };

  /**
   * @deprecated Please use connectAnonymousUser. Its naming is more consistent with its functionality.
   */
  setAnonymousUser = this.connectAnonymousUser;

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
    return await this.connectUser(
      guestUser as UserResponse<UserType>,
      response.access_token,
    );
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
  createToken(userID: string, exp?: number, iat?: number) {
    if (this.secret == null) {
      throw Error(`tokens can only be created server-side using the API Secret`);
    }
    const extra: { exp?: number; iat?: number } = {};

    if (exp) {
      extra.exp = exp;
    }

    if (iat) {
      extra.iat = iat;
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
        this.logger('info', `Removing listener for ${key} event`, {
          tags: ['event', 'client'],
        });

        this.listeners[key] = this.listeners[key].filter((el) => el !== callback);
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
    this.listeners[key] = this.listeners[key].filter((value) => value !== callback);
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
          response = await this.axiosInstance.options(url, requestConfig);
          break;
        default:
          throw new Error('Invalid request type');
      }
      this._logApiResponse<T>(type, url, response);
      this.consecutiveFailures = 0;
      return this.handleResponse(response);
    } catch (e) {
      this._logApiError(type, url, e);
      this.consecutiveFailures += 1;
      if (e.response) {
        if (
          e.response.data.code === chatCodes.TOKEN_EXPIRED &&
          !this.tokenManager.isStatic()
        ) {
          if (this.consecutiveFailures > 1) {
            await sleep(retryInterval(this.consecutiveFailures));
          }
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
    uri: string | NodeJS.ReadableStream | Buffer | File,
    name?: string,
    contentType?: string,
    user?: UserResponse<UserType>,
  ) {
    const data = addFileToFormData(uri, name, contentType);
    if (user != null) data.append('user', JSON.stringify(user));

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
    const postListenerCallbacks = this._handleClientEvent(event);

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

    postListenerCallbacks.forEach((c) => c());
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

  /**
   * Updates the members and watchers of the currently active channels that contain this user
   *
   * @param {UserResponse<UserType>} user
   */
  _updateMemberWatcherReferences = (user: UserResponse<UserType>) => {
    const refMap = this.state.userChannelReferences[user.id] || {};
    for (const channelID in refMap) {
      const channel = this.activeChannels[channelID];
      /** search the members and watchers and update as needed... */
      if (channel?.state) {
        if (channel.state.members[user.id]) {
          channel.state.members[user.id].user = user;
        }
        if (channel.state.watchers[user.id]) {
          channel.state.watchers[user.id] = user;
        }
      }
    }
  };

  /**
   * @deprecated Please _updateMemberWatcherReferences instead.
   * @private
   */
  _updateUserReferences = this._updateMemberWatcherReferences;

  /**
   * @private
   *
   * Updates the messages from the currently active channels that contain this user,
   * with updated user object.
   *
   * @param {UserResponse<UserType>} user
   */
  _updateUserMessageReferences = (user: UserResponse<UserType>) => {
    const refMap = this.state.userChannelReferences[user.id] || {};

    for (const channelID in refMap) {
      const channel = this.activeChannels[channelID];
      const state = channel.state;

      /** update the messages from this user. */
      state?.updateUserMessages(user);
    }
  };

  /**
   * @private
   *
   * Deletes the messages from the currently active channels that contain this user
   *
   * If hardDelete is true, all the content of message will be stripped down.
   * Otherwise, only 'message.type' will be set as 'deleted'.
   *
   * @param {UserResponse<UserType>} user
   * @param {boolean} hardDelete
   */
  _deleteUserMessageReference = (user: UserResponse<UserType>, hardDelete = false) => {
    const refMap = this.state.userChannelReferences[user.id] || {};

    for (const channelID in refMap) {
      const channel = this.activeChannels[channelID];
      const state = channel.state;

      /** deleted the messages from this user. */
      state?.deleteUserMessages(user, hardDelete);
    }
  };

  /**
   * @private
   *
   * Handle following user related events:
   * - user.presence.changed
   * - user.updated
   * - user.deleted
   *
   * @param {Event} event
   */
  _handleUserEvent = (
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
    if (!event.user) {
      return;
    }

    /** update the client.state with any changes to users */
    if (event.type === 'user.presence.changed' || event.type === 'user.updated') {
      if (event.user.id === this.userID) {
        const user = { ...(this.user || {}) };
        const _user = { ...(this._user || {}) };

        // Remove deleted properties from user objects.
        for (const key in this.user) {
          if (key in event.user || isOwnUserBaseProperty(key)) {
            continue;
          }

          delete user[key];
          delete _user[key];
        }

        /** Updating only available properties in _user object. */
        for (const key in event.user) {
          if (_user && key in _user) {
            _user[key] = event.user[key];
          }
        }

        // @ts-expect-error
        this._user = { ..._user };
        this.user = { ...user, ...event.user };
      }

      this.state.updateUser(event.user);
      this._updateMemberWatcherReferences(event.user);
    }

    if (event.type === 'user.updated') {
      this._updateUserMessageReferences(event.user);
    }

    if (
      event.type === 'user.deleted' &&
      event.user.deleted_at &&
      (event.mark_messages_deleted || event.hard_delete)
    ) {
      this._deleteUserMessageReference(event.user, event.hard_delete);
    }
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
    const postListenerCallbacks = [];
    this.logger(
      'info',
      `client:_handleClientEvent - Received event of type { ${event.type} }`,
      {
        tags: ['event', 'client'],
        event,
      },
    );

    if (
      event.type === 'user.presence.changed' ||
      event.type === 'user.updated' ||
      event.type === 'user.deleted'
    ) {
      this._handleUserEvent(event);
    }

    if (event.type === 'health.check' && event.me) {
      client.user = event.me;
      client.state.updateUser(event.me);
      client.mutedChannels = event.me.channel_mutes;
      client.mutedUsers = event.me.mutes;
    }

    if (event.channel && event.type === 'notification.message_new') {
      this.configs[event.channel.type] = event.channel.config;
    }

    if (event.type === 'notification.channel_mutes_updated' && event.me?.channel_mutes) {
      const currentMutedChannelIds: string[] = [];
      const nextMutedChannelIds: string[] = [];

      this.mutedChannels.forEach(
        (mute) => mute.channel && currentMutedChannelIds.push(mute.channel.cid),
      );
      event.me.channel_mutes.forEach(
        (mute) => mute.channel && nextMutedChannelIds.push(mute.channel.cid),
      );

      /** Set the unread count of un-muted channels to 0, which is the behaviour of backend */
      currentMutedChannelIds.forEach((cid) => {
        if (!nextMutedChannelIds.includes(cid) && this.activeChannels[cid]) {
          this.activeChannels[cid].state.unreadCount = 0;
        }
      });

      this.mutedChannels = event.me.channel_mutes;
    }

    if (event.type === 'notification.mutes_updated' && event.me?.mutes) {
      this.mutedUsers = event.me.mutes;
    }

    if (
      (event.type === 'channel.deleted' ||
        event.type === 'notification.channel_deleted') &&
      event.cid
    ) {
      client.state.deleteAllChannelReference(event.cid);
      this.activeChannels[event.cid]?._disconnect();

      postListenerCallbacks.push(() => {
        if (!event.cid) return;

        delete this.activeChannels[event.cid];
      });
    }

    return postListenerCallbacks;
  }

  _muteStatus(cid: string) {
    let muteStatus;
    for (let i = 0; i < this.mutedChannels.length; i++) {
      const mute = this.mutedChannels[i];
      if (mute.channel?.cid === cid) {
        muteStatus = {
          muted: mute.expires
            ? new Date(mute.expires).getTime() > new Date().getTime()
            : true,
          createdAt: mute.created_at ? new Date(mute.created_at) : new Date(),
          expiresAt: mute.expires ? new Date(mute.expires) : null,
        };
        break;
      }
    }

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
    const listeners: Array<
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
    > = [];
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

    const cids = Object.keys(this.activeChannels);
    if (cids.length && this.recoverStateOnReconnect) {
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
    } else {
      this.dispatchEvent({
        type: 'connection.recovered',
      } as Event<AttachmentType, ChannelType, CommandType, EventType, MessageType, ReactionType, UserType>);
    }

    this.wsPromise = Promise.resolve();
    this.setUserPromise = Promise.resolve();
  };

  /**
   * @private
   */
  async connect() {
    this.connecting = true;
    const client = this;
    this.failures = 0;

    if (client.userID == null || this._user == null) {
      throw Error(
        'Call connectUser or connectAnonymousUser before starting the connection',
      );
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
      userAgent: this.getUserAgent(),
      apiKey: this.key,
      recoverCallback: this.recoverState,
      messageCallback: this.handleEvent,
      eventCallback: this.dispatchEvent as (event: ConnectionChangeEvent) => void,
      logger: this.logger,
      device: this.options.device,
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

    return handshake;
  }

  /**
   * queryUsers - Query users and watch user presence
   *
   * @param {UserFilters<UserType>} filterConditions MongoDB style filter conditions
   * @param {UserSort<UserType>} sort Sort options, for instance [{last_active: -1}].
   * When using multiple fields, make sure you use array of objects to guarantee field order, for instance [{last_active: -1}, {created_at: 1}]
   * @param {UserOptions} options Option object, {presence: true}
   *
   * @return {Promise<APIResponse & { users: Array<UserResponse<UserType>> }>} User Query Response
   */
  async queryUsers(
    filterConditions: UserFilters<UserType>,
    sort: UserSort<UserType> = [],
    options: UserOptions = {},
  ) {
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
        sort: normalizeQuerySort(sort),
        ...defaultOptions,
        ...options,
      },
    });

    this.state.updateUsers(data.users);

    return data;
  }

  /**
   * queryBannedUsers - Query user bans
   *
   * @param {BannedUsersFilters} filterConditions MongoDB style filter conditions
   * @param {BannedUsersSort} sort Sort options [{created_at: 1}].
   * @param {BannedUsersPaginationOptions} options Option object, {limit: 10, offset:0}
   *
   * @return {Promise<BannedUsersResponse<ChannelType, CommandType, UserType>>} Ban Query Response
   */
  async queryBannedUsers(
    filterConditions: BannedUsersFilters = {},
    sort: BannedUsersSort = [],
    options: BannedUsersPaginationOptions = {},
  ) {
    // Return a list of user bans
    return await this.get<BannedUsersResponse<ChannelType, CommandType, UserType>>(
      this.baseURL + '/query_banned_users',
      {
        payload: {
          filter_conditions: filterConditions,
          sort: normalizeQuerySort(sort),
          ...options,
        },
      },
    );
  }

  /**
   * queryMessageFlags - Query message flags
   *
   * @param {MessageFlagsFilters} filterConditions MongoDB style filter conditions
   * @param {MessageFlagsPaginationOptions} options Option object, {limit: 10, offset:0}
   *
   * @return {Promise<MessageFlagsResponse<ChannelType, CommandType, UserType>>} Message Flags Response
   */
  async queryMessageFlags(
    filterConditions: MessageFlagsFilters = {},
    options: MessageFlagsPaginationOptions = {},
  ) {
    // Return a list of message flags
    return await this.get<MessageFlagsResponse<ChannelType, CommandType, UserType>>(
      this.baseURL + '/moderation/flags/message',
      {
        payload: {
          filter_conditions: filterConditions,
          ...options,
        },
      },
    );
  }

  /**
   * queryChannels - Query channels
   *
   * @param {ChannelFilters<ChannelType, CommandType, UserType>} filterConditions object MongoDB style filters
   * @param {ChannelSort<ChannelType>} [sort] Sort options, for instance {created_at: -1}.
   * When using multiple fields, make sure you use array of objects to guarantee field order, for instance [{last_updated: -1}, {created_at: 1}]
   * @param {ChannelOptions} [options] Options object
   * @param {ChannelStateOptions} [stateOptions] State options object. These options will only be used for state management and won't be sent in the request.
   * - stateOptions.skipInitialization - Skips the initialization of the state for the channels matching the ids in the list.
   *
   * @return {Promise<APIResponse & { channels: Array<ChannelAPIResponse<AttachmentType,ChannelType,CommandType,MessageType,ReactionType,UserType>>}> } search channels response
   */
  async queryChannels(
    filterConditions: ChannelFilters<ChannelType, CommandType, UserType>,
    sort: ChannelSort<ChannelType> = [],
    options: ChannelOptions = {},
    stateOptions: ChannelStateOptions = {},
  ) {
    const { skipInitialization } = stateOptions;
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
      sort: normalizeQuerySort(sort),
      ...defaultOptions,
      ...options,
    };

    const data = await this.post<{
      channels: ChannelAPIResponse<
        AttachmentType,
        ChannelType,
        CommandType,
        MessageType,
        ReactionType,
        UserType
      >[];
    }>(this.baseURL + '/channels', payload);

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

      if (skipInitialization === undefined) {
        c._initializeState(channelState);
      } else if (!skipInitialization.includes(channelState.channel.id)) {
        c.state.clearMessages();
        c._initializeState(channelState);
      }

      channels.push(c);
    }
    return channels;
  }

  /**
   * search - Query messages
   *
   * @param {ChannelFilters<ChannelType, CommandType, UserType>} filterConditions MongoDB style filter conditions
   * @param {MessageFilters<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType> | string} query search query or object MongoDB style filters
   * @param {SearchOptions<MessageType>} [options] Option object, {user_id: 'tommaso'}
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
    options: SearchOptions<MessageType> = {},
  ) {
    if (options.offset && (options.sort || options.next)) {
      throw Error(`Cannot specify offset with sort or next parameters`);
    }
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
      sort: options.sort
        ? normalizeQuerySort<SearchMessageSortBase<MessageType>>(options.sort)
        : undefined,
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
   * setLocalDevice - Set the device info for the current client(device) that will be sent via WS connection automatically
   *
   * @param {BaseDeviceFields} device the device object
   * @param {string} device.id device id
   * @param {string} device.push_provider the push provider (apn or firebase)
   *
   */
  setLocalDevice(device: BaseDeviceFields) {
    if (this.wsConnection) {
      throw new Error('you can only set device before opening a websocket connection');
    }

    this.options.device = device;
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
   * @param {string} [userID] User ID. Only works on serverside
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

  /**
   * getRateLimits - Returns the rate limits quota and usage for the current app, possibly filter for a specific platform and/or endpoints.
   * Only available server-side.
   *
   * @param {object} [params] The params for the call. If none of the params are set, all limits for all platforms are returned.
   * @returns {Promise<GetRateLimitsResponse>}
   */
  async getRateLimits(params?: {
    android?: boolean;
    endpoints?: EndpointName[];
    ios?: boolean;
    serverSide?: boolean;
    web?: boolean;
  }) {
    const { serverSide, web, android, ios, endpoints } = params || {};
    return this.get<GetRateLimitsResponse>(this.baseURL + '/rate_limits', {
      server_side: serverSide,
      web,
      android,
      ios,
      endpoints: endpoints ? endpoints.join(',') : undefined,
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
   * If you want to create a unique conversation between 2 or more users; you can leave out the ID parameter and provide the list of members.
   * Make sure to await channel.create() or channel.watch() before accessing channel functions:
   * ie. channel = client.channel("messaging", {members: ["tommaso", "thierry"]})
   * await channel.create() to assign an ID to channel
   *
   * @param {string} channelType The channel type
   * @param {string | ChannelData<ChannelType> | null} [channelIDOrCustom]   The channel ID, you can leave this out if you want to create a conversation channel
   * @param {object} [custom]    Custom data to attach to the channel
   *
   * @return {channel} The channel object, initialize it using channel.watch()
   */
  channel(
    channelType: string,
    channelID?: string | null,
    custom?: ChannelData<ChannelType>,
  ): Channel<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  channel(
    channelType: string,
    custom?: ChannelData<ChannelType>,
  ): Channel<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  channel(
    channelType: string,
    channelIDOrCustom?: string | ChannelData<ChannelType> | null,
    custom: ChannelData<ChannelType> = {} as ChannelData<ChannelType>,
  ) {
    if (!this.userID && !this._isUsingServerAuth()) {
      throw Error('Call connectUser or connectAnonymousUser before creating a channel');
    }

    if (~channelType.indexOf(':')) {
      throw Error(`Invalid channel group ${channelType}, can't contain the : character`);
    }

    // support channel("messaging", null, {options})
    // support channel("messaging", undefined, {options})
    // support channel("messaging", "", {options})
    if (channelIDOrCustom == null || channelIDOrCustom === '') {
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
    if (typeof channelIDOrCustom === 'object') {
      return this.getChannelByMembers(channelType, channelIDOrCustom);
    }

    return this.getChannelById(channelType, channelIDOrCustom, custom);
  }

  /**
   * It's a helper method for `client.channel()` method, used to create unique conversation or
   * channel based on member list instead of id.
   *
   * If the channel already exists in `activeChannels` list, then we simply return it, since that
   * means the same channel was already requested or created.
   *
   * Otherwise we create a new instance of Channel class and return it.
   *
   * @private
   *
   * @param {string} channelType The channel type
   * @param {object} [custom]    Custom data to attach to the channel
   *
   * @return {channel} The channel object, initialize it using channel.watch()
   */
  getChannelByMembers = (channelType: string, custom: ChannelData<ChannelType>) => {
    // Check if the channel already exists.
    // Only allow 1 channel object per cid
    const membersStr = [...(custom.members || [])].sort().join(',');
    const tempCid = `${channelType}:!members-${membersStr}`;

    if (!membersStr) {
      throw Error('Please specify atleast one member when creating unique conversation');
    }

    // channel could exist in `activeChannels` list with either one of the following two keys:
    // 1. cid - Which gets set on channel only after calling channel.query or channel.watch or channel.create
    // 2. Sorted membersStr - E.g., "messaging:amin,vishal" OR "messaging:amin,jaap,tom"
    //                        This is set when you create a channel, but haven't queried yet. After query,
    //                        we will replace it with `cid`
    for (const key in this.activeChannels) {
      const channel = this.activeChannels[key];
      if (channel.disconnected) {
        continue;
      }

      if (key === tempCid) {
        return channel;
      }

      if (key.indexOf(`${channelType}:!members-`) === 0) {
        const membersStrInExistingChannel = Object.keys(channel.state.members)
          .sort()
          .join(',');
        if (membersStrInExistingChannel === membersStr) {
          return channel;
        }
      }
    }

    const channel = new Channel<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >(this, channelType, undefined, custom);

    // For the time being set the key as membersStr, since we don't know the cid yet.
    // In channel.query, we will replace it with 'cid'.
    this.activeChannels[tempCid] = channel;
    return channel;
  };

  /**
   * Its a helper method for `client.channel()` method, used to channel given the id of channel.
   *
   * If the channel already exists in `activeChannels` list, then we simply return it, since that
   * means the same channel was already requested or created.
   *
   * Otherwise we create a new instance of Channel class and return it.
   *
   * @private
   *
   * @param {string} channelType The channel type
   * @param {string} [channelID] The channel ID
   * @param {object} [custom]    Custom data to attach to the channel
   *
   * @return {channel} The channel object, initialize it using channel.watch()
   */
  getChannelById = (
    channelType: string,
    channelID: string,
    custom: ChannelData<ChannelType>,
  ) => {
    if (typeof channelID === 'string' && ~channelID.indexOf(':')) {
      throw Error(`Invalid channel id ${channelID}, can't contain the : character`);
    }

    // only allow 1 channel object per cid
    const cid = `${channelType}:${channelID}`;
    if (cid in this.activeChannels && !this.activeChannels[cid].disconnected) {
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
  };

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
   * @deprecated Please use upsertUsers() function instead.
   *
   * updateUsers - Batch update the list of users
   *
   * @param {UserResponse<UserType>[]} users list of users
   * @return {Promise<APIResponse & { users: { [key: string]: UserResponse<UserType> } }>}
   */
  updateUsers = this.upsertUsers;

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
   * @deprecated Please use upsertUser() function instead.
   *
   * updateUser - Update or Create the given user object
   *
   * @param {UserResponse<UserType>} userObject user object, the only required field is the user id. IE {id: "myuser"} is valid
   * @return {Promise<APIResponse & { users: { [key: string]: UserResponse<UserType> } }>}
   */
  updateUser = this.upsertUser;

  /**
   * partialUpdateUsers - Batch partial update of users
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
    params?: {
      delete_conversation_channels?: boolean;
      hard_delete?: boolean;
      mark_messages_deleted?: boolean;
    },
  ) {
    return await this.delete<
      APIResponse & {
        user: UserResponse<UserType>;
      }
    >(this.baseURL + `/users/${userID}`, params);
  }

  async reactivateUser(
    userID: string,
    options?: { created_by_id?: string; name?: string; restore_messages?: boolean },
  ) {
    return await this.post<
      APIResponse & {
        user: UserResponse<UserType>;
      }
    >(this.baseURL + `/users/${userID}/reactivate`, {
      ...options,
    });
  }

  async deactivateUser(
    userID: string,
    options?: { created_by_id?: string; mark_messages_deleted?: boolean },
  ) {
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
    if (options?.user_id !== undefined) {
      options.banned_by_id = options.user_id;
      delete options.user_id;
      console.warn(
        "banUser: 'user_id' is deprecated, please consider switching to 'banned_by_id'",
      );
    }
    if (options?.user !== undefined) {
      options.banned_by = options.user;
      delete options.user;
      console.warn(
        "banUser: 'user' is deprecated, please consider switching to 'banned_by'",
      );
    }
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

  /** shadowBan - shadow bans a user from all channels
   *
   * @param {string} targetUserID
   * @param {BanUserOptions<UserType>} [options]
   * @returns {Promise<APIResponse>}
   */
  async shadowBan(targetUserID: string, options?: BanUserOptions<UserType>) {
    return await this.banUser(targetUserID, {
      shadow: true,
      ...options,
    });
  }

  /** removeShadowBan - revoke global shadow ban for a user
   *
   * @param {string} targetUserID
   * @param {UnBanUserOptions} [options]
   * @returns {Promise<APIResponse>}
   */
  async removeShadowBan(targetUserID: string, options?: UnBanUserOptions) {
    return await this.unbanUser(targetUserID, {
      shadow: true,
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

  /** userMuteStatus - check if a user is muted or not, can be used after connectUser() is called
   *
   * @param {string} targetID
   * @returns {boolean}
   */
  userMuteStatus(targetID: string) {
    if (!this.user || !this.wsPromise) {
      throw new Error('Make sure to await connectUser() first.');
    }

    for (let i = 0; i < this.mutedUsers.length; i += 1) {
      if (this.mutedUsers[i].target.id === targetID) return true;
    }
    return false;
  }

  /**
   * flagMessage - flag a message
   * @param {string} targetMessageID
   * @param {string} [options.user_id] currentUserID, only used with serverside auth
   * @returns {Promise<APIResponse>}
   */
  async flagMessage(targetMessageID: string, options: { user_id?: string } = {}) {
    return await this.post<FlagMessageResponse<UserType>>(
      this.baseURL + '/moderation/flag',
      {
        target_message_id: targetMessageID,
        ...options,
      },
    );
  }

  /**
   * flagUser - flag a user
   * @param {string} targetID
   * @param {string} [options.user_id] currentUserID, only used with serverside auth
   * @returns {Promise<APIResponse>}
   */
  async flagUser(targetID: string, options: { user_id?: string } = {}) {
    return await this.post<FlagUserResponse<UserType>>(
      this.baseURL + '/moderation/flag',
      {
        target_user_id: targetID,
        ...options,
      },
    );
  }

  /**
   * unflagMessage - unflag a message
   * @param {string} targetMessageID
   * @param {string} [options.user_id] currentUserID, only used with serverside auth
   * @returns {Promise<APIResponse>}
   */
  async unflagMessage(targetMessageID: string, options: { user_id?: string } = {}) {
    return await this.post<FlagMessageResponse<UserType>>(
      this.baseURL + '/moderation/unflag',
      {
        target_message_id: targetMessageID,
        ...options,
      },
    );
  }

  /**
   * unflagUser - unflag a user
   * @param {string} targetID
   * @param {string} [options.user_id] currentUserID, only used with serverside auth
   * @returns {Promise<APIResponse>}
   */
  async unflagUser(targetID: string, options: { user_id?: string } = {}) {
    return await this.post<FlagUserResponse<UserType>>(
      this.baseURL + '/moderation/unflag',
      {
        target_user_id: targetID,
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
   * _normalizeExpiration - transforms expiration value into ISO string
   * @param {undefined|null|number|string|Date} timeoutOrExpirationDate expiration date or timeout. Use number type to set timeout in seconds, string or Date to set exact expiration date
   */
  _normalizeExpiration(timeoutOrExpirationDate?: null | number | string | Date) {
    let pinExpires: undefined | string;
    if (typeof timeoutOrExpirationDate === 'number') {
      const now = new Date();
      now.setSeconds(now.getSeconds() + timeoutOrExpirationDate);
      pinExpires = now.toISOString();
    } else if (isString(timeoutOrExpirationDate)) {
      pinExpires = timeoutOrExpirationDate;
    } else if (timeoutOrExpirationDate instanceof Date) {
      pinExpires = timeoutOrExpirationDate.toISOString();
    }
    return pinExpires;
  }

  /**
   * _messageId - extracts string message id from either message object or message id
   * @param {string | { id: string }} messageOrMessageId message object or message id
   * @param {string} errorText error message to report in case of message id absence
   */
  _validateAndGetMessageId(
    messageOrMessageId: string | { id: string },
    errorText: string,
  ) {
    let messageId: string;
    if (typeof messageOrMessageId === 'string') {
      messageId = messageOrMessageId;
    } else {
      if (!messageOrMessageId.id) {
        throw Error(errorText);
      }
      messageId = messageOrMessageId.id;
    }
    return messageId;
  }

  /**
   * pinMessage - pins the message
   * @param {string | { id: string }} messageOrMessageId message object or message id
   * @param {undefined|null|number|string|Date} timeoutOrExpirationDate expiration date or timeout. Use number type to set timeout in seconds, string or Date to set exact expiration date
   * @param {string | { id: string }} [userId]
   */
  pinMessage(
    messageOrMessageId: string | { id: string },
    timeoutOrExpirationDate?: null | number | string | Date,
    userId?: string | { id: string },
  ) {
    const messageId = this._validateAndGetMessageId(
      messageOrMessageId,
      'Please specify the message id when calling unpinMessage',
    );
    return this.partialUpdateMessage(
      messageId,
      {
        set: {
          pinned: true,
          pin_expires: this._normalizeExpiration(timeoutOrExpirationDate),
        },
      },
      userId,
    );
  }

  /**
   * unpinMessage - unpins the message that was previously pinned
   * @param {string | { id: string }} messageOrMessageId message object or message id
   * @param {string | { id: string }} [userId]
   */
  unpinMessage(
    messageOrMessageId: string | { id: string },
    userId?: string | { id: string },
  ) {
    const messageId = this._validateAndGetMessageId(
      messageOrMessageId,
      'Please specify the message id when calling unpinMessage',
    );
    return this.partialUpdateMessage(
      messageId,
      {
        set: {
          pinned: false,
        },
      },
      userId,
    );
  }

  /**
   * updateMessage - Update the given message
   *
   * @param {Omit<MessageResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>, 'mentioned_users'> & { mentioned_users?: string[] }} message object, id needs to be specified
   * @param {string | { id: string }} [userId]
   *
   * @return {APIResponse & { message: MessageResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType> }} Response that includes the message
   */
  async updateMessage(
    message: UpdatedMessage<
      AttachmentType,
      ChannelType,
      CommandType,
      MessageType,
      ReactionType,
      UserType
    >,
    userId?: string | { id: string },
  ) {
    if (!message.id) {
      throw Error('Please specify the message id when calling updateMessage');
    }

    const clonedMessage: Message = Object.assign({}, message);
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
      | '__html'
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
      '__html',
    ];

    reservedMessageFields.forEach(function (item) {
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

    /**
     * Server always expects mentioned_users to be array of string. We are adding extra check, just in case
     * SDK missed this conversion.
     */
    if (
      Array.isArray(clonedMessage.mentioned_users) &&
      !isString(clonedMessage.mentioned_users[0])
    ) {
      clonedMessage.mentioned_users = clonedMessage.mentioned_users.map(
        (mu) => ((mu as unknown) as UserResponse).id,
      );
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

  /**
   * partialUpdateMessage - Update the given message id while retaining additional properties
   *
   * @param {string} id the message id
   *
   * @param {PartialUpdateMessage<MessageType>}  partialMessageObject which should contain id and any of "set" or "unset" params;
   *         example: {id: "user1", set:{text: "hi"}, unset:["color"]}
   * @param {string | { id: string }} [userId]
   *
   * @return {APIResponse & { message: MessageResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType> }} Response that includes the updated message
   */
  async partialUpdateMessage(
    id: string,
    partialMessageObject: PartialMessageUpdate<MessageType>,
    userId?: string | { id: string },
  ) {
    if (!id) {
      throw Error('Please specify the message id when calling partialUpdateMessage');
    }
    let user = userId;
    if (userId != null && isString(userId)) {
      user = { id: userId };
    }
    return await this.put<
      UpdateMessageAPIResponse<
        AttachmentType,
        ChannelType,
        CommandType,
        MessageType,
        ReactionType,
        UserType
      >
    >(this.baseURL + `/messages/${id}`, {
      ...partialMessageObject,
      user,
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
        connection_id: this.wsConnection?.connectionID,
      },
      headers: {
        Authorization: token,
        'stream-auth-type': this.getAuthType(),
        'X-Stream-Client': this.getUserAgent(),
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
    return this.get<PermissionAPIResponse>(`${this.baseURL}/permissions/${name}`);
  }

  /** createPermission - creates a custom permission
   *
   * @param {CustomPermissionOptions} permissionData the permission data
   * @returns {Promise<APIResponse>}
   */
  createPermission(permissionData: CustomPermissionOptions) {
    return this.post<APIResponse>(`${this.baseURL}/permissions`, {
      ...permissionData,
    });
  }

  /** updatePermission - updates an existing custom permission
   *
   * @param {string} id
   * @param {Omit<CustomPermissionOptions, 'id'>} permissionData the permission data
   * @returns {Promise<APIResponse>}
   */
  updatePermission(id: string, permissionData: Omit<CustomPermissionOptions, 'id'>) {
    return this.put<APIResponse>(`${this.baseURL}/permissions/${id}`, {
      ...permissionData,
    });
  }

  /** deletePermission - deletes a custom permission
   *
   * @param {string} name
   * @returns {Promise<APIResponse>}
   */
  deletePermission(name: string) {
    return this.delete<APIResponse>(`${this.baseURL}/permissions/${name}`);
  }

  /** listPermissions - returns the list of all permissions for this application
   *
   * @returns {Promise<APIResponse>}
   */
  listPermissions() {
    return this.get<PermissionsAPIResponse>(`${this.baseURL}/permissions`);
  }

  /** createRole - creates a custom role
   *
   * @param {string} name the new role name
   * @returns {Promise<APIResponse>}
   */
  createRole(name: string) {
    return this.post<APIResponse>(`${this.baseURL}/roles`, { name });
  }

  /** listRoles - returns the list of all roles for this application
   *
   * @returns {Promise<APIResponse>}
   */
  listRoles() {
    return this.get<APIResponse>(`${this.baseURL}/roles`);
  }

  /** deleteRole - deletes a custom role
   *
   * @param {string} name the role name
   * @returns {Promise<APIResponse>}
   */
  deleteRole(name: string) {
    return this.delete<APIResponse>(`${this.baseURL}/roles/${name}`);
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

  /**
   * sendUserCustomEvent - Send a custom event to a user
   *
   * @param {string} targetUserID target user id
   * @param {UserCustomEvent} event for example {type: 'friendship-request'}
   *
   * @return {Promise<APIResponse>} The Server Response
   */
  async sendUserCustomEvent(targetUserID: string, event: UserCustomEvent) {
    return await this.post<APIResponse>(`${this.baseURL}/users/${targetUserID}/event`, {
      event,
    });
  }

  createBlockList(blockList: BlockList) {
    return this.post<APIResponse>(`${this.baseURL}/blocklists`, blockList);
  }

  listBlockLists() {
    return this.get<APIResponse & { blocklists: BlockListResponse[] }>(
      `${this.baseURL}/blocklists`,
    );
  }

  getBlockList(name: string) {
    return this.get<APIResponse & { blocklist: BlockListResponse }>(
      `${this.baseURL}/blocklists/${name}`,
    );
  }

  updateBlockList(name: string, data: { words: string[] }) {
    return this.put<APIResponse>(`${this.baseURL}/blocklists/${name}`, data);
  }

  deleteBlockList(name: string) {
    return this.delete<APIResponse>(`${this.baseURL}/blocklists/${name}`);
  }

  exportChannels(request: Array<ExportChannelRequest>) {
    const payload = {
      channels: request,
    };
    return this.post<APIResponse & ExportChannelResponse>(
      `${this.baseURL}/export_channels`,
      payload,
    );
  }

  exportChannel(request: ExportChannelRequest) {
    return this.exportChannels([request]);
  }

  getExportChannelStatus(id: string) {
    return this.get<APIResponse & ExportChannelStatusResponse>(
      `${this.baseURL}/export_channels/${id}`,
    );
  }

  /**
   * createSegment - Creates a Campaign Segment
   *
   * @param {SegmentData} params Segment data
   *
   * @return {Segment} The Created Segment
   */
  async createSegment(params: SegmentData) {
    const { segment } = await this.post<{ segment: Segment }>(
      this.baseURL + `/segments`,
      { segment: params },
    );
    return segment;
  }

  /**
   * getSegment - Get a Campaign Segment
   *
   * @param {string} id Segment ID
   *
   * @return {Segment} A Segment
   */
  async getSegment(id: string) {
    const { segment } = await this.get<{ segment: Segment }>(
      this.baseURL + `/segments/${id}`,
    );
    return segment;
  }

  /**
   * listSegments - List Campaign Segments
   *
   *
   * @return {Segment[]} Segments
   */
  async listSegments(options: { limit?: number; offset?: number }) {
    const { segments } = await this.get<{ segments: Segment[] }>(
      this.baseURL + `/segments`,
      options,
    );
    return segments;
  }

  /**
   * updateSegment - Update a Campaign Segment
   *
   * @param {string} id Segment ID
   * @param {Partial<SegmentData>} params Segment data
   *
   * @return {Segment} Updated Segment
   */
  async updateSegment(id: string, params: Partial<SegmentData>) {
    const { segment } = await this.put<{ segment: Segment }>(
      this.baseURL + `/segments/${id}`,
      { segment: params },
    );
    return segment;
  }

  /**
   * deleteSegment - Delete a Campaign Segment
   *
   * @param {string} id Segment ID
   *
   * @return {Promise<APIResponse>} The Server Response
   */
  async deleteSegment(id: string) {
    return this.delete<APIResponse>(this.baseURL + `/segments/${id}`);
  }

  /**
   * createCampaign - Creates a Campaign
   *
   * @param {CampaignData} params Campaign data
   *
   * @return {Campaign} The Created Campaign
   */
  async createCampaign(params: CampaignData) {
    const { campaign } = await this.post<{ campaign: Campaign }>(
      this.baseURL + `/campaigns`,
      { campaign: params },
    );
    return campaign;
  }

  /**
   * getCampaign - Get a Campaign
   *
   * @param {string} id Campaign ID
   *
   * @return {Campaign} A Campaign
   */
  async getCampaign(id: string) {
    const { campaign } = await this.get<{ campaign: Campaign }>(
      this.baseURL + `/campaigns/${id}`,
    );
    return campaign;
  }

  /**
   * listCampaigns - List Campaigns
   *
   *
   * @return {Campaign[]} Campaigns
   */
  async listCampaigns(options: { limit?: number; offset?: number }) {
    const { campaigns } = await this.get<{ campaigns: Campaign[] }>(
      this.baseURL + `/campaigns`,
      options,
    );
    return campaigns;
  }

  /**
   * updateCampaign - Update a Campaign
   *
   * @param {string} id Campaign ID
   * @param {Partial<CampaignData>} params Campaign data
   *
   * @return {Campaign} Updated Campaign
   */
  async updateCampaign(id: string, params: Partial<CampaignData>) {
    const { campaign } = await this.put<{ campaign: Campaign }>(
      this.baseURL + `/campaigns/${id}`,
      { campaign: params },
    );
    return campaign;
  }

  /**
   * deleteCampaign - Delete a Campaign
   *
   * @param {string} id Campaign ID
   *
   * @return {Promise<APIResponse>} The Server Response
   */
  async deleteCampaign(id: string) {
    return this.delete<APIResponse>(this.baseURL + `/campaigns/${id}`);
  }

  /**
   * scheduleCampaign - Schedule a Campaign
   *
   * @param {string} id Campaign ID
   * @param {{sendAt: number}} params Schedule params
   *
   * @return {Campaign} Scheduled Campaign
   */
  async scheduleCampaign(id: string, params: { sendAt: number }) {
    const { sendAt } = params;
    const { campaign } = await this.patch<{ campaign: Campaign }>(
      this.baseURL + `/campaigns/${id}/schedule`,
      { send_at: sendAt },
    );
    return campaign;
  }

  /**
   * stopCampaign - Stop a Campaign
   *
   * @param {string} id Campaign ID
   *
   * @return {Campaign} Stopped Campaign
   */
  async stopCampaign(id: string) {
    const { campaign } = await this.patch<{ campaign: Campaign }>(
      this.baseURL + `/campaigns/${id}/stop`,
    );
    return campaign;
  }

  /**
   * resumeCampaign - Resume a Campaign
   *
   * @param {string} id Campaign ID
   *
   * @return {Campaign} Resumed Campaign
   */
  async resumeCampaign(id: string) {
    const { campaign } = await this.patch<{ campaign: Campaign }>(
      this.baseURL + `/campaigns/${id}/resume`,
    );
    return campaign;
  }

  /**
   * testCampaign - Test a Campaign
   *
   * @param {string} id Campaign ID
   * @param {{users: string[]}} params Test params
   * @return {Campaign} Test Campaign
   */
  async testCampaign(id: string, params: { users: string[] }) {
    const { users } = params;
    const { campaign } = await this.post<{ campaign: Campaign }>(
      this.baseURL + `/campaigns/${id}/test`,
      { users },
    );
    return campaign;
  }
}
