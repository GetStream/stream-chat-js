import { AxiosRequestConfig } from 'axios';
import { Role } from './permissions';

/**
 * Utility Types
 */

export type ArrayOneOrMore<T> = {
  0: T;
} & Array<T>;

export type ArrayTwoOrMore<T> = {
  0: T;
  1: T;
} & Array<T>;

export type KnownKeys<T> = {
  [K in keyof T]: string extends K ? never : number extends K ? never : K;
} extends { [_ in keyof T]: infer U }
  ? U
  : never;

export type RequireAtLeastOne<T> = {
  [K in keyof T]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<keyof T, K>>>;
}[keyof T];

export type RequireOnlyOne<T, Keys extends keyof T = keyof T> = Pick<T, Exclude<keyof T, Keys>> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Record<Exclude<Keys, K>, undefined>>;
  }[Keys];

/* Unknown Record */
export type UR = Record<string, unknown>;
export type UnknownType = UR; //alias to avoid breaking change

export type Unpacked<T> = T extends (infer U)[]
  ? U // eslint-disable-next-line @typescript-eslint/no-explicit-any
  : T extends (...args: any[]) => infer U
  ? U
  : T extends Promise<infer U>
  ? U
  : T;

/**
 * Response Types
 */

export type APIResponse = {
  duration: string;
};

export type AppSettingsAPIResponse<CommandType extends string = LiteralStringForUnion> = APIResponse & {
  app?: {
    channel_configs: Record<
      string,
      {
        automod?: ChannelConfigAutomod;
        automod_behavior?: ChannelConfigAutomodBehavior;
        blocklist_behavior?: ChannelConfigAutomodBehavior;
        commands?: CommandVariants<CommandType>[];
        connect_events?: boolean;
        created_at?: string;
        custom_events?: boolean;
        max_message_length?: number;
        message_retention?: string;
        mutes?: boolean;
        name?: string;
        push_notifications?: boolean;
        quotes?: boolean;
        reactions?: boolean;
        read_events?: boolean;
        replies?: boolean;
        search?: boolean;
        typing_events?: boolean;
        updated_at?: string;
        uploads?: boolean;
        url_enrichment?: boolean;
      }
    >;
    async_url_enrich_enabled?: boolean;
    auto_translation_enabled?: boolean;
    before_message_send_hook_url?: string;
    campaign_enabled?: boolean;
    custom_action_handler_url?: string;
    disable_auth_checks?: boolean;
    disable_permissions_checks?: boolean;
    enforce_unique_usernames?: 'no' | 'app' | 'team';
    file_upload_config?: FileUploadConfig;
    grants?: Record<string, string[]>;
    image_moderation_enabled?: boolean;
    image_upload_config?: FileUploadConfig;
    multi_tenant_enabled?: boolean;
    name?: string;
    organization?: string;
    permission_version?: string;
    policies?: Record<string, Policy[]>;
    push_notifications?: {
      version: string;
      apn?: APNConfig;
      firebase?: FirebaseConfig;
      huawei?: HuaweiConfig;
    };
    revoke_tokens_issued_before?: string | null;
    search_backend?: 'disabled' | 'elasticsearch' | 'postgres';
    sqs_key?: string;
    sqs_secret?: string;
    sqs_url?: string;
    suspended?: boolean;
    suspended_explanation?: string;
    user_search_disallowed_roles?: string[] | null;
    webhook_events?: Array<string>;
    webhook_url?: string;
  };
};

export type ModerationResult = {
  action: string;
  created_at: string;
  message_id: string;
  updated_at: string;
  user_bad_karma: boolean;
  user_karma: number;
  blocked_word?: string;
  blocklist_name?: string;
  moderated_by?: string;
};

export type MessageFlagsResponse<
  ChannelType extends UR = UR,
  CommandType extends string = LiteralStringForUnion,
  UserType extends UR = UR,
  AttachmentType = UR,
  MessageType = UR,
  ReactionType = UR
> = APIResponse & {
  flags?: Array<{
    message: MessageResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>;
    user: UserResponse<UserType>;
    approved_at?: string;
    created_at?: string;
    created_by_automod?: boolean;
    moderation_result?: ModerationResult;
    rejected_at?: string;
    reviewed_at?: string;
    reviewed_by?: UserResponse<UserType>;
    updated_at?: string;
  }>;
};

export type BannedUsersResponse<
  ChannelType extends UR = UR,
  CommandType extends string = LiteralStringForUnion,
  UserType extends UR = UR
> = APIResponse & {
  bans?: Array<{
    user: UserResponse<UserType>;
    banned_by?: UserResponse<UserType>;
    channel?: ChannelResponse<ChannelType, CommandType, UserType>;
    expires?: string;
    ip_ban?: boolean;
    reason?: string;
    timeout?: number;
  }>;
};

export type BlockListResponse = BlockList & {
  created_at?: string;
  updated_at?: string;
};

export type ChannelResponse<
  ChannelType = UR,
  CommandType extends string = LiteralStringForUnion,
  UserType = UR
> = ChannelType & {
  cid: string;
  disabled: boolean;
  frozen: boolean;
  id: string;
  type: string;
  auto_translation_enabled?: boolean;
  auto_translation_language?: TranslationLanguages | '';
  config?: ChannelConfigWithInfo<CommandType>;
  cooldown?: number;
  created_at?: string;
  created_by?: UserResponse<UserType> | null;
  created_by_id?: string;
  deleted_at?: string;
  hidden?: boolean;
  invites?: string[];
  last_message_at?: string;
  member_count?: number;
  members?: ChannelMemberResponse<UserType>[];
  muted?: boolean;
  name?: string;
  own_capabilities?: string[];
  team?: string;
  truncated_at?: string;
  updated_at?: string;
};

export type ChannelAPIResponse<
  AttachmentType = UR,
  ChannelType = UR,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UR,
  ReactionType = UR,
  UserType = UR
> = APIResponse & {
  channel: ChannelResponse<ChannelType, CommandType, UserType>;
  members: ChannelMemberResponse<UserType>[];
  messages: MessageResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>[];
  pinned_messages: MessageResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>[];
  hidden?: boolean;
  membership?: ChannelMembership<UserType> | null;
  read?: ReadResponse<UserType>[];
  watcher_count?: number;
  watchers?: UserResponse<UserType>[];
};

export type ChannelUpdateOptions = {
  hide_history?: boolean;
  skip_push?: boolean;
};

export type ChannelMemberAPIResponse<UserType = UR> = APIResponse & {
  members: ChannelMemberResponse<UserType>[];
};

export type ChannelMemberResponse<UserType = UR> = {
  banned?: boolean;
  channel_role?: Role;
  created_at?: string;
  invite_accepted_at?: string;
  invite_rejected_at?: string;
  invited?: boolean;
  is_moderator?: boolean;
  role?: string;
  shadow_banned?: boolean;
  updated_at?: string;
  user?: UserResponse<UserType>;
  user_id?: string;
};

export type CheckPushResponse = APIResponse & {
  device_errors?: {
    error_message?: string;
    provider?: string;
  };
  general_errors?: string[];
  rendered_apn_template?: string;
  rendered_firebase_template?: string;
  rendered_huawei_template?: string;
};

export type CheckSQSResponse = APIResponse & {
  status: string;
  data?: {};
  error?: string;
};

export type CommandResponse<CommandType extends string = LiteralStringForUnion> = Partial<CreatedAtUpdatedAt> & {
  args?: string;
  description?: string;
  name?: CommandVariants<CommandType>;
  set?: CommandVariants<CommandType>;
};

export type ConnectAPIResponse<
  ChannelType extends UR = UR,
  CommandType extends string = LiteralStringForUnion,
  UserType extends UR = UR
> = Promise<void | ConnectionOpen<ChannelType, CommandType, UserType>>;

export type CreateChannelResponse<CommandType extends string = LiteralStringForUnion> = APIResponse &
  Omit<CreateChannelOptions<CommandType>, 'client_id' | 'connection_id'> & {
    created_at: string;
    updated_at: string;
    grants?: Record<string, string[]>;
  };

export type CreateCommandResponse<CommandType extends string = LiteralStringForUnion> = APIResponse & {
  command: CreateCommandOptions<CommandType> & CreatedAtUpdatedAt;
};

export type DeleteChannelAPIResponse<
  ChannelType = UR,
  CommandType extends string = LiteralStringForUnion,
  UserType = UR
> = APIResponse & {
  channel: ChannelResponse<ChannelType, CommandType, UserType>;
};

export type DeleteCommandResponse<CommandType extends string = LiteralStringForUnion> = APIResponse & {
  name?: CommandVariants<CommandType>;
};

export type EventAPIResponse<
  AttachmentType extends UR = UR,
  ChannelType extends UR = UR,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UR = UR,
  MessageType extends UR = UR,
  ReactionType extends UR = UR,
  UserType extends UR = UR
> = APIResponse & {
  event: Event<AttachmentType, ChannelType, CommandType, EventType, MessageType, ReactionType, UserType>;
};

export type ExportChannelResponse = {
  task_id: string;
};

export type ExportChannelStatusResponse = {
  created_at?: string;
  error?: {};
  result?: {};
  updated_at?: string;
};

export type FlagMessageResponse<UserType = UR> = APIResponse & {
  flag: {
    created_at: string;
    created_by_automod: boolean;
    target_message_id: string;
    updated_at: string;
    user: UserResponse<UserType>;
    approved_at?: string;
    rejected_at?: string;
    reviewed_at?: string;
    reviewed_by?: string;
  };
};

export type FlagUserResponse<UserType = UR> = APIResponse & {
  flag: {
    created_at: string;
    created_by_automod: boolean;
    target_user: UserResponse<UserType>;
    updated_at: string;
    user: UserResponse<UserType>;
    approved_at?: string;
    rejected_at?: string;
    reviewed_at?: string;
    reviewed_by?: string;
  };
};

export type FormatMessageResponse<
  AttachmentType = UR,
  ChannelType = UR,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UR,
  ReactionType = UR,
  UserType = UR
> = Omit<
  MessageResponse<AttachmentType, ChannelType, CommandType, {}, ReactionType, UserType>,
  'created_at' | 'pinned_at' | 'updated_at' | 'status'
> &
  MessageType & {
    created_at: Date;
    pinned_at: Date | null;
    status: string;
    updated_at: Date;
  };

export type GetChannelTypeResponse<CommandType extends string = LiteralStringForUnion> = APIResponse &
  Omit<CreateChannelOptions<CommandType>, 'client_id' | 'connection_id' | 'commands'> & {
    created_at: string;
    updated_at: string;
    commands?: CommandResponse<CommandType>[];
    grants?: Record<string, string[]>;
  };

export type GetCommandResponse<CommandType extends string = LiteralStringForUnion> = APIResponse &
  CreateCommandOptions<CommandType> &
  CreatedAtUpdatedAt;

export type GetMultipleMessagesAPIResponse<
  AttachmentType = UR,
  ChannelType = UR,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UR,
  ReactionType = UR,
  UserType = UR
> = APIResponse & {
  messages: MessageResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>[];
};

export type GetRateLimitsResponse = APIResponse & {
  android?: RateLimitsMap;
  ios?: RateLimitsMap;
  server_side?: RateLimitsMap;
  web?: RateLimitsMap;
};

export type GetReactionsAPIResponse<ReactionType = UR, UserType = UR> = APIResponse & {
  reactions: ReactionResponse<ReactionType, UserType>[];
};

export type GetRepliesAPIResponse<
  AttachmentType = UR,
  ChannelType = UR,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UR,
  ReactionType = UR,
  UserType = UR
> = APIResponse & {
  messages: MessageResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>[];
};

export type ListChannelResponse<CommandType extends string = LiteralStringForUnion> = APIResponse & {
  channel_types: Record<
    string,
    Omit<CreateChannelOptions<CommandType>, 'client_id' | 'connection_id' | 'commands'> & {
      commands: CommandResponse<CommandType>[];
      created_at: string;
      updated_at: string;
      grants?: Record<string, string[]>;
    }
  >;
};

export type ListChannelTypesAPIResponse<
  CommandType extends string = LiteralStringForUnion
> = ListChannelResponse<CommandType>;

export type ListCommandsResponse<CommandType extends string = LiteralStringForUnion> = APIResponse & {
  commands: Array<CreateCommandOptions<CommandType> & CreatedAtUpdatedAt>;
};

export type MuteChannelAPIResponse<
  ChannelType extends UR = UR,
  CommandType extends string = LiteralStringForUnion,
  UserType extends UR = UR
> = APIResponse & {
  channel_mute: ChannelMute<ChannelType, CommandType, UserType>;
  own_user: OwnUserResponse<ChannelType, CommandType, UserType>;
  channel_mutes?: ChannelMute<ChannelType, CommandType, UserType>[];
  mute?: MuteResponse<UserType>;
};

export type MessageResponse<
  AttachmentType = UR,
  ChannelType = UR,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UR,
  ReactionType = UR,
  UserType = UR
> = MessageResponseBase<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType> & {
  quoted_message?: MessageResponseBase<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>;
};

export type MessageResponseBase<
  AttachmentType = UR,
  ChannelType = UR,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UR,
  ReactionType = UR,
  UserType = UR
> = MessageBase<AttachmentType, MessageType, UserType> & {
  args?: string;
  channel?: ChannelResponse<ChannelType, CommandType, UserType>;
  cid?: string;
  command?: string;
  command_info?: { name?: string };
  created_at?: string;
  deleted_at?: string;
  i18n?: RequireAtLeastOne<Record<`${TranslationLanguages}_text`, string>> & {
    language: TranslationLanguages;
  };
  latest_reactions?: ReactionResponse<ReactionType, UserType>[];
  mentioned_users?: UserResponse<UserType>[];
  own_reactions?: ReactionResponse<ReactionType, UserType>[] | null;
  pin_expires?: string | null;
  pinned_at?: string | null;
  pinned_by?: UserResponse<UserType> | null;
  reaction_counts?: { [key: string]: number } | null;
  reaction_scores?: { [key: string]: number } | null;
  reply_count?: number;
  shadowed?: boolean;
  silent?: boolean;
  status?: string;
  thread_participants?: UserResponse<UserType>[];
  type?: MessageLabel;
  updated_at?: string;
};

export type MuteResponse<UserType = UR> = {
  user: UserResponse<UserType>;
  created_at?: string;
  expires?: string;
  target?: UserResponse<UserType>;
  updated_at?: string;
};

export type MuteUserResponse<
  ChannelType extends UR = UR,
  CommandType extends string = LiteralStringForUnion,
  UserType extends UR = UR
> = APIResponse & {
  mute?: MuteResponse<UserType>;
  mutes?: Array<Mute<UserType>>;
  own_user?: OwnUserResponse<ChannelType, CommandType, UserType>;
};

export type OwnUserBase<
  ChannelType extends UR = UR,
  CommandType extends string = LiteralStringForUnion,
  UserType extends UR = UR
> = {
  channel_mutes: ChannelMute<ChannelType, CommandType, UserType>[];
  devices: Device<UserType>[];
  mutes: Mute<UserType>[];
  total_unread_count: number;
  unread_channels: number;
  unread_count: number;
  invisible?: boolean;
  roles?: string[];
};

export type OwnUserResponse<
  ChannelType extends UR = UR,
  CommandType extends string = LiteralStringForUnion,
  UserType extends UR = UR
> = UserResponse<UserType> & OwnUserBase<ChannelType, CommandType, UserType>;

export type PartialUpdateChannelAPIResponse<
  ChannelType = UR,
  CommandType extends string = LiteralStringForUnion,
  UserType = UR
> = APIResponse & {
  channel: ChannelResponse<ChannelType, CommandType, UserType>;
  members: ChannelMemberResponse<UserType>[];
};

export type PermissionAPIResponse = APIResponse & {
  permission?: PermissionAPIObject;
};

export type PermissionsAPIResponse = APIResponse & {
  permissions?: PermissionAPIObject[];
};

export type ReactionAPIResponse<
  AttachmentType = UR,
  ChannelType = UR,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UR,
  ReactionType = UR,
  UserType = UR
> = APIResponse & {
  message: MessageResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>;
  reaction: ReactionResponse<ReactionType, UserType>;
};

export type ReactionResponse<ReactionType = UR, UserType = UR> = Reaction<ReactionType, UserType> & {
  created_at: string;
  updated_at: string;
};

export type ReadResponse<UserType = UR> = {
  last_read: string;
  user: UserResponse<UserType>;
  unread_messages?: number;
};

export type SearchAPIResponse<
  AttachmentType = UR,
  ChannelType = UR,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UR,
  ReactionType = UR,
  UserType = UR
> = APIResponse & {
  results: {
    message: MessageResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>;
  }[];
  next?: string;
  previous?: string;
  results_warning?: SearchWarning | null;
};

export type SearchWarning = {
  channel_search_cids: string[];
  channel_search_count: number;
  warning_code: number;
  warning_description: string;
};
export type SendFileAPIResponse = APIResponse & { file: string };

export type SendMessageAPIResponse<
  AttachmentType = UR,
  ChannelType = UR,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UR,
  ReactionType = UR,
  UserType = UR
> = APIResponse & {
  message: MessageResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>;
};

export type TruncateChannelAPIResponse<
  ChannelType = UR,
  CommandType extends string = LiteralStringForUnion,
  UserType = UR,
  AttachmentType = UR,
  MessageType = UR,
  ReactionType = UR
> = APIResponse & {
  channel: ChannelResponse<ChannelType, CommandType, UserType>;
  message?: MessageResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>;
};

export type UpdateChannelAPIResponse<
  AttachmentType = UR,
  ChannelType = UR,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UR,
  ReactionType = UR,
  UserType = UR
> = APIResponse & {
  channel: ChannelResponse<ChannelType, CommandType, UserType>;
  members: ChannelMemberResponse<UserType>[];
  message?: MessageResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>;
};

export type UpdateChannelResponse<CommandType extends string = LiteralStringForUnion> = APIResponse &
  Omit<CreateChannelOptions<CommandType>, 'client_id' | 'connection_id'> & {
    created_at: string;
    updated_at: string;
  };

export type UpdateCommandResponse<CommandType extends string = LiteralStringForUnion> = APIResponse & {
  command: UpdateCommandOptions<CommandType> &
    CreatedAtUpdatedAt & {
      name: CommandVariants<CommandType>;
    };
};

export type UpdateMessageAPIResponse<
  AttachmentType = UR,
  ChannelType = UR,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UR,
  ReactionType = UR,
  UserType = UR
> = APIResponse & {
  message: MessageResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>;
};

export type UsersAPIResponse<UserType = UR> = APIResponse & {
  users: Array<UserResponse<UserType>>;
};

export type UpdateUsersAPIResponse<UserType = UR> = APIResponse & {
  users: { [key: string]: UserResponse<UserType> };
};

export type UserResponse<UserType = UR> = User<UserType> & {
  banned?: boolean;
  created_at?: string;
  deactivated_at?: string;
  deleted_at?: string;
  language?: TranslationLanguages | '';
  last_active?: string;
  online?: boolean;
  revoke_tokens_issued_before?: string;
  shadow_banned?: boolean;
  updated_at?: string;
};

/**
 * Option Types
 */

export type MessageFlagsPaginationOptions = {
  limit?: number;
  offset?: number;
};

export type BannedUsersPaginationOptions = Omit<PaginationOptions, 'id_gt' | 'id_gte' | 'id_lt' | 'id_lte'>;

export type BanUserOptions<UserType = UR> = UnBanUserOptions & {
  banned_by?: UserResponse<UserType>;
  banned_by_id?: string;
  ip_ban?: boolean;
  reason?: string;
  timeout?: number;
};

export type ChannelOptions = {
  limit?: number;
  member_limit?: number;
  message_limit?: number;
  offset?: number;
  presence?: boolean;
  state?: boolean;
  user_id?: string;
  watch?: boolean;
};

export type ChannelQueryOptions<ChannelType = UR, CommandType extends string = LiteralStringForUnion, UserType = UR> = {
  client_id?: string;
  connection_id?: string;
  data?: ChannelResponse<ChannelType, CommandType, UserType>;
  members?: PaginationOptions;
  messages?: MessagePaginationOptions;
  presence?: boolean;
  state?: boolean;
  watch?: boolean;
  watchers?: PaginationOptions;
};

export type ChannelStateOptions = {
  skipInitialization?: string[];
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
  grants?: Record<string, string[]>;
  max_message_length?: number;
  message_retention?: string;
  mutes?: boolean;
  name?: string;
  permissions?: PermissionObject[];
  push_notifications?: boolean;
  quotes?: boolean;
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
  action: string;
  condition: object;
  id: string;
  name: string;
  description?: string;
  owner?: boolean;
  same_team?: boolean;
};

// TODO: rename to UpdateChannelOptions in the next major update and use it in channel._update and/or channel.update
export type InviteOptions<
  AttachmentType = UR,
  ChannelType = UR,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UR,
  ReactionType = UR,
  UserType = UR
> = {
  accept_invite?: boolean;
  add_members?: string[];
  add_moderators?: string[];
  client_id?: string;
  connection_id?: string;
  data?: Omit<ChannelResponse<ChannelType, CommandType, UserType>, 'id' | 'cid'>;
  demote_moderators?: string[];
  invites?: string[];
  message?: MessageResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>;
  reject_invite?: boolean;
  remove_members?: string[];
  user?: UserResponse<UserType>;
  user_id?: string;
};

/** @deprecated use MarkChannelsReadOptions instead */
export type MarkAllReadOptions<UserType = UR> = MarkChannelsReadOptions<UserType>;

export type MarkChannelsReadOptions<UserType = UR> = {
  client_id?: string;
  connection_id?: string;
  read_by_channel?: Record<string, string>;
  user?: UserResponse<UserType>;
  user_id?: string;
};

export type MarkReadOptions<UserType = UR> = {
  client_id?: string;
  connection_id?: string;
  message_id?: string;
  user?: UserResponse<UserType>;
  user_id?: string;
};

export type MuteUserOptions<UserType = UR> = {
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

export type MessagePaginationOptions = PaginationOptions & {
  created_at_around?: string | Date;
  id_around?: string;
};

export type QueryMembersOptions = {
  limit?: number;
  offset?: number;
  user_id_gt?: string;
  user_id_gte?: string;
  user_id_lt?: string;
  user_id_lte?: string;
};

export type SearchOptions<MessageType = UR> = {
  limit?: number;
  next?: string;
  offset?: number;
  sort?: SearchMessageSort<MessageType>;
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
  device?: BaseDeviceFields;
  enableInsights?: boolean;
  /** experimental feature, please contact support if you want this feature enabled for you */
  enableWSFallback?: boolean;
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

// TODO: rename to UpdateChannelTypeOptions in the next major update
export type UpdateChannelOptions<CommandType extends string = LiteralStringForUnion> = Omit<
  CreateChannelOptions<CommandType>,
  'name'
> & {
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

/**
 * Event Types
 */

export type ConnectionChangeEvent = {
  type: EventTypes;
  online?: boolean;
};

export type Event<
  AttachmentType extends UR = UR,
  ChannelType extends UR = UR,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UR = UR,
  MessageType extends UR = UR,
  ReactionType extends UR = UR,
  UserType extends UR = UR
> = EventType & {
  type: EventTypes;
  channel?: ChannelResponse<ChannelType, CommandType, UserType>;
  channel_id?: string;
  channel_type?: string;
  cid?: string;
  clear_history?: boolean;
  connection_id?: string;
  created_at?: string;
  hard_delete?: boolean;
  mark_messages_deleted?: boolean;
  me?: OwnUserResponse<ChannelType, CommandType, UserType>;
  member?: ChannelMemberResponse<UserType>;
  message?: MessageResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>;
  online?: boolean;
  parent_id?: string;
  reaction?: ReactionResponse<ReactionType, UserType>;
  received_at?: string | Date;
  team?: string;
  total_unread_count?: number;
  unread_channels?: number;
  unread_count?: number;
  user?: UserResponse<UserType>;
  user_id?: string;
  watcher_count?: number;
};

export type UserCustomEvent<EventType extends UR = UR> = EventType & {
  type: string;
};

export type EventHandler<
  AttachmentType extends UR = UR,
  ChannelType extends UR = UR,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UR = UR,
  MessageType extends UR = UR,
  ReactionType extends UR = UR,
  UserType extends UR = UR
> = (event: Event<AttachmentType, ChannelType, CommandType, EventType, MessageType, ReactionType, UserType>) => void;

export type EventTypes =
  | 'all'
  | 'channel.created'
  | 'channel.deleted'
  | 'channel.hidden'
  | 'channel.muted'
  | 'channel.truncated'
  | 'channel.unmuted'
  | 'channel.updated'
  | 'channel.visible'
  | 'transport.changed' // ws vs longpoll
  | 'connection.changed'
  | 'connection.recovered'
  | 'health.check'
  | 'member.added'
  | 'member.removed'
  | 'member.updated'
  | 'message.deleted'
  | 'message.new'
  | 'message.read'
  | 'message.updated'
  | 'notification.added_to_channel'
  | 'notification.channel_deleted'
  | 'notification.channel_mutes_updated'
  | 'notification.channel_truncated'
  | 'notification.invite_accepted'
  | 'notification.invite_rejected'
  | 'notification.invited'
  | 'notification.mark_read'
  | 'notification.message_new'
  | 'notification.mutes_updated'
  | 'notification.removed_from_channel'
  | 'reaction.deleted'
  | 'reaction.new'
  | 'reaction.updated'
  | 'typing.start'
  | 'typing.stop'
  | 'user.banned'
  | 'user.deleted'
  | 'user.presence.changed'
  | 'user.unbanned'
  | 'user.updated'
  | 'user.watching.start'
  | 'user.watching.stop';

/**
 * Filter Types
 */

export type AscDesc = 1 | -1;

export type MessageFlagsFiltersOptions = {
  channel_cid?: string;
  is_reviewed?: boolean;
  team?: string;
  user_id?: string;
};

export type MessageFlagsFilters = QueryFilters<
  {
    channel_cid?:
      | RequireOnlyOne<Pick<QueryFilter<MessageFlagsFiltersOptions['channel_cid']>, '$eq' | '$in'>>
      | PrimitiveFilter<MessageFlagsFiltersOptions['channel_cid']>;
  } & {
    team?:
      | RequireOnlyOne<Pick<QueryFilter<MessageFlagsFiltersOptions['team']>, '$eq' | '$in'>>
      | PrimitiveFilter<MessageFlagsFiltersOptions['team']>;
  } & {
    user_id?:
      | RequireOnlyOne<Pick<QueryFilter<MessageFlagsFiltersOptions['user_id']>, '$eq' | '$in'>>
      | PrimitiveFilter<MessageFlagsFiltersOptions['user_id']>;
  } & {
      [Key in keyof Omit<MessageFlagsFiltersOptions, 'channel_cid' | 'user_id' | 'is_reviewed'>]:
        | RequireOnlyOne<QueryFilter<MessageFlagsFiltersOptions[Key]>>
        | PrimitiveFilter<MessageFlagsFiltersOptions[Key]>;
    }
>;

export type BannedUsersFilterOptions = {
  banned_by_id?: string;
  channel_cid?: string;
  created_at?: string;
  reason?: string;
  user_id?: string;
};

export type BannedUsersFilters = QueryFilters<
  {
    channel_cid?:
      | RequireOnlyOne<Pick<QueryFilter<BannedUsersFilterOptions['channel_cid']>, '$eq' | '$in'>>
      | PrimitiveFilter<BannedUsersFilterOptions['channel_cid']>;
  } & {
    reason?:
      | RequireOnlyOne<
          {
            $autocomplete?: BannedUsersFilterOptions['reason'];
          } & QueryFilter<BannedUsersFilterOptions['reason']>
        >
      | PrimitiveFilter<BannedUsersFilterOptions['reason']>;
  } & {
      [Key in keyof Omit<BannedUsersFilterOptions, 'channel_cid' | 'reason'>]:
        | RequireOnlyOne<QueryFilter<BannedUsersFilterOptions[Key]>>
        | PrimitiveFilter<BannedUsersFilterOptions[Key]>;
    }
>;

export type ChannelFilters<
  ChannelType = UR,
  CommandType extends string = LiteralStringForUnion,
  UserType = UR
> = QueryFilters<
  ContainsOperator<ChannelType> & {
    members?:
      | RequireOnlyOne<Pick<QueryFilter<string>, '$in' | '$nin'>>
      | RequireOnlyOne<Pick<QueryFilter<string[]>, '$eq'>>
      | PrimitiveFilter<string[]>;
  } & {
    name?:
      | RequireOnlyOne<
          {
            $autocomplete?: ChannelResponse<ChannelType, CommandType, UserType>['name'];
          } & QueryFilter<ChannelResponse<ChannelType, CommandType, UserType>['name']>
        >
      | PrimitiveFilter<ChannelResponse<ChannelType, CommandType, UserType>['name']>;
  } & {
      [Key in keyof Omit<ChannelResponse<{}, CommandType, UserType>, 'name' | 'members'>]:
        | RequireOnlyOne<QueryFilter<ChannelResponse<{}, CommandType, UserType>[Key]>>
        | PrimitiveFilter<ChannelResponse<{}, CommandType, UserType>[Key]>;
    }
>;

export type ContainsOperator<CustomType = {}> = {
  [Key in keyof CustomType]?: CustomType[Key] extends (infer ContainType)[]
    ?
        | RequireOnlyOne<
            {
              $contains?: ContainType extends object
                ? PrimitiveFilter<RequireAtLeastOne<ContainType>>
                : PrimitiveFilter<ContainType>;
            } & QueryFilter<PrimitiveFilter<ContainType>[]>
          >
        | PrimitiveFilter<PrimitiveFilter<ContainType>[]>
    : RequireOnlyOne<QueryFilter<CustomType[Key]>> | PrimitiveFilter<CustomType[Key]>;
};

export type MessageFilters<
  AttachmentType = UR,
  ChannelType = UR,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UR,
  ReactionType = UR,
  UserType = UR
> = QueryFilters<
  ContainsOperator<MessageType> & {
    text?:
      | RequireOnlyOne<
          {
            $autocomplete?: MessageResponse<
              AttachmentType,
              ChannelType,
              CommandType,
              MessageType,
              ReactionType,
              UserType
            >['text'];
            $q?: MessageResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>['text'];
          } & QueryFilter<
            MessageResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>['text']
          >
        >
      | PrimitiveFilter<
          MessageResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>['text']
        >;
  } & {
      [Key in keyof Omit<
        MessageResponse<AttachmentType, ChannelType, CommandType, {}, ReactionType, UserType>,
        'text'
      >]?:
        | RequireOnlyOne<
            QueryFilter<MessageResponse<AttachmentType, ChannelType, CommandType, {}, ReactionType, UserType>[Key]>
          >
        | PrimitiveFilter<MessageResponse<AttachmentType, ChannelType, CommandType, {}, ReactionType, UserType>[Key]>;
    }
>;

export type PrimitiveFilter<ObjectType> = ObjectType | null;

export type QueryFilter<ObjectType = string> = NonNullable<ObjectType> extends string | number | boolean
  ? {
      $eq?: PrimitiveFilter<ObjectType>;
      $exists?: boolean;
      $gt?: PrimitiveFilter<ObjectType>;
      $gte?: PrimitiveFilter<ObjectType>;
      $in?: PrimitiveFilter<ObjectType>[];
      $lt?: PrimitiveFilter<ObjectType>;
      $lte?: PrimitiveFilter<ObjectType>;
      $ne?: PrimitiveFilter<ObjectType>;
      $nin?: PrimitiveFilter<ObjectType>[];
    }
  : {
      $eq?: PrimitiveFilter<ObjectType>;
      $exists?: boolean;
      $in?: PrimitiveFilter<ObjectType>[];
      $ne?: PrimitiveFilter<ObjectType>;
      $nin?: PrimitiveFilter<ObjectType>[];
    };

export type QueryFilters<Operators = {}> = {
  [Key in keyof Operators]?: Operators[Key];
} &
  QueryLogicalOperators<Operators>;

export type QueryLogicalOperators<Operators> = {
  $and?: ArrayOneOrMore<QueryFilters<Operators>>;
  $nor?: ArrayOneOrMore<QueryFilters<Operators>>;
  $or?: ArrayTwoOrMore<QueryFilters<Operators>>;
};

export type UserFilters<UserType = UR> = QueryFilters<
  ContainsOperator<UserType> & {
    id?:
      | RequireOnlyOne<{ $autocomplete?: UserResponse<UserType>['id'] } & QueryFilter<UserResponse<UserType>['id']>>
      | PrimitiveFilter<UserResponse<UserType>['id']>;
    name?:
      | RequireOnlyOne<{ $autocomplete?: UserResponse<UserType>['name'] } & QueryFilter<UserResponse<UserType>['name']>>
      | PrimitiveFilter<UserResponse<UserType>['name']>;
    teams?:
      | RequireOnlyOne<{
          $contains?: PrimitiveFilter<string>;
          $eq?: PrimitiveFilter<UserResponse<UserType>['teams']>;
        }>
      | PrimitiveFilter<UserResponse<UserType>['teams']>;
    username?:
      | RequireOnlyOne<
          { $autocomplete?: UserResponse<UserType>['username'] } & QueryFilter<UserResponse<UserType>['username']>
        >
      | PrimitiveFilter<UserResponse<UserType>['username']>;
  } & {
      [Key in keyof Omit<UserResponse<{}>, 'id' | 'name' | 'teams' | 'username'>]?:
        | RequireOnlyOne<QueryFilter<UserResponse<{}>[Key]>>
        | PrimitiveFilter<UserResponse<{}>[Key]>;
    }
>;

/**
 * Sort Types
 */

export type BannedUsersSort = BannedUsersSortBase | Array<BannedUsersSortBase>;

export type BannedUsersSortBase = { created_at?: AscDesc };

export type ChannelSort<ChannelType = UR> = ChannelSortBase<ChannelType> | Array<ChannelSortBase<ChannelType>>;

export type ChannelSortBase<ChannelType = UR> = Sort<ChannelType> & {
  created_at?: AscDesc;
  has_unread?: AscDesc;
  last_message_at?: AscDesc;
  last_updated?: AscDesc;
  member_count?: AscDesc;
  unread_count?: AscDesc;
  updated_at?: AscDesc;
};

export type Sort<T> = {
  [P in keyof T]?: AscDesc;
};

export type UserSort<UserType = UR> = Sort<UserResponse<UserType>> | Array<Sort<UserResponse<UserType>>>;

export type MemberSort<UserType = UR> =
  | Sort<Pick<UserResponse<UserType>, 'id' | 'created_at' | 'name'>>
  | Array<Sort<Pick<UserResponse<UserType>, 'id' | 'created_at' | 'name'>>>;

export type SearchMessageSortBase<MessageType = UR> = Sort<MessageType> & {
  attachments?: AscDesc;
  'attachments.type'?: AscDesc;
  created_at?: AscDesc;
  id?: AscDesc;
  'mentioned_users.id'?: AscDesc;
  parent_id?: AscDesc;
  pinned?: AscDesc;
  relevance?: AscDesc;
  reply_count?: AscDesc;
  text?: AscDesc;
  type?: AscDesc;
  updated_at?: AscDesc;
  'user.id'?: AscDesc;
};

export type SearchMessageSort<MessageType = UR> =
  | SearchMessageSortBase<MessageType>
  | Array<SearchMessageSortBase<MessageType>>;

export type QuerySort<ChannelType = UR, UserType = UR, MessageType = UR> =
  | BannedUsersSort
  | ChannelSort<ChannelType>
  | SearchMessageSort<MessageType>
  | UserSort<UserType>;

/**
 * Base Types
 */

export type Action = {
  name?: string;
  style?: string;
  text?: string;
  type?: string;
  value?: string;
};

export type AnonUserType = {};

export type APNConfig = {
  auth_type?: string;
  bundle_id?: string;
  development?: boolean;
  enabled?: boolean;
  host?: string;
  key_id?: string;
  notification_template?: string;
  team_id?: string;
};

export type AppSettings = {
  apn_config?: {
    auth_key?: string;
    auth_type?: string;
    bundle_id?: string;
    development?: boolean;
    host?: string;
    key_id?: string;
    notification_template?: string;
    p12_cert?: string;
    team_id?: string;
  };
  async_url_enrich_enabled?: boolean;
  auto_translation_enabled?: boolean;
  custom_action_handler_url?: string;
  disable_auth_checks?: boolean;
  disable_permissions_checks?: boolean;
  enforce_unique_usernames?: 'no' | 'app' | 'team';
  // all possible file mime types are https://www.iana.org/assignments/media-types/media-types.xhtml
  file_upload_config?: FileUploadConfig;
  firebase_config?: {
    credentials_json: string;
    data_template?: string;
    notification_template?: string;
    server_key?: string;
  };
  grants?: Record<string, string[]>;
  huawei_config?: {
    id: string;
    secret: string;
    data_template?: string;
  };
  image_moderation_enabled?: boolean;
  image_upload_config?: FileUploadConfig;
  multi_tenant_enabled?: boolean;
  push_config?: {
    version?: string;
  };
  revoke_tokens_issued_before?: string | null;
  sqs_key?: string;
  sqs_secret?: string;
  sqs_url?: string;
  webhook_events?: Array<string> | null;
  webhook_url?: string;
};

export type Attachment<T = UR> = T & {
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

export type OGAttachment = {
  og_scrape_url: string;
  asset_url?: string; // og:video | og:audio
  author_link?: string; // og:site
  author_name?: string; // og:site_name
  image_url?: string; // og:image
  text?: string; // og:description
  thumb_url?: string; // og:image
  title?: string; // og:title
  title_link?: string; // og:url
  type?: string | 'video' | 'audio' | 'image';
};

export type BlockList = {
  name: string;
  words: string[];
};

export type ChannelConfig<CommandType extends string = LiteralStringForUnion> = ChannelConfigFields &
  CreatedAtUpdatedAt & {
    commands?: CommandVariants<CommandType>[];
  };

export type ChannelConfigAutomod = '' | 'AI' | 'disabled' | 'simple';

export type ChannelConfigAutomodBehavior = '' | 'block' | 'flag';

export type ChannelConfigAutomodThresholds = null | {
  explicit?: { block?: number; flag?: number };
  spam?: { block?: number; flag?: number };
  toxic?: { block?: number; flag?: number };
};

export type ChannelConfigFields = {
  automod?: ChannelConfigAutomod;
  automod_behavior?: ChannelConfigAutomodBehavior;
  blocklist_behavior?: ChannelConfigAutomodBehavior;
  connect_events?: boolean;
  custom_events?: boolean;
  max_message_length?: number;
  message_retention?: string;
  mutes?: boolean;
  name?: string;
  push_notifications?: boolean;
  quotes?: boolean;
  reactions?: boolean;
  read_events?: boolean;
  replies?: boolean;
  search?: boolean;
  typing_events?: boolean;
  uploads?: boolean;
  url_enrichment?: boolean;
};

export type ChannelConfigWithInfo<CommandType extends string = LiteralStringForUnion> = ChannelConfigFields &
  CreatedAtUpdatedAt & {
    commands?: CommandResponse<CommandType>[];
  };

export type ChannelData<ChannelType = UR> = ChannelType & {
  members?: string[];
  name?: string;
};

export type ChannelMembership<UserType = UR> = {
  banned?: boolean;
  channel_role?: Role;
  created_at?: string;
  is_moderator?: boolean;
  role?: string;
  shadow_banned?: boolean;
  updated_at?: string;
  user?: UserResponse<UserType>;
};

export type ChannelMute<
  ChannelType extends UR = UR,
  CommandType extends string = LiteralStringForUnion,
  UserType extends UR = UR
> = {
  user: UserResponse<UserType>;
  channel?: ChannelResponse<ChannelType, CommandType, UserType>;
  created_at?: string;
  expires?: string;
  updated_at?: string;
};

export type ChannelRole = {
  custom?: boolean;
  name?: string;
  owner?: boolean;
  resource?: string;
  same_team?: boolean;
};

export type CheckPushInput<UserType = UR> = {
  apn_template?: string;
  client_id?: string;
  connection_id?: string;
  firebase_data_template?: string;
  firebase_template?: string;
  message_id?: string;
  user?: UserResponse<UserType>;
  user_id?: string;
};

export type PushProvider = 'apn' | 'firebase' | 'huawei';

export type CommandVariants<CommandType extends string = LiteralStringForUnion> =
  | 'all'
  | 'ban'
  | 'fun_set'
  | 'giphy'
  | 'imgur'
  | 'moderation_set'
  | 'mute'
  | 'unban'
  | 'unmute'
  | CommandType;

export type Configs<CommandType extends string = LiteralStringForUnion> = {
  [channel_type: string]: ChannelConfigWithInfo<CommandType> | undefined;
};

export type ConnectionOpen<
  ChannelType extends UR = UR,
  CommandType extends string = LiteralStringForUnion,
  UserType extends UR = UR
> = {
  connection_id: string;
  cid?: string;
  created_at?: string;
  me?: OwnUserResponse<ChannelType, CommandType, UserType>;
  type?: string;
};

export type CreatedAtUpdatedAt = {
  created_at: string;
  updated_at: string;
};

export type Device<UserType = UR> = DeviceFields & {
  provider?: string;
  user?: UserResponse<UserType>;
  user_id?: string;
};

export type BaseDeviceFields = {
  id: string;
  push_provider: PushProvider;
};

export type DeviceFields = BaseDeviceFields & {
  created_at: string;
  disabled?: boolean;
  disabled_reason?: string;
};

export type EndpointName =
  | 'Connect'
  | 'DeleteFile'
  | 'DeleteImage'
  | 'DeleteMessage'
  | 'DeleteUser'
  | 'DeactivateUser'
  | 'ExportUser'
  | 'DeleteReaction'
  | 'UpdateChannel'
  | 'UpdateChannelPartial'
  | 'UpdateMessage'
  | 'GetMessage'
  | 'GetManyMessages'
  | 'UpdateUsers'
  | 'UpdateUsersPartial'
  | 'CreateGuest'
  | 'GetOrCreateChannel'
  | 'StopWatchingChannel'
  | 'QueryChannels'
  | 'Search'
  | 'QueryUsers'
  | 'QueryMembers'
  | 'QueryBannedUsers'
  | 'GetReactions'
  | 'GetReplies'
  | 'Ban'
  | 'Unban'
  | 'Mute'
  | 'MuteChannel'
  | 'UnmuteChannel'
  | 'UnmuteUser'
  | 'RunMessageAction'
  | 'SendEvent'
  | 'MarkRead'
  | 'MarkAllRead'
  | 'SendMessage'
  | 'ImportChannelMessages'
  | 'UploadFile'
  | 'UploadImage'
  | 'UpdateApp'
  | 'GetApp'
  | 'CreateDevice'
  | 'DeleteDevice'
  | 'SendReaction'
  | 'Flag'
  | 'Unflag'
  | 'CreateChannelType'
  | 'DeleteChannel'
  | 'DeleteChannelType'
  | 'GetChannelType'
  | 'ListChannelTypes'
  | 'ListDevices'
  | 'TruncateChannel'
  | 'UpdateChannelType'
  | 'CheckPush'
  | 'PrivateSubmitModeration'
  | 'ReactivateUser'
  | 'HideChannel'
  | 'ShowChannel'
  | 'CreatePermission'
  | 'UpdatePermission'
  | 'GetPermission'
  | 'DeletePermission'
  | 'ListPermissions'
  | 'CreateRole'
  | 'DeleteRole'
  | 'ListRoles'
  | 'Sync'
  | 'TranslateMessage'
  | 'CreateCommand'
  | 'GetCommand'
  | 'UpdateCommand'
  | 'DeleteCommand'
  | 'ListCommands'
  | 'CreateBlockList'
  | 'UpdateBlockList'
  | 'GetBlockList'
  | 'ListBlockLists'
  | 'DeleteBlockList'
  | 'ExportChannels'
  | 'GetExportChannelsStatus'
  | 'CheckSQS'
  | 'GetRateLimits'
  | 'MessageUpdatePartial';

export type ExportChannelRequest = {
  id: string;
  type: string;
  messages_since?: Date;
  messages_until?: Date;
};

export type ExportChannelOptions = {
  clear_deleted_message_text?: boolean;
  include_truncated_messages?: boolean;
};

export type Field = {
  short?: boolean;
  title?: string;
  value?: string;
};

export type FileUploadConfig = {
  allowed_file_extensions?: string[] | null;
  allowed_mime_types?: string[] | null;
  blocked_file_extensions?: string[] | null;
  blocked_mime_types?: string[] | null;
};

export type FirebaseConfig = {
  credentials_json?: string;
  data_template?: string;
  enabled?: boolean;
  notification_template?: string;
};

export type HuaweiConfig = {
  data_template?: string;
  enabled?: boolean;
};

export type LiteralStringForUnion = string & {};

export type LogLevel = 'info' | 'error' | 'warn';

export type Logger = (logLevel: LogLevel, message: string, extraData?: Record<string, unknown>) => void;

export type Message<AttachmentType = UR, MessageType = UR, UserType = UR> = Partial<
  MessageBase<AttachmentType, MessageType, UserType>
> & {
  mentioned_users?: string[];
};

export type MessageBase<AttachmentType = UR, MessageType = UR, UserType = UR> = MessageType & {
  id: string;
  attachments?: Attachment<AttachmentType>[];
  html?: string;
  mml?: string;
  parent_id?: string;
  pinned?: boolean;
  quoted_message_id?: string;
  show_in_channel?: boolean;
  text?: string;
  user?: UserResponse<UserType> | null;
  user_id?: string;
};

export type MessageLabel = 'deleted' | 'ephemeral' | 'error' | 'regular' | 'reply' | 'system';

export type Mute<UserType = UR> = {
  created_at: string;
  target: UserResponse<UserType>;
  updated_at: string;
  user: UserResponse<UserType>;
};

export type PartialUpdateChannel<ChannelType = UR> = {
  set?: Partial<ChannelResponse<ChannelType>>;
  unset?: Array<keyof ChannelResponse<ChannelType>>;
};

export type PartialUserUpdate<UserType = UR> = {
  id: string;
  set?: Partial<UserResponse<UserType>>;
  unset?: Array<keyof UserResponse<UserType>>;
};

export type MessageUpdatableFields<MessageType = UR> = Omit<
  MessageResponse<MessageType>,
  'cid' | 'created_at' | 'updated_at' | 'deleted_at' | 'user' | 'user_id'
>;

export type PartialMessageUpdate<MessageType = UR> = {
  set?: Partial<MessageUpdatableFields<MessageType>>;
  unset?: Array<keyof MessageUpdatableFields<MessageType>>;
};

export type PermissionAPIObject = {
  action?: string;
  condition?: object;
  custom?: boolean;
  description?: string;
  id?: string;
  name?: string;
  owner?: boolean;
  same_team?: boolean;
};

export type PermissionObject = {
  action?: 'Deny' | 'Allow';
  name?: string;
  owner?: boolean;
  priority?: number;
  resources?: string[];
  roles?: string[];
};

export type Policy = {
  action?: 0 | 1;
  created_at?: string;
  name?: string;
  owner?: boolean;
  priority?: number;
  resources?: string[];
  roles?: string[];
  updated_at?: string;
};

export type RateLimitsInfo = {
  limit: number;
  remaining: number;
  reset: number;
};

export type RateLimitsMap = Record<EndpointName, RateLimitsInfo>;

export type Reaction<ReactionType = UR, UserType = UR> = ReactionType & {
  type: string;
  message_id?: string;
  score?: number;
  user?: UserResponse<UserType> | null;
  user_id?: string;
};

export type Resource =
  | 'AddLinks'
  | 'BanUser'
  | 'CreateChannel'
  | 'CreateMessage'
  | 'CreateReaction'
  | 'DeleteAttachment'
  | 'DeleteChannel'
  | 'DeleteMessage'
  | 'DeleteReaction'
  | 'EditUser'
  | 'MuteUser'
  | 'ReadChannel'
  | 'RunMessageAction'
  | 'UpdateChannel'
  | 'UpdateChannelMembers'
  | 'UpdateMessage'
  | 'UpdateUser'
  | 'UploadAttachment';

export type SearchPayload<
  AttachmentType = UR,
  ChannelType = UR,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UR,
  ReactionType = UR,
  UserType = UR
> = Omit<SearchOptions<MessageType>, 'sort'> & {
  client_id?: string;
  connection_id?: string;
  filter_conditions?: ChannelFilters<ChannelType, CommandType, UserType>;
  message_filter_conditions?: MessageFilters<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  >;
  query?: string;
  sort?: Array<{
    direction: AscDesc;
    field: keyof SearchMessageSortBase<MessageType>;
  }>;
};

export type TestPushDataInput = {
  apnTemplate?: string;
  firebaseDataTemplate?: string;
  firebaseTemplate?: string;
  huaweiDataTemplate?: string;
  messageID?: string;
  skipDevices?: boolean;
};

export type TestSQSDataInput = {
  sqs_key?: string;
  sqs_secret?: string;
  sqs_url?: string;
};

export type TokenOrProvider = null | string | TokenProvider | undefined;

export type TokenProvider = () => Promise<string>;

export type TranslationLanguages =
  | ''
  | 'af'
  | 'am'
  | 'ar'
  | 'az'
  | 'bg'
  | 'bn'
  | 'bs'
  | 'cs'
  | 'da'
  | 'de'
  | 'el'
  | 'en'
  | 'es'
  | 'es-MX'
  | 'et'
  | 'fa'
  | 'fa-AF'
  | 'fi'
  | 'fr'
  | 'fr-CA'
  | 'ha'
  | 'he'
  | 'hi'
  | 'hr'
  | 'hu'
  | 'id'
  | 'it'
  | 'ja'
  | 'ka'
  | 'ko'
  | 'lv'
  | 'ms'
  | 'nl'
  | 'no'
  | 'pl'
  | 'ps'
  | 'pt'
  | 'ro'
  | 'ru'
  | 'sk'
  | 'sl'
  | 'so'
  | 'sq'
  | 'sr'
  | 'sv'
  | 'sw'
  | 'ta'
  | 'th'
  | 'tl'
  | 'tr'
  | 'uk'
  | 'ur'
  | 'vi'
  | 'zh'
  | 'zh-TW';

export type TypingStartEvent = Event;

export type ReservedMessageFields =
  | 'command'
  | 'created_at'
  | 'html'
  | 'latest_reactions'
  | 'own_reactions'
  | 'quoted_message'
  | 'reaction_counts'
  | 'reply_count'
  | 'type'
  | 'updated_at'
  | 'user'
  | '__html';

export type UpdatedMessage<
  AttachmentType = UR,
  ChannelType = UR,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UR,
  ReactionType = UR,
  UserType = UR
> = Omit<
  MessageResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>,
  'mentioned_users'
> & { mentioned_users?: string[] };

export type User<UserType = UR> = UserType & {
  id: string;
  anon?: boolean;
  name?: string;
  role?: string;
  teams?: string[];
  username?: string;
};

export type TaskResponse = {
  task_id: string;
};

export type DeleteChannelsResponse = {
  result: Record<string, string>;
} & Partial<TaskResponse>;

export type DeleteType = 'soft' | 'hard';

/*
  DeleteUserOptions specifies a collection of one or more `user_ids` to be deleted.

  `user` soft|hard determines if the user needs to be hard- or soft-deleted, where hard-delete
  implies that all related objects (messages, flags, etc) will be hard-deleted as well.
  `conversations` soft|hard will delete any 1to1 channels that the user was a member of.
  `messages` soft-hard will delete any messages that the user has sent.
  `new_channel_owner_id` any channels owned by the hard-deleted user will be transferred to this user ID
 */
export type DeleteUserOptions = {
  user: DeleteType;
  conversations?: DeleteType;
  messages?: DeleteType;
  new_channel_owner_id?: string;
};

export type SegmentData = {
  description: string;
  // TODO: define this type in more detail
  filter: {
    channel?: object;
    user?: object;
  };
  name: string;
};

export type Segment = {
  app_pk: number;
  created_at: string;
  id: string;
  updated_at: string;
  recipients?: number;
} & SegmentData;

export type CampaignData = {
  attachments: Attachment[];
  defaults: Record<string, string>;
  name: string;
  segment_id: string;
  text: string;
  description?: string;
  push_notifications?: boolean;
  sender_id?: string;
};

export type CampaignStatus = {
  errors: string[];
  status: 'draft' | 'stopped' | 'scheduled' | 'completed' | 'failed' | 'canceled' | 'in_progress';
  completed_at?: string;
  failed_at?: string;
  progress?: number;
  resumed_at?: string;
  scheduled_at?: string;
  stopped_at?: string;
};

export type Campaign = {
  app_pk: string;
  created_at: string;
  id: string;
  updated_at: string;
} & CampaignData &
  CampaignStatus;

export type TaskStatus = {
  created_at: string;
  status: string;
  task_id: string;
  updated_at: string;
  error?: {
    description: string;
    type: string;
  };
  result?: UR;
};

export type TruncateOptions<AttachmentType, MessageType, UserType> = {
  hard_delete?: boolean;
  message?: Message<AttachmentType, MessageType, UserType>;
  skip_push?: boolean;
  truncated_at?: Date;
};
