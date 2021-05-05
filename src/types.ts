import { AxiosRequestConfig } from 'axios';

/**
 * Utility Types
 */

export type Optional<T, K extends keyof T> = Omit<T, K> & Partial<T>;

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

export type RequireOnlyOne<T, Keys extends keyof T = keyof T> = Pick<
  T,
  Exclude<keyof T, Keys>
> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Record<Exclude<Keys, K>, undefined>>;
  }[Keys];

export type UnknownType = Record<string, unknown>;

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

export type AppSettingsAPIResponse<
  CommandType extends string = LiteralStringForUnion
> = APIResponse & {
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
    auto_translation_enabled?: boolean;
    before_message_send_hook_url?: string;
    custom_action_handler_url?: string;
    disable_auth_checks?: boolean;
    disable_permissions_checks?: boolean;
    enforce_unique_usernames?: 'no' | 'app' | 'team';
    file_upload_config?: FileUploadConfig;
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
    };
    sqs_key?: string;
    sqs_secret?: string;
    sqs_url?: string;
    suspended?: boolean;
    suspended_explanation?: string;
    user_search_disallowed_roles?: string[];
    webhook_url?: string;
  };
};

export type BannedUsersResponse<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType extends UnknownType = UnknownType
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
  ChannelType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType = UnknownType
> = ChannelType & {
  cid: string;
  frozen: boolean;
  id: string;
  type: string;
  auto_translation_enabled?: boolean;
  auto_translation_language?: TranslationLanguages;
  config?: ChannelConfigWithInfo<CommandType>;
  cooldown?: number;
  created_at?: string;
  created_by?: UserResponse<UserType> | null;
  created_by_id?: string;
  deleted_at?: string;
  invites?: string[];
  last_message_at?: string;
  member_count?: number;
  members?: ChannelMemberResponse<UserType>[];
  muted?: boolean;
  name?: string;
  team?: string;
  updated_at?: string;
};

export type ChannelAPIResponse<
  AttachmentType = UnknownType,
  ChannelType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UnknownType,
  ReactionType = UnknownType,
  UserType = UnknownType
> = APIResponse & {
  channel: ChannelResponse<ChannelType, CommandType, UserType>;
  members: ChannelMemberResponse<UserType>[];
  messages: MessageResponse<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  >[];
  pinned_messages: MessageResponse<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  >[];
  hidden?: boolean;
  membership?: ChannelMembership<UserType> | null;
  read?: ReadResponse<UserType>[];
  watcher_count?: number;
  watchers?: UserResponse<UserType>[];
};

export type ChannelMemberAPIResponse<UserType = UnknownType> = APIResponse & {
  members: ChannelMemberResponse<UserType>[];
};

export type ChannelMemberResponse<UserType = UnknownType> = {
  banned?: boolean;
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
};

export type CheckSQSResponse = APIResponse & {
  status: string;
  data?: {};
  error?: string;
};

export type CommandResponse<
  CommandType extends string = LiteralStringForUnion
> = Partial<CreatedAtUpdatedAt> & {
  args?: string;
  description?: string;
  name?: CommandVariants<CommandType>;
  set?: CommandVariants<CommandType>;
};

export type ConnectAPIResponse<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType extends UnknownType = UnknownType
> = Promise<void | ConnectionOpen<ChannelType, CommandType, UserType>>;

export type CreateChannelResponse<
  CommandType extends string = LiteralStringForUnion
> = APIResponse &
  Omit<CreateChannelOptions<CommandType>, 'client_id' | 'connection_id'> & {
    created_at: string;
    updated_at: string;
    roles?: Record<string, ChannelRole[]>;
  };

export type CreateCommandResponse<
  CommandType extends string = LiteralStringForUnion
> = APIResponse & { command: CreateCommandOptions<CommandType> & CreatedAtUpdatedAt };

export type DeleteChannelAPIResponse<
  ChannelType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType = UnknownType
> = APIResponse & {
  channel: ChannelResponse<ChannelType, CommandType, UserType>;
};

export type DeleteCommandResponse<
  CommandType extends string = LiteralStringForUnion
> = APIResponse & {
  name?: CommandVariants<CommandType>;
};

export type EventAPIResponse<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = APIResponse & {
  event: StreamEvent<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
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

export type FlagMessageResponse<UserType = UnknownType> = APIResponse & {
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

export type FlagUserResponse<UserType = UnknownType> = APIResponse & {
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
  AttachmentType = UnknownType,
  ChannelType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UnknownType,
  ReactionType = UnknownType,
  UserType = UnknownType
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

export type GetChannelTypeResponse<
  CommandType extends string = LiteralStringForUnion
> = APIResponse &
  Omit<CreateChannelOptions<CommandType>, 'client_id' | 'connection_id' | 'commands'> & {
    created_at: string;
    updated_at: string;
    commands?: CommandResponse<CommandType>[];
    roles?: Record<string, ChannelRole[]>;
  };

export type GetCommandResponse<
  CommandType extends string = LiteralStringForUnion
> = APIResponse & CreateCommandOptions<CommandType> & CreatedAtUpdatedAt;

export type GetMultipleMessagesAPIResponse<
  AttachmentType = UnknownType,
  ChannelType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UnknownType,
  ReactionType = UnknownType,
  UserType = UnknownType
> = APIResponse & {
  messages: MessageResponse<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  >[];
};

export type GetRateLimitsResponse = APIResponse & {
  android?: RateLimitsMap;
  ios?: RateLimitsMap;
  server_side?: RateLimitsMap;
  web?: RateLimitsMap;
};

export type GetReactionsAPIResponse<
  ReactionType = UnknownType,
  UserType = UnknownType
> = APIResponse & {
  reactions: ReactionResponse<ReactionType, UserType>[];
};

export type GetRepliesAPIResponse<
  AttachmentType = UnknownType,
  ChannelType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UnknownType,
  ReactionType = UnknownType,
  UserType = UnknownType
> = APIResponse & {
  messages: MessageResponse<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  >[];
};

export type ListChannelResponse<
  CommandType extends string = LiteralStringForUnion
> = APIResponse & {
  channel_types: Record<
    string,
    Omit<
      CreateChannelOptions<CommandType>,
      'client_id' | 'connection_id' | 'commands'
    > & {
      commands: CommandResponse<CommandType>[];
      created_at: string;
      updated_at: string;
      roles?: Record<string, ChannelRole[]>;
    }
  >;
};

export type ListChannelTypesAPIResponse<
  CommandType extends string = LiteralStringForUnion
> = ListChannelResponse<CommandType>;

export type ListCommandsResponse<
  CommandType extends string = LiteralStringForUnion
> = APIResponse & {
  commands: Array<CreateCommandOptions<CommandType> & CreatedAtUpdatedAt>;
};

export type MuteChannelAPIResponse<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType extends UnknownType = UnknownType
> = APIResponse & {
  channel_mute: ChannelMute<ChannelType, CommandType, UserType>;
  own_user: OwnUserResponse<ChannelType, CommandType, UserType>;
  channel_mutes?: ChannelMute<ChannelType, CommandType, UserType>[];
  mute?: MuteResponse<UserType>;
};

export type MessageResponse<
  AttachmentType = UnknownType,
  ChannelType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UnknownType,
  ReactionType = UnknownType,
  UserType = UnknownType
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
  quoted_message?: Omit<
    MessageResponse<
      AttachmentType,
      ChannelType,
      CommandType,
      MessageType,
      ReactionType,
      UserType
    >,
    'quoted_message'
  >;
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

export type MuteResponse<UserType = UnknownType> = {
  user: UserResponse<UserType>;
  created_at?: string;
  expires?: string;
  target?: UserResponse<UserType>;
  updated_at?: string;
};

export type MuteUserResponse<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType extends UnknownType = UnknownType
> = APIResponse & {
  mute?: MuteResponse<UserType>;
  mutes?: Array<Mute<UserType>>;
  own_user?: OwnUserResponse<ChannelType, CommandType, UserType>;
};

export type OwnUserResponse<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType extends UnknownType = UnknownType
> = UserResponse<UserType> & {
  channel_mutes: ChannelMute<ChannelType, CommandType, UserType>[];
  devices: Device<UserType>[];
  mutes: Mute<UserType>[];
  total_unread_count: number;
  unread_channels: number;
  unread_count: number;
  invisible?: boolean;
  roles?: string[];
};

export type PartialUpdateChannelAPIResponse<
  ChannelType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType = UnknownType
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
  AttachmentType = UnknownType,
  ChannelType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UnknownType,
  ReactionType = UnknownType,
  UserType = UnknownType
> = APIResponse & {
  message: MessageResponse<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  >;
  reaction: ReactionResponse<ReactionType, UserType>;
};

export type ReactionResponse<
  ReactionType = UnknownType,
  UserType = UnknownType
> = Reaction<ReactionType, UserType> & {
  created_at: string;
  updated_at: string;
};

export type ReadResponse<UserType = UnknownType> = {
  last_read: string;
  user: UserResponse<UserType>;
  unread_messages?: number;
};

export type SearchAPIResponse<
  AttachmentType = UnknownType,
  ChannelType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UnknownType,
  ReactionType = UnknownType,
  UserType = UnknownType
> = APIResponse & {
  results: {
    message: MessageResponse<
      AttachmentType,
      ChannelType,
      CommandType,
      MessageType,
      ReactionType,
      UserType
    >;
  }[];
};

export type SendFileAPIResponse = APIResponse & { file: string };

export type SendMessageAPIResponse<
  AttachmentType = UnknownType,
  ChannelType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UnknownType,
  ReactionType = UnknownType,
  UserType = UnknownType
> = APIResponse & {
  message: MessageResponse<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  >;
};

export type TruncateChannelAPIResponse<
  ChannelType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType = UnknownType
> = APIResponse & {
  channel: ChannelResponse<ChannelType, CommandType, UserType>;
};

export type UpdateChannelAPIResponse<
  AttachmentType = UnknownType,
  ChannelType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UnknownType,
  ReactionType = UnknownType,
  UserType = UnknownType
> = APIResponse & {
  channel: ChannelResponse<ChannelType, CommandType, UserType>;
  members: ChannelMemberResponse<UserType>[];
  message?: MessageResponse<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  >;
};

export type UpdateChannelResponse<
  CommandType extends string = LiteralStringForUnion
> = APIResponse &
  Omit<CreateChannelOptions<CommandType>, 'client_id' | 'connection_id'> & {
    created_at: string;
    updated_at: string;
  };

export type UpdateCommandResponse<
  CommandType extends string = LiteralStringForUnion
> = APIResponse & {
  command: UpdateCommandOptions<CommandType> &
    CreatedAtUpdatedAt & {
      name: CommandVariants<CommandType>;
    };
};

export type UpdateMessageAPIResponse<
  AttachmentType = UnknownType,
  ChannelType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UnknownType,
  ReactionType = UnknownType,
  UserType = UnknownType
> = APIResponse & {
  message: MessageResponse<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  >;
};

export type UsersAPIResponse<UserType = UnknownType> = APIResponse & {
  users: Array<UserResponse<UserType>>;
};

export type UpdateUsersAPIResponse<UserType = UnknownType> = APIResponse & {
  users: { [key: string]: UserResponse<UserType> };
};

export type UserResponse<UserType = UnknownType> = User<UserType> & {
  banned?: boolean;
  created_at?: string;
  deactivated_at?: string;
  deleted_at?: string;
  language?: TranslationLanguages | '';
  last_active?: string;
  online?: boolean;
  shadow_banned?: boolean;
  updated_at?: string;
};

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

/**
 * Event base types
 */

type ChatEvent = {
  created_at?: string;
  received_at?: string | Date;
  watcher_count?: number;
};

export type EventWithChannel<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType extends UnknownType = UnknownType
> = {
  channel: ChannelResponse<ChannelType, CommandType, UserType>;
  channel_id: string;
  channel_type: string;
};

export type EventWithMember<UserType extends UnknownType = UnknownType> = {
  member: ChannelMemberResponse<UserType>;
};

export type EventWithMessage<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = {
  message: MessageResponse<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  >;
};

export type EventWithMe<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType extends UnknownType = UnknownType
> = {
  me: OwnUserResponse<ChannelType, CommandType, UserType>;
};

export type EventWithReaction<
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = {
  reaction: ReactionResponse<ReactionType, UserType>;
};

export type EventWithUser<UserType extends UnknownType = UnknownType> = {
  user: UserResponse<UserType>;
};

/**
 * Event Types
 */

export type ChannelCreatedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> & {
    cid: string;
    type: 'channel.created';
  };

export type ChannelDeletedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  Partial<EventWithUser<UserType>> & {
    cid: string;
    type: 'channel.deleted';
  };

export type ChannelHiddenEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> & {
    cid: string;
    clear_history: boolean;
    type: 'channel.hidden';
  };

export type ChannelMaxStreakChangedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> & {
    type: 'channel.max_streak_changed';
  };

export type ChannelMutedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithUser<UserType> & {
    channel_mute: ChannelMute<ChannelType, CommandType, UserType>;
    type: 'channel.muted';
  };

export type ChannelTruncatedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  Partial<EventWithUser<UserType>> & {
    cid: string;
    type: 'channel.truncated';
  };

export type ChannelUnmutedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithUser<UserType> & {
    channel_mute: ChannelMute<ChannelType, CommandType, UserType>;
    type: 'channel.unmuted';
  };

export type ChannelUpdatedEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  Partial<EventWithUser<UserType>> &
  Partial<
    EventWithMessage<
      AttachmentType,
      ChannelType,
      CommandType,
      MessageType,
      ReactionType,
      UserType
    >
  > & {
    cid: string;
    type: 'channel.updated';
  };

export type ChannelVisibleEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> & {
    type: 'channel.visible';
  };

export type ConnectionChangedEvent = {
  type: 'connection.changed';
  online?: boolean;
  received_at?: string | Date;
  watcher_count?: number;
};

export type ConnectionRecoveredEvent = {
  type: 'connection.recovered';
  received_at?: string | Date;
  watcher_count?: number;
};

export type HealthCheckEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithMe<ChannelType, CommandType, UserType> & {
    connection_id: string;
    type: 'health.check';
  };

export type MemberAddedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> &
  EventWithMember<UserType> & {
    type: 'member.added';
  };

export type MemberRemovedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> & {
    type: 'member.removed';
  };

export type MemberUpdatedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> &
  EventWithMember<UserType> & {
    type: 'member.updated';
  };

export type MessageDeletedEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  Partial<EventWithUser<UserType>> &
  EventWithMessage<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  > & {
    type: 'message.deleted';
  };

export type MessageFlaggedEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  Partial<EventWithUser<UserType>> &
  EventWithMessage<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  > & {
    type: 'message.flagged';
  };

export type MessageReadEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  Optional<EventWithChannel<ChannelType, CommandType, UserType>, 'channel'> &
  EventWithUser<UserType> & {
    cid: string;
    type: 'message.read';
  };

export type MessageUnflaggedEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> &
  EventWithMessage<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  > & {
    type: 'message.unflagged';
  };

export type MessageUpdatedEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> &
  EventWithMessage<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  > & {
    type: 'message.updated';
  };

export type MessageNewEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  Optional<EventWithChannel<ChannelType, CommandType, UserType>, 'channel'> &
  EventWithUser<UserType> &
  EventWithMessage<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  > & {
    cid: string;
    type: 'message.new';
    total_unread_count?: number;
    unread_channels?: number;
  };

export type NotificationAddedToChannelEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> &
  EventWithMember<UserType> & {
    cid: string;
    type: 'notification.added_to_channel';
  };

export type NotificationChannelDeletedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> & {
    cid: string;
    type: 'notification.channel_deleted';
  };

export type NotificationChannelMutesUpdatedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithMe<ChannelType, CommandType, UserType> & {
    type: 'notification.channel_mutes_updated';
  };

export type NotificationChannelTruncatedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> &
  EventWithMember<UserType> & {
    cid: string;
    type: 'notification.channel_truncated';
  };

export type NotificationInviteAcceptedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> &
  EventWithMember<UserType> & {
    cid: string;
    type: 'notification.invite_accepted';
  };

export type NotificationInvitedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> &
  EventWithMember<UserType> & {
    cid: string;
    type: 'notification.invited';
  };

export type NotificationInviteRejectedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> &
  EventWithMember<UserType> & {
    cid: string;
    type: 'notification.invite_rejected';
  };

export type NotificationMarkReadEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  Partial<EventWithChannel<ChannelType, CommandType, UserType>> &
  EventWithUser<UserType> & {
    cid: string;
    type: 'notification.mark_read';
    total_unread_count?: number;
    unread_channels?: number;
  };

export type NotificationMessageNewEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithMessage<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  > & {
    cid: string;
    type: 'notification.message_new';
    total_unread_count?: number;
    unread_channels?: number;
  };

export type NotificationMutesUpdatedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithMe<ChannelType, CommandType, UserType> & {
    type: 'notification.mutes_updated';
  };

export type NotificationRemovedFromChannelEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> &
  EventWithMember<UserType> & {
    cid: string;
    type: 'notification.removed_from_channel';
  };

export type ReactionDeletedEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> &
  Partial<
    EventWithMessage<
      AttachmentType,
      ChannelType,
      CommandType,
      MessageType,
      ReactionType,
      UserType
    >
  > &
  EventWithReaction<ReactionType, UserType> & {
    type: 'reaction.deleted';
  };

export type ReactionNewEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> &
  Partial<
    EventWithMessage<
      AttachmentType,
      ChannelType,
      CommandType,
      MessageType,
      ReactionType,
      UserType
    >
  > &
  EventWithReaction<ReactionType, UserType> & {
    type: 'reaction.new';
  };

export type ReactionUpdatedEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> &
  Partial<
    EventWithMessage<
      AttachmentType,
      ChannelType,
      CommandType,
      MessageType,
      ReactionType,
      UserType
    >
  > &
  EventWithReaction<ReactionType, UserType> & {
    type: 'reaction.updated';
  };

export type TypingStartEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> & {
    cid: string;
    type: 'typing.start';
    parent_id?: string;
  };

export type TypingStopEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> & {
    cid: string;
    type: 'typing.stop';
    parent_id?: string;
  };

export type UserBannedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  Partial<EventWithChannel<ChannelType, CommandType, UserType>> &
  EventWithUser<UserType> & {
    cid: string;
    type: 'user.banned';
    expiration?: Date;
  };

export type UserCustomEvent<EventType extends UnknownType = UnknownType> = EventType & {
  type: string;
};

export type UserDeactivatedEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithUser<UserType> & {
    type: 'user.deactivated';
  };

export type UserDeletedEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithUser<UserType> & {
    type: 'user.deleted';
    hard_delete?: boolean;
    mark_messages_deleted?: boolean;
  };

export type UserFlaggedEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> &
  EventWithMessage<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  > & {
    type: 'user.flagged';
  };

export type UserMutedEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  EventType &
  ChatEvent &
  EventWithUser<UserType> & {
    target_user: UserResponse<UserType>;
    type: 'user.muted';
  };

export type UserPresenceChangedEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithUser<UserType> & {
    type: 'user.presence.changed';
  };

export type UserReactivatedEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithUser<UserType> & {
    type: 'user.reactivated';
  };

export type UserWatchingStartEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  Partial<EventWithChannel<ChannelType, CommandType, UserType>> &
  EventWithUser<UserType> & {
    channel_id: string;
    channel_type: string;
    cid: string;
    type: 'user.watching.start';
  };

export type UserWatchingStopEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithUser<UserType> & {
    cid: string;
    type: 'user.watching.stop';
  };

export type UserUnbannedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  Partial<EventWithChannel<ChannelType, CommandType, UserType>> &
  EventWithUser<UserType> & {
    cid: string;
    type: 'user.unbanned';
  };

export type UserUnflaggedEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> &
  EventWithMessage<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  > & {
    type: 'user.unflagged';
  };

export type UserUnmutedEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithUser<UserType> & {
    target_user: UserResponse<UserType>;
    type: 'user.unmuted';
  };

export type UserUpdatedEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithUser<UserType> & {
    type: 'user.updated';
  };

/**
 * Event grouping types
 */

export type EventHandler<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType,
  SpecificEventType extends EventTypes = 'all'
> = (
  event: StreamEvent<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType,
    SpecificEventType
  >,
) => void;

type EventMap<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = {
  'channel.created': ChannelCreatedEvent<ChannelType, CommandType, EventType, UserType>;
  'channel.deleted': ChannelDeletedEvent<ChannelType, CommandType, EventType, UserType>;
  'channel.hidden': ChannelHiddenEvent<ChannelType, CommandType, EventType, UserType>;
  'channel.max_streak_changed': ChannelMaxStreakChangedEvent<
    ChannelType,
    CommandType,
    EventType,
    UserType
  >;
  'channel.muted': ChannelMutedEvent<ChannelType, CommandType, EventType, UserType>;
  'channel.truncated': ChannelTruncatedEvent<
    ChannelType,
    CommandType,
    EventType,
    UserType
  >;
  'channel.unmuted': ChannelUnmutedEvent<ChannelType, CommandType, EventType, UserType>;
  'channel.updated': ChannelUpdatedEvent<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  'channel.visible': ChannelVisibleEvent<ChannelType, CommandType, EventType, UserType>;
  'connection.changed': ConnectionChangedEvent;
  'connection.recovered': ConnectionRecoveredEvent;
  'health.check': HealthCheckEvent<ChannelType, CommandType, EventType, UserType>;
  'member.added': MemberAddedEvent<ChannelType, CommandType, EventType, UserType>;
  'member.removed': MemberRemovedEvent<ChannelType, CommandType, EventType, UserType>;
  'member.updated': MemberUpdatedEvent<ChannelType, CommandType, EventType, UserType>;
  'message.deleted': MessageDeletedEvent<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  'message.flagged': MessageFlaggedEvent<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  'message.new': MessageNewEvent<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  'message.read': MessageReadEvent<ChannelType, CommandType, EventType, UserType>;
  'message.unflagged': MessageUnflaggedEvent<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  'message.updated': MessageUpdatedEvent<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  'notification.added_to_channel': NotificationAddedToChannelEvent<
    ChannelType,
    CommandType,
    EventType,
    UserType
  >;
  'notification.channel_deleted': NotificationChannelDeletedEvent<
    ChannelType,
    CommandType,
    EventType,
    UserType
  >;
  'notification.channel_mutes_updated': NotificationChannelMutesUpdatedEvent<
    ChannelType,
    CommandType,
    EventType,
    UserType
  >;
  'notification.channel_truncated': NotificationChannelTruncatedEvent<
    ChannelType,
    CommandType,
    EventType,
    UserType
  >;
  'notification.invite_accepted': NotificationInviteAcceptedEvent<
    ChannelType,
    CommandType,
    EventType,
    UserType
  >;
  'notification.invite_rejected': NotificationInviteRejectedEvent<
    ChannelType,
    CommandType,
    EventType,
    UserType
  >;
  'notification.invited': NotificationInvitedEvent<
    ChannelType,
    CommandType,
    EventType,
    UserType
  >;
  'notification.mark_read': NotificationMarkReadEvent<
    ChannelType,
    CommandType,
    EventType,
    UserType
  >;
  'notification.message_new': NotificationMessageNewEvent<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  'notification.mutes_updated': NotificationMutesUpdatedEvent<
    ChannelType,
    CommandType,
    EventType,
    UserType
  >;
  'notification.removed_from_channel': NotificationRemovedFromChannelEvent<
    ChannelType,
    CommandType,
    EventType,
    UserType
  >;
  'reaction.deleted': ReactionDeletedEvent<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  'reaction.new': ReactionNewEvent<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  'reaction.updated': ReactionUpdatedEvent<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  'typing.start': TypingStartEvent<ChannelType, CommandType, EventType, UserType>;
  'typing.stop': TypingStopEvent<ChannelType, CommandType, EventType, UserType>;
  'user.banned': UserBannedEvent<ChannelType, CommandType, EventType, UserType>;
  'user.deactivated': UserDeactivatedEvent<EventType, UserType>;
  'user.deleted': UserDeletedEvent<EventType, UserType>;
  'user.flagged': UserFlaggedEvent<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  'user.muted': UserMutedEvent<EventType, UserType>;
  'user.presence.changed': UserPresenceChangedEvent<EventType, UserType>;
  'user.reactivated': UserReactivatedEvent<EventType, UserType>;
  'user.unbanned': UserUnbannedEvent<ChannelType, CommandType, EventType, UserType>;
  'user.unflagged': UserUnflaggedEvent<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  'user.unmuted': UserUnmutedEvent<EventType, UserType>;
  'user.updated': UserUpdatedEvent<EventType, UserType>;
  'user.watching.start': UserWatchingStartEvent<
    ChannelType,
    CommandType,
    EventType,
    UserType
  >;
  'user.watching.stop': UserWatchingStopEvent<EventType, UserType>;
};

export type EventTypes = keyof EventMap | 'all';

type EventUnion<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = {
  [key in keyof EventMap<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >]: EventMap<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >[key];
}[keyof EventMap<
  AttachmentType,
  ChannelType,
  CommandType,
  EventType,
  MessageType,
  ReactionType,
  UserType
>];

export type StreamEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType,
  SpecificEventType extends EventTypes = 'all'
> = SpecificEventType extends Exclude<EventTypes, 'all'>
  ? EventMap<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >[SpecificEventType]
  : EventUnion<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >;

/**
 * Filter Types
 */

export type AscDesc = 1 | -1;

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
      | RequireOnlyOne<
          Pick<QueryFilter<BannedUsersFilterOptions['channel_cid']>, '$eq' | '$in'>
        >
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
  ChannelType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType = UnknownType
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
      [Key in keyof Omit<
        ChannelResponse<{}, CommandType, UserType>,
        'name' | 'members'
      >]:
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
  AttachmentType = UnknownType,
  ChannelType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UnknownType,
  ReactionType = UnknownType,
  UserType = UnknownType
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
            $q?: MessageResponse<
              AttachmentType,
              ChannelType,
              CommandType,
              MessageType,
              ReactionType,
              UserType
            >['text'];
          } & QueryFilter<
            MessageResponse<
              AttachmentType,
              ChannelType,
              CommandType,
              MessageType,
              ReactionType,
              UserType
            >['text']
          >
        >
      | PrimitiveFilter<
          MessageResponse<
            AttachmentType,
            ChannelType,
            CommandType,
            MessageType,
            ReactionType,
            UserType
          >['text']
        >;
  } & {
      [Key in keyof Omit<
        MessageResponse<
          AttachmentType,
          ChannelType,
          CommandType,
          {},
          ReactionType,
          UserType
        >,
        'text'
      >]?:
        | RequireOnlyOne<
            QueryFilter<
              MessageResponse<
                AttachmentType,
                ChannelType,
                CommandType,
                {},
                ReactionType,
                UserType
              >[Key]
            >
          >
        | PrimitiveFilter<
            MessageResponse<
              AttachmentType,
              ChannelType,
              CommandType,
              {},
              ReactionType,
              UserType
            >[Key]
          >;
    }
>;

export type PrimitiveFilter<ObjectType> = ObjectType | null;

export type QueryFilter<ObjectType = string> = NonNullable<ObjectType> extends
  | string
  | number
  | boolean
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

export type UserFilters<UserType = UnknownType> = QueryFilters<
  ContainsOperator<UserType> & {
    id?:
      | RequireOnlyOne<
          { $autocomplete?: UserResponse<UserType>['id'] } & QueryFilter<
            UserResponse<UserType>['id']
          >
        >
      | PrimitiveFilter<UserResponse<UserType>['id']>;
    name?:
      | RequireOnlyOne<
          { $autocomplete?: UserResponse<UserType>['name'] } & QueryFilter<
            UserResponse<UserType>['name']
          >
        >
      | PrimitiveFilter<UserResponse<UserType>['name']>;
    teams?:
      | RequireOnlyOne<{
          $contains?: PrimitiveFilter<string>;
          $eq?: PrimitiveFilter<UserResponse<UserType>['teams']>;
        }>
      | PrimitiveFilter<UserResponse<UserType>['teams']>;
    username?:
      | RequireOnlyOne<
          { $autocomplete?: UserResponse<UserType>['username'] } & QueryFilter<
            UserResponse<UserType>['username']
          >
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

export type ChannelSort<ChannelType = UnknownType> =
  | ChannelSortBase<ChannelType>
  | Array<ChannelSortBase<ChannelType>>;

export type ChannelSortBase<ChannelType = UnknownType> = Sort<ChannelType> & {
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

export type UserSort<UserType = UnknownType> =
  | Sort<UserResponse<UserType>>
  | Array<Sort<UserResponse<UserType>>>;

export type QuerySort<ChannelType = UnknownType, UserType = UnknownType> =
  | BannedUsersSort
  | ChannelSort<ChannelType>
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
  image_moderation_enabled?: boolean;
  image_upload_config?: FileUploadConfig;
  push_config?: {
    version?: string;
  };
  sqs_key?: string;
  sqs_secret?: string;
  sqs_url?: string;
  webhook_url?: string;
};

export type Attachment<T = UnknownType> = T & {
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

export type BlockList = {
  name: string;
  words: string[];
};

export type ChannelConfig<
  CommandType extends string = LiteralStringForUnion
> = ChannelConfigFields &
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
  reactions?: boolean;
  read_events?: boolean;
  replies?: boolean;
  search?: boolean;
  typing_events?: boolean;
  uploads?: boolean;
  url_enrichment?: boolean;
};

export type ChannelConfigWithInfo<
  CommandType extends string = LiteralStringForUnion
> = ChannelConfigFields &
  CreatedAtUpdatedAt & {
    commands?: CommandResponse<CommandType>[];
  };

export type ChannelData<ChannelType = UnknownType> = ChannelType & {
  members?: string[];
  name?: string;
};

export type ChannelMembership<UserType = UnknownType> = {
  created_at?: string;
  is_moderator?: boolean;
  role?: string;
  updated_at?: string;
  user?: UserResponse<UserType>;
};

export type ChannelMute<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType extends UnknownType = UnknownType
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

export type CheckPushInput<UserType = UnknownType> = {
  apn_template?: string;
  client_id?: string;
  connection_id?: string;
  firebase_data_template?: string;
  firebase_template?: string;
  message_id?: string;
  user?: UserResponse<UserType>;
  user_id?: string;
};

export type CommandVariants<CommandType extends string = LiteralStringForUnion> =
  | 'all'
  | 'ban'
  | 'flag'
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
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType extends UnknownType = UnknownType
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

export type Device<UserType = UnknownType> = DeviceFields & {
  provider?: string;
  user?: UserResponse<UserType>;
  user_id?: string;
};

export type DeviceFields = {
  created_at: string;
  disabled?: boolean;
  disabled_reason?: string;
  id?: string;
  push_provider?: 'apn' | 'firebase';
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
  | 'CreateCustomPermission'
  | 'UpdateCustomPermission'
  | 'GetCustomPermission'
  | 'DeleteCustomPermission'
  | 'ListCustomPermission'
  | 'CreateCustomRole'
  | 'DeleteCustomRole'
  | 'ListCustomRole'
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
  | 'GetRateLimits';

export type ExportChannelRequest = {
  id: string;
  type: string;
  messages_since?: Date;
  messages_until?: Date;
};

export type Field = {
  short?: boolean;
  title?: string;
  value?: string;
};

export type FileUploadConfig = {
  allowed_file_extensions?: string[];
  allowed_mime_types?: string[];
  blocked_file_extensions?: string[];
  blocked_mime_types?: string[];
};

export type FirebaseConfig = {
  credentials_json?: string;
  data_template?: string;
  enabled?: boolean;
  notification_template?: string;
};

export type LiteralStringForUnion = string & {};

export type Logger = (
  logLevel: 'info' | 'error' | 'warn',
  message: string,
  extraData?: Record<string, unknown>,
) => void;

export type Message<
  AttachmentType = UnknownType,
  MessageType = UnknownType,
  UserType = UnknownType
> = Partial<MessageBase<AttachmentType, MessageType, UserType>> & {
  mentioned_users?: string[];
};

export type MessageBase<
  AttachmentType = UnknownType,
  MessageType = UnknownType,
  UserType = UnknownType
> = MessageType & {
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

export type MessageLabel =
  | 'deleted'
  | 'ephemeral'
  | 'error'
  | 'regular'
  | 'reply'
  | 'system';

export type Mute<UserType = UnknownType> = {
  created_at: string;
  target: UserResponse<UserType>;
  updated_at: string;
  user: UserResponse<UserType>;
};

export type PartialUpdateChannel<ChannelType = UnknownType> = {
  set?: Partial<ChannelResponse<ChannelType>>;
  unset?: Array<keyof ChannelResponse<ChannelType>>;
};

export type PartialUserUpdate<UserType = UnknownType> = {
  id: string;
  set?: Partial<UserResponse<UserType>>;
  unset?: Array<keyof UserResponse<UserType>>;
};

export type PermissionAPIObject = {
  custom?: boolean;
  name?: string;
  owner?: boolean;
  resource?: Resource;
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

export type Reaction<
  ReactionType = UnknownType,
  UserType = UnknownType
> = ReactionType & {
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
  AttachmentType = UnknownType,
  ChannelType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UnknownType,
  ReactionType = UnknownType,
  UserType = UnknownType
> = SearchOptions & {
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
};

export type TestPushDataInput = {
  apnTemplate?: string;
  firebaseDataTemplate?: string;
  firebaseTemplate?: string;
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

export type UpdatedMessage<
  AttachmentType = UnknownType,
  ChannelType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UnknownType,
  ReactionType = UnknownType,
  UserType = UnknownType
> = Omit<
  MessageResponse<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  >,
  'mentioned_users'
> & { mentioned_users?: string[] };

export type User<UserType = UnknownType> = UserType & {
  id: string;
  anon?: boolean;
  name?: string;
  role?: string;
  teams?: string[];
  username?: string;
};
