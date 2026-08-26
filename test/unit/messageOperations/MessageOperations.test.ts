import { describe, expect, it, vi } from 'vitest';
import { MessageOperations } from '../../../src/messageOperations/MessageOperations';
import type { LocalMessage, Message, MessageResponse } from '../../../src/types';

type Store = Map<string, LocalMessage>;

const makeLocalMessage = (overrides?: Partial<LocalMessage>): LocalMessage =>
  ({
    attachments: [],
    created_at: new Date(),
    deleted_at: null,
    id: 'm1',
    mentioned_users: [],
    pinned_at: null,
    reaction_groups: null,
    status: 'failed',
    text: 'hi',
    type: 'regular',
    updated_at: new Date(),
    ...overrides,
  }) as LocalMessage;

const makeMessageResponse = (overrides?: Partial<MessageResponse>): MessageResponse =>
  ({
    id: 'm1',
    text: 'hi',
    type: 'regular',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }) as MessageResponse;

/**
 * The local-state hooks the engine needs but most of these tests do not assert on.
 *
 * `isQueued: () => false` preserves the semantics these tests were written against: with no offline
 * queue behind it, every failure is a definitive rejection. The tests that care about the queued case
 * override it.
 */
const stateHooks = (store: Store) => ({
  isQueued: () => false,
  persist: () => {},
  purge: () => {},
  remove: (id: string) => store.delete(id),
});

const defaultDelete = async () => ({ message: makeMessageResponse({ id: 'm1' }) });

describe('MessageOperations', () => {
  it('marks optimistic message as sending, then ingests received response', async () => {
    const store: Store = new Map();

    const ops = new MessageOperations({
      ...stateHooks(store),
      ingest: (m) => store.set(m.id, m),
      get: (id) => store.get(id),
      handlers: () => ({}),
      defaults: {
        delete: defaultDelete,
        send: async () => ({ message: makeMessageResponse({ id: 'm1' }) }),
        update: async () => ({ message: makeMessageResponse({ id: 'm1' }) }),
      },
    });

    const localMessage = makeLocalMessage({ id: 'm1', status: 'failed' });
    await ops.send({ localMessage });

    expect(store.get('m1')?.status).toBe('received');
  });

  it('uses per-call requestFn override for send', async () => {
    const store: Store = new Map();

    const ops = new MessageOperations({
      ...stateHooks(store),
      ingest: (m) => store.set(m.id, m),
      get: (id) => store.get(id),
      handlers: () => ({}),
      defaults: {
        delete: defaultDelete,
        send: async () => ({ message: makeMessageResponse({ id: 'm1' }) }),
        update: async () => ({ message: makeMessageResponse({ id: 'm1' }) }),
      },
    });

    const localMessage = makeLocalMessage({ id: 'm1' });

    await ops.send({ localMessage }, async () => ({
      message: makeMessageResponse({ id: 'm1', text: 'override' }),
    }));

    expect(store.get('m1')?.text).toBe('override');
  });

  it('marks as received on duplicate send error (already exists)', async () => {
    const store: Store = new Map();

    const ops = new MessageOperations({
      ...stateHooks(store),
      ingest: (m) => store.set(m.id, m),
      get: (id) => store.get(id),
      handlers: () => ({}),
      defaults: {
        delete: defaultDelete,
        send: async () => {
          throw Object.assign(new Error('message already exists'), { code: 4 });
        },
        update: async () => ({ message: makeMessageResponse({ id: 'm1' }) }),
      },
    });

    const localMessage = makeLocalMessage({ id: 'm1', status: 'failed' });

    await expect(ops.send({ localMessage })).rejects.toThrow();
    expect(store.get('m1')?.status).toBe('received');
  });

  it('marks as failed on non-duplicate error', async () => {
    const store: Store = new Map();

    const ops = new MessageOperations({
      ...stateHooks(store),
      ingest: (m) => store.set(m.id, m),
      get: (id) => store.get(id),
      handlers: () => ({}),
      defaults: {
        delete: defaultDelete,
        send: async () => {
          throw new Error('nope');
        },
        update: async () => ({ message: makeMessageResponse({ id: 'm1' }) }),
      },
    });

    const localMessage = makeLocalMessage({ id: 'm1', status: 'failed' });

    await expect(ops.send({ localMessage })).rejects.toThrow('nope');
    expect(store.get('m1')?.status).toBe('failed');
  });

  it('reuses cached payload and options when retry is called without explicit params', async () => {
    const store: Store = new Map();
    const sendCalls: Array<{ message: Message; options: unknown }> = [];

    const ops = new MessageOperations({
      ...stateHooks(store),
      ingest: (m) => store.set(m.id, m),
      get: (id) => store.get(id),
      handlers: () => ({}),
      defaults: {
        delete: defaultDelete,
        send: async (message, options) => {
          sendCalls.push({ message, options });
          if (sendCalls.length === 1) {
            throw new Error('send failed');
          }
          return { message: makeMessageResponse({ id: 'm1', text: 'retried' }) };
        },
        update: async () => ({ message: makeMessageResponse({ id: 'm1' }) }),
      },
    });

    const localMessage = makeLocalMessage({ id: 'm1', text: 'local text' });
    const cachedMessage = {
      id: 'm1',
      text: 'cached text',
      type: 'regular',
    } as Message;
    const cachedOptions = { skip_push: true };

    await expect(
      ops.send({
        localMessage,
        message: cachedMessage,
        options: cachedOptions,
      }),
    ).rejects.toThrow('send failed');

    await ops.retry({ localMessage });

    expect(sendCalls[1].message).toEqual(cachedMessage);
    expect(sendCalls[1].options).toEqual(cachedOptions);
  });

  it('does not reuse expired cached payload and options', async () => {
    vi.useFakeTimers();
    try {
      const store: Store = new Map();
      const sendCalls: Array<{ message: Message; options: unknown }> = [];

      const ops = new MessageOperations({
        ...stateHooks(store),
        ingest: (m) => store.set(m.id, m),
        get: (id) => store.get(id),
        handlers: () => ({}),
        defaults: {
          delete: defaultDelete,
          send: async (message, options) => {
            sendCalls.push({ message, options });
            if (sendCalls.length === 1) {
              throw new Error('send failed');
            }
            return { message: makeMessageResponse({ id: 'm1', text: 'retried' }) };
          },
          update: async () => ({ message: makeMessageResponse({ id: 'm1' }) }),
        },
      });

      const localMessage = makeLocalMessage({ id: 'm1', text: 'local text' });
      const cachedMessage = {
        id: 'm1',
        text: 'cached text',
        type: 'regular',
      } as Message;
      const cachedOptions = { skip_push: true };

      await expect(
        ops.send({
          localMessage,
          message: cachedMessage,
          options: cachedOptions,
        }),
      ).rejects.toThrow('send failed');

      vi.advanceTimersByTime(5 * 60 * 1000 + 1);

      await ops.retry({ localMessage });

      expect(sendCalls[1].message.text).toBe('local text');
      expect(sendCalls[1].options).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
  });

  it('clears cached payload after successful retry', async () => {
    const store: Store = new Map();
    const sendCalls: Array<{ message: Message; options: unknown }> = [];

    const ops = new MessageOperations({
      ...stateHooks(store),
      ingest: (m) => store.set(m.id, m),
      get: (id) => store.get(id),
      handlers: () => ({}),
      defaults: {
        delete: defaultDelete,
        send: async (message, options) => {
          sendCalls.push({ message, options });
          if (sendCalls.length === 1) {
            throw new Error('send failed');
          }
          return {
            message: makeMessageResponse({ id: 'm1', text: `ok-${sendCalls.length}` }),
          };
        },
        update: async () => ({ message: makeMessageResponse({ id: 'm1' }) }),
      },
    });

    const localMessage = makeLocalMessage({ id: 'm1', text: 'local text' });
    const cachedMessage = {
      id: 'm1',
      text: 'cached text',
      type: 'regular',
    } as Message;
    const cachedOptions = { skip_push: true };

    await expect(
      ops.send({
        localMessage,
        message: cachedMessage,
        options: cachedOptions,
      }),
    ).rejects.toThrow('send failed');

    await ops.retry({ localMessage });
    await ops.retry({ localMessage });

    expect(sendCalls[1].message).toEqual(cachedMessage);
    expect(sendCalls[1].options).toEqual(cachedOptions);
    expect(sendCalls[2].message.text).toBe('local text');
    expect(sendCalls[2].options).toBeUndefined();
  });

  it('normalizes outgoing message for send', async () => {
    const store: Store = new Map();

    const ops = new MessageOperations({
      ...stateHooks(store),
      ingest: (m) => store.set(m.id, m),
      get: (id) => store.get(id),
      normalizeOutgoingMessage: (m) => ({ ...m, parent_id: 't1' }),
      handlers: () => ({
        send: async (p) => {
          expect(p.message?.parent_id).toBe('t1');
          return { message: makeMessageResponse({ id: p.localMessage.id }) };
        },
      }),
      defaults: {
        delete: defaultDelete,
        send: async () => ({ message: makeMessageResponse({ id: 'm1' }) }),
        update: async () => ({ message: makeMessageResponse({ id: 'm1' }) }),
      },
    });

    const localMessage = makeLocalMessage({ id: 'm1' });
    const message = { id: 'm1', text: 'hi' } as unknown as Message;

    await ops.send({ localMessage, message });
    expect(store.get('m1')?.status).toBe('received');
  });

  it('update passes only supported options (skip_enrich_url / skip_push) to defaults.update', async () => {
    const store: Store = new Map();

    let seenOptions: unknown = 'unset';

    const ops = new MessageOperations({
      ...stateHooks(store),
      ingest: (m) => store.set(m.id, m),
      get: (id) => store.get(id),
      handlers: () => ({}),
      defaults: {
        delete: defaultDelete,
        send: async () => ({ message: makeMessageResponse({ id: 'm1' }) }),
        update: async (_m, options) => {
          seenOptions = options;
          return { message: makeMessageResponse({ id: 'm1' }) };
        },
      },
    });

    const localMessage = makeLocalMessage({ id: 'm1', status: 'received' });

    await ops.update({
      localMessage,
      options: {
        // known fields
        skip_enrich_url: true,
        skip_push: false,
        // @ts-expect-error extra fields should be dropped by MessageOperations.update
        force_moderation: true,
      },
    });

    expect(seenOptions).toEqual({
      skip_enrich_url: true,
      skip_push: false,
    });
  });

  it('update passes undefined options to defaults.update when params.options is undefined', async () => {
    const store: Store = new Map();

    let seenOptions: unknown = 'unset';

    const ops = new MessageOperations({
      ...stateHooks(store),
      ingest: (m) => store.set(m.id, m),
      get: (id) => store.get(id),
      handlers: () => ({}),
      defaults: {
        delete: defaultDelete,
        send: async () => ({ message: makeMessageResponse({ id: 'm1' }) }),
        update: async (_m, options) => {
          seenOptions = options;
          return { message: makeMessageResponse({ id: 'm1' }) };
        },
      },
    });

    const localMessage = makeLocalMessage({ id: 'm1', status: 'received' });

    await ops.update({ localMessage });
    expect(seenOptions).toBeUndefined();
  });

  it('delete uses defaults.delete and ingests deleted message', async () => {
    const store: Store = new Map();
    const defaultsDelete = vi.fn(async () => ({
      message: makeMessageResponse({ id: 'm1', deleted_at: new Date().toISOString() }),
    }));

    const ops = new MessageOperations({
      ...stateHooks(store),
      ingest: (m) => store.set(m.id, m),
      get: (id) => store.get(id),
      handlers: () => ({}),
      defaults: {
        delete: defaultsDelete,
        send: async () => ({ message: makeMessageResponse({ id: 'm1' }) }),
        update: async () => ({ message: makeMessageResponse({ id: 'm1' }) }),
      },
    });

    const localMessage = makeLocalMessage({ id: 'm1', status: 'received' });
    await ops.delete({ localMessage });

    expect(defaultsDelete).toHaveBeenCalledWith('m1', undefined);
    expect(store.get('m1')?.deleted_at).toBeInstanceOf(Date);
  });

  it('delete uses per-call requestFn override', async () => {
    const store: Store = new Map();

    const ops = new MessageOperations({
      ...stateHooks(store),
      ingest: (m) => store.set(m.id, m),
      get: (id) => store.get(id),
      handlers: () => ({}),
      defaults: {
        delete: defaultDelete,
        send: async () => ({ message: makeMessageResponse({ id: 'm1' }) }),
        update: async () => ({ message: makeMessageResponse({ id: 'm1' }) }),
      },
    });

    const localMessage = makeLocalMessage({ id: 'm1', status: 'received' });

    await ops.delete({ localMessage }, async () => ({
      message: makeMessageResponse({
        id: 'm1',
        deleted_at: new Date().toISOString(),
        text: 'deleted via override',
      }),
    }));

    expect(store.get('m1')?.text).toBe('deleted via override');
    expect(store.get('m1')?.deleted_at).toBeInstanceOf(Date);
  });

  it('delete uses configured handlers.delete when provided', async () => {
    const store: Store = new Map();
    const configuredDelete = vi.fn(async () => ({
      message: makeMessageResponse({
        id: 'm1',
        deleted_at: new Date().toISOString(),
        text: 'deleted via configured handler',
      }),
    }));

    const ops = new MessageOperations({
      ...stateHooks(store),
      ingest: (m) => store.set(m.id, m),
      get: (id) => store.get(id),
      handlers: () => ({ delete: configuredDelete }),
      defaults: {
        delete: defaultDelete,
        send: async () => ({ message: makeMessageResponse({ id: 'm1' }) }),
        update: async () => ({ message: makeMessageResponse({ id: 'm1' }) }),
      },
    });

    const localMessage = makeLocalMessage({ id: 'm1', status: 'received' });
    await ops.delete({ localMessage, options: { hard: true } });

    expect(configuredDelete).toHaveBeenCalledWith({
      localMessage,
      options: { hard: true },
    });
    // A hard delete REMOVES the message rather than re-ingesting the response copy — the same branch
    // the `message.deleted` WS handler takes on `event.hard_delete`. Ingesting it (which is what this
    // used to assert) put a message the server had just destroyed back into the list.
    expect(store.has('m1')).toBe(false);
  });
});

describe('MessageOperations — optimistic lifecycle', () => {
  /**
   * A harness that records every hook the engine drives, so a test can assert on what was applied to
   * state, what was mirrored to the DB, and what was removed — without hand-building a context.
   */
  const harness = ({
    isQueued = false,
    seed,
  }: { isQueued?: boolean; seed?: LocalMessage } = {}) => {
    const store: Store = new Map();
    if (seed) store.set(seed.id, seed);
    const persisted: LocalMessage[] = [];
    const purged: string[] = [];
    const removed: string[] = [];

    const context = {
      defaults: {
        delete: defaultDelete,
        send: async () => ({ message: makeMessageResponse({ id: 'm1' }) }),
        update: async () => ({ message: makeMessageResponse({ id: 'm1' }) }),
      },
      get: (id: string) => store.get(id),
      handlers: () => ({}),
      ingest: (m: LocalMessage) => store.set(m.id, m),
      isQueued: () => isQueued,
      persist: (m: LocalMessage) => persisted.push(m),
      purge: (id: string) => purged.push(id),
      remove: (id: string) => {
        removed.push(id);
        store.delete(id);
      },
    };

    return {
      context,
      lastPersisted: () => persisted[persisted.length - 1],
      ops: new MessageOperations(context),
      persisted,
      purged,
      removed,
      store,
    };
  };

  const rejects = async (promise: Promise<unknown>) => {
    await expect(promise).rejects.toBeDefined();
  };

  describe('update', () => {
    it('applies and persists the edit, preserving the existing status', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received', text: 'before' });
      const { lastPersisted, ops, persisted, store } = harness({ seed });

      // The echo has to carry the edited text. The harness default does not, so whether the edit
      // survived came down to the optimistic write and the mocked response landing in the same
      // millisecond — a real server echoes what it stored.
      await ops.update({ localMessage: { ...seed, text: 'after' } }, async () => ({
        message: makeMessageResponse({ id: 'm1', text: 'after' }),
      }));

      // Status preservation is asserted on the optimistic write specifically: the server echo supplies
      // `received` of its own, so reading the final state could pass without preservation happening.
      expect(persisted[0].text).toBe('after');
      expect(persisted[0].status).toBe('received');
      expect(store.get('m1')?.text).toBe('after');
      expect(lastPersisted()?.text).toBe('after');
    });

    it('stamps message_text_updated_at so the "edited" indicator shows immediately', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received' });
      const { ops, persisted } = harness({ seed });

      await ops.update({ localMessage: { ...seed, text: 'after' } });

      // Asserted on the optimistic write specifically: the server echo would supply its own value, so
      // reading the final state could pass without the optimistic stamp ever existing.
      expect(persisted[0].message_text_updated_at).toBeInstanceOf(Date);
    });

    it('does not stamp message_text_updated_at when editing a failed message', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'failed' });
      const { ops, persisted } = harness({ seed });

      await rejects(
        ops.update({ localMessage: { ...seed, text: 'after' } }, async () => {
          throw new Error('nope');
        }),
      );

      // A message that never reached the server has no server-confirmed text update to advertise.
      expect(persisted[0].message_text_updated_at).toBeUndefined();
      expect(persisted[0].status).toBe('failed');
    });

    it('keeps the edit and does NOT mark it failed when the request was queued', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received', text: 'before' });
      const { ops, store } = harness({ isQueued: true, seed });

      await rejects(
        ops.update({ localMessage: { ...seed, text: 'after' } }, async () => {
          throw new Error('offline');
        }),
      );

      expect(store.get('m1')?.text).toBe('after');
      expect(store.get('m1')?.status).not.toBe('failed');
      expect(store.get('m1')?.error).toBeUndefined();
    });

    it('keeps the edit and records the failure when the request was NOT queued', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received', text: 'before' });
      const { lastPersisted, ops, store } = harness({ seed });

      await rejects(
        ops.update({ localMessage: { ...seed, text: 'after' } }, async () => {
          throw new Error('validation');
        }),
      );

      // The edit is never rolled back — that would destroy text the user typed.
      expect(store.get('m1')?.text).toBe('after');
      expect(store.get('m1')?.status).toBe('failed');
      expect(lastPersisted()?.text).toBe('after');
      expect(lastPersisted()?.status).toBe('failed');
    });

    it('ignores a response that carries no message', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received', text: 'before' });
      const { ops, store } = harness({ seed });

      await ops.update(
        { localMessage: { ...seed, text: 'after' } },
        async () => ({}) as never,
      );

      // `formatMessage(undefined)` yields an id-less message stamped with the current time, which used
      // to beat the freshness check and get ingested over the optimistic copy.
      expect(store.get('m1')?.text).toBe('after');
      expect(store.size).toBe(1);
    });
  });

  describe('delete', () => {
    it('optimistically marks the message deleted before the request resolves', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received' });
      const { ops, store } = harness({ seed });
      let duringRequest: LocalMessage | undefined;

      await ops.delete({ localMessage: seed }, async () => {
        duringRequest = store.get('m1');
        return {
          message: makeMessageResponse({
            id: 'm1',
            deleted_at: new Date().toISOString(),
          }),
        };
      });

      expect(duringRequest?.type).toBe('deleted');
      expect(duringRequest?.deleted_at).toBeInstanceOf(Date);
    });

    it('sets deleted_for_me for a delete_for_me delete', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received' });
      const { ops, store } = harness({ seed });
      let duringRequest: LocalMessage | undefined;

      await ops.delete(
        { localMessage: seed, options: { delete_for_me: true } },
        async () => {
          duringRequest = store.get('m1');
          return { message: makeMessageResponse({ id: 'm1' }) };
        },
      );

      expect(duringRequest?.deleted_for_me).toBe(true);
    });

    it('optimistically removes the message for a hard delete, and purges it on success', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received' });
      const { ops, purged, removed, store } = harness({ seed });

      await ops.delete({ localMessage: seed, options: { hard: true } });

      expect(removed).toContain('m1');
      expect(store.has('m1')).toBe(false);
      expect(purged).toContain('m1');
    });

    it('reverts the delete when the request fails definitively', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received', text: 'still here' });
      const { lastPersisted, ops, store } = harness({ seed });

      await rejects(
        ops.delete({ localMessage: seed }, async () => {
          throw new Error('not allowed');
        }),
      );

      // Leaving a "Message deleted" placeholder on a message that still exists server-side is a lie
      // that only self-corrects on the next query.
      expect(store.get('m1')?.type).toBe('regular');
      expect(store.get('m1')?.deleted_at).toBeNull();
      expect(store.get('m1')?.text).toBe('still here');
      expect(lastPersisted()?.type).toBe('regular');
    });

    it('reverts a failed hard delete by putting the message back', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received', text: 'still here' });
      const { ops, store } = harness({ seed });

      await rejects(
        ops.delete({ localMessage: seed, options: { hard: true } }, async () => {
          throw new Error('not allowed');
        }),
      );

      expect(store.get('m1')?.text).toBe('still here');
    });

    it('keeps the optimistic delete when the request was queued', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received' });
      const { ops, store } = harness({ isQueued: true, seed });

      await rejects(
        ops.delete({ localMessage: seed }, async () => {
          throw new Error('offline');
        }),
      );

      expect(store.get('m1')?.type).toBe('deleted');
    });

    it('does not revert over a fresher copy that landed while the request was in flight', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received', text: 'before' });
      const { ops, store } = harness({ seed });

      await rejects(
        ops.delete({ localMessage: seed }, async () => {
          // Stand in for a WS event replacing the canonical copy mid-request.
          store.set(
            'm1',
            makeLocalMessage({ id: 'm1', status: 'received', text: 'from websocket' }),
          );
          throw new Error('not allowed');
        }),
      );

      expect(store.get('m1')?.text).toBe('from websocket');
    });

    it('is a no-op revert when the message was not held locally', async () => {
      const { ops, store } = harness();
      const localMessage = makeLocalMessage({ id: 'm1', status: 'received' });

      await rejects(
        ops.delete({ localMessage }, async () => {
          throw new Error('not allowed');
        }),
      );

      expect(store.has('m1')).toBe(false);
    });
  });

  describe('send', () => {
    it('writes the message ahead as failed, then supersedes it with the received copy', async () => {
      const { ops, persisted } = harness();
      const localMessage = makeLocalMessage({ id: 'm1', status: undefined as never });

      await ops.send({ localMessage });

      // The write-ahead is what makes a message survive a process death between compose and ack.
      expect(persisted[0].status).toBe('failed');
      expect(persisted[persisted.length - 1].status).toBe('received');
    });

    it('persists the failed state when the send fails', async () => {
      const { lastPersisted, ops, store } = harness();
      const localMessage = makeLocalMessage({ id: 'm1' });

      await rejects(
        ops.send({ localMessage }, async () => {
          throw new Error('boom');
        }),
      );

      expect(store.get('m1')?.status).toBe('failed');
      expect(lastPersisted()?.status).toBe('failed');
    });

    it('still marks a send failed when it was queued — an unsent message is not pending forever', async () => {
      const { ops, store } = harness({ isQueued: true });
      const localMessage = makeLocalMessage({ id: 'm1' });

      await rejects(
        ops.send({ localMessage }, async () => {
          throw new Error('offline');
        }),
      );

      // Deliberately unlike update/delete: v9 showed an offline send as failed-and-retryable, and the
      // retry affordance is the only way the user gets that message out.
      expect(store.get('m1')?.status).toBe('failed');
    });
  });
});
