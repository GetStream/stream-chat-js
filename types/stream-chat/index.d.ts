// TypeScript Version: 2.8

export as namespace StreamChat;
import * as SeamlessImmutable from 'seamless-immutable';
import * as WebSocket from 'ws';
export interface Action {
  name: string;
  text: string;
  style?: 'default' | 'primary' | 'danger';
  type: 'button' | 'select';
  value?: string;
}

export interface Attachment {
  type?: string;
  fallback?: string;
  pretext?: string;
  author_name?: string;
  author_link?: string;
  author_icon?: string;
  title?: string;
  title_link?: string;
  text?: string;
  image_url?: string;
  thumb_url?: string;
  footer?: string;
  footer_icon?: string;
  actions?: Action[];
  og_scrape_url?: string;
  [propName: string]: any;
}

export interface Message {
  text: string;
  attachments?: Attachment[];
  mentioned_users?: string[];
  parent_id?: string;
  [propName: string]: any;
}

export interface DeviceFields {
  push_providers: string;
  id: string;
}

export interface Device extends DeviceFields {
  id: string;
  provider: string;
  user: User;
  [propName: string]: any;
}

export interface Event<T = string> {
  cid: string;
  type: T;
  message?: MessageResponse;
  reaction?: ReactionResponse;
  channel?: ChannelResponse;
  member?: ChannelMemberResponse;
  user?: UserResponse;
  user_id?: string;
  me?: OwnUserResponse;
  watcher_count?: number;
  unread_count?: number;
  online?: boolean;
  created_at?: string;
  connection_id?: string;
  [propName: string]: any;
}
export type UserPresenceChangedEvent = 'user.presence.changed';
export type UserWatchingStartEvent = 'user.watching.start';
export type UserWatchingStopEvent = 'user.watching.stop';
export type UserDeletedEvent = 'user.deleted';
export type UserUpdatedEvent = 'user.updated';
export type UsedBannedEvent = 'user.banned';
export type UserUnbannedEvent = 'user.unbanned';
export type TypingStartEvent = 'typing.start';
export type TypingStopEvent = 'typing.stop';
export type MessageNewEvent = 'message.new';
export type MessageUpdatedEvent = 'message.updated';
export type MessageDeletedEvent = 'message.deleted';
export type MessageReadEvent = 'message.read';
export type ReactionNewEvent = 'reaction.new';
export type ReactionDeletedEvent = 'reaction.deleted';
export type ReactionUpdatedEvent = 'reaction.updated';
export type MemberAddedEvent = 'member.added';
export type MemberUpdatedEvent = 'member.updated';
export type MemberRemovedEvent = 'member.removed';
export type ChannelUpdatedEvent = 'channel.updated';
export type ChannelDeletedEvent = 'channel.deleted';
export type ChannelTruncatedEvent = 'channel.truncated';
export type ChannelHiddenEvent = 'channel.hidden';
export type ChannelMutedEvent = 'channel.muted';
export type ChannelUnmutedEvent = 'channel.unmuted';
export type ChannelVisibleEvent = 'channel.visible';
export type HealthCheckEvent = 'health.check';
export type NotificationNewMessageEvent = 'notification.message_new';
export type NotificationMarkReadEvent = 'notification.mark_read';
export type NotificationInvitedEvent = 'notification.invited';
export type NotificationInviteAcceptedEvent = 'notification.invite_accepted';
export type NotificationAddedToChannelEvent = 'notification.added_to_channel';
export type NotificationRemovedFromChannelEvent = 'notification.removed_from_channel';
export type NotificationChannelDeletedEvent = 'notification.channel_deleted';
export type NotificationChannelMutesUpdated = 'notification.channel_mutes_updated';
export type NotificationChannelTruncated = 'notification.channel_truncated';
export type NotificationMutesUpdatedEvent = 'notification.mutes_updated';
export type ConnectionChangedEvent = 'connection.changed';
export type ConnectionRecoveredEvent = 'connection.recovered';

export interface OnlineStatusEvent {
  type: 'online' | 'offline';
  [key: string]: any;
}

export interface ConnectionChangeEvent {
  type: 'connection.changed' | 'connection.recovered';
  online?: boolean;
}

export interface Reaction {
  type: string;
  message_id?: string;
  user_id?: string;
  user?: User;
  score?: number;
  [propName: string]: any;
}

export interface ReactionResponse extends Reaction {
  created_at: string;
  updated_at: string;
}
export type Logger = (
  log_level: 'info' | 'error',
  message: string,
  extraData?: object,
) => void;
export interface StreamChatOptions {
  /**
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
   * 		tags: ['event', 'client'],
   * 		event: object
   * }
   * 4. {
   * 		tags: ['channel'],
   * 		channel: object
   * }
   */
  logger?: Logger;
  [propName: string]: any;
}
export type EventHandler = (event: Event) => void;

// client.js
export class StreamChat {
  constructor(key: string, options?: StreamChatOptions);
  constructor(key: string, secret?: string, options?: StreamChatOptions);

  key: string;
  userToken?: string;
  secret: string;
  listeners: {
    [key: string]: Array<(event: Event) => any>;
  };
  state: ClientState;
  userID: string;
  user: OwnUserResponse;
  browser: boolean;
  wsConnection: StableWSConnection;
  logger: Logger;
  mutedChannels: ChannelMute[];
  options: StreamChatOptions;
  wsPromise: Promise<void>;
  setUserPromise: Promise<void>;
  activeChannels: {
    [cid: string]: Channel;
  };
  configs: {
    [channel_type: string]: object;
  };
  anonymous: boolean;
  tokenManager: TokenManager;
  testPushSettings(userID: string, data: object): Promise<APIResponse>;

  deleteUser(userID: string, params?: object): Promise<DeleteUserAPIResponse>;
  reactivateUser(userID: string, options?: object): Promise<ReactivateUserAPIResponse>;
  deactivateUser(userID: string, options?: object): Promise<DeactiveUserAPIResponse>;
  exportUser(userID: string, options?: object): Promise<ExportUserAPIResponse>;
  markAllRead(data: object): Promise<void>;

  devToken(userID: string): string;
  createToken(userID: string, exp?: number): string;
  getAuthType(): string;

  setBaseURL(baseURL: string): void;
  setUser(user: User, userToken: TokenOrProvider): Promise<ConnectAPIResponse>;

  updateAppSettings(options: object): Promise<object>;
  getAppSettings(): Promise<object>;
  disconnect(): Promise<void>;

  setAnonymousUser(): Promise<void>;
  setGuestUser(user: User): Promise<void>;

  on(callback: EventHandler): { unsubscribe(): void };

  on(eventType: string, callback: EventHandler): { unsubscribe(): void };

  off(callback: EventHandler): void;
  off(eventType: string, callback: EventHandler): void;

  get(url: string, params: object): Promise<APIResponse>;
  put(url: string, data: object): Promise<APIResponse>;
  post(url: string, data: object): Promise<APIResponse>;
  delete(url: string, params: object): Promise<APIResponse>;
  handleResponse(response: APIResponse): APIResponse;
  errorFromResponse(response: APIResponse): Error;

  sendFile(
    url: string | Buffer | File,
    uri: string,
    name?: string,
    contentType?: string,
    user?: User,
  ): Promise<FileUploadAPIResponse>;

  dispatchEvent(event: Event): void;
  handleEvent: EventHandler;
  recoverState(): Promise<void>;

  connect(): Promise<void>;
  queryUsers(
    filterConditions: object,
    sort: object,
    options: object,
  ): Promise<UsersAPIResponse>;
  queryChannels(
    filterConditions: object,
    sort: object,
    options: object,
  ): Promise<Channel[]>;
  search(
    filterConditions: object,
    query: string | object,
    options: object,
  ): Promise<SearchAPIResponse>;

  addDevice(id: string, push_provider: string, userID: string): Promise<APIResponse>;
  getDevices(userId: string): Promise<GetDevicesAPIResponse>;
  removeDevice(deviceId: string, userID?: string): Promise<APIResponse>;

  channel(
    channelType: string,
    channelIdOrCustom?: string | ChannelData,
    custom?: ChannelData,
  ): Channel;

  /** @deprecated Please use upsertUser() function instead. */
  updateUser(userObject: User): Promise<UpdateUsersAPIResponse>;
  /** @deprecated Please use upsertUsers() function instead. */
  updateUsers(users: User[]): Promise<UpdateUsersAPIResponse>;

  /** Update or Create the given user object */
  upsertUser(userObject: User): Promise<UpdateUsersAPIResponse>;
  /** Batch upsert the list of users */
  upsertUsers(users: User[]): Promise<UpdateUsersAPIResponse>;

  getMessage(messageID: string): Promise<GetMessageAPIResponse>;
  partialUpdateUser(updateRequest: updateUserRequest): Promise<UpdateUsersAPIResponse>;
  partialUpdateUsers(
    updateRequests: updateUserRequest[],
  ): Promise<UpdateUsersAPIResponse>;

  banUser(targetUserID: string, options: object): Promise<BanUserAPIResponse>;
  unbanUser(targetUserID: string, options: object): Promise<UnbanUserAPIResponse>;

  muteUser(
    targetUserID: string,
    UserID?: string,
    options?: object,
  ): Promise<MuteAPIResponse>;
  unmuteUser(targetUserID: string): Promise<UnmuteAPIResponse>;

  flagUser(userID: string, options?: object): Promise<FlagAPIResponse>;
  unflagUser(userID: string, options?: object): Promise<UnflagAPIResponse>;
  flagMessage(messageID: string, options?: object): Promise<FlagAPIResponse>;
  unflagMessage(messageID: string, options?: object): Promise<UnflagAPIResponse>;

  createChannelType(data: ChannelData): Promise<CreateChannelTypeAPIResponse>;
  getChannelType(channelType: string): Promise<GetChannelTypeAPIResponse>;
  updateChannelType(
    channelType: string,
    data: ChannelData,
  ): Promise<UpdateChannelTypeAPIResponse>;
  deleteChannelType(channelType: string): Promise<DeleteChannelTypeAPIResponse>;
  listChannelTypes(): Promise<ListChannelTypesAPIResponse>;

  translateMessage(messageId: string, language: string): Promise<GetMessageAPIResponse>;
  updateMessage(
    message: Message,
    user?: string | User,
  ): Promise<UpdateMessageAPIResponse>;
  deleteMessage(
    messageID: string,
    hardDelete?: boolean,
  ): Promise<DeleteMessageAPIResponse>;
  verifyWebhook(requestBody: string | Int8Array | Buffer, xSignature: string): boolean;

  // TODO: Add detailed types for following api responses
  getPermission(name: string): Promise<APIResponse>;
  createPermission(permissionData: object): Promise<APIResponse>;
  updatePermission(name: string, permissionData: object): Promise<APIResponse>;
  deletePermission(name: string): Promise<APIResponse>;
  listPermissions(): Promise<APIResponse>;
  createRole(name: string): Promise<APIResponse>;
  listRoles(): Promise<APIResponse>;
  deleteRole(name: string): Promise<APIResponse>;
}

export interface updateUserRequest {
  id: string;
  set?: {
    [key: string]: any;
  };
  unset?: string[];
}
// client_state.js
export class ClientState {
  constructor();
  updateUser(user: User): void;
  updateUsers(users: User[]): void;
  updateUserReference(user: User, channelID: string): void;
}

// channel.js
export class Channel {
  constructor(client: StreamChat, type: string, id: string, data: ChannelData);
  type: string;
  id: string;
  // used by the frontend, gets updated:
  data: ChannelResponse;
  cid: string; // `${type}:${id}`;
  listeners: {
    [key: string]: Array<(event: Event) => any>;
  };
  // perhaps the state variable should be private
  initialized: boolean;
  lastTypingEvent?: Date;
  isTyping: boolean;
  disconnected: boolean;
  state: ChannelState;

  getClient(): StreamChat;
  truncate(): Promise<TruncateChannelAPIResponse>;
  muteStatus(): {
    muted: boolean;
    createdAt?: string | null;
    expiredAt?: string | null;
  };
  lastRead(): string | null;
  countUnreadMentions(): number;

  getConfig(): {
    created_at: string;
    updated_at: string;
    name: string;
    typing_events: boolean;
    read_events: boolean;
    connect_events: boolean;
    search: boolean;
    reactions: boolean;
    replies: boolean;
    mutes: boolean;
    uploads: boolean;
    url_enrichment: boolean;
    message_retention: string;
    max_message_length: number;
    automod: ChannelConfigAutomodTypes;
    automod_behavior: ChannelConfigAutomodBehaviorTypes;
    commands: CommandResponse[];
  };
  sendMessage(message: Message): Promise<SendMessageAPIResponse>;
  sendFile(
    uri: string | Buffer | File,
    name?: string,
    contentType?: string,
    user?: User,
  ): Promise<FileUploadAPIResponse>;
  sendImage(
    uri: string | Buffer | File,
    name?: string,
    contentType?: string,
    user?: User,
  ): Promise<FileUploadAPIResponse>;
  deleteFile(url: string): Promise<DeleteFileAPIResponse>;
  deleteImage(url: string): Promise<DeleteFileAPIResponse>;

  sendEvent<T = string>(chatEvent: Event<T>): Promise<SendEventAPIResponse<T>>;
  sendReaction(
    messageID: string,
    reaction: Reaction,
    user_id?: string,
  ): Promise<SendReactionAPIResponse>;
  getReactions(message_id: string, options: object): Promise<GetReactionsAPIResponse>;
  deleteReaction(
    messageID: string,
    reactionType: string,
    user_id?: string,
  ): Promise<DeleteReactionAPIResponce>;

  update(
    channelData: ChannelData,
    updateMessage?: Message,
  ): Promise<UpdateChannelAPIResponse>;
  delete(): Promise<DeleteChannelAPIResponse>;
  search(query: string | object, options: object): Promise<SearchAPIResponse>;

  queryMembers(
    filterConditions: object,
    sort?: object,
    options?: object,
  ): Promise<MembersAPIResponse>;

  acceptInvite(options: object): Promise<AcceptInviteAPIResponse>;
  rejectInvite(options: object): Promise<RejectInviteAPIResponse>;

  addMembers(members: string[], message?: Message): Promise<AddMembersAPIResponse>;
  addModerators(members: string[]): Promise<AddModeratorsAPIResponse>;
  inviteMembers(members: string[]): Promise<AddMembersAPIResponse>;
  removeMembers(members: string[], message?: Message): Promise<RemoveMembersAPIResponse>;
  demoteModerators(members: string[]): Promise<RemoteModeratorsAPIResponse>;

  sendAction(messageID: string, formData: object): Promise<SendMessageAPIResponse>;

  keystroke(): Promise<void>;
  stopTyping(): Promise<void>;

  lastMessage(): Message;
  markRead(): Promise<MarkReadAPIResponse>;
  clean(): void;
  watch(options?: object): Promise<ChannelAPIResponse>;
  query(options: object): Promise<ChannelAPIResponse>;
  stopWatching(): Promise<StopWatchingAPIResponse>;
  getReplies(parent_id: string, options: object): Promise<GetRepliesAPIResponse>;
  countUnread(lastRead?: Date): number;
  create(): Promise<ChannelAPIResponse>;
  banUser(targetUserID: string, options: object): Promise<BanUserAPIResponse>;
  unbanUser(targetUserID: string): Promise<UnbanUserAPIResponse>;

  on(eventType: string, callback: EventHandler): void;
  on(callback: EventHandler): void;

  off(eventType: string, callback: EventHandler): void;
  off(callback: EventHandler): void;

  hide(userId?: string, clearHistory?: boolean): Promise<APIResponse>;
  show(userId?: string): Promise<APIResponse>;
  getMessagesById(messageIds: string[]): Promise<GetMultipleMessagesAPIResponse>;

  mute(options?: object): Promise<MuteChannelAPIResponse>;
  unmute(options?: object): Promise<UnmuteAPIResponse>;

  sync(channel_cids: string[], last_sync_at: string): Promise<SyncAPIResponse>;
}

export interface ChannelMembership {
  user: UserResponse;
  role: string;
  created_at?: string;
  updated_at?: string;
}
// channel_state.js
export class ChannelState {
  constructor(channel: Channel);
  watcher_count: number;
  typing: SeamlessImmutable.Immutable<{
    [user_id: string]: SeamlessImmutable.Immutable<Event<TypingStartEvent>>;
  }>;
  read: SeamlessImmutable.Immutable<{
    [user_id: string]: SeamlessImmutable.Immutable<{
      last_read: string;
      user: UserResponse;
    }>;
  }>;
  messages: SeamlessImmutable.Immutable<MessageResponse[]>;
  threads: SeamlessImmutable.Immutable<{
    [message_id: string]: MessageResponse[];
  }>;
  mutedUsers: SeamlessImmutable.Immutable<User[]>;
  watchers: SeamlessImmutable.Immutable<{
    [user_id: string]: SeamlessImmutable.Immutable<UserResponse>;
  }>;
  members: SeamlessImmutable.Immutable<{
    [user_id: string]: SeamlessImmutable.Immutable<ChannelMemberResponse>;
  }>;
  membership: SeamlessImmutable.Immutable<ChannelMembership>;
  last_message_at: string;
  addReaction(reaction: Reaction, message: MessageResponse): void;
  removeReaction(reaction: Reaction, message: MessageResponse): void;
  clearMessages(): void;
  addMessageSorted(newMessage: Message): void;
  addMessagesSorted(newMessages: Message[]): void;
  messageToImmutable(
    message: MessageResponse,
  ): SeamlessImmutable.Immutable<MessageResponse>;
  removeMessage(messageToRemove: Message): boolean;
  filterErrorMessages(): SeamlessImmutable.Immutable<Message>;
  clean(): void;
}

export interface ChannelData {
  name?: string;
  image?: string;
  members?: string[];
  [key: string]: any;
}
// connection.js
export class StableWSConnection {
  constructor(options: StableWSConnectionOptions);

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  onlineStatusChanged(event: OnlineStatusEvent): void;
  onopen(wsID: number): void;
  onmessage(wsID: number, event: WebSocket.MessageEvent): void;
  onclose(wsID: number, event: WebSocket.CloseEvent): void;
  onerror(wsID: number, event: WebSocket.ErrorEvent): void;
}

export interface StableWSConnectionOptions {
  wsBaseURL: string;
  clientID: string;
  userID: string;
  user: User;
  messageCallback: (event: WebSocket.OpenEvent) => void;
  recoverCallback: (open: Promise<object>) => void;
  eventCallback: (event: ConnectionChangeEvent) => void;
  userAgent: string;
  apiKey: string;
  tokenManager: TokenManager;
  authType: string;
  logger?: Logger;
}
// permissions.js
export class Permission {
  constructor(
    name: string,
    priority: number,
    resources: string[],
    roles: string[],
    owner: boolean,
    action: string,
  );

  name: string;
  priority: number;
  resources: string[];
  roles: string[];
  owner: boolean;
  action: string;
}

export const AllowAll: Permission;
export const DenyAll: Permission;

export const Allow: 'Allow';
export const Deny: 'Deny';
export const AnyResource: ['*'];
export const AnyRole: ['*'];
export const MaxPriority: 999;
export const MinPriority: 1;

export const BuiltinRoles: {
  Anonymous: 'anonymous';
  Guest: 'guest';
  User: 'user';
  Admin: 'admin';
  ChannelModerator: 'channel_moderator';
  ChannelMember: 'channel_member';
};

export const BuiltinPermissions: {
  CreateMessage: 'Create Message';
  UpdateAnyMessage: 'Update Any Message';
  UpdateOwnMessage: 'Update Own Message';
  DeleteAnyMessage: 'Delete Any Message';
  DeleteOwnMessage: 'Delete Own Message';
  CreateChannel: 'Create Channel';
  ReadAnyChannel: 'Read Any Channel';
  ReadOwnChannel: 'Read Own Channel';
  UpdateMembersAnyChannel: 'Update Members Any Channel';
  UpdateMembersOwnChannel: 'Update Members Own Channel';
  UpdateAnyChannel: 'Update Any Channel';
  UpdateOwnChannel: 'Update Own Channel';
  DeleteAnyChannel: 'Delete Any Channel';
  DeleteOwnChannel: 'Delete Own Channel';
  RunMessageAction: 'Run Message Action';
  BanUser: 'Ban User';
  UploadAttachment: 'Upload Attachment';
  DeleteAnyAttachment: 'Delete Any Attachment';
  DeleteOwnAttachment: 'Delete Own Attachment';
  AddLinks: 'Add Links';
  CreateReaction: 'Create Reaction';
  DeleteAnyReaction: 'Delete Any Reaction';
  DeleteOwnReaction: 'Delete Own Reaction';
};

export function JWTUserToken(
  apiSecret: string,
  userId: string,
  extraData: object,
  jwtOptions: object,
): string;

export function JWTServerToken(apiSecret: string, jwtOptions: object): string;

export function UserFromToken(token: string): string;

export function DevToken(userId: string): string;

export function CheckSignature(body: any, secret: string, signature: string): boolean;

export function encodeBase64(s: string): string;

export function decodeBase64(s: string): string;

export function isValidEventType(eventType: string): boolean;

// utils.js
export function logChatPromiseExecution(promise: Promise<any>, name: string): void;
export function isFunction(value: any): boolean;

// token_manager.js
export class TokenManager {
  constructor(secret?: string);

  setTokenOrProvider(tokenOrProvider: TokenOrProvider, user: User): Promise<void>;
  reset?(): void;
  validateToken(tokenOrProvider: TokenOrProvider, user: User): void;
  tokenReady(): Promise<string>;
  loadToken(): Promise<string>;
  getToken(): Promise<string>;
  isStatic(): boolean;
}

export type TokenOrProvider = string | TokenProvider | null | undefined;
export type TokenProvider = () => Promise<string>;

export interface APIResponse {
  duration: string;
  [propName: string]: any;
}

export interface ChannelAPIResponse extends APIResponse {
  channel: ChannelResponse;
  messages: MessageResponse[];
  watcher_count?: number;
  watchers?: User[];
  read?: ReadResponse[];
  members: ChannelMemberResponse[];
}

export interface UpdateUsersAPIResponse extends APIResponse {
  users: {
    [user_id: string]: UserResponse;
  };
}

export interface UsersAPIResponse extends APIResponse {
  users: UserResponse[];
}

export interface MembersAPIResponse extends APIResponse {
  members: ChannelMemberResponse[];
}

export interface DeleteUserAPIResponse extends APIResponse {
  user: UserResponse;
}
export interface ReactivateUserAPIResponse extends APIResponse {
  user: UserResponse;
}
export interface DeactiveUserAPIResponse extends APIResponse {
  user: UserResponse;
}
export interface ExportUserAPIResponse extends APIResponse {
  user: UserResponse;
  messages?: MessageResponse[];
  reactions?: ReactionResponse[];
}

export interface SearchAPIResponse extends APIResponse {
  results: Array<{
    message: MessageResponse;
  }>;
}

export interface BanUserAPIResponse extends APIResponse {}
export interface UnbanUserAPIResponse extends APIResponse {}

export interface MuteAPIResponse extends APIResponse {
  mute: MuteUserResponse;
  own_user: OwnUserResponse;
}

export interface MuteChannelAPIResponse extends APIResponse {
  mute: MuteUserResponse;
  own_user: OwnUserResponse;
  channel_mute: ChannelMute;
}

export interface UnmuteAPIResponse extends APIResponse {}

export interface FlagAPIResponse extends APIResponse {
  flag: FlagResponse;
}

export interface UnflagAPIResponse extends APIResponse {
  flag: FlagResponse;
}

export interface CreateChannelTypeAPIResponse extends ChannelConfig, APIResponse {
  permissions: Permission[];
}

export interface GetChannelTypeAPIResponse extends ChannelConfigWithInfo, APIResponse {
  permissions: Permission[];
}

export interface UpdateChannelTypeAPIResponse extends ChannelConfig, APIResponse {
  permissions: Permission[];
}

export interface DeleteChannelTypeAPIResponse extends APIResponse {}

export interface ListChannelTypesAPIResponse extends APIResponse {
  channel_types: {
    [channel_type: string]: ChannelTypeConfig;
  };
}

export interface SendMessageAPIResponse extends APIResponse {
  message: MessageResponse;
}

export interface FileUploadAPIResponse extends APIResponse {
  file: string;
}

export interface DeleteFileAPIResponse extends APIResponse {}

export interface SendEventAPIResponse<T = string> extends APIResponse {
  event: Event<T>;
}

export interface SendReactionAPIResponse extends APIResponse {
  message: MessageResponse;
  reaction: ReactionResponse;
}

export interface DeleteReactionAPIResponce extends APIResponse {
  message: MessageResponse;
  reaction: ReactionResponse;
}

export interface UpdateChannelAPIResponse extends APIResponse {
  channel: ChannelResponse;
  message?: MessageResponse;
  members: ChannelMemberResponse[];
}

export interface DeleteChannelAPIResponse extends APIResponse {
  channel: ChannelResponse;
}
export interface TruncateChannelAPIResponse extends APIResponse {
  channel: ChannelResponse;
}

export interface AcceptInviteAPIResponse extends UpdateChannelAPIResponse {}
export interface RejectInviteAPIResponse extends UpdateChannelAPIResponse {}
export interface AddMembersAPIResponse extends UpdateChannelAPIResponse {}
export interface AddModeratorsAPIResponse extends UpdateChannelAPIResponse {}
export interface RemoveMembersAPIResponse extends UpdateChannelAPIResponse {}
export interface RemoteModeratorsAPIResponse extends UpdateChannelAPIResponse {}

export interface MarkReadAPIResponse extends APIResponse {
  event: Event<MessageReadEvent>;
}

export interface StopWatchingAPIResponse extends APIResponse {}
export interface GetRepliesAPIResponse extends APIResponse {
  messages: MessageResponse[];
}
export interface GetReactionsAPIResponse extends APIResponse {
  reactions: ReactionResponse[];
}

export interface GetDevicesAPIResponse extends APIResponse {
  devices: DeviceFields[];
}

export interface MessageResponse {
  text: string;
  attachments?: Attachment[];
  parent_id?: string;
  mentioned_users?: UserResponse[];
  command?: string;
  user?: User;
  html: string;
  type: string;
  latest_reactions?: ReactionResponse[];
  own_reactions?: ReactionResponse[];
  reaction_counts?: { [key: string]: number };
  reaction_scores?: { [key: string]: number };
  show_in_channel?: boolean;
  reply_count?: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  [propName: string]: any;
}

export interface User {
  id: string;
  role?: string;
  [propName: string]: any;
}

export interface UserResponse extends User {
  created_at?: string;
  updated_at?: string;
  last_active?: string;
  deleted_at?: string;
  deactivated_at?: string;
  online: boolean;
}
export interface OwnUserResponse extends UserResponse {
  devices: Device[];
  unread_count: number;
  total_unread_count: number;
  unread_channels: number;
  mutes: Mute[];
  channel_mutes: ChannelMute[];
}

export interface Mute {
  user: UserResponse;
  target: UserResponse;
  created_at: string;
  updated_at: string;
}
export interface UpdateMessageAPIResponse extends APIResponse {
  message: MessageResponse;
}

export interface DeleteMessageAPIResponse extends APIResponse {
  message: MessageResponse;
}

export interface GetMessageAPIResponse extends APIResponse {
  message: MessageResponse;
}

export interface GetMultipleMessagesAPIResponse extends APIResponse {
  messages: MessageResponse[];
}

export interface SyncAPIResponse extends APIResponse {
  events: Event[];
}

export interface ConnectAPIResponse extends Event<HealthCheckEvent> {}

export interface ChannelMemberResponse {
  user_id?: string;
  user?: UserResponse;
  is_moderator?: boolean;
  invited?: boolean;
  invite_accepted_at?: string;
  invite_rejected_at?: string;
  role?: string;
  created_at?: string;
  updated_at?: string;
}

// @deprecated - Please use ChannelMemberResponse
export interface Member extends ChannelMemberResponse {}
export interface ChannelResponse {
  cid: string;
  id: string;
  name?: string;
  image?: string;
  type: string;
  last_message_at?: string;
  created_by?: UserResponse;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string;
  frozen: boolean;
  members?: ChannelMemberResponse[];
  member_count?: number;
  invites?: string[];
  config?: ChannelConfigWithInfo;
  // Additional properties defined on channel
  [propName: string]: any;
}

export interface ReadResponse {
  user: UserResponse;
  last_read: string;
}

export interface MuteResponse {
  user: UserResponse;
  target?: UserResponse;
  created_at?: string;
  updated_at?: string;
}

export interface MuteUserResponse extends MuteResponse {}
export interface ChannelMute {
  user: UserResponse;
  channel?: Channel;
  expires?: string;
  created_at?: string;
  updated_at?: string;
}

export interface MuteChannelAPIResponse {
  channel_mute: ChannelMute;
  own_user: OwnUserResponse;
}

export interface FlagResponse {
  created_by_automod: boolean;
  user?: UserResponse;
  target_message_id?: string;
  target_user?: UserResponse;
  created_at: string;
  updated_at: string;
  reviewed_at: string;
  reviewed_by: string;
  approved_at: string;
  rejected_at: string;
}

export interface CommandResponse {
  name: string;
  description: string;
  args: string;
  set: string;
}

export interface ChannelConfigDBFields {
  created_at: string;
  updated_at: string;
}

export type ChannelConfigAutomodTypes = 'disabled' | 'simple' | 'AI';
export type ChannelConfigAutomodBehaviorTypes = 'flag' | 'block';
export interface ChannelConfigFields {
  name: string;
  typing_events: boolean;
  read_events: boolean;
  connect_events: boolean;
  reactions: boolean;
  replies: boolean;
  search: boolean;
  mutes: boolean;
  message_retention: string;
  max_message_length: number;
  uploads: boolean;
  url_enrichment: boolean;
  automod: ChannelConfigAutomodTypes;
  automod_behavior: 'flag' | 'block';
}

export interface ChannelConfig extends ChannelConfigFields, ChannelConfigDBFields {
  commands: CommandVariants[];
}

export interface ChannelConfigWithInfo
  extends ChannelConfigFields,
    ChannelConfigDBFields {
  commands: CommandResponse[];
}

export interface ChannelTypeConfig extends ChannelConfigWithInfo {
  permissions: Permission[];
  roles: object;
}

export type CommandVariants =
  | 'all'
  | 'fun_set'
  | 'moderation_set'
  | 'giphy'
  | 'imgur'
  | 'flag'
  | 'ban'
  | 'unban'
  | 'mute'
  | 'unmute';
