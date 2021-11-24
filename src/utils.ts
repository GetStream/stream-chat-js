import FormData from 'form-data';
import {
  AscDesc,
  LiteralStringForUnion,
  OwnUserBase,
  OwnUserResponse,
  UnknownType,
  UserResponse,
} from './types';

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
    ((obj as NodeJS.ReadStream).readable ||
      typeof (obj as NodeJS.ReadStream)._read === 'function')
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

export function isOwnUser<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType extends UnknownType = UnknownType
>(
  user?: OwnUserResponse<ChannelType, CommandType, UserType> | UserResponse<UserType>,
): user is OwnUserResponse<ChannelType, CommandType, UserType> {
  return (
    (user as OwnUserResponse<ChannelType, CommandType, UserType>)?.total_unread_count !==
    undefined
  );
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
    invisible: true,
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

  if (isReadableStream(uri) || isBuffer(uri) || isFileWebAPI(uri)) {
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
  if (typeof crypto !== 'undefined') {
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
