import SeamlessImmutable from 'seamless-immutable';
import { Channel } from '../src/channel';
import { AxiosRequestConfig } from 'axios';

export type APIResponse = {
  duration: string;
};

export type User<T = { [key: string]: unknown }> = Partial<T> & {
  id: string;
  anon?: boolean;
  role?: string;
};

export type UserResponse<T> = User<T> & {
  created_at?: string;
  updated_at?: string;
  last_active?: string;
  deleted_at?: string;
  deactivated_at?: string;
  online?: boolean;
};

export type Logger = (
  logLevel: 'info' | 'error',
  message: string,
  extraData?: Record<string, unknown>,
) => void;

export type EventTypes =
  | 'all'
  | 'user.presence.changed'
  | 'user.watching.start'
  | 'user.watching.stop'
  | 'user.deleted'
  | 'user.updated'
  | 'user.banned'
  | 'user.unbanned'
  | 'typing.start'
  | 'typing.stop'
  | 'message.new'
  | 'message.updated'
  | 'message.deleted'
  | 'message.read'
  | 'reaction.new'
  | 'reaction.deleted'
  | 'reaction.updated'
  | 'member.added'
  | 'member.updated'
  | 'member.removed'
  | 'channel.created'
  | 'channel.updated'
  | 'channel.deleted'
  | 'channel.truncated'
  | 'channel.hidden'
  | 'channel.muted'
  | 'channel.unmuted'
  | 'channel.visible'
  | 'health.check'
  | 'notification.message_new'
  | 'notification.mark_read'
  | 'notification.invited'
  | 'notification.invite_accepted'
  | 'notification.added_to_channel'
  | 'notification.removed_from_channel'
  | 'notification.channel_deleted'
  | 'notification.channel_mutes_updated'
  | 'notification.channel_truncated'
  | 'notification.mutes_updated'
  | 'connection.changed'
  | 'connection.recovered';

export type Event<T = string, U = { [key: string]: unknown }> = U & {
  type: T;
  cid?: string;
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
  received_at?: string | Date;
};

export type EventHandler = (event: Event) => void;

export type Action = {
  name?: string;
  style?: string;
  text?: string;
  type?: string;
  value?: string;
};

export type Field = {
  short?: boolean;
  title?: string;
  value?: string;
};

export type Attachment<T = { [key: string]: unknown }> = T & {
  actions?: Action[];
  asset_url?: string;
  author_icon?: string;
  author_link?: string;
  author_name?: string;
  color?: string;
  fallback?: string;
  fields?: Field[];
  footer?: string;
  footer_icon?: string;
  image_url?: string;
  og_scrape_url?: string;
  pretext?: string;
  text?: string;
  thumb_url?: string;
  title?: string;
  title_link?: string;
  type?: string;
};

type MessageBase<
  T = { [key: string]: unknown },
  AttachmentType = { [key: string]: unknown },
  UserType = { [key: string]: unknown }
> = T & {
  attachments?: Attachment<AttachmentType>[];
  html?: string;
  id?: string;
  parent_id?: string;
  show_in_channel?: boolean;
  text?: string;
  user_id?: string;
};

export type Message<
  T = { [key: string]: unknown },
  AttachmentType = { [key: string]: unknown },
  UserType = { [key: string]: unknown }
> = MessageBase<T, AttachmentType, UserType> & {
  mentioned_users?: string[];
  user?: User<UserType>;
};

export type MessageResponse<
  T = { [key: string]: unknown },
  ReactionType = { [key: string]: unknown },
  AttachmentType = { [key: string]: unknown },
  UserType = { [key: string]: unknown }
> = MessageBase<T, AttachmentType, UserType> & {
  command?: string;
  created_at?: string;
  deleted_at?: string;
  latest_reactions?: ReactionResponse<ReactionType>[];
  mentioned_users?: UserResponse<UserType>[];
  own_reactions?: ReactionResponse<ReactionType>[];
  reaction_counts?: { [key: string]: number };
  reaction_scores?: { [key: string]: number };
  reply_count?: number;
  silent?: boolean;
  status?: string;
  type?: string;
  user?: UserResponse<UserType>;
  updated_at?: string;
};

export type SendMessageAPIResponse = APIResponse & {
  message: MessageResponse;
};

export type SendEventAPIResponse<T = string> = APIResponse & {
  event: Event<T>;
};

export type MarkReadAPIResponse = APIResponse & {
  event: Event<MessageReadEvent>;
};

export type GetRepliesAPIResponse = APIResponse & {
  messages: MessageResponse[];
};

export type GetReactionsAPIResponse<ReactionType> = APIResponse & {
  reactions: ReactionResponse<ReactionType>[];
};

export type GetMultipleMessagesAPIResponse = APIResponse & {
  messages: MessageResponse[];
};

export type SearchAPIResponse = APIResponse & {
  results: { message: MessageResponse }[];
};

export type SendMessageAPIResponse = APIResponse & {
  message: MessageResponse;
};

export type SendEventAPIResponse<T = string> = APIResponse & {
  event: Event<T>;
};

type MessageReadEvent = 'message.read';

export type MarkReadAPIResponse = APIResponse & {
  event: Event<MessageReadEvent>;
};

export type GetRepliesAPIResponse = APIResponse & {
  messages: MessageResponse[];
};

export type GetReactionsAPIResponse<ReactionType> = APIResponse & {
  reactions: ReactionResponse<ReactionType>[];
};

export type SearchAPIResponse = APIResponse & {
  results: { message: MessageResponse }[];
};

export type Configs = {
  [channel_type: string]: Record<string, unknown>;
};

export type ChannelData = {
  name?: string;
  image?: string;
  members?: string[];
  [key: string]: unknown;
};

export type hannelResponse<T = { [key: string]: unknown }> = T & {
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
};

export interface ReadResponse {
  user: UserResponse;
  last_read: string;
}

export type ChannelAPIResponse<ChannelType> = APIResponse & {
  channel: ChannelResponse<ChannelType>;
  messages: MessageResponse[];
  watcher_count?: number;
  watchers?: User[];
  read?: ReadResponse[];
  members: ChannelMemberResponse[];
  membership?: ChannelMembership;
};

export type UpdateChannelAPIResponse<ChannelType, MessageType> = APIResponse & {
  channel: ChannelResponse<ChannelType>;
  message?: MessageResponse<MessageType>;
  members: ChannelMemberResponse[];
};

export type DeleteChannelAPIResponse<T> = APIResponse & {
  channel: ChannelResponse<T>;
};

export type TruncateChannelAPIResponse<T> = APIResponse & {
  channel: ChannelResponse<T>;
};

export type ImmutableMessageResponse<
  T = { [key: string]: unknown },
  ReactionType = { [key: string]: unknown }
> = SeamlessImmutable.Immutable<
  T & {
    __html: string;
    id: string;
    text: string;
    attachments?: Attachment[];
    parent_id?: string;
    mentioned_users?: UserResponse[];
    command?: string;
    user?: User;
    html: string;
    type: string;
    latest_reactions?: ReactionResponse<ReactionType>[];
    own_reactions?: ReactionResponse<ReactionType>[];
    reaction_counts?: { [key: string]: number };
    reaction_scores?: { [key: string]: number };
    show_in_channel?: boolean;
    reply_count?: number;
    created_at: Date;
    updated_at: Date;
    deleted_at?: string;
    status: string;
    silent?: boolean;
  }
>;

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

export type ChannelMembership = {
  user?: UserResponse;
  role?: string;
  created_at?: string;
  updated_at?: string;
};

type MuteResponse<UserType> = {
  user: UserResponse<UserType>;
  target?: UserResponse<UserType>;
  created_at?: string;
  updated_at?: string;
};

type Mute<UserType> = {
  user: UserResponse<UserType>;
  target: UserResponse<UserType>;
  created_at: string;
  updated_at: string;
};

export type ChannelMute<UserType, MessageType, ReactionType, ChannelType> = {
  user: UserResponse<UserType>;
  channel?: Channel<UserType, MessageType, ReactionType, ChannelType>;
  expires?: string;
  created_at?: string;
  updated_at?: string;
};

type DeviceFields = {
  push_providers: string;
  id: string;
};

type Device = DeviceFields & {
  id: string;
  provider: string;
  user: User;
  [key: string]: unknown;
};

export type OwnUserResponse<
  UserType,
  MessageType,
  ReactionType,
  ChannelType
> = UserResponse & {
  devices: Device[];
  unread_count: number;
  total_unread_count: number;
  unread_channels: number;
  mutes: Mute[];
  channel_mutes: ChannelMute<UserType, MessageType, ReactionType, ChannelType>[];
};

export type MuteChannelAPIResponse<
  UserType,
  MessageType,
  ReactionType,
  ChannelType
> = APIResponse & {
  mute: MuteResponse;
  own_user: OwnUserResponse<UserType, MessageType, ReactionType, ChannelType>;
  channel_mute: ChannelMute<UserType, MessageType, ReactionType, ChannelType>;
  channel_mutes: ChannelMute<UserType, MessageType, ReactionType, ChannelType>[];
};

export type Reaction<T = { [key: string]: unknown }> = T & {
  type: string;
  message_id?: string;
  user_id?: string;
  user?: User;
  score?: number;
};

export type ReactionResponse<T> = Reaction<T> & {
  created_at: string;
  updated_at: string;
};

export type ReactionAPIResponse<T> = APIResponse & {
  message: MessageResponse;
  reaction: ReactionResponse<T>;
};

export type TokenOrProvider = string | TokenProvider | null | undefined;

export type TokenProvider = () => Promise<string>;

export type ConnectionChangeEvent = {
  type: 'connection.changed' | 'connection.recovered';
  online?: boolean;
};

export type Permission = {
  action?: 'Deny' | 'Allow';
  name?: string;
  owner?: boolean;
  priority?: number;
  resources?: string[];
  roles?: string[];
};

export type ArrayTwoOrMore<T> = {
  0: T;
  1: T;
} & Array<T>;

export type RequireAtLeastOne<T> = {
  [K in keyof T]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<keyof T, K>>>;
}[keyof T];

export type PrimitiveFilter = string | number | boolean;

export type AscDesc = 1 | -1;

export type QueryFilter<T> = T & {
  $and?: ArrayTwoOrMore<RequireAtLeastOne<QueryFilter<T>>>;
  $eq?: PrimitiveFilter;
  $gt?: PrimitiveFilter;
  $gte?: PrimitiveFilter;
  $in?: PrimitiveFilter[];
  $lt?: PrimitiveFilter;
  $lte?: PrimitiveFilter;
  $ne?: PrimitiveFilter;
  $nin?: PrimitiveFilter[];
  $nor?: ArrayTwoOrMore<RequireAtLeastOne<QueryFilter<T>>>;
  $or?: ArrayTwoOrMore<RequireAtLeastOne<QueryFilter<T>>>;
};

export type QueryFilters<T = {}> = {
  [key: string]: PrimitiveFilter | RequireAtLeastOne<QueryFilter<T>>;
};

export type ChannelSort = {
  last_updated?: AscDesc;
  last_message_at?: AscDesc;
  updated_at?: AscDesc;
  created_at?: AscDesc;
  member_count?: AscDesc;
  unread_count?: AscDesc;
  has_unread?: AscDesc;
  [key: string]: AscDesc | undefined;
};

export type ChannelOptions = {
  state?: boolean;
  watch?: boolean;
  limit?: number;
  offset?: number;
  message_limit?: number;
  presence?: boolean;
  recovery?: boolean;
  last_message_ids?: { [key: string]: string };
};

export type UserFilters = QueryFilters<{ $autoComplete?: string }>;

export type UserSort<T> = {
  [P in keyof T]?: AscDesc;
};

export type UserOptions = {
  limit?: number;
  offset?: number;
  presence?: boolean;
};

export type SearchOptions = {
  limit?: number;
  offset?: number;
};

export type SearchPayload = SearchOptions & {
  client_id?: string;
  connection_id?: string;
  filter_conditions?: QueryFilters;
  query?: string;
  message_filter_conditions?: QueryFilters;
};

export type UnBanUserOptions = {
  client_id?: string;
  connection_id?: string;
  id?: string;
  target_user_id?: string;
  type?: string;
};

export type BanUserOptions<UserType> = UnBanUserOptions & {
  reason?: string;
  timeout?: number;
  user?: User<UserType>;
  user_id?: string;
};

export type FlagMessageOptions<UserType> = {
  client_id?: string;
  connection_id?: string;
  created_by?: string;
  target_message_id?: string;
  target_user_id?: string;
  user?: User<UserType>;
  user_id?: string;
};

export type FlagMessageResponse<UserType> = {
  duration: string;
  flag: {
    approved_at?: string;
    created_at: string;
    created_by_automod: boolean;
    rejected_at?: string;
    reviewed_at?: string;
    reviewed_by?: string;
    target_message_id: string;
    target_user: UserResponse<UserType>;
    updated_at: string;
    user: UserResponse<UserType>;
  };
};

export type MuteUserResponse<UserType> = {
  duration: string;
  mute: MuteResponse<UserType>;
  mutes: Array<Mute<UserType>>;
  own_user: UserResponse<UserType>;
};

export type MarkAllReadOptions<UserType> = {
  client_id?: string;
  connection_id?: string;
  user?: User<UserType>;
  user_id?: string;
};

export type CreateChannelOptions = {
  automod?: 'disabled' | 'simple' | 'AI';
  automod_behavior?: 'flag' | 'block';
  client_id?: string;
  commands?: string[];
  connect_events?: boolean;
  connection_id?: string;
  max_message_length?: number;
  message_retention?: string;
  mutes?: boolean;
  name?: string;
  permissions?: Permission[];
  reactions?: boolean;
  read_events?: boolean;
  replies?: boolean;
  search?: boolean;
  typing_events?: boolean;
  uploads?: boolean;
  url_enrichment?: boolean;
};

export type UpdateChannelOptions = Omit<CreateChannelOptions, 'name'> & {
  created_at?: string;
  updated_at?: string;
};

export type UpdateChannelResponse = Omit<
  CreateChannelOptions,
  'client_id' | 'connection_id'
> & {
  duration: string;
  created_at: string;
  updated_at: string;
};

export type ListChannelResponse = {
  duration: string;
  channel_types: Omit<CreateChannelOptions, 'client_id' | 'connection_id'> & {
    created_at: string;
    updated_at: string;
  };
};

export type GetChannelTypeResponse = Omit<
  CreateChannelOptions,
  'client_id' | 'connect_events' | 'connection_id'
> & {
  duration: string;
  created_at: string;
  updated_at: string;
};

export type CreateChannelResponse = Omit<GetChannelTypeResponse, 'commands'>;

export type CustomPermissionOptions = {
  name: string;
  resource: string;
  owner?: boolean;
  same_team?: boolean;
  condition?: string;
};

export type AppSettings = {
  apn_config?: {
    auth_type?: string;
    auth_key?: string;
    key_id?: string;
    team_id?: string;
    notification_template?: string;
    bundle_id?: string;
    development?: boolean;
    host?: string;
    p12_cert?: string;
  };
  disable_auth_checks?: boolean;
  disable_permissions_checks?: boolean;
  firebase_config: {
    server_key?: string;
    notification_template?: string;
    data_template?: string;
  };
  webhook_url?: string;
};

export type CheckPushInput<UserType> = {
  apn_template?: string;
  client_id?: string;
  connection_id?: string;
  firebase_data_template?: string;
  firebase_template?: string;
  message_id?: string;
  user?: User<UserType>;
  user_id?: string;
};

export type TestPushDataInput = {
  messageID?: string;
  apnTemplate?: string;
  firebaseTemplate?: string;
  firebaseDataTemplate?: string;
};

export type CheckPushResponse = {
  device_errors?: {
    error_message?: string;
    provider?: string;
  };
  duration?: string;
  general_errors?: string[];
  rendered_apn_template?: string;
  rendered_firebase_template?: string;
};

export type StreamChatOptions = AxiosRequestConfig & {
  logger?: Logger;
  browser?: boolean;
};
