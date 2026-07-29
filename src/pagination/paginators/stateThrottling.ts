/**
 * Global switch for the message-list `state` publish throttle (see `BasePaginator.scheduleWindowPublish`).
 *
 * Auto-disabled under test runners (Vitest / Jest) so the existing unit suites keep their synchronous,
 * un-throttled behavior with zero per-test changes: with throttling off, every live mutation publishes
 * to `state` immediately, exactly as before this feature. A dedicated throttle test flips it on
 * (around fake timers) via {@link setStateThrottlingEnabled} and restores it afterwards.
 *
 * Production (an app bundle) defaults ON.
 */
const isTestRunner = (): boolean => {
  try {
    return (
      typeof process !== 'undefined' &&
      !!process.env &&
      (!!process.env.VITEST ||
        !!process.env.JEST_WORKER_ID ||
        process.env.NODE_ENV === 'test')
    );
  } catch {
    return false;
  }
};

let enabled = !isTestRunner();

export const isStateThrottlingEnabled = (): boolean => enabled;

export const setStateThrottlingEnabled = (value: boolean): void => {
  enabled = value;
};
