import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import type { StableWSConnection } from './connection';
import type {
  CustomChannelData,
  CustomCommandData,
  CustomEventTypes,
} from './custom_types';
import type { NotificationManager } from './notifications';
import type { RESERVED_UPDATED_MESSAGE_FIELDS } from './constants';
import type {
  APIError,
  Attachment,
  AutomodDetailsResponse,
  ChannelConfigWithInfo,
  ChannelInput,
  ChannelMemberResponse,
  ChannelMute,
  ChannelOwnCapability,
  ChannelResponse,
  ChannelStateResponseFields,
  CreateDeviceRequest,
  DraftPayloadResponse,
  Images,
  MessageResponse,
  ModerationPayload,
  OwnUserResponse,
  PollResponseData,
  PollVoteResponseData,
  PrivacySettingsResponse,
  PushPreferencesResponse,
  QueryChannelsRequest,
  QueryMembersPayload,
  QueryPollsRequest,
  QueryPollVotesRequest,
  QueryRemindersRequest,
  QueryThreadsRequest,
  QueryUsersPayload,
  ReactionResponse,
  SearchPayload,
  SearchWarning,
  SendMessageRequest,
  SendMessageResponse,
  SharedLocation,
  SharedLocationResponseData,
  SortParamRequest,
  TranslateMessageRequest,
  UpdateChannelRequest,
  UpdateMessageRequest,
  UpdateMessageResponse,
  UpdatePollOptionRequest,
  UpdatePollRequest,
  UserMuteResponse,
  UserResponse,
  WSEvent,
} from './gen/models';

import type { ChatApi } from './gen-imports';

/**
 * Utility Types
 */
export type RequireOnlyOne<T, Keys extends keyof T = keyof T> = Omit<T, Keys> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Record<Exclude<Keys, K>, undefined>>;
  }[Keys];

export type RequireAtLeastOne<T> = {
  [K in keyof T]-?: Required<Pick<T, K>> & Partial<Omit<T, K>>;
}[keyof T];

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
};

export type FlagDetails = {
  automod?: AutomodDetailsResponse;
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

export type ChannelUpdateOptions = Omit<UpdateChannelRequest, 'message' | 'members'>;

export type ConnectAPIResponse = Promise<void | ConnectionOpen>;

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

// TODO: Figure out a way to strongly type set and unset.
export type PartialThreadUpdate = {
  set?: Partial<Record<string, unknown>>;
  unset?: Array<string>;
};

export type GetThreadOptions = Omit<Parameters<ChatApi['getThread']>[0], 'message_id'>;

export enum Product {
  Chat = 'chat',
  Video = 'video',
  Moderation = 'moderation',
  Feeds = 'feeds',
}

export type GetRepliesAPIResponse = APIResponse & {
  messages: MessageResponse[];
};

export type MuteUserResponse = APIResponse & {
  mute?: UserMuteResponse;
  mutes?: Array<UserMuteResponse>;
  own_user?: OwnUserResponse;
  non_existing_users?: string[];
};

export type UnmuteUserResponse = APIResponse & {
  non_existing_users?: string[];
};

export type OwnUserBase = {
  channel_mutes: ChannelMute[];
  devices: Device[];
  mutes: UserMuteResponse[];
  total_unread_count: number;
  unread_channels: number;
  unread_count: number;
  unread_threads: number;
  invisible?: boolean;
  privacy_settings?: PrivacySettingsResponse;
  push_preferences?: PushPreferencesResponse;
  roles?: string[];
  total_unread_count_by_team?: Record<string, number> | null;
};

export type ReactionAPIResponse = APIResponse & {
  message: MessageResponse;
  reaction: ReactionResponse;
};

export type SearchAPIResponse = APIResponse & {
  results: {
    message: MessageResponse;
  }[];
  next?: string;
  previous?: string;
  results_warning?: SearchWarning | null;
};

// Thumb URL(thumb_url) is added considering video attachments as the backend will return the thumbnail in the response.
export type SendFileAPIResponse = APIResponse & { file: string; thumb_url?: string };

export type UpdateChannelAPIResponse = APIResponse & {
  channel: ChannelResponse;
  members: ChannelMemberResponse[];
  message?: MessageResponse;
};

export type UsersAPIResponse = APIResponse & {
  users: Array<UserResponse>;
  membership_deletion_task_id?: string;
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

export type PinnedMessagePaginationOptions = Omit<
  Parameters<ChatApi['getPinnedMessages']>[0],
  'id' | 'member_custom_include' | 'sort' | 'type'
>;

export type GetRepliesRequest = Parameters<ChatApi['getReplies']>[0];
export type QueryMembersOptions = Partial<Omit<QueryMembersPayload, 'filter_conditions'>>;

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
  /**
   * When true, maintains a client-local unread count on channels that have read events disabled
   * (e.g. livestreams). The count increments on incoming messages and is reset via
   * `channel.markReadLocally()`. It is never sent to the backend, but is persisted to the offline DB.
   */
  isLocalUnreadCountEnabled?: boolean;
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
   * Overrides the `WebSocket` constructor used by `StableWSConnection`. Intended purely for
   * testing so a mock/drivable WebSocket can be swapped in; production code should leave this
   * unset and rely on the platform's global `WebSocket`.
   */
  WebSocketImpl?: typeof WebSocket;
  /**
   * Sets a suffix to the wsUrl when it is being built in `wsConnection`. Is meant to be
   * used purely in testing suites and should not be used in production apps.
   */
  wsUrlParams?: URLSearchParams;
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
      live_location?: SharedLocationResponseData;
    })
  | ({ type: 'channels.queried' } & {
      queriedChannels: {
        channels: ChannelStateResponseFields[];
        isLatestMessageSet: boolean;
      };
    })
  | ({ type: 'connection.changed' } & { online: boolean })
  | { type: 'connection.recovered' }
  | ({ type: 'offline_reactions.queried' } & {
      offlineReactions: ReactionResponse[];
    })
  | ({ type: 'capabilities.changed' } & {
      cid: string;
      own_capabilities: ChannelOwnCapability[];
    })
  | ({ type: 'message.read_locally' } & {
      channel_type: string;
      cid: string;
      created_at: Date;
      channel_id?: string;
      last_read_message_id?: string;
      team?: string;
      user?: UserResponse;
    })
) & { received_at?: Date };

/**
 * The hello event of the `/api/v2/connect` WebSocket endpoint, sent once the auth frame
 * has been accepted. The v1 endpoint used `health.check` for this instead.
 *
 * Hand-written because the event is not published in the OpenAPI spec, so it cannot
 * come from `src/gen`. Remove this — along with the `decodeConnectionEvent` shim in
 * `connection.ts` — once the backend adds it to the spec and `src/gen` is regenerated.
 */
export type ConnectedEvent = {
  type: 'connection.ok';
  connection_id: string;
  created_at: Date;
  me: OwnUserResponse;
  received_at?: Date;
};

export type Event = WSEvent | ConnectedEvent | LocalEvent | keyof CustomEventTypes;
export type EventType = Event['type'] | 'all';

export type EventHandler<T = string> = (event: Extract<Event, { type: T }>) => void;

/**
 * Filter Types
 */

export type ReactionFilters = NonNullable<QueryReactionsRequestWithId['filter']>;

export type QueryReactionsRequestWithId = Parameters<ChatApi['queryReactions']>[0];

export type ChannelFilters = NonNullable<QueryChannelsRequest['filter_conditions']>;

export type QueryPollsOptions = Pager;

export type VotesFiltersOptions = {
  is_answer?: boolean;
  option_id?: string;
  user_id?: string;
};

export type QueryVotesOptions = Pager;

export type QueryPollsFilters = NonNullable<QueryPollsRequest['filter']>;

export type QueryVotesFilters = NonNullable<QueryPollVotesRequest['filter']>;

export type MessageFilters = NonNullable<SearchPayload['message_filter_conditions']>;

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

export type UserFilters = QueryUsersPayload['filter_conditions'];

export type MemberFilters = QueryMembersPayload['filter_conditions'];

/**
 * Sort Types
 */

export type BannedUsersSort = SortParamRequest[];

export type ReactionSort = SortParamRequest[];

export type ChannelSort = SortParamRequest[];

export type PinnedMessagesSort = SortParamRequest[];

export type UserSort = SortParamRequest[];

export type MemberSort = SortParamRequest[];

export type SearchMessageSort = SortParamRequest[];

export type DraftSort = SortParamRequest[];

export type PollSort = SortParamRequest[];

export type VoteSort = SortParamRequest[];

/**
 * Base Types
 */

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

// export type Attachment = ReplacePropertyTypes<
//   Attachment,
//   { custom: CustomAttachmentData & { file_size?: number; mime_type?: string } }
// >;

export type OGAttachment = RequireLiteral<Attachment, 'og_scrape_url'>;

export type BlockList = {
  name: string;
  words: string[];
  team?: string;
  type?: string;
  validate?: boolean;
  is_confusable_folding_enabled?: boolean;
  is_leet_check_enabled?: boolean;
  is_plural_check_enabled?: boolean;
};

export type ChannelData = ReplacePropertyTypes<
  ChannelInput,
  { custom: CustomChannelData }
>;

export type PushProvider = CreateDeviceRequest['push_provider'];

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

export type ConnectionOpen = EventPayload<'health.check'> | EventPayload<'connection.ok'>;

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

export type MessageLabel =
  | 'deleted'
  | 'ephemeral'
  | 'error'
  | 'regular'
  | 'reply'
  | 'system';

export type SendMessageOptions = Omit<SendMessageRequest, 'message'>;

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

export type TaskResponse = {
  task_id: string;
};

export type Pager = {
  limit?: number;
  next?: string;
  prev?: string;
};

export type MessageSetType = 'latest' | 'current' | 'new';

export class StreamAPIError<T = APIError> extends Error {
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

export type PollResponse_old = PollResponseData & PollEnrichData;

export enum VotingVisibility {
  anonymous = 'anonymous',
  public = 'public',
}

export type PollEnrichData = {
  answers_count: number;
  latest_answers: PollVoteResponseData[]; // not updated with WS events, ordered DESC by created_at, seems like updated_at cannot be different from created_at
  latest_votes_by_option: Record<string, PollVoteResponseData[]>; // not updated with WS events; always null in anonymous polls
  vote_count: number;
  vote_counts_by_option: Record<string, number>;
  own_votes?: PollVoteResponseData[]; // not updated with WS events
};

export type PartialPollUpdate = {
  set?: Partial<UpdatePollRequest>;
  unset?: Array<keyof UpdatePollRequest>;
};

export type PollOptionData = UpdatePollOptionRequest & {
  position?: number;
};

export type MessageDeletionStrategy = 'soft' | 'hard' | 'pruning';
// @deprecated use type MessageDeletionStrategy instead

export type ModerationFlagOptions = {
  custom?: Record<string, unknown>;
  moderation_payload?: ModerationPayload;
  user_id?: string;
};

export type AIState =
  | 'AI_STATE_ERROR'
  | 'AI_STATE_CHECKING_SOURCES'
  | 'AI_STATE_THINKING'
  | 'AI_STATE_GENERATING'
  | (string & {});

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

/**
 * An identifier containing information about the downstream application integrating
 * stream-chat, if available. `name` is reported as `app` and `version` as `app_version`
 * in the user agent. Distinct from the SDK ({@link SdkIdentifier}) and device
 * ({@link DeviceIdentifier}) identifiers.
 */
export type AppIdentifier = { name: string; version?: string };

export type DraftMessage = DraftPayloadResponse &
  Partial<
    Pick<
      MessageResponse,
      | 'shared_location'
      | 'mentioned_channel'
      | 'mentioned_group_ids'
      | 'mentioned_groups'
      | 'mentioned_here'
      | 'mentioned_roles'
    >
  >;

export type SharedLiveLocationResponse = RequireLiteral<
  SharedLocationResponseData,
  'end_at'
>;

export type LiveLocationPayload = RequireLiteral<SharedLocation, 'end_at'>;

export type ThreadSort = SortParamRequest[];

export type ThreadFilters = NonNullable<QueryThreadsRequest['filter']>;

export type CreateReminderOptions = Parameters<ChatApi['createReminder']>[0];

export type ReminderFilters = NonNullable<QueryRemindersRequest['filter']>;

export type ReminderSort = SortParamRequest[];

export type ListUserGroupsOptions = NonNullable<Parameters<ChatApi['listUserGroups']>[0]>;

export type SearchUserGroupsOptions = Parameters<ChatApi['searchUserGroups']>[0];

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

export type EventPayload<T extends Event['type'] | (string & {})> = Extract<
  Event,
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

export type PartializeAllBut<T, K extends keyof T> = {
  [P in K]-?: T[P];
} & { [P in Exclude<keyof T, K>]?: T[P] };

export type DeleteMessageOptions = Omit<Parameters<ChatApi['deleteMessage']>[0], 'id'>;
export type SendMessageAPIResponse = StreamResponse<SendMessageResponse>;
export type UpdateMessageOptions = Omit<UpdateMessageRequest, 'message'>;
export type UpdateMessageAPIResponse = StreamResponse<UpdateMessageResponse>;
export type GiphyVersions = keyof Images;
export type TranslationLanguage = TranslateMessageRequest['language'];

export type FileReferenceBase = {
  uri: string;
  type: string;
  name?: string;
};

export type FileUploadInput = File | Blob | FileReferenceBase | string;

/**
 * Structural subset of axios' `AxiosProgressEvent`, kept transport-agnostic on purpose so the
 * public surface does not depend on axios.
 */
export type StreamProgressEvent = {
  loaded: number;
  total?: number;
  lengthComputable?: boolean;
  progress?: number;
};

export type StreamRequestOptions = {
  signal?: AbortSignal;
  /** Only meaningful for upload (multipart) requests; ignored everywhere else. */
  onUploadProgress?: (event: StreamProgressEvent) => void;
};

export * from './gen/models';
