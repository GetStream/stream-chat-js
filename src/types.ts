import { AxiosRequestConfig, AxiosResponse } from 'axios';
import { StableWSConnection } from './connection';
import { EVENT_MAP } from './events';
import { Role } from './permissions';
import type { Channel } from './channel';

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

export type PartializeKeys<T, K extends keyof T> = Partial<Pick<T, K>> & Omit<T, K>;

/* Unknown Record */
export type UR = Record<string, unknown>;
export type UnknownType = UR; //alias to avoid breaking change

export type DefaultGenerics = {
  attachmentType: UR;
  channelType: UR;
  commandType: LiteralStringForUnion;
  eventType: UR;
  memberType: UR;
  messageType: UR;
  pollOptionType: UR;
  pollType: UR;
  reactionType: UR;
  userType: UR;
};

export type ExtendableGenerics = {
  attachmentType: UR;
  channelType: UR;
  commandType: string;
  eventType: UR;
  memberType: UR;
  messageType: UR;
  pollOptionType: UR;
  pollType: UR;
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

export type TranslateResponse = {
  language: string;
  translated_text: string;
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
        mark_messages_pending?: boolean;
        max_message_length?: number;
        message_retention?: string;
        mutes?: boolean;
        name?: string;
        polls?: boolean;
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
    datadog_info?: {
      api_key: string;
      site: string;
      enabled?: boolean;
    };
    disable_auth_checks?: boolean;
    disable_permissions_checks?: boolean;
    enforce_unique_usernames?: 'no' | 'app' | 'team';
    file_upload_config?: FileUploadConfig;
    geofences?: Array<{
      country_codes: Array<string>;
      description: string;
      name: string;
      type: string;
    }>;
    grants?: Record<string, string[]>;
    hms_options?: HMSOptions | null;
    image_moderation_enabled?: boolean;
    image_upload_config?: FileUploadConfig;
    multi_tenant_enabled?: boolean;
    name?: string;
    organization?: string;
    permission_version?: string;
    policies?: Record<string, Policy[]>;
    poll_enabled?: boolean;
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
    sns_key?: string;
    sns_secret?: string;
    sns_topic_arn?: string;
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
  type?: string;
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

export type QueryReactionsOptions = Pager;

export type QueryReactionsAPIResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  reactions: ReactionResponse<StreamChatGenerics>[];
  next?: string;
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
  membership?: ChannelMemberResponse<StreamChatGenerics> | null;
  pending_messages?: PendingMessageResponse<StreamChatGenerics>[];
  push_preferences?: PushPreference;
  read?: ReadResponse<StreamChatGenerics>[];
  threads?: ThreadResponse[];
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

export type ChannelMemberUpdates<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> = StreamChatGenerics['memberType'] & {
  archived?: boolean;
  channel_role?: Role;
  pinned?: boolean;
};

export type ChannelMemberResponse<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> = StreamChatGenerics['memberType'] & {
  archived_at?: string | null;
  ban_expires?: string;
  banned?: boolean;
  channel_role?: Role;
  created_at?: string;
  invite_accepted_at?: string;
  invite_rejected_at?: string;
  invited?: boolean;
  is_moderator?: boolean;
  notifications_muted?: boolean;
  pinned_at?: string | null;
  role?: string;
  shadow_banned?: boolean;
  status?: InviteStatus;
  updated_at?: string;
  user?: UserResponse<StreamChatGenerics>;
  user_id?: string;
};

export type PartialUpdateMemberAPIResponse<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> = APIResponse & {
  channel_member: ChannelMemberResponse<StreamChatGenerics>;
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

export type CheckSNSResponse = APIResponse & {
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
  review_queue_item_id?: string;
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
  review_queue_item_id?: string;
};

export type FormatMessageResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = Omit<
  MessageResponse<{
    attachmentType: StreamChatGenerics['attachmentType'];
    channelType: StreamChatGenerics['channelType'];
    commandType: StreamChatGenerics['commandType'];
    eventType: StreamChatGenerics['eventType'];
    memberType: StreamChatGenerics['memberType'];
    messageType: {};
    pollOptionType: StreamChatGenerics['pollOptionType'];
    pollType: StreamChatGenerics['pollType'];
    reactionType: StreamChatGenerics['reactionType'];
    userType: StreamChatGenerics['userType'];
  }>,
  'created_at' | 'pinned_at' | 'updated_at' | 'deleted_at' | 'status'
> &
  StreamChatGenerics['messageType'] & {
    created_at: Date;
    deleted_at: Date | null;
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

// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface ThreadResponseCustomData {}

export interface ThreadResponse<SCG extends ExtendableGenerics = DefaultGenerics> extends ThreadResponseCustomData {
  // FIXME: according to OpenAPI, `channel` could be undefined but since cid is provided I'll asume that it's wrong
  channel: ChannelResponse<SCG>;
  channel_cid: string;
  created_at: string;
  created_by_user_id: string;
  latest_replies: Array<MessageResponse<SCG>>;
  parent_message: MessageResponse<SCG>;
  parent_message_id: string;
  title: string;
  updated_at: string;
  active_participant_count?: number;
  created_by?: UserResponse<SCG>;
  deleted_at?: string;
  last_message_at?: string;
  participant_count?: number;
  read?: Array<ReadResponse<SCG>>;
  reply_count?: number;
  thread_participants?: Array<{
    channel_cid: string;
    created_at: string;
    last_read_at: string;
    last_thread_message_at?: string;
    left_thread_at?: string;
    thread_id?: string;
    user?: UserResponse<SCG>;
    user_id?: string;
  }>;
  // TODO: when moving to API v2 we should do this instead
  // custom: ThreadResponseCustomData;
}

// TODO: Figure out a way to strongly type set and unset.
export type PartialThreadUpdate = {
  set?: Partial<Record<string, unknown>>;
  unset?: Array<string>;
};

export type QueryThreadsOptions = {
  filter?: ThreadFilters;
  limit?: number;
  member_limit?: number;
  next?: string;
  participant_limit?: number;
  reply_limit?: number;
  sort?: ThreadSort;
  watch?: boolean;
};

export type QueryThreadsAPIResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  threads: ThreadResponse<StreamChatGenerics>[];
  next?: string;
};

export type GetThreadOptions = {
  member_limit?: number;
  participant_limit?: number;
  reply_limit?: number;
  watch?: boolean;
};

export type GetThreadAPIResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  thread: ThreadResponse<StreamChatGenerics>;
};

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

export type GetUnreadCountAPIResponse = APIResponse & {
  channel_type: {
    channel_count: number;
    channel_type: string;
    unread_count: number;
  }[];
  channels: {
    channel_id: string;
    last_read: string;
    unread_count: number;
  }[];
  threads: {
    last_read: string;
    last_read_message_id: string;
    parent_message_id: string;
    unread_count: number;
  }[];
  total_unread_count: number;
  total_unread_threads_count: number;
};

export type ChatLevelPushPreference = 'all' | 'none' | 'mentions' | (string & {});

export type PushPreference = {
  callLevel?: 'all' | 'none' | (string & {});
  chatLevel?: ChatLevelPushPreference;
  disabledUntil?: string; // snooze till this time
  removeDisable?: boolean; // Temporary flag for resetting disabledUntil
};

export type ChannelPushPreference = {
  chatLevel?: ChatLevelPushPreference; // "all", "none", "mentions", or other custom strings
  disabledUntil?: string;
  removeDisable?: boolean; // Temporary flag for resetting disabledUntil
};

export type UpsertPushPreferencesResponse = APIResponse & {
  // Mapping of user IDs to their push preferences
  userChannelPreferences: Record<string, Record<string, ChannelPushPreference>>;
  userPreferences: Record<string, PushPreference>; // Mapping of user -> channel id -> push preferences
};

export type GetUnreadCountBatchAPIResponse = APIResponse & {
  counts_by_user: { [userId: string]: GetUnreadCountAPIResponse };
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
  before_message_send_failed?: boolean;
  channel?: ChannelResponse<StreamChatGenerics>;
  cid?: string;
  command?: string;
  command_info?: { name?: string };
  created_at?: string;
  deleted_at?: string;
  deleted_reply_count?: number;
  i18n?: RequireAtLeastOne<Record<`${TranslationLanguages}_text`, string>> & {
    language: TranslationLanguages;
  };
  latest_reactions?: ReactionResponse<StreamChatGenerics>[];
  mentioned_users?: UserResponse<StreamChatGenerics>[];
  message_text_updated_at?: string;
  moderation?: ModerationResponse; // present only with Moderation v2
  moderation_details?: ModerationDetailsResponse; // present only with Moderation v1
  own_reactions?: ReactionResponse<StreamChatGenerics>[] | null;
  pin_expires?: string | null;
  pinned_at?: string | null;
  pinned_by?: UserResponse<StreamChatGenerics> | null;
  poll?: PollResponse<StreamChatGenerics>;
  reaction_counts?: { [key: string]: number } | null;
  reaction_groups?: { [key: string]: ReactionGroupResponse } | null;
  reaction_scores?: { [key: string]: number } | null;
  reply_count?: number;
  shadowed?: boolean;
  status?: string;
  thread_participants?: UserResponse<StreamChatGenerics>[];
  updated_at?: string;
};

export type ReactionGroupResponse = {
  count: number;
  sum_scores: number;
  first_reaction_at?: string;
  last_reaction_at?: string;
};

export type ModerationDetailsResponse = {
  action: 'MESSAGE_RESPONSE_ACTION_BOUNCE' | (string & {});
  error_msg: string;
  harms: ModerationHarmResponse[];
  original_text: string;
};

export type ModerationHarmResponse = {
  name: string;
  phrase_list_ids: number[];
};

export type ModerationAction = 'bounce' | 'flag' | 'remove' | 'shadow';

export type ModerationResponse = {
  action: ModerationAction;
  original_text: string;
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

export type BlockUserAPIResponse = APIResponse & {
  blocked_at: string;
  blocked_by_user_id: string;
  blocked_user_id: string;
};

export type GetBlockedUsersAPIResponse = APIResponse & {
  blocks: BlockedUserDetails[];
};
export type BlockedUserDetails = APIResponse & {
  blocked_user: UserResponse;
  blocked_user_id: string;
  created_at: string;
  user: UserResponse;
  user_id: string;
};

export type OwnUserBase<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  channel_mutes: ChannelMute<StreamChatGenerics>[];
  devices: Device<StreamChatGenerics>[];
  mutes: Mute<StreamChatGenerics>[];
  total_unread_count: number;
  unread_channels: number;
  unread_count: number;
  unread_threads: number;
  invisible?: boolean;
  privacy_settings?: PrivacySettings;
  push_preferences?: PushPreference;
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
  blocked_user_ids?: string[];
  created_at?: string;
  deactivated_at?: string;
  deleted_at?: string;
  language?: TranslationLanguages | '';
  last_active?: string;
  online?: boolean;
  privacy_settings?: PrivacySettings;
  push_notifications?: PushNotificationSettings;
  revoke_tokens_issued_before?: string;
  shadow_banned?: boolean;
  teams_role?: TeamsRole;
  updated_at?: string;
};

export type TeamsRole = { [team: string]: string };

export type PrivacySettings = {
  read_receipts?: {
    enabled?: boolean;
  };
  typing_indicators?: {
    enabled?: boolean;
  };
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

export type BannedUsersPaginationOptions = Omit<PaginationOptions, 'id_gt' | 'id_gte' | 'id_lt' | 'id_lte'> & {
  exclude_expired_bans?: boolean;
};

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
  mark_messages_pending?: boolean;
  max_message_length?: number;
  message_retention?: string;
  mutes?: boolean;
  name?: string;
  permissions?: PermissionObject[];
  polls?: boolean;
  push_notifications?: boolean;
  quotes?: boolean;
  reactions?: boolean;
  read_events?: boolean;
  reminders?: boolean;
  replies?: boolean;
  search?: boolean;
  skip_last_msg_update_for_system_msgs?: boolean;
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

export type NewMemberPayload<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> = StreamChatGenerics['memberType'] & Pick<ChannelMemberResponse<StreamChatGenerics>, 'user_id' | 'channel_role'>;

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
  thread_id?: string;
  user?: UserResponse<StreamChatGenerics>;
  user_id?: string;
};

export type MarkUnreadOptions<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  client_id?: string;
  connection_id?: string;
  message_id?: string;
  thread_id?: string;
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
  offset?: number; // should be avoided with channel.query()
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
  // Pagination option: select members created after the date (RFC399)
  created_at_after?: string;
  // Pagination option: select members created after or equal the date (RFC399)
  created_at_after_or_equal?: string;
  // Pagination option: select members created before the date (RFC399)
  created_at_before?: string;
  // Pagination option: select members created before or equal the date (RFC399)
  created_at_before_or_equal?: string;
  // Number of members to return, default 100
  limit?: number;
  // Offset (max is 1000)
  offset?: number;
  // 	Pagination option: excludes members with ID less or equal the value
  user_id_gt?: string;
  // Pagination option: excludes members with ID less than the value
  user_id_gte?: string;
  // Pagination option: excludes members with ID greater or equal the value
  user_id_lt?: string;
  // 	Pagination option: excludes members with ID greater than the value
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
  /**
   * Disables the hydration of all caches within the JS Client. This includes this.activeChannels,
   * this.polls.pollCache and this.config.
   * It is mainly meant to be used for integrations where stream-chat is used as a server-side service
   * interacting with Stream's REST API, not depending on any state and purely serving as a wrapper
   * around HTTP requests. Using this property on either the client side or a backend implementation
   * that also relies on WS events will break these functionalities, so please use carefully.
   */
  disableCache?: boolean;
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
  /**
   * Set the instance of StableWSConnection on chat client. Its purely for testing purpose and should
   * not be used in production apps.
   */
  wsConnection?: StableWSConnection;
  /**
   * Sets a suffix to the wsUrl when it is being built in `wsConnection`. Is meant to be
   * used purely in testing suites and should not be used in production apps.
   */
  wsUrlParams?: URLSearchParams;
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
  include_deactivated_users?: boolean;
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
  ai_message?: string;
  ai_state?: AIState;
  channel?: ChannelResponse<StreamChatGenerics>;
  channel_id?: string;
  channel_type?: string;
  cid?: string;
  clear_history?: boolean;
  connection_id?: string;
  // event creation timestamp, format Date ISO string
  created_at?: string;
  draft?: DraftResponse<StreamChatGenerics>;
  // id of the message that was marked as unread - all the following messages are considered unread. (notification.mark_unread)
  first_unread_message_id?: string;
  hard_delete?: boolean;
  // creation date of a message with last_read_message_id, formatted as Date ISO string
  last_read_at?: string;
  last_read_message_id?: string;
  mark_messages_deleted?: boolean;
  me?: OwnUserResponse<StreamChatGenerics>;
  member?: ChannelMemberResponse<StreamChatGenerics>;
  message?: MessageResponse<StreamChatGenerics>;
  message_id?: string;
  mode?: string;
  online?: boolean;
  parent_id?: string;
  poll?: PollResponse<StreamChatGenerics>;
  poll_vote?: PollVote<StreamChatGenerics> | PollAnswer<StreamChatGenerics>;
  queriedChannels?: {
    channels: ChannelAPIResponse<StreamChatGenerics>[];
    isLatestMessageSet?: boolean;
  };
  reaction?: ReactionResponse<StreamChatGenerics>;
  received_at?: string | Date;
  team?: string;
  thread?: ThreadResponse<StreamChatGenerics>;
  // @deprecated number of all unread messages across all current user's unread channels, equals unread_count
  total_unread_count?: number;
  // number of all current user's channels with at least one unread message including the channel in this event
  unread_channels?: number;
  // number of all unread messages across all current user's unread channels
  unread_count?: number;
  // number of unread messages in the channel from this event (notification.mark_unread)
  unread_messages?: number;
  unread_thread_messages?: number;
  unread_threads?: number;
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

export type ReactionFilters<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = QueryFilters<
  {
    user_id?:
      | RequireOnlyOne<Pick<QueryFilter<ReactionResponse<StreamChatGenerics>['user_id']>, '$eq' | '$in'>>
      | PrimitiveFilter<ReactionResponse<StreamChatGenerics>['user_id']>;
  } & {
    type?:
      | RequireOnlyOne<Pick<QueryFilter<ReactionResponse<StreamChatGenerics>['type']>, '$eq'>>
      | PrimitiveFilter<ReactionResponse<StreamChatGenerics>['type']>;
  } & {
    created_at?:
      | RequireOnlyOne<Pick<QueryFilter<PollResponse['created_at']>, '$eq' | '$gt' | '$lt' | '$gte' | '$lte'>>
      | PrimitiveFilter<PollResponse['created_at']>;
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
          memberType: StreamChatGenerics['memberType'];
          messageType: StreamChatGenerics['messageType'];
          pollOptionType: StreamChatGenerics['pollOptionType'];
          pollType: StreamChatGenerics['pollType'];
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
                memberType: StreamChatGenerics['memberType'];
                messageType: StreamChatGenerics['messageType'];
                pollOptionType: StreamChatGenerics['pollOptionType'];
                pollType: StreamChatGenerics['pollType'];
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
              memberType: StreamChatGenerics['memberType'];
              messageType: StreamChatGenerics['messageType'];
              pollOptionType: StreamChatGenerics['pollOptionType'];
              pollType: StreamChatGenerics['pollType'];
              reactionType: StreamChatGenerics['reactionType'];
              userType: StreamChatGenerics['userType'];
            }>[Key]
          >;
    } & {
      archived?: boolean;
      pinned?: boolean;
    }
>;

export type DraftFilters<SCG extends ExtendableGenerics = DefaultGenerics> = {
  channel_cid?:
    | RequireOnlyOne<Pick<QueryFilter<DraftResponse<SCG>['channel_cid']>, '$in' | '$eq'>>
    | PrimitiveFilter<DraftResponse<SCG>['channel_cid']>;
  created_at?:
    | RequireOnlyOne<Pick<QueryFilter<DraftResponse<SCG>['created_at']>, '$eq' | '$gt' | '$lt' | '$gte' | '$lte'>>
    | PrimitiveFilter<DraftResponse<SCG>['created_at']>;
  parent_id?:
    | RequireOnlyOne<Pick<QueryFilter<DraftResponse<SCG>['created_at']>, '$in' | '$eq' | '$exists'>>
    | PrimitiveFilter<DraftResponse<SCG>['parent_id']>;
};

export type QueryPollsParams = {
  filter?: QueryPollsFilters;
  options?: QueryPollsOptions;
  sort?: PollSort;
};

export type QueryPollsOptions = Pager;

export type VotesFiltersOptions = {
  is_answer?: boolean;
  option_id?: string;
  user_id?: string;
};

export type QueryVotesOptions = Pager;

export type QueryPollsFilters = QueryFilters<
  {
    id?: RequireOnlyOne<Pick<QueryFilter<PollResponse['id']>, '$eq' | '$in'>> | PrimitiveFilter<PollResponse['id']>;
  } & {
    user_id?:
      | RequireOnlyOne<Pick<QueryFilter<VotesFiltersOptions['user_id']>, '$eq' | '$in'>>
      | PrimitiveFilter<VotesFiltersOptions['user_id']>;
  } & {
    is_closed?:
      | RequireOnlyOne<Pick<QueryFilter<PollResponse['is_closed']>, '$eq'>>
      | PrimitiveFilter<PollResponse['is_closed']>;
  } & {
    max_votes_allowed?:
      | RequireOnlyOne<
          Pick<QueryFilter<PollResponse['max_votes_allowed']>, '$eq' | '$ne' | '$gt' | '$lt' | '$gte' | '$lte'>
        >
      | PrimitiveFilter<PollResponse['max_votes_allowed']>;
  } & {
    allow_answers?:
      | RequireOnlyOne<Pick<QueryFilter<PollResponse['allow_answers']>, '$eq'>>
      | PrimitiveFilter<PollResponse['allow_answers']>;
  } & {
    allow_user_suggested_options?:
      | RequireOnlyOne<Pick<QueryFilter<PollResponse['allow_user_suggested_options']>, '$eq'>>
      | PrimitiveFilter<PollResponse['allow_user_suggested_options']>;
  } & {
    voting_visibility?:
      | RequireOnlyOne<Pick<QueryFilter<PollResponse['voting_visibility']>, '$eq'>>
      | PrimitiveFilter<PollResponse['voting_visibility']>;
  } & {
    created_at?:
      | RequireOnlyOne<Pick<QueryFilter<PollResponse['created_at']>, '$eq' | '$gt' | '$lt' | '$gte' | '$lte'>>
      | PrimitiveFilter<PollResponse['created_at']>;
  } & {
    created_by_id?:
      | RequireOnlyOne<Pick<QueryFilter<PollResponse['created_by_id']>, '$eq' | '$in'>>
      | PrimitiveFilter<PollResponse['created_by_id']>;
  } & {
    updated_at?:
      | RequireOnlyOne<Pick<QueryFilter<PollResponse['updated_at']>, '$eq' | '$gt' | '$lt' | '$gte' | '$lte'>>
      | PrimitiveFilter<PollResponse['updated_at']>;
  } & {
    name?:
      | RequireOnlyOne<Pick<QueryFilter<PollResponse['name']>, '$eq' | '$in'>>
      | PrimitiveFilter<PollResponse['name']>;
  }
>;

export type QueryVotesFilters = QueryFilters<
  {
    id?: RequireOnlyOne<Pick<QueryFilter<PollResponse['id']>, '$eq' | '$in'>> | PrimitiveFilter<PollResponse['id']>;
  } & {
    option_id?:
      | RequireOnlyOne<Pick<QueryFilter<VotesFiltersOptions['option_id']>, '$eq' | '$in'>>
      | PrimitiveFilter<VotesFiltersOptions['option_id']>;
  } & {
    is_answer?:
      | RequireOnlyOne<Pick<QueryFilter<VotesFiltersOptions['is_answer']>, '$eq'>>
      | PrimitiveFilter<VotesFiltersOptions['is_answer']>;
  } & {
    user_id?:
      | RequireOnlyOne<Pick<QueryFilter<VotesFiltersOptions['user_id']>, '$eq' | '$in'>>
      | PrimitiveFilter<VotesFiltersOptions['user_id']>;
  } & {
    created_at?:
      | RequireOnlyOne<Pick<QueryFilter<PollResponse['created_at']>, '$eq' | '$gt' | '$lt' | '$gte' | '$lte'>>
      | PrimitiveFilter<PollResponse['created_at']>;
  } & {
    created_by_id?:
      | RequireOnlyOne<Pick<QueryFilter<PollResponse['created_by_id']>, '$eq' | '$in'>>
      | PrimitiveFilter<PollResponse['created_by_id']>;
  } & {
    updated_at?:
      | RequireOnlyOne<Pick<QueryFilter<PollResponse['updated_at']>, '$eq' | '$gt' | '$lt' | '$gte' | '$lte'>>
      | PrimitiveFilter<PollResponse['updated_at']>;
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
          memberType: StreamChatGenerics['memberType'];
          messageType: {};
          pollOptionType: StreamChatGenerics['pollOptionType'];
          pollType: StreamChatGenerics['pollType'];
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
                memberType: StreamChatGenerics['memberType'];
                messageType: {};
                pollOptionType: StreamChatGenerics['pollOptionType'];
                pollType: StreamChatGenerics['pollType'];
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
              memberType: StreamChatGenerics['memberType'];
              messageType: {};
              pollOptionType: StreamChatGenerics['pollOptionType'];
              pollType: StreamChatGenerics['pollType'];
              reactionType: StreamChatGenerics['reactionType'];
              userType: StreamChatGenerics['userType'];
            }>[Key]
          >;
    }
>;

export type MessageOptions = {
  include_thread_participants?: boolean;
};

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
      /**
       * @deprecated and will be removed in a future release. Filtering shall be applied client-side.
       */
      $ne?: PrimitiveFilter<ObjectType>;
      /**
       * @deprecated and will be removed in a future release. Filtering shall be applied client-side.
       */
      $nin?: PrimitiveFilter<ObjectType>[];
    }
  : {
      $eq?: PrimitiveFilter<ObjectType>;
      $exists?: boolean;
      $in?: PrimitiveFilter<ObjectType>[];
      /**
       * @deprecated and will be removed in a future release. Filtering shall be applied client-side.
       */
      $ne?: PrimitiveFilter<ObjectType>;
      /**
       * @deprecated and will be removed in a future release. Filtering shall be applied client-side.
       */
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
    notifications_muted?:
      | RequireOnlyOne<{
          $eq?: PrimitiveFilter<UserResponse<StreamChatGenerics>['notifications_muted']>;
        }>
      | boolean;
    teams?:
      | RequireOnlyOne<{
          $contains?: PrimitiveFilter<string>;
          $eq?: PrimitiveFilter<UserResponse<StreamChatGenerics>['teams']>;
          $in?: PrimitiveFilter<UserResponse<StreamChatGenerics>['teams']>;
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
          memberType: StreamChatGenerics['memberType'];
          messageType: StreamChatGenerics['messageType'];
          pollOptionType: StreamChatGenerics['pollOptionType'];
          pollType: StreamChatGenerics['pollType'];
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
                memberType: StreamChatGenerics['memberType'];
                messageType: StreamChatGenerics['messageType'];
                pollOptionType: StreamChatGenerics['pollOptionType'];
                pollType: StreamChatGenerics['pollType'];
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
              memberType: StreamChatGenerics['memberType'];
              messageType: StreamChatGenerics['messageType'];
              pollOptionType: StreamChatGenerics['pollOptionType'];
              pollType: StreamChatGenerics['pollType'];
              reactionType: StreamChatGenerics['reactionType'];
              userType: {};
            }>[Key]
          >;
    }
>;

export type InviteStatus = 'pending' | 'accepted' | 'rejected';

// https://getstream.io/chat/docs/react/channel_member/#update-channel-members
export type MemberFilters<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = QueryFilters<
  {
    banned?:
      | { $eq?: ChannelMemberResponse<StreamChatGenerics>['banned'] }
      | ChannelMemberResponse<StreamChatGenerics>['banned'];
    channel_role?:
      | { $eq?: ChannelMemberResponse<StreamChatGenerics>['channel_role'] }
      | ChannelMemberResponse<StreamChatGenerics>['channel_role'];
    cid?: { $eq?: ChannelResponse<StreamChatGenerics>['cid'] } | ChannelResponse<StreamChatGenerics>['cid'];
    created_at?:
      | {
          $eq?: ChannelMemberResponse<StreamChatGenerics>['created_at'];
          $gt?: ChannelMemberResponse<StreamChatGenerics>['created_at'];
          $gte?: ChannelMemberResponse<StreamChatGenerics>['created_at'];
          $lt?: ChannelMemberResponse<StreamChatGenerics>['created_at'];
          $lte?: ChannelMemberResponse<StreamChatGenerics>['created_at'];
        }
      | ChannelMemberResponse<StreamChatGenerics>['created_at'];
    id?:
      | RequireOnlyOne<{
          $eq?: UserResponse<StreamChatGenerics>['id'];
          $in?: UserResponse<StreamChatGenerics>['id'][];
        }>
      | UserResponse<StreamChatGenerics>['id'];
    invite?:
      | { $eq?: ChannelMemberResponse<StreamChatGenerics>['status'] }
      | ChannelMemberResponse<StreamChatGenerics>['status'];
    joined?: { $eq?: boolean } | boolean;
    last_active?:
      | {
          $eq?: UserResponse<StreamChatGenerics>['last_active'];
          $gt?: UserResponse<StreamChatGenerics>['last_active'];
          $gte?: UserResponse<StreamChatGenerics>['last_active'];
          $lt?: UserResponse<StreamChatGenerics>['last_active'];
          $lte?: UserResponse<StreamChatGenerics>['last_active'];
        }
      | UserResponse<StreamChatGenerics>['last_active'];
    name?:
      | RequireOnlyOne<{
          $autocomplete?: ChannelMemberResponse<StreamChatGenerics>['name'];
          $eq?: ChannelMemberResponse<StreamChatGenerics>['name'];
          $in?: ChannelMemberResponse<StreamChatGenerics>['name'][];
          $q?: ChannelMemberResponse<StreamChatGenerics>['name'];
        }>
      | PrimitiveFilter<ChannelMemberResponse<StreamChatGenerics>['name']>;
    updated_at?:
      | {
          $eq?: ChannelMemberResponse<StreamChatGenerics>['updated_at'];
          $gt?: ChannelMemberResponse<StreamChatGenerics>['updated_at'];
          $gte?: ChannelMemberResponse<StreamChatGenerics>['updated_at'];
          $lt?: ChannelMemberResponse<StreamChatGenerics>['updated_at'];
          $lte?: ChannelMemberResponse<StreamChatGenerics>['updated_at'];
        }
      | ChannelMemberResponse<StreamChatGenerics>['updated_at'];
    'user.email'?:
      | RequireOnlyOne<{
          $autocomplete?: string;
          $eq?: string;
          $in?: string;
        }>
      | string;
    user_id?:
      | RequireOnlyOne<{
          $eq?: ChannelMemberResponse<StreamChatGenerics>['user_id'];
          $in?: ChannelMemberResponse<StreamChatGenerics>['user_id'][];
        }>
      | PrimitiveFilter<ChannelMemberResponse<StreamChatGenerics>['id']>;
  } & {
    [Key in keyof ContainsOperator<StreamChatGenerics['memberType']>]?:
      | RequireOnlyOne<QueryFilter<ContainsOperator<StreamChatGenerics['memberType']>[Key]>>
      | PrimitiveFilter<ContainsOperator<StreamChatGenerics['memberType']>[Key]>;
  }
>;

/**
 * Sort Types
 */

export type BannedUsersSort = BannedUsersSortBase | Array<BannedUsersSortBase>;

export type BannedUsersSortBase = { created_at?: AscDesc };

export type ReactionSort<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> =
  | ReactionSortBase<StreamChatGenerics>
  | Array<ReactionSortBase<StreamChatGenerics>>;

export type ReactionSortBase<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = Sort<
  StreamChatGenerics['reactionType']
> & {
  created_at?: AscDesc;
};

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
  pinned_at?: AscDesc;
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
  | Sort<Pick<UserResponse<StreamChatGenerics>, 'id' | 'created_at' | 'last_active' | 'name' | 'updated_at'>>
  | Array<Sort<Pick<UserResponse<StreamChatGenerics>, 'id' | 'created_at' | 'last_active' | 'name' | 'updated_at'>>>;

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

export type DraftSortBase = {
  created_at?: AscDesc;
};

export type DraftSort = DraftSortBase | Array<DraftSortBase>;

export type QuerySort<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> =
  | BannedUsersSort
  | ChannelSort<StreamChatGenerics>
  | SearchMessageSort<StreamChatGenerics>
  | UserSort<StreamChatGenerics>;

export type PollSort = PollSortBase | Array<PollSortBase>;

export type PollSortBase = {
  created_at?: AscDesc;
  id?: AscDesc;
  is_closed?: AscDesc;
  name?: AscDesc;
  updated_at?: AscDesc;
};

export type VoteSort = VoteSortBase | Array<VoteSortBase>;

export type VoteSortBase = {
  created_at?: AscDesc;
  id?: AscDesc;
  is_closed?: AscDesc;
  name?: AscDesc;
  updated_at?: AscDesc;
};

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
  allowed_flag_reasons?: string[];
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
  sns_key?: string;
  sns_secret?: string;
  sns_topic_arn?: string;
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
  duration?: number;
  fallback?: string;
  fields?: Field[];
  file_size?: number | string;
  footer?: string;
  footer_icon?: string;
  giphy?: GiphyData;
  image_url?: string;
  latitude?: number;
  longitude?: number;
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
  waveform_data?: Array<number>;
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
  team?: string;
  type?: string;
  validate?: boolean;
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
  mark_messages_pending?: boolean;
  max_message_length?: number;
  message_retention?: string;
  mutes?: boolean;
  name?: string;
  polls?: boolean;
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
  blocked?: boolean;
  members?: string[] | Array<NewMemberPayload<StreamChatGenerics>>;
  name?: string;
};

/**
 * @deprecated Use ChannelMemberResponse instead
 */
export type ChannelMembership<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> = ChannelMemberResponse<StreamChatGenerics>;

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
  | 'ListPushProviders'
  | 'CreatePoll';

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
  include_soft_deleted_channels?: boolean;
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
  size_limit?: number | null;
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
  frames?: string;
  size?: string;
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
  poll_id?: string;
  quoted_message_id?: string;
  restricted_visibility?: string[];
  show_in_channel?: boolean;
  silent?: boolean;
  text?: string;
  user?: UserResponse<StreamChatGenerics> | null;
  user_id?: string;
};

export type MessageLabel = 'deleted' | 'ephemeral' | 'error' | 'regular' | 'reply' | 'system';

export type SendMessageOptions = {
  force_moderation?: boolean;
  is_pending_message?: boolean;
  keep_channel_hidden?: boolean;
  pending?: boolean;
  pending_message_metadata?: Record<string, string>;
  skip_enrich_url?: boolean;
  skip_push?: boolean;
};

export type UpdateMessageOptions = {
  skip_enrich_url?: boolean;
};

export type GetMessageOptions = {
  show_deleted_message?: boolean;
};

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

export type PartialUpdateMember<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  set?: ChannelMemberUpdates<StreamChatGenerics>;
  unset?: Array<keyof ChannelMemberUpdates<StreamChatGenerics>>;
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
  message_options?: MessageOptions;
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

export type TestSNSDataInput = {
  sns_key?: string;
  sns_secret?: string;
  sns_topic_arn?: string;
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
  | 'lt'
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
  | 'pinned_at'
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

export type DeleteType = 'soft' | 'hard' | 'pruning';

/*
  DeleteUserOptions specifies a collection of one or more `user_ids` to be deleted.

  `user`:
    - soft: marks user as deleted and retains all user data
    - pruning: marks user as deleted and nullifies user information
    - hard: deletes user completely - this requires hard option for messages and conversation as well
  `conversations`:
    - soft: marks all conversation channels as deleted (same effect as Delete Channels with 'hard' option disabled)
    - hard: deletes channel and all its data completely including messages (same effect as Delete Channels with 'hard' option enabled)
  `messages`:
    - soft: marks all user messages as deleted without removing any related message data
    - pruning: marks all user messages as deleted, nullifies message information and removes some message data such as reactions and flags
    - hard: deletes messages completely with all related information
  `new_channel_owner_id`: any channels owned by the hard-deleted user will be transferred to this user ID
 */
export type DeleteUserOptions = {
  conversations?: Exclude<DeleteType, 'pruning'>;
  messages?: DeleteType;
  new_channel_owner_id?: string;
  user?: DeleteType;
};

export type SegmentType = 'channel' | 'user';

export type SegmentData = {
  all_sender_channels?: boolean;
  all_users?: boolean;
  description?: string;
  filter?: {};
  name?: string;
};

export type SegmentResponse = {
  created_at: string;
  deleted_at: string;
  id: string;
  locked: boolean;
  size: number;
  task_id: string;
  type: SegmentType;
  updated_at: string;
} & SegmentData;

export type UpdateSegmentData = {
  name: string;
} & SegmentData;

export type SegmentTargetsResponse = {
  created_at: string;
  segment_id: string;
  target_id: string;
};

export type SortParam = {
  field: string;
  direction?: AscDesc;
};

export type Pager = {
  limit?: number;
  next?: string;
  prev?: string;
};

export type QuerySegmentsOptions = Pager;

export type QuerySegmentTargetsFilter = {
  target_id?: {
    $eq?: string;
    $gte?: string;
    $in?: string[];
    $lte?: string;
  };
};
export type QuerySegmentTargetsOptions = Pick<Pager, 'next' | 'limit'>;

export type GetCampaignOptions = {
  users?: { limit?: number; next?: string; prev?: string };
};

export type CampaignSort = {
  field: string;
  direction?: number;
}[];

export type CampaignQueryOptions = {
  limit?: number;
  next?: string;
  prev?: string;
  sort?: CampaignSort;
  user_limit?: number;
};

export type SegmentQueryOptions = CampaignQueryOptions;

// TODO: add better typing
export type CampaignFilters = {};

export type CampaignData = {
  channel_template?: {
    type: string;
    custom?: {};
    id?: string;
    members?: string[];
    team?: string;
  };
  create_channels?: boolean;
  deleted_at?: string;
  description?: string;
  id?: string | null;
  message_template?: {
    text: string;
    attachments?: Attachment[];
    custom?: {};
    poll_id?: string;
  };
  name?: string;
  segment_ids?: string[];
  sender_id?: string;
  sender_mode?: 'exclude' | 'include' | null;
  show_channels?: boolean;
  skip_push?: boolean;
  skip_webhook?: boolean;
  user_ids?: string[];
};

export type CampaignStats = {
  progress?: number;
  stats_channels_created?: number;
  stats_completed_at?: string;
  stats_messages_sent?: number;
  stats_started_at?: string;
  stats_users_read?: number;
  stats_users_sent?: number;
};
export type CampaignResponse = {
  created_at: string;
  id: string;
  segments: SegmentResponse[];
  sender: UserResponse;
  stats: CampaignStats;
  status: 'draft' | 'scheduled' | 'in_progress' | 'completed' | 'stopped';
  updated_at: string;
  users: UserResponse[];
  scheduled_for?: string;
} & CampaignData;

export type DeleteCampaignOptions = {};

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
export type MessageSet<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  isCurrent: boolean;
  isLatest: boolean;
  messages: FormatMessageResponse<StreamChatGenerics>[];
  pagination: { hasNext: boolean; hasPrev: boolean };
};

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

export type QueryPollsResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  polls: PollResponse<StreamChatGenerics>[];
  next?: string;
};

export type CreatePollAPIResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  poll: PollResponse<StreamChatGenerics>;
};

export type GetPollAPIResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  poll: PollResponse<StreamChatGenerics>;
};

export type UpdatePollAPIResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  poll: PollResponse<StreamChatGenerics>;
};

export type PollResponse<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> = StreamChatGenerics['pollType'] &
  PollEnrichData<StreamChatGenerics> & {
    created_at: string;
    created_by: UserResponse<StreamChatGenerics> | null;
    created_by_id: string;
    enforce_unique_vote: boolean;
    id: string;
    max_votes_allowed: number;
    name: string;
    options: PollOption<StreamChatGenerics>[];
    updated_at: string;
    allow_answers?: boolean;
    allow_user_suggested_options?: boolean;
    description?: string;
    is_closed?: boolean;
    voting_visibility?: VotingVisibility;
  };

export type PollOption<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  created_at: string;
  id: string;
  poll_id: string;
  text: string;
  updated_at: string;
  vote_count: number;
  votes?: PollVote<StreamChatGenerics>[];
};

export enum VotingVisibility {
  anonymous = 'anonymous',
  public = 'public',
}

export type PollEnrichData<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  answers_count: number;
  latest_answers: PollAnswer<StreamChatGenerics>[]; // not updated with WS events, ordered DESC by created_at, seems like updated_at cannot be different from created_at
  latest_votes_by_option: Record<string, PollVote<StreamChatGenerics>[]>; // not updated with WS events; always null in anonymous polls
  vote_count: number;
  vote_counts_by_option: Record<string, number>;
  own_votes?: (PollVote<StreamChatGenerics> | PollAnswer<StreamChatGenerics>)[]; // not updated with WS events
};

export type PollData<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> = StreamChatGenerics['pollType'] & {
  id: string;
  name: string;
  allow_answers?: boolean;
  allow_user_suggested_options?: boolean;
  description?: string;
  enforce_unique_vote?: boolean;
  is_closed?: boolean;
  max_votes_allowed?: number;
  options?: PollOptionData<StreamChatGenerics>[];
  user_id?: string;
  voting_visibility?: VotingVisibility;
};

export type CreatePollData<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = Partial<
  PollData<StreamChatGenerics>
> &
  Pick<PollData<StreamChatGenerics>, 'name'>;

export type PartialPollUpdate<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  set?: Partial<PollData<StreamChatGenerics>>;
  unset?: Array<keyof PollData<StreamChatGenerics>>;
};

export type PollOptionData<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> = StreamChatGenerics['pollOptionType'] & {
  text: string;
  id?: string;
  position?: number;
};

export type PartialPollOptionUpdate<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  set?: Partial<PollOptionResponse<StreamChatGenerics>>;
  unset?: Array<keyof PollOptionResponse<StreamChatGenerics>>;
};

export type PollVoteData = {
  answer_text?: string;
  is_answer?: boolean;
  option_id?: string;
};

export type PollPaginationOptions = {
  limit?: number;
  next?: string;
};

export type CreatePollOptionAPIResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  poll_option: PollOptionResponse<StreamChatGenerics>;
};

export type GetPollOptionAPIResponse<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> = CreatePollOptionAPIResponse<StreamChatGenerics>;
export type UpdatePollOptionAPIResponse<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> = CreatePollOptionAPIResponse<StreamChatGenerics>;

export type PollOptionResponse<
  StreamChatGenerics extends ExtendableGenerics = DefaultGenerics
> = StreamChatGenerics['pollType'] & {
  created_at: string;
  id: string;
  poll_id: string;
  position: number;
  text: string;
  updated_at: string;
  vote_count: number;
  votes?: PollVote<StreamChatGenerics>[];
};

export type PollVote<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  created_at: string;
  id: string;
  poll_id: string;
  updated_at: string;
  option_id?: string;
  user?: UserResponse<StreamChatGenerics>;
  user_id?: string;
};

export type PollAnswer<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = Exclude<
  PollVote<StreamChatGenerics>,
  'option_id'
> & {
  answer_text: string;
  is_answer: boolean; // this is absolutely redundant prop as answer_text indicates that a vote is an answer
};

export type PollVotesAPIResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  votes: (PollVote<StreamChatGenerics> | PollAnswer<StreamChatGenerics>)[];
  next?: string;
};

export type PollAnswersAPIResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  votes: PollAnswer<StreamChatGenerics>[]; // todo: should be changes to answers?
  next?: string;
};

export type CastVoteAPIResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  vote: PollVote<StreamChatGenerics> | PollAnswer<StreamChatGenerics>;
};

export type QueryMessageHistoryFilters = QueryFilters<
  {
    message_id?:
      | RequireOnlyOne<Pick<QueryFilter<MessageHistoryEntry['message_id']>, '$eq' | '$in'>>
      | PrimitiveFilter<MessageHistoryEntry['message_id']>;
  } & {
    user_id?:
      | RequireOnlyOne<Pick<QueryFilter<MessageHistoryEntry['message_updated_by_id']>, '$eq' | '$in'>>
      | PrimitiveFilter<MessageHistoryEntry['message_updated_by_id']>;
  } & {
    created_at?:
      | RequireOnlyOne<
          Pick<QueryFilter<MessageHistoryEntry['message_updated_at']>, '$eq' | '$gt' | '$lt' | '$gte' | '$lte'>
        >
      | PrimitiveFilter<MessageHistoryEntry['message_updated_at']>;
  }
>;

export type QueryMessageHistorySort = QueryMessageHistorySortBase | Array<QueryMessageHistorySortBase>;

export type QueryMessageHistorySortBase = {
  message_updated_at?: AscDesc;
  message_updated_by_id?: AscDesc;
};

export type QueryMessageHistoryOptions = Pager;

export type MessageHistoryEntry<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  message_id: string;
  message_updated_at: string;
  attachments?: Attachment<StreamChatGenerics>[];
  message_updated_by_id?: string;
  text?: string;
};

export type QueryMessageHistoryResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  message_history: MessageHistoryEntry<StreamChatGenerics>[];
  next?: string;
  prev?: string;
};

// Moderation v2
export type ModerationPayload = {
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  custom?: Record<string, any>;
  images?: string[];
  texts?: string[];
  videos?: string[];
};

export type ModV2ReviewStatus = 'complete' | 'flagged' | 'partial';

export type ModerationFlag = {
  created_at: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  custom: Record<string, any>;
  entity_creator_id: string;
  entity_id: string;
  entity_type: string;
  id: string;
  reason: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  result: Record<string, any>[];
  review_queue_item_id: string;
  updated_at: string;
  user: UserResponse;
  moderation_payload?: ModerationPayload;
  moderation_payload_hash?: string;
};

export type ReviewQueueItem = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  actions_taken: any[];
  appealed_by: string;
  assigned_to: string;
  completed_at: string;
  config_key: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  context: any[];
  created_at: string;
  created_by: string;
  entity_id: string;
  entity_type: string;
  flags: ModerationFlag[];
  has_image: boolean;
  has_text: boolean;
  has_video: boolean;
  id: string;
  moderation_payload: ModerationPayload;
  moderation_payload_hash: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  options: any;
  recommended_action: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  results: any;
  reviewed_at: string;
  status: string;
  updated_at: string;
};

export type CustomCheckFlag = {
  type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  custom?: Record<string, any>[];
  labels?: string[];
  reason?: string;
};

export type SubmitActionOptions = {
  ban?: {
    channel_ban_only?: boolean;
    reason?: string;
    timeout?: number;
  };
  delete_message?: {
    hard_delete?: boolean;
  };
  delete_user?: {
    delete_conversation_channels?: boolean;
    hard_delete?: boolean;
    mark_messages_deleted?: boolean;
  };
  restore?: {};
  unban?: {
    channel_cid?: string;
  };
  user_id?: string;
};

export type GetUserModerationReportResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  user: UserResponse<StreamChatGenerics>;
  user_blocks?: Array<{
    blocked_at: string;
    blocked_by_user_id: string;
    blocked_user_id: string;
  }>;
  user_mutes?: Mute<StreamChatGenerics>[];
};

export type QueryModerationConfigsFilters = QueryFilters<
  {
    key?: string;
  } & {
    created_at?: PrimitiveFilter<string>;
  } & {
    updated_at?: PrimitiveFilter<string>;
  } & {
    team?: string;
  }
>;

export type ReviewQueueFilters = QueryFilters<
  {
    assigned_to?:
      | RequireOnlyOne<Pick<QueryFilter<ReviewQueueItem['assigned_to']>, '$eq' | '$in'>>
      | PrimitiveFilter<ReviewQueueItem['assigned_to']>;
  } & {
    completed_at?:
      | RequireOnlyOne<Pick<QueryFilter<ReviewQueueItem['completed_at']>, '$eq' | '$gt' | '$lt' | '$gte' | '$lte'>>
      | PrimitiveFilter<ReviewQueueItem['completed_at']>;
  } & {
    config_key?:
      | RequireOnlyOne<Pick<QueryFilter<ReviewQueueItem['config_key']>, '$eq' | '$in'>>
      | PrimitiveFilter<ReviewQueueItem['config_key']>;
  } & {
    entity_type?:
      | RequireOnlyOne<Pick<QueryFilter<ReviewQueueItem['entity_type']>, '$eq' | '$in'>>
      | PrimitiveFilter<ReviewQueueItem['entity_type']>;
  } & {
    created_at?:
      | RequireOnlyOne<Pick<QueryFilter<ReviewQueueItem['created_at']>, '$eq' | '$gt' | '$lt' | '$gte' | '$lte'>>
      | PrimitiveFilter<ReviewQueueItem['created_at']>;
  } & {
    id?:
      | RequireOnlyOne<Pick<QueryFilter<ReviewQueueItem['id']>, '$eq' | '$in'>>
      | PrimitiveFilter<ReviewQueueItem['id']>;
  } & {
    entity_id?:
      | RequireOnlyOne<Pick<QueryFilter<ReviewQueueItem['entity_id']>, '$eq' | '$in'>>
      | PrimitiveFilter<ReviewQueueItem['entity_id']>;
  } & {
    reviewed?: boolean;
  } & {
    reviewed_at?:
      | RequireOnlyOne<Pick<QueryFilter<ReviewQueueItem['reviewed_at']>, '$eq' | '$gt' | '$lt' | '$gte' | '$lte'>>
      | PrimitiveFilter<ReviewQueueItem['reviewed_at']>;
  } & {
    status?:
      | RequireOnlyOne<Pick<QueryFilter<ReviewQueueItem['status']>, '$eq' | '$in'>>
      | PrimitiveFilter<ReviewQueueItem['status']>;
  } & {
    updated_at?:
      | RequireOnlyOne<Pick<QueryFilter<ReviewQueueItem['updated_at']>, '$eq' | '$gt' | '$lt' | '$gte' | '$lte'>>
      | PrimitiveFilter<ReviewQueueItem['updated_at']>;
  } & {
    has_image?: boolean;
  } & {
    has_text?: boolean;
  } & {
    has_video?: boolean;
  } & {
    has_media?: boolean;
  } & {
    language?: RequireOnlyOne<{
      $contains?: string;
      $eq?: string;
      $in?: string[];
    }>;
  } & {
    teams?:
      | RequireOnlyOne<{
          $contains?: PrimitiveFilter<string>;
          $eq?: PrimitiveFilter<string>;
          $in?: PrimitiveFilter<string>;
        }>
      | PrimitiveFilter<string>;
  } & {
    user_report_reason?: RequireOnlyOne<{
      $eq?: string;
    }>;
  } & {
    recommended_action?: RequireOnlyOne<{
      $eq?: string;
    }>;
  } & {
    flagged_user_id?: RequireOnlyOne<{
      $eq?: string;
    }>;
  } & {
    category?: RequireOnlyOne<{
      $eq?: string;
    }>;
  } & {
    label?: RequireOnlyOne<{
      $eq?: string;
    }>;
  } & {
    reporter_type?: RequireOnlyOne<{
      $eq?: 'automod' | 'user' | 'moderator' | 'admin' | 'velocity_filter';
    }>;
  } & {
    reporter_id?: RequireOnlyOne<{
      $eq?: string;
      $in?: string[];
    }>;
  } & {
    date_range?: RequireOnlyOne<{
      $eq?: string; // Format: "date1_date2"
    }>;
  }
>;

export type ReviewQueueSort =
  | Sort<Pick<ReviewQueueItem, 'id' | 'created_at' | 'updated_at'>>
  | Array<Sort<Pick<ReviewQueueItem, 'id' | 'created_at' | 'updated_at'>>>;

export type QueryModerationConfigsSort = Array<Sort<'key' | 'created_at' | 'updated_at'>>;

export type ReviewQueuePaginationOptions = Pager;

export type ReviewQueueResponse = {
  items: ReviewQueueItem[];
  next?: string;
  prev?: string;
};

export type ModerationConfig = {
  key: string;
  ai_image_config?: AIImageConfig;
  ai_text_config?: AITextConfig;
  ai_video_config?: AIVideoConfig;
  automod_platform_circumvention_config?: AutomodPlatformCircumventionConfig;
  automod_semantic_filters_config?: AutomodSemanticFiltersConfig;
  automod_toxicity_config?: AutomodToxicityConfig;
  block_list_config?: BlockListConfig;
  team?: string;
};

export type ModerationConfigResponse = ModerationConfig & {
  created_at: string;
  updated_at: string;
};

export type GetConfigResponse = {
  config: ModerationConfigResponse;
};

export type QueryConfigsResponse = {
  configs: ModerationConfigResponse[];
  next?: string;
  prev?: string;
};

export type UpsertConfigResponse = {
  config: ModerationConfigResponse;
};

export type ModerationFlagOptions = {
  custom?: Record<string, unknown>;
  moderation_payload?: ModerationPayload;
  user_id?: string;
};

export type ModerationMuteOptions = {
  timeout?: number;
  user_id?: string;
};
export type GetUserModerationReportOptions = {
  create_user_if_not_exists?: boolean;
  include_user_blocks?: boolean;
  include_user_mutes?: boolean;
};

export type AIState =
  | 'AI_STATE_ERROR'
  | 'AI_STATE_CHECKING_SOURCES'
  | 'AI_STATE_THINKING'
  | 'AI_STATE_GENERATING'
  | (string & {});

export type ModerationActionType = 'flag' | 'shadow' | 'remove' | 'bounce' | 'bounce_flag' | 'bounce_remove';

export type AutomodRule = {
  action: ModerationActionType;
  label: string;
  threshold: number;
};

export type BlockListRule = {
  action: ModerationActionType;
  name?: string;
};

export type BlockListConfig = {
  enabled: boolean;
  rules: BlockListRule[];
  async?: boolean;
};

export type AutomodToxicityConfig = {
  enabled: boolean;
  rules: AutomodRule[];
  async?: boolean;
};

export type AutomodPlatformCircumventionConfig = {
  enabled: boolean;
  rules: AutomodRule[];
  async?: boolean;
};

export type AutomodSemanticFiltersRule = {
  action: ModerationActionType;
  name: string;
  threshold: number;
};

export type AutomodSemanticFiltersConfig = {
  enabled: boolean;
  rules: AutomodSemanticFiltersRule[];
  async?: boolean;
};

export type AITextSeverityRule = {
  action: ModerationActionType;
  severity: 'low' | 'medium' | 'high' | 'critical';
};

export type AITextRule = {
  label: string;
  action?: ModerationActionType;
  severity_rules?: AITextSeverityRule[];
};

export type AITextConfig = {
  enabled: boolean;
  rules: AITextRule[];
  async?: boolean;
  profile?: string;
  severity_rules?: AITextSeverityRule[]; // Deprecated: use rules instead
};

export type AIImageRule = {
  action: ModerationActionType;
  label: string;
  min_confidence?: number;
};

export type AIImageConfig = {
  enabled: boolean;
  rules: AIImageRule[];
  async?: boolean;
};

export type AIVideoRule = {
  action: ModerationActionType;
  label: string;
  min_confidence?: number;
};

export type AIVideoConfig = {
  enabled: boolean;
  rules: AIVideoRule[];
  async?: boolean;
};

export type VelocityFilterConfigRule = {
  action: 'flag' | 'shadow' | 'remove' | 'ban';
  ban_duration?: number;
  cascading_action?: 'flag' | 'shadow' | 'remove' | 'ban';
  cascading_threshold?: number;
  check_message_context?: boolean;
  fast_spam_threshold?: number;
  fast_spam_ttl?: number;
  ip_ban?: boolean;
  shadow_ban?: boolean;
  slow_spam_ban_duration?: number;
  slow_spam_threshold?: number;
  slow_spam_ttl?: number;
};

export type VelocityFilterConfig = {
  cascading_actions: boolean;
  enabled: boolean;
  first_message_only: boolean;
  rules: VelocityFilterConfigRule[];
  async?: boolean;
};

export type PromoteChannelParams<SCG extends ExtendableGenerics = DefaultGenerics> = {
  channels: Array<Channel<SCG>>;
  channelToMove: Channel<SCG>;
  sort: ChannelSort<SCG>;
  /**
   * If the index of the channel within `channels` list which is being moved upwards
   * (`channelToMove`) is known, you can supply it to skip extra calculation.
   */
  channelToMoveIndexWithinChannels?: number;
};

/**
 * An identifier containing information about the downstream SDK using stream-chat. It
 * is used to resolve the user agent.
 */
export type SdkIdentifier = { name: 'react' | 'react-native' | 'expo' | 'angular'; version: string };

/**
 * An identifier containing information about the downstream device using stream-chat, if
 * available. Is used by the react-native SDKs to enrich the user agent further.
 */
export type DeviceIdentifier = { os: string; model?: string };

export type DraftResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  channel_cid: string;
  created_at: string;
  message: DraftMessage<StreamChatGenerics>;
  channel?: ChannelResponse<StreamChatGenerics>;
  parent_id?: string;
  parent_message?: MessageResponseBase<StreamChatGenerics>;
  quoted_message?: MessageResponseBase<StreamChatGenerics>;
};
export type CreateDraftResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  draft: DraftResponse<StreamChatGenerics>;
};

export type GetDraftResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  draft: DraftResponse<StreamChatGenerics>;
};

export type QueryDraftsResponse<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = APIResponse & {
  drafts: DraftResponse<StreamChatGenerics>[];
} & Omit<Pager, 'limit'>;

export type DraftMessagePayload<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = PartializeKeys<
  DraftMessage<StreamChatGenerics>,
  'id'
> & { user_id?: string };

export type DraftMessage<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  id: string;
  text: string;
  attachments?: Attachment<StreamChatGenerics>[];
  custom?: {};
  html?: string;
  mentioned_users?: string[];
  mml?: string;
  parent_id?: string;
  poll_id?: string;
  quoted_message_id?: string;
  show_in_channel?: boolean;
  silent?: boolean;
  type?: MessageLabel;
};

export type ThreadSort = ThreadSortBase | Array<ThreadSortBase>;

export type ThreadSortBase = {
  active_participant_count?: AscDesc;
  created_at?: AscDesc;
  last_message_at?: AscDesc;
  parent_message_id?: AscDesc;
  participant_count?: AscDesc;
  reply_count?: AscDesc;
  updated_at?: AscDesc;
};

export type ThreadFilters = QueryFilters<
  {
    channel_cid?: RequireOnlyOne<Pick<QueryFilter<string>, '$eq' | '$in'>> | PrimitiveFilter<string>;
  } & {
    parent_message_id?:
      | RequireOnlyOne<Pick<QueryFilter<ThreadResponse['parent_message_id']>, '$eq' | '$in'>>
      | PrimitiveFilter<ThreadResponse['parent_message_id']>;
  } & {
    created_by_user_id?:
      | RequireOnlyOne<Pick<QueryFilter<ThreadResponse['created_by_user_id']>, '$eq' | '$in'>>
      | PrimitiveFilter<ThreadResponse['created_by_user_id']>;
  } & {
    created_at?:
      | RequireOnlyOne<Pick<QueryFilter<ThreadResponse['created_at']>, '$eq' | '$gt' | '$lt' | '$gte' | '$lte'>>
      | PrimitiveFilter<ThreadResponse['created_at']>;
  } & {
    updated_at?:
      | RequireOnlyOne<Pick<QueryFilter<ThreadResponse['updated_at']>, '$eq' | '$gt' | '$lt' | '$gte' | '$lte'>>
      | PrimitiveFilter<ThreadResponse['updated_at']>;
  } & {
    last_message_at?:
      | RequireOnlyOne<Pick<QueryFilter<ThreadResponse['last_message_at']>, '$eq' | '$gt' | '$lt' | '$gte' | '$lte'>>
      | PrimitiveFilter<ThreadResponse['last_message_at']>;
  }
>;
