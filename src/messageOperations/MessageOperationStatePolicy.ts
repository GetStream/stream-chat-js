import type {
  DeleteMessageOptions,
  LocalMessage,
  MessageResponse,
  StreamAPIError,
} from '../types';
import { formatMessage } from '../utils';
import type { MessageOperationSpec, OperationKind, OperationParams } from './types';

export type MessageOperationStatePolicyContext = {
  ingest: (m: LocalMessage) => void;
  get: (id: string) => LocalMessage | undefined;
  remove: (id: string) => void;
  persist: (m: LocalMessage) => void;
  purge: (id: string) => void;
  isQueued: (messageId: string) => Promise<boolean>;
};

/**
 * What {@link MessageOperationStatePolicy.optimistic} wrote, handed back to
 * {@link MessageOperationStatePolicy.failure} so it can decide whether to revert and to what.
 */
export type OptimisticOutcome = {
  /**
   * The exact object the optimistic step wrote. Used as a concurrency guard rather than a value:
   * `EntityStore.upsert` REPLACES the canonical copy, so `get(id) === applied` is a sound "nothing
   * else has written since" check, and anything else means a fresher truth (a WS event, another
   * operation) landed and must not be clobbered by a revert.
   */
  applied?: LocalMessage;
  /** The copy that was there beforehand, i.e. what a revert restores. */
  previous?: LocalMessage;
};

const parseError = (error: unknown): StreamAPIError => {
  const stringError = JSON.stringify(error);
  return (stringError ? JSON.parse(stringError) : {}) as StreamAPIError;
};

const isAlreadyExistsError = (error: unknown, parsed: StreamAPIError) =>
  parsed.code === 4 && error instanceof Error && error.message.includes('already exists');

const isHardDelete = (options: unknown) =>
  !!(options as DeleteMessageOptions | undefined)?.hard;

/**
 * The local-state half of every message operation: what to show before the request resolves, what to
 * do with the server's answer, and what to do when it fails.
 *
 * Per-operation rather than uniform, because the three kinds want genuinely different things:
 *
 * - **send / retry** — optimistically `sending`, `failed` on failure, and a pessimistic write-ahead to
 *   the offline DB so a process death between compose and server-ack leaves a message that hydrates as
 *   failed-and-retryable instead of vanishing.
 * - **update** — optimistically applied and persisted, and **never reverted**: rolling back would
 *   destroy text the user typed. A definitive rejection surfaces as a failed/error state on the message
 *   while keeping the edit; a queued (offline) failure surfaces as nothing at all, because the edit is
 *   pending, not failed.
 * - **delete** — optimistically marked `deleted` (or removed outright, for a hard delete), and
 *   **reverted** on a definitive rejection: unlike an edit there is no user input to lose, and leaving a
 *   "Message deleted" placeholder on a message that still exists server-side is a lie that only
 *   self-corrects on the next query.
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

      // Nothing holds this message, so there is nothing to optimistically hide — and ingesting would
      // insert a phantom "Message deleted" row for something that was never on screen. Nothing is
      // written to the offline DB either: it mirrors local state, so it must not be told about state
      // that does not exist. The server response still reconciles normally below.
      if (!previous) return {};

      const applied: LocalMessage = {
        ...localMessage,
        deleted_at: new Date(),
        type: 'deleted',
        ...(deleteForMe ? { deleted_for_me: true } : {}),
      };
      this.ctx.ingest(applied);
      this.ctx.persist(applied);
      return { applied, previous };
    }

    if (kind === 'update') {
      // Preserve the status: an edit must not turn a received message into `sending`, and an edit of a
      // message that never left the device has to stay `failed`.
      const isFailed = localMessage.status === 'failed';
      const editedAt = new Date();
      const applied: LocalMessage = {
        ...localMessage,
        error: isFailed ? localMessage.error : undefined,
        updated_at: editedAt,
        // `message_text_updated_at` is what drives the "edited" indicator, so it has to appear
        // immediately — but only for a message the server has actually seen. A failed message never
        // received a server-confirmed text update and must not appear to have had one.
        ...(isFailed ? {} : { message_text_updated_at: editedAt }),
      };
      this.ctx.ingest(applied);
      this.ctx.persist(applied);
      return { applied, previous };
    }

    const applied: LocalMessage = {
      ...localMessage,
      error: undefined,
      status:
        !localMessage.status || localMessage.status === 'failed'
          ? 'sending'
          : localMessage.status,
    };
    this.ctx.ingest(applied);
    // Write-ahead, pessimistically FAILED. If the app dies between here and the server's ack the
    // message comes back as failed and retryable rather than disappearing; a success overwrites it
    // below. The retry payload does not need persisting alongside it — `MessageOperations.retry`
    // reconstructs it from the message when `failedSendCache` is cold.
    this.ctx.persist({ ...applied, status: 'failed' });
    return { applied, previous };
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
    // Guard before anything else. `formatMessage(undefined)` does not throw — it yields
    // `{ status: 'received', created_at: <now>, updated_at: <now> }`, an id-less message whose
    // `updated_at` beats the freshness check below, so without this an empty response ingested junk.
    if (!messageFromResponse) return;

    const formatted = formatMessage({ ...messageFromResponse, status: 'received' });

    if (kind === 'delete') {
      if (isHardDelete(options)) {
        this.ctx.remove(messageId);
        this.ctx.purge(messageId);
        return;
      }
      this.ctx.ingest(formatted);
      this.ctx.persist(formatted);
      return;
    }

    const existing = this.ctx.get(messageId);

    const nothingWroteSinceOptimisticEdit =
      kind === 'update' && !!optimistic?.applied && existing === optimistic.applied;

    // Only reached when something else did write and then both copies are server-derived, so
    // comparing their timestamps is comparing one clock against itself.
    const serverNewer =
      !existing || formatted.updated_at.getTime() > existing.updated_at.getTime();
    const serverSameOrNewer =
      !existing || formatted.updated_at.getTime() >= existing.updated_at.getTime();
    const existingIsOurOptimisticSend = existing?.status === 'sending';

    const applyServerCopy =
      nothingWroteSinceOptimisticEdit ||
      serverNewer ||
      (existingIsOurOptimisticSend && serverSameOrNewer);

    if (applyServerCopy) {
      this.ctx.ingest(formatted);
    }

    if (kind === 'update') {
      // Persist only what we actually applied, so the row can never disagree with memory.
      if (applyServerCopy) this.ctx.persist(formatted);
      return;
    }

    // Unconditional for send/retry: the optimistic step wrote a pessimistic `failed` row, so skipping
    // this would leave a delivered message hydrating as failed after a restart.
    this.ctx.persist(formatted);
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

    // Queued for replay: pending, not failed. Leave the optimistic state exactly as it stands.
    //
    // Deliberately scoped to update/delete. A send that never reached the server has to settle as
    // `failed` even when its task is queued, because the retry affordance is the only way the user can
    // get that message out — this is the v9 behaviour, and treating a queued send as merely "pending"
    // would leave it spinning forever.
    const queued =
      kind !== 'send' && kind !== 'retry' && (await this.ctx.isQueued(messageId));

    if (kind === 'delete') {
      if (!queued) this.revertDelete({ messageId, optimistic, options });
      return;
    }

    if (kind === 'update') {
      if (queued) return;
      // The edit itself is kept — only the failure is recorded on top of it. NOTE: this lights up the
      // retry affordance, which re-SENDS rather than re-edits; that predates this change and is
      // deliberately left alone.
      const failed: LocalMessage = {
        ...(this.ctx.get(messageId) ?? localMessage),
        error: parsed,
        status: 'failed',
      };
      this.ctx.ingest(failed);
      this.ctx.persist(failed);
      return;
    }

    const failed: LocalMessage = { ...localMessage, error: parsed, status: 'failed' };
    this.ctx.ingest(failed);
    this.ctx.persist(failed);
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
    // Nothing was held locally, so the optimistic step changed nothing to put back.
    if (!previous) return;

    if (isHardDelete(options)) {
      // A hard delete took the message out of local state, so there is no current copy to compare
      // against — the snapshot is unambiguously what belongs there.
      this.ctx.ingest(previous);
      this.ctx.persist(previous);
      return;
    }

    if (optimistic?.applied && this.ctx.get(messageId) !== optimistic.applied) return;

    this.ctx.ingest(previous);
    // Undoes the row the optimistic step soft-deleted: the upsert rewrites `type` and `deletedAt` from
    // the restored message.
    this.ctx.persist(previous);
  }
}
