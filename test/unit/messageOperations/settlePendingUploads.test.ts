import { describe, expect, it, vi } from 'vitest';
import { MessageOperations } from '../../../src/messageOperations/MessageOperations';
import { keepSendOrderWhilePendingUploadsAllowed } from '../../../src/messageOperations/sendOrdering';
import { settlePendingAttachmentUploads } from '../../../src/messageOperations/settlePendingAttachmentUploads';
import type { LocalMessage, MessageResponse } from '../../../src/types';
import { withoutConcurrency } from '../../../src/utils/concurrency';
import { nowNs } from '../../../src/utils/time';

type Store = Map<string, LocalMessage>;

const makeLocalMessage = (overrides?: Partial<LocalMessage>): LocalMessage =>
  ({
    attachments: [],
    created_at: nowNs(),
    deleted_at: null,
    id: 'm1',
    mentioned_users: [],
    pinned_at: null,
    reaction_groups: null,
    status: 'sending',
    text: 'hi',
    type: 'regular',
    updated_at: nowNs(),
    ...overrides,
  }) as LocalMessage;

const makeMessageResponse = (id = 'm1'): MessageResponse =>
  ({
    created_at: nowNs(),
    id,
    text: 'hi',
    type: 'regular',
    updated_at: nowNs(),
  }) as MessageResponse;

const stateHooks = (store: Store) => ({
  isQueued: () => false,
  persist: () => {},
  purge: () => {},
  remove: (id: string) => store.delete(id),
});

/** An attachment as the composer hands it over: still uploading, carrying its local preview. */
const pendingAttachment = (id: string) => ({
  localMetadata: {
    file: new File([''], `${id}.png`, { type: 'image/png' }),
    id,
    previewUri: `blob:${id}`,
    uploadState: 'uploading' as const,
  },
  type: 'image',
});

const resolved = (url: string) => ({ image_url: url, type: 'image' });

const makeOps = ({
  sequenceRequests,
  settlePendingUploads,
  send,
  store,
}: {
  sequenceRequests?: Parameters<typeof MessageOperations>[0]['sequenceRequests'];
  settlePendingUploads?: Parameters<typeof MessageOperations>[0]['settlePendingUploads'];
  send?: (...args: never[]) => Promise<{ message: MessageResponse }>;
  store: Store;
}) =>
  new MessageOperations({
    ...stateHooks(store),
    defaults: {
      delete: async () => ({ message: makeMessageResponse() }),
      send: (send ?? (async () => ({ message: makeMessageResponse() }))) as never,
      update: async () => ({ message: makeMessageResponse() }),
    },
    get: (id) => store.get(id),
    handlers: () => ({}),
    ingest: (m) => store.set(m.id, m),
    sequenceRequests,
    settlePendingUploads,
  });

describe('MessageOperations — pending attachment uploads', () => {
  it('is a no-op when the owner supplies no settle capability', async () => {
    const store: Store = new Map();
    const send = vi.fn(async () => ({ message: makeMessageResponse() }));
    const ops = makeOps({ send, store });

    await ops.send({ localMessage: makeLocalMessage() });

    expect(store.get('m1')?.status).toBe('received');
    expect(send).toHaveBeenCalledTimes(1);
  });

  it('sends the resolved URLs once the uploads settle', async () => {
    const store: Store = new Map();
    const settlePendingUploads = vi.fn(async () => ({
      attachments: [resolved('https://cdn/a.png')],
    }));
    const send = vi.fn(async () => ({ message: makeMessageResponse() }));
    const ops = makeOps({ send, settlePendingUploads, store });

    await ops.send({
      localMessage: makeLocalMessage({ attachments: [pendingAttachment('a')] }),
    });

    expect(settlePendingUploads).toHaveBeenCalledTimes(1);
    // The payload that went to the server carries the URL, not the local preview.
    expect(send.mock.calls[0][0]).toMatchObject({
      attachments: [{ image_url: 'https://cdn/a.png' }],
    });
    expect(store.get('m1')?.status).toBe('received');
  });

  it('publishes the resolved URLs before the request, not after the server answers', async () => {
    // Settling releases the local blob previews, so the list must stop pointing at them right
    // away — waiting for the server copy leaves a revoked blob on screen for a round-trip.
    const store: Store = new Map();
    let attachmentsWhenRequestFired: unknown;
    const settlePendingUploads = vi.fn(async () => ({
      attachments: [resolved('https://cdn/a.png')],
    }));
    const send = vi.fn(async () => {
      attachmentsWhenRequestFired = store.get('m1')?.attachments;
      return { message: makeMessageResponse() };
    });
    const ops = makeOps({ send, settlePendingUploads, store });

    await ops.send({
      localMessage: makeLocalMessage({ attachments: [pendingAttachment('a')] }),
    });

    expect(attachmentsWhenRequestFired).toMatchObject([
      { image_url: 'https://cdn/a.png' },
    ]);
    expect(attachmentsWhenRequestFired?.[0]).not.toHaveProperty('localMetadata');
  });

  it('applies the optimistic state before settling, so the message is visible while uploading', async () => {
    const store: Store = new Map();
    let statusDuringUpload: string | undefined;
    const settlePendingUploads = vi.fn(async () => {
      statusDuringUpload = store.get('m1')?.status;
      return { attachments: [resolved('https://cdn/a.png')] };
    });
    const ops = makeOps({ settlePendingUploads, store });

    await ops.send({
      localMessage: makeLocalMessage({ attachments: [pendingAttachment('a')] }),
    });

    expect(statusDuringUpload).toBe('sending');
  });

  it('fails the message when an upload fails, and never sends it', async () => {
    const store: Store = new Map();
    const send = vi.fn(async () => ({ message: makeMessageResponse() }));
    const settlePendingUploads = vi.fn(async () => ({
      attachments: [pendingAttachment('a')],
      failureReason: new Error('upload exploded'),
    }));
    const ops = makeOps({ send, settlePendingUploads, store });

    await expect(
      ops.send({
        localMessage: makeLocalMessage({ attachments: [pendingAttachment('a')] }),
      }),
    ).rejects.toThrow('upload exploded');

    expect(send).not.toHaveBeenCalled();
    expect(store.get('m1')?.status).toBe('failed');
  });

  it('keeps the attachments that did resolve on the failed message, so a retry re-uploads only the rest', async () => {
    const store: Store = new Map();
    const settlePendingUploads = vi.fn(async () => ({
      // first resolved, second did not
      attachments: [resolved('https://cdn/a.png'), pendingAttachment('b')],
      failureReason: new Error('b failed'),
    }));
    const ops = makeOps({ settlePendingUploads, store });

    await expect(
      ops.send({
        localMessage: makeLocalMessage({
          attachments: [pendingAttachment('a'), pendingAttachment('b')],
        }),
      }),
    ).rejects.toThrow('b failed');

    const failed = store.get('m1');
    expect(failed?.status).toBe('failed');
    expect(failed?.attachments?.[0]).toMatchObject({ image_url: 'https://cdn/a.png' });
    expect(failed?.attachments?.[1]).toMatchObject({ localMetadata: { id: 'b' } });
  });

  it('settles on retry too, not only on the first send', async () => {
    const store: Store = new Map();
    const settlePendingUploads = vi.fn(async () => ({
      attachments: [resolved('https://cdn/a.png')],
    }));
    const ops = makeOps({ settlePendingUploads, store });

    await ops.retry({
      localMessage: makeLocalMessage({
        attachments: [pendingAttachment('a')],
        status: 'failed',
      }),
    });

    expect(settlePendingUploads).toHaveBeenCalledTimes(1);
    expect(store.get('m1')?.status).toBe('received');
  });

  it('settles an edit that adds a still-uploading attachment', async () => {
    // An edit composes through the same middleware as a send, so it can carry a pending upload.
    // Skipping it here sent the edit with `localMetadata` still attached and no URL.
    const store: Store = new Map();
    const settlePendingUploads = vi.fn(async () => ({
      attachments: [resolved('https://cdn/a.png')],
    }));
    const update = vi.fn(async () => ({ message: makeMessageResponse() }));
    const ops = new MessageOperations({
      ...stateHooks(store),
      defaults: {
        delete: async () => ({ message: makeMessageResponse() }),
        send: async () => ({ message: makeMessageResponse() }),
        update: update as never,
      },
      get: (id) => store.get(id),
      handlers: () => ({}),
      ingest: (m) => store.set(m.id, m),
      settlePendingUploads,
    });

    await ops.update({
      localMessage: makeLocalMessage({
        attachments: [pendingAttachment('a')],
        status: 'received',
      }),
    });

    expect(settlePendingUploads).toHaveBeenCalledTimes(1);
    // Asserting on the request, not just that settling ran: an update sends `localMessage`
    // itself, so a request fn reading a stale copy would discard the resolved URL and this is
    // the only place that shows it.
    expect(update.mock.calls[0][0]).toMatchObject({
      attachments: [{ image_url: 'https://cdn/a.png' }],
    });
    expect(update.mock.calls[0][0].attachments[0]).not.toHaveProperty('localMetadata');
  });

  it('does not settle a delete — waiting for a transfer to discard the message helps nobody', async () => {
    const store: Store = new Map();
    const settlePendingUploads = vi.fn(async () => ({ attachments: [] }));
    const ops = makeOps({ settlePendingUploads, store });

    await ops.delete({
      localMessage: makeLocalMessage({
        attachments: [pendingAttachment('a')],
        status: 'received',
      }),
    });

    expect(settlePendingUploads).not.toHaveBeenCalled();
  });

  it('does not call the settle capability for a message with no attachments', async () => {
    const store: Store = new Map();
    const settlePendingUploads = vi.fn(async () => ({ attachments: [] }));
    const ops = makeOps({ settlePendingUploads, store });

    await ops.send({ localMessage: makeLocalMessage({ attachments: [] }) });

    expect(settlePendingUploads).not.toHaveBeenCalled();
  });
});

describe('MessageOperations — send ordering', () => {
  /** The real wiring: `withoutConcurrency` per owner, for the ordering-sensitive kinds only. */
  const sequenceRequests = <T>(kind: string, request: () => Promise<T>) =>
    kind === 'send' || kind === 'retry'
      ? withoutConcurrency('test/send-ordering', request)
      : request();

  it('runs sends in the order they were issued, even when the first one is slow', async () => {
    const store: Store = new Map();
    const order: string[] = [];
    const settlePendingUploads = vi.fn(async (attachments) => {
      // Stands in for a slow upload on the first message only.
      const id = (attachments[0] as { localMetadata?: { id?: string } }).localMetadata
        ?.id;
      if (id === 'slow') await new Promise((r) => setTimeout(r, 20));
      return { attachments: [resolved(`https://cdn/${id}.png`)] };
    });
    const send = vi.fn(async (m: { attachments?: { image_url?: string }[] }) => {
      order.push(m.attachments?.[0]?.image_url ?? '?');
      return { message: makeMessageResponse() };
    });
    const ops = makeOps({ send, sequenceRequests, settlePendingUploads, store });

    await Promise.all([
      ops.send({
        localMessage: makeLocalMessage({
          attachments: [pendingAttachment('slow')],
          id: 'm1',
        }),
      }),
      ops.send({
        localMessage: makeLocalMessage({
          attachments: [pendingAttachment('fast')],
          id: 'm2',
        }),
      }),
    ]);

    // Without serialisation the fast one overtakes the slow upload and reaches the server first.
    expect(order).toEqual(['https://cdn/slow.png', 'https://cdn/fast.png']);
  });

  it('lets a failed send through without blocking the ones behind it', async () => {
    const store: Store = new Map();
    const order: string[] = [];
    const send = vi.fn(async (m: { id?: string; text?: string }) => {
      order.push(m.text ?? '?');
      if (m.text === 'boom') throw new Error('send failed');
      // Echo the id back: a shared response id would let one send's success overwrite the
      // other's state and hide exactly what this test is checking.
      return { message: makeMessageResponse(m.id) };
    });
    const ops = makeOps({ send, sequenceRequests, store });

    const first = ops
      .send({ localMessage: makeLocalMessage({ id: 'm1', text: 'boom' }) })
      .catch(() => 'rejected');
    const second = ops.send({
      localMessage: makeLocalMessage({ id: 'm2', text: 'after' }),
    });

    await expect(first).resolves.toBe('rejected');
    await expect(second).resolves.toBeUndefined();
    expect(order).toEqual(['boom', 'after']);
    expect(store.get('m1')?.status).toBe('failed');
    expect(store.get('m2')?.status).toBe('received');
  });

  it('does not serialise when the owner supplies no policy', async () => {
    const store: Store = new Map();
    const started: string[] = [];
    const send = vi.fn(async (m: { text?: string }) => {
      started.push(m.text ?? '?');
      return { message: makeMessageResponse() };
    });
    // No `sequenceRequests`: what a composer without pending-upload middleware gets.
    const ops = makeOps({ send, store });

    await Promise.all([
      ops.send({ localMessage: makeLocalMessage({ id: 'm1', text: 'a' }) }),
      ops.send({ localMessage: makeLocalMessage({ id: 'm2', text: 'b' }) }),
    ]);

    expect(started).toHaveLength(2);
  });
});

describe('MessageOperations — what the ordering gate must not block', () => {
  const sequenceRequests = <T>(kind: string, request: () => Promise<T>) =>
    kind === 'send' || kind === 'retry'
      ? withoutConcurrency('test/gate-scope', request)
      : request();

  /** Resolves only when released, so the queue can be observed while it is held. */
  const heldSend = () => {
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const send = vi.fn(async (m: { id?: string }) => {
      await gate;
      return { message: makeMessageResponse(m.id) };
    });
    return { release, send };
  };

  it('renders the next message optimistically while an earlier send is still in flight', async () => {
    // The property the gate exists to preserve: ordering is imposed on the *request*, never on
    // the optimistic update. Widen the gate to enclose `policy.optimistic` and this fails — the
    // second message would not appear until the first upload finished.
    const store: Store = new Map();
    const { release, send } = heldSend();
    const ops = makeOps({ send, sequenceRequests, store });

    const first = ops.send({
      localMessage: makeLocalMessage({ id: 'm1', text: 'first' }),
    });
    const second = ops.send({
      localMessage: makeLocalMessage({ id: 'm2', text: 'second' }),
    });
    await Promise.resolve();

    expect(store.get('m2')?.status).toBe('sending');

    release();
    await Promise.all([first, second]);
    expect(store.get('m2')?.status).toBe('received');
  });

  it('does not hold an edit or a delete behind a slow send', async () => {
    // Edits and deletes carry no ordering hazard, so the owner leaves them ungated. Were they
    // queued, deleting a message during a large upload would appear to do nothing until it
    // finished.
    const store: Store = new Map();
    const { release, send } = heldSend();
    const settled: string[] = [];
    const ops = new MessageOperations({
      ...stateHooks(store),
      defaults: {
        delete: async () => {
          settled.push('delete');
          return { message: makeMessageResponse('m3') };
        },
        send: send as never,
        update: async () => {
          settled.push('update');
          return { message: makeMessageResponse('m2') };
        },
      },
      get: (id) => store.get(id),
      handlers: () => ({}),
      ingest: (m) => store.set(m.id, m),
      sequenceRequests,
    });

    const slowSend = ops.send({ localMessage: makeLocalMessage({ id: 'm1' }) });
    await ops.update({
      localMessage: makeLocalMessage({ id: 'm2', status: 'received' }),
    });
    await ops.delete({
      localMessage: makeLocalMessage({ id: 'm3', status: 'received' }),
    });

    // Both completed while the send is still holding its own queue.
    expect(settled).toEqual(['update', 'delete']);

    release();
    await slowSend;
  });
});

describe('keepSendOrderWhilePendingUploadsAllowed', () => {
  const composer = (allowsPendingUploads: boolean) => ({ allowsPendingUploads }) as never;

  it.each(['send', 'retry'] as const)(
    'queues a %s while pending uploads are allowed',
    async (kind) => {
      const order: string[] = [];
      const slow = () =>
        keepSendOrderWhilePendingUploadsAllowed({
          channelCid: 'messaging:x',
          composer: composer(true),
          kind,
          request: async () => {
            await new Promise((r) => setTimeout(r, 20));
            order.push('slow');
          },
        });
      const fast = () =>
        keepSendOrderWhilePendingUploadsAllowed({
          channelCid: 'messaging:x',
          composer: composer(true),
          kind,
          request: async () => {
            order.push('fast');
          },
        });

      await Promise.all([slow(), fast()]);

      expect(order).toEqual(['slow', 'fast']);
    },
  );

  it.each(['update', 'delete'] as const)('never queues a %s', async (kind) => {
    const order: string[] = [];
    const slowSend = keepSendOrderWhilePendingUploadsAllowed({
      channelCid: 'messaging:x',
      composer: composer(true),
      kind: 'send',
      request: async () => {
        await new Promise((r) => setTimeout(r, 30));
        order.push('send');
      },
    });
    await keepSendOrderWhilePendingUploadsAllowed({
      channelCid: 'messaging:x',
      composer: composer(true),
      kind,
      request: async () => {
        order.push(kind);
      },
    });

    // Ran while the send is still holding its queue.
    expect(order).toEqual([kind]);
    await slowSend;
  });

  it('does not queue at all when the composer cannot hand over pending uploads', async () => {
    const order: string[] = [];
    const run = (label: string, delay: number) =>
      keepSendOrderWhilePendingUploadsAllowed({
        channelCid: 'messaging:x',
        composer: composer(false),
        kind: 'send',
        request: async () => {
          await new Promise((r) => setTimeout(r, delay));
          order.push(label);
        },
      });

    await Promise.all([run('slow', 20), run('fast', 0)]);

    expect(order).toEqual(['fast', 'slow']);
  });
});

describe('settlePendingAttachmentUploads', () => {
  const attachmentInState = (id: string, uploadState: string) => ({
    localMetadata: {
      file: new File([''], `${id}.png`, { type: 'image/png' }),
      id,
      previewUri: `blob:${id}`,
      uploadState,
    },
    type: 'image',
  });

  const settle = (attachments: unknown[], upload: (params: { id: string }) => unknown) =>
    settlePendingAttachmentUploads({
      attachments: attachments as never,
      channelCid: 'messaging:x',
      client: { uploadManager: { upload } } as never,
    });

  const uploadsEverything = ({ id }: { id: string }) =>
    Promise.resolve({ file: `https://cdn/${id}.png` });

  it('retries an upload that already failed', async () => {
    // Offline is the case that needs this: the first attempt could not have succeeded, so the
    // send is the retry.
    const upload = vi.fn(uploadsEverything);

    const { attachments, failureReason } = await settle(
      [attachmentInState('offline', 'failed')],
      upload,
    );

    expect(upload).toHaveBeenCalledTimes(1);
    expect(failureReason).toBeUndefined();
    expect(attachments[0]).toMatchObject({ image_url: 'https://cdn/offline.png' });
    expect(attachments[0]).not.toHaveProperty('localMetadata');
  });

  it('leaves a blocked attachment alone', async () => {
    // The upload configuration refused it, so no retry can settle it.
    const upload = vi.fn(uploadsEverything);

    const { attachments, failureReason } = await settle(
      [attachmentInState('refused', 'blocked')],
      upload,
    );

    expect(upload).not.toHaveBeenCalled();
    expect(failureReason).toBeUndefined();
    expect(attachments[0]).toHaveProperty('localMetadata.uploadState', 'blocked');
  });

  it('attempts every unresolved upload and keeps the URLs of the ones that worked', async () => {
    const upload = vi.fn(({ id }: { id: string }) =>
      id === 'bad'
        ? Promise.reject(new Error('boom'))
        : Promise.resolve({ file: `https://cdn/${id}.png` }),
    );

    const { attachments, failureReason } = await settle(
      [
        attachmentInState('ok1', 'uploading'),
        attachmentInState('bad', 'failed'),
        attachmentInState('ok2', 'uploading'),
      ],
      upload,
    );

    expect(upload.mock.calls.map(([params]) => params.id)).toEqual(['ok1', 'bad', 'ok2']);
    expect((failureReason as Error).message).toBe('boom');
    expect(attachments[0]).toMatchObject({ image_url: 'https://cdn/ok1.png' });
    expect(attachments[2]).toMatchObject({ image_url: 'https://cdn/ok2.png' });
    // Only the one that did not make it is left for the next retry.
    expect(attachments[1]).toHaveProperty('localMetadata.id', 'bad');
  });

  it('does not touch an attachment that already resolved', async () => {
    const upload = vi.fn(uploadsEverything);
    const done = { image_url: 'https://cdn/done.png', type: 'image' };

    const { attachments } = await settle([done], upload);

    expect(upload).not.toHaveBeenCalled();
    expect(attachments[0]).toBe(done);
  });
});
