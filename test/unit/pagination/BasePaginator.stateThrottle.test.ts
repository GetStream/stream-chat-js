import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MessagePaginator } from '../../../src/pagination/paginators/MessagePaginator';
import { PinnedMessagePaginator } from '../../../src/pagination/paginators/PinnedMessagePaginator';
import { setStateThrottlingEnabled } from '../../../src/pagination/paginators/stateThrottling';
import type { Channel } from '../../../src/channel';

const stubChannel = () =>
  ({
    cid: 'messaging:channel-id',
    getPinnedMessages: vi.fn().mockResolvedValue({ messages: [] }),
    getReplies: vi.fn(),
    query: vi.fn(),
  }) as unknown as Channel;

/**
 * `setStateThrottleOptions` exists because `stateThrottleMs` is read exactly once, in the constructor:
 * the throttles capture the interval in their closures, so assigning `config.stateThrottleMs` later
 * does nothing at all. These tests pin that the setter is the only thing that changes it.
 */
describe('BasePaginator.setStateThrottleOptions', () => {
  let channel: Channel;

  beforeEach(() => {
    vi.useFakeTimers();
    // Throttling is auto-disabled under test runners so the existing suites stay synchronous
    // (see `stateThrottling.ts`); these tests are about the throttle itself, so opt in.
    setStateThrottlingEnabled(true);
    channel = stubChannel();
  });

  afterEach(() => {
    setStateThrottlingEnabled(false);
    vi.useRealTimers();
  });

  it('is what actually changes the interval — a plain assignment is not', () => {
    const paginator = new MessagePaginator({ channel });

    paginator.setStateThrottleOptions({ stateThrottleMs: 250 });

    expect(paginator.config.stateThrottleMs).toBe(250);
  });

  it('enables throttling on a paginator that started unthrottled', () => {
    const paginator = new PinnedMessagePaginator({ channel });
    expect(paginator.config.stateThrottleMs).toBeUndefined();

    paginator.setStateThrottleOptions({ stateThrottleMs: 300 });

    expect(paginator.config.stateThrottleMs).toBe(300);
    // Proves a throttle object now exists: the protected getter is only true when one was built.
    expect((paginator as unknown as { isStateThrottled: boolean }).isStateThrottled).toBe(
      true,
    );
  });

  it('disables throttling when the interval is cleared', () => {
    const paginator = new MessagePaginator({ channel });
    expect((paginator as unknown as { isStateThrottled: boolean }).isStateThrottled).toBe(
      true,
    );

    paginator.setStateThrottleOptions({ stateThrottleMs: undefined });

    expect(paginator.config.stateThrottleMs).toBeUndefined();
    expect((paginator as unknown as { isStateThrottled: boolean }).isStateThrottled).toBe(
      false,
    );
  });

  it('flushes a pending publish rather than swallowing it on rebuild', () => {
    const paginator = new MessagePaginator({ channel });
    const internals = paginator as unknown as {
      flushPendingPublishes: () => void;
      scheduleWindowPublish: () => void;
    };
    const flush = vi.spyOn(internals, 'flushPendingPublishes');

    paginator.setStateThrottleOptions({ stateThrottleMs: 100 });

    // A scheduled trailing-edge emit would be lost if the throttles were replaced without flushing.
    expect(flush).toHaveBeenCalled();
  });

  it('is idempotent — repeated calls do not accumulate throttles', () => {
    const paginator = new MessagePaginator({ channel });

    for (let i = 0; i < 5; i += 1)
      paginator.setStateThrottleOptions({ stateThrottleMs: 50 });

    expect(paginator.config.stateThrottleMs).toBe(50);
    expect((paginator as unknown as { isStateThrottled: boolean }).isStateThrottled).toBe(
      true,
    );
  });

  it('leaves a paginator untouched when never called', () => {
    expect(new MessagePaginator({ channel }).config.stateThrottleMs).toBe(500);
    expect(
      new PinnedMessagePaginator({ channel }).config.stateThrottleMs,
    ).toBeUndefined();
  });
});
