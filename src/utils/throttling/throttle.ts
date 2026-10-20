export type ThrottledCallback = (...args: unknown[]) => unknown;

export type ThrottleOptions = {
  /** Call on the leading edge. Defaults to `true`. */
  leading?: boolean;
  /** Call once at the end of the window with the latest args. Defaults to `false`. */
  trailing?: boolean;
};

export type Throttled<T extends unknown[]> = {
  /** Invokes `fn` at most once per window (leading and/or trailing, per options). */
  throttledFn: (...args: T) => void;
  /** Clears a pending trailing invocation without firing it. */
  cancelTimer: () => void;
  /** Fires a pending trailing invocation now with the latest args. No-op when none is pending. */
  flush: () => void;
};

/**
 * Runs `fn` at most once per `timeout` ms. `leading` fires when the window opens, `trailing` fires
 * once at its end with the latest args and `this` (see {@link ThrottleOptions}). Create one
 * instance and reuse it: recreating it resets the window. `timeout` defaults to 200.
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
      // Also drops the stored args, so a later `flush()` cannot refire them.
      storedArgs = null;
      storedThis = null;
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
