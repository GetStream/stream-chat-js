import {
  LiteralStringForUnion,
  ChannelConfigAutomod,
  ChannelConfigAutomodBehavior,
  CommandVariants,
  FileUploadConfig,
  Policy,
  APNConfig,
  FirebaseConfig,
  BlockList,
  TranslationLanguages,
  ChannelConfigWithInfo,
  ChannelMembership,
  CreatedAtUpdatedAt,
  ConnectionOpen,
  ChannelRole,
  RateLimitsMap,
  ChannelMute,
  MessageBase,
  MessageLabel,
  Mute,
  Device,
  PermissionAPIObject,
  Reaction,
  User,
} from './base';

import { UnknownType, RequireAtLeastOne } from './util';

import {
  CreateChannelOptions,
  CreateCommandOptions,
  UpdateCommandOptions,
} from './option';

import { Event } from './event';

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
    enforce_unique_usernames?: string;
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
  UserType extends UnknownType = UnknownType,
  AllowNarrowingEvents extends boolean = false
> = APIResponse & {
  event: Event<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType,
    AllowNarrowingEvents
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
