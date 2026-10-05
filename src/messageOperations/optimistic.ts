import { isEphemeral } from '../errors';
import type { StreamChat } from '../client';
import type { QueueableType } from '../offline-support';

/**
 * Whether this message's mutation is sitting in the offline queue waiting to be replayed. A queued
 * mutation is pending, not failed: nothing to roll back and nothing to mark.
 *
 * Reads the queue. Inferring it from the error's shape ("an initialized offline DB plus an
 * {@link isEphemeral} error, so it must have been queued") over-reports, because the queue declines
 * tasks no error shape can predict — an `update-message` whose payload still points at a local
 * attachment URL is refused by `isMessageUpdateReplayable`, and the edit would then be suppressed as
 * "pending" with nothing to replay it. A row in the pending-tasks table is the actual fact.
 *
 * Ordering is safe: `queueTask` awaits `handleAddPendingTask` before it rethrows, so the row exists by
 * the time an operation's `catch` runs.
 */
export const isQueuedForReplay = async (
  client: StreamChat,
  messageId: string,
  types: readonly QueueableType[],
): Promise<boolean> => {
  const { offlineDb } = client;
  // No queue at all, so nothing can be pending. `initialized` matters as much as existence: a DB whose
  // `init()` never succeeded cannot hold a pending task.
  if (!offlineDb?.state.getLatestValue().initialized) return false;

  // Optional-chained: `getPendingTasks` is part of the `OfflineDBApi` an integrator can implement, so
  // this must not assume a well-formed return.
  const pending = await offlineDb.getPendingTasks({ messageId });

  return !!pending?.some((task) => types.includes(task.type));
};
