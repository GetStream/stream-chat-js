type FunctionToRetry<T = any> = (...functionArguments: any[]) => PromiseLike<T>;

enum RetryErrorType {
  ABORT,
  ATTEMPT_LIMIT_REACHED,
}

export class RetryError extends Error {
  public name = 'RetryError';

  private static errorMap = {
    [RetryErrorType.ABORT]: 'Value changed, retry handler aborted',
    [RetryErrorType.ATTEMPT_LIMIT_REACHED]: 'Reached maximum amount of retry attempts',
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
 * Function which wraps asynchronous functions with retry mechanism which'll keep executing said
 * function pre-defined number of times until it resolves, rejects or the retry mechanism runs out of available attempts.
 *
 * #### Available options:
 *  - `didValueChange` - check function with initial argument value to check against new values, return `true` to abort next attempt
 *
 *  - `isRetryable` - error evaluation function which determines whether to retry the execution
 *
 *  - `delayBetweenRetries` - accepts either fixed numeric value or function which provides retry attempt as the argument, expects number as return value
 *
 *  - `retryAttempts` - number of attempts to try out before rejecting the promise
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

    do {
      let data: Awaited<ReturnType<T>> | null = null;
      let error: unknown = null;

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

    throw new RetryError({ type: RetryErrorType.ATTEMPT_LIMIT_REACHED });
  };
