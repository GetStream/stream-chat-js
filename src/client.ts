/* eslint no-unused-vars: "off" */
/* global process */

import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import axios from 'axios';
import https from 'https';

import { Channel } from './channel';
import { ClientState } from './client_state';
import { StableWSConnection } from './connection';
import { UploadManager } from './uploadManager';
import { TokenManager, type TokenManagerMinimalUser } from './token_manager';
import { WSConnectionFallback } from './connection_fallback';
import { isWSFailure } from './errors';
import { ApiClient } from './api-client';
import {
  axiosParamsSerializer,
  generateChannelTempCid,
  getEnv,
  isFunction,
  isOnline,
  isOwnUserBaseProperty,
  messageSetPagination,
  normalizeQuerySort,
  randomId,
} from './utils';

import type {
  ActiveLiveLocationsAPIResponse,
  AddUserGroupMembersOptions,
  AddUserGroupMembersResponse,
  APIResponse,
  BannedUsersFilters,
  BannedUsersPaginationOptions,
  BannedUsersSort,
  BanUserOptions,
  BaseDeviceFields,
  ChannelAPIResponse,
  ChannelData,
  ChannelFilters,
  ChannelMute,
  ChannelOptions,
  ChannelResponse,
  ChannelSort,
  ChannelStateOptions,
  CombinedEvents,
  Configs,
  ConnectAPIResponse,
  CreatePollData,
  CreateReminderOptions,
  CreateUserGroupOptions,
  CreateUserGroupResponse,
  DeleteMessageOptions,
  DeleteUserGroupOptions,
  DeviceIdentifier,
  DraftFilters,
  DraftSort,
  EventHandler,
  FlagMessageResponse,
  FlagUserResponse,
  GetMessageOptions,
  GetThreadAPIResponse,
  GetThreadOptions,
  GetUserGroupOptions,
  GetUserGroupResponse,
  LocalMessage,
  Logger,
  MarkChannelsReadOptions,
  MarkDeliveredOptions,
  MessageFilters,
  MessageFlagsFilters,
  MessageFlagsPaginationOptions,
  MessageResponse,
  Mute,
  MuteUserOptions,
  MuteUserResponse,
  OwnUserResponse,
  Pager,
  PartialMessageUpdate,
  PartialPollUpdate,
  PartialThreadUpdate,
  PartialUserUpdate,
  PollAnswersAPIResponse,
  PollData,
  PollOptionData,
  PollSort,
  PollVoteData,
  PushPreference,
  PushProvider,
  QueryChannelsAPIResponse,
  QueryFutureChannelBansOptions,
  QueryPollsFilters,
  QueryPollsOptions,
  QueryReactionsAPIResponse,
  QueryReactionsOptions,
  QueryRemindersOptions,
  QueryThreadsOptions,
  QueryUserGroupsOptions,
  QueryUserGroupsResponse,
  QueryVotesFilters,
  QueryVotesOptions,
  ReactionFilters,
  ReactionResponse,
  ReactionSort,
  ReminderAPIResponse,
  RemoveUserGroupMembersOptions,
  RemoveUserGroupMembersResponse,
  RequireLiteral,
  SdkIdentifier,
  SearchAPIResponse,
  SearchMessageSortBase,
  SearchOptions,
  SearchPayload,
  SearchUserGroupsOptions,
  SearchUserGroupsResponse,
  StreamChatOptions,
  SyncOptions,
  SyncResponse,
  TokenOrProvider,
  UnBanUserOptions,
  UpdateLocationPayload,
  UpdateMessageAPIResponse,
  UpdateMessageOptions,
  UpdatePollAPIResponse,
  UpdateReminderOptions,
  UpdateUserGroupOptions,
  UpdateUserGroupResponse,
  UpsertPushPreferencesResponse,
  UserFilters,
  UserOptions,
  UserResponse,
  UserSort,
  UserUpdate,
  VoteSort,
} from './types';
import { InsightMetrics, postInsights } from './insights';
import { Thread } from './thread';
import { Moderation } from './moderation';
import { ThreadManager } from './thread_manager';
import { DEFAULT_QUERY_CHANNELS_MESSAGE_LIST_PAGE_SIZE } from './constants';
import { PollManager } from './poll_manager';
import type {
  ChannelManagerEventHandlerOverrides,
  ChannelManagerOptions,
  QueryChannelsRequestType,
} from './channel_manager';
import { ChannelManager } from './channel_manager';
import { MessageDeliveryReporter } from './messageDelivery';
import { NotificationManager } from './notifications';
import { ReminderManager } from './reminders';
import { StateStore } from './store';
import type { MessageComposer } from './messageComposer';
import type { AbstractOfflineDB } from './offline-support';
import { getPendingTaskChannelData } from './offline-support/util';
import { FixedSizeQueueCache } from './utils/FixedSizeQueueCache';
import type {
  GetApplicationResponse as Gen_GetApplicationResponse,
  TranslateMessageRequest as Gen_TranslateMessageRequest,
  UpdateMessageRequest as Gen_UpdateMessageRequest,
  WSEvent,
} from './gen/models';
import { ChatApi } from './gen-imports';
import type { StreamResponse } from './types';

function isString(value: unknown): value is string {
  return typeof value === 'string' || value instanceof String;
}

type MessageComposerTearDownFunction = () => void;

export type QueryChannelsResponseWithChannels = Omit<
  QueryChannelsAPIResponse,
  'channels'
> & {
  channels: Channel[];
};

type MessageComposerSetupFunction = ({
  composer,
}: {
  composer: MessageComposer;
}) => void | MessageComposerTearDownFunction;

export type BlockedUsersState = { userIds: string[] };

export type MessageComposerSetupState = {
  /**
   * Each `MessageComposer` runs this function each time its signature changes or
   * whenever you run `MessageComposer.registerSubscriptions`. Function returned
   * from `applyModifications` will be used as a cleanup function - it will be stored
   * and ran before new modification is applied. Cleaning up only the
   * modified parts is the general way to go but if your setup gets a bit
   * complicated, feel free to restore the whole composer with `MessageComposer.restore`.
   */
  setupFunction: MessageComposerSetupFunction | null;
};

export type ListenerKeys = CombinedEvents['type'] | 'all';

type ClientUser = RequireLiteral<Partial<OwnUserResponse>, 'id'> & { anon?: boolean };

export class StreamChat {
  private static _instance?: unknown | StreamChat; // type is undefined|StreamChat, unknown is due to TS limitations with statics
  api: ApiClient;
  chatApi: ChatApi;
  messageDeliveryReporter: MessageDeliveryReporter;
  /**
   * @internal
   */
  uploadManager: UploadManager;
  /**
   * @private
   */
  _user?: ClientUser;
  appSettingsPromise?: Promise<StreamResponse<Gen_GetApplicationResponse>>;
  activeChannels: {
    [key: string]: Channel;
  };
  threads: ThreadManager;
  polls: PollManager;
  offlineDb?: AbstractOfflineDB;
  notifications: NotificationManager;
  reminders: ReminderManager;
  persistUserOnConnectionFailure?: boolean;
  axiosInstance: AxiosInstance;
  baseURL?: string;
  browser: boolean;
  cleaningIntervalRef?: NodeJS.Timeout;
  clientId?: string;
  configs: Configs;
  key: string;
  listeners: Map<ListenerKeys, Set<EventHandler>>;
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
  /**
   * If true, we will not clean up threads when channel state is in initializing state.
   * The main use case for SDKs who do independent state recovery for channels.
   */
  preventThreadCleanup = false;
  moderation: Moderation;
  mutedChannels: ChannelMute[];
  mutedUsers: Mute[];
  blockedUsers: StateStore<BlockedUsersState>;
  node: boolean;
  options: StreamChatOptions;
  secret?: string;
  setUserPromise: ConnectAPIResponse | null;
  state: ClientState;
  tokenManager: TokenManager;
  user?: ClientUser;
  userAgent?: string;
  wsBaseURL?: string;
  wsConnection: StableWSConnection | null;
  wsFallback?: WSConnectionFallback;
  wsPromise: ConnectAPIResponse | null;
  get anonymous(): boolean {
    return this.user?.anon ?? false;
  }
  get userId() {
    return this.user?.id;
  }
  /**
   * @deprecated Use `userId` instead.
   */
  get userID() {
    return this.user?.id;
  }
  /**
   * @deprecated Use `clientId` instead.
   */
  get clientID() {
    return this.clientId;
  }
  set clientID(id: string | undefined) {
    this.clientId = id;
  }
  insightMetrics: InsightMetrics;
  defaultWSTimeoutWithFallback: number;
  defaultWSTimeout: number;
  sdkIdentifier?: SdkIdentifier;
  deviceIdentifier?: DeviceIdentifier;
  readonly messageComposerCache: FixedSizeQueueCache<string, MessageComposer>;
  /**
   * @private
   */
  _messageComposerSetupState = new StateStore<MessageComposerSetupState>({
    setupFunction: null,
  });

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
    this.listeners = new Map();
    this.state = new ClientState({ client: this });
    // a list of channels to hide ws events from
    this.mutedChannels = [];
    this.mutedUsers = [];
    this.blockedUsers = new StateStore<BlockedUsersState>({ userIds: [] });

    this.moderation = new Moderation(this);

    this.notifications = options?.notifications ?? new NotificationManager();
    this.uploadManager = new UploadManager(this);

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
      warmUp: false,
      recoverStateOnReconnect: true,
      disableCache: false,
      wsUrlParams: new URLSearchParams({}),
      ...inputOptions,
    };

    this.axiosInstance = axios.create({
      timeout: 3000,
      withCredentials: false,
      httpsAgent: this.node
        ? new https.Agent({ keepAlive: true, keepAliveMsecs: 3000 })
        : undefined,
      ...this.options.axiosRequestConfig,
      paramsSerializer: axiosParamsSerializer,
    });

    this.setBaseURL(this.options.baseURL || 'https://chat.stream-io-api.com');

    const streamLocalTestRun = getEnv('STREAM_LOCAL_TEST_RUN');
    const streamLocalTestHost = getEnv('STREAM_LOCAL_TEST_HOST');
    if (streamLocalTestRun) {
      this.setBaseURL('http://localhost:3030');
    }
    if (streamLocalTestHost) {
      this.setBaseURL(`http://${streamLocalTestHost}`);
    }

    // WS connection is initialized when setUser is called
    this.wsConnection = null;
    this.wsPromise = null;
    this.setUserPromise = null;
    // keeps a reference to all the channels that are in use
    this.activeChannels = {};

    // mapping between channel groups and configs
    this.configs = {};
    this.persistUserOnConnectionFailure = this.options?.persistUserOnConnectionFailure;

    // If its a server-side client, then lets initialize the tokenManager, since token will be
    // generated from secret.
    this.tokenManager = new TokenManager(this.secret);
    this.insightMetrics = new InsightMetrics();

    this.defaultWSTimeoutWithFallback = 6 * 1000;
    this.defaultWSTimeout = 15 * 1000;

    this.api = new ApiClient(this);
    this.chatApi = new ChatApi(this.api);

    /**
     * logger function should accept 3 parameters:
     * @param logLevel string
     * @param message   string
     * @param extraData object
     *
     * e.g.,
     * const client = new StreamChat('api_key', {}, {
     *    logger = (logLevel, message, extraData) => {
     *      console.log(message);
     *    }
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
     *    tags: ['api', 'api_request', 'client'],
     *    url: string,
     *    payload: object,
     *    config: object
     * }
     * 2. {
     *    tags: ['api', 'api_response', 'client'],
     *    url: string,
     *    response: object
     * }
     * 3. {
     *    tags: ['api', 'api_response', 'client'],
     *    url: string,
     *    error: object
     * }
     * 4. {
     *    tags: ['event', 'client'],
     *    event: object
     * }
     * 5. {
     *    tags: ['channel'],
     *    channel: object
     * }
     */
    this.logger = isFunction(inputOptions.logger) ? inputOptions.logger : () => null;
    this.recoverStateOnReconnect = this.options.recoverStateOnReconnect;
    this.threads = new ThreadManager({ client: this });
    this.polls = new PollManager({ client: this });
    this.reminders = new ReminderManager({ client: this });
    this.messageDeliveryReporter = new MessageDeliveryReporter({ client: this });
    this.messageComposerCache = new FixedSizeQueueCache<string, MessageComposer>(64);
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
  public static getInstance(key: string, options?: StreamChatOptions): StreamChat;
  public static getInstance(
    key: string,
    secret?: string,
    options?: StreamChatOptions,
  ): StreamChat;
  public static getInstance(
    key: string,
    secretOrOptions?: StreamChatOptions | string,
    options?: StreamChatOptions,
  ): StreamChat {
    if (!StreamChat._instance) {
      if (typeof secretOrOptions === 'string') {
        StreamChat._instance = new StreamChat(key, secretOrOptions, options);
      } else {
        StreamChat._instance = new StreamChat(key, secretOrOptions);
      }
    }

    return StreamChat._instance as StreamChat;
  }

  setOfflineDBApi(offlineDBInstance: AbstractOfflineDB) {
    if (this.offlineDb) {
      return;
    }

    this.offlineDb = offlineDBInstance;
  }

  getAuthType() {
    return this.anonymous ? 'anonymous' : 'jwt';
  }

  setBaseURL(baseURL: string) {
    this.baseURL = baseURL;
    this.wsBaseURL = this.baseURL.replace('http', 'ws').replace(':3030', ':8800');
  }

  _getConnectionID = () =>
    this.wsConnection?.connectionID || this.wsFallback?.connectionID;

  _hasConnectionID = () => Boolean(this._getConnectionID());

  public setMessageComposerSetupFunction = (
    setupFunction: MessageComposerSetupState['setupFunction'],
  ) => {
    this._messageComposerSetupState.partialNext({ setupFunction });
  };

  /**
   * connectUser - Set the current user and open a WebSocket connection
   *
   * @param {OwnUserResponse | UserResponse} user Data about this user. IE {name: "john"}
   * @param {TokenOrProvider} userTokenOrProvider Token or provider
   *
   * @return {ConnectAPIResponse} Returns a promise that resolves when the connection is setup
   */
  connectUser = async (
    user: OwnUserResponse | UserResponse,
    userTokenOrProvider: TokenOrProvider,
  ) => {
    if (!user.id) {
      throw new Error('The "id" field on the user is missing');
    }

    /**
     * Calling connectUser multiple times is potentially the result of a  bad integration, however,
     * If the user id remains the same we don't throw error
     */
    if (this.userId === user.id && this.setUserPromise) {
      console.warn(
        'Consecutive calls to connectUser is detected, ideally you should only call this function once in your app.',
      );
      return this.setUserPromise;
    }

    if (this.userId) {
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

    const setTokenPromise = this._setToken(user, userTokenOrProvider);
    this._setUser(user);

    const wsPromise = this.openConnection();

    this.setUserPromise = Promise.all([setTokenPromise, wsPromise]).then(
      (result) => result[1], // We only return connection promise;
    );

    try {
      return await this.setUserPromise;
    } catch (err) {
      if (this.persistUserOnConnectionFailure) {
        // cleanup client to allow the user to retry connectUser again
        this.closeConnection();
      } else {
        this.disconnectUser();
      }
      throw err;
    }
  };

  /**
   * @deprecated Please use connectUser() function instead. Its naming is more consistent with its functionality.
   *
   * setUser - Set the current user and open a WebSocket connection
   *
   * @param {OwnUserResponse | UserResponse} user Data about this user. IE {name: "john"}
   * @param {TokenOrProvider} userTokenOrProvider Token or provider
   *
   * @return {ConnectAPIResponse} Returns a promise that resolves when the connection is setup
   */
  setUser = this.connectUser;

  _setToken = (user: TokenManagerMinimalUser, userTokenOrProvider: TokenOrProvider) =>
    this.tokenManager.setTokenOrProvider(userTokenOrProvider, user);

  _setUser(user: TokenManagerMinimalUser) {
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
  closeConnection = async (timeout?: number) => {
    if (this.cleaningIntervalRef != null) {
      clearInterval(this.cleaningIntervalRef);
      this.cleaningIntervalRef = undefined;
    }

    await Promise.all([
      this.wsConnection?.disconnect(timeout),
      this.wsFallback?.disconnect(timeout),
    ]);

    this.offlineDb?.executeQuerySafely(
      async (db) => {
        if (this.userId) {
          await db.upsertUserSyncStatus({
            userId: this.userId,
            lastSyncedAt: new Date().toString(),
          });
        }
      },
      { method: 'upsertUserSyncStatus' },
    );

    return Promise.resolve();
  };

  /**
   * Creates an instance of ChannelManager.
   *
   * @internal
   *
   * @param eventHandlerOverrides - the overrides for event handlers to be used
   * @param options - the options used for the channel manager
   */
  createChannelManager = ({
    eventHandlerOverrides = {},
    options = {},
    queryChannelsOverride,
  }: {
    eventHandlerOverrides?: ChannelManagerEventHandlerOverrides;
    options?: ChannelManagerOptions;
    queryChannelsOverride?: QueryChannelsRequestType;
  }) =>
    new ChannelManager({
      client: this,
      eventHandlerOverrides,
      options,
      queryChannelsOverride,
    });

  /**
   * Creates a new WebSocket connection with the current user. Returns empty promise, if there is an active connection
   */
  openConnection = () => {
    if (!this.userId) {
      throw Error(
        'User is not set on client, use client.connectUser or client.connectAnonymousUser instead',
      );
    }

    if (this.wsConnection?.isConnecting && this.wsPromise) {
      this.logger('info', 'client:openConnection() - connection already in progress', {
        tags: ['connection', 'client'],
      });
      return this.wsPromise;
    }

    if (
      (this.wsConnection?.isHealthy || this.wsFallback?.isHealthy()) &&
      this._hasConnectionID()
    ) {
      this.logger(
        'info',
        'client:openConnection() - openConnection called twice, healthy connection already exists',
        {
          tags: ['connection', 'client'],
        },
      );

      return;
    }

    this.clientId = `${this.userId}--${randomId()}`;
    this.wsPromise = this.connect();
    this._startCleaning();
    return this.wsPromise;
  };
  /**
   * Revokes tokens for a connected user issued before given time
   */
  async revokeTokens(before?: Date | null) {
    if (!before) {
      before = new Date();
    }

    const users: PartialUserUpdate[] = [
      {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        id: this.userId!,
        set: {
          revoke_tokens_issued_before: before,
        },
      },
    ];

    return await this.partialUpdateUsers(users);
  }

  /**
   * getAppSettings - retrieves application settings
   */
  async getAppSettings() {
    return await (this.appSettingsPromise = this.chatApi.getApp());
  }

  /**
   * Disconnects the websocket and removes the user from client.
   *
   * @param timeout Max number of ms, to wait for close event of websocket, before forcefully assuming successful disconnection.
   *                https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent
   */
  disconnectUser = (timeout?: number) => {
    this.logger('info', 'client:disconnect() - Disconnecting the client', {
      tags: ['connection', 'client'],
    });

    // remove the user specific fields
    delete this.user;
    delete this._user;

    const closePromise = this.closeConnection(timeout);

    for (const channel of Object.values(this.activeChannels)) {
      channel._disconnect();
    }
    // ensure we no longer return inactive channels
    this.activeChannels = {};
    // reset client state
    this.state = new ClientState({ client: this });
    // reset thread manager
    this.threads.resetState();
    this.uploadManager.reset();
    this.messageComposerCache.clear();

    // Since we wipe all user data already, we should reset token manager as well
    closePromise
      .finally(() => {
        this.tokenManager.reset();
      })
      .catch((err) => console.error(err));

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

    const anonymousUser = {
      id: randomId(),
      anon: true,
    } satisfies TokenManagerMinimalUser;

    this._setToken(anonymousUser, '');
    this._setUser(anonymousUser);

    return this.openConnection();
  };

  /**
   * setGuestUser - Setup a temporary guest user
   *
   * @param {UserResponse} user Data about this user. IE {name: "john"}
   *
   * @return {ConnectAPIResponse} Returns a promise that resolves when the connection is setup
   */
  async setGuestUser(user: UserResponse) {
    const response = await this.chatApi.createGuest({ user });

    const {
      created_at: _created_at,
      updated_at: _updated_at,
      last_active: _last_active,
      online: _online,
      ...guestUser
    } = response.user;
    return await this.connectUser(guestUser as UserResponse, response.access_token);
  }

  /**
   * on - Listen to events on all channels and users your watching
   *
   * client.on('message.new', event => {console.log("my new message", event, channel.state.messages)})
   * or
   * client.on(event => {console.log(event.type)})
   *
   * @param {EventHandler | string} callbackOrString  The event type to listen for (optional)
   * @param {EventHandler} [callbackOrNothing] The callback to call
   *
   * @return {{ unsubscribe: () => void }} Description
   */
  on(callback: EventHandler): { unsubscribe: () => void };
  on<T extends ListenerKeys | string>(
    eventType: T,
    callback: EventHandler<T>,
  ): { unsubscribe: () => void };
  on(
    callbackOrString: EventHandler | string,
    callbackOrNothing?: EventHandler,
  ): { unsubscribe: () => void } {
    const key = callbackOrNothing ? (callbackOrString as ListenerKeys) : 'all';
    const callback = callbackOrNothing
      ? callbackOrNothing
      : (callbackOrString as EventHandler);

    const set = this.listeners.get(key) ?? new Set();

    this.logger('info', `Attaching listener for ${key} event`, {
      tags: ['event', 'client'],
    });
    set.add(callback);

    if (!this.listeners.has(key)) {
      this.listeners.set(key, set);
    }

    return {
      unsubscribe: () => {
        this.logger('info', `Removing listener for ${key} event`, {
          tags: ['event', 'client'],
        });
        set.delete(callback);
        if (!set.size) {
          this.listeners.delete(key);
        }
      },
    };
  }

  /**
   * off - Remove the event handler
   *
   */
  off(callback: EventHandler): void;
  off(eventType: string, callback: EventHandler): void;
  off(callbackOrString: EventHandler | string, callbackOrNothing?: EventHandler) {
    const key = callbackOrNothing ? (callbackOrString as ListenerKeys) : 'all';
    const callback = callbackOrNothing
      ? callbackOrNothing
      : (callbackOrString as EventHandler);

    this.logger('info', `Removing listener for ${key} event`, {
      tags: ['event', 'client'],
    });

    const set = this.listeners.get(key);

    set?.delete(callback);

    if (!set?.size) {
      this.listeners.delete(key);
    }
  }

  dispatchEvent = (event: CombinedEvents) => {
    if (!event.received_at) event.received_at = new Date();

    // client event handlers
    const postListenerCallbacks = this._handleClientEvent(event as WSEvent);

    // channel event handlers
    const cid = (event as Extract<CombinedEvents, { cid?: any }>).cid;
    const channel = cid ? this.activeChannels[cid] : undefined;
    if (channel) {
      channel._handleChannelEvent(event as WSEvent);
    }

    this._callClientListeners(event);

    if (channel) {
      channel._callChannelListeners(event as WSEvent);
    }

    postListenerCallbacks.forEach((c) => c());

    this.offlineDb?.executeQuerySafely((db) => db.handleEvent({ event }), {
      method: `handleEvent;${event.type}`,
    });
  };

  /**
   * Updates the members, watchers and read references of the currently active channels that contain this user
   *
   * @param {UserResponse} user
   */
  _updateMemberWatcherReferences = (user: UserResponse) => {
    const refMap = this.state.userChannelReferences[user.id] || {};
    for (const channelID in refMap) {
      const channel = this.activeChannels[channelID];
      if (channel?.state) {
        if (channel.state.members[user.id]) {
          channel.state.members[user.id].user = user;
        }
        if (channel.state.watchers[user.id]) {
          channel.state.watchers[user.id] = user;
        }
        if (channel.state.read[user.id]) {
          channel.state.read[user.id].user = user;
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
   * @param {UserResponse} user
   */
  _updateUserMessageReferences = (user: UserResponse) => {
    const refMap = this.state.userChannelReferences[user.id] || {};

    for (const channelID in refMap) {
      const channel = this.activeChannels[channelID];

      if (!channel) continue;

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
   * @param {UserResponse} user
   * @param {boolean} hardDelete
   */
  _deleteUserMessageReference = (
    user: UserResponse,
    hardDelete = false,
    deletedAt?: LocalMessage['deleted_at'],
  ) => {
    const refMap = this.state.userChannelReferences[user.id] || {};

    for (const channelID in refMap) {
      const channel = this.activeChannels[channelID];
      if (channel) {
        const state = channel.state;

        /** deleted the messages from this user. */
        state?.deleteUserMessages(user, hardDelete, deletedAt);
      }
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
    event: Extract<
      WSEvent,
      { type: 'user.presence.changed' | 'user.updated' | 'user.deleted' }
    >,
  ) => {
    if (!event.user) {
      return;
    }

    /** update the client.state with any changes to users */
    if (event.type === 'user.presence.changed' || event.type === 'user.updated') {
      if (event.user.id === this.userId) {
        const user = { ...this.user } as NonNullable<StreamChat['user']>;
        const _user = { ...this._user } as NonNullable<StreamChat['_user']>;

        // Remove deleted properties from user objects.
        for (const key in this.user) {
          if (key in event.user || isOwnUserBaseProperty(key)) {
            continue;
          }

          const deleteKey = key as keyof typeof user;

          delete user[deleteKey];
          delete _user[deleteKey];
        }

        /** Updating only available properties in _user object. */
        for (const key in _user) {
          const updateKey = key as keyof typeof _user;

          if (updateKey in event.user) {
            // @ts-expect-error it has an issue with this, not sure why
            _user[updateKey] = event.user[updateKey];
          }
        }

        this._user = _user;
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
      this._deleteUserMessageReference(
        event.user,
        event.hard_delete,
        event.user.deleted_at,
      );
    }
  };

  _handleClientEvent(event: WSEvent) {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
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

    if (event.type === 'user.messages.deleted' && !event.cid && event.user) {
      this._deleteUserMessageReference(event.user, event.hard_delete, event.created_at);
    }

    if (event.type === 'health.check' && event.me) {
      client.user = event.me;
      client.state.updateUser(event.me);
      client.mutedChannels = event.me.channel_mutes;
      client.mutedUsers = event.me.mutes;
      client.blockedUsers.partialNext({ userIds: event.me.blocked_user_ids ?? [] });
    }

    if (event.type === 'notification.message_new' && event.channel) {
      const { channel } = event;
      this._addChannelConfig(channel);
    }

    if (event.type === 'notification.channel_mutes_updated' && event.me?.channel_mutes) {
      this.mutedChannels = event.me.channel_mutes;
    }

    if (event.type === 'notification.mutes_updated' && event.me?.mutes) {
      this.mutedUsers = event.me.mutes;
    }

    if (event.type === 'notification.mark_read' && event.unread_channels === 0) {
      const activeChannelKeys = Object.keys(this.activeChannels);
      activeChannelKeys.forEach(
        (activeChannelKey) =>
          (this.activeChannels[activeChannelKey].state.unreadCount = 0),
      );
    }

    if (
      (event.type === 'channel.deleted' ||
        event.type === 'notification.channel_deleted') &&
      event.cid
    ) {
      const { cid } = event;
      client.state.deleteAllChannelReference(cid);
      this.activeChannels[event.cid]?._disconnect();

      postListenerCallbacks.push(() => {
        if (!cid) return;

        delete this.activeChannels[cid];
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

  _callClientListeners = (event: CombinedEvents) => {
    const allSet = this.listeners.get('all');
    const targetSet = this.listeners.get(event.type);

    [allSet, targetSet].forEach((set) =>
      set?.forEach((handleEvent) => handleEvent(event)),
    );
  };

  recoverState = async () => {
    this.logger(
      'info',
      `client:recoverState() - Start of recoverState with connectionID ${this._getConnectionID()}`,
      {
        tags: ['connection'],
      },
    );

    const cids = Object.keys(this.activeChannels);
    if (cids.length && this.recoverStateOnReconnect) {
      this.logger(
        'info',
        `client:recoverState() - Start the querying of ${cids.length} channels`,
        {
          tags: ['connection', 'client'],
        },
      );

      await this.queryChannels(
        { cid: { $in: cids } } as ChannelFilters,
        { last_message_at: -1 },
        { limit: 30 },
      );

      this.logger('info', 'client:recoverState() - Querying channels finished', {
        tags: ['connection', 'client'],
      });
      this.dispatchEvent({
        type: 'connection.recovered',
      });
    } else {
      this.dispatchEvent({
        type: 'connection.recovered',
      });
    }

    this.wsPromise = Promise.resolve();
    this.setUserPromise = Promise.resolve();
  };

  /**
   * @private
   */
  async connect() {
    if (!this.userId || !this._user) {
      throw Error(
        'Call connectUser or connectAnonymousUser before starting the connection',
      );
    }
    if (!this.wsBaseURL) {
      throw Error('Property wsBaseURL is not set');
    }
    if (!this.clientId) {
      throw Error('Property clientId is not set');
    }

    if (!this.wsConnection && (this.options.warmUp || this.options.enableInsights)) {
      this._sayHi();
    }
    // The StableWSConnection handles all the reconnection logic.
    if (this.options.wsConnection && this.node) {
      // Intentionally avoiding adding ts generics on wsConnection in options since its only useful for unit test purpose.
      (this.options.wsConnection as unknown as StableWSConnection).setClient(this);
      this.wsConnection = this.options.wsConnection as unknown as StableWSConnection;
    } else {
      this.wsConnection = new StableWSConnection({
        client: this,
      });
    }

    try {
      // if fallback is used before, continue using it instead of waiting for WS to fail
      if (this.wsFallback) {
        return await this.wsFallback.connect();
      }

      // if WSFallback is enabled, ws connect should timeout faster so fallback can try
      return await this.wsConnection.connect(
        this.options.enableWSFallback
          ? this.defaultWSTimeoutWithFallback
          : this.defaultWSTimeout,
      );
    } catch (error: any) {
      // run fallback only if it's WS/Network error and not a normal API error
      // make sure browser is online before even trying the longpoll
      if (this.options.enableWSFallback && isWSFailure(error) && isOnline()) {
        this.logger('info', 'client:connect() - WS failed, fallback to longpoll', {
          tags: ['connection', 'client'],
        });
        this.dispatchEvent({ type: 'transport.changed', mode: 'longpoll' });

        this.wsConnection._destroyCurrentWSConnection();
        this.wsConnection.disconnect().then(); // close WS so no retry
        this.wsFallback = new WSConnectionFallback({
          client: this,
        });
        return await this.wsFallback.connect();
      }

      throw error;
    }
  }

  /**
   * Check the connectivity with server for warmup purpose.
   *
   * @private
   */
  _sayHi() {
    const client_request_id = randomId();
    const opts = { headers: { 'x-client-request-id': client_request_id } };
    this.api.doAxiosRequest('get', this.baseURL + '/hi', null, opts).catch((e) => {
      if (this.options.enableInsights) {
        postInsights('http_hi_failed', {
          api_key: this.key,
          err: e,
          client_request_id,
        });
      }
    });
  }

  /**
   * queryUsers - Query users and watch user presence
   *
   * @param {UserFilters} filterConditions MongoDB style filter conditions
   * @param {UserSort} sort Sort options, for instance [{last_active: -1}].
   * When using multiple fields, make sure you use array of objects to guarantee field order, for instance [{last_active: -1}, {created_at: 1}]
   * @param {UserOptions} options Option object, {presence: true}
   *
   * @return {Promise<{ users: Array<UserResponse> }>} User Query Response
   */
  async queryUsers(
    filterConditions: UserFilters,
    sort: UserSort = [],
    options: UserOptions = {},
  ) {
    const defaultOptions = {
      presence: false,
    };

    // Make sure we wait for the connect promise if there is a pending one
    await this.wsPromise;

    if (!this._hasConnectionID()) {
      defaultOptions.presence = false;
    }

    // Return a list of users
    const data = await this.chatApi.queryUsers({
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
   * queryUserGroups - List user groups with cursor-based pagination.
   *
   * @param {QueryUserGroupsOptions} options The query options
   *
   * @return {Promise<QueryUserGroupsResponse>} User Group Query Response
   */
  async queryUserGroups(options: QueryUserGroupsOptions = {}) {
    return await this.api.get<QueryUserGroupsResponse>(
      this.baseURL + '/usergroups',
      options,
    );
  }

  /**
   * createUserGroup - Create a user group
   *
   * @param {CreateUserGroupOptions} options The create options
   *
   * @return {Promise<CreateUserGroupResponse>} User Group Create Response
   */
  async createUserGroup(options: CreateUserGroupOptions) {
    return await this.api.post<CreateUserGroupResponse>(
      this.baseURL + '/usergroups',
      options,
    );
  }

  /**
   * getUserGroup - Get a user group by ID
   *
   * @param {string} id The user group ID
   * @param {GetUserGroupOptions} options Optional query options
   *
   * @return {Promise<GetUserGroupResponse>} User Group Get Response
   */
  async getUserGroup(id: string, options: GetUserGroupOptions = {}) {
    return await this.api.get<GetUserGroupResponse>(
      `${this.baseURL}/usergroups/${encodeURIComponent(id)}`,
      options,
    );
  }

  /**
   * searchUserGroups - Search user groups by prefix for autocomplete
   *
   * @param {SearchUserGroupsOptions} options The search options
   *
   * @return {Promise<SearchUserGroupsResponse>} User Group Search Response
   */
  async searchUserGroups(options: SearchUserGroupsOptions) {
    return await this.api.get<SearchUserGroupsResponse>(
      this.baseURL + '/usergroups/search',
      options,
    );
  }

  /**
   * updateUserGroup - Update a user group by ID
   *
   * @param {string} id The user group ID
   * @param {UpdateUserGroupOptions} options The update options
   *
   * @return {Promise<UpdateUserGroupResponse>} User Group Update Response
   */
  async updateUserGroup(id: string, options: UpdateUserGroupOptions) {
    return await this.api.put<UpdateUserGroupResponse>(
      `${this.baseURL}/usergroups/${encodeURIComponent(id)}`,
      options,
    );
  }

  /**
   * deleteUserGroup - Delete a user group by ID
   *
   * @param {string} id The user group ID
   * @param {DeleteUserGroupOptions} options Optional query options
   *
   * @return {Promise<APIResponse>} User Group Delete Response
   */
  async deleteUserGroup(id: string, options: DeleteUserGroupOptions = {}) {
    return await this.api.delete<APIResponse>(
      `${this.baseURL}/usergroups/${encodeURIComponent(id)}`,
      options,
    );
  }

  /**
   * addUserGroupMembers - Add members to a user group
   *
   * @param {string} id The user group ID
   * @param {AddUserGroupMembersOptions} options The add-members options
   *
   * @return {Promise<AddUserGroupMembersResponse>} User Group Add Members Response
   */
  async addUserGroupMembers(id: string, options: AddUserGroupMembersOptions) {
    return await this.api.post<AddUserGroupMembersResponse>(
      `${this.baseURL}/usergroups/${encodeURIComponent(id)}/members`,
      options,
    );
  }

  /**
   * removeUserGroupMembers - Remove members from a user group
   *
   * @param {string} id The user group ID
   * @param {RemoveUserGroupMembersOptions} options The remove-members options
   *
   * @return {Promise<RemoveUserGroupMembersResponse>} User Group Remove Members Response
   */
  async removeUserGroupMembers(id: string, options: RemoveUserGroupMembersOptions) {
    return await this.api.post<RemoveUserGroupMembersResponse>(
      `${this.baseURL}/usergroups/${encodeURIComponent(id)}/members/delete`,
      options,
    );
  }

  /**
   * queryBannedUsers - Query user bans
   *
   * @param {BannedUsersFilters} filterConditions MongoDB style filter conditions
   * @param {BannedUsersSort} sort Sort options [{created_at: 1}].
   * @param {BannedUsersPaginationOptions} options Option object, {limit: 10, offset:0, exclude_expired_bans: true}
   *
   * @return {Promise<BannedUsersResponse>} Ban Query Response
   */
  async queryBannedUsers(
    filterConditions: BannedUsersFilters = {},
    sort: BannedUsersSort = [],
    options: BannedUsersPaginationOptions = {},
  ) {
    // Return a list of user bans
    return await this.chatApi.queryBannedUsers({
      payload: {
        filter_conditions: filterConditions,
        sort: normalizeQuerySort(sort),
        ...options,
      },
    });
  }

  /**
   * queryFutureChannelBans - Query future channel bans created by a user
   *
   * @param {QueryFutureChannelBansOptions} options Option object with user_id, exclude_expired_bans, limit, offset
   * @returns {Promise<FutureChannelBansResponse>} Future Channel Bans Response
   */
  async queryFutureChannelBans(options: QueryFutureChannelBansOptions = {}) {
    return await this.chatApi.queryFutureChannelBans({
      payload: options,
    });
  }

  /**
   * queryMessageFlags - Query message flags
   *
   * @param {MessageFlagsFilters} filterConditions MongoDB style filter conditions
   * @param {MessageFlagsPaginationOptions} options Option object, {limit: 10, offset:0}
   *
   * @return {Promise<MessageFlagsResponse>} Message Flags Response
   */
  async queryMessageFlags(
    filterConditions: MessageFlagsFilters = {},
    options: MessageFlagsPaginationOptions = {},
  ) {
    // Return a list of message flags
    return await this.chatApi.queryMessageFlags({
      payload: {
        filter_conditions: filterConditions,
        ...options,
      },
    });
  }

  /**
   * queryChannelsRequestWithResponse - Queries channels and returns the full API response
   * including top-level metadata such as `predefined_filter`.
   *
   * This exists as a compatibility bridge, as changing `queryChannelsRequest()` to return
   * `QueryChannelsAPIResponse` would be a breaking change because it currently returns
   * only the channel list. In the next major release, the request/response APIs should
   * be consolidated so callers can access the full response through the primary API.
   *
   * @param {ChannelFilters} filterConditions object MongoDB style filters. Can be empty object when using predefined_filter in options.
   * @param {ChannelSort} [sort] Sort options, for instance {created_at: -1}.
   * When using multiple fields, make sure you use array of objects to guarantee field order, for instance [{last_updated: -1}, {created_at: 1}]
   * @param {ChannelOptions} [options] Options object. Can include predefined_filter, filter_values, and sort_values for using predefined filters.
   *
   * @return {Promise<QueryChannelsAPIResponse>} full search channels response
   */
  async queryChannelsRequestWithResponse(
    filterConditions: ChannelFilters,
    sort: ChannelSort = [],
    options: ChannelOptions = {},
  ) {
    const defaultOptions: ChannelOptions = {
      state: true,
      watch: true,
      presence: false,
    };

    // Make sure we wait for the connect promise if there is a pending one
    await this.wsPromise;
    if (!this._hasConnectionID()) {
      defaultOptions.watch = false;
    }

    const { predefined_filter, filter_values, sort_values, ...restOptions } = options;
    const normalizedSort = normalizeQuerySort(sort);

    // Build payload based on whether we're using a predefined filter or traditional filters
    const payload = predefined_filter
      ? {
          predefined_filter,
          filter_values,
          sort_values,
          sort: normalizedSort,
          ...defaultOptions,
          ...restOptions,
        }
      : {
          filter_conditions: filterConditions,
          sort: normalizedSort,
          ...defaultOptions,
          ...restOptions,
        };

    return await this.chatApi.queryChannels(payload);
  }

  /**
   * queryChannelsRequest - Queries channels and returns the raw channel response list.
   *
   * This preserves the historical return shape for backwards compatibility. Use
   * `queryChannelsRequestWithResponse()` when response level metadata such as
   * `predefined_filter` is needed. In the next major release these APIs should be
   * consolidated into a single full-response API.
   *
   * @param {ChannelFilters} filterConditions object MongoDB style filters. Can be empty object when using predefined_filter in options.
   * @param {ChannelSort} [sort] Sort options, for instance {created_at: -1}.
   * When using multiple fields, make sure you use array of objects to guarantee field order, for instance [{last_updated: -1}, {created_at: 1}]
   * @param {ChannelOptions} [options] Options object. Can include predefined_filter, filter_values, and sort_values for using predefined filters.
   *
   * @return {Promise<Array<ChannelAPIResponse>>} search channels response
   */
  async queryChannelsRequest(
    filterConditions: ChannelFilters,
    sort: ChannelSort = [],
    options: ChannelOptions = {},
  ) {
    const data = await this.queryChannelsRequestWithResponse(
      filterConditions,
      sort,
      options,
    );

    // FIXME: In the next major release, return the full QueryChannelsAPIResponse
    // instead of only `data.channels` so top-level metadata such as
    // `predefined_filter` is not lost.
    return data.channels;
  }

  /**
   * queryChannels - Query channels
   *
   * @param {ChannelFilters} filterConditions object MongoDB style filters
   * @param {ChannelSort} [sort] Sort options, for instance {created_at: -1}.
   * When using multiple fields, make sure you use array of objects to guarantee field order, for instance [{last_updated: -1}, {created_at: 1}]
   * @param {ChannelOptions} [options] Options object
   * @param {ChannelStateOptions} [stateOptions] State options object. These options will only be used for state management and won't be sent in the request.
   * - stateOptions.skipInitialization - Skips the initialization of the state for the channels matching the ids in the list.
   * - stateOptions.skipHydration - Skips returning the channels as instances of the Channel class and rather returns the raw query response.
   * - stateOptions.withResponse - Returns the full query response with hydrated channels. This is a compatibility bridge for internal callers that need response-level metadata while the default return value remains `Channel[]`.
   *
   * @return {Promise<Array<Channel>>} search channels response
   */
  async queryChannels(
    filterConditions: ChannelFilters,
    sort: ChannelSort,
    options: ChannelOptions,
    stateOptions: ChannelStateOptions & { withResponse: true },
  ): Promise<QueryChannelsResponseWithChannels>;
  async queryChannels(
    filterConditions?: ChannelFilters,
    sort?: ChannelSort,
    options?: ChannelOptions,
    stateOptions?: ChannelStateOptions,
  ): Promise<Channel[]>;
  async queryChannels(
    filterConditions: ChannelFilters,
    sort: ChannelSort = [],
    options: ChannelOptions = {},
    stateOptions: ChannelStateOptions = {},
  ): Promise<Channel[] | QueryChannelsResponseWithChannels> {
    const queryChannelsResponse = await this.queryChannelsRequestWithResponse(
      filterConditions,
      sort,
      options,
    );
    const channels = queryChannelsResponse.channels;

    this.dispatchEvent({
      type: 'channels.queried',
      queriedChannels: {
        channels,
        isLatestMessageSet: true,
      },
    });
    if (channels?.length && this.offlineDb?.upsertChannels) {
      await this.offlineDb.upsertChannels({
        channels,
        isLatestMessagesSet: true,
      });
    }

    const hydratedChannels = this.hydrateActiveChannels(channels, stateOptions, options);

    if (stateOptions.withResponse) {
      return {
        ...queryChannelsResponse,
        channels: hydratedChannels,
      };
    }

    return hydratedChannels;
  }

  /**
   * queryReactions - Query reactions
   *
   * @param {ReactionFilters} filter object MongoDB style filters
   * @param {ReactionSort} [sort] Sort options, for instance {created_at: -1}.
   * @param {QueryReactionsOptions} [options] Pagination object
   *
   * @return {Promise<{ QueryReactionsAPIResponse } search channels response
   */
  async queryReactions(
    messageId: string,
    filter: ReactionFilters,
    sort: ReactionSort = [],
    options: QueryReactionsOptions = {},
  ) {
    const payload = {
      filter,
      sort: normalizeQuerySort(sort),
      ...options,
    };

    if (this.offlineDb?.getReactions && !options.next) {
      try {
        const reactionsFromDb = await this.offlineDb.getReactions({
          messageId,
          filters: filter,
          sort,
          limit: options.limit,
        });

        if (reactionsFromDb) {
          this.dispatchEvent({
            type: 'offline_reactions.queried',
            offlineReactions: reactionsFromDb as ReactionResponse[],
          });
        }
      } catch (e) {
        this.logger('warn', 'An error has occurred while querying offline reactions', {
          error: e,
        });
      }
    }

    // Make sure we wait for the connect promise if there is a pending one
    await this.wsPromise;

    return await this.chatApi.queryReactions({
      id: messageId,
      ...payload,
    });
  }

  hydrateActiveChannels(
    channelsFromApi: ChannelAPIResponse[] = [],
    stateOptions: ChannelStateOptions = {},
    queryChannelsOptions?: ChannelOptions,
  ) {
    const { skipInitialization, offlineMode = false } = stateOptions;
    const channels: Channel[] = [];

    for (const channelState of channelsFromApi) {
      if (!channelState.channel) continue;

      this._addChannelConfig(channelState.channel);
      const c = this.channel(channelState.channel.type, channelState.channel.id);
      c.data = channelState.channel;
      c.offlineMode = offlineMode;
      c.initialized = !offlineMode;
      c.push_preferences = channelState.push_preferences;

      let updatedMessagesSet;
      let filteredMessageIds: string[] = [];
      if (skipInitialization === undefined) {
        const { messageSet, filteredMessageIds: _filteredMessageIds } =
          c._initializeState(channelState, 'latest');
        filteredMessageIds = _filteredMessageIds;
        updatedMessagesSet = messageSet;
      } else if (!skipInitialization.includes(channelState.channel.id)) {
        c.state.clearMessages();
        const { messageSet, filteredMessageIds: _filteredMessageIds } =
          c._initializeState(channelState, 'latest');
        filteredMessageIds = _filteredMessageIds;
        updatedMessagesSet = messageSet;
      }

      if (updatedMessagesSet) {
        updatedMessagesSet.pagination = {
          ...updatedMessagesSet.pagination,
          ...messageSetPagination({
            parentSet: updatedMessagesSet,
            requestedPageSize:
              queryChannelsOptions?.message_limit ||
              DEFAULT_QUERY_CHANNELS_MESSAGE_LIST_PAGE_SIZE,
            returnedPage: channelState.messages,
            filteredReturnedPage: channelState.messages.filter(
              (m) => !filteredMessageIds.includes(m.id),
            ),
            logger: this.logger,
          }),
        };
        this.polls.hydratePollCache(channelState.messages, true);
        this.reminders.hydrateState(channelState.messages);
      }

      c.messageComposer.initStateFromChannelResponse(channelState);
      c.cooldownTimer.refresh();
      channels.push(c);
    }
    this.syncDeliveredCandidates(channels);
    return channels;
  }

  /**
   * search - Query messages
   *
   * @param {ChannelFilters} filterConditions MongoDB style filter conditions
   * @param {MessageFilters | string} query search query or object MongoDB style filters
   * @param {SearchOptions} [options] Option object, {user_id: 'tommaso'}
   *
   * @return {Promise<SearchAPIResponse>} search messages response
   */
  async search(
    filterConditions: SearchPayload['filter_conditions'],
    query: string | MessageFilters,
    options: SearchOptions = {},
  ) {
    if (options.offset && options.next) {
      throw Error(`Cannot specify offset with next`);
    }
    const payload: SearchPayload = {
      filter_conditions: filterConditions,
      ...options,
      sort: options.sort
        ? normalizeQuerySort<SearchMessageSortBase>(options.sort)
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
    await this.wsPromise;

    return await this.api.get<SearchAPIResponse>(this.baseURL + '/search', { payload });
  }

  /**
   * setLocalDevice - Set the device info for the current client(device) that will be sent via WS connection automatically
   *
   * @param {BaseDeviceFields} device the device object
   * @param {string} device.id device id
   * @param {string} device.push_provider the push provider
   *
   */
  setLocalDevice(device: BaseDeviceFields) {
    if (
      (this.wsConnection?.isConnecting && this.wsPromise) ||
      ((this.wsConnection?.isHealthy || this.wsFallback?.isHealthy()) &&
        this._hasConnectionID())
    ) {
      throw new Error('you can only set device before opening a websocket connection');
    }

    this.options.device = device;
  }

  /**
   * addDevice - Adds a push device for a user.
   *
   * @param {string} id the device id
   * @param {PushProvider} pushProvider the push provider
   * @param {string} [pushProviderName] user provided push provider name for multi bundle support
   *
   */
  async addDevice(id: string, pushProvider: PushProvider, pushProviderName?: string) {
    return await this.chatApi.createDevice({
      id,
      push_provider: pushProvider,
      ...(pushProviderName != null ? { push_provider_name: pushProviderName } : {}),
    });
  }

  /**
   * getDevices - Returns the devices associated with a current user
   *
   * @return {Device[]} Array of devices
   */
  async getDevices() {
    return await this.chatApi.listDevices();
  }

  /**
   * getUnreadCount - Returns unread counts for a single user
   *
   * @return {<GetUnreadCountAPIResponse>}
   */
  async getUnreadCount() {
    return await this.chatApi.unreadCounts();
  }

  /**
   * setPushPreferences - Applies the list of push preferences.
   *
   * @param {PushPreference[]} A list of push preferences.
   *
   * @return {<UpsertPushPreferencesResponse>}
   */
  async setPushPreferences(preferences: PushPreference[]) {
    return await this.chatApi.updatePushNotificationPreferences({
      preferences,
    });
  }

  /**
   * removeDevice - Removes the device with the given id. Clientside users can only delete their own devices
   *
   * @param {string} id The device id
   * @param {string} [userID] The user id. Only specify this for serverside requests
   *
   */
  async removeDevice(id: string) {
    return await this.chatApi.deleteDevice({ id });
  }

  _addChannelConfig({ cid, config }: ChannelResponse) {
    if (this._cacheEnabled()) {
      this.configs[cid] = config;
    }
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
   * @param {string | ChannelData | null} [channelIDOrCustom]   The channel ID, you can leave this out if you want to create a conversation channel
   * @param {object} [custom]    Custom data to attach to the channel
   *
   * @return {channel} The channel object, initialize it using channel.watch()
   */
  channel(channelType: string, channelId?: string | null, custom?: ChannelData): Channel;
  channel(channelType: string, custom?: ChannelData): Channel;
  channel(
    channelType: string,
    channelIdOrCustom?: string | ChannelData | null,
    custom: ChannelData = {},
  ) {
    if (!this.userId && !this._isUsingServerAuth()) {
      throw Error('Call connectUser or connectAnonymousUser before creating a channel');
    }

    if (~channelType.indexOf(':')) {
      throw new Error(
        `Invalid channel group ${channelType}, can't contain the : character`,
      );
    }

    // support channel("messaging", {options})
    if (channelIdOrCustom && typeof channelIdOrCustom === 'object') {
      return this.getChannelByMembers(channelType, channelIdOrCustom);
    }

    // support channel("messaging", undefined, {options})
    if (!channelIdOrCustom && typeof custom === 'object' && custom.members?.length) {
      return this.getChannelByMembers(channelType, custom);
    }

    // support channel("messaging", null, {options})
    // support channel("messaging", undefined, {options})
    // support channel("messaging", "", {options})
    if (!channelIdOrCustom) {
      return new Channel(this, channelType, undefined, custom);
    }

    return this.getChannelById(channelType, channelIdOrCustom, custom);
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
  getChannelByMembers = (channelType: string, custom: ChannelData) => {
    // Check if the channel already exists.
    // Only allow 1 channel object per cid
    const memberIds = (custom.members ?? []).map((member) =>
      typeof member === 'string' ? member : member.user_id,
    );
    const membersStr = memberIds.sort().join(',');
    const tempCid = generateChannelTempCid(channelType, memberIds);

    if (!tempCid) {
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

    const channel = new Channel(this, channelType, undefined, custom);

    // For the time being set the key as membersStr, since we don't know the cid yet.
    // In channel.query, we will replace it with 'cid'.
    if (this._cacheEnabled()) {
      this.activeChannels[tempCid] = channel;
    }

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
  getChannelById = (channelType: string, channelId: string, custom: ChannelData) => {
    if (typeof channelId === 'string' && ~channelId.indexOf(':')) {
      throw Error(`Invalid channel id ${channelId}, can't contain the : character`);
    }

    // only allow 1 channel object per cid
    const cid = `${channelType}:${channelId}`;
    if (
      cid in this.activeChannels &&
      this.activeChannels[cid] &&
      !this.activeChannels[cid].disconnected
    ) {
      const channel = this.activeChannels[cid];
      if (Object.keys(custom).length > 0) {
        channel.data = { ...channel.data, custom: custom.custom };
        channel._data = { ...channel._data, ...custom };
      }
      return channel;
    }
    const channel = new Channel(this, channelType, channelId, custom);
    if (this._cacheEnabled()) {
      this.activeChannels[channel.cid] = channel;
    }

    return channel;
  };

  /**
   * partialUpdateUser - Update the given user object
   *
   * @param {PartialUserUpdate} partialUserObject which should contain id and any of "set" or "unset" params;
   * example: {id: "user1", set:{field: value}, unset:["field2"]}
   *
   * @return {Promise<{ users: { [key: string]: UserResponse } }>} list of updated users
   */
  async partialUpdateUser(partialUserObject: PartialUserUpdate) {
    return await this.partialUpdateUsers([partialUserObject]);
  }

  /**
   * updateUsers - Batch update the list of users
   *
   * @param {UserResponse[]} users list of users
   *
   * @return {Promise<{ users: { [key: string]: UserResponse } }>}
   */
  async updateUsers(users: UserUpdate[]) {
    const userMap: Record<string, UserUpdate> = {};
    for (const userObject of users) {
      if (!userObject.id) {
        throw Error('User ID is required when updating a user');
      }
      userMap[userObject.id] = userObject;
    }

    return await this.chatApi.updateUsers({ users: userMap });
  }

  /**
   *
   * updateUser - Update or Create the given user object
   *
   * @param {UserResponse} userObject user object, the only required field is the user id. IE {id: "myuser"} is valid
   * @return {Promise<{ users: { [key: string]: UserResponse } }>}
   */
  updateUser(userObject: UserResponse) {
    return this.updateUsers([userObject]);
  }

  /**
   * partialUpdateUsers - Batch partial update of users
   *
   * @param {PartialUserUpdate[]} users list of partial update requests
   *
   * @return {Promise<{ users: { [key: string]: UserResponse } }>}
   */
  async partialUpdateUsers(users: PartialUserUpdate[]) {
    for (const userObject of users) {
      if (!userObject.id) {
        throw Error('User ID is required when updating a user');
      }
    }

    return await this.chatApi.updateUsersPartial({ users });
  }

  /** banUser - bans a user from all channels
   *
   * @param {string} targetUserId
   * @param {BanUserOptions} [options]
   * @returns {Promise<APIResponse>}
   */
  async banUser(targetUserId: string, options?: BanUserOptions) {
    return await this.api.post<APIResponse>(this.baseURL + '/moderation/ban', {
      target_user_id: targetUserId,
      ...options,
    });
  }

  /** unbanUser - revoke global ban for a user
   *
   * @param {string} targetUserId
   * @param {UnBanUserOptions} [options]
   * @returns {Promise<APIResponse>}
   */
  async unbanUser(targetUserId: string, options?: UnBanUserOptions) {
    return await this.api.delete<APIResponse>(this.baseURL + '/moderation/ban', {
      target_user_id: targetUserId,
      ...options,
    });
  }

  /** shadowBan - shadow bans a user from all channels
   *
   * @param {string} targetUserId
   * @param {BanUserOptions} [options]
   * @returns {Promise<APIResponse>}
   */
  async shadowBan(targetUserId: string, options?: BanUserOptions) {
    return await this.banUser(targetUserId, {
      shadow: true,
      ...options,
    });
  }

  /** removeShadowBan - revoke global shadow ban for a user
   *
   * @param {string} targetUserId
   * @param {UnBanUserOptions} [options]
   * @returns {Promise<APIResponse>}
   */
  async removeShadowBan(targetUserId: string, options?: UnBanUserOptions) {
    return await this.unbanUser(targetUserId, {
      shadow: true,
      ...options,
    });
  }
  async blockUser(blockedUserId: string) {
    const result = await this.chatApi.blockUsers({
      blocked_user_id: blockedUserId,
    });
    if (this._cacheEnabled()) {
      this.blockedUsers.next(({ userIds }) => ({
        userIds: userIds.concat(blockedUserId),
      }));
    }
    return result;
  }

  async getBlockedUsers() {
    const result = await this.chatApi.getBlockedUsers();
    if (this._cacheEnabled()) {
      this.blockedUsers.partialNext({
        userIds: result.blocks.map(({ blocked_user_id }) => blocked_user_id),
      });
    }
    return result;
  }

  async unBlockUser(blockedUserId: string) {
    const result = await this.chatApi.unblockUsers({
      blocked_user_id: blockedUserId,
    });
    if (this._cacheEnabled()) {
      this.blockedUsers.next(({ userIds }) => ({
        userIds: userIds.filter((id) => id !== blockedUserId),
      }));
    }
    return result;
  }

  /** getSharedLocations
   *
   * @returns {Promise<ActiveLiveLocationsAPIResponse>} The server response
   *
   */
  async getSharedLocations() {
    return await this.chatApi.getUserLiveLocations();
  }

  /** muteUser - mutes a user
   *
   * @param {string} targetId
   * @param {MuteUserOptions} [options]
   * @returns {Promise<MuteUserResponse>}
   */
  async muteUser(targetId: string, options: MuteUserOptions = {}) {
    return await this.api.post<MuteUserResponse>(this.baseURL + '/moderation/mute', {
      target_id: targetId,
      ...options,
    });
  }

  /** unmuteUser - unmutes a user
   *
   * @param {string} targetId
   * @returns {Promise<APIResponse>}
   */
  async unmuteUser(targetId: string) {
    return await this.api.post<APIResponse>(this.baseURL + '/moderation/unmute', {
      target_id: targetId,
    });
  }

  /** userMuteStatus - check if a user is muted or not, can be used after connectUser() is called
   *
   * @param {string} targetId
   * @returns {boolean}
   */
  userMuteStatus(targetId: string) {
    if (!this.user || !this.wsPromise) {
      throw new Error('Make sure to await connectUser() first.');
    }

    for (let i = 0; i < this.mutedUsers.length; i += 1) {
      if (this.mutedUsers[i].target?.id === targetId) return true;
    }
    return false;
  }

  /**
   * flagMessage - flag a message
   * @param {string} targetMessageId
   * @param {object} [options]
   * @param {string} [options.reason] reason for flagging
   * @returns {Promise<APIResponse>}
   */
  async flagMessage(targetMessageId: string, options: { reason?: string } = {}) {
    return await this.api.post<FlagMessageResponse>(this.baseURL + '/moderation/flag', {
      target_message_id: targetMessageId,
      ...options,
    });
  }

  /**
   * flagUser - flag a user
   * @param {string} targetId
   * @param {object} [options]
   * @param {string} [options.reason] reason for flagging
   * @returns {Promise<APIResponse>}
   */
  async flagUser(targetId: string, options: { reason?: string } = {}) {
    return await this.api.post<FlagUserResponse>(this.baseURL + '/moderation/flag', {
      target_user_id: targetId,
      ...options,
    });
  }

  /**
   * unflagMessage - unflag a message
   * @param {string} targetMessageId
   * @returns {Promise<APIResponse>}
   */
  async unflagMessage(targetMessageId: string) {
    return await this.api.post<FlagMessageResponse>(this.baseURL + '/moderation/unflag', {
      target_message_id: targetMessageId,
    });
  }

  /**
   * unflagUser - unflag a user
   * @param {string} targetId
   * @returns {Promise<APIResponse>}
   */
  async unflagUser(targetId: string) {
    return await this.api.post<FlagUserResponse>(this.baseURL + '/moderation/unflag', {
      target_user_id: targetId,
    });
  }

  /**
   * unblockMessage - unblocks message blocked by automod
   *
   * @param {string} targetMessageId
   * @returns {Promise<APIResponse>}
   */
  async unblockMessage(targetMessageId: string) {
    return await this.api.post<APIResponse>(
      this.baseURL + '/moderation/unblock_message',
      {
        target_message_id: targetMessageId,
      },
    );
  }

  /**
   * @deprecated use markChannelsRead instead
   *
   * markAllRead - marks all channels for this user as read
   * @param {MarkAllReadOptions} [data]
   *
   * @return {Promise<APIResponse>}
   */
  markAllRead = this.markChannelsRead;

  /**
   * markChannelsRead - marks channels read -
   * it accepts a map of cid:messageid pairs, if messageid is empty, the whole channel will be marked as read
   *
   * @param {MarkChannelsReadOptions } [data]
   *
   * @return {Promise<APIResponse>}
   */
  async markChannelsRead(data: MarkChannelsReadOptions = {}) {
    await this.chatApi.markChannelsRead(data);
  }

  /**
   * translateMessage - adds the translation to the message
   *
   * @param {string} messageId
   * @param {string} language
   *
   * @return {MessageResponse} Response that includes the message
   */
  async translateMessage(
    messageId: string,
    language: Gen_TranslateMessageRequest['language'],
  ) {
    return await this.chatApi.translateMessage({
      id: messageId,
      language,
    });
  }

  /**
   * _normalizeExpiration - transforms expiration value into ISO string
   * @param {undefined|null|number|string|Date} timeoutOrExpirationDate expiration date or timeout. Use number type to set timeout in seconds, string or Date to set exact expiration date
   */
  _normalizeExpiration(timeoutOrExpirationDate?: null | number | string | Date) {
    let pinExpires: null | string = null;
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
   * @param {undefined|number|string|Date} pinnedAt date when message should be pinned. It affects the order of pinned messages. Use negative number to set relative time in the past, string or Date to set exact date of pin
   */
  pinMessage(
    messageOrMessageId: string | { id: string },
    timeoutOrExpirationDate?: null | number | string | Date,
    pinnedAt?: number | string | Date,
  ) {
    const messageId = this._validateAndGetMessageId(
      messageOrMessageId,
      'Please specify the message id when calling pinMessage',
    );
    return this.partialUpdateMessage(messageId, {
      set: {
        pinned: true,
        pin_expires: this._normalizeExpiration(timeoutOrExpirationDate),
        pinned_at: this._normalizeExpiration(pinnedAt),
      },
    } as unknown as PartialMessageUpdate);
  }

  /**
   * unpinMessage - unpins the message that was previously pinned
   * @param {string | { id: string }} messageOrMessageId message object or message id
   */
  unpinMessage(messageOrMessageId: string | { id: string }) {
    const messageId = this._validateAndGetMessageId(
      messageOrMessageId,
      'Please specify the message id when calling unpinMessage',
    );
    return this.partialUpdateMessage(messageId, {
      set: { pinned: false },
    } as unknown as PartialMessageUpdate);
  }

  /**
   * updateMessage - Update the given message
   *
   * @param {Omit<MessageResponse, 'mentioned_users'> & { mentioned_users?: string[] }} message object, id needs to be specified
   * @param {boolean} [options.skip_enrich_url] Do not try to enrich the URLs within message
   *
   * @return {{ message: LocalMessage | MessageResponse }} Response that includes the message
   */
  async updateMessage(
    message: Gen_UpdateMessageRequest['message'] & { cid?: string; status?: string },
    options?: UpdateMessageOptions,
  ) {
    if (!message.id) {
      throw Error('Please specify the message.id when calling updateMessage');
    }

    const messageId = message.id as string;

    try {
      if (this.offlineDb) {
        return await this.offlineDb.queueTask<UpdateMessageAPIResponse>({
          task: {
            ...getPendingTaskChannelData(message.cid),
            messageId,
            payload: [message, options],
            type: 'update-message',
          },
        });
      }
    } catch (error) {
      this.logger('error', `offlineDb:updateMessage`, {
        tags: ['channel', 'offlineDb'],
        error,
      });
    }

    return await this._updateMessage(message, options);
  }

  async _updateMessage(
    message: Gen_UpdateMessageRequest['message'],
    options?: UpdateMessageOptions,
  ) {
    if (!message.id) {
      throw Error('Please specify the message.id when calling updateMessage');
    }

    return await this.chatApi.updateMessage({ id: message.id, message, ...options });
  }

  /**
   * partialUpdateMessage - Update the given message id while retaining additional properties
   *
   * @param {string} id the message id
   *
   * @param {PartialUpdateMessage}  partialMessageObject which should contain id and any of "set" or "unset" params;
   *         example: {id: "user1", set:{text: "hi"}, unset:["color"]}
   * @param {string | { id: string }} [userId]
   *
   * @param {boolean} [options.skip_enrich_url] Do not try to enrich the URLs within message
   *
   * @return {{ message: MessageResponse }} Response that includes the updated message
   */
  async partialUpdateMessage(
    id: string,
    partialMessageObject: PartialMessageUpdate,
    options?: UpdateMessageOptions,
  ) {
    if (!id) {
      throw Error('Please specify the message.id when calling partialUpdateMessage');
    }

    return await this.chatApi.updateMessagePartial({
      id,
      ...partialMessageObject,
      ...options,
    });
  }

  /**
   * deleteMessage - Delete a message
   *
   * @param {string} messageId The id of the message to delete
   * @param {boolean | DeleteMessageOptions | undefined} [optionsOrHardDelete]
   * @return {Promise<APIResponse & { message: MessageResponse }>} The API response
   */
  // fixme: remove the signature with optionsOrHardDelete boolean with the next major release
  async deleteMessage(
    messageId: string,
    optionsOrHardDelete?: DeleteMessageOptions | boolean,
  ): Promise<APIResponse & { message: MessageResponse }> {
    let options: DeleteMessageOptions = {};
    if (typeof optionsOrHardDelete === 'boolean') {
      options = optionsOrHardDelete ? { hardDelete: true } : {};
    } else if (optionsOrHardDelete?.deleteForMe) {
      options = { deleteForMe: true };
    } else if (optionsOrHardDelete?.hardDelete) {
      options = { hardDelete: true };
    }

    try {
      if (this.offlineDb) {
        if (options.hardDelete) {
          await this.offlineDb.hardDeleteMessage({ id: messageId });
        } else {
          await this.offlineDb.softDeleteMessage({
            id: messageId,
            deleteForMe: options.deleteForMe,
          });
        }
        return await this.offlineDb.queueTask<APIResponse & { message: MessageResponse }>(
          {
            task: {
              messageId,
              payload: [messageId, options],
              type: 'delete-message',
            },
          },
        );
      }
    } catch (error) {
      this.logger('error', `offlineDb:deleteMessage`, {
        tags: ['channel', 'offlineDb'],
        error,
      });
    }

    return this._deleteMessage(messageId, options);
  }

  // fixme: remove the signature with optionsOrHardDelete boolean with the next major release
  async _deleteMessage(
    messageId: string,
    optionsOrHardDelete?: DeleteMessageOptions | boolean,
  ): Promise<APIResponse & { message: MessageResponse }> {
    // this is a API call method, we do not route hardDelete: true and deleteForMe: true to deleteForMe: true
    // and expect to receive error response from the server
    const { deleteForMe, hardDelete } = (
      typeof optionsOrHardDelete === 'boolean'
        ? { hardDelete: optionsOrHardDelete }
        : (optionsOrHardDelete ?? {})
    ) as DeleteMessageOptions;

    const result = await this.chatApi.deleteMessage({
      id: messageId,
      hard: hardDelete,
      delete_for_me: deleteForMe,
    });

    // necessary to populate the below values as the server does not return the message in the response as deleted
    if (deleteForMe) {
      result.message.deleted_for_me = true;
      result.message.type = 'deleted';
    }
    return result;
  }

  async getMessage(messageId: string, options?: GetMessageOptions) {
    // TODO: geberated ChatApi.getMessage options do not support show_deleted_message - oapi gap?
    return await this.chatApi.getMessage({ id: messageId, ...options });
  }

  /**
   * queryThreads - returns the list of threads of current user.
   *
   * @param {QueryThreadsOptions} options Options object for pagination and limiting the participants and replies.
   * @param {number}  options.limit Limits the number of threads to be returned.
   * @param {boolean} options.watch Subscribes the user to the channels of the threads.
   * @param {number}  options.participant_limit Limits the number of participants returned per threads.
   * @param {number}  options.reply_limit Limits the number of replies returned per threads.
   * @param {ThreadFilters} options.filter MongoDB style filters for threads
   * @param {ThreadSort} options.sort MongoDB style sort for threads
   *
   * @returns {{ threads: Thread[], next: string }} Returns the list of threads and the next cursor.
   */
  async queryThreads(options: QueryThreadsOptions = {}) {
    const optionsWithDefaults = {
      limit: 10,
      participant_limit: 10,
      reply_limit: 3,
      watch: true,
      ...options,
    };

    const requestBody: Record<string, unknown> = {
      ...optionsWithDefaults,
    };

    if (
      optionsWithDefaults.filter &&
      Object.keys(optionsWithDefaults.filter).length > 0
    ) {
      requestBody.filter = optionsWithDefaults.filter;
    }

    if (
      optionsWithDefaults.sort &&
      (Array.isArray(optionsWithDefaults.sort)
        ? optionsWithDefaults.sort.length > 0
        : Object.keys(optionsWithDefaults.sort).length > 0)
    ) {
      requestBody.sort = normalizeQuerySort(optionsWithDefaults.sort);
    }

    const response = await this.chatApi.queryThreads(requestBody);

    // Hydrate the polls for the parent messages of the threads
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const parentMessages = response.threads.map((thread) => thread.parent_message!);
    this.polls.hydratePollCache(parentMessages);

    return {
      threads: response.threads.map(
        (thread) => new Thread({ client: this, threadData: thread }),
      ),
      next: response.next,
    };
  }

  /**
   * getThread - returns the thread of a message by its id.
   *
   * @param {string}            messageId The message id
   * @param {GetThreadOptions}  options Options object for pagination and limiting the participants and replies.
   * @param {boolean}           options.watch Subscribes the user to the channel of the thread.
   * @param {number}            options.participant_limit Limits the number of participants returned per threads.
   * @param {number}            options.reply_limit Limits the number of replies returned per threads.
   *
   * @returns {Thread} Returns the thread.
   */
  async getThread(messageId: string, options: GetThreadOptions = {}) {
    if (!messageId) {
      throw new Error('Please specify the messageId when calling getThread');
    }

    const optionsWithDefaults = {
      participant_limit: 100,
      reply_limit: 3,
      watch: true,
      ...options,
    };

    const response = await this.chatApi.getThread({
      message_id: messageId,
      ...optionsWithDefaults,
    });

    return new Thread({ client: this, threadData: response.thread });
  }

  /**
   * partialUpdateThread - updates the given thread
   *
   * @param {string}              messageId The id of the thread message which needs to be updated.
   * @param {PartialThreadUpdate} partialThreadObject should contain "set" or "unset" params for any of the thread's non-reserved fields.
   *
   * @returns {GetThreadAPIResponse} Returns the updated thread.
   */
  async partialUpdateThread(messageId: string, partialThreadObject: PartialThreadUpdate) {
    if (!messageId) {
      throw Error('Please specify the message id when calling partialUpdateThread');
    }

    // check for reserved fields from ThreadResponse type within partialThreadObject's set and unset.
    // Throw error if any of the reserved field is found.
    const reservedThreadFields = [
      'created_at',
      'id',
      'last_message_at',
      'type',
      'updated_at',
      'user',
      'reply_count',
      'participants',
      'channel',
      'custom',
    ];

    for (const key in { ...partialThreadObject.set, ...partialThreadObject.unset }) {
      if (reservedThreadFields.includes(key)) {
        throw Error(
          `You cannot set ${key} field on Thread object. ${key} is reserved for server-side use. Please omit ${key} from your set object.`,
        );
      }
    }

    return await this.chatApi.updateThreadPartial({
      message_id: messageId,
      ...partialThreadObject,
    });
  }

  getUserAgent() {
    if (this.userAgent) {
      return this.userAgent;
    }

    const version = process.env.PKG_VERSION;
    const clientBundle = process.env.CLIENT_BUNDLE;

    let userAgentString = '';
    if (this.sdkIdentifier) {
      userAgentString = `stream-chat-${this.sdkIdentifier.name}-v${this.sdkIdentifier.version}-llc-v${version}`;
    } else {
      userAgentString = `stream-chat-js-v${version}-${this.node ? 'node' : 'browser'}`;
    }

    const { os, model } = this.deviceIdentifier ?? {};

    return (
      [
        // reports the device OS, if provided
        ['os', os],
        // reports the device model, if provided
        ['device_model', model],
        // reports which bundle is being picked from the exports
        ['client_bundle', clientBundle],
      ] as const
    ).reduce(
      (withArguments, [key, value]) =>
        value && value.length > 0
          ? withArguments.concat(`|${key}=${value}`)
          : withArguments,
      userAgentString,
    );
  }

  /**
   * @deprecated use sdkIdentifier instead
   * @param userAgent
   */
  setUserAgent(userAgent: string) {
    this.userAgent = userAgent;
  }

  /**
   * _isUsingServerAuth - Returns true if we're using server side auth
   */
  _isUsingServerAuth = () => !!this.secret;

  _cacheEnabled = () => !this._isUsingServerAuth() || !this.options.disableCache;

  _startCleaning() {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
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

  /**
   * encode ws url payload
   * @private
   * @returns json string
   */
  _buildWSPayload = (client_request_id?: string) =>
    JSON.stringify({
      user_id: this.userId,
      user_details: this._user,
      device: this.options.device,
      client_request_id,
    });

  /** sync - returns all events that happened for a list of channels since last sync
   * @param {string[]} channel_cids list of channel CIDs
   * @param {string} last_sync_at last time the user was online and in sync. RFC3339 ie. "2020-05-06T15:05:01.207Z"
   * @param {SyncOptions} options See JSDoc in the type fields for more info
   *
   * @returns {Promise<SyncResponse>}
   */
  sync(channel_cids: string[], last_sync_at: string, options: SyncOptions = {}) {
    return this.chatApi.sync({
      channel_cids,
      last_sync_at: new Date(last_sync_at),
      ...options,
    });
  }

  /**
   * enrichURL - Get OpenGraph data of the given link
   *
   * @param {string} url link
   * @return {OGAttachment} OG Attachment
   */
  enrichURL(url: string) {
    return this.chatApi.getOG({ url });
  }

  /**
   * deleteChannels - Deletes a list of channel
   *
   * @param {string[]} cids Channel CIDs
   * @param {boolean} [options.hard_delete] Defines if the channel is hard deleted or not
   *
   * @return {DeleteChannelsResponse} Result of the soft deletion, if server-side, it holds the task ID as well
   */
  async deleteChannels(cids: string[], options: { hard_delete?: boolean } = {}) {
    return await this.chatApi.deleteChannels({
      cids,
      ...options,
    });
  }

  /**
   * Creates a poll
   * @param poll PollData The poll that will be created
   * @returns {APIResponse & CreatePollAPIResponse} The poll
   */
  async createPoll(poll: CreatePollData) {
    return await this.chatApi.createPoll({
      ...poll,
    });
  }

  /**
   * Retrieves a poll
   * @param id string The poll id
   * @returns {APIResponse & GetPollAPIResponse} The poll
   */
  async getPoll(id: string) {
    return await this.chatApi.getPoll({
      poll_id: id,
    });
  }

  /**
   * Updates a poll
   * @param poll PollData The poll that will be updated
   * @returns {APIResponse & PollResponse} The poll
   */
  async updatePoll(poll: PollData) {
    return await this.chatApi.updatePoll(poll);
  }

  /**
   * Partially updates a poll
   * @param id string The poll id
   * @param {PartialPollUpdate} partialPollObject which should contain id and any of "set" or "unset" params;
   * example: {id: "44f26af5-f2be-4fa7-9dac-71cf893781de", set:{field: value}, unset:["field2"]}
   * @returns {APIResponse & UpdatePollAPIResponse} The poll
   */
  async partialUpdatePoll(id: string, partialPollObject: PartialPollUpdate) {
    return await this.chatApi.updatePollPartial({
      poll_id: id,
      ...partialPollObject,
    });
  }

  /**
   * Delete a poll
   * @param id string The poll id
   * @returns
   */
  async deletePoll(id: string) {
    return await this.chatApi.deletePoll({
      poll_id: id,
    });
  }

  /**
   * Close a poll
   * @param id string The poll id
   * @returns {APIResponse & UpdatePollAPIResponse} The poll
   */
  closePoll(id: string): Promise<APIResponse & UpdatePollAPIResponse> {
    return this.partialUpdatePoll(id, {
      set: {
        is_closed: true,
      },
    });
  }

  /**
   * Creates a poll option
   * @param pollId string The poll id
   * @param option PollOptionData The poll option that will be created
   * @returns {APIResponse & PollOptionResponse} The poll option
   */
  async createPollOption(pollId: string, option: PollOptionData) {
    return await this.chatApi.createPollOption({
      poll_id: pollId,
      ...option,
    });
  }

  /**
   * Retrieves a poll option
   * @param pollId string The poll id
   * @param optionId string The poll option id
   * @returns {APIResponse & PollOptionResponse} The poll option
   */
  async getPollOption(pollId: string, optionId: string) {
    return await this.chatApi.getPollOption({
      poll_id: pollId,
      option_id: optionId,
    });
  }

  /**
   * Updates a poll option
   * @param pollId string The poll id
   * @param option PollOptionData The poll option that will be updated
   * @returns
   */
  async updatePollOption(pollId: string, option: PollOptionData) {
    return await this.chatApi.updatePollOption({
      poll_id: pollId,
      ...option,
    });
  }

  /**
   * Delete a poll option
   * @param pollId string The poll id
   * @param optionId string The poll option id
   * @returns {APIResponse} The poll option
   */
  async deletePollOption(pollId: string, optionId: string) {
    return await this.chatApi.deletePollOption({
      poll_id: pollId,
      option_id: optionId,
    });
  }

  /**
   * Cast vote on a poll
   * @param messageId string The message id
   * @param pollId string The poll id
   * @param vote PollVoteData The vote that will be casted
   * @returns {APIResponse & CastVoteAPIResponse} The poll vote
   */
  async castPollVote(messageId: string, pollId: string, vote: PollVoteData) {
    return await this.chatApi.castPollVote({
      message_id: messageId,
      poll_id: pollId,
      vote,
    });
  }

  /**
   * Add a poll answer
   * @param messageId string The message id
   * @param pollId string The poll id
   * @param answerText string The answer text
   */
  addPollAnswer(messageId: string, pollId: string, answerText: string) {
    return this.castPollVote(messageId, pollId, {
      answer_text: answerText,
    });
  }

  async removePollVote(messageId: string, pollId: string, voteId: string) {
    return await this.chatApi.deletePollVote({
      message_id: messageId,
      poll_id: pollId,
      vote_id: voteId,
    });
  }

  /**
   * Queries polls
   * @param filter
   * @param sort
   * @param options Option object, {limit: 10, offset:0}
   * @returns {APIResponse & QueryPollsResponse} The polls
   */
  async queryPolls(
    filter: QueryPollsFilters = {},
    sort: PollSort = [],
    options: QueryPollsOptions = {},
  ) {
    return await this.chatApi.queryPolls({
      filter,
      sort: normalizeQuerySort(sort),
      ...options,
    });
  }

  /**
   * Queries poll votes
   * @param pollId
   * @param filter
   * @param sort
   * @param options Option object, {limit: 10, offset:0}
   * @param userId string The user id (only serverside)
   * @returns {APIResponse & PollVotesAPIResponse} The poll votes
   */
  async queryPollVotes(
    pollId: string,
    filter: QueryVotesFilters = {},
    sort: VoteSort = [],
    options: QueryVotesOptions = {},
  ) {
    return await this.chatApi.queryPollVotes({
      poll_id: pollId,
      filter,
      sort: normalizeQuerySort(sort),
      ...options,
    });
  }

  /**
   * Queries poll answers
   * @param pollId
   * @param filter
   * @param sort
   * @param options Option object, {limit: 10, offset:0}
   * @returns {APIResponse & PollAnswersAPIResponse} The poll votes
   */
  async queryPollAnswers(
    pollId: string,
    filter: QueryVotesFilters = {},
    sort: VoteSort = [],
    options: QueryVotesOptions = {},
  ): Promise<APIResponse & PollAnswersAPIResponse> {
    return await this.chatApi.queryPollVotes({
      poll_id: pollId,
      sort: normalizeQuerySort(sort),
      filter: {
        ...filter,
        is_answer: true,
      },
      ...options,
    });
  }

  /**
   * queryDrafts - Queries drafts for the current user
   *
   * @param {object} [options] Query options
   * @param {object} [options.filter] Filters for the query
   * @param {number} [options.sort] Sort parameters
   * @param {number} [options.limit] Limit the number of results
   * @param {string} [options.next] Pagination parameter
   * @param {string} [options.prev] Pagination parameter
   * @param {string} [options.user_id] Has to be provided when called server-side
   *
   * @return {Promise<APIResponse & { drafts: DraftResponse[]; next?: string }>} Response containing the drafts
   */
  async queryDrafts(
    options: Pager & {
      filter?: DraftFilters;
      sort?: DraftSort;
      user_id?: string;
    } = {},
  ) {
    return await this.chatApi.queryDrafts({
      ...options,
      sort: options.sort ? normalizeQuerySort(options.sort) : undefined,
    });
  }

  /**
   * createReminder - Creates a reminder for a message
   *
   * @param {CreateReminderOptions} options The options for creating the reminder
   * @returns {Promise<ReminderAPIResponse>}
   */
  async createReminder(data: CreateReminderOptions) {
    return await this.chatApi.createReminder(data);
  }

  /**
   * updateReminder - Updates an existing reminder for a message
   *
   * @param {UpdateReminderOptions} options The options for updating the reminder
   * @returns {Promise<ReminderAPIResponse>}
   */
  async updateReminder(data: UpdateReminderOptions) {
    return await this.chatApi.updateReminder(data);
  }

  /**
   * deleteReminder - Deletes a reminder for a message
   *
   * @param {string} messageId The ID of the message whose reminder to delete
   * @returns {Promise<APIResponse>}
   */
  async deleteReminder(messageId: string) {
    return await this.chatApi.deleteReminder({
      message_id: messageId,
    });
  }

  /**
   * queryReminders - Queries reminders based on given filters
   *
   * @param {QueryRemindersOptions} options The options for querying reminders
   * @returns {Promise<QueryRemindersResponse>}
   */
  async queryReminders({ filter, sort, ...rest }: QueryRemindersOptions = {}) {
    return await this.chatApi.queryReminders({
      filter,
      sort: sort && normalizeQuerySort(sort),
      ...rest,
    });
  }

  /**
   * updateLocation - Updates a location
   *
   * @param location SharedLocationRequest the location data to update
   *
   * @returns {Promise<SharedLocationResponse>} The server response
   */
  async updateLocation(location: UpdateLocationPayload) {
    return await this.chatApi.updateLiveLocation(location);
  }

  /**
   * uploadFile - Uploads a file to the configured storage (defaults to Stream CDN)
   *
   * @param {string|NodeJS.ReadableStream|Buffer|File} uri The file to upload
   * @param {string} [name] The name of the file
   * @param {string} [contentType] The content type of the file
   * @param {UserResponse} [user] Optional user information
   * @param {AxiosRequestConfig} [axiosRequestConfig] Optional axios config (e.g. onUploadProgress for progress tracking)
   *
   * @return {Promise<SendFileAPIResponse>} Response containing the file URL
   */
  uploadFile(
    uri: string | NodeJS.ReadableStream | Buffer | File,
    name?: string,
    contentType?: string,
    user?: UserResponse,
    axiosRequestConfig?: AxiosRequestConfig,
  ) {
    return this.api.sendFile(
      `${this.baseURL}/uploads/file`,
      uri,
      name,
      contentType,
      user,
      axiosRequestConfig,
    );
  }

  /**
   * uploadImage - Uploads an image to the configured storage (defaults to Stream CDN)
   *
   * @param {string|NodeJS.ReadableStream|File} uri The image to upload
   * @param {string} [name] The name of the image
   * @param {string} [contentType] The content type of the image
   * @param {UserResponse} [user] Optional user information
   * @param {AxiosRequestConfig} [axiosRequestConfig] Optional axios config (e.g. onUploadProgress for progress tracking)
   *
   * @return {Promise<SendFileAPIResponse>} Response containing the image URL
   */
  uploadImage(
    uri: string | NodeJS.ReadableStream | File,
    name?: string,
    contentType?: string,
    user?: UserResponse,
    axiosRequestConfig?: AxiosRequestConfig,
  ) {
    return this.api.sendFile(
      `${this.baseURL}/uploads/image`,
      uri,
      name,
      contentType,
      user,
      axiosRequestConfig,
    );
  }

  /**
   * deleteFile - Deletes a file from the configured storage
   *
   * @param {string} url The URL of the file to delete
   *
   * @return {Promise<APIResponse>} The server response
   */
  deleteFile(url: string) {
    return this.chatApi.deleteFile({ url });
  }

  /**
   * deleteImage - Deletes an image from the configured storage
   *
   * @param {string} url The URL of the image to delete
   *
   * @return {Promise<APIResponse>} The server response
   */
  deleteImage(url: string) {
    return this.chatApi.deleteImage({ url });
  }

  /**
   * Mark the channels delivered for the given messages and the user
   *
   * @param {MarkDeliveredOptions} data
   * @return {Promise<EventAPIResponse | void>} Description
   */
  async markChannelsDelivered(data: MarkDeliveredOptions) {
    if (!data?.latest_delivered_messages?.length) return;
    return await this.chatApi.markDelivered(data);
  }

  syncDeliveredCandidates(collections: Channel[]) {
    this.messageDeliveryReporter.syncDeliveredCandidates(collections);
  }
}
