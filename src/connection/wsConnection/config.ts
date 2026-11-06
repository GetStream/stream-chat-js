import { deepFreezeConfig } from '../../configuration/utils/deepFreezeConfig';
import type { WSConnectionConfig } from './types';

export const DEFAULT_WS_CONNECTION_CONFIG: WSConnectionConfig = deepFreezeConfig({
  connectTimeoutMs: 15 * 1000,
  enableWSFallback: false,
  pingIntervalMs: 25 * 1000,
  healthCheckGracePeriodMs: 10 * 1000,
  offlineNotificationDisplayDelayMs: 5 * 1000,
  webSocketImpl: undefined,
  urlParams: undefined,
  connection: undefined,
});

/**
 * Delay before reconnecting once the device reports its network is back, bypassing the randomised
 * backoff. Not zero, so the retry lands in a later task, after whatever else reacts to the same edge.
 */
export const WS_NETWORK_RECOVERY_RETRY_MS = 10;

/**
 * Bounds applied to the timing knobs by {@link clampWSConnectionConfig}. A ping interval above its
 * max, or a grace period below its min, makes the socket fail by itself, which looks like a random
 * disconnect. The other bounds reject nonsense values. `connectTimeoutMs` is unbounded: every value
 * is a legitimate trade-off.
 */
export const WS_CONNECTION_CONFIG_BOUNDS: {
  [Key in
    | 'healthCheckGracePeriodMs'
    | 'offlineNotificationDisplayDelayMs'
    | 'pingIntervalMs']: { max?: number; min: number };
} = {
  /** Zero would put the connection check on the next ping's due time and kill a healthy socket. */
  healthCheckGracePeriodMs: { min: 1_000 },
  /** Zero holds nothing back; the floor only rejects a negative delay. */
  offlineNotificationDisplayDelayMs: { min: 0 },
  /**
   * The maximum is the default: a slower ping risks an idle close by Stream or an intermediary. The
   * floor stops a tiny interval from flooding the server with health checks.
   */
  pingIntervalMs: { max: 25 * 1000, min: 1_000 },
};

/**
 * Clamps the timing knobs into {@link WS_CONNECTION_CONFIG_BOUNDS} and reports what it moved. Returns
 * the same object when nothing is out of range, so `ConfigController` skips the write.
 */
export const clampWSConnectionConfig = (
  requested: WSConnectionConfig,
): {
  clamped: WSConnectionConfig;
  corrections: { field: string; requested: number; used: number }[];
} => {
  const corrections: { field: string; requested: number; used: number }[] = [];
  let clamped = requested;

  for (const [field, { max, min }] of Object.entries(WS_CONNECTION_CONFIG_BOUNDS)) {
    const key = field as keyof typeof WS_CONNECTION_CONFIG_BOUNDS;
    const value = requested[key];
    // Non-finite values are out of range too: `setTimeout(fn, NaN)` fires immediately and would spin.
    const used = !Number.isFinite(value)
      ? min
      : Math.min(max ?? Number.POSITIVE_INFINITY, Math.max(min, value));

    if (used === value) continue;

    if (clamped === requested) clamped = { ...requested };
    clamped[key] = used;
    corrections.push({ field, requested: value, used });
  }

  return { clamped, corrections };
};
