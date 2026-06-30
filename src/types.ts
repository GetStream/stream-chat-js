import type { Channel } from './channel';
import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import type { StableWSConnection } from './connection';
import type { LogLevel } from '@stream-io/logger';
import type { ChatLoggerScope, ConfigureLoggersOptions } from './logger';
import type { RoleName } from './permissions';
import type {
  CustomAttachmentData,
  CustomChannelData,
  CustomCommandData,
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
  APIError as Gen_APIError,
  Attachment as Gen_Attachment,
  AutomodDetailsResponse as Gen_AutomodDetailsResponse,
  ChannelConfigWithInfo as Gen_ChannelConfigWithInfo,
  ChannelGetOrCreateRequest as Gen_ChannelGetOrCreateRequest,
  ChannelInput as Gen_ChannelInput,
  ChannelMemberResponse as Gen_ChannelMemberResponse,
  ChannelMute as Gen_ChannelMute,
  ChannelOwnCapability as Gen_ChannelOwnCapability,
  ChannelResponse as Gen_ChannelResponse,
  ChannelStateResponse as Gen_ChannelStateResponse,
  ChannelStateResponseFields as Gen_ChannelStateResponseFields,
  Command as Gen_Command,
  CreateDeviceRequest as Gen_CreateDeviceRequest,
  CreatePollRequest as Gen_CreatePollRequest,
  DraftPayloadResponse as Gen_DraftPayloadResponse,
  DraftResponse as Gen_DraftResponse,
  Field as Gen_Field,
  FileUploadConfig as Gen_FileUploadConfig,
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
  PendingMessageResponse as Gen_PendingMessageResponse,
  PollResponseData as Gen_PollResponseData,
  PollVoteResponseData as Gen_PollVoteResponseData,
  PrivacySettingsResponse as Gen_PrivacySettingsResponse,
  PushPreferenceInput as Gen_PushPreferenceInput,
  QueryBannedUsersPayload as Gen_QueryBannedUsersPayload,
  QueryChannelsRequest as Gen_QueryChannelsRequest,
  QueryChannelsResponse as Gen_QueryChannelsResponse,
  QueryFutureChannelBansPayload as Gen_QueryFutureChannelBansPayload,
  QueryMembersPayload as Gen_QueryMembersPayload,
  QueryPollsResponse as Gen_QueryPollsResponse,
  QueryReactionsResponse as Gen_QueryReactionsResponse,
  QueryRemindersResponse as Gen_QueryRemindersResponse,
  QueryThreadsRequest as Gen_QueryThreadsRequest,
  QueryUsersPayload as Gen_QueryUsersPayload,
  ReactionGroupResponse as Gen_ReactionGroupResponse,
  ReactionRequest as Gen_ReactionRequest,
  ReactionResponse as Gen_ReactionResponse,
  ReadStateResponse as Gen_ReadStateResponse,
  ReminderResponseData as Gen_ReminderResponseData,
  SearchPayload as Gen_SearchPayload,
  SearchWarning as Gen_SearchWarning,
  SendMessageRequest as Gen_SendMessageRequest,
  SendMessageResponse as Gen_SendMessageResponse,
  SendReactionRequest as Gen_SendReactionRequest,
  SharedLocation as Gen_SharedLocation,
  SharedLocationResponseData as Gen_SharedLocationResponseData,
  SortParamRequest as Gen_SortParamRequest,
  ThreadStateResponse as Gen_ThreadStateResponse,
  TruncateChannelRequest as Gen_TruncateChannelRequest,
  UpdateChannelPartialRequest as Gen_UpdateChannelPartialRequest,
  UpdateChannelRequest as Gen_UpdateChannelRequest,
  UpdateLiveLocationRequest as Gen_UpdateLiveLocationRequest,
  UpdateMessageRequest as Gen_UpdateMessageRequest,
  UpdatePollOptionRequest as Gen_UpdatePollOptionRequest,
  UpdatePollRequest as Gen_UpdatePollRequest,
  UpdateUserPartialRequest as Gen_UpdateUserPartialRequest,
  UpsertPushPreferencesResponse as Gen_UpsertPushPreferencesResponse,
  UserMuteResponse as Gen_UserMuteResponse,
  UserRequest as Gen_UserRequest,
  UserResponse as Gen_UserResponse,
  VoteData as Gen_VoteData,
  WSEvent,
} from './gen/models';
import type {
  QueryBannedUsersPayloadFilterConditions as Gen_QueryBannedUsersPayloadFilterConditions,
  QueryChannelsRequestFilterConditions as Gen_QueryChannelsRequestFilterConditions,
  QueryReactionsRequestFilter as Gen_QueryReactionsRequestFilter,
  QueryThreadsRequestFilter as Gen_QueryThreadsRequestFilter,
  SearchPayloadFilterConditions as Gen_SearchPayloadFilterConditions,
  SearchPayloadMessageFilterConditions as Gen_SearchPayloadMessageFilterConditions,
  QueryMembersPayloadFilterConditions,
  QueryUsersPayloadFilterConditions,
} from './gen/models/filter-conditions';
import type { ChatApi } from './gen-imports';

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

export type RequireAtLeastOne<T> = {
  [K in keyof T]-?: Required<Pick<T, K>> & Partial<Omit<T, K>>;
}[keyof T];

export type RequireOnlyOne<T, Keys extends keyof T = keyof T> = Omit<T, Keys> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Record<Exclude<Keys, K>, undefined>>;
  }[Keys];

export type UR = Record<string, unknown>;

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

export type ChannelResponse = ReplacePropertyTypes<
  Gen_ChannelResponse,
  { custom: CustomChannelData }
>;

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
  channel_role?: RoleName;
  pinned?: boolean;
};

export type ChannelMemberResponse = ReplacePropertyTypes<
  Gen_ChannelMemberResponse,
  { custom: CustomMemberData }
>;

export type CommandResponse = Gen_Command;

export type ConnectAPIResponse = Promise<void | ConnectionOpen>;

export type DeleteChannelAPIResponse = APIResponse & {
  channel: ChannelResponse;
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

export type LocalMessage = MessageResponse & {
  status: string;
  error?: StreamAPIError;
  user_id?: string;
};

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

export type GetThreadOptions = Omit<Parameters<ChatApi['getThread']>[0], 'message_id'>;

export type GetThreadAPIResponse = APIResponse & {
  thread: ThreadResponse;
};

export type GetMultipleMessagesAPIResponse = APIResponse & {
  messages: MessageResponse[];
};

export enum Product {
  Chat = 'chat',
  Video = 'video',
  Moderation = 'moderation',
  Feeds = 'feeds',
}

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

export type PushPreference = Gen_PushPreferenceInput;

export type UpsertPushPreferencesResponse = Gen_UpsertPushPreferencesResponse;

export type MuteChannelAPIResponse = APIResponse & {
  channel_mute: ChannelMute;
  own_user: OwnUserResponse;
  channel_mutes?: ChannelMute[];
  mute?: MuteResponse;
};

export type MessageResponse = ReplacePropertyTypes<
  Gen_MessageResponse,
  {
    custom: CustomMessageData;
    attachments: Attachment[];
    latest_reactions: ReactionResponse[];
    mentioned_users: UserResponse[];
    own_reactions: ReactionResponse[];
    pinned_by: UserResponse;
    thread_participants: UserResponse[];
    quoted_message: MessageResponse;
    poll: PollResponse;
    user: UserResponse;
  }
>;

export type ReactionGroupResponse = Gen_ReactionGroupResponse;

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

export type OwnUserResponse = ReplacePropertyTypes<
  Gen_OwnUserResponse,
  { custom: CustomUserData }
>;

export type PartialUpdateChannelAPIResponse = APIResponse & {
  channel: ChannelResponse;
  members: ChannelMemberResponse[];
};

export type ReactionAPIResponse = APIResponse & {
  message: MessageResponse;
  reaction: ReactionResponse;
};

export type ReactionResponse = ReplacePropertyTypes<
  Gen_ReactionResponse,
  { custom: CustomReactionData }
>;

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
  name: RoleName;
  custom: boolean;
  scopes: string[];
  created_at: string;
  updated_at: string;
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

export type SendMessageAPIResponse = Gen_SendMessageResponse;

export type SyncResponse = APIResponse & {
  events: WSEvent[];
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

export type UpdateMessageAPIResponse = APIResponse & {
  message: MessageResponse;
};

export type UsersAPIResponse = APIResponse & {
  users: Array<UserResponse>;
  membership_deletion_task_id?: string;
};

export type UserResponse = ReplacePropertyTypes<
  Gen_UserResponse,
  { custom: CustomUserData }
>;

export type PrivacySettings = Gen_PrivacySettingsResponse;

export type MessageFlagsPaginationOptions = {
  limit?: number;
  offset?: number;
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

export type ChannelQueryOptions = ReplacePropertyTypes<
  Gen_ChannelGetOrCreateRequest,
  { data: ChannelData }
>;

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

export type NewMemberPayload = CustomMemberData &
  Pick<ChannelMemberResponse, 'user_id' | 'channel_role'>;

export type Thresholds = Partial<
  Record<'explicit' | 'spam' | 'toxic', Partial<{ block: number; flag: number }>>
>;

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
export type Command = Gen_Command;

export type MarkChannelsReadOptions = Gen_MarkChannelsReadRequest;

export type MarkReadOptions = Gen_MarkReadRequest;

export type MarkUnreadOptions = Gen_MarkUnreadRequest;

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
  Omit<Gen_QueryMembersPayload, 'filter_conditions'>
>;

export type QueryMembersPayload = WithTypedFilters<
  Gen_QueryMembersPayload,
  {
    filter_conditions: QueryMembersPayloadFilterConditions;
  }
>;

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
   * Sets the instance of `StableWSConnection` on the chat client. Intended purely for testing and
   * should not be used in production apps.
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
   * Returns channels from the request that the user does not have access to in a separate field
   * in the response called `inaccessible_cids` instead of adding them as
   * `notification.removed_from_channel` events.
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

export type UserOptions = {
  include_deactivated_users?: boolean;
  limit?: number;
  offset?: number;
  presence?: boolean;
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

export type QueryBannedUsersPayload = WithTypedFilters<
  Gen_QueryBannedUsersPayload,
  { filter_conditions: Gen_QueryBannedUsersPayloadFilterConditions }
>;

export type BannedUsersFilters = QueryBannedUsersPayload['filter_conditions'];

export type ReactionFilters = NonNullable<QueryReactionsRequest['filter']>;

export type QueryReactionsRequest = WithTypedFilters<
  Parameters<ChatApi['queryReactions']>[0],
  { filter: Gen_QueryReactionsRequestFilter }
>;

type QueryUsersPayload = WithTypedFilters<
  Gen_QueryUsersPayload,
  {
    filter_conditions: QueryUsersPayloadFilterConditions;
  }
>;

export type QueryChannelsRequest = WithTypedFilters<
  Gen_QueryChannelsRequest,
  { filter_conditions: Gen_QueryChannelsRequestFilterConditions }
>;

export type ChannelFilters = NonNullable<QueryChannelsRequest['filter_conditions']>;

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

export type UserFilters = QueryUsersPayload['filter_conditions'];

export type MemberFilters = QueryMembersPayload['filter_conditions'];

/**
 * Sort Types
 */

export type BannedUsersSort = Gen_SortParamRequest[];

export type ReactionSort = Gen_SortParamRequest[];

export type ChannelSort = Gen_SortParamRequest[];

export type PinnedMessagesSort = Gen_SortParamRequest[];

export type UserSort = Gen_SortParamRequest[];

export type MemberSort = Gen_SortParamRequest[];

export type SearchMessageSort = Gen_SortParamRequest[];

export type DraftSort = Gen_SortParamRequest[];

export type PollSort = Gen_SortParamRequest[];

export type VoteSort = Gen_SortParamRequest[];

/**
 * Base Types
 */

export type Action = Gen_Action;

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

export type Attachment = ReplacePropertyTypes<
  Gen_Attachment,
  { custom: CustomAttachmentData & { file_size?: number; mime_type?: string } }
>;

export type OGAttachment = RequireLiteral<Attachment, 'og_scrape_url'>;

export type BlockList = {
  name: string;
  words: string[];
  team?: string;
  type?: string;
  validate?: boolean;
  is_leet_check_enabled?: boolean;
  is_plural_check_enabled?: boolean;
};

export type ChannelConfigAutomod = Automod;

export type ChannelConfigAutomodBehavior = AutomodBehavior;

export type ChannelConfigAutomodThresholds = null | Thresholds;

export type ChannelConfigWithInfo = Gen_ChannelConfigWithInfo;

export type ChannelData = ReplacePropertyTypes<
  Gen_ChannelInput,
  { custom: CustomChannelData }
>;

export type ChannelMute = Gen_ChannelMute;

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

export type ConnectionOpen = EventPayload<'health.check'>;

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

export type Message = ReplacePropertyTypes<
  Gen_MessageRequest,
  { custom: CustomMessageData }
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

export type PartialUpdateChannel = Gen_UpdateChannelPartialRequest;

export type PartialUpdateMember = {
  set?: ChannelMemberUpdates;
  unset?: Array<keyof ChannelMemberUpdates>;
};

// TODO: properly type set/unset types based on keys in Gen_UserRequest
export type PartialUserUpdate = Gen_UpdateUserPartialRequest;

// TODO: new type, naming sucks - rename to something that makes sense
export type UserUpdate = ReplacePropertyTypes<
  Gen_UserRequest,
  { custom: CustomUserData }
>;

export type MessageUpdatableFields = Omit<
  MessageResponse,
  'cid' | 'created_at' | 'updated_at' | 'deleted_at' | 'user' | 'user_id'
>;

export type PartialMessageUpdate = {
  set?: Partial<MessageUpdatableFields>;
  unset?: Array<keyof MessageUpdatableFields>;
};

export type PendingMessageResponse = Gen_PendingMessageResponse; //Gen_SendMessageResponse;

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

export type Reaction = ReplacePropertyTypes<
  Gen_ReactionRequest,
  { custom: CustomReactionData }
>;

export type SearchPayload = WithTypedFilters<
  Gen_SearchPayload,
  {
    filter_conditions: Gen_SearchPayloadFilterConditions;
    message_filter_conditions: Gen_SearchPayloadMessageFilterConditions;
  }
>;

export type TokenOrProvider = null | string | TokenProvider | undefined;

export type TokenProvider = () => Promise<string>;

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

export type Pager = {
  limit?: number;
  next?: string;
  prev?: string;
};

export type TruncateOptions = Gen_TruncateChannelRequest;

export type MessageSetType = 'latest' | 'current' | 'new';
export type MessageSet = {
  isCurrent: boolean;
  isLatest: boolean;
  messages: LocalMessage[];
  pagination: { hasNext: boolean; hasPrev: boolean };
};

export type APIErrorResponse = Gen_APIError;

export class StreamAPIError<T = APIErrorResponse> extends Error {
  public code: number | undefined;
  public status: number | undefined;
  public response: AxiosResponse<T> | undefined;

  constructor(
    message: string,
    {
      code,
      status,
      response,
    }: {
      /**
       * Stream error code (`APIError.code`)
       */
      code: StreamAPIError<T>['code'];
      /**
       * HTTP status code
       */
      status: StreamAPIError<T>['status'];
      response: StreamAPIError<T>['response'];
    },
  ) {
    super(message);
    this.code = code;
    this.response = response;
    this.status = status;
  }

  get name() {
    let tags = StreamAPIError.withMetadata({ status: this.status, code: this.code });

    if (tags.length) {
      tags = `(${tags})`;
    }

    return `StreamAPIError${tags}`;
  }

  static withMetadata(metadata: Record<string, any>) {
    const extra = Object.entries(metadata);

    const joinable = [];

    for (const [key, value] of extra) {
      if (typeof value !== 'undefined' && value !== null && `${value}`.length) {
        joinable.push(`${key}: ${value}`);
      }
    }

    return `${joinable.join(', ')}`;
  }

  // Vitest helper (serialized errors are too large to read)
  // https://github.com/vitest-dev/vitest/blob/v3.1.3/packages/utils/src/error.ts#L60-L62
  toJSON() {
    return {
      message: this.message,
      stack: this.stack,
      name: this.name,
      code: this.code,
      status: this.status,
    } as const;
  }
}

/**
 * @deprecated Use `StreamAPIError` instead.
 */
export const ErrorFromResponse = StreamAPIError;

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

export type PollResponse = ReplacePropertyTypes<
  Gen_PollResponseData,
  { custom: CustomPollData }
> &
  PollEnrichData;

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

export type PollData = ReplacePropertyTypes<
  Gen_UpdatePollRequest,
  { custom: CustomPollData }
>;

export type CreatePollData = ReplacePropertyTypes<
  Gen_CreatePollRequest,
  { custom: CustomPollData }
>;

export type PartialPollUpdate = {
  set?: Partial<PollData>;
  unset?: Array<keyof PollData>;
};

export type PollOptionData = ReplacePropertyTypes<
  Gen_UpdatePollOptionRequest,
  { custom: CustomPollOptionData }
> & {
  position?: number;
};

export type PollVoteData = Gen_VoteData & {
  is_answer?: boolean;
};

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

export type ModerationPayload = Gen_ModerationPayload;

export type MessageDeletionStrategy = 'soft' | 'hard' | 'pruning';
// @deprecated use type MessageDeletionStrategy instead

export type DeleteMessageOptions = {
  deleteForMe?: boolean;
  hardDelete?: boolean;
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

export type AIState =
  | 'AI_STATE_ERROR'
  | 'AI_STATE_CHECKING_SOURCES'
  | 'AI_STATE_THINKING'
  | 'AI_STATE_GENERATING'
  | (string & {});

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

export type DraftResponse = ReplacePropertyTypes<
  Gen_DraftResponse,
  {
    message: DraftMessage;
    parent_message?: MessageResponse | LocalMessage;
    quoted_message?: MessageResponse | LocalMessage;
  }
>;

export type CreateDraftResponse = APIResponse & {
  draft: DraftResponse;
};

export type GetDraftResponse = APIResponse & {
  draft: DraftResponse;
};
export type DraftMessagePayload = Message;

export type DraftMessage = ReplacePropertyTypes<
  Gen_DraftPayloadResponse,
  { custom: CustomMessageData }
> &
  Partial<
    Pick<
      Gen_MessageResponse,
      | 'shared_location'
      | 'mentioned_channel'
      | 'mentioned_group_ids'
      | 'mentioned_groups'
      | 'mentioned_here'
      | 'mentioned_roles'
    >
  >;

export type ActiveLiveLocationsAPIResponse = APIResponse & {
  active_live_locations: SharedLiveLocationResponse[];
};

export type SharedLocationResponse = Gen_SharedLocationResponseData;

export type SharedLiveLocationResponse = RequireLiteral<SharedLocationResponse, 'end_at'>;

export type UpdateLocationPayload = Gen_UpdateLiveLocationRequest;

export type StaticLocationPayload = Gen_SharedLocation;

export type LiveLocationPayload = RequireLiteral<Gen_SharedLocation, 'end_at'>;

export type ThreadSort = Gen_SortParamRequest[];

export type ThreadFilters = NonNullable<QueryThreadsOptions['filter']>;

export type ReminderResponse = Gen_ReminderResponseData;

export type ReminderAPIResponse = APIResponse & {
  reminder: ReminderResponse;
};

export type CreateReminderOptions = Parameters<ChatApi['createReminder']>[0];

export type UpdateReminderOptions = Parameters<ChatApi['updateReminder']>[0];

export type ReminderFilters = QueryFilters<{
  channel_cid?:
    | RequireOnlyOne<Pick<QueryFilter<ReminderResponse['channel_cid']>, '$eq' | '$in'>>
    | PrimitiveFilter<ReminderResponse['channel_cid']>;
  created_at?:
    | RequireOnlyOne<
        Pick<
          QueryFilter<ReminderResponse['created_at']>,
          '$eq' | '$gt' | '$lt' | '$gte' | '$lte'
        >
      >
    | PrimitiveFilter<ReminderResponse['created_at']>;
  message_id?:
    | RequireOnlyOne<Pick<QueryFilter<ReminderResponse['message_id']>, '$eq' | '$in'>>
    | PrimitiveFilter<ReminderResponse['message_id']>;
  remind_at?:
    | RequireOnlyOne<
        Pick<
          QueryFilter<ReminderResponse['remind_at']>,
          '$exists' | '$eq' | '$gt' | '$lt' | '$gte' | '$lte'
        >
      >
    | PrimitiveFilter<ReminderResponse['remind_at']>;
  user_id?:
    | RequireOnlyOne<Pick<QueryFilter<ReminderResponse['user_id']>, '$eq' | '$in'>>
    | PrimitiveFilter<ReminderResponse['user_id']>;
}>;

export type ReminderSort = Gen_SortParamRequest[];

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

export type ReplacePropertyTypes<
  Base,
  Replacement extends RequireAtLeastOne<Record<keyof Base, any>>,
> = keyof Replacement extends keyof Base
  ? Omit<Base, keyof Replacement> & {
      [K in keyof Replacement as undefined extends Base[K] ? never : K]: Replacement[K];
    } & {
      [K in keyof Replacement as undefined extends Base[K] ? K : never]?: Replacement[K];
    }
  : never;
