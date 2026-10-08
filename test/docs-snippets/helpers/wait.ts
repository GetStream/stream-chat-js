import type { StreamClient } from '@stream-io/node-sdk';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export type RetryOptions = {
  /** Give up after this many ms and rethrow the last error. */
  timeout?: number;
  interval?: number;
  /** Only retry errors this returns true for; anything else is thrown immediately. */
  retryIf?: (error: unknown) => boolean;
};

/** Calls `fn` until it resolves (or a non-retryable error / the timeout is hit). */
export const retry = async <T>(
  fn: () => Promise<T>,
  { timeout = 60000, interval = 1000, retryIf = () => true }: RetryOptions = {},
): Promise<T> => {
  const deadline = Date.now() + timeout;
  for (;;) {
    try {
      return await fn();
    } catch (error) {
      if (!retryIf(error) || Date.now() + interval > deadline) throw error;
      await sleep(interval);
    }
  }
};

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/**
 * 429 "Too many requests" (code 9): the app's rate limit for that endpoint was hit.
 * node-sdk errors carry the HTTP status in `metadata.responseCode`.
 */
export const isRateLimited = (error: unknown) =>
  typeof error === 'object' &&
  error !== null &&
  'metadata' in error &&
  typeof error.metadata === 'object' &&
  error.metadata !== null &&
  'responseCode' in error.metadata &&
  error.metadata.responseCode === 429;

/**
 * Retries `fn` while it is rate limited. Rate limits are per minute, so this keeps
 * trying for up to 90s (inside the 180s hook timeout).
 */
export const retryOnRateLimit = <T>(fn: () => Promise<T>) =>
  retry(fn, { timeout: 90000, interval: 5000, retryIf: isRateLimited });

/** "<type>: channel type does not exist" - returned until a new channel type has propagated. */
export const isChannelTypeMissing = (error: unknown) =>
  errorMessage(error).includes('channel type does not exist');

/** How long channel type changes take to reach every API node. */
export const CHANNEL_TYPE_PROPAGATION_MS = 30000;

/**
 * Channel type changes are eventually consistent: after `createChannelType` or
 * `updateChannelType`, API nodes can disagree for up to ~30s. A `channel.create()` can
 * succeed and the next `sendMessage` still fail with "channel type does not exist" (or
 * still see the old settings). Call this right after creating/updating a channel type,
 * before using it. Polling doesn't help because different nodes answer differently.
 */
export const waitForChannelTypePropagation = () => sleep(CHANNEL_TYPE_PROPAGATION_MS);

/**
 * Retries `fn` while it fails with "channel type does not exist". Only a fallback on
 * top of `waitForChannelTypePropagation` if a test is still flaky.
 */
export const retryWhileChannelTypePropagates = <T>(fn: () => Promise<T>) =>
  retry(fn, { timeout: 60000, interval: 2000, retryIf: isChannelTypeMissing });

/** Polls a background task (e.g. from server-side `deleteChannels`) until it finishes. */
export const waitForTask = async (
  client: StreamClient,
  taskId: string,
  timeout = 60000,
) => {
  const task = await retry(
    async () => {
      const response = await client.getTask({ id: taskId });
      if (response.status !== 'completed' && response.status !== 'failed') {
        throw new Error(`task ${taskId} is still ${response.status}`);
      }
      return response;
    },
    { timeout, interval: 1000 },
  );
  if (task.status === 'failed') {
    throw new Error(`task ${taskId} failed: ${JSON.stringify(task.error)}`);
  }
  return task;
};
