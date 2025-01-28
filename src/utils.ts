import FormData from 'form-data';
import {
  AscDesc,
  ExtendableGenerics,
  DefaultGenerics,
  Logger,
  OwnUserBase,
  OwnUserResponse,
  UserResponse,
  MessageResponse,
  FormatMessageResponse,
  ReactionGroupResponse,
  MessageSet,
  MessagePaginationOptions,
} from './types';
import { AxiosRequestConfig } from 'axios';

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

export function isFunction<T>(value: Function | T): value is Function {
  return (
    value &&
    (Object.prototype.toString.call(value) === '[object Function]' ||
      'function' === typeof value ||
      value instanceof Function)
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
    ((obj as NodeJS.ReadStream).readable || typeof (obj as NodeJS.ReadStream)._read === 'function')
  );
}

function isBuffer(obj: unknown): obj is Buffer {
  return (
    obj != null &&
    (obj as Buffer).constructor != null &&
    // @ts-expect-error
    typeof obj.constructor.isBuffer === 'function' &&
    // @ts-expect-error
    obj.constructor.isBuffer(obj)
  );
}

function isFileWebAPI(uri: unknown): uri is File {
  return typeof window !== 'undefined' && 'File' in window && uri instanceof File;
}

export function isOwnUser<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics>(
  user?: OwnUserResponse<StreamChatGenerics> | UserResponse<StreamChatGenerics>,
): user is OwnUserResponse<StreamChatGenerics> {
  return (user as OwnUserResponse<StreamChatGenerics>)?.total_unread_count !== undefined;
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
export function normalizeQuerySort<T extends Record<string, AscDesc | undefined>>(sort: T | T[]) {
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
    console.warn('isOnline failed to access window.navigator and assume browser is online');
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
 * and sets the status to `received` if missing; returns a new message object.
 *
 * @param {MessageResponse<StreamChatGenerics>} message `MessageResponse` object
 */
export function formatMessage<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics>(
  message: MessageResponse<StreamChatGenerics> | FormatMessageResponse<StreamChatGenerics>,
): FormatMessageResponse<StreamChatGenerics> {
  return {
    ...message,
    /**
     * @deprecated please use `html`
     */
    __html: message.html,
    // parse the dates
    pinned_at: message.pinned_at ? new Date(message.pinned_at) : null,
    created_at: message.created_at ? new Date(message.created_at) : new Date(),
    updated_at: message.updated_at ? new Date(message.updated_at) : new Date(),
    deleted_at: message.deleted_at ? new Date(message.deleted_at) : null,
    status: message.status || 'received',
    reaction_groups: maybeGetReactionGroupsFallback(
      message.reaction_groups,
      message.reaction_counts,
      message.reaction_scores,
    ),
  };
}

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
      0 <= i && i < sortedArray.length && selectValueToCompare(sortedArray[i]) === comparableNeedle;
      i += step
    ) {
      if (selectKey(sortedArray[i]) === needleKey) {
        return i;
      }
    }
  }

  return left;
};

export function addToMessageList<T extends FormatMessageResponse>(
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
    newMessages = newMessages.filter((message) => !(message.id && newMessage.id === message.id));
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
export const throttle = <T extends (...args: unknown[]) => unknown>(
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

type MessagePaginationUpdatedParams<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = {
  parentSet: MessageSet;
  requestedPageSize: number;
  returnedPage: MessageResponse<StreamChatGenerics>[];
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

const messagePaginationCreatedAtAround = <StreamChatGenerics extends ExtendableGenerics = DefaultGenerics>({
  parentSet,
  requestedPageSize,
  returnedPage,
  messagePaginationOptions,
}: MessagePaginationUpdatedParams<StreamChatGenerics>) => {
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
  const wholePageHasOlderMessages = !!lastPageMsg?.created_at && new Date(lastPageMsg.created_at) < createdAtAroundDate;

  const requestedPageSizeNotMet =
    requestedPageSize > parentSet.messages.length && requestedPageSize > returnedPage.length;
  const noMoreMessages =
    (requestedPageSize > parentSet.messages.length || parentSet.messages.length >= returnedPage.length) &&
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
    const midPointByCreationDate = binarySearchByDateEqualOrNearestGreater(returnedPage, createdAtAroundDate);

    if (midPointByCreationDate !== -1) {
      hasPrev = midPointByCount <= midPointByCreationDate;
      hasNext = midPointByCount >= midPointByCreationDate;
    }
  }

  if (updateHasPrev && typeof hasPrev !== 'undefined') newPagination.hasPrev = hasPrev;
  if (updateHasNext && typeof hasNext !== 'undefined') newPagination.hasNext = hasNext;

  return newPagination;
};

const messagePaginationIdAround = <StreamChatGenerics extends ExtendableGenerics = DefaultGenerics>({
  parentSet,
  requestedPageSize,
  returnedPage,
  messagePaginationOptions,
}: MessagePaginationUpdatedParams<StreamChatGenerics>) => {
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
    (requestedPageSize > parentSet.messages.length || parentSet.messages.length >= returnedPage.length) &&
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

const messagePaginationLinear = <StreamChatGenerics extends ExtendableGenerics = DefaultGenerics>({
  parentSet,
  requestedPageSize,
  returnedPage,
  messagePaginationOptions,
}: MessagePaginationUpdatedParams<StreamChatGenerics>) => {
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

export const messageSetPagination = <StreamChatGenerics extends ExtendableGenerics = DefaultGenerics>(
  params: MessagePaginationUpdatedParams<StreamChatGenerics>,
) => {
  if (params.parentSet.messages.length < params.returnedPage.length) {
    params.logger?.('error', 'Corrupted message set state: parent set size < returned page size');
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
