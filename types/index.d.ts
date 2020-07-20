/// <reference types="seamless-immutable" />
/// <reference types="node" />
/// <reference types="ws" />
declare module "src/base64" {
    export const encodeBase64: (data: string) => string;
    export const decodeBase64: (s: string) => string;
}
declare module "src/channel_state" {
    import Immutable from 'seamless-immutable';
    import { Channel } from "src/channel";
    import { ChannelMembership, ChannelMemberResponse, Event, MessageResponse, ParsedMessageResponse, ReactionResponse, UnknownType, UserResponse } from '../types/types';
    /**
     * ChannelState - A container class for the channel state.
     */
    export class ChannelState<AttachmentType = UnknownType, ChannelType = UnknownType, EventType = UnknownType, EventTypeName = UnknownType, MessageType = UnknownType, ReactionType = UnknownType, UserType = UnknownType> {
        _channel: Channel<AttachmentType, ChannelType, EventType, EventTypeName, MessageType, ReactionType, UserType>;
        watcher_count: number;
        typing: Immutable.ImmutableObject<{
            [key: string]: Immutable.Immutable<Event<'typing.start', EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType>>;
        }>;
        read: Immutable.ImmutableObject<{
            [key: string]: Immutable.Immutable<{
                user: UserResponse<UserType>;
                last_read: Date;
            }>;
        }>;
        messages: Immutable.ImmutableArray<ParsedMessageResponse<MessageType, AttachmentType, ReactionType, UserType>>;
        threads: Immutable.ImmutableObject<{
            [key: string]: Immutable.ImmutableArray<ParsedMessageResponse<MessageType, AttachmentType, ReactionType, UserType>>;
        }>;
        mutedUsers: Immutable.ImmutableArray<UserResponse<UserType>>;
        watchers: Immutable.ImmutableObject<{
            [key: string]: Immutable.Immutable<UserResponse<UserType>>;
        }>;
        members: Immutable.ImmutableObject<{
            [key: string]: Immutable.Immutable<ChannelMemberResponse<UserType>>;
        }>;
        membership: Immutable.ImmutableObject<ChannelMembership<UserType>>;
        last_message_at: Date | null;
        constructor(channel: Channel<AttachmentType, ChannelType, EventType, EventTypeName, MessageType, ReactionType, UserType>);
        /**
         * addMessageSorted - Add a message to the state
         *
         * @param {object} newMessage A new message
         *
         */
        addMessageSorted(newMessage: MessageResponse<MessageType, AttachmentType, ReactionType, UserType>): void;
        /**
         * addMessagesSorted - Add the list of messages to state and resorts the messages
         *
         * @param {array}   newMessages    A list of messages
         * @param {boolean} initializing   Weather channel is being initialized.
         *
         */
        addMessagesSorted(newMessages: MessageResponse<MessageType, AttachmentType, ReactionType, UserType>[], initializing?: boolean): void;
        addReaction(reaction: ReactionResponse<ReactionType, UserType>, message?: MessageResponse<MessageType, AttachmentType, ReactionType, UserType>): void;
        _addReactionToMessage(message: Immutable.Immutable<ParsedMessageResponse<MessageType, AttachmentType, ReactionType, UserType>, {}>, reaction: ReactionResponse<ReactionType, UserType>): any;
        _removeReactionFromMessage(message: Immutable.Immutable<ParsedMessageResponse<MessageType, AttachmentType, ReactionType, UserType>, {}>, reaction: ReactionResponse<ReactionType, UserType>): any;
        removeReaction(reaction: ReactionResponse<ReactionType, UserType>, message?: MessageResponse<MessageType, AttachmentType, ReactionType, UserType>): void;
        /**
         * _addToMessageList - Adds a message to a list of messages, tries to update first, appends if message isnt found
         *
         * @param {array} messages A list of messages
         * @param {object} newMessage The new message
         *
         */
        _addToMessageList(messages: Immutable.ImmutableArray<ParsedMessageResponse<MessageType, AttachmentType, ReactionType, UserType>>, newMessage: ParsedMessageResponse<MessageType, AttachmentType, ReactionType, UserType>): Immutable.ImmutableArray<ParsedMessageResponse<MessageType, AttachmentType, ReactionType, UserType>>;
        /**
         * removeMessage - Description
         *
         * @param {type} messageToRemove Object of the message to remove. Needs to have at id specified.
         *
         * @return {boolean} Returns if the message was removed
         */
        removeMessage(messageToRemove: {
            id: string;
            parent_id?: string;
        }): boolean;
        removeMessageFromArray: (msgArray: Immutable.ImmutableArray<ParsedMessageResponse<MessageType, AttachmentType, ReactionType, UserType>>, msg: {
            id: string;
            parent_id?: string;
        }) => {
            removed: boolean;
            result: Immutable.ImmutableArray<ParsedMessageResponse<MessageType, AttachmentType, ReactionType, UserType>>;
        };
        /**
         * filterErrorMessages - Removes error messages from the channel state.
         *
         */
        filterErrorMessages(): void;
        /**
         * clean - Remove stale data such as users that stayed in typing state for more than 5 seconds
         */
        clean(): void;
        clearMessages(): void;
    }
}
declare module "src/events" {
    export const EVENT_MAP: {
        'user.presence.changed': boolean;
        'user.watching.start': boolean;
        'user.watching.stop': boolean;
        'user.updated': boolean;
        'user.deleted': boolean;
        'user.banned': boolean;
        'user.unbanned': boolean;
        'typing.start': boolean;
        'typing.stop': boolean;
        'message.new': boolean;
        'message.updated': boolean;
        'message.deleted': boolean;
        'message.read': boolean;
        'reaction.new': boolean;
        'reaction.deleted': boolean;
        'reaction.updated': boolean;
        'member.added': boolean;
        'member.updated': boolean;
        'member.removed': boolean;
        'channel.updated': boolean;
        'channel.muted': boolean;
        'channel.unmuted': boolean;
        'channel.deleted': boolean;
        'channel.truncated': boolean;
        'channel.created': boolean;
        'channel.hidden': boolean;
        'channel.visible': boolean;
        'health.check': boolean;
        'notification.message_new': boolean;
        'notification.mark_read': boolean;
        'notification.invited': boolean;
        'notification.invite_accepted': boolean;
        'notification.added_to_channel': boolean;
        'notification.removed_from_channel': boolean;
        'notification.mutes_updated': boolean;
        'notification.channel_deleted': boolean;
        'notification.channel_truncated': boolean;
        'notification.channel_mutes_updated': boolean;
        'connection.changed': boolean;
        'connection.recovered': boolean;
    };
    export const isValidEventType: (eventType: string) => boolean;
}
declare module "src/utils" {
    /**
     * logChatPromiseExecution - utility function for logging the execution of a promise..
     *  use this when you want to run the promise and handle errors by logging a warning
     *
     * @param {Promise<T>} promise The promise you want to run and log
     * @param {string} name    A descriptive name of what the promise does for log output
     *
     */
    export function logChatPromiseExecution<T>(promise: Promise<T>, name: string): void;
    export const sleep: (m: number) => Promise<void>;
    export function isFunction<T>(value: Function | T): value is Function;
    export const chatCodes: {
        TOKEN_EXPIRED: number;
        WS_CLOSED_SUCCESS: number;
    };
}
declare module "src/client_state" {
    import Immutable from 'seamless-immutable';
    import { UnknownType, UserResponse } from '../types/types';
    /**
     * ClientState - A container class for the client state.
     */
    export class ClientState<UserType = UnknownType> {
        users: Immutable.ImmutableObject<{
            [key: string]: Immutable.Immutable<UserResponse<UserType>>;
        }>;
        userChannelReferences: {
            [key: string]: {
                [key: string]: boolean;
            };
        };
        constructor();
        updateUsers(users: UserResponse<UserType>[]): void;
        updateUser(user?: UserResponse<UserType>): void;
        updateUserReference(user: UserResponse<UserType>, channelID: string): void;
    }
}
declare module "src/signing" {
    import { Secret, SignOptions } from 'jsonwebtoken';
    import { ExtraData } from '../types/types';
    /**
     * Creates the JWT token that can be used for a UserSession
     * @method JWTUserToken
     * @memberof signing
     * @private
     * @param {Secret} apiSecret - API Secret key
     * @param {string} userId - The user_id key in the JWT payload
     * @param {ExtraData} [extraData] - Extra that should be part of the JWT token
     * @param {SignOptions} [jwtOptions] - Options that can be past to jwt.sign
     * @return {string} JWT Token
     */
    export function JWTUserToken(apiSecret: Secret, userId: string, extraData?: ExtraData, jwtOptions?: SignOptions): string;
    export function JWTServerToken(apiSecret: Secret, jwtOptions?: SignOptions): string;
    export function UserFromToken(token: string): string;
    /**
     *
     * @param {string} userId the id of the user
     * @return {string}
     */
    export function DevToken(userId: string): string;
    /**
     *
     * @param {string} body the signed message
     * @param {string} secret the shared secret used to generate the signature (Stream API secret)
     * @param {string} signature the signature to validate
     * @return {boolean}
     */
    export function CheckSignature(body: string, secret: string, signature: string): boolean;
}
declare module "src/token_manager" {
    import { Secret } from 'jsonwebtoken';
    import { TokenOrProvider, UnknownType, User } from '../types/types';
    /**
     * TokenManager
     *
     * Handles all the operations around user token.
     */
    export class TokenManager<UserType = UnknownType> {
        loadTokenPromise: Promise<string> | null;
        type: 'static' | 'provider';
        secret?: Secret;
        token?: string;
        tokenProvider?: TokenOrProvider;
        user?: User<UserType>;
        /**
         * Constructor
         *
         * @param {Secret} secret
         */
        constructor(secret?: Secret);
        /**
         * Set the static string token or token provider.
         * Token provider should return a token string or a promise which resolves to string token.
         *
         * @param {TokenOrProvider} tokenOrProvider
         * @param {User<UserType>} user
         */
        setTokenOrProvider: (tokenOrProvider: TokenOrProvider, user: User<UserType>) => Promise<void>;
        /**
         * Resets the token manager.
         * Useful for client disconnection or switching user.
         */
        reset: () => void;
        validateToken: (tokenOrProvider: TokenOrProvider, user: User<UserType>) => void;
        tokenReady: () => Promise<string> | null;
        loadToken: () => Promise<string>;
        getToken: () => string | undefined;
        isStatic: () => boolean;
    }
}
declare module "src/connection" {
    import isoWS from 'isomorphic-ws';
    import WebSocket from 'isomorphic-ws';
    import { TokenManager } from "src/token_manager";
    import { ConnectionChangeEvent, ConnectionOpen, Logger, UnknownType, User } from '../types/types';
    type Constructor<UserType = UnknownType> = {
        wsBaseURL: string;
        clientID: string;
        userID: string;
        user: User<UserType>;
        userAgent: string;
        apiKey: string;
        tokenManager: TokenManager<UserType>;
        authType: 'anonymous' | 'jwt';
        messageCallback: (messageEvent: WebSocket.MessageEvent) => void;
        recoverCallback: (open?: ConnectionOpen<UserType>) => Promise<void>;
        eventCallback: (event: ConnectionChangeEvent) => void;
        logger: Logger | (() => void);
    };
    /**
     * StableWSConnection - A WS connection that reconnects upon failure.
     * - the browser will sometimes report that you're online or offline
     * - the WS connection can break and fail (there is a 30s health check)
     * - sometimes your WS connection will seem to work while the user is in fact offline
     * - to speed up online/offline detection you can use the window.addEventListener('offline');
     *
     * There are 4 ways in which a connection can become unhealthy:
     * - websocket.onerror is called
     * - websocket.onclose is called
     * - the health check fails and no event is received for ~40 seconds
     * - the browser indicates the connection is now offline
     *
     * There are 2 assumptions we make about the server:
     * - state can be recovered by querying the channel again
     * - if the servers fails to publish a message to the client, the WS connection is destroyed
     */
    export class StableWSConnection<UserType> {
        wsBaseURL: Constructor<UserType>['wsBaseURL'];
        clientID: Constructor<UserType>['clientID'];
        userID: Constructor<UserType>['userID'];
        user: Constructor<UserType>['user'];
        userAgent: Constructor<UserType>['userAgent'];
        authType: Constructor<UserType>['authType'];
        apiKey: Constructor<UserType>['apiKey'];
        tokenManager: Constructor<UserType>['tokenManager'];
        messageCallback: Constructor<UserType>['messageCallback'];
        recoverCallback: Constructor<UserType>['recoverCallback'];
        eventCallback: Constructor<UserType>['eventCallback'];
        logger: Constructor<UserType>['logger'];
        consecutiveFailures: number;
        healthCheckInterval: number;
        isConnecting: boolean;
        isHealthy: boolean;
        lastEvent: Date | null;
        monitorInterval: number;
        totalFailures: number;
        connectionID?: string;
        connectionOpen?: Promise<ConnectionOpen<UserType> | undefined>;
        healthCheckIntervalRef?: NodeJS.Timeout;
        isResolved?: boolean;
        monitorIntervalRef?: NodeJS.Timeout;
        rejectPromise?: (reason?: Error & {
            code?: string | number;
            StatusCode?: string | number;
            isWSFailure?: boolean;
        }) => void;
        resolvePromise?: (value?: WebSocket.MessageEvent) => void;
        ws?: isoWS;
        wsID: number;
        constructor({ wsBaseURL, clientID, userID, user, userAgent, apiKey, tokenManager, authType, messageCallback, recoverCallback, eventCallback, logger, }: Constructor<UserType>);
        /**
         * connect - Connect to the WS URL
         *
         * @return {Promise<ConnectionOpen<UserType> | void>} Promise that completes once the first health check message is received
         */
        connect(): Promise<void | ConnectionOpen<UserType>>;
        _buildUrl: () => string;
        /**
         * disconnect - Disconnect the connection and doesn't recover...
         *
         */
        disconnect(timeout?: number): Promise<void>;
        /**
         * _connect - Connect to the WS endpoint
         *
         * @return {Promise<ConnectionOpen<UserType> | undefined>} Promise that completes once the first health check message is received
         */
        _connect(): Promise<ConnectionOpen<UserType> | undefined>;
        /**
         * _reconnect - Retry the connection to WS endpoint
         *
         * @param {{ interval?: number; refreshToken?: boolean }} options Following options are available
         *
         * - `interval`	{int}			number of ms that function should wait before reconnecting
         * - `refreshToken` {boolean}	reload/refresh user token be refreshed before attempting reconnection.
         */
        _reconnect(options?: {
            interval?: number;
            refreshToken?: boolean;
        }): Promise<void>;
        /**
         * onlineStatusChanged - this function is called when the browser connects or disconnects from the internet.
         *
         * @param {Event} event Event with type online or offline
         *
         */
        onlineStatusChanged: (event: Event) => void;
        onopen: (wsID: number) => void;
        onmessage: (wsID: number, event: WebSocket.MessageEvent) => void;
        onclose: (wsID: number, event: WebSocket.CloseEvent) => void;
        onerror: (wsID: number, event: WebSocket.ErrorEvent) => void;
        /**
         * _setHealth - Sets the connection to healthy or unhealthy.
         * Broadcasts an event in case the connection status changed.
         *
         * @param {boolean} healthy boolean indicating if the connection is healthy or not
         *
         */
        _setHealth: (healthy: boolean) => void;
        /**
         * _errorFromWSEvent - Creates an error object for the WS event
         *
         */
        _errorFromWSEvent: (event: WebSocket.CloseEvent | WebSocket.Data | WebSocket.ErrorEvent, isWSFailure?: boolean) => Error & {
            code?: string | number | undefined;
            StatusCode?: string | number | undefined;
            isWSFailure?: boolean | undefined;
        };
        /**
         * _listenForConnectionChanges - Adds an event listener for the browser going online or offline
         *
         */
        _listenForConnectionChanges: () => void;
        _removeConnectionListeners: () => void;
        /**
         * _destroyCurrentWSConnection - Removes the current WS connection
         *
         */
        _destroyCurrentWSConnection(): void;
        /**
         * _retryInterval - A retry interval which increases after consecutive failures
         *
         * @return {number} Duration to wait in milliseconds
         */
        _retryInterval: () => number;
        /**
         * _setupPromise - sets up the this.connectOpen promise
         */
        _setupConnectionPromise: () => void;
        /**
         * _startHealthCheck - Sends a message every 30s or so to see if the ws connection still works
         *
         */
        _startHealthCheck(): void;
        /**
         * _startMonitor - Verifies we didn't miss any events. Marks the connection as failed in case we did.
         *
         */
        _startMonitor(): void;
    }
}
declare module "src/client" {
    import { AxiosRequestConfig, AxiosInstance, AxiosResponse } from 'axios';
    import WebSocket from 'ws';
    import { Channel } from "src/channel";
    import { ClientState } from "src/client_state";
    import { StableWSConnection } from "src/connection";
    import { TokenManager } from "src/token_manager";
    import { Configs, Logger, User, ConnectionOpen, TokenOrProvider, UserResponse, Event, EventHandler, ChannelMute, QueryFilters, ChannelSort, ChannelOptions, ChannelAPIResponse, ChannelData, AppSettings, CheckPushResponse, TestPushDataInput, UserFilters, UserSort, UserOptions, SearchOptions, MessageResponse, ReactionResponse, BanUserOptions, UnBanUserOptions, MuteUserResponse, FlagMessageOptions, FlagMessageResponse, MarkAllReadOptions, StreamChatOptions, CreateChannelOptions, GetChannelTypeResponse, UpdateChannelOptions, UpdateChannelResponse, ListChannelResponse, APIResponse, CustomPermissionOptions, SearchAPIResponse } from '../types/types';
    export class StreamChat<AttachmentType, ChannelType, EventTypeName, EventType, MessageType, ReactionType, UserType> {
        key: string;
        secret?: string;
        listeners: {
            [key: string]: Array<(event: Event) => void>;
        };
        state: ClientState<UserType>;
        mutedChannels: ChannelMute<AttachmentType, ChannelType, EventTypeName, EventType, MessageType, ReactionType, UserType>[];
        browser: boolean;
        node: boolean;
        options: StreamChatOptions;
        axiosInstance: AxiosInstance;
        wsConnection: StableWSConnection<UserType> | null;
        wsPromise: Promise<void | ConnectionOpen<UserType>> | null;
        setUserPromise: Promise<void | ConnectionOpen<UserType>> | null;
        activeChannels: {
            [key: string]: Channel<AttachmentType, ChannelType, EventTypeName, EventType, MessageType, ReactionType, UserType>;
        };
        configs: Configs;
        anonymous: boolean;
        tokenManager: TokenManager<UserType>;
        logger: Logger;
        baseURL?: string;
        wsBaseURL?: string;
        UUID?: string;
        userID?: string;
        clientID?: string;
        connectionID?: string;
        user?: User<UserType>;
        _user?: User<UserType>;
        cleaningIntervalRef?: NodeJS.Timeout;
        connectionEstablishedCount?: number;
        connecting?: boolean;
        failures?: number;
        constructor(key: string, options?: StreamChatOptions);
        constructor(key: string, secret?: string, options?: StreamChatOptions);
        devToken(userID: string): string;
        getAuthType(): "anonymous" | "jwt";
        setBaseURL(baseURL: string): void;
        _setupConnection: () => Promise<void | ConnectionOpen<UserType>>;
        _hasConnectionID: () => boolean;
        /**
         * setUser - Set the current user, this triggers a connection to the API
         *
         * @param {object} user Data about this user. IE {name: "john"}
         * @param {string} userToken   Token
         *
         * @return {promise} Returns a promise that resolves when the connection is setup
         */
        setUser: (user: User<UserType>, userTokenOrProvider: TokenOrProvider) => Promise<void | ConnectionOpen<UserType>>;
        _setToken: (user: User<UserType>, userTokenOrProvider: TokenOrProvider) => Promise<void>;
        _setUser(user: User<UserType>): void;
        /**
           * updateAppSettings - updates application settings
           *
           * @param {object} options App settings.
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
        updateAppSettings(options: AppSettings): Promise<APIResponse>;
        /**
         * getAppSettings - retrieves application settings
         */
        getAppSettings(): Promise<unknown>;
        /**
           * testPushSettings - Tests the push settings for a user with a random chat message and the configured push templates
           *
           * @param {string} userID User ID. If user has no devices, it will error
           * @param {object} [data] Overrides for push templates/message used
           * 		IE: {
                        messageID: 'id-of-message',//will error if message does not exist
                        apnTemplate: '{}', //if app doesn't have apn configured it will error
                        firebaseTemplate: '{}', //if app doesn't have firebase configured it will error
                        firebaseDataTemplate: '{}', //if app doesn't have firebase configured it will error
                  }
           */
        testPushSettings(userID: string, data?: TestPushDataInput): Promise<CheckPushResponse>;
        /**
         * disconnect - closes the WS connection
         */
        disconnect(timeout?: number): Promise<void>;
        setAnonymousUser: () => Promise<void | ConnectionOpen<UserType>>;
        /**
         * setGuestUser - Setup a temporary guest user
         *
         * @param {object} user Data about this user. IE {name: "john"}
         *
         * @return {promise} Returns a promise that resolves when the connection is setup
         */
        setGuestUser(user: User<UserType>): Promise<void | ConnectionOpen<UserType>>;
        /**
         * createToken - Creates a token to authenticate this user. This function is used server side.
         * The resulting token should be passed to the client side when the users registers or logs in
         *
         * @param {string}   userID         The User ID
         * @param {number}   exp            The expiration time for the token expressed in the number of seconds since the epoch
         *
         * @return {string} Returns a token
         */
        createToken(userID: string, exp?: number): string;
        /**
         * on - Listen to events on all channels and users your watching
         *
         * client.on('message.new', event => {console.log("my new message", event, channel.state.messages)})
         * or
         * client.on(event => {console.log(event.type)})
         *
         * @param {string} callbackOrString  The event type to listen for (optional)
         * @param {function} callbackOrNothing The callback to call
         *
         * @return {type} Description
         */
        on(callback: EventHandler): {
            unsubscribe: () => void;
        };
        on(eventType: string, callback: EventHandler): {
            unsubscribe: () => void;
        };
        /**
         * off - Remove the event handler
         *
         */
        off(callback: EventHandler): void;
        off(eventType: string, callback: EventHandler): void;
        _logApiRequest(type: string, url: string, data: unknown, config: AxiosRequestConfig & {
            config?: AxiosRequestConfig & {
                maxBodyLength?: number;
            };
        }): void;
        _logApiResponse(type: string, url: string, response: AxiosResponse): void;
        _logApiError(type: string, url: string, error: unknown): void;
        doAxiosRequest: <T>(type: string, url: string, data?: unknown, options?: AxiosRequestConfig & {
            config?: AxiosRequestConfig & {
                maxBodyLength?: number;
            };
        }) => Promise<T>;
        get<T>(url: string, params?: AxiosRequestConfig['params']): Promise<T>;
        put<T>(url: string, data?: unknown): Promise<T>;
        post<T>(url: string, data?: unknown): Promise<T>;
        patch<T>(url: string, data?: unknown): Promise<T>;
        delete<T>(url: string, params?: AxiosRequestConfig['params']): Promise<T>;
        sendFile<T>(url: string, uri: string | Buffer | File, name?: string, contentType?: string, user?: User<UserType>): Promise<T>;
        errorFromResponse<T>(response: AxiosResponse<T & {
            code?: number;
            message?: string;
        }>): Error & {
            response?: AxiosResponse<T> | undefined;
            status?: number | undefined;
            code?: number | undefined;
        };
        handleResponse<T>(response: AxiosResponse<T>): T;
        dispatchEvent: (event: Event<EventTypeName, EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType>) => void;
        handleEvent: (messageEvent: WebSocket.MessageEvent) => void;
        _handleClientEvent(event: Event): void;
        _muteStatus(cid: string): {
            muted: boolean;
            createdAt: null;
            expiresAt: null;
        };
        _callClientListeners: (event: Event) => void;
        recoverState: () => Promise<void>;
        _updateUserReferences(user: User<UserType>): void;
        connect(): Promise<void | ConnectionOpen<UserType>>;
        /**
         * queryUsers - Query users and watch user presence
         *
         * @param {object} filterConditions MongoDB style filter conditions
         * @param {object} sort             Sort options, for instance {last_active: -1}
         * @param {object} options          Option object, {presence: true}
         *
         * @return {object} User Query Response
         */
        queryUsers(filterConditions: UserFilters, sort?: UserSort<User<UserType>>, options?: UserOptions): Promise<APIResponse & {
            users: Array<UserResponse<UserType>>;
        }>;
        queryChannels(filterConditions: QueryFilters, sort?: ChannelSort, options?: ChannelOptions): Promise<Channel<AttachmentType, ChannelType, EventTypeName, EventType, MessageType, ReactionType, UserType>[]>;
        /**
         * search - Query messages
         *
         * @param {object} channels MongoDB style filter conditions
         * @param {object|string}  message search query or object MongoDB style filters
         * @param {object} options       Option object, {user_id: 'tommaso'}
         *
         * @return {object} search messages response
         */
        search(filterConditions: QueryFilters, query: string | QueryFilters, options?: SearchOptions): Promise<SearchAPIResponse<MessageType, AttachmentType, ReactionType, UserType>>;
        /**
         * addDevice - Adds a push device for a user.
         *
         * @param {string} id the device id
         * @param {string} push_provider the push provider (apn or firebase)
         * @param {string} [userID] the user id (defaults to current user)
         *
         */
        addDevice(id: string, push_provider: string, userID?: string): Promise<unknown>;
        /**
         * getDevices - Returns the devices associated with a current user
         *
         * @param {string} [userID] User ID. Only works on serversidex
         *
         * @return {devices} Array of devices
         */
        getDevices(userID?: string): Promise<unknown>;
        /**
         * removeDevice - Removes the device with the given id. Clientside users can only delete their own devices
         *
         * @param {string} id The device id
         * @param {string} [userID] The user id. Only specify this for serverside requests
         *
         */
        removeDevice(id: string, userID?: string): Promise<unknown>;
        _addChannelConfig(channelState: ChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>): void;
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
        channel(channelType: string, channelID: string, custom?: ChannelData): Channel<AttachmentType, ChannelType, EventTypeName, EventType, MessageType, ReactionType, UserType>;
        /**
         * @deprecated Please use upsertUser() function instead.
         *
         * updateUser - Update or Create the given user object
         *
         * @param {object} A user object, the only required field is the user id. IE {id: "myuser"} is valid
         *
         * @return {object}
         */
        updateUser(userObject: User<UserType>): Promise<APIResponse & {
            users: {
                [key: string]: User<UserType>;
            };
        }>;
        /**
         * partialUpdateUser - Update the given user object
         *
         * @param {object} Object which should contain id and any of "set" or "unset" params;
         * example: {id: "user1", set:{field: value}, unset:["field2"]}
         *
         * @return {object} list of updated users
         */
        partialUpdateUser(userObject: User<UserType>): Promise<APIResponse & {
            users: {
                [key: string]: UserResponse<UserType>;
            };
        }>;
        /**
         * upsertUsers - Batch upsert the list of users
         *
         * @param {array} A list of users
         *
         * @return {object}
         */
        upsertUsers(users: User<UserType>[]): Promise<APIResponse & {
            users: {
                [key: string]: User<UserType>;
            };
        }>;
        /**
         * upsertUser - Update or Create the given user object
         *
         * @param {object} A user object, the only required field is the user id. IE {id: "myuser"} is valid
         *
         * @return {object}
         */
        upsertUser(userObject: User<UserType>): Promise<APIResponse & {
            users: {
                [key: string]: User<UserType>;
            };
        }>;
        /**
         * @deprecated Please use upsertUsers() function instead.
         *
         * updateUsers - Batch update the list of users
         *
         * @param {array} A list of users
         *
         * @return {object}
         */
        updateUsers(users: Array<User<UserType>>): Promise<APIResponse & {
            users: {
                [key: string]: User<UserType>;
            };
        }>;
        /**
         * updateUsers - Batch partial update of users
         *
         * @param {array} A list of partial update requests
         *
         * @return {object}
         */
        partialUpdateUsers(users: Array<User<UserType>>): Promise<APIResponse & {
            users: {
                [key: string]: UserResponse<UserType>;
            };
        }>;
        deleteUser(userID: string, params?: {
            hard_delete?: boolean;
            mark_messages_deleted?: boolean;
        }): Promise<APIResponse & {
            user: UserResponse<UserType>;
        }>;
        reactivateUser(userID: string, options?: {
            restore_messages?: boolean;
        }): Promise<APIResponse & {
            user: UserResponse<UserType>;
        }>;
        deactivateUser(userID: string, options?: {
            mark_messages_deleted?: boolean;
        }): Promise<APIResponse & {
            user: UserResponse<UserType>;
        }>;
        exportUser(userID: string, options?: Record<string, unknown>): Promise<APIResponse & {
            messages: Array<MessageResponse<MessageType, AttachmentType, ReactionType, UserType>>;
            reactions: Array<ReactionResponse<ReactionType, UserType>>;
            user: UserResponse<UserType>;
        }>;
        /** banUser - bans a user from all channels
         *
         * @param targetUserID
         * @param options
         * @returns {Promise<*>}
         */
        banUser(targetUserID: string, options?: BanUserOptions<UserType>): Promise<APIResponse>;
        /** unbanUser - revoke global ban for a user
         *
         * @param targetUserID
         * @returns {Promise<*>}
         */
        unbanUser(targetUserID: string, options: UnBanUserOptions): Promise<APIResponse>;
        /** muteUser - mutes a user
         *
         * @param targetID
         * @param [userID] Only used with serverside auth
         * @returns {Promise<*>}
         */
        muteUser(targetID: string, userID?: string): Promise<MuteUserResponse<UserType>>;
        /** unmuteUser - unmutes a user
         *
         * @param targetID
         * @param [currentUserID] Only used with serverside auth
         * @returns {Promise<*>}
         */
        unmuteUser(targetID: string, currentUserID?: string): Promise<APIResponse>;
        flagMessage(targetMessageID: string, options?: FlagMessageOptions<UserType>): Promise<FlagMessageResponse<UserType>>;
        flagUser(userID: string, options?: FlagMessageOptions<UserType>): Promise<FlagMessageResponse<UserType>>;
        unflagMessage(messageID: string, options?: FlagMessageOptions<UserType>): Promise<FlagMessageResponse<UserType>>;
        unflagUser(userID: string, options?: FlagMessageOptions<UserType>): Promise<FlagMessageResponse<UserType>>;
        /**
         * markAllRead - marks all channels for this user as read
         *
         * @return {Promise} Description
         */
        markAllRead(data?: MarkAllReadOptions<UserType>): Promise<void>;
        createChannelType(data: CreateChannelOptions): Promise<Pick<GetChannelTypeResponse, "search" | "created_at" | "updated_at" | "name" | "automod" | "automod_behavior" | "max_message_length" | "message_retention" | "mutes" | "permissions" | "reactions" | "read_events" | "replies" | "typing_events" | "uploads" | "url_enrichment" | "duration">>;
        getChannelType(channelType: string): Promise<GetChannelTypeResponse>;
        updateChannelType(channelType: string, data: UpdateChannelOptions): Promise<UpdateChannelResponse>;
        deleteChannelType(channelType: string): Promise<APIResponse>;
        listChannelTypes(): Promise<ListChannelResponse>;
        /**
         * translateMessage - adds the translation to the message
         *
         * @param {string} messageId
         *
         * @return {object} Response that includes the message
         */
        translateMessage(messageId: string, language: string): Promise<APIResponse & MessageType & {
            attachments?: import("types/types").Attachment<AttachmentType>[] | undefined;
            html?: string | undefined;
            id?: string | undefined;
            parent_id?: string | undefined;
            show_in_channel?: boolean | undefined;
            text?: string | undefined;
            user_id?: string | undefined;
        } & {
            command?: string | undefined;
            created_at?: string | undefined;
            deleted_at?: string | undefined;
            latest_reactions?: ReactionResponse<ReactionType, UserType>[] | undefined;
            mentioned_users?: UserResponse<UserType>[] | undefined;
            own_reactions?: ReactionResponse<ReactionType, UserType>[] | undefined;
            reaction_counts?: {
                [key: string]: number;
            } | undefined;
            reaction_scores?: {
                [key: string]: number;
            } | undefined;
            reply_count?: number | undefined;
            silent?: boolean | undefined;
            status?: string | undefined;
            type?: string | undefined;
            user?: UserResponse<UserType> | undefined;
            updated_at?: string | undefined;
        }>;
        /**
         * updateMessage - Update the given message
         *
         * @param {object} message object, id needs to be specified
         *
         * @return {object} Response that includes the message
         */
        updateMessage(message: MessageResponse<MessageType, ReactionType, AttachmentType, UserType>, userId?: string | {
            id: string;
        }): Promise<APIResponse & {
            message: MessageResponse<MessageType, ReactionType, AttachmentType, UserType>;
        }>;
        deleteMessage(messageID: string, hardDelete?: boolean): Promise<APIResponse & {
            message: MessageResponse<MessageType, ReactionType, AttachmentType, UserType>;
        }>;
        getMessage(messageID: string): Promise<APIResponse & {
            message: MessageResponse<MessageType, ReactionType, AttachmentType, UserType>;
        }>;
        _userAgent(): string;
        /**
         * _isUsingServerAuth - Returns true if we're using server side auth
         */
        _isUsingServerAuth: () => boolean;
        _enrichAxiosOptions(options?: AxiosRequestConfig & {
            config?: AxiosRequestConfig;
        }): {
            params: any;
            headers: any;
        } | {
            url?: string | undefined;
            method?: string | undefined;
            baseURL?: string | undefined;
            transformRequest?: import("axios").AxiosTransformer | import("axios").AxiosTransformer[] | undefined;
            transformResponse?: import("axios").AxiosTransformer | import("axios").AxiosTransformer[] | undefined;
            headers: any;
            params: any;
            paramsSerializer?: ((params: any) => string) | undefined;
            data?: any;
            timeout?: number | undefined;
            withCredentials?: boolean | undefined;
            adapter?: import("axios").AxiosAdapter | undefined;
            auth?: import("axios").AxiosBasicCredentials | undefined;
            responseType?: string | undefined;
            xsrfCookieName?: string | undefined;
            xsrfHeaderName?: string | undefined;
            onUploadProgress?: ((progressEvent: any) => void) | undefined;
            onDownloadProgress?: ((progressEvent: any) => void) | undefined;
            maxContentLength?: number | undefined;
            validateStatus?: ((status: number) => boolean) | undefined;
            maxRedirects?: number | undefined;
            httpAgent?: any;
            httpsAgent?: any;
            proxy?: false | import("axios").AxiosProxyConfig | undefined;
            cancelToken?: import("axios").CancelToken | undefined;
        };
        _getToken(): string | null | undefined;
        _startCleaning(): void;
        verifyWebhook(requestBody: string, xSignature: string): boolean;
        /** getPermission - gets the definition for a permission
         *
         * @param {string} name
         * @returns {Promise<*>}
         */
        getPermission(name: string): Promise<APIResponse>;
        /** createPermission - creates a custom permission
         *
         * @param {object} permissionData the permission data
         * @returns {Promise<*>}
         */
        createPermission(permissionData: CustomPermissionOptions): Promise<APIResponse>;
        /** updatePermission - updates an existing custom permission
         *
         * @param {string} name
         * @param {object} permissionData the permission data
         * @returns {Promise<*>}
         */
        updatePermission(name: string, permissionData: CustomPermissionOptions): Promise<APIResponse>;
        /** deletePermission - deletes a custom permission
         *
         * @param {name}
         * @returns {Promise<*>}
         */
        deletePermission(name: string): Promise<APIResponse>;
        /** listPermissions - returns the list of custom permissions for this application
         *
         * @returns {Promise<*>}
         */
        listPermissions(): Promise<APIResponse>;
        /** createRole - creates a custom role
         *
         * @param {string} name the new role name
         * @returns {Promise<*>}
         */
        createRole(name: string): Promise<APIResponse>;
        /** listRoles - returns the list of custom roles for this application
         *
         * @returns {Promise<*>}
         */
        listRoles(): Promise<APIResponse>;
        /** deleteRole - deletes a custom role
         *
         * @param {string} name the role name
         * @returns {Promise<*>}
         */
        deleteRole(name: string): Promise<APIResponse>;
        /** sync - returns all events that happened for a list of channels since last sync
         * @param {array} channel_cids list of channel CIDs
         * @param {string} last_sync_at last time the user was online and in sync. RFC3339 ie. "2020-05-06T15:05:01.207Z"
         */
        sync(channel_cids: string[], last_sync_at: string): Promise<APIResponse & {
            events: Event[];
        }>;
    }
}
declare module "src/channel" {
    import Immutable, { ImmutableObject } from 'seamless-immutable';
    import { ChannelState } from "src/channel_state";
    import { StreamChat } from "src/client";
    import { APIResponse, ChannelAPIResponse, ChannelData, ChannelResponse, DeleteChannelAPIResponse, Event, EventHandler, EventTypes, GetMultipleMessagesAPIResponse, GetReactionsAPIResponse, GetRepliesAPIResponse, MarkReadAPIResponse, Message, MuteChannelAPIResponse, Reaction, ReactionAPIResponse, SearchAPIResponse, SendEventAPIResponse, SendMessageAPIResponse, TruncateChannelAPIResponse, UpdateChannelAPIResponse, User, ChannelMemberAPIResponse, UserResponse, SendImageAPIResponse } from '../types/types';
    /**
     * Channel - The Channel class manages it's own state.
     */
    export class Channel<AttachmentType, ChannelType, EventType, EventTypeName, MessageType, ReactionType, UserType> {
        _client: StreamChat<AttachmentType, ChannelType, EventType, EventTypeName, MessageType, ReactionType, UserType>;
        type: string;
        id: string | undefined;
        data: ChannelData | ChannelResponse<ChannelType, UserType> | ImmutableObject<ChannelResponse<{
            [key: string]: unknown;
        }>> | undefined;
        _data: ChannelData | ChannelResponse<ChannelType, UserType>;
        cid: string;
        listeners: {
            [key: string]: (string | EventHandler)[];
        };
        state: ChannelState<AttachmentType, ChannelType, EventType, EventTypeName, MessageType, ReactionType, UserType>;
        initialized: boolean;
        lastKeyStroke?: Date;
        lastTypingEvent: Date | null;
        isTyping: boolean;
        disconnected: boolean;
        /**
         * constructor - Create a channel
         *
         * @param {Client} client the chat client
         * @param {string} type  the type of channel
         * @param {string} [id]  the id of the chat
         * @param {type} custom any additional custom params
         *
         * @return {Channel} Returns a new uninitialized channel
         */
        constructor(client: StreamChat<AttachmentType, ChannelType, EventType, EventTypeName, MessageType, ReactionType, UserType>, type: string, id: string | undefined, data: ChannelData);
        /**
         * getClient - Get the chat client for this channel. If client.disconnect() was called, this function will error
         *
         * @return {object}
         */
        getClient(): StreamChat<AttachmentType, ChannelType, EventType, EventTypeName, MessageType, ReactionType, UserType>;
        /**
         * getConfig - Get the configs for this channel type
         *
         * @return {object}
         */
        getConfig(): Record<string, unknown>;
        /**
         * sendMessage - Send a message to this channel
         *
         * @param {object} message The Message object
         *
         * @return {object} The Server Response
         */
        sendMessage(message: Message<MessageType, AttachmentType, UserType>): Promise<SendMessageAPIResponse<MessageType, AttachmentType, ReactionType, UserType>>;
        sendFile(uri: string | Buffer | File, name?: string, contentType?: string, user?: User<UserType>): Promise<SendImageAPIResponse>;
        sendImage(uri: string | Buffer | File, name?: string, contentType?: string, user?: UserResponse<UserType>): Promise<SendImageAPIResponse>;
        deleteFile(url: string): Promise<APIResponse>;
        deleteImage(url: string): Promise<APIResponse>;
        /**
         * sendEvent - Send an event on this channel
         *
         * @param {object} event for example {type: 'message.read'}
         *
         * @return {object} The Server Response
         */
        sendEvent(event: Event): Promise<SendEventAPIResponse<string>>;
        /**
         * search - Query messages
         *
         * @param {object|string}  message search query or object MongoDB style filters
         * @param {object} options       Option object, {user_id: 'tommaso'}
         *
         * @return {object} search messages response
         */
        search<T = {
            [key: string]: unknown;
        }>(query: string | Record<string, unknown>, options: T & {
            query?: string;
            message_filter_conditions?: Record<string, unknown>;
        }): Promise<SearchAPIResponse<MessageType, AttachmentType, ReactionType, UserType>>;
        /**
         * search - Query Members
         *
         * @param {object}  filterConditions object MongoDB style filters
         * @param {object} sort             Sort options, for instance {created_at: -1}
         * @param {object} options        Option object, {limit: 10, offset:10}
         *
         * @return {object} search members response
         */
        queryMembers(filterConditions: Record<string, unknown>, sort?: Record<string, unknown>, options?: Record<string, unknown>): Promise<ChannelMemberAPIResponse<UserType>>;
        /**
         * sendReaction - Send a reaction about a message
         *
         * @param {string} messageID the message id
         * @param {object} reaction the reaction object for instance {type: 'love'}
         * @param {string} user_id the id of the user (used only for server side request) default null
         *
         * @return {object} The Server Response
         */
        sendReaction(messageID: string, reaction: Reaction<ReactionType, UserType>, user_id: string): Promise<ReactionAPIResponse<ReactionType, AttachmentType, MessageType, UserType>>;
        /**
         * deleteReaction - Delete a reaction by user and type
         *
         * @param {string} messageID the id of the message from which te remove the reaction
         * @param {string} reactionType the type of reaction that should be removed
         * @param {string} user_id the id of the user (used only for server side request) default null
         *
         * @return {object} The Server Response
         */
        deleteReaction(messageID: string, reactionType: string, user_id: string): Promise<ReactionAPIResponse<ReactionType, AttachmentType, MessageType, UserType>>;
        /**
         * update - Edit the channel's custom properties
         *
         * @param {object} channelData The object to update the custom properties of this channel with
         * @param {object} updateMessage Optional message object for channel members notification
         * @return {type} The server response
         */
        update(channelData: ChannelData, updateMessage?: Message<MessageType, AttachmentType, UserType>): Promise<UpdateChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>;
        /**
         * delete - Delete the channel. Messages are permanently removed.
         *
         * @return {object} The server response
         */
        delete(): Promise<DeleteChannelAPIResponse<ChannelType, UserType>>;
        /**
         * truncate - Removes all messages from the channel
         *
         * @return {object} The server response
         */
        truncate(): Promise<TruncateChannelAPIResponse<ChannelType, UserType>>;
        /**
         * acceptInvite - accept invitation to the channel
         *
         * @param {object} options The object to update the custom properties of this channel with
         *
         * @return {type} The server response
         */
        acceptInvite(options?: Record<string, unknown>): Promise<UpdateChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>;
        /**
         * acceptInvite - reject invitation to the channel
         *
         * @param {object} options The object to update the custom properties of this channel with
         *
         * @return {type} The server response
         */
        rejectInvite(options?: Record<string, unknown>): Promise<UpdateChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>;
        /**
         * addMembers - add members to the channel
         *
         * @param {array} members An array of member identifiers
         * @param {object} message Optional message object for channel members notification
         * @return {type} The server response
         */
        addMembers(members: string[], message?: Message<MessageType, AttachmentType, UserType>): Promise<UpdateChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>;
        /**
         * addModerators - add moderators to the channel
         *
         * @param {array} members An array of member identifiers
         * @param {object} message Optional message object for channel members notification
         * @return {type} The server response
         */
        addModerators(members: string[], message?: Message<MessageType, AttachmentType, UserType>): Promise<UpdateChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>;
        /**
         * inviteMembers - invite members to the channel
         *
         * @param {array} members An array of member identifiers
         * @param {object} message Optional message object for channel members notification
         * @return {type} The server response
         */
        inviteMembers(members: string[], message?: Message<MessageType, AttachmentType, UserType>): Promise<UpdateChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>;
        /**
         * removeMembers - remove members from channel
         *
         * @param {array} members An array of member identifiers
         * @param {object} message Optional message object for channel members notification
         * @return {type} The server response
         */
        removeMembers(members: string[], message?: Message<MessageType, AttachmentType, UserType>): Promise<UpdateChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>;
        /**
         * demoteModerators - remove moderator role from channel members
         *
         * @param {array} members An array of member identifiers
         * @param {object} message Optional message object for channel members notification
         * @return {type} The server response
         */
        demoteModerators(members: string[], message?: Message<MessageType>): Promise<UpdateChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>;
        /**
         * mute - mutes the current channel
         * @param {object} 				opts expiration or user_id
         * @return {object} 			The server response
         *
         * example with expiration:
         * await channel.mute({expiration: moment.duration(2, 'weeks')});
         *
         * example server side:
         * await channel.mute({user_id: userId});
         *
         */
        mute(opts?: Record<string, unknown>): Promise<MuteChannelAPIResponse<AttachmentType, ChannelType, EventType, EventTypeName, MessageType, ReactionType, UserType>>;
        /**
         * unmute - mutes the current channel
         * @param {object} opts user_id
         * @return {object} 			The server response
         *
         * example server side:
         * await channel.unmute({user_id: userId});
         */
        unmute(opts?: Record<string, unknown>): Promise<APIResponse>;
        /**
         * muteStatus - returns the mute status for the current channel
         * @return {object} { muted: true | false, createdAt: Date | null, expiresAt: Date | null}
         */
        muteStatus(): {
            muted: boolean;
            createdAt?: string | null;
            expiredAt?: string | null;
        };
        sendAction(messageID: string, formData: Record<string, unknown>): Promise<unknown>;
        /**
         * keystroke - First of the typing.start and typing.stop events based on the users keystrokes.
         *  Call this on every keystroke
         */
        keystroke(): Promise<void>;
        /**
         * stopTyping - Sets last typing to null and sends the typing.stop event
         */
        stopTyping(): Promise<void>;
        /**
         * lastMessage - return the last message, takes into account that last few messages might not be perfectly sorted
         *
         * @return {type} Description
         */
        lastMessage(): Immutable.Immutable<import("types/types").ParsedMessageResponse<MessageType, AttachmentType, ReactionType, UserType>, {}> | undefined;
        /**
         * markRead - Send the mark read event for this user, only works if the `read_events` setting is enabled
         *
         * @return {Promise} Description
         */
        markRead(data?: {}): Promise<MarkReadAPIResponse | null>;
        /**
         * clean - Cleans the channel state and fires stop typing if needed
         */
        clean(): void;
        /**
         * watch - Loads the initial channel state and watches for changes
         *
         * @param {object} options additional options for the query endpoint
         *
         * @return {object} The server response
         */
        watch(options: Record<string, unknown>): Promise<ChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>;
        /**
         * stopWatching - Stops watching the channel
         *
         * @return {object} The server response
         */
        stopWatching(): Promise<APIResponse>;
        /**
         * getReplies - List the message replies for a parent message
         *
         * @param {type} parent_id The message parent id, ie the top of the thread
         * @param {type} options   Pagination params, ie {limit:10, idlte: 10}
         *
         * @return {type} A response with a list of messages
         */
        getReplies(parent_id: string, options: Record<string, unknown>): Promise<GetRepliesAPIResponse<MessageType, AttachmentType, ReactionType, UserType>>;
        /**
         * getReactions - List the reactions, supports pagination
         *
         * @param {string} message_id The message id
         * @param {object} options    The pagination options
         *
         * @return {object} Server response
         */
        getReactions(message_id: string, options: Record<string, unknown>): Promise<GetReactionsAPIResponse<ReactionType, UserType>>;
        /**
         * getMessagesById - Retrieves a list of messages by ID
         *
         * @param {array} messageIds The ids of the messages to retrieve from this channel
         *
         * @return {object} Server response
         */
        getMessagesById(messageIds: string[]): Promise<GetMultipleMessagesAPIResponse<MessageType, AttachmentType, ReactionType, UserType>>;
        /**
         * lastRead - returns the last time the user marked the channel as read if the user never marked the channel as read, this will return null
         * @return {Date}
         */
        lastRead(): Immutable.ImmutableDate | null | undefined;
        /**
         * countUnread - Count the number of messages with a date thats newer than the last read timestamp
         *
         * @param [date] lastRead the time that the user read a message, defaults to current user's read state
         *
         * @return {int} Unread count
         */
        countUnread(lastRead: Date | Immutable.ImmutableDate | null | undefined): number;
        /**
         * countUnread - Count the number of unread messages mentioning the current user
         *
         * @return {int} Unread mentions count
         */
        countUnreadMentions(): number;
        /**
         * create - Creates a new channel
         *
         * @return {type} The Server Response
         */
        create: () => Promise<ChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>;
        /**
         * query - Query the API, get messages, members or other channel fields
         *
         * @param {object} options The query options
         *
         * @return {object} Returns a query response
         */
        query(options: Record<string, unknown>): Promise<ChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>>;
        /**
         * banUser - Bans a user from a channel
         *
         * @param targetUserID
         * @param options
         * @returns {Promise<*>}
         */
        banUser(targetUserID: string, options: Record<string, unknown>): Promise<APIResponse>;
        /**
         * hides the channel from queryChannels for the user until a message is added
         * If clearHistory is set to true - all messages will be removed for the user
         *
         * @param userId
         * @param clearHistory
         * @returns {Promise<*>}
         */
        hide(userId?: string | null, clearHistory?: boolean): Promise<unknown>;
        /**
         * removes the hidden status for a channel
         *
         * @param userId
         * @returns {Promise<*>}
         */
        show(userId?: string | null): Promise<unknown>;
        /**
         * banUser - Removes the bans for a user on a channel
         *
         * @param targetUserID
         * @returns {Promise<*>}
         */
        unbanUser(targetUserID: string): Promise<APIResponse>;
        /**
         * on - Listen to events on this channel.
         *
         * channel.on('message.new', event => {console.log("my new message", event, channel.state.messages)})
         * or
         * channel.on(event => {console.log(event.type)})
         *
         * @param {string} callbackOrString  The event type to listen for (optional)
         * @param {function} callbackOrNothing The callback to call
         *
         * @return {type} Description
         */
        on(eventType: EventTypes, callback: EventHandler): void;
        on(callback: EventHandler): void;
        /**
         * off - Remove the event handler
         *
         */
        off(eventType: EventTypes, callback: EventHandler): void;
        off(callback: EventHandler): void;
        _handleChannelEvent(event: Event<EventTypeName, EventType, AttachmentType, ChannelType, MessageType, ReactionType, UserType>): void;
        _callChannelListeners: (event: Event) => void;
        /**
         * _channelURL - Returns the channel url
         *
         * @return {string} The channel url
         */
        _channelURL: () => string;
        _checkInitialized(): void;
        _initializeState(state: ChannelAPIResponse<ChannelType, AttachmentType, MessageType, ReactionType, UserType>): void;
        _disconnect(): void;
    }
}
declare module "src/permissions" {
    import { PermissionObject } from '../types/types';
    type RequiredPermissionObject = Required<PermissionObject>;
    export const Allow = "Allow";
    export const Deny = "Deny";
    export const AnyResource: string[];
    export const AnyRole: string[];
    export const MaxPriority = 999;
    export const MinPriority = 1;
    export class Permission {
        name: RequiredPermissionObject['name'];
        action: RequiredPermissionObject['action'];
        owner: RequiredPermissionObject['owner'];
        priority: RequiredPermissionObject['priority'];
        resources: RequiredPermissionObject['resources'];
        roles: RequiredPermissionObject['roles'];
        constructor(name: string, priority: number, resources?: string[], roles?: string[], owner?: boolean, action?: RequiredPermissionObject['action']);
    }
    export const AllowAll: Permission;
    export const DenyAll: Permission;
    export const BuiltinRoles: {
        Anonymous: string;
        Guest: string;
        User: string;
        Admin: string;
        ChannelModerator: string;
        ChannelMember: string;
    };
    export const BuiltinPermissions: {
        CreateMessage: string;
        UpdateAnyMessage: string;
        UpdateOwnMessage: string;
        DeleteAnyMessage: string;
        DeleteOwnMessage: string;
        CreateChannel: string;
        ReadAnyChannel: string;
        ReadOwnChannel: string;
        UpdateMembersAnyChannel: string;
        UpdateMembersOwnChannel: string;
        UpdateAnyChannel: string;
        UpdateOwnChannel: string;
        DeleteAnyChannel: string;
        DeleteOwnChannel: string;
        RunMessageAction: string;
        BanUser: string;
        UploadAttachment: string;
        DeleteAnyAttachment: string;
        DeleteOwnAttachment: string;
        AddLinks: string;
        CreateReaction: string;
        DeleteAnyReaction: string;
        DeleteOwnReaction: string;
    };
}
declare module "src/index" {
    export * from "src/base64";
    export { StreamChat } from "src/client";
    export * from "src/client_state";
    export * from "src/channel";
    export * from "src/channel_state";
    export * from "src/connection";
    export * from "src/events";
    export * from "src/permissions";
    export * from "src/signing";
    export * from "src/token_manager";
    export { logChatPromiseExecution } from "src/utils";
}
//# sourceMappingURL=index.d.ts.map