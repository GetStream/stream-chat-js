import { chatLoggerSystem } from '../logger';
import { formatMessage } from '../utils';
import type { Channel } from '../channel';
import type { StreamChat } from '../client';
import type { PendingTask, PendingTaskOf, QueueableResult, QueueableType } from './types';

/**
 * How one queued operation is replayed, and what a replay does beyond the request itself.
 *
 * `run` is typed from {@link QueueableOperationSignatures}, so an entry cannot resolve to the wrong
 * method or spread the wrong payload into it.
 *
 * @internal
 */
const logger = chatLoggerSystem.getLogger('offline-db');

export type QueueableOperation<T extends QueueableType> = {
  /**
   * How a failed QUEUEING attempt is logged. Declared per operation rather than passed in per call,
   * because the wording is a property of the operation, not of the caller — and the caller is then left
   * saying only which operation it wants.
   */
  logFailureAs: { message: string; method: string };
  /** Performs the request. Used both for a first attempt and for a replay. */
  run: (params: {
    client: StreamChat;
    task: PendingTaskOf<T>;
  }) => Promise<QueueableResult<T>>;
  /**
   * Local state to settle AFTER a replay, and only after a replay — a first attempt has an optimistic
   * layer above it that already owns this. Declared per operation rather than hidden in a branch,
   * because "a replay does more than a first attempt" is the kind of asymmetry that goes unnoticed.
   */
  onReplay?: (params: {
    client: StreamChat;
    result: QueueableResult<T>;
    task: PendingTaskOf<T>;
  }) => void;
};

/**
 * A task's channel. Every channel-scoped operation carries `channelType`/`channelId`, and a task that
 * somehow reached the queue without them cannot be replayed at all.
 */
const channelOf = (client: StreamChat, task: PendingTask): Channel => {
  const { channelId, channelType } = task;
  if (!channelType || !channelId) {
    throw new Error(
      `Cannot replay a "${task.type}" task without a channel type and id (message: ${task.messageId}).`,
    );
  }
  return client.channel(channelType, channelId);
};

/**
 * The registry: one entry per queueable operation, and the mapped type means a missing entry does not
 * compile.
 *
 * @internal
 */
export const QUEUEABLE_OPERATIONS: {
  [T in QueueableType]: QueueableOperation<T>;
} = {
  'create-draft': {
    logFailureAs: {
      message: 'Creating the draft in the offline database failed.',
      method: 'createDraft',
    },
    run: ({ client, task }) => channelOf(client, task)._createDraft(...task.payload),
  },
  'delete-draft': {
    logFailureAs: {
      message: 'Deleting the draft from the offline database failed.',
      method: 'deleteDraft',
    },
    run: ({ client, task }) => channelOf(client, task)._deleteDraft(...task.payload),
  },
  'delete-message': {
    logFailureAs: { message: 'Deleting the message failed.', method: 'deleteMessage' },
    run: ({ client, task }) => client._deleteMessage(...task.payload),
  },
  'delete-reaction': {
    logFailureAs: { message: 'Deleting the reaction failed.', method: 'deleteReaction' },
    run: ({ client, task }) => channelOf(client, task)._deleteReaction(...task.payload),
  },
  'send-message': {
    logFailureAs: { message: 'Sending the message failed.', method: 'sendMessage' },
    /**
     * A replayed send is the first time local state learns the message exists server-side: the
     * optimistic layer that would normally reconcile it belongs to a `MessageOperations` call that
     * finished (and failed) long ago.
     */
    onReplay: ({ client, result, task }) => {
      const message = result?.message;
      if (!message) return;

      if (message.parent_id) {
        client.threads.threadsById[message.parent_id]?.upsertReplyLocally({
          message,
          timestampChanged: true,
        });
      }
      channelOf(client, task).messagePaginator.trackLastMessage(formatMessage(message));
    },
    run: ({ client, task }) => channelOf(client, task)._sendMessage(...task.payload),
  },
  'send-reaction': {
    logFailureAs: { message: 'Sending the reaction failed.', method: 'sendReaction' },
    run: ({ client, task }) => channelOf(client, task)._sendReaction(...task.payload),
  },
  'update-message': {
    logFailureAs: { message: 'Updating the message failed.', method: 'updateMessage' },
    run: ({ client, task }) => client._updateMessage(...task.payload),
  },
};

/**
 * The shape every offline-aware request shares: try it through the pending-task queue so it can be
 * replayed on reconnect, and otherwise — no offline DB, queueing not possible, or the queued attempt
 * rejected — run it directly.
 *
 * Both paths resolve through {@link QUEUEABLE_OPERATIONS}, so "what this task actually runs" is defined
 * once. Before, the caller passed its own direct call alongside the task, which meant the first attempt
 * and the replay were two independent statements of the same thing.
 *
 * Note the direct call is BOTH the no-offline-DB path — its actual purpose — and, on a queue failure, a
 * second attempt at a request that may already have reached the server. That predates this helper and
 * is unchanged by it; having one place to fix it is a reason this exists.
 *
 * A failed queueing attempt is logged, not rethrown: falling back to running the request directly is
 * the point. What it is logged as comes off the operation's own `logFailureAs`, so a caller says which
 * operation it wants and nothing about how to describe it.
 *
 * @internal
 *
 * @param params.client - Resolves the operation, and carries the offline DB when one is registered.
 * @param params.queue - Whether this task can be queued at all. `false` for a send with no message id,
 *   which there is nothing to key a queue entry on — it still runs, just not through the queue.
 * @param params.task - Which operation to run, and the arguments to run it with.
 */
export const queueOrRun = async <T extends QueueableType>({
  client,
  queue = true,
  task,
}: {
  client: StreamChat;
  queue?: boolean;
  task: PendingTaskOf<T>;
}): Promise<QueueableResult<T>> => {
  const { offlineDb } = client;

  if (offlineDb && queue) {
    try {
      return await offlineDb.queueTask<QueueableResult<T>>({ task });
    } catch (error) {
      const { message, method } = QUEUEABLE_OPERATIONS[task.type].logFailureAs;
      // The cid comes from the task when it carries a channel, so a channel-scoped failure is logged
      // against its channel without the caller having to say so.
      const cid =
        task.channelType && task.channelId
          ? [`${task.channelType}:${task.channelId}`]
          : [];
      logger.withExtraTags(method, ...cid).error(message, { error });
    }
  }

  return await runQueueableOperation({ client, task });
};

/**
 * Resolves a task to its operation and runs it. Shared by a first attempt and by a replay.
 *
 * @internal
 */
export const runQueueableOperation = async <T extends QueueableType>({
  client,
  task,
}: {
  client: StreamChat;
  task: PendingTaskOf<T>;
}): Promise<QueueableResult<T>> => {
  const operation = QUEUEABLE_OPERATIONS[task.type] as QueueableOperation<T> | undefined;

  if (!operation) {
    throw new Error(
      `Tried to execute invalid pending task type (${task.type}) while synchronizing the database.`,
    );
  }

  return await operation.run({ client, task });
};
