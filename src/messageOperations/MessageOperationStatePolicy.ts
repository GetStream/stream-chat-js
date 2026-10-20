import type { DeleteMessageOptions, LocalMessage, MessageResponse } from '../types';
import { isAlreadyExistsError, parseError } from '../errors';
import { formatMessage } from '../utils';
import { nowNs } from '../utils/time';
import type { QueueableType } from '../offline-support';
import type { MessageOperationSpec, OperationKind, OperationParams } from './types';

export type MessageOperationStatePolicyContext = {
  ingest: (m: LocalMessage) => void;
  get: (id: string) => LocalMessage | undefined;
  remove: (id: string) => void;
  persist: (m: LocalMessage) => void;
  purge: (id: string) => void;
  isQueued: (messageId: string, types: readonly QueueableType[]) => Promise<boolean>;
};

/**
 * What {@link MessageOperationStatePolicy.optimistic} wrote, handed back to
 * {@link MessageOperationStatePolicy.failure} so it can decide whether and what to revert.
 */
export type OptimisticOutcome = {
  /**
   * The exact object the optimistic step wrote, used as a concurrency guard: `EntityStore.upsert`
   * replaces the canonical copy, so `get(id) === applied` means nothing wrote since. Anything else is a
   * fresher truth (a WS event, another operation) that a revert must not clobber.
   */
  applied?: LocalMessage;
  /** The copy that was there beforehand, i.e. what a revert restores. */
  previous?: LocalMessage;
};

const isHardDelete = (options: unknown) =>
  !!(options as DeleteMessageOptions | undefined)?.hard;

/** Closes each phase's branches on the kind: a new `OperationKind` fails to compile until handled. */
const unhandledKind = (kind: never): never => {
  throw new Error(`Unhandled message operation kind: ${String(kind)}`);
};

/**
 * The queued tasks that mean a failed request is still pending, so its optimistic state stays. A send
 * has none: one that never reached the server must settle as `failed` even when queued, since retry is
 * the only way the user can get the message out.
 */
const PENDING_WHEN_QUEUED: Record<OperationKind, readonly QueueableType[]> = {
  delete: ['delete-message'],
  retry: [],
  send: [],
  // An edit of a message the server has never seen is folded into its queued send
  // (`AbstractOfflineDB.handleUpdateMessagePendingTask`), leaving no `update-message` row.
  update: ['update-message', 'send-message'],
};

/**
 * The local-state half of every message operation: what to show before the request resolves, and what
 * to do with the answer or the failure.
 *
 * - send / retry: `sending`, then `failed` on failure, with a `failed` write-ahead to the offline DB.
 * - update: applied and persisted, never reverted (that would destroy the user's text). A definitive
 *   rejection marks the message `failed` and keeps the edit; a queued failure is pending, not failed.
 * - delete: marked `deleted` (removed for a hard delete), reverted on a definitive rejection.
 */
export class MessageOperationStatePolicy {
  private ctx: MessageOperationStatePolicyContext;

  constructor(ctx: MessageOperationStatePolicyContext) {
    this.ctx = ctx;
  }

  optimistic<K extends OperationKind>(
    kind: K,
    params: OperationParams<K>,
  ): OptimisticOutcome {
    const { localMessage } = params;
    const previous = this.ctx.get(localMessage.id);

    if (kind === 'delete') {
      const deleteForMe = (params.options as DeleteMessageOptions | undefined)
        ?.delete_for_me;

      if (isHardDelete(params.options)) {
        this.ctx.remove(localMessage.id);
        this.ctx.purge(localMessage.id);
        return { previous };
      }

      // Nothing holds this message, so there is nothing to hide, and ingesting would insert a phantom
      // "Message deleted" row. The offline DB mirrors local state, so it is not written either.
      if (!previous) return {};

      const applied: LocalMessage = {
        ...localMessage,
        deleted_at: nowNs(),
        type: 'deleted',
        ...(deleteForMe ? { deleted_for_me: true } : {}),
      };
      this.ctx.ingest(applied);
      this.ctx.persist(applied);
      return { applied, previous };
    }

    if (kind === 'update') {
      // An edit keeps the message's status: one the server has must not go back to `sending`, and one
      // that never left the device stays `failed`.
      const isFailed = localMessage.status === 'failed';
      const editedAt = nowNs();
      const applied: LocalMessage = {
        ...localMessage,
        error: isFailed ? localMessage.error : undefined,
        updated_at: editedAt,
        // `message_text_updated_at` drives the "edited" indicator, so it appears immediately, but only
        // for a message the server has seen: a failed one never had a confirmed text update.
        ...(isFailed ? {} : { message_text_updated_at: editedAt }),
      };
      this.ctx.ingest(applied);
      this.ctx.persist(applied);
      return { applied, previous };
    }

    if (kind === 'send' || kind === 'retry') {
      const applied: LocalMessage = {
        ...localMessage,
        error: undefined,
        status:
          !localMessage.status || localMessage.status === 'failed'
            ? 'sending'
            : localMessage.status,
      };
      this.ctx.ingest(applied);
      // Write-ahead, pessimistically `failed`: if the app dies before the server's ack the message
      // comes back failed and retryable, and a success overwrites it. The retry payload is not
      // persisted: `MessageOperations.retry` rebuilds it when `failedSendCache` is cold.
      this.ctx.persist({ ...applied, status: 'failed' });
      return { applied, previous };
    }

    return unhandledKind(kind);
  }

  success<K extends OperationKind>({
    kind,
    messageFromResponse,
    messageId,
    optimistic,
    options,
  }: {
    kind: K;
    messageFromResponse: MessageResponse | undefined;
    messageId: string;
    optimistic?: OptimisticOutcome;
    options?: MessageOperationSpec[K]['options'];
  }) {
    // `formatMessage(undefined)` does not throw: it yields an ID-less message whose `updated_at` would
    // beat the freshness check below.
    if (!messageFromResponse) return;

    const formatted = formatMessage({ ...messageFromResponse, status: 'received' });

    if (kind === 'delete') {
      if (isHardDelete(options)) {
        this.ctx.remove(messageId);
        this.ctx.purge(messageId);
        return;
      }
      // Mirrors the `!previous` guard in `optimistic`. Read live, not from the optimistic snapshot, so a
      // copy that arrived while the request was open is still marked.
      if (!this.ctx.get(messageId)) return;

      this.ctx.ingest(formatted);
      this.ctx.persist(formatted);
      return;
    }

    if (kind === 'update' || kind === 'send' || kind === 'retry') {
      const existing = this.ctx.get(messageId);

      const nothingWroteSinceOptimistic =
        !!optimistic?.applied && existing === optimistic.applied;

      // When something else wrote since the optimistic step, both copies are server derived, so
      // `updated_at` compares one clock.
      const serverNewer = !existing || formatted.updated_at > existing.updated_at;
      const serverSameOrNewer = !existing || formatted.updated_at >= existing.updated_at;
      const existingIsOurOptimisticSend = existing?.status === 'sending';

      const applyServerCopy =
        nothingWroteSinceOptimistic ||
        serverNewer ||
        (existingIsOurOptimisticSend && serverSameOrNewer);

      // Declined only when a copy at least as fresh already landed (for example the same message
      // from a WS event), whose own write replaced the `failed` row.
      if (!applyServerCopy) return;

      this.ctx.ingest(formatted);
      // Persist only what was applied, so the row never disagrees with memory. For send/retry this
      // supersedes the `failed` write-ahead.
      this.ctx.persist(formatted);
      return;
    }

    return unhandledKind(kind);
  }

  async failure<K extends OperationKind>({
    error,
    kind,
    localMessage,
    messageId,
    optimistic,
    options,
  }: {
    error: unknown;
    kind: K;
    localMessage: LocalMessage;
    messageId: string;
    optimistic?: OptimisticOutcome;
    options?: MessageOperationSpec[K]['options'];
  }) {
    const parsed = parseError(error);

    if (isAlreadyExistsError(error, parsed)) {
      const existing = this.ctx.get(messageId);
      if (existing?.status === 'sending') {
        const received: LocalMessage = { ...localMessage, status: 'received' };
        this.ctx.ingest(received);
        this.ctx.persist(received);
      }
      return;
    }

    // A request waiting in the offline queue has not failed: the optimistic state stays.
    const pendingTaskTypes = PENDING_WHEN_QUEUED[kind];
    const queued =
      pendingTaskTypes.length > 0 &&
      (await this.ctx.isQueued(messageId, pendingTaskTypes));

    if (kind === 'delete') {
      if (!queued) this.revertDelete({ messageId, optimistic, options });
      return;
    }

    if (kind === 'update') {
      if (queued) return;
      // The edit is kept and the failure recorded on it. Note the retry this enables re-sends rather
      // than re-edits.
      const failed: LocalMessage = {
        ...(this.ctx.get(messageId) ?? localMessage),
        error: parsed,
        status: 'failed',
      };
      this.ctx.ingest(failed);
      this.ctx.persist(failed);
      return;
    }

    if (kind === 'send' || kind === 'retry') {
      const failed: LocalMessage = { ...localMessage, error: parsed, status: 'failed' };
      this.ctx.ingest(failed);
      this.ctx.persist(failed);
      return;
    }

    return unhandledKind(kind);
  }

  private revertDelete<K extends OperationKind>({
    messageId,
    optimistic,
    options,
  }: {
    messageId: string;
    optimistic?: OptimisticOutcome;
    options?: MessageOperationSpec[K]['options'];
  }) {
    const previous = optimistic?.previous;
    if (!previous) return;

    if (isHardDelete(options)) {
      // A hard delete removed the message, so there is no current copy to compare: restore the snapshot.
      this.ctx.ingest(previous);
      this.ctx.persist(previous);
      return;
    }

    if (optimistic?.applied && this.ctx.get(messageId) !== optimistic.applied) return;

    this.ctx.ingest(previous);
    // The upsert rewrites `type` and `deletedAt` from the restored message, undoing the soft delete.
    this.ctx.persist(previous);
  }
}
