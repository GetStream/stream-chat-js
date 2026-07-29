import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ThrottledCallback } from '../../../src/utils/throttling/throttle';
import { throttle } from '../../../src/utils/throttling/throttle';

// Ported from the Feeds client throttle test suite (leading/trailing/cancel), plus a `flush()`
// block for the addition made in this SDK.

const advance = (ms: number) => vi.advanceTimersByTime(ms);

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('leading:true, trailing:false (default): fires immediately, drops during window, fires again after window on next call', () => {
    const spy = vi.fn();
    const t = throttle(spy as ThrottledCallback, 200).throttledFn;

    t('a');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith('a');

    t('b');
    expect(spy).toHaveBeenCalledTimes(1);

    advance(199);
    t('c');
    expect(spy).toHaveBeenCalledTimes(1);

    advance(1);
    t('d');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith('d');
  });

  it('leading:true, trailing:true: first call fires immediately; subsequent calls within window schedule one trailing with latest args', () => {
    const spy = vi.fn();
    const t = throttle(spy as ThrottledCallback, 200, { trailing: true }).throttledFn;

    t('a');
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith('a');

    advance(50);
    t('b');
    advance(50);
    t('c');
    advance(99);
    expect(spy).toHaveBeenCalledTimes(1);

    advance(1);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith('c');
  });

  it('leading:true, trailing:true: no double-invoke at boundary (new leading cancels pending trailing)', () => {
    const spy = vi.fn();
    const t = throttle(spy as ThrottledCallback, 200, { trailing: true }).throttledFn;

    t('a');
    expect(spy).toHaveBeenCalledTimes(1);

    advance(190);
    t('b');
    t('c');
    expect(spy).toHaveBeenCalledTimes(1);

    vi.setSystemTime(200);
    t('d');
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith('d');

    vi.runOnlyPendingTimers();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('leading:true, trailing:true: single call does not later trigger trailing (guard against double with same args)', () => {
    const spy = vi.fn();
    const t = throttle(spy as ThrottledCallback, 200, { trailing: true }).throttledFn;

    t('a');
    expect(spy).toHaveBeenCalledTimes(1);

    vi.runAllTimers();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('leading:false, trailing:true: does not call immediately; calls once at end of window with latest args', () => {
    const spy = vi.fn();
    const t = throttle(spy as ThrottledCallback, 200, {
      leading: false,
      trailing: true,
    }).throttledFn;

    t('a');
    expect(spy).toHaveBeenCalledTimes(0);

    advance(50);
    t('b');
    expect(spy).toHaveBeenCalledTimes(0);

    advance(150);
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenLastCalledWith('b');

    advance(50);
    t('c');
    expect(spy).toHaveBeenCalledTimes(1);
    advance(99);
    expect(spy).toHaveBeenCalledTimes(1);
    advance(51);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith('c');
  });

  it('leading:false, trailing:false: never calls', () => {
    const spy = vi.fn();
    const t = throttle(spy as ThrottledCallback, 200, {
      leading: false,
      trailing: false,
    }).throttledFn;

    t('a');
    t('b');
    advance(1000);
    expect(spy).toHaveBeenCalledTimes(0);
  });

  it('preserves `this` on trailing (apply)', () => {
    const seen: unknown[][] = [];
    const obj = {
      x: 42,
      fn(this: unknown, v: string) {
        seen.push([this, v]);
      },
    };
    const throttled = throttle(obj.fn, 200, {
      leading: false,
      trailing: true,
    }).throttledFn;

    (obj as unknown as { call: typeof throttled }).call = throttled;
    (obj as unknown as { call: typeof throttled }).call('hello');
    advance(200);

    expect(seen.length).toBe(1);
    expect(seen[0][0]).toBe(obj);
    expect(seen[0][1]).toBe('hello');
  });

  it('schedules trailing for the exact remaining time, not the full timeout', () => {
    const spy = vi.fn();
    const t = throttle(spy as ThrottledCallback, 200, { trailing: true }).throttledFn;

    t('a');
    advance(50);
    t('b');

    advance(149);
    expect(spy).toHaveBeenCalledTimes(1);

    advance(1);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith('b');
  });

  it('multiple calls in a burst within a window still produce at most one trailing (latest args)', () => {
    const spy = vi.fn();
    const t = throttle(spy as ThrottledCallback, 200, { trailing: true }).throttledFn;

    t(1);
    for (let i = 2; i <= 10; i++) t(i);
    expect(spy).toHaveBeenCalledTimes(1);

    advance(200);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(spy).toHaveBeenLastCalledWith(10);
  });

  it('does not leak extra invocations after long idle periods', () => {
    const spy = vi.fn();
    const t = throttle(spy as ThrottledCallback, 200, { trailing: true }).throttledFn;

    t('a');
    advance(180);
    t('b');

    advance(20);
    expect(spy).toHaveBeenCalledTimes(2);

    advance(10000);
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it('should cancel the timer when cancelTimer is called', () => {
    const spy = vi.fn();
    const { throttledFn: t, cancelTimer: cancel } = throttle(
      spy as ThrottledCallback,
      200,
      { trailing: true },
    );

    t('a');
    t('b');
    cancel();

    vi.runOnlyPendingTimers();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  describe('flush()', () => {
    it('fires a pending trailing immediately with the latest args', () => {
      const spy = vi.fn();
      const { throttledFn: t, flush } = throttle(spy as ThrottledCallback, 200, {
        trailing: true,
      });

      t('a'); // leading
      expect(spy).toHaveBeenCalledTimes(1);
      advance(50);
      t('b'); // trailing scheduled
      t('c');
      expect(spy).toHaveBeenCalledTimes(1);

      flush();
      expect(spy).toHaveBeenCalledTimes(2);
      expect(spy).toHaveBeenLastCalledWith('c');

      // nothing lingering after the flush
      vi.runOnlyPendingTimers();
      expect(spy).toHaveBeenCalledTimes(2);
    });

    it('is a no-op when nothing is pending', () => {
      const spy = vi.fn();
      const { throttledFn: t, flush } = throttle(spy as ThrottledCallback, 200, {
        trailing: true,
      });

      t('a'); // leading; no trailing queued
      expect(spy).toHaveBeenCalledTimes(1);
      flush();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('the flushed invocation resets the window (a later call leads again)', () => {
      const spy = vi.fn();
      const { throttledFn: t, flush } = throttle(spy as ThrottledCallback, 200, {
        trailing: true,
      });

      t('a'); // leading @0
      advance(10);
      t('b'); // trailing scheduled
      flush(); // fire 'b' now @10
      expect(spy).toHaveBeenCalledTimes(2);

      advance(200); // well past the window since the flush
      t('c');
      expect(spy).toHaveBeenCalledTimes(3);
      expect(spy).toHaveBeenLastCalledWith('c');
    });
  });
});
