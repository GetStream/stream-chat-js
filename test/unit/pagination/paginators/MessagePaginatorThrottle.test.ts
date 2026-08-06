import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessagePaginator } from '../../../../src/pagination/paginators/MessagePaginator';
import { setStateThrottlingEnabled } from '../../../../src/pagination/paginators/stateThrottling';
import { EntityStore } from '../../../../src/entityStore/EntityStore';
import { applyReactionLocally } from '../../../../src/entityStore/applyReactionLocally';
import { formatMessage } from '../../../../src';
import { generateMsg } from '../../test-utils/generateMessage';
import type { Channel } from '../../../../src/channel';
import type { StreamChat } from '../../../../src/client';
import type { LocalMessage, MessageResponse, Reaction } from '../../../../src/types';

const msg = (id: string, day: number): LocalMessage =>
  formatMessage(
    generateMsg({
      id,
      cid: 'channel-id',
      created_at: `2020-01-${String(day).padStart(2, '0')}T00:00:00.000Z`,
    }) as MessageResponse,
  );

const ids = (p: MessagePaginator) => p.items?.map((m) => m.id);

const THROTTLE = 200;

describe('MessagePaginator — state publish throttling', () => {
  let channel: Channel;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    // Vitest auto-disables state throttling for the rest of the suite; turn it on here.
    setStateThrottlingEnabled(true);
    channel = {
      cid: 'channel-id',
      getReplies: vi.fn(),
      query: vi.fn(),
    } as unknown as Channel;
  });

  afterEach(() => {
    setStateThrottlingEnabled(false);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const make = () =>
    new MessagePaginator({ channel, paginatorOptions: { stateThrottleMs: THROTTLE } });

  const seed = (p: MessagePaginator) =>
    p.setItems({
      valueOrFactory: [msg('m1', 1), msg('m2', 2)],
      isFirstPage: true,
      isLastPage: true,
    });

  it('coalesces a burst of ingests: leading emits the first, the rest land on the trailing edge', () => {
    const p = make();
    seed(p);
    expect(ids(p)).toEqual(['m1', 'm2']);

    p.ingestItem(msg('m3', 3)); // leading edge -> immediate
    expect(ids(p)).toEqual(['m1', 'm2', 'm3']);

    p.ingestItem(msg('m4', 4)); // within window -> deferred
    p.ingestItem(msg('m5', 5)); // within window -> deferred
    expect(ids(p)).toEqual(['m1', 'm2', 'm3']); // not published yet

    vi.advanceTimersByTime(THROTTLE); // trailing edge
    expect(ids(p)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
  });

  it('notifies `state` subscribers at throttled cadence, not once per event', () => {
    const p = make();
    seed(p);
    const handler = vi.fn();
    p.state.subscribe(handler); // fires once immediately with the seeded value
    handler.mockClear();

    for (let i = 3; i <= 12; i++) p.ingestItem(msg(`m${i}`, i)); // 10 ingests
    // only the leading edge published so far; the other 9 are coalesced into a pending trailing
    expect(handler).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(THROTTLE); // single trailing notification
    expect(handler).toHaveBeenCalledTimes(2);
    expect(ids(p)).toEqual([
      'm1',
      'm2',
      'm3',
      'm4',
      'm5',
      'm6',
      'm7',
      'm8',
      'm9',
      'm10',
      'm11',
      'm12',
    ]);
  });

  it('flushState() bypasses the throttle for an optimistic write', () => {
    const p = make();
    seed(p);
    p.ingestItem(msg('m3', 3)); // leading
    p.ingestItem(msg('m4', 4)); // deferred (trailing pending)
    expect(ids(p)).toEqual(['m1', 'm2', 'm3']);

    p.flushState(); // optimistic bypass -> emit now
    expect(ids(p)).toEqual(['m1', 'm2', 'm3', 'm4']);

    vi.advanceTimersByTime(THROTTLE); // no duplicate / extra emission
    expect(ids(p)).toEqual(['m1', 'm2', 'm3', 'm4']);
  });

  it('an in-window content change (reaction/edit) coalesces via onEntitiesChanged', () => {
    const p = make();
    seed(p);
    // open the window with a leading ingest so subsequent activity is deferred
    p.ingestItem(msg('m3', 3));
    expect(ids(p)).toEqual(['m1', 'm2', 'm3']);

    // simulate a content change on a held id (what EntityStore.onEntitiesChanged delivers)
    const changed = { ...msg('m3', 3), text: 'edited' } as LocalMessage;
    // update the backing index in place, then notify
    p.getItem('m3'); // sanity: it is held
    (
      p as unknown as { _itemIndex: { setOne: (m: LocalMessage) => void } }
    )._itemIndex.setOne(changed);
    p.onEntitiesChanged({ changedIds: new Set(['m3']) });
    // deferred: the visible text is refreshed only on the trailing edge / flush
    p.flushState();
    expect(p.items?.find((m) => m.id === 'm3')?.text).toBe('edited');
  });

  it('does not throttle when globally disabled (the test default): every ingest is immediate', () => {
    setStateThrottlingEnabled(false);
    const p = make();
    seed(p);
    p.ingestItem(msg('m3', 3));
    p.ingestItem(msg('m4', 4));
    expect(ids(p)).toEqual(['m1', 'm2', 'm3', 'm4']); // no timer advance needed
  });
});

// End-to-end optimistic path: a real store-backed paginator (StoreBackedItemIndex), driven through
// the actual optimistic wiring (applyReactionLocally → store.upsert + store.flushSubscribers() →
// holder.flushState() → throttle.flush()). This is the path the "your own sends/reactions appear
// instantly" guarantee rides on — distinct from calling paginator.flushState() directly above.
describe('MessagePaginator — optimistic (local-user) writes bypass the throttle (end-to-end)', () => {
  let store: EntityStore<LocalMessage>;
  let client: StreamChat;
  let channel: Channel;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    setStateThrottlingEnabled(true);
    store = new EntityStore<LocalMessage>({ getEntityId: (m) => m.id });
    client = {
      messageStore: store,
      user: { id: 'me' },
    } as unknown as StreamChat;
    channel = {
      cid: 'channel-id',
      getReplies: vi.fn(),
      query: vi.fn(),
      // MessagePaginator.createItemIndex reads this to build a StoreBackedItemIndex, so the paginator
      // is a real subscriber of `store` (gets onEntitiesChanged + flushState).
      getClient: () => client,
    } as unknown as Channel;
  });

  afterEach(() => {
    setStateThrottlingEnabled(false);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const makeStoreBacked = () =>
    new MessagePaginator({ channel, paginatorOptions: { stateThrottleMs: THROTTLE } });

  const seedAndOpenWindow = (p: MessagePaginator) => {
    p.setItems({
      valueOrFactory: [msg('m1', 1), msg('m2', 2)],
      isFirstPage: true,
      isLastPage: true,
    });
    p.ingestItem(msg('m3', 3)); // leading edge — opens the throttle window
    expect(ids(p)).toEqual(['m1', 'm2', 'm3']);
  };

  const hasLike = (p: MessagePaginator, id: string) =>
    !!p.items?.find((m) => m.id === id)?.own_reactions?.some((r) => r.type === 'like');

  it('a local reaction renders immediately — no timer advance (flushSubscribers → flushState → flush)', () => {
    const p = makeStoreBacked();
    seedAndOpenWindow(p);
    expect(hasLike(p, 'm3')).toBe(false);

    // The real optimistic entry point: upserts the reacted message (deferred by the throttle) and
    // then flushSubscribers() to bypass it.
    applyReactionLocally(client, {
      messageId: 'm3',
      reaction: { type: 'like' } as unknown as Reaction,
    });

    // Reflected WITHOUT advancing the throttle timer.
    expect(hasLike(p, 'm3')).toBe(true);
  });

  it('a non-optimistic store change (no flush) stays throttled until the window closes', () => {
    const p = makeStoreBacked();
    seedAndOpenWindow(p);

    const current = store.get('m3');
    if (!current) throw new Error('expected m3 to be held by the store');
    // Simulate a WS-driven change that does NOT go through the optimistic flush.
    store.upsert({ ...current, text: 'from-server' });

    // Deferred — not visible until the trailing edge.
    expect(p.items?.find((m) => m.id === 'm3')?.text).not.toBe('from-server');
    vi.advanceTimersByTime(THROTTLE);
    expect(p.items?.find((m) => m.id === 'm3')?.text).toBe('from-server');
  });
});

// Interval views (anchoredHead / logicalHead / logicalTail) publish on their OWN throttle, so a
// sibling content update to an off-active-window view still lands within one interval — it does not
// depend on `state.items` ever publishing again.
describe('MessagePaginator — interval-view (anchoredHead) publish throttling', () => {
  let channel: Channel;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    setStateThrottlingEnabled(true);
    channel = {
      cid: 'channel-id',
      getReplies: vi.fn(),
      query: vi.fn(),
    } as unknown as Channel;
  });

  afterEach(() => {
    setStateThrottlingEnabled(false);
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  const make = () =>
    new MessagePaginator({ channel, paginatorOptions: { stateThrottleMs: THROTTLE } });

  // Count anchoredHead publishes, ignoring the initial synchronous emit (as `useStateStore` would).
  const trackAnchored = (p: MessagePaginator) => {
    let fires = 0;
    const unsub = p.intervalViews.subscribeWithSelector(
      (s) => ({ items: s.anchoredHead }),
      () => {
        fires += 1;
      },
    );
    fires = 0;
    return { count: () => fires, unsub };
  };

  // Simulate a sibling holder rewriting a held message's content in the shared store.
  const editInIndex = (p: MessagePaginator, id: string, text: string) => {
    const current = p.getItem(id);
    if (!current) throw new Error(`expected ${id} to be held`);
    (
      p as unknown as { _itemIndex: { setOne: (m: LocalMessage) => void } }
    )._itemIndex.setOne({ ...current, text });
  };

  const notify = (p: MessagePaginator, id: string) =>
    p.onEntitiesChanged({ changedIds: new Set([id]) });

  it('coalesces a burst of sibling content updates into leading + trailing anchoredHead publishes', () => {
    const p = make();
    p.ingestPage({
      page: [msg('m1', 1), msg('m2', 2), msg('m3', 3)],
      isHead: true,
      isTail: false,
      setActive: true,
    });
    expect(p.anchoredHeadItems.map((m) => m.id)).toEqual(['m1', 'm2', 'm3']);

    const anchored = trackAnchored(p);

    editInIndex(p, 'm1', 'e1');
    notify(p, 'm1'); // leading edge -> immediate publish
    editInIndex(p, 'm2', 'e2');
    notify(p, 'm2'); // within window -> deferred
    editInIndex(p, 'm3', 'e3');
    notify(p, 'm3'); // within window -> deferred
    expect(anchored.count()).toBe(1); // only the leading edge so far

    vi.advanceTimersByTime(THROTTLE); // trailing edge
    expect(anchored.count()).toBe(2); // coalesced 3 -> 2, not one publish per event
    expect(p.anchoredHeadItems.find((m) => m.id === 'm1')?.text).toBe('e1');
    expect(p.anchoredHeadItems.find((m) => m.id === 'm2')?.text).toBe('e2');
    expect(p.anchoredHeadItems.find((m) => m.id === 'm3')?.text).toBe('e3');

    anchored.unsub();
  });

  it('refreshes anchoredHead on its own throttle even when the active window is a different, quiet interval', () => {
    const p = make();
    // Head page becomes the anchored head (and the active window).
    p.ingestPage({
      page: [msg('h1', 10), msg('h2', 11)],
      isHead: true,
      isTail: false,
      setActive: true,
    });
    // Jump to an older, disjoint window and make it the active one.
    p.ingestPage({
      page: [msg('o1', 1), msg('o2', 2)],
      isHead: false,
      isTail: true,
      setActive: true,
    });
    expect(ids(p)).toEqual(['o1', 'o2']); // active window = the old page
    expect(p.anchoredHeadItems.map((m) => m.id)).toEqual(['h1', 'h2']);

    let stateFires = 0;
    const stateUnsub = p.state.subscribeWithSelector(
      (s) => ({ items: s.items }),
      () => {
        stateFires += 1;
      },
    );
    stateFires = 0;
    const anchored = trackAnchored(p);

    // A sibling content change to a HEAD message — NOT in the active (old) window.
    editInIndex(p, 'h1', 'edited-in-head');
    notify(p, 'h1');

    // anchoredHead refreshes via its own throttle's leading edge, without any timer advance...
    expect(anchored.count()).toBe(1);
    expect(p.anchoredHeadItems.find((m) => m.id === 'h1')?.text).toBe('edited-in-head');
    // ...while `state.items` (the quiet active window) never publishes — h1 isn't in it.
    expect(stateFires).toBe(0);
    expect(ids(p)).toEqual(['o1', 'o2']);

    // A single change fires only the leading edge — nothing stray on the trailing edge.
    vi.advanceTimersByTime(THROTTLE);
    expect(anchored.count()).toBe(1);

    stateUnsub();
    anchored.unsub();
  });
});
