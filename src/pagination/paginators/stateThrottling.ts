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

/**
 * Global switch for the `state` publish throttle (see `BasePaginator.scheduleActiveIntervalPublish`). On by
 * default, off under test runners (Vitest / Jest) so every mutation publishes synchronously. Tests
 * of the throttle itself turn it on with {@link setStateThrottlingEnabled}.
 */
let enabled = !isTestRunner();

export const isStateThrottlingEnabled = (): boolean => enabled;

export const setStateThrottlingEnabled = (value: boolean): void => {
  enabled = value;
};
