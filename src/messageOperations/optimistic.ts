import { isEphemeral } from '../errors';
import type { StreamChat } from '../client';
import type { QueueableType } from '../offline-support';
import type { LocalMessage } from '../types';
import type { MessageOperationsContext } from './types';

/**
 * Helpers for showing a change to a message before the server has confirmed it. They write the change
 * to local state and the offline DB, give back an undo that won't overwrite anything newer that arrived
 * in the meantime, and tell whether a failed request is still queued, in which case the change stays.
 * Moving a message into or out of another collection, as pinning would with the pinned list, is not
 * covered here and has to be done and undone by the operation itself.
 */

/**
 * What a {@link MessageChangeProducer} returns to say "this operation takes the message out of local state"
 * — a hard delete. Distinct from `undefined`, which means "nothing to do".
 */
export const REMOVE_MESSAGE = Symbol('REMOVE_MESSAGE');

export type MessageChange = LocalMessage | typeof REMOVE_MESSAGE | undefined;

/** The change an operation wants made: given the copy currently held, what should be there instead. */
export type MessageChangeProducer = (current: LocalMessage | undefined) => MessageChange;

/**
 * Reverts an optimistic write, unless something fresher landed in the meantime.
 *
 * Returns whether it actually reverted. `false` means "a newer truth won, leave it alone" — not that
 * anything went wrong. An operation that also has to un-write something else (drop the message from a
 * collection it added it to) reads that, so it does not undo a half of something that never happened.
 */
export type RevertLocalChange = () => boolean;

/**
 * Reads the copy currently held, hands it to the operation's `produce`, writes the result to memory and
 * the offline DB, and returns a reference-equality-guarded undo that reverts both.
 *
 * Writes go through `ingest` / `remove` rather than a bare store upsert, so a change that affects
 * COLLECTION MEMBERSHIP works and not just a content change: a store upsert never consults a
 * collection's filter, so flipping `pinned` could never make it appear in a list it now belongs to.
 */
export const applyMessageChangeLocally = (
  writer: Pick<
    MessageOperationsContext,
    'get' | 'ingest' | 'persist' | 'purge' | 'remove'
  >,
  { messageId, produce }: { messageId: string; produce: MessageChangeProducer },
): RevertLocalChange | undefined => {
  const previous = writer.get(messageId);
  const next = produce(previous);

  // Nothing to apply — e.g. an optimistic soft delete of a message no collection holds, where
  // ingesting would insert a phantom "Message deleted" row for something never on screen.
  if (next === undefined) return;

  if (next === REMOVE_MESSAGE) {
    if (!previous) return;

    writer.remove(messageId);
    writer.purge(messageId);

    return () => {
      // No identity guard: the message is not in local state, so there is no current copy to compare
      // against and the snapshot is unambiguously what belongs there.
      writer.ingest(previous);
      writer.persist(previous);
      return true;
    };
  }

  writer.ingest(next);
  writer.persist(next);

  return () => {
    // A fresher truth (a WS event, another operation) landed while the request was in flight.
    if (writer.get(messageId) !== next) return false;

    if (previous) {
      writer.ingest(previous);
      writer.persist(previous);
    } else {
      writer.remove(messageId);
      writer.purge(messageId);
    }

    return true;
  };
};

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
