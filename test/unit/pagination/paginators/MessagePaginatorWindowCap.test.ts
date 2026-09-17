import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnyInterval } from '../../../../src/pagination/paginators/BasePaginator';
import { MessagePaginator } from '../../../../src/pagination/paginators/MessagePaginator';
import { setStateThrottlingEnabled } from '../../../../src/pagination/paginators/stateThrottling';
import { EntityStore } from '../../../../src/entityStore/EntityStore';
import { formatMessage } from '../../../../src';
import { generateMsg } from '../../test-utils/generateMessage';
import { convertDateToTimestamp } from '../../test-utils/time';
import type { Channel } from '../../../../src/channel';
import type { StreamChat } from '../../../../src/client';
import type { LocalMessage, MessageResponse } from '../../../../src/types';

// Day `n` of 2020-01 as the created_at, so ids sort the same way they read.
const msg = (
  id: string,
  day: number,
  overrides: Partial<MessageResponse> = {},
): LocalMessage =>
  formatMessage(
    generateMsg({
      id,
      cid: 'channel-id',
      created_at: convertDateToTimestamp(
        `2020-01-${String(day).padStart(2, '0')}T00:00:00.000Z`,
      ),
      ...overrides,
    }) as MessageResponse,
  );

const ids = (p: MessagePaginator) => p.items?.map((m) => m.id) ?? [];

/**
 * Interval MEMBERSHIP, which is the only thing that distinguishes "this paginator let go of the id"
 * from "the content happens to be gone". `getItem` / `state.items` both read through the store and
 * would look identical either way.
 */
const memberIds = (p: MessagePaginator): string[] =>
  (p as unknown as { itemIntervals: AnyInterval[] }).itemIntervals.flatMap(
    (i) => i.itemIds,
  );

const headInterval = (p: MessagePaginator) =>
  (p as unknown as { itemIntervals: AnyInterval[] }).itemIntervals[0] as AnyInterval & {
    isTail: boolean;
    hasMoreTail: boolean;
  };

describe('MessagePaginator — window cap (pruning)', () => {
  let store: EntityStore<LocalMessage>;
  let client: StreamChat;
  let channel: Channel;

  beforeEach(() => {
    store = new EntityStore<LocalMessage>({ getEntityId: (m) => m.id });
    client = { messageStore: store, user: { id: 'me' } } as unknown as StreamChat;
    channel = {
      cid: 'channel-id',
      getReplies: vi.fn(),
      query: vi.fn(),
      getClient: () => client,
      // postQueryReconcile seeds the unread snapshot from the own-user read state.
      state: { read: {} },
    } as unknown as Channel;
  });

  /** An independent channel + store, so two paginators in one test do not share entities. */
  const makeIsolatedChannel = (): Channel => {
    const isolatedStore = new EntityStore<LocalMessage>({ getEntityId: (m) => m.id });
    const isolatedClient = {
      messageStore: isolatedStore,
      user: { id: 'me' },
    } as unknown as StreamChat;
    return {
      cid: 'channel-id',
      getReplies: vi.fn(),
      query: vi.fn(),
      getClient: () => isolatedClient,
      state: { read: {} },
    } as unknown as Channel;
  };

  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** A paginator whose window is the anchored head with older messages still on the server. */
  const make = (maxLoadedItems?: number) =>
    new MessagePaginator({
      channel,
      paginatorOptions: { maxLoadedItems, pageSize: 3 },
    });

  const seedHead = (p: MessagePaginator, count: number, { isTail = false } = {}) => {
    p.ingestPage({
      page: Array.from({ length: count }, (_, i) => msg(`m${i + 1}`, i + 1)),
      isHead: true,
      isTail,
      setActive: true,
    });
    // Discipline: never trust a paginator test that has not asserted the seed landed.
    expect(ids(p)).toHaveLength(count);
  };

  describe('the cap itself', () => {
    it('drops the oldest as new messages arrive, holding the window at the limit', () => {
      const p = make(5);
      seedHead(p, 5);

      p.ingestItem(msg('m6', 6));
      expect(ids(p)).toEqual(['m2', 'm3', 'm4', 'm5', 'm6']);

      p.ingestItem(msg('m7', 7));
      expect(ids(p)).toEqual(['m3', 'm4', 'm5', 'm6', 'm7']);

      for (let i = 8; i <= 20; i++) p.ingestItem(msg(`m${i}`, i));
      expect(ids(p)).toHaveLength(5);
      expect(ids(p)).toEqual(['m16', 'm17', 'm18', 'm19', 'm20']);
    });

    it('is unbounded when no cap is configured', () => {
      const p = make();
      seedHead(p, 5);
      for (let i = 6; i <= 20; i++) p.ingestItem(msg(`m${i}`, i));
      expect(ids(p)).toHaveLength(20);
    });

    it('clamps a cap below the page size up to it, so a fetched page cannot be pruned away', () => {
      // pageSize is 3; asking for 1 would drop two thirds of every page the moment it landed.
      const p = make(1);
      seedHead(p, 3);
      for (let i = 4; i <= 8; i++) p.ingestItem(msg(`m${i}`, i));
      expect(ids(p)).toHaveLength(3);
    });
  });

  describe('store membership', () => {
    it('releases a pruned id, and the store frees it when nothing else holds it', () => {
      const p = make(3);
      seedHead(p, 3);
      expect(store.has('m1')).toBe(true);

      p.ingestItem(msg('m4', 4));

      expect(memberIds(p)).not.toContain('m1');
      expect(store.has('m1')).toBe(false);
      // and the survivors are untouched
      expect(memberIds(p)).toEqual(['m2', 'm3', 'm4']);
      expect(store.has('m2')).toBe(true);
    });

    it('keeps a pruned message alive in the store while another holder still references it', () => {
      const p = make(3);
      const sibling = new MessagePaginator({
        channel,
        paginatorOptions: { pageSize: 3 },
      });
      seedHead(p, 3);
      // A second collection (a thread reply list / the pinned list) holding the same message.
      sibling.ingestPage({
        page: [msg('m1', 1)],
        isHead: true,
        isTail: true,
        setActive: true,
      });
      expect(sibling.items?.map((m) => m.id)).toEqual(['m1']);

      p.ingestItem(msg('m4', 4));

      expect(memberIds(p)).not.toContain('m1');
      // Content survives: the prune released one reference, not the entity.
      expect(store.has('m1')).toBe(true);
      expect(sibling.items?.map((m) => m.id)).toEqual(['m1']);
    });
  });

  describe('pagination after a prune', () => {
    it('re-opens the tailward edge and re-points the cursor at the new oldest message', () => {
      const p = make(3);
      seedHead(p, 3);

      p.ingestItem(msg('m4', 4));

      expect(p.hasMoreTail).toBe(true);
      expect(p.cursor?.tailward).toBe('m2');
      const head = headInterval(p);
      expect(head.isTail).toBe(false);
      expect(head.hasMoreTail).toBe(true);
    });

    it('re-opens it even when the window had reached the channel start', () => {
      const p = make(3);
      seedHead(p, 3, { isTail: true });
      expect(p.hasMoreTail).toBe(false);

      p.ingestItem(msg('m4', 4));

      // Older messages provably exist on the server again — leaving this false would strand the user.
      expect(p.hasMoreTail).toBe(true);
      expect(p.cursor?.tailward).toBe('m2');
    });

    it('fetches older messages from the new oldest id', async () => {
      const p = make(3);
      seedHead(p, 3);
      p.ingestItem(msg('m4', 4));

      (channel.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [generateMsg({ id: 'm1', cid: 'channel-id' })],
      });

      await p.toTail();

      const [[queryArgs]] = (channel.query as ReturnType<typeof vi.fn>).mock.calls;
      expect(queryArgs.messages.id_lt).toBe('m2');
    });
  });

  describe('what it must never prune', () => {
    it('skips an unsent message instead of destroying it, and never makes it the cursor', () => {
      const p = make(3);
      // m1 is the oldest AND is a failed send — it sorts old, so a naive cap would eat it.
      p.ingestPage({
        page: [msg('m1', 1, { status: 'failed' }), msg('m2', 2), msg('m3', 3)],
        isHead: true,
        isTail: false,
        setActive: true,
      });
      expect(ids(p)).toEqual(['m1', 'm2', 'm3']);

      p.ingestItem(msg('m4', 4));

      // m2 was dropped instead; the failed send is still there.
      expect(ids(p)).toEqual(['m1', 'm3', 'm4']);
      expect(store.has('m1')).toBe(true);
      // ...and the cursor skipped past it — its id means nothing to the server.
      expect(p.cursor?.tailward).toBe('m3');

      // It survives an extended burst, the window simply sitting a little above the cap.
      for (let i = 5; i <= 15; i++) p.ingestItem(msg(`m${i}`, i));
      expect(ids(p)).toContain('m1');
      expect(ids(p)).toHaveLength(3);
    });

    it('does not prune while the user has jumped away from the head', () => {
      const p = make(3);
      // Head window: the three newest messages.
      p.ingestPage({
        page: [msg('m10', 10), msg('m11', 11), msg('m12', 12)],
        isHead: true,
        isTail: false,
        setActive: true,
      });
      // A genuinely OLDER window becomes active, as a jump-to-message would make it.
      p.ingestPage({
        page: [msg('o1', 1), msg('o2', 2)],
        isHead: false,
        isTail: true,
        setActive: true,
      });
      expect(ids(p)).toEqual(['o1', 'o2']);
      const before = memberIds(p).length;

      // A new live message lands in the head interval, which is over the cap — and stays there,
      // because the window the user is reading is not the one being capped.
      p.ingestItem(msg('m13', 13));

      expect(memberIds(p)).toHaveLength(before + 1);
      expect(memberIds(p)).toContain('m10');
    });

    it('does not prune a logical (live-only) window, which could never be fetched back', () => {
      const p = make(2);
      // No page ever loaded: live messages land in the logical head, with no pagination provenance.
      for (let i = 1; i <= 6; i++) p.ingestItem(msg(`m${i}`, i));
      expect(ids(p)).toHaveLength(6);
    });
  });

  describe('the consumer gate', () => {
    it('stops pruning while the consumer says it is unsafe, and resumes after', () => {
      const p = make(3);
      seedHead(p, 3);

      p.setPruningSuspended(true);
      p.ingestItem(msg('m4', 4));
      p.ingestItem(msg('m5', 5));
      expect(ids(p)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);

      p.setPruningSuspended(false);
      p.ingestItem(msg('m6', 6));
      expect(ids(p)).toEqual(['m4', 'm5', 'm6']);
    });
  });

  describe('with locked item order', () => {
    /**
     * `lockItemOrder` makes the emit path compose the next array from the LAST PUBLISHED one instead
     * of re-projecting from the interval, so a prune on that same ingest would otherwise republish
     * the ids it had just dropped. Reachable exactly as the SDK drives it: suspend while the user
     * reads old messages, let the window grow past the cap, resume.
     */
    it('drops pruned messages from the order-preserved array instead of resurrecting them', () => {
      const p = new MessagePaginator({
        channel,
        paginatorOptions: { lockItemOrder: true, maxLoadedItems: 5, pageSize: 3 },
      });
      seedHead(p, 5);

      // Grow past the cap with pruning suspended, as scrolling up does.
      p.setPruningSuspended(true);
      for (let i = 6; i <= 8; i++) p.ingestItem(msg(`m${i}`, i));
      expect(ids(p)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8']);

      // Back at the live edge, then an UPDATE to an already-visible message — the order-locked path.
      p.setPruningSuspended(false);
      p.ingestItem(msg('m7', 7, { text: 'edited' }));

      expect(ids(p)).toHaveLength(5);
      expect(ids(p)).not.toContain('m1');
      expect(ids(p)).not.toContain('m3');
      // the survivors kept their order, and the edit landed
      expect(ids(p)).toEqual(['m4', 'm5', 'm6', 'm7', 'm8']);
      expect(p.items?.find((m) => m.id === 'm7')?.text).toBe('edited');
      // and the window really is capped, not just the projection
      expect(memberIds(p)).toHaveLength(5);
    });
  });

  describe('it costs no publish of its own', () => {
    const countPublishes = (p: MessagePaginator) => {
      let state = 0;
      let views = 0;
      // RAW subscribe, not subscribeWithSelector: `partialNext` always allocates a new state object,
      // so every publish notifies — including one that only touches `hasMoreTail`/`cursor`. A
      // selector keyed on `items` would silently ignore exactly the regression this guards against
      // (and `<Channel>` does select `hasMoreTail`, so such a publish is a real extra render).
      p.state.subscribe(() => {
        state += 1;
      });
      p.intervalViews.subscribeWithSelector(
        (s) => ({ items: s.anchoredHead }),
        () => {
          views += 1;
        },
      );
      // subscribeWithSelector fires once immediately; ignore that, as useStateStore would.
      state = 0;
      views = 0;
      return { state: () => state, views: () => views };
    };

    it('publishes exactly as often with the cap on as with it off', () => {
      // Separate stores on purpose: sharing one would make each paginator a sibling subscriber of
      // the other's writes, and the resulting cross-notifications would swamp the signal.
      const capped = new MessagePaginator({
        channel: makeIsolatedChannel(),
        paginatorOptions: { maxLoadedItems: 5, pageSize: 3 },
      });
      const uncapped = new MessagePaginator({
        channel: makeIsolatedChannel(),
        paginatorOptions: { pageSize: 3 },
      });
      seedHead(capped, 5);
      seedHead(uncapped, 5);

      const cappedCount = countPublishes(capped);
      const uncappedCount = countPublishes(uncapped);

      for (let i = 6; i <= 30; i++) {
        capped.ingestItem(msg(`m${i}`, i));
        uncapped.ingestItem(msg(`m${i}`, i));
      }

      // The prune rode the ingest's own publishes — it added none.
      expect(cappedCount.state()).toBe(uncappedCount.state());
      expect(cappedCount.views()).toBe(uncappedCount.views());
      // ...and it really did prune.
      expect(ids(capped)).toHaveLength(5);
      expect(ids(uncapped)).toHaveLength(30);
    });
  });

  describe('under the state-publish throttle', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      setStateThrottlingEnabled(true);
    });

    afterEach(() => {
      setStateThrottlingEnabled(false);
      vi.useRealTimers();
    });

    it('a burst prunes and publishes once, carrying the re-opened tailward edge with it', () => {
      const THROTTLE = 200;
      const p = new MessagePaginator({
        channel,
        paginatorOptions: { maxLoadedItems: 5, pageSize: 3, stateThrottleMs: THROTTLE },
      });
      seedHead(p, 5, { isTail: true });

      const handler = vi.fn();
      p.state.subscribe(handler);
      handler.mockClear();

      for (let i = 6; i <= 15; i++) p.ingestItem(msg(`m${i}`, i)); // 10 arrivals
      // leading edge only so far
      expect(handler).toHaveBeenCalledTimes(1);

      vi.advanceTimersByTime(THROTTLE); // single trailing publish
      expect(handler).toHaveBeenCalledTimes(2);

      expect(ids(p)).toEqual(['m11', 'm12', 'm13', 'm14', 'm15']);
      // The pagination fields rode that same publish rather than emitting on their own.
      expect(p.hasMoreTail).toBe(true);
      expect(p.cursor?.tailward).toBe('m11');
    });

    /**
     * The prune's pagination fields are published by whichever window publish comes next, which under
     * the throttle can be up to a full interval later. The query path writes the same fields. So if
     * the prune handed over *values*, a `toTail()` landing in between would be undone at the throttle
     * boundary — the cursor rewound to a pre-merge id and the page just merged fetched all over again.
     * They are re-derived from the committed interval instead, which is what this pins.
     */
    it('does not rewind a cursor that a tailward query moved while its publish was pending', async () => {
      const THROTTLE = 200;
      const p = new MessagePaginator({
        channel,
        paginatorOptions: { maxLoadedItems: 3, pageSize: 3, stateThrottleMs: THROTTLE },
      });
      p.ingestPage({
        page: [msg('m10', 10), msg('m11', 11), msg('m12', 12)],
        isHead: true,
        isTail: false,
        setActive: true,
      });

      // Spend the throttle's leading edge, so the NEXT prune's publish is genuinely deferred.
      p.ingestItem(msg('m13', 13));
      expect(p.cursor?.tailward).toBe('m11');

      // Prunes m11. Nothing is published yet — only the trailing flush is scheduled.
      p.ingestItem(msg('m14', 14));
      expect(p.cursor?.tailward).toBe('m11');

      // The user scrolls up and a full older page merges while that flush is still pending.
      (channel.query as ReturnType<typeof vi.fn>).mockResolvedValue({
        messages: [1, 2, 3].map((d) =>
          generateMsg({
            id: `a${d}`,
            cid: 'channel-id',
            created_at: convertDateToTimestamp(`2020-01-0${d}T00:00:00.000Z`),
          }),
        ),
      });
      await p.toTail();

      const afterMerge = p.cursor?.tailward;
      expect(afterMerge).toBe('a1');

      vi.advanceTimersByTime(THROTTLE);

      // 'm12' is what the prune itself saw as the new oldest id. Republishing it here would send the
      // next `id_lt` back above the page that just merged.
      expect(p.cursor?.tailward).not.toBe('m12');
      expect(p.cursor?.tailward).toBe(afterMerge);
    });

    /**
     * `state` tracks the ACTIVE interval, so a prune of the head says nothing about a window the user
     * jumped to in the meantime. Draining onto it would rewrite that window's pagination from a prune
     * it had nothing to do with — here, flipping an exhausted tail edge back to a cursor.
     */
    it('does not apply a pending prune to a window the consumer jumped to in the meantime', () => {
      const THROTTLE = 200;
      const p = new MessagePaginator({
        channel,
        paginatorOptions: { maxLoadedItems: 3, pageSize: 3, stateThrottleMs: THROTTLE },
      });
      p.ingestPage({
        page: [msg('m10', 10), msg('m11', 11), msg('m12', 12)],
        isHead: true,
        isTail: false,
        setActive: true,
      });

      p.ingestItem(msg('m13', 13)); // spends the leading edge
      p.ingestItem(msg('m14', 14)); // prunes m11 — publish deferred to the trailing flush

      // A jump-to-message: an older, already-exhausted window becomes the active one.
      p.ingestPage({
        page: [msg('o1', 1), msg('o2', 2)],
        isHead: false,
        isTail: true,
        setActive: true,
      });
      expect(ids(p)).toEqual(['o1', 'o2']);
      const jumpedCursor = p.cursor?.tailward;
      expect(p.hasMoreTail).toBe(false);

      vi.advanceTimersByTime(THROTTLE);

      expect(p.cursor?.tailward).toBe(jumpedCursor);
      expect(p.cursor?.tailward).not.toBe('o1');
      expect(p.hasMoreTail).toBe(false);
    });

    /**
     * An optimistic (local-user) write flushes this paginator's pending publish early so the send
     * renders without the throttle delay — `channel.ts` → `EntityStore.flushSubscribers` →
     * `flushState` → `flushPendingPublishes`. That lands mid-window, on a prune whose publish is still
     * pending, so it is the path most likely to consume the pending fields without emitting them.
     */
    it('carries the pending pagination when an optimistic send flushes the throttle early', () => {
      const THROTTLE = 200;
      const p = new MessagePaginator({
        channel,
        paginatorOptions: { maxLoadedItems: 3, pageSize: 3, stateThrottleMs: THROTTLE },
      });
      p.ingestPage({
        page: [msg('m10', 10), msg('m11', 11), msg('m12', 12)],
        isHead: true,
        isTail: false,
        setActive: true,
      });

      p.ingestItem(msg('m13', 13)); // spends the leading edge; prunes m10
      expect(p.cursor?.tailward).toBe('m11');

      p.ingestItem(msg('m14', 14)); // prunes m11 — publish deferred to the trailing edge
      expect(p.cursor?.tailward).toBe('m11');

      // The send: ingested, then the store flushes this paginator so it renders immediately.
      p.ingestItem(msg('m15', 15)); // prunes m12, still inside the same throttle window
      store.flushSubscribers('m15');

      // The early flush published the pagination as it drained it.
      expect(ids(p)).toEqual(['m13', 'm14', 'm15']);
      expect(p.cursor?.tailward).toBe('m13');
      expect(p.hasMoreTail).toBe(true);

      // ...and the trailing edge has nothing left to correct.
      vi.advanceTimersByTime(THROTTLE);
      expect(p.cursor?.tailward).toBe('m13');
    });
  });
});
