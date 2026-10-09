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
  /**
   * Whether a replay has to look the channel up from the task. Such a task is only queued when it
   * carries `channelId` and `channelType`, because without them it could never be replayed.
   */
  needsChannel: boolean;
  /**
   * Performs the request. Used both for a first attempt and for a replay.
   *
   * `channel` is the instance the CALLER already holds, when there is one. A first attempt comes from a
   * channel's or thread's `messageOperations`, or a `Channel` method such as `createDraft`, and must run
   * on that exact channel; only a replay has to look one up.
   */
  run: (params: {
    channel?: Channel;
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
 * The channel an operation runs on: the caller's own instance when it has one, and otherwise resolved
 * from the task.
 *
 * Preferring the caller's instance is not an optimisation. `client.channelManager.ensure()` returns the stored
 * instance only while it is in the channel store and not `pendingDisposal` — otherwise it CONSTRUCTS a
 * new `Channel`, which builds paginators and a composer and registers subscriptions. A first attempt
 * always has the real instance in hand, so it should never risk that.
 *
 * A replay has no instance, so it resolves from the task. Every channel-scoped operation carries
 * `channelType`/`channelId`; a task that reached the queue without them cannot be replayed at all.
 */
const channelOf = (client: StreamChat, task: PendingTask, channel?: Channel): Channel => {
  if (channel) return channel;

  const { channelId, channelType } = task;
  if (!channelType || !channelId) {
    throw new Error(
      `Cannot replay a "${task.type}" task without a channel type and id (message: ${task.messageId}).`,
    );
  }
  return client.channelManager.ensure({ type: channelType, id: channelId });
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
    needsChannel: true,
    logFailureAs: {
      message: 'Creating the draft in the offline database failed.',
      method: 'createDraft',
    },
    run: ({ channel, client, task }) =>
      channelOf(client, task, channel)._createDraft(...task.payload),
  },
  'delete-draft': {
    needsChannel: true,
    logFailureAs: {
      message: 'Deleting the draft from the offline database failed.',
      method: 'deleteDraft',
    },
    run: ({ channel, client, task }) =>
      channelOf(client, task, channel)._deleteDraft(...task.payload),
  },
  'delete-message': {
    needsChannel: false,
    logFailureAs: { message: 'Deleting the message failed.', method: 'deleteMessage' },
    run: ({ client, task }) => client.deleteMessage(...task.payload),
  },
  'delete-reaction': {
    needsChannel: false,
    logFailureAs: { message: 'Deleting the reaction failed.', method: 'deleteReaction' },
    run: ({ client, task }) => client.deleteReaction(...task.payload),
  },
  'send-message': {
    needsChannel: true,
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
        client.threads.get(message.parent_id)?.upsertReplyLocally({
          message,
          timestampChanged: true,
        });
      }
      channelOf(client, task).messagePaginator.trackLastMessage(formatMessage(message));
    },
    run: ({ channel, client, task }) =>
      channelOf(client, task, channel).sendMessage(...task.payload),
  },
  'send-reaction': {
    needsChannel: false,
    logFailureAs: { message: 'Sending the reaction failed.', method: 'sendReaction' },
    run: ({ client, task }) => client.sendReaction(...task.payload),
  },
  'update-message': {
    needsChannel: false,
    logFailureAs: { message: 'Updating the message failed.', method: 'updateMessage' },
    run: ({ client, task }) => client.updateMessage(...task.payload),
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
 * @param params.channel - The channel instance the caller already holds, so a first attempt runs on
 *   that exact object rather than one `client.channelManager.ensure()` might reconstruct.
 * @param params.client - Resolves the operation, and carries the offline DB when one is registered.
 * @param params.queue - Whether this task can be queued at all. `false` for a send with no message id,
 *   which there is nothing to key a queue entry on — it still runs, just not through the queue.
 * @param params.task - Which operation to run, and the arguments to run it with.
 */
export const queueOrRun = async <T extends QueueableType>({
  channel,
  client,
  queue = true,
  task,
}: {
  channel?: Channel;
  client: StreamChat;
  queue?: boolean;
  task: PendingTaskOf<T>;
}): Promise<QueueableResult<T>> => {
  const { offlineDb } = client;
  const operation = QUEUEABLE_OPERATIONS[task.type];
  // We never queue a task that could not be replayed. It still runs once, so the request reports the
  // problem itself, i.e that the channel has no id yet.
  const replayable = !operation.needsChannel || !!(task.channelType && task.channelId);

  if (offlineDb && queue && replayable) {
    try {
      return await offlineDb.queueTask<QueueableResult<T>>({ task });
    } catch (error) {
      const { message, method } = operation.logFailureAs;
      // The cid comes from the task when it carries a channel, so a channel-scoped failure is logged
      // against its channel without the caller having to say so.
      const cid =
        task.channelType && task.channelId
          ? [`${task.channelType}:${task.channelId}`]
          : [];
      logger.withExtraTags(method, ...cid).error(message, { error });
    }
  }

  return await runQueueableOperation({ channel, client, task });
};

/**
 * Resolves a task to its operation and runs it. Shared by a first attempt and by a replay.
 *
 * @internal
 */
export const runQueueableOperation = async <T extends QueueableType>({
  channel,
  client,
  task,
}: {
  channel?: Channel;
  client: StreamChat;
  task: PendingTaskOf<T>;
}): Promise<QueueableResult<T>> => {
  const operation = QUEUEABLE_OPERATIONS[task.type] as QueueableOperation<T> | undefined;

  if (!operation) {
    throw new Error(
      `Tried to execute invalid pending task type (${task.type}) while synchronizing the database.`,
    );
  }

  // A payload read back from the offline DB went through JSON, which turns an omitted argument -
  // say no `request` between `pathParams` and `requestOptions` - into `null`, and an optional or
  // defaulted parameter only stands in for `undefined`.
  const payload = task.payload.map(
    (arg) => arg ?? undefined,
  ) as PendingTaskOf<T>['payload'];

  return await operation.run({ channel, client, task: { ...task, payload } });
};

/**
 * Whether this message's mutation is sitting in the offline queue waiting to be replayed. A queued
 * mutation is pending, not failed: nothing to roll back and nothing to mark.
 *
 * Reads the queue. Inferring it from the error's shape ("an initialized offline DB plus an
 * `isEphemeral` error, so it must have been queued") over-reports, because the queue declines
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
