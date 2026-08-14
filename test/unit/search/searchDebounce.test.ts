import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Channel } from '../../../src/channel';
import { ChannelMemberSearchSource } from '../../../src/search/ChannelMemberSearchSource';
import type { ChannelMemberResponse } from '../../../src/types';

const SHORT_QUERY_DEBOUNCE_MS = 500;
const LONG_QUERY_DEBOUNCE_MS = 300;

const createChannelMember = (userId: string): ChannelMemberResponse => ({
  created_at: '2026-01-01T00:00:00.000000000Z',
  updated_at: '2026-01-01T00:00:00.000000000Z',
  user_id: userId,
});

const createChannel = () => ({ queryMembers: vi.fn() }) as unknown as Channel;

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
};

const membersResponse = (members: ChannelMemberResponse[]) => ({
  duration: '0.01s',
  members,
});

describe('search source dynamic debounce', () => {
  let channel: Channel;
  let source: ChannelMemberSearchSource;

  beforeEach(() => {
    vi.useFakeTimers();
    channel = createChannel();
    vi.spyOn(channel, 'queryMembers').mockResolvedValue(
      membersResponse([createChannelMember('user-1')]),
    );
    source = new ChannelMemberSearchSource(channel);
    source.activate();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('waits the short-query interval for a query of at most 2 characters', async () => {
    source.search('ab');

    await vi.advanceTimersByTimeAsync(LONG_QUERY_DEBOUNCE_MS);
    expect(channel.queryMembers).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(SHORT_QUERY_DEBOUNCE_MS - LONG_QUERY_DEBOUNCE_MS);
    expect(channel.queryMembers).toHaveBeenCalledTimes(1);
  });

  it('waits the long-query interval for a query of at least 3 characters', async () => {
    source.search('abc');

    await vi.advanceTimersByTimeAsync(LONG_QUERY_DEBOUNCE_MS);
    expect(channel.queryMembers).toHaveBeenCalledTimes(1);
  });

  it('switches to the long interval once the query grows past the threshold', async () => {
    source.search('a');
    await vi.advanceTimersByTimeAsync(100);
    source.search('ab');
    await vi.advanceTimersByTimeAsync(100);
    source.search('abc');

    // the last keystroke rescheduled at the long interval, not the short one
    await vi.advanceTimersByTimeAsync(LONG_QUERY_DEBOUNCE_MS);

    expect(channel.queryMembers).toHaveBeenCalledTimes(1);
    expect(source.searchQuery).toBe('abc');
  });

  it('switches back to the short interval when the query shrinks', async () => {
    source.search('abc');
    await vi.advanceTimersByTimeAsync(100);
    source.search('ab');

    await vi.advanceTimersByTimeAsync(LONG_QUERY_DEBOUNCE_MS);
    expect(channel.queryMembers).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(SHORT_QUERY_DEBOUNCE_MS - LONG_QUERY_DEBOUNCE_MS);
    expect(channel.queryMembers).toHaveBeenCalledTimes(1);
  });

  it('debounces pagination using the length of the current search query', async () => {
    // a full page keeps hasNext true, so pagination is allowed
    vi.spyOn(channel, 'queryMembers').mockResolvedValue(
      membersResponse(
        Array.from({ length: 10 }, (_, index) => createChannelMember(`user-${index}`)),
      ),
    );

    source.search('abc');
    await vi.advanceTimersByTimeAsync(LONG_QUERY_DEBOUNCE_MS);
    expect(channel.queryMembers).toHaveBeenCalledTimes(1);

    source.search();
    await vi.advanceTimersByTimeAsync(LONG_QUERY_DEBOUNCE_MS);

    expect(channel.queryMembers).toHaveBeenCalledTimes(2);
  });

  describe('configuration', () => {
    it('honours custom debounce intervals and threshold', async () => {
      const configured = new ChannelMemberSearchSource(channel, {
        shortQueryDebounceMs: 800,
        longQueryDebounceMs: 100,
        shortQueryMaxLength: 4,
      });
      configured.activate();

      configured.search('abcd'); // still short under the custom threshold
      await vi.advanceTimersByTimeAsync(700);
      expect(channel.queryMembers).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(100);
      expect(channel.queryMembers).toHaveBeenCalledTimes(1);

      configured.search('abcde');
      await vi.advanceTimersByTimeAsync(100);
      expect(channel.queryMembers).toHaveBeenCalledTimes(2);
    });

    it('applies a legacy debounceMs to both short and long queries', async () => {
      const legacy = new ChannelMemberSearchSource(channel, { debounceMs: 800 });
      legacy.activate();

      legacy.search('ab');
      await vi.advanceTimersByTimeAsync(700);
      expect(channel.queryMembers).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(100);
      expect(channel.queryMembers).toHaveBeenCalledTimes(1);

      legacy.search('abcdef');
      await vi.advanceTimersByTimeAsync(700);
      expect(channel.queryMembers).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(100);
      expect(channel.queryMembers).toHaveBeenCalledTimes(2);
    });

    it('applies intervals updated through setDebounceOptions', async () => {
      source.setDebounceOptions({ shortQueryDebounceMs: 900 });

      source.search('ab');
      await vi.advanceTimersByTimeAsync(SHORT_QUERY_DEBOUNCE_MS);
      expect(channel.queryMembers).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(900 - SHORT_QUERY_DEBOUNCE_MS);
      expect(channel.queryMembers).toHaveBeenCalledTimes(1);
    });
  });
});

describe('search source request cancellation', () => {
  let channel: Channel;
  let source: ChannelMemberSearchSource;
  const stalePage = [createChannelMember('stale')];
  const freshPage = [createChannelMember('fresh')];

  const signalOfCall = (index: number) =>
    (channel.queryMembers as unknown as ReturnType<typeof vi.fn>).mock.calls[index][3]
      .signal as AbortSignal;

  beforeEach(() => {
    vi.useFakeTimers();
    channel = createChannel();
    source = new ChannelMemberSearchSource(channel);
    source.activate();
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  it('aborts the in-flight request when a new search is dispatched', async () => {
    const inFlight = deferred<ReturnType<typeof membersResponse>>();
    vi.spyOn(channel, 'queryMembers')
      .mockReturnValueOnce(inFlight.promise as never)
      .mockResolvedValueOnce(membersResponse(freshPage));

    source.search('first');
    await vi.advanceTimersByTimeAsync(LONG_QUERY_DEBOUNCE_MS);
    expect(channel.queryMembers).toHaveBeenCalledTimes(1);
    expect(signalOfCall(0).aborted).toBe(false);

    source.search('second');
    await vi.advanceTimersByTimeAsync(LONG_QUERY_DEBOUNCE_MS);

    expect(signalOfCall(0).aborted).toBe(true);
    expect(channel.queryMembers).toHaveBeenCalledTimes(2);
  });

  it('discards a late response from an aborted request', async () => {
    const inFlight = deferred<ReturnType<typeof membersResponse>>();
    vi.spyOn(channel, 'queryMembers')
      .mockReturnValueOnce(inFlight.promise as never)
      .mockResolvedValueOnce(membersResponse(freshPage));

    source.search('first');
    await vi.advanceTimersByTimeAsync(LONG_QUERY_DEBOUNCE_MS);

    source.search('second');
    await vi.advanceTimersByTimeAsync(LONG_QUERY_DEBOUNCE_MS);

    // the first request only comes back now, after it was superseded
    inFlight.resolve(membersResponse(stalePage));
    await vi.advanceTimersByTimeAsync(0);

    expect(source.items).toEqual(freshPage);
    expect(source.searchQuery).toBe('second');
    expect(source.isLoading).toBe(false);
  });

  it('does not surface the abort rejection as a query error', async () => {
    // mimics axios rejecting once the signal is aborted
    let rejectAborted!: (reason: Error) => void;
    const aborting = new Promise((_, reject) => {
      rejectAborted = reject;
    });
    vi.spyOn(channel, 'queryMembers')
      .mockReturnValueOnce(aborting as never)
      .mockResolvedValueOnce(membersResponse(freshPage));

    source.search('first');
    await vi.advanceTimersByTimeAsync(LONG_QUERY_DEBOUNCE_MS);

    source.search('second');
    await vi.advanceTimersByTimeAsync(LONG_QUERY_DEBOUNCE_MS);

    expect(signalOfCall(0).aborted).toBe(true);
    rejectAborted(new Error('canceled'));
    await vi.advanceTimersByTimeAsync(0);

    expect(source.lastQueryError).toBeUndefined();
    expect(source.items).toEqual(freshPage);
  });

  it('aborts the in-flight request on cancelScheduledQuery', async () => {
    const inFlight = deferred<ReturnType<typeof membersResponse>>();
    vi.spyOn(channel, 'queryMembers').mockReturnValueOnce(inFlight.promise as never);

    source.search('first');
    await vi.advanceTimersByTimeAsync(LONG_QUERY_DEBOUNCE_MS);

    source.cancelScheduledQuery();
    expect(signalOfCall(0).aborted).toBe(true);

    inFlight.resolve(membersResponse(stalePage));
    await vi.advanceTimersByTimeAsync(0);

    expect(source.items).toBeUndefined();
    // nothing dispatches a successor, so cancelling must release the loading state
    expect(source.isLoading).toBe(false);
    expect(source.canExecuteQuery()).toBe(true);
  });

  it('aborts the in-flight request on resetState', async () => {
    const inFlight = deferred<ReturnType<typeof membersResponse>>();
    vi.spyOn(channel, 'queryMembers').mockReturnValueOnce(inFlight.promise as never);

    source.search('first');
    await vi.advanceTimersByTimeAsync(LONG_QUERY_DEBOUNCE_MS);

    source.resetState();
    expect(signalOfCall(0).aborted).toBe(true);

    inFlight.resolve(membersResponse(stalePage));
    await vi.advanceTimersByTimeAsync(0);

    expect(source.items).toBeUndefined();
    expect(source.searchQuery).toBe('');
    expect(source.isLoading).toBe(false);
  });

  it('lets a new search query preempt an in-flight one', async () => {
    const inFlight = deferred<ReturnType<typeof membersResponse>>();
    vi.spyOn(channel, 'queryMembers')
      .mockReturnValueOnce(inFlight.promise as never)
      .mockResolvedValueOnce(membersResponse(freshPage));

    source.search('first');
    await vi.advanceTimersByTimeAsync(LONG_QUERY_DEBOUNCE_MS);
    expect(source.isLoading).toBe(true);

    // previously this was dropped because the source was still loading
    source.search('second');
    await vi.advanceTimersByTimeAsync(LONG_QUERY_DEBOUNCE_MS);

    expect(channel.queryMembers).toHaveBeenCalledTimes(2);
    expect(source.items).toEqual(freshPage);
  });

  it('does not start a pagination query while one is in flight', async () => {
    const inFlight = deferred<ReturnType<typeof membersResponse>>();
    vi.spyOn(channel, 'queryMembers').mockReturnValueOnce(inFlight.promise as never);

    source.search('first');
    await vi.advanceTimersByTimeAsync(LONG_QUERY_DEBOUNCE_MS);

    source.search();
    await vi.advanceTimersByTimeAsync(LONG_QUERY_DEBOUNCE_MS);

    expect(channel.queryMembers).toHaveBeenCalledTimes(1);

    inFlight.resolve(membersResponse(freshPage));
    await vi.advanceTimersByTimeAsync(0);
  });
});
