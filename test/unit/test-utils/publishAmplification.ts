import { expect, vi } from 'vitest';
import { formatMessage } from '../../../src';
import { EntityStore } from '../../../src/entityStore/EntityStore';
import { MessagePaginator } from '../../../src/pagination/paginators/MessagePaginator';
import {
  isStateThrottlingEnabled,
  setStateThrottlingEnabled,
} from '../../../src/pagination/paginators/stateThrottling';
import { generateMsg } from './generateMessage';
import { convertDateToTimestamp } from './time';
import type { Channel } from '../../../src/channel';
import type { StreamChat } from '../../../src/client';
import type { LocalMessage, MessageResponse } from '../../../src/types';

/**
 * Instruments for measuring **publish amplification**: how many times one logical change causes a
 * collection to emit new state.
 *
 * Two rules are baked in here because getting either wrong silently destroys the measurement. Both
 * were learned the hard way and are documented in `specs/paginator-publish-amplification/spec.md`.
 *
 * 1. **Count with a raw `subscribe`, never `subscribeWithSelector` keyed on `items`.**
 *    `StateStore.partialNext` always allocates a new state object, so a publish that only touches
 *    `hasMoreTail`/`cursor`/`offset` still notifies every raw subscriber. A selector keyed on
 *    `items` would silently swallow exactly the redundant publishes being measured — and those are
 *    real renders downstream, since consumers do select `hasMoreTail`.
 *
 * 2. **Two surfaces amplify independently, so count both.** `state` (the paginated window) and
 *    `intervalViews` (logical head / logical tail / anchored head). `intervalViews` has its *own*
 *    throttle and `refreshIntervalViewsForChangedIds` can emit three times in a single pass. The
 *    pre-existing `countPublishes` helper in `MessagePaginatorWindowCap.test.ts` selects only
 *    `anchoredHead` and therefore under-counts; do not copy it.
 */

export type SurfaceCounts = {
  /** Emits on the paginated window store (`paginator.state`). */
  state: number;
  /** Emits on the interval-view store (`paginator.intervalViews`). */
  views: number;
};

export type PublishRecorder = {
  /** Per-label counts since the last {@link PublishRecorder.reset}. */
  counts: () => Record<string, SurfaceCounts>;
  /** Just the `state` counts, which is what most assertions care about. */
  stateCounts: () => Record<string, number>;
  /** Summed across every label. */
  total: () => SurfaceCounts;
  /** Zero every counter. Call after seeding, before the action under measurement. */
  reset: () => void;
  /** Unsubscribe everything. */
  stop: () => void;
};

type Recordable = {
  state: { subscribe: (handler: () => void) => () => void };
  intervalViews?: { subscribe: (handler: () => void) => () => void };
};

/**
 * Subscribes to every labelled collection and counts emits per surface.
 *
 * `StateStore.subscribe` fires synchronously once on subscribe (that is its contract — treat the
 * first call as initial state, not as a change), so the counters are zeroed before returning.
 */
export const recordPublishes = (
  labelled: Record<string, Recordable>,
): PublishRecorder => {
  const counts: Record<string, SurfaceCounts> = {};
  const unsubscribes: Array<() => void> = [];

  for (const [label, target] of Object.entries(labelled)) {
    counts[label] = { state: 0, views: 0 };
    unsubscribes.push(
      target.state.subscribe(() => {
        counts[label].state += 1;
      }),
    );
    if (target.intervalViews) {
      unsubscribes.push(
        target.intervalViews.subscribe(() => {
          counts[label].views += 1;
        }),
      );
    }
  }

  const reset = () => {
    for (const label of Object.keys(counts)) counts[label] = { state: 0, views: 0 };
  };

  // Discard the synchronous initial emits.
  reset();

  return {
    counts: () => structuredClone(counts),
    stateCounts: () =>
      Object.fromEntries(
        Object.entries(counts).map(([label, surfaces]) => [label, surfaces.state]),
      ),
    total: () =>
      Object.values(counts).reduce(
        (sum, surfaces) => ({
          state: sum.state + surfaces.state,
          views: sum.views + surfaces.views,
        }),
        { state: 0, views: 0 },
      ),
    reset,
    stop: () => unsubscribes.forEach((unsubscribe) => unsubscribe()),
  };
};

/** A message whose `created_at` is day `day` of 2020-01, so sort order is `day` ascending. */
export const msg = (id: string, day: number, cid = 'messaging:amplification') =>
  formatMessage(
    generateMsg({
      id,
      cid,
      created_at: convertDateToTimestamp(
        `2020-01-${String(day).padStart(2, '0')}T00:00:00.000Z`,
      ),
    }) as MessageResponse,
  );

const makeChannel = (store: EntityStore<LocalMessage>, cid: string): Channel =>
  ({
    cid,
    getReplies: vi.fn(),
    query: vi.fn(),
    getClient: () =>
      ({ messageStore: store, user: { id: 'me' } }) as unknown as StreamChat,
    // `postQueryReconcile` seeds the unread snapshot from the own-user read state.
    state: { read: {} },
  }) as unknown as Channel;

/**
 * Seeds a paginator's active window.
 *
 * `ingestItem` emits nothing at all without an active interval, so a publish-count assertion on an
 * unseeded paginator passes **vacuously**. Never trust a paginator test that has not asserted the
 * seed landed — hence the assertion here rather than at each call site.
 */
export const seedWindow = (paginator: MessagePaginator, page: LocalMessage[]) => {
  paginator.ingestPage({ page, isHead: true, isTail: true, setActive: true });
  expect(paginator.items ?? []).toHaveLength(page.length);
};

export type LinkedCollections = {
  paginators: MessagePaginator[];
  /** The store the collections share (or, when isolated, the first one's). */
  store: EntityStore<LocalMessage>;
  recorder: PublishRecorder;
};

/**
 * `n` message collections that all hold the same messages.
 *
 * - `shared: true` (default) — one `EntityStore` behind all of them, which is the real topology for
 *   `channel.messagePaginator` / `channel.pinnedMessagesPaginator` / `thread.messagePaginator`.
 *   Each paginator is an independent `EntityStoreSubscriber`, so a write by one fans out to the
 *   other `n - 1`. This is the configuration that exhibits the amplification.
 * - `shared: false` — a private store per paginator, so no fan-out is possible. This is the
 *   **control**: every publish-count assertion should be paired with it, because a number with no
 *   control does not distinguish "coalesced correctly" from "never emitted at all".
 */
export const makeLinkedCollections = ({
  n,
  seed,
  shared = true,
  paginatorOptions,
}: {
  n: number;
  seed: LocalMessage[];
  shared?: boolean;
  paginatorOptions?: ConstructorParameters<
    typeof MessagePaginator
  >[0]['paginatorOptions'];
}): LinkedCollections => {
  const cid = 'messaging:amplification';
  const sharedStore = new EntityStore<LocalMessage>({ getEntityId: (m) => m.id });

  const paginators = Array.from({ length: n }, () => {
    const store = shared
      ? sharedStore
      : new EntityStore<LocalMessage>({ getEntityId: (m) => m.id });
    return new MessagePaginator({ channel: makeChannel(store, cid), paginatorOptions });
  });

  paginators.forEach((paginator) => seedWindow(paginator, seed));

  const recorder = recordPublishes(
    Object.fromEntries(paginators.map((paginator, i) => [`c${i + 1}`, paginator])),
  );

  return { paginators, store: sharedStore, recorder };
};

/**
 * Runs `fn` with state throttling enabled, restoring the **prior** value afterwards.
 *
 * Throttling is auto-disabled under Vitest (`stateThrottling.ts`), so unit counts are the
 * *un-coalesced* number while a real client's counts are lower. Any assertion has to say which of
 * the two it measures — that ambiguity produced confidently wrong numbers during the original
 * investigation. Note the existing opt-in suites restore by hard-coding `false`; that happens to be
 * right only because it matches the Vitest default. Restore the prior value instead.
 *
 * The caller is responsible for fake timers — throttles are time-based.
 */
export const withStateThrottling = <T>(fn: () => T): T => {
  const previous = isStateThrottlingEnabled();
  setStateThrottlingEnabled(true);
  try {
    return fn();
  } finally {
    setStateThrottlingEnabled(previous);
  }
};
