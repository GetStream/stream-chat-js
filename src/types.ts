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
import type {
  Action as Gen_Action,
  AIImageConfig as Gen_AIImageConfig,
  AITextConfig as Gen_AITextConfig,
  AIVideoConfig as Gen_AIVideoConfig,
  APIError as Gen_APIError,
  Attachment as Gen_Attachment,
  AutomodDetailsResponse as Gen_AutomodDetailsResponse,
  AutomodPlatformCircumventionConfig as Gen_AutomodPlatformCircumventionConfig,
  AutomodRule as Gen_AutomodRule,
  AutomodSemanticFiltersConfig as Gen_AutomodSemanticFiltersConfig,
  AutomodSemanticFiltersRule as Gen_AutomodSemanticFiltersRule,
  AutomodToxicityConfig as Gen_AutomodToxicityConfig,
  BanOptions as Gen_BanOptions,
  BlockListConfig as Gen_BlockListConfig,
  BlockListOptions as Gen_BlockListOptions,
  BlockListRule as Gen_BlockListRule,
  ChannelConfigWithInfo as Gen_ChannelConfigWithInfo,
  ChannelGetOrCreateRequest as Gen_ChannelGetOrCreateRequest,
  ChannelInput as Gen_ChannelInput,
  ChannelMemberResponse as Gen_ChannelMemberResponse,
  ChannelMute as Gen_ChannelMute,
  ChannelOwnCapability as Gen_ChannelOwnCapability,
  ChannelPushPreferencesResponse as Gen_ChannelPushPreferencesResponse,
  ChannelResponse as Gen_ChannelResponse,
  ChannelStateResponse as Gen_ChannelStateResponse,
  ChannelStateResponseFields as Gen_ChannelStateResponseFields,
  Command as Gen_Command,
  ContentCountRuleParameters as Gen_ContentCountRuleParameters,
  CreateDeviceRequest as Gen_CreateDeviceRequest,
  CreateDraftRequest as Gen_CreateDraftRequest,
  CreatePollRequest as Gen_CreatePollRequest,
  DraftResponse as Gen_DraftResponse,
  Field as Gen_Field,
  FileUploadConfig as Gen_FileUploadConfig,
  FilterConfigResponse as Gen_FilterConfigResponse,
  FlagUserOptions as Gen_FlagUserOptions,
  GetConfigResponse as Gen_GetConfigResponse,
  ImageContentParameters as Gen_ImageContentParameters,
  ImageRuleParameters as Gen_ImageRuleParameters,
  LLMConfig as Gen_LLMConfig,
  LLMRule as Gen_LLMRule,
  MarkChannelsReadRequest as Gen_MarkChannelsReadRequest,
  MarkDeliveredRequest as Gen_MarkDeliveredRequest,
  MarkReadRequest as Gen_MarkReadRequest,
  MarkUnreadRequest as Gen_MarkUnreadRequest,
  MessageModerationResult as Gen_MessageModerationResult,
  MessageOptions as Gen_MessageOptions,
  MessageRequest as Gen_MessageRequest,
  MessageResponse as Gen_MessageResponse,
  ModerationPayload as Gen_ModerationPayload,
  OwnUserResponse as Gen_OwnUserResponse,
  ParsedPredefinedFilterResponse as Gen_ParsedPredefinedFilterResponse,
  PendingMessageResponse as Gen_PendingMessageResponse,
  PollResponseData as Gen_PollResponseData,
  PollVoteResponseData as Gen_PollVoteResponseData,
  PushPreferenceInput as Gen_PushPreferenceInput,
  QueryBannedUsersPayload as Gen_QueryBannedUsersPayload,
  QueryChannelsRequest as Gen_QueryChannelsRequest,
  QueryChannelsResponse as Gen_QueryChannelsResponse,
  QueryFutureChannelBansPayload as Gen_QueryFutureChannelBansPayload,
  QueryMembersPayload as Gen_QueryMembersPayload,
  QueryPollsResponse as Gen_QueryPollsResponse,
  QueryReactionsRequest as Gen_QueryReactionsRequest,
  QueryReactionsResponse as Gen_QueryReactionsResponse,
  QueryRemindersResponse as Gen_QueryRemindersResponse,
  QueryThreadsRequest as Gen_QueryThreadsRequest,
  QueryUsersPayload as Gen_QueryUsersPayload,
  ReactionGroupResponse as Gen_ReactionGroupResponse,
  ReactionGroupUserResponse as Gen_ReactionGroupUserResponse,
  ReactionRequest as Gen_ReactionRequest,
  ReactionResponse as Gen_ReactionResponse,
  ReadStateResponse as Gen_ReadStateResponse,
  RuleBuilderAction as Gen_RuleBuilderAction,
  RuleBuilderCondition as Gen_RuleBuilderCondition,
  RuleBuilderConditionGroup as Gen_RuleBuilderConditionGroup,
  RuleBuilderRule as Gen_RuleBuilderRule,
  SearchPayload as Gen_SearchPayload,
  SearchWarning as Gen_SearchWarning,
  SendMessageRequest as Gen_SendMessageRequest,
  SendReactionRequest as Gen_SendReactionRequest,
  SharedLocation as Gen_SharedLocation,
  SharedLocationResponseData as Gen_SharedLocationResponseData,
  TextContentParameters as Gen_TextContentParameters,
  TextRuleParameters as Gen_TextRuleParameters,
  ThreadStateResponse as Gen_ThreadStateResponse,
  TruncateChannelRequest as Gen_TruncateChannelRequest,
  UpdateChannelPartialRequest as Gen_UpdateChannelPartialRequest,
  UpdateChannelRequest as Gen_UpdateChannelRequest,
  UpdateLiveLocationRequest as Gen_UpdateLiveLocationRequest,
  UpdateMessageRequest as Gen_UpdateMessageRequest,
  UpdatePollOptionRequest as Gen_UpdatePollOptionRequest,
  UpdatePollRequest as Gen_UpdatePollRequest,
  UpdateUserPartialRequest as Gen_UpdateUserPartialRequest,
  UpsertConfigResponse as Gen_UpsertConfigResponse,
  UserCreatedWithinParameters as Gen_UserCreatedWithinParameters,
  UserCustomPropertyParameters as Gen_UserCustomPropertyParameters,
  UserMuteResponse as Gen_UserMuteResponse,
  UserRequest as Gen_UserRequest,
  UserResponse as Gen_UserResponse,
  UserRuleParameters as Gen_UserRuleParameters,
  VelocityFilterConfig as Gen_VelocityFilterConfig,
  VelocityFilterConfigRule as Gen_VelocityFilterConfigRule,
  VideoContentParameters as Gen_VideoContentParameters,
  VideoRuleParameters as Gen_VideoRuleParameters,
  VoteData as Gen_VoteData,
  WSEvent,
} from './gen/models';
import type {
  QueryBannedUsersPayloadFilterConditions as Gen_QueryBannedUsersPayloadFilterConditions,
  QueryChannelsRequestFilterConditions as Gen_QueryChannelsRequestFilterConditions,
  QueryMembersPayloadFilterConditions as Gen_QueryMembersPayloadFilterConditions,
  QueryReactionsRequestFilter as Gen_QueryReactionsRequestFilter,
  QueryThreadsRequestFilter as Gen_QueryThreadsRequestFilter,
  QueryUsersPayloadFilterConditions as Gen_QueryUsersPayloadFilterConditions,
  SearchPayloadFilterConditions as Gen_SearchPayloadFilterConditions,
  SearchPayloadMessageFilterConditions as Gen_SearchPayloadMessageFilterConditions,
} from './gen/models/filter-conditions';
import type { ChatApi } from './gen-imports';

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
  ? U
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
  blocklist?: BlockListResponse;
};

export type TranslateResponse = {
  language: string;
  translated_text: string;
};

export type AppSettingsAPIResponse = APIResponse & {
  app?: {
    id?: string | number;
    allow_multi_user_devices?: boolean;
    // TODO

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
        delivery_events?: boolean;
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
        shared_locations?: boolean;
        skip_last_msg_update_for_system_msgs?: boolean;
        count_messages?: boolean;
        typing_events?: boolean;
        updated_at?: string;
        uploads?: boolean;
        url_enrichment?: boolean;
        user_message_reminders?: boolean;
        push_level?:
          | 'all'
          | 'all_mentions'
          | 'direct_mentions'
          | 'mentions'
          | 'none'
          | '';
      }
    >;
    reminders_interval: number;
    async_moderation_config?: AsyncModerationOptions;
    async_url_enrich_enabled?: boolean;
    auto_translation_enabled?: boolean;
    before_message_send_hook_url?: string;
    before_message_send_hook_attempt_timeout_ms?: number;
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
    guest_user_creation_disabled?: boolean;
    image_moderation_enabled?: boolean;
    image_moderation_labels?: string[];
    image_upload_config?: FileUploadConfig;
    allowed_flag_reasons?: string[];
    max_aggregated_activities_length?: number;
    moderation_bulk_submit_action_enabled?: boolean;
    moderation_dashboard_preferences?: Record<string, unknown> | null;
    moderation_audio_call_moderation_enabled?: boolean;
    moderation_enabled?: boolean;
    moderation_llm_configurability_enabled?: boolean;
    moderation_multitenant_blocklist_enabled?: boolean;
    moderation_video_call_moderation_enabled?: boolean;
    moderation_webhook_url?: string;
    multi_tenant_enabled?: boolean;
    name?: string;
    organization?: string;
    permission_version?: string;
    /**
     * The placement of the app in the form of `${region}.${shard}`.
     * Examples: "us-east.c1", "dublin.c3", "singapore.c2"
     * Note: The backend may add/remove regions or shards occasionally.
     */
    placement?: string;
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
    use_hook_v2?: boolean;
    user_response_time_enabled?: boolean;
    user_search_disallowed_roles?: string[] | null;
    video_provider?: string;
    webhook_events?: Array<string>;
    webhook_url?: string;
  };
};

export type ModerationResult = Gen_MessageModerationResult;

export type AutomodDetails = Gen_AutomodDetailsResponse;

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

export type FutureChannelBan = {
  user: UserResponse;
  expires?: string;
  reason?: string;
  shadow?: boolean;
  created_at: string;
};

export type FutureChannelBansResponse = APIResponse & {
  bans: FutureChannelBan[];
};

export type QueryFutureChannelBansOptions = Gen_QueryFutureChannelBansPayload;

export type BlockListResponse = BlockList & {
  created_at?: string;
  type?: string;
  updated_at?: string;
};

export type ChannelResponse = ReplaceCustom<Gen_ChannelResponse, CustomChannelData>;

export type QueryReactionsOptions = Pager;

export type QueryReactionsAPIResponse = Gen_QueryReactionsResponse;

/**
 *  `ChatApi.queryChannels` response
 */
export type QueryChannelsAPIResponse = Gen_QueryChannelsResponse;
/**
 *  `ChatApi.getOrCreateChannel` response
 */
export type QueryChannelAPIResponse = Gen_ChannelStateResponse;
/**
 * `ChatApi.getOrCreateChannel` response without `duration` field
 */
export type ChannelAPIResponse = Gen_ChannelStateResponseFields;

export type ChannelUpdateOptions = Omit<Gen_UpdateChannelRequest, 'message' | 'members'>;

export type ChannelMemberAPIResponse = APIResponse & {
  members: ChannelMemberResponse[];
};

export type ChannelMemberUpdates = CustomMemberData & {
  archived?: boolean;
  channel_role?: Role;
  pinned?: boolean;
};

export type ChannelMemberResponse = ReplaceCustom<
  Gen_ChannelMemberResponse,
  CustomMemberData
>;

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

export type LocalMessage = Gen_MessageResponse &
  CustomMessageData & {
    /** SDK-only field: message delivery status (e.g. 'sending', 'received', 'failed') */
    status: string;
    error?: ErrorFromResponse<APIErrorResponse> | null;
    /** Moderation v1 details (legacy, used by isBlockedMessage/isBouncedMessage) */
    // moderation_details?: ModerationDetailsResponse;
    quoted_message?: LocalMessage | null;
  };

export type GetCommandResponse = APIResponse & CreateCommandOptions & CreatedAtUpdatedAt;

export type GetMessageAPIResponse = SendMessageAPIResponse;

export type ThreadResponse = CustomThreadData & Gen_ThreadStateResponse;

// TODO: Figure out a way to strongly type set and unset.
export type PartialThreadUpdate = {
  set?: Partial<Record<string, unknown>>;
  unset?: Array<string>;
};

export type QueryThreadsOptions = WithTypedFilters<
  Omit<Gen_QueryThreadsRequest, 'sort'> & {
    sort?: ThreadSort;
  },
  {
    filter: Gen_QueryThreadsRequestFilter;
  }
>;

export type QueryThreadsAPIResponse = APIResponse & {
  threads: ThreadResponse[];
  next?: string;
};

export type GetThreadOptions = Omit<Parameters<ChatApi['getThread']>[0], 'message_id'>;

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

export enum Product {
  Chat = 'chat',
  Video = 'video',
  Moderation = 'moderation',
  Feeds = 'feeds',
}

export type HookEvent = {
  name: string;
  description: string;
  products: Product[];
};

export type GetHookEventsResponse = APIResponse & {
  events: HookEvent[];
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

export type PushPreference = Gen_ChannelPushPreferencesResponse; // Gen_ChannelPushPreferencesResponse;

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

export type MessageResponse = Gen_MessageResponse;

export type ReactionGroupResponse = Gen_ReactionGroupResponse;

export type ReactionGroupUserResponse = Gen_ReactionGroupUserResponse;

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

export type MuteResponse = Gen_UserMuteResponse;

export type MuteUserResponse = APIResponse & {
  mute?: MuteResponse;
  mutes?: Array<Mute>;
  own_user?: OwnUserResponse;
  non_existing_users?: string[];
};

export type UnmuteUserResponse = APIResponse & {
  non_existing_users?: string[];
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
  total_unread_count_by_team?: Record<string, number> | null;
};

export type OwnUserResponse = Gen_OwnUserResponse & CustomUserData; // UserResponse & OwnUserBase;

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

export type ReactionResponse = Gen_ReactionResponse;

export type ReadResponse = Gen_ReadStateResponse;

export type SearchAPIResponse = APIResponse & {
  results: {
    message: MessageResponse;
  }[];
  next?: string;
  previous?: string;
  results_warning?: SearchWarning | null;
};

export type RoleResponse = {
  name: Role;
  custom: boolean;
  scopes: string[];
  created_at: string;
  updated_at: string;
};

export type CreateRoleAPIResponse = APIResponse & {
  role: RoleResponse;
};

export type ListRolesAPIResponse = APIResponse & {
  roles: RoleResponse[];
};

export type SearchRolesAPIResponse = APIResponse & {
  roles: RoleResponse[];
};

export type SearchRolesOptions = {
  query: string;
  include_global_roles?: boolean;
  limit?: number;
  name_gt?: string;
  // If not provided, the default is search performed both in user-assignable + channel-assignable roles
  role_type?: 'user' | 'channel';
};

export type SearchWarning = Gen_SearchWarning;

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
  membership_deletion_task_id?: string;
};

export type UpdateUsersAPIResponse = APIResponse & {
  users: { [key: string]: UserResponse };
  membership_deletion_task_id?: string;
};

export type UserResponse = ReplaceCustom<Gen_UserResponse, CustomUserData>;

export type TeamsRole = { [team: string]: string };

export type PrivacySettings = {
  read_receipts?: {
    enabled?: boolean;
  };
  typing_indicators?: {
    enabled?: boolean;
  };
  delivery_receipts?: {
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
  ban_from_future_channels?: boolean;
  banned_by?: UserResponse;
  banned_by_id?: string;
  ip_ban?: boolean;
  reason?: string;
  timeout?: number;
  delete_messages?: MessageDeletionStrategy;
  delete_reactions?: boolean;
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
  /**
   * Name of a predefined filter to use instead of sending raw
   * `filter_conditions`.
   *
   * The backend resolves the filter template by name and interpolates it using
   * `filter_values`.
   *
   * A regular `sort` can still be passed to `queryChannels()`, but backend
   * precedence rules apply:
   *
   * - if the predefined filter has its own stored sort template, that stored
   *   sort takes precedence and the request `sort` is ignored
   * - if the predefined filter does not define a sort template, the request
   *   `sort` can still be used
   */
  predefined_filter?: string;
  /**
   * Values used to interpolate placeholders inside the predefined filter's
   * `filter` template.
   *
   * Example: a template value like `{{user_id}}` can be resolved with
   * `{ user_id: 'alice' }`.
   *
   * Only used when `predefined_filter` is provided.
   */
  filter_values?: Record<string, unknown>;
  /**
   * Values to interpolate into the predefined filter sort template placeholders.
   * Only used when predefined_filter is provided.
   */
  sort_values?: Record<string, unknown>;
};

export type ChannelQueryOptions = Gen_ChannelGetOrCreateRequest;

export type ChannelStateOptions = {
  offlineMode?: boolean;
  skipInitialization?: string[];
  skipHydration?: boolean;
  /**
   * Returns the full query response with hydrated channels from `queryChannels()`.
   *
   * This is a compatibility bridge for internal callers that need response level
   * metadata such as `predefined_filter`. The default `queryChannels()` return value
   * remains `Channel[]` to avoid a breaking change. This should be folded into a
   * single full response API in the next major release.
   */
  withResponse?: boolean;
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
  delivery_events?: boolean;
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
  shared_locations?: boolean;
  skip_last_msg_update_for_system_msgs?: boolean;
  typing_events?: boolean;
  uploads?: boolean;
  url_enrichment?: boolean;
  user_message_reminders?: boolean;
  count_messages?: boolean;
  push_level?: 'all' | 'all_mentions' | 'direct_mentions' | 'mentions' | 'none';
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

export type Thresholds = Partial<
  Record<'explicit' | 'spam' | 'toxic', Partial<{ block: number; flag: number }>>
>;

export type BlockListOptions = Gen_BlockListOptions;

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
export type Command = Gen_Command;

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
    delivery_events?: boolean;
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
    count_messages?: boolean;
    push_level?: 'all' | 'all_mentions' | 'direct_mentions' | 'mentions' | 'none';
  };

export type UpdateChannelTypeResponse = {
  automod: Automod;
  automod_behavior: AutomodBehavior;
  commands: CommandVariants[];
  connect_events: boolean;
  created_at: string;
  custom_events: boolean;
  delivery_events: boolean;
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
  shared_locations: boolean;
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
  message_retention?: string;
  partition_size?: number;
  partition_ttl?: string;
  count_messages?: boolean;
  user_message_reminders?: boolean;
  push_level?: string;
};

export type GetChannelTypeResponse = {
  automod: Automod;
  automod_behavior: AutomodBehavior;
  commands: Command[];
  connect_events: boolean;
  created_at: string;
  custom_events: boolean;
  delivery_events: boolean;
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
  shared_locations: boolean;
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
  message_retention?: string;
  partition_size?: number;
  partition_ttl?: string;
  count_messages?: boolean;
  user_message_reminders?: boolean;
  push_level?: string;
};

export type MarkChannelsReadOptions = Gen_MarkChannelsReadRequest;

export type MarkReadOptions = Gen_MarkReadRequest;

export type MarkUnreadOptions = Gen_MarkUnreadRequest;

export type DeliveredMessageConfirmation = {
  cid: string;
  id: string;
  parent_id?: string; // todo: should we include parent_id if thread delivery receipts are not yet supported?
};

export type MarkDeliveredOptions = Gen_MarkDeliveredRequest;

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

export type GetRepliesRequest = Parameters<ChatApi['getReplies']>[0];
export type GetRepliesOptions = Omit<GetRepliesRequest, 'parent_id' | 'sort'>;

export type QueryMembersOptions = Partial<
  Omit<Gen_QueryMembersPayload, 'sort' | 'filter_conditions'>
>;

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

export type StreamChatOptions = {
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
  remove_future_channels_ban?: boolean;
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

export type UserCustomEvent = CustomEventData & {
  type: string;
};

type LocalEvent = (
  | ({ type: 'live_location_sharing.started' } & { message: MessageResponse })
  | ({ type: 'live_location_sharing.stopped' } & {
      live_location?: SharedLocationResponse;
    })
  | ({ type: 'channels.queried' } & {
      queriedChannels: {
        channels: ChannelAPIResponse[];
        isLatestMessageSet: boolean;
      };
    })
  | ({ type: 'transport.changed' } & { mode: string })
  | ({ type: 'connection.changed' } & { online: boolean })
  | { type: 'connection.recovered' }
  | ({ type: 'offline_reactions.queried' } & {
      offlineReactions: ReactionResponse[];
    })
  | ({ type: 'capabilities.changed' } & {
      cid: string;
      own_capabilities: Gen_ChannelOwnCapability[];
    })
) & { received_at?: Date };

export type CombinedEvents = WSEvent | LocalEvent;
export type EventHandler<T = string> = (
  event: Extract<CombinedEvents, { type: T }>,
) => void;

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

export type BannedUsersFilters = WithTypedFilters<
  Gen_QueryBannedUsersPayload,
  { filter_conditions: Gen_QueryBannedUsersPayloadFilterConditions }
>['filter_conditions'];

export type ReactionFilters = WithTypedFilters<
  Gen_QueryReactionsRequest,
  { filter: Gen_QueryReactionsRequestFilter }
>['filter'];

export type ChannelFilters = WithTypedFilters<
  Gen_QueryChannelsRequest,
  { filter_conditions: Gen_QueryChannelsRequestFilterConditions }
>['filter_conditions'];

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

export type MessageFilters = NonNullable<SearchPayload['message_filter_conditions']>;

export type MessageOptions = Gen_MessageOptions;

export type PrimitiveFilter<ObjectType> = ObjectType | null;

export type QueryFilter<ObjectType = string> =
  NonNullable<ObjectType> extends string | number | boolean | Date
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
        $in?: PrimitiveFilter<Unpacked<ObjectType>>[];
      };

export type QueryFilters<Operators = {}> = {
  [Key in keyof Operators]?: Operators[Key];
} & QueryLogicalOperators<Operators>;

export type QueryLogicalOperators<Operators> = {
  $and?: ArrayOneOrMore<QueryFilters<Operators>>;
  $nor?: ArrayOneOrMore<QueryFilters<Operators>>;
  $or?: ArrayTwoOrMore<QueryFilters<Operators>>;
};

export type UserFilters = WithTypedFilters<
  Gen_QueryUsersPayload,
  { filter_conditions: Gen_QueryUsersPayloadFilterConditions }
>['filter_conditions'];

export type InviteStatus = 'pending' | 'accepted' | 'rejected' | 'member';

// https://getstream.io/chat/docs/react/channel_member/#update-channel-members
export type MemberFilters = WithTypedFilters<
  Gen_QueryMembersPayload,
  { filter_conditions: Gen_QueryMembersPayloadFilterConditions }
>['filter_conditions'];

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

export type Action = Gen_Action;

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
  before_message_send_hook_attempt_timeout_ms?: number;
  cdn_expiration_seconds?: number;
  custom_action_handler_url?: string;
  disable_auth_checks?: boolean;
  disable_permissions_checks?: boolean;
  enforce_unique_usernames?: 'no' | 'app' | 'team';
  event_hooks?: Array<EventHook> | null;
  explicit_event_hooks_deletion?: boolean;
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
  user_response_time_enabled?: boolean;
  video_provider?: string;
  webhook_events?: Array<string> | null;
  webhook_url?: string;
  xiaomi_config?: {
    package_name: string;
    secret: string;
  };
};

export type Attachment = CustomAttachmentData & Gen_Attachment;

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
  is_leet_check_enabled?: boolean;
  is_plural_check_enabled?: boolean;
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
  delivery_events?: boolean;
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
  shared_locations?: boolean;
  skip_last_msg_update_for_system_msgs?: boolean;
  count_messages?: boolean;
  typing_events?: boolean;
  uploads?: boolean;
  url_enrichment?: boolean;
  user_message_reminders?: boolean; // Feature flag for user message reminders
  push_level?: 'all' | 'all_mentions' | 'direct_mentions' | 'mentions' | 'none' | '';
} & GetConfigResponse;

export type ChannelConfigWithInfo = Gen_ChannelConfigWithInfo;

export type ChannelData = ReplaceCustom<Gen_ChannelInput, CustomChannelData>;

export type ChannelMute = Gen_ChannelMute;

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

export type PushProvider = Gen_CreateDeviceRequest['push_provider'];

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

export type Field = Gen_Field;

export type FileUploadConfig = Gen_FileUploadConfig;

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

export type GiphyVersions =
  | 'original'
  | 'fixed_height'
  | 'fixed_height_still'
  | 'fixed_height_downsampled'
  | 'fixed_width'
  | 'fixed_width_still'
  | 'fixed_width_downsampled';

export type GiphyData = {
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
  Gen_MessageRequest &
    CustomMessageData & {
      mentioned_users: string[];
      shared_location: StaticLocationPayload | LiveLocationPayload;
      mentioned_channel: boolean;
      mentioned_here?: boolean;
      mentioned_group_ids?: string[];
      mentioned_roles?: string[];
    }
>;

export type MessageLabel =
  | 'deleted'
  | 'ephemeral'
  | 'error'
  | 'regular'
  | 'reply'
  | 'system';

export type SendMessageOptions = Omit<Gen_SendMessageRequest, 'message'>;

export type UpdateMessageOptions = Omit<Gen_UpdateMessageRequest, 'message'>;

export type SendReactionOptions = Omit<Gen_SendReactionRequest, 'reaction'>;

export type GetMessageOptions = {
  show_deleted_message?: boolean;
};

export type Mute = Gen_UserMuteResponse;

export type PartialUpdateChannelFields = Partial<ChannelResponse> & {
  config_overrides?: Partial<ChannelConfigFields>;
};

export type PartialUpdateChannel = Gen_UpdateChannelPartialRequest;

export type PartialUpdateMember = {
  set?: ChannelMemberUpdates;
  unset?: Array<keyof ChannelMemberUpdates>;
};

// TODO: properly type set/unset types based on keys in Gen_UserRequest
export type PartialUserUpdate = Gen_UpdateUserPartialRequest;

// TODO: new type, naming sucks - rename to something that makes sense
export type UserUpdate = ReplaceCustom<Gen_UserRequest, CustomUserData>;

export type MessageUpdatableFields = Omit<
  MessageResponse,
  'cid' | 'created_at' | 'updated_at' | 'deleted_at' | 'user' | 'user_id'
>;

export type PartialMessageUpdate = {
  set?: Partial<MessageUpdatableFields>;
  unset?: Array<keyof MessageUpdatableFields>;
};

export type PendingMessageResponse = Gen_PendingMessageResponse;

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

export type Reaction = ReplaceCustom<Gen_ReactionRequest, CustomReactionData>;

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

export type SearchPayload = WithTypedFilters<
  Gen_SearchPayload,
  {
    filter_conditions: Gen_SearchPayloadFilterConditions;
    message_filter_conditions: Gen_SearchPayloadMessageFilterConditions;
  }
>;

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

export type UpdatedMessage = Omit<
  MessageResponse,
  ReservedUpdatedMessageFields | 'mentioned_groups'
> & {
  mentioned_users?: string[];
  mentioned_channel?: boolean;
  mentioned_here?: boolean;
  mentioned_group_ids?: string[];
  mentioned_roles?: string[];
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
    members_template?: Array<{
      user_id: string;
      channel_role?: string;
      custom?: Record<string, unknown>;
    }>;
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
  sender_visibility?: 'hidden' | 'archived' | null;
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

export type TruncateOptions = Gen_TruncateChannelRequest;

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

export type APIErrorResponse = Gen_APIError;

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

export type QueryPollsResponse = Gen_QueryPollsResponse;

export type CreatePollAPIResponse = {
  poll: PollResponse;
};

export type GetPollAPIResponse = {
  poll: PollResponse;
};

export type UpdatePollAPIResponse = {
  poll: PollResponse;
};

export type PollResponse = CustomPollData & PollEnrichData & Gen_PollResponseData;

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
  latest_answers: PollVote[]; // not updated with WS events, ordered DESC by created_at, seems like updated_at cannot be different from created_at
  latest_votes_by_option: Record<string, PollVote[]>; // not updated with WS events; always null in anonymous polls
  vote_count: number;
  vote_counts_by_option: Record<string, number>;
  own_votes?: PollVote[]; // not updated with WS events
};

export type PollData = ReplaceCustom<Gen_UpdatePollRequest, CustomPollData>;

export type CreatePollData = ReplaceCustom<Gen_CreatePollRequest, CustomPollData>;

export type PartialPollUpdate = {
  set?: Partial<PollData>;
  unset?: Array<keyof PollData>;
};

export type PollOptionData = ReplaceCustom<
  Gen_UpdatePollOptionRequest,
  CustomPollOptionData
> & {
  position?: number;
};

export type PartialPollOptionUpdate = {
  set?: Partial<PollOptionResponse>;
  unset?: Array<keyof PollOptionResponse>;
};

export type PollVoteData = Gen_VoteData & {
  is_answer?: boolean;
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

export type PollVote = Gen_PollVoteResponseData;

export type PollVotesAPIResponse = {
  votes: PollVote[];
  next?: string;
};

export type PollAnswersAPIResponse = {
  votes: PollVote[]; // todo: should be changes to answers?
  next?: string;
};

export type CastVoteAPIResponse = {
  vote: PollVote;
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
export type ModerationPayload = Gen_ModerationPayload;

export type ModV2ReviewStatus = 'complete' | 'flagged' | 'partial';

export type ModerationFlag = {
  created_at: string;

  custom: Record<string, any>;
  entity_creator_id: string;
  entity_id: string;
  entity_type: string;
  id: string;
  reason: string;

  result: Record<string, any>[];
  review_queue_item_id: string;
  updated_at: string;
  user: UserResponse;
  moderation_payload?: ModerationPayload;
  moderation_payload_hash?: string;
};

export type ReviewQueueItem = {
  actions_taken: any[];
  appealed_by: string;
  assigned_to: string;
  completed_at: string;
  config_key: string;

  context: any[];
  created_at: string;
  created_by: string;
  entity_id: string;
  entity_type: string;
  entity_creator_id?: string;
  flags: ModerationFlag[];
  has_image: boolean;
  has_text: boolean;
  has_video: boolean;
  id: string;
  moderation_payload: ModerationPayload;
  moderation_payload_hash: string;

  options: any;
  recommended_action: string;

  results: any;
  reviewed_at: string;
  status: string;
  updated_at: string;
  latest_moderator_action?: string;
};

export type CustomCheckFlag = {
  type: string;

  custom?: Record<string, any>[];
  labels?: string[];
  reason?: string;
};

export type MessageDeletionStrategy = 'soft' | 'hard' | 'pruning';
// @deprecated use type MessageDeletionStrategy instead
export type DeleteMessagesOptions = MessageDeletionStrategy;

export type DeleteMessageOptions = {
  deleteForMe?: boolean;
  hardDelete?: boolean;
};

export type SubmitActionOptions = {
  appeal_id?: string;
  ban?: {
    target_user_id?: string;
    shadow?: boolean;
    reason?: string;
    channel_ban_only?: boolean;
    channel_cid?: string;
    ip_ban?: boolean;
    delete_messages?: MessageDeletionStrategy;
    delete_reactions?: boolean;
    timeout?: number;
  };
  block?: {
    reason?: string;
  };
  custom?: {
    id: string;

    options?: Record<string, any>;
  };
  delete_activity?: {
    hard_delete?: boolean;
    reason?: string;
    entity_id?: string;
    entity_type?: string;
  };
  delete_comment?: {
    hard_delete?: boolean;
    reason?: string;
    entity_id?: string;
    entity_type?: string;
  };
  delete_message?: {
    hard_delete?: boolean;
    reason?: string;
    entity_id?: string;
    entity_type?: string;
  };
  delete_reaction?: {
    hard_delete?: boolean;
    reason?: string;
    entity_id?: string;
    entity_type?: string;
  };
  delete_user?: {
    hard_delete?: boolean;
    reason?: string;
    mark_messages_deleted?: boolean;
    delete_conversation_channels?: boolean;
    delete_feeds_content?: boolean;
    entity_id?: string;
    entity_type?: string;
  };
  end_call?: Record<string, never>;
  escalate?: {
    reason: string;
    category: string;
    priority: string;
  };
  flag?: {
    entity_type: string;
    entity_id: string;
    entity_creator_id?: string;
    reason?: string;
    moderation_payload?: ModerationPayload;

    custom?: Record<string, any>;
  };
  kick_user?: Record<string, never>;
  mark_reviewed?: {
    disable_marking_content_as_reviewed?: boolean;
    content_to_mark_as_reviewed_limit?: number;
    decision_reason?: string;
  };
  reject_appeal?: {
    decision_reason: string;
  };
  restore?: {
    decision_reason?: string;
  };
  shadow_block?: {
    reason?: string;
  };
  unban?: {
    channel_cid?: string;
    decision_reason?: string;
  };
  unblock?: {
    decision_reason?: string;
  };
  user_id?: string;
};

export type SubmitActionResponse = APIResponse & {
  item?: ReviewQueueItem;
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

export type CheckResponse = APIResponse & {
  status: string;
  task_id?: string;
  recommended_action: string;
  item?: ReviewQueueItem;
};

export type CustomCheckResponse = APIResponse & {
  id: string;
  item: ReviewQueueItem;
  status: string;
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
    entity_creator_id?:
      | RequireOnlyOne<
          Pick<QueryFilter<ReviewQueueItem['entity_creator_id']>, '$eq' | '$in'>
        >
      | PrimitiveFilter<ReviewQueueItem['entity_creator_id']>;
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
      $in?: string[];
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
      $in?: string[];
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
  } & {
    latest_moderator_action?:
      | RequireOnlyOne<
          Pick<QueryFilter<ReviewQueueItem['latest_moderator_action']>, '$eq' | '$in'>
        >
      | PrimitiveFilter<ReviewQueueItem['latest_moderator_action']>;
  } & {
    flags_count?: RequireOnlyOne<{
      $eq?: number;
    }>;
  } & {
    ai_text_severity?: RequireOnlyOne<{
      $eq?: string;
    }>;
  } & {
    channel_cid?: RequireOnlyOne<{
      $eq?: string;
    }>;
  }
>;

export type ReviewQueueSort =
  | Sort<Pick<ReviewQueueItem, 'id' | 'created_at' | 'updated_at'>>
  | Array<Sort<Pick<ReviewQueueItem, 'id' | 'created_at' | 'updated_at'>>>;

export type QueryModerationConfigsSort = Array<Sort<'key' | 'created_at' | 'updated_at'>>;

export type ReviewQueuePaginationOptions = Pager;

export type FilterConfigResponse = Gen_FilterConfigResponse;

export type ModerationActionConfig = {
  entity_type: string;
  order: number;
  action: string;
  icon: string;
  description: string;
  custom?: Record<string, unknown>;
};

export type ReviewQueueResponse = {
  items: ReviewQueueItem[];
  action_config?: Record<string, ModerationActionConfig[]>;
  filter_config?: FilterConfigResponse;
  stats?: Record<string, unknown>;
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
  llm_config?: LLMConfig;
  team?: string;
};

export type ModerationConfigResponse = ModerationConfig & {
  created_at: string;
  updated_at: string;
};

export type GetConfigResponse = Gen_GetConfigResponse;

export type QueryConfigsResponse = {
  configs: ModerationConfigResponse[];
  next?: string;
  prev?: string;
};

export type UpsertConfigResponse = Gen_UpsertConfigResponse;

// Moderation Rule Builder Types
export type ModerationRule = {
  id: string;
  name: string;
  description: string;
  config_keys: string[];
  team: string;
  rule: RuleBuilderRule;
  enabled: boolean;
  created_at: string;
  updated_at: string;
};

export type ModerationRuleRequest = {
  name: string;
  description: string;
  config_keys: string[];
  team: string;
  rule: RuleBuilderRule;
  enabled: boolean;
};

export type RuleBuilderRule = Gen_RuleBuilderRule;

export type RuleBuilderCondition = Gen_RuleBuilderCondition;

export type RuleBuilderConditionGroup = Gen_RuleBuilderConditionGroup;

export type RuleBuilderAction = Gen_RuleBuilderAction;

export type TextRuleParameters = Gen_TextRuleParameters;

export type ImageRuleParameters = Gen_ImageRuleParameters;

export type VideoRuleParameters = Gen_VideoRuleParameters;

export type UserRuleParameters = Gen_UserRuleParameters;

export type ContentCountRuleParameters = Gen_ContentCountRuleParameters;

export type TextContentParameters = Gen_TextContentParameters;

export type ImageContentParameters = Gen_ImageContentParameters;

export type VideoContentParameters = Gen_VideoContentParameters;

export type UserCreatedWithinParameters = Gen_UserCreatedWithinParameters;

export type UserCustomPropertyParameters = Gen_UserCustomPropertyParameters;

export type BanOptions = Gen_BanOptions;

export type FlagUserOptions = Gen_FlagUserOptions;

export type QueryModerationRulesFilters = QueryFilters<{
  name?: string;
  team?: string;
  enabled?: boolean;
  rule_type?: string;
  created_at?: PrimitiveFilter<string>;
  updated_at?: PrimitiveFilter<string>;
}>;

export type QueryModerationRulesSort = Array<
  Sort<'name' | 'enabled' | 'team' | 'created_at' | 'updated_at'>
>;

export type QueryModerationRulesResponse = {
  rules: ModerationRule[];
  default_llm_labels: Record<string, string>;
  next?: string;
  prev?: string;
};

export type UpsertModerationRuleResponse = {
  rule: ModerationRule;
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

export type ModerationSeverity = 'low' | 'medium' | 'high' | 'critical';

export type AutomodRule = Gen_AutomodRule;

export type BlockListRule = Gen_BlockListRule;

export type BlockListConfig = Gen_BlockListConfig;

export type LLMConfig = Gen_LLMConfig;

export type LLMRule = Gen_LLMRule;

export type LLMSeverityRule = {
  severity: ModerationSeverity;
  action: ModerationActionType;
};

export type AutomodToxicityConfig = Gen_AutomodToxicityConfig;

export type AutomodPlatformCircumventionConfig = Gen_AutomodPlatformCircumventionConfig;

export type AutomodSemanticFiltersRule = Gen_AutomodSemanticFiltersRule;

export type AutomodSemanticFiltersConfig = Gen_AutomodSemanticFiltersConfig;

export type AITextSeverityRule = {
  action: ModerationActionType;
  severity: ModerationSeverity;
};

export type AITextRule = {
  label: string;
  action?: ModerationActionType;
  severity_rules?: AITextSeverityRule[];
};

export type AITextConfig = Gen_AITextConfig;

export type AIImageRule = {
  action: ModerationActionType;
  label: string;
  min_confidence?: number;
};

export type AIImageConfig = Gen_AIImageConfig;

export type AIVideoRule = {
  action: ModerationActionType;
  label: string;
  min_confidence?: number;
};

export type AIVideoConfig = Gen_AIVideoConfig;

export type VelocityFilterConfigRule = Gen_VelocityFilterConfigRule;

export type VelocityFilterConfig = Gen_VelocityFilterConfig;

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

export type DraftResponse = Gen_DraftResponse;

export type CreateDraftResponse = APIResponse & {
  draft: DraftResponse;
};

export type GetDraftResponse = APIResponse & {
  draft: DraftResponse;
};

export type QueryDraftsResponse = APIResponse & {
  drafts: DraftResponse[];
} & Omit<Pager, 'limit'>;

export type DraftMessagePayload = Gen_CreateDraftRequest['message'];

export type DraftMessage = {
  id: string;
  text: string;
  attachments?: Attachment[];
  custom?: {};
  html?: string;
  mentioned_users?: string[];
  mentioned_channel?: boolean;
  mentioned_here?: boolean;
  mentioned_group_ids?: string[];
  mentioned_groups?: UserGroupResponse[];
  mentioned_roles?: string[];
  mml?: string;
  parent_id?: string;
  poll_id?: string;
  quoted_message_id?: string;
  shared_location?: StaticLocationPayload | LiveLocationPayload; // todo: live-location verify if possible
  show_in_channel?: boolean;
  silent?: boolean;
  type?: MessageLabel;
};

export type ActiveLiveLocationsAPIResponse = APIResponse & {
  active_live_locations: SharedLiveLocationResponse[];
};

export type SharedLocationResponse = Gen_SharedLocationResponseData;

export type SharedStaticLocationResponse = Omit<SharedLocationResponse, 'end_at'>;

export type SharedLiveLocationResponse = RequireLiteral<SharedLocationResponse, 'end_at'>;

export type UpdateLocationPayload = Gen_UpdateLiveLocationRequest;

export type StaticLocationPayload = Gen_SharedLocation;

export type LiveLocationPayload = Gen_SharedLocation;

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

export type ThreadFilters = NonNullable<QueryThreadsOptions['filter']>;

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
  channel?: ChannelResponse;
};

export type ReminderAPIResponse = APIResponse & {
  reminder: ReminderResponse;
};

export type CreateReminderOptions = Parameters<ChatApi['createReminder']>[0];

export type UpdateReminderOptions = Parameters<ChatApi['updateReminder']>[0];

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
          '$exists' | '$eq' | '$gt' | '$lt' | '$gte' | '$lte'
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

export type QueryRemindersResponse = Gen_QueryRemindersResponse;

export type UserGroupMemberResponse = {
  group_id: string;
  user_id: string;
  is_admin: boolean;
  created_at: string;
};

export type UserGroupResponse = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  description?: string;
  team_id?: string;
  members?: UserGroupMemberResponse[];
  created_by?: string;
};

export type CreateUserGroupOptions = {
  /** Human-readable user group name */
  name: string;
  /** Optional user group description shown to members */
  description?: string;
  /** Optional custom user group ID. If omitted, the backend generates one */
  id?: string;
  /** Optional list of user IDs to add as members when the group is created */
  member_ids?: string[];
  /** Optional team ID that scopes the user group to a specific team */
  team_id?: string;
};

export type CreateUserGroupResponse = APIResponse & {
  user_group: UserGroupResponse;
};

export type GetUserGroupOptions = {
  team_id?: string;
};

export type GetUserGroupResponse = APIResponse & {
  user_group: UserGroupResponse;
};

export type QueryUserGroupsOptions = {
  limit?: number;
  id_gt?: string;
  created_at_gt?: string;
  team_id?: string;
};

export type QueryUserGroupsResponse = APIResponse & {
  user_groups: UserGroupResponse[];
};

export type SearchUserGroupsOptions = {
  query: string;
  limit?: number;
  id_gt?: string;
  name_gt?: string;
  team_id?: string;
};

export type SearchUserGroupsResponse = APIResponse & {
  user_groups: UserGroupResponse[];
};

export type UpdateUserGroupOptions = {
  description?: string;
  name?: string;
  team_id?: string;
};

export type UpdateUserGroupResponse = APIResponse & {
  user_group: UserGroupResponse;
};

export type DeleteUserGroupOptions = {
  team_id?: string;
};

export type AddUserGroupMembersOptions = {
  member_ids: string[];
  as_admin?: boolean;
  team_id?: string;
};

export type AddUserGroupMembersResponse = APIResponse & {
  user_group: UserGroupResponse;
};

export type RemoveUserGroupMembersOptions = {
  member_ids: string[];
  team_id?: string;
};

export type RemoveUserGroupMembersResponse = APIResponse & {
  user_group: UserGroupResponse;
};

export type HookType = 'webhook' | 'sqs' | 'sns' | 'pending_message';

export type EventHook = {
  id?: string;
  hook_type?: HookType;
  enabled?: boolean;
  product?: Product | 'all'; // optional, default is 'all'
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
  should_send_custom_events?: boolean;

  // pending message config
  timeout_ms?: number;
  callback?: {
    mode: 'CALLBACK_MODE_NONE' | 'CALLBACK_MODE_REST' | 'CALLBACK_MODE_TWIRP';
  };

  delete?: boolean;
  created_at?: string;
  updated_at?: string;
};

export type BatchUpdateOperation =
  | 'addMembers'
  | 'removeMembers'
  | 'inviteMembers'
  | 'assignRoles'
  | 'addModerators'
  | 'demoteModerators'
  | 'hide'
  | 'show'
  | 'archive'
  | 'unarchive'
  | 'updateData';

export type BatchChannelDataUpdate = {
  frozen?: boolean;
  disabled?: boolean;
  custom?: Record<string, unknown>;
  team?: string;
  config_overrides?: Record<string, unknown>;
  auto_translation_enabled?: boolean;
  auto_translation_language?: string;
};

export type UpdateChannelsBatchOptions = {
  operation: BatchUpdateOperation;
  filter: UpdateChannelsBatchFilters;
  members?: string[] | Array<NewMemberPayload>;
  data?: BatchChannelDataUpdate;
};

export type UpdateChannelsBatchFilters = QueryFilters<{
  cids?:
    | RequireOnlyOne<Pick<QueryFilter<string>, '$in' | '$eq'>>
    | PrimitiveFilter<string[]>;
  types?:
    | RequireOnlyOne<Pick<QueryFilter<string>, '$in' | '$eq'>>
    | PrimitiveFilter<string[]>;
}>;

export type UpdateChannelsBatchResponse = {
  result: Record<string, string>;
} & Partial<TaskResponse>;

/**
 * Predefined Filter Types
 */

export type PredefinedFilterOperation = 'QueryChannels';

export type PredefinedFilterSortParam = {
  /**
   * Field name to sort by.
   *
   * This may be a literal field name such as `created_at`, or a placeholder
   * template such as `{{sort_field}}` that will be interpolated server-side.
   */
  field: string;
  /**
   * Sort direction. `1` means ascending and `-1` means descending.
   *
   * The backend defaults this to `1` when omitted.
   */
  direction?: AscDesc;
  /**
   * Optional server-side hint describing how the sort field value should be
   * interpreted.
   *
   * This is mainly relevant for predefined-filter sort templates and is not
   * part of the regular `queryChannels()` sort shape. Omitting it uses the
   * backend default string behavior. Known backend values include:
   *
   * - `number`: cast custom-field values to numeric before sorting
   * - `boolean`: cast custom-field values to boolean before sorting
   *
   * Other values are backend-defined. In most cases this should be omitted
   * unless you are sorting by a custom field whose stored JSON value is not
   * string-like.
   */
  type?: string;
};

/**
 * Stored predefined filter definition as returned by the server.
 *
 * `F` represents the raw filter template shape. It defaults to a generic record
 * because predefined filters are server-managed templates and may include
 * placeholders or app-specific structures.
 */
export type PredefinedFilter<
  F extends Record<string, unknown> = Record<string, unknown>,
> = {
  /**
   * Unique predefined filter name within the app.
   */
  name: string;
  /**
   * Operation this predefined filter is valid for.
   */
  operation: PredefinedFilterOperation;
  /**
   * Filter template stored on the server.
   *
   * This is not necessarily the fully interpolated runtime filter; placeholder
   * values such as `{{user_id}}` may still be present.
   */
  filter: F;
  /**
   * Server creation timestamp in ISO-8601 format.
   */
  created_at: string;
  /**
   * Server update timestamp in ISO-8601 format.
   */
  updated_at: string;
  /**
   * Optional human-readable description.
   */
  description?: string;
  /**
   * Optional sort template stored with the predefined filter.
   */
  sort?: PredefinedFilterSortParam[];
  /**
   * Query identifier generated by the backend for the filter/sort pattern.
   *
   * The exact value is backend-generated and primarily useful for correlating
   * predefined filters with query analysis / query performance data.
   */
  query_id?: number;
};

export type CreatePredefinedFilterOptions<
  F extends Record<string, unknown> = Record<string, unknown>,
> = {
  /**
   * Unique predefined filter name.
   */
  name: string;
  /**
   * Operation this predefined filter will be used with.
   */
  operation: PredefinedFilterOperation;
  /**
   * Filter template to store on the server.
   */
  filter: F;
  /**
   * Optional human-readable description.
   */
  description?: string;
  /**
   * Optional sort template stored with the predefined filter.
   */
  sort?: PredefinedFilterSortParam[];
};

export type UpdatePredefinedFilterOptions<
  F extends Record<string, unknown> = Record<string, unknown>,
> = Omit<CreatePredefinedFilterOptions<F>, 'name'>;

export type PredefinedFilterResponse<
  F extends Record<string, unknown> = Record<string, unknown>,
> = APIResponse & {
  predefined_filter: PredefinedFilter<F>;
};

/**
 * Paginated response returned when listing predefined filters.
 */
export type ListPredefinedFiltersResponse<
  F extends Record<string, unknown> = Record<string, unknown>,
> = APIResponse & {
  predefined_filters: PredefinedFilter<F>[];
  next?: string;
  prev?: string;
};

/**
 * Contains the interpolated filter and sort from a predefined filter.
 * This is returned in the QueryChannels response when using a predefined filter.
 */
export type ParsedPredefinedFilterResponse<
  F extends Record<string, unknown> = Record<string, unknown>,
> = {
  /**
   * Name of the predefined filter that was resolved.
   */
  name: string;
  /**
   * Fully interpolated filter that the backend executed.
   */
  filter: F;
  /**
   * Fully interpolated sort parameters resolved from the predefined filter.
   */
  sort?: PredefinedFilterSortParam[];
};
// export type ParsedPredefinedFilterResponse = Gen_ParsedPredefinedFilterResponse;

export type PredefinedFilterSort = SortParam[];

export type ListPredefinedFiltersOptions = Pager & {
  sort?: PredefinedFilterSort;
};

/**
 * Team Usage Stats Types
 */

/**
 * Represents a metric value for a specific date
 */
export type DailyValue = {
  /** Date in YYYY-MM-DD format */
  date: string;
  /** Metric value for this date */
  value: number;
};

/**
 * Statistics for a single metric with optional daily breakdown
 */
export type MetricStats = {
  /** Per-day values (only present in daily mode) */
  daily?: DailyValue[];
  /** Aggregated total value */
  total: number;
};

/**
 * Usage statistics for a single team containing all 16 metrics
 */
export type TeamUsageStats = {
  /** Team identifier (empty string for users not assigned to any team) */
  team: string;

  // Daily activity metrics (total = SUM of daily values)
  /** Daily active users */
  users_daily: MetricStats;
  /** Daily messages sent */
  messages_daily: MetricStats;
  /** Daily translations */
  translations_daily: MetricStats;
  /** Daily image moderations */
  image_moderations_daily: MetricStats;

  // Peak metrics (total = MAX of daily values)
  /** Peak concurrent users */
  concurrent_users: MetricStats;
  /** Peak concurrent connections */
  concurrent_connections: MetricStats;

  // Rolling/cumulative metrics (total = LATEST daily value)
  /** Total users */
  users_total: MetricStats;
  /** Users active in last 24 hours */
  users_last_24_hours: MetricStats;
  /** MAU - users active in last 30 days */
  users_last_30_days: MetricStats;
  /** Users active this month */
  users_month_to_date: MetricStats;
  /** Engaged MAU */
  users_engaged_last_30_days: MetricStats;
  /** Engaged users this month */
  users_engaged_month_to_date: MetricStats;
  /** Total messages */
  messages_total: MetricStats;
  /** Messages in last 24 hours */
  messages_last_24_hours: MetricStats;
  /** Messages in last 30 days */
  messages_last_30_days: MetricStats;
  /** Messages this month */
  messages_month_to_date: MetricStats;
};

/**
 * Options for querying team-level usage statistics
 */
export type QueryTeamUsageStatsOptions = {
  /**
   * Month in YYYY-MM format (e.g., '2026-01').
   * Mutually exclusive with start_date/end_date.
   * Returns aggregated monthly values.
   */
  month?: string;
  /**
   * Start date in YYYY-MM-DD format.
   * Used with end_date for custom date range.
   * Returns daily breakdown.
   */
  start_date?: string;
  /**
   * End date in YYYY-MM-DD format.
   * Used with start_date for custom date range.
   * Returns daily breakdown.
   */
  end_date?: string;
  /** Maximum number of teams to return per page (default: 30, max: 30) */
  limit?: number;
  /** Cursor for pagination to fetch next page of teams */
  next?: string;
};

/**
 * Response containing team-level usage statistics
 */
export type QueryTeamUsageStatsResponse = APIResponse & {
  /** Array of team usage statistics */
  teams: TeamUsageStats[];
  /** Cursor for pagination to fetch next page */
  next?: string;
};

export type RetentionPolicyConfig = {
  max_age_hours: number;
};

export type RetentionPolicy = {
  app_pk: number;
  policy: string;
  config: RetentionPolicyConfig;
  enabled_at: string;
};

export type SetRetentionPolicyResponse = APIResponse & {
  policy: RetentionPolicy;
};

export type DeleteRetentionPolicyResponse = APIResponse;

export type GetRetentionPolicyResponse = APIResponse & {
  policies: RetentionPolicy[];
};

export type RetentionRunStats = {
  channels_deleted?: number;
  messages_deleted?: number;
};

export type RetentionRunResponse = {
  app_pk: number;
  policy: string;
  date: string;
  stats: RetentionRunStats;
};

export type GetRetentionPolicyRunsOptions = {
  filter_conditions?: Record<string, unknown>;
  sort?: Array<{ field: string; direction: 1 | -1 }>;
  next?: string;
  prev?: string;
  limit?: number;
};

export type GetRetentionPolicyRunsResponse = APIResponse & {
  runs: RetentionRunResponse[];
  next?: string;
  prev?: string;
};

export type ApiClientOptions = {
  base_url?: string;
  timeout?: number;
};

export type RateLimit = {
  rate_limit?: number;
  rate_limit_remaining?: number;
  rate_limit_reset?: Date;
};

export type RequestMetadata = {
  response_headers: Record<string, string>;
  rate_limit: RateLimit;
  response_code: number;
  client_request_id: string;
};

export type StreamResponse<T> = T & {
  metadata: RequestMetadata;
};

export class StreamApiError extends Error {
  public name = 'StreamApiError';
  constructor(
    message: string,
    public metadata?: Partial<RequestMetadata>,
    public code?: number,
    errorOptions?: ErrorOptions,
  ) {
    super(message, errorOptions);
  }
}

export interface NetworkChangedEvent {
  type: 'network.changed';
  online: boolean;
}

/*
 * Helper to merge improperly typed request types which contain filter_conditions: Record<string, any>
 * and properly generated filter conditions in filter-conditions.ts (using scripts/generate-filter-types.ts) by
 * accessing x-stream-filter-fields.
 *
 * TODO: add support for `custom` field
 */
export type WithTypedFilters<
  Base,
  FilterConditions extends RequireAtLeastOne<
    Record<keyof Base, Record<string, { type: any; operators: string }>>
  >,
> = keyof FilterConditions extends keyof Base
  ? Omit<Base, keyof FilterConditions> & {
      [K in keyof FilterConditions as undefined extends Base[K] ? never : K]: Filters<
        FilterConditions[K]
      >;
    } & {
      [K in keyof FilterConditions as undefined extends Base[K] ? K : never]?: Filters<
        FilterConditions[K]
      >;
    }
  : never;

type Filters<FilterConditions extends Record<string, { type: any; operators: string }>> =
  QueryFilters<{
    [Property in keyof FilterConditions]: FilterConditions[Property]['operators'] extends string
      ?
          | RequireAtLeastOne<{
              [Operator in FilterConditions[Property]['operators']]:
                | (Operator extends '$in' | '$nin'
                    ? Array<FilterConditions[Property]['type']>
                    : Operator extends '$exists'
                      ? boolean
                      : FilterConditions[Property]['type'])
                | null;
            }>
          | FilterConditions[Property]['type']
          | null
      : undefined;
  }>;

export type EventPayload<T extends CombinedEvents['type'] | (string & {})> = Extract<
  CombinedEvents,
  { type: T }
>;

export type RequireLiteral<L, T extends keyof L> = Omit<L, T> & Required<Pick<L, T>>;

export type ReplaceCustom<T extends { custom?: any }, L> = Omit<T, 'custom'> &
  (undefined extends T['custom'] ? { custom?: L } : { custom: L });
