declare module 'base64' {
  export function encodeBase64(data: any): any;
  export function decodeBase64(s: any): string;
}
declare module 'channel_state' {
  export class ChannelState {
    constructor(channel: any);
    _channel: any;
    watcher_count: number;
    typing: Immutable.ImmutableObject<{}>;
    read: Immutable.ImmutableObject<{}>;
    messages: any;
    threads: Immutable.ImmutableObject<{}>;
    mutedUsers: Immutable.ImmutableArray<never>;
    watchers: Immutable.ImmutableObject<{}>;
    members: Immutable.ImmutableObject<{}>;
    membership: Immutable.ImmutableObject<{}>;
    last_message_at: Date | null;
    /**
     * addMessageSorted - Add a message to the state
     *
     * @param {object} newMessage A new message
     *
     */
    addMessageSorted(newMessage: object): void;
    /**
     * messageToImmutable - Takes the message object. Parses the dates, sets __html
     * and sets the status to received if missing. Returns an immutable message object
     *
     * @param {object} message an Immutable message object
     *
     */
    messageToImmutable(message: object): Immutable.ImmutableObject<object>;
    /**
     * addMessagesSorted - Add the list of messages to state and resorts the messages
     *
     * @param {array}   newMessages    A list of messages
     * @param {boolean} initializing   Weather channel is being initialized.
     *
     */
    addMessagesSorted(newMessages: any, initializing?: boolean): void;
    addReaction(reaction: any, message: any): void;
    _addReactionToMessage(message: any, reaction: any): any;
    _removeReactionFromMessage(message: any, reaction: any): any;
    removeReaction(reaction: any, message: any): void;
    /**
     * _addToMessageList - Adds a message to a list of messages, tries to update first, appends if message isnt found
     *
     * @param {array} messages A list of messages
     * @param {object} newMessage The new message
     *
     */
    _addToMessageList(messages: any, newMessage: object): any;
    /**
     * removeMessage - Description
     *
     * @param {type} messageToRemove Object of the message to remove. Needs to have at id specified.
     *
     * @return {boolean} Returns if the message was removed
     */
    removeMessage(messageToRemove: any): boolean;
    removeMessageFromArray: (
      msgArray: any,
      msg: any,
    ) => {
      removed: boolean;
      result: any;
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
  import Immutable from 'seamless-immutable';
}
declare module 'events' {
  export function isValidEventType(eventType: any): any;
  export const EVENT_MAP: {
    'user.presence.changed': boolean;
    'user.watching.start': boolean;
    'user.watching.stop': boolean;
    'user.updated': boolean;
    'user.deleted': boolean;
    'typing.start': boolean;
    'typing.stop': boolean;
    'message.new': boolean;
    'message.updated': boolean;
    'message.deleted': boolean;
    'message.read': boolean;
    'reaction.new': boolean;
    'reaction.deleted': boolean;
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
}
declare module 'utils' {
  /**
   * logChatPromiseExecution - utility function for logging the execution of a promise..
   *  use this when you want to run the promise and handle errors by logging a warning
   *
   * @param {type} promise The promise you want to run and log
   * @param {type} name    A descriptive name of what the promise does for log output
   *
   */
  export function logChatPromiseExecution(promise: any, name: any): void;
  export function isFunction(value: any): boolean;
  export function sleep(m: any): Promise<any>;
  export namespace chatCodes {
    export const TOKEN_EXPIRED: number;
    export const WS_CLOSED_SUCCESS: number;
  }
}
declare module 'channel' {
  /**
   * Channel - The Channel class manages it's own state.
   */
  export class Channel {
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
    constructor(client: any, type: string, id?: string | undefined, data: any);
    _client: any;
    type: string;
    id: string | undefined;
    data: any;
    _data: any;
    cid: string;
    listeners: {};
    state: ChannelState;
    initialized: boolean;
    lastTypingEvent: Date | null;
    isTyping: boolean;
    disconnected: boolean;
    /**
     * getClient - Get the chat client for this channel. If client.disconnect() was called, this function will error
     *
     * @return {object}
     */
    getClient(): object;
    /**
     * getConfig - Get the configs for this channel type
     *
     * @return {object}
     */
    getConfig(): object;
    /**
     * sendMessage - Send a message to this channel
     *
     * @param {object} message The Message object
     *
     * @return {object} The Server Response
     */
    sendMessage(message: object): object;
    sendFile(uri: any, name: any, contentType: any, user: any): any;
    sendImage(uri: any, name: any, contentType: any, user: any): any;
    deleteFile(url: any): any;
    deleteImage(url: any): any;
    /**
     * sendEvent - Send an event on this channel
     *
     * @param {object} event for example {type: 'message.read'}
     *
     * @return {object} The Server Response
     */
    sendEvent(event: object): object;
    /**
     * search - Query messages
     *
     * @param {object|string}  message search query or object MongoDB style filters
     * @param {object} options       Option object, {user_id: 'tommaso'}
     *
     * @return {object} search messages response
     */
    search(query: any, options?: object): object;
    /**
     * search - Query Members
     *
     * @param {object}  filterConditions object MongoDB style filters
     * @param {object} sort             Sort options, for instance {created_at: -1}
     * @param {object} options        Option object, {limit: 10, offset:10}
     *
     * @return {object} search members response
     */
    queryMembers(filterConditions: object, sort?: object, options?: object): object;
    /**
     * sendReaction - Send a reaction about a message
     *
     * @param {string} messageID the message id
     * @param {object} reaction the reaction object for instance {type: 'love'}
     * @param {string} user_id the id of the user (used only for server side request) default null
     *
     * @return {object} The Server Response
     */
    sendReaction(messageID: string, reaction: object, user_id: string): object;
    /**
     * deleteReaction - Delete a reaction by user and type
     *
     * @param {string} messageID the id of the message from which te remove the reaction
     * @param {string} reactionType the type of reaction that should be removed
     * @param {string} user_id the id of the user (used only for server side request) default null
     *
     * @return {object} The Server Response
     */
    deleteReaction(messageID: string, reactionType: string, user_id: string): object;
    /**
     * update - Edit the channel's custom properties
     *
     * @param {object} channelData The object to update the custom properties of this channel with
     * @param {object} updateMessage Optional message object for channel members notification
     * @return {type} The server response
     */
    update(channelData: object, updateMessage: object): any;
    /**
     * delete - Delete the channel. Messages are permanently removed.
     *
     * @return {object} The server response
     */
    delete(): object;
    /**
     * truncate - Removes all messages from the channel
     *
     * @return {object} The server response
     */
    truncate(): object;
    /**
     * acceptInvite - accept invitation to the channel
     *
     * @param {object} options The object to update the custom properties of this channel with
     *
     * @return {type} The server response
     */
    acceptInvite(options?: object): any;
    /**
     * acceptInvite - reject invitation to the channel
     *
     * @param {object} options The object to update the custom properties of this channel with
     *
     * @return {type} The server response
     */
    rejectInvite(options?: object): any;
    /**
     * addMembers - add members to the channel
     *
     * @param {array} members An array of member identifiers
     * @param {object} message Optional message object for channel members notification
     * @return {type} The server response
     */
    addMembers(members: any, message: object): any;
    /**
     * addModerators - add moderators to the channel
     *
     * @param {array} members An array of member identifiers
     * @param {object} message Optional message object for channel members notification
     * @return {type} The server response
     */
    addModerators(members: any, message: object): any;
    /**
     * inviteMembers - invite members to the channel
     *
     * @param {array} members An array of member identifiers
     * @param {object} message Optional message object for channel members notification
     * @return {type} The server response
     */
    inviteMembers(members: any, message: object): any;
    /**
     * removeMembers - remove members from channel
     *
     * @param {array} members An array of member identifiers
     * @param {object} message Optional message object for channel members notification
     * @return {type} The server response
     */
    removeMembers(members: any, message: object): any;
    /**
     * demoteModerators - remove moderator role from channel members
     *
     * @param {array} members An array of member identifiers
     * @param {object} message Optional message object for channel members notification
     * @return {type} The server response
     */
    demoteModerators(members: any, message: object): any;
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
    mute(opts?: object): object;
    /**
     * unmute - mutes the current channel
     * @param {object} opts user_id
     * @return {object} 			The server response
     *
     * example server side:
     * await channel.unmute({user_id: userId});
     */
    unmute(opts?: object): object;
    /**
     * muteStatus - returns the mute status for the current channel
     * @return {object} { muted: true | false, createdAt: Date | null, expiresAt: Date | null}
     */
    muteStatus(): object;
    sendAction(messageID: any, formData: any): any;
    /**
     * keystroke - First of the typing.start and typing.stop events based on the users keystrokes.
     *  Call this on every keystroke
     */
    keystroke(): Promise<void>;
    lastKeyStroke: Date | undefined;
    /**
     * stopTyping - Sets last typing to null and sends the typing.stop event
     */
    stopTyping(): Promise<void>;
    /**
     * lastMessage - return the last message, takes into account that last few messages might not be perfectly sorted
     *
     * @return {type} Description
     */
    lastMessage(): any;
    /**
     * markRead - Send the mark read event for this user, only works if the `read_events` setting is enabled
     *
     * @return {Promise} Description
     */
    markRead(data?: {}): Promise<any>;
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
    watch(options: object): object;
    /**
     * stopwatching - Stops watching the channel
     *
     * @return {object} The server response
     */
    stopWatching(): object;
    /**
     * getReplies - List the message replies for a parent message
     *
     * @param {type} parent_id The message parent id, ie the top of the thread
     * @param {type} options   Pagination params, ie {limit:10, idlte: 10}
     *
     * @return {type} A response with a list of messages
     */
    getReplies(parent_id: any, options: any): any;
    /**
     * getReactions - List the reactions, supports pagination
     *
     * @param {string} message_id The message id
     * @param {object} options    The pagination options
     *
     * @return {object} Server response
     */
    getReactions(message_id: string, options: object): object;
    /**
     * getMessagesById - Retrieves a list of messages by ID
     *
     * @param {string} messageIds The ids of the messages to retrieve from this channel
     *
     * @return {object} Server response
     */
    getMessagesById(messageIds: string): object;
    /**
     * lastRead - returns the last time the user marked the channel as read if the user never marked the channel as read, this will return null
     * @return {date}
     */
    lastRead(): any;
    /**
     * countUnread - Count the number of messages with a date thats newer than the last read timestamp
     *
     * @param [date] lastRead the time that the user read a message, defaults to current user's read state
     *
     * @return {int} Unread count
     */
    countUnread(lastRead: any): any;
    /**
     * countUnread - Count the number of unread messages mentioning the current user
     *
     * @return {int} Unread mentions count
     */
    countUnreadMentions(): any;
    /**
     * create - Creates a new channel
     *
     * @return {type} The Server Response
     */
    create: () => any;
    /**
     * query - Query the API, get messages, members or other channel fields
     *
     * @param {object} options The query options
     *
     * @return {object} Returns a query response
     */
    query(options: object): object;
    /**
     * banUser - Bans a user from a channel
     *
     * @param targetUserID
     * @param options
     * @returns {Promise<*>}
     */
    banUser(targetUserID: any, options: any): Promise<any>;
    /**
     * hides the channel from queryChannels for the user until a message is added
     * If clearHistory is set to true - all messages will be removed for the user
     *
     * @param userId
     * @param clearHistory
     * @returns {Promise<*>}
     */
    hide(userId?: any, clearHistory?: boolean): Promise<any>;
    /**
     * removes the hidden status for a channel
     *
     * @param userId
     * @returns {Promise<*>}
     */
    show(userId?: any): Promise<any>;
    /**
     * banUser - Removes the bans for a user on a channel
     *
     * @param targetUserID
     * @returns {Promise<*>}
     */
    unbanUser(targetUserID: any): Promise<any>;
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
    on(callbackOrString: string, callbackOrNothing: Function): any;
    /**
     * off - Remove the event handler
     *
     */
    off(callbackOrString: any, callbackOrNothing: any): void;
    _handleChannelEvent(event: any): void;
    _callChannelListeners: (event: any) => void;
    /**
     * _channelURL - Returns the channel url
     *
     * @return {string} The channel url
     */
    _channelURL: () => string;
    _checkInitialized(): void;
    _initializeState(state: any): void;
    _disconnect(): void;
  }
  import { ChannelState } from 'channel_state';
}
declare module 'client_state' {
  /**
   * ClientState - A container class for the client state.
   */
  export class ClientState {
    users: Immutable.ImmutableObject<{}>;
    userChannelReferences: {};
    updateUsers(users: any): void;
    updateUser(user: any): void;
    updateUserReference(user: any, channelID: any): void;
  }
  import Immutable from 'seamless-immutable';
}
declare module 'connection' {
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
  export class StableWSConnection {
    constructor({
      wsBaseURL,
      clientID,
      userID,
      user,
      userAgent,
      apiKey,
      tokenManager,
      authType,
      messageCallback,
      recoverCallback,
      eventCallback,
      logger,
    }: {
      wsBaseURL: any;
      clientID: any;
      userID: any;
      user: any;
      userAgent: any;
      apiKey: any;
      tokenManager: any;
      authType: any;
      messageCallback: any;
      recoverCallback: any;
      eventCallback: any;
      logger: any;
    });
    wsBaseURL: any;
    clientID: any;
    userID: any;
    user: any;
    authType: any;
    userAgent: any;
    apiKey: any;
    tokenManager: any;
    /** consecutive failures influence the duration of the timeout */
    consecutiveFailures: number;
    /** keep track of the total number of failures */
    totalFailures: number;
    /** We only make 1 attempt to reconnect at the same time.. */
    isConnecting: boolean;
    /** Boolean that indicates if we have a working connection to the server */
    isHealthy: boolean;
    /** Callback when the connection fails and recovers */
    recoverCallback: any;
    messageCallback: any;
    eventCallback: any;
    logger: any;
    /** Incremented when a new WS connection is made */
    wsID: number;
    /** Store the last event time for health checks */
    lastEvent: Date | null;
    /** Send a health check message every 30 seconds */
    healthCheckInterval: number;
    /** Every second we verify that we didn't miss any health checks */
    monitorInterval: number;
    /**
     * connect - Connect to the WS URL
     *
     * @return {promise} Promise that completes once the first health check message is received
     */
    connect(): any;
    _buildUrl: () => string;
    /**
     * disconnect - Disconnect the connection and doesn't recover...
     *
     */
    disconnect(timeout: any): Promise<any>;
    /**
     * _connect - Connect to the WS endpoint
     *
     * @return {promise} Promise that completes once the first health check message is received
     */
    _connect(): any;
    ws: isoWS | undefined;
    connectionID: any;
    /**
     * _reconnect - Retry the connection to WS endpoint
     *
     * @param {object} options Following options are available
     *
     * - `interval`	{int}			number of ms that function should wait before reconnecting
     * - `refreshToken` {boolean}	reload/refresh user token be refreshed before attempting reconnection.
     */
    _reconnect(options?: object): any;
    /**
     * onlineStatusChanged - this function is called when the browser connects or disconnects from the internet.
     *
     * @param {object} event Event with type online or offline
     *
     */
    onlineStatusChanged: (event: object) => void;
    onopen: (wsID: any) => void;
    onmessage: (wsID: any, event: any) => void;
    onclose: (wsID: any, event: any) => void;
    onerror: (wsID: any, event: any) => void;
    /**
     * _setHealth - Sets the connection to healthy or unhealthy.
     * Broadcasts an event in case the connection status changed.
     *
     * @param {bool} healthy boolean indicating if the connection is healthy or not
     *
     */
    _setHealth: (healthy: any) => void;
    /**
     * _errorFromWSEvent - Creates an error object for the WS event
     *
     */
    _errorFromWSEvent: (event: any, isWSFailure?: boolean) => Error;
    /**
     * _listenForConnectionChanges - Adds an event listener for the browser going online or offline
     *
     */
    _listenForConnectionChanges: () => void;
    _removeConnectionListeners: () => void;
    /**
     * _destroyCurrentWSConnection - Removes the current WS connnection
     *
     */
    _destroyCurrentWSConnection(): void;
    /**
     * _retryInterval - A retry interval which increases after consecutive failures
     *
     * @return {int} Duration to wait in milliseconds
     */
    _retryInterval: () => any;
    /**
     * _setupPromise - sets up the this.connectOpen promise
     */
    _setupConnectionPromise: () => void;
    isResolved: boolean | undefined;
    /** a promise that is resolved once ws.open is called */
    connectionOpen: Promise<any> | undefined;
    /**
     * _startHealthCheck - Sends a message every 30s or so to see if the ws connection still works
     *
     */
    _startHealthCheck(): void;
    healthCheckIntervalRef: NodeJS.Timeout | undefined;
    /**
     * _startMonitor - Verifies we didn't miss any events. Marks the connection as failed in case we did.
     *
     */
    _startMonitor(): void;
    monitorIntervalRef: NodeJS.Timeout | undefined;
  }
  import isoWS from 'isomorphic-ws';
}
declare module 'signing' {
  /**
   * Creates the JWT token that can be used for a UserSession
   * @method JWTUserSessionToken
   * @memberof signing
   * @private
   * @param {string} apiSecret - API Secret key
   * @param {string} userId - The user_id key in the JWT payload
   * @param {object} [extraData] - Extra that should be part of the JWT token
   * @param {object} [jwtOptions] - Options that can be past to jwt.sign
   * @return {string} JWT Token
   */
  export function JWTUserToken(
    apiSecret: string,
    userId: string,
    extraData?: object | undefined,
    jwtOptions?: object | undefined,
  ): string;
  export function JWTServerToken(apiSecret: any, jwtOptions?: {}): never;
  /**
   * @return {string}
   */
  export function UserFromToken(token: any): string;
  /**
   *
   * @param userId {string} the id of the user
   * @return {string}
   */
  export function DevToken(userId: string): string;
  /**
   *
   * @param body {string} the signed message
   * @param secret {string} the shared secret used to generate the signature (Stream API secret)
   * @param signature {string} the signature to validate
   * @return {boolean}
   */
  export function CheckSignature(
    body: string,
    secret: string,
    signature: string,
  ): boolean;
}
declare module 'token_manager' {
  /**
   * TokenManager
   *
   * Handles all the operations around user token.
   */
  export class TokenManager {
    /**
     * Constructor
     *
     * @param {object} secret
     */
    constructor(secret: object);
    loadTokenPromise: Promise<any> | null;
    secret: object;
    type: string;
    token: any;
    /**
     * Set the static string token or token provider.
     * Token provider should return a token string or a promise which resolves to string token.
     *
     * @param {string | function} tokenOrProvider
     */
    setTokenOrProvider: (tokenOrProvider: string | Function, user: any) => Promise<void>;
    user: any;
    tokenProvider: string | Function | undefined;
    /**
     * Resets the token manager.
     * Useful for client disconnection or switching user.
     */
    reset: () => void;
    validateToken: (tokenOrProvider: any, user: any) => void;
    tokenReady: () => Promise<any> | null;
    loadToken: () => Promise<any>;
    getToken: () => any;
    isStatic: () => boolean;
  }
}
declare module 'client' {
  export class StreamChat {
    constructor(key: any, secretOrOptions: any, options: any);
    key: any;
    secret: any;
    listeners: {};
    state: ClientState;
    mutedChannels: any[];
    browser: any;
    node: boolean;
    options: any;
    axiosInstance: import('axios').AxiosInstance;
    wsConnection: StableWSConnection | null;
    wsPromise: Promise<any> | null;
    setUserPromise: Promise<any> | null;
    activeChannels: {};
    configs: {};
    anonymous: boolean;
    tokenManager: TokenManager;
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
    logger: any;
    devToken(userID: any): string;
    getAuthType(): 'anonymous' | 'jwt';
    setBaseURL(baseURL: any): void;
    baseURL: any;
    wsBaseURL: any;
    _setupConnection: () => Promise<any>;
    UUID: string | undefined;
    clientID: string | undefined;
    _hasConnectionID: () => boolean;
    /**
     * setUser - Set the current user, this triggers a connection to the API
     *
     * @param {object} user Data about this user. IE {name: "john"}
     * @param {string} userToken   Token
     *
     * @return {promise} Returns a promise that resolves when the connection is setup
     */
    setUser: (user: object, userTokenOrProvider: any) => any;
    userID: any;
    _setToken: (user: any, userTokenOrProvider: any) => Promise<void>;
    _setUser(user: any): void;
    user: any;
    _user: any;
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
    updateAppSettings(options: object): Promise<any>;
    /**
     * getAppSettings - retrieves application settings
     */
    getAppSettings(): Promise<any>;
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
    testPushSettings(userID: string, data?: object | undefined): Promise<any>;
    /**
     * disconnect - closes the WS connection
     */
    disconnect(timeout: any): Promise<any>;
    cleaningIntervalRef: NodeJS.Timeout | null | undefined;
    connectionEstablishedCount: number | undefined;
    setAnonymousUser: () => Promise<any>;
    /**
     * setGuestUser - Setup a temporary guest user
     *
     * @param {object} user Data about this user. IE {name: "john"}
     *
     * @return {promise} Returns a promise that resolves when the connection is setup
     */
    setGuestUser(user: object): any;
    /**
     * createToken - Creates a token to authenticate this user. This function is used server side.
     * The resulting token should be passed to the client side when the users registers or logs in
     *
     * @param {string}   userID         The User ID
     * @param {string}   exp            The expiration time for the token expressed in the number of seconds since the epoch
     *
     * @return {string} Returns a token
     */
    createToken(userID: string, exp: string): string;
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
    on(callbackOrString: string, callbackOrNothing: Function): any;
    /**
     * off - Remove the event handler
     *
     */
    off(callbackOrString: any, callbackOrNothing: any): void;
    _logApiRequest(type: any, url: any, data: any, config: any): void;
    _logApiResponse(type: any, url: any, response: any): void;
    _logApiError(type: any, url: any, error: any): void;
    doAxiosRequest: (type: any, url: any, data: any, options?: {}) => any;
    get(url: any, params: any): any;
    put(url: any, data: any): any;
    post(url: any, data: any): any;
    patch(url: any, data: any): any;
    delete(url: any, params: any): any;
    sendFile(url: any, uri: any, name: any, contentType: any, user: any): any;
    errorFromResponse(response: any): Error;
    handleResponse(response: any): any;
    dispatchEvent: (event: any) => void;
    handleEvent: (messageEvent: any) => void;
    _handleClientEvent(event: any): void;
    _muteStatus(
      cid: any,
    ): {
      muted: boolean;
      createdAt: null;
      expiresAt: null;
    };
    _callClientListeners: (event: any) => void;
    recoverState: () => Promise<void>;
    connectionID: any;
    _updateUserReferences(user: any): void;
    connect(): Promise<any>;
    connecting: boolean | undefined;
    failures: number | undefined;
    /**
     * queryUsers - Query users and watch user presence
     *
     * @param {object} filterConditions MongoDB style filter conditions
     * @param {object} sort             Sort options, for instance {last_active: -1}
     * @param {object} options          Option object, {presence: true}
     *
     * @return {object} User Query Response
     */
    queryUsers(filterConditions: object, sort: object, options: object): object;
    queryChannels(filterConditions: any, sort?: {}, options?: {}): Promise<Channel[]>;
    /**
     * search - Query messages
     *
     * @param {object} channels MongoDB style filter conditions
     * @param {object|string}  message search query or object MongoDB style filters
     * @param {object} options       Option object, {user_id: 'tommaso'}
     *
     * @return {object} search messages response
     */
    search(filterConditions: any, query: any, options?: object): object;
    /**
     * addDevice - Adds a push device for a user.
     *
     * @param {string} id the device id
     * @param {string} push_provider the push provider (apn or firebase)
     * @param {string} [userID] the user id (defaults to current user)
     *
     */
    addDevice(
      id: string,
      push_provider: string,
      userID?: string | undefined,
    ): Promise<any>;
    /**
     * getDevices - Returns the devices associated with a current user
     *
     * @param {string} [userID] User ID. Only works on serversidex
     *
     * @return {devices} Array of devices
     */
    getDevices(userID?: string | undefined): any;
    /**
     * removeDevice - Removes the device with the given id. Clientside users can only delete their own devices
     *
     * @param {string} id The device id
     * @param {string} [userID] The user id. Only specify this for serverside requests
     *
     */
    removeDevice(id: string, userID?: string | undefined): Promise<any>;
    _addChannelConfig(channelState: any): void;
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
      custom?: object | undefined,
      ...args: any[]
    ): Channel;
    /**
     * @deprecated Please use upsertUser() function instead.
     *
     * updateUser - Update or Create the given user object
     *
     * @param {object} A user object, the only required field is the user id. IE {id: "myuser"} is valid
     *
     * @return {object}
     */
    updateUser(userObject: any): object;
    /**
     * partialUpdateUser - Update the given user object
     *
     * @param {object} Object which should contain id and any of "set" or "unset" params;
     * example: {id: "user1", set:{field: value}, unset:["field2"]}
     *
     * @return {object} list of updated users
     */
    partialUpdateUser(userObject: any): object;
    /**
     * upsertUsers - Batch upsert the list of users
     *
     * @param {array} A list of users
     *
     * @return {object}
     */
    upsertUsers(users: any): object;
    /**
     * upsertUser - Update or Create the given user object
     *
     * @param {object} A user object, the only required field is the user id. IE {id: "myuser"} is valid
     *
     * @return {object}
     */
    upsertUser(userObject: any): object;
    /**
     * @deprecated Please use upsertUsers() function instead.
     *
     * updateUsers - Batch update the list of users
     *
     * @param {array} A list of users
     *
     * @return {object}
     */
    updateUsers(users: any): object;
    /**
     * updateUsers - Batch partial update of users
     *
     * @param {array} A list of partial update requests
     *
     * @return {object}
     */
    partialUpdateUsers(users: any): object;
    deleteUser(userID: any, params: any): Promise<any>;
    reactivateUser(userID: any, options: any): Promise<any>;
    deactivateUser(userID: any, options: any): Promise<any>;
    exportUser(userID: any, options: any): Promise<any>;
    /** banUser - bans a user from all channels
     *
     * @param targetUserID
     * @param options
     * @returns {Promise<*>}
     */
    banUser(targetUserID: any, options: any): Promise<any>;
    /** unbanUser - revoke global ban for a user
     *
     * @param targetUserID
     * @returns {Promise<*>}
     */
    unbanUser(targetUserID: any, options: any): Promise<any>;
    /** muteUser - mutes a user
     *
     * @param targetID
     * @param [userID] Only used with serverside auth
     * @returns {Promise<*>}
     */
    muteUser(targetID: any, userID?: any): Promise<any>;
    /** unmuteUser - unmutes a user
     *
     * @param targetID
     * @param [currentUserID] Only used with serverside auth
     * @returns {Promise<*>}
     */
    unmuteUser(targetID: any, currentUserID?: any): Promise<any>;
    flagMessage(messageID: any, options?: {}): Promise<any>;
    flagUser(userID: any, options?: {}): Promise<any>;
    unflagMessage(messageID: any, options?: {}): Promise<any>;
    unflagUser(userID: any, options?: {}): Promise<any>;
    /**
     * markAllRead - marks all channels for this user as read
     *
     * @return {Promise} Description
     */
    markAllRead(data?: {}): Promise<any>;
    createChannelType(data: any): any;
    getChannelType(channelType: any): any;
    updateChannelType(channelType: any, data: any): any;
    deleteChannelType(channelType: any): any;
    listChannelTypes(): any;
    /**
     * translateMessage - adds the translation to the message
     *
     * @param {string} messageId
     *
     * @return {object} Response that includes the message
     */
    translateMessage(messageId: string, language: any): object;
    /**
     * updateMessage - Update the given message
     *
     * @param {object} message object, id needs to be specified
     *
     * @return {object} Response that includes the message
     */
    updateMessage(message: object, userId: any): object;
    deleteMessage(messageID: any, hardDelete: any): Promise<any>;
    getMessage(messageID: any): Promise<any>;
    _userAgent(): string;
    /**
     * _isUsingServerAuth - Returns true if we're using server side auth
     */
    _isUsingServerAuth: () => boolean;
    _enrichAxiosOptions(options?: {
      params: {};
      headers: {};
      config: {};
    }): {
      params: {
        api_key: any;
        connection_id: any;
        user_id: any;
      };
      headers: {
        Authorization: any;
        'stream-auth-type': string;
        'x-stream-client': string;
      };
    };
    _getToken(): any;
    _startCleaning(): void;
    verifyWebhook(requestBody: any, xSignature: any): boolean;
    /** getPermission - gets the definition for a permission
     *
     * @param {string} name
     * @returns {Promise<*>}
     */
    getPermission(name: string): Promise<any>;
    /** createPermission - creates a custom permission
     *
     * @param {object} permissionData the permission data
     * @returns {Promise<*>}
     */
    createPermission(permissionData: object): Promise<any>;
    /** updatePermission - updates an existing custom permission
     *
     * @param {string} name
     * @param {object} permissionData the permission data
     * @returns {Promise<*>}
     */
    updatePermission(name: string, permissionData: object): Promise<any>;
    /** deletePermission - deletes a custom permission
     *
     * @param {name}
     * @returns {Promise<*>}
     */
    deletePermission(name: any): Promise<any>;
    /** listPermissions - returns the list of custom permissions for this application
     *
     * @returns {Promise<*>}
     */
    listPermissions(): Promise<any>;
    /** createRole - creates a custom role
     *
     * @param {string} name the new role name
     * @returns {Promise<*>}
     */
    createRole(name: string): Promise<any>;
    /** listRoles - returns the list of custom roles for this application
     *
     * @returns {Promise<*>}
     */
    listRoles(): Promise<any>;
    /** deleteRole - deletes a custom role
     *
     * @param {string} name the role name
     * @returns {Promise<*>}
     */
    deleteRole(name: string): Promise<any>;
    /** sync - returns all events that happened for a list of channels since last sync
     * @param {array} channel_cids list of channel CIDs
     * @param {string} last_sync_at last time the user was online and in sync. RFC3339 ie. "2020-05-06T15:05:01.207Z"
     */
    sync(channel_cids: any, last_sync_at: string): any;
  }
  import { ClientState } from 'client_state';
  import { StableWSConnection } from 'connection';
  import { TokenManager } from 'token_manager';
  import { Channel } from 'channel';
}
declare module 'permissions' {
  export const Allow: 'Allow';
  export const Deny: 'Deny';
  export const AnyResource: string[];
  export const AnyRole: string[];
  export const MaxPriority: 999;
  export const MinPriority: 1;
  export class Permission {
    constructor(
      name: any,
      priority: any,
      resources?: string[],
      roles?: string[],
      owner?: boolean,
      action?: string,
    );
    name: any;
    action: string;
    owner: boolean;
    priority: any;
    resources: string[];
    roles: string[];
  }
  export const AllowAll: Permission;
  export const DenyAll: Permission;
  export namespace BuiltinRoles {
    export const Anonymous: string;
    export const Guest: string;
    export const User: string;
    export const Admin: string;
    export const ChannelModerator: string;
    export const ChannelMember: string;
  }
  export namespace BuiltinPermissions {
    export const CreateMessage: string;
    export const UpdateAnyMessage: string;
    export const UpdateOwnMessage: string;
    export const DeleteAnyMessage: string;
    export const DeleteOwnMessage: string;
    export const CreateChannel: string;
    export const ReadAnyChannel: string;
    export const ReadOwnChannel: string;
    export const UpdateMembersAnyChannel: string;
    export const UpdateMembersOwnChannel: string;
    export const UpdateAnyChannel: string;
    export const UpdateOwnChannel: string;
    export const DeleteAnyChannel: string;
    export const DeleteOwnChannel: string;
    export const RunMessageAction: string;
    export const BanUser: string;
    export const UploadAttachment: string;
    export const DeleteAnyAttachment: string;
    export const DeleteOwnAttachment: string;
    export const AddLinks: string;
    export const CreateReaction: string;
    export const DeleteAnyReaction: string;
    export const DeleteOwnReaction: string;
  }
}
declare module 'index' {
  export { StreamChat } from './client';
  export * from 'client_state';
  export * from 'channel';
  export * from 'channel_state';
  export * from 'connection';
  export * from 'permissions';
  export * from 'events';
  export * from 'signing';
  export * from 'base64';
  export * from 'token_manager';
  export { logChatPromiseExecution } from './utils';
}
//# sourceMappingURL=index.d.ts.map
