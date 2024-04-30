import FormData from 'form-data';
import {
  AscDesc,
  ExtendableGenerics,
  DefaultGenerics,
  OwnUserBase,
  OwnUserResponse,
  UserResponse,
  MessageResponse,
  FormatMessageResponse,
  ReactionGroupResponse,
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
 * formatMessage - Takes the message object. Parses the dates, sets __html
 * and sets the status to received if missing. Returns a message object
 *
 * @param {MessageResponse<StreamChatGenerics>} message a message object
 *
 */
export function formatMessage<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics>(
  message: MessageResponse<StreamChatGenerics>,
): FormatMessageResponse<StreamChatGenerics> {
  return {
    ...message,
    /**
     * @deprecated please use `html`
     */
    __html: message.html,
    // parse the date..
    pinned_at: message.pinned_at ? new Date(message.pinned_at) : null,
    created_at: message.created_at ? new Date(message.created_at) : new Date(),
    updated_at: message.updated_at ? new Date(message.updated_at) : new Date(),
    status: message.status || 'received',
    reaction_groups: maybeGetReactionGroupsFallback(
      message.reaction_groups,
      message.reaction_counts,
      message.reaction_scores,
    ),
  };
}

export function addToMessageList<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics>(
  messages: Array<FormatMessageResponse<StreamChatGenerics>>,
  message: FormatMessageResponse<StreamChatGenerics>,
  timestampChanged = false,
  sortBy: 'pinned_at' | 'created_at' = 'created_at',
  addIfDoesNotExist = true,
) {
  const addMessageToList = addIfDoesNotExist || timestampChanged;
  let messageArr = messages;

  // if created_at has changed, message should be filtered and re-inserted in correct order
  // slow op but usually this only happens for a message inserted to state before actual response with correct timestamp
  if (timestampChanged) {
    messageArr = messageArr.filter((msg) => !(msg.id && message.id === msg.id));
  }

  // Get array length after filtering
  const messageArrayLength = messageArr.length;

  // for empty list just concat and return unless it's an update or deletion
  if (messageArrayLength === 0 && addMessageToList) {
    return messageArr.concat(message);
  } else if (messageArrayLength === 0) {
    return [...messageArr];
  }

  const messageTime = (message[sortBy] as Date).getTime();
  const messageIsNewest = (messageArr[messageArrayLength - 1][sortBy] as Date).getTime() < messageTime;

  // if message is newer than last item in the list concat and return unless it's an update or deletion
  if (messageIsNewest && addMessageToList) {
    return messageArr.concat(message);
  } else if (messageIsNewest) {
    return [...messageArr];
  }

  // find the closest index to push the new message
  let left = 0;
  let middle = 0;
  let right = messageArrayLength - 1;
  while (left <= right) {
    middle = Math.floor((right + left) / 2);
    if ((messageArr[middle][sortBy] as Date).getTime() <= messageTime) left = middle + 1;
    else right = middle - 1;
  }

  // message already exists and not filtered due to timestampChanged, update and return
  if (!timestampChanged && message.id) {
    if (messageArr[left] && message.id === messageArr[left].id) {
      messageArr[left] = message;
      return [...messageArr];
    }

    if (messageArr[left - 1] && message.id === messageArr[left - 1].id) {
      messageArr[left - 1] = message;
      return [...messageArr];
    }
  }

  // Do not add updated or deleted messages to the list if they do not already exist
  // or have a timestamp change.
  if (addMessageToList) {
    messageArr.splice(left, 0, message);
  }
  return [...messageArr];
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
