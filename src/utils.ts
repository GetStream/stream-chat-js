/**
 * logChatPromiseExecution - utility function for logging the execution of a promise..
 *  use this when you want to run the promise and handle errors by logging a warning
 *
 * @param {Promise<unknown>} promise The promise you want to run and log
 * @param {string} name    A descriptive name of what the promise does for log output
 *
 */

export function logChatPromiseExecution(promise: Promise<unknown>, name: string): void {
  promise
    .then(() => {
      // do nothing...
    })
    .catch(error => {
      console.warn(`failed to do ${name}, ran into error: `, error);
    });
}

export const sleep = (m: number): Promise<void> => new Promise(r => setTimeout(r, m));

export function isFunction(value: Function | unknown): value is Function {
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
