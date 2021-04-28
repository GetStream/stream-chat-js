import { AxiosRequestConfig } from 'axios';

import {
  LiteralStringForUnion,
  ChannelConfigAutomod,
  ChannelConfigAutomodBehavior,
  CommandVariants,
  Resource,
  PermissionObject,
  ChannelConfigAutomodThresholds,
  Logger,
} from './base';

import { UserResponse, ChannelResponse, MessageResponse } from './response';

import { UnknownType } from './util';

/**
 * Option Types
 */

export type BannedUsersPaginationOptions = Omit<
  PaginationOptions,
  'id_gt' | 'id_gte' | 'id_lt' | 'id_lte'
>;

export type BanUserOptions<UserType = UnknownType> = UnBanUserOptions & {
  banned_by?: UserResponse<UserType>;
  banned_by_id?: string;
  ip_ban?: boolean;
  reason?: string;
  timeout?: number;
  /**
   * @deprecated please use banned_by
   */
  user?: UserResponse<UserType>;
  /**
   * @deprecated please use banned_by_id
   */
  user_id?: string;
};

export type ChannelOptions = {
  last_message_ids?: { [key: string]: string };
  limit?: number;
  message_limit?: number;
  offset?: number;
  presence?: boolean;
  recovery?: boolean;
  state?: boolean;
  watch?: boolean;
};

export type ChannelQueryOptions<
  ChannelType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType = UnknownType
> = {
  client_id?: string;
  connection_id?: string;
  data?: ChannelResponse<ChannelType, CommandType, UserType>;
  members?: PaginationOptions;
  messages?: PaginationOptions;
  presence?: boolean;
  state?: boolean;
  watch?: boolean;
  watchers?: PaginationOptions;
};

export type CreateChannelOptions<CommandType extends string = LiteralStringForUnion> = {
  automod?: ChannelConfigAutomod;
  automod_behavior?: ChannelConfigAutomodBehavior;
  automod_thresholds?: ChannelConfigAutomodThresholds;
  blocklist?: string;
  blocklist_behavior?: ChannelConfigAutomodBehavior;
  client_id?: string;
  commands?: CommandVariants<CommandType>[];
  connect_events?: boolean;
  connection_id?: string;
  custom_events?: boolean;
  max_message_length?: number;
  message_retention?: string;
  mutes?: boolean;
  name?: string;
  permissions?: PermissionObject[];
  push_notifications?: boolean;
  reactions?: boolean;
  read_events?: boolean;
  replies?: boolean;
  search?: boolean;
  typing_events?: boolean;
  uploads?: boolean;
  url_enrichment?: boolean;
};

export type CreateCommandOptions<CommandType extends string = LiteralStringForUnion> = {
  description: string;
  name: CommandVariants<CommandType>;
  args?: string;
  set?: CommandVariants<CommandType>;
};

export type CustomPermissionOptions = {
  name: string;
  resource: Resource;
  condition?: string;
  owner?: boolean;
  same_team?: boolean;
};

export type InviteOptions<
  AttachmentType = UnknownType,
  ChannelType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UnknownType,
  ReactionType = UnknownType,
  UserType = UnknownType
> = {
  accept_invite?: boolean;
  add_members?: string[];
  add_moderators?: string[];
  client_id?: string;
  connection_id?: string;
  data?: Omit<ChannelResponse<ChannelType, CommandType, UserType>, 'id' | 'cid'>;
  demote_moderators?: string[];
  invites?: string[];
  message?: MessageResponse<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  >;
  reject_invite?: boolean;
  remove_members?: string[];
  user?: UserResponse<UserType>;
  user_id?: string;
};

export type MarkAllReadOptions<UserType = UnknownType> = {
  client_id?: string;
  connection_id?: string;
  user?: UserResponse<UserType>;
  user_id?: string;
};

export type MarkReadOptions<UserType = UnknownType> = {
  client_id?: string;
  connection_id?: string;
  message_id?: string;
  user?: UserResponse<UserType>;
  user_id?: string;
};

export type MuteUserOptions<UserType = UnknownType> = {
  client_id?: string;
  connection_id?: string;
  id?: string;
  reason?: string;
  target_user_id?: string;
  timeout?: number;
  type?: string;
  user?: UserResponse<UserType>;
  user_id?: string;
};

export type PaginationOptions = {
  created_at_after?: string | Date;
  created_at_after_or_equal?: string | Date;
  created_at_before?: string | Date;
  created_at_before_or_equal?: string | Date;
  id_gt?: string;
  id_gte?: string;
  id_lt?: string;
  id_lte?: string;
  limit?: number;
  offset?: number;
};

export type QueryMembersOptions = {
  limit?: number;
  offset?: number;
  user_id_gt?: string;
  user_id_gte?: string;
  user_id_lt?: string;
  user_id_lte?: string;
};

export type SearchOptions = {
  limit?: number;
  offset?: number;
};

export type StreamChatOptions = AxiosRequestConfig & {
  /**
   * Used to disable warnings that are triggered by using connectUser or connectAnonymousUser server-side.
   */
  allowServerSideConnect?: boolean;
  /**
   * Base url to use for API
   * such as https://chat-proxy-dublin.stream-io-api.com
   */
  baseURL?: string;
  browser?: boolean;
  logger?: Logger;
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
  warmUp?: boolean;
};

export type UnBanUserOptions = {
  client_id?: string;
  connection_id?: string;
  id?: string;
  shadow?: boolean;
  target_user_id?: string;
  type?: string;
};

export type UpdateChannelOptions<
  CommandType extends string = LiteralStringForUnion
> = Omit<CreateChannelOptions<CommandType>, 'name'> & {
  created_at?: string;
  updated_at?: string;
};

export type UpdateCommandOptions<CommandType extends string = LiteralStringForUnion> = {
  description: string;
  args?: string;
  set?: CommandVariants<CommandType>;
};

export type UserOptions = {
  limit?: number;
  offset?: number;
  presence?: boolean;
};
