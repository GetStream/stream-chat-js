import type {
  Attachment,
  LocalMessage,
  MessageRequest,
  MessageResponse,
  OwnUserBase,
  OwnUserResponse,
  ReactionGroupResponse,
  ReactionResponse,
  UserResponse,
} from './types';
import type { Channel } from './channel';
import type { AxiosRequestConfig } from 'axios';
import { LOCAL_MESSAGE_FIELDS, RESERVED_UPDATED_MESSAGE_FIELDS } from './constants';
import { getMemoizedFormat, memoizeFormat } from './formatMessageMemo';
import { chatLoggerSystem } from './logger';
import type { ScopedLogger } from './logger';
import { nowNs, nsToDate } from './utils/time';

const logger = chatLoggerSystem.getLogger('utils');

/**
 * Runs a promise fire-and-forget and logs an error when it rejects.
 *
 * @param promise - The promise to run.
 * @param name - What the promise does, for the log output.
 */
export function logChatPromiseExecution<T>(promise: Promise<T>, name: string) {
  promise.then().catch((error) => {
    logger
      .withExtraTags('logChatPromiseExecution')
      .error(`Failed to execute "${name}".`, { error });
  });
}

const logListenerError = <T>(scopedLogger: ScopedLogger, error: unknown, event: T) =>
  scopedLogger
    .withExtraTags('invokeEventListener')
    .error('Unhandled error in event listener', { error, event });

/**
 * Invokes one event listener in isolation: a synchronous throw or a rejected promise (from an
 * `async` listener) is logged and cannot abort the dispatch loop.
 */
export const invokeEventListener = <T>(
  listener: (event: T) => unknown,
  event: T,
  scopedLogger: ScopedLogger,
) => {
  try {
    const result = listener(event);
    if (result && typeof (result as PromiseLike<unknown>).then === 'function') {
      Promise.resolve(result).catch((error) =>
        logListenerError(scopedLogger, error, event),
      );
    }
  } catch (error) {
    logListenerError(scopedLogger, error, event);
  }
};

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

export function isOwnUser(
  user?: OwnUserResponse | UserResponse,
): user is OwnUserResponse {
  return (user as OwnUserResponse)?.total_unread_count !== undefined;
}

export function isOwnUserBaseProperty(property: string) {
  const ownUserBaseProperties: {
    [Property in keyof Required<OwnUserBase>]: boolean;
  } = {
    channel_mutes: true,
    devices: true,
    invisible: true,
    latest_hidden_channels: true,
    mutes: true,
    privacy_settings: true,
    push_preferences: true,
    total_unread_count: true,
    total_unread_count_by_team: true,
    unread_channels: true,
    unread_count: true,
    unread_threads: true,
  };

  return ownUserBaseProperties[property as keyof OwnUserBase];
}

/** Whether `read-events` is among the own capabilities (true while they are not loaded). */
export const channelHasReadEvents = (channel?: Channel) => {
  const ownCapabilities = channel?.data?.own_capabilities;
  return !(Array.isArray(ownCapabilities) && !ownCapabilities.includes('read-events'));
};

/** Whether read events are off and the channel keeps a client-local unread count. */
export const channelTracksReadLocally = (channel?: Channel) =>
  !channelHasReadEvents(channel) && !!channel?.config.readEvents.localUnreadCountEnabled;

/** A random retry delay in milliseconds that grows with `numberOfFailures`. */
export function retryInterval(numberOfFailures: number) {
  // 0.25 to 25 seconds, random to spread out the load from failures
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

const isScalarParam = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean';

export const axiosParamsSerializer: AxiosRequestConfig['paramsSerializer'] = (params) => {
  const newParams = [];
  for (const k in params) {
    // The backend does not treat an "undefined" value as absent, so skip it.
    if (params[k] === undefined) continue;

    // Scalar arrays are comma-separated (`ids=a,b`), as the API parses list params; a JSON array
    // there silently matches nothing.
    if (Array.isArray(params[k]) && params[k].every(isScalarParam)) {
      newParams.push(`${k}=${encodeURIComponent(params[k].join(','))}`);
    } else if (Array.isArray(params[k]) || typeof params[k] === 'object') {
      newParams.push(`${k}=${encodeURIComponent(JSON.stringify(params[k]))}`);
    } else {
      newParams.push(`${k}=${encodeURIComponent(params[k])}`);
    }
  }

  return newParams.join('&');
};

/**
 * Adds the SDK-specific fields (`status`, `error`) to a message. Memoized per source object: callers
 * share the result, so do not mutate it.
 *
 * @param message - The message from the API, or a local one.
 * @returns The `LocalMessage`.
 */
export function formatMessage(message: MessageResponse | LocalMessage): LocalMessage {
  // Memoized per source object: every consumer gets the same `LocalMessage`.
  const memoized = getMemoizedFormat(message);
  if (memoized) return memoized;

  const toLocalMessageBase = (
    msg: MessageResponse | LocalMessage | null | undefined,
  ): LocalMessage | null => {
    if (!msg) return null;
    return {
      ...msg,
      // Timestamps stay unix nanoseconds. A locally composed message has no `created_at` /
      // `updated_at` until the server answers.
      created_at: msg.created_at ?? nowNs(),
      deleted_at: msg.deleted_at ?? undefined,
      pinned_at: msg.pinned_at ?? undefined,
      reaction_groups: maybeGetReactionGroupsFallback(
        msg.reaction_groups,
        msg.reaction_counts,
        msg.reaction_scores,
      ),
      status: (msg as LocalMessage).status || 'received',
      updated_at: msg.updated_at ?? nowNs(),
    };
  };

  const formatted = {
    ...toLocalMessageBase(message),
    error: (message as LocalMessage).error ?? undefined,
    quoted_message:
      toLocalMessageBase((message as MessageResponse).quoted_message) ?? undefined,
  } as LocalMessage;

  memoizeFormat(message, formatted);
  return formatted;
}

/**
 * Computes the current user's `own_reactions` after one reaction change, from the `current` copy. A
 * WS reaction event carries `own_reactions: []` (or stale), so it cannot be trusted. Used by
 * `applyReactionLocally` and `reflectReactionEvent`.
 *
 * - `removed`: drop the current user's reaction of this type.
 * - `enforceUnique`: replace any own reaction with the incoming one (`reaction.updated`).
 * - otherwise: add the reaction, de-duped by type.
 *
 * A reaction by another user never changes `own_reactions`.
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
 * `latest_reactions`. `own_reactions` is left to {@link computeOwnReactions}.
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

  // With `enforceUnique`, first back the current user's existing reactions out of the groups.
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

/**
 * Converts wire timestamps into the `Date` objects `MessageRequest` declares (sub-millisecond
 * precision is lost). `shared_location` is copied field by field so only what `SharedLocation`
 * declares reaches the API.
 */
const toRequestDateFields = ({
  pinned_at,
  pin_expires,
  shared_location,
}: Pick<Partial<MessageResponse>, 'pinned_at' | 'pin_expires' | 'shared_location'>): Pick<
  MessageRequest,
  'pinned_at' | 'pin_expires' | 'shared_location'
> => ({
  ...(pinned_at != null ? { pinned_at: nsToDate(pinned_at) } : {}),
  ...(pin_expires != null ? { pin_expires: nsToDate(pin_expires) } : {}),
  ...(shared_location
    ? {
        shared_location: {
          latitude: shared_location.latitude,
          longitude: shared_location.longitude,
          created_by_device_id: shared_location.created_by_device_id,
          ...(shared_location.end_at != null
            ? { end_at: nsToDate(shared_location.end_at) }
            : {}),
        },
      }
    : {}),
});

/** Whether a URL is HTTP(S), so the API and other devices can fetch it. */
const isRemoteUrl = (url?: string) => !!url && /^https?:\/\//i.test(url.trim());

/**
 * Strips `localMetadata` (`AttachmentManager`'s upload state, never sent to the API) from a
 * message's attachments. Of those that carried it, drops with a warning the ones with no remote URL:
 * their upload never settled, so something bypassed the send path that awaits uploads. Returns the
 * same message object when nothing changed.
 */
export const sanitizeOutgoingAttachments = <T extends { attachments?: Attachment[] }>(
  message: T,
): T => {
  const attachments = message.attachments;
  if (!attachments?.length) return message;

  const unresolved: Attachment[] = [];
  let changed = false;

  const sanitized = attachments.reduce<Attachment[]>((acc, attachment) => {
    const { localMetadata, ...rest } = attachment as Attachment & {
      localMetadata?: Record<string, unknown>;
    };

    if (!localMetadata) {
      acc.push(attachment);
      return acc;
    }

    changed = true;

    // A remote URL in any of these means the upload resolved.
    const hasRemoteSource =
      isRemoteUrl(rest.asset_url) ||
      isRemoteUrl(rest.image_url) ||
      isRemoteUrl(rest.og_scrape_url) ||
      isRemoteUrl(rest.title_link);

    if (hasRemoteSource) {
      acc.push(rest as Attachment);
    } else {
      unresolved.push(rest as Attachment);
    }

    return acc;
  }, []);

  if (unresolved.length) {
    logger
      .withExtraTags('sanitizeOutgoingAttachments', 'attachments')
      .warn(
        `Dropped ${unresolved.length} attachment(s) whose upload never completed. Composing with pending uploads requires awaiting them before sending.`,
        { attachments: unresolved, message },
      );
  }

  return changed ? { ...message, attachments: sanitized } : message;
};

export const localMessageToNewMessagePayload = (
  localMessage: LocalMessage,
): MessageRequest => {
  const {
    // Timestamp and client-specific fields are removed, so `pinned_at` can precede `created_at`.
    created_at: _created_at,
    updated_at: _updated_at,
    deleted_at: _deleted_at,
    message_text_updated_at: _message_text_updated_at,
    pinned_at,
    pin_expires,
    shared_location,
    error: _error,
    status: _status,
    latest_reactions: _latest_reactions,
    own_reactions: _own_reactions,
    reaction_counts: _reaction_counts,
    reaction_scores: _reaction_scores,
    reply_count: _reply_count,
    // Text-related fields that are not sent as-is (`mentioned_users` goes out as IDs)
    command: _command,
    html: _html,
    i18n: _i18n,
    mentioned_groups: _mentioned_groups,
    quoted_message: _quoted_message,
    mentioned_users,
    ...messageFields
  } = localMessage;

  const requestDates = toRequestDateFields({ pinned_at, pin_expires, shared_location });

  // `messageFields` carries LocalMessage-only fields (cid, pinned, shadowed, ...) that
  // `MessageRequest` omits; the server ignores them.
  return {
    ...(messageFields as MessageRequest),
    mentioned_users: mentioned_users?.map((user) => user.id),
    ...requestDates,
  };
};

export const toUpdatedMessagePayload = (
  message: LocalMessage | Partial<MessageResponse>,
): MessageRequest => {
  const reservedKeys = {
    ...RESERVED_UPDATED_MESSAGE_FIELDS,
    ...LOCAL_MESSAGE_FIELDS,
  } as const;

  const messageFields = Object.fromEntries(
    Object.entries(message).filter(
      ([key]) => !reservedKeys[key as keyof typeof reservedKeys],
    ),
  ) as MessageRequest;

  return {
    ...messageFields,
    pinned: message.pinned_at != null,
    mentioned_users: message.mentioned_users?.map((user) =>
      typeof user === 'string' ? user : user.id,
    ),
    ...toRequestDateFields({
      pinned_at: message.pinned_at,
      pin_expires: message.pin_expires,
      shared_location: message.shared_location,
    }),
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
     * On hard delete, strip text, html, attachments and custom properties. The message stays in the
     * UI until messages are re-queried.
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
   * Picks a unique property identifying an element, used to find a direct match for the needle when
   * compare values are not unique.
   *
   * @example
   * ```ts
   * selectKey: (message) => message.id
   * ```
   */
  selectKey?: (arrayElement: T) => string;
  /**
   * Picks the property to compare the needle to.
   *
   * @example
   * ```ts
   * selectValueToCompare: (message) => message.created_at
   * ```
   */
  selectValueToCompare?: (arrayElement: T) => L | T;
  /** @default 'ascending' */
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

  // With several elements of the same comparable value, search around the insertion point for one
  // with the same key and prefer it (prevents duplicating messages with the same creation date).
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
      // Best effort: `first_reaction_at`, `last_reaction_at` and `latest_reactions_by` cannot be
      // derived.
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
   * Calls the function under the debounce rules. Returns its value when it runs immediately, else
   * the last invocation's value (`undefined` before the first).
   */
  (...args: Parameters<T>): ReturnType<T> | undefined;

  cancel(): void;

  /**
   * Runs the pending invocation immediately and returns its value; otherwise returns the last
   * invocation's value (`undefined` if never invoked).
   */
  flush(): ReturnType<T> | undefined;
}

// Like lodash.debounce, except `timeout` can be a function of the call arguments, resolved on every
// call.
export const debounce = <T extends (...args: any[]) => any>(
  fn: T,
  timeout: number | ((...args: Parameters<T>) => number) = 0,
  { leading = false, trailing = true }: { leading?: boolean; trailing?: boolean } = {},
): DebouncedFunc<T> => {
  let runningTimeout: null | ReturnType<typeof setTimeout> = null;
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

    const delay = typeof timeout === 'function' ? timeout(...args) : timeout;
    runningTimeout = setTimeout(timeoutHandler, delay);
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

// Like lodash.uniqBy.
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

/** The user ID of a member given as an ID, a member request or a member response; `''` if none. */
export const getMemberUserId = (
  member: string | { user_id?: string; user?: { id?: string } },
) => (typeof member === 'string' ? member : member.user_id || member.user?.id || '');

/**
 * The temporary ID of a channel created from members without an ID, until the server answers:
 * `!members-` plus the sorted member IDs joined by `,`, so it is order-independent. `undefined`
 * when there are no members.
 */
export const generateChannelTempId = (memberIds: string[]) => {
  const membersStr = [...memberIds].filter(Boolean).sort().join(',');
  if (!membersStr) return;
  return `!members-${membersStr}`;
};

/**
 * The temporary cid of a channel created from members without an ID: its
 * {@link generateChannelTempId} under its type, so the channel is stored once under it until the
 * server assigns the real cid. `undefined` when there are no members.
 */
export const generateChannelTempCid = (channelType: string, memberIds: string[]) => {
  const tempId = generateChannelTempId(memberIds);
  if (!tempId) return;
  return `${channelType}:${tempId}`;
};

export const isLocalMessage = (message: unknown): message is LocalMessage =>
  typeof (message as LocalMessage | undefined)?.status === 'string';

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

export const getEnv = (envKey: string) => {
  if (
    typeof process !== 'undefined' &&
    (Object.hasOwn(process, 'env') || 'env' in process)
  ) {
    return process.env[envKey];
  }

  return undefined;
};
