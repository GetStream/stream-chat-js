/**
 * The rejection for a wait an `AbortSignal` ended, shaped like the one `fetch` and `axios` raise:
 * the signal's reason when it is an `Error`, otherwise an `AbortError` carrying `message`.
 */
export const abortError = (signal: AbortSignal, message: string) => {
  const reason: unknown = signal.reason;
  if (reason instanceof Error) return reason;
  const error = new Error(message);
  error.name = 'AbortError';
  return error;
};

/**
 * Settles as `promise` does, or rejects with {@link abortError} as soon as `signal` aborts.
 * `onAbort` runs, before the rejection, when the signal aborts before the wait has seen `promise`
 * settle. Ending the wait does not cancel the work behind `promise`.
 */
export const waitUnlessAborted = <T>({
  abortMessage,
  onAbort,
  promise,
  signal,
}: {
  /** The message of the `AbortError` the wait rejects with when the abort reason is no `Error`. */
  abortMessage: string;
  onAbort?: () => void;
  promise: Promise<T>;
  signal: AbortSignal | undefined;
}): Promise<T> => {
  if (!signal) return promise;
  if (signal.aborted) {
    onAbort?.();
    return Promise.reject(abortError(signal, abortMessage));
  }
  return new Promise<T>((resolve, reject) => {
    const abort = () => {
      onAbort?.();
      reject(abortError(signal, abortMessage));
    };
    signal.addEventListener('abort', abort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener('abort', abort));
  });
};
