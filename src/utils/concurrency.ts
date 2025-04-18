interface PendingPromise {
  onContinued: () => void;
  promise: Promise<unknown>;
}

type AsyncWrapper<P extends unknown[], T> = (
  tag: string | symbol,
  cb: (...args: P) => Promise<T>,
) => {
  cb: () => Promise<T>;
  onContinued: () => void;
};

/**
 * Runs async functions serially. Useful for wrapping async actions that
 * should never run simultaneously: if marked with the same tag, functions
 * will run one after another.
 *
 * @param tag Async functions with the same tag will run serially. Async functions
 * with different tags can run in parallel.
 * @param cb Async function to run.
 * @returns Promise that resolves when async functions returns.
 */
export const withoutConcurrency = createRunner(wrapWithContinuationTracking);

/**
 * Runs async functions serially, and cancels all other actions with the same tag
 * when a new action is scheduled. Useful for wrapping async actions that override
 * each other (e.g. enabling and disabling camera).
 *
 * If an async function hasn't started yet and was canceled, it will never run.
 * If an async function is already running and was canceled, it will be notified
 * via an abort signal passed as an argument.
 *
 * @param tag Async functions with the same tag will run serially and are canceled
 * when a new action with the same tag is scheduled.
 * @param cb Async function to run. Receives AbortSignal as the only argument.
 * @returns Promise that resolves when async functions returns. If the function didn't
 * start and was canceled, will resolve with 'canceled'. If the function started to run,
 * it's up to the function to decide how to react to cancelation.
 */
export const withCancellation = createRunner(wrapWithCancellation);

const pendingPromises = new Map<string | symbol, PendingPromise>();

export function hasPending(tag: string | symbol) {
  return pendingPromises.has(tag);
}

export async function settled(tag: string | symbol) {
  await pendingPromises.get(tag)?.promise;
}

/**
 * Implements common functionality of running async functions serially, by chaining
 * their promises one after another.
 *
 * Before running, async function is "wrapped" using the provided wrapper. This wrapper
 * can add additional steps to run before or after the function.
 *
 * When async function is scheduled to run, the previous function is notified
 * by calling the associated onContinued callback. This behavior of this callback
 * is defined by the wrapper.
 */
function createRunner<P extends unknown[], T>(wrapper: AsyncWrapper<P, T>) {
  return function run(tag: string | symbol, cb: (...args: P) => Promise<T>) {
    const { cb: wrapped, onContinued } = wrapper(tag, cb);
    const pending = pendingPromises.get(tag);
    pending?.onContinued();
    const promise = pending ? pending.promise.then(wrapped, wrapped) : wrapped();
    pendingPromises.set(tag, { promise, onContinued });
    return promise;
  };
}

/**
 * Wraps an async function with an additional step run after the function:
 * if the function is the last in the queue, it cleans up the whole chain
 * of promises after finishing.
 */
function wrapWithContinuationTracking<T>(tag: string | symbol, cb: () => Promise<T>) {
  let hasContinuation = false;
  const wrapped = () =>
    cb().finally(() => {
      if (!hasContinuation) {
        pendingPromises.delete(tag);
      }
    });
  const onContinued = () => (hasContinuation = true);
  return { cb: wrapped, onContinued };
}

/**
 * Wraps an async function with additional functionality:
 * 1. Associates an abort signal with every function, that is passed to it
 *    as an argument. When a new function is scheduled to run after the current
 *    one, current signal is aborted.
 * 2. If current function didn't start and was aborted, in will never start.
 * 3. If the function is the last in the queue, it cleans up the whole chain
 *    of promises after finishing.
 *
 *    The cb is passed the AbortController instance for a given execution.
 *    The cb should implement own cancellation logic to reflect that the given AbortController has been aborted.
 *
 *  ```
 *    const cb = async (signal: AbortSignal) => {
 *         await new Promise(resolve => setTimeout(resolve, 50));
 *         if (signal.aborted) {
 *           abortedSignals.push(signal);
 *           return 'canceled';
 *         }
 *         return 1;
 *       };
 *   const result = withCancellation('tag-x', cb); // the result variable may acquire value "canceled" or 1
 *  ```
 */
function wrapWithCancellation<T>(
  tag: string | symbol,
  cb: (signal: AbortSignal) => Promise<T | 'canceled'>,
) {
  const ac = new AbortController();
  const wrapped = () => {
    if (ac.signal.aborted) {
      return Promise.resolve('canceled' as const);
    }

    return cb(ac.signal).finally(() => {
      if (!ac.signal.aborted) {
        pendingPromises.delete(tag);
      }
    });
  };
  const onContinued = () => ac.abort();
  return { cb: wrapped, onContinued };
}
