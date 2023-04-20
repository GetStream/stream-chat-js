import { AxiosRequestConfig, AxiosResponse } from 'axios';
import { StableWSConnection } from './connection';
import { EVENT_MAP } from './events';
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

export type DefaultGenerics = {
  attachmentType: UR;
  channelType: UR;
  commandType: LiteralStringForUnion;
  eventType: UR;
  messageType: UR;
  reactionType: UR;
  userType: UR;
};

export type ExtendableGenerics = {
  attachmentType: UR;
  channelType: UR;
  commandType: string;
  eventType: UR;
  messageType: UR;
  reactionType: UR;
  userType: UR;
};

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

export type AppSettingsAPIResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  app?: {
    // TODO
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    call_types: any;
    channel_configs: Record<
      string,
      {
        reminders: boolean;
        automod?: ChannelConfigAutomod;
        automod_behavior?: ChannelConfigAutomodBehavior;
        automod_thresholds?: ChannelConfigAutomodThresholds;
        blocklist_behavior?: ChannelConfigAutomodBehavior;
        commands?: CommandVariants<StreamChatGenerics>[];
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
    reminders_interval: number;
    agora_options?: AgoraOptions | null;
    async_moderation_config?: AsyncModerationOptions;
    async_url_enrich_enabled?: boolean;
    auto_translation_enabled?: boolean;
    before_message_send_hook_url?: string;
    campaign_enabled?: boolean;
    cdn_expiration_seconds?: number;
    custom_action_handler_url?: string;
    disable_auth_checks?: boolean;
    disable_permissions_checks?: boolean;
    enforce_unique_usernames?: 'no' | 'app' | 'team';
    file_upload_config?: FileUploadConfig;
    grants?: Record<string, string[]>;
    hms_options?: HMSOptions | null;
    image_moderation_enabled?: boolean;
    image_upload_config?: FileUploadConfig;
    multi_tenant_enabled?: boolean;
    name?: string;
    organization?: string;
    permission_version?: string;
    policies?: Record<string, Policy[]>;
    push_notifications?: {
      offline_only: boolean;
      version: string;
      apn?: APNConfig;
      firebase?: FirebaseConfig;
      huawei?: HuaweiConfig;
      providers?: PushProviderConfig[];
      xiaomi?: XiaomiConfig;
    };
    revoke_tokens_issued_before?: string | null;
    search_backend?: 'disabled' | 'elasticsearch' | 'postgres';
    sqs_key?: string;
    sqs_secret?: string;
    sqs_url?: string;
    suspended?: boolean;
    suspended_explanation?: string;
    user_search_disallowed_roles?: string[] | null;
    video_provider?: string;
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

export type AutomodDetails = {
  action?: string;
  image_labels?: Array<string>;
  original_message_type?: string;
  result?: ModerationResult;
};

export type FlagDetails = {
  automod?: AutomodDetails;
};

export type Flag<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  created_at: string;
  created_by_automod: boolean;
  updated_at: string;
  details?: FlagDetails;
  target_message?: MessageResponse<StreamChatGenerics>;
  target_user?: UserResponse<StreamChatGenerics>;
  user?: UserResponse<StreamChatGenerics>;
};

export type FlagsResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  flags?: Array<Flag<StreamChatGenerics>>;
};

export type MessageFlagsResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  flags?: Array<{
    message: MessageResponse<StreamChatGenerics>;
    user: UserResponse<StreamChatGenerics>;
    approved_at?: string;
    created_at?: string;
    created_by_automod?: boolean;
    moderation_result?: ModerationResult;
    rejected_at?: string;
    reviewed_at?: string;
    reviewed_by?: UserResponse<StreamChatGenerics>;
    updated_at?: string;
  }>;
};

export type FlagReport<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  flags_count: number;
  id: string;
  message: MessageResponse<StreamChatGenerics>;
  user: UserResponse<StreamChatGenerics>;
  created_at?: string;
  details?: FlagDetails;
  first_reporter?: UserResponse<StreamChatGenerics>;
  review_result?: string;
  reviewed_at?: string;
  reviewed_by?: UserResponse<StreamChatGenerics>;
  updated_at?: string;
};

export type FlagReportsResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  flag_reports: Array<FlagReport<StreamChatGenerics>>;
};

export type ReviewFlagReportResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  flag_report: FlagReport<StreamChatGenerics>;
};

export type BannedUsersResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  bans?: Array<{
    user: UserResponse<StreamChatGenerics>;
    banned_by?: UserResponse<StreamChatGenerics>;
    channel?: ChannelResponse<StreamChatGenerics>;
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
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> = StreamChatGenerics['channelType'] & {
  cid: string;
  disabled: boolean;
  frozen: boolean;
  id: string;
  type: string;
  auto_translation_enabled?: boolean;
  auto_translation_language?: TranslationLanguages | '';
  config?: ChannelConfigWithInfo<StreamChatGenerics>;
  cooldown?: number;
  created_at?: string;
  created_by?: UserResponse<StreamChatGenerics> | null;
  created_by_id?: string;
  deleted_at?: string;
  hidden?: boolean;
  invites?: string[];
  joined?: boolean;
  last_message_at?: string;
  member_count?: number;
  members?: ChannelMemberResponse<StreamChatGenerics>[];
  muted?: boolean;
  name?: string;
  own_capabilities?: string[];
  team?: string;
  truncated_at?: string;
  truncated_by?: UserResponse<StreamChatGenerics>;
  truncated_by_id?: string;
  updated_at?: string;
};

export type QueryChannelsAPIResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  channels: Omit<ChannelAPIResponse<StreamChatGenerics>, keyof APIResponse>[];
};

export type QueryChannelAPIResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse &
  ChannelAPIResponse<StreamChatGenerics>;

export type ChannelAPIResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  channel: ChannelResponse<StreamChatGenerics>;
  members: ChannelMemberResponse<StreamChatGenerics>[];
  messages: MessageResponse<StreamChatGenerics>[];
  pinned_messages: MessageResponse<StreamChatGenerics>[];
  hidden?: boolean;
  membership?: ChannelMembership<StreamChatGenerics> | null;
  pending_messages?: PendingMessageResponse<StreamChatGenerics>[];
  read?: ReadResponse<StreamChatGenerics>[];
  watcher_count?: number;
  watchers?: UserResponse<StreamChatGenerics>[];
};

export type ChannelUpdateOptions = {
  hide_history?: boolean;
  skip_push?: boolean;
};

export type ChannelMemberAPIResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  members: ChannelMemberResponse<StreamChatGenerics>[];
};

export type ChannelMemberResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
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
  user?: UserResponse<StreamChatGenerics>;
  user_id?: string;
};

export type CheckPushResponse = APIResponse & {
  device_errors?: {
    [deviceID: string]: {
      error_message?: string;
      provider?: PushProvider;
      provider_name?: string;
    };
  };
  general_errors?: string[];
  rendered_apn_template?: string;
  rendered_firebase_template?: string;
  rendered_message?: {};
  skip_devices?: boolean;
};

export type CheckSQSResponse = APIResponse & {
  status: string;
  data?: {};
  error?: string;
};

export type CommandResponse<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> = Partial<CreatedAtUpdatedAt> & {
  args?: string;
  description?: string;
  name?: CommandVariants<StreamChatGenerics>;
  set?: CommandVariants<StreamChatGenerics>;
};

export type ConnectAPIResponse<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> = Promise<void | ConnectionOpen<StreamChatGenerics>>;

export type CreateChannelResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse &
  Omit<CreateChannelOptions<StreamChatGenerics>, 'client_id' | 'connection_id'> & {
    created_at: string;
    updated_at: string;
    grants?: Record<string, string[]>;
  };

export type CreateCommandResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  command: CreateCommandOptions<StreamChatGenerics> & CreatedAtUpdatedAt;
};

export type DeleteChannelAPIResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  channel: ChannelResponse<StreamChatGenerics>;
};

export type DeleteCommandResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  name?: CommandVariants<StreamChatGenerics>;
};

export type EventAPIResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  event: Event<StreamChatGenerics>;
};

export type ExportChannelResponse = {
  task_id: string;
};

export type ExportUsersResponse = {
  task_id: string;
};

export type ExportChannelStatusResponse = {
  created_at?: string;
  error?: {};
  result?: {};
  updated_at?: string;
};

export type FlagMessageResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  flag: {
    created_at: string;
    created_by_automod: boolean;
    target_message_id: string;
    updated_at: string;
    user: UserResponse<StreamChatGenerics>;
    approved_at?: string;
    channel_cid?: string;
    details?: Object; // Any JSON
    message_user_id?: string;
    rejected_at?: string;
    reviewed_at?: string;
    reviewed_by?: string;
  };
};

export type FlagUserResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  flag: {
    created_at: string;
    created_by_automod: boolean;
    target_user: UserResponse<StreamChatGenerics>;
    updated_at: string;
    user: UserResponse<StreamChatGenerics>;
    approved_at?: string;
    details?: Object; // Any JSON
    rejected_at?: string;
    reviewed_at?: string;
    reviewed_by?: string;
  };
};

export type FormatMessageResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = Omit<
  MessageResponse<{
    attachmentType: StreamChatGenerics['attachmentType'];
    channelType: StreamChatGenerics['channelType'];
    commandType: StreamChatGenerics['commandType'];
    eventType: StreamChatGenerics['eventType'];
    messageType: {};
    reactionType: StreamChatGenerics['reactionType'];
    userType: StreamChatGenerics['userType'];
  }>,
  'created_at' | 'pinned_at' | 'updated_at' | 'status'
> &
  StreamChatGenerics['messageType'] & {
    created_at: Date;
    pinned_at: Date | null;
    status: string;
    updated_at: Date;
  };

export type GetChannelTypeResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse &
  Omit<CreateChannelOptions<StreamChatGenerics>, 'client_id' | 'connection_id' | 'commands'> & {
    created_at: string;
    updated_at: string;
    commands?: CommandResponse<StreamChatGenerics>[];
    grants?: Record<string, string[]>;
  };

export type GetCommandResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse &
  CreateCommandOptions<StreamChatGenerics> &
  CreatedAtUpdatedAt;

export type GetMessageAPIResponse<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> = SendMessageAPIResponse<StreamChatGenerics>;

export type GetMultipleMessagesAPIResponse<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> = APIResponse & {
  messages: MessageResponse<StreamChatGenerics>[];
};

export type GetRateLimitsResponse = APIResponse & {
  android?: RateLimitsMap;
  ios?: RateLimitsMap;
  server_side?: RateLimitsMap;
  web?: RateLimitsMap;
};

export type GetReactionsAPIResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  reactions: ReactionResponse<StreamChatGenerics>[];
};

export type GetRepliesAPIResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  messages: MessageResponse<StreamChatGenerics>[];
};

export type ListChannelResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  channel_types: Record<
    string,
    Omit<CreateChannelOptions<StreamChatGenerics>, 'client_id' | 'connection_id' | 'commands'> & {
      commands: CommandResponse<StreamChatGenerics>[];
      created_at: string;
      updated_at: string;
      grants?: Record<string, string[]>;
    }
  >;
};

export type ListChannelTypesAPIResponse<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> = ListChannelResponse<StreamChatGenerics>;

export type ListCommandsResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  commands: Array<CreateCommandOptions<StreamChatGenerics> & Partial<CreatedAtUpdatedAt>>;
};

export type MuteChannelAPIResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  channel_mute: ChannelMute<StreamChatGenerics>;
  own_user: OwnUserResponse<StreamChatGenerics>;
  channel_mutes?: ChannelMute<StreamChatGenerics>[];
  mute?: MuteResponse<StreamChatGenerics>;
};

export type MessageResponse<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> = MessageResponseBase<StreamChatGenerics> & {
  quoted_message?: MessageResponseBase<StreamChatGenerics>;
};

export type MessageResponseBase<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> = MessageBase<StreamChatGenerics> & {
  type: MessageLabel;
  args?: string;
  channel?: ChannelResponse<StreamChatGenerics>;
  cid?: string;
  command?: string;
  command_info?: { name?: string };
  created_at?: string;
  deleted_at?: string;
  i18n?: RequireAtLeastOne<Record<`${TranslationLanguages}_text`, string>> & {
    language: TranslationLanguages;
  };
  latest_reactions?: ReactionResponse<StreamChatGenerics>[];
  mentioned_users?: UserResponse<StreamChatGenerics>[];
  own_reactions?: ReactionResponse<StreamChatGenerics>[] | null;
  pin_expires?: string | null;
  pinned_at?: string | null;
  pinned_by?: UserResponse<StreamChatGenerics> | null;
  reaction_counts?: { [key: string]: number } | null;
  reaction_scores?: { [key: string]: number } | null;
  reply_count?: number;
  shadowed?: boolean;
  silent?: boolean;
  status?: string;
  thread_participants?: UserResponse<StreamChatGenerics>[];
  updated_at?: string;
};

export type MuteResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  user: UserResponse<StreamChatGenerics>;
  created_at?: string;
  expires?: string;
  target?: UserResponse<StreamChatGenerics>;
  updated_at?: string;
};

export type MuteUserResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  mute?: MuteResponse<StreamChatGenerics>;
  mutes?: Array<Mute<StreamChatGenerics>>;
  own_user?: OwnUserResponse<StreamChatGenerics>;
};

export type OwnUserBase<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  channel_mutes: ChannelMute<StreamChatGenerics>[];
  devices: Device<StreamChatGenerics>[];
  mutes: Mute<StreamChatGenerics>[];
  total_unread_count: number;
  unread_channels: number;
  unread_count: number;
  invisible?: boolean;
  roles?: string[];
};

export type OwnUserResponse<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> = UserResponse<StreamChatGenerics> & OwnUserBase<StreamChatGenerics>;

export type PartialUpdateChannelAPIResponse<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> = APIResponse & {
  channel: ChannelResponse<StreamChatGenerics>;
  members: ChannelMemberResponse<StreamChatGenerics>[];
};

export type PermissionAPIResponse = APIResponse & {
  permission?: PermissionAPIObject;
};

export type PermissionsAPIResponse = APIResponse & {
  permissions?: PermissionAPIObject[];
};

export type ReactionAPIResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  message: MessageResponse<StreamChatGenerics>;
  reaction: ReactionResponse<StreamChatGenerics>;
};

export type ReactionResponse<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> = Reaction<StreamChatGenerics> & {
  created_at: string;
  message_id: string;
  updated_at: string;
};

export type ReadResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  last_read: string;
  user: UserResponse<StreamChatGenerics>;
  last_read_message_id?: string;
  unread_messages?: number;
};

export type SearchAPIResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  results: {
    message: MessageResponse<StreamChatGenerics>;
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

// Thumb URL(thumb_url) is added considering video attachments as the backend will return the thumbnail in the response.
export type SendFileAPIResponse = APIResponse & { file: string; thumb_url?: string };

export type SendMessageAPIResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  message: MessageResponse<StreamChatGenerics>;
  pending_message_metadata?: Record<string, string> | null;
};

export type SyncResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  events: Event<StreamChatGenerics>[];
  inaccessible_cids?: string[];
};

export type TruncateChannelAPIResponse<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> = APIResponse & {
  channel: ChannelResponse<StreamChatGenerics>;
  message?: MessageResponse<StreamChatGenerics>;
};

export type UpdateChannelAPIResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  channel: ChannelResponse<StreamChatGenerics>;
  members: ChannelMemberResponse<StreamChatGenerics>[];
  message?: MessageResponse<StreamChatGenerics>;
};

export type UpdateChannelResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse &
  Omit<CreateChannelOptions<StreamChatGenerics>, 'client_id' | 'connection_id'> & {
    created_at: string;
    updated_at: string;
  };

export type UpdateCommandResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  command: UpdateCommandOptions<StreamChatGenerics> &
    CreatedAtUpdatedAt & {
      name: CommandVariants<StreamChatGenerics>;
    };
};

export type UpdateMessageAPIResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  message: MessageResponse<StreamChatGenerics>;
};

export type UsersAPIResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  users: Array<UserResponse<StreamChatGenerics>>;
};

export type UpdateUsersAPIResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  users: { [key: string]: UserResponse<StreamChatGenerics> };
};

export type UserResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = User<StreamChatGenerics> & {
  banned?: boolean;
  created_at?: string;
  deactivated_at?: string;
  deleted_at?: string;
  language?: TranslationLanguages | '';
  last_active?: string;
  online?: boolean;
  push_notifications?: PushNotificationSettings;
  revoke_tokens_issued_before?: string;
  shadow_banned?: boolean;
  updated_at?: string;
};

export type PushNotificationSettings = {
  disabled?: boolean;
  disabled_until?: string | null;
};

/**
 * Option Types
 */

export type MessageFlagsPaginationOptions = {
  limit?: number;
  offset?: number;
};

export type FlagsPaginationOptions = {
  limit?: number;
  offset?: number;
};

export type FlagReportsPaginationOptions = {
  limit?: number;
  offset?: number;
};

export type ReviewFlagReportOptions = {
  review_details?: Object;
  user_id?: string;
};

export type BannedUsersPaginationOptions = Omit<PaginationOptions, 'id_gt' | 'id_gte' | 'id_lt' | 'id_lte'>;

export type BanUserOptions<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = UnBanUserOptions & {
  banned_by?: UserResponse<StreamChatGenerics>;
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

export type ChannelQueryOptions<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  client_id?: string;
  connection_id?: string;
  data?: ChannelResponse<StreamChatGenerics>;
  hide_for_creator?: boolean;
  members?: PaginationOptions;
  messages?: MessagePaginationOptions;
  presence?: boolean;
  state?: boolean;
  watch?: boolean;
  watchers?: PaginationOptions;
};

export type ChannelStateOptions = {
  offlineMode?: boolean;
  skipInitialization?: string[];
};

export type CreateChannelOptions<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  automod?: ChannelConfigAutomod;
  automod_behavior?: ChannelConfigAutomodBehavior;
  automod_thresholds?: ChannelConfigAutomodThresholds;
  blocklist?: string;
  blocklist_behavior?: ChannelConfigAutomodBehavior;
  client_id?: string;
  commands?: CommandVariants<StreamChatGenerics>[];
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
  reminders?: boolean;
  replies?: boolean;
  search?: boolean;
  typing_events?: boolean;
  uploads?: boolean;
  url_enrichment?: boolean;
};

export type CreateCommandOptions<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  description: string;
  name: CommandVariants<StreamChatGenerics>;
  args?: string;
  set?: CommandVariants<StreamChatGenerics>;
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

export type DeactivateUsersOptions = {
  created_by_id?: string;
  mark_messages_deleted?: boolean;
};

// TODO: rename to UpdateChannelOptions in the next major update and use it in channel._update and/or channel.update
export type InviteOptions<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  accept_invite?: boolean;
  add_members?: string[];
  add_moderators?: string[];
  client_id?: string;
  connection_id?: string;
  data?: Omit<ChannelResponse<StreamChatGenerics>, 'id' | 'cid'>;
  demote_moderators?: string[];
  invites?: string[];
  message?: MessageResponse<StreamChatGenerics>;
  reject_invite?: boolean;
  remove_members?: string[];
  user?: UserResponse<StreamChatGenerics>;
  user_id?: string;
};

/** @deprecated use MarkChannelsReadOptions instead */
export type MarkAllReadOptions<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> = MarkChannelsReadOptions<StreamChatGenerics>;

export type MarkChannelsReadOptions<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  client_id?: string;
  connection_id?: string;
  read_by_channel?: Record<string, string>;
  user?: UserResponse<StreamChatGenerics>;
  user_id?: string;
};

export type MarkReadOptions<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  client_id?: string;
  connection_id?: string;
  user?: UserResponse<StreamChatGenerics>;
  user_id?: string;
};

export type MarkUnreadOptions<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  message_id: string;
  client_id?: string;
  connection_id?: string;
  user?: UserResponse<StreamChatGenerics>;
  user_id?: string;
};

export type MuteUserOptions<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  client_id?: string;
  connection_id?: string;
  id?: string;
  reason?: string;
  target_user_id?: string;
  timeout?: number;
  type?: string;
  user?: UserResponse<StreamChatGenerics>;
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

export type PinnedMessagePaginationOptions = {
  id_around?: string;
  id_gt?: string;
  id_gte?: string;
  id_lt?: string;
  id_lte?: string;
  limit?: number;
  offset?: number;
  pinned_at_after?: string | Date;
  pinned_at_after_or_equal?: string | Date;
  pinned_at_around?: string | Date;
  pinned_at_before?: string | Date;
  pinned_at_before_or_equal?: string | Date;
};

export type QueryMembersOptions = {
  limit?: number;
  offset?: number;
  user_id_gt?: string;
  user_id_gte?: string;
  user_id_lt?: string;
  user_id_lte?: string;
};

export type ReactivateUserOptions = {
  created_by_id?: string;
  name?: string;
  restore_messages?: boolean;
};

export type ReactivateUsersOptions = {
  created_by_id?: string;
  restore_messages?: boolean;
};

export type SearchOptions<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  limit?: number;
  next?: string;
  offset?: number;
  sort?: SearchMessageSort<StreamChatGenerics>;
};

export type StreamChatOptions = AxiosRequestConfig & {
  /**
   * Used to disable warnings that are triggered by using connectUser or connectAnonymousUser server-side.
   */
  allowServerSideConnect?: boolean;
  axiosRequestConfig?: AxiosRequestConfig;
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
   * When true, user will be persisted on client. Otherwise if `connectUser` call fails, then you need to
   * call `connectUser` again to retry.
   * This is mainly useful for chat application working in offline mode, where you will need client.user to
   * persist even if connectUser call fails.
   */
  persistUserOnConnectionFailure?: boolean;
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
  // Set the instance of StableWSConnection on chat client. Its purely for testing purpose and should
  // not be used in production apps.
  wsConnection?: StableWSConnection;
};

export type SyncOptions = {
  /**
   * This will behave as queryChannels option.
   */
  watch?: boolean;
  /**
   * Return channels from request that user does not have access to in a separate
   * field in the response called 'inaccessible_cids' instead of
   * adding them as 'notification.removed_from_channel' events.
   */
  with_inaccessible_cids?: boolean;
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
export type UpdateChannelOptions<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = Omit<
  CreateChannelOptions<StreamChatGenerics>,
  'name'
> & {
  created_at?: string;
  updated_at?: string;
};

export type UpdateCommandOptions<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  description: string;
  args?: string;
  set?: CommandVariants<StreamChatGenerics>;
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

export type Event<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = StreamChatGenerics['eventType'] & {
  type: EventTypes;
  channel?: ChannelResponse<StreamChatGenerics>;
  channel_id?: string;
  channel_type?: string;
  cid?: string;
  clear_history?: boolean;
  connection_id?: string;
  created_at?: string;
  hard_delete?: boolean;
  mark_messages_deleted?: boolean;
  me?: OwnUserResponse<StreamChatGenerics>;
  member?: ChannelMemberResponse<StreamChatGenerics>;
  message?: MessageResponse<StreamChatGenerics>;
  mode?: string;
  online?: boolean;
  parent_id?: string;
  queriedChannels?: {
    channels: ChannelAPIResponse<StreamChatGenerics>[];
    isLatestMessageSet?: boolean;
  };
  reaction?: ReactionResponse<StreamChatGenerics>;
  received_at?: string | Date;
  team?: string;
  total_unread_count?: number;
  unread_channels?: number;
  unread_count?: number;
  user?: UserResponse<StreamChatGenerics>;
  user_id?: string;
  watcher_count?: number;
};

export type UserCustomEvent<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> = StreamChatGenerics['eventType'] & {
  type: string;
};

export type EventHandler<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = (
  event: Event<StreamChatGenerics>,
) => void;

export type EventTypes = 'all' | keyof typeof EVENT_MAP;

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

export type FlagsFiltersOptions = {
  channel_cid?: string;
  message_id?: string;
  message_user_id?: string;
  reporter_id?: string;
  team?: string;
  user_id?: string;
};

export type FlagsFilters = QueryFilters<
  {
    user_id?:
      | RequireOnlyOne<Pick<QueryFilter<FlagsFiltersOptions['user_id']>, '$eq' | '$in'>>
      | PrimitiveFilter<FlagsFiltersOptions['user_id']>;
  } & {
    message_id?:
      | RequireOnlyOne<Pick<QueryFilter<FlagsFiltersOptions['message_id']>, '$eq' | '$in'>>
      | PrimitiveFilter<FlagsFiltersOptions['message_id']>;
  } & {
    message_user_id?:
      | RequireOnlyOne<Pick<QueryFilter<FlagsFiltersOptions['message_user_id']>, '$eq' | '$in'>>
      | PrimitiveFilter<FlagsFiltersOptions['message_user_id']>;
  } & {
    channel_cid?:
      | RequireOnlyOne<Pick<QueryFilter<FlagsFiltersOptions['channel_cid']>, '$eq' | '$in'>>
      | PrimitiveFilter<FlagsFiltersOptions['channel_cid']>;
  } & {
    reporter_id?:
      | RequireOnlyOne<Pick<QueryFilter<FlagsFiltersOptions['reporter_id']>, '$eq' | '$in'>>
      | PrimitiveFilter<FlagsFiltersOptions['reporter_id']>;
  } & {
    team?:
      | RequireOnlyOne<Pick<QueryFilter<FlagsFiltersOptions['team']>, '$eq' | '$in'>>
      | PrimitiveFilter<FlagsFiltersOptions['team']>;
  }
>;

export type FlagReportsFiltersOptions = {
  channel_cid?: string;
  is_reviewed?: boolean;
  message_id?: string;
  message_user_id?: string;
  report_id?: string;
  review_result?: string;
  reviewed_by?: string;
  team?: string;
  user_id?: string;
};

export type FlagReportsFilters = QueryFilters<
  {
    report_id?:
      | RequireOnlyOne<Pick<QueryFilter<FlagReportsFiltersOptions['report_id']>, '$eq' | '$in'>>
      | PrimitiveFilter<FlagReportsFiltersOptions['report_id']>;
  } & {
    review_result?:
      | RequireOnlyOne<Pick<QueryFilter<FlagReportsFiltersOptions['review_result']>, '$eq' | '$in'>>
      | PrimitiveFilter<FlagReportsFiltersOptions['review_result']>;
  } & {
    reviewed_by?:
      | RequireOnlyOne<Pick<QueryFilter<FlagReportsFiltersOptions['reviewed_by']>, '$eq' | '$in'>>
      | PrimitiveFilter<FlagReportsFiltersOptions['reviewed_by']>;
  } & {
    user_id?:
      | RequireOnlyOne<Pick<QueryFilter<FlagReportsFiltersOptions['user_id']>, '$eq' | '$in'>>
      | PrimitiveFilter<FlagReportsFiltersOptions['user_id']>;
  } & {
    message_id?:
      | RequireOnlyOne<Pick<QueryFilter<FlagReportsFiltersOptions['message_id']>, '$eq' | '$in'>>
      | PrimitiveFilter<FlagReportsFiltersOptions['message_id']>;
  } & {
    message_user_id?:
      | RequireOnlyOne<Pick<QueryFilter<FlagReportsFiltersOptions['message_user_id']>, '$eq' | '$in'>>
      | PrimitiveFilter<FlagReportsFiltersOptions['message_user_id']>;
  } & {
    channel_cid?:
      | RequireOnlyOne<Pick<QueryFilter<FlagReportsFiltersOptions['channel_cid']>, '$eq' | '$in'>>
      | PrimitiveFilter<FlagReportsFiltersOptions['channel_cid']>;
  } & {
    team?:
      | RequireOnlyOne<Pick<QueryFilter<FlagReportsFiltersOptions['team']>, '$eq' | '$in'>>
      | PrimitiveFilter<FlagReportsFiltersOptions['team']>;
  } & {
      [Key in keyof Omit<
        FlagReportsFiltersOptions,
        'report_id' | 'user_id' | 'message_id' | 'review_result' | 'reviewed_by'
      >]: RequireOnlyOne<QueryFilter<FlagReportsFiltersOptions[Key]>> | PrimitiveFilter<FlagReportsFiltersOptions[Key]>;
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

export type ChannelFilters<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = QueryFilters<
  ContainsOperator<StreamChatGenerics['channelType']> & {
    members?:
      | RequireOnlyOne<Pick<QueryFilter<string>, '$in' | '$nin'>>
      | RequireOnlyOne<Pick<QueryFilter<string[]>, '$eq'>>
      | PrimitiveFilter<string[]>;
  } & {
    name?:
      | RequireOnlyOne<
          {
            $autocomplete?: ChannelResponse<StreamChatGenerics>['name'];
          } & QueryFilter<ChannelResponse<StreamChatGenerics>['name']>
        >
      | PrimitiveFilter<ChannelResponse<StreamChatGenerics>['name']>;
  } & {
      [Key in keyof Omit<
        ChannelResponse<{
          attachmentType: StreamChatGenerics['attachmentType'];
          channelType: {};
          commandType: StreamChatGenerics['commandType'];
          eventType: StreamChatGenerics['eventType'];
          messageType: StreamChatGenerics['messageType'];
          reactionType: StreamChatGenerics['reactionType'];
          userType: StreamChatGenerics['userType'];
        }>,
        'name' | 'members'
      >]:
        | RequireOnlyOne<
            QueryFilter<
              ChannelResponse<{
                attachmentType: StreamChatGenerics['attachmentType'];
                channelType: {};
                commandType: StreamChatGenerics['commandType'];
                eventType: StreamChatGenerics['eventType'];
                messageType: StreamChatGenerics['messageType'];
                reactionType: StreamChatGenerics['reactionType'];
                userType: StreamChatGenerics['userType'];
              }>[Key]
            >
          >
        | PrimitiveFilter<
            ChannelResponse<{
              attachmentType: StreamChatGenerics['attachmentType'];
              channelType: {};
              commandType: StreamChatGenerics['commandType'];
              eventType: StreamChatGenerics['eventType'];
              messageType: StreamChatGenerics['messageType'];
              reactionType: StreamChatGenerics['reactionType'];
              userType: StreamChatGenerics['userType'];
            }>[Key]
          >;
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

export type MessageFilters<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = QueryFilters<
  ContainsOperator<StreamChatGenerics['messageType']> & {
    text?:
      | RequireOnlyOne<
          {
            $autocomplete?: MessageResponse<StreamChatGenerics>['text'];
            $q?: MessageResponse<StreamChatGenerics>['text'];
          } & QueryFilter<MessageResponse<StreamChatGenerics>['text']>
        >
      | PrimitiveFilter<MessageResponse<StreamChatGenerics>['text']>;
  } & {
      [Key in keyof Omit<
        MessageResponse<{
          attachmentType: StreamChatGenerics['attachmentType'];
          channelType: StreamChatGenerics['channelType'];
          commandType: StreamChatGenerics['commandType'];
          eventType: StreamChatGenerics['eventType'];
          messageType: {};
          reactionType: StreamChatGenerics['reactionType'];
          userType: StreamChatGenerics['userType'];
        }>,
        'text'
      >]?:
        | RequireOnlyOne<
            QueryFilter<
              MessageResponse<{
                attachmentType: StreamChatGenerics['attachmentType'];
                channelType: StreamChatGenerics['channelType'];
                commandType: StreamChatGenerics['commandType'];
                eventType: StreamChatGenerics['eventType'];
                messageType: {};
                reactionType: StreamChatGenerics['reactionType'];
                userType: StreamChatGenerics['userType'];
              }>[Key]
            >
          >
        | PrimitiveFilter<
            MessageResponse<{
              attachmentType: StreamChatGenerics['attachmentType'];
              channelType: StreamChatGenerics['channelType'];
              commandType: StreamChatGenerics['commandType'];
              eventType: StreamChatGenerics['eventType'];
              messageType: {};
              reactionType: StreamChatGenerics['reactionType'];
              userType: StreamChatGenerics['userType'];
            }>[Key]
          >;
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

export type UserFilters<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = QueryFilters<
  ContainsOperator<StreamChatGenerics['userType']> & {
    id?:
      | RequireOnlyOne<
          { $autocomplete?: UserResponse<StreamChatGenerics>['id'] } & QueryFilter<
            UserResponse<StreamChatGenerics>['id']
          >
        >
      | PrimitiveFilter<UserResponse<StreamChatGenerics>['id']>;
    name?:
      | RequireOnlyOne<
          { $autocomplete?: UserResponse<StreamChatGenerics>['name'] } & QueryFilter<
            UserResponse<StreamChatGenerics>['name']
          >
        >
      | PrimitiveFilter<UserResponse<StreamChatGenerics>['name']>;
    teams?:
      | RequireOnlyOne<{
          $contains?: PrimitiveFilter<string>;
          $eq?: PrimitiveFilter<UserResponse<StreamChatGenerics>['teams']>;
        }>
      | PrimitiveFilter<UserResponse<StreamChatGenerics>['teams']>;
    username?:
      | RequireOnlyOne<
          { $autocomplete?: UserResponse<StreamChatGenerics>['username'] } & QueryFilter<
            UserResponse<StreamChatGenerics>['username']
          >
        >
      | PrimitiveFilter<UserResponse<StreamChatGenerics>['username']>;
  } & {
      [Key in keyof Omit<
        UserResponse<{
          attachmentType: StreamChatGenerics['attachmentType'];
          channelType: StreamChatGenerics['channelType'];
          commandType: StreamChatGenerics['commandType'];
          eventType: StreamChatGenerics['eventType'];
          messageType: StreamChatGenerics['messageType'];
          reactionType: StreamChatGenerics['reactionType'];
          userType: {};
        }>,
        'id' | 'name' | 'teams' | 'username'
      >]?:
        | RequireOnlyOne<
            QueryFilter<
              UserResponse<{
                attachmentType: StreamChatGenerics['attachmentType'];
                channelType: StreamChatGenerics['channelType'];
                commandType: StreamChatGenerics['commandType'];
                eventType: StreamChatGenerics['eventType'];
                messageType: StreamChatGenerics['messageType'];
                reactionType: StreamChatGenerics['reactionType'];
                userType: {};
              }>[Key]
            >
          >
        | PrimitiveFilter<
            UserResponse<{
              attachmentType: StreamChatGenerics['attachmentType'];
              channelType: StreamChatGenerics['channelType'];
              commandType: StreamChatGenerics['commandType'];
              eventType: StreamChatGenerics['eventType'];
              messageType: StreamChatGenerics['messageType'];
              reactionType: StreamChatGenerics['reactionType'];
              userType: {};
            }>[Key]
          >;
    }
>;

/**
 * Sort Types
 */

export type BannedUsersSort = BannedUsersSortBase | Array<BannedUsersSortBase>;

export type BannedUsersSortBase = { created_at?: AscDesc };

export type ChannelSort<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> =
  | ChannelSortBase<StreamChatGenerics>
  | Array<ChannelSortBase<StreamChatGenerics>>;

export type ChannelSortBase<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = Sort<
  StreamChatGenerics['channelType']
> & {
  created_at?: AscDesc;
  has_unread?: AscDesc;
  last_message_at?: AscDesc;
  last_updated?: AscDesc;
  member_count?: AscDesc;
  unread_count?: AscDesc;
  updated_at?: AscDesc;
};

export type PinnedMessagesSort = PinnedMessagesSortBase | Array<PinnedMessagesSortBase>;
export type PinnedMessagesSortBase = { pinned_at?: AscDesc };

export type Sort<T> = {
  [P in keyof T]?: AscDesc;
};

export type UserSort<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> =
  | Sort<UserResponse<StreamChatGenerics>>
  | Array<Sort<UserResponse<StreamChatGenerics>>>;

export type MemberSort<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> =
  | Sort<Pick<UserResponse<StreamChatGenerics>, 'id' | 'created_at' | 'name'>>
  | Array<Sort<Pick<UserResponse<StreamChatGenerics>, 'id' | 'created_at' | 'name'>>>;

export type SearchMessageSortBase<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = Sort<
  StreamChatGenerics['messageType']
> & {
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

export type SearchMessageSort<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> =
  | SearchMessageSortBase<StreamChatGenerics>
  | Array<SearchMessageSortBase<StreamChatGenerics>>;

export type QuerySort<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> =
  | BannedUsersSort
  | ChannelSort<StreamChatGenerics>
  | SearchMessageSort<StreamChatGenerics>
  | UserSort<StreamChatGenerics>;

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
  auth_key?: string;
  auth_type?: string;
  bundle_id?: string;
  development?: boolean;
  enabled?: boolean;
  host?: string;
  key_id?: string;
  notification_template?: string;
  p12_cert?: string;
  team_id?: string;
};

export type AgoraOptions = {
  app_certificate: string;
  app_id: string;
  role_map?: Record<string, string>;
};

export type HMSOptions = {
  app_access_key: string;
  app_secret: string;
  default_role: string;
  default_room_template: string;
  default_region?: string;
  role_map?: Record<string, string>;
};

export type AsyncModerationOptions = {
  callback?: {
    mode?: 'CALLBACK_MODE_NONE' | 'CALLBACK_MODE_REST' | 'CALLBACK_MODE_TWIRP';
    server_url?: string;
  };
  timeout_ms?: number;
};

export type AppSettings = {
  agora_options?: AgoraOptions | null;
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
  async_moderation_config?: AsyncModerationOptions;
  async_url_enrich_enabled?: boolean;
  auto_translation_enabled?: boolean;
  before_message_send_hook_url?: string;
  cdn_expiration_seconds?: number;
  custom_action_handler_url?: string;
  disable_auth_checks?: boolean;
  disable_permissions_checks?: boolean;
  enforce_unique_usernames?: 'no' | 'app' | 'team';
  // all possible file mime types are https://www.iana.org/assignments/media-types/media-types.xhtml
  file_upload_config?: FileUploadConfig;
  firebase_config?: {
    apn_template?: string;
    credentials_json?: string;
    data_template?: string;
    notification_template?: string;
    server_key?: string;
  };
  grants?: Record<string, string[]>;
  hms_options?: HMSOptions | null;
  huawei_config?: {
    id: string;
    secret: string;
  };
  image_moderation_enabled?: boolean;
  image_upload_config?: FileUploadConfig;
  migrate_permissions_to_v2?: boolean;
  multi_tenant_enabled?: boolean;
  permission_version?: 'v1' | 'v2';
  push_config?: {
    offline_only?: boolean;
    version?: string;
  };
  reminders_interval?: number;
  revoke_tokens_issued_before?: string | null;
  sqs_key?: string;
  sqs_secret?: string;
  sqs_url?: string;
  video_provider?: string;
  webhook_events?: Array<string> | null;
  webhook_url?: string;
  xiaomi_config?: {
    package_name: string;
    secret: string;
  };
};

export type Attachment<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> = StreamChatGenerics['attachmentType'] & {
  actions?: Action[];
  asset_url?: string;
  author_icon?: string;
  author_link?: string;
  author_name?: string;
  color?: string;
  fallback?: string;
  fields?: Field[];
  file_size?: number | string;
  footer?: string;
  footer_icon?: string;
  giphy?: GiphyData;
  image_url?: string;
  mime_type?: string;
  og_scrape_url?: string;
  original_height?: number;
  original_width?: number;
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

export type ChannelConfig<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = ChannelConfigFields &
  CreatedAtUpdatedAt & {
    commands?: CommandVariants<StreamChatGenerics>[];
  };

export type ChannelConfigAutomod = '' | 'AI' | 'disabled' | 'simple';

export type ChannelConfigAutomodBehavior = '' | 'block' | 'flag';

export type ChannelConfigAutomodThresholds = null | {
  explicit?: { block?: number; flag?: number };
  spam?: { block?: number; flag?: number };
  toxic?: { block?: number; flag?: number };
};

export type ChannelConfigFields = {
  reminders: boolean;
  automod?: ChannelConfigAutomod;
  automod_behavior?: ChannelConfigAutomodBehavior;
  automod_thresholds?: ChannelConfigAutomodThresholds;
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

export type ChannelConfigWithInfo<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> = ChannelConfigFields &
  CreatedAtUpdatedAt & {
    commands?: CommandResponse<StreamChatGenerics>[];
  };

export type ChannelData<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> = StreamChatGenerics['channelType'] & {
  members?: string[];
  name?: string;
};

export type ChannelMembership<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  banned?: boolean;
  channel_role?: Role;
  created_at?: string;
  is_moderator?: boolean;
  role?: string;
  shadow_banned?: boolean;
  updated_at?: string;
  user?: UserResponse<StreamChatGenerics>;
};

export type ChannelMute<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  user: UserResponse<StreamChatGenerics>;
  channel?: ChannelResponse<StreamChatGenerics>;
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

export type CheckPushInput<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  apn_template?: string;
  client_id?: string;
  connection_id?: string;
  firebase_data_template?: string;
  firebase_template?: string;
  message_id?: string;
  user?: UserResponse<StreamChatGenerics>;
  user_id?: string;
};

export type PushProvider = 'apn' | 'firebase' | 'huawei' | 'xiaomi';

export type PushProviderConfig = PushProviderCommon &
  PushProviderID &
  PushProviderAPN &
  PushProviderFirebase &
  PushProviderHuawei &
  PushProviderXiaomi;

export type PushProviderID = {
  name: string;
  type: PushProvider;
};

export type PushProviderCommon = {
  created_at: string;
  updated_at: string;
  description?: string;
  disabled_at?: string;
  disabled_reason?: string;
};

export type PushProviderAPN = {
  apn_auth_key?: string;
  apn_auth_type?: 'token' | 'certificate';
  apn_development?: boolean;
  apn_host?: string;
  apn_key_id?: string;
  apn_notification_template?: string;
  apn_p12_cert?: string;
  apn_team_id?: string;
  apn_topic?: string;
};

export type PushProviderFirebase = {
  firebase_apn_template?: string;
  firebase_credentials?: string;
  firebase_data_template?: string;
  firebase_notification_template?: string;
  firebase_server_key?: string;
};

export type PushProviderHuawei = {
  huawei_app_id?: string;
  huawei_app_secret?: string;
};

export type PushProviderXiaomi = {
  xiaomi_package_name?: string;
  xiaomi_secret?: string;
};

export type CommandVariants<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> =
  | 'all'
  | 'ban'
  | 'fun_set'
  | 'giphy'
  | 'moderation_set'
  | 'mute'
  | 'unban'
  | 'unmute'
  | StreamChatGenerics['commandType'];

export type Configs<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = Record<
  string,
  ChannelConfigWithInfo<StreamChatGenerics> | undefined
>;

export type ConnectionOpen<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  connection_id: string;
  cid?: string;
  created_at?: string;
  me?: OwnUserResponse<StreamChatGenerics>;
  type?: string;
};

export type CreatedAtUpdatedAt = {
  created_at: string;
  updated_at: string;
};

export type Device<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = DeviceFields & {
  provider?: string;
  user?: UserResponse<StreamChatGenerics>;
  user_id?: string;
};

export type BaseDeviceFields = {
  id: string;
  push_provider: PushProvider;
  push_provider_name?: string;
};

export type DeviceFields = BaseDeviceFields & {
  created_at: string;
  disabled?: boolean;
  disabled_reason?: string;
};

export type EndpointName =
  | 'Connect'
  | 'LongPoll'
  | 'DeleteFile'
  | 'DeleteImage'
  | 'DeleteMessage'
  | 'DeleteUser'
  | 'DeleteUsers'
  | 'DeactivateUser'
  | 'ExportUser'
  | 'DeleteReaction'
  | 'UpdateChannel'
  | 'UpdateChannelPartial'
  | 'UpdateMessage'
  | 'UpdateMessagePartial'
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
  | 'QueryFlags'
  | 'QueryMessageFlags'
  | 'GetReactions'
  | 'GetReplies'
  | 'GetPinnedMessages'
  | 'Ban'
  | 'Unban'
  | 'MuteUser'
  | 'MuteChannel'
  | 'UnmuteChannel'
  | 'UnmuteUser'
  | 'RunMessageAction'
  | 'SendEvent'
  | 'SendUserCustomEvent'
  | 'MarkRead'
  | 'MarkChannelsRead'
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
  | 'Unblock'
  | 'QueryFlagReports'
  | 'FlagReportReview'
  | 'CreateChannelType'
  | 'DeleteChannel'
  | 'DeleteChannels'
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
  | 'ListCustomRoles'
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
  | 'CreateSegment'
  | 'GetSegment'
  | 'QuerySegments'
  | 'UpdateSegment'
  | 'DeleteSegment'
  | 'CreateCampaign'
  | 'GetCampaign'
  | 'ListCampaigns'
  | 'UpdateCampaign'
  | 'DeleteCampaign'
  | 'ScheduleCampaign'
  | 'StopCampaign'
  | 'ResumeCampaign'
  | 'TestCampaign'
  | 'GetOG'
  | 'GetTask'
  | 'ExportUsers'
  | 'CreateImport'
  | 'CreateImportURL'
  | 'GetImport'
  | 'ListImports'
  | 'UpsertPushProvider'
  | 'DeletePushProvider'
  | 'ListPushProviders';

export type ExportChannelRequest = {
  id: string;
  type: string;
  cid?: string;
  messages_since?: Date;
  messages_until?: Date;
};

export type ExportChannelOptions = {
  clear_deleted_message_text?: boolean;
  export_users?: boolean;
  include_truncated_messages?: boolean;
  version?: string;
};

export type ExportUsersRequest = {
  user_ids: string[];
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
  apn_template?: string;
  credentials_json?: string;
  data_template?: string;
  enabled?: boolean;
  notification_template?: string;
  server_key?: string;
};

type GiphyVersionInfo = {
  height: string;
  url: string;
  width: string;
};

type GiphyVersions =
  | 'original'
  | 'fixed_height'
  | 'fixed_height_still'
  | 'fixed_height_downsampled'
  | 'fixed_width'
  | 'fixed_width_still'
  | 'fixed_width_downsampled';

type GiphyData = {
  [key in GiphyVersions]: GiphyVersionInfo;
};

export type HuaweiConfig = {
  enabled?: boolean;
  id?: string;
  secret?: string;
};

export type XiaomiConfig = {
  enabled?: boolean;
  package_name?: string;
  secret?: string;
};

export type LiteralStringForUnion = string & {};

export type LogLevel = 'info' | 'error' | 'warn';

export type Logger = (logLevel: LogLevel, message: string, extraData?: Record<string, unknown>) => void;

export type Message<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = Partial<
  MessageBase<StreamChatGenerics>
> & {
  mentioned_users?: string[];
};

export type MessageBase<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> = StreamChatGenerics['messageType'] & {
  id: string;
  attachments?: Attachment<StreamChatGenerics>[];
  html?: string;
  mml?: string;
  parent_id?: string;
  pin_expires?: string | null;
  pinned?: boolean;
  pinned_at?: string | null;
  quoted_message_id?: string;
  show_in_channel?: boolean;
  text?: string;
  user?: UserResponse<StreamChatGenerics> | null;
  user_id?: string;
};

export type MessageLabel = 'deleted' | 'ephemeral' | 'error' | 'regular' | 'reply' | 'system';

export type Mute<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  created_at: string;
  target: UserResponse<StreamChatGenerics>;
  updated_at: string;
  user: UserResponse<StreamChatGenerics>;
};

export type PartialUpdateChannel<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  set?: Partial<ChannelResponse<StreamChatGenerics>>;
  unset?: Array<keyof ChannelResponse<StreamChatGenerics>>;
};

export type PartialUserUpdate<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  id: string;
  set?: Partial<UserResponse<StreamChatGenerics>>;
  unset?: Array<keyof UserResponse<StreamChatGenerics>>;
};

export type MessageUpdatableFields<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = Omit<
  MessageResponse<StreamChatGenerics>,
  'cid' | 'created_at' | 'updated_at' | 'deleted_at' | 'user' | 'user_id'
>;

export type PartialMessageUpdate<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  set?: Partial<MessageUpdatableFields<StreamChatGenerics>>;
  unset?: Array<keyof MessageUpdatableFields<StreamChatGenerics>>;
};

export type PendingMessageResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  message: MessageResponse<StreamChatGenerics>;
  pending_message_metadata?: Record<string, string>;
};

export type PermissionAPIObject = {
  action?: string;
  condition?: object;
  custom?: boolean;
  description?: string;
  id?: string;
  level?: string;
  name?: string;
  owner?: boolean;
  same_team?: boolean;
  tags?: string[];
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
  roles?: string[] | null;
  updated_at?: string;
};

export type RateLimitsInfo = {
  limit: number;
  remaining: number;
  reset: number;
};

export type RateLimitsMap = Record<EndpointName, RateLimitsInfo>;

export type Reaction<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> = StreamChatGenerics['reactionType'] & {
  type: string;
  message_id?: string;
  score?: number;
  user?: UserResponse<StreamChatGenerics> | null;
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

export type SearchPayload<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = Omit<
  SearchOptions<StreamChatGenerics>,
  'sort'
> & {
  client_id?: string;
  connection_id?: string;
  filter_conditions?: ChannelFilters<StreamChatGenerics>;
  message_filter_conditions?: MessageFilters<StreamChatGenerics>;
  query?: string;
  sort?: Array<{
    direction: AscDesc;
    field: keyof SearchMessageSortBase<StreamChatGenerics>;
  }>;
};

export type TestPushDataInput = {
  apnTemplate?: string;
  firebaseDataTemplate?: string;
  firebaseTemplate?: string;
  messageID?: string;
  pushProviderName?: string;
  pushProviderType?: PushProvider;
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

export type UpdatedMessage<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = Omit<
  MessageResponse<StreamChatGenerics>,
  'mentioned_users'
> & { mentioned_users?: string[] };

export type User<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = StreamChatGenerics['userType'] & {
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
  filter: {};
  name: string;
  type: 'channel' | 'user';
};

export type Segment = {
  created_at: string;
  id: string;
  in_use: boolean;
  size: number;
  status: 'computing' | 'ready';
  updated_at: string;
} & SegmentData;

export type CampaignSortField = {
  field: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  value: any;
};

export type CampaignSort = {
  fields: CampaignSortField[];
  direction?: 'asc' | 'desc';
};

export type CampaignQueryOptions = {
  limit?: number;
  sort?: CampaignSort;
};

export type SegmentQueryOptions = CampaignQueryOptions;
export type RecipientQueryOptions = CampaignQueryOptions;

// TODO: add better typing
export type SegmentFilters = {};
export type CampaignFilters = {};
export type RecipientFilters = {};

export type CampaignData = {
  attachments: Attachment[];
  channel_type: string;
  defaults: Record<string, string>;
  name: string;
  segment_id: string;
  text: string;
  description?: string;
  sender_id?: string;
};

export type CampaignStatusName = 'draft' | 'stopped' | 'scheduled' | 'completed' | 'failed' | 'in_progress';

export type CampaignStatus = {
  status: CampaignStatusName;
  completed_at?: string;
  errored_messages?: number;
  failed_at?: string;
  resumed_at?: string;
  scheduled_at?: string;
  scheduled_for?: string;
  sent_messages?: number;
  stopped_at?: string;
  task_id?: string;
};

export type Campaign = {
  created_at: string;
  id: string;
  updated_at: string;
} & CampaignData &
  CampaignStatus;

export type TestCampaignResponse = {
  status: CampaignStatusName;
  details?: string;
  results?: Record<string, string>;
};

export type DeleteCampaignOptions = {
  recipients?: boolean;
};

export type Recipient = {
  campaign_id: string;
  channel_cid: string;
  created_at: string;
  status: 'pending' | 'sent' | 'failed';
  updated_at: string;
  details?: string;
  message_id?: string;
  receiver_id?: string;
};

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

export type TruncateOptions<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  hard_delete?: boolean;
  message?: Message<StreamChatGenerics>;
  skip_push?: boolean;
  truncated_at?: Date;
  user?: UserResponse<StreamChatGenerics>;
  user_id?: string;
};

export type CreateImportURLResponse = {
  path: string;
  upload_url: string;
};

export type CreateImportResponse = {
  import_task: ImportTask;
};

export type GetImportResponse = {
  import_task: ImportTask;
};

export type CreateImportOptions = {
  mode: 'insert' | 'upsert';
};

export type ListImportsPaginationOptions = {
  limit?: number;
  offset?: number;
};

export type ListImportsResponse = {
  import_tasks: ImportTask[];
};

export type ImportTaskHistory = {
  created_at: string;
  next_state: string;
  prev_state: string;
};

export type ImportTask = {
  created_at: string;
  history: ImportTaskHistory[];
  id: string;
  path: string;
  state: string;
  updated_at: string;
  result?: UR;
  size?: number;
};

export type MessageSetType = 'latest' | 'current' | 'new';

export type PushProviderUpsertResponse = {
  push_provider: PushProvider;
};

export type PushProviderListResponse = {
  push_providers: PushProvider[];
};

export type CreateCallOptions<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  id: string;
  type: string;
  options?: UR;
  user?: UserResponse<StreamChatGenerics> | null;
  user_id?: string;
};

export type HMSCall = {
  room: string;
};

export type AgoraCall = {
  channel: string;
};

export type Call = {
  id: string;
  provider: string;
  agora?: AgoraCall;
  hms?: HMSCall;
};

export type CreateCallResponse = APIResponse & {
  call: Call;
  token: string;
  agora_app_id?: string;
  agora_uid?: number;
};

export type GetCallTokenResponse = APIResponse & {
  token: string;
  agora_app_id?: string;
  agora_uid?: number;
};

type ErrorResponseDetails = {
  code: number;
  messages: string[];
};

export type APIErrorResponse = {
  code: number;
  duration: string;
  message: string;
  more_info: string;
  StatusCode: number;
  details?: ErrorResponseDetails;
};

export class ErrorFromResponse<T> extends Error {
  code?: number;
  response?: AxiosResponse<T>;
  status?: number;
}
