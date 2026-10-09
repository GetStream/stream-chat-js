import { describe, expect, it, vi } from 'vitest';
import { MessageOperations } from '../../../src/messageOperations/MessageOperations';
import type { Channel } from '../../../src/channel';
import type {
  MessageOperationsContext,
  MessageOperationsHandlers,
} from '../../../src/messageOperations/types';
import type { LocalMessage, Message, MessageResponse } from '../../../src/types';
import { msToNs, nowNs } from '../../../src/utils/time';

type Store = Map<string, LocalMessage>;

/**
 * `MessageOperations` reaches `ctx.channel` only from the reaction operations, which this suite does
 * not exercise — it drives the four message operations through explicit `defaults`/`handlers`. A
 * stand-in keeps the context type-complete without dragging a client into a suite that needs none.
 */
const channelStandIn = {} as Channel;

const makeLocalMessage = (overrides?: Partial<LocalMessage>): LocalMessage =>
  ({
    attachments: [],
    created_at: nowNs(),
    deleted_at: null,
    id: 'm1',
    mentioned_users: [],
    pinned_at: null,
    reaction_groups: null,
    status: 'failed',
    text: 'hi',
    type: 'regular',
    updated_at: nowNs(),
    ...overrides,
  }) as LocalMessage;

const makeMessageResponse = (overrides?: Partial<MessageResponse>): MessageResponse =>
  ({
    id: 'm1',
    text: 'hi',
    type: 'regular',
    created_at: nowNs(),
    updated_at: nowNs(),
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
  channel: channelStandIn,
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

  it('sends through the registered send handler instead of the default', async () => {
    const store: Store = new Map();

    const ops = new MessageOperations({
      ...stateHooks(store),
      ingest: (m) => store.set(m.id, m),
      get: (id) => store.get(id),
      handlers: () => ({
        send: async () => ({
          message: makeMessageResponse({ id: 'm1', text: 'override' }),
        }),
      }),
      defaults: {
        delete: defaultDelete,
        send: async () => ({ message: makeMessageResponse({ id: 'm1' }) }),
        update: async () => ({ message: makeMessageResponse({ id: 'm1' }) }),
      },
    });

    const localMessage = makeLocalMessage({ id: 'm1' });

    await ops.send({ localMessage });

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

  it('resends an error-type message as regular, in state and on the wire', async () => {
    const store: Store = new Map();
    const sent: Message[] = [];
    const ops = new MessageOperations({
      ...stateHooks(store),
      ingest: (m) => store.set(m.id, m),
      get: (id) => store.get(id),
      handlers: () => ({}),
      defaults: {
        delete: defaultDelete,
        send: async (message) => {
          sent.push(message);
          throw new Error('still failing');
        },
        update: async () => ({ message: makeMessageResponse({ id: 'm1' }) }),
      },
    });

    await expect(
      ops.retry({ localMessage: makeLocalMessage({ id: 'm1', type: 'error' }) }),
    ).rejects.toThrow('still failing');

    expect(sent[0].type).toBe('regular');
    expect(store.get('m1')?.type).toBe('regular');
  });

  describe('retry request resolution', () => {
    const retryOps = (handlers: ReturnType<MessageOperationsContext['handlers']>) => {
      const store: Store = new Map();
      const defaultSend = vi.fn(async () => ({
        message: makeMessageResponse({ id: 'm1' }),
      }));
      const ops = new MessageOperations({
        ...stateHooks(store),
        ingest: (m) => store.set(m.id, m),
        get: (id) => store.get(id),
        handlers: () => handlers,
        defaults: {
          delete: defaultDelete,
          send: defaultSend,
          update: async () => ({ message: makeMessageResponse({ id: 'm1' }) }),
        },
      });
      return { defaultSend, ops };
    };
    const reply = async () => ({ message: makeMessageResponse({ id: 'm1' }) });

    it('prefers a registered retry handler over the send handler', async () => {
      const retry = vi.fn(reply);
      const send = vi.fn(reply);
      const { defaultSend, ops } = retryOps({ retry, send });

      await ops.retry({ localMessage: makeLocalMessage({ id: 'm1' }) });

      expect(retry).toHaveBeenCalledTimes(1);
      expect(send).not.toHaveBeenCalled();
      expect(defaultSend).not.toHaveBeenCalled();
    });

    it('falls back to the send handler when no retry handler is registered', async () => {
      const send = vi.fn(reply);
      const { defaultSend, ops } = retryOps({ send });

      await ops.retry({ localMessage: makeLocalMessage({ id: 'm1', text: 'again' }) });

      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls[0][0].message?.text).toBe('again');
      expect(defaultSend).not.toHaveBeenCalled();
    });
  });

  // The Resend path: `send()` caches the exact payload it failed with, and `retry()` prefers that
  // cache over the message's current state. Without a rewrite on edit, tapping Resend after editing a
  // failed message re-sends the PRE-EDIT text while the bubble shows the edited one.
  it('rewrites the cached failed-send payload on edit, so a later retry sends the edit', async () => {
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

    await expect(
      ops.send({ localMessage: makeLocalMessage({ id: 'm1', text: 'AAA' }) }),
    ).rejects.toThrow('send failed');

    const edited = makeLocalMessage({ id: 'm1', text: 'AAA EDITED' });
    await ops.update({ localMessage: edited });
    await ops.retry({ localMessage: edited });

    expect(sendCalls[1].message.text).toBe('AAA EDITED');
  });

  // The case that actually reaches users: offline, so the edit request fails too (it is queued
  // instead). The cache still has to carry the edit.
  it('rewrites the cached failed-send payload even when the edit request itself fails', async () => {
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
        update: async () => {
          throw new Error('offline');
        },
      },
    });

    await expect(
      ops.send({ localMessage: makeLocalMessage({ id: 'm1', text: 'AAA' }) }),
    ).rejects.toThrow('send failed');

    const edited = makeLocalMessage({ id: 'm1', text: 'AAA EDITED' });
    await expect(ops.update({ localMessage: edited })).rejects.toThrow('offline');
    await ops.retry({ localMessage: edited });

    expect(sendCalls[1].message.text).toBe('AAA EDITED');
  });

  // The edit is merged OVER the cached payload rather than replacing it, so anything the send layer
  // resolved and the local message never carried survives the rewrite.
  it('preserves cached-only fields the edit does not mention', async () => {
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

    await expect(
      ops.send({
        localMessage: makeLocalMessage({ id: 'm1', text: 'AAA' }),
        message: { id: 'm1', silent: true, text: 'AAA', type: 'regular' } as Message,
        options: { skip_push: true },
      }),
    ).rejects.toThrow('send failed');

    const edited = makeLocalMessage({ id: 'm1', text: 'AAA EDITED' });
    await ops.update({ localMessage: edited });
    await ops.retry({ localMessage: edited });

    expect(sendCalls[1].message.text).toBe('AAA EDITED');
    expect(sendCalls[1].message.silent).toBe(true);
    // Options are cached separately and are not what the edit rewrites.
    expect(sendCalls[1].options).toEqual({ skip_push: true });
  });

  // An edit must not buy the stale payload another full TTL - `cachedAt` stays where the failed send
  // put it, so the entry still expires on schedule.
  it('does not refresh the cache TTL when rewriting on edit', async () => {
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

      await expect(
        ops.send({
          localMessage: makeLocalMessage({ id: 'm1', text: 'AAA' }),
          message: { id: 'm1', silent: true, text: 'AAA', type: 'regular' } as Message,
        }),
      ).rejects.toThrow('send failed');

      const edited = makeLocalMessage({ id: 'm1', text: 'AAA EDITED' });
      vi.advanceTimersByTime(4 * 60 * 1000);
      await ops.update({ localMessage: edited });
      vi.advanceTimersByTime(2 * 60 * 1000);
      await ops.retry({ localMessage: edited });

      // Past the 5-minute TTL measured from the SEND, so the entry is gone and the retry rebuilds
      // from the local message - which carries no `silent`.
      expect(sendCalls[1].message.silent).toBeUndefined();
    } finally {
      vi.useRealTimers();
    }
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
      message: makeMessageResponse({ id: 'm1', deleted_at: nowNs() }),
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
    // Only a message local state holds can be deleted; an empty store would exercise the phantom-row
    // path `success` deliberately refuses.
    store.set(localMessage.id, localMessage);

    await ops.delete({ localMessage });

    expect(defaultsDelete).toHaveBeenCalledWith('m1', undefined);
    expect(store.get('m1')?.deleted_at).toEqual(expect.any(Number));
  });

  it('delete uses configured handlers.delete when provided', async () => {
    const store: Store = new Map();
    const configuredDelete = vi.fn(async () => ({
      message: makeMessageResponse({
        id: 'm1',
        deleted_at: nowNs(),
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

    expect(configuredDelete).toHaveBeenCalledWith(
      { localMessage, options: { hard: true } },
      expect.any(Function),
    );
    // A hard delete REMOVES the message rather than re-ingesting the response copy — the same branch
    // the `message.deleted` WS handler takes on `event.hard_delete`. Ingesting it (which is what this
    // used to assert) put a message the server had just destroyed back into the list.
    expect(store.has('m1')).toBe(false);
  });
});

describe('MessageOperations — a replacing request can delegate to the default', () => {
  const setup = (handlers: ReturnType<MessageOperationsContext['handlers']>) => {
    const store: Store = new Map();
    const defaults = {
      delete: vi.fn(async (id: string) => ({ message: makeMessageResponse({ id }) })),
      send: vi.fn(async (m: Message) => ({ message: makeMessageResponse({ id: m.id }) })),
      update: vi.fn(async (m: LocalMessage) => ({
        message: makeMessageResponse({ id: m.id }),
      })),
    };
    const ops = new MessageOperations({
      ...stateHooks(store),
      ingest: (m) => store.set(m.id, m),
      get: (id) => store.get(id),
      handlers: () => handlers,
      defaults: defaults as unknown as MessageOperationsContext['defaults'],
    });
    return { defaults, ops };
  };

  it('send: the default receives the params the handler passes on', async () => {
    const { defaults, ops } = setup({
      send: (p, defaultRequest) =>
        defaultRequest({ ...p, message: { ...p.message, text: 'tweaked' } }),
    });

    await ops.send({ localMessage: makeLocalMessage({ id: 'm1' }) });

    expect(defaults.send).toHaveBeenCalledTimes(1);
    expect(defaults.send.mock.calls[0][0]).toMatchObject({ id: 'm1', text: 'tweaked' });
  });

  it('retry: the send handler it falls back to can delegate too', async () => {
    const { defaults, ops } = setup({ send: (p, defaultRequest) => defaultRequest(p) });

    await ops.retry({ localMessage: makeLocalMessage({ id: 'm1', text: 'again' }) });

    expect(defaults.send).toHaveBeenCalledTimes(1);
    expect(defaults.send.mock.calls[0][0]).toMatchObject({ text: 'again' });
  });

  it('update: the default receives the edited message the handler passes on', async () => {
    const { defaults, ops } = setup({
      update: (p, defaultRequest) =>
        defaultRequest({ ...p, localMessage: { ...p.localMessage, text: 'tweaked' } }),
    });

    await ops.update({
      localMessage: makeLocalMessage({ id: 'm1', status: 'received' }),
    });

    expect(defaults.update.mock.calls[0][0]).toMatchObject({ id: 'm1', text: 'tweaked' });
  });

  it('delete: the default receives the options the handler passes on', async () => {
    const { defaults, ops } = setup({
      delete: (p, defaultRequest) => defaultRequest({ ...p, options: { hard: true } }),
    });

    await ops.delete({
      localMessage: makeLocalMessage({ id: 'm1', status: 'received' }),
    });

    expect(defaults.delete).toHaveBeenCalledWith('m1', { hard: true });
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
  }: {
    isQueued?: boolean | ((messageId: string, types: readonly string[]) => boolean);
    seed?: LocalMessage;
  } = {}) => {
    const store: Store = new Map();
    if (seed) store.set(seed.id, seed);
    const persisted: LocalMessage[] = [];
    const purged: string[] = [];
    const removed: string[] = [];
    // A test replaces a request the way an integrator does, by registering a handler for its kind.
    const handlers: MessageOperationsHandlers = {};

    const context = {
      channel: channelStandIn,
      defaults: {
        delete: defaultDelete,
        send: async () => ({ message: makeMessageResponse({ id: 'm1' }) }),
        update: async () => ({ message: makeMessageResponse({ id: 'm1' }) }),
      },
      get: (id: string) => store.get(id),
      handlers: () => handlers,
      ingest: (m: LocalMessage) => store.set(m.id, m),
      isQueued: (messageId: string, types: readonly string[]) =>
        typeof isQueued === 'function' ? isQueued(messageId, types) : isQueued,
      persist: (m: LocalMessage) => persisted.push(m),
      purge: (id: string) => purged.push(id),
      remove: (id: string) => {
        removed.push(id);
        store.delete(id);
      },
    };

    return {
      context,
      handlers,
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
      const { handlers, lastPersisted, ops, persisted, store } = harness({ seed });

      // The echo has to carry the edited text. The harness default does not, so whether the edit
      // survived came down to the optimistic write and the mocked response landing in the same
      // millisecond — a real server echoes what it stored.
      handlers.update = async () => ({
        message: makeMessageResponse({ id: 'm1', text: 'after' }),
      });
      await ops.update({ localMessage: { ...seed, text: 'after' } });

      // Status preservation is asserted on the optimistic write specifically: the server echo supplies
      // `received` of its own, so reading the final state could pass without preservation happening.
      expect(persisted[0].text).toBe('after');
      expect(persisted[0].status).toBe('received');
      expect(store.get('m1')?.text).toBe('after');
      expect(lastPersisted()?.text).toBe('after');
    });

    // The optimistic write stamps `updated_at` from the CLIENT clock, so comparing the server's
    // `updated_at` against it compares two different clocks. A device running even slightly ahead of
    // the server would lose the whole server copy — the enriched `html`, URL/attachment enrichment,
    // translations, the server's own `message_text_updated_at` — and the DB row with it.
    it('applies the server copy even when the client clock runs ahead of the server', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received', text: 'before' });
      const { handlers, lastPersisted, ops, store } = harness({ seed });

      // A server timestamp a minute BEHIND the optimistic stamp: the device's clock is fast.
      const serverUpdatedAt = nowNs() - msToNs(60_000);

      handlers.update = async () => ({
        message: makeMessageResponse({
          html: '<p>after</p>',
          id: 'm1',
          text: 'after',
          updated_at: serverUpdatedAt,
        }),
      });
      await ops.update({ localMessage: { ...seed, text: 'after' } });

      expect(store.get('m1')?.html).toBe('<p>after</p>');
      expect(lastPersisted()?.html).toBe('<p>after</p>');
    });

    // The other half of the guard above: relaxing it must not let a slow response overwrite something
    // that genuinely landed after it. Once another writer has replaced the copy, identity no longer
    // matches and the decision falls back to timestamps — and both copies are server-derived by then,
    // so that comparison is one clock against itself.
    it('does not overwrite a fresher copy that landed while the request was in flight', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received', text: 'before' });
      const { handlers, ops, store } = harness({ seed });

      const fresher = makeLocalMessage({
        id: 'm1',
        status: 'received',
        text: 'from a websocket event',
        updated_at: nowNs() + msToNs(60_000),
      });

      handlers.update = async () => {
        // Lands while the request is open, exactly as a `message.updated` echo would.
        store.set('m1', fresher);
        return { message: makeMessageResponse({ id: 'm1', text: 'after' }) };
      };
      await ops.update({ localMessage: { ...seed, text: 'after' } });

      expect(store.get('m1')?.text).toBe('from a websocket event');
    });

    it('stamps message_text_updated_at so the "edited" indicator shows immediately', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received' });
      const { ops, persisted } = harness({ seed });

      await ops.update({ localMessage: { ...seed, text: 'after' } });

      // Asserted on the optimistic write specifically: the server echo would supply its own value, so
      // reading the final state could pass without the optimistic stamp ever existing.
      expect(persisted[0].message_text_updated_at).toEqual(expect.any(Number));
    });

    it('does not stamp message_text_updated_at when editing a failed message', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'failed' });
      const { handlers, ops, persisted } = harness({ seed });

      handlers.update = async () => {
        throw new Error('nope');
      };
      await rejects(ops.update({ localMessage: { ...seed, text: 'after' } }));

      // A message that never reached the server has no server-confirmed text update to advertise.
      expect(persisted[0].message_text_updated_at).toBeUndefined();
      expect(persisted[0].status).toBe('failed');
    });

    it('keeps the edit and does NOT mark it failed when the request was queued', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received', text: 'before' });
      const { handlers, ops, store } = harness({ isQueued: true, seed });

      handlers.update = async () => {
        throw new Error('offline');
      };
      await rejects(ops.update({ localMessage: { ...seed, text: 'after' } }));

      expect(store.get('m1')?.text).toBe('after');
      expect(store.get('m1')?.status).not.toBe('failed');
      expect(store.get('m1')?.error).toBeUndefined();
    });

    // A folded edit leaves NO `update-message` row - it lives inside the queued `send-message` task -
    // so asking only for the operation's own task type reported "not queued" and re-recorded a failure
    // on a message that was already failed, overwriting the send's error with the edit's.
    it('treats an edit folded into a queued send-message task as pending, not failed', async () => {
      const sendError = { message: 'send failed' } as LocalMessage['error'];
      const seed = makeLocalMessage({
        error: sendError,
        id: 'm1',
        status: 'failed',
        text: 'before',
      });
      const askedFor: string[][] = [];
      const store: Store = new Map([['m1', seed]]);
      const persisted: LocalMessage[] = [];

      const ops = new MessageOperations({
        channel: channelStandIn,
        defaults: {
          delete: defaultDelete,
          send: async () => ({ message: makeMessageResponse({ id: 'm1' }) }),
          update: async () => ({ message: makeMessageResponse({ id: 'm1' }) }),
        },
        get: (id: string) => store.get(id),
        handlers: () => ({
          update: async () => {
            throw new Error('offline');
          },
        }),
        ingest: (m: LocalMessage) => store.set(m.id, m),
        // Only the send is queued, which is exactly what a fold leaves behind.
        isQueued: async (_id: string, types: readonly string[]) => {
          askedFor.push([...types]);
          return types.includes('send-message');
        },
        persist: (m: LocalMessage) => persisted.push(m),
        purge: () => {},
        remove: (id: string) => store.delete(id),
      });

      await rejects(ops.update({ localMessage: { ...seed, text: 'after' } }));

      expect(askedFor[0]).toContain('send-message');
      expect(store.get('m1')?.text).toBe('after');
      // The send's error survives; the edit does not overwrite it, and writes nothing of its own.
      expect(store.get('m1')?.error).toBe(sendError);
      expect(persisted).toHaveLength(1);
    });

    it('keeps the edit and records the failure when the request was NOT queued', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received', text: 'before' });
      const { handlers, lastPersisted, ops, store } = harness({ seed });

      handlers.update = async () => {
        throw new Error('validation');
      };
      await rejects(ops.update({ localMessage: { ...seed, text: 'after' } }));

      // The edit is never rolled back — that would destroy text the user typed.
      expect(store.get('m1')?.text).toBe('after');
      expect(store.get('m1')?.status).toBe('failed');
      expect(lastPersisted()?.text).toBe('after');
      expect(lastPersisted()?.status).toBe('failed');
    });

    it('ignores a response that carries no message', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received', text: 'before' });
      const { handlers, ops, store } = harness({ seed });

      handlers.update = async () => ({}) as never;
      await ops.update({ localMessage: { ...seed, text: 'after' } });

      // `formatMessage(undefined)` yields an id-less message stamped with the current time, which used
      // to beat the freshness check and get ingested over the optimistic copy.
      expect(store.get('m1')?.text).toBe('after');
      expect(store.size).toBe(1);
    });
  });

  describe('delete', () => {
    it('optimistically marks the message deleted before the request resolves', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received' });
      const { handlers, ops, store } = harness({ seed });
      let duringRequest: LocalMessage | undefined;

      handlers.delete = async () => {
        duringRequest = store.get('m1');
        return {
          message: makeMessageResponse({
            id: 'm1',
            deleted_at: nowNs(),
          }),
        };
      };
      await ops.delete({ localMessage: seed });

      expect(duringRequest?.type).toBe('deleted');
      expect(duringRequest?.deleted_at).toEqual(expect.any(Number));
    });

    it('sets deleted_for_me for a delete_for_me delete', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received' });
      const { handlers, ops, store } = harness({ seed });
      let duringRequest: LocalMessage | undefined;

      handlers.delete = async () => {
        duringRequest = store.get('m1');
        return { message: makeMessageResponse({ id: 'm1' }) };
      };
      await ops.delete({ localMessage: seed, options: { delete_for_me: true } });

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

    it('removes a copy that re-arrived while the hard delete was in flight', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received' });
      const { handlers, ops, purged, store } = harness({ seed });

      handlers.delete = async () => {
        store.set('m1', makeLocalMessage({ id: 'm1', text: 're-arrived' }));
        return { message: makeMessageResponse({ id: 'm1' }) };
      };
      await ops.delete({ localMessage: seed, options: { hard: true } });

      expect(store.has('m1')).toBe(false);
      expect(purged.filter((id) => id === 'm1')).toHaveLength(2);
    });

    /**
     * The offline-DB row is the optimistic layer's to write, not `client.deleteMessage`'s. It used to be
     * deleted by the request method before the task was even queued — which put a second uncoordinated
     * writer on the DB, ran ahead of the state the DB mirrors, and was skipped entirely whenever a
     * custom `deleteMessageRequest` replaced `client.deleteMessage`.
     */
    it('mirrors the deleted message into the offline DB from the optimistic step', async () => {
      // Asserted on the write that happened BEFORE the response, which is the whole point: the row
      // used to be written by `client.deleteMessage` ahead of the state it mirrors.
      const seed = makeLocalMessage({ id: 'm1', status: 'received' });
      const { handlers, ops, persisted } = harness({ seed });
      let duringRequest: LocalMessage | undefined;

      handlers.delete = async () => {
        duringRequest = persisted[0];
        return { message: makeMessageResponse({ id: 'm1' }) };
      };
      await ops.delete({ localMessage: seed });

      expect(duringRequest?.type).toBe('deleted');
      expect(duringRequest?.deleted_at).toEqual(expect.any(Number));
    });

    it('carries delete_for_me into the mirrored row', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received' });
      const { ops, persisted } = harness({ seed });

      await ops.delete({ localMessage: seed, options: { delete_for_me: true } });

      expect(persisted[0].deleted_for_me).toBe(true);
    });

    it('purges the offline-DB row for a hard delete rather than mirroring it', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received' });
      const { ops, purged } = harness({ seed });

      await ops.delete({ localMessage: seed, options: { hard: true } });

      expect(purged).toContain('m1');
    });

    it('still writes the row when a custom request handler replaces client.deleteMessage', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received' });
      const { handlers, ops, persisted } = harness({ seed });

      handlers.delete = async () => ({
        message: makeMessageResponse({ id: 'm1', type: 'deleted' }),
      });
      await ops.delete({ localMessage: seed });

      expect(persisted[0].type).toBe('deleted');
    });

    it('writes nothing to the offline DB for a message local state does not hold', async () => {
      // The DB mirrors local state, so it must not be told about state that does not exist — and a
      // definitive failure would have nothing to restore that row from. Sampled DURING the request,
      // since the success path legitimately persists the server's copy afterwards.
      const { handlers, ops, persisted } = harness();
      let duringRequest: number | undefined;

      handlers.delete = async () => {
        duringRequest = persisted.length;
        return { message: makeMessageResponse({ id: 'm1' }) };
      };
      await ops.delete({ localMessage: makeLocalMessage({ id: 'm1' }) });

      expect(duringRequest).toBe(0);
    });

    it('reverts the delete when the request fails definitively', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received', text: 'still here' });
      const { handlers, lastPersisted, ops, store } = harness({ seed });

      handlers.delete = async () => {
        throw new Error('not allowed');
      };
      await rejects(ops.delete({ localMessage: seed }));

      // Leaving a "Message deleted" placeholder on a message that still exists server-side is a lie
      // that only self-corrects on the next query.
      expect(store.get('m1')?.type).toBe('regular');
      expect(store.get('m1')?.deleted_at).toBeNull();
      expect(store.get('m1')?.text).toBe('still here');
      expect(lastPersisted()?.type).toBe('regular');
    });

    it('reverts a failed hard delete by putting the message back', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received', text: 'still here' });
      const { handlers, ops, store } = harness({ seed });

      handlers.delete = async () => {
        throw new Error('not allowed');
      };
      await rejects(ops.delete({ localMessage: seed, options: { hard: true } }));

      expect(store.get('m1')?.text).toBe('still here');
    });

    it('keeps the optimistic delete when the request was queued', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received' });
      const { handlers, ops, store } = harness({ isQueued: true, seed });

      handlers.delete = async () => {
        throw new Error('offline');
      };
      await rejects(ops.delete({ localMessage: seed }));

      expect(store.get('m1')?.type).toBe('deleted');
    });

    it('does not revert over a fresher copy that landed while the request was in flight', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received', text: 'before' });
      const { handlers, ops, store } = harness({ seed });

      handlers.delete = async () => {
        // Stand in for a WS event replacing the canonical copy mid-request.
        store.set(
          'm1',
          makeLocalMessage({ id: 'm1', status: 'received', text: 'from websocket' }),
        );
        throw new Error('not allowed');
      };
      await rejects(ops.delete({ localMessage: seed }));

      expect(store.get('m1')?.text).toBe('from websocket');
    });

    it('is a no-op revert when the message was not held locally', async () => {
      const { handlers, ops, store } = harness();
      const localMessage = makeLocalMessage({ id: 'm1', status: 'received' });

      handlers.delete = async () => {
        throw new Error('not allowed');
      };
      await rejects(ops.delete({ localMessage }));

      expect(store.has('m1')).toBe(false);
    });
  });

  describe('delete', () => {
    // `optimistic` deliberately writes nothing when local state holds no copy — ingesting would insert
    // a "Message deleted" row for something that was never on screen. `success` then ingested the
    // server's copy unconditionally, putting the phantom row back. The guard only appeared to hold
    // offline, where the request fails and `success` never runs.
    it('does not insert a deleted row for a message nothing was displaying', async () => {
      const { handlers, ops, persisted, store } = harness();

      handlers.delete = async () => ({
        message: makeMessageResponse({ id: 'm1', type: 'deleted' }),
      });
      await ops.delete({ localMessage: makeLocalMessage({ id: 'm1' }) });

      expect(store.has('m1')).toBe(false);
      expect(persisted).toHaveLength(0);
    });

    it('still applies the server copy for a message it does hold', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received' });
      const { handlers, lastPersisted, ops, store } = harness({ seed });

      handlers.delete = async () => ({
        message: makeMessageResponse({ id: 'm1', type: 'deleted' }),
      });
      await ops.delete({ localMessage: seed });

      expect(store.get('m1')?.type).toBe('deleted');
      expect(lastPersisted()?.type).toBe('deleted');
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

    // The send twin of the edit case above. The optimistic step does not stamp `updated_at`, but it
    // spreads the composed message, and the composer stamped it from the CLIENT clock. So the
    // timestamp comparison here is also cross-clock: a device running fast would drop the server copy
    // and leave the message `sending`, while the unconditional persist below wrote `received` — memory
    // and the offline-DB row disagreeing about the same message.
    it('applies the server copy on a send even when the client clock runs ahead', async () => {
      const { handlers, lastPersisted, ops, store } = harness();
      const localMessage = makeLocalMessage({
        id: 'm1',
        status: 'sending',
        updated_at: nowNs() + msToNs(60_000),
      });

      handlers.send = async () => ({
        message: makeMessageResponse({ id: 'm1', updated_at: nowNs() }),
      });
      await ops.send({ localMessage });

      expect(store.get('m1')?.status).toBe('received');
      expect(lastPersisted()?.status).toBe('received');
    });

    // The DB mirrors memory. When a fresher copy (a `message.new` echo) has already landed, the
    // response is too stale to apply — and equally too stale to write to the row.
    it('does not persist a server copy it declined to apply', async () => {
      const { handlers, ops, persisted, store } = harness();
      const localMessage = makeLocalMessage({
        id: 'm1',
        status: 'sending',
        updated_at: nowNs() + msToNs(60_000),
      });

      handlers.send = async () => {
        // The echo lands while the request is open, and is newer than the response.
        store.set(
          'm1',
          makeLocalMessage({
            id: 'm1',
            status: 'received',
            text: 'from the echo',
            updated_at: nowNs() + msToNs(120_000),
          }),
        );
        return {
          message: makeMessageResponse({
            id: 'm1',
            updated_at: nowNs(),
          }),
        };
      };
      await ops.send({ localMessage });

      expect(store.get('m1')?.text).toBe('from the echo');
      // Only the pessimistic write-ahead should have been written; the declined copy must not follow it.
      expect(persisted.map((m) => m.status)).toEqual(['failed']);
    });

    it('persists the failed state when the send fails', async () => {
      const { handlers, lastPersisted, ops, store } = harness();
      const localMessage = makeLocalMessage({ id: 'm1' });

      handlers.send = async () => {
        throw new Error('boom');
      };
      await rejects(ops.send({ localMessage }));

      expect(store.get('m1')?.status).toBe('failed');
      expect(lastPersisted()?.status).toBe('failed');
    });

    it('still marks a send failed when it was queued — an unsent message is not pending forever', async () => {
      const { handlers, ops, store } = harness({ isQueued: true });
      const localMessage = makeLocalMessage({ id: 'm1' });

      handlers.send = async () => {
        throw new Error('offline');
      };
      await rejects(ops.send({ localMessage }));

      // Deliberately unlike update/delete: v9 showed an offline send as failed-and-retryable, and the
      // retry affordance is the only way the user gets that message out.
      expect(store.get('m1')?.status).toBe('failed');
    });
  });

  describe('rules the other tests do not pin', () => {
    it('writes the server copy of a soft delete to the offline DB', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received', text: 'hi' });
      const { handlers, lastPersisted, ops } = harness({ seed });

      handlers.delete = async () => ({
        message: makeMessageResponse({
          id: 'm1',
          text: 'This message was deleted.',
          type: 'deleted',
        }),
      });
      await ops.delete({ localMessage: seed });

      // The optimistic row is already `deleted`, so only the server's text tells the two apart.
      expect(lastPersisted()?.text).toBe('This message was deleted.');
    });

    it('applies a newer server copy even after another write landed during the request', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received', text: 'before' });
      const { handlers, ops, store } = harness({ seed });

      handlers.update = async () => {
        // An older event lands while the request is open, so the optimistic copy is no longer held.
        store.set(
          'm1',
          makeLocalMessage({
            id: 'm1',
            status: 'received',
            text: 'older event',
            updated_at: nowNs() - msToNs(60_000),
          }),
        );
        return {
          message: makeMessageResponse({ id: 'm1', text: 'after', updated_at: nowNs() }),
        };
      };
      await ops.update({ localMessage: { ...seed, text: 'after' } });

      expect(store.get('m1')?.text).toBe('after');
    });

    it('treats a failed delete as queued only when its own delete task is queued', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received' });
      const { handlers, ops, store } = harness({
        isQueued: (_id, types) => types.includes('delete-message'),
        seed,
      });

      handlers.delete = async () => {
        throw new Error('offline');
      };
      await rejects(ops.delete({ localMessage: seed }));

      expect(store.get('m1')?.type).toBe('deleted');
    });

    it('builds a failed edit on the copy held now, not the one the edit started from', async () => {
      const seed = makeLocalMessage({ id: 'm1', status: 'received', text: 'before' });
      const { handlers, ops, store } = harness({ seed });
      const reactionGroups = {
        like: {
          count: 1,
          first_reaction_at: nowNs(),
          last_reaction_at: nowNs(),
          sum_scores: 1,
        },
      } as unknown as LocalMessage['reaction_groups'];

      handlers.update = async () => {
        // A reaction arrives while the edit is in flight.
        store.set('m1', {
          ...(store.get('m1') as LocalMessage),
          reaction_groups: reactionGroups,
        });
        throw Object.assign(new Error('not allowed'), { code: 17 });
      };
      await rejects(ops.update({ localMessage: { ...seed, text: 'after' } }));

      expect(store.get('m1')?.status).toBe('failed');
      expect(store.get('m1')?.reaction_groups).toEqual(reactionGroups);
    });

    it('writes the failure reason of a failed send to the offline DB', async () => {
      const { handlers, lastPersisted, ops } = harness();

      handlers.send = async () => {
        throw Object.assign(new Error('boom'), { code: 17 });
      };
      await rejects(ops.send({ localMessage: makeLocalMessage({ id: 'm1' }) }));

      // The write-ahead row is already `failed`; only the final write carries the error.
      expect(lastPersisted()?.status).toBe('failed');
      expect(lastPersisted()?.error).toBeDefined();
    });

    it('settles a failed send or retry without reading the offline queue', async () => {
      const isQueued = vi.fn(() => true);
      const { handlers, ops } = harness({ isQueued });
      const fail = async () => {
        throw new Error('offline');
      };

      handlers.send = fail;
      await rejects(ops.send({ localMessage: makeLocalMessage({ id: 'm1' }) }));
      handlers.retry = fail;
      await rejects(ops.retry({ localMessage: makeLocalMessage({ id: 'm2' }) }));

      // A send ends as failed whatever is queued, so asking the queue would only cost a DB read.
      expect(isQueued).not.toHaveBeenCalled();
    });
  });
});
