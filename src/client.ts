/* eslint no-unused-vars: "off" */
/* global process */

import type { AxiosInstance, AxiosRequestConfig } from 'axios';
import axios from 'axios';

import type { Channel } from './channel';
import type { ChannelMuteStatus } from './channel_state';
import { ChannelWatchStatus } from './channel_state';
import { ClientState } from './client_state';
import { UploadManager } from './uploadManager';
import { DevToken } from './signing';
import { TokenManager, type TokenManagerMinimalUser } from './token_manager';
import { ApiClient } from './api-client';
import {
  axiosParamsSerializer,
  formatMessage,
  getEnv,
  invokeEventListener,
  isOwnUserBaseProperty,
  randomId,
  sanitizeOutgoingAttachments,
} from './utils';
import { nowNs } from './utils/time';
import { normalizeUploadFile } from './upload-utils';

import type {
  APIResponse,
  AppIdentifier,
  ChannelInput,
  ChannelMute,
  ChannelOptions,
  ChannelResponse,
  ChannelStateOptions,
  ChannelStateResponseFields,
  Configs,
  ConnectAPIResponse,
  DeviceIdentifier,
  Event,
  EventHandler,
  EventType,
  FileUploadInput,
  GetThreadOptions,
  LocalMessage,
  OwnUserResponse,
  PartializeAllBut,
  PinMessageOptions,
  QueryChannelsRequest,
  QueryChannelsResponse,
  QueryThreadsRequest,
  ReactionResponse,
  SdkIdentifier,
  StreamRequestOptions,
  TokenOrProvider,
  UnBanUserOptions,
  UpdateUserPartialRequest,
  UserMuteResponse,
  UserRequest,
  UserResponse,
} from './types';
import { isWSFailure } from './errors';
import type { APIError } from './errors';
import { chatLoggerSystem } from './logger';
import { DEFAULT_THREAD_PARTICIPANT_LIMIT, type Thread } from './thread';
import { Moderation } from './moderation';
import { ThreadManager } from './thread_manager';
import { DEFAULT_QUERY_CHANNELS_MESSAGE_LIST_PAGE_SIZE } from './constants';
import { PollManager } from './poll_manager';
import { EntityStore } from './entityStore/EntityStore';
import { ChannelManager } from './ChannelManager';
import {
  ConnectionIdManager,
  ConnectionRecoveryManager,
  NetworkConnectionObserver,
  WSConnection,
} from './connection';
import { MessageDeliveryReporter } from './messageDelivery';
import { NotificationManager } from './notifications';
import { ReminderManager } from './reminders';
import type { AbstractOfflineDB } from './offline-support';
import { FixedSizeQueueCache } from './utils/FixedSizeQueueCache';
import { isEqual } from './utils/mergeWith/mergeWithCore';
import type { MessageComposer } from './messageComposer';
import type { InstanceConfigTree, InstanceSetupState } from './configuration';
import type { DeepPartial } from './types.utility';
import { InstanceConfigurationRegistry } from './configuration/InstanceConfigurationRegistry';
import { applyInstanceConfiguration } from './configuration/utils/applyInstanceConfiguration';
import { StateStore } from '@stream-io/state-store';
import type { Unsubscribe } from '@stream-io/state-store';
import type {
  ConnectUserDetailsRequest,
  FileUploadRequest,
  GetApplicationResponse as Gen_GetApplicationResponse,
  MarkDeliveredRequest as Gen_MarkDeliveredRequest,
  ImageUploadRequest,
  WSAuthMessage,
  WSEvent,
} from './gen/models';
import { ChatApi } from './gen-imports';
import type { StreamResponse } from './types';

const logger = chatLoggerSystem.getLogger('client');
const offlineDbLogger = chatLoggerSystem.getLogger('offline-db');

export type QueryChannelsResponseWithChannels = Omit<
  QueryChannelsResponse,
  'channels'
> & {
  channels: Channel[];
};

export type BlockedUsersState = { userIds: string[] };

export type ChannelConfigsState = {
  configs: Configs;
};

export type ClientUser = PartializeAllBut<OwnUserResponse, 'id'> & { anon?: boolean };

/**
 * After a thread query with `watch: true` the server watches the thread's channel, as for
 * `channel.watch()` and `queryChannels`.
 */
const markThreadChannelWatched = ({ channel }: Thread) => {
  channel.watchStatus = ChannelWatchStatus.Watching;
};

export class StreamChat extends ChatApi {
  private static _instance?: unknown | StreamChat; // type is undefined|StreamChat, unknown is due to TS limitations with statics
  messageDeliveryReporter: MessageDeliveryReporter;
  /** @internal */
  uploadManager: UploadManager;
  /** @private */
  _user?: ClientUser;
  appSettingsPromise?: Promise<StreamResponse<Gen_GetApplicationResponse>>;
  threads: ThreadManager;
  polls: PollManager;
  /**
   * Channel lists (`ChannelPaginator`s kept in sync with WS events, with ownership arbitration
   * between them). Register lists with `insertPaginator()` / `removePaginator()`. It handles events
   * only once something calls its ref-counted `registerSubscriptions()`. It is configured on the
   * manager itself (`setOwnershipResolver`, `addEventHandler`, ...), not through the client
   * options.
   */
  channelManager: ChannelManager;
  /**
   * On reconnect, re-runs each loaded channel list's first-page query and reloads each active
   * channel and thread, then dispatches `connection.recovered`. Disable it when the app recovers
   * state itself: `client.config.set({ client: { connectionRecovery: { enabled: false } } })`.
   */
  connectionRecovery: ConnectionRecoveryManager;
  /**
   * The device's network status, separate from the WebSocket's ({@link wsConnection}). Platforms
   * report it through `client.config.set({ client: { networkConnection: { statusReporter } } })` or
   * `client.networkConnection.setStatusReporter(...)`. Browsers get a reporter automatically;
   * elsewhere a stand-in mirrors the WebSocket. `isOnline` is `undefined` (unknown, not offline)
   * until something reports.
   */
  networkConnection: NetworkConnectionObserver;
  /**
   * The connection ID (the WebSocket's, or the long-poll's after an `enableWSFallback` switch). A
   * request with `watch` or `presence` waits here for the handshake (see `requiresConnectionId`).
   */
  connectionIdManager: ConnectionIdManager;
  /**
   * Client-global store with one canonical copy of each message. The channel and thread paginators
   * read and write messages through it, so a message held in several of them stays consistent.
   */
  messageStore: EntityStore<LocalMessage>;
  offlineDb?: AbstractOfflineDB;
  notifications: NotificationManager;
  reminders: ReminderManager;
  axiosInstance: AxiosInstance;
  baseURL?: string;
  cleaningIntervalRef?: ReturnType<typeof setTimeout>;
  clientId?: string;
  key: string;
  listeners: Map<EventType, Set<EventHandler>>;
  /**
   * When true, threads are not cleaned up while the channel state is initializing (for SDKs that
   * recover channel state themselves).
   */
  preventThreadCleanup = false;
  moderation: Moderation;
  mutedChannels: ChannelMute[];
  readonly mutedUsersStore: StateStore<{ mutedUsers: UserMuteResponse[] }>;
  /**
   * Reactive store behind {@link channelServerConfigs}: the backend's channel configs, not the ones
   * registered through {@link config}.
   *
   * @internal
   */
  readonly channelServerConfigsStore: StateStore<ChannelConfigsState>;
  blockedUsers: StateStore<BlockedUsersState>;
  setUserPromise: ConnectAPIResponse | null;
  state: ClientState;
  tokenManager: TokenManager;
  user?: ClientUser;
  userAgent?: string;
  wsBaseURL?: string;
  wsConnection: WSConnection;
  wsPromise: ConnectAPIResponse | null;
  private _wsPromiseSettled = true;
  private _wsConnectId = 0;
  private _resolveWsPromise?: (value: Awaited<ConnectAPIResponse>) => void;
  private _rejectWsPromise?: (reason?: unknown) => void;

  /**
   * Whether the client runs in a browser: the `client.browser` option, else whether `window`
   * exists.
   */
  get browser(): boolean {
    return this.config.getConfig('client')?.browser ?? typeof window !== 'undefined';
  }
  get node(): boolean {
    return !this.browser;
  }
  get anonymous(): boolean {
    return this.tokenManager.isAnonymous;
  }
  get userId() {
    return this.user?.id;
  }
  /** @deprecated Use `userId` instead. */
  get userID() {
    return this.user?.id;
  }
  /** @deprecated Use `clientId` instead. */
  get clientID() {
    return this.clientId;
  }
  set clientID(id: string | undefined) {
    this.clientId = id;
  }
  get api() {
    return this.apiClient;
  }
  sdkIdentifier?: SdkIdentifier;
  deviceIdentifier?: DeviceIdentifier;
  appIdentifier?: AppIdentifier;
  private cachedUserAgent?: string;
  readonly messageComposerCache: FixedSizeQueueCache<string, MessageComposer>;
  /**
   * Configuration registered for the instances the SDK creates (channels, threads, composers, the
   * client's own managers). Not the server-provided channel configs ({@link channelServerConfigs}).
   */
  readonly config = new InstanceConfigurationRegistry();
  /** Teardown for the `'client'` setup function, released by {@link disconnectUser}. */
  private unsubscribeClientConfiguration?: Unsubscribe;

  /**
   * Initializes a client.
   *
   * **Prefer `StreamChat.getInstance()`: a second client opens a second WebSocket connection.**
   *
   * @example <caption>initialize the client in user mode</caption>
   * new StreamChat('api_key')
   * @example <caption>initialize the client with configuration</caption>
   * new StreamChat('api_key', { client: { axiosRequestConfig: { timeout: 5000 } } })
   *
   * @param key - The API key.
   * @param config - Declarative configuration, the tree `client.config.set()` takes (optional).
   *   Applied before anything is built, so it reaches the managers and the options read once at
   *   construction (`client.baseURL`, `client.axiosRequestConfig`, `client.notificationManager`).
   */
  constructor(key: string, config?: DeepPartial<InstanceConfigTree>) {
    // The generated base class needs the ApiClient before `this` exists, so it is bound afterwards.
    super(new ApiClient());
    this.apiClient.client = this;

    this.key = key;

    // Seeded first: the options read below come from the `client` slice.
    if (config) this.config.set(config);
    const clientConfig = this.config.getConfig('client');
    this.listeners = new Map();
    this.state = new ClientState({ client: this });
    // channels to hide ws events from
    this.mutedChannels = [];
    this.mutedUsersStore = new StateStore<{ mutedUsers: UserMuteResponse[] }>({
      mutedUsers: [],
    });
    this.channelServerConfigsStore = new StateStore<ChannelConfigsState>({
      configs: {},
    });
    this.blockedUsers = new StateStore<BlockedUsersState>({ userIds: [] });

    this.moderation = new Moderation(this);

    this.notifications = clientConfig?.notificationManager ?? new NotificationManager();
    this.uploadManager = new UploadManager(this);

    this.axiosInstance = axios.create({
      timeout: 3000,
      withCredentials: false,
      ...(clientConfig?.axiosRequestConfig as AxiosRequestConfig | undefined),
      paramsSerializer: axiosParamsSerializer,
    });

    this.setBaseURL(clientConfig?.baseURL || 'https://chat.stream-io-api.com');

    const streamLocalTestRun = getEnv('STREAM_LOCAL_TEST_RUN');
    const streamLocalTestHost = getEnv('STREAM_LOCAL_TEST_HOST');
    if (streamLocalTestRun) {
      this.setBaseURL('http://localhost:3030');
    }
    if (streamLocalTestHost) {
      this.setBaseURL(`http://${streamLocalTestHost}`);
    }

    // Both before the WebSocket, which subscribes to the network store and drives the ID's
    // lifecycle.
    this.connectionIdManager = new ConnectionIdManager();
    this.networkConnection = new NetworkConnectionObserver({ client: this });
    this.networkConnection.registerSubscriptions();

    // The socket itself opens in `connectUser`.
    this.wsConnection = new WSConnection({ client: this });
    this.wsConnection.registerSubscriptions();
    this.wsPromise = null;
    this.setUserPromise = null;

    this.tokenManager = new TokenManager();

    this.messageStore = new EntityStore<LocalMessage>({
      getEntityId: (message) => message.id,
    });
    // Before the managers that claim channels in its store.
    this.channelManager = new ChannelManager({ client: this });
    this.threads = new ThreadManager({ client: this });
    this.polls = new PollManager({ client: this });
    this.connectionRecovery = new ConnectionRecoveryManager({ client: this });
    this.connectionRecovery.registerSubscriptions();
    this.reminders = new ReminderManager({ client: this });
    this.messageDeliveryReporter = new MessageDeliveryReporter({ client: this });
    this.messageComposerCache = new FixedSizeQueueCache<string, MessageComposer>(64);
    // a cached composer, such as a message edit's, keeps the channel it was built with
    this.channelManager.channelStore.addClaim({
      heldBy: () =>
        this.messageComposerCache.values().map((composer) => composer.channel),
      name: 'message-composer-cache',
    });

    // Last: everything a setup function might reach exists now. Subscribing applies the current
    // configuration at once, so deriving it here too would run every `initializeConfig` twice.
    this.wireClientConfiguration();
  }

  /**
   * Subscribes the client's managers to the `'client'` configuration key. Called by the constructor
   * and by {@link _setUser}, because {@link disconnectUser} releases the subscription (to run the
   * setup function's teardown) while the managers outlive the user. Idempotent.
   */
  private wireClientConfiguration() {
    if (this.unsubscribeClientConfiguration) return;
    this.unsubscribeClientConfiguration = applyInstanceConfiguration({
      args: { client: this },
      config: this.config,
      key: 'client',
      applyConfig: () => this.initializeManagerConfig(),
      reinitializeConfig: () => this.initializeManagerConfig(),
    });
  }

  /**
   * Derives each manager's configuration from the package defaults plus the `client` subtree. Every
   * manager is written unconditionally: it is a derivation, not a merge, so `config.reset()` and
   * removed fields take effect.
   */
  private initializeManagerConfig() {
    const config = this.config.getConfig('client');

    this.connectionRecovery.initializeConfig(config?.connectionRecovery);
    // Installs the platform listener named by the slice, falling back to the browser default.
    this.networkConnection.initializeConfig(config?.networkConnection);
    this.wsConnection.initializeConfig(config?.wsConnection);
    this.reminders.initializeConfig(config?.reminders);
    this.threads.initializeConfig(config?.threads);
    this.messageDeliveryReporter.initializeConfig(config?.messageDelivery);
    this.notifications.initializeConfig(config?.notifications);
  }

  get mutedUsers() {
    return this.mutedUsersStore.getLatestValue().mutedUsers;
  }

  set mutedUsers(mutedUsers: UserMuteResponse[]) {
    this.mutedUsersStore.next({ mutedUsers });
  }

  /**
   * Cache of server-provided channel configuration, keyed by cid (a channel's `config_overrides`
   * can make it differ from other channels of its type). Read it through
   * {@link Channel.serverConfig}. Assigning through the setter notifies subscribers, mutating the
   * record in place does not (prefer {@link _addChannelConfig}).
   *
   * @internal
   */
  get channelServerConfigs() {
    return this.channelServerConfigsStore.getLatestValue().configs;
  }

  /** @internal */
  set channelServerConfigs(configs: Configs) {
    this.channelServerConfigsStore.next({ configs });
  }

  /**
   * Returns the shared client instance, so there is only one client and WebSocket connection.
   *
   * **After the first call, the `key` and `config` parameters are ignored.**
   *
   * @example <caption>initialize the client in user mode</caption>
   * StreamChat.getInstance('api_key')
   * @example <caption>initialize the client with configuration</caption>
   * StreamChat.getInstance('api_key', { client: { axiosRequestConfig: { timeout: 5000 } } })
   *
   * @param key - The API key.
   * @param config - Declarative configuration, as for the constructor (optional).
   * @returns The shared client instance.
   */
  public static getInstance(
    key: string,
    config?: DeepPartial<InstanceConfigTree>,
  ): StreamChat {
    if (!StreamChat._instance) {
      StreamChat._instance = new StreamChat(key, config);
    }

    return StreamChat._instance as StreamChat;
  }

  setOfflineDBApi(offlineDBInstance: AbstractOfflineDB) {
    if (this.offlineDb) {
      return;
    }

    this.offlineDb = offlineDBInstance;
  }

  /**
   * Creates a development token for apps with auth checks disabled. Never use one in production.
   * See {@link DevToken}.
   *
   * @param userId - The ID of the user the token is for.
   * @returns The development token.
   */
  devToken(userId: string) {
    return DevToken(userId);
  }

  getAuthType() {
    return this.anonymous ? 'anonymous' : 'jwt';
  }

  setBaseURL(baseURL: string) {
    this.baseURL = baseURL;
    this.wsBaseURL = this.baseURL.replace('http', 'ws').replace(':3030', ':8800');
  }

  _getConnectionID = () => this.connectionIdManager.connectionId;

  _hasConnectionID = () => Boolean(this._getConnectionID());

  /** @deprecated Use `client.config.setSetupFunction('messageComposer', fn)`. */
  public setMessageComposerSetupFunction = (
    setupFunction: InstanceSetupState<'messageComposer'>['setupFunction'],
  ) => {
    this.config.setSetupFunction('messageComposer', setupFunction);
  };

  /**
   * Sets the current user and opens the WebSocket connection.
   *
   * @param user - The user, with its required `id`, e.g. `{ id: 'john', name: 'John' }`.
   * @param userTokenOrProvider - A token string, or an async provider that resolves to one.
   * @returns A promise that resolves when the connection is set up.
   * @throws For a different user, unless `disconnectUser()` ran first.
   */
  connectUser = async (user: ClientUser, userTokenOrProvider: TokenOrProvider) => {
    if (!user.id) {
      throw new Error('The "id" field on the user is missing');
    }

    // Repeated calls for the same user warn and return the existing promise.
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

    if (this.node && !this.config.getConfig('client')?.allowServerSideConnect) {
      logger
        .withExtraTags('connectUser')
        .warn(
          'Do not use connectUser server-side. connectUser impacts MAU and concurrent connection usage, and therefore your bill. If you have a valid use case, set `client.allowServerSideConnect: true` in the client configuration to disable this warning.',
        );
    }

    const setTokenPromise = this._setToken(user, userTokenOrProvider);
    this._setUser(user);

    const wsPromise = this.openConnection();

    const setUserPromise = Promise.all([setTokenPromise, wsPromise]).then(
      (result) => result[1], // only the connection promise
    );
    this.setUserPromise = setUserPromise;

    try {
      return await setUserPromise;
    } catch (err) {
      // `disconnectUser()` rejects an in-flight handshake, so clean up only if nothing has taken
      // over: a newer `connectUser()` changes `setUserPromise`; `connectAnonymousUser()` (which
      // never sets it) or a bare `disconnectUser()` changes `userId`.
      if (this.setUserPromise === setUserPromise && this.userId === user.id) {
        if (!this.config.getConfig('client')?.persistUserOnConnectionFailure) {
          // No user is kept: the app is expected to call `connectUser` again.
          this.disconnectUser();
        } else if (!isWSFailure(err as APIError)) {
          // A terminal failure (rejected token, bad API key) will not fix itself: close the socket
          // so `StableWSConnection` stops retrying.
          this.closeConnection();
        }
      }
      throw err;
    }
  };

  /**
   * Sets the current user and opens the WebSocket connection.
   *
   * @deprecated Use {@link StreamChat.connectUser} instead.
   *
   * @param user - The user, with its required `id`, e.g. `{ id: 'john', name: 'John' }`.
   * @param userTokenOrProvider - A token string, or an async provider that resolves to one.
   * @returns A promise that resolves when the connection is set up.
   */
  setUser = this.connectUser;

  _setToken = (user: TokenManagerMinimalUser, userTokenOrProvider: TokenOrProvider) =>
    this.tokenManager.setTokenOrProvider(userTokenOrProvider, user);

  _setUser(user: TokenManagerMinimalUser) {
    // Mirrors the backend's copy of the user, with reserved and own-user properties.
    this.user = user;
    // The copy given to `connectUser`, used for requests.
    this._user = { ...user };
    // Re-arms the `'client'` key if a previous `disconnectUser` released it.
    this.wireClientConfiguration();
  }

  /**
   * Closes the WebSocket without removing the user, and without auto-reconnect: call
   * `openConnection` to reconnect. Mainly for mobile: push notifications arrive only while no
   * WebSocket is active, so close on background and reopen on foreground. After an
   * `enableWSFallback` switch it also closes the long-poll, telling the server to close its
   * connection ID.
   *
   * @param timeout - Milliseconds to wait for the WebSocket close event and for the long-poll close
   *   request. Defaults to 1s and 2s respectively.
   */
  closeConnection = async (timeout?: number) => {
    this.channelManager.resetAIStateOnChannels();
    this.channelManager.markChannelsWatchInterrupted();

    if (this.cleaningIntervalRef != null) {
      clearInterval(this.cleaningIntervalRef);
      this.cleaningIntervalRef = undefined;
    }

    await this.wsConnection?.disconnect(timeout);

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
   * Opens a WebSocket connection for the current user. After an `enableWSFallback` switch it
   * reconnects the long-poll instead: the client never goes back to the WebSocket.
   *
   * @returns The connect promise, or `undefined` when a healthy connection already exists.
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

    if (this.wsConnection?.isHealthy && this.connectionIdManager.connectionId) {
      logger
        .withExtraTags('openConnection')
        .debug('openConnection was called twice; a healthy connection already exists.');

      return;
    }

    this.clientId = `${this.userId}--${randomId()}`;
    const wsPromise = this._bindWsPromise(this.connect());
    this._startCleaning();
    return wsPromise;
  };

  /** Rejects the shared `wsPromise` and invalidates any in-flight connect attempt. */
  private _rejectPendingWsPromise = (reason: Error) => {
    if (!this._wsPromiseSettled) {
      // invalidate in-flight attempts so a late settle cannot revive this promise
      this._wsConnectId += 1;
      this._wsPromiseSettled = true;
      // Avoid unhandled promise rejection errors
      this.wsPromise?.catch(() => {
        // noop - real awaiters still observe the rejection
      });
      this._rejectWsPromise?.(reason);
    }
  };

  /**
   * Keeps a single pending `wsPromise` across close/reopen, so callers already awaiting it are not
   * stranded when `openConnection` starts a new connect.
   */
  private _bindWsPromise = (connectPromise: ConnectAPIResponse): ConnectAPIResponse => {
    const connectId = ++this._wsConnectId;

    let pending = this.wsPromise;
    if (this._wsPromiseSettled || !pending) {
      this._wsPromiseSettled = false;
      pending = new Promise((resolve, reject) => {
        this._resolveWsPromise = resolve;
        this._rejectWsPromise = reject;
      });
      this.wsPromise = pending;
    }

    connectPromise.then(
      (value) => {
        if (connectId !== this._wsConnectId) return;
        this._wsPromiseSettled = true;
        this._resolveWsPromise?.(value);
      },
      (error) => {
        if (connectId !== this._wsConnectId) return;
        this._wsPromiseSettled = true;
        this._rejectWsPromise?.(error);
      },
    );

    return pending;
  };

  /**
   * Revokes the connected user's tokens issued before the given time.
   *
   * @param before - Cutoff date; tokens issued before it are revoked (optional). Defaults to now.
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The updated users response.
   */
  async revokeTokens(before?: Date | null, requestOptions?: StreamRequestOptions) {
    if (!before) {
      before = new Date();
    }

    const users: UpdateUserPartialRequest[] = [
      {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        id: this.userId!,
        set: {
          revoke_tokens_issued_before: before,
        },
      },
    ];

    return await this.updateUsersPartial({ users }, requestOptions);
  }

  /**
   * Retrieves application settings.
   *
   * @param   _request - Unused. Holds the request position so `requestOptions` stays the
   *   second argument, as on the generated methods; pass `undefined`.
   * @param   requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The application settings response.
   */
  async getAppSettings(
    _request?: Record<string, never>,
    requestOptions?: StreamRequestOptions,
  ) {
    return await (this.appSettingsPromise = this.getApp(undefined, requestOptions));
  }

  /**
   * Disconnects the WebSocket and removes the user and its state.
   *
   * @param timeout - Passed to {@link closeConnection} (optional).
   */
  disconnectUser = (timeout?: number) => {
    logger.withExtraTags('disconnectUser').info('Disconnecting the client.');

    delete this.user;
    delete this._user;

    const teardownReason = new Error(
      'Connection was closed because disconnectUser() was called',
    );

    this._rejectPendingWsPromise(teardownReason);
    this.wsPromise = null;

    const closePromise = this.closeConnection(timeout);
    // After starting the close, which reads the connection ID synchronously (the long-poll's close
    // request carries it).
    this.connectionIdManager.rejectConnectionId(teardownReason);

    // Empties the channel lists (they hold the disconnected user's channels) but keeps them
    // registered: which lists exist is app configuration. Reset first so each list empties in one
    // update.
    this.channelManager.resetPaginatorStates();
    // Disconnects every channel and empties the store, then rethrows the first error a holder
    // threw. Logged, not propagated, so the rest of the logout still runs.
    try {
      this.channelManager.clearChannels();
    } catch (error) {
      logger
        .withExtraTags('disconnectUser')
        .error('Clearing the channels failed during disconnect.', { error });
    }
    this.state = new ClientState({ client: this });
    this.threads.resetState();
    // Channel mutes are per-user: stale ones would resolve `muted` filters against the previous
    // user.
    this.mutedChannels = [];
    this.uploadManager.reset();
    this.messageComposerCache.clear();
    // Runs the `'client'` setup function's teardown. Cleared so repeated calls cannot double-run
    // it.
    this.unsubscribeClientConfiguration?.();
    this.unsubscribeClientConfiguration = undefined;

    // Deferred so the long-poll close can still authenticate; a newer connect may have set the next
    // user and token by then.
    closePromise
      .finally(() => {
        if (!this.userId) this.tokenManager.reset();
      })
      .catch((err) =>
        logger
          .withExtraTags('disconnectUser')
          .error('The close promise rejected during disconnect.', { error: err }),
      );

    return closePromise;
  };

  /** @deprecated Use `client.disconnectUser` instead. */
  disconnect = this.disconnectUser;

  /**
   * Sets an anonymous user and opens the WebSocket connection.
   *
   * @returns A promise that resolves when the connection is set up.
   */
  connectAnonymousUser = () => {
    if (this.node && !this.config.getConfig('client')?.allowServerSideConnect) {
      logger
        .withExtraTags('connectAnonymousUser')
        .warn(
          'Do not use connectUser server-side. connectUser impacts MAU and concurrent connection usage, and therefore your bill. If you have a valid use case, set `client.allowServerSideConnect: true` in the client configuration to disable this warning.',
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
   * Creates a guest user.
   *
   * @param ...args - `[request, requestOptions]`. `request.user` is the guest user to create;
   *   `requestOptions` carries per-request options such as an abort `signal` and is never
   *   serialized into the request.
   * @returns The created guest user and its access token.
   */
  override async createGuest(...args: Parameters<ChatApi['createGuest']>) {
    if (this.tokenManager.token || this.tokenManager.tokenProvider) {
      return await super.createGuest(...args);
    }

    // Set token to anonymous so API accepts the request
    await this.tokenManager.setTokenOrProvider('', {
      id: this.userId ?? '!anon',
      anon: true,
    });

    try {
      return await super.createGuest(...args);
    } finally {
      this.tokenManager.reset();
    }
  }

  /**
   * Creates a temporary guest user and connects as it.
   *
   * @param user - The guest user, with its required `id`, e.g. `{ id: 'john', name: 'John' }`.
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns A promise that resolves when the connection is set up.
   */
  async setGuestUser(user: UserRequest, requestOptions?: StreamRequestOptions) {
    const response = await this.createGuest({ user }, requestOptions);

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
   * @param callback - Called with every event.
   * @returns An object with an `unsubscribe()` method.
   */
  on(callback: EventHandler): { unsubscribe: () => void };
  /**
   * Listens to one event type on all channels and users you're watching.
   *
   * @param eventType - The event type to listen for.
   * @param callback - Called with each event of that type.
   * @returns An object with an `unsubscribe()` method.
   */
  on<T extends EventType>(
    eventType: T,
    callback: EventHandler<T>,
  ): { unsubscribe: () => void };
  on(
    callbackOrString: EventHandler | EventType,
    callbackOrNothing?: EventHandler,
  ): { unsubscribe: () => void } {
    const key = callbackOrNothing ? (callbackOrString as EventType) : 'all';
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
   * Removes a listener for all events.
   *
   * @param callback - The listener to remove.
   */
  off(callback: EventHandler): void;
  /**
   * Removes a listener for one event type.
   *
   * @param eventType - The event type it listens to.
   * @param callback - The listener to remove.
   */
  off<T extends EventType>(eventType: T, callback: EventHandler<T>): void;
  off(callbackOrString: EventHandler | EventType, callbackOrNothing?: EventHandler) {
    const key = callbackOrNothing ? (callbackOrString as EventType) : 'all';
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

  dispatchEvent = (event: Event) => {
    if (event.received_at == null) event.received_at = nowNs();

    const postListenerCallbacks = this._handleClientEvent(event as WSEvent);

    const cid = (event as Extract<Event, { cid?: any }>).cid;
    const channel = cid ? this.channelManager.get(cid) : undefined;
    // A disconnected channel (`pendingDisposal`) may stay stored until `releaseUnusedChannels()`.
    // Its handlers would throw at `getClient()`, so they are skipped (its own listeners below still
    // hear it).
    if (channel && !channel.pendingDisposal) {
      channel._handleChannelEvent(event);
    }

    this._callClientListeners(event);

    if (channel) {
      channel._callChannelListeners(event);
    }

    // A failing in-memory cleanup must not skip the other callbacks or the offline DB write below.
    for (const callback of postListenerCallbacks) {
      try {
        callback();
      } catch (error) {
        logger
          .withExtraTags('dispatchEvent', event.type)
          .error('A post-listener callback failed.', { error });
      }
    }

    this.offlineDb?.executeQuerySafely((db) => db.handleEvent({ event }), {
      method: `handleEvent;${event.type}`,
    });
  };

  /**
   * Puts `user`'s new object into the members, watchers, own membership and (with `readEntries`)
   * read entries of the channels that list them, in one state update per channel.
   *
   * @param options.readEntries - Also replace the user in read entries, refreshing read receipts.
   *   Off for presence changes: receipts never show online status. Defaults to `true`.
   */
  _updateMemberWatcherReferences = (
    user: UserResponse,
    { readEntries = true }: { readEntries?: boolean } = {},
  ) => {
    const refMap = this.state.userChannelReferences[user.id] || {};
    for (const channelId in refMap) {
      const channel = this.channelManager.get(channelId);
      if (!channel?.state) continue;
      const { members, membership, watchers, read } = channel.state.getLatestValue();
      const member = members[user.id];
      const readState = readEntries ? read[user.id] : undefined;
      const hasWatcher = !!watchers[user.id];
      const isOwnMembership = membership?.user?.id === user.id;
      if (!member && !hasWatcher && !readState && !isOwnMembership) continue;
      // The receipts tracker applies a read-state change only with metadata naming the changed
      // users.
      if (readState) {
        channel.messageReceiptsTracker.setPendingReadStoreReconcileMeta({
          changedUserIds: [user.id],
        });
      }
      channel.state.partialNext({
        ...(member && { members: { ...members, [user.id]: { ...member, user } } }),
        ...(hasWatcher && { watchers: { ...watchers, [user.id]: user } }),
        ...(isOwnMembership && { membership: { ...membership, user } }),
        ...(readState && { read: { ...read, [user.id]: { ...readState, user } } }),
      });
      // consumed by the tracker's read subscription; cleared in case it isn't subscribed
      channel.messageReceiptsTracker.setPendingReadStoreReconcileMeta(undefined);
    }
  };

  /**
   * @deprecated Please use `_updateMemberWatcherReferences` instead.
   * @private
   */
  _updateUserReferences = this._updateMemberWatcherReferences;

  /**
   * Replaces the user's object in the messages of the loaded channels.
   *
   * @private
   */
  _updateUserMessageReferences = (user: UserResponse) => {
    // Scans all loaded channels: `reflectUserUpdate` filters by author ID, so it is a no-op for
    // channels without this user's messages.
    for (const channel of this.channelManager.values()) {
      if (!channel) continue;

      channel.pinnedMessagesPaginator.reflectUserUpdate(user);
      channel.messagePaginator.reflectUserUpdate(user);
    }
  };

  /**
   * Deletes the user's messages in the loaded channels: stripped of their content with
   * `hardDelete`, otherwise marked as deleted. `deletedAt` defaults to now.
   *
   * @private
   */
  _deleteUserMessageReference = (
    user: UserResponse,
    hardDelete = false,
    deletedAt?: LocalMessage['deleted_at'],
  ) => {
    // Scans all loaded channels; `applyMessageDeletionForUser` filters by author ID.
    for (const channel of this.channelManager.values()) {
      if (channel) {
        channel.messagePaginator.applyMessageDeletionForUser({
          userId: user.id,
          hardDelete,
          deletedAt: deletedAt ?? nowNs(),
        });
        channel.pinnedMessagesPaginator.applyMessageDeletionForUser({
          userId: user.id,
          hardDelete,
          deletedAt: deletedAt ?? nowNs(),
        });
      }
    }
  };

  /** @private */
  _handleUserEvent = (
    event: Extract<
      WSEvent,
      { type: 'user.presence.changed' | 'user.updated' | 'user.deleted' }
    >,
  ) => {
    if (!event.user) {
      return;
    }

    if (event.type === 'user.presence.changed' || event.type === 'user.updated') {
      if (event.user.id === this.userId) {
        const user = { ...this.user } as NonNullable<StreamChat['user']>;
        const _user = { ...this._user } as NonNullable<StreamChat['_user']>;

        // Drop properties absent from the event, except own-user-only ones.
        for (const key in this.user) {
          if (key in event.user || isOwnUserBaseProperty(key)) {
            continue;
          }

          const deleteKey = key as keyof typeof user;

          delete user[deleteKey];
          delete _user[deleteKey];
        }

        // Update only the properties `_user` already has.
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
      this._updateMemberWatcherReferences(event.user, {
        readEntries: event.type === 'user.updated',
      });
    }

    if (event.type === 'user.updated') {
      this._updateUserMessageReferences(event.user);
    }

    if (
      event.type === 'user.deleted' &&
      event.user.deleted_at != null &&
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

    if ((event.type === 'health.check' || event.type === 'connection.ok') && event.me) {
      client.user = event.me;
      client.state.updateUser(event.me);
      client.mutedChannels = event.me.channel_mutes;
      client.channelManager.reflectMutedChannels();
      client.mutedUsers = event.me.mutes;
      client.blockedUsers.partialNext({ userIds: event.me.blocked_user_ids ?? [] });
    }

    if (event.type === 'notification.message_new' && event.channel) {
      const { channel } = event;
      this._addChannelConfig(channel);
    }

    if (event.type === 'notification.channel_mutes_updated' && event.me?.channel_mutes) {
      this.mutedChannels = event.me.channel_mutes;
      this.channelManager.reflectMutedChannels();
    }

    if (event.type === 'notification.mutes_updated' && event.me?.mutes) {
      this.mutedUsers = event.me.mutes;
    }

    if (event.type === 'notification.mark_read' && event.unread_channels === 0) {
      this.channelManager.values().forEach((channel) => {
        // Resets `read[userId].unread_messages`, which the unread badge reads.
        if (!channel._setOwnUnreadCount(0)) return;
        // the event may name no channel (mark-all-read), but here we know which ones changed
        this.channelManager.dropFromUnmatchedLists(channel);
      });
    }

    if (
      (event.type === 'channel.deleted' ||
        event.type === 'notification.channel_deleted') &&
      event.cid
    ) {
      const { cid } = event;
      client.state.deleteAllChannelReference(cid);
      const ended = this.channelManager.get(cid);
      ended?.disconnect();

      postListenerCallbacks.push(() => {
        // Only the instance disconnected above: a listener that got the channel again keeps its
        // fresh instance (`ensure()` replaces a disposed one).
        if (ended && this.channelManager.get(cid) === ended) {
          this.channelManager.removeChannel(cid);
        }
      });
    }

    // Current user removed from a channel: evict it like channel.deleted so connection recovery
    // does not re-watch it. `deleteAllChannelReference` is skipped: the channel still
    // exists for its other members.
    if (event.type === 'notification.removed_from_channel' && event.cid) {
      const { cid } = event;
      const ended = this.channelManager.get(cid);
      ended?.disconnect();

      postListenerCallbacks.push(() => {
        // only the instance disconnected above, as for channel.deleted
        if (ended && this.channelManager.get(cid) === ended) {
          this.channelManager.removeChannel(cid);
        }
      });
    }

    return postListenerCallbacks;
  }

  _muteStatus(cid: string): ChannelMuteStatus {
    let muteStatus: ChannelMuteStatus | undefined;
    for (let i = 0; i < this.mutedChannels.length; i++) {
      const mute = this.mutedChannels[i];
      if (mute.channel?.cid === cid) {
        muteStatus = {
          // `expires` is in unix nanoseconds: compare it against `nowNs()`, not `Date.now()`.
          muted: mute.expires != null ? mute.expires > nowNs() : true,
          createdAt: mute.created_at ?? nowNs(),
          expiresAt: mute.expires ?? null,
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

  _callClientListeners = (event: Event) => {
    // Snapshot first: a listener subscribed while handling an event must not be invoked for it.
    const listeners = [
      ...(this.listeners.get('all') ?? []),
      ...(this.listeners.get(event.type) ?? []),
    ];

    for (const listener of listeners) {
      invokeEventListener(listener, event, logger);
    }
  };

  /**
   * Settles the connect promises after a successful reconnect, so a held `wsPromise` /
   * `setUserPromise` stops resolving against a superseded (possibly rejected) attempt. Called by
   * `StableWSConnection._reconnect()` and `WSConnectionFallback.connect(true)`. Recovery itself
   * belongs to {@link ConnectionRecoveryManager}.
   *
   * @internal
   */
  _settleConnectPromises = () => {
    logger
      .withExtraTags('_settleConnectPromises')
      .info(
        `Connection re-established with connection ID ${this.connectionIdManager.connectionId}.`,
      );

    // After a failed connect (e.g. `persistUserOnConnectionFailure: true`) recovery must flip
    // `wsPromise` from rejected to resolved, or calls waiting on it fail. An unsettled promise is
    // left to the connect sequence.
    if (this._wsPromiseSettled) {
      this.wsPromise = Promise.resolve();
    }
    this.setUserPromise = Promise.resolve();
  };

  /** @private */
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

    // `wsConnection` owns the socket, the long-poll fallback (`enableWSFallback`), reconnection and
    // the connect timeout.
    return await this.wsConnection.connect();
  }

  /**
   * Queries users and stores them in `client.state.users`. Watches presence only when
   * `request.payload.presence` is set.
   *
   * @param ...args - `[request, requestOptions]`. The optional `request.payload` accepts
   *   MongoDB-style filter conditions, sort directions (e.g.
   *   `[{ field: 'last_active', direction: -1 }]`), and options such as `presence`.
   *   `requestOptions` carries per-request options such as an abort `signal` and is never
   *   serialized into the request.
   * @returns The user query response.
   */
  override async queryUsers(...args: Parameters<ChatApi['queryUsers']>) {
    const [request, requestOptions] = args;
    const data = await super.queryUsers(request ?? {}, requestOptions);
    this.state.updateUsers(data.users);

    return data;
  }

  /**
   * Stops watching a channel on this client's connection. It carries no `watch` flag, but it waits
   * for the connection ID like a watching request (through a handshake or reconnect, until the
   * caller's abort signal fires) and throws when there is no connection and none is being
   * established.
   *
   * @param ...args - `[pathParams, request, requestOptions]`. `pathParams` identifies the channel
   *   (`{ type, id }`); `request.connection_id` is replaced by this client's connection ID.
   * @returns The server response.
   */
  override async stopWatchingChannel(
    ...args: Parameters<ChatApi['stopWatchingChannel']>
  ) {
    const [pathParams, request, requestOptions] = args;
    const signal = requestOptions?.signal;
    const connectionId = await this.connectionIdManager.getConnectionId(
      // A signal revived from the offline DB has lost `addEventListener`.
      typeof signal?.addEventListener === 'function' ? signal : undefined,
    );

    return super.stopWatchingChannel(
      pathParams,
      { ...request, connection_id: connectionId },
      requestOptions,
    );
  }

  /**
   * Queries channels and returns the raw API response. See {@link queryChannelsAndHydrate} for
   * `Channel` instances.
   *
   * @param ...args - `[request, requestOptions]`. The optional `request` accepts MongoDB-style
   *   filter conditions, sort directions (e.g. `[{ field: 'created_at', direction: -1 }]`), and
   *   options such as `predefined_filter`, `filter_values`, and `sort_values`. `state`, `watch` and
   *   `presence` default to `true`, `true` and `false`. `requestOptions` carries per-request
   *   options such as an abort `signal` and is never serialized into the request.
   * @returns The full query channels response, including metadata such as `predefined_filter`.
   */
  override async queryChannels(...args: Parameters<ChatApi['queryChannels']>) {
    const [request, requestOptions] = args;
    const defaultOptions: ChannelOptions = {
      state: true,
      watch: true,
      presence: false,
    };

    const {
      predefined_filter,
      filter_values,
      sort_values,
      filter_conditions,
      ...restOptions
    } = request ?? {};

    // With a predefined filter, `filter_conditions` is not sent.
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

    // `ApiClient` waits for a connection ID only when the payload sets `watch` or `presence`.
    return await super.queryChannels(payload, requestOptions);
  }

  /**
   * Queries channels and hydrates them into `Channel` instances on this client, dispatching
   * `channels.queried` and syncing the offline DB. Use `queryChannels()` for the raw API response.
   *
   * @param options - The query channels request payload (optional). Accepts MongoDB-style filter
   *   conditions, sort directions (e.g. `[{ field: 'created_at', direction: -1 }]`), and options
   *   such as `predefined_filter`, `filter_values`, and `sort_values`.
   * @param stateOptions - Options that only affect state management and are not sent in the
   *   request. Defaults to `{}`.
   * @param stateOptions.skipInitialization - IDs of channels whose state is not initialized.
   * @param stateOptions.skipHydration - Not read: it has no effect.
   * @param stateOptions.withResponse - Returns the full query response (with hydrated `channels`)
   *   instead of `Channel[]`.
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The hydrated channel list, or the full response when `withResponse` is `true`.
   */
  async queryChannelsAndHydrate(
    options: QueryChannelsRequest | undefined,
    stateOptions: ChannelStateOptions & { withResponse: true },
    requestOptions?: StreamRequestOptions,
  ): Promise<QueryChannelsResponseWithChannels>;
  async queryChannelsAndHydrate(
    options?: QueryChannelsRequest,
    stateOptions?: ChannelStateOptions,
    requestOptions?: StreamRequestOptions,
  ): Promise<Channel[]>;
  async queryChannelsAndHydrate(
    options?: QueryChannelsRequest,
    stateOptions: ChannelStateOptions = {},
    requestOptions?: StreamRequestOptions,
  ): Promise<Channel[] | QueryChannelsResponseWithChannels> {
    const headIntervalItemIdsAtRequestByCid = new Map<string, ReadonlySet<string>>();
    for (const channel of this.channelManager.values()) {
      const idsAtRequest = channel.messagePaginator?.getHeadIntervalItemIdsAtRequest();
      if (idsAtRequest) headIntervalItemIdsAtRequestByCid.set(channel.cid, idsAtRequest);
    }
    const queryChannelsResponse = await this.queryChannels(options, requestOptions);
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

    const hydratedChannels = this.hydrateChannels(
      channels,
      stateOptions,
      options,
      headIntervalItemIdsAtRequestByCid,
    );

    if (stateOptions.withResponse) {
      return {
        ...queryChannelsResponse,
        channels: hydratedChannels,
      };
    }

    return hydratedChannels;
  }

  /**
   * Queries a message's reactions. On the first page, cached offline reactions are dispatched
   * (`offline_reactions.queried`) before the network request.
   *
   * @param ...args - `[pathParams, request, requestOptions]`. `pathParams.id` is the target message
   *   ID; `request` carries MongoDB-style filters, sort directions (e.g.
   *   `[{ field: 'created_at', direction: -1 }]`) and pagination options; `requestOptions` carries
   *   per-request options such as an abort `signal` and is never serialized into the request.
   * @returns The query reactions response.
   */
  async queryReactionsAndHydrate(...args: Parameters<ChatApi['queryReactions']>) {
    const [{ id: messageId }, request] = args;
    const { filter, next, sort, limit } = request ?? {};

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

    return await this.queryReactions(...args);
  }

  hydrateChannels(
    channelsFromApi: ChannelStateResponseFields[] = [],
    stateOptions: ChannelStateOptions = {},
    queryChannelsOptions?: ChannelOptions,
    headIntervalItemIdsAtRequestByCid?: Map<string, ReadonlySet<string>>,
  ) {
    const { skipInitialization, offlineMode = false } = stateOptions;
    const channels: Channel[] = [];

    for (const channelState of channelsFromApi) {
      if (!channelState.channel) continue;

      this._addChannelConfig(channelState.channel);
      const c = this.channelManager.ensure({
        type: channelState.channel.type,
        id: channelState.channel.id,
      });
      c.data = channelState.channel;
      // A live result initializes the channel; one restored from the offline database doesn't.
      c.state.partialNext(
        offlineMode
          ? { initialized: false, offlineMode: true }
          : { initialized: true, offlineMode: false },
      );
      // Unless events were arriving before this response, the loaded messages may lack newer ones.
      const wasWatching = c.watchStatus === ChannelWatchStatus.Watching;
      // An explicit `watch` choice wins, otherwise watch only on a healthy socket
      // (`hydrateChannels` is public, so there may be no gated request behind it). Offline
      // hydration never counts, and a query that did not watch leaves the status untouched.
      if (!offlineMode && (queryChannelsOptions?.watch ?? this.wsConnection.isHealthy)) {
        c.watchStatus = ChannelWatchStatus.Watching;
      }
      c.push_preferences = channelState.push_preferences;

      const willInitialize =
        skipInitialization === undefined ||
        !skipInitialization.includes(channelState.channel.id);
      const requestedPageSize =
        queryChannelsOptions?.message_limit ??
        DEFAULT_QUERY_CHANNELS_MESSAGE_LIST_PAGE_SIZE;

      // Place the page before _initializeState applies the read state, which reads the loaded
      // messages: read and delivery positions that come without a message id are looked up among
      // them (see `Channel.runChannelQuery`). Not for an active channel, whose own
      // `channel.reload()` owns its message list (see `Channel.activate()`).
      const placesNewestPage = willInitialize && !c.active;
      let placedFirstPage = false;
      if (placesNewestPage) {
        // The response's `last_message_at` first, so the paginator can tell whether the page
        // reaches it.
        c.messagePaginator.setQueriedLatestMessageAt(
          channelState.channel?.last_message_at,
        );
        placedFirstPage = c.messagePaginator.placeExternalNewestPage(
          channelState.messages.map(formatMessage),
          {
            headIntervalItemIdsAtRequest: headIntervalItemIdsAtRequestByCid?.get(c.cid),
            requestedLimit: requestedPageSize,
          },
        );
      }

      if (skipInitialization === undefined) {
        c._initializeState(channelState);
      } else if (!skipInitialization.includes(channelState.channel.id)) {
        // The message list's page is placed above; the pinned list's comes with _initializeState.
        c._initializeState(channelState);
      }
      // from the read state the response brought, as `channel.watch()` does
      if (placedFirstPage) c.messagePaginator.seedUnreadSnapshot();
      // Unless the newest page was placed, which brings the window up to date, the head window is
      // checked against this response's `last_message_at`, as `Channel.requestChannelState` does
      // for a channel query; an on-screen channel is left to its own `channel.reload()`, as above.
      if (
        willInitialize &&
        !c.active &&
        !wasWatching &&
        !(placesNewestPage && channelState.messages.length)
      ) {
        c.messagePaginator.unmarkStaleHead();
      }

      if (willInitialize) {
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
   * Returns the channel with the given type, ID and custom data: a shorthand for
   * {@link ChannelManager.ensure}, so it returns the stored instance for the cid or creates and
   * stores it.
   *
   * For a distinct channel between users, leave out the ID and pass the members:
   * `client.channel('messaging', { members: [{ user_id: 'tommaso' }, { user_id: 'thierry' }] })`.
   * It has no ID until `channel.watch()`, `query()` or `create()` returns one.
   *
   * @param channelType - The channel type.
   * @param channelId - The channel ID; leave it out for a distinct channel created from members
   *   (optional).
   * @param custom - Data for a new channel, e.g. `members` or `custom`. Defaults to `{}`.
   * @returns The channel; initialize it with `channel.watch()`.
   */
  channel(channelType: string, channelId?: string | null, custom?: ChannelInput): Channel;
  channel(channelType: string, custom?: ChannelInput): Channel;
  channel(
    channelType: string,
    channelIdOrCustom?: string | ChannelInput | null,
    custom: ChannelInput = {},
  ): Channel {
    // channel('messaging', { members }): the data takes the ID's place
    if (channelIdOrCustom && typeof channelIdOrCustom === 'object') {
      return this.channelManager.ensure({ data: channelIdOrCustom, type: channelType });
    }
    return this.channelManager.ensure({
      data: custom,
      id: channelIdOrCustom || undefined,
      type: channelType,
    });
  }

  /**
   * Searches messages.
   *
   * @param ...args - `[request, requestOptions]`. The optional `request.payload` accepts channel
   *   `filter_conditions`, `message_filter_conditions`, a `query`, and options such as `limit`,
   *   `offset`, `next` and `sort`. `requestOptions` carries per-request options such as an abort
   *   `signal` and is never serialized into the request.
   * @returns The search messages response.
   * @throws When both `offset` and `next` are given.
   */
  override async search(...args: Parameters<ChatApi['search']>) {
    const [request, requestOptions] = args;
    if (request?.payload?.offset && request?.payload?.next) {
      throw Error(`Cannot specify "offset" with "next"`);
    }

    return await super.search(request, requestOptions);
  }

  /**
   * Caches one channel's server configuration, keyed by cid (see {@link Channel.serverConfig}).
   * Skips the write for a response without `config` (`notification.message_new` omits it) and for a
   * config deep-equal to the stored one: the API returns a fresh object each time and the store
   * compares by reference.
   *
   * @internal
   */
  _addChannelConfig({ cid, config }: Pick<ChannelResponse, 'cid' | 'config'>) {
    if (!config) return;
    if (isEqual(this.channelServerConfigs[cid], config)) return;

    this.channelServerConfigs = {
      ...this.channelServerConfigs,
      [cid]: config,
    };
  }

  /**
   * Revokes a global ban.
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

  async blockUser(blockedUserId: string, requestOptions?: StreamRequestOptions) {
    const result = await this.blockUsers(
      {
        blocked_user_id: blockedUserId,
      },
      requestOptions,
    );
    this.blockedUsers.next(({ userIds }) => ({
      userIds: userIds.concat(blockedUserId),
    }));
    return result;
  }

  override async getBlockedUsers(...args: Parameters<ChatApi['getBlockedUsers']>) {
    const result = await super.getBlockedUsers(...args);
    this.blockedUsers.partialNext({
      userIds: result.blocks.map(({ blocked_user_id }) => blocked_user_id),
    });
    return result;
  }

  async unblockUser(blockedUserId: string, requestOptions?: StreamRequestOptions) {
    const result = await this.unblockUsers(
      {
        blocked_user_id: blockedUserId,
      },
      requestOptions,
    );
    this.blockedUsers.next(({ userIds }) => ({
      userIds: userIds.filter((id) => id !== blockedUserId),
    }));
    return result;
  }

  /**
   * Checks whether a user is muted.
   *
   * @param targetId - The user ID to check.
   * @returns `true` if the user is muted, otherwise `false`.
   * @throws When no user is connected.
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
   * Pins the message.
   *
   * @param message - The message to pin, or just its `{ id }`.
   * @param options - When the pin expires and where it sorts (optional).
   * @param options.pin_expires - When the pin expires, as a `Date` or an RFC3339 string; `null` or
   *   leaving it out pins without expiry. Hand a server-sent timestamp back with `nsToDate(timestamp)`.
   * @param options.pinned_at - The pin time, which orders the pinned messages, as a `Date` or an
   *   RFC3339 string (optional). Defaults to now.
   * @param   requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The updated message response.
   */
  pinMessage(
    { id }: { id: string },
    { pin_expires = null, pinned_at }: PinMessageOptions = {},
    requestOptions?: StreamRequestOptions,
  ) {
    if (!id) throw new Error('Please specify the message id when calling pinMessage');
    return this.updateMessagePartial(
      { id },
      { set: { pinned: true, pin_expires, pinned_at: pinned_at ?? null } },
      requestOptions,
    );
  }

  /**
   * Unpins the message that was previously pinned.
   *
   * @param message - The message to unpin, or just its `{ id }`.
   * @param   requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The updated message response.
   */
  unpinMessage({ id }: { id: string }, requestOptions?: StreamRequestOptions) {
    if (!id) throw new Error('Please specify the message id when calling unpinMessage');
    return this.updateMessagePartial({ id }, { set: { pinned: false } }, requestOptions);
  }

  /**
   * Updates a message over HTTP only: no offline queueing and no local state.
   * `messageOperations.update` on a channel or thread is the full edit.
   *
   * @param ...args - `[pathParams, request, requestOptions]`. `pathParams.id` is the message ID;
   *   `request.message` is the updated message; `requestOptions` carries per-request options such
   *   as an abort `signal` and is never serialized into the request.
   * @returns The update message response.
   */
  override async updateMessage(...args: Parameters<ChatApi['updateMessage']>) {
    const [pathParams, request, requestOptions] = args;

    // Sanitized at the wire, which every path reaches: the full edit and an offline replay alike.
    return await super.updateMessage(
      pathParams,
      { ...request, message: sanitizeOutgoingAttachments(request.message) },
      requestOptions,
    );
  }

  /**
   * Deletes a message over HTTP only: no offline queueing and no local state.
   * `messageOperations.delete` on a channel or thread is the full delete.
   *
   * @param ...args - `[pathParams, request, requestOptions]`. `pathParams.id` is the message ID;
   *   `request.hard` deletes it permanently and `request.delete_for_me` deletes it for the current
   *   user only; `requestOptions` carries per-request options such as an abort `signal` and is
   *   never serialized into the request.
   * @returns The delete message response.
   */
  override async deleteMessage(...args: Parameters<ChatApi['deleteMessage']>) {
    const [, request] = args;
    const result = await super.deleteMessage(...args);

    // The server does not return the message as deleted here.
    if (request?.delete_for_me) {
      result.message.deleted_for_me = true;
      result.message.type = 'deleted';
    }

    return result;
  }

  /**
   * Returns the current user's threads as hydrated `Thread` instances.
   *
   * @param options - Pagination and limits for the participants and replies. Defaults to `{}`.
   * @param options.limit - Limits the number of threads returned. Defaults to 10.
   * @param options.watch - Subscribes the user to the channels of the threads. Defaults to `true`.
   * @param options.participant_limit - Limits the participants returned per thread. Defaults to 10.
   * @param options.reply_limit - Limits the replies returned per thread. Defaults to 3.
   * @param options.filter - MongoDB-style filters for threads (optional).
   * @param options.sort - MongoDB-style sort for threads (optional).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The threads and the next cursor.
   */
  async queryThreadsAndHydrate(
    options: QueryThreadsRequest = {},
    requestOptions?: StreamRequestOptions,
  ) {
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

    const response = await this.queryThreads(requestBody, requestOptions);

    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const parentMessages = response.threads.map((thread) => thread.parent_message!);
    this.polls.hydratePollCache(parentMessages);

    const threads = response.threads.map((threadData) =>
      this.threads.resolveQueried(threadData),
    );
    if (optionsWithDefaults.watch) threads.forEach(markThreadChannelWatched);

    return { threads, next: response.next };
  }

  /**
   * Returns the thread of a message by its ID, wrapped in a hydrated `Thread` instance.
   *
   * @param pathParams - The thread's parent message, as for `getThread`.
   * @param pathParams.message_id - The parent message ID.
   * @param options - Options object for pagination and limiting the participants and replies.
   *   Defaults to `{}`.
   * @param options.watch - Subscribes the user to the channel of the thread. Defaults to `true`.
   * @param options.participant_limit - Limits the participants returned. Defaults to 100.
   * @param options.reply_limit - Limits the replies returned. Defaults to 3.
   * @param   requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The thread.
   */
  async getThreadAndHydrate(
    { message_id: messageId }: { message_id: string },
    options: GetThreadOptions = {},
    requestOptions?: StreamRequestOptions,
  ) {
    if (!messageId) {
      throw new Error('Please specify the messageId when calling getThreadAndHydrate');
    }

    const optionsWithDefaults = {
      participant_limit: DEFAULT_THREAD_PARTICIPANT_LIMIT,
      reply_limit: 3,
      watch: true,
      ...options,
    };

    const response = await this.getThread(
      { message_id: messageId },
      optionsWithDefaults,
      requestOptions,
    );

    const thread = this.threads.resolveQueried(response.thread);
    if (optionsWithDefaults.watch) markThreadChannelWatched(thread);

    return thread;
  }

  getUserAgent = (): string => {
    // An explicit override (deprecated `setUserAgent`) always wins and is never cached.
    if (this.userAgent) {
      return this.userAgent;
    }

    // Memoized on the first call: later changes to the identifiers are not picked up.
    if (!this.cachedUserAgent) {
      const version = process.env.PKG_VERSION;
      const { name: sdkName, version: sdkVersion } = this.sdkIdentifier ?? {};
      const { name: appName, version: appVersion } = this.appIdentifier ?? {};
      const { os, model: deviceModel } = this.deviceIdentifier ?? {};

      const head = sdkName
        ? `stream-chat-${sdkName}-v${sdkVersion}-llc-v${version}`
        : `stream-chat-js-v${version}-${this.node ? 'node' : 'browser'}`;

      this.cachedUserAgent = [
        head,
        // Each only when a value is present.
        ...Object.entries({
          app: appName,
          app_version: appVersion,
          os,
          device_model: deviceModel,
          client_bundle: process.env.CLIENT_BUNDLE,
        })
          .filter(([, value]) => value && value.length > 0)
          .map(([key, value]) => `${key}=${value}`),
      ].join('|');
    }

    return this.cachedUserAgent;
  };

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

  _startCleaning() {
    if (this.cleaningIntervalRef != null) {
      return;
    }
    this.cleaningIntervalRef = setInterval(() => {
      // `clean()` sends the stop-typing event, among other things.
      for (const channel of this.channelManager.values()) {
        // A disposed channel has nothing to clean, and `clean()` would throw on it.
        if (channel.pendingDisposal) continue;
        // One channel failing to clean must not stop the others (typing indicators would stick).
        try {
          channel.clean();
        } catch (error) {
          logger
            .withExtraTags('clean', channel.cid)
            .error('Cleaning the channel failed.', { error });
        }
      }
    }, 500);
  }

  /**
   * The JSON-encoded WebSocket auth message, sent as the first frame once the socket opens.
   *
   * @private
   */
  _buildWSAuthMessage = () =>
    JSON.stringify(this._buildWSAuthPayload(this.tokenManager.getToken()));

  /**
   * The auth message that {@link _buildWSAuthMessage} encodes for the WebSocket and the long-poll
   * fallback sends as `longPoll()`'s `json` query param.
   *
   * @private
   *
   * @param token - The long-poll passes none: it authenticates through the `Authorization` header.
   */
  _buildWSAuthPayload = (token?: string): WSAuthMessage => ({
    // The server requires a non-empty token but ignores one that is not JWT-shaped, so anonymous
    // users and the long-poll send a placeholder.
    token: token || 'anonymous',
    // `connect()` rejects before reaching this when `_user` is unset.
    user_details: this._user as ConnectUserDetailsRequest,
    // Without 'chat' the server treats the connection as video-only and drops chat events and
    // unread counts.
    products: ['chat'],
  });

  /**
   * Queries poll answers: the votes with `is_answer: true`.
   *
   * @param ...args - `[pathParams, request, requestOptions]`. `pathParams.poll_id` is the poll ID;
   *   `request` carries optional vote filter conditions, sort directions, and pagination options
   *   (`limit`, `next`, `prev`); `requestOptions` carries per-request options such as an abort
   *   `signal` and is never serialized into the request.
   * @returns The poll answers.
   */
  async queryPollAnswers(...args: Parameters<ChatApi['queryPollVotes']>) {
    const [pathParams, request, requestOptions] = args;
    const { filter, ...options } = request ?? {};

    return await this.queryPollVotes(
      pathParams,
      { ...options, filter: { ...filter, is_answer: true } },
      requestOptions,
    );
  }

  /**
   * Uploads a file to the Stream CDN.
   *
   * @param request - Upload payload. `request.file` is the file to upload.
   * @param requestOptions - Per-request options, e.g. `onUploadProgress` or an abort `signal`
   *   (optional).
   * @returns The upload response, with the file URL.
   */
  override async uploadFile(
    request?: Omit<FileUploadRequest, 'file'> & { file?: FileUploadInput },
    requestOptions?: StreamRequestOptions,
  ) {
    return await super.uploadFile(
      { ...request, file: normalizeUploadFile(request?.file) as unknown as string },
      requestOptions,
    );
  }

  /**
   * Uploads an image to the Stream CDN.
   *
   * @param request - Upload payload. `request.file` is the image to upload.
   * @param requestOptions - Per-request options, e.g. `onUploadProgress` or an abort `signal`
   *   (optional).
   * @returns The upload response, with the image URL.
   */
  override async uploadImage(
    request?: Omit<ImageUploadRequest, 'file'> & { file?: FileUploadInput },
    requestOptions?: StreamRequestOptions,
  ) {
    return await super.uploadImage(
      { ...request, file: normalizeUploadFile(request?.file) as unknown as string },
      requestOptions,
    );
  }

  /**
   * Marks channels as delivered for the given messages.
   *
   * @param request - Mark delivered options.
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The server response, or `undefined` if there are no messages to mark.
   */
  async markChannelsDelivered(
    request?: Gen_MarkDeliveredRequest,
    requestOptions?: StreamRequestOptions,
  ) {
    if (!request?.latest_delivered_messages?.length) return;
    return await this.markDelivered(request, requestOptions);
  }

  syncDeliveredCandidates(collections: Channel[]) {
    this.messageDeliveryReporter.syncDeliveredCandidates(collections);
  }
}
