import { ChannelFilters, MessageFilters } from './filter';
import { SearchOptions } from './option';
import {
  ChannelResponse,
  CommandResponse,
  MessageResponse,
  OwnUserResponse,
  UserResponse,
} from './response';
import { UnknownType } from './util';

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
