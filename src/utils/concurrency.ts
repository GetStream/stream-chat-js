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

/** Runs async functions with the same `tag` one after another. Different tags run in parallel. */
export const withoutConcurrency = createRunner(wrapWithContinuationTracking);

/**
 * Like {@link withoutConcurrency}, but scheduling a new action with the same `tag` cancels the
 * earlier ones. One that has not started never runs and resolves `'canceled'`. A running one has
 * its `AbortSignal` (the only argument of `cb`) aborted and decides how to react.
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
 * Chains functions with the same tag serially. `wrapper` adds steps around each function and
 * defines its `onContinued`, which runs on the previous function when a successor is scheduled.
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

/** The last function in the queue cleans up the whole promise chain when it finishes. */
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
 * Passes each function an abort signal, aborted when a successor is scheduled. A function aborted
 * before it starts never runs. The last function in the queue cleans up the promise chain.
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
