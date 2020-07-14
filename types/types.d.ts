import SeamlessImmutable from 'seamless-immutable';
import type { Channel } from 'channel';

export type APIResponse = {
  duration: string;
  [key: string]: unknown;
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
  online: boolean;
};

export type Logger = (
  logLevel: 'info' | 'error',
  message: string,
  extraData?: Record<string, unknown>,
) => void;

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

export type Message<T = { [key: string]: unknown }> = T & {
  text?: string;
  attachments?: Attachment[];
  mentioned_users?: string[];
  parent_id?: string;
};

export type MessageResponse<
  T = { [key: string]: unknown },
  ReactionType = { [key: string]: unknown }
> = T & {
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
  created_at: string;
  updated_at: string;
  deleted_at?: string;
  status?: string;
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

export type ChannelResponse<T = { [key: string]: unknown }> = T & {
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

type MuteResponse = {
  user: UserResponse;
  target?: UserResponse;
  created_at?: string;
  updated_at?: string;
};

type Mute = {
  user: UserResponse;
  target: UserResponse;
  created_at: string;
  updated_at: string;
};

type ChannelMute<UserType, MessageType, ReactionType> = {
  user: UserResponse<UserType>;
  channel?: Channel<UserType, MessageType, ReactionType>; // TODO: what we gonna do bout this?
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

type OwnUserResponse = UserResponse & {
  devices: Device[];
  unread_count: number;
  total_unread_count: number;
  unread_channels: number;
  mutes: Mute[];
  channel_mutes: ChannelMute[];
};

export type MuteChannelAPIResponse = APIResponse & {
  mute: MuteResponse;
  own_user: OwnUserResponse;
  channel_mute: ChannelMute;
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

export type ArrayTwoOrMore<T> = {
  0: T;
  1: T;
} & Array<T>;

export type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<
  T,
  Exclude<keyof T, Keys>
> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];

export type PrimitiveFilter = string | number | boolean;

export interface ChannelFilter {
  $and?: ArrayTwoOrMore<RequireAtLeastOne<ChannelFilter>>;
  $eq?: PrimitiveFilter;
  $gt?: PrimitiveFilter;
  $gte?: PrimitiveFilter;
  $in?: PrimitiveFilter[];
  $lt?: PrimitiveFilter;
  $lte?: PrimitiveFilter;
  $ne?: PrimitiveFilter;
  $nin?: PrimitiveFilter[];
  $nor?: ArrayTwoOrMore<RequireAtLeastOne<ChannelFilter>>;
  $or?: ArrayTwoOrMore<RequireAtLeastOne<ChannelFilter>>;
}

export interface ChannelFilters {
  [key: string]: PrimitiveFilter | RequireAtLeastOne<ChannelFilter>;
}

export type AscDesc = 1 | -1;

export interface ChannelSort {
  last_updated?: AscDesc;
  last_message_at?: AscDesc;
  updated_at?: AscDesc;
  created_at?: AscDesc;
  member_count?: AscDesc;
  unread_count?: AscDesc;
  has_unread?: AscDesc;
  [key: string]: AscDesc | undefined;
}

export interface ChannelOptions {
  state?: boolean;
  watch?: boolean;
  limit?: number;
  offset?: number;
  message_limit?: number;
  presence?: boolean;
  recovery?: boolean;
}