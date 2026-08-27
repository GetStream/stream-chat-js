import { describe, expect, it, vi } from 'vitest';
import {
  applyMessageChangeLocally,
  isQueuedForReplay,
  REMOVE_MESSAGE,
} from '../../../src/messageOperations/optimistic';
import type { StreamChat } from '../../../src/client';
import type {
  LocalMessageChange,
  LocalMessageAccessor,
} from '../../../src/messageOperations/optimistic';
import type { LocalMessage } from '../../../src/types';

const message = (overrides?: Partial<LocalMessage>): LocalMessage =>
  ({
    created_at: new Date(),
    id: 'm1',
    text: 'hi',
    type: 'regular',
    updated_at: new Date(),
    ...overrides,
  }) as LocalMessage;

const makeState = (seed?: LocalMessage) => {
  const store = new Map<string, LocalMessage>();
  if (seed) store.set(seed.id, seed);

  const state: LocalMessageAccessor = {
    get: (id) => store.get(id),
    ingest: (m) => {
      store.set(m.id, m);
    },
    remove: (id) => {
      store.delete(id);
    },
  };

  return { state, store };
};

describe('applyMessageChangeLocally', () => {
  it('writes what produce returns, and hands back an undo', () => {
    const { state, store } = makeState(message({ text: 'before' }));

    const undo = applyMessageChangeLocally(state, {
      messageId: 'm1',
      produce: (current) => ({ ...current!, text: 'after' }),
    });

    expect(store.get('m1')?.text).toBe('after');
    expect(typeof undo).toBe('function');
  });

  it('hands produce the copy currently held', () => {
    const existing = message();
    const { state } = makeState(existing);
    const produce = vi.fn(() => undefined);

    applyMessageChangeLocally(state, { messageId: 'm1', produce });

    expect(produce).toHaveBeenCalledWith(existing);
  });

  it('does nothing when produce declines the change', () => {
    const { state, store } = makeState();
    const change = applyMessageChangeLocally(state, {
      messageId: 'm1',
      produce: () => undefined,
    });

    expect(change).toBeUndefined();
    expect(store.size).toBe(0);
  });

  describe('undo', () => {
    it('restores the previous copy and reports that it reverted', () => {
      const existing = message({ text: 'before' });
      const { state, store } = makeState(existing);

      const undo = applyMessageChangeLocally(state, {
        messageId: 'm1',
        produce: (current) => ({ ...current!, text: 'after' }),
      });

      expect(undo?.()).toBe(true);
      expect(store.get('m1')).toBe(existing);
    });

    it('does not clobber a fresher copy that landed while the request was in flight', () => {
      const { state, store } = makeState(message({ text: 'before' }));

      const undo = applyMessageChangeLocally(state, {
        messageId: 'm1',
        produce: (current) => ({ ...current!, text: 'after' }),
      });

      const fromWebsocket = message({ text: 'from WS' });
      state.ingest(fromWebsocket);

      expect(undo?.()).toBe(false);
      expect(store.get('m1')).toBe(fromWebsocket);
    });

    it('removes a message it added, when there was nothing to restore', () => {
      const { state, store } = makeState();

      const undo = applyMessageChangeLocally(state, {
        messageId: 'm1',
        produce: () => message({ text: 'optimistic' }),
      });

      expect(store.has('m1')).toBe(true);
      expect(undo?.()).toBe(true);
      expect(store.has('m1')).toBe(false);
    });
  });

  describe('REMOVE_MESSAGE', () => {
    it('removes the message and puts it back on undo', () => {
      const existing = message();
      const { state, store } = makeState(existing);

      const undo = applyMessageChangeLocally(state, {
        messageId: 'm1',
        produce: () => REMOVE_MESSAGE,
      });

      expect(store.has('m1')).toBe(false);
      expect(undo?.()).toBe(true);
      expect(store.get('m1')).toBe(existing);
    });

    it('is a no-op when nothing was held', () => {
      const { state } = makeState();
      const remove = vi.spyOn(state, 'remove');

      expect(
        applyMessageChangeLocally(state, {
          messageId: 'm1',
          produce: () => REMOVE_MESSAGE,
        }),
      ).toBeUndefined();
      expect(remove).not.toHaveBeenCalled();
    });
  });
});

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
