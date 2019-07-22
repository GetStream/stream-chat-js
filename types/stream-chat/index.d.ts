// TypeScript Version: 2.8

export as namespace stream;
import * as SeamlessImmutable from 'seamless-immutable';

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
  autor_name?: string;
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
  mentioned_users?: User[];
  parent_id?: string;
  [propName: string]: any;
}

export interface Member {
  created_at: string;
  role: string;
  updated_at: string;
  user: User;
}

export interface User {
  id: string;
  role?: string;
  [propName: string]: any;
}

export interface Device {
  id: string;
  provider: string;
  user: User;
  [propName: string]: any;
}

export interface Event {
  cid: string;
  type: string;
  message?: MessageResponse;
  reaction?: ReactionResponse;
  channel?: Channel;
  member?: User;
  user?: User;
  user_id?: string;
  me?: OwnUserResponse;
  watcher_count?: number;
  unread_count?: number;
  online?: boolean;
}
export interface UserPresenceChangedEvent extends Event {
  type: 'user.presence.changed';
}
export interface UserWatchingStartEvent extends Event {
  type: 'user.watching.start';
}
export interface UserWatchingStopEvent extends Event {
  type: 'user.watching.stop';
}
export interface UserUpdatedEvent extends Event {
  type: 'user.updated';
}
export interface TypingStartEvent extends Event {
  type: 'typing.start';
}
export interface TypingStopEvent extends Event {
  type: 'typing.stop';
}
export interface MessageNewEvent extends Event {
  type: 'message.new';
}
export interface MessageUpdatedEvent extends Event {
  type: 'message.updated';
}
export interface MessageDeletedEvent extends Event {
  type: 'message.deleted';
}
export interface MessageReadEvent extends Event {
  type: 'message.read';
}
export interface ReactionNewEvent extends Event {
  type: 'reaction.new';
}
export interface ReactionDeletedEvent extends Event {
  type: 'reaction.deleted';
}
export interface MemberAddedEvent extends Event {
  type: 'member.added';
}
export interface MemberUpdatedEvent extends Event {
  type: 'member.updated';
}
export interface MemberRemovedEvent extends Event {
  type: 'member.removed';
}
export interface ChannelUpdatedEvent extends Event {
  type: 'channel.updated';
}
export interface ChannelDeletedEvent extends Event {
  type: 'channel.deleted';
}
export interface HealthCheckEvent extends Event {
  type: 'health.check';
}
export interface NotificationNewMessageEvent extends Event {
  type: 'notification.message_new';
}
export interface NotificationMarkReadEvent extends Event {
  type: 'notification.mark_read';
}
export interface NotificationInvitedEvent extends Event {
  type: 'notification.invited';
}
export interface NotificationInviteAcceptedEvent extends Event {
  type: 'notification.invite_accepted';
}
export interface NotificationAddedToChannelEvent extends Event {
  type: 'notification.added_to_channel';
}
export interface NotificationRemovedFromChannelEvent extends Event {
  type: 'notification.removed_from_channel';
}
export interface NotificationMutesUpdatedEvent extends Event {
  type: 'notification.mutes_updated';
}

export interface Reaction {
  type: string;
  message_id: string;
  user_id?: string;
  user: User;
  [propName: string]: any;
}

export interface ReactionResponse extends Reaction {
  created_at: string;
}
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
  logger?(log_level: 'info' | 'error', message: string, extraData?: object): void;
  [propName: string]: any;
}
export class StreamChat {
  constructor(key: string, secretOrOptions?: string, options?: StreamChatOptions);

  key: string;
  userToken?: string;
  secret: string;
  listeners: {
    [key: string]: Array<(event: Event) => any>;
  };
  state: ClientState;
  user: OwnUserResponse;

  devToken(userID: string): string;
  createToken(userID: string, exp: number): string;
  getAuthType(): string;

  setBaseURL(baseURL: string): void;
  setUser(user: User, userToken: string): Promise<void>;

  updateAppSettings(options: object): Promise<object>;
  getAppSettings(): Promise<object>;
  disconnect(): Promise<void>;

  setAnonymousUser(): Promise<void>;
  setGuestUser(user: User): Promise<void>;

  on(callbackOrString: string, callbackOrNothing?: any): { unsubsribe(): void };
  off(callbackOrString: string, callbackOrNothing?: any): void;

  get(url: string, params: object): Promise<APIResponse>;
  put(url: string, data: object): Promise<APIResponse>;
  post(url: string, data: object): Promise<APIResponse>;
  delete(url: string, params: object): Promise<APIResponse>;
  handleResponse(response: APIResponse): APIResponse;
  errorFromResponse(response: APIResponse): Error;

  sendFile(
    url: string,
    uri: string,
    name: string,
    contentType: string,
    user: string,
  ): Promise<APIResponse>;

  dispatchEvent(event: Event): void;
  handleEvent(messageEvent: Event): void;
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
  ): Promise<ChannelsAPIResponse>;
  search(
    filterConditions: object,
    query: object,
    options: object,
  ): Promise<SearchAPIResponse>;

  addDevice(id: string, push_provider: string, userID: string): Promise<APIResponse>;
  getDevices(userId: string): Promise<APIResponse>;
  removeDevice(deviceId: string): Promise<APIResponse>;

  channel(channelType: string, channelID: string, custom: object): Channel;

  updateUser(userObject: User): Promise<UpdateUsersAPIResponse>;
  updateUsers(users: User[]): Promise<UpdateUsersAPIResponse>;

  banUser(targetUserID: string, options: object): Promise<BanUserAPIResponse>;
  unbanUser(targetUserID: string, options: object): Promise<UnbanUserAPIResponse>;

  muteUser(targetUserID: string): Promise<MuteAPIResponse>;
  unmuteUser(targetUserID: string): Promise<UnmuteAPIResponse>;

  flagUser(userID: string): Promise<FlagAPIResponse>;
  unflagUser(userID: string): Promise<UnflagAPIResponse>;
  flagMessage(messageID: string): Promise<FlagAPIResponse>;
  unflagMessage(messageID: string): Promise<UnflagAPIResponse>;

  createChannelType(data: object): Promise<CreateChannelTypeAPIResponse>;
  getChannelType(channelType: string, data: object): Promise<GetChannelTypeAPIResponse>;
  updateChannelType(
    channelType: string,
    data: object,
  ): Promise<UpdateChannelTypeAPIResponse>;
  deleteChannelType(channelType: string): Promise<DeleteChannelTypeAPIResponse>;
  listChannelTypes(): Promise<ListChannelTypesAPIResponse>;

  updateMessage(message: Message, user: string | User): Promise<UpdateMessageAPIResponse>;
  deleteMessage(messageID: string): Promise<DeleteMessageAPIResponse>;
  verifyWebHook(requestBody: object, xSignature: string): boolean;
}

export class ClientState {
  constructor();
  updateUser(user: User): void;
  updateUsers(users: User[]): void;
  updateUserReference(user: User, channelID: string): void;
}

export class Channel {
  constructor(client: StreamChat, type: string, id: string, data: object);
  type: string;
  id: string;
  // used by the frontend, gets updated:
  data: object;
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

  getConfig(): object;
  sendMessage(message: Message): Promise<APIResponse>;
  sendFile(
    uri: string,
    name: string,
    contentType: string,
    user: string,
  ): Promise<APIResponse>;
  sendImage(
    uri: string,
    name: string,
    contentType: string,
    user: string,
  ): Promise<APIResponse>;
  deleteFile(url: string): Promise<APIResponse>;
  deleteImage(url: string): Promise<APIResponse>;

  sendEvent(chatEvent: Event): Promise<APIResponse>;
  sendReaction(
    messageID: string,
    reaction: Reaction,
    user_id: string,
  ): Promise<APIResponse>;

  deleteReaction(
    messageID: string,
    reactionType: string,
    user_id?: string,
  ): Promise<APIResponse>;

  update(channelData: object, updateMessage: Message): Promise<APIResponse>;
  delete(): Promise<APIResponse>;
  acceptInvite(options: object): Promise<APIResponse>;
  rejectInvite(options: object): Promise<APIResponse>;
  addMembers(members: string[]): Promise<APIResponse>;
  addModerators(members: string[]): Promise<APIResponse>;
  removeMembers(members: string[]): Promise<APIResponse>;
  demoteModerators(members: string[]): Promise<User>;

  sendAction(messageID: string, formData: object): Promise<APIResponse>;
  keystroke(): Promise<APIResponse>;
  stopTyping(): Promise<APIResponse>;
  lastMessage(): Message;
  markRead(): Promise<void>;
  clean(): void;
  watch(options: object): Promise<APIResponse>;
  stopWatching(): Promise<APIResponse>;
  getReplies(parent_id: string, options: object): Promise<APIResponse>;
  getReactions(message_id: string, options: object): Promise<APIResponse>;
  countUnread(lastRead?: Date): number;
  create(): Promise<APIResponse>;
  query(options: object): Promise<APIResponse>;
  banUser(targetUserID: string, options: object): Promise<APIResponse>;
  unbanUser(targetUserID: string): Promise<APIResponse>;
  on(callbackOrString: string, callbackOrNothing: any): void;
  off(callbackOrString: string, callbackOrNothing: any): void;
}

export class ChannelState {
  constructor(channel: Channel);
  watcher_count: number;
  typing: SeamlessImmutable.Immutable<{
    [user_id: string]: SeamlessImmutable.Immutable<TypingStartEvent>;
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
    [user_id: string]: SeamlessImmutable.Immutable<Member>;
  }>;
  last_message_at: string;
  addMessageSorted(newMessage: Message): void;
  addMessagesSorted(newMessages: Message[]): void;
  messageToImmutable(message: Message): SeamlessImmutable.Immutable<Message>;
  removeMessage(messageToRemove: Message): boolean;
  filterErrorMessages(): SeamlessImmutable.Immutable<Message>;
  clean(): void;
}

export class StableWSConnection {
  constructor(
    wsURL: string,
    clientID: string,
    userID: string,
    messageCallback: (event: object) => void,
    recoverCallback: (open: Promise<object>) => void,
    eventCallback: (event: object) => void,
  );
  connect(): Promise<void>;
  disconnect(): void;
}

export class Permission {
  constructor(
    name: string,
    priority: number,
    resources: string[],
    roles: string[],
    owner: boolean,
    action: string,
  );
}

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

export function isValidEventType(eventType: string): boolean;

export function logChatPromiseExecution(promise: Promise<any>, name: string): void;

export interface APIResponse {
  duration: string;
  [propName: string]: any;
}

export interface ChannelsAPIResponse extends APIResponse {
  channels: Array<{
    channel: ChannelResponse;
    messages: MessageResponse[];
    watcher_count?: number;
    watchers: User[];
    read: ReadResponse[];
    members: ChannelMemberResponse[];
  }>;
}

export interface UpdateUsersAPIResponse extends APIResponse {
  users: {
    [user_id: string]: UserResponse;
  };
}

export interface UsersAPIResponse extends APIResponse {
  users: Array<UserResponse>;
}

export interface SearchAPIResponse extends APIResponse {
  results: {
    message: MessageResponse;
  }[];
}

export interface BanUserAPIResponse extends APIResponse {}
export interface UnbanUserAPIResponse extends APIResponse {}

export interface MuteAPIResponse extends APIResponse {
  mute: MuteResponse;
  own_user: OwnUserResponse;
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

export interface GetChannelTypeAPIResponse extends ChannelConfig, APIResponse {
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

export interface MessageResponse {
  text: string;
  attachments?: Attachment[];
  parent_id?: string;
  mentioned_users?: string[];
  command?: string;
  user?: User;
  html: string;
  type: string;
  latest_reactions?: ReactionResponse[];
  own_reactions?: ReactionResponse[];
  reaction_counts?: { [key: string]: number };
  show_in_channel?: boolean;
  reply_count?: number;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
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
}

export interface UpdateMessageAPIResponse extends APIResponse {
  message: MessageResponse;
}

export interface DeleteMessageAPIResponse extends APIResponse {
  message: MessageResponse;
}

export type ChannelMemberResponse = {
  user_id?: string;
  user?: UserResponse;
  is_moderator?: boolean;
  invited?: boolean;
  invite_accepted_at?: string;
  invite_rejected_at?: string;
  role?: string;
  created_at?: string;
  updated_at?: string;
};

export type ChannelResponse = {
  cid: string;
  id: string;
  type: string;
  last_message_at?: string;
  created_by?: UserResponse;
  created_at?: string;
  updated_at?: string;
  deleted_at?: string;
  frozen: boolean;
  member_count?: number;
  invites?: string[];
  config: ChannelConfig;
};

export type ReadResponse = {
  user: UserResponse;
  last_read: string;
};

export type MuteResponse = {
  user: UserResponse;
  target: UserResponse;
  created_at?: string;
  updated_at?: string;
};

export interface FlagResponse {
  created_by_automod: boolean;
  user: UserResponse;
  target_message_id: string;
  target: UserResponse;
  created_at: string;
  updated_at: string;
  reviewed_at: string;
  reviewed_by: string;
  approved_at: string;
  rejected_at: string;
}

export interface ChannelConfigDBFields {
  created_at: string;
  updated_at: string;
}

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
  automod: 'disabled' | 'simple' | 'AI';
  automod_behavior: 'flag' | 'block';
}

export interface ChannelConfig extends ChannelConfigFields, ChannelConfigDBFields {
  commands: CommandVariants[];
}

export interface ChannelTypeConfig extends ChannelConfig {}

export type CommandVariants =
  | 'all'
  | 'fun_set'
  | 'moderation_set'
  | 'giphy'
  | 'imgur'
  | 'flag'
  | 'ban'
  | 'mute';
