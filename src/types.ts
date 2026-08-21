import type { AxiosRequestConfig, AxiosResponse } from 'axios';
import type { StableWSConnection } from './connection';
import type { CustomEventTypes } from './custom_types';
import type { NotificationManager } from './notifications';
import type { InstanceConfigTree } from './configuration/types';
import type { DeepPartial } from './types.utility';
import type {
  APIError,
  Attachment,
  BanRequest,
  ChannelConfigWithInfo,
  ChannelOwnCapability,
  ChannelStateResponseFields,
  CreateDeviceRequest,
  CreatePollRequest,
  DraftPayloadResponse,
  FlagRequest,
  Images,
  MessageResponse,
  OwnUserResponse,
  QueryChannelsRequest,
  QueryMembersPayload,
  QueryPollsRequest,
  QueryPollVotesRequest,
  QueryRemindersRequest,
  QueryThreadsRequest,
  QueryUsersPayload,
  ReactionResponse,
  SearchPayload,
  SendMessageRequest,
  SendMessageResponse,
  SharedLocationResponseData,
  TranslateMessageRequest,
  UpdateChannelRequest,
  UpdateMessageRequest,
  UpdateMessageResponse,
  UpdatePollRequest,
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

/**
 * Legacy response envelope. Every generated response already carries `duration`, and the
 * transport wraps results in `StreamResponse<T>`, which also carries `metadata`.
 *
 * Only still referenced by the hand-written `/moderation/*` methods on `StreamChat` that
 * bypass the generated client. Delete this together with those.
 */
export type APIResponse = {
  duration: string;
};

export type ChannelUpdateOptions = Omit<UpdateChannelRequest, 'message'>;

export type ConnectAPIResponse = Promise<void | ConnectionOpen>;

export type LocalMessage = MessageResponse & {
  status: string;
  error?: StreamAPIError;
  user_id?: string;
};

export type GetThreadOptions = Omit<Parameters<ChatApi['getThread']>[0], 'message_id'>;

/**
 * The fields that exist on the connected user (`OwnUserResponse`) but not on a plain
 * `UserResponse` — i.e. the own-user-only slice of the user object.
 *
 * Derived, never hand-listed: `client._handleUserEvent` uses this set (through
 * `isOwnUserBaseProperty`) to decide which keys survive a `user.updated` event, so a field
 * missing from it is silently deleted off `client.user`. Deriving it means a spec change
 * cannot desynchronise the two.
 */
export type OwnUserBase = Pick<
  OwnUserResponse,
  Exclude<keyof OwnUserResponse, keyof UserResponse>
>;

// Thumb URL(thumb_url) is added considering video attachments as the backend will return the thumbnail in the response.
export type BanUserOptions = Omit<BanRequest, 'target_user_id'>;

/**
 * Everything `queryChannels()` accepts apart from the filter and the sort.
 *
 * Derived from the generated request so new query options appear here automatically.
 *
 * On `predefined_filter`: the backend resolves the named filter template and interpolates it
 * with `filter_values`. A regular `sort` can still be passed, but backend precedence applies —
 * if the predefined filter has its own stored sort template that template wins and the request
 * `sort` is ignored; if it does not, the request `sort` is used. `sort_values` interpolates the
 * stored sort template's placeholders. All three are only read when `predefined_filter` is set.
 */
export type ChannelOptions = Omit<QueryChannelsRequest, 'filter_conditions' | 'sort'>;

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

/** The channel-type automod mode, as reported by `channel.getConfig()`. */
export type Automod = ChannelConfigWithInfo['automod'];
/** What automod does when it trips, as reported by `channel.getConfig()`. */
export type AutomodBehavior = ChannelConfigWithInfo['automod_behavior'];

export type PinnedMessagePaginationOptions = Omit<
  Parameters<ChatApi['getPinnedMessages']>[0],
  'id' | 'sort' | 'type'
>;

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
   * Declarative configuration for instances the SDK creates on your behalf, seeded before the client's
   * own managers are constructed.
   *
   * Equivalent to calling `client.config.set(tree)` immediately after construction, except for the
   * `client` subtree — the configuration registry is created inside the constructor, so this is the only
   * way to configure `reminders` / `notifications` before they are built.
   */
  config?: DeepPartial<InstanceConfigTree>;
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

/** Everything `queryUsers()` accepts apart from the filter and the sort. */
export type UserOptions = Omit<QueryUsersPayload, 'filter_conditions' | 'sort'>;

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

export type QueryPollsOptions = Omit<QueryPollsRequest, 'filter' | 'sort'>;

export type QueryVotesOptions = Omit<QueryPollVotesRequest, 'filter' | 'sort'>;

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

export type OGAttachment = RequireLiteral<Attachment, 'og_scrape_url'>;

export type PushProvider = CreateDeviceRequest['push_provider'];

/**
 * Server-provided channel configuration, keyed by **cid** (`messaging:general`, …). Most of
 * `ChannelConfigWithInfo` is a type-level setting, but a channel's `config_overrides` can narrow it for
 * that channel alone, so the effective answer is per channel. Read it via `channel.serverConfig`.
 */
export type Configs = Record<string, ChannelConfigWithInfo | undefined>;

export type ConnectionOpen = EventPayload<'health.check'> | EventPayload<'connection.ok'>;

/**
 * The message `type` values the server can return.
 *
 * Hand-written because there is no generated equivalent: `MessageResponse['type']` is a bare
 * `string`, so deriving it would widen rather than narrow. Both the React and React Native
 * SDKs use this as a discriminant (RN types its SQLite message rows with it).
 */
export type MessageLabel =
  | 'deleted'
  | 'ephemeral'
  | 'error'
  | 'regular'
  | 'reply'
  | 'system';

export type SendMessageOptions = Omit<SendMessageRequest, 'message'>;

export type TokenOrProvider = null | string | TokenProvider | undefined;

export type TokenProvider = () => Promise<string>;

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

/**
 * Poll vote visibility. Derived from the generated request shape so it tracks the spec.
 */
export type VotingVisibility = NonNullable<CreatePollRequest['voting_visibility']>;

export type PartialPollUpdate = {
  set?: Partial<UpdatePollRequest>;
  unset?: Array<keyof UpdatePollRequest>;
};

/**
 * Options accepted by `moderation.flagUser` / `moderation.flagMessage` on top of the
 * entity they resolve and the `reason` they take positionally.
 */
export type ModerationFlagOptions = Omit<
  FlagRequest,
  'entity_id' | 'entity_type' | 'reason'
>;

export type AIState =
  | 'AI_STATE_IDLE'
  | 'AI_STATE_ERROR'
  | 'AI_STATE_EXTERNAL_SOURCES'
  | 'AI_STATE_THINKING'
  | 'AI_STATE_GENERATING'
  | 'AI_STATE_STOP'
  | (string & {});

export const AIStates = {
  Error: 'AI_STATE_ERROR',
  ExternalSources: 'AI_STATE_EXTERNAL_SOURCES',
  Generating: 'AI_STATE_GENERATING',
  Idle: 'AI_STATE_IDLE',
  Stop: 'AI_STATE_STOP',
  Thinking: 'AI_STATE_THINKING',
} as const satisfies Record<string, AIState>;

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

export type ThreadFilters = NonNullable<QueryThreadsRequest['filter']>;

export type CreateReminderOptions = Parameters<ChatApi['createReminder']>[0];

export type ReminderFilters = NonNullable<QueryRemindersRequest['filter']>;

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

export type PartializeAllBut<T, K extends keyof T> = {
  [P in K]-?: T[P];
} & { [P in Exclude<keyof T, K>]?: T[P] };

export type DeleteMessageOptions = Omit<Parameters<ChatApi['deleteMessage']>[0], 'id'>;
export type SendMessageAPIResponse = StreamResponse<SendMessageResponse>;
export type UpdateMessageOptions = Omit<UpdateMessageRequest, 'message'>;
export type UpdateMessageAPIResponse = StreamResponse<UpdateMessageResponse>;
/**
 * The Giphy rendition names, derived from the generated `Images` shape so the two cannot
 * drift. Consumed by the React and React Native SDKs to pick a rendition size.
 */
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
