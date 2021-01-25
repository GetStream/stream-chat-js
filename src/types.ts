import SeamlessImmutable from 'seamless-immutable';
import { AxiosRequestConfig } from 'axios';

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

export type BlockListResponse = BlockList & {
  created_at?: string;
  updated_at?: string;
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

export type ChannelResponse<
  ChannelType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType = UnknownType
> = ChannelType & {
  cid: string;
  frozen: boolean;
  id: string;
  type: string;
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

export type DeleteChannelAPIResponse<
  ChannelType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType = UnknownType
> = APIResponse & {
  channel: ChannelResponse<ChannelType, CommandType, UserType>;
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
  event: Event<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
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

export type GetChannelTypeResponse<
  CommandType extends string = LiteralStringForUnion
> = APIResponse &
  Omit<CreateChannelOptions<CommandType>, 'client_id' | 'connection_id' | 'commands'> & {
    created_at: string;
    updated_at: string;
    commands?: CommandResponse<CommandType>[];
    roles?: Record<string, ChannelRole[]>;
  };

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

export type ImmutableMessageResponse<
  AttachmentType = UnknownType,
  ChannelType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  MessageType = UnknownType,
  ReactionType = UnknownType,
  UserType = UnknownType
> = SeamlessImmutable.Immutable<
  Omit<
    MessageResponse<
      AttachmentType,
      ChannelType,
      CommandType,
      MessageType,
      ReactionType,
      UserType
    >,
    'created_at' | 'updated_at' | 'status'
  > & {
    __html: string;
    created_at: Date;
    status: string;
    updated_at: Date;
  }
>;

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
  type?: string;
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
  language?: string;
  roles?: string[];
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

export type PartialUpdateChannelAPIResponse<
  ChannelType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType = UnknownType
> = APIResponse & {
  channel: ChannelResponse<ChannelType, CommandType, UserType>;
  members: ChannelMemberResponse<UserType>[];
};

export type UpdateChannelResponse<
  CommandType extends string = LiteralStringForUnion
> = APIResponse &
  Omit<CreateChannelOptions<CommandType>, 'client_id' | 'connection_id'> & {
    created_at: string;
    updated_at: string;
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
  last_active?: string;
  online?: boolean;
  shadow_banned?: boolean;
  updated_at?: string;
};

/**
 * Option Types
 */

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

export type CreateCommandOptions<CommandType extends string = LiteralStringForUnion> = {
  description: string;
  name: CommandVariants<CommandType>;
  args?: string;
  set?: CommandVariants<CommandType>;
};

export type CreateCommandResponse<
  CommandType extends string = LiteralStringForUnion
> = APIResponse & { command: CreateCommandOptions<CommandType> & CreatedAtUpdatedAt };

export type UpdateCommandOptions<CommandType extends string = LiteralStringForUnion> = {
  description: string;
  args?: string;
  set?: CommandVariants<CommandType>;
};

export type UpdateCommandResponse<
  CommandType extends string = LiteralStringForUnion
> = APIResponse & {
  command: UpdateCommandOptions<CommandType> &
    CreatedAtUpdatedAt & {
      name: CommandVariants<CommandType>;
    };
};

export type DeleteCommandResponse<
  CommandType extends string = LiteralStringForUnion
> = APIResponse & {
  name?: CommandVariants<CommandType>;
};

export type GetCommandResponse<
  CommandType extends string = LiteralStringForUnion
> = APIResponse & CreateCommandOptions<CommandType> & CreatedAtUpdatedAt;

export type ListCommandsResponse<
  CommandType extends string = LiteralStringForUnion
> = APIResponse & {
  commands: Array<CreateCommandOptions<CommandType> & CreatedAtUpdatedAt>;
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
  reactions?: boolean;
  read_events?: boolean;
  replies?: boolean;
  search?: boolean;
  typing_events?: boolean;
  uploads?: boolean;
  url_enrichment?: boolean;
};

export type CustomPermissionOptions = {
  name: string;
  resource: Resource;
  condition?: string;
  owner?: boolean;
  same_team?: boolean;
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
  created_at_after?: string | Date | SeamlessImmutable.ImmutableDate;
  created_at_after_or_equal?: string | Date | SeamlessImmutable.ImmutableDate;
  created_at_before?: string | Date | SeamlessImmutable.ImmutableDate;
  created_at_before_or_equal?: string | Date | SeamlessImmutable.ImmutableDate;
  id_gt?: string;
  id_gte?: string;
  id_lt?: string;
  id_lte?: string;
  limit?: number;
  offset?: number;
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
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  type: EventTypes;
  channel?: ChannelResponse<ChannelType, CommandType, UserType>;
  channel_id?: string;
  channel_type?: string;
  cid?: string;
  clear_history?: boolean;
  connection_id?: string;
  created_at?: string;
  me?: OwnUserResponse<ChannelType, CommandType, UserType>;
  member?: ChannelMemberResponse<UserType>;
  message?: MessageResponse<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  >;
  online?: boolean;
  parent_id?: string;
  reaction?: ReactionResponse<ReactionType, UserType>;
  received_at?: string | Date;
  total_unread_count?: number;
  unread_channels?: number;
  unread_count?: number;
  user?: UserResponse<UserType>;
  user_id?: string;
  watcher_count?: number;
};

export type EventHandler<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = (
  event: Event<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >,
) => void;

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

export type ExportChannelRequest = {
  id: string;
  type: string;
  messages_since?: Date;
  messages_until?: Date;
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

export type Mute<UserType = UnknownType> = {
  created_at: string;
  target: UserResponse<UserType>;
  updated_at: string;
  user: UserResponse<UserType>;
};

export type PartialUserUpdate<UserType = UnknownType> = {
  id: string;
  set?: Partial<UserResponse<UserType>>;
  unset?: Array<keyof UserResponse<UserType>>;
};

export type PartialUpdateChannel<ChannelType = UnknownType> = {
  set?: Partial<ChannelResponse<ChannelType>>;
  unset?: Array<keyof ChannelResponse<ChannelType>>;
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

export type User<UserType = UnknownType> = UserType & {
  id: string;
  anon?: boolean;
  name?: string;
  role?: string;
  teams?: string[];
  username?: string;
};

export type TypingStartEvent = Event;
