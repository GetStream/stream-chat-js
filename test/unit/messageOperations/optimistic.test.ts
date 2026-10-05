import { describe, expect, it, vi } from 'vitest';
import { isQueuedForReplay } from '../../../src/messageOperations/optimistic';
import type { StreamChat } from '../../../src/client';

describe('isQueuedForReplay', () => {
  const clientWith = (pending: unknown, initialized = true) =>
    ({
      offlineDb: {
        getPendingTasks: vi.fn(async () => pending),
        state: { getLatestValue: () => ({ initialized }) },
      },
    }) as unknown as StreamChat;

  it('is queued when the table holds a task of one of the given types', async () => {
    const client = clientWith([{ id: 1, type: 'update-message' }]);

    await expect(isQueuedForReplay(client, 'm1', ['update-message'])).resolves.toBe(true);
    expect(client.offlineDb?.getPendingTasks).toHaveBeenCalledWith({ messageId: 'm1' });
  });

  // Every task type shares the `messageId` column, so the table answering "yes, something" says
  // nothing about whether THIS operation was queued. A reaction the user made moments earlier would
  // otherwise report a refused edit as pending — and nothing would ever replay it.
  it('is NOT queued when the only task for the message belongs to another operation', async () => {
    const client = clientWith([{ id: 1, type: 'send-reaction' }]);

    await expect(isQueuedForReplay(client, 'm1', ['update-message'])).resolves.toBe(
      false,
    );
  });

  it('picks its own task out of a mixed queue', async () => {
    const client = clientWith([
      { id: 1, type: 'send-reaction' },
      { id: 2, type: 'delete-message' },
    ]);

    await expect(isQueuedForReplay(client, 'm1', ['delete-message'])).resolves.toBe(true);
    await expect(isQueuedForReplay(client, 'm1', ['update-message'])).resolves.toBe(
      false,
    );
  });

  it('is NOT queued when the table holds nothing — regardless of how retryable the error looked', async () => {
    // The case the old inference got wrong: the queue declined the task (an `update-message` still
    // pointing at a local attachment URL), so the edit must settle as a genuine failure.
    await expect(
      isQueuedForReplay(clientWith([]), 'm1', ['update-message']),
    ).resolves.toBe(false);
  });

  it('reports not-queued when there is no initialized offline DB to queue into', async () => {
    await expect(
      isQueuedForReplay({} as StreamChat, 'm1', ['update-message']),
    ).resolves.toBe(false);
    await expect(
      isQueuedForReplay(clientWith([{ id: 1, type: 'update-message' }], false), 'm1', [
        'update-message',
      ]),
    ).resolves.toBe(false);
  });

  it('tolerates an implementation that returns nothing', async () => {
    await expect(
      isQueuedForReplay(clientWith(undefined), 'm1', ['update-message']),
    ).resolves.toBe(false);
  });
});
