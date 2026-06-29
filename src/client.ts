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
  isOnline,
  isOwnUserBaseProperty,
  messageSetPagination,
  randomId,
} from './utils';

import type {
  APIResponse,
  BanUserOptions,
  BaseDeviceFields,
  ChannelAPIResponse,
  ChannelData,
  ChannelMute,
  ChannelOptions,
  ChannelResponse,
  ChannelStateOptions,
  CombinedEvents,
  Configs,
  ConnectAPIResponse,
  DeviceIdentifier,
  EventHandler,
  FlagMessageResponse,
  FlagUserResponse,
  GetThreadOptions,
  LocalMessage,
  Mute,
  MuteUserOptions,
  MuteUserResponse,
  OwnUserResponse,
  PartialThreadUpdate,
  PartialUserUpdate,
  QueryBannedUsersPayload,
  QueryChannelsAPIResponse,
  QueryChannelsRequest,
  QueryReactionsRequest,
  QueryThreadsOptions,
  QueryUserGroupsOptions,
  QueryUserGroupsResponse,
  ReactionResponse,
  RequireLiteral,
  SdkIdentifier,
  SearchPayload,
  StreamChatOptions,
  TokenOrProvider,
  UnBanUserOptions,
  UserResponse,
} from './types';
import { InsightMetrics, postInsights } from './insights';
import { chatLoggerSystem } from './logger';
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
  MarkDeliveredRequest as Gen_MarkDeliveredRequest,
  QueryUsersPayload as Gen_QueryUsersPayload,
  WSEvent,
} from './gen/models';
import { ChatApi } from './gen-imports';
import type { StreamResponse } from './types';

function isString(value: unknown): value is string {
  return typeof value === 'string' || value instanceof String;
}

const logger = chatLoggerSystem.getLogger('client');
const offlineDbLogger = chatLoggerSystem.getLogger('offline-db');

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

export class StreamChat extends ChatApi {
  private static _instance?: unknown | StreamChat; // type is undefined|StreamChat, unknown is due to TS limitations with statics
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
  get api() {
    return this.apiClient;
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
   * Initializes a client.
   *
   * **Only use constructor for advanced usages. It is strongly advised to use `StreamChat.getInstance()` instead of `new StreamChat()` to reduce integration issues due to multiple WebSocket connections.**
   *
   * @example <caption>initialize the client in user mode</caption>
   * new StreamChat('api_key')
   * @example <caption>initialize the client in user mode with options</caption>
   * new StreamChat('api_key', { warmUp: true, timeout: 5000 })
   * @example <caption>secret is optional and only used in server side mode</caption>
   * new StreamChat('api_key', 'secret', { httpsAgent: customAgent })
   *
   * @param key - The API key.
   * @param options - Additional options; here you can pass custom options to the axios instance (optional).
   * @param options.browser - Enforce the client to be in browser mode (optional).
   * @param options.warmUp - If `true`, the client will open a connection as soon as possible to speed up following requests (optional, defaults to `false`).
   * @param options.logLevel - Minimum log level for the default sink (optional, defaults to `'info'`).
   * @param options.logOptions - Per-scope sink/level overrides for `chatLoggerSystem` (optional).
   * @param options.timeout - Request timeout (optional, defaults to `3000`).
   * @param options.httpsAgent - Custom `httpsAgent` (optional, in Node defaults to `https.agent()`).
   */
  constructor(key: string, options: StreamChatOptions = {}) {
    // generated client requires ApiClient right away
    super(new ApiClient());
    // but ApiClient relies on properties defined here so we set it after (can't pass `this` in super call)
    this.apiClient.client = this;

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

    this.browser = options.browser ?? typeof window !== 'undefined';
    this.node = !this.browser;

    this.options = {
      warmUp: false,
      recoverStateOnReconnect: true,
      disableCache: false,
      wsUrlParams: new URLSearchParams({}),
      ...options,
    };

    chatLoggerSystem.configureLoggers({
      ...options.logOptions,
      default: {
        level: options.logLevel ?? 'info',
        ...options.logOptions?.default,
      },
    });

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
    this.tokenManager = new TokenManager();
    this.insightMetrics = new InsightMetrics();

    this.defaultWSTimeoutWithFallback = 6 * 1000;
    this.defaultWSTimeout = 15 * 1000;

    this.recoverStateOnReconnect = this.options.recoverStateOnReconnect;
    this.threads = new ThreadManager({ client: this });
    this.polls = new PollManager({ client: this });
    this.reminders = new ReminderManager({ client: this });
    this.messageDeliveryReporter = new MessageDeliveryReporter({ client: this });
    this.messageComposerCache = new FixedSizeQueueCache<string, MessageComposer>(64);
  }

  /**
   * Returns a client instance.
   *
   * This function always returns the same client instance to avoid issues raised by multiple client and WS connections.
   *
   * **After the first call, the client configuration will not change if the key or options parameters change.**
   *
   * @example <caption>initialize the client in user mode</caption>
   * StreamChat.getInstance('api_key')
   * @example <caption>initialize the client in user mode with options</caption>
   * StreamChat.getInstance('api_key', { timeout: 5000 })
   * @example <caption>secret is optional and only used in server side mode</caption>
   * StreamChat.getInstance('api_key', 'secret', { httpsAgent: customAgent })
   *
   * @param key - The API key.
   * @param options - Additional options; here you can pass custom options to the axios instance (optional).
   * @param options.browser - Enforce the client to be in browser mode (optional).
   * @param options.warmUp - If `true`, the client will open a connection as soon as possible to speed up following requests (optional, defaults to `false`).
   * @param options.logLevel - Minimum log level for the default sink (optional, defaults to `'info'`).
   * @param options.logOptions - Per-scope sink/level overrides for `chatLoggerSystem` (optional).
   * @param options.timeout - Request timeout (optional, defaults to `3000`).
   * @param options.httpsAgent - Custom `httpsAgent` (optional, in Node defaults to `https.agent()`).
   * @returns The shared client instance.
   */
  public static getInstance(key: string, options?: StreamChatOptions): StreamChat {
    if (!StreamChat._instance) {
      StreamChat._instance = new StreamChat(key, options);
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
   * Sets the current user and opens a WebSocket connection.
   *
   * @param user - Data about this user, e.g. `{ name: 'john' }`.
   * @param userTokenOrProvider - A token string or an async provider that returns one.
   * @returns A promise that resolves when the connection is set up.
   */
  connectUser = async (
    user: OwnUserResponse | UserResponse,
    userTokenOrProvider: TokenOrProvider,
  ) => {
    if (!user.id) {
      throw new Error('The "id" field on the user is missing');
    }

    /**
     * Calling connectUser multiple times is potentially the result of a bad integration; however,
     * if the user ID remains the same we don't throw an error.
     */
    if (this.userId === user.id && this.setUserPromise) {
      logger
        .withExtraTags('connectUser')
        .warn(
          'Detected consecutive calls to connectUser. Ideally, this function should only be called once.',
        );
      return this.setUserPromise;
    }

    if (this.userId) {
      throw new Error(
        'Use client.disconnect() before trying to connect as a different user. connectUser was called twice.',
      );
    }

    if (this.node && !this.options.allowServerSideConnect) {
      logger
        .withExtraTags('connectUser')
        .warn(
          'Do not use connectUser server-side. connectUser impacts MAU and concurrent connection usage, and therefore your bill. If you have a valid use case, set "allowServerSideConnect: true" in the client options to disable this warning.',
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
   * Sets the current user and opens a WebSocket connection.
   *
   * @deprecated Use {@link StreamChat.connectUser} instead. Its naming is more consistent with its functionality.
   *
   * @param user - Data about this user, e.g. `{ name: 'john' }`.
   * @param userTokenOrProvider - A token string or an async provider that returns one.
   * @returns A promise that resolves when the connection is set up.
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
   * Disconnects the WebSocket connection, without removing the user set on client.
   * client.closeConnection will not trigger default auto-retry mechanism for reconnection. You need
   * to call `client.openConnection` to reconnect to the WebSocket.
   *
   * This is mainly useful on mobile side. You can only receive push notifications
   * if you don't have an active WebSocket connection.
   * So when your app goes to background, you can call `client.closeConnection`.
   * And when app comes back to foreground, call `client.openConnection`.
   *
   * @param timeout - Max number of milliseconds to wait for the WebSocket close event before forcefully assuming
   *   successful disconnection. See https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent (optional).
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
   * Creates an instance of `ChannelManager`.
   *
   * @internal
   *
   * @param config - The channel manager configuration.
   * @param config.eventHandlerOverrides - The overrides for event handlers to be used (optional,
   *   defaults to `{}`).
   * @param config.options - The options used for the channel manager (optional, defaults to `{}`).
   * @param config.queryChannelsOverride - Override for the underlying `queryChannels` request (optional).
   * @returns A new `ChannelManager` instance.
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
   * Creates a new WebSocket connection with the current user.
   *
   * @returns The WebSocket connect promise, or an empty resolved promise if a connection is already active.
   */
  openConnection = () => {
    if (!this.userId) {
      throw Error(
        'User is not set on client, use client.connectUser or client.connectAnonymousUser instead',
      );
    }

    if (this.wsConnection?.isConnecting && this.wsPromise) {
      logger
        .withExtraTags('openConnection')
        .debug('A connection attempt is already in progress.');
      return this.wsPromise;
    }

    if (
      (this.wsConnection?.isHealthy || this.wsFallback?.isHealthy()) &&
      this._hasConnectionID()
    ) {
      logger
        .withExtraTags('openConnection')
        .debug('openConnection was called twice; a healthy connection already exists.');

      return;
    }

    this.clientId = `${this.userId}--${randomId()}`;
    this.wsPromise = this.connect();
    this._startCleaning();
    return this.wsPromise;
  };
  /**
   * Revokes tokens for a connected user issued before the given time.
   *
   * @param before - Cutoff date; tokens issued before this are revoked (optional, defaults to the current time).
   * @returns The updated users response.
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

    return await this.updateUsersPartial({ users });
  }

  /**
   * Retrieves application settings.
   *
   * @returns The application settings response.
   */
  async getAppSettings() {
    return await (this.appSettingsPromise = this.getApp());
  }

  /**
   * Disconnects the WebSocket and removes the user from client.
   *
   * @param timeout - Max number of milliseconds to wait for the WebSocket close event before forcefully assuming
   *   successful disconnection. See https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent (optional).
   * @returns The close-connection promise.
   */
  disconnectUser = (timeout?: number) => {
    logger.withExtraTags('disconnectUser').info('Disconnecting the client.');

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
      .catch((err) =>
        logger
          .withExtraTags('disconnectUser')
          .error('The close promise rejected during disconnect.', { error: err }),
      );

    // close the WS connection
    return closePromise;
  };

  /**
   *
   * @deprecated Please use client.disconnectUser instead.
   *
   * Disconnects the WebSocket and removes the user from client.
   */
  disconnect = this.disconnectUser;

  /**
   * Sets an anonymous user and opens a WebSocket connection.
   *
   * @returns A promise that resolves when the connection is set up.
   */
  connectAnonymousUser = () => {
    if (this.node && !this.options.allowServerSideConnect) {
      logger
        .withExtraTags('connectAnonymousUser')
        .warn(
          'Do not use connectUser server-side. connectUser impacts MAU and concurrent connection usage, and therefore your bill. If you have a valid use case, set "allowServerSideConnect: true" in the client options to disable this warning.',
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
   * Sets up a temporary guest user.
   *
   * @param user - Data about this user, e.g. `{ name: 'john' }`.
   * @returns A promise that resolves when the connection is set up.
   */
  async setGuestUser(user: UserResponse) {
    const response = await this.createGuest({ user });

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
   * Listens to events on all channels and users you're watching.
   *
   * @example
   * client.on('message.new', (event) => {
   *   console.log('my new message', event, channel.state.messages);
   * });
   *
   * @example
   * client.on((event) => {
   *   console.log(event.type);
   * });
   *
   * @param callbackOrString - The event type to listen for, or the callback when listening to all events.
   * @param callbackOrNothing - The callback to call when an event type was provided (optional).
   * @returns An object with an `unsubscribe()` method.
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

    logger.withExtraTags('on').debug(`Attaching a listener for the "${key}" event.`);
    set.add(callback);

    if (!this.listeners.has(key)) {
      this.listeners.set(key, set);
    }

    return {
      unsubscribe: () => {
        logger.withExtraTags('on').debug(`Removing the listener for the "${key}" event.`);
        set.delete(callback);
        if (!set.size) {
          this.listeners.delete(key);
        }
      },
    };
  }

  /**
   * Removes the event handler.
   *
   * @param callbackOrString - The event type, or the callback when removing an all-events listener.
   * @param callbackOrNothing - The callback to remove when an event type was provided (optional).
   */
  off(callback: EventHandler): void;
  off(eventType: string, callback: EventHandler): void;
  off(callbackOrString: EventHandler | string, callbackOrNothing?: EventHandler) {
    const key = callbackOrNothing ? (callbackOrString as ListenerKeys) : 'all';
    const callback = callbackOrNothing
      ? callbackOrNothing
      : (callbackOrString as EventHandler);

    logger.withExtraTags('off').debug(`Removing the listener for the "${key}" event.`);

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
   * Updates the members, watchers and read references of the currently active channels that contain this user.
   *
   * @param user - The updated user.
   */
  _updateMemberWatcherReferences = (user: UserResponse) => {
    const refMap = this.state.userChannelReferences[user.id] || {};
    for (const channelId in refMap) {
      const channel = this.activeChannels[channelId];
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
   * @deprecated Please use `_updateMemberWatcherReferences` instead.
   * @private
   */
  _updateUserReferences = this._updateMemberWatcherReferences;

  /**
   * Updates the messages from the currently active channels that contain this user, with the updated user object.
   *
   * @private
   *
   * @param user - The updated user.
   */
  _updateUserMessageReferences = (user: UserResponse) => {
    const refMap = this.state.userChannelReferences[user.id] || {};

    for (const channelId in refMap) {
      const channel = this.activeChannels[channelId];

      if (!channel) continue;

      const state = channel.state;

      /** update the messages from this user. */
      state?.updateUserMessages(user);
    }
  };

  /**
   * Deletes the messages from the currently active channels that contain this user.
   *
   * If `hardDelete` is `true`, all the content of the message will be stripped down.
   * Otherwise, only `message.type` will be set as `'deleted'`.
   *
   * @private
   *
   * @param user - The user whose messages should be deleted.
   * @param hardDelete - Whether to fully strip the message content (optional, defaults to `false`).
   * @param deletedAt - Timestamp to mark messages as deleted at (optional).
   */
  _deleteUserMessageReference = (
    user: UserResponse,
    hardDelete = false,
    deletedAt?: LocalMessage['deleted_at'],
  ) => {
    const refMap = this.state.userChannelReferences[user.id] || {};

    for (const channelId in refMap) {
      const channel = this.activeChannels[channelId];
      if (channel) {
        const state = channel.state;

        /** deleted the messages from this user. */
        state?.deleteUserMessages(user, hardDelete, deletedAt);
      }
    }
  };

  /**
   * Handle the following user-related events:
   * - `user.presence.changed`
   * - `user.updated`
   * - `user.deleted`
   *
   * @private
   *
   * @param event - The user event.
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
    logger
      .withExtraTags('_handleClientEvent')
      .debug(`Received an event of type "${event.type}".`, { event });

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
    logger
      .withExtraTags('recoverState')
      .info(`Starting state recovery with connection ID ${this._getConnectionID()}.`);

    const cids = Object.keys(this.activeChannels);
    if (cids.length && this.recoverStateOnReconnect) {
      logger
        .withExtraTags('recoverState')
        .info(`Starting the query for ${cids.length} channel(s).`);

      await this.queryChannelsAndHydrate({
        filter_conditions: {
          cid: { $in: cids },
        },
        limit: 30,
        sort: [{ field: 'last_message_at', direction: -1 }],
      });

      logger.withExtraTags('recoverState').info('Finished querying channels.');
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
        logger
          .withExtraTags('connect')
          .warn('The WebSocket connection failed; falling back to long-polling.');
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
   * Checks connectivity with the server for warmup purposes.
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
   * Queries users and watches user presence.
   *
   * @param request - The query users request payload (optional). The inner `payload` accepts
   *   MongoDB-style filter conditions, sort directions (e.g. `[{ field: 'last_active', direction: -1 }]`),
   *   and options such as `presence`.
   * @returns The user query response.
   */
  override async queryUsers(request?: { payload?: Gen_QueryUsersPayload }) {
    // Make sure we wait for the connect promise if there is a pending one
    await this.wsPromise;

    const data = await super.queryUsers(request);
    this.state.updateUsers(data.users);

    return data;
  }

  /**
   * List user groups with cursor-based pagination.
   *
   * @param options - The query options (optional, defaults to `{}`).
   * @returns User group query response.
   */
  async queryUserGroups(options: QueryUserGroupsOptions = {}) {
    return await this.api.get<QueryUserGroupsResponse>(
      this.baseURL + '/usergroups',
      options,
    );
  }
  /**
   * Queries user bans.
   *
   * @param request - The query banned users request payload (optional). The inner `payload`
   *   accepts MongoDB-style filter conditions, sort directions
   *   (e.g. `[{ field: 'created_at', direction: 1 }]`), and options such as `limit`, `offset`,
   *   and `exclude_expired_bans`.
   * @returns The ban query response.
   */
  async queryBannedUsers(request?: { payload?: QueryBannedUsersPayload }) {
    // Return a list of user bans
    return await super.queryBannedUsers(request);
  }

  /**
   * Queries channels and returns the full API response including top-level metadata such as
   * `predefined_filter`.
   *
   * This exists as a compatibility bridge, as changing `queryChannelsRequest()` to return
   * `QueryChannelsAPIResponse` would be a breaking change because it currently returns
   * only the channel list. In the next major release, the request/response APIs should
   * be consolidated so callers can access the full response through the primary API.
   *
   * @param request - The query channels request payload (optional). Accepts MongoDB-style filter
   *   conditions, sort directions (e.g. `[{ field: 'created_at', direction: -1 }]`), and options
   *   such as `predefined_filter`, `filter_values`, and `sort_values`.
   * @returns The full query channels response.
   */
  override async queryChannels(request?: QueryChannelsRequest) {
    const defaultOptions: ChannelOptions = {
      state: true,
      watch: true,
      presence: false,
    };

    // Make sure we wait for the connect promise if there is a pending one
    await this.wsPromise;

    // TODO: probably serverside only thing, remove at some point
    if (!this._hasConnectionID()) {
      defaultOptions.watch = false;
    }

    const {
      predefined_filter,
      filter_values,
      sort_values,
      filter_conditions,
      ...restOptions
    } = request ?? {};

    // Build payload based on whether we're using a predefined filter or traditional filters
    const payload: QueryChannelsRequest = predefined_filter
      ? {
          predefined_filter,
          filter_values,
          sort_values,
          ...defaultOptions,
          ...restOptions,
        }
      : {
          filter_conditions,
          ...defaultOptions,
          ...restOptions,
        };

    return await super.queryChannels(payload);
  }

  /**
   * Queries channels and hydrates them into `Channel` instances on this client.
   *
   * Use the inherited `queryChannels()` from `ChatApi` when only the raw API response
   * is needed; this method wraps it with state hydration, `channels.queried` dispatch,
   * and offline-db sync.
   *
   * @param options - The query channels request payload (optional). Accepts MongoDB-style filter
   *   conditions, sort directions (e.g. `[{ field: 'created_at', direction: -1 }]`), and options
   *   such as `predefined_filter`, `filter_values`, and `sort_values`.
   * @param stateOptions - Options that only affect state management and aren't sent in the request
   *   (optional, defaults to `{}`).
   * @param stateOptions.skipInitialization - Skips the initialization of the state for the
   *   channels matching the IDs in the list (optional).
   * @param stateOptions.skipHydration - Skips returning the channels as instances of the `Channel`
   *   class and instead returns the raw query response (optional).
   * @param stateOptions.withResponse - Returns the full query response with hydrated channels.
   *   This is a compatibility bridge for internal callers that need response-level metadata while
   *   the default return value remains `Channel[]` (optional).
   * @returns The hydrated channel list, or the full response when `withResponse` is `true`.
   */
  async queryChannelsAndHydrate(
    options?: QueryChannelsRequest,
    stateOptions?: ChannelStateOptions & { withResponse: true },
  ): Promise<QueryChannelsResponseWithChannels>;
  async queryChannelsAndHydrate(
    options?: QueryChannelsRequest,
    stateOptions?: ChannelStateOptions,
  ): Promise<Channel[]>;
  async queryChannelsAndHydrate(
    options?: QueryChannelsRequest,
    stateOptions: ChannelStateOptions = {},
  ): Promise<Channel[] | QueryChannelsResponseWithChannels> {
    const queryChannelsResponse = await this.queryChannels(options);
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
   * Queries reactions for a message and hydrates any cached offline reactions before the network
   * request.
   *
   * @param request - The query reactions request payload, including the target message ID,
   *   MongoDB-style filters, sort directions (e.g. `[{ field: 'created_at', direction: -1 }]`),
   *   and pagination options.
   * @returns The query reactions response.
   */
  async queryReactionsAndHydrate(request: QueryReactionsRequest) {
    const { filter, next, id: messageId, sort, limit } = request;

    if (this.offlineDb?.getReactions && !next) {
      try {
        const reactionsFromDb = await this.offlineDb.getReactions({
          messageId,
          filters: filter,
          sort,
          limit,
        });

        if (reactionsFromDb) {
          this.dispatchEvent({
            type: 'offline_reactions.queried',
            offlineReactions: reactionsFromDb as ReactionResponse[],
          });
        }
      } catch (e) {
        offlineDbLogger
          .withExtraTags('queryReactionsAndHydrate')
          .warn('An error occurred while querying offline reactions.', { error: e });
      }
    }

    // Make sure we wait for the connect promise if there is a pending one
    await this.wsPromise;

    return await this.queryReactions(request);
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
   * Queries messages.
   *
   * @param request - The search request payload (optional). The inner `payload` accepts
   *   MongoDB-style filter conditions, a search query, and options such as `user_id`.
   * @returns The search messages response.
   */
  override async search(request?: { payload?: SearchPayload }) {
    if (request?.payload?.offset && request?.payload?.next) {
      throw Error(`Cannot specify "offset" with "next"`);
    }

    // Make sure we wait for the connect promise if there is a pending one
    await this.wsPromise;

    return await super.search(request);
  }

  /**
   * Sets the device info for the current client. It will be sent via the WS connection automatically.
   *
   * @param device - The device object.
   * @param device.id - Device ID.
   * @param device.push_provider - The push provider.
   */
  setLocalDevice(device: BaseDeviceFields) {
    if (
      (this.wsConnection?.isConnecting && this.wsPromise) ||
      ((this.wsConnection?.isHealthy || this.wsFallback?.isHealthy()) &&
        this._hasConnectionID())
    ) {
      throw new Error('Device cannot be set before opening a WebSocket connection');
    }

    this.options.device = device;
  }

  _addChannelConfig({ cid, config }: ChannelResponse) {
    if (this._cacheEnabled()) {
      this.configs[cid] = config;
    }
  }

  /**
   * Returns a new channel with the given type, ID and custom data.
   *
   * If you want to create a unique conversation between 2 or more users, you can leave out the ID
   * parameter and provide the list of members.
   * Make sure to await `channel.create()` or `channel.watch()` before accessing channel functions,
   * i.e. `channel = client.channel('messaging', { members: ['tommaso', 'thierry'] })` then
   * `await channel.create()` to assign an ID to the channel.
   *
   * @param channelType - The channel type.
   * @param channelIdOrCustom - The channel ID; you can leave this out if you want to create a
   *   conversation channel (optional).
   * @param custom - Custom data to attach to the channel (optional, defaults to `{}`).
   * @returns The channel object; initialize it using `channel.watch()`.
   */
  channel(channelType: string, channelId?: string | null, custom?: ChannelData): Channel;
  channel(channelType: string, custom?: ChannelData): Channel;
  channel(
    channelType: string,
    channelIdOrCustom?: string | ChannelData | null,
    custom: ChannelData = {},
  ) {
    if (!this.userId) {
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
   * channel based on member list instead of ID.
   *
   * If the channel already exists in `activeChannels` list, then we simply return it, since that
   * means the same channel was already requested or created.
   *
   * Otherwise we create a new instance of Channel class and return it.
   *
   * @private
   *
   * @param channelType - The channel type.
   * @param custom - Custom data to attach to the channel.
   * @returns The channel object; initialize it using `channel.watch()`.
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
   * It's a helper method for `client.channel()`, used to retrieve a channel given its ID.
   *
   * If the channel already exists in `activeChannels` list, then we simply return it, since that
   * means the same channel was already requested or created.
   *
   * Otherwise we create a new instance of `Channel` class and return it.
   *
   * @private
   *
   * @param channelType - The channel type.
   * @param channelId - The channel ID.
   * @param custom - Custom data to attach to the channel.
   * @returns The channel object; initialize it using `channel.watch()`.
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
        channel._data = { ...channel._data, custom: custom.custom };
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
   * Bans a user from all channels.
   *
   * @param targetUserId - The user to ban.
   * @param options - Ban options (optional).
   * @returns The server response.
   */
  async banUser(targetUserId: string, options?: BanUserOptions) {
    return await this.api.post<APIResponse>(this.baseURL + '/moderation/ban', {
      target_user_id: targetUserId,
      ...options,
    });
  }

  /**
   * Revoke a global ban for a user.
   *
   * @param targetUserId - The user to unban.
   * @param options - Unban options (optional).
   * @returns The server response.
   */
  async unbanUser(targetUserId: string, options?: UnBanUserOptions) {
    return await this.api.delete<APIResponse>(this.baseURL + '/moderation/ban', {
      target_user_id: targetUserId,
      ...options,
    });
  }

  /**
   * Shadow bans a user from all channels.
   *
   * @param targetUserId - The user to shadow ban.
   * @param options - Ban options (optional).
   * @returns The server response.
   */
  async shadowBan(targetUserId: string, options?: BanUserOptions) {
    return await this.banUser(targetUserId, {
      shadow: true,
      ...options,
    });
  }

  /**
   * Revoke a global shadow ban for a user.
   *
   * @param targetUserId - The user to remove the shadow ban for.
   * @param options - Unban options (optional).
   * @returns The server response.
   */
  async removeShadowBan(targetUserId: string, options?: UnBanUserOptions) {
    return await this.unbanUser(targetUserId, {
      shadow: true,
      ...options,
    });
  }
  async blockUser(blockedUserId: string) {
    const result = await this.blockUsers({
      blocked_user_id: blockedUserId,
    });
    if (this._cacheEnabled()) {
      this.blockedUsers.next(({ userIds }) => ({
        userIds: userIds.concat(blockedUserId),
      }));
    }
    return result;
  }

  override async getBlockedUsers() {
    const result = await super.getBlockedUsers();
    if (this._cacheEnabled()) {
      this.blockedUsers.partialNext({
        userIds: result.blocks.map(({ blocked_user_id }) => blocked_user_id),
      });
    }
    return result;
  }

  async unblockUser(blockedUserId: string) {
    const result = await this.unblockUsers({
      blocked_user_id: blockedUserId,
    });
    if (this._cacheEnabled()) {
      this.blockedUsers.next(({ userIds }) => ({
        userIds: userIds.filter((id) => id !== blockedUserId),
      }));
    }
    return result;
  }

  /**
   * Mutes a user.
   *
   * @param targetId - The user to mute.
   * @param options - Mute options (optional, defaults to `{}`).
   * @returns The server response.
   */
  async muteUser(targetId: string, options: MuteUserOptions = {}) {
    return await this.api.post<MuteUserResponse>(this.baseURL + '/moderation/mute', {
      target_id: targetId,
      ...options,
    });
  }

  /**
   * Unmutes a user.
   *
   * @param targetId - The user to unmute.
   * @returns The server response.
   */
  async unmuteUser(targetId: string) {
    return await this.api.post<APIResponse>(this.baseURL + '/moderation/unmute', {
      target_id: targetId,
    });
  }

  /**
   * Checks whether a user is muted. Can be used after `connectUser()` is called.
   *
   * @param targetId - The user ID to check.
   * @returns `true` if the user is muted, otherwise `false`.
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
   * Flag a message.
   *
   * @param targetMessageId - The message to flag.
   * @param options - Flag options (optional, defaults to `{}`).
   * @param options.reason - Reason for flagging (optional).
   * @returns The server response.
   */
  async flagMessage(targetMessageId: string, options: { reason?: string } = {}) {
    return await this.api.post<FlagMessageResponse>(this.baseURL + '/moderation/flag', {
      target_message_id: targetMessageId,
      ...options,
    });
  }

  /**
   * Flag a user.
   *
   * @param targetId - The user to flag.
   * @param options - Flag options (optional, defaults to `{}`).
   * @param options.reason - Reason for flagging (optional).
   * @returns The server response.
   */
  async flagUser(targetId: string, options: { reason?: string } = {}) {
    return await this.api.post<FlagUserResponse>(this.baseURL + '/moderation/flag', {
      target_user_id: targetId,
      ...options,
    });
  }

  /**
   * Unflag a message.
   *
   * @param targetMessageId - The message to unflag.
   * @returns The server response.
   */
  async unflagMessage(targetMessageId: string) {
    return await this.api.post<FlagMessageResponse>(this.baseURL + '/moderation/unflag', {
      target_message_id: targetMessageId,
    });
  }

  /**
   * Unflag a user.
   *
   * @param targetId - The user to unflag.
   * @returns The server response.
   */
  async unflagUser(targetId: string) {
    return await this.api.post<FlagUserResponse>(this.baseURL + '/moderation/unflag', {
      target_user_id: targetId,
    });
  }

  /**
   * Unblocks a message blocked by automod.
   *
   * @param targetMessageId - The message to unblock.
   * @returns The server response.
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
   * Transforms an expiration value into an ISO string.
   *
   * @param timeoutOrExpirationDate - Expiration date or timeout. Use `number` to set the timeout
   *   in seconds, `string` or `Date` to set the exact expiration date (optional).
   * @returns The expiration as an ISO string, or `null`.
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
   * Extracts a string message ID from either a message object or a message ID.
   *
   * @param messageOrMessageId - Message object or message ID.
   * @param errorText - Error message to report in case of message ID absence.
   * @returns The extracted message ID.
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
   * Pins the message.
   *
   * @param messageOrMessageId - Message object or message ID.
   * @param timeoutOrExpirationDate - Expiration date or timeout. Use `number` to set the timeout
   *   in seconds, `string` or `Date` to set the exact expiration date (optional).
   * @param pinnedAt - Date when the message should be pinned. It affects the order of pinned
   *   messages. Use a negative number to set relative time in the past, `string` or `Date` to
   *   set the exact date of pin (optional).
   * @returns The updated message response.
   */
  pinMessage(
    messageOrMessageId: string | { id: string },
    timeoutOrExpirationDate?: null | number | string | Date,
    pinnedAt?: number | string | Date,
  ) {
    const id = this._validateAndGetMessageId(
      messageOrMessageId,
      'Please specify the message id when calling pinMessage',
    );
    return this.updateMessagePartial({
      id,
      set: {
        pinned: true,
        pin_expires: this._normalizeExpiration(timeoutOrExpirationDate),
        pinned_at: this._normalizeExpiration(pinnedAt),
      },
    });
  }

  /**
   * Unpins the message that was previously pinned.
   *
   * @param messageOrMessageId - Message object or message ID.
   * @returns The updated message response.
   */
  unpinMessage(messageOrMessageId: string | { id: string }) {
    const id = this._validateAndGetMessageId(
      messageOrMessageId,
      'Please specify the message id when calling unpinMessage',
    );
    return this.updateMessagePartial({
      id,
      set: { pinned: false },
    });
  }

  /**
   * Updates the given message. When an `offlineDb` is registered the call is queued
   * so it is replayed on reconnect.
   */
  override async updateMessage(
    request: Parameters<ChatApi['updateMessage']>[0] & { message: { cid?: string } },
  ) {
    try {
      if (this.offlineDb) {
        return await this.offlineDb.queueTask<
          Awaited<ReturnType<ChatApi['updateMessage']>>
        >({
          task: {
            ...getPendingTaskChannelData(request.message?.cid),
            messageId: request.id,
            payload: [request],
            type: 'update-message',
          },
        });
      }
    } catch (error) {
      offlineDbLogger
        .withExtraTags('updateMessage')
        .error('Updating the message failed.', { error });
    }

    return await this._updateMessage(request);
  }

  async _updateMessage(request: Parameters<ChatApi['updateMessage']>[0]) {
    return await super.updateMessage(request);
  }

  /**
   * Deletes a message. When an `offlineDb` is registered the call is queued so it
   * is replayed on reconnect.
   */
  override async deleteMessage(request: Parameters<ChatApi['deleteMessage']>[0]) {
    try {
      if (this.offlineDb) {
        if (request.hard) {
          await this.offlineDb.hardDeleteMessage({ id: request.id });
        } else {
          await this.offlineDb.softDeleteMessage({
            id: request.id,
            deleteForMe: request.delete_for_me,
          });
        }
        return await this.offlineDb.queueTask<
          Awaited<ReturnType<ChatApi['deleteMessage']>>
        >({
          task: {
            messageId: request.id,
            payload: [request],
            type: 'delete-message',
          },
        });
      }
    } catch (error) {
      offlineDbLogger
        .withExtraTags('deleteMessage')
        .error('Deleting the message failed.', { error });
    }

    return this._deleteMessage(request);
  }

  async _deleteMessage(request: Parameters<ChatApi['deleteMessage']>[0]) {
    const result = await super.deleteMessage(request);

    // necessary to populate the below values as the server does not return the message in the response as deleted
    if (request.delete_for_me) {
      result.message.deleted_for_me = true;
      result.message.type = 'deleted';
    }

    return result;
  }

  /**
   * Returns the list of threads of the current user.
   *
   * @param options - Options object for pagination and limiting the participants and replies
   *   (optional, defaults to `{}`).
   * @param options.limit - Limits the number of threads to be returned (optional).
   * @param options.watch - Subscribes the user to the channels of the threads (optional).
   * @param options.participant_limit - Limits the number of participants returned per thread (optional).
   * @param options.reply_limit - Limits the number of replies returned per thread (optional).
   * @param options.filter - MongoDB style filters for threads (optional).
   * @param options.sort - MongoDB style sort for threads (optional).
   * @returns The list of threads and the next cursor.
   */
  async queryThreadsAndHydrate(options: QueryThreadsOptions = {}) {
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

    if (optionsWithDefaults.sort && optionsWithDefaults.sort.length > 0) {
      requestBody.sort = optionsWithDefaults.sort;
    }

    const response = await this.queryThreads(requestBody);

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
   * Returns the thread of a message by its ID, wrapped in a hydrated `Thread` instance.
   *
   * @param messageId - The message ID.
   * @param options - Options object for pagination and limiting the participants and replies
   *   (optional, defaults to `{}`).
   * @param options.watch - Subscribes the user to the channel of the thread (optional).
   * @param options.participant_limit - Limits the number of participants returned per thread (optional).
   * @param options.reply_limit - Limits the number of replies returned per thread (optional).
   * @returns The thread.
   */
  async getThreadAndHydrate(messageId: string, options: GetThreadOptions = {}) {
    if (!messageId) {
      throw new Error('Please specify the messageId when calling getThreadAndHydrate');
    }

    const optionsWithDefaults = {
      participant_limit: 100,
      reply_limit: 3,
      watch: true,
      ...options,
    };

    const response = await this.getThread({
      message_id: messageId,
      ...optionsWithDefaults,
    });

    return new Thread({ client: this, threadData: response.thread });
  }

  /**
   * Updates the given thread.
   *
   * @param messageId - The ID of the thread message which needs to be updated.
   * @param partialThreadObject - Should contain `set` or `unset` params for any of the thread's non-reserved fields.
   * @returns The updated thread.
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

    return await this.updateThreadPartial({
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
   * Sets the user agent string.
   *
   * @deprecated Use `sdkIdentifier` instead.
   *
   * @param userAgent - The user agent string.
   */
  setUserAgent(userAgent: string) {
    this.userAgent = userAgent;
  }

  _cacheEnabled = () => !this.options.disableCache;

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
   * Encodes the WS URL payload.
   *
   * @private
   *
   * @param client_request_id - The client request ID (optional).
   * @returns The JSON-encoded payload string.
   */
  _buildWSPayload = (client_request_id?: string) =>
    JSON.stringify({
      user_id: this.userId,
      user_details: this._user,
      device: this.options.device,
      client_request_id,
    });

  /**
   * Queries poll answers.
   *
   * @param request - The query poll answers request payload, including the poll ID, optional vote
   *   filter conditions, sort directions, and pagination options (`limit`, `offset`).
   * @param request.poll_id - The poll ID.
   * @param request.filter - Vote filter conditions.
   * @returns The poll answers.
   */
  async queryPollAnswers({
    poll_id,
    filter,
    ...options
  }: Parameters<ChatApi['queryPollVotes']>[0]) {
    return await this.queryPollVotes({
      poll_id,
      filter: {
        ...filter,
        is_answer: true,
      },
      ...options,
    });
  }

  /**
   * Uploads a file to the configured storage (defaults to Stream CDN).
   *
   * @param uri - The file to upload.
   * @param name - The name of the file (optional).
   * @param contentType - The content type of the file (optional).
   * @param user - User information (optional).
   * @param axiosRequestConfig - Axios config, e.g. `onUploadProgress` for progress tracking (optional).
   * @returns Response containing the file URL.
   */
  uploadFile_(
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
   * Uploads an image to the configured storage (defaults to Stream CDN).
   *
   * @param uri - The image to upload.
   * @param name - The name of the image (optional).
   * @param contentType - The content type of the image (optional).
   * @param user - User information (optional).
   * @param axiosRequestConfig - Axios config, e.g. `onUploadProgress` for progress tracking (optional).
   * @returns Response containing the image URL.
   */
  uploadImage_(
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
   * Marks the channels as delivered for the given messages and the user.
   *
   * @param request - Mark delivered options.
   * @returns The server response, or `undefined` if there are no messages to mark.
   */
  async markChannelsDelivered(request?: Gen_MarkDeliveredRequest) {
    if (!request?.latest_delivered_messages?.length) return;
    return await this.markDelivered(request);
  }

  syncDeliveredCandidates(collections: Channel[]) {
    this.messageDeliveryReporter.syncDeliveredCandidates(collections);
  }
}
