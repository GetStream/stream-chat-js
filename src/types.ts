import type { AxiosResponse } from 'axios';
import type { CustomEventTypes } from './custom_types';
import type {
  APIError,
  Attachment,
  BanRequest,
  ChannelConfigWithInfo,
  ChannelMemberRequest,
  ChannelOwnCapability,
  ChannelStateResponseFields,
  CreateDeviceRequest,
  CreatePollRequest,
  CustomEvent,
  DraftPayloadResponse,
  FlagRequest,
  Images,
  MessageRequest,
  MessageResponse,
  OwnUserResponse,
  QueryChannelsRequest,
  QueryMembersPayload,
  QueryPollsRequest,
  QueryPollVotesRequest,
  QueryReactionsRequest,
  QueryRemindersRequest,
  QueryThreadsRequest,
  QueryUsersPayload,
  ReactionResponse,
  SearchPayload,
  SendMessageRequest,
  SendMessageResponse,
  SharedLocationResponseData,
  TimestampNS,
  TranslateMessageRequest,
  UpdateChannelRequest,
  UpdateMessageRequest,
  UpdateMessageResponse,
  UpdatePollRequest,
  UserResponse,
  WSEvent,
} from './gen/models';

import type { ChatApi } from './gen-imports';

export type RequireOnlyOne<T, Keys extends keyof T = keyof T> = Omit<T, Keys> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Record<Exclude<Keys, K>, undefined>>;
  }[Keys];

export type RequireAtLeastOne<T> = {
  [K in keyof T]-?: Required<Pick<T, K>> & Partial<Omit<T, K>>;
}[keyof T];

/**
 * Used only by `StreamChat.unbanUser`, a hand-written `/moderation/*` call that bypasses the
 * generated client.
 */
export type APIResponse = {
  duration: string;
};

export type ChannelUpdateOptions = Omit<UpdateChannelRequest, 'message'>;

/**
 * A channel update that adds or removes items (members, invitees, filter tags): the items, a message
 * notifying the channel members, and any other `update()` option.
 */
type ChannelItemsUpdate<Key extends string, Item> = Record<Key, Item[]> & {
  /** Message object for channel members notification (optional). */
  message?: MessageRequest;
} & ChannelUpdateOptions;

/** Request of `channel.addMembers`: user ids, or member requests with a role or custom data. */
export type AddMembersRequest = ChannelItemsUpdate<
  'members',
  string | ChannelMemberRequest
>;

/** Request of `channel.inviteMembers`. */
export type InviteMembersRequest = ChannelItemsUpdate<
  'members',
  string | Required<Omit<ChannelMemberRequest, 'channel_role'>>
>;

/** Request of `channel.removeMembers`: the user ids to remove. */
export type RemoveMembersRequest = ChannelItemsUpdate<'members', string>;

/** Request of `channel.addFilterTags` and `channel.removeFilterTags`. */
export type FilterTagsRequest = ChannelItemsUpdate<'tags', string>;

export type ConnectAPIResponse = Promise<void | ConnectionOpen>;

export type LocalMessage = MessageResponse & {
  status: string;
  error?: StreamAPIError;
  user_id?: string;
};

export type GetThreadOptions = NonNullable<Parameters<ChatApi['getThread']>[1]>;

/** Options of `client.pinMessage`. */
export type PinMessageOptions = {
  /** When the pin expires; `null` or leaving it out pins without expiry. */
  pin_expires?: Date | string | null;
  /** The pin time, which orders the pinned messages (defaults to now). */
  pinned_at?: Date | string;
};

/**
 * The fields of `OwnUserResponse` that a plain `UserResponse` lacks. `client._handleUserEvent` uses
 * it (through `isOwnUserBaseProperty`) to decide which keys survive a `user.updated` event.
 */
export type OwnUserBase = Pick<
  OwnUserResponse,
  Exclude<keyof OwnUserResponse, keyof UserResponse>
>;

export type BanUserOptions = Omit<BanRequest, 'target_user_id'>;

/**
 * Everything `queryChannels()` accepts apart from the filter and the sort.
 *
 * `predefined_filter` names a backend filter template, interpolated with `filter_values`. If that
 * template has its own stored sort, it wins over the request `sort` and `sort_values` fills its
 * placeholders; otherwise the request `sort` is used. `filter_values` and `sort_values` are sent
 * only when `predefined_filter` is set.
 */
export type ChannelOptions = Omit<QueryChannelsRequest, 'filter_conditions' | 'sort'>;

export type ChannelStateOptions = {
  offlineMode?: boolean;
  skipInitialization?: string[];
  skipHydration?: boolean;
  /**
   * Makes `queryChannelsAndHydrate()` return the full query response (with hydrated `channels`,
   * plus metadata such as `predefined_filter`) instead of `Channel[]`.
   */
  withResponse?: boolean;
};

/** The channel-type automod mode, as reported by `channel.getConfig()`. */
export type Automod = ChannelConfigWithInfo['automod'];
/** What automod does when it trips, as reported by `channel.getConfig()`. */
export type AutomodBehavior = ChannelConfigWithInfo['automod_behavior'];

export type PinnedMessagePaginationOptions = Omit<
  NonNullable<Parameters<ChatApi['getPinnedMessages']>[1]>,
  'sort'
>;

export type QueryMembersOptions = Partial<Omit<QueryMembersPayload, 'filter_conditions'>>;

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

/**
 * Which connection a status refers to: `'network'` is the device's network (reported by the
 * platform reporter installed on `client.networkConnection`), `'ws'` is this client's WebSocket.
 * They can disagree, so each has its own store.
 */
export type ConnectionType = 'network' | 'ws';

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
  | { type: 'connection.recovered' }
  // `enableWSFallback` switched from the WebSocket to long-polling.
  | ({ type: 'connection.fallback_activated' } & { mode: string })
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
      created_at: TimestampNS;
      channel_id?: string;
      last_read_message_id?: string;
      team?: string;
      user?: UserResponse;
    })
) & { received_at?: TimestampNS };

// Two WS events miss `received_at` in API spec, so we add it to typedef here
export type Event =
  | (WSEvent & { received_at?: TimestampNS })
  | LocalEvent
  | CustomEventTypeUnion;

// One member per key augmented into `CustomEventTypes`; `never` when none are declared.
type CustomEventTypeUnion = {
  [K in keyof CustomEventTypes]: { type: K } & Omit<CustomEvent, 'type'> & {
      received_at?: TimestampNS;
    };
}[keyof CustomEventTypes];
export type EventType = Event['type'] | 'all';

/**
 * A listener for events of type `T`. `'all'` (the default) receives every event, any other type the
 * event members declaring it. Custom event types have to be declared by augmenting
 * `CustomEventTypes`; an undeclared name is not an `EventType`.
 */
export type EventHandler<T extends EventType = 'all'> = (
  event: T extends 'all' ? Event : Extract<Event, { type: T }>,
) => void;

export type ReactionFilters = NonNullable<QueryReactionsRequest['filter']>;

export type ChannelFilters = NonNullable<QueryChannelsRequest['filter_conditions']>;

export type QueryPollsOptions = Omit<QueryPollsRequest, 'filter' | 'sort'>;

export type QueryVotesOptions = Omit<QueryPollVotesRequest, 'filter' | 'sort'>;

export type QueryPollsFilters = NonNullable<QueryPollsRequest['filter']>;

export type QueryVotesFilters = NonNullable<QueryPollVotesRequest['filter']>;

export type MessageFilters = NonNullable<SearchPayload['message_filter_conditions']>;

export type UserFilters = QueryUsersPayload['filter_conditions'];

export type MemberFilters = QueryMembersPayload['filter_conditions'];

export type OGAttachment = RequireLiteral<Attachment, 'og_scrape_url'>;

export type PushProvider = CreateDeviceRequest['push_provider'];

/**
 * Server-provided channel configuration, keyed by cid (`messaging:general`). Keyed per channel
 * because a channel's `config_overrides` can narrow its type's config. Read it via
 * `channel.serverConfig`.
 */
export type Configs = Record<string, ChannelConfigWithInfo | undefined>;

export type ConnectionOpen = EventPayload<'health.check'> | EventPayload<'connection.ok'>;

/**
 * The message `type` values the server can return (`MessageResponse['type']` is a bare `string`).
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
      /** Stream error code (`APIError.code`) */
      code: StreamAPIError<T>['code'];
      /** HTTP status code */
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

export type VotingVisibility = NonNullable<CreatePollRequest['voting_visibility']>;

export type PartialPollUpdate = {
  set?: Partial<UpdatePollRequest>;
  unset?: Array<keyof UpdatePollRequest>;
};

/** Options of `moderation.flagUser` / `moderation.flagMessage` besides the entity and `reason`. */
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

/** The downstream SDK using stream-chat, used to resolve the user agent. */
export type SdkIdentifier = {
  name: 'react' | 'react-native' | 'expo' | 'angular';
  version: string;
};

/** The downstream device, used by the React Native SDKs to enrich the user agent. */
export type DeviceIdentifier = { os: string; model?: string };

/**
 * The downstream app: `name` is reported as `app` and `version` as `app_version` in the user agent.
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

export type DeleteMessageOptions = NonNullable<Parameters<ChatApi['deleteMessage']>[1]>;
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
 * Structural subset of axios' `AxiosProgressEvent`, so the public surface does not depend on axios.
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
  /** Milliseconds before this request is aborted. */
  timeout?: number;
};

export * from './gen/models';
