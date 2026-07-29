export type ThrottledCallback = (...args: unknown[]) => unknown;

export type ThrottleOptions = {
  /** Call on the leading edge (default: true). */
  leading?: boolean;
  /** Call once at the end of the window with the latest args (default: false). */
  trailing?: boolean;
};

export type Throttled<T extends unknown[]> = {
  /**
   * The throttled function — call it as often as you like; it invokes `fn` at most once per window
   * (leading and/or trailing per options).
   */
  throttledFn: (...args: T) => void;
  /** Clear a pending trailing invocation WITHOUT firing it. */
  cancelTimer: () => void;
  /**
   * Fire a pending trailing invocation immediately (with the latest stored args), clearing the timer.
   * No-op when nothing is pending. Use to bypass the throttle delay for updates that must land now.
   */
  flush: () => void;
};

/**
 * Throttle a function so it runs at most once per `timeout` ms.
 *
 * - `leading`: fire immediately when the window opens
 * - `trailing`: remember the latest args/this and fire once when the window closes
 *
 * defaults: `{ leading: true, trailing: false }`
 *
 * Copied verbatim from the Feeds client (`packages/feeds-client/src/utils/throttling/throttle.ts`)
 * and extended with a `flush()` method (the Feeds version only exposes `cancelTimer()`).
 *
 * notes:
 * - make one throttled instance and reuse it; re-creating it resets internal state
 */
export const throttle = <T extends unknown[]>(
  fn: (...args: T) => void,
  timeout = 200,
  { leading = true, trailing = false }: ThrottleOptions = {},
): Throttled<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let storedArgs: T | null = null;
  let storedThis: unknown = null;
  let lastInvokeTime: number | undefined;

  const invoke = (args: T, thisArg: unknown) => {
    lastInvokeTime = Date.now();
    fn.apply(thisArg, args);
  };

  const scheduleTrailing = (delay: number) => {
    if (timer) return;
    timer = setTimeout(() => {
      timer = null;
      if (trailing && storedArgs) {
        invoke(storedArgs, storedThis);
        storedArgs = null;
        storedThis = null;
      }
    }, delay);
  };

  return {
    throttledFn(this: unknown, ...args: T) {
      const now = Date.now();

      const lastInvoke = lastInvokeTime;

      if (lastInvoke == null && !leading) lastInvokeTime = now;

      const timeSinceLast = lastInvoke == null ? timeout : now - lastInvoke;
      const remaining = timeout - timeSinceLast;

      if (trailing) {
        storedArgs = args;
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        storedThis = this;
      }

      if (remaining <= 0) {
        if (timer) {
          clearTimeout(timer);
          timer = null;
        }

        if (leading) {
          if (trailing) {
            if (storedArgs === args) {
              storedArgs = null;
              storedThis = null;
            }
          }
          invoke(args, this);
        } else {
          if (trailing) scheduleTrailing(timeout);
        }

        return;
      }

      if (trailing && !timer) {
        scheduleTrailing(remaining);
      }
    },
    cancelTimer: () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    },
    flush: () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (trailing && storedArgs) {
        invoke(storedArgs, storedThis);
        storedArgs = null;
        storedThis = null;
      }
    },
  };
};
