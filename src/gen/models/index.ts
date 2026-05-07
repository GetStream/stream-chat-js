export interface AIImageConfig {
  enabled: boolean;

  ocr_rules: Array<OCRRule>;

  rules: Array<AWSRekognitionRule>;

  async?: boolean;
}

export interface AIImageLabelDefinition {
  description: string;

  group: string;

  key: string;

  label: string;
}

export interface AIIndicatorClearEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  /**
   * The type of event: "ai_indicator.clear" in this case
   */
  type: string;

  /**
   * The ID of the channel
   */
  channel_id?: string;

  /**
   * The type of the channel
   */
  channel_type?: string;

  /**
   * The CID of the channel
   */
  cid?: string;

  received_at?: Date;
}

export interface AIIndicatorStopEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  /**
   * The type of event: "ai_indicator.stop" in this case
   */
  type: string;

  /**
   * The ID of the channel
   */
  channel_id?: string;

  /**
   * The type of the channel
   */
  channel_type?: string;

  /**
   * The CID of the channel
   */
  cid?: string;

  received_at?: Date;
}

export interface AIIndicatorUpdateEvent {
  /**
   * The state of the AI indicator
   */
  ai_state: string;

  /**
   * Date/time of creation
   */
  created_at: Date;

  /**
   * The ID of the message
   */
  message_id: string;

  custom: Record<string, any>;

  /**
   * The type of event: "ai_indicator.update" in this case
   */
  type: string;

  /**
   * Optional message from the AI
   */
  ai_message?: string;

  /**
   * The ID of the channel
   */
  channel_id?: string;

  /**
   * The type of the channel
   */
  channel_type?: string;

  /**
   * The CID of the channel
   */
  cid?: string;

  received_at?: Date;
}

export interface AITextConfig {
  enabled: boolean;

  profile: string;

  rules: Array<BodyguardRule>;

  severity_rules: Array<BodyguardSeverityRule>;

  async?: boolean;
}

export interface AIVideoConfig {
  enabled: boolean;

  rules: Array<AWSRekognitionRule>;

  async?: boolean;
}

export interface APIError {
  /**
   * API error code
   */
  code: number;

  /**
   * Request duration
   */
  duration: string;

  /**
   * Message describing an error
   */
  message: string;

  /**
   * URL with additional information
   */
  more_info: string;

  /**
   * Response HTTP status code
   */
  status_code: number;

  /**
   * Additional error-specific information
   */
  details: Array<number>;

  /**
   * Flag that indicates if the error is unrecoverable, requests that return unrecoverable errors should not be retried, this error only applies to the request that caused it
   */
  unrecoverable?: boolean;

  /**
   * Additional error info
   */
  exception_fields?: Record<string, string>;
}

export interface AWSRekognitionRule {
  action: 'flag' | 'shadow' | 'remove' | 'bounce' | 'bounce_flag' | 'bounce_remove';

  label: string;

  min_confidence: number;

  subclassifications?: Record<string, any>;
}

export interface Action {
  name: string;

  text: string;

  type: string;

  style?: string;

  value?: string;
}

export interface ActionLogResponse {
  /**
   * Timestamp when the action was taken
   */
  created_at: Date;

  /**
   * Unique identifier of the action log
   */
  id: string;

  /**
   * Reason for the moderation action
   */
  reason: string;

  /**
   * Classification of who triggered the action (e.g. user, moderator, automod, api_integration)
   */
  reporter_type: string;

  /**
   * ID of the user who was the target of the action
   */
  target_user_id: string;

  /**
   * Type of moderation action
   */
  type: string;

  /**
   * ID of the user who performed the action
   */
  user_id: string;

  ai_providers: Array<string>;

  /**
   * Additional metadata about the action
   */
  custom: Record<string, any>;

  review_queue_item?: ReviewQueueItemResponse;

  target_user?: UserResponse;

  user?: UserResponse;
}

export interface ActionSequence {
  action: string;

  blur: boolean;

  cooldown_period: number;

  threshold: number;

  time_window: number;

  warning: boolean;

  warning_text: string;
}

export interface AddUserGroupMembersRequest {
  /**
   * List of user IDs to add as members
   */
  member_ids: Array<string>;

  /**
   * Whether to add the members as group admins. Defaults to false
   */
  as_admin?: boolean;

  team_id?: string;
}

export interface AddUserGroupMembersResponse {
  duration: string;

  user_group?: UserGroupResponse;
}

export interface AppEventResponse {
  /**
   * boolean
   */
  auto_translation_enabled: boolean;

  /**
   * string
   */
  name: string;

  /**
   * boolean
   */
  async_url_enrich_enabled?: boolean;

  file_upload_config?: FileUploadConfig;

  image_upload_config?: FileUploadConfig;
}

export interface AppResponseFields {
  async_url_enrich_enabled: boolean;

  auto_translation_enabled: boolean;

  id: number;

  name: string;

  placement: string;

  file_upload_config: FileUploadConfig;

  image_upload_config: FileUploadConfig;
}

export interface AppUpdatedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  app: AppEventResponse;

  custom: Record<string, any>;

  /**
   * The type of event: "app.updated" in this case
   */
  type: string;

  received_at?: Date;
}

export interface AppealItemResponse {
  /**
   * Reason Text of the Appeal Item
   */
  appeal_reason: string;

  /**
   * When the flag was created
   */
  created_at: Date;

  /**
   * ID of the entity
   */
  entity_id: string;

  /**
   * Type of entity
   */
  entity_type: string;

  id: string;

  /**
   * Status of the Appeal Item
   */
  status: string;

  /**
   * When the flag was last updated
   */
  updated_at: Date;

  /**
   * Decision Reason of the Appeal Item
   */
  decision_reason?: string;

  /**
   * Attachments(e.g. Images) of the Appeal Item
   */
  attachments?: Array<string>;

  entity_content?: ModerationPayload;

  user?: UserResponse;
}

export interface AppealRequest {
  /**
   * Explanation for why the content is being appealed
   */
  appeal_reason: string;

  /**
   * Unique identifier of the entity being appealed
   */
  entity_id: string;

  /**
   * Type of entity being appealed (e.g., message, user)
   */
  entity_type: string;

  /**
   * Array of Attachment URLs(e.g., images)
   */
  attachments?: Array<string>;
}

export interface AppealResponse {
  /**
   * Unique identifier of the created Appeal item
   */
  appeal_id: string;

  duration: string;
}

export interface Attachment {
  custom: Record<string, any>;

  asset_url?: string;

  author_icon?: string;

  author_link?: string;

  author_name?: string;

  color?: string;

  fallback?: string;

  footer?: string;

  footer_icon?: string;

  image_url?: string;

  og_scrape_url?: string;

  original_height?: number;

  original_width?: number;

  pretext?: string;

  text?: string;

  thumb_url?: string;

  title?: string;

  title_link?: string;

  /**
   * Attachment type (e.g. image, video, url)
   */
  type?: string;

  actions?: Array<Action>;

  fields?: Array<Field>;

  giphy?: Images;
}

export interface AutomodDetailsResponse {
  action?: string;

  original_message_type?: string;

  image_labels?: Array<string>;

  message_details?: FlagMessageDetailsResponse;

  result?: MessageModerationResult;
}

export interface AutomodPlatformCircumventionConfig {
  enabled: boolean;

  rules: Array<AutomodRule>;

  async?: boolean;
}

export interface AutomodRule {
  action: 'flag' | 'shadow' | 'remove' | 'bounce' | 'bounce_flag' | 'bounce_remove';

  label: string;

  threshold: number;
}

export interface AutomodSemanticFiltersConfig {
  enabled: boolean;

  rules: Array<AutomodSemanticFiltersRule>;

  async?: boolean;
}

export interface AutomodSemanticFiltersRule {
  action: 'flag' | 'shadow' | 'remove' | 'bounce' | 'bounce_flag' | 'bounce_remove';

  name: string;

  threshold: number;
}

export interface AutomodToxicityConfig {
  enabled: boolean;

  rules: Array<AutomodRule>;

  async?: boolean;
}

export interface BanActionRequestPayload {
  /**
   * Also ban user from all channels this moderator creates in the future
   */
  ban_from_future_channels?: boolean;

  /**
   * Ban only from specific channel
   */
  channel_ban_only?: boolean;

  channel_cid?: string;

  /**
   * Message deletion mode: soft, pruning, or hard
   */

  delete_messages?: 'soft' | 'pruning' | 'hard';

  /**
   * Whether to ban by IP address
   */
  ip_ban?: boolean;

  /**
   * Reason for the ban
   */
  reason?: string;

  /**
   * Whether this is a shadow ban
   */
  shadow?: boolean;

  /**
   * Optional: ban user directly without review item
   */
  target_user_id?: string;

  /**
   * Duration of ban in minutes
   */
  timeout?: number;
}

export interface BanInfoResponse {
  /**
   * When the ban was created
   */
  created_at: Date;

  /**
   * When the ban expires
   */
  expires?: Date;

  /**
   * Reason for the ban
   */
  reason?: string;

  /**
   * Whether this is a shadow ban
   */
  shadow?: boolean;

  created_by?: UserResponse;

  user?: UserResponse;
}

export interface BanOptions {
  delete_messages?: 'soft' | 'pruning' | 'hard';

  duration?: number;

  ip_ban?: boolean;

  reason?: string;

  shadow_ban?: boolean;
}

export interface BanRequest {
  /**
   * ID of the user to ban
   */
  target_user_id: string;

  /**
   * ID of the user performing the ban
   */
  banned_by_id?: string;

  /**
   * Channel where the ban applies
   */
  channel_cid?: string;

  delete_messages?: 'soft' | 'pruning' | 'hard';

  /**
   * Whether to ban the user's IP address
   */
  ip_ban?: boolean;

  /**
   * Optional explanation for the ban
   */
  reason?: string;

  /**
   * Whether this is a shadow ban
   */
  shadow?: boolean;

  /**
   * Duration of the ban in minutes
   */
  timeout?: number;

  banned_by?: UserRequest;
}

export interface BanResponse {
  created_at: Date;

  expires?: Date;

  reason?: string;

  shadow?: boolean;

  banned_by?: UserResponse;

  channel?: ChannelResponse;

  user?: UserResponse;
}

export interface BlockActionRequestPayload {
  /**
   * Reason for blocking
   */
  reason?: string;
}

export interface BlockListConfig {
  enabled: boolean;

  rules: Array<BlockListRule>;

  async?: boolean;

  match_substring?: boolean;
}

export interface BlockListOptions {
  /**
   * Blocklist behavior. One of: flag, block, shadow_block
   */

  behavior: 'flag' | 'block' | 'shadow_block';

  /**
   * Blocklist name
   */
  blocklist: string;
}

export interface BlockListResponse {
  is_leet_check_enabled: boolean;

  is_plural_check_enabled: boolean;

  /**
   * Block list name
   */
  name: string;

  /**
   * Block list type. One of: regex, domain, domain_allowlist, email, email_allowlist, word
   */
  type: string;

  /**
   * List of words to block
   */
  words: Array<string>;

  /**
   * Date/time of creation
   */
  created_at?: Date;

  id?: string;

  team?: string;

  /**
   * Date/time of the last update
   */
  updated_at?: Date;
}

export interface BlockListRule {
  action:
    | 'flag'
    | 'mask_flag'
    | 'shadow'
    | 'remove'
    | 'bounce'
    | 'bounce_flag'
    | 'bounce_remove';

  name: string;

  team: string;
}

export interface BlockUsersRequest {
  /**
   * User id to block
   */
  blocked_user_id: string;
}

export interface BlockUsersResponse {
  /**
   * User id who blocked another user
   */
  blocked_by_user_id: string;

  /**
   * User id who got blocked
   */
  blocked_user_id: string;

  /**
   * Timestamp when the user was blocked
   */
  created_at: Date;

  /**
   * Duration of the request in milliseconds
   */
  duration: string;
}

export interface BlockedUserResponse {
  /**
   * ID of the user who got blocked
   */
  blocked_user_id: string;

  created_at: Date;

  /**
   * ID of the user who blocked another user
   */
  user_id: string;

  blocked_user: UserResponse;

  user: UserResponse;
}

export interface BodyguardProfileSummary {
  name: string;

  display_name?: string;
}

export interface BodyguardRule {
  action:
    | 'keep'
    | 'flag'
    | 'shadow'
    | 'remove'
    | 'bounce'
    | 'bounce_flag'
    | 'bounce_remove';

  label: string;

  severity_rules: Array<BodyguardSeverityRule>;
}

export interface BodyguardSeverityRule {
  action: 'flag' | 'shadow' | 'remove' | 'bounce' | 'bounce_flag' | 'bounce_remove';

  severity: 'low' | 'medium' | 'high' | 'critical';
}

export interface BulkDeleteActionConfigRequest {
  /**
   * UUIDs of the action configs to delete
   */
  ids: Array<string>;
}

export interface BulkDeleteActionConfigResponse {
  /**
   * Number of action configs deleted
   */
  deleted: number;

  duration: string;
}

export interface BulkUpsertActionConfigRequest {
  /**
   * List of action configs to create or update
   */
  action_configs: Array<UpsertActionConfigItem>;
}

export interface BulkUpsertActionConfigResponse {
  duration: string;

  /**
   * The created or updated action configs in the same order as the request
   */
  action_configs: Array<ModerationActionConfigResponse>;
}

export interface BypassActionRequest {
  enabled?: boolean;
}

export interface CallActionOptions {
  duration?: number;

  flag_reason?: string;

  kick_reason?: string;

  mute_audio?: boolean;

  mute_video?: boolean;

  reason?: string;

  warning_text?: string;
}

export interface CallCustomPropertyParameters {
  operator?: string;

  property_key?: string;
}

export interface CallResponse {
  backstage: boolean;

  captioning: boolean;

  cid: string;

  created_at: Date;

  current_session_id: string;

  id: string;

  recording: boolean;

  transcribing: boolean;

  translating: boolean;

  type: string;

  updated_at: Date;

  blocked_user_ids: Array<string>;

  custom: Record<string, any>;

  channel_cid?: string;

  ended_at?: Date;

  join_ahead_time_seconds?: number;

  routing_number?: string;

  starts_at?: Date;

  team?: string;

  created_by?: UserResponse;
}

export interface CallRuleActionSequence {
  violation_number?: number;

  actions?: Array<string>;

  call_options?: CallActionOptions;
}

export interface CallTypeRuleParameters {
  call_type?: string;
}

export interface CallViolationCountParameters {
  threshold?: number;

  time_window?: string;
}

export interface CastPollVoteRequest {
  vote?: VoteData;
}

export interface ChannelConfig {
  blocklist?: string;

  blocklist_behavior?: 'flag' | 'block';

  /**
   * Enable/disable message counting
   */
  count_messages?: boolean;

  /**
   * Overrides max message length
   */
  max_message_length?: number;

  /**
   * Overrides the push notification level for this channel
   */

  push_level?: 'all' | 'all_mentions' | 'mentions' | 'direct_mentions' | 'none';

  /**
   * Enables message quotes
   */
  quotes?: boolean;

  /**
   * Enables or disables reactions
   */
  reactions?: boolean;

  /**
   * Enables message replies (threads)
   */
  replies?: boolean;

  /**
   * Enable/disable shared locations
   */
  shared_locations?: boolean;

  /**
   * Enables or disables typing events
   */
  typing_events?: boolean;

  /**
   * Enables or disables file uploads
   */
  uploads?: boolean;

  /**
   * Enables or disables URL enrichment
   */
  url_enrichment?: boolean;

  /**
   * Enable/disable user message reminders
   */
  user_message_reminders?: boolean;

  /**
   * List of commands that channel supports
   */
  commands?: Array<string>;

  chat_preferences?: ChatPreferences;

  grants?: Record<string, Array<string>>;
}

export interface ChannelConfigWithInfo {
  automod: 'disabled' | 'simple' | 'AI';

  automod_behavior: 'flag' | 'block' | 'shadow_block';

  connect_events: boolean;

  count_messages: boolean;

  created_at: Date;

  custom_events: boolean;

  delivery_events: boolean;

  mark_messages_pending: boolean;

  max_message_length: number;

  mutes: boolean;

  name: string;

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

  updated_at: Date;

  uploads: boolean;

  url_enrichment: boolean;

  user_message_reminders: boolean;

  commands: Array<Command>;

  blocklist?: string;

  blocklist_behavior?: 'flag' | 'block' | 'shadow_block';

  partition_size?: number;

  partition_ttl?: string;

  push_level?: 'all' | 'all_mentions' | 'mentions' | 'direct_mentions' | 'none';

  allowed_flag_reasons?: Array<string>;

  blocklists?: Array<BlockListOptions>;

  automod_thresholds?: Thresholds;

  chat_preferences?: ChatPreferences;

  grants?: Record<string, Array<string>>;
}

export interface ChannelCreatedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  channel: ChannelResponse;

  custom: Record<string, any>;

  /**
   * The type of event: "channel.created" in this case
   */
  type: string;

  /**
   * The ID of the channel which was created
   */
  channel_id?: string;

  /**
   * The number of members in the channel
   */
  channel_member_count?: number;

  channel_message_count?: number;

  /**
   * The type of the channel which was created
   */
  channel_type?: string;

  /**
   * The CID of the channel which was created
   */
  cid?: string;

  received_at?: Date;

  /**
   * The team ID
   */
  team?: string;

  channel_custom?: Record<string, any>;

  user?: UserResponseCommonFields;
}

export interface ChannelDeletedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  channel: ChannelResponse;

  custom: Record<string, any>;

  /**
   * The type of event: "channel.deleted" in this case
   */
  type: string;

  /**
   * The ID of the channel which was deleted
   */
  channel_id?: string;

  /**
   * The number of members in the channel
   */
  channel_member_count?: number;

  channel_message_count?: number;

  /**
   * The type of the channel which was deleted
   */
  channel_type?: string;

  /**
   * The CID of the channel which was deleted
   */
  cid?: string;

  received_at?: Date;

  /**
   * The team ID
   */
  team?: string;

  channel_custom?: Record<string, any>;

  user?: UserResponseCommonFields;
}

export interface ChannelFrozenEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  /**
   * The type of event: "channel.frozen" in this case
   */
  type: string;

  /**
   * The ID of the channel which was frozen
   */
  channel_id?: string;

  /**
   * The type of the channel which was frozen
   */
  channel_type?: string;

  /**
   * The CID of the channel which was frozen
   */
  cid?: string;

  received_at?: Date;
}

export interface ChannelGetOrCreateRequest {
  /**
   * Whether this channel will be hidden for the user who created the channel or not
   */
  hide_for_creator?: boolean;

  /**
   * Fetch user presence info
   */
  presence?: boolean;

  /**
   * Refresh channel state
   */
  state?: boolean;

  thread_unread_counts?: boolean;

  /**
   * Start watching the channel
   */
  watch?: boolean;

  data?: ChannelInput;

  members?: PaginationParams;

  messages?: MessagePaginationParams;

  watchers?: PaginationParams;
}

export interface ChannelHiddenEvent {
  /**
   * Whether the history was cleared
   */
  clear_history: boolean;

  /**
   * Date/time of creation
   */
  created_at: Date;

  channel: ChannelResponse;

  custom: Record<string, any>;

  /**
   * The type of event: "channel.hidden" in this case
   */
  type: string;

  /**
   * The ID of the channel which was hidden
   */
  channel_id?: string;

  /**
   * The number of members in the channel
   */
  channel_member_count?: number;

  channel_message_count?: number;

  /**
   * The type of the channel which was hidden
   */
  channel_type?: string;

  /**
   * The CID of the channel which was hidden
   */
  cid?: string;

  received_at?: Date;

  /**
   * The team ID
   */
  team?: string;

  channel_custom?: Record<string, any>;

  user?: UserResponseCommonFields;
}

export interface ChannelInput {
  /**
   * Enable or disable auto translation
   */
  auto_translation_enabled?: boolean;

  /**
   * Switch auto translation language
   */
  auto_translation_language?: string;

  created_by_id?: string;

  disabled?: boolean;

  /**
   * Freeze or unfreeze the channel
   */
  frozen?: boolean;

  /**
   * Team the channel belongs to (if multi-tenant mode is enabled)
   */
  team?: string;

  truncated_by_id?: string;

  filter_tags?: Array<string>;

  invites?: Array<ChannelMemberRequest>;

  members?: Array<ChannelMemberRequest>;

  config_overrides?: ChannelConfig;

  created_by?: UserRequest;

  custom?: Record<string, any>;
}

export interface ChannelInputRequest {
  auto_translation_enabled?: boolean;

  auto_translation_language?: string;

  disabled?: boolean;

  frozen?: boolean;

  team?: string;

  invites?: Array<ChannelMemberRequest>;

  members?: Array<ChannelMemberRequest>;

  config_overrides?: ConfigOverridesRequest;

  created_by?: UserRequest;

  custom?: Record<string, any>;
}

export interface ChannelKickedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  /**
   * The type of event: "channel.kicked" in this case
   */
  type: string;

  /**
   * The ID of the channel which was kicked
   */
  channel_id?: string;

  /**
   * The number of members in the channel
   */
  channel_member_count?: number;

  channel_message_count?: number;

  /**
   * The type of the channel which was kicked
   */
  channel_type?: string;

  /**
   * The CID of the channel which was kicked
   */
  cid?: string;

  received_at?: Date;

  /**
   * The team ID
   */
  team?: string;

  channel_custom?: Record<string, any>;
}

export interface ChannelMemberRequest {
  user_id: string;

  /**
   * Role of the member in the channel
   */
  channel_role?: string;

  custom?: Record<string, any>;

  user?: UserResponse;
}

export interface ChannelMemberResponse {
  /**
   * Whether member is banned this channel or not
   */
  banned: boolean;

  /**
   * Role of the member in the channel
   */
  channel_role: string;

  /**
   * Date/time of creation
   */
  created_at: Date;

  notifications_muted: boolean;

  /**
   * Whether member is shadow banned in this channel or not
   */
  shadow_banned: boolean;

  /**
   * Date/time of the last update
   */
  updated_at: Date;

  custom: Record<string, any>;

  archived_at?: Date;

  /**
   * Expiration date of the ban
   */
  ban_expires?: Date;

  deleted_at?: Date;

  /**
   * Date when invite was accepted
   */
  invite_accepted_at?: Date;

  /**
   * Date when invite was rejected
   */
  invite_rejected_at?: Date;

  /**
   * Whether member was invited or not
   */
  invited?: boolean;

  /**
   * Whether member is channel moderator or not
   */
  is_moderator?: boolean;

  pinned_at?: Date;

  /**
   * Permission level of the member in the channel (DEPRECATED: use channel_role instead). One of: member, moderator, admin, owner
   */
  role?: string;

  status?: string;

  user_id?: string;

  deleted_messages?: Array<string>;

  user?: UserResponse;
}

export interface ChannelMessageCountRuleParameters {
  operator?: string;

  threshold?: number;
}

export interface ChannelMute {
  /**
   * Date/time of creation
   */
  created_at: Date;

  /**
   * Date/time of the last update
   */
  updated_at: Date;

  /**
   * Date/time of mute expiration
   */
  expires?: Date;

  channel?: ChannelResponse;

  user?: UserResponse;
}

export const ChannelOwnCapability = {
  BAN_CHANNEL_MEMBERS: 'ban-channel-members',
  CAST_POLL_VOTE: 'cast-poll-vote',
  CONNECT_EVENTS: 'connect-events',
  CREATE_ATTACHMENT: 'create-attachment',
  DELETE_ANY_MESSAGE: 'delete-any-message',
  DELETE_CHANNEL: 'delete-channel',
  DELETE_OWN_MESSAGE: 'delete-own-message',
  DELIVERY_EVENTS: 'delivery-events',
  FLAG_MESSAGE: 'flag-message',
  FREEZE_CHANNEL: 'freeze-channel',
  JOIN_CHANNEL: 'join-channel',
  LEAVE_CHANNEL: 'leave-channel',
  MUTE_CHANNEL: 'mute-channel',
  PIN_MESSAGE: 'pin-message',
  QUERY_POLL_VOTES: 'query-poll-votes',
  QUOTE_MESSAGE: 'quote-message',
  READ_EVENTS: 'read-events',
  SEARCH_MESSAGES: 'search-messages',
  SEND_CUSTOM_EVENTS: 'send-custom-events',
  SEND_LINKS: 'send-links',
  SEND_MESSAGE: 'send-message',
  SEND_POLL: 'send-poll',
  SEND_REACTION: 'send-reaction',
  SEND_REPLY: 'send-reply',
  SEND_RESTRICTED_VISIBILITY_MESSAGE: 'send-restricted-visibility-message',
  SEND_TYPING_EVENTS: 'send-typing-events',
  SET_CHANNEL_COOLDOWN: 'set-channel-cooldown',
  SHARE_LOCATION: 'share-location',
  SKIP_SLOW_MODE: 'skip-slow-mode',
  SLOW_MODE: 'slow-mode',
  TYPING_EVENTS: 'typing-events',
  UPDATE_ANY_MESSAGE: 'update-any-message',
  UPDATE_CHANNEL: 'update-channel',
  UPDATE_CHANNEL_MEMBERS: 'update-channel-members',
  UPDATE_OWN_MESSAGE: 'update-own-message',
  UPDATE_THREAD: 'update-thread',
  UPLOAD_FILE: 'upload-file',
} as const;

export type ChannelOwnCapability =
  (typeof ChannelOwnCapability)[keyof typeof ChannelOwnCapability];

export interface ChannelPushPreferencesResponse {
  chat_level?: string;

  disabled_until?: Date;

  chat_preferences?: ChatPreferencesResponse;
}

export interface ChannelResponse {
  /**
   * Channel CID (<type>:<id>)
   */
  cid: string;

  /**
   * Date/time of creation
   */
  created_at: Date;

  disabled: boolean;

  /**
   * Whether channel is frozen or not
   */
  frozen: boolean;

  /**
   * Channel unique ID
   */
  id: string;

  /**
   * Type of the channel
   */
  type: string;

  /**
   * Date/time of the last update
   */
  updated_at: Date;

  /**
   * Custom data for this object
   */
  custom: Record<string, any>;

  /**
   * Whether auto translation is enabled or not
   */
  auto_translation_enabled?: boolean;

  /**
   * Language to translate to when auto translation is active
   */
  auto_translation_language?: string;

  /**
   * Whether this channel is blocked by current user or not
   */
  blocked?: boolean;

  /**
   * Cooldown period after sending each message
   */
  cooldown?: number;

  /**
   * Date/time of deletion
   */
  deleted_at?: Date;

  /**
   * Whether this channel is hidden by current user or not
   */
  hidden?: boolean;

  /**
   * Date since when the message history is accessible
   */
  hide_messages_before?: Date;

  /**
   * Date of the last message sent
   */
  last_message_at?: Date;

  /**
   * Number of members in the channel
   */
  member_count?: number;

  /**
   * Number of messages in the channel
   */
  message_count?: number;

  /**
   * Date of mute expiration
   */
  mute_expires_at?: Date;

  /**
   * Whether this channel is muted or not
   */
  muted?: boolean;

  /**
   * Team the channel belongs to (multi-tenant only)
   */
  team?: string;

  /**
   * Date of the latest truncation of the channel
   */
  truncated_at?: Date;

  /**
   * List of filter tags associated with the channel
   */
  filter_tags?: Array<string>;

  /**
   * List of channel members (max 100)
   */
  members?: Array<ChannelMemberResponse>;

  /**
   * List of channel capabilities of authenticated user
   */
  own_capabilities?: Array<ChannelOwnCapability>;

  config?: ChannelConfigWithInfo;

  created_by?: UserResponse;

  truncated_by?: UserResponse;
}

export interface ChannelStateResponse {
  duration: string;

  members: Array<ChannelMemberResponse>;

  messages: Array<MessageResponse>;

  pinned_messages: Array<MessageResponse>;

  threads: Array<ThreadStateResponse>;

  hidden?: boolean;

  hide_messages_before?: Date;

  watcher_count?: number;

  active_live_locations?: Array<SharedLocationResponseData>;

  pending_messages?: Array<PendingMessageResponse>;

  read?: Array<ReadStateResponse>;

  watchers?: Array<UserResponse>;

  channel?: ChannelResponse;

  draft?: DraftResponse;

  membership?: ChannelMemberResponse;

  push_preferences?: ChannelPushPreferencesResponse;
}

export interface ChannelStateResponseFields {
  /**
   * List of channel members
   */
  members: Array<ChannelMemberResponse>;

  /**
   * List of channel messages
   */
  messages: Array<MessageResponse>;

  /**
   * List of pinned messages in the channel
   */
  pinned_messages: Array<MessageResponse>;

  threads: Array<ThreadStateResponse>;

  /**
   * Whether this channel is hidden or not
   */
  hidden?: boolean;

  /**
   * Messages before this date are hidden from the user
   */
  hide_messages_before?: Date;

  /**
   * Number of channel watchers
   */
  watcher_count?: number;

  /**
   * Active live locations in the channel
   */
  active_live_locations?: Array<SharedLocationResponseData>;

  /**
   * Pending messages that this user has sent
   */
  pending_messages?: Array<PendingMessageResponse>;

  /**
   * List of read states
   */
  read?: Array<ReadStateResponse>;

  /**
   * List of user who is watching the channel
   */
  watchers?: Array<UserResponse>;

  channel?: ChannelResponse;

  draft?: DraftResponse;

  membership?: ChannelMemberResponse;

  push_preferences?: ChannelPushPreferencesResponse;
}

export interface ChannelStopWatchingRequest {}

export interface ChannelTruncatedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  channel: ChannelResponse;

  custom: Record<string, any>;

  /**
   * The type of event: "channel.truncated" in this case
   */
  type: string;

  /**
   * The ID of the channel which was truncated
   */
  channel_id?: string;

  /**
   * The number of members in the channel
   */
  channel_member_count?: number;

  channel_message_count?: number;

  /**
   * The type of the channel which was truncated
   */
  channel_type?: string;

  /**
   * The CID of the channel which was truncated
   */
  cid?: string;

  message_id?: string;

  received_at?: Date;

  /**
   * The team ID
   */
  team?: string;

  channel_custom?: Record<string, any>;

  message?: MessageResponse;

  user?: UserResponseCommonFields;
}

export interface ChannelUnFrozenEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  /**
   * The type of event: "channel.unfrozen" in this case
   */
  type: string;

  /**
   * The ID of the channel which was unfrozen
   */
  channel_id?: string;

  /**
   * The type of the channel which was unfrozen
   */
  channel_type?: string;

  /**
   * The CID of the channel which was unfrozen
   */
  cid?: string;

  received_at?: Date;
}

export interface ChannelUpdatedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  channel: ChannelResponse;

  custom: Record<string, any>;

  /**
   * The type of event: "channel.updated" in this case
   */
  type: string;

  /**
   * The ID of the channel which was updated
   */
  channel_id?: string;

  /**
   * The number of members in the channel
   */
  channel_member_count?: number;

  channel_message_count?: number;

  /**
   * The type of the channel which was updated
   */
  channel_type?: string;

  /**
   * The CID of the channel which was updated
   */
  cid?: string;

  message_id?: string;

  received_at?: Date;

  /**
   * The team ID
   */
  team?: string;

  channel_custom?: Record<string, any>;

  message?: MessageResponse;

  user?: UserResponseCommonFields;
}

export interface ChannelVisibleEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  channel: ChannelResponse;

  custom: Record<string, any>;

  /**
   * The type of event: "channel.visible" in this case
   */
  type: string;

  /**
   * The ID of the channel which was shown
   */
  channel_id?: string;

  /**
   * The number of members in the channel
   */
  channel_member_count?: number;

  channel_message_count?: number;

  /**
   * The type of the channel which was shown
   */
  channel_type?: string;

  /**
   * The CID of the channel which was shown
   */
  cid?: string;

  received_at?: Date;

  /**
   * The team ID
   */
  team?: string;

  channel_custom?: Record<string, any>;

  user?: UserResponseCommonFields;
}

export interface ChatDraftPayloadResponse {
  id: string;

  text: string;

  custom: Record<string, any>;

  html?: string;

  mml?: string;

  parent_id?: string;

  poll_id?: string;

  quoted_message_id?: string;

  show_in_channel?: boolean;

  silent?: boolean;

  type?: string;

  attachments?: Array<Attachment>;

  mentioned_users?: Array<UserResponse>;
}

export interface ChatDraftResponse {
  channel_cid: string;

  created_at: Date;

  message: ChatDraftPayloadResponse;

  parent_id?: string;

  parent_message?: ChatMessageResponse;

  quoted_message?: ChatMessageResponse;
}

export interface ChatMessageResponse {
  cid: string;

  created_at: Date;

  deleted_reply_count: number;

  html: string;

  id: string;

  mentioned_channel: boolean;

  mentioned_here: boolean;

  pinned: boolean;

  reply_count: number;

  shadowed: boolean;

  silent: boolean;

  text: string;

  type: string;

  updated_at: Date;

  attachments: Array<Attachment>;

  latest_reactions: Array<ChatReactionResponse>;

  mentioned_users: Array<UserResponse>;

  own_reactions: Array<ChatReactionResponse>;

  restricted_visibility: Array<string>;

  custom: Record<string, any>;

  reaction_counts: Record<string, number>;

  reaction_scores: Record<string, number>;

  user: UserResponse;

  command?: string;

  deleted_at?: Date;

  deleted_for_me?: boolean;

  message_text_updated_at?: Date;

  mml?: string;

  parent_id?: string;

  pin_expires?: Date;

  pinned_at?: Date;

  poll_id?: string;

  quoted_message_id?: string;

  show_in_channel?: boolean;

  mentioned_group_ids?: Array<string>;

  mentioned_roles?: Array<string>;

  thread_participants?: Array<UserResponse>;

  draft?: ChatDraftResponse;

  i18n?: Record<string, string>;

  image_labels?: Record<string, Array<string>>;

  member?: ChannelMemberResponse;

  moderation?: ChatModerationV2Response;

  pinned_by?: UserResponse;

  poll?: PollResponseData;

  quoted_message?: ChatMessageResponse;

  reaction_groups?: Record<string, ChatReactionGroupResponse>;

  reminder?: ChatReminderResponseData;

  shared_location?: ChatSharedLocationResponseData;
}

export interface ChatModerationV2Response {
  action: string;

  original_text: string;

  blocklist_matched?: string;

  platform_circumvented?: boolean;

  semantic_filter_matched?: string;

  blocklists_matched?: Array<string>;

  image_harms?: Array<string>;

  text_harms?: Array<string>;
}

export interface ChatPreferences {
  channel_mentions?: string;

  default_preference?: string;

  direct_mentions?: string;

  distinct_channel_messages?: string;

  group_mentions?: string;

  here_mentions?: string;

  role_mentions?: string;

  thread_replies?: string;
}

export interface ChatPreferencesInput {
  channel_mentions?: 'all' | 'none';

  default_preference?: 'all' | 'none';

  direct_mentions?: 'all' | 'none';

  group_mentions?: 'all' | 'none';

  here_mentions?: 'all' | 'none';

  role_mentions?: 'all' | 'none';

  thread_replies?: 'all' | 'none';
}

export interface ChatPreferencesResponse {
  channel_mentions?: string;

  default_preference?: string;

  direct_mentions?: string;

  group_mentions?: string;

  here_mentions?: string;

  role_mentions?: string;

  thread_replies?: string;
}

export interface ChatReactionGroupResponse {
  count: number;

  first_reaction_at: Date;

  last_reaction_at: Date;

  sum_scores: number;

  latest_reactions_by: Array<ChatReactionGroupUserResponse>;
}

export interface ChatReactionGroupUserResponse {
  created_at: Date;

  user_id: string;

  user?: UserResponse;
}

export interface ChatReactionResponse {
  created_at: Date;

  message_id: string;

  score: number;

  type: string;

  updated_at: Date;

  user_id: string;

  custom: Record<string, any>;

  user: UserResponse;
}

export interface ChatReminderResponseData {
  channel_cid: string;

  created_at: Date;

  message_id: string;

  updated_at: Date;

  user_id: string;

  remind_at?: Date;

  message?: ChatMessageResponse;

  user?: UserResponse;
}

export interface ChatSharedLocationResponseData {
  channel_cid: string;

  created_at: Date;

  created_by_device_id: string;

  latitude: number;

  longitude: number;

  message_id: string;

  updated_at: Date;

  user_id: string;

  end_at?: Date;

  message?: ChatMessageResponse;
}

export interface ClosedCaptionRuleParameters {
  threshold?: number;

  harm_labels?: Array<string>;

  llm_harm_labels?: Record<string, string>;
}

export interface Command {
  /**
   * Arguments help text, shown in commands auto-completion
   */
  args: string;

  /**
   * Description, shown in commands auto-completion
   */
  description: string;

  /**
   * Unique command name
   */
  name: string;

  /**
   * Set name used for grouping commands
   */
  set: string;

  /**
   * Date/time of creation
   */
  created_at?: Date;

  /**
   * Date/time of the last update
   */
  updated_at?: Date;
}

export interface ConfigOverridesRequest {
  /**
   * Blocklist name
   */
  blocklist?: string;

  /**
   * Blocklist behavior. One of: flag, block
   */

  blocklist_behavior?: 'flag' | 'block';

  /**
   * Enable/disable message counting
   */
  count_messages?: boolean;

  /**
   * Maximum message length
   */
  max_message_length?: number;

  push_level?: 'all' | 'all_mentions' | 'mentions' | 'direct_mentions' | 'none';

  /**
   * Enable/disable quotes
   */
  quotes?: boolean;

  /**
   * Enable/disable reactions
   */
  reactions?: boolean;

  /**
   * Enable/disable replies
   */
  replies?: boolean;

  /**
   * Enable/disable shared locations
   */
  shared_locations?: boolean;

  /**
   * Enable/disable typing events
   */
  typing_events?: boolean;

  /**
   * Enable/disable uploads
   */
  uploads?: boolean;

  /**
   * Enable/disable URL enrichment
   */
  url_enrichment?: boolean;

  /**
   * Enable/disable user message reminders
   */
  user_message_reminders?: boolean;

  /**
   * List of available commands
   */
  commands?: Array<string>;

  chat_preferences?: ChatPreferences;

  /**
   * Permission grants modifiers
   */
  grants?: Record<string, Array<string>>;
}

export interface ConfigResponse {
  /**
   * Whether moderation should be performed asynchronously
   */
  async: boolean;

  /**
   * When the configuration was created
   */
  created_at: Date;

  /**
   * Unique identifier for the moderation configuration
   */
  key: string;

  /**
   * Team associated with the configuration
   */
  team: string;

  /**
   * When the configuration was last updated
   */
  updated_at: Date;

  supported_video_call_harm_types: Array<string>;

  /**
   * Configurable image moderation label definitions for dashboard rendering
   */
  ai_image_label_definitions?: Array<AIImageLabelDefinition>;

  /**
   * Names of Bodyguard credential profiles registered on this app. The dashboard uses this list to render the profile picker on the AI Text section.
   */
  available_bodyguard_profiles?: Array<BodyguardProfileSummary>;

  ai_image_config?: AIImageConfig;

  /**
   * Available L2 subclassifications per L1 image moderation label, based on the active provider
   */
  ai_image_subclassifications?: Record<string, Array<string>>;

  ai_text_config?: AITextConfig;

  ai_video_config?: AIVideoConfig;

  automod_platform_circumvention_config?: AutomodPlatformCircumventionConfig;

  automod_semantic_filters_config?: AutomodSemanticFiltersConfig;

  automod_toxicity_config?: AutomodToxicityConfig;

  block_list_config?: BlockListConfig;

  llm_config?: LLMConfig;

  velocity_filter_config?: VelocityFilterConfig;

  video_call_rule_config?: VideoCallRuleConfig;
}

export interface ConnectUserDetailsRequest {
  id: string;

  image?: string;

  invisible?: boolean;

  language?: string;

  name?: string;

  custom?: Record<string, any>;

  privacy_settings?: PrivacySettingsResponse;
}

export interface ContentCountRuleParameters {
  threshold?: number;

  time_window?: string;
}

export interface CreateBlockListRequest {
  /**
   * Block list name
   */
  name: string;

  /**
   * List of words to block
   */
  words: Array<string>;

  is_leet_check_enabled?: boolean;

  is_plural_check_enabled?: boolean;

  team?: string;

  /**
   * Block list type. One of: regex, domain, domain_allowlist, email, email_allowlist, word
   */

  type?: 'regex' | 'domain' | 'domain_allowlist' | 'email' | 'email_allowlist' | 'word';
}

export interface CreateBlockListResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  blocklist?: BlockListResponse;
}

export interface CreateDeviceRequest {
  /**
   * Device ID
   */
  id: string;

  /**
   * Push provider
   */

  push_provider: 'firebase' | 'apn' | 'huawei' | 'xiaomi';

  /**
   * Push provider name
   */
  push_provider_name?: string;

  /**
   * When true the token is for Apple VoIP push notifications
   */
  voip_token?: boolean;
}

export interface CreateDraftRequest {
  message: MessageRequest;
}

export interface CreateDraftResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  draft: DraftResponse;
}

export interface CreateGuestRequest {
  user: UserRequest;
}

export interface CreateGuestResponse {
  /**
   * the access token to authenticate the user
   */
  access_token: string;

  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  user: UserResponse;
}

export interface CreatePollOptionRequest {
  /**
   * Option text
   */
  text: string;

  custom?: Record<string, any>;
}

export interface CreatePollRequest {
  /**
   * The name of the poll
   */
  name: string;

  /**
   * Indicates whether users can suggest user defined answers
   */
  allow_answers?: boolean;

  allow_user_suggested_options?: boolean;

  /**
   * A description of the poll
   */
  description?: string;

  /**
   * Indicates whether users can cast multiple votes
   */
  enforce_unique_vote?: boolean;

  id?: string;

  /**
   * Indicates whether the poll is open for voting
   */
  is_closed?: boolean;

  /**
   * Indicates the maximum amount of votes a user can cast
   */
  max_votes_allowed?: number;

  voting_visibility?: 'anonymous' | 'public';

  options?: Array<PollOptionInput>;

  custom?: Record<string, any>;
}

export interface CreateReminderRequest {
  remind_at?: Date;
}

export interface CreateUserGroupRequest {
  /**
   * The user friendly name of the user group
   */
  name: string;

  /**
   * An optional description for the group
   */
  description?: string;

  /**
   * Optional user group ID. If not provided, a UUID v7 will be generated
   */
  id?: string;

  /**
   * Optional team ID to scope the group to a team
   */
  team_id?: string;

  /**
   * Optional initial list of user IDs to add as members
   */
  member_ids?: Array<string>;
}

export interface CreateUserGroupResponse {
  duration: string;

  user_group?: UserGroupResponse;
}

export interface CustomActionRequestPayload {
  /**
   * Custom action identifier
   */
  id?: string;

  /**
   * Custom action options
   */
  options?: Record<string, any>;
}

export interface CustomEvent {
  created_at: Date;

  custom: Record<string, any>;

  type: string;

  received_at?: Date;
}

export interface Data {
  id: string;
}

export interface DeleteActionConfigResponse {
  /**
   * Number of action configs deleted (0 or 1)
   */
  deleted: number;

  duration: string;
}

export interface DeleteActivityRequestPayload {
  /**
   * ID of the activity to delete (alternative to item_id)
   */
  entity_id?: string;

  /**
   * Type of the entity (required for delete_activity to distinguish v2 vs v3)
   */
  entity_type?: string;

  /**
   * Whether to permanently delete the activity
   */
  hard_delete?: boolean;

  /**
   * Reason for deletion
   */
  reason?: string;
}

export interface DeleteChannelResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  channel?: ChannelResponse;
}

export interface DeleteChannelsRequest {
  /**
   * All channels that should be deleted
   */
  cids: Array<string>;

  /**
   * Specify if channels and all ressources should be hard deleted
   */
  hard_delete?: boolean;
}

export interface DeleteChannelsResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  task_id?: string;

  /**
   * Map of channel IDs and their deletion results
   */
  result?: Record<string, DeleteChannelsResultResponse>;
}

export interface DeleteChannelsResultResponse {
  status: string;

  error?: string;
}

export interface DeleteCommentRequestPayload {
  /**
   * ID of the comment to delete (alternative to item_id)
   */
  entity_id?: string;

  /**
   * Type of the entity
   */
  entity_type?: string;

  /**
   * Whether to permanently delete the comment
   */
  hard_delete?: boolean;

  /**
   * Reason for deletion
   */
  reason?: string;
}

export interface DeleteMessageRequestPayload {
  /**
   * ID of the message to delete (alternative to item_id)
   */
  entity_id?: string;

  /**
   * Type of the entity
   */
  entity_type?: string;

  /**
   * Whether to permanently delete the message
   */
  hard_delete?: boolean;

  /**
   * Reason for deletion
   */
  reason?: string;
}

export interface DeleteMessageResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  message: MessageResponse;
}

export interface DeleteModerationConfigResponse {
  duration: string;
}

export interface DeleteReactionRequestPayload {
  /**
   * ID of the reaction to delete (alternative to item_id)
   */
  entity_id?: string;

  /**
   * Type of the entity
   */
  entity_type?: string;

  /**
   * Whether to permanently delete the reaction
   */
  hard_delete?: boolean;

  /**
   * Reason for deletion
   */
  reason?: string;
}

export interface DeleteReactionResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  message: MessageResponse;

  reaction: ReactionResponse;
}

export interface DeleteReminderResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;
}

export interface DeleteUserRequestPayload {
  /**
   * Also delete all user conversations
   */
  delete_conversation_channels?: boolean;

  /**
   * Delete flagged feeds content
   */
  delete_feeds_content?: boolean;

  /**
   * ID of the user to delete (alternative to item_id)
   */
  entity_id?: string;

  /**
   * Type of the entity
   */
  entity_type?: string;

  /**
   * Whether to permanently delete the user
   */
  hard_delete?: boolean;

  /**
   * Also delete all user messages
   */
  mark_messages_deleted?: boolean;

  /**
   * Reason for deletion
   */
  reason?: string;
}

export interface DeliveredMessagePayload {
  cid?: string;

  id?: string;
}

export interface DeliveryReceiptsResponse {
  enabled: boolean;
}

export interface DeviceResponse {
  /**
   * Date/time of creation
   */
  created_at: Date;

  /**
   * Device ID
   */
  id: string;

  /**
   * Push provider
   */
  push_provider: string;

  /**
   * User ID
   */
  user_id: string;

  /**
   * Whether device is disabled or not
   */
  disabled?: boolean;

  /**
   * Reason explaining why device had been disabled
   */
  disabled_reason?: string;

  /**
   * Push provider name
   */
  push_provider_name?: string;

  /**
   * When true the token is for Apple VoIP push notifications
   */
  voip?: boolean;
}

export interface DraftDeletedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  /**
   * The type of event: "draft.deleted" in this case
   */
  type: string;

  /**
   * The CID of the channel where the draft was created
   */
  cid?: string;

  /**
   * The ID of the parent message
   */
  parent_id?: string;

  received_at?: Date;

  draft?: DraftResponse;
}

export interface DraftPayloadResponse {
  /**
   * Message ID is unique string identifier of the message
   */
  id: string;

  /**
   * Text of the message
   */
  text: string;

  custom: Record<string, any>;

  /**
   * Contains HTML markup of the message
   */
  html?: string;

  /**
   * MML content of the message
   */
  mml?: string;

  /**
   * ID of parent message (thread)
   */
  parent_id?: string;

  /**
   * Identifier of the poll to include in the message
   */
  poll_id?: string;

  quoted_message_id?: string;

  /**
   * Whether thread reply should be shown in the channel as well
   */
  show_in_channel?: boolean;

  /**
   * Whether message is silent or not
   */
  silent?: boolean;

  /**
   * Contains type of the message. One of: regular, system
   */
  type?: string;

  /**
   * Array of message attachments
   */
  attachments?: Array<Attachment>;

  /**
   * List of mentioned users
   */
  mentioned_users?: Array<UserResponse>;
}

export interface DraftResponse {
  channel_cid: string;

  created_at: Date;

  message: DraftPayloadResponse;

  parent_id?: string;

  channel?: ChannelResponse;

  parent_message?: MessageResponse;

  quoted_message?: MessageResponse;
}

export interface DraftUpdatedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  /**
   * The type of event: "draft.updated" in this case
   */
  type: string;

  /**
   * The CID of the channel where the draft was created/updated
   */
  cid?: string;

  /**
   * The ID of the parent message
   */
  parent_id?: string;

  received_at?: Date;

  draft?: DraftResponse;
}

export interface EnrichedActivity {
  foreign_id?: string;

  id?: string;

  score?: number;

  verb?: string;

  to?: Array<string>;

  actor?: Data;

  latest_reactions?: Record<string, Array<EnrichedReaction>>;

  object?: Data;

  origin?: Data;

  own_reactions?: Record<string, Array<EnrichedReaction>>;

  reaction_counts?: Record<string, number>;

  target?: Data;
}

export interface EnrichedReaction {
  activity_id: string;

  kind: string;

  user_id: string;

  id?: string;

  parent?: string;

  target_feeds?: Array<string>;

  children_counts?: Record<string, number>;

  created_at?: Time;

  data?: Record<string, any>;

  latest_children?: Record<string, Array<EnrichedReaction>>;

  own_children?: Record<string, Array<EnrichedReaction>>;

  updated_at?: Time;

  user?: Data;
}

export interface EntityCreatorResponse {
  /**
   * Number of minor actions performed on the user
   */
  ban_count: number;

  banned: boolean;

  created_at: Date;

  /**
   * Number of major actions performed on the user
   */
  deleted_content_count: number;

  /**
   * Number of flag actions performed on the user
   */
  flagged_count: number;

  id: string;

  language: string;

  online: boolean;

  role: string;

  updated_at: Date;

  blocked_user_ids: Array<string>;

  teams: Array<string>;

  custom: Record<string, any>;

  avg_response_time?: number;

  deactivated_at?: Date;

  deleted_at?: Date;

  image?: string;

  last_active?: Date;

  name?: string;

  revoke_tokens_issued_before?: Date;

  teams_role?: Record<string, string>;
}

export interface EscalatePayload {
  /**
   * Additional context for the reviewer
   */
  notes?: string;

  /**
   * Priority of the escalation (low, medium, high)
   */
  priority?: string;

  /**
   * Reason for the escalation (from configured escalation_reasons)
   */
  reason?: string;
}

export interface EscalationMetadata {
  notes?: string;

  priority?: string;

  reason?: string;
}

export interface EventRequest {
  type: string;

  parent_id?: string;

  custom?: Record<string, any>;
}

export interface EventResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  event: WSEvent;
}

export interface FeedsActivityLocation {
  lat: number;

  lng: number;
}

export interface FeedsBookmarkResponse {
  created_at: Date;

  object_id: string;

  object_type: string;

  updated_at: Date;

  user: UserResponse;

  activity_id?: string;

  custom?: Record<string, any>;
}

export interface FeedsEnrichedCollectionResponse {
  created_at: Date;

  id: string;

  name: string;

  status: string;

  updated_at: Date;

  user_id: string;

  custom: Record<string, any>;
}

export interface FeedsFeedResponse {
  activity_count: number;

  created_at: Date;

  description: string;

  feed: string;

  follower_count: number;

  following_count: number;

  group_id: string;

  id: string;

  member_count: number;

  name: string;

  pin_count: number;

  updated_at: Date;

  created_by: UserResponse;

  deleted_at?: Date;

  visibility?: string;

  filter_tags?: Array<string>;

  custom?: Record<string, any>;

  location?: FeedsActivityLocation;
}

export interface FeedsNotificationComment {
  comment: string;

  id: string;

  user_id: string;

  attachments?: Array<Attachment>;
}

export interface FeedsNotificationContext {
  target?: FeedsNotificationTarget;

  trigger?: FeedsNotificationTrigger;
}

export interface FeedsNotificationParentActivity {
  id: string;

  text?: string;

  type?: string;

  user_id?: string;

  attachments?: Array<Attachment>;
}

export interface FeedsNotificationTarget {
  id: string;

  name?: string;

  text?: string;

  type?: string;

  user_id?: string;

  attachments?: Array<Attachment>;

  comment?: FeedsNotificationComment;

  custom?: Record<string, any>;

  parent_activity?: FeedsNotificationParentActivity;
}

export interface FeedsNotificationTrigger {
  text: string;

  type: string;

  comment?: FeedsNotificationComment;

  custom?: Record<string, any>;
}

export interface FeedsPreferences {
  /**
   * Push notification preference for comments on user's activities. One of: all, none
   */

  comment?: 'all' | 'none';

  /**
   * Push notification preference for mentions in comments. One of: all, none
   */

  comment_mention?: 'all' | 'none';

  /**
   * Push notification preference for reactions on comments. One of: all, none
   */

  comment_reaction?: 'all' | 'none';

  /**
   * Push notification preference for replies to comments. One of: all, none
   */

  comment_reply?: 'all' | 'none';

  /**
   * Push notification preference for new followers. One of: all, none
   */

  follow?: 'all' | 'none';

  /**
   * Push notification preference for mentions in activities. One of: all, none
   */

  mention?: 'all' | 'none';

  /**
   * Push notification preference for reactions on user's activities or comments. One of: all, none
   */

  reaction?: 'all' | 'none';

  /**
   * Push notification preferences for custom activity types. Map of activity type to preference (all or none)
   */
  custom_activity_types?: Record<string, string>;
}

export interface FeedsPreferencesResponse {
  comment?: string;

  comment_mention?: string;

  comment_reaction?: string;

  comment_reply?: string;

  follow?: string;

  mention?: string;

  reaction?: string;

  custom_activity_types?: Record<string, string>;
}

export interface FeedsReactionGroupResponse {
  count: number;

  first_reaction_at: Date;

  last_reaction_at: Date;
}

export interface FeedsReactionResponse {
  activity_id: string;

  created_at: Date;

  type: string;

  updated_at: Date;

  user: UserResponse;

  comment_id?: string;

  custom?: Record<string, any>;
}

export interface FeedsV3ActivityResponse {
  bookmark_count: number;

  comment_count: number;

  created_at: Date;

  hidden: boolean;

  id: string;

  popularity: number;

  preview: boolean;

  reaction_count: number;

  restrict_replies: string;

  score: number;

  share_count: number;

  type: string;

  updated_at: Date;

  visibility: string;

  attachments: Array<Attachment>;

  comments: Array<FeedsV3CommentResponse>;

  feeds: Array<string>;

  filter_tags: Array<string>;

  interest_tags: Array<string>;

  latest_reactions: Array<FeedsReactionResponse>;

  mentioned_users: Array<UserResponse>;

  own_bookmarks: Array<FeedsBookmarkResponse>;

  own_reactions: Array<FeedsReactionResponse>;

  collections: Record<string, FeedsEnrichedCollectionResponse>;

  custom: Record<string, any>;

  reaction_groups: Record<string, FeedsReactionGroupResponse>;

  search_data: Record<string, any>;

  user: UserResponse;

  deleted_at?: Date;

  edited_at?: Date;

  expires_at?: Date;

  friend_reaction_count?: number;

  is_read?: boolean;

  is_seen?: boolean;

  is_watched?: boolean;

  moderation_action?: string;

  selector_source?: string;

  text?: string;

  visibility_tag?: string;

  friend_reactions?: Array<FeedsReactionResponse>;

  current_feed?: FeedsFeedResponse;

  location?: FeedsActivityLocation;

  metrics?: Record<string, number>;

  moderation?: ModerationV2Response;

  notification_context?: FeedsNotificationContext;

  parent?: FeedsV3ActivityResponse;

  poll?: PollResponseData;

  score_vars?: Record<string, any>;
}

export interface FeedsV3CommentResponse {
  bookmark_count: number;

  confidence_score: number;

  created_at: Date;

  downvote_count: number;

  id: string;

  object_id: string;

  object_type: string;

  reaction_count: number;

  reply_count: number;

  score: number;

  status: string;

  updated_at: Date;

  upvote_count: number;

  mentioned_users: Array<UserResponse>;

  own_reactions: Array<FeedsReactionResponse>;

  user: UserResponse;

  controversy_score?: number;

  deleted_at?: Date;

  edited_at?: Date;

  parent_id?: string;

  text?: string;

  attachments?: Array<Attachment>;

  latest_reactions?: Array<FeedsReactionResponse>;

  custom?: Record<string, any>;

  moderation?: ModerationV2Response;

  reaction_groups?: Record<string, FeedsReactionGroupResponse>;
}

export interface Field {
  short: boolean;

  title: string;

  value: string;
}

export interface FileUploadConfig {
  size_limit: number;

  allowed_file_extensions: Array<string>;

  allowed_mime_types: Array<string>;

  blocked_file_extensions: Array<string>;

  blocked_mime_types: Array<string>;
}

export interface FileUploadRequest {
  /**
   * file field
   */
  file?: string;

  user?: OnlyUserID;
}

export interface FileUploadResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  /**
   * URL to the uploaded asset. Should be used to put to `asset_url` attachment field
   */
  file?: string;

  /**
   * URL of the file thumbnail for supported file formats. Should be put to `thumb_url` attachment field
   */
  thumb_url?: string;
}

export interface FilterConfigResponse {
  llm_labels: Array<string>;

  ai_text_labels?: Array<string>;

  config_keys?: Array<string>;
}

export interface FlagCountRuleParameters {
  threshold?: number;
}

export interface FlagDetailsResponse {
  original_text: string;

  automod?: AutomodDetailsResponse;

  extra?: Record<string, any>;
}

export interface FlagFeedbackResponse {
  created_at: Date;

  message_id: string;

  labels: Array<LabelResponse>;
}

export interface FlagMessageDetailsResponse {
  pin_changed?: boolean;

  should_enrich?: boolean;

  skip_push?: boolean;

  updated_by_id?: string;
}

export interface FlagRequest {
  /**
   * Unique identifier of the entity being flagged
   */
  entity_id: string;

  /**
   * Type of entity being flagged (e.g., message, user)
   */
  entity_type: string;

  /**
   * ID of the user who created the flagged entity
   */
  entity_creator_id?: string;

  /**
   * Optional explanation for why the content is being flagged
   */
  reason?: string;

  /**
   * Additional metadata about the flag
   */
  custom?: Record<string, any>;

  moderation_payload?: ModerationPayload;
}

export interface FlagResponse {
  duration: string;

  /**
   * Unique identifier of the created moderation item
   */
  item_id: string;
}

export interface FlagUserOptions {
  reason?: string;
}

export interface FullUserResponse {
  banned: boolean;

  created_at: Date;

  id: string;

  invisible: boolean;

  language: string;

  online: boolean;

  role: string;

  shadow_banned: boolean;

  total_unread_count: number;

  unread_channels: number;

  unread_count: number;

  unread_threads: number;

  updated_at: Date;

  blocked_user_ids: Array<string>;

  channel_mutes: Array<ChannelMute>;

  devices: Array<DeviceResponse>;

  mutes: Array<UserMuteResponse>;

  teams: Array<string>;

  custom: Record<string, any>;

  avg_response_time?: number;

  ban_expires?: Date;

  deactivated_at?: Date;

  deleted_at?: Date;

  image?: string;

  last_active?: Date;

  name?: string;

  revoke_tokens_issued_before?: Date;

  latest_hidden_channels?: Array<string>;

  privacy_settings?: PrivacySettingsResponse;

  teams_role?: Record<string, string>;
}

export interface FutureChannelBanResponse {
  created_at: Date;

  expires?: Date;

  reason?: string;

  shadow?: boolean;

  banned_by?: UserResponse;

  user?: UserResponse;
}

export interface GetActionConfigResponse {
  duration: string;

  /**
   * Moderation action configs grouped by entity type, sorted by order ascending
   */
  action_config: Record<string, Array<ModerationActionConfigResponse>>;
}

export interface GetAppealResponse {
  duration: string;

  item?: AppealItemResponse;
}

export interface GetApplicationResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  app: AppResponseFields;
}

export interface GetBlockedUsersResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  /**
   * Array of blocked user object
   */
  blocks: Array<BlockedUserResponse>;
}

export interface GetConfigResponse {
  duration: string;

  config?: ConfigResponse;
}

export interface GetDraftResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  draft: DraftResponse;
}

export interface GetManyMessagesResponse {
  duration: string;

  /**
   * List of messages
   */
  messages: Array<MessageResponse>;
}

export interface GetMessageResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  message: MessageWithChannelResponse;

  pending_message_metadata?: Record<string, string>;
}

export interface GetOGResponse {
  duration: string;

  custom: Record<string, any>;

  /**
   * URL of detected video or audio
   */
  asset_url?: string;

  author_icon?: string;

  /**
   * og:site
   */
  author_link?: string;

  /**
   * og:site_name
   */
  author_name?: string;

  color?: string;

  fallback?: string;

  footer?: string;

  footer_icon?: string;

  /**
   * URL of detected image
   */
  image_url?: string;

  /**
   * extracted url from the text
   */
  og_scrape_url?: string;

  original_height?: number;

  original_width?: number;

  pretext?: string;

  /**
   * og:description
   */
  text?: string;

  /**
   * URL of detected thumb image
   */
  thumb_url?: string;

  /**
   * og:title
   */
  title?: string;

  /**
   * og:url
   */
  title_link?: string;

  /**
   * Attachment type, could be empty, image, audio or video
   */
  type?: string;

  actions?: Array<Action>;

  fields?: Array<Field>;

  giphy?: Images;
}

export interface GetReactionsResponse {
  duration: string;

  /**
   * List of reactions
   */
  reactions: Array<ReactionResponse>;
}

export interface GetRepliesResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  messages: Array<MessageResponse>;
}

export interface GetThreadResponse {
  duration: string;

  thread: ThreadStateResponse;
}

export interface GetUserGroupResponse {
  duration: string;

  user_group?: UserGroupResponse;
}

export interface GoogleVisionConfig {
  enabled?: boolean;
}

export interface GroupedChannelsBucket {
  /**
   * Channels returned for this bucket
   */
  channels: Array<ChannelStateResponseFields>;

  /**
   * Unread channels currently classified into this bucket
   */
  unread_channels?: number;
}

export interface GroupedQueryChannelsRequest {
  /**
   * Max channels per bucket (default 10)
   */
  limit?: number;

  /**
   * Whether to subscribe to presence events for channel members
   */
  presence?: boolean;

  /**
   * Whether to start watching found channels or not
   */
  watch?: boolean;
}

export interface GroupedQueryChannelsResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  /**
   * Predefined channel groups keyed by group name
   */
  groups: Record<string, GroupedChannelsBucket>;
}

export interface HarmConfig {
  cooldown_period: number;

  severity: number;

  threshold: number;

  action_sequences: Array<ActionSequence>;

  harm_types: Array<string>;
}

export interface HealthCheckEvent {
  connection_id: string;

  created_at: Date;

  custom: Record<string, any>;

  type: string;

  cid?: string;

  received_at?: Date;

  me?: OwnUserResponse;
}

export interface HideChannelRequest {
  /**
   * Whether to clear message history of the channel or not
   */
  clear_history?: boolean;
}

export interface HideChannelResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;
}

export interface ImageContentParameters {
  label_operator?: string;

  min_confidence?: number;

  harm_labels?: Array<string>;
}

export interface ImageData {
  frames: string;

  height: string;

  size: string;

  url: string;

  width: string;
}

export interface ImageRuleParameters {
  min_confidence?: number;

  threshold?: number;

  time_window?: string;

  harm_labels?: Array<string>;
}

export interface ImageSize {
  /**
   * Crop mode. One of: top, bottom, left, right, center
   */
  crop?: string;

  /**
   * Target image height
   */
  height?: number;

  /**
   * Resize method. One of: clip, crop, scale, fill
   */
  resize?: string;

  /**
   * Target image width
   */
  width?: number;
}

export interface ImageUploadRequest {
  file?: string;

  /**
   * field with JSON-encoded array of image size configurations
   */
  upload_sizes?: Array<ImageSize>;

  user?: OnlyUserID;
}

export interface ImageUploadResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  file?: string;

  thumb_url?: string;

  /**
   * Array of image size configurations
   */
  upload_sizes?: Array<ImageSize>;
}

export interface Images {
  fixed_height: ImageData;

  fixed_height_downsampled: ImageData;

  fixed_height_still: ImageData;

  fixed_width: ImageData;

  fixed_width_downsampled: ImageData;

  fixed_width_still: ImageData;

  original: ImageData;
}

export interface KeyframeRuleParameters {
  min_confidence?: number;

  threshold?: number;

  harm_labels?: Array<string>;
}

export interface LLMConfig {
  enabled: boolean;

  rules: Array<LLMRule>;

  app_context?: string;

  async?: boolean;

  severity_descriptions?: Record<string, string>;
}

export interface LLMRule {
  action:
    | 'flag'
    | 'shadow'
    | 'remove'
    | 'bounce'
    | 'bounce_flag'
    | 'bounce_remove'
    | 'keep';

  description: string;

  label: string;

  severity_rules: Array<BodyguardSeverityRule>;
}

export interface LabelResponse {
  name: string;

  harm_labels?: Array<string>;

  phrase_list_ids?: Array<number>;
}

export interface LabelThresholds {
  /**
   * Threshold for automatic message block
   */
  block?: number;

  /**
   * Threshold for automatic message flag
   */
  flag?: number;
}

export interface ListBlockListResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  blocklists: Array<BlockListResponse>;
}

export interface ListDevicesResponse {
  duration: string;

  /**
   * List of devices
   */
  devices: Array<DeviceResponse>;
}

export interface ListUserGroupsResponse {
  duration: string;

  /**
   * List of user groups
   */
  user_groups: Array<UserGroupResponse>;
}

export interface MarkChannelsReadRequest {
  /**
   * Map of channel ID to last read message ID
   */
  read_by_channel?: Record<string, string>;
}

export interface MarkDeliveredRequest {
  latest_delivered_messages?: Array<DeliveredMessagePayload>;
}

export interface MarkDeliveredResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;
}

export interface MarkReadRequest {
  /**
   * ID of the message that is considered last read by client
   */
  message_id?: string;

  /**
   * Optional Thread ID to specifically mark a given thread as read
   */
  thread_id?: string;
}

export interface MarkReadResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  event?: MarkReadResponseEvent;
}

export interface MarkReadResponseEvent {
  channel_id: string;

  channel_type: string;

  cid: string;

  created_at: Date;

  type: string;

  channel_last_message_at?: Date;

  last_read_message_id?: string;

  team?: string;

  channel?: ChannelResponse;

  thread?: ThreadResponse;

  user?: UserResponseCommonFields;
}

export interface MarkReviewedRequestPayload {
  /**
   * Maximum content items to mark as reviewed
   */
  content_to_mark_as_reviewed_limit?: number;

  /**
   * Reason for the appeal decision
   */
  decision_reason?: string;

  /**
   * Skip marking content as reviewed
   */
  disable_marking_content_as_reviewed?: boolean;
}

export interface MarkUnreadRequest {
  /**
   * ID of the message from where the channel is marked unread
   */
  message_id?: string;

  /**
   * Timestamp of the message from where the channel is marked unread
   */
  message_timestamp?: Date;

  /**
   * Mark a thread unread, specify one of the thread, message timestamp, or message id
   */
  thread_id?: string;
}

export interface MaxStreakChangedEvent {
  created_at: Date;

  custom: Record<string, any>;

  type: string;

  received_at?: Date;
}

export interface MemberAddedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  channel: ChannelResponse;

  custom: Record<string, any>;

  member: ChannelMemberResponse;

  /**
   * The type of event: "member.added" in this case
   */
  type: string;

  /**
   * The ID of the channel to which the member was added
   */
  channel_id?: string;

  /**
   * The number of members in the channel
   */
  channel_member_count?: number;

  /**
   * The number of messages in the channel
   */
  channel_message_count?: number;

  /**
   * The type of the channel to which the member was added
   */
  channel_type?: string;

  /**
   * The CID of the channel to which the member was added
   */
  cid?: string;

  received_at?: Date;

  /**
   * The team ID
   */
  team?: string;

  channel_custom?: Record<string, any>;

  user?: UserResponseCommonFields;
}

export interface MemberRemovedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  channel: ChannelResponse;

  custom: Record<string, any>;

  member: ChannelMemberResponse;

  /**
   * The type of event: "member.removed" in this case
   */
  type: string;

  /**
   * The ID of the channel from which the member was removed
   */
  channel_id?: string;

  /**
   * The number of members in the channel
   */
  channel_member_count?: number;

  /**
   * The number of messages in the channel
   */
  channel_message_count?: number;

  /**
   * The type of the channel from which the member was removed
   */
  channel_type?: string;

  /**
   * The CID of the channel from which the member was removed
   */
  cid?: string;

  received_at?: Date;

  /**
   * The team ID
   */
  team?: string;

  channel_custom?: Record<string, any>;

  user?: UserResponseCommonFields;
}

export interface MemberUpdatedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  channel: ChannelResponse;

  custom: Record<string, any>;

  member: ChannelMemberResponse;

  /**
   * The type of event: "member.updated" in this case
   */
  type: string;

  /**
   * The ID of the channel in which the member was updated
   */
  channel_id?: string;

  /**
   * The number of members in the channel
   */
  channel_member_count?: number;

  /**
   * The number of messages in the channel
   */
  channel_message_count?: number;

  /**
   * The type of the channel in which the member was updated
   */
  channel_type?: string;

  /**
   * The CID of the channel in which the member was updated
   */
  cid?: string;

  received_at?: Date;

  /**
   * The team ID
   */
  team?: string;

  channel_custom?: Record<string, any>;

  user?: UserResponseCommonFields;
}

export interface MembersResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  /**
   * List of found members
   */
  members: Array<ChannelMemberResponse>;
}

export interface MessageActionRequest {
  /**
   * ReadOnlyData to execute command with
   */
  form_data: Record<string, string>;
}

export interface MessageActionResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  message?: MessageResponse;
}

export interface MessageChangeSet {
  attachments: boolean;

  custom: boolean;

  html: boolean;

  mentioned_user_ids: boolean;

  mml: boolean;

  pin: boolean;

  quoted_message_id: boolean;

  silent: boolean;

  text: boolean;
}

export interface MessageDeletedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  /**
   * Whether the message was hard deleted
   */
  hard_delete: boolean;

  message_id: string;

  custom: Record<string, any>;

  message: MessageResponse;

  /**
   * The type of event: "message.deleted" in this case
   */
  type: string;

  /**
   * The ID of the channel where the message was sent
   */
  channel_id?: string;

  /**
   * The number of members in the channel
   */
  channel_member_count?: number;

  /**
   * The number of messages in the channel
   */
  channel_message_count?: number;

  /**
   * The type of the channel where the message was sent
   */
  channel_type?: string;

  /**
   * The CID of the channel where the message was sent
   */
  cid?: string;

  /**
   * Whether the message was deleted only for the current user
   */
  deleted_for_me?: boolean;

  received_at?: Date;

  /**
   * The team ID
   */
  team?: string;

  channel_custom?: Record<string, any>;

  user?: UserResponseCommonFields;
}

export interface MessageDeliveredEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  /**
   * The type of event: "message.delivered" in this case
   */
  type: string;

  /**
   * The ID of the channel where the message was read
   */
  channel_id?: string;

  /**
   * The number of members in the channel
   */
  channel_member_count?: number;

  /**
   * The number of messages in the channel
   */
  channel_message_count?: number;

  /**
   * The type of the channel where the message was read
   */
  channel_type?: string;

  /**
   * The CID of the channel where the message was read
   */
  cid?: string;

  /**
   * The time when the message was delivered
   */
  last_delivered_at?: string;

  /**
   * The ID of the last delivered message
   */
  last_delivered_message_id?: string;

  received_at?: Date;

  /**
   * The team ID
   */
  team?: string;

  channel?: ChannelResponse;

  channel_custom?: Record<string, any>;

  user?: UserResponseCommonFields;
}

export interface MessageFlagResponse {
  created_at: Date;

  created_by_automod: boolean;

  updated_at: Date;

  approved_at?: Date;

  reason?: string;

  rejected_at?: Date;

  reviewed_at?: Date;

  custom?: Record<string, any>;

  details?: FlagDetailsResponse;

  message?: MessageResponse;

  moderation_feedback?: FlagFeedbackResponse;

  moderation_result?: MessageModerationResult;

  reviewed_by?: UserResponse;

  user?: UserResponse;
}

export interface MessageModerationResult {
  /**
   * Action taken by automod
   */
  action: string;

  /**
   * Date/time of creation
   */
  created_at: Date;

  /**
   * ID of the message
   */
  message_id: string;

  /**
   * Date/time of the last update
   */
  updated_at: Date;

  /**
   * Whether user has bad karma
   */
  user_bad_karma: boolean;

  /**
   * Karma of the user
   */
  user_karma: number;

  /**
   * Word that was blocked
   */
  blocked_word?: string;

  /**
   * Name of the blocklist
   */
  blocklist_name?: string;

  /**
   * User who moderated the message
   */
  moderated_by?: string;

  ai_moderation_response?: ModerationResponse;

  moderation_thresholds?: Thresholds;
}

export interface MessageNewEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  message_id: string;

  /**
   * The number of watchers
   */
  watcher_count: number;

  custom: Record<string, any>;

  message: MessageResponse;

  /**
   * The type of event: "message.new" in this case
   */
  type: string;

  /**
   * The ID of the channel where the message was sent
   */
  channel_id?: string;

  /**
   * The number of members in the channel
   */
  channel_member_count?: number;

  /**
   * The number of messages in the channel
   */
  channel_message_count?: number;

  /**
   * The type of the channel where the message was sent
   */
  channel_type?: string;

  /**
   * The CID of the channel where the message was sent
   */
  cid?: string;

  /**
   * The author of the parent message
   */
  parent_author?: string;

  received_at?: Date;

  /**
   * The team ID
   */
  team?: string;

  total_unread_count?: number;

  unread_channels?: number;

  /**
   * The number of unread messages
   */
  unread_count?: number;

  /**
   * The participants of the thread
   */
  thread_participants?: Array<UserResponseCommonFields>;

  channel?: ChannelResponse;

  channel_custom?: Record<string, any>;

  grouped_unread_channels?: Record<string, number>;

  user?: UserResponseCommonFields;
}

export interface MessageOptions {
  include_thread_participants?: boolean;
}

export interface MessagePaginationParams {
  /**
   * The timestamp to get messages with a created_at timestamp greater than
   */
  created_at_after?: Date;

  /**
   * The timestamp to get messages with a created_at timestamp greater than or equal to
   */
  created_at_after_or_equal?: Date;

  /**
   * The result will be a set of messages, that are both older and newer than the created_at timestamp provided, distributed evenly around the timestamp
   */
  created_at_around?: Date;

  /**
   * The timestamp to get messages with a created_at timestamp smaller than
   */
  created_at_before?: Date;

  /**
   * The timestamp to get messages with a created_at timestamp smaller than or equal to
   */
  created_at_before_or_equal?: Date;

  /**
   * The result will be a set of messages, that are both older and newer than the message with the provided ID, and the message with the ID provided will be in the middle of the set
   */
  id_around?: string;

  /**
   * The ID of the message to get messages with a timestamp greater than
   */
  id_gt?: string;

  /**
   * The ID of the message to get messages with a timestamp greater than or equal to
   */
  id_gte?: string;

  /**
   * The ID of the message to get messages with a timestamp smaller than
   */
  id_lt?: string;

  /**
   * The ID of the message to get messages with a timestamp smaller than or equal to
   */
  id_lte?: string;

  /**
   * The maximum number of messages to return (max limit
   */
  limit?: number;
}

export interface MessageReadEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  /**
   * The type of event: "message.read" in this case
   */
  type: string;

  /**
   * The ID of the channel where the message was read
   */
  channel_id?: string;

  /**
   * The number of members in the channel
   */
  channel_member_count?: number;

  /**
   * The number of messages in the channel
   */
  channel_message_count?: number;

  /**
   * The type of the channel where the message was read
   */
  channel_type?: string;

  /**
   * The CID of the channel where the message was read
   */
  cid?: string;

  /**
   * The ID of the last read message
   */
  last_read_message_id?: string;

  received_at?: Date;

  /**
   * The team ID
   */
  team?: string;

  channel?: ChannelResponse;

  channel_custom?: Record<string, any>;

  thread?: ThreadResponse;

  user?: UserResponseCommonFields;
}

export interface MessageRequest {
  /**
   * Message ID is unique string identifier of the message
   */
  id?: string;

  mentioned_channel?: boolean;

  mentioned_here?: boolean;

  /**
   * Should be empty if `text` is provided. Can only be set when using server-side API
   */
  mml?: string;

  /**
   * ID of parent message (thread)
   */
  parent_id?: string;

  /**
   * Date when pinned message expires
   */
  pin_expires?: Date;

  /**
   * Whether message is pinned or not
   */
  pinned?: boolean;

  /**
   * Date when message got pinned
   */
  pinned_at?: Date;

  /**
   * Identifier of the poll to include in the message
   */
  poll_id?: string;

  quoted_message_id?: string;

  /**
   * Whether thread reply should be shown in the channel as well
   */
  show_in_channel?: boolean;

  /**
   * Whether message is silent or not
   */
  silent?: boolean;

  /**
   * Text of the message. Should be empty if `mml` is provided
   */
  text?: string;

  /**
   * Contains type of the message. One of: regular, system
   */

  type?: "''" | 'regular' | 'system';

  /**
   * Array of message attachments
   */
  attachments?: Array<Attachment>;

  /**
   * List of user group IDs to mention. Group members who are also channel members will receive push notifications. Max 10 groups
   */
  mentioned_group_ids?: Array<string>;

  mentioned_roles?: Array<string>;

  /**
   * Array of user IDs to mention
   */
  mentioned_users?: Array<string>;

  /**
   * A list of user ids that have restricted visibility to the message
   */
  restricted_visibility?: Array<string>;

  custom?: Record<string, any>;

  shared_location?: SharedLocation;
}

export interface MessageResponse {
  /**
   * Channel unique identifier in <type>:<id> format
   */
  cid: string;

  /**
   * Date/time of creation
   */
  created_at: Date;

  deleted_reply_count: number;

  /**
   * Contains HTML markup of the message. Can only be set when using server-side API
   */
  html: string;

  /**
   * Message ID is unique string identifier of the message
   */
  id: string;

  /**
   * Whether the message mentioned the channel tag
   */
  mentioned_channel: boolean;

  /**
   * Whether the message mentioned online users with @here tag
   */
  mentioned_here: boolean;

  /**
   * Whether message is pinned or not
   */
  pinned: boolean;

  /**
   * Number of replies to this message
   */
  reply_count: number;

  /**
   * Whether the message was shadowed or not
   */
  shadowed: boolean;

  /**
   * Whether message is silent or not
   */
  silent: boolean;

  /**
   * Text of the message. Should be empty if `mml` is provided
   */
  text: string;

  /**
   * Contains type of the message. One of: regular, ephemeral, error, reply, system, deleted
   */
  type: string;

  /**
   * Date/time of the last update
   */
  updated_at: Date;

  /**
   * Array of message attachments
   */
  attachments: Array<Attachment>;

  /**
   * List of 10 latest reactions to this message
   */
  latest_reactions: Array<ReactionResponse>;

  /**
   * List of mentioned users
   */
  mentioned_users: Array<UserResponse>;

  /**
   * List of 10 latest reactions of authenticated user to this message
   */
  own_reactions: Array<ReactionResponse>;

  /**
   * A list of user ids that have restricted visibility to the message, if the list is not empty, the message is only visible to the users in the list
   */
  restricted_visibility: Array<string>;

  custom: Record<string, any>;

  /**
   * An object containing number of reactions of each type. Key: reaction type (string), value: number of reactions (int)
   */
  reaction_counts: Record<string, number>;

  /**
   * An object containing scores of reactions of each type. Key: reaction type (string), value: total score of reactions (int)
   */
  reaction_scores: Record<string, number>;

  user: UserResponse;

  /**
   * Contains provided slash command
   */
  command?: string;

  /**
   * Date/time of deletion
   */
  deleted_at?: Date;

  deleted_for_me?: boolean;

  message_text_updated_at?: Date;

  /**
   * Should be empty if `text` is provided. Can only be set when using server-side API
   */
  mml?: string;

  /**
   * ID of parent message (thread)
   */
  parent_id?: string;

  /**
   * Date when pinned message expires
   */
  pin_expires?: Date;

  /**
   * Date when message got pinned
   */
  pinned_at?: Date;

  /**
   * Identifier of the poll to include in the message
   */
  poll_id?: string;

  quoted_message_id?: string;

  /**
   * Whether thread reply should be shown in the channel as well
   */
  show_in_channel?: boolean;

  /**
   * List of user group IDs mentioned in the message. Group members who are also channel members will receive push notifications based on their push preferences. Max 10 groups
   */
  mentioned_group_ids?: Array<string>;

  /**
   * List of roles mentioned in the message (e.g. admin, channel_moderator, custom roles). Members with matching roles will receive push notifications based on their push preferences. Max 10 roles
   */
  mentioned_roles?: Array<string>;

  /**
   * List of users who participate in thread
   */
  thread_participants?: Array<UserResponse>;

  draft?: DraftResponse;

  /**
   * Object with translations. Key `language` contains the original language key. Other keys contain translations
   */
  i18n?: Record<string, string>;

  /**
   * Contains image moderation information
   */
  image_labels?: Record<string, Array<string>>;

  member?: ChannelMemberResponse;

  moderation?: ModerationV2Response;

  pinned_by?: UserResponse;

  poll?: PollResponseData;

  quoted_message?: MessageResponse;

  reaction_groups?: Record<string, ReactionGroupResponse>;

  reminder?: ReminderResponseData;

  shared_location?: SharedLocationResponseData;
}

export interface MessageUndeletedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  message_id: string;

  custom: Record<string, any>;

  message: MessageResponse;

  /**
   * The type of event: "message.undeleted" in this case
   */
  type: string;

  /**
   * The ID of the channel where the message was sent
   */
  channel_id?: string;

  /**
   * The number of members in the channel
   */
  channel_member_count?: number;

  /**
   * The number of messages in the channel
   */
  channel_message_count?: number;

  /**
   * The type of the channel where the message was sent
   */
  channel_type?: string;

  /**
   * The CID of the channel where the message was sent
   */
  cid?: string;

  received_at?: Date;

  /**
   * The team ID
   */
  team?: string;

  channel_custom?: Record<string, any>;
}

export interface MessageUpdate {
  old_text?: string;

  change_set?: MessageChangeSet;
}

export interface MessageUpdatedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  message_id: string;

  custom: Record<string, any>;

  message: MessageResponse;

  /**
   * The type of event: "message.updated" in this case
   */
  type: string;

  /**
   * The ID of the channel where the message was sent
   */
  channel_id?: string;

  /**
   * The number of members in the channel
   */
  channel_member_count?: number;

  /**
   * The number of messages in the channel
   */
  channel_message_count?: number;

  /**
   * The type of the channel where the message was sent
   */
  channel_type?: string;

  /**
   * The CID of the channel where the message was sent
   */
  cid?: string;

  received_at?: Date;

  /**
   * The team ID
   */
  team?: string;

  channel_custom?: Record<string, any>;

  message_update?: MessageUpdate;

  user?: UserResponseCommonFields;
}

export interface MessageWithChannelResponse {
  /**
   * Channel unique identifier in <type>:<id> format
   */
  cid: string;

  /**
   * Date/time of creation
   */
  created_at: Date;

  deleted_reply_count: number;

  /**
   * Contains HTML markup of the message. Can only be set when using server-side API
   */
  html: string;

  /**
   * Message ID is unique string identifier of the message
   */
  id: string;

  /**
   * Whether the message mentioned the channel tag
   */
  mentioned_channel: boolean;

  /**
   * Whether the message mentioned online users with @here tag
   */
  mentioned_here: boolean;

  /**
   * Whether message is pinned or not
   */
  pinned: boolean;

  /**
   * Number of replies to this message
   */
  reply_count: number;

  /**
   * Whether the message was shadowed or not
   */
  shadowed: boolean;

  /**
   * Whether message is silent or not
   */
  silent: boolean;

  /**
   * Text of the message. Should be empty if `mml` is provided
   */
  text: string;

  /**
   * Contains type of the message. One of: regular, ephemeral, error, reply, system, deleted
   */
  type: string;

  /**
   * Date/time of the last update
   */
  updated_at: Date;

  /**
   * Array of message attachments
   */
  attachments: Array<Attachment>;

  /**
   * List of 10 latest reactions to this message
   */
  latest_reactions: Array<ReactionResponse>;

  /**
   * List of mentioned users
   */
  mentioned_users: Array<UserResponse>;

  /**
   * List of 10 latest reactions of authenticated user to this message
   */
  own_reactions: Array<ReactionResponse>;

  /**
   * A list of user ids that have restricted visibility to the message, if the list is not empty, the message is only visible to the users in the list
   */
  restricted_visibility: Array<string>;

  channel: ChannelResponse;

  custom: Record<string, any>;

  /**
   * An object containing number of reactions of each type. Key: reaction type (string), value: number of reactions (int)
   */
  reaction_counts: Record<string, number>;

  /**
   * An object containing scores of reactions of each type. Key: reaction type (string), value: total score of reactions (int)
   */
  reaction_scores: Record<string, number>;

  user: UserResponse;

  /**
   * Contains provided slash command
   */
  command?: string;

  /**
   * Date/time of deletion
   */
  deleted_at?: Date;

  deleted_for_me?: boolean;

  message_text_updated_at?: Date;

  /**
   * Should be empty if `text` is provided. Can only be set when using server-side API
   */
  mml?: string;

  /**
   * ID of parent message (thread)
   */
  parent_id?: string;

  /**
   * Date when pinned message expires
   */
  pin_expires?: Date;

  /**
   * Date when message got pinned
   */
  pinned_at?: Date;

  /**
   * Identifier of the poll to include in the message
   */
  poll_id?: string;

  quoted_message_id?: string;

  /**
   * Whether thread reply should be shown in the channel as well
   */
  show_in_channel?: boolean;

  /**
   * List of user group IDs mentioned in the message. Group members who are also channel members will receive push notifications based on their push preferences. Max 10 groups
   */
  mentioned_group_ids?: Array<string>;

  /**
   * List of roles mentioned in the message (e.g. admin, channel_moderator, custom roles). Members with matching roles will receive push notifications based on their push preferences. Max 10 roles
   */
  mentioned_roles?: Array<string>;

  /**
   * List of users who participate in thread
   */
  thread_participants?: Array<UserResponse>;

  draft?: DraftResponse;

  /**
   * Object with translations. Key `language` contains the original language key. Other keys contain translations
   */
  i18n?: Record<string, string>;

  /**
   * Contains image moderation information
   */
  image_labels?: Record<string, Array<string>>;

  member?: ChannelMemberResponse;

  moderation?: ModerationV2Response;

  pinned_by?: UserResponse;

  poll?: PollResponseData;

  quoted_message?: MessageResponse;

  reaction_groups?: Record<string, ReactionGroupResponse>;

  reminder?: ReminderResponseData;

  shared_location?: SharedLocationResponseData;
}

export interface ModerationActionConfigResponse {
  /**
   * The action to take
   */
  action: string;

  /**
   * Description of what this action does
   */
  description: string;

  /**
   * Type of entity this action applies to
   */
  entity_type: string;

  /**
   * Icon for the dashboard
   */
  icon: string;

  /**
   * Display order (lower numbers shown first)
   */
  order: number;

  id?: string;

  /**
   * Queue type this action config belongs to
   */
  queue_type?: string;

  /**
   * Custom data for the action
   */
  custom?: Record<string, any>;
}

export interface ModerationCustomActionEvent {
  /**
   * The ID of the custom action that was executed
   */
  action_id: string;

  created_at: Date;

  custom: Record<string, any>;

  review_queue_item: ReviewQueueItemResponse;

  type: string;

  received_at?: Date;

  /**
   * Additional options passed to the custom action
   */
  action_options?: Record<string, any>;

  message?: MessageResponse;
}

export interface ModerationFlagResponse {
  created_at: Date;

  entity_id: string;

  entity_type: string;

  type: string;

  updated_at: Date;

  user_id: string;

  result: Array<Record<string, any>>;

  entity_creator_id?: string;

  reason?: string;

  review_queue_item_id?: string;

  labels?: Array<string>;

  custom?: Record<string, any>;

  moderation_payload?: ModerationPayloadResponse;

  review_queue_item?: ReviewQueueItemResponse;

  user?: UserResponse;
}

export interface ModerationFlaggedEvent {
  /**
   * The type of content that was flagged
   */
  content_type: string;

  created_at: Date;

  /**
   * The ID of the flagged content
   */
  object_id: string;

  custom: Record<string, any>;

  type: string;

  received_at?: Date;
}

export interface ModerationMarkReviewedEvent {
  created_at: Date;

  custom: Record<string, any>;

  item: ReviewQueueItemResponse;

  type: string;

  received_at?: Date;

  message?: MessageResponse;
}

export interface ModerationPayload {
  images?: Array<string>;

  texts?: Array<string>;

  videos?: Array<string>;

  custom?: Record<string, any>;
}

export interface ModerationPayloadResponse {
  /**
   * Image URLs to moderate
   */
  images?: Array<string>;

  /**
   * Text content to moderate
   */
  texts?: Array<string>;

  /**
   * Video URLs to moderate
   */
  videos?: Array<string>;

  /**
   * Custom data for moderation
   */
  custom?: Record<string, any>;
}

export interface ModerationResponse {
  action: string;

  explicit: number;

  spam: number;

  toxic: number;
}

export interface ModerationV2Response {
  action: string;

  original_text: string;

  blocklist_matched?: string;

  platform_circumvented?: boolean;

  semantic_filter_matched?: string;

  blocklists_matched?: Array<string>;

  image_harms?: Array<string>;

  text_harms?: Array<string>;
}

export interface MuteChannelRequest {
  /**
   * Duration of mute in milliseconds
   */
  expiration?: number;

  /**
   * Channel CIDs to mute (if multiple channels)
   */
  channel_cids?: Array<string>;
}

export interface MuteChannelResponse {
  duration: string;

  /**
   * Object with mutes (if multiple channels were muted)
   */
  channel_mutes?: Array<ChannelMute>;

  channel_mute?: ChannelMute;

  own_user?: OwnUserResponse;
}

export interface MuteRequest {
  /**
   * User IDs to mute (if multiple users)
   */
  target_ids: Array<string>;

  /**
   * Duration of mute in minutes
   */
  timeout?: number;
}

export interface MuteResponse {
  duration: string;

  /**
   * Object with mutes (if multiple users were muted)
   */
  mutes?: Array<UserMuteResponse>;

  /**
   * A list of users that can't be found. Common cause for this is deleted users
   */
  non_existing_users?: Array<string>;

  own_user?: OwnUserResponse;
}

export interface NotificationAddedToChannelEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  channel: ChannelResponse;

  custom: Record<string, any>;

  member: ChannelMemberResponse;

  /**
   * The type of event: "notification.added_to_channel" in this case
   */
  type: string;

  /**
   * The ID of the channel to which the user was added
   */
  channel_id?: string;

  channel_member_count?: number;

  channel_message_count?: number;

  /**
   * The type of the channel to which the user was added
   */
  channel_type?: string;

  /**
   * The CID of the channel to which the user was added
   */
  cid?: string;

  received_at?: Date;

  /**
   * The team ID
   */
  team?: string;

  channel_custom?: Record<string, any>;
}

export interface NotificationChannelDeletedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  channel: ChannelResponse;

  custom: Record<string, any>;

  /**
   * The type of event: "notification.channel_deleted" in this case
   */
  type: string;

  /**
   * The ID of the channel which was deleted
   */
  channel_id?: string;

  /**
   * The number of members in the channel
   */
  channel_member_count?: number;

  channel_message_count?: number;

  /**
   * The type of the channel which was deleted
   */
  channel_type?: string;

  /**
   * The CID of the channel which was deleted
   */
  cid?: string;

  received_at?: Date;

  /**
   * The team ID
   */
  team?: string;

  /**
   * The total number of unread messages
   */
  total_unread_count?: number;

  /**
   * The number of channels with unread messages
   */
  unread_channels?: number;

  /**
   * The number of unread messages in the channel
   */
  unread_count?: number;

  channel_custom?: Record<string, any>;

  grouped_unread_channels?: Record<string, number>;
}

export interface NotificationChannelMutesUpdatedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  me: OwnUserResponse;

  /**
   * The type of event: "notification.channel_mutes_updated" in this case
   */
  type: string;

  received_at?: Date;
}

export interface NotificationChannelTruncatedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  channel: ChannelResponse;

  custom: Record<string, any>;

  /**
   * The type of event: "notification.channel_truncated" in this case
   */
  type: string;

  /**
   * The ID of the channel which was truncated
   */
  channel_id?: string;

  /**
   * The number of members in the channel
   */
  channel_member_count?: number;

  channel_message_count?: number;

  /**
   * The type of the channel which was truncated
   */
  channel_type?: string;

  /**
   * The CID of the channel which was truncated
   */
  cid?: string;

  message_id?: string;

  received_at?: Date;

  /**
   * The team ID
   */
  team?: string;

  /**
   * The total number of unread messages
   */
  total_unread_count?: number;

  /**
   * The number of channels with unread messages
   */
  unread_channels?: number;

  /**
   * The number of unread messages in the channel
   */
  unread_count?: number;

  channel_custom?: Record<string, any>;

  grouped_unread_channels?: Record<string, number>;

  message?: MessageResponse;
}

export interface NotificationInviteAcceptedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  channel: ChannelResponse;

  custom: Record<string, any>;

  member: ChannelMemberResponse;

  /**
   * The type of event: "notification.invite_accepted" in this case
   */
  type: string;

  /**
   * The ID of the channel to which the user accepted the invite
   */
  channel_id?: string;

  /**
   * The number of members in the channel
   */
  channel_member_count?: number;

  /**
   * The number of messages in the channel
   */
  channel_message_count?: number;

  /**
   * The type of the channel to which the user accepted the invite
   */
  channel_type?: string;

  /**
   * The CID of the channel to which the user accepted the invite
   */
  cid?: string;

  received_at?: Date;

  /**
   * The team ID
   */
  team?: string;

  channel_custom?: Record<string, any>;

  user?: UserResponseCommonFields;
}

export interface NotificationInviteRejectedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  channel: ChannelResponse;

  custom: Record<string, any>;

  member: ChannelMemberResponse;

  /**
   * The type of event: "notification.invite_rejected" in this case
   */
  type: string;

  /**
   * The ID of the channel to which the user rejected the invite
   */
  channel_id?: string;

  /**
   * The number of members in the channel
   */
  channel_member_count?: number;

  /**
   * The number of messages in the channel
   */
  channel_message_count?: number;

  /**
   * The type of the channel to which the user rejected the invite
   */
  channel_type?: string;

  /**
   * The CID of the channel to which the user rejected the invite
   */
  cid?: string;

  received_at?: Date;

  /**
   * The team ID
   */
  team?: string;

  channel_custom?: Record<string, any>;

  user?: UserResponseCommonFields;
}

export interface NotificationInvitedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  channel: ChannelResponse;

  custom: Record<string, any>;

  member: ChannelMemberResponse;

  /**
   * The type of event: "notification.invited" in this case
   */
  type: string;

  /**
   * The ID of the channel to which the user was invited
   */
  channel_id?: string;

  /**
   * The number of members in the channel
   */
  channel_member_count?: number;

  /**
   * The number of messages in the channel
   */
  channel_message_count?: number;

  /**
   * The type of the channel to which the user was invited
   */
  channel_type?: string;

  /**
   * The CID of the channel to which the user was invited
   */
  cid?: string;

  received_at?: Date;

  /**
   * The team ID
   */
  team?: string;

  channel_custom?: Record<string, any>;

  user?: UserResponseCommonFields;
}

export interface NotificationMarkReadEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  /**
   * The total number of unread messages
   */
  total_unread_count: number;

  /**
   * The number of channels with unread messages
   */
  unread_channels: number;

  /**
   * The total number of unread messages
   */
  unread_count: number;

  custom: Record<string, any>;

  /**
   * The type of event: "notification.mark_read" in this case
   */
  type: string;

  /**
   * The ID of the channel which was marked as read
   */
  channel_id?: string;

  /**
   * The number of members in the channel
   */
  channel_member_count?: number;

  channel_message_count?: number;

  /**
   * The type of the channel which was marked as read
   */
  channel_type?: string;

  /**
   * The CID of the channel which was marked as read
   */
  cid?: string;

  /**
   * The ID of the last read message
   */
  last_read_message_id?: string;

  received_at?: Date;

  /**
   * The team ID
   */
  team?: string;

  /**
   * The ID of the thread which was marked as read
   */
  thread_id?: string;

  /**
   * The total number of unread messages in the threads
   */
  unread_thread_messages?: number;

  /**
   * The number of unread threads
   */
  unread_threads?: number;

  channel?: ChannelResponse;

  channel_custom?: Record<string, any>;

  grouped_unread_channels?: Record<string, number>;

  thread?: ThreadResponse;

  user?: UserResponseCommonFields;
}

export interface NotificationMarkUnreadEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  /**
   * The type of event: "notification.mark_unread" in this case
   */
  type: string;

  /**
   * The ID of the channel which was marked as unread
   */
  channel_id?: string;

  /**
   * The number of members in the channel
   */
  channel_member_count?: number;

  channel_message_count?: number;

  /**
   * The type of the channel which was marked as unread
   */
  channel_type?: string;

  /**
   * The CID of the channel which was marked as unread
   */
  cid?: string;

  /**
   * The ID of the first unread message
   */
  first_unread_message_id?: string;

  /**
   * The time when the channel/thread was marked as unread
   */
  last_read_at?: Date;

  /**
   * The ID of the last read message
   */
  last_read_message_id?: string;

  received_at?: Date;

  /**
   * The team ID
   */
  team?: string;

  /**
   * The ID of the thread which was marked as unread
   */
  thread_id?: string;

  /**
   * The total number of unread messages
   */
  total_unread_count?: number;

  /**
   * The number of channels with unread messages
   */
  unread_channels?: number;

  /**
   * The total number of unread messages
   */
  unread_count?: number;

  /**
   * The number of unread messages in the channel/thread after first_unread_message_id
   */
  unread_messages?: number;

  /**
   * The total number of unread messages in the threads
   */
  unread_thread_messages?: number;

  /**
   * The number of unread threads
   */
  unread_threads?: number;

  channel?: ChannelResponse;

  channel_custom?: Record<string, any>;

  grouped_unread_channels?: Record<string, number>;

  user?: UserResponseCommonFields;
}

export interface NotificationMutesUpdatedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  me: OwnUserResponse;

  /**
   * The type of event: "notification.mutes_updated" in this case
   */
  type: string;

  received_at?: Date;
}

export interface NotificationNewMessageEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  message_id: string;

  /**
   * The number of watchers
   */
  watcher_count: number;

  channel: ChannelResponse;

  custom: Record<string, any>;

  message: MessageResponse;

  /**
   * The type of event: "notification.message_new" in this case
   */
  type: string;

  /**
   * The ID of the channel where the message was sent
   */
  channel_id?: string;

  channel_member_count?: number;

  channel_message_count?: number;

  /**
   * The type of the channel where the message was sent
   */
  channel_type?: string;

  /**
   * The CID of the channel where the message was sent
   */
  cid?: string;

  parent_author?: string;

  received_at?: Date;

  /**
   * The team ID
   */
  team?: string;

  total_unread_count?: number;

  unread_channels?: number;

  unread_count?: number;

  /**
   * The participants of the thread
   */
  thread_participants?: Array<UserResponseCommonFields>;

  channel_custom?: Record<string, any>;

  grouped_unread_channels?: Record<string, number>;
}

export interface NotificationRemovedFromChannelEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  channel: ChannelResponse;

  custom: Record<string, any>;

  member: ChannelMemberResponse;

  /**
   * The type of event: "notification.removed_from_channel" in this case
   */
  type: string;

  /**
   * The ID of the channel from which the user was removed
   */
  channel_id?: string;

  /**
   * The number of members in the channel
   */
  channel_member_count?: number;

  /**
   * The number of messages in the channel
   */
  channel_message_count?: number;

  /**
   * The type of the channel from which the user was removed
   */
  channel_type?: string;

  /**
   * The CID of the channel from which the user was removed
   */
  cid?: string;

  received_at?: Date;

  /**
   * The team ID
   */
  team?: string;

  channel_custom?: Record<string, any>;

  user?: UserResponseCommonFields;
}

export interface NotificationThreadMessageNewEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  message_id: string;

  /**
   * The ID of the thread
   */
  thread_id: string;

  /**
   * The number of watchers
   */
  watcher_count: number;

  channel: ChannelResponse;

  custom: Record<string, any>;

  message: MessageResponse;

  /**
   * The type of event: "notification.message_new" in this case
   */
  type: string;

  /**
   * The ID of the channel where the message was sent
   */
  channel_id?: string;

  channel_member_count?: number;

  channel_message_count?: number;

  /**
   * The type of the channel where the message was sent
   */
  channel_type?: string;

  /**
   * The CID of the channel where the message was sent
   */
  cid?: string;

  parent_author?: string;

  received_at?: Date;

  /**
   * The team ID
   */
  team?: string;

  unread_thread_messages?: number;

  unread_threads?: number;

  /**
   * The participants of the thread
   */
  thread_participants?: Array<UserResponseCommonFields>;

  channel_custom?: Record<string, any>;
}

export interface OCRRule {
  action: 'flag' | 'shadow' | 'remove' | 'bounce' | 'bounce_flag' | 'bounce_remove';

  label: string;
}

export interface OnlyUserID {
  id: string;
}

export interface OwnUserResponse {
  banned: boolean;

  created_at: Date;

  id: string;

  invisible: boolean;

  language: string;

  online: boolean;

  role: string;

  total_unread_count: number;

  unread_channels: number;

  unread_count: number;

  unread_threads: number;

  updated_at: Date;

  channel_mutes: Array<ChannelMute>;

  devices: Array<DeviceResponse>;

  mutes: Array<UserMuteResponse>;

  teams: Array<string>;

  custom: Record<string, any>;

  avg_response_time?: number;

  deactivated_at?: Date;

  deleted_at?: Date;

  image?: string;

  last_active?: Date;

  name?: string;

  revoke_tokens_issued_before?: Date;

  blocked_user_ids?: Array<string>;

  latest_hidden_channels?: Array<string>;

  privacy_settings?: PrivacySettingsResponse;

  push_preferences?: PushPreferencesResponse;

  teams_role?: Record<string, string>;

  total_unread_count_by_team?: Record<string, number>;
}

export interface PaginationParams {
  limit?: number;

  offset?: number;
}

export interface ParsedPredefinedFilterResponse {
  name: string;

  filter: Record<string, any>;

  sort?: Array<SortParamRequest>;
}

export interface PendingMessageEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  /**
   * The method used for the pending message
   */
  method: string;

  custom: Record<string, any>;

  /**
   * The type of event: "message.pending" in this case
   */
  type: string;

  received_at?: Date;

  channel?: ChannelResponse;

  message?: MessageResponse;

  /**
   * Metadata attached to the pending message
   */
  metadata?: Record<string, string>;

  user?: UserResponse;
}

export interface PendingMessageResponse {
  channel?: ChannelResponse;

  message?: MessageResponse;

  metadata?: Record<string, string>;

  user?: UserResponse;
}

export interface PollClosedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  poll: PollResponseData;

  /**
   * The type of event: "poll.closed" in this case
   */
  type: string;

  activity_id?: string;

  /**
   * The CID of the channel containing the poll
   */
  cid?: string;

  /**
   * The ID of the message containing the poll
   */
  message_id?: string;

  received_at?: Date;
}

export interface PollDeletedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  poll: PollResponseData;

  /**
   * The type of event: "poll.deleted" in this case
   */
  type: string;

  activity_id?: string;

  /**
   * The CID of the channel containing the poll
   */
  cid?: string;

  /**
   * The ID of the message containing the poll
   */
  message_id?: string;

  received_at?: Date;
}

export interface PollOptionInput {
  text?: string;

  custom?: Record<string, any>;
}

export interface PollOptionRequest {
  id: string;

  text?: string;

  custom?: Record<string, any>;
}

export interface PollOptionResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  poll_option: PollOptionResponseData;
}

export interface PollOptionResponseData {
  id: string;

  text: string;

  custom: Record<string, any>;
}

export interface PollResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  poll: PollResponseData;
}

export interface PollResponseData {
  allow_answers: boolean;

  allow_user_suggested_options: boolean;

  answers_count: number;

  created_at: Date;

  created_by_id: string;

  description: string;

  enforce_unique_vote: boolean;

  id: string;

  name: string;

  updated_at: Date;

  vote_count: number;

  voting_visibility: string;

  latest_answers: Array<PollVoteResponseData>;

  options: Array<PollOptionResponseData>;

  own_votes: Array<PollVoteResponseData>;

  custom: Record<string, any>;

  latest_votes_by_option: Record<string, Array<PollVoteResponseData>>;

  vote_counts_by_option: Record<string, number>;

  is_closed?: boolean;

  max_votes_allowed?: number;

  created_by?: UserResponse;
}

export interface PollUpdatedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  poll: PollResponseData;

  /**
   * The type of event: "poll.updated" in this case
   */
  type: string;

  activity_id?: string;

  /**
   * The CID of the channel containing the poll
   */
  cid?: string;

  /**
   * The ID of the message containing the poll
   */
  message_id?: string;

  received_at?: Date;
}

export interface PollVoteCastedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  poll: PollResponseData;

  poll_vote: PollVoteResponseData;

  /**
   * The type of event: "poll.vote_casted" in this case
   */
  type: string;

  activity_id?: string;

  /**
   * The CID of the channel containing the poll
   */
  cid?: string;

  /**
   * The ID of the message containing the poll
   */
  message_id?: string;

  received_at?: Date;
}

export interface PollVoteChangedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  poll: PollResponseData;

  poll_vote: PollVoteResponseData;

  /**
   * The type of event: "poll.vote_changed" in this case
   */
  type: string;

  activity_id?: string;

  /**
   * The CID of the channel containing the poll
   */
  cid?: string;

  /**
   * The ID of the message containing the poll
   */
  message_id?: string;

  received_at?: Date;
}

export interface PollVoteRemovedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  poll: PollResponseData;

  poll_vote: PollVoteResponseData;

  /**
   * The type of event: "poll.vote_removed" in this case
   */
  type: string;

  activity_id?: string;

  /**
   * The CID of the channel containing the poll
   */
  cid?: string;

  /**
   * The ID of the message containing the poll
   */
  message_id?: string;

  received_at?: Date;
}

export interface PollVoteResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  poll?: PollResponseData;

  vote?: PollVoteResponseData;
}

export interface PollVoteResponseData {
  created_at: Date;

  id: string;

  option_id: string;

  poll_id: string;

  updated_at: Date;

  answer_text?: string;

  is_answer?: boolean;

  user_id?: string;

  user?: UserResponse;
}

export interface PollVotesResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  /**
   * Poll votes
   */
  votes: Array<PollVoteResponseData>;

  next?: string;

  prev?: string;
}

export interface PrivacySettingsResponse {
  delivery_receipts?: DeliveryReceiptsResponse;

  read_receipts?: ReadReceiptsResponse;

  typing_indicators?: TypingIndicatorsResponse;
}

export interface PushPreferenceInput {
  /**
   * Set the level of call push notifications for the user. One of: all, none, default
   */

  call_level?: 'all' | 'none' | 'default';

  /**
   * Set the push preferences for a specific channel. If empty it sets the default for the user
   */
  channel_cid?: string;

  /**
   * Set the level of chat push notifications for the user. Note: "mentions" is deprecated in favor of "direct_mentions". One of: all, mentions, direct_mentions, all_mentions, none, default
   */

  chat_level?:
    | 'all'
    | 'mentions'
    | 'direct_mentions'
    | 'all_mentions'
    | 'none'
    | 'default';

  /**
   * Disable push notifications till a certain time
   */
  disabled_until?: Date;

  /**
   * Set the level of feeds push notifications for the user. One of: all, none, default
   */

  feeds_level?: 'all' | 'none' | 'default';

  /**
   * Remove the disabled until time. (IE stop snoozing notifications)
   */
  remove_disable?: boolean;

  /**
   * The user id for which to set the push preferences. Required when using server side auths, defaults to current user with client side auth.
   */
  user_id?: string;

  chat_preferences?: ChatPreferencesInput;

  feeds_preferences?: FeedsPreferences;
}

export interface PushPreferencesResponse {
  call_level?: string;

  chat_level?: string;

  disabled_until?: Date;

  feeds_level?: string;

  chat_preferences?: ChatPreferencesResponse;

  feeds_preferences?: FeedsPreferencesResponse;
}

export interface QueryAppealsRequest {
  limit?: number;

  next?: string;

  prev?: string;

  /**
   * Sorting parameters for appeals
   */
  sort?: Array<SortParamRequest>;

  /**
   * Filter conditions for appeals
   */
  filter?: Record<string, any>;
}

export interface QueryAppealsResponse {
  duration: string;

  /**
   * List of Appeal Items
   */
  items: Array<AppealItemResponse>;

  next?: string;

  prev?: string;
}

export interface QueryBannedUsersPayload {
  /**
   * Filter conditions to apply to the query
   */
  filter_conditions: Record<string, any>;

  /**
   * Whether to exclude expired bans or not
   */
  exclude_expired_bans?: boolean;

  /**
   * Number of records to return
   */
  limit?: number;

  /**
   * Number of records to offset
   */
  offset?: number;

  /**
   * Array of sort parameters
   */
  sort?: Array<SortParamRequest>;
}

export interface QueryBannedUsersResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  /**
   * List of found bans
   */
  bans: Array<BanResponse>;
}

export interface QueryChannelsRequest {
  /**
   * Number of channels to limit
   */
  limit?: number;

  /**
   * Number of members to limit
   */
  member_limit?: number;

  /**
   * Number of messages to limit
   */
  message_limit?: number;

  /**
   * Channel pagination offset
   */
  offset?: number;

  /**
   * ID of a predefined filter to use instead of filter_conditions
   */
  predefined_filter?: string;

  presence?: boolean;

  /**
   * Whether to update channel state or not
   */
  state?: boolean;

  /**
   * Whether to start watching found channels or not
   */
  watch?: boolean;

  /**
   * List of sort parameters
   */
  sort?: Array<SortParamRequest>;

  /**
   * Filter conditions to apply to the query
   */
  filter_conditions?: Record<string, any>;

  /**
   * Values to interpolate into the predefined filter template
   */
  filter_values?: Record<string, any>;

  sort_values?: Record<string, any>;
}

export interface QueryChannelsResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  /**
   * List of channels
   */
  channels: Array<ChannelStateResponseFields>;

  predefined_filter?: ParsedPredefinedFilterResponse;
}

export interface QueryDraftsRequest {
  limit?: number;

  next?: string;

  prev?: string;

  /**
   * Array of sort parameters
   */
  sort?: Array<SortParamRequest>;

  /**
   * Filter to apply to the query
   */
  filter?: Record<string, any>;
}

export interface QueryDraftsResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  /**
   * Drafts
   */
  drafts: Array<DraftResponse>;

  next?: string;

  prev?: string;
}

export interface QueryFutureChannelBansPayload {
  /**
   * Whether to exclude expired bans or not
   */
  exclude_expired_bans?: boolean;

  /**
   * Number of records to return
   */
  limit?: number;

  /**
   * Number of records to offset
   */
  offset?: number;

  /**
   * Filter by the target user ID. For server-side requests only.
   */
  target_user_id?: string;
}

export interface QueryFutureChannelBansResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  /**
   * List of found future channel bans
   */
  bans: Array<FutureChannelBanResponse>;
}

export interface QueryMembersPayload {
  type: string;

  /**
   * Filter conditions to apply to the query
   */
  filter_conditions: Record<string, any>;

  id?: string;

  limit?: number;

  offset?: number;

  members?: Array<ChannelMemberRequest>;

  /**
   * Array of sort parameters
   */
  sort?: Array<SortParamRequest>;
}

export interface QueryMessageFlagsPayload {
  limit?: number;

  offset?: number;

  /**
   * Whether to include deleted messages in the results
   */
  show_deleted_messages?: boolean;

  /**
   * Array of sort parameters
   */
  sort?: Array<SortParamRequest>;

  /**
   * Filter conditions to apply to the query
   */
  filter_conditions?: Record<string, any>;
}

export interface QueryMessageFlagsResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  /**
   * The flags that match the query
   */
  flags: Array<MessageFlagResponse>;
}

export interface QueryModerationConfigsRequest {
  limit?: number;

  next?: string;

  prev?: string;

  /**
   * Sorting parameters for the results
   */
  sort?: Array<SortParamRequest>;

  /**
   * Filter conditions for moderation configs
   */
  filter?: Record<string, any>;
}

export interface QueryModerationConfigsResponse {
  duration: string;

  /**
   * List of moderation configurations
   */
  configs: Array<ConfigResponse>;

  next?: string;

  prev?: string;
}

export interface QueryPollVotesRequest {
  limit?: number;

  next?: string;

  prev?: string;

  /**
   * Array of sort parameters
   */
  sort?: Array<SortParamRequest>;

  /**
   * Filter to apply to the query
   */
  filter?: Record<string, any>;
}

export interface QueryPollsRequest {
  limit?: number;

  next?: string;

  prev?: string;

  /**
   * Array of sort parameters
   */
  sort?: Array<SortParamRequest>;

  /**
   * Filter to apply to the query
   */
  filter?: Record<string, any>;
}

export interface QueryPollsResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  /**
   * Polls data returned by the query
   */
  polls: Array<PollResponseData>;

  next?: string;

  prev?: string;
}

export interface QueryReactionsRequest {
  limit?: number;

  next?: string;

  prev?: string;

  /**
   * Array of sort parameters
   */
  sort?: Array<SortParamRequest>;

  /**
   * Filter to apply to the query
   */
  filter?: Record<string, any>;
}

export interface QueryReactionsResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  reactions: Array<ReactionResponse>;

  next?: string;

  prev?: string;
}

export interface QueryRemindersRequest {
  limit?: number;

  next?: string;

  prev?: string;

  /**
   * Array of sort parameters
   */
  sort?: Array<SortParamRequest>;

  /**
   * Filter to apply to the query
   */
  filter?: Record<string, any>;
}

export interface QueryRemindersResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  /**
   * MessageReminders data returned by the query
   */
  reminders: Array<ReminderResponseData>;

  next?: string;

  prev?: string;
}

export interface QueryReviewQueueRequest {
  exclude_default_action_config?: boolean;

  limit?: number;

  /**
   * Number of items to lock (1-25)
   */
  lock_count?: number;

  /**
   * Duration for which items should be locked
   */
  lock_duration?: number;

  /**
   * Whether to lock items for review (true), unlock items (false), or just fetch (nil)
   */
  lock_items?: boolean;

  next?: string;

  prev?: string;

  /**
   * Whether to return only statistics
   */
  stats_only?: boolean;

  /**
   * Sorting parameters for the results
   */
  sort?: Array<SortParamRequest>;

  /**
   * Filter conditions for review queue items
   */
  filter?: Record<string, any>;
}

export interface QueryReviewQueueResponse {
  duration: string;

  /**
   * List of review queue items
   */
  items: Array<ReviewQueueItemResponse>;

  /**
   * Configuration for moderation actions
   */
  action_config: Record<string, Array<ModerationActionConfigResponse>>;

  /**
   * Statistics about the review queue
   */
  stats: Record<string, any>;

  next?: string;

  prev?: string;

  default_action_config?: Record<string, Array<ModerationActionConfigResponse>>;

  filter_config?: FilterConfigResponse;
}

export interface QueryThreadsRequest {
  limit?: number;

  member_limit?: number;

  next?: string;

  /**
   * Limit the number of participants returned per each thread
   */
  participant_limit?: number;

  prev?: string;

  /**
   * Limit the number of replies returned per each thread
   */
  reply_limit?: number;

  /**
   * Start watching the channel this thread belongs to
   */
  watch?: boolean;

  /**
   * Array of sort parameters
   */
  sort?: Array<SortParamRequest>;

  /**
   * Filter to apply to the query
   */
  filter?: Record<string, any>;
}

export interface QueryThreadsResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  /**
   * List of enriched thread states
   */
  threads: Array<ThreadStateResponse>;

  next?: string;

  prev?: string;
}

export interface QueryUsersPayload {
  /**
   * Filter conditions to apply to the query
   */
  filter_conditions: Record<string, any>;

  include_deactivated_users?: boolean;

  limit?: number;

  offset?: number;

  presence?: boolean;

  /**
   * Array of sort parameters
   */
  sort?: Array<SortParamRequest>;
}

export interface QueryUsersResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  /**
   * Array of users as result of filters applied.
   */
  users: Array<FullUserResponse>;
}

export interface Reaction {
  activity_id: string;

  created_at: Date;

  kind: string;

  updated_at: Date;

  user_id: string;

  deleted_at?: Date;

  id?: string;

  parent?: string;

  score?: number;

  target_feeds?: Array<string>;

  children_counts?: Record<string, any>;

  data?: Record<string, any>;

  latest_children?: Record<string, Array<Reaction>>;

  moderation?: Record<string, any>;

  own_children?: Record<string, Array<Reaction>>;

  target_feeds_extra_data?: Record<string, any>;

  user?: User;
}

export interface ReactionDeletedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  channel: ChannelResponse;

  custom: Record<string, any>;

  /**
   * The type of event: "reaction.deleted" in this case
   */
  type: string;

  /**
   * The ID of the channel containing the message
   */
  channel_id?: string;

  /**
   * The number of members in the channel
   */
  channel_member_count?: number;

  /**
   * The number of messages in the channel
   */
  channel_message_count?: number;

  /**
   * The type of the channel containing the message
   */
  channel_type?: string;

  /**
   * The CID of the channel containing the message
   */
  cid?: string;

  message_id?: string;

  received_at?: Date;

  /**
   * The team ID
   */
  team?: string;

  /**
   * The participants of the thread
   */
  thread_participants?: Array<UserResponseCommonFields>;

  channel_custom?: Record<string, any>;

  message?: MessageResponse;

  reaction?: ReactionResponse;

  user?: UserResponseCommonFields;
}

export interface ReactionGroupResponse {
  /**
   * Count is the number of reactions of this type.
   */
  count: number;

  /**
   * FirstReactionAt is the time of the first reaction of this type. This is the same also if all reaction of this type are deleted, because if someone will react again with the same type, will be preserved the sorting.
   */
  first_reaction_at: Date;

  /**
   * LastReactionAt is the time of the last reaction of this type.
   */
  last_reaction_at: Date;

  /**
   * SumScores is the sum of all scores of reactions of this type. Medium allows you to clap articles more than once and shows the sum of all claps from all users. For example, you can send `clap` x5 using `score: 5`.
   */
  sum_scores: number;

  /**
   * The most recent users who reacted with this type, ordered by most recent first.
   */
  latest_reactions_by: Array<ReactionGroupUserResponse>;
}

export interface ReactionGroupUserResponse {
  /**
   * The time when the user reacted.
   */
  created_at: Date;

  /**
   * The ID of the user who reacted.
   */
  user_id: string;

  user?: UserResponse;
}

export interface ReactionNewEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  channel: ChannelResponse;

  custom: Record<string, any>;

  /**
   * The type of event: "reaction.new" in this case
   */
  type: string;

  /**
   * The ID of the channel containing the message
   */
  channel_id?: string;

  /**
   * The number of members in the channel
   */
  channel_member_count?: number;

  /**
   * The number of messages in the channel
   */
  channel_message_count?: number;

  /**
   * The type of the channel containing the message
   */
  channel_type?: string;

  /**
   * The CID of the channel containing the message
   */
  cid?: string;

  message_id?: string;

  received_at?: Date;

  /**
   * The team ID
   */
  team?: string;

  /**
   * The participants of the thread
   */
  thread_participants?: Array<UserResponseCommonFields>;

  channel_custom?: Record<string, any>;

  message?: MessageResponse;

  reaction?: ReactionResponse;

  user?: UserResponseCommonFields;
}

export interface ReactionRequest {
  /**
   * The type of reaction (e.g. 'like', 'laugh', 'wow')
   */
  type: string;

  /**
   * Date/time of creation
   */
  created_at?: Date;

  /**
   * Reaction score. If not specified reaction has score of 1
   */
  score?: number;

  /**
   * Date/time of the last update
   */
  updated_at?: Date;

  custom?: Record<string, any>;
}

export interface ReactionResponse {
  /**
   * Date/time of creation
   */
  created_at: Date;

  /**
   * Message ID
   */
  message_id: string;

  /**
   * Score of the reaction
   */
  score: number;

  /**
   * Type of reaction
   */
  type: string;

  /**
   * Date/time of the last update
   */
  updated_at: Date;

  /**
   * User ID
   */
  user_id: string;

  /**
   * Custom data for this object
   */
  custom: Record<string, any>;

  user: UserResponse;
}

export interface ReactionUpdatedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  message_id: string;

  channel: ChannelResponse;

  custom: Record<string, any>;

  message: MessageResponse;

  /**
   * The type of event: "reaction.updated" in this case
   */
  type: string;

  /**
   * The ID of the channel containing the message
   */
  channel_id?: string;

  /**
   * The number of members in the channel
   */
  channel_member_count?: number;

  /**
   * The number of messages in the channel
   */
  channel_message_count?: number;

  /**
   * The type of the channel containing the message
   */
  channel_type?: string;

  /**
   * The CID of the channel containing the message
   */
  cid?: string;

  received_at?: Date;

  /**
   * The team ID
   */
  team?: string;

  channel_custom?: Record<string, any>;

  reaction?: ReactionResponse;

  user?: UserResponseCommonFields;
}

export interface ReadReceiptsResponse {
  enabled: boolean;
}

export interface ReadStateResponse {
  last_read: Date;

  unread_messages: number;

  user: UserResponse;

  last_delivered_at?: Date;

  last_delivered_message_id?: string;

  last_read_message_id?: string;
}

export interface RejectAppealRequestPayload {
  /**
   * Reason for rejecting the appeal
   */
  decision_reason: string;
}

export interface ReminderCreatedEvent {
  /**
   * The CID of the Channel for which the reminder was created
   */
  cid: string;

  /**
   * Date/time of creation
   */
  created_at: Date;

  /**
   * The ID of the message for which the reminder was created
   */
  message_id: string;

  /**
   * The ID of the user for whom the reminder was created
   */
  user_id: string;

  custom: Record<string, any>;

  /**
   * The type of event: "reminder.created" in this case
   */
  type: string;

  /**
   * The ID of the parent message, if the reminder is for a thread message
   */
  parent_id?: string;

  received_at?: Date;

  reminder?: ReminderResponseData;
}

export interface ReminderDeletedEvent {
  /**
   * The CID of the Channel for which the reminder was created
   */
  cid: string;

  /**
   * Date/time of creation
   */
  created_at: Date;

  /**
   * The ID of the message for which the reminder was created
   */
  message_id: string;

  /**
   * The ID of the user for whom the reminder was created
   */
  user_id: string;

  custom: Record<string, any>;

  /**
   * The type of event: "reminder.deleted" in this case
   */
  type: string;

  /**
   * The ID of the parent message, if the reminder is for a thread message
   */
  parent_id?: string;

  received_at?: Date;

  reminder?: ReminderResponseData;
}

export interface ReminderNotificationEvent {
  /**
   * The CID of the Channel for which the reminder was created
   */
  cid: string;

  /**
   * Date/time of creation
   */
  created_at: Date;

  /**
   * The ID of the message for which the reminder was created
   */
  message_id: string;

  /**
   * The ID of the user for whom the reminder was created
   */
  user_id: string;

  custom: Record<string, any>;

  /**
   * The type of event: "notification.reminder_due" in this case
   */
  type: string;

  parent_id?: string;

  received_at?: Date;

  reminder?: ReminderResponseData;
}

export interface ReminderResponseData {
  channel_cid: string;

  created_at: Date;

  message_id: string;

  updated_at: Date;

  user_id: string;

  remind_at?: Date;

  channel?: ChannelResponse;

  message?: MessageResponse;

  user?: UserResponse;
}

export interface ReminderUpdatedEvent {
  /**
   * The CID of the Channel for which the reminder was created
   */
  cid: string;

  /**
   * Date/time of creation
   */
  created_at: Date;

  /**
   * The ID of the message for which the reminder was created
   */
  message_id: string;

  /**
   * The ID of the user for whom the reminder was created
   */
  user_id: string;

  custom: Record<string, any>;

  /**
   * The type of event: "reminder.updated" in this case
   */
  type: string;

  /**
   * The ID of the parent message, if the reminder is for a thread message
   */
  parent_id?: string;

  received_at?: Date;

  reminder?: ReminderResponseData;
}

export interface RemoveUserGroupMembersRequest {
  /**
   * List of user IDs to remove
   */
  member_ids: Array<string>;

  team_id?: string;
}

export interface RemoveUserGroupMembersResponse {
  duration: string;

  user_group?: UserGroupResponse;
}

export interface Response {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;
}

export interface RestoreActionRequestPayload {
  /**
   * Reason for the appeal decision
   */
  decision_reason?: string;
}

export interface ReviewQueueItemResponse {
  /**
   * AI-determined text severity
   */
  ai_text_severity: string;

  /**
   * When the item was created
   */
  created_at: Date;

  /**
   * ID of the entity being reviewed
   */
  entity_id: string;

  /**
   * Type of entity being reviewed
   */
  entity_type: string;

  /**
   * Whether the item has been escalated
   */
  escalated: boolean;

  flags_count: number;

  /**
   * Unique identifier of the review queue item
   */
  id: string;

  latest_moderator_action: string;

  /**
   * Suggested moderation action
   */
  recommended_action: string;

  /**
   * ID of the moderator who reviewed the item
   */
  reviewed_by: string;

  /**
   * Severity level of the content
   */
  severity: number;

  /**
   * Current status of the review
   */
  status: string;

  /**
   * When the item was last updated
   */
  updated_at: Date;

  /**
   * Moderation actions taken
   */
  actions: Array<ActionLogResponse>;

  /**
   * Associated ban records
   */
  bans: Array<BanInfoResponse>;

  /**
   * Associated flag records
   */
  flags: Array<ModerationFlagResponse>;

  /**
   * Detected languages in the content
   */
  languages: Array<string>;

  /**
   * When the review was completed
   */
  completed_at?: Date;

  config_key?: string;

  /**
   * ID of who created the entity
   */
  entity_creator_id?: string;

  /**
   * When the item was escalated
   */
  escalated_at?: Date;

  /**
   * ID of the moderator who escalated the item
   */
  escalated_by?: string;

  /**
   * When the item was reviewed
   */
  reviewed_at?: Date;

  /**
   * Teams associated with this item
   */
  teams?: Array<string>;

  activity?: EnrichedActivity;

  appeal?: AppealItemResponse;

  assigned_to?: UserResponse;

  call?: CallResponse;

  entity_creator?: EntityCreatorResponse;

  escalation_metadata?: EscalationMetadata;

  feeds_v2_activity?: EnrichedActivity;

  feeds_v2_reaction?: Reaction;

  feeds_v3_activity?: FeedsV3ActivityResponse;

  feeds_v3_comment?: FeedsV3CommentResponse;

  message?: ChatMessageResponse;

  moderation_payload?: ModerationPayloadResponse;

  reaction?: Reaction;
}

export interface RuleBuilderAction {
  skip_inbox?: boolean;

  type?:
    | 'ban_user'
    | 'flag_user'
    | 'flag_content'
    | 'block_content'
    | 'shadow_content'
    | 'bounce_flag_content'
    | 'bounce_content'
    | 'bounce_remove_content'
    | 'mute_video'
    | 'mute_audio'
    | 'blur'
    | 'call_blur'
    | 'end_call'
    | 'kick_user'
    | 'warning'
    | 'call_warning'
    | 'webhook_only';

  ban_options?: BanOptions;

  call_options?: CallActionOptions;

  flag_user_options?: FlagUserOptions;
}

export interface RuleBuilderCondition {
  confidence?: number;

  type?: string;

  call_custom_property_params?: CallCustomPropertyParameters;

  call_type_rule_params?: CallTypeRuleParameters;

  call_violation_count_params?: CallViolationCountParameters;

  channel_message_count_rule_params?: ChannelMessageCountRuleParameters;

  closed_caption_rule_params?: ClosedCaptionRuleParameters;

  content_count_rule_params?: ContentCountRuleParameters;

  content_flag_count_rule_params?: FlagCountRuleParameters;

  image_content_params?: ImageContentParameters;

  image_rule_params?: ImageRuleParameters;

  keyframe_rule_params?: KeyframeRuleParameters;

  text_content_params?: TextContentParameters;

  text_rule_params?: TextRuleParameters;

  user_created_within_params?: UserCreatedWithinParameters;

  user_custom_property_params?: UserCustomPropertyParameters;

  user_flag_count_rule_params?: FlagCountRuleParameters;

  user_identical_content_count_params?: UserIdenticalContentCountParameters;

  user_role_params?: UserRoleParameters;

  user_rule_params?: UserRuleParameters;

  video_content_params?: VideoContentParameters;

  video_rule_params?: VideoRuleParameters;
}

export interface RuleBuilderConditionGroup {
  logic?: string;

  conditions?: Array<RuleBuilderCondition>;
}

export interface RuleBuilderConfig {
  async?: boolean;

  rules?: Array<RuleBuilderRule>;
}

export interface RuleBuilderRule {
  rule_type: string;

  cooldown_period?: string;

  id?: string;

  logic?: string;

  action_sequences?: Array<CallRuleActionSequence>;

  conditions?: Array<RuleBuilderCondition>;

  groups?: Array<RuleBuilderConditionGroup>;

  action?: RuleBuilderAction;
}

export interface SearchPayload {
  /**
   * Channel filter conditions
   */
  filter_conditions: Record<string, any>;

  force_default_search?: boolean;

  force_sql_v2_backend?: boolean;

  /**
   * Number of messages to return
   */
  limit?: number;

  /**
   * Pagination parameter. Cannot be used with non-zero offset.
   */
  next?: string;

  /**
   * Pagination offset. Cannot be used with sort or next.
   */
  offset?: number;

  /**
   * Search phrase
   */
  query?: string;

  /**
   * Sort parameters. Cannot be used with non-zero offset
   */
  sort?: Array<SortParamRequest>;

  /**
   * Message filter conditions
   */
  message_filter_conditions?: Record<string, any>;

  message_options?: MessageOptions;
}

export interface SearchResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  /**
   * Search results
   */
  results: Array<SearchResult>;

  /**
   * Value to pass to the next search query in order to paginate
   */
  next?: string;

  /**
   * Value that points to the previous page. Pass as the next value in a search query to paginate backwards
   */
  previous?: string;

  results_warning?: SearchWarning;
}

export interface SearchResult {
  message?: SearchResultMessage;
}

export interface SearchResultMessage {
  cid: string;

  created_at: Date;

  deleted_reply_count: number;

  html: string;

  id: string;

  mentioned_channel: boolean;

  mentioned_here: boolean;

  pinned: boolean;

  reply_count: number;

  shadowed: boolean;

  silent: boolean;

  text: string;

  type: string;

  updated_at: Date;

  attachments: Array<Attachment>;

  latest_reactions: Array<ReactionResponse>;

  mentioned_users: Array<UserResponse>;

  own_reactions: Array<ReactionResponse>;

  restricted_visibility: Array<string>;

  custom: Record<string, any>;

  reaction_counts: Record<string, number>;

  reaction_scores: Record<string, number>;

  user: UserResponse;

  command?: string;

  deleted_at?: Date;

  deleted_for_me?: boolean;

  message_text_updated_at?: Date;

  mml?: string;

  parent_id?: string;

  pin_expires?: Date;

  pinned_at?: Date;

  poll_id?: string;

  quoted_message_id?: string;

  show_in_channel?: boolean;

  mentioned_group_ids?: Array<string>;

  mentioned_roles?: Array<string>;

  thread_participants?: Array<UserResponse>;

  channel?: ChannelResponse;

  draft?: DraftResponse;

  i18n?: Record<string, string>;

  image_labels?: Record<string, Array<string>>;

  member?: ChannelMemberResponse;

  moderation?: ModerationV2Response;

  pinned_by?: UserResponse;

  poll?: PollResponseData;

  quoted_message?: MessageResponse;

  reaction_groups?: Record<string, ReactionGroupResponse>;

  reminder?: ReminderResponseData;

  shared_location?: SharedLocationResponseData;
}

export interface SearchUserGroupsResponse {
  duration: string;

  /**
   * List of matching user groups
   */
  user_groups: Array<UserGroupResponse>;
}

export interface SearchWarning {
  /**
   * Code corresponding to the warning
   */
  warning_code: number;

  /**
   * Description of the warning
   */
  warning_description: string;

  /**
   * Number of channels searched
   */
  channel_search_count?: number;

  /**
   * Channel CIDs for the searched channels
   */
  channel_search_cids?: Array<string>;
}

export interface SendEventRequest {
  event: EventRequest;
}

export interface SendMessageRequest {
  message: MessageRequest;

  keep_channel_hidden?: boolean;

  skip_enrich_url?: boolean;

  skip_push?: boolean;
}

export interface SendMessageResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  message: MessageResponse;

  /**
   * Pending message metadata
   */
  pending_message_metadata?: Record<string, string>;
}

export interface SendReactionRequest {
  reaction: ReactionRequest;

  /**
   * Whether to replace all existing user reactions
   */
  enforce_unique?: boolean;

  /**
   * Skips any mobile push notifications
   */
  skip_push?: boolean;
}

export interface SendReactionResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  message: MessageResponse;

  reaction: ReactionResponse;
}

export interface ShadowBlockActionRequestPayload {
  /**
   * Reason for shadow blocking
   */
  reason?: string;
}

export interface SharedLocation {
  latitude: number;

  longitude: number;

  created_by_device_id?: string;

  end_at?: Date;
}

export interface SharedLocationResponse {
  /**
   * Channel CID
   */
  channel_cid: string;

  /**
   * Date/time of creation
   */
  created_at: Date;

  /**
   * Device ID that created the live location
   */
  created_by_device_id: string;

  duration: string;

  /**
   * Latitude coordinate
   */
  latitude: number;

  /**
   * Longitude coordinate
   */
  longitude: number;

  /**
   * Message ID
   */
  message_id: string;

  /**
   * Date/time of the last update
   */
  updated_at: Date;

  /**
   * User ID
   */
  user_id: string;

  /**
   * Time when the live location expires
   */
  end_at?: Date;

  channel?: ChannelResponse;

  message?: MessageResponse;
}

export interface SharedLocationResponseData {
  channel_cid: string;

  created_at: Date;

  created_by_device_id: string;

  latitude: number;

  longitude: number;

  message_id: string;

  updated_at: Date;

  user_id: string;

  end_at?: Date;

  channel?: ChannelResponse;

  message?: MessageResponse;
}

export interface SharedLocationsResponse {
  duration: string;

  active_live_locations: Array<SharedLocationResponseData>;
}

export interface ShowChannelRequest {}

export interface ShowChannelResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;
}

export interface SortParamRequest {
  /**
   * Direction of sorting, 1 for Ascending, -1 for Descending, default is 1. One of: -1, 1
   */
  direction?: number;

  /**
   * Name of field to sort by
   */
  field?: string;

  /**
   * Type of field to sort by. Empty string or omitted means string type (default). One of: number, boolean
   */
  type?: string;
}

export interface SubmitActionRequest {
  /**
   * Type of moderation action to perform. One of: mark_reviewed, delete_message, delete_activity, delete_comment, delete_reaction, ban, custom, unban, restore, delete_user, unblock, block, shadow_block, unmask, kick_user, end_call, escalate, de_escalate
   */

  action_type:
    | 'flag'
    | 'mark_reviewed'
    | 'delete_message'
    | 'delete_activity'
    | 'delete_comment'
    | 'delete_reaction'
    | 'ban'
    | 'custom'
    | 'unban'
    | 'restore'
    | 'delete_user'
    | 'unblock'
    | 'block'
    | 'shadow_block'
    | 'unmask'
    | 'kick_user'
    | 'end_call'
    | 'reject_appeal'
    | 'escalate'
    | 'de_escalate'
    | 'bypass';

  /**
   * UUID of the appeal to act on (required for reject_appeal, optional for other actions)
   */
  appeal_id?: string;

  /**
   * UUID of the review queue item to act on
   */
  item_id?: string;

  ban?: BanActionRequestPayload;

  block?: BlockActionRequestPayload;

  bypass?: BypassActionRequest;

  custom?: CustomActionRequestPayload;

  delete_activity?: DeleteActivityRequestPayload;

  delete_comment?: DeleteCommentRequestPayload;

  delete_message?: DeleteMessageRequestPayload;

  delete_reaction?: DeleteReactionRequestPayload;

  delete_user?: DeleteUserRequestPayload;

  escalate?: EscalatePayload;

  flag?: FlagRequest;

  mark_reviewed?: MarkReviewedRequestPayload;

  reject_appeal?: RejectAppealRequestPayload;

  restore?: RestoreActionRequestPayload;

  shadow_block?: ShadowBlockActionRequestPayload;

  unban?: UnbanActionRequestPayload;

  unblock?: UnblockActionRequestPayload;
}

export interface SubmitActionResponse {
  duration: string;

  appeal_item?: AppealItemResponse;

  item?: ReviewQueueItemResponse;
}

export interface SyncRequest {
  /**
   * Date from which synchronization should happen
   */
  last_sync_at: Date;

  /**
   * List of channel CIDs to sync
   */
  channel_cids: Array<string>;
}

export interface SyncResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  /**
   * List of events
   */
  events: Array<WSEvent>;

  /**
   * List of CIDs that user can't access
   */
  inaccessible_cids?: Array<string>;
}

export interface TextContentParameters {
  contains_url?: boolean;

  label_operator?: string;

  severity?: string;

  blocklist_match?: Array<string>;

  harm_labels?: Array<string>;

  llm_harm_labels?: Record<string, string>;
}

export interface TextRuleParameters {
  contains_url?: boolean;

  semantic_filter_min_threshold?: number;

  severity?: string;

  threshold?: number;

  time_window?: string;

  blocklist_match?: Array<string>;

  harm_labels?: Array<string>;

  semantic_filter_names?: Array<string>;

  llm_harm_labels?: Record<string, string>;
}

export interface ThreadParticipant {
  app_pk: number;

  channel_cid: string;

  /**
   * Date/time of creation
   */
  created_at: Date;

  last_read_at: Date;

  custom: Record<string, any>;

  last_thread_message_at?: Date;

  /**
   * Left Thread At is the time when the user left the thread
   */
  left_thread_at?: Date;

  /**
   * Thead ID is unique string identifier of the thread
   */
  thread_id?: string;

  /**
   * User ID is unique string identifier of the user
   */
  user_id?: string;

  user?: UserResponse;
}

export interface ThreadResponse {
  /**
   * Active Participant Count
   */
  active_participant_count: number;

  /**
   * Channel CID
   */
  channel_cid: string;

  /**
   * Date/time of creation
   */
  created_at: Date;

  /**
   * Created By User ID
   */
  created_by_user_id: string;

  /**
   * Parent Message ID
   */
  parent_message_id: string;

  /**
   * Participant Count
   */
  participant_count: number;

  /**
   * Title
   */
  title: string;

  /**
   * Date/time of the last update
   */
  updated_at: Date;

  /**
   * Custom data for this object
   */
  custom: Record<string, any>;

  /**
   * Deleted At
   */
  deleted_at?: Date;

  /**
   * Last Message At
   */
  last_message_at?: Date;

  /**
   * Reply Count
   */
  reply_count?: number;

  /**
   * Thread Participants
   */
  thread_participants?: Array<ThreadParticipant>;

  channel?: ChannelResponse;

  created_by?: UserResponse;

  parent_message?: MessageResponse;
}

export interface ThreadStateResponse {
  /**
   * Active Participant Count
   */
  active_participant_count: number;

  /**
   * Channel CID
   */
  channel_cid: string;

  /**
   * Date/time of creation
   */
  created_at: Date;

  /**
   * Created By User ID
   */
  created_by_user_id: string;

  /**
   * Parent Message ID
   */
  parent_message_id: string;

  /**
   * Participant Count
   */
  participant_count: number;

  /**
   * Title
   */
  title: string;

  /**
   * Date/time of the last update
   */
  updated_at: Date;

  latest_replies: Array<MessageResponse>;

  /**
   * Custom data for this object
   */
  custom: Record<string, any>;

  /**
   * Deleted At
   */
  deleted_at?: Date;

  /**
   * Last Message At
   */
  last_message_at?: Date;

  /**
   * Reply Count
   */
  reply_count?: number;

  read?: Array<ReadStateResponse>;

  /**
   * Thread Participants
   */
  thread_participants?: Array<ThreadParticipant>;

  channel?: ChannelResponse;

  created_by?: UserResponse;

  draft?: DraftResponse;

  parent_message?: MessageResponse;
}

export interface ThreadUpdatedEvent {
  created_at: Date;

  custom: Record<string, any>;

  type: string;

  channel_id?: string;

  channel_type?: string;

  cid?: string;

  received_at?: Date;

  thread?: ThreadResponse;
}

export interface Thresholds {
  explicit?: LabelThresholds;

  spam?: LabelThresholds;

  toxic?: LabelThresholds;
}

export interface Time {}

export interface TranslateMessageRequest {
  /**
   * Language to translate message to
   */

  language:
    | 'af'
    | 'sq'
    | 'am'
    | 'ar'
    | 'az'
    | 'bn'
    | 'bs'
    | 'bg'
    | 'zh'
    | 'zh-TW'
    | 'hr'
    | 'cs'
    | 'da'
    | 'fa-AF'
    | 'nl'
    | 'en'
    | 'et'
    | 'fi'
    | 'fr'
    | 'fr-CA'
    | 'ka'
    | 'de'
    | 'el'
    | 'ha'
    | 'he'
    | 'hi'
    | 'hu'
    | 'id'
    | 'it'
    | 'ja'
    | 'ko'
    | 'lv'
    | 'ms'
    | 'no'
    | 'fa'
    | 'ps'
    | 'pl'
    | 'pt'
    | 'ro'
    | 'ru'
    | 'sr'
    | 'sk'
    | 'sl'
    | 'so'
    | 'es'
    | 'es-MX'
    | 'sw'
    | 'sv'
    | 'tl'
    | 'ta'
    | 'th'
    | 'tr'
    | 'uk'
    | 'ur'
    | 'vi'
    | 'lt'
    | 'ht';
}

export interface TruncateChannelRequest {
  /**
   * Permanently delete channel data (messages, reactions, etc.)
   */
  hard_delete?: boolean;

  /**
   * When `message` is set disables all push notifications for it
   */
  skip_push?: boolean;

  /**
   * Truncate channel data up to `truncated_at`. The system message (if provided) creation time is always greater than `truncated_at`
   */
  truncated_at?: Date;

  /**
   * List of member IDs to hide message history for. If empty, truncates the channel for all members
   */
  member_ids?: Array<string>;

  message?: MessageRequest;
}

export interface TruncateChannelResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  channel?: ChannelResponse;

  message?: MessageResponse;
}

export interface TypingIndicatorsResponse {
  enabled: boolean;
}

export interface TypingStartEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  /**
   * The type of event: "typing.start" in this case
   */
  type: string;

  /**
   * The ID of the channel where the user started typing
   */
  channel_id?: string;

  /**
   * The type of the channel where the user started typing
   */
  channel_type?: string;

  /**
   * The CID of the channel where the user started typing
   */
  cid?: string;

  /**
   * The parent ID if the user started typing in a thread
   */
  parent_id?: string;

  received_at?: Date;

  user?: UserResponseCommonFields;
}

export interface TypingStopEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  /**
   * The type of event: "typing.stop" in this case
   */
  type: string;

  /**
   * The ID of the channel where the user stopped typing
   */
  channel_id?: string;

  /**
   * The type of the channel where the user stopped typing
   */
  channel_type?: string;

  /**
   * The CID of the channel where the user stopped typing
   */
  cid?: string;

  /**
   * The parent ID if the user stopped typing in a thread
   */
  parent_id?: string;

  received_at?: Date;

  user?: UserResponseCommonFields;
}

export interface UnbanActionRequestPayload {
  /**
   * Channel CID for channel-specific unban
   */
  channel_cid?: string;

  /**
   * Reason for the appeal decision
   */
  decision_reason?: string;

  /**
   * Also remove the future channels ban for this user
   */
  remove_future_channels_ban?: boolean;
}

export interface UnblockActionRequestPayload {
  /**
   * Reason for the appeal decision
   */
  decision_reason?: string;
}

export interface UnblockUsersRequest {
  blocked_user_id: string;
}

export interface UnblockUsersResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;
}

export interface UnmuteChannelRequest {
  /**
   * Duration of mute in milliseconds
   */
  expiration?: number;

  /**
   * Channel CIDs to mute (if multiple channels)
   */
  channel_cids?: Array<string>;
}

export interface UnmuteResponse {
  duration: string;

  /**
   * A list of users that can't be found. Common cause for this is deleted users
   */
  non_existing_users?: Array<string>;
}

export interface UnreadCountsChannel {
  channel_id: string;

  last_read: Date;

  unread_count: number;
}

export interface UnreadCountsChannelType {
  channel_count: number;

  channel_type: string;

  unread_count: number;
}

export interface UnreadCountsThread {
  last_read: Date;

  last_read_message_id: string;

  parent_message_id: string;

  unread_count: number;
}

export interface UpdateBlockListRequest {
  is_leet_check_enabled?: boolean;

  is_plural_check_enabled?: boolean;

  team?: string;

  /**
   * List of words to block
   */
  words?: Array<string>;
}

export interface UpdateBlockListResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  blocklist?: BlockListResponse;
}

export interface UpdateChannelPartialRequest {
  unset?: Array<string>;

  set?: Record<string, any>;
}

export interface UpdateChannelPartialResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  /**
   * List of updated members
   */
  members: Array<ChannelMemberResponse>;

  channel?: ChannelResponse;
}

export interface UpdateChannelRequest {
  /**
   * Set to `true` to accept the invite
   */
  accept_invite?: boolean;

  /**
   * Sets cool down period for the channel in seconds
   */
  cooldown?: number;

  /**
   * Set to `true` to hide channel's history when adding new members
   */
  hide_history?: boolean;

  /**
   * If set, hides channel's history before this time when adding new members. Takes precedence over `hide_history` when both are provided. Must be in RFC3339 format (e.g., "2024-01-01T10:00:00Z") and in the past.
   */
  hide_history_before?: Date;

  /**
   * Set to `true` to reject the invite
   */
  reject_invite?: boolean;

  /**
   * When `message` is set disables all push notifications for it
   */
  skip_push?: boolean;

  /**
   * List of filter tags to add to the channel
   */
  add_filter_tags?: Array<string>;

  /**
   * List of user IDs to add to the channel
   */
  add_members?: Array<ChannelMemberRequest>;

  /**
   * List of user IDs to make channel moderators
   */
  add_moderators?: Array<string>;

  /**
   * List of channel member role assignments. If any specified user is not part of the channel, the request will fail
   */
  assign_roles?: Array<ChannelMemberRequest>;

  /**
   * List of user IDs to take away moderators status from
   */
  demote_moderators?: Array<string>;

  /**
   * List of user IDs to invite to the channel
   */
  invites?: Array<ChannelMemberRequest>;

  /**
   * List of filter tags to remove from the channel
   */
  remove_filter_tags?: Array<string>;

  /**
   * List of user IDs to remove from the channel
   */
  remove_members?: Array<string>;

  data?: ChannelInputRequest;

  message?: MessageRequest;
}

export interface UpdateChannelResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  /**
   * List of channel members
   */
  members: Array<ChannelMemberResponse>;

  channel?: ChannelResponse;

  message?: MessageResponse;
}

export interface UpdateLiveLocationRequest {
  /**
   * Live location ID
   */
  message_id: string;

  /**
   * Time when the live location expires
   */
  end_at?: Date;

  /**
   * Latitude coordinate
   */
  latitude?: number;

  /**
   * Longitude coordinate
   */
  longitude?: number;
}

export interface UpdateMemberPartialRequest {
  unset?: Array<string>;

  set?: Record<string, any>;
}

export interface UpdateMemberPartialResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  channel_member?: ChannelMemberResponse;
}

export interface UpdateMessagePartialRequest {
  /**
   * Skip enriching the URL in the message
   */
  skip_enrich_url?: boolean;

  skip_push?: boolean;

  /**
   * Array of field names to unset
   */
  unset?: Array<string>;

  /**
   * Sets new field values
   */
  set?: Record<string, any>;
}

export interface UpdateMessagePartialResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  message?: MessageResponse;

  /**
   * Pending message metadata
   */
  pending_message_metadata?: Record<string, string>;
}

export interface UpdateMessageRequest {
  message: MessageRequest;

  /**
   * Skip enrich URL
   */
  skip_enrich_url?: boolean;

  skip_push?: boolean;
}

export interface UpdateMessageResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  message: MessageResponse;

  pending_message_metadata?: Record<string, string>;
}

export interface UpdatePollOptionRequest {
  /**
   * Option ID
   */
  id: string;

  /**
   * Option text
   */
  text: string;

  custom?: Record<string, any>;
}

export interface UpdatePollPartialRequest {
  /**
   * Array of field names to unset
   */
  unset?: Array<string>;

  /**
   * Sets new field values
   */
  set?: Record<string, any>;
}

export interface UpdatePollRequest {
  /**
   * Poll ID
   */
  id: string;

  /**
   * Poll name
   */
  name: string;

  /**
   * Allow answers
   */
  allow_answers?: boolean;

  /**
   * Allow user suggested options
   */
  allow_user_suggested_options?: boolean;

  /**
   * Poll description
   */
  description?: string;

  /**
   * Enforce unique vote
   */
  enforce_unique_vote?: boolean;

  /**
   * Is closed
   */
  is_closed?: boolean;

  /**
   * Max votes allowed
   */
  max_votes_allowed?: number;

  /**
   * Voting visibility
   */

  voting_visibility?: 'anonymous' | 'public';

  /**
   * Poll options
   */
  options?: Array<PollOptionRequest>;

  custom?: Record<string, any>;
}

export interface UpdateReminderRequest {
  remind_at?: Date;
}

export interface UpdateReminderResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  reminder: ReminderResponseData;
}

export interface UpdateThreadPartialRequest {
  /**
   * Array of field names to unset
   */
  unset?: Array<string>;

  /**
   * Sets new field values
   */
  set?: Record<string, any>;
}

export interface UpdateThreadPartialResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  thread: ThreadResponse;
}

export interface UpdateUserGroupRequest {
  /**
   * The new description for the group
   */
  description?: string;

  /**
   * The new name of the user group
   */
  name?: string;

  team_id?: string;
}

export interface UpdateUserGroupResponse {
  duration: string;

  user_group?: UserGroupResponse;
}

export interface UpdateUserPartialRequest {
  /**
   * User ID to update
   */
  id: string;

  unset?: Array<string>;

  set?: Record<string, any>;
}

export interface UpdateUsersPartialRequest {
  users: Array<UpdateUserPartialRequest>;
}

export interface UpdateUsersRequest {
  /**
   * Object containing users
   */
  users: Record<string, UserRequest>;
}

export interface UpdateUsersResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  membership_deletion_task_id: string;

  /**
   * Object containing users
   */
  users: Record<string, FullUserResponse>;
}

export interface UploadChannelFileRequest {
  /**
   * file field
   */
  file?: string;

  user?: OnlyUserID;
}

export interface UploadChannelFileResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  /**
   * URL to the uploaded asset. Should be used to put to `asset_url` attachment field
   */
  file?: string;

  moderation_action?: string;

  /**
   * URL of the file thumbnail for supported file formats. Should be put to `thumb_url` attachment field
   */
  thumb_url?: string;
}

export interface UploadChannelRequest {
  file?: string;

  /**
   * field with JSON-encoded array of image size configurations
   */
  upload_sizes?: Array<ImageSize>;

  user?: OnlyUserID;
}

export interface UploadChannelResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  file?: string;

  moderation_action?: string;

  thumb_url?: string;

  /**
   * Array of image size configurations
   */
  upload_sizes?: Array<ImageSize>;
}

export interface UpsertActionConfigItem {
  action: string;

  entity_type: string;

  order: number;

  description?: string;

  icon?: string;

  id?: string;

  queue_type?: string;

  custom?: Record<string, any>;
}

export interface UpsertActionConfigRequest {
  /**
   * The action to perform (e.g. ban, delete_message, custom)
   */
  action: string;

  /**
   * Type of entity this action applies to (e.g. stream:chat:v1:message)
   */
  entity_type: string;

  /**
   * Display order in the dashboard (0–100, lower numbers shown first)
   */
  order: number;

  /**
   * Human-readable label for the dashboard button
   */
  description?: string;

  /**
   * Icon identifier for the dashboard button
   */
  icon?: string;

  /**
   * UUID of an existing action config to update; omit to create a new record
   */
  id?: string;

  /**
   * Queue this config belongs to; null means the default queue
   */
  queue_type?: string;

  /**
   * Action-specific parameters passed to the action handler
   */
  custom?: Record<string, any>;
}

export interface UpsertActionConfigResponse {
  duration: string;

  action_config?: ModerationActionConfigResponse;
}

export interface UpsertConfigRequest {
  /**
   * Unique identifier for the moderation configuration
   */
  key: string;

  /**
   * Whether moderation should be performed asynchronously
   */
  async?: boolean;

  /**
   * Team associated with the configuration
   */
  team?: string;

  ai_image_config?: AIImageConfig;

  ai_text_config?: AITextConfig;

  ai_video_config?: AIVideoConfig;

  automod_platform_circumvention_config?: AutomodPlatformCircumventionConfig;

  automod_semantic_filters_config?: AutomodSemanticFiltersConfig;

  automod_toxicity_config?: AutomodToxicityConfig;

  aws_rekognition_config?: AIImageConfig;

  block_list_config?: BlockListConfig;

  bodyguard_config?: AITextConfig;

  google_vision_config?: GoogleVisionConfig;

  llm_config?: LLMConfig;

  rule_builder_config?: RuleBuilderConfig;

  velocity_filter_config?: VelocityFilterConfig;

  video_call_rule_config?: VideoCallRuleConfig;
}

export interface UpsertConfigResponse {
  duration: string;

  config?: ConfigResponse;
}

export interface UpsertPushPreferencesRequest {
  /**
   * A list of push preferences for channels, calls, or the user.
   */
  preferences: Array<PushPreferenceInput>;
}

export interface UpsertPushPreferencesResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  /**
   * The channel specific push notification preferences, only returned for channels you've edited.
   */
  user_channel_preferences: Record<
    string,
    Record<string, ChannelPushPreferencesResponse | null>
  >;

  /**
   * The user preferences, always returned regardless if you edited it
   */
  user_preferences: Record<string, PushPreferencesResponse>;
}

export interface User {
  id: string;

  data?: Record<string, any>;
}

export interface UserBannedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  user: UserResponseCommonFields;

  /**
   * The type of event: "user.banned" in this case
   */
  type: string;

  /**
   * The ID of the channel where the target user was banned
   */
  channel_id?: string;

  channel_member_count?: number;

  channel_message_count?: number;

  /**
   * The type of the channel where the target user was banned
   */
  channel_type?: string;

  /**
   * The CID of the channel where the target user was banned
   */
  cid?: string;

  /**
   * The expiration date of the ban
   */
  expiration?: Date;

  /**
   * The reason for the ban
   */
  reason?: string;

  received_at?: Date;

  /**
   * Whether the user was shadow banned
   */
  shadow?: boolean;

  /**
   * The team of the channel where the target user was banned
   */
  team?: string;

  total_bans?: number;

  channel_custom?: Record<string, any>;

  created_by?: UserResponseCommonFields;
}

export interface UserCreatedWithinParameters {
  max_age?: string;
}

export interface UserCustomPropertyParameters {
  operator?: string;

  property_key?: string;
}

export interface UserDeactivatedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  user: UserResponseCommonFields;

  /**
   * The type of event: "user.deactivated" in this case
   */
  type: string;

  received_at?: Date;

  created_by?: UserResponseCommonFields;
}

export interface UserDeletedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  /**
   * The type of deletion that was used for the user's conversations. One of: hard, soft, pruning, (empty string)
   */
  delete_conversation: string;

  /**
   * Whether the user's conversation channels were deleted
   */
  delete_conversation_channels: boolean;

  /**
   * The type of deletion that was used for the user's messages. One of: hard, soft, pruning, (empty string)
   */
  delete_messages: string;

  /**
   * The type of deletion that was used for the user. One of: hard, soft, pruning, (empty string)
   */
  delete_user: string;

  /**
   * Whether the user was hard deleted
   */
  hard_delete: boolean;

  /**
   * Whether the user's messages were marked as deleted
   */
  mark_messages_deleted: boolean;

  custom: Record<string, any>;

  user: UserResponseCommonFields;

  /**
   * The type of event: "user.deleted" in this case
   */
  type: string;

  received_at?: Date;
}

export interface UserGroup {
  app_pk: number;

  created_at: Date;

  id: string;

  name: string;

  updated_at: Date;

  created_by?: string;

  description?: string;

  team_id?: string;

  members?: Array<UserGroupMember>;
}

export interface UserGroupCreatedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  /**
   * The type of event: "user_group.created" in this case
   */
  type: string;

  received_at?: Date;

  user?: UserResponseCommonFields;

  user_group?: UserGroup;
}

export interface UserGroupDeletedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  /**
   * The type of event: "user_group.deleted" in this case
   */
  type: string;

  received_at?: Date;

  user?: UserResponseCommonFields;

  user_group?: UserGroup;
}

export interface UserGroupMember {
  app_pk: number;

  created_at: Date;

  group_id: string;

  is_admin: boolean;

  user_id: string;
}

export interface UserGroupMemberAddedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  /**
   * The user IDs that were added
   */
  members: Array<string>;

  custom: Record<string, any>;

  /**
   * The type of event: "user_group.member_added" in this case
   */
  type: string;

  received_at?: Date;

  user?: UserResponseCommonFields;

  user_group?: UserGroup;
}

export interface UserGroupMemberRemovedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  /**
   * The user IDs that were removed
   */
  members: Array<string>;

  custom: Record<string, any>;

  /**
   * The type of event: "user_group.member_removed" in this case
   */
  type: string;

  received_at?: Date;

  user?: UserResponseCommonFields;

  user_group?: UserGroup;
}

export interface UserGroupResponse {
  created_at: Date;

  id: string;

  name: string;

  updated_at: Date;

  created_by?: string;

  description?: string;

  team_id?: string;

  members?: Array<UserGroupMember>;
}

export interface UserGroupUpdatedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  /**
   * The type of event: "user_group.updated" in this case
   */
  type: string;

  received_at?: Date;

  user?: UserResponseCommonFields;

  user_group?: UserGroup;
}

export interface UserIdenticalContentCountParameters {
  threshold?: number;

  time_window?: string;
}

export interface UserMessagesDeletedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  user: UserResponseCommonFields;

  /**
   * The type of event: "user.messages.deleted" in this case
   */
  type: string;

  /**
   * The ID of the channel where the target user's messages were deleted
   */
  channel_id?: string;

  channel_member_count?: number;

  channel_message_count?: number;

  /**
   * The type of the channel where the target user's messages were deleted
   */
  channel_type?: string;

  /**
   * The CID of the channel where the target user's messages were deleted
   */
  cid?: string;

  /**
   * Whether Messages were hard deleted
   */
  hard_delete?: boolean;

  received_at?: Date;

  /**
   * The team of the channel where the target user's messages were deleted
   */
  team?: string;

  channel_custom?: Record<string, any>;
}

export interface UserMuteResponse {
  created_at: Date;

  updated_at: Date;

  expires?: Date;

  target?: UserResponse;

  user?: UserResponse;
}

export interface UserMutedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  user: UserResponseCommonFields;

  /**
   * The type of event: "user.muted" in this case
   */
  type: string;

  received_at?: Date;

  /**
   * The target users that were muted
   */
  target_users?: Array<UserResponseCommonFields>;

  target_user?: UserResponseCommonFields;
}

export interface UserPresenceChangedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  user: UserResponseCommonFields;

  /**
   * The type of event: "user.presence.changed" in this case
   */
  type: string;

  received_at?: Date;
}

export interface UserReactivatedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  user: UserResponseCommonFields;

  /**
   * The type of event: "user.reactivated" in this case
   */
  type: string;

  received_at?: Date;

  created_by?: UserResponseCommonFields;
}

export interface UserRequest {
  /**
   * User ID
   */
  id: string;

  /**
   * User's profile image URL
   */
  image?: string;

  invisible?: boolean;

  language?: string;

  /**
   * Optional name of user
   */
  name?: string;

  /**
   * Custom user data
   */
  custom?: Record<string, any>;

  privacy_settings?: PrivacySettingsResponse;
}

export interface UserResponse {
  /**
   * Whether a user is banned or not
   */
  banned: boolean;

  /**
   * Date/time of creation
   */
  created_at: Date;

  /**
   * Unique user identifier
   */
  id: string;

  /**
   * Preferred language of a user
   */
  language: string;

  /**
   * Whether a user online or not
   */
  online: boolean;

  /**
   * Determines the set of user permissions
   */
  role: string;

  /**
   * Date/time of the last update
   */
  updated_at: Date;

  blocked_user_ids: Array<string>;

  /**
   * List of teams user is a part of
   */
  teams: Array<string>;

  /**
   * Custom data for this object
   */
  custom: Record<string, any>;

  avg_response_time?: number;

  /**
   * Date of deactivation
   */
  deactivated_at?: Date;

  /**
   * Date/time of deletion
   */
  deleted_at?: Date;

  image?: string;

  /**
   * Date of last activity
   */
  last_active?: Date;

  /**
   * Optional name of user
   */
  name?: string;

  /**
   * Revocation date for tokens
   */
  revoke_tokens_issued_before?: Date;

  teams_role?: Record<string, string>;
}

export interface UserResponseCommonFields {
  banned: boolean;

  created_at: Date;

  id: string;

  language: string;

  online: boolean;

  role: string;

  updated_at: Date;

  blocked_user_ids: Array<string>;

  teams: Array<string>;

  custom: Record<string, any>;

  avg_response_time?: number;

  deactivated_at?: Date;

  deleted_at?: Date;

  image?: string;

  last_active?: Date;

  name?: string;

  revoke_tokens_issued_before?: Date;

  teams_role?: Record<string, string>;
}

export interface UserResponsePrivacyFields {
  banned: boolean;

  created_at: Date;

  id: string;

  language: string;

  online: boolean;

  role: string;

  updated_at: Date;

  blocked_user_ids: Array<string>;

  teams: Array<string>;

  custom: Record<string, any>;

  avg_response_time?: number;

  deactivated_at?: Date;

  deleted_at?: Date;

  image?: string;

  invisible?: boolean;

  last_active?: Date;

  name?: string;

  revoke_tokens_issued_before?: Date;

  privacy_settings?: PrivacySettingsResponse;

  teams_role?: Record<string, string>;
}

export interface UserRoleParameters {
  operator?: string;

  role?: string;
}

export interface UserRuleParameters {
  max_age?: string;
}

export interface UserUnbannedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  user: UserResponseCommonFields;

  /**
   * The type of event: "user.unbanned" in this case
   */
  type: string;

  /**
   * The ID of the channel where the target user was unbanned
   */
  channel_id?: string;

  channel_member_count?: number;

  channel_message_count?: number;

  /**
   * The type of the channel where the target user was unbanned
   */
  channel_type?: string;

  /**
   * The CID of the channel where the target user was unbanned
   */
  cid?: string;

  received_at?: Date;

  /**
   * Whether the target user was shadow unbanned
   */
  shadow?: boolean;

  /**
   * The team of the channel where the target user was unbanned
   */
  team?: string;

  channel_custom?: Record<string, any>;

  created_by?: UserResponseCommonFields;
}

export interface UserUpdatedEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  custom: Record<string, any>;

  user: UserResponsePrivacyFields;

  /**
   * The type of event: "user.updated" in this case
   */
  type: string;

  received_at?: Date;
}

export interface UserWatchingStartEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  /**
   * The number of users watching the channel
   */
  watcher_count: number;

  custom: Record<string, any>;

  user: UserResponseCommonFields;

  /**
   * The type of event: "user.watching.start" in this case
   */
  type: string;

  /**
   * The ID of the channel which the user started watching
   */
  channel_id?: string;

  /**
   * The type of the channel which the user started watching
   */
  channel_type?: string;

  /**
   * The CID of the channel which the user started watching
   */
  cid?: string;

  received_at?: Date;
}

export interface UserWatchingStopEvent {
  /**
   * Date/time of creation
   */
  created_at: Date;

  /**
   * The number of users watching the channel
   */
  watcher_count: number;

  custom: Record<string, any>;

  user: UserResponseCommonFields;

  /**
   * The type of event: "user.watching.stop" in this case
   */
  type: string;

  /**
   * The ID of the channel which the user stopped watching
   */
  channel_id?: string;

  /**
   * The type of the channel which the user stopped watching
   */
  channel_type?: string;

  /**
   * The CID of the channel which the user stopped watching
   */
  cid?: string;

  received_at?: Date;
}

export interface VelocityFilterConfig {
  advanced_filters: boolean;

  cascading_actions: boolean;

  cids_per_user: number;

  enabled: boolean;

  first_message_only: boolean;

  rules: Array<VelocityFilterConfigRule>;

  async?: boolean;
}

export interface VelocityFilterConfigRule {
  action: 'flag' | 'shadow' | 'remove' | 'ban';

  ban_duration: number;

  cascading_action: 'flag' | 'shadow' | 'remove' | 'ban';

  cascading_threshold: number;

  check_message_context: boolean;

  fast_spam_threshold: number;

  fast_spam_ttl: number;

  ip_ban: boolean;

  probation_period: number;

  shadow_ban: boolean;

  slow_spam_threshold: number;

  slow_spam_ttl: number;

  url_only: boolean;

  slow_spam_ban_duration?: number;
}

export interface VideoCallRuleConfig {
  flag_all_labels: boolean;

  flagged_labels: Array<string>;

  rules: Array<HarmConfig>;
}

export interface VideoContentParameters {
  label_operator?: string;

  harm_labels?: Array<string>;
}

export interface VideoEndCallRequestPayload {}

export interface VideoKickUserRequestPayload {}

export interface VideoRuleParameters {
  threshold?: number;

  time_window?: string;

  harm_labels?: Array<string>;
}

export interface VoteData {
  answer_text?: string;

  option_id?: string;
}

export interface WSAuthMessage {
  /**
   * JWT token for authentication
   */
  token: string;

  user_details: ConnectUserDetailsRequest;

  /**
   * List of products to subscribe to. One of: chat, video, feeds
   */
  products?: Array<string>;
}

export type WSClientEvent =
  | ({ type: '*' } & CustomEvent)
  | ({ type: 'ai_indicator.clear' } & AIIndicatorClearEvent)
  | ({ type: 'ai_indicator.stop' } & AIIndicatorStopEvent)
  | ({ type: 'ai_indicator.update' } & AIIndicatorUpdateEvent)
  | ({ type: 'app.updated' } & AppUpdatedEvent)
  | ({ type: 'channel.created' } & ChannelCreatedEvent)
  | ({ type: 'channel.deleted' } & ChannelDeletedEvent)
  | ({ type: 'channel.frozen' } & ChannelFrozenEvent)
  | ({ type: 'channel.hidden' } & ChannelHiddenEvent)
  | ({ type: 'channel.kicked' } & ChannelKickedEvent)
  | ({ type: 'channel.max_streak_changed' } & MaxStreakChangedEvent)
  | ({ type: 'channel.truncated' } & ChannelTruncatedEvent)
  | ({ type: 'channel.unfrozen' } & ChannelUnFrozenEvent)
  | ({ type: 'channel.updated' } & ChannelUpdatedEvent)
  | ({ type: 'channel.visible' } & ChannelVisibleEvent)
  | ({ type: 'draft.deleted' } & DraftDeletedEvent)
  | ({ type: 'draft.updated' } & DraftUpdatedEvent)
  | ({ type: 'health.check' } & HealthCheckEvent)
  | ({ type: 'member.added' } & MemberAddedEvent)
  | ({ type: 'member.removed' } & MemberRemovedEvent)
  | ({ type: 'member.updated' } & MemberUpdatedEvent)
  | ({ type: 'message.deleted' } & MessageDeletedEvent)
  | ({ type: 'message.delivered' } & MessageDeliveredEvent)
  | ({ type: 'message.new' } & MessageNewEvent)
  | ({ type: 'message.pending' } & PendingMessageEvent)
  | ({ type: 'message.read' } & MessageReadEvent)
  | ({ type: 'message.undeleted' } & MessageUndeletedEvent)
  | ({ type: 'message.updated' } & MessageUpdatedEvent)
  | ({ type: 'moderation.custom_action' } & ModerationCustomActionEvent)
  | ({ type: 'moderation.flagged' } & ModerationFlaggedEvent)
  | ({ type: 'moderation.mark_reviewed' } & ModerationMarkReviewedEvent)
  | ({ type: 'notification.added_to_channel' } & NotificationAddedToChannelEvent)
  | ({ type: 'notification.channel_deleted' } & NotificationChannelDeletedEvent)
  | ({
      type: 'notification.channel_mutes_updated';
    } & NotificationChannelMutesUpdatedEvent)
  | ({ type: 'notification.channel_truncated' } & NotificationChannelTruncatedEvent)
  | ({ type: 'notification.invite_accepted' } & NotificationInviteAcceptedEvent)
  | ({ type: 'notification.invite_rejected' } & NotificationInviteRejectedEvent)
  | ({ type: 'notification.invited' } & NotificationInvitedEvent)
  | ({ type: 'notification.mark_read' } & NotificationMarkReadEvent)
  | ({ type: 'notification.mark_unread' } & NotificationMarkUnreadEvent)
  | ({ type: 'notification.message_new' } & NotificationNewMessageEvent)
  | ({ type: 'notification.mutes_updated' } & NotificationMutesUpdatedEvent)
  | ({ type: 'notification.reminder_due' } & ReminderNotificationEvent)
  | ({ type: 'notification.removed_from_channel' } & NotificationRemovedFromChannelEvent)
  | ({ type: 'notification.thread_message_new' } & NotificationThreadMessageNewEvent)
  | ({ type: 'poll.closed' } & PollClosedEvent)
  | ({ type: 'poll.deleted' } & PollDeletedEvent)
  | ({ type: 'poll.updated' } & PollUpdatedEvent)
  | ({ type: 'poll.vote_casted' } & PollVoteCastedEvent)
  | ({ type: 'poll.vote_changed' } & PollVoteChangedEvent)
  | ({ type: 'poll.vote_removed' } & PollVoteRemovedEvent)
  | ({ type: 'reaction.deleted' } & ReactionDeletedEvent)
  | ({ type: 'reaction.new' } & ReactionNewEvent)
  | ({ type: 'reaction.updated' } & ReactionUpdatedEvent)
  | ({ type: 'reminder.created' } & ReminderCreatedEvent)
  | ({ type: 'reminder.deleted' } & ReminderDeletedEvent)
  | ({ type: 'reminder.updated' } & ReminderUpdatedEvent)
  | ({ type: 'thread.updated' } & ThreadUpdatedEvent)
  | ({ type: 'typing.start' } & TypingStartEvent)
  | ({ type: 'typing.stop' } & TypingStopEvent)
  | ({ type: 'user.banned' } & UserBannedEvent)
  | ({ type: 'user.deactivated' } & UserDeactivatedEvent)
  | ({ type: 'user.deleted' } & UserDeletedEvent)
  | ({ type: 'user.messages.deleted' } & UserMessagesDeletedEvent)
  | ({ type: 'user.muted' } & UserMutedEvent)
  | ({ type: 'user.presence.changed' } & UserPresenceChangedEvent)
  | ({ type: 'user.reactivated' } & UserReactivatedEvent)
  | ({ type: 'user.unbanned' } & UserUnbannedEvent)
  | ({ type: 'user.updated' } & UserUpdatedEvent)
  | ({ type: 'user.watching.start' } & UserWatchingStartEvent)
  | ({ type: 'user.watching.stop' } & UserWatchingStopEvent)
  | ({ type: 'user_group.created' } & UserGroupCreatedEvent)
  | ({ type: 'user_group.deleted' } & UserGroupDeletedEvent)
  | ({ type: 'user_group.member_added' } & UserGroupMemberAddedEvent)
  | ({ type: 'user_group.member_removed' } & UserGroupMemberRemovedEvent)
  | ({ type: 'user_group.updated' } & UserGroupUpdatedEvent);

export type WSEvent =
  | ({ type: '*' } & CustomEvent)
  | ({ type: 'ai_indicator.clear' } & AIIndicatorClearEvent)
  | ({ type: 'ai_indicator.stop' } & AIIndicatorStopEvent)
  | ({ type: 'ai_indicator.update' } & AIIndicatorUpdateEvent)
  | ({ type: 'app.updated' } & AppUpdatedEvent)
  | ({ type: 'channel.created' } & ChannelCreatedEvent)
  | ({ type: 'channel.deleted' } & ChannelDeletedEvent)
  | ({ type: 'channel.frozen' } & ChannelFrozenEvent)
  | ({ type: 'channel.hidden' } & ChannelHiddenEvent)
  | ({ type: 'channel.kicked' } & ChannelKickedEvent)
  | ({ type: 'channel.max_streak_changed' } & MaxStreakChangedEvent)
  | ({ type: 'channel.truncated' } & ChannelTruncatedEvent)
  | ({ type: 'channel.unfrozen' } & ChannelUnFrozenEvent)
  | ({ type: 'channel.updated' } & ChannelUpdatedEvent)
  | ({ type: 'channel.visible' } & ChannelVisibleEvent)
  | ({ type: 'draft.deleted' } & DraftDeletedEvent)
  | ({ type: 'draft.updated' } & DraftUpdatedEvent)
  | ({ type: 'health.check' } & HealthCheckEvent)
  | ({ type: 'member.added' } & MemberAddedEvent)
  | ({ type: 'member.removed' } & MemberRemovedEvent)
  | ({ type: 'member.updated' } & MemberUpdatedEvent)
  | ({ type: 'message.deleted' } & MessageDeletedEvent)
  | ({ type: 'message.delivered' } & MessageDeliveredEvent)
  | ({ type: 'message.new' } & MessageNewEvent)
  | ({ type: 'message.pending' } & PendingMessageEvent)
  | ({ type: 'message.read' } & MessageReadEvent)
  | ({ type: 'message.undeleted' } & MessageUndeletedEvent)
  | ({ type: 'message.updated' } & MessageUpdatedEvent)
  | ({ type: 'moderation.custom_action' } & ModerationCustomActionEvent)
  | ({ type: 'moderation.flagged' } & ModerationFlaggedEvent)
  | ({ type: 'moderation.mark_reviewed' } & ModerationMarkReviewedEvent)
  | ({ type: 'notification.added_to_channel' } & NotificationAddedToChannelEvent)
  | ({ type: 'notification.channel_deleted' } & NotificationChannelDeletedEvent)
  | ({
      type: 'notification.channel_mutes_updated';
    } & NotificationChannelMutesUpdatedEvent)
  | ({ type: 'notification.channel_truncated' } & NotificationChannelTruncatedEvent)
  | ({ type: 'notification.invite_accepted' } & NotificationInviteAcceptedEvent)
  | ({ type: 'notification.invite_rejected' } & NotificationInviteRejectedEvent)
  | ({ type: 'notification.invited' } & NotificationInvitedEvent)
  | ({ type: 'notification.mark_read' } & NotificationMarkReadEvent)
  | ({ type: 'notification.mark_unread' } & NotificationMarkUnreadEvent)
  | ({ type: 'notification.message_new' } & NotificationNewMessageEvent)
  | ({ type: 'notification.mutes_updated' } & NotificationMutesUpdatedEvent)
  | ({ type: 'notification.reminder_due' } & ReminderNotificationEvent)
  | ({ type: 'notification.removed_from_channel' } & NotificationRemovedFromChannelEvent)
  | ({ type: 'notification.thread_message_new' } & NotificationThreadMessageNewEvent)
  | ({ type: 'poll.closed' } & PollClosedEvent)
  | ({ type: 'poll.deleted' } & PollDeletedEvent)
  | ({ type: 'poll.updated' } & PollUpdatedEvent)
  | ({ type: 'poll.vote_casted' } & PollVoteCastedEvent)
  | ({ type: 'poll.vote_changed' } & PollVoteChangedEvent)
  | ({ type: 'poll.vote_removed' } & PollVoteRemovedEvent)
  | ({ type: 'reaction.deleted' } & ReactionDeletedEvent)
  | ({ type: 'reaction.new' } & ReactionNewEvent)
  | ({ type: 'reaction.updated' } & ReactionUpdatedEvent)
  | ({ type: 'reminder.created' } & ReminderCreatedEvent)
  | ({ type: 'reminder.deleted' } & ReminderDeletedEvent)
  | ({ type: 'reminder.updated' } & ReminderUpdatedEvent)
  | ({ type: 'thread.updated' } & ThreadUpdatedEvent)
  | ({ type: 'typing.start' } & TypingStartEvent)
  | ({ type: 'typing.stop' } & TypingStopEvent)
  | ({ type: 'user.banned' } & UserBannedEvent)
  | ({ type: 'user.deactivated' } & UserDeactivatedEvent)
  | ({ type: 'user.deleted' } & UserDeletedEvent)
  | ({ type: 'user.messages.deleted' } & UserMessagesDeletedEvent)
  | ({ type: 'user.muted' } & UserMutedEvent)
  | ({ type: 'user.presence.changed' } & UserPresenceChangedEvent)
  | ({ type: 'user.reactivated' } & UserReactivatedEvent)
  | ({ type: 'user.unbanned' } & UserUnbannedEvent)
  | ({ type: 'user.updated' } & UserUpdatedEvent)
  | ({ type: 'user.watching.start' } & UserWatchingStartEvent)
  | ({ type: 'user.watching.stop' } & UserWatchingStopEvent)
  | ({ type: 'user_group.created' } & UserGroupCreatedEvent)
  | ({ type: 'user_group.deleted' } & UserGroupDeletedEvent)
  | ({ type: 'user_group.member_added' } & UserGroupMemberAddedEvent)
  | ({ type: 'user_group.member_removed' } & UserGroupMemberRemovedEvent)
  | ({ type: 'user_group.updated' } & UserGroupUpdatedEvent);

export interface WrappedUnreadCountsResponse {
  /**
   * Duration of the request in milliseconds
   */
  duration: string;

  total_unread_count: number;

  total_unread_threads_count: number;

  channel_type: Array<UnreadCountsChannelType>;

  channels: Array<UnreadCountsChannel>;

  threads: Array<UnreadCountsThread>;

  total_unread_count_by_team?: Record<string, number>;
}
