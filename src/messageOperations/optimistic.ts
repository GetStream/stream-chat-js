import { applyReactionLocally } from '../entityStore';
import { isEphemeral } from '../errors';
import { formatMessage } from '../utils';
import type { Channel } from '../channel';
import type { StreamChat } from '../client';
import type { QueueableType } from '../offline-support';
import type {
  LocalMessage,
  MessageResponse,
  ReactionRequest,
  SendReactionRequest,
} from '../types';

/**
 * ADDING A NEW OPTIMISTIC OPERATION
 *
 * The four message operations `MessageOperations` already owns (send, retry, update, delete) run
 * through {@link MessageOperationStatePolicy}. Anything ELSE — pinning, a poll vote, an integrator's
 * own endpoint — is not a message REQUEST (no `localMessage`, no `sending → received | failed`), so it
 * does not belong in that class. It writes itself, using these two — from inside `Channel` or
 * `Thread`, where the accessor is in scope (it is built where `MessageOperations` is constructed and
 * is not exposed as a field):
 *
 * ```ts
 * const undo = applyMessageChangeLocally(accessor, {
 *   messageId,
 *   produce: (m) => m && { ...m, pinned: true, pinned_at: new Date() },
 * });
 *
 * try {
 *   await client.pinMessage(messageId, expiration);
 * } catch (error) {
 *   // Queued for replay is pending, not failed — there is nothing to roll back.
 *   // Naming the operation's OWN task types: every task carries the same `messageId`, so asking
 *   // "is anything queued for this message" would let an unrelated one answer for you. An operation
 *   // that is not queueable at all skips this and always rolls back.
 *   if (!(await isQueuedForReplay(client, messageId, ['pin-message' as QueueableType]))) undo?.();
 *   throw error;
 * }
 * ```
 *
 * An operation that also changes which COLLECTION holds the message (pinning does) names that
 * collection itself — `channel.pinnedMessagesPaginator.ingestItem(...)` after the write,
 * `removeItem(...)` in the undo — because the call site always knows which list it is about.
 *
 * Reactions apply their change with {@link applyReactionLocally} instead: their local update is delta
 * math over current state rather than a replacement, so their undo is inverse-deltas.
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
 * How an optimistic operation reaches the message it is changing: the read, the write and the removal,
 * nothing else. `Channel` and `Thread` each build one where they construct their `MessageOperations`,
 * routed paginator-first with the client-global message store as the fallback.
 */
export type LocalMessageAccessor = {
  get: (id: string) => LocalMessage | undefined;
  ingest: (message: LocalMessage) => void;
  remove: (id: string) => void;
};

/**
 * Reverts an optimistic write, unless something fresher landed in the meantime.
 *
 * Returns whether it actually reverted. `false` means "a newer truth won, leave it alone" — not that
 * anything went wrong. An operation that also has to un-write something else (restore an offline-DB
 * row, drop the message from a collection it added it to) reads that, so it does not undo a half of
 * something that never happened.
 */
export type RevertLocalChange = () => boolean;

/**
 * Reads the copy currently held, hands it to the operation's `produce`, writes the result back, and
 * returns a reference-equality-guarded undo.
 *
 * Everything operation-specific is in `produce`. Everything an operation would otherwise hand-roll —
 * the read, the write, the "has anything else written since" guard, working out what the inverse of the
 * write is — is here.
 *
 * Writes go through `accessor.ingest` / `accessor.remove` rather than a bare store upsert, so a change that
 * affects COLLECTION MEMBERSHIP works and not just a content change: a store upsert replaces the
 * message wherever it is already held but never consults a collection's filter, so flipping `pinned`
 * could never make it appear in a list it now belongs to.
 */
export const applyMessageChangeLocally = (
  accessor: LocalMessageAccessor,
  { messageId, produce }: { messageId: string; produce: MessageChangeProducer },
): RevertLocalChange | undefined => {
  const previous = accessor.get(messageId);
  const next = produce(previous);

  // Nothing to apply — e.g. an optimistic soft delete of a message no collection holds, where
  // ingesting would insert a phantom "Message deleted" row for something never on screen.
  if (next === undefined) return;

  if (next === REMOVE_MESSAGE) {
    if (!previous) return;

    accessor.remove(messageId);

    return () => {
      // No identity guard: the message is not in local state, so there is no current copy to compare
      // against and the snapshot is unambiguously what belongs there.
      accessor.ingest(previous);
      return true;
    };
  }

  accessor.ingest(next);

  return () => {
    // A fresher truth (a WS event, another operation) landed while the request was in flight.
    if (accessor.get(messageId) !== next) return false;

    if (previous) accessor.ingest(previous);
    else accessor.remove(messageId);

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

/**
 * Reactions do not go through {@link MessageOperations}, and shouldn't: that class models a message
 * REQUEST — it takes a `localMessage`, returns `{ message }`, and moves it `sending → received |
 * failed`. A reaction has no status, nothing renders a pending or failed reaction, and the subject of
 * the request is not the message.
 *
 * One implementation each, shared by `Channel` and `Thread`, which had a copy apiece differing only in
 * `this` vs `this.channel`. The request is channel-level either way, and the local write is addressed
 * by message id ({@link applyReactionLocally}) rather than through any paginator — which is what lets
 * it reach a pure thread reply, or a thread parent, that no single collection holds.
 */

/**
 * Reconciles the server-authoritative copy, but only if we still hold it — a bare upsert of an unheld
 * id would orphan it (the store's refcount GC only reclaims held ids).
 */
const reconcileHeldMessage = (
  channel: Channel,
  message: MessageResponse | undefined | null,
) => {
  if (!message) return;
  const { messageStore } = channel.getClient();
  if (!messageStore.has(message.id)) return;
  messageStore.upsert(formatMessage(message));
};

/**
 * Adds a reaction with an optimistic local state update: the reaction is applied to the cached message
 * immediately, then the request is fired via {@link Channel.sendReaction} (which owns the offline-DB
 * write + queue). The server-authoritative counts reconcile on the response; the reaction is rolled
 * back on a definitive failure, and left alone when the request was queued for replay.
 */
export const addReactionOptimistically = async ({
  channel,
  messageId,
  options,
  reaction,
}: {
  channel: Channel;
  messageId: string;
  reaction: ReactionRequest;
  options?: Pick<SendReactionRequest, 'enforce_unique' | 'skip_push'>;
}) => {
  const client = channel.getClient();
  const undo = applyReactionLocally(client, {
    enforceUnique: options?.enforce_unique ?? false,
    messageId,
    reaction,
  });

  try {
    const response = await channel.sendReaction({ id: messageId, reaction, ...options });
    reconcileHeldMessage(channel, response?.message);
  } catch (error) {
    // Queued for replay is pending, not failed — there is nothing to roll back.
    if (!(await isQueuedForReplay(client, messageId, ['send-reaction']))) undo?.();
    throw error;
  }
};

/**
 * Removes the current user's reaction with an optimistic local state update, mirroring
 * {@link addReactionOptimistically}.
 */
export const deleteReactionOptimistically = async ({
  channel,
  messageId,
  type,
}: {
  channel: Channel;
  messageId: string;
  type: string;
}) => {
  const client = channel.getClient();
  const undo = applyReactionLocally(client, {
    messageId,
    reaction: { type },
    removed: true,
  });

  try {
    const response = await channel.deleteReaction({ id: messageId, type });
    reconcileHeldMessage(channel, response?.message);
  } catch (error) {
    if (!(await isQueuedForReplay(client, messageId, ['delete-reaction']))) undo?.();
    throw error;
  }
};
