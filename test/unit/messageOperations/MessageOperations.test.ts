import { describe, expect, it } from 'vitest';
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

describe('MessageOperations', () => {
  it('marks optimistic message as sending, then ingests received response', async () => {
    const store: Store = new Map();

    const ops = new MessageOperations({
      ingest: (m) => store.set(m.id, m),
      get: (id) => store.get(id),
      handlers: () => ({}),
      defaults: {
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
      ingest: (m) => store.set(m.id, m),
      get: (id) => store.get(id),
      handlers: () => ({}),
      defaults: {
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
      ingest: (m) => store.set(m.id, m),
      get: (id) => store.get(id),
      handlers: () => ({}),
      defaults: {
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
      ingest: (m) => store.set(m.id, m),
      get: (id) => store.get(id),
      handlers: () => ({}),
      defaults: {
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

  it('normalizes outgoing message for send', async () => {
    const store: Store = new Map();

    const ops = new MessageOperations({
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
      ingest: (m) => store.set(m.id, m),
      get: (id) => store.get(id),
      handlers: () => ({}),
      defaults: {
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
      ingest: (m) => store.set(m.id, m),
      get: (id) => store.get(id),
      handlers: () => ({}),
      defaults: {
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
});
