import { describe, expect, it } from 'vitest';
import {
  makeLinkedCollections,
  msg,
  recordPublishes,
  seedWindow,
} from './test-utils/publishAmplification';
import { formatMessage, Thread } from '../../src';
import { generateChannel } from './test-utils/generateChannel';
import { generateMsg } from './test-utils/generateMessage';
import { getClientWithUser } from './test-utils/getClient';
import { convertDateToTimestamp } from './test-utils/time';
import type { MessageResponse } from '../../src/types';
import { EntityStore } from '../../src/entityStore/EntityStore';
import { MessagePaginator } from '../../src/pagination/paginators/MessagePaginator';
import type { LocalMessage } from '../../src/types';

/**
 * **Baseline characterisation of publish amplification.**
 *
 * These assert what the SDK does *today*, not what it should do. They exist so every step of the fix
 * has a real before/after number instead of an argument, and so the numbers move visibly in the diff
 * as each step lands.
 *
 * **Every number here is expected to change as the fix proceeds.** When one drops, update it in the
 * same commit that caused the drop — that edit is the evidence the step worked.
 *
 * Each scenario is measured as a whole table rather than one `it` per cell, so a regression prints
 * the entire shape at once instead of failing on the first cell and hiding the rest.
 *
 * Environment: **unthrottled**. Vitest auto-disables state throttling
 * (`src/pagination/paginators/stateThrottling.ts`), so these are the *un-coalesced* counts. A real
 * client's message list rides a 500ms throttle and shows lower numbers for the same work; the two
 * are not comparable and must never be quoted interchangeably.
 */
/**
 * One inbound event must cost each collection holding the message exactly one publish.
 *
 * Every row here was measured above that floor at some point, and each is held down by a different
 * change, so a regression shows up as a named row rather than a total that is merely wrong. Adding
 * a new collection means adding it to `linked()`; if it amplifies, a row fails.
 *
 * Unthrottled, since Vitest disables state throttling — these are the un-coalesced counts. A real
 * client's message list rides a 500ms throttle and shows fewer, so the two are not comparable.
 */
describe('publish amplification — one event, one publish per collection', () => {
  const PARENT_ID = 'parent-1';

  /** A channel whose main list, pinned list and open thread all hold the same message. */
  const linked = () => {
    const client = getClientWithUser({ id: 'me' });
    const { channel: channelResponse } = generateChannel();
    const channel = client.channel(channelResponse.type, channelResponse.id);
    channel.initialized = true;
    (client as unknown as { activeChannels: Record<string, unknown> }).activeChannels[
      channel.cid
    ] = channel;

    // pinned AND show_in_channel, so all three collections genuinely hold it
    const held = {
      cid: channel.cid,
      parent_id: PARENT_ID,
      pinned: true,
      pinned_at: 1,
      show_in_channel: true,
      user: { id: 'author' },
    };
    // Several messages by one author: a sweep (user.updated / user.deleted) that publishes per
    // message instead of once for the whole pass is only visible with more than one.
    const page = ['seed', 'seed2', 'seed3', 'seed4', 'seed5'].map((id, i) =>
      formatMessage(
        generateMsg({
          ...held,
          created_at: convertDateToTimestamp(`2020-01-0${i + 1}T00:00:00.000Z`),
          id,
        }) as MessageResponse,
      ),
    );
    channel.messagePaginator.ingestPage({
      isHead: true,
      isTail: true,
      page,
      setActive: true,
    });
    channel.pinnedMessagesPaginator.ingestPage({
      isHead: true,
      isTail: true,
      page,
      setActive: true,
    });

    const thread = new Thread({
      channel,
      client,
      parentMessage: generateMsg({ cid: channel.cid, id: PARENT_ID }) as never,
    });
    thread.messagePaginator.ingestPage({
      isHead: true,
      isTail: true,
      page,
      setActive: true,
    });
    client.threads.state.next((current) => ({
      ...current,
      threads: [thread, ...current.threads],
    }));
    thread.registerSubscriptions();

    const recorder = recordPublishes({
      main: channel.messagePaginator,
      pinned: channel.pinnedMessagesPaginator,
      thread: thread.messagePaginator,
    });
    return { channel, client, held, recorder };
  };

  const FLOOR = { main: 1, pinned: 1, thread: 1 };

  it.each([
    [
      'message.new',
      (held: Record<string, unknown>) => ({
        message: generateMsg({ ...held, id: 'arrived' }),
        type: 'message.new',
      }),
    ],
    [
      'message.updated',
      (held: Record<string, unknown>) => ({
        message: generateMsg({ ...held, id: 'seed', text: 'edited' }),
        type: 'message.updated',
      }),
    ],
    [
      'message.deleted (soft)',
      (held: Record<string, unknown>) => ({
        message: generateMsg({ ...held, id: 'seed', type: 'deleted' }),
        type: 'message.deleted',
      }),
    ],
    [
      'message.deleted (hard)',
      (held: Record<string, unknown>) => ({
        hard_delete: true,
        message: generateMsg({ ...held, id: 'seed' }),
        type: 'message.deleted',
      }),
    ],
    [
      'reaction.new',
      (held: Record<string, unknown>) => ({
        message: generateMsg({ ...held, id: 'seed' }),
        reaction: {
          created_at: 0,
          message_id: 'seed',
          type: 'love',
          updated_at: 0,
          user_id: 'other',
        },
        type: 'reaction.new',
      }),
    ],
    [
      'reaction.deleted',
      (held: Record<string, unknown>) => ({
        message: generateMsg({ ...held, id: 'seed' }),
        reaction: {
          created_at: 0,
          message_id: 'seed',
          type: 'love',
          updated_at: 0,
          user_id: 'other',
        },
        type: 'reaction.deleted',
      }),
    ],
    [
      'user.updated (renames the author of a held message)',
      () => ({ type: 'user.updated', user: { id: 'author', name: 'Renamed' } }),
    ],
    [
      'user.deleted (sweeps every message by the author)',
      () => ({ created_at: 0, type: 'user.deleted', user: { id: 'author' } }),
    ],
  ])('%s publishes once per collection', (_label, buildEvent) => {
    const { channel, client, held, recorder } = linked();

    client.dispatchEvent({ cid: channel.cid, ...buildEvent(held) } as never);

    expect(recorder.stateCounts()).toEqual(FLOOR);
    recorder.stop();
  });
});

describe('publish amplification — baseline (unthrottled)', () => {
  const seed = [msg('m1', 1), msg('m2', 2), msg('m3', 3)];
  const edited = (overrides: Partial<LocalMessage> = {}) =>
    ({ ...seed[1], text: 'edited', ...overrides }) as LocalMessage;

  /** One logical change delivered to `n` collections; returns total `state` publishes. */
  const measure = ({
    n,
    shared,
    sameObject,
  }: {
    n: number;
    shared: boolean;
    sameObject: boolean;
  }) => {
    const { paginators, recorder } = makeLinkedCollections({ n, seed, shared });
    try {
      const one = edited();
      paginators.forEach((paginator) =>
        paginator.ingestItem(sameObject ? one : edited()),
      );
      return recorder.total().state;
    } finally {
      recorder.stop();
    }
  };

  const curve = (opts: { shared: boolean; sameObject: boolean }) =>
    Object.fromEntries(
      [1, 2, 3, 4, 5, 6].map((n) => [n, measure({ n, ...opts })]),
    ) as Record<string, number>;

  it('mechanism 1 — N collections, each formatting its OWN object (what call sites do today)', () => {
    // Distinct objects miss `EntityStore.upsert`'s `previous === entity` bail, so every write
    // dirties the other N-1 holders and each of those re-projects.
    //
    // Measured shape: **n²**, now that the single-publish primitive has removed mechanism 2. (Before
    // it this was n(n+1) — the same quadratic with each writer's own publish doubled.) This is the
    // clean N² `spec.md` §3 records, and it is the term the dispatch scope removes.
    expect(curve({ shared: true, sameObject: false })).toEqual({
      1: 1,
      2: 4,
      3: 9,
      4: 16,
      5: 25,
      6: 36,
    });
  });

  it('mechanism 1 — N collections sharing ONE object (what the dispatch scope will produce)', () => {
    // Measured shape: **2n - 1** (was 3n - 1 before the single-publish primitive), decomposing as:
    //   n       each collection's own ingestItem, now exactly one publish each
    //   + (n-1) ONE markDirty round: only the first write actually lands, since writes 2..n hit the
    //           reference bail — so the siblings are dirtied once, not n-1 times.
    //
    // One step left. The store transaction defers that markDirty round to scope exit, by which point
    // every sibling already holds the identical object, so `reconcileChangedIds`' fast path
    // (`updated === currentItems[i]`) skips them entirely — giving the floor of **n**.
    //
    // That is also precisely why P8 is required rather than optional: the throttled branch of
    // `reconcileChangedIds` has no such content check, so a throttled message list cannot reach the
    // floor without it.
    expect(curve({ shared: true, sameObject: true })).toEqual({
      1: 1,
      2: 3,
      3: 5,
      4: 7,
      5: 9,
      6: 11,
    });
  });

  it('control — private stores, so cross-collection fan-out is structurally impossible', () => {
    // Isolates mechanism 2 from mechanism 1: whatever remains here is NOT fan-out. Exactly **n** —
    // one publish per collection, which is the floor. Mechanism 2 is gone (this was 2n), so any
    // future regression above n in this column is a new intra-operation publish, not fan-out.
    expect(curve({ shared: false, sameObject: false })).toEqual({
      1: 1,
      2: 2,
      3: 3,
      4: 4,
      5: 5,
      6: 6,
    });
  });

  describe('mechanism 2 — one ingestItem, more than one publish', () => {
    const makeSolo = () => {
      const store = new EntityStore<LocalMessage>({ getEntityId: (m) => m.id });
      const paginator = new MessagePaginator({
        channel: {
          cid: 'messaging:amplification',
          getReplies: () => undefined,
          query: () => undefined,
          getClient: () => ({ messageStore: store, user: { id: 'me' } }),
          state: { read: {} },
        } as never,
      });
      seedWindow(paginator, seed);
      return paginator;
    };

    it('an INSERT of a new id and a REPLACE of a held id each publish exactly once', () => {
      const insert = makeSolo();
      const insertRecorder = recordPublishes({ p: insert });
      insert.ingestItem(msg('m4', 4));
      const insertCount = insertRecorder.counts().p.state;
      insertRecorder.stop();

      const replace = makeSolo();
      const replaceRecorder = recordPublishes({ p: replace });
      replace.ingestItem(edited());
      const replaceCount = replaceRecorder.counts().p.state;
      replaceRecorder.stop();

      // A replace is internally remove-then-insert, and before the single-publish primitive each
      // half emitted — 2 for one logical change. Both are 1 now, and a replace going back to 2 is
      // the specific regression this guards.
      expect({ insert: insertCount, replace: replaceCount }).toEqual({
        insert: 1,
        replace: 1,
      });
    });
  });
});
