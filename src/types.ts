import type { EVENT_MAP } from './events';
import type { Channel } from './channel';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import type { StableWSConnection } from './connection';
import type { Role } from './permissions';
import type {
  CustomAttachmentData,
  CustomChannelData,
  CustomCommandData,
  CustomEventData,
  CustomMemberData,
  CustomMessageData,
  CustomPollData,
  CustomPollOptionData,
  CustomReactionData,
  CustomThreadData,
  CustomUserData,
} from './custom_types';
import type { NotificationManager } from './notifications';
import type { RESERVED_UPDATED_MESSAGE_FIELDS } from './constants';

/**
 * Utility Types
 */

export type Readable<T> = {
  [key in keyof T]: T[key];
} & {};

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
  [K in keyof T]-?: Required<Pick<T, K>> & Partial<Omit<T, K>>;
}[keyof T];

export type RequireOnlyOne<T, Keys extends keyof T = keyof T> = Omit<T, Keys> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Record<Exclude<Keys, K>, undefined>>;
  }[Keys];

export type PartializeKeys<T, K extends keyof T> = Partial<Pick<T, K>> & Omit<T, K>;

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

export type TranslateResponse = {
  language: string;
  translated_text: string;
};

export type AppSettingsAPIResponse = APIResponse & {
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
        commands?: CommandVariants[];
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
        user_message_reminders?: boolean;
      }
    >;
    reminders_interval: number;
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
    event_hooks?: Array<EventHook>;
    file_upload_config?: FileUploadConfig;
    geofences?: Array<{
      country_codes: Array<string>;
      description: string;
      name: string;
      type: string;
    }>;
    grants?: Record<string, string[]>;
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

export type Flag = {
  created_at: string;
  created_by_automod: boolean;
  updated_at: string;
  details?: FlagDetails;
  target_message?: MessageResponse;
  target_user?: UserResponse;
  user?: UserResponse;
};

export type FlagsResponse = APIResponse & {
  flags?: Array<Flag>;
};

export type MessageFlagsResponse = APIResponse & {
  flags?: Array<{
    message: MessageResponse;
    user: UserResponse;
    approved_at?: string;
    created_at?: string;
    created_by_automod?: boolean;
    moderation_result?: ModerationResult;
    rejected_at?: string;
    reviewed_at?: string;
    reviewed_by?: UserResponse;
    updated_at?: string;
  }>;
};

export type FlagReport = {
  flags_count: number;
  id: string;
  message: MessageResponse;
  user: UserResponse;
  created_at?: string;
  details?: FlagDetails;
  first_reporter?: UserResponse;
  review_result?: string;
  reviewed_at?: string;
  reviewed_by?: UserResponse;
  updated_at?: string;
};

export type FlagReportsResponse = APIResponse & {
  flag_reports: Array<FlagReport>;
};

export type ReviewFlagReportResponse = APIResponse & {
  flag_report: FlagReport;
};

export type BannedUsersResponse = APIResponse & {
  bans?: Array<{
    user: UserResponse;
    banned_by?: UserResponse;
    channel?: ChannelResponse;
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

export type ChannelResponse = CustomChannelData & {
  cid: string;
  disabled: boolean;
  frozen: boolean;
  id: string;
  type: string;
  blocked?: boolean;
  auto_translation_enabled?: boolean;
  auto_translation_language?: TranslationLanguages;
  hide_messages_before?: string;
  config?: ChannelConfigWithInfo;
  cooldown?: number;
  created_at?: string;
  created_by?: UserResponse | null;
  created_by_id?: string;
  deleted_at?: string;
  hidden?: boolean;
  invites?: string[];
  joined?: boolean;
  last_message_at?: string;
  member_count?: number;
  members?: ChannelMemberResponse[];
  muted?: boolean;
  mute_expires_at?: string;
  own_capabilities?: string[];
  team?: string;
  truncated_at?: string;
  truncated_by?: UserResponse;
  truncated_by_id?: string;
  updated_at?: string;
};

export type QueryReactionsOptions = Pager;

export type QueryReactionsAPIResponse = APIResponse & {
  reactions: ReactionResponse[];
  next?: string;
};

export type QueryChannelsAPIResponse = APIResponse & {
  channels: Omit<ChannelAPIResponse, keyof APIResponse>[];
};

export type QueryChannelAPIResponse = APIResponse & ChannelAPIResponse;

export type ChannelAPIResponse = {
  channel: ChannelResponse;
  members: ChannelMemberResponse[];
  messages: MessageResponse[];
  pinned_messages: MessageResponse[];
  draft?: DraftResponse;
  hidden?: boolean;
  membership?: ChannelMemberResponse | null;
  pending_messages?: PendingMessageResponse[];
  push_preferences?: PushPreference;
  read?: ReadResponse[];
  threads?: ThreadResponse[];
  watcher_count?: number;
  watchers?: UserResponse[];
  active_live_locations?: SharedLocationResponse[];
};

export type ChannelUpdateOptions = {
  hide_history?: boolean;
  skip_push?: boolean;
};

export type ChannelMemberAPIResponse = APIResponse & {
  members: ChannelMemberResponse[];
};

export type ChannelMemberUpdates = CustomMemberData & {
  archived?: boolean;
  channel_role?: Role;
  pinned?: boolean;
};

export type ChannelMemberResponse = CustomMemberData & {
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
  user?: UserResponse;
  user_id?: string;
};

export type PartialUpdateMemberAPIResponse = APIResponse & {
  channel_member: ChannelMemberResponse;
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

export type CommandResponse = Partial<CreatedAtUpdatedAt> & {
  args?: string;
  description?: string;
  name?: CommandVariants;
  set?: CommandVariants;
};

export type ConnectAPIResponse = Promise<void | ConnectionOpen>;

export type CreateChannelResponse = APIResponse &
  Omit<CreateChannelOptions, 'client_id' | 'connection_id'> & {
    created_at: string;
    updated_at: string;
    grants?: Record<string, string[]>;
  };

export type CreateCommandResponse = APIResponse & {
  command: CreateCommandOptions & CreatedAtUpdatedAt;
};

export type DeleteChannelAPIResponse = APIResponse & {
  channel: ChannelResponse;
};

export type DeleteCommandResponse = APIResponse & {
  name?: CommandVariants;
};

export type EventAPIResponse = APIResponse & {
  event: Event;
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

export type FlagMessageResponse = APIResponse & {
  flag: {
    created_at: string;
    created_by_automod: boolean;
    target_message_id: string;
    updated_at: string;
    user: UserResponse;
    approved_at?: string;
    channel_cid?: string;
    details?: object; // Any JSON
    message_user_id?: string;
    rejected_at?: string;
    reviewed_at?: string;
    reviewed_by?: string;
  };
  review_queue_item_id?: string;
};

export type FlagUserResponse = APIResponse & {
  flag: {
    created_at: string;
    created_by_automod: boolean;
    target_user: UserResponse;
    updated_at: string;
    user: UserResponse;
    approved_at?: string;
    details?: object; // Any JSON
    rejected_at?: string;
    reviewed_at?: string;
    reviewed_by?: string;
  };
  review_queue_item_id?: string;
};

export type LocalMessageBase = Omit<
  MessageResponseBase,
  'created_at' | 'deleted_at' | 'pinned_at' | 'status' | 'updated_at'
> & {
  created_at: Date;
  deleted_at: Date | null;
  pinned_at: Date | null;
  status: string;
  updated_at: Date;
};

export type LocalMessage = LocalMessageBase & {
  error?: ErrorFromResponse<APIErrorResponse>;
  quoted_message?: LocalMessageBase;
};

/**
 * @deprecated in favor of LocalMessage
 */
export type FormatMessageResponse = LocalMessage;

export type GetCommandResponse = APIResponse & CreateCommandOptions & CreatedAtUpdatedAt;

export type GetMessageAPIResponse = SendMessageAPIResponse;

export interface ThreadResponse extends CustomThreadData {
  // FIXME: according to OpenAPI, `channel` could be undefined but since cid is provided I'll asume that it's wrong
  channel: ChannelResponse;
  channel_cid: string;
  created_at: string;
  created_by_user_id: string;
  latest_replies: Array<MessageResponse>;
  parent_message: MessageResponse;
  parent_message_id: string;
  title: string;
  updated_at: string;
  active_participant_count?: number;
  created_by?: UserResponse;
  deleted_at?: string;
  draft?: DraftResponse;
  last_message_at?: string;
  participant_count?: number;
  read?: Array<ReadResponse>;
  reply_count?: number;
  thread_participants?: Array<{
    channel_cid: string;
    created_at: string;
    last_read_at: string;
    last_thread_message_at?: string;
    left_thread_at?: string;
    thread_id?: string;
    user?: UserResponse;
    user_id?: string;
  }>;
  // TODO: when moving to API v2 we should do this instead
  // custom: CustomThreadType;
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

export type QueryThreadsAPIResponse = APIResponse & {
  threads: ThreadResponse[];
  next?: string;
};

export type GetThreadOptions = {
  member_limit?: number;
  participant_limit?: number;
  reply_limit?: number;
  watch?: boolean;
};

export type GetThreadAPIResponse = APIResponse & {
  thread: ThreadResponse;
};

export type GetMultipleMessagesAPIResponse = APIResponse & {
  messages: MessageResponse[];
};

export type GetRateLimitsResponse = APIResponse & {
  android?: RateLimitsMap;
  ios?: RateLimitsMap;
  server_side?: RateLimitsMap;
  web?: RateLimitsMap;
};

export type GetReactionsAPIResponse = APIResponse & {
  reactions: ReactionResponse[];
};

export type GetRepliesAPIResponse = APIResponse & {
  messages: MessageResponse[];
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
  total_unread_count_by_team?: Record<string, number>;
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

export type ListChannelResponse = APIResponse & {
  channel_types: Record<
    string,
    Omit<CreateChannelOptions, 'client_id' | 'connection_id' | 'commands'> & {
      commands: CommandResponse[];
      created_at: string;
      updated_at: string;
      grants?: Record<string, string[]>;
    }
  >;
};

export type ListChannelTypesAPIResponse = ListChannelResponse;

export type ListCommandsResponse = APIResponse & {
  commands: Array<CreateCommandOptions & Partial<CreatedAtUpdatedAt>>;
};

export type MuteChannelAPIResponse = APIResponse & {
  channel_mute: ChannelMute;
  own_user: OwnUserResponse;
  channel_mutes?: ChannelMute[];
  mute?: MuteResponse;
};

export type MessageResponse = MessageResponseBase & {
  quoted_message?: MessageResponseBase;
};

export type MessageResponseBase = MessageBase & {
  type: MessageLabel;
  args?: string;
  before_message_send_failed?: boolean;
  channel?: ChannelResponse;
  cid?: string;
  command?: string;
  command_info?: { name?: string };
  created_at?: string;
  deleted_at?: string;
  deleted_reply_count?: number;
  i18n?: RequireAtLeastOne<Record<`${TranslationLanguages}_text`, string>> & {
    language: TranslationLanguages;
  };
  latest_reactions?: ReactionResponse[];
  mentioned_users?: UserResponse[];
  message_text_updated_at?: string;
  moderation?: ModerationResponse; // present only with Moderation v2
  moderation_details?: ModerationDetailsResponse; // present only with Moderation v1
  own_reactions?: ReactionResponse[] | null;
  pin_expires?: string | null;
  pinned_at?: string | null;
  pinned_by?: UserResponse | null;
  poll?: PollResponse;
  reaction_counts?: { [key: string]: number } | null;
  reaction_groups?: { [key: string]: ReactionGroupResponse } | null;
  reaction_scores?: { [key: string]: number } | null;
  reminder?: ReminderResponseBase;
  reply_count?: number;
  shadowed?: boolean;
  shared_location?: SharedLocationResponse;
  status?: string;
  thread_participants?: UserResponse[];
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

export type MuteResponse = {
  user: UserResponse;
  created_at?: string;
  expires?: string;
  target?: UserResponse;
  updated_at?: string;
};

export type MuteUserResponse = APIResponse & {
  mute?: MuteResponse;
  mutes?: Array<Mute>;
  own_user?: OwnUserResponse;
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

export type OwnUserBase = {
  channel_mutes: ChannelMute[];
  devices: Device[];
  mutes: Mute[];
  total_unread_count: number;
  unread_channels: number;
  unread_count: number;
  unread_threads: number;
  invisible?: boolean;
  privacy_settings?: PrivacySettings;
  push_preferences?: PushPreference;
  roles?: string[];
};

export type OwnUserResponse = UserResponse & OwnUserBase;

export type PartialUpdateChannelAPIResponse = APIResponse & {
  channel: ChannelResponse;
  members: ChannelMemberResponse[];
};

export type PermissionAPIResponse = APIResponse & {
  permission?: PermissionAPIObject;
};

export type PermissionsAPIResponse = APIResponse & {
  permissions?: PermissionAPIObject[];
};

export type ReactionAPIResponse = APIResponse & {
  message: MessageResponse;
  reaction: ReactionResponse;
};

export type ReactionResponse = Reaction & {
  created_at: string;
  message_id: string;
  updated_at: string;
};

export type ReadResponse = {
  last_read: string;
  user: UserResponse;
  last_read_message_id?: string;
  unread_messages?: number;
};

export type SearchAPIResponse = APIResponse & {
  results: {
    message: MessageResponse;
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

export type SendMessageAPIResponse = APIResponse & {
  message: MessageResponse;
  pending_message_metadata?: Record<string, string> | null;
};

export type SyncResponse = APIResponse & {
  events: Event[];
  inaccessible_cids?: string[];
};

export type TruncateChannelAPIResponse = APIResponse & {
  channel: ChannelResponse;
  message?: MessageResponse;
};

export type UpdateChannelAPIResponse = APIResponse & {
  channel: ChannelResponse;
  members: ChannelMemberResponse[];
  message?: MessageResponse;
};

export type UpdateChannelResponse = APIResponse &
  Omit<CreateChannelOptions, 'client_id' | 'connection_id'> & {
    created_at: string;
    updated_at: string;
  };

export type UpdateCommandResponse = APIResponse & {
  command: UpdateCommandOptions &
    CreatedAtUpdatedAt & {
      name: CommandVariants;
    };
};

export type UpdateMessageAPIResponse = APIResponse & {
  message: MessageResponse;
};

export type UsersAPIResponse = APIResponse & {
  users: Array<UserResponse>;
};

export type UpdateUsersAPIResponse = APIResponse & {
  users: { [key: string]: UserResponse };
};

export type UserResponse = CustomUserData & {
  id: string;
  anon?: boolean;
  banned?: boolean;
  blocked_user_ids?: string[];
  created_at?: string;
  deactivated_at?: string;
  deleted_at?: string;
  image?: string;
  language?: TranslationLanguages | '';
  last_active?: string;
  name?: string;
  notifications_muted?: boolean;
  online?: boolean;
  privacy_settings?: PrivacySettings;
  push_notifications?: PushNotificationSettings;
  revoke_tokens_issued_before?: string;
  role?: string;
  shadow_banned?: boolean;
  teams?: string[];
  teams_role?: TeamsRole;
  updated_at?: string;
  username?: string;
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
  review_details?: object;
  user_id?: string;
};

export type BannedUsersPaginationOptions = Omit<
  PaginationOptions,
  'id_gt' | 'id_gte' | 'id_lt' | 'id_lte'
> & {
  exclude_expired_bans?: boolean;
};

export type BanUserOptions = UnBanUserOptions & {
  banned_by?: UserResponse;
  banned_by_id?: string;
  ip_ban?: boolean;
  reason?: string;
  timeout?: number;
  delete_messages?: DeleteMessagesOptions;
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

export type ChannelQueryOptions = {
  client_id?: string;
  connection_id?: string;
  created_by?: UserResponse | null;
  created_by_id?: UserResponse['id'];
  data?: ChannelResponse;
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
  skipHydration?: boolean;
};

export type CreateChannelOptions = {
  automod?: ChannelConfigAutomod;
  automod_behavior?: ChannelConfigAutomodBehavior;
  automod_thresholds?: ChannelConfigAutomodThresholds;
  blocklist?: string;
  blocklist_behavior?: ChannelConfigAutomodBehavior;
  client_id?: string;
  commands?: CommandVariants[];
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
  user_message_reminders?: boolean;
};

export type CreateCommandOptions = {
  description: string;
  name: CommandVariants;
  args?: string;
  set?: CommandVariants;
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

export type NewMemberPayload = CustomMemberData &
  Pick<ChannelMemberResponse, 'user_id' | 'channel_role'>;

export type Thresholds = Record<
  'explicit' | 'spam' | 'toxic',
  Partial<{ block: number; flag: number }>
>;

export type BlockListOptions = {
  behavior: BlocklistBehavior;
  blocklist: string;
};

export type PolicyRequest = {
  action: 'Deny' | 'Allow' | (string & {});
  /**
   * @description User-friendly policy name
   */
  name: string;
  /**
   * @description Whether policy applies to resource owner or not
   */
  owner: boolean;
  priority: number;
  /**
   * @description List of resources to apply policy to
   */
  resources: string[];
  /**
   * @description List of roles to apply policy to
   */
  roles: string[];
};

export type Automod = 'disabled' | 'simple' | 'AI' | (string & {});
export type AutomodBehavior = 'flag' | 'block' | 'shadow_block' | (string & {});
export type BlocklistBehavior = AutomodBehavior;
export type Command = {
  args: string;
  description: string;
  name: string;
  set: string;
  created_at?: string;
  updated_at?: string;
};

export type UpdateChannelTypeRequest =
  // these three properties are required in OpenAPI spec but omitted in some QA tests
  Partial<{
    automod: Automod;
    automod_behavior: AutomodBehavior;
    max_message_length: number;
  }> & {
    allowed_flag_reasons?: string[];
    automod_thresholds?: Thresholds;
    blocklist?: string;
    blocklist_behavior?: BlocklistBehavior;
    blocklists?: BlockListOptions[];
    commands?: CommandVariants[];
    connect_events?: boolean;
    custom_events?: boolean;
    grants?: Record<string, string[]>;
    mark_messages_pending?: boolean;
    mutes?: boolean;
    partition_size?: number;
    /**
     * @example 24h
     */
    partition_ttl?: string | null;
    permissions?: PolicyRequest[];
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

export type UpdateChannelTypeResponse = {
  automod: Automod;
  automod_behavior: AutomodBehavior;
  commands: CommandVariants[];
  connect_events: boolean;
  created_at: string;
  custom_events: boolean;
  duration: string;
  grants: Record<string, string[]>;
  mark_messages_pending: boolean;
  max_message_length: number;
  mutes: boolean;
  name: string;
  permissions: PolicyRequest[];
  polls: boolean;
  push_notifications: boolean;
  quotes: boolean;
  reactions: boolean;
  read_events: boolean;
  reminders: boolean;
  replies: boolean;
  search: boolean;
  skip_last_msg_update_for_system_msgs: boolean;
  typing_events: boolean;
  updated_at: string;
  uploads: boolean;
  url_enrichment: boolean;
  allowed_flag_reasons?: string[];
  automod_thresholds?: Thresholds;
  blocklist?: string;
  blocklist_behavior?: BlocklistBehavior;
  blocklists?: BlockListOptions[];
  partition_size?: number;
  partition_ttl?: string;
};

export type GetChannelTypeResponse = {
  automod: Automod;
  automod_behavior: AutomodBehavior;
  commands: Command[];
  connect_events: boolean;
  created_at: string;
  custom_events: boolean;
  duration: string;
  grants: Record<string, string[]>;
  mark_messages_pending: boolean;
  max_message_length: number;
  mutes: boolean;
  name: string;
  permissions: PolicyRequest[];
  polls: boolean;
  push_notifications: boolean;
  quotes: boolean;
  reactions: boolean;
  read_events: boolean;
  reminders: boolean;
  replies: boolean;
  search: boolean;
  skip_last_msg_update_for_system_msgs: boolean;
  typing_events: boolean;
  updated_at: string;
  uploads: boolean;
  url_enrichment: boolean;
  allowed_flag_reasons?: string[];
  automod_thresholds?: Thresholds;
  blocklist?: string;
  blocklist_behavior?: BlocklistBehavior;
  blocklists?: BlockListOptions[];
  partition_size?: number;
  partition_ttl?: string;
};

export type UpdateChannelOptions = Partial<{
  accept_invite: boolean;
  add_members: string[];
  add_moderators: string[];
  client_id: string;
  connection_id: string;
  data: Omit<ChannelResponse, 'id' | 'cid'>;
  demote_moderators: string[];
  invites: string[];
  message: MessageResponse;
  reject_invite: boolean;
  remove_members: string[];
  user: UserResponse;
  user_id: string;
}>;

export type MarkChannelsReadOptions = {
  client_id?: string;
  connection_id?: string;
  read_by_channel?: Record<string, string>;
  user?: UserResponse;
  user_id?: string;
};

export type MarkReadOptions = {
  client_id?: string;
  connection_id?: string;
  thread_id?: string;
  user?: UserResponse;
  user_id?: string;
};

export type MarkUnreadOptions = {
  client_id?: string;
  connection_id?: string;
  message_id?: string;
  thread_id?: string;
  user?: UserResponse;
  user_id?: string;
};

export type MuteUserOptions = {
  client_id?: string;
  connection_id?: string;
  id?: string;
  reason?: string;
  target_user_id?: string;
  timeout?: number;
  type?: string;
  user?: UserResponse;
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

export type SearchOptions = {
  limit?: number;
  next?: string;
  offset?: number;
  sort?: SearchMessageSort;
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
   * Custom notification manager service to use for the client.
   * If not provided, a default notification manager will be created.
   * Notifications are used to communicate events like errors, warnings, info, etc. Other services can publish notifications or subscribe to the NotificationManager state changes.
   */
  notifications?: NotificationManager;
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

export type UpdateCommandOptions = {
  description: string;
  args?: string;
  set?: CommandVariants;
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

export type Event = CustomEventData & {
  type: EventTypes;
  ai_message?: string;
  ai_state?: AIState;
  channel?: ChannelResponse;
  channel_id?: string;
  channel_type?: string;
  cid?: string;
  clear_history?: boolean;
  connection_id?: string;
  // event creation timestamp, format Date ISO string
  created_at?: string;
  draft?: DraftResponse;
  // id of the message that was marked as unread - all the following messages are considered unread. (notification.mark_unread)
  first_unread_message_id?: string;
  hard_delete?: boolean;
  // creation date of a message with last_read_message_id, formatted as Date ISO string
  last_read_at?: string;
  last_read_message_id?: string;
  live_location?: SharedLocationResponse;
  mark_messages_deleted?: boolean;
  me?: OwnUserResponse;
  member?: ChannelMemberResponse;
  message?: MessageResponse;
  message_id?: string;
  mode?: string;
  online?: boolean;
  own_capabilities?: string[];
  parent_id?: string;
  poll?: PollResponse;
  poll_vote?: PollVote | PollAnswer;
  queriedChannels?: {
    channels: ChannelAPIResponse[];
    isLatestMessageSet?: boolean;
  };
  offlineReactions?: ReactionResponse[];
  reaction?: ReactionResponse;
  received_at?: string | Date;
  reminder?: ReminderResponse;
  shadow?: boolean;
  team?: string;
  thread?: ThreadResponse;
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
  user?: UserResponse;
  user_id?: string;
  watcher_count?: number;
  channel_last_message_at?: string;
  app?: Record<string, unknown>; // TODO: further specify type
};

export type UserCustomEvent = CustomEventData & {
  type: string;
};

export type EventHandler = (event: Event) => void;

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
      | RequireOnlyOne<
          Pick<QueryFilter<MessageFlagsFiltersOptions['channel_cid']>, '$eq' | '$in'>
        >
      | PrimitiveFilter<MessageFlagsFiltersOptions['channel_cid']>;
  } & {
    team?:
      | RequireOnlyOne<
          Pick<QueryFilter<MessageFlagsFiltersOptions['team']>, '$eq' | '$in'>
        >
      | PrimitiveFilter<MessageFlagsFiltersOptions['team']>;
  } & {
    user_id?:
      | RequireOnlyOne<
          Pick<QueryFilter<MessageFlagsFiltersOptions['user_id']>, '$eq' | '$in'>
        >
      | PrimitiveFilter<MessageFlagsFiltersOptions['user_id']>;
  } & {
    [Key in keyof Omit<
      MessageFlagsFiltersOptions,
      'channel_cid' | 'user_id' | 'is_reviewed'
    >]:
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
      | RequireOnlyOne<
          Pick<QueryFilter<FlagsFiltersOptions['message_id']>, '$eq' | '$in'>
        >
      | PrimitiveFilter<FlagsFiltersOptions['message_id']>;
  } & {
    message_user_id?:
      | RequireOnlyOne<
          Pick<QueryFilter<FlagsFiltersOptions['message_user_id']>, '$eq' | '$in'>
        >
      | PrimitiveFilter<FlagsFiltersOptions['message_user_id']>;
  } & {
    channel_cid?:
      | RequireOnlyOne<
          Pick<QueryFilter<FlagsFiltersOptions['channel_cid']>, '$eq' | '$in'>
        >
      | PrimitiveFilter<FlagsFiltersOptions['channel_cid']>;
  } & {
    reporter_id?:
      | RequireOnlyOne<
          Pick<QueryFilter<FlagsFiltersOptions['reporter_id']>, '$eq' | '$in'>
        >
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
      | RequireOnlyOne<
          Pick<QueryFilter<FlagReportsFiltersOptions['report_id']>, '$eq' | '$in'>
        >
      | PrimitiveFilter<FlagReportsFiltersOptions['report_id']>;
  } & {
    review_result?:
      | RequireOnlyOne<
          Pick<QueryFilter<FlagReportsFiltersOptions['review_result']>, '$eq' | '$in'>
        >
      | PrimitiveFilter<FlagReportsFiltersOptions['review_result']>;
  } & {
    reviewed_by?:
      | RequireOnlyOne<
          Pick<QueryFilter<FlagReportsFiltersOptions['reviewed_by']>, '$eq' | '$in'>
        >
      | PrimitiveFilter<FlagReportsFiltersOptions['reviewed_by']>;
  } & {
    user_id?:
      | RequireOnlyOne<
          Pick<QueryFilter<FlagReportsFiltersOptions['user_id']>, '$eq' | '$in'>
        >
      | PrimitiveFilter<FlagReportsFiltersOptions['user_id']>;
  } & {
    message_id?:
      | RequireOnlyOne<
          Pick<QueryFilter<FlagReportsFiltersOptions['message_id']>, '$eq' | '$in'>
        >
      | PrimitiveFilter<FlagReportsFiltersOptions['message_id']>;
  } & {
    message_user_id?:
      | RequireOnlyOne<
          Pick<QueryFilter<FlagReportsFiltersOptions['message_user_id']>, '$eq' | '$in'>
        >
      | PrimitiveFilter<FlagReportsFiltersOptions['message_user_id']>;
  } & {
    channel_cid?:
      | RequireOnlyOne<
          Pick<QueryFilter<FlagReportsFiltersOptions['channel_cid']>, '$eq' | '$in'>
        >
      | PrimitiveFilter<FlagReportsFiltersOptions['channel_cid']>;
  } & {
    team?:
      | RequireOnlyOne<
          Pick<QueryFilter<FlagReportsFiltersOptions['team']>, '$eq' | '$in'>
        >
      | PrimitiveFilter<FlagReportsFiltersOptions['team']>;
  } & {
    [Key in keyof Omit<
      FlagReportsFiltersOptions,
      'report_id' | 'user_id' | 'message_id' | 'review_result' | 'reviewed_by'
    >]:
      | RequireOnlyOne<QueryFilter<FlagReportsFiltersOptions[Key]>>
      | PrimitiveFilter<FlagReportsFiltersOptions[Key]>;
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

export type ReactionFilters = QueryFilters<
  {
    user_id?:
      | RequireOnlyOne<Pick<QueryFilter<ReactionResponse['user_id']>, '$eq' | '$in'>>
      | PrimitiveFilter<ReactionResponse['user_id']>;
  } & {
    type?:
      | RequireOnlyOne<Pick<QueryFilter<ReactionResponse['type']>, '$eq'>>
      | PrimitiveFilter<ReactionResponse['type']>;
  } & {
    created_at?:
      | RequireOnlyOne<
          Pick<
            QueryFilter<PollResponse['created_at']>,
            '$eq' | '$gt' | '$lt' | '$gte' | '$lte'
          >
        >
      | PrimitiveFilter<PollResponse['created_at']>;
  }
>;

export type ChannelFilters = QueryFilters<
  ContainsOperator<Omit<CustomChannelData, 'name'>> & {
    archived?: boolean;
    'member.user.name'?:
      | RequireOnlyOne<{
          $autocomplete?: string;
          $eq?: string;
        }>
      | string;

    members?:
      | RequireOnlyOne<Pick<QueryFilter<string>, '$in'>>
      | RequireOnlyOne<Pick<QueryFilter<string[]>, '$eq'>>
      | PrimitiveFilter<string[]>;
    name?:
      | RequireOnlyOne<
          {
            $autocomplete?: string;
          } & QueryFilter<string>
        >
      | PrimitiveFilter<string>;
    pinned?: boolean;
  } & {
    [Key in keyof Omit<ChannelResponse, 'name' | 'members' | keyof CustomChannelData>]:
      | RequireOnlyOne<QueryFilter<ChannelResponse[Key]>>
      | PrimitiveFilter<ChannelResponse[Key]>;
  }
>;

export type DraftFilters = {
  channel_cid?:
    | RequireOnlyOne<Pick<QueryFilter<DraftResponse['channel_cid']>, '$in' | '$eq'>>
    | PrimitiveFilter<DraftResponse['channel_cid']>;
  created_at?:
    | RequireOnlyOne<
        Pick<
          QueryFilter<DraftResponse['created_at']>,
          '$eq' | '$gt' | '$lt' | '$gte' | '$lte'
        >
      >
    | PrimitiveFilter<DraftResponse['created_at']>;
  parent_id?:
    | RequireOnlyOne<
        Pick<QueryFilter<DraftResponse['created_at']>, '$in' | '$eq' | '$exists'>
      >
    | PrimitiveFilter<DraftResponse['parent_id']>;
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
    id?:
      | RequireOnlyOne<Pick<QueryFilter<PollResponse['id']>, '$eq' | '$in'>>
      | PrimitiveFilter<PollResponse['id']>;
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
          Pick<
            QueryFilter<PollResponse['max_votes_allowed']>,
            '$eq' | '$gt' | '$lt' | '$gte' | '$lte'
          >
        >
      | PrimitiveFilter<PollResponse['max_votes_allowed']>;
  } & {
    allow_answers?:
      | RequireOnlyOne<Pick<QueryFilter<PollResponse['allow_answers']>, '$eq'>>
      | PrimitiveFilter<PollResponse['allow_answers']>;
  } & {
    allow_user_suggested_options?:
      | RequireOnlyOne<
          Pick<QueryFilter<PollResponse['allow_user_suggested_options']>, '$eq'>
        >
      | PrimitiveFilter<PollResponse['allow_user_suggested_options']>;
  } & {
    voting_visibility?:
      | RequireOnlyOne<Pick<QueryFilter<PollResponse['voting_visibility']>, '$eq'>>
      | PrimitiveFilter<PollResponse['voting_visibility']>;
  } & {
    created_at?:
      | RequireOnlyOne<
          Pick<
            QueryFilter<PollResponse['created_at']>,
            '$eq' | '$gt' | '$lt' | '$gte' | '$lte'
          >
        >
      | PrimitiveFilter<PollResponse['created_at']>;
  } & {
    created_by_id?:
      | RequireOnlyOne<Pick<QueryFilter<PollResponse['created_by_id']>, '$eq' | '$in'>>
      | PrimitiveFilter<PollResponse['created_by_id']>;
  } & {
    updated_at?:
      | RequireOnlyOne<
          Pick<
            QueryFilter<PollResponse['updated_at']>,
            '$eq' | '$gt' | '$lt' | '$gte' | '$lte'
          >
        >
      | PrimitiveFilter<PollResponse['updated_at']>;
  } & {
    name?:
      | RequireOnlyOne<Pick<QueryFilter<PollResponse['name']>, '$eq' | '$in'>>
      | PrimitiveFilter<PollResponse['name']>;
  }
>;

export type QueryVotesFilters = QueryFilters<
  {
    id?:
      | RequireOnlyOne<Pick<QueryFilter<PollResponse['id']>, '$eq' | '$in'>>
      | PrimitiveFilter<PollResponse['id']>;
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
      | RequireOnlyOne<
          Pick<
            QueryFilter<PollResponse['created_at']>,
            '$eq' | '$gt' | '$lt' | '$gte' | '$lte'
          >
        >
      | PrimitiveFilter<PollResponse['created_at']>;
  } & {
    created_by_id?:
      | RequireOnlyOne<Pick<QueryFilter<PollResponse['created_by_id']>, '$eq' | '$in'>>
      | PrimitiveFilter<PollResponse['created_by_id']>;
  } & {
    updated_at?:
      | RequireOnlyOne<
          Pick<
            QueryFilter<PollResponse['updated_at']>,
            '$eq' | '$gt' | '$lt' | '$gte' | '$lte'
          >
        >
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

export type MessageFilters = QueryFilters<
  ContainsOperator<CustomMessageData> & {
    'attachments.type'?:
      | RequireOnlyOne<{
          $eq: PrimitiveFilter<Attachment['type']>;
          $in: PrimitiveFilter<Attachment['type']>[];
        }>
      | PrimitiveFilter<Attachment['type']>;
    'mentioned_users.id'?: RequireOnlyOne<{
      $contains: PrimitiveFilter<UserResponse['id']>;
    }>;
    text?:
      | RequireOnlyOne<
          {
            $autocomplete?: MessageResponse['text'];
            $q?: MessageResponse['text'];
          } & QueryFilter<MessageResponse['text']>
        >
      | PrimitiveFilter<MessageResponse['text']>;
    'user.id'?:
      | RequireOnlyOne<
          {
            $autocomplete?: UserResponse['id'];
          } & QueryFilter<UserResponse['id']>
        >
      | PrimitiveFilter<UserResponse['id']>;
  } & {
    [Key in keyof Omit<MessageResponse, 'text' | keyof CustomMessageData>]?:
      | RequireOnlyOne<QueryFilter<MessageResponse[Key]>>
      | PrimitiveFilter<MessageResponse[Key]>;
  }
>;

export type MessageOptions = {
  include_thread_participants?: boolean;
};

export type PrimitiveFilter<ObjectType> = ObjectType | null;

export type QueryFilter<ObjectType = string> =
  NonNullable<ObjectType> extends string | number | boolean
    ? {
        $eq?: PrimitiveFilter<ObjectType>;
        $exists?: boolean;
        $gt?: PrimitiveFilter<ObjectType>;
        $gte?: PrimitiveFilter<ObjectType>;
        $in?: PrimitiveFilter<ObjectType>[];
        $lt?: PrimitiveFilter<ObjectType>;
        $lte?: PrimitiveFilter<ObjectType>;
      }
    : {
        $eq?: PrimitiveFilter<ObjectType>;
        $exists?: boolean;
        $in?: PrimitiveFilter<ObjectType>[];
      };

export type QueryFilters<Operators = {}> = {
  [Key in keyof Operators]?: Operators[Key];
} & QueryLogicalOperators<Operators>;

export type QueryLogicalOperators<Operators> = {
  $and?: ArrayOneOrMore<QueryFilters<Operators>>;
  $nor?: ArrayOneOrMore<QueryFilters<Operators>>;
  $or?: ArrayTwoOrMore<QueryFilters<Operators>>;
};

export type UserFilters = QueryFilters<
  ContainsOperator<CustomUserData> & {
    id?:
      | RequireOnlyOne<
          { $autocomplete?: UserResponse['id'] } & QueryFilter<UserResponse['id']>
        >
      | PrimitiveFilter<UserResponse['id']>;
    name?:
      | RequireOnlyOne<
          { $autocomplete?: UserResponse['name'] } & QueryFilter<UserResponse['name']>
        >
      | PrimitiveFilter<UserResponse['name']>;
    notifications_muted?:
      | RequireOnlyOne<{
          $eq?: PrimitiveFilter<UserResponse['notifications_muted']>;
        }>
      | boolean;
    teams?:
      | RequireOnlyOne<{
          $contains?: PrimitiveFilter<string>;
          $eq?: PrimitiveFilter<UserResponse['teams']>;
          $in?: PrimitiveFilter<UserResponse['teams']>;
        }>
      | PrimitiveFilter<UserResponse['teams']>;
    username?:
      | RequireOnlyOne<
          { $autocomplete?: UserResponse['username'] } & QueryFilter<
            UserResponse['username']
          >
        >
      | PrimitiveFilter<UserResponse['username']>;
  } & {
    [Key in keyof Omit<
      UserResponse,
      'id' | 'name' | 'teams' | 'username' | keyof CustomUserData
    >]?:
      | RequireOnlyOne<QueryFilter<UserResponse[Key]>>
      | PrimitiveFilter<UserResponse[Key]>;
  }
>;

export type InviteStatus = 'pending' | 'accepted' | 'rejected';

// https://getstream.io/chat/docs/react/channel_member/#update-channel-members
export type MemberFilters = QueryFilters<
  {
    banned?: { $eq?: ChannelMemberResponse['banned'] } | ChannelMemberResponse['banned'];
    channel_role?:
      | { $eq?: ChannelMemberResponse['channel_role'] }
      | ChannelMemberResponse['channel_role'];
    cid?: { $eq?: ChannelResponse['cid'] } | ChannelResponse['cid'];
    created_at?:
      | {
          $eq?: ChannelMemberResponse['created_at'];
          $gt?: ChannelMemberResponse['created_at'];
          $gte?: ChannelMemberResponse['created_at'];
          $lt?: ChannelMemberResponse['created_at'];
          $lte?: ChannelMemberResponse['created_at'];
        }
      | ChannelMemberResponse['created_at'];
    id?:
      | RequireOnlyOne<{
          $eq?: UserResponse['id'];
          $in?: UserResponse['id'][];
        }>
      | UserResponse['id'];
    invite?: { $eq?: ChannelMemberResponse['status'] } | ChannelMemberResponse['status'];
    is_moderator?:
      | RequireOnlyOne<{ $eq?: ChannelMemberResponse['is_moderator'] }>
      | ChannelMemberResponse['is_moderator'];
    joined?: { $eq?: boolean } | boolean;
    last_active?:
      | {
          $eq?: UserResponse['last_active'];
          $gt?: UserResponse['last_active'];
          $gte?: UserResponse['last_active'];
          $lt?: UserResponse['last_active'];
          $lte?: UserResponse['last_active'];
        }
      | UserResponse['last_active'];
    name?:
      | RequireOnlyOne<{
          $autocomplete?: NonNullable<ChannelMemberResponse['user']>['name'];
          $eq?: NonNullable<ChannelMemberResponse['user']>['name'];
          $in?: NonNullable<ChannelMemberResponse['user']>['name'][];
          $q?: NonNullable<ChannelMemberResponse['user']>['name'];
        }>
      | PrimitiveFilter<NonNullable<ChannelMemberResponse['user']>['name']>;
    notifications_muted?:
      | RequireOnlyOne<{ $eq?: ChannelMemberResponse['notifications_muted'] }>
      | ChannelMemberResponse['notifications_muted'];
    updated_at?:
      | {
          $eq?: ChannelMemberResponse['updated_at'];
          $gt?: ChannelMemberResponse['updated_at'];
          $gte?: ChannelMemberResponse['updated_at'];
          $lt?: ChannelMemberResponse['updated_at'];
          $lte?: ChannelMemberResponse['updated_at'];
        }
      | ChannelMemberResponse['updated_at'];
    'user.email'?:
      | RequireOnlyOne<{
          $autocomplete?: string;
          $eq?: string;
          $in?: string;
        }>
      | string;
    user_id?:
      | RequireOnlyOne<{
          $eq?: ChannelMemberResponse['user_id'];
          $in?: ChannelMemberResponse['user_id'][];
        }>
      | PrimitiveFilter<ChannelMemberResponse['user_id']>;
  } & {
    [Key in keyof ContainsOperator<CustomMemberData>]?:
      | RequireOnlyOne<QueryFilter<ContainsOperator<CustomMemberData>[Key]>>
      | PrimitiveFilter<ContainsOperator<CustomMemberData>[Key]>;
  }
>;

/**
 * Sort Types
 */

export type BannedUsersSort = BannedUsersSortBase | Array<BannedUsersSortBase>;

export type BannedUsersSortBase = { created_at?: AscDesc };

export type ReactionSort = ReactionSortBase | Array<ReactionSortBase>;

export type ReactionSortBase = Sort<CustomReactionData> & {
  created_at?: AscDesc;
};

export type ChannelSort = ChannelSortBase | Array<ChannelSortBase>;

export type ChannelSortBase = Sort<CustomChannelData> & {
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

export type UserSort = Sort<UserResponse> | Array<Sort<UserResponse>>;

export type MemberSort =
  | Sort<
      Pick<UserResponse, 'created_at' | 'last_active' | 'name' | 'updated_at'> & {
        user_id?: string;
      }
    >
  | Array<
      Sort<
        Pick<UserResponse, 'created_at' | 'last_active' | 'name' | 'updated_at'> & {
          user_id?: string;
        }
      >
    >;

export type SearchMessageSortBase = Sort<CustomMessageData> & {
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

export type SearchMessageSort = SearchMessageSortBase | Array<SearchMessageSortBase>;

export type QuerySort = BannedUsersSort | ChannelSort | SearchMessageSort | UserSort;

export type DraftSortBase = {
  created_at?: AscDesc;
};

export type DraftSort = DraftSortBase | Array<DraftSortBase>;

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

export type AsyncModerationOptions = {
  callback?: {
    mode?: 'CALLBACK_MODE_NONE' | 'CALLBACK_MODE_REST' | 'CALLBACK_MODE_TWIRP';
    server_url?: string;
  };
  timeout_ms?: number;
};

export type AppSettings = {
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
  event_hooks?: Array<EventHook> | null;
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

export type Attachment = CustomAttachmentData & {
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
  stopped_sharing?: boolean;
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

export type ChannelConfig = ChannelConfigFields &
  CreatedAtUpdatedAt & {
    commands?: CommandVariants[];
  };

export type ChannelConfigAutomod = Automod;

export type ChannelConfigAutomodBehavior = AutomodBehavior;

export type ChannelConfigAutomodThresholds = null | Thresholds;

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
  user_message_reminders?: boolean; // Feature flag for user message reminders
};

export type ChannelConfigWithInfo = ChannelConfigFields &
  CreatedAtUpdatedAt & {
    commands?: CommandResponse[];
  };

export type ChannelData = CustomChannelData &
  Partial<{
    blocked: boolean;
    created_by: UserResponse | null;
    created_by_id: UserResponse['id'];
    members: string[] | Array<NewMemberPayload>;
    blocklist_behavior: AutomodBehavior;
    automod: Automod;
  }>;

export type ChannelMute = {
  user: UserResponse;
  channel?: ChannelResponse;
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

export type CheckPushInput = {
  apn_template?: string;
  client_id?: string;
  connection_id?: string;
  firebase_data_template?: string;
  firebase_template?: string;
  message_id?: string;
  user?: UserResponse;
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

export type CommandVariants =
  | 'all'
  | 'ban'
  | 'fun_set'
  | 'giphy'
  | 'moderation_set'
  | 'mute'
  | 'unban'
  | 'unmute'
  | keyof CustomCommandData;

export type Configs = Record<string, ChannelConfigWithInfo | undefined>;

export type ConnectionOpen = {
  connection_id: string;
  cid?: string;
  created_at?: string;
  me?: OwnUserResponse;
  type?: string;
};

export type CreatedAtUpdatedAt = {
  created_at: string;
  updated_at: string;
};

export type Device = DeviceFields & {
  provider?: string;
  user?: UserResponse;
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
  | 'DBDeleteChannelType'
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

export type ExportChannelRequest = (
  | {
      id: string;
      type: string;
    }
  | {
      cid: string;
    }
) & { messages_since?: Date; messages_until?: Date };

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

export type Logger = (
  logLevel: LogLevel,
  message: string,
  extraData?: Record<string, unknown>,
) => void;

export type Message = Partial<
  MessageBase & {
    mentioned_users: string[];
    shared_location?: SharedLocationRequest;
  }
>;

export type MessageBase = CustomMessageData & {
  id: string;
  attachments?: Attachment[];
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
  type?: MessageLabel;
  user?: UserResponse | null;
  user_id?: string;
};

export type MessageLabel =
  | 'deleted'
  | 'ephemeral'
  | 'error'
  | 'regular'
  | 'reply'
  | 'system';

export type SendMessageOptions = {
  force_moderation?: boolean;
  // @deprecated use `pending` instead
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

export type Mute = {
  created_at: string;
  target: UserResponse;
  updated_at: string;
  user: UserResponse;
};

export type PartialUpdateChannel = {
  set?: Partial<ChannelResponse>;
  unset?: Array<keyof ChannelResponse>;
};

export type PartialUpdateMember = {
  set?: ChannelMemberUpdates;
  unset?: Array<keyof ChannelMemberUpdates>;
};

export type PartialUserUpdate = {
  id: string;
  set?: Partial<UserResponse>;
  unset?: Array<keyof UserResponse>;
};

export type MessageUpdatableFields = Omit<
  MessageResponse,
  'cid' | 'created_at' | 'updated_at' | 'deleted_at' | 'user' | 'user_id'
>;

export type PartialMessageUpdate = {
  set?: Partial<MessageUpdatableFields>;
  unset?: Array<keyof MessageUpdatableFields>;
};

export type PendingMessageResponse = {
  message: MessageResponse;
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

export type Reaction = CustomReactionData & {
  type: string;
  message_id?: string;
  score?: number;
  user?: UserResponse | null;
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

export type SearchPayload = Omit<SearchOptions, 'sort'> & {
  client_id?: string;
  connection_id?: string;
  filter_conditions?: ChannelFilters;
  message_filter_conditions?: MessageFilters;
  message_options?: MessageOptions;
  query?: string;
  sort?: Array<{
    direction: AscDesc;
    field: keyof SearchMessageSortBase;
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
  | 'zh-TW'
  | (string & {});

export type TypingStartEvent = Event;

export type ReservedUpdatedMessageFields = keyof typeof RESERVED_UPDATED_MESSAGE_FIELDS;

export type UpdatedMessage = Omit<MessageResponse, ReservedUpdatedMessageFields> & {
  mentioned_users?: string[];
  type?: MessageLabel;
};

/**
 * @description type alias for UserResponse
 */
export type User = UserResponse;

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

export type TruncateOptions = {
  hard_delete?: boolean;
  message?: Message;
  skip_push?: boolean;
  truncated_at?: Date;
  user?: UserResponse;
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
export type MessageSet = {
  isCurrent: boolean;
  isLatest: boolean;
  messages: LocalMessage[];
  pagination: { hasNext: boolean; hasPrev: boolean };
};

export type PushProviderUpsertResponse = {
  push_provider: PushProvider;
};

export type PushProviderListResponse = {
  push_providers: PushProvider[];
};

type ErrorResponseDetails = {
  code: number;
  messages: string[];
};

export type APIErrorResponse = {
  duration: string;
  message: string;
  more_info: string;
  StatusCode: number;
  code?: number;
  details?: ErrorResponseDetails;
};

export class ErrorFromResponse<T> extends Error {
  public code: number | null;
  public status: number;
  public response: AxiosResponse<T>;
  public name = 'ErrorFromResponse';

  constructor(
    message: string,
    {
      code,
      status,
      response,
    }: {
      code: ErrorFromResponse<T>['code'];
      response: ErrorFromResponse<T>['response'];
      status: ErrorFromResponse<T>['status'];
    },
  ) {
    super(message);
    this.code = code;
    this.response = response;
    this.status = status;
  }

  // Vitest helper (serialized errors are too large to read)
  // https://github.com/vitest-dev/vitest/blob/v3.1.3/packages/utils/src/error.ts#L60-L62
  toJSON() {
    const extra = [
      ['status', this.status],
      ['code', this.code],
    ] as const;

    const joinable = [];

    for (const [key, value] of extra) {
      if (typeof value !== 'undefined' && value !== null) {
        joinable.push(`${key}: ${value}`);
      }
    }

    return {
      message: `(${joinable.join(', ')}) - ${this.message}`,
      stack: this.stack,
      name: this.name,
      code: this.code,
      status: this.status,
    } as const;
  }
}

export type QueryPollsResponse = {
  polls: PollResponse[];
  next?: string;
};

export type CreatePollAPIResponse = {
  poll: PollResponse;
};

export type GetPollAPIResponse = {
  poll: PollResponse;
};

export type UpdatePollAPIResponse = {
  poll: PollResponse;
};

export type PollResponse = CustomPollData &
  PollEnrichData & {
    created_at: string;
    created_by: UserResponse | null;
    created_by_id: string;
    enforce_unique_vote: boolean;
    id: string;
    max_votes_allowed: number;
    name: string;
    options: PollOption[];
    updated_at: string;
    allow_answers?: boolean;
    allow_user_suggested_options?: boolean;
    description?: string;
    is_closed?: boolean;
    voting_visibility?: VotingVisibility;
  };

export type PollOption = {
  created_at: string;
  id: string;
  poll_id: string;
  text: string;
  updated_at: string;
  vote_count: number;
  votes?: PollVote[];
};

export enum VotingVisibility {
  anonymous = 'anonymous',
  public = 'public',
}

export type PollEnrichData = {
  answers_count: number;
  latest_answers: PollAnswer[]; // not updated with WS events, ordered DESC by created_at, seems like updated_at cannot be different from created_at
  latest_votes_by_option: Record<string, PollVote[]>; // not updated with WS events; always null in anonymous polls
  vote_count: number;
  vote_counts_by_option: Record<string, number>;
  own_votes?: (PollVote | PollAnswer)[]; // not updated with WS events
};

export type PollData = CustomPollData & {
  id: string;
  name: string;
  allow_answers?: boolean;
  allow_user_suggested_options?: boolean;
  description?: string;
  enforce_unique_vote?: boolean;
  is_closed?: boolean;
  max_votes_allowed?: number;
  options?: PollOptionData[];
  user_id?: string;
  voting_visibility?: VotingVisibility;
};

export type CreatePollData = Partial<PollData> & Pick<PollData, 'name'>;

export type PartialPollUpdate = {
  set?: Partial<PollData>;
  unset?: Array<keyof PollData>;
};

export type PollOptionData = CustomPollOptionData & {
  text: string;
  id?: string;
  position?: number;
};

export type PartialPollOptionUpdate = {
  set?: Partial<PollOptionResponse>;
  unset?: Array<keyof PollOptionResponse>;
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

export type CreatePollOptionAPIResponse = {
  poll_option: PollOptionResponse;
};

export type GetPollOptionAPIResponse = CreatePollOptionAPIResponse;
export type UpdatePollOptionAPIResponse = CreatePollOptionAPIResponse;

export type PollOptionResponse = CustomPollData & {
  created_at: string;
  id: string;
  poll_id: string;
  position: number;
  text: string;
  updated_at: string;
  vote_count: number;
  votes?: PollVote[];
};

export type PollVote = {
  created_at: string;
  id: string;
  poll_id: string;
  updated_at: string;
  option_id?: string;
  user?: UserResponse;
  user_id?: string;
};

export type PollAnswer = Exclude<PollVote, 'option_id'> & {
  answer_text: string;
  is_answer: boolean; // this is absolutely redundant prop as answer_text indicates that a vote is an answer
};

export type PollVotesAPIResponse = {
  votes: (PollVote | PollAnswer)[];
  next?: string;
};

export type PollAnswersAPIResponse = {
  votes: PollAnswer[]; // todo: should be changes to answers?
  next?: string;
};

export type CastVoteAPIResponse = {
  vote: PollVote | PollAnswer;
};

export type QueryMessageHistoryFilters = QueryFilters<
  {
    message_id?:
      | RequireOnlyOne<
          Pick<QueryFilter<MessageHistoryEntry['message_id']>, '$eq' | '$in'>
        >
      | PrimitiveFilter<MessageHistoryEntry['message_id']>;
  } & {
    user_id?:
      | RequireOnlyOne<
          Pick<QueryFilter<MessageHistoryEntry['message_updated_by_id']>, '$eq' | '$in'>
        >
      | PrimitiveFilter<MessageHistoryEntry['message_updated_by_id']>;
  } & {
    created_at?:
      | RequireOnlyOne<
          Pick<
            QueryFilter<MessageHistoryEntry['message_updated_at']>,
            '$eq' | '$gt' | '$lt' | '$gte' | '$lte'
          >
        >
      | PrimitiveFilter<MessageHistoryEntry['message_updated_at']>;
  }
>;

export type QueryMessageHistorySort =
  | QueryMessageHistorySortBase
  | Array<QueryMessageHistorySortBase>;

export type QueryMessageHistorySortBase = {
  message_updated_at?: AscDesc;
  message_updated_by_id?: AscDesc;
};

export type QueryMessageHistoryOptions = Pager;

export type MessageHistoryEntry = {
  message_id: string;
  message_updated_at: string;
  attachments?: Attachment[];
  message_updated_by_id?: string;
  text?: string;
};

export type QueryMessageHistoryResponse = {
  message_history: MessageHistoryEntry[];
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

export type DeleteMessagesOptions = 'soft' | 'hard';

export type SubmitActionOptions = {
  ban?: {
    channel_ban_only?: boolean;
    reason?: string;
    timeout?: number;
    delete_messages?: DeleteMessagesOptions;
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

export type GetUserModerationReportResponse = {
  user: UserResponse;
  user_blocks?: Array<{
    blocked_at: string;
    blocked_by_user_id: string;
    blocked_user_id: string;
  }>;
  user_mutes?: Mute[];
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
      | RequireOnlyOne<
          Pick<
            QueryFilter<ReviewQueueItem['completed_at']>,
            '$eq' | '$gt' | '$lt' | '$gte' | '$lte'
          >
        >
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
      | RequireOnlyOne<
          Pick<
            QueryFilter<ReviewQueueItem['created_at']>,
            '$eq' | '$gt' | '$lt' | '$gte' | '$lte'
          >
        >
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
      | RequireOnlyOne<
          Pick<
            QueryFilter<ReviewQueueItem['reviewed_at']>,
            '$eq' | '$gt' | '$lt' | '$gte' | '$lte'
          >
        >
      | PrimitiveFilter<ReviewQueueItem['reviewed_at']>;
  } & {
    status?:
      | RequireOnlyOne<Pick<QueryFilter<ReviewQueueItem['status']>, '$eq' | '$in'>>
      | PrimitiveFilter<ReviewQueueItem['status']>;
  } & {
    updated_at?:
      | RequireOnlyOne<
          Pick<
            QueryFilter<ReviewQueueItem['updated_at']>,
            '$eq' | '$gt' | '$lt' | '$gte' | '$lte'
          >
        >
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

export type ModerationActionType =
  | 'flag'
  | 'shadow'
  | 'remove'
  | 'bounce'
  | 'bounce_flag'
  | 'bounce_remove';

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

export type PromoteChannelParams = {
  channels: Array<Channel>;
  channelToMove: Channel;
  sort: ChannelSort;
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
export type SdkIdentifier = {
  name: 'react' | 'react-native' | 'expo' | 'angular';
  version: string;
};

/**
 * An identifier containing information about the downstream device using stream-chat, if
 * available. Is used by the react-native SDKs to enrich the user agent further.
 */
export type DeviceIdentifier = { os: string; model?: string };

export type DraftResponse = {
  channel_cid: string;
  created_at: string;
  message: DraftMessage;
  channel?: ChannelResponse;
  parent_id?: string;
  parent_message?: MessageResponseBase;
  quoted_message?: MessageResponseBase;
};

export type CreateDraftResponse = APIResponse & {
  draft: DraftResponse;
};

export type GetDraftResponse = APIResponse & {
  draft: DraftResponse;
};

export type QueryDraftsResponse = APIResponse & {
  drafts: DraftResponse[];
} & Omit<Pager, 'limit'>;

export type DraftMessagePayload = PartializeKeys<DraftMessage, 'id'> & {
  user_id?: string;
};

export type DraftMessage = {
  id: string;
  text: string;
  attachments?: Attachment[];
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

export type ActiveLiveLocationsAPIResponse = APIResponse & {
  active_live_locations: SharedLocationResponse[];
};

export type SharedLocationResponse = {
  channel_cid: string;
  created_at: string;
  created_by_device_id: string;
  end_at?: string;
  latitude: number;
  longitude: number;
  message_id: string;
  updated_at: string;
  user_id: string;
};

export type SharedLocationRequest = {
  created_by_device_id: string;
  end_at?: string;
  latitude?: number;
  longitude?: number;
  message_id: string;
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
    channel_cid?:
      | RequireOnlyOne<Pick<QueryFilter<string>, '$eq' | '$in'>>
      | PrimitiveFilter<string>;
  } & {
    parent_message_id?:
      | RequireOnlyOne<
          Pick<QueryFilter<ThreadResponse['parent_message_id']>, '$eq' | '$in'>
        >
      | PrimitiveFilter<ThreadResponse['parent_message_id']>;
  } & {
    created_by_user_id?:
      | RequireOnlyOne<
          Pick<QueryFilter<ThreadResponse['created_by_user_id']>, '$eq' | '$in'>
        >
      | PrimitiveFilter<ThreadResponse['created_by_user_id']>;
  } & {
    created_at?:
      | RequireOnlyOne<
          Pick<
            QueryFilter<ThreadResponse['created_at']>,
            '$eq' | '$gt' | '$lt' | '$gte' | '$lte'
          >
        >
      | PrimitiveFilter<ThreadResponse['created_at']>;
  } & {
    updated_at?:
      | RequireOnlyOne<
          Pick<
            QueryFilter<ThreadResponse['updated_at']>,
            '$eq' | '$gt' | '$lt' | '$gte' | '$lte'
          >
        >
      | PrimitiveFilter<ThreadResponse['updated_at']>;
  } & {
    last_message_at?:
      | RequireOnlyOne<
          Pick<
            QueryFilter<ThreadResponse['last_message_at']>,
            '$eq' | '$gt' | '$lt' | '$gte' | '$lte'
          >
        >
      | PrimitiveFilter<ThreadResponse['last_message_at']>;
  }
>;

export type ReminderResponseBase = {
  channel_cid: string;
  created_at: string;
  message_id: string;
  updated_at: string;
  user_id: string;
  remind_at?: string;
};

export type ReminderResponse = ReminderResponseBase & {
  user: UserResponse;
  message: MessageResponse;
};

export type ReminderAPIResponse = APIResponse & {
  reminder: ReminderResponse;
};

export type CreateReminderOptions = {
  messageId: string;
  remind_at?: string | null;
  user_id?: string;
};

export type UpdateReminderOptions = CreateReminderOptions;

export type ReminderFilters = QueryFilters<{
  channel_cid?:
    | RequireOnlyOne<
        Pick<QueryFilter<ReminderResponseBase['channel_cid']>, '$eq' | '$in'>
      >
    | PrimitiveFilter<ReminderResponseBase['channel_cid']>;
  created_at?:
    | RequireOnlyOne<
        Pick<
          QueryFilter<ReminderResponseBase['created_at']>,
          '$eq' | '$gt' | '$lt' | '$gte' | '$lte'
        >
      >
    | PrimitiveFilter<ReminderResponseBase['created_at']>;
  message_id?:
    | RequireOnlyOne<Pick<QueryFilter<ReminderResponseBase['message_id']>, '$eq' | '$in'>>
    | PrimitiveFilter<ReminderResponseBase['message_id']>;
  remind_at?:
    | RequireOnlyOne<
        Pick<
          QueryFilter<ReminderResponseBase['remind_at']>,
          '$eq' | '$gt' | '$lt' | '$gte' | '$lte'
        >
      >
    | PrimitiveFilter<ReminderResponseBase['remind_at']>;
  user_id?:
    | RequireOnlyOne<Pick<QueryFilter<ReminderResponseBase['user_id']>, '$eq' | '$in'>>
    | PrimitiveFilter<ReminderResponseBase['user_id']>;
}>;

export type ReminderSort =
  | Sort<
      Pick<
        ReminderResponseBase,
        'channel_cid' | 'created_at' | 'remind_at' | 'updated_at'
      >
    >
  | Array<
      Sort<
        Pick<
          ReminderResponseBase,
          'channel_cid' | 'created_at' | 'remind_at' | 'updated_at'
        >
      >
    >;

export type QueryRemindersOptions = Pager & {
  filter?: ReminderFilters;
  sort?: ReminderSort;
};

export type QueryRemindersResponse = {
  reminders: ReminderResponse[];
  prev?: string;
  next?: string;
};

export type HookType = 'webhook' | 'sqs' | 'sns' | 'pending_message';

export type EventHook = {
  id?: string;
  hook_type?: HookType;
  enabled?: boolean;
  event_types?: Array<string>;
  webhook_url?: string;
  sqs_queue_url?: string;
  sqs_region?: string;
  sqs_auth_type?: string;
  sqs_key?: string;
  sqs_secret?: string;
  sqs_role_arn?: string;
  sns_topic_arn?: string;
  sns_region?: string;
  sns_auth_type?: string;
  sns_key?: string;
  sns_secret?: string;
  sns_role_arn?: string;

  // pending message config
  timeout_ms?: number;
  callback?: {
    mode: 'CALLBACK_MODE_NONE' | 'CALLBACK_MODE_REST' | 'CALLBACK_MODE_TWIRP';
  };

  created_at?: string;
  updated_at?: string;
};
