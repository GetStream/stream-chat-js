type FunctionToRetry<T = any> = (...functionArguments: any[]) => PromiseLike<T>;

enum RetryErrorType {
  ABORT,
}

export class RetryError extends Error {
  public name = 'RetryError';

  private static errorMap = {
    [RetryErrorType.ABORT]: 'Value changed, retry handler aborted',
  } satisfies Record<RetryErrorType, string>;

  constructor({ type }: { type: RetryErrorType }) {
    super(RetryError.errorMap[type]);
  }
}

export const sleep = (duration: number) =>
  new Promise((resolve) => setTimeout(resolve, duration));

// export const handleFalsePositiveResponse = <
//   T extends (...v: any[]) => PromiseLike<SuppliesResponse>,
// >(
//   f: T,
// ) =>
//   async function falsePositiveHandler(...functionArguments: Parameters<T>) {
//     // await or throw if "f" fails
//     const data = (await f(...functionArguments)) as Awaited<ReturnType<T>>;
//     // check for error data, throw if exist
//     if (data.errors !== null) {
//       const stringifiedErrors = data.errors
//         .map((error, index) => `E${index + 1}(${error.errorCode}): ${error.message}`)
//         .join('\n');

//       throw new Error(stringifiedErrors);
//     }

//     return data;
//   };

export type RunWithRetryOptions<T extends FunctionToRetry> = {
  retryAttempts?: number;
  delayBetweenRetries?: number | ((attempt: number) => number);
  isRetryable?: (error: unknown) => boolean;
  didValueChange?: (...functionArguments: Parameters<T>) => Promise<boolean> | boolean;
};

/**
 * Wraps `f` so a failed call is retried. Throws the error when it is not retryable, else the last
 * attempt's error once the retries run out. A falsy result counts as a failure and is retried.
 *
 * - `retryAttempts`: retries after the first attempt (default 3).
 * - `isRetryable`: whether an error is worth retrying (default: always).
 * - `delayBetweenRetries`: ms, or a function of the 0-based retry number.
 * - `didValueChange`: called with the call arguments before each attempt, `true` aborts with a
 *   `RetryError`.
 */
export const runWithRetry = <T extends FunctionToRetry>(
  f: T,
  {
    retryAttempts = 3,
    delayBetweenRetries,
    isRetryable,
    didValueChange,
  }: RunWithRetryOptions<T> = {},
) =>
  async function retryable(...functionArguments: Parameters<T>) {
    // starting with -1 as first attempt is not considered a retry
    let retryAttempt = -1;
    let error: unknown = null;

    do {
      let data: Awaited<ReturnType<T>> | null = null;
      error = null;

      if (await didValueChange?.(...functionArguments)) {
        throw new RetryError({ type: RetryErrorType.ABORT });
      }

      try {
        data = await f(...functionArguments);
      } catch (e) {
        error = e;
      }

      // disable value change check after successfull server call
      // throwing error at this point could lead to stale local states

      // if (await didValueChange?.(...functionArguments)) {
      //   throw new RetryError({ type: 'abort' });
      // }

      if (data) return data;

      const runRetry = isRetryable?.(error) ?? true;
      if (!runRetry) throw error;

      retryAttempt++;

      const isLastAttempt = retryAttempt === retryAttempts;

      if (delayBetweenRetries && !isLastAttempt) {
        await sleep(
          typeof delayBetweenRetries === 'function'
            ? delayBetweenRetries(retryAttempt)
            : delayBetweenRetries,
        );
      }
    } while (retryAttempt < retryAttempts);

    throw error;
  };
