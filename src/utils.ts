import FormData from 'form-data';
import type {
  AscDesc,
  ChannelFilters,
  ChannelQueryOptions,
  ChannelSort,
  ChannelSortBase,
  LocalMessage,
  LocalMessageBase,
  Logger,
  Message,
  MessagePaginationOptions,
  MessageResponse,
  MessageResponseBase,
  MessageSet,
  OwnUserBase,
  OwnUserResponse,
  PromoteChannelParams,
  QueryChannelAPIResponse,
  ReactionGroupResponse,
  UpdatedMessage,
  UserResponse,
} from './types';
import type { StreamChat } from './client';
import type { Channel } from './channel';
import type { AxiosRequestConfig } from 'axios';
import { LOCAL_MESSAGE_FIELDS, RESERVED_UPDATED_MESSAGE_FIELDS } from './constants';

/**
 * logChatPromiseExecution - utility function for logging the execution of a promise..
 *  use this when you want to run the promise and handle errors by logging a warning
 *
 * @param {Promise<T>} promise The promise you want to run and log
 * @param {string} name    A descriptive name of what the promise does for log output
 *
 */
export function logChatPromiseExecution<T>(promise: Promise<T>, name: string) {
  promise.then().catch((error) => {
    console.warn(`failed to do ${name}, ran into error: `, error);
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
  };

  return ownUserBaseProperties[property as keyof OwnUserBase];
}

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
export function normalizeQuerySort<T extends Record<string, AscDesc | undefined>>(
  sort: T | T[],
) {
  const sortFields: Array<{ direction: AscDesc; field: keyof T }> = [];
  const sortArr = Array.isArray(sort) ? sort : [sort];
  for (const item of sortArr) {
    const entries = Object.entries(item) as [keyof T, AscDesc][];
    if (entries.length > 1) {
      console.warn(
        "client._buildSort() - multiple fields in a single sort object detected. Object's field order is not guaranteed",
      );
    }
    for (const [field, direction] of entries) {
      sortFields.push({ field, direction });
    }
  }
  return sortFields;
}

/**
 * retryInterval - A retry interval which increases acc to number of failures
 *
 * @return {number} Duration to wait in milliseconds
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
    console.warn(
      'isOnline failed to access window.navigator and assume browser is online',
    );
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
 * Takes the message object, parses the dates, sets `__html`
 * and sets the status to `received` if missing; returns a new LocalMessage object.
 *
 * @param {LocalMessage} message `LocalMessage` object
 */
export function formatMessage(
  message: MessageResponse | MessageResponseBase | LocalMessage,
): LocalMessage {
  const toLocalMessageBase = (
    msg: MessageResponse | MessageResponseBase | LocalMessage | null | undefined,
  ): LocalMessageBase | null => {
    if (!msg) return null;
    return {
      ...msg,
      created_at: msg.created_at ? new Date(msg.created_at) : new Date(),
      deleted_at: msg.deleted_at ? new Date(msg.deleted_at) : null,
      pinned_at: msg.pinned_at ? new Date(msg.pinned_at) : null,
      reaction_groups: maybeGetReactionGroupsFallback(
        msg.reaction_groups,
        msg.reaction_counts,
        msg.reaction_scores,
      ),
      status: msg.status || 'received',
      updated_at: msg.updated_at ? new Date(msg.updated_at) : new Date(),
    };
  };

  return {
    ...toLocalMessageBase(message),
    error: (message as LocalMessage).error ?? null,
    quoted_message: toLocalMessageBase((message as MessageResponse).quoted_message),
  } as LocalMessage;
}

/**
 * @private
 *
 * Takes a LocalMessage, parses the dates back to strings,
 * and converts the message back to a MessageResponse.
 *
 * @param {MessageResponse} message `MessageResponse` object
 */
export function unformatMessage(message: LocalMessage): MessageResponse {
  const toMessageResponseBase = (
    msg: LocalMessage | null | undefined,
  ): MessageResponseBase | null => {
    if (!msg) return null;
    const newDateString = new Date().toISOString();
    return {
      ...msg,
      created_at: message.created_at ? message.created_at.toISOString() : newDateString,
      deleted_at: message.deleted_at ? message.deleted_at.toISOString() : undefined,
      pinned_at: message.pinned_at ? message.pinned_at.toISOString() : undefined,
      updated_at: message.updated_at ? message.updated_at.toISOString() : newDateString,
    };
  };

  return {
    ...toMessageResponseBase(message),
    quoted_message: toMessageResponseBase((message as LocalMessage).quoted_message),
  } as MessageResponse;
}

export const localMessageToNewMessagePayload = (localMessage: LocalMessage): Message => {
  /* eslint-disable @typescript-eslint/no-unused-vars */
  const {
    // Remove all timestamp fields and client-specific fields.
    // Field pinned_at can therefore be earlier than created_at as new message payload can hold it.
    created_at,
    updated_at,
    deleted_at,
    // Client-specific fields
    error,
    status,
    // Reaction related fields
    latest_reactions,
    own_reactions,
    reaction_counts,
    reaction_scores,
    reply_count,
    // Message text related fields that shouldn't be in update
    command,
    html,
    i18n,
    quoted_message,
    mentioned_users,
    // Message content related fields
    ...messageFields
  } = localMessage;

  return {
    ...messageFields,
    pinned_at: messageFields.pinned_at?.toISOString(),
    mentioned_users: mentioned_users?.map((user) => user.id),
  };
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
  message: LocalMessage | LocalMessageBase;
  deletedAt: LocalMessage['deleted_at'];
  hardDelete: boolean;
}) => {
  if (hardDelete) {
    /**
     * In case of hard delete, we need to strip down all text, html, attachments and all the custom properties on message
     * The hard-deleted message is kept in the UI until the messages are re-queried
     * FIXME: we are returning an object that does not match LocalMessage | LocalMessageBase
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

export const deleteUserMessages = ({
  messages,
  user,
  hardDelete = false,
  deletedAt,
}: {
  messages: Array<LocalMessage>;
  user: UserResponse;
  hardDelete: boolean;
  deletedAt: LocalMessage['deleted_at'];
}) => {
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    if (message.user?.id === user.id) {
      messages[i] =
        message.type === 'deleted'
          ? message
          : (toDeletedMessage({ message, hardDelete, deletedAt }) as LocalMessage);
    }

    if (message.quoted_message?.user?.id === user.id) {
      messages[i].quoted_message =
        message.quoted_message.type === 'deleted'
          ? message.quoted_message
          : (toDeletedMessage({
              message: messages[i].quoted_message as LocalMessageBase,
              hardDelete,
              deletedAt,
            }) as LocalMessage);
    }
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

export function addToMessageList<T extends LocalMessage>(
  messages: readonly T[],
  newMessage: T,
  timestampChanged = false,
  sortBy: 'pinned_at' | 'created_at' = 'created_at',
  addIfDoesNotExist = true,
) {
  const addMessageToList = addIfDoesNotExist || timestampChanged;
  let newMessages = [...messages];

  // if created_at has changed, message should be filtered and re-inserted in correct order
  // slow op but usually this only happens for a message inserted to state before actual response with correct timestamp
  if (timestampChanged) {
    newMessages = newMessages.filter(
      (message) => !(message.id && newMessage.id === message.id),
    );
  }

  // for empty list just concat and return unless it's an update or deletion
  if (newMessages.length === 0 && addMessageToList) {
    return newMessages.concat(newMessage);
  } else if (newMessages.length === 0) {
    return newMessages;
  }

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const messageTime = newMessage[sortBy]!.getTime();
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const messageIsNewest = newMessages.at(-1)![sortBy]!.getTime() < messageTime;

  // if message is newer than last item in the list concat and return unless it's an update or deletion
  if (messageIsNewest && addMessageToList) {
    return newMessages.concat(newMessage);
  } else if (messageIsNewest) {
    return newMessages;
  }

  // find the closest index to push the new message
  const insertionIndex = findIndexInSortedArray({
    needle: newMessage,
    sortedArray: newMessages,
    sortDirection: 'ascending',
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    selectValueToCompare: (m) => m[sortBy]!.getTime(),
    selectKey: (m) => m.id,
  });

  // message already exists and not filtered with timestampChanged, update and return
  if (
    !timestampChanged &&
    newMessage.id &&
    newMessages[insertionIndex] &&
    newMessage.id === newMessages[insertionIndex].id
  ) {
    newMessages[insertionIndex] = newMessage;
    return newMessages;
  }

  // do not add updated or deleted messages to the list if they already exist or come with a timestamp change
  if (addMessageToList) {
    newMessages.splice(insertionIndex, 0, newMessage);
  }

  return newMessages;
}

function maybeGetReactionGroupsFallback(
  groups: { [key: string]: ReactionGroupResponse } | null | undefined,
  counts: { [key: string]: number } | null | undefined,
  scores: { [key: string]: number } | null | undefined,
): { [key: string]: ReactionGroupResponse } | null {
  if (groups) {
    return groups;
  }

  if (counts && scores) {
    const fallback: { [key: string]: ReactionGroupResponse } = {};

    for (const type of Object.keys(counts)) {
      fallback[type] = {
        count: counts[type],
        sum_scores: scores[type],
      };
    }

    return fallback;
  }

  return null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
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
// eslint-disable-next-line @typescript-eslint/no-explicit-any
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

// works exactly the same as lodash.throttle
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const throttle = <T extends (...args: any[]) => any>(
  fn: T,
  timeout = 200,
  { leading = true, trailing = false }: { leading?: boolean; trailing?: boolean } = {},
) => {
  let runningTimeout: null | NodeJS.Timeout = null;
  let storedArgs: Parameters<T> | null = null;

  return (...args: Parameters<T>) => {
    if (runningTimeout) {
      if (trailing) storedArgs = args;
      return;
    }

    if (leading) fn(...args);

    const timeoutHandler = () => {
      if (storedArgs) {
        fn(...storedArgs);
        storedArgs = null;
        runningTimeout = setTimeout(timeoutHandler, timeout);

        return;
      }

      runningTimeout = null;
    };

    runningTimeout = setTimeout(timeoutHandler, timeout);
  };
};

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

type MessagePaginationUpdatedParams = {
  parentSet: MessageSet;
  requestedPageSize: number;
  returnedPage: MessageResponse[];
  logger?: Logger;
  messagePaginationOptions?: MessagePaginationOptions;
};

export function binarySearchByDateEqualOrNearestGreater(
  array: {
    created_at?: string;
  }[],
  targetDate: Date,
): number {
  let left = 0;
  let right = array.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    const midCreatedAt = array[mid].created_at;
    if (!midCreatedAt) {
      left += 1;
      continue;
    }
    const midDate = new Date(midCreatedAt);

    if (midDate.getTime() === targetDate.getTime()) {
      return mid;
    } else if (midDate.getTime() < targetDate.getTime()) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return left;
}

const messagePaginationCreatedAtAround = ({
  parentSet,
  requestedPageSize,
  returnedPage,
  messagePaginationOptions,
}: MessagePaginationUpdatedParams) => {
  const newPagination = { ...parentSet.pagination };
  if (!messagePaginationOptions?.created_at_around) return newPagination;
  let hasPrev;
  let hasNext;
  let updateHasPrev;
  let updateHasNext;
  const createdAtAroundDate = new Date(messagePaginationOptions.created_at_around);
  const [firstPageMsg, lastPageMsg] = [returnedPage[0], returnedPage.slice(-1)[0]];

  // expect ASC order (from oldest to newest)
  const wholePageHasNewerMessages =
    !!firstPageMsg?.created_at && new Date(firstPageMsg.created_at) > createdAtAroundDate;
  const wholePageHasOlderMessages =
    !!lastPageMsg?.created_at && new Date(lastPageMsg.created_at) < createdAtAroundDate;

  const requestedPageSizeNotMet =
    requestedPageSize > parentSet.messages.length &&
    requestedPageSize > returnedPage.length;
  const noMoreMessages =
    (requestedPageSize > parentSet.messages.length ||
      parentSet.messages.length >= returnedPage.length) &&
    requestedPageSize > returnedPage.length;

  if (wholePageHasNewerMessages) {
    hasPrev = false;
    updateHasPrev = true;
    if (requestedPageSizeNotMet) {
      hasNext = false;
      updateHasNext = true;
    }
  } else if (wholePageHasOlderMessages) {
    hasNext = false;
    updateHasNext = true;
    if (requestedPageSizeNotMet) {
      hasPrev = false;
      updateHasPrev = true;
    }
  } else if (noMoreMessages) {
    hasNext = hasPrev = false;
    updateHasPrev = updateHasNext = true;
  } else {
    const [firstPageMsgIsFirstInSet, lastPageMsgIsLastInSet] = [
      firstPageMsg?.id && firstPageMsg.id === parentSet.messages[0]?.id,
      lastPageMsg?.id && lastPageMsg.id === parentSet.messages.slice(-1)[0]?.id,
    ];
    updateHasPrev = firstPageMsgIsFirstInSet;
    updateHasNext = lastPageMsgIsLastInSet;
    const midPointByCount = Math.floor(returnedPage.length / 2);
    const midPointByCreationDate = binarySearchByDateEqualOrNearestGreater(
      returnedPage,
      createdAtAroundDate,
    );

    if (midPointByCreationDate !== -1) {
      hasPrev = midPointByCount <= midPointByCreationDate;
      hasNext = midPointByCount >= midPointByCreationDate;
    }
  }

  if (updateHasPrev && typeof hasPrev !== 'undefined') newPagination.hasPrev = hasPrev;
  if (updateHasNext && typeof hasNext !== 'undefined') newPagination.hasNext = hasNext;

  return newPagination;
};

const messagePaginationIdAround = ({
  parentSet,
  requestedPageSize,
  returnedPage,
  messagePaginationOptions,
}: MessagePaginationUpdatedParams) => {
  const newPagination = { ...parentSet.pagination };
  const { id_around } = messagePaginationOptions || {};
  if (!id_around) return newPagination;
  let hasPrev;
  let hasNext;

  const [firstPageMsg, lastPageMsg] = [returnedPage[0], returnedPage.slice(-1)[0]];
  const [firstPageMsgIsFirstInSet, lastPageMsgIsLastInSet] = [
    firstPageMsg?.id === parentSet.messages[0]?.id,
    lastPageMsg?.id === parentSet.messages.slice(-1)[0]?.id,
  ];
  let updateHasPrev = firstPageMsgIsFirstInSet;
  let updateHasNext = lastPageMsgIsLastInSet;

  const midPoint = Math.floor(returnedPage.length / 2);
  const noMoreMessages =
    (requestedPageSize > parentSet.messages.length ||
      parentSet.messages.length >= returnedPage.length) &&
    requestedPageSize > returnedPage.length;

  if (noMoreMessages) {
    hasNext = hasPrev = false;
    updateHasPrev = updateHasNext = true;
  } else if (!returnedPage[midPoint]) {
    return newPagination;
  } else if (returnedPage[midPoint].id === id_around) {
    hasPrev = hasNext = true;
  } else {
    let targetMsg;
    const halves = [returnedPage.slice(0, midPoint), returnedPage.slice(midPoint)];
    hasPrev = hasNext = true;
    for (let i = 0; i < halves.length; i++) {
      targetMsg = halves[i].find((message) => message.id === id_around);
      if (targetMsg && i === 0) {
        hasPrev = false;
      }
      if (targetMsg && i === 1) {
        hasNext = false;
      }
    }
  }

  if (updateHasPrev && typeof hasPrev !== 'undefined') newPagination.hasPrev = hasPrev;
  if (updateHasNext && typeof hasNext !== 'undefined') newPagination.hasNext = hasNext;

  return newPagination;
};

const messagePaginationLinear = ({
  parentSet,
  requestedPageSize,
  returnedPage,
  messagePaginationOptions,
}: MessagePaginationUpdatedParams) => {
  const newPagination = { ...parentSet.pagination };

  let hasPrev;
  let hasNext;

  const [firstPageMsg, lastPageMsg] = [returnedPage[0], returnedPage.slice(-1)[0]];
  const [firstPageMsgIsFirstInSet, lastPageMsgIsLastInSet] = [
    firstPageMsg?.id && firstPageMsg.id === parentSet.messages[0]?.id,
    lastPageMsg?.id && lastPageMsg.id === parentSet.messages.slice(-1)[0]?.id,
  ];

  const queriedNextMessages =
    messagePaginationOptions &&
    (messagePaginationOptions.created_at_after_or_equal ||
      messagePaginationOptions.created_at_after ||
      messagePaginationOptions.id_gt ||
      messagePaginationOptions.id_gte);

  const queriedPrevMessages =
    typeof messagePaginationOptions === 'undefined'
      ? true
      : messagePaginationOptions.created_at_before_or_equal ||
        messagePaginationOptions.created_at_before ||
        messagePaginationOptions.id_lt ||
        messagePaginationOptions.id_lte ||
        messagePaginationOptions.offset;

  const containsUnrecognizedOptionsOnly =
    !queriedNextMessages &&
    !queriedPrevMessages &&
    !messagePaginationOptions?.id_around &&
    !messagePaginationOptions?.created_at_around;

  const hasMore = returnedPage.length >= requestedPageSize;

  if (typeof queriedPrevMessages !== 'undefined' || containsUnrecognizedOptionsOnly) {
    hasPrev = hasMore;
  }
  if (typeof queriedNextMessages !== 'undefined') {
    hasNext = hasMore;
  }
  const returnedPageIsEmpty = returnedPage.length === 0;

  if ((firstPageMsgIsFirstInSet || returnedPageIsEmpty) && typeof hasPrev !== 'undefined')
    newPagination.hasPrev = hasPrev;
  if ((lastPageMsgIsLastInSet || returnedPageIsEmpty) && typeof hasNext !== 'undefined')
    newPagination.hasNext = hasNext;

  return newPagination;
};

export const messageSetPagination = (params: MessagePaginationUpdatedParams) => {
  const messagesFilteredLocally = params.returnedPage.filter(({ shadowed }) => shadowed);
  if (
    params.parentSet.messages.length + messagesFilteredLocally.length <
    params.returnedPage.length
  ) {
    params.logger?.(
      'error',
      'Corrupted message set state: parent set size < returned page size',
    );
    return params.parentSet.pagination;
  }

  if (params.messagePaginationOptions?.created_at_around) {
    return messagePaginationCreatedAtAround(params);
  } else if (params.messagePaginationOptions?.id_around) {
    return messagePaginationIdAround(params);
  } else {
    return messagePaginationLinear(params);
  }
};

/**
 * A utility object used to prevent duplicate invocation of channel.watch() to be triggered when
 * 'notification.message_new' and 'notification.added_to_channel' events arrive at the same time.
 */
const WATCH_QUERY_IN_PROGRESS_FOR_CHANNEL: Record<
  string,
  Promise<QueryChannelAPIResponse> | undefined
> = {};

type GetChannelParams = {
  client: StreamChat;
  channel?: Channel;
  id?: string;
  members?: string[];
  options?: ChannelQueryOptions;
  type?: string;
};
/**
 * Calls channel.watch() if it was not already recently called. Waits for watch promise to resolve even if it was invoked previously.
 * If the channel is not passed as a property, it will get it either by its channel.cid or by its members list and do the same.
 * @param client
 * @param members
 * @param options
 * @param type
 * @param id
 * @param channel
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
  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  const channelToWatch = channel || client.channel(type!, id, { members });

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
 * @param channelType
 * @param members
 */
export const generateChannelTempCid = (channelType: string, members: string[]) => {
  if (!members) return;
  const membersStr = [...members].sort().join(',');
  if (!membersStr) return;
  return `${channelType}:!members-${membersStr}`;
};

/**
 * Checks if a channel is pinned or not. Will return true only if channel.state.membership.pinned_at exists.
 * @param channel
 */
export const isChannelPinned = (channel: Channel) => {
  if (!channel) return false;

  const member = channel.state.membership;

  return !!member?.pinned_at;
};

/**
 * Checks if a channel is archived or not. Will return true only if channel.state.membership.archived_at exists.
 * @param channel
 */
export const isChannelArchived = (channel: Channel) => {
  if (!channel) return false;

  const member = channel.state.membership;

  return !!member?.archived_at;
};

/**
 * A utility that tells us whether we should consider archived channels or not based
 * on filters. Will return true only if filters.archived exists and is a boolean value.
 * @param filters
 */
export const shouldConsiderArchivedChannels = (filters: ChannelFilters) => {
  if (!filters) return false;

  return typeof filters.archived === 'boolean';
};

/**
 * Extracts the value of the sort parameter at a given index, for a targeted key. Can
 * handle both array and object versions of sort. Will return null if the index/key
 * combination does not exist.
 * @param atIndex - the index at which we'll examine the sort value, if it's an array one
 * @param sort - the sort value - both array and object notations are accepted
 * @param targetKey - the target key which needs to exist for the sort at a certain index
 */
export const extractSortValue = ({
  atIndex,
  sort,
  targetKey,
}: {
  atIndex: number;
  targetKey: keyof ChannelSortBase;
  sort?: ChannelSort;
}) => {
  if (!sort) return null;
  let option: null | ChannelSortBase = null;

  if (Array.isArray(sort)) {
    option = sort[atIndex] ?? null;
  } else {
    let index = 0;
    for (const key in sort) {
      if (index !== atIndex) {
        index++;
        continue;
      }

      if (key !== targetKey) {
        return null;
      }

      option = sort;

      break;
    }
  }

  return option?.[targetKey] ?? null;
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
 * @param sort
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
 * @param channels
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
 * @param channels - the list of channels we want to modify
 * @param channelToMove - the channel we want to promote
 * @param channelToMoveIndexWithinChannels - optionally, the index of the channel we want to move if we know it (will skip a manual check)
 * @param sort - the sort value used to check for pinned channels
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
  const { context, onSuccessCallback = () => undefined, onErrorCallback } = options ?? {};
  const defaultOnError = (error: Error) => {
    console.log(`An error has occurred in context ${context}: ${error}`);
  };
  const onError = onErrorCallback ?? defaultOnError;

  let promise = callback;

  if (onSuccessCallback) {
    promise = promise.then(onSuccessCallback);
  }

  promise.catch(onError);
};
