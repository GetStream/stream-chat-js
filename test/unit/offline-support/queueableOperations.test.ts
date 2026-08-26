import { describe, expect, it, vi } from 'vitest';
import { chatLoggerSystem } from '../../../src/logger';
import {
  QUEUEABLE_OPERATIONS,
  queueOrRun,
  runQueueableOperation,
} from '../../../src/offline-support/queueableOperations';
import type { PendingTask, PendingTaskTypes, StreamChat } from '../../../src';

/**
 * `queueOrRun` resolves BOTH paths — queued and direct — through {@link QUEUEABLE_OPERATIONS}, so a
 * first attempt and a replay cannot describe different requests. These tests drive it through the
 * registry rather than a hand-supplied call, which is the point of the registry existing.
 */
const task = {
  channelId: 'general',
  channelType: 'messaging',
  messageId: 'm1',
  payload: [{ id: 'm1' }],
  type: 'delete-message',
} as unknown as PendingTask;

const makeClient = ({
  deleteMessage = vi.fn(async () => ({ message: { id: 'm1' } })),
  offlineDb,
}: {
  deleteMessage?: () => Promise<unknown>;
  offlineDb?: unknown;
} = {}) => ({ _deleteMessage: deleteMessage, offlineDb }) as unknown as StreamChat;

const dbThatQueues = (result: unknown) => ({ queueTask: vi.fn(async () => result) });

const dbThatRejects = (error = new Error('offline')) => ({
  queueTask: vi.fn(async () => {
    throw error;
  }),
});

describe('QUEUEABLE_OPERATIONS', () => {
  it('has a resolver for every queueable task type', () => {
    // The mapped type makes a missing entry a compile error; this guards the other direction, i.e. a
    // resolver quietly dropped from the object.
    const declared: Array<PendingTaskTypes[keyof PendingTaskTypes]> = [
      'create-draft',
      'delete-draft',
      'delete-message',
      'delete-reaction',
      'send-message',
      'send-reaction',
      'update-message',
    ];

    expect(Object.keys(QUEUEABLE_OPERATIONS).sort()).toEqual([...declared].sort());
    for (const type of declared) {
      expect(typeof QUEUEABLE_OPERATIONS[type].run).toBe('function');
    }
  });

  it('declares replay-only follow-up work for send-message alone', () => {
    // A first attempt has an optimistic layer above it that settles local state; a replay does not.
    const withOnReplay = Object.entries(QUEUEABLE_OPERATIONS)
      .filter(([, operation]) => operation.onReplay)
      .map(([type]) => type);

    expect(withOnReplay).toEqual(['send-message']);
  });
});

describe('runQueueableOperation', () => {
  it('resolves the task to its operation and runs it with the payload', async () => {
    const deleteMessage = vi.fn(async () => ({ message: { id: 'm1' } }));
    const client = makeClient({ deleteMessage });

    await runQueueableOperation({ client, task });

    expect(deleteMessage).toHaveBeenCalledWith({ id: 'm1' });
  });

  it('throws for a task type it has no resolver for', async () => {
    await expect(
      runQueueableOperation({
        client: makeClient(),
        task: { ...task, type: 'not-a-task' } as unknown as PendingTask,
      }),
    ).rejects.toThrow(/invalid pending task type/);
  });
});

/**
 * Which channel instance an operation runs on.
 *
 * `client.channel()` returns the cached instance only while it is in `activeChannels` and not
 * `pendingDisposal` — otherwise it CONSTRUCTS one, paginators and subscriptions included. A first
 * attempt always has the real instance in hand, so it must never go through that lookup.
 */
describe('channel resolution', () => {
  const reactionTask = {
    channelId: 'general',
    channelType: 'messaging',
    messageId: 'm1',
    payload: [{ id: 'm1', reaction: { type: 'love' } }],
    type: 'send-reaction',
  } as unknown as PendingTask;

  it("runs on the caller's own channel instance, without looking one up", async () => {
    const callerChannel = { _sendReaction: vi.fn(async () => ({})) };
    const lookup = vi.fn();
    const client = { channel: lookup } as unknown as StreamChat;

    await runQueueableOperation({
      channel: callerChannel as never,
      client,
      task: reactionTask,
    });

    expect(callerChannel._sendReaction).toHaveBeenCalledWith({
      id: 'm1',
      reaction: { type: 'love' },
    });
    expect(lookup).not.toHaveBeenCalled();
  });

  it('resolves the channel from the task when there is no caller instance (a replay)', async () => {
    const resolved = { _sendReaction: vi.fn(async () => ({})) };
    const lookup = vi.fn(() => resolved);
    const client = { channel: lookup } as unknown as StreamChat;

    await runQueueableOperation({ client, task: reactionTask });

    expect(lookup).toHaveBeenCalledWith('messaging', 'general');
    expect(resolved._sendReaction).toHaveBeenCalledTimes(1);
  });

  it("still runs when the task carries no channel id, as long as the caller's instance is given", async () => {
    // A `Channel` with no id yet cannot key a task, but a direct send on it has always worked.
    const callerChannel = { _sendReaction: vi.fn(async () => ({})) };
    const client = { channel: vi.fn() } as unknown as StreamChat;

    await runQueueableOperation({
      channel: callerChannel as never,
      client,
      task: { ...reactionTask, channelId: undefined } as unknown as PendingTask,
    });

    expect(callerChannel._sendReaction).toHaveBeenCalledTimes(1);
  });

  it('throws for a replay of a channel-scoped task with no channel to resolve', async () => {
    await expect(
      runQueueableOperation({
        client: { channel: vi.fn() } as unknown as StreamChat,
        task: { ...reactionTask, channelId: undefined } as unknown as PendingTask,
      }),
    ).rejects.toThrow(/without a channel type and id/);
  });
});

describe('queueOrRun', () => {
  it('returns the queued result and never runs the operation directly', async () => {
    const deleteMessage = vi.fn(async () => ({ message: { id: 'm1' } }));
    const offlineDb = dbThatQueues('from queue');

    await expect(
      queueOrRun({
        client: makeClient({ deleteMessage, offlineDb }),
        task,
      }),
    ).resolves.toBe('from queue');
    expect(deleteMessage).not.toHaveBeenCalled();
  });

  it('runs the operation directly when there is no offline DB', async () => {
    const deleteMessage = vi.fn(async () => ({ message: { id: 'm1' } }));

    await queueOrRun({
      client: makeClient({ deleteMessage }),
      task,
    });

    expect(deleteMessage).toHaveBeenCalledTimes(1);
  });

  it('runs the operation without queueing when the task cannot be queued', async () => {
    // A send with no message id: it still has to go out, it just cannot be keyed in the queue.
    const deleteMessage = vi.fn(async () => ({ message: { id: 'm1' } }));
    const offlineDb = dbThatQueues('from queue');

    await queueOrRun({
      client: makeClient({ deleteMessage, offlineDb }),
      queue: false,
      task,
    });

    expect(offlineDb.queueTask).not.toHaveBeenCalled();
    expect(deleteMessage).toHaveBeenCalledTimes(1);
  });

  it('logs the queued failure as the operation declares, then runs it directly', async () => {
    const error = new Error('offline');
    const deleteMessage = vi.fn(async () => ({ message: { id: 'm1' } }));
    const sink = vi.fn();
    chatLoggerSystem.configureLoggers({ default: { level: 'trace', sink } });

    try {
      await queueOrRun({
        client: makeClient({ deleteMessage, offlineDb: dbThatRejects(error) }),
        task,
      });
    } finally {
      chatLoggerSystem.restoreDefaults();
    }

    // Wording comes off `QUEUEABLE_OPERATIONS['delete-message'].logFailureAs`, not the caller.
    expect(sink).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('Deleting the message failed.'),
      { error },
    );
    expect(deleteMessage).toHaveBeenCalledTimes(1);
  });

  it('propagates the direct attempt error, unlike the queued one', async () => {
    const directError = new Error('still offline');

    await expect(
      queueOrRun({
        client: makeClient({
          deleteMessage: async () => {
            throw directError;
          },
          offlineDb: dbThatRejects(),
        }),
        task,
      }),
    ).rejects.toBe(directError);
  });
});
