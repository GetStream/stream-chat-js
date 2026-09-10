import { deepFreezeConfig } from '../../configuration/utils/deepFreezeConfig';
import type { WSConnectionConfig } from './types';

/**
 * The WebSocket's timing defaults.
 *
 * In a module of their own rather than beside {@link WSConnection} because `StableWSConnection` needs
 * them too — as the fallback for when it has no client to read configuration from — and importing them
 * from `WSConnection.ts` would close a cycle, since that file imports `StableWSConnection`.
 */
export const DEFAULT_WS_CONNECTION_CONFIG: WSConnectionConfig = deepFreezeConfig({
  connectTimeoutMs: 15 * 1000,
  pingIntervalMs: 25 * 1000,
  healthCheckGracePeriodMs: 10 * 1000,
  webSocketImpl: undefined,
  urlParams: undefined,
  connection: undefined,
});

/**
 * How long a drop waits before `connection.changed` announces it, suppressed entirely if the socket
 * returns inside the window.
 *
 * A constant rather than configuration, because it was a bare `setTimeout(…, 5000)` inside the socket
 * that no caller could reach — so making it settable would be new surface, not a preserved capability.
 * It is also the one timing here that UI actively depends on: the delay is what stops a brief flap
 * from strobing a "connection lost" banner, and `stream-chat-react`'s
 * `useReportLostConnectionSystemNotification` renders a persistent toast off that event.
 *
 * Anything wanting the drop *without* the wait should subscribe to `client.wsConnection.state`, which
 * publishes the raw edge immediately — that split is the point of publishing the status separately
 * from the event.
 */
export const WS_OFFLINE_ANNOUNCE_DELAY_MS = 5 * 1000;

/**
 * How long to wait before retrying once the device reports its network is back.
 *
 * Deliberately tiny — it short-circuits the randomised backoff, because a network that has just
 * returned is the one moment an immediate retry is likely to succeed. Not zero, so the retry lands in
 * a later task, after whatever else is reacting to the same edge.
 *
 * A constant for the same reason as {@link WS_OFFLINE_ANNOUNCE_DELAY_MS}: it was a bare
 * `_reconnect({ interval: 10 })` that nothing could configure.
 */
export const WS_NETWORK_RECOVERY_RETRY_MS = 10;

/**
 * Bounds on the timing knobs, applied to every value that reaches the configuration — see
 * {@link clampWSConnectionConfig}.
 *
 * Two of the three fields are bounded, and both for the same reason: a value outside the range makes
 * the socket fail by itself, with no bad network and nothing for the integrator to see but an
 * apparently random disconnect. `connectTimeoutMs` is deliberately unbounded — every value of it is a
 * legitimate trade-off rather than a self-inflicted failure, and tests set it absurdly low on
 * purpose.
 */
export const WS_CONNECTION_CONFIG_BOUNDS: {
  [Key in 'healthCheckGracePeriodMs' | 'pingIntervalMs']: { max?: number; min: number };
} = {
  /**
   * A grace period of zero puts the connection check exactly on the moment the next ping is due, so the socket
   * declares itself dead on a healthy connection and does it again after every reconnect. A floor of
   * 1s is not a judgement about the right value; it is the point below which the loop cannot work.
   */
  healthCheckGracePeriodMs: { min: 1_000 },
  /**
   * **The maximum is the default**, which means this setting can only ever make the socket ping
   * more* often, never less. That is deliberate rather than an oversight: 25s is the interval the
   * server is known to be happy with, and a slower ping risks the connection being closed for
   * idleness — by Stream, or by whatever load balancers and proxies sit in between — which surfaces
   * as an apparently random disconnect rather than as a setting.
   *
   * So the useful direction is downward: a client on a flaky network can shorten the interval to
   * notice a dead socket sooner, since {@link WSConnectionConfig.healthCheckGracePeriodMs} moves the
   * connection check along with it.
   *
   * The floor exists for the opposite hazard: a few-millisecond interval floods the server with
   * health checks and earns a rate limit.
   */
  pingIntervalMs: { max: 25 * 1000, min: 1_000 },
};

/**
 * Clamps the timing knobs into {@link WS_CONNECTION_CONFIG_BOUNDS}, returning both the result and
 * what had to be moved, so the caller can say so out loud.
 *
 * Returns the same object reference when nothing is out of range — `ConfigController` skips a write
 * that changes nothing, and handing it a fresh equal object on every derivation would defeat that.
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
    // A non-finite value is out of range in the way that matters — `setTimeout(fn, NaN)` fires
    // immediately, so it would spin rather than fail visibly.
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
