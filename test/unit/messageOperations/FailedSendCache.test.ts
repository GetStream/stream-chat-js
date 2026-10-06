import { afterEach, describe, expect, it, vi } from 'vitest';
import { FailedSendCache } from '../../../src/messageOperations/FailedSendCache';
import type { LocalMessage } from '../../../src/types';

const makeCache = (config = { failedSendCacheMaxSize: 2, failedSendCacheTtlMs: 1_000 }) =>
  new FailedSendCache(() => config);

const add = (cache: FailedSendCache, messageId: string, text = messageId) =>
  cache.add({ message: { id: messageId, text }, messageId });

describe('FailedSendCache', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('drops the oldest entry once the cache is full', () => {
    const cache = makeCache();
    add(cache, 'a');
    add(cache, 'b');
    add(cache, 'c');

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')?.message.text).toBe('b');
    expect(cache.get('c')?.message.text).toBe('c');
  });

  it('replaces an entry that is already cached without dropping another one', () => {
    const cache = makeCache();
    add(cache, 'a');
    add(cache, 'b');
    add(cache, 'b', 'b again');

    expect(cache.get('a')?.message.text).toBe('a');
    expect(cache.get('b')?.message.text).toBe('b again');
  });

  it('forgets an entry once it is older than the TTL', () => {
    vi.useFakeTimers();
    const cache = makeCache();
    add(cache, 'a');

    vi.advanceTimersByTime(1_001);

    expect(cache.get('a')).toBeUndefined();
  });

  it('reads its limits from the current config on every call', () => {
    const config = { failedSendCacheMaxSize: 2, failedSendCacheTtlMs: 1_000 };
    const cache = makeCache(config);
    add(cache, 'a');
    config.failedSendCacheMaxSize = 1;
    add(cache, 'b');

    expect(cache.get('a')).toBeUndefined();
    expect(cache.get('b')).toBeDefined();
  });

  it('folds an edit into the cached payload and keeps its options', () => {
    const cache = makeCache();
    cache.add({
      message: { id: 'a', text: 'before' },
      messageId: 'a',
      options: { skip_push: true },
    });

    cache.rewriteWithEdit({ id: 'a', text: 'after' } as LocalMessage);

    expect(cache.get('a')?.message.text).toBe('after');
    expect(cache.get('a')?.options).toEqual({ skip_push: true });
  });
});
