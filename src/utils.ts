import FormData, { AppendOptions } from 'form-data';

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

export function addFileToFormData(
  uri: string | NodeJS.ReadableStream | Buffer | File,
  name?: string,
  contentType?: string,
) {
  const data = new FormData();

  const appendOptions: AppendOptions = {};
  if (name) appendOptions.filename = name;
  if (contentType) appendOptions.contentType = contentType;

  if (isReadableStream(uri) || isBuffer(uri) || isFileWebAPI(uri)) {
    data.append('file', uri, appendOptions);
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
