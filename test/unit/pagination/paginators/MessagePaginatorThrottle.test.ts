import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessagePaginator } from '../../../../src/pagination/paginators/MessagePaginator';
import { setStateThrottlingEnabled } from '../../../../src/pagination/paginators/stateThrottling';
import { formatMessage } from '../../../../src';
import { generateMsg } from '../../test-utils/generateMessage';
import type { Channel } from '../../../../src/channel';
import type { LocalMessage, MessageResponse } from '../../../../src/types';

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

  it('an in-window content change (reaction/edit) coalesces via onMessagesChanged', () => {
    const p = make();
    seed(p);
    // open the window with a leading ingest so subsequent activity is deferred
    p.ingestItem(msg('m3', 3));
    expect(ids(p)).toEqual(['m1', 'm2', 'm3']);

    // simulate a content change on a held id (what MessageStore.onMessagesChanged delivers)
    const changed = { ...msg('m3', 3), text: 'edited' } as LocalMessage;
    // update the backing index in place, then notify
    p.getItem('m3'); // sanity: it is held
    (
      p as unknown as { _itemIndex: { setOne: (m: LocalMessage) => void } }
    )._itemIndex.setOne(changed);
    p.onMessagesChanged({ changedIds: new Set(['m3']), removedIds: new Set() });
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
