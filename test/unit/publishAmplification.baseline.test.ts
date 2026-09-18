import { describe, expect, it } from 'vitest';
import {
  makeLinkedCollections,
  msg,
  recordPublishes,
  seedWindow,
} from './test-utils/publishAmplification';
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
    // Measured shape: **n(n+1)** = the N² fan-out plus mechanism 2 doubling each writer's own
    // publish. (`spec.md` §3 records a clean N² — 1/4/9/16 — because its harness counted one
    // publish per ingest. Same quadratic, one term richer once mechanism 2 is included.)
    expect(curve({ shared: true, sameObject: false })).toEqual({
      1: 2,
      2: 6,
      3: 12,
      4: 20,
      5: 30,
      6: 42,
    });
  });

  it('mechanism 1 — N collections sharing ONE object (what the dispatch scope will produce)', () => {
    // Measured shape: **3n - 1**, which decomposes as:
    //   2n      each collection's own ingestItem, still publishing twice (mechanism 2)
    //   + (n-1) ONE markDirty round: only the first write actually lands, since writes 2..n hit the
    //           reference bail — so the siblings are dirtied once, not n-1 times.
    //
    // The quadratic term is gone. What is left is the two remaining steps:
    //   - the single-publish primitive takes 2n -> n, giving 2n - 1 (the figure `spec.md` predicts);
    //   - the store transaction then defers that one markDirty round to scope exit, by which point
    //     every sibling already holds the identical object, so `reconcileChangedIds`' fast path
    //     (`updated === currentItems[i]`) skips them entirely — giving the floor of **n**.
    //
    // That is also precisely why P8 is required rather than optional: the throttled branch of
    // `reconcileChangedIds` has no such content check, so a throttled message list cannot reach the
    // floor without it.
    expect(curve({ shared: true, sameObject: true })).toEqual({
      1: 2,
      2: 5,
      3: 8,
      4: 11,
      5: 14,
      6: 17,
    });
  });

  it('control — private stores, so cross-collection fan-out is structurally impossible', () => {
    // Isolates mechanism 2 from mechanism 1: whatever remains here is NOT fan-out. Exactly **2n** —
    // two publishes per replace, per collection, and nothing else. This is the number that proves
    // the `3n - 1` above really does contain a fan-out term, and the number the single-publish
    // primitive should halve.
    expect(curve({ shared: false, sameObject: false })).toEqual({
      1: 2,
      2: 4,
      3: 6,
      4: 8,
      5: 10,
      6: 12,
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

    it('an INSERT of a new id publishes once; a REPLACE of a held id publishes twice', () => {
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

      // A replace is internally remove-then-insert and each half publishes. The single-publish
      // primitive in `BasePaginator` brings the replace to 1.
      expect({ insert: insertCount, replace: replaceCount }).toEqual({
        insert: 1,
        replace: 2,
      });
    });
  });
});
