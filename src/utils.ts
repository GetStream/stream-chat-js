import FormData from 'form-data';
import type {
  ChannelFilters,
  ChannelGetOrCreateRequest,
  ChannelSort,
  ChannelStateResponse,
  LocalMessage,
  MessageRequest,
  MessageResponse,
  OwnUserBase,
  OwnUserResponse,
  PromoteChannelParams,
  ReactionGroupResponse,
  ReactionResponse,
  UpdatedMessage,
  UserResponse,
} from './types';
import type { StreamChat } from './client';
import type { Channel } from './channel';
import type { AxiosRequestConfig } from 'axios';
import { LOCAL_MESSAGE_FIELDS, RESERVED_UPDATED_MESSAGE_FIELDS } from './constants';
import { chatLoggerSystem } from './logger';

const logger = chatLoggerSystem.getLogger('utils');

/**
 * Logs the execution of a promise. Use this when you want to run the promise and handle errors by
 * logging a warning.
 *
 * @param promise - The promise you want to run and log.
 * @param name - A descriptive name of what the promise does for log output.
 */
export function logChatPromiseExecution<T>(promise: Promise<T>, name: string) {
  promise.then().catch((error) => {
    logger
      .withExtraTags('logChatPromiseExecution')
      .error(`Failed to execute "${name}".`, { error });
  });
}

export const sleep = (m: number): Promise<void> => new Promise((r) => setTimeout(r, m));

export function isFunction(value: unknown): value is (...args: unknown[]) => unknown {
  return (
    typeof value === 'function' ||
    value instanceof Function ||
    Object.prototype.toString.call(value) === '[object Function]'
  );
}

export const chatCodes = {
  TOKEN_EXPIRED: 40,
  WS_CLOSED_SUCCESS: 1000,
};

function isReadableStream(obj: unknown): obj is NodeJS.ReadStream {
  return (
    obj !== null &&
    typeof obj === 'object' &&
    ((obj as NodeJS.ReadStream).readable ||
      typeof (obj as NodeJS.ReadStream)._read === 'function')
  );
}

function isBuffer(obj: unknown): obj is Buffer {
  return (
    obj != null &&
    (obj as Buffer).constructor != null &&
    // @ts-expect-error expected
    typeof obj.constructor.isBuffer === 'function' &&
    // @ts-expect-error expected
    obj.constructor.isBuffer(obj)
  );
}

function isFileWebAPI(uri: unknown): uri is File {
  return typeof window !== 'undefined' && 'File' in window && uri instanceof File;
}

export function isOwnUser(
  user?: OwnUserResponse | UserResponse,
): user is OwnUserResponse {
  return (user as OwnUserResponse)?.total_unread_count !== undefined;
}

function isBlobWebAPI(uri: unknown): uri is Blob {
  return typeof window !== 'undefined' && 'Blob' in window && uri instanceof Blob;
}

export function isOwnUserBaseProperty(property: string) {
  const ownUserBaseProperties: {
    [Property in keyof Required<OwnUserBase>]: boolean;
  } = {
    channel_mutes: true,
    devices: true,
    mutes: true,
    total_unread_count: true,
    unread_channels: true,
    unread_count: true,
    unread_threads: true,
    invisible: true,
    privacy_settings: true,
    roles: true,
    push_preferences: true,
    total_unread_count_by_team: true,
  };

  return ownUserBaseProperties[property as keyof OwnUserBase];
}

/**
 * channelHasReadEvents - Whether read events are enabled for the current user on a channel.
 */
export const channelHasReadEvents = (channel?: Channel) => {
  const ownCapabilities = channel?.data?.own_capabilities;
  return !(Array.isArray(ownCapabilities) && !ownCapabilities.includes('read-events'));
};

/**
 * channelTracksReadLocally - Whether a channel maintains a client local unread count.
 */
export const channelTracksReadLocally = (channel?: Channel) =>
  !channelHasReadEvents(channel) &&
  !!channel?.getClient().options.isLocalUnreadCountEnabled;

/**
 * userHasReadReceipts - Whether the current user allows read receipts, per their privacy settings.
 * Read receipts are treated as enabled unless the user has explicitly disabled them.
 */
export const userHasReadReceipts = (client: StreamChat) =>
  client.user?.privacy_settings?.read_receipts?.enabled ?? true;

export function addFileToFormData(
  uri: string | NodeJS.ReadableStream | Buffer | File,
  name?: string,
  contentType?: string,
) {
  const data = new FormData();

  if (isReadableStream(uri) || isBuffer(uri) || isFileWebAPI(uri) || isBlobWebAPI(uri)) {
    if (name) data.append('file', uri, name);
    else data.append('file', uri);
  } else {
    data.append('file', {
      uri,
      name: name || (uri as string).split('/').reverse()[0],
      contentType: contentType || undefined,
      type: contentType || undefined,
    });
  }

  return data;
}

/**
 * retryInterval - A retry interval which increases acc to number of failures
 *
 * @returns Duration to wait in milliseconds
 */
export function retryInterval(numberOfFailures: number) {
  // try to reconnect in 0.25-25 seconds (random to spread out the load from failures)
  const max = Math.min(500 + numberOfFailures * 2000, 25000);
  const min = Math.min(Math.max(250, (numberOfFailures - 1) * 2000), 25000);
  return Math.floor(Math.random() * (max - min) + min);
}

export function randomId() {
  return generateUUIDv4();
}

function hex(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, '0');
  }
  return s;
}

// https://tools.ietf.org/html/rfc4122
export function generateUUIDv4() {
  const bytes = getRandomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40; // version
  bytes[8] = (bytes[8] & 0xbf) | 0x80; // variant

  return (
    hex(bytes.subarray(0, 4)) +
    '-' +
    hex(bytes.subarray(4, 6)) +
    '-' +
    hex(bytes.subarray(6, 8)) +
    '-' +
    hex(bytes.subarray(8, 10)) +
    '-' +
    hex(bytes.subarray(10, 16))
  );
}

function getRandomValuesWithMathRandom(bytes: Uint8Array): void {
  const max = Math.pow(2, (8 * bytes.byteLength) / bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.random() * max;
  }
}
declare const msCrypto: Crypto;

const getRandomValues = (() => {
  if (typeof crypto !== 'undefined' && typeof crypto?.getRandomValues !== 'undefined') {
    return crypto.getRandomValues.bind(crypto);
  } else if (typeof msCrypto !== 'undefined') {
    return msCrypto.getRandomValues.bind(msCrypto);
  } else {
    return getRandomValuesWithMathRandom;
  }
})();

function getRandomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  getRandomValues(bytes);
  return bytes;
}

export function convertErrorToJson(err: Error) {
  const jsonObj = {} as Record<string, unknown>;

  if (!err) return jsonObj;

  try {
    Object.getOwnPropertyNames(err).forEach((key) => {
      jsonObj[key] = Object.getOwnPropertyDescriptor(err, key);
    });
  } catch (_) {
    return {
      error: 'failed to serialize the error',
    };
  }

  return jsonObj;
}

/**
 * isOnline safely return the navigator.online value for browser env
 * if navigator is not in global object, it always return true
 */
export function isOnline() {
  const nav =
    typeof navigator !== 'undefined'
      ? navigator
      : typeof window !== 'undefined' && window.navigator
        ? window.navigator
        : undefined;

  if (!nav) {
    logger
      .withExtraTags('isOnline')
      .warn('Could not access window.navigator; assuming the browser is online.');
    return true;
  }

  // RN navigator has undefined for onLine
  if (typeof nav.onLine !== 'boolean') {
    return true;
  }

  return nav.onLine;
}

/**
 * listenForConnectionChanges - Adds an event listener fired on browser going online or offline
 */
export function addConnectionEventListeners(cb: (e: Event) => void) {
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('offline', cb);
    window.addEventListener('online', cb);
  }
}

export function removeConnectionEventListeners(cb: (e: Event) => void) {
  if (typeof window !== 'undefined' && window.removeEventListener) {
    window.removeEventListener('offline', cb);
    window.removeEventListener('online', cb);
  }
}

export const axiosParamsSerializer: AxiosRequestConfig['paramsSerializer'] = (params) => {
  const newParams = [];
  for (const k in params) {
    // Stream backend doesn't treat "undefined" value same as value not being present.
    // So, we need to skip the undefined values.
    if (params[k] === undefined) continue;

    if (Array.isArray(params[k]) || typeof params[k] === 'object') {
      newParams.push(`${k}=${encodeURIComponent(JSON.stringify(params[k]))}`);
    } else {
      newParams.push(`${k}=${encodeURIComponent(params[k])}`);
    }
  }

  return newParams.join('&');
};

/**
 * Takes the message object, adds SDK-specific fields (status, error),
 * and returns a new LocalMessage object.
 *
 * @param message - message object
 */
export function formatMessage(message: MessageResponse | LocalMessage): LocalMessage {
  const toLocalMessageBase = (
    msg: MessageResponse | LocalMessage | null | undefined,
  ): LocalMessage | null => {
    if (!msg) return null;
    return {
      ...msg,
      created_at: msg.created_at ? new Date(msg.created_at) : new Date(),
      deleted_at: msg.deleted_at ? new Date(msg.deleted_at) : undefined,
      pinned_at: msg.pinned_at ? new Date(msg.pinned_at) : undefined,
      reaction_groups: maybeGetReactionGroupsFallback(
        msg.reaction_groups,
        msg.reaction_counts,
        msg.reaction_scores,
      ),
      status: (msg as LocalMessage).status || 'received',
      updated_at: msg.updated_at ? new Date(msg.updated_at) : new Date(),
    };
  };

  return {
    ...toLocalMessageBase(message),
    error: (message as LocalMessage).error ?? undefined,
    quoted_message:
      toLocalMessageBase((message as MessageResponse).quoted_message) ?? undefined,
  } as LocalMessage;
}

/**
 * Computes the current user's `own_reactions` after applying a single reaction change, off a
 * `current` base. A WS reaction/edit event carries `own_reactions: []` (or stale), so consumers
 * must recompute from the copy they already hold rather than trusting the event — this is the
 * shared core used by both the message paginator (`reflectReaction`) and the thread's parent
 * message (which is not held in any paginator, so it needs the same logic directly).
 *
 * - `removed`: drop the current user's reaction of this type.
 * - `enforceUnique`: replace any existing own reaction with the incoming one (used by
 *   `reaction.updated`, where a user's reaction supersedes their previous one).
 * - otherwise: add the reaction, de-duped by type.
 *
 * A reaction by another user never changes the current user's `own_reactions`.
 */
export function computeOwnReactions({
  current,
  enforceUnique = false,
  reaction,
  removed = false,
  userId,
}: {
  current: ReactionResponse[];
  reaction: ReactionResponse;
  enforceUnique?: boolean;
  removed?: boolean;
  userId?: string;
}): ReactionResponse[] {
  const withoutType = current.filter(
    (r) => r.user_id !== reaction.user_id || r.type !== reaction.type,
  );
  if (removed) return withoutType;
  if (userId !== reaction.user_id) return withoutType;
  return enforceUnique ? [reaction] : [...withoutType, reaction];
}

/**
 * Returns a copy of `message` with `reaction` folded into its `reaction_groups` /
 * `latest_reactions`. Does not touch `own_reactions` — the reaction entry points
 * ({@link MessageIntervalPaginator.reflectReaction} / `Thread.applyParentReactionLocally`) own that
 * via {@link computeOwnReactions}. Shared so both the paginator and the (paginator-less) thread
 * parent compute counts identically.
 */
export function messageWithReactionAdded(
  message: LocalMessage,
  reaction: ReactionResponse,
  enforceUnique: boolean,
): LocalMessage {
  const score = reaction.score ?? 1;
  const reactionGroups: Record<string, ReactionGroupResponse> = {
    ...(message.reaction_groups ?? {}),
  };

  // When enforcing uniqueness, first back the current user's existing reactions out of the groups
  if (enforceUnique) {
    for (const ownReaction of message.own_reactions ?? []) {
      const group = reactionGroups[ownReaction.type];
      if (!group) continue;
      const next = {
        ...group,
        count: group.count - 1,
        sum_scores: group.sum_scores - (ownReaction.score ?? 1),
      };
      if (next.count < 1) delete reactionGroups[ownReaction.type];
      else reactionGroups[ownReaction.type] = next;
    }
  }

  const existingGroup = reactionGroups[reaction.type];
  reactionGroups[reaction.type] = existingGroup
    ? {
        ...existingGroup,
        count: existingGroup.count + 1,
        last_reaction_at: reaction.created_at,
        sum_scores: existingGroup.sum_scores + score,
      }
    : {
        count: 1,
        first_reaction_at: reaction.created_at,
        last_reaction_at: reaction.created_at,
        latest_reactions_by: [],
        sum_scores: score,
      };

  const latestReactions = enforceUnique
    ? [
        ...(message.latest_reactions ?? []).filter((r) => r.user_id !== reaction.user_id),
        reaction,
      ]
    : [...(message.latest_reactions ?? []), reaction];

  return {
    ...message,
    latest_reactions: latestReactions,
    reaction_groups: reactionGroups,
  };
}

/**
 * Returns a copy of `message` with the current user's reaction of `reaction.type` backed out of its
 * `reaction_groups` / `latest_reactions`. Does not touch `own_reactions`.
 */
export function messageWithReactionRemoved(
  message: LocalMessage,
  reaction: ReactionResponse,
): LocalMessage {
  const reactionGroups: Record<string, ReactionGroupResponse> = {
    ...(message.reaction_groups ?? {}),
  };
  const reactionToRemove = message.own_reactions?.find((r) => r.type === reaction.type);

  if (reactionToRemove && reactionGroups[reactionToRemove.type]) {
    const group = reactionGroups[reactionToRemove.type];
    const next = {
      ...group,
      count: group.count - 1,
      sum_scores: group.sum_scores - (reactionToRemove.score ?? 1),
    };
    if (next.count < 1) delete reactionGroups[reactionToRemove.type];
    else reactionGroups[reactionToRemove.type] = next;
  }

  return {
    ...message,
    latest_reactions: message.latest_reactions?.filter(
      (r) => !(r.user_id === reaction.user_id && r.type === reaction.type),
    ),
    reaction_groups: reactionGroups,
  };
}

export const localMessageToNewMessagePayload = (
  localMessage: LocalMessage,
): MessageRequest => {
  const {
    // Remove all timestamp fields and client-specific fields.
    // Field pinned_at can therefore be earlier than created_at as new message payload can hold it.
    created_at: _created_at,
    updated_at: _updated_at,
    deleted_at: _deleted_at,
    // Client-specific fields
    error: _error,
    status: _status,
    // Reaction related fields
    latest_reactions: _latest_reactions,
    own_reactions: _own_reactions,
    reaction_counts: _reaction_counts,
    reaction_scores: _reaction_scores,
    reply_count: _reply_count,
    // MessageRequest text related fields that shouldn't be in update
    command: _command,
    html: _html,
    i18n: _i18n,
    mentioned_groups: _mentioned_groups,
    quoted_message: _quoted_message,
    mentioned_users,
    // MessageRequest content related fields
    ...messageFields
  } = localMessage;

  // `messageFields` still carries LocalMessage-only fields (cid, deleted_reply_count, mentioned_*,
  // pinned, shadowed, …) that the stricter OpenAPI `MessageRequest` omits; the server ignores them.
  return {
    ...messageFields,
    mentioned_users: mentioned_users?.map((user) => user.id),
  } as MessageRequest;
};

export const toUpdatedMessagePayload = (
  message: LocalMessage | Partial<MessageResponse>,
): UpdatedMessage => {
  const reservedKeys = {
    ...RESERVED_UPDATED_MESSAGE_FIELDS,
    ...LOCAL_MESSAGE_FIELDS,
  } as const;

  const messageFields = Object.fromEntries(
    Object.entries(message).filter(
      ([key]) => !reservedKeys[key as keyof typeof reservedKeys],
    ),
  ) as UpdatedMessage;

  return {
    ...messageFields,
    pinned: !!message.pinned_at,
    mentioned_users: message.mentioned_users?.map((user) =>
      typeof user === 'string' ? user : user.id,
    ),
  };
};

export const toDeletedMessage = ({
  message,
  deletedAt,
  hardDelete = false,
}: {
  message: LocalMessage;
  deletedAt: LocalMessage['deleted_at'];
  hardDelete: boolean;
}) => {
  if (hardDelete) {
    /**
     * In case of hard delete, we need to strip down all text, html, attachments and all the custom properties on message
     * The hard-deleted message is kept in the UI until the messages are re-queried
     * FIXME: we are returning an object that does not match LocalMessage
     */
    return {
      attachments: [],
      cid: message.cid,
      created_at: message.created_at,
      deleted_at: deletedAt,
      id: message.id,
      latest_reactions: [],
      mentioned_users: [],
      own_reactions: [],
      parent_id: message.parent_id,
      reply_count: message.reply_count,
      status: message.status,
      thread_participants: message.thread_participants,
      type: 'deleted' as const,
      updated_at: message.updated_at,
      user: message.user,
    };
  } else {
    return {
      ...message,
      attachments: [],
      type: 'deleted',
      deleted_at: deletedAt,
    };
  }
};

export const findIndexInSortedArray = <T, L>({
  needle,
  sortedArray,
  selectKey,
  selectValueToCompare = (e) => e,
  sortDirection = 'ascending',
}: {
  needle: T;
  sortedArray: readonly T[];
  /**
   * In an array of objects (like messages), pick a unique property identifying
   * an element. It will be used to find a direct match for the needle element
   * in case compare values are not unique.
   *
   * @example
   * ```ts
   * selectKey: (message) => message.id
   * ```
   */
  selectKey?: (arrayElement: T) => string;
  /**
   * In an array of objects (like messages), pick a specific
   * property to compare the needle value to.
   *
   * @example
   * ```ts
   * selectValueToCompare: (message) => message.created_at.getTime()
   * ```
   */
  selectValueToCompare?: (arrayElement: T) => L | T;
  /**
   * @default ascending
   * @description
   * ```md
   * ascending  - [1,2,3,4,5...]
   * descending - [...5,4,3,2,1]
   * ```
   */
  sortDirection?: 'ascending' | 'descending';
}) => {
  if (!sortedArray.length) return 0;

  let left = 0;
  let right = sortedArray.length - 1;
  let middle = 0;

  const recalculateMiddle = () => {
    middle = Math.round((left + right) / 2);
  };

  const comparableNeedle = selectValueToCompare(needle);

  while (left <= right) {
    recalculateMiddle();

    const comparableMiddle = selectValueToCompare(sortedArray[middle]);

    if (
      (sortDirection === 'ascending' && comparableNeedle < comparableMiddle) ||
      (sortDirection === 'descending' && comparableNeedle >= comparableMiddle)
    ) {
      right = middle - 1;
    } else {
      left = middle + 1;
    }
  }

  // In case there are several array elements with the same comparable value, search around the insertion
  // point to possibly find an element with the same key. If found, prefer it.
  // This, for example, prevents duplication of messages with the same creation date.
  if (selectKey) {
    const needleKey = selectKey(needle);
    const step = sortDirection === 'ascending' ? -1 : +1;
    for (
      let i = left + step;
      0 <= i &&
      i < sortedArray.length &&
      selectValueToCompare(sortedArray[i]) === comparableNeedle;
      i += step
    ) {
      if (selectKey(sortedArray[i]) === needleKey) {
        return i;
      }
    }
  }

  return left;
};

function maybeGetReactionGroupsFallback(
  groups: { [key: string]: ReactionGroupResponse } | null | undefined,
  counts: { [key: string]: number } | null | undefined,
  scores: { [key: string]: number } | null | undefined,
): { [key: string]: ReactionGroupResponse } | undefined {
  if (groups) {
    return groups;
  }

  if (counts && scores) {
    const fallback: { [key: string]: ReactionGroupResponse } = {};

    for (const type of Object.keys(counts)) {
      // Best-effort fallback derived from counts/scores; the richer OpenAPI `ReactionGroupResponse`
      // fields (first/last_reaction_at, latest_reactions_by) are not available here.
      fallback[type] = {
        count: counts[type],
        sum_scores: scores[type],
      } as ReactionGroupResponse;
    }

    return fallback;
  }

  return undefined;
}

export interface DebouncedFunc<T extends (...args: any[]) => any> {
  /**
   * Call the original function, but applying the debounce rules.
   *
   * If the debounced function can be run immediately, this calls it and returns its return
   * value.
   *
   * Otherwise, it returns the return value of the last invocation, or undefined if the debounced
   * function was not invoked yet.
   */
  (...args: Parameters<T>): ReturnType<T> | undefined;

  /**
   * Throw away any pending invocation of the debounced function.
   */
  cancel(): void;

  /**
   * If there is a pending invocation of the debounced function, invoke it immediately and return
   * its return value.
   *
   * Otherwise, return the value from the last invocation, or undefined if the debounced function
   * was never invoked.
   */
  flush(): ReturnType<T> | undefined;
}

// works exactly the same as lodash.debounce

export const debounce = <T extends (...args: any[]) => any>(
  fn: T,
  timeout = 0,
  { leading = false, trailing = true }: { leading?: boolean; trailing?: boolean } = {},
): DebouncedFunc<T> => {
  let runningTimeout: null | NodeJS.Timeout = null;
  let argsForTrailingExecution: Parameters<T> | null = null;
  let lastResult: ReturnType<T> | undefined;

  const debouncedFn = (...args: Parameters<T>) => {
    if (runningTimeout) {
      clearTimeout(runningTimeout);
    } else if (leading) {
      lastResult = fn(...args);
    }
    if (trailing) argsForTrailingExecution = args;

    const timeoutHandler = () => {
      if (argsForTrailingExecution) {
        lastResult = fn(...argsForTrailingExecution);
        argsForTrailingExecution = null;
      }
      runningTimeout = null;
    };

    runningTimeout = setTimeout(timeoutHandler, timeout);
    return lastResult;
  };

  debouncedFn.cancel = () => {
    if (runningTimeout) clearTimeout(runningTimeout);
  };

  debouncedFn.flush = () => {
    if (runningTimeout) {
      clearTimeout(runningTimeout);
      runningTimeout = null;
      if (argsForTrailingExecution) {
        lastResult = fn(...argsForTrailingExecution);
      }
    }
    return lastResult;
  };
  return debouncedFn;
};

// The single throttle implementation lives in ./utils/throttling/throttle; re-exported here so
// `import { throttle } from './utils'` keeps working (lodash.throttle-style leading/trailing).
export { throttle } from './utils/throttling/throttle';
export type {
  Throttled,
  ThrottleOptions,
  ThrottledCallback,
} from './utils/throttling/throttle';

const get = <T>(obj: T, path: string): unknown =>
  path.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in acc) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);

// works exactly the same as lodash.uniqBy
export const uniqBy = <T>(
  array: T[] | unknown,
  iteratee: ((item: T) => unknown) | keyof T,
): T[] => {
  if (!Array.isArray(array)) return [];

  const seen = new Set<unknown>();
  return array.filter((item) => {
    const key =
      typeof iteratee === 'function' ? iteratee(item) : get(item, iteratee as string);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

/**
 * A utility object used to prevent duplicate invocation of channel.watch() to be triggered when
 * 'notification.message_new' and 'notification.added_to_channel' events arrive at the same time.
 */
const WATCH_QUERY_IN_PROGRESS_FOR_CHANNEL: Record<
  string,
  Promise<ChannelStateResponse> | undefined
> = {};

type GetChannelParams = {
  client: StreamChat;
  channel?: Channel;
  id?: string;
  members?: string[];
  options?: ChannelGetOrCreateRequest;
  type?: string;
};
/**
 * Calls channel.watch() if it was not already recently called. Waits for watch promise to resolve even if it was invoked previously.
 * If the channel is not passed as a property, it will get it either by its channel.cid or by its members list and do the same.
 *
 * @param params - The channel query parameters.
 * @param params.client - The chat client instance.
 * @param params.members - Member user ids used to construct or identify the channel.
 * @param params.options - Options forwarded to the underlying channel watch request.
 * @param params.type - The channel type.
 * @param params.id - The channel id.
 * @param params.channel - An existing channel to watch (skips construction from type/id/members).
 */
export const getAndWatchChannel = async ({
  channel,
  client,
  id,
  members,
  options,
  type,
}: GetChannelParams) => {
  if (!channel && !type) {
    throw new Error('Channel or channel type have to be provided to query a channel.');
  }

  // unfortunately typescript is not able to infer that if (!channel && !type) === false, then channel or type has to be truthy

  const channelToWatch =
    channel ||
    // `members` are member IDs; the OpenAPI `ChannelData.members` expects member objects.
    client.channel(type as string, id, {
      members: members?.map((user_id) => ({ user_id })),
    });

  // need to keep as with call to channel.watch the id can be changed from undefined to an actual ID generated server-side
  const originalCid = channelToWatch.id
    ? channelToWatch.cid
    : members && members.length
      ? generateChannelTempCid(channelToWatch.type, members)
      : undefined;

  if (!originalCid) {
    throw new Error(
      'Channel ID or channel members array have to be provided to query a channel.',
    );
  }

  const queryPromise = WATCH_QUERY_IN_PROGRESS_FOR_CHANNEL[originalCid];

  if (queryPromise) {
    await queryPromise;
  } else {
    try {
      WATCH_QUERY_IN_PROGRESS_FOR_CHANNEL[originalCid] = channelToWatch.watch(options);
      await WATCH_QUERY_IN_PROGRESS_FOR_CHANNEL[originalCid];
    } finally {
      delete WATCH_QUERY_IN_PROGRESS_FOR_CHANNEL[originalCid];
    }
  }

  return channelToWatch;
};

/**
 * Generates a temporary channel.cid for channels created without ID, as they need to be referenced
 * by an identifier until the back-end generates the final ID. The cid is generated by its member IDs
 * which are sorted and can be recreated the same every time given the same arguments.
 *
 * @param channelType - The channel type.
 * @param members - The member ids used to build the temporary cid.
 */
export const generateChannelTempCid = (channelType: string, members: string[]) => {
  if (!members) return;
  const membersStr = [...members].sort().join(',');
  if (!membersStr) return;
  return `${channelType}:!members-${membersStr}`;
};

/**
 * Checks if a channel is pinned or not. Will return true only if channel.state.membership.pinned_at exists.
 *
 * @param channel - The channel to check.
 */
export const isChannelPinned = (channel: Channel) => {
  if (!channel) return false;

  const member = channel.state.membership;

  return !!member?.pinned_at;
};

/**
 * Checks if a channel is archived or not. Will return true only if channel.state.membership.archived_at exists.
 *
 * @param channel - The channel to check.
 */
export const isChannelArchived = (channel: Channel) => {
  if (!channel) return false;

  const member = channel.state.membership;

  return !!member?.archived_at;
};

/**
 * A utility that tells us whether we should consider archived channels or not based
 * on filters. Will return true only if filters.archived exists and is a boolean value.
 *
 * @param filters - The channel filters to inspect.
 */
export const shouldConsiderArchivedChannels = (filters: ChannelFilters | undefined) => {
  if (!filters) return false;

  return typeof filters.archived === 'boolean';
};

/**
 * Extracts the value of the sort parameter at a given index, for a targeted key. Can
 * handle both array and object versions of sort. Will return null if the index/key
 * combination does not exist.
 *
 * @param params - The extraction parameters.
 * @param params.atIndex - the index at which we'll examine the sort value, if it's an array one
 * @param params.sort - the sort value - both array and object notations are accepted
 * @param params.targetKey - the target key which needs to exist for the sort at a certain index
 */
export const extractSortValue = ({
  atIndex,
  sort,
  targetKey,
}: {
  atIndex: number;
  targetKey: string;
  sort?: ChannelSort;
}) => {
  if (!sort) return null;
  // `ChannelSort` is now `SortParamRequest[]` (`{ field, direction }[]`). Return the `direction` of
  // the entry at `atIndex` when its `field` matches `targetKey`, otherwise null.
  const option = sort[atIndex] ?? null;
  if (!option || option.field !== targetKey) return null;
  return option.direction ?? null;
};

/**
 * Returns true only if `{ pinned_at: -1 }` or `{ pinned_at: 1 }` option is first within the `sort` array.
 */
export const shouldConsiderPinnedChannels = (sort: ChannelSort) => {
  const value = findPinnedAtSortOrder({ sort });

  if (typeof value !== 'number') return false;

  return Math.abs(value) === 1;
};

/**
 * Checks whether the sort value of type object contains a pinned_at value or if
 * an array sort value type has the first value be an object containing pinned_at.
 *
 * @param params - The sort container.
 * @param params.sort - The sort value to inspect for a `pinned_at` order.
 */
export const findPinnedAtSortOrder = ({ sort }: { sort: ChannelSort }) =>
  extractSortValue({
    atIndex: 0,
    sort,
    targetKey: 'pinned_at',
  });

/**
 * Finds the index of the last consecutively pinned channel, starting from the start of the
 * array. Will not consider any pinned channels after the contiguous subsequence at the
 * start of the array.
 *
 * @param params - The channel list container.
 * @param params.channels - The channels to scan from the start of the array.
 */
export const findLastPinnedChannelIndex = ({ channels }: { channels: Channel[] }) => {
  let lastPinnedChannelIndex: number | null = null;

  for (const channel of channels) {
    if (!isChannelPinned(channel)) break;

    if (typeof lastPinnedChannelIndex === 'number') {
      lastPinnedChannelIndex++;
    } else {
      lastPinnedChannelIndex = 0;
    }
  }

  return lastPinnedChannelIndex;
};

/**
 * A utility used to move a channel towards the beginning of a list of channels (promote it to a higher position). It
 * considers pinned channels in the process if needed and makes sure to only update the list reference if the list
 * should actually change. It will try to move the channel as high as it can within the list.
 *
 * @param params - The promotion parameters.
 * @param params.channels - the list of channels we want to modify
 * @param params.channelToMove - the channel we want to promote
 * @param params.channelToMoveIndexWithinChannels - optionally, the index of the channel we want to move if we know it (will skip a manual check)
 * @param params.sort - the sort value used to check for pinned channels
 */
export const promoteChannel = ({
  channels,
  channelToMove,
  channelToMoveIndexWithinChannels,
  sort,
}: PromoteChannelParams) => {
  // get index of channel to move up
  const targetChannelIndex =
    channelToMoveIndexWithinChannels ??
    channels.findIndex((channel) => channel.cid === channelToMove.cid);

  const targetChannelExistsWithinList = targetChannelIndex >= 0;
  const targetChannelAlreadyAtTheTop = targetChannelIndex === 0;

  // pinned channels should not move within the list based on recent activity, channels which
  // receive messages and are not pinned should move upwards but only under the last pinned channel
  // in the list
  const considerPinnedChannels = shouldConsiderPinnedChannels(sort);
  const isTargetChannelPinned = isChannelPinned(channelToMove);

  if (targetChannelAlreadyAtTheTop || (considerPinnedChannels && isTargetChannelPinned)) {
    return channels;
  }

  const newChannels = [...channels];

  // target channel index is known, remove it from the list
  if (targetChannelExistsWithinList) {
    newChannels.splice(targetChannelIndex, 1);
  }

  // as position of pinned channels has to stay unchanged, we need to
  // find last pinned channel in the list to move the target channel after
  let lastPinnedChannelIndex: number | null = null;
  if (considerPinnedChannels) {
    lastPinnedChannelIndex = findLastPinnedChannelIndex({ channels: newChannels });
  }

  // re-insert it at the new place (to specific index if pinned channels are considered)
  newChannels.splice(
    typeof lastPinnedChannelIndex === 'number' ? lastPinnedChannelIndex + 1 : 0,
    0,
    channelToMove,
  );

  return newChannels;
};

export const isDate = (value: unknown): value is Date => !!(value as Date).getTime;

export const isLocalMessage = (message: unknown): message is LocalMessage =>
  isDate((message as LocalMessage).created_at);

export const runDetached = <T>(
  callback: Promise<void | T>,
  options?: {
    context?: string;
    onSuccessCallback?: (res: T | void) => void | Promise<void>;
    onErrorCallback?: (error: Error) => void | Promise<void>;
  },
) => {
  const { context, onSuccessCallback, onErrorCallback } = options ?? {};
  const defaultOnError = (error: Error) => {
    logger
      .withExtraTags('runDetached')
      .error(`An error occurred in context "${context}".`, { error });
  };
  const onError = onErrorCallback ?? defaultOnError;

  let promise = callback;

  if (onSuccessCallback) {
    promise = promise.then(onSuccessCallback);
  }

  promise.catch(onError);
};

export const isBlockedMessage = (message: LocalMessage) =>
  message.type === 'error' && message.moderation?.action === 'remove';

export const isBouncedMessage = (message: LocalMessage) =>
  message.type === 'error' && message?.moderation?.action === 'bounce';

export const getEnv = (envKey: keyof NodeJS.ProcessEnv) => {
  if (
    typeof process !== 'undefined' &&
    (Object.hasOwn(process, 'env') || 'env' in process)
  ) {
    return process.env[envKey];
  }

  return undefined;
};
