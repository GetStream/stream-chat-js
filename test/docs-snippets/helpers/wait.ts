import type { StreamChat } from '../../../src';

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
  client: StreamChat,
  taskId: string,
  timeout = 60000,
) => {
  const task = await retry(
    async () => {
      const response = await client.getTask(taskId);
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
