import { chatLoggerSystem } from '../logger';
import { formatMessage } from '../utils';
import type { Channel } from '../channel';
import type { StreamChat } from '../client';
import type { PendingTask, PendingTaskOf, QueueableResult, QueueableType } from './types';

const logger = chatLoggerSystem.getLogger('offline-db');

/**
 * How one queued operation runs, on a first attempt and on a replay.
 *
 * @internal
 */
export type QueueableOperation<T extends QueueableType> = {
  /** How a failed queueing attempt is logged. */
  logFailureAs: { message: string; method: string };
  /** Whether a replay needs the channel. Such a task is only queued with a channel type and id. */
  needsChannel: boolean;
  /**
   * Performs the request. `channel` is the instance the caller already holds (a first attempt); a
   * replay has none and resolves it from the task.
   */
  run: (params: {
    channel?: Channel;
    client: StreamChat;
    task: PendingTaskOf<T>;
  }) => Promise<QueueableResult<T>>;
  /** Settles local state after a replay only: a first attempt has an optimistic layer for it. */
  onReplay?: (params: {
    client: StreamChat;
    result: QueueableResult<T>;
    task: PendingTaskOf<T>;
  }) => void;
};

/**
 * The caller's channel when it has one, else the one resolved from the task. The caller's instance
 * is preferred because `channelManager.ensure` constructs a new `Channel` when none is stored (or
 * it is `pendingDisposal`).
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
 * One entry per queueable operation.
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
    // A replayed send is the first time local state learns the message exists server-side.
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
 * Queues the task in the offline DB so it replays on reconnect, and runs the request directly when
 * there is no offline DB, `queue` is `false`, the task is not replayable, or queueing rejects.
 *
 * A queueing failure is logged and falls through to the direct call, which can repeat a request
 * that already reached the server.
 *
 * @internal
 *
 * @param params.channel - The caller's channel instance, so a first attempt runs on that object.
 * @param params.queue - `false` for a send with no message id (nothing to key a queue entry on).
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
  // A task that could not be replayed is not queued, but still runs so the request reports why.
  const replayable = !operation.needsChannel || !!(task.channelType && task.channelId);

  if (offlineDb && queue && replayable) {
    try {
      return await offlineDb.queueTask<QueueableResult<T>>({ task });
    } catch (error) {
      const { message, method } = operation.logFailureAs;
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
 * Runs a task through its operation, for a first attempt and for a replay.
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

  // A payload read back from the offline DB went through JSON, which turns an omitted argument into
  // `null`, and optional or defaulted parameters only accept `undefined`.
  const payload = task.payload.map(
    (arg) => arg ?? undefined,
  ) as PendingTaskOf<T>['payload'];

  return await operation.run({ channel, client, task: { ...task, payload } });
};

/**
 * Whether this message has a mutation of one of `types` waiting in the offline queue. A queued
 * mutation is pending, not failed.
 *
 * It reads the queue because the queue can decline a task (for example an `update-message` refused
 * by `isMessageUpdateReplayable`), which the error alone cannot tell. `queueTask` awaits
 * `handleAddPendingTask` before it rethrows, so the row exists by the time an operation's `catch`
 * runs.
 */
export const isQueuedForReplay = async (
  client: StreamChat,
  messageId: string,
  types: readonly QueueableType[],
): Promise<boolean> => {
  const { offlineDb } = client;
  // A DB whose `init()` never succeeded cannot hold a pending task.
  if (!offlineDb?.state.getLatestValue().initialized) return false;

  // `getPendingTasks` is implemented by the integrator, so the return is not assumed well-formed.
  const pending = await offlineDb.getPendingTasks({ messageId });

  return !!pending?.some((task) => types.includes(task.type));
};
