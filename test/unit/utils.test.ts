import sinon from 'sinon';
import { describe, beforeEach, afterEach, it, expect, vi } from 'vitest';

import { generateChannel } from './test-utils/generateChannel';
import { generateMember } from './test-utils/generateMember';
import { generateUser } from './test-utils/generateUser';
import { getClientWithUser } from './test-utils/getClient';

import {
  findIndexInSortedArray,
  channelHasReadEvents,
  channelTracksReadLocally,
  userHasReadReceipts,
  formatMessage,
  throttle,
  generateChannelTempCid,
  uniqBy,
  runDetached,
  sleep,
} from '../../src/utils';

import type { ChannelFilters, ChannelOwnCapability, ChannelSort } from '../../src';
import { StreamChat, Channel } from '../../src';
import { chatLoggerSystem } from '../../src/logger';

describe('findIndexInSortedArray', () => {
  it('finds index in the middle of haystack (asc)', () => {
    const needle = 5;
    const haystack = [1, 2, 3, 4, 6, 7, 8, 9];
    const index = findIndexInSortedArray({
      needle,
      sortedArray: haystack,
      sortDirection: 'ascending',
    });
    expect(index).to.eq(4);
  });

  it('finds index at the top of haystack (asc)', () => {
    const needle = 0;
    const haystack = [1, 2, 3, 4, 6, 7, 8, 9];
    const index = findIndexInSortedArray({
      needle,
      sortedArray: haystack,
      sortDirection: 'ascending',
    });
    expect(index).to.eq(0);
  });

  it('finds index at the bottom of haystack (asc)', () => {
    const needle = 10;
    const haystack = [1, 2, 3, 4, 6, 7, 8, 9];
    const index = findIndexInSortedArray({
      needle,
      sortedArray: haystack,
      sortDirection: 'ascending',
    });
    expect(index).to.eq(8);
  });

  it('in a haystack with duplicates, prefers index closer to the bottom (asc)', () => {
    const needle = 5;
    const haystack = [1, 5, 5, 5, 5, 5, 8, 9];
    const index = findIndexInSortedArray({
      needle,
      sortedArray: haystack,
      sortDirection: 'ascending',
    });
    expect(index).to.eq(6);
  });

  it('in a haystack with duplicates, look up an item by key (asc)', () => {
    const haystack: [key: string, value: number][] = [
      ['one', 1],
      ['five-1', 5],
      ['five-2', 5],
      ['five-3', 5],
      ['nine', 9],
    ];

    const selectKey = (tuple: [key: string, value: number]) => tuple[0];
    const selectValue = (tuple: [key: string, value: number]) => tuple[1];

    expect(
      findIndexInSortedArray({
        needle: ['five-1', 5],
        sortedArray: haystack,
        sortDirection: 'ascending',
        selectKey,
        selectValueToCompare: selectValue,
      }),
    ).to.eq(1);

    expect(
      findIndexInSortedArray({
        needle: ['five-2', 5],
        sortedArray: haystack,
        sortDirection: 'ascending',
        selectKey,
        selectValueToCompare: selectValue,
      }),
    ).to.eq(2);

    expect(
      findIndexInSortedArray({
        needle: ['five-3', 5],
        sortedArray: haystack,
        sortDirection: 'ascending',
        selectKey,
        selectValueToCompare: selectValue,
      }),
    ).to.eq(3);
  });

  it('finds index in the middle of haystack (desc)', () => {
    const needle = 5;
    const haystack = [9, 8, 7, 6, 4, 3, 2, 1];
    const index = findIndexInSortedArray({
      needle,
      sortedArray: haystack,
      sortDirection: 'descending',
    });
    expect(index).to.eq(4);
  });

  it('finds index at the top of haystack (desc)', () => {
    const needle = 10;
    const haystack = [9, 8, 7, 6, 4, 3, 2, 1];
    const index = findIndexInSortedArray({
      needle,
      sortedArray: haystack,
      sortDirection: 'descending',
    });
    expect(index).to.eq(0);
  });

  it('finds index at the bottom of haystack (desc)', () => {
    const needle = 0;
    const haystack = [9, 8, 7, 6, 4, 3, 2, 1];
    const index = findIndexInSortedArray({
      needle,
      sortedArray: haystack,
      sortDirection: 'descending',
    });
    expect(index).to.eq(8);
  });

  it('in a haystack with duplicates, prefers index closer to the top (desc)', () => {
    const needle = 5;
    const haystack = [9, 8, 5, 5, 5, 5, 5, 1];
    const index = findIndexInSortedArray({
      needle,
      sortedArray: haystack,
      sortDirection: 'descending',
    });
    expect(index).to.eq(2);
  });

  it('in a haystack with duplicates, look up an item by key (desc)', () => {
    const haystack: [key: string, value: number][] = [
      ['nine', 9],
      ['five-1', 5],
      ['five-2', 5],
      ['five-3', 5],
      ['one', 1],
    ];

    const selectKey = (tuple: [key: string, value: number]) => tuple[0];
    const selectValue = (tuple: [key: string, value: number]) => tuple[1];

    expect(
      findIndexInSortedArray({
        needle: ['five-1', 5],
        sortedArray: haystack,
        sortDirection: 'descending',
        selectKey,
        selectValueToCompare: selectValue,
      }),
    ).to.eq(1);

    expect(
      findIndexInSortedArray({
        needle: ['five-2', 5],
        sortedArray: haystack,
        sortDirection: 'descending',
        selectKey,
        selectValueToCompare: selectValue,
      }),
    ).to.eq(2);

    expect(
      findIndexInSortedArray({
        needle: ['five-3', 5],
        sortedArray: haystack,
        sortDirection: 'descending',
        selectKey,
        selectValueToCompare: selectValue,
      }),
    ).to.eq(3);
  });
});

describe('generateChannelTempCid', () => {
  it('should return a valid temp cid for valid input', () => {
    const result = generateChannelTempCid('messaging', ['alice', 'bob']);
    expect(result).to.equal('messaging:!members-alice,bob');
  });

  it('should return undefined if members is null', () => {
    const result = generateChannelTempCid('messaging', null as unknown as string[]);
    expect(result).to.be.undefined;
  });

  it('should return undefined if members is an empty array', () => {
    const result = generateChannelTempCid('messaging', []);
    expect(result).to.be.undefined;
  });

  it('should correctly format cid for multiple members', () => {
    const result = generateChannelTempCid('team', ['zack', 'alice', 'charlie']);
    expect(result).to.equal('team:!members-alice,charlie,zack');
  });
});

describe('uniqBy', () => {
  it('should return an empty array if input is not an array', () => {
    expect(uniqBy(null, 'id')).to.deep.equal([]);
    expect(uniqBy(undefined, 'id')).to.deep.equal([]);
    expect(uniqBy(42, 'id')).to.deep.equal([]);
    expect(uniqBy({}, 'id')).to.deep.equal([]);
  });

  it('should remove duplicates based on a property name', () => {
    const array = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
      { id: 1, name: 'Alice' },
    ];
    const result = uniqBy(array, 'id');
    expect(result).to.deep.equal([
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ]);
  });

  it('should remove duplicates based on a computed function', () => {
    const array = [
      { id: 1, value: 10 },
      { id: 2, value: 20 },
      { id: 3, value: 10 },
    ];
    const result = uniqBy(array, (item: { id: number; value: number }) => item.value);
    expect(result).to.deep.equal([
      { id: 1, value: 10 },
      { id: 2, value: 20 },
    ]);
  });

  it('should return the same array if all elements are unique', () => {
    const array = [
      { id: 1, value: 'A' },
      { id: 2, value: 'B' },
      { id: 3, value: 'C' },
    ];
    expect(uniqBy(array, 'id')).to.deep.equal(array);
  });

  it('should work with nested properties', () => {
    const array = [
      { user: { id: 1, name: 'Alice' } },
      { user: { id: 2, name: 'Bob' } },
      { user: { id: 1, name: 'Alice' } },
    ];
    const result = uniqBy(array, 'user.id');
    expect(result).to.deep.equal([
      { user: { id: 1, name: 'Alice' } },
      { user: { id: 2, name: 'Bob' } },
    ]);
  });

  it('should work with primitive identities', () => {
    expect(uniqBy([1, 2, 2, 3, 1], (x) => x)).to.deep.equal([1, 2, 3]);
    expect(uniqBy(['a', 'b', 'a', 'c'], (x) => x)).to.deep.equal(['a', 'b', 'c']);
  });

  it('should handle an empty array', () => {
    expect(uniqBy([], 'id')).to.deep.equal([]);
  });

  it('should handle falsy values correctly', () => {
    const array = [{ id: 0 }, { id: false }, { id: null }, { id: undefined }, { id: 0 }];
    const result = uniqBy(array, 'id');
    expect(result).to.deep.equal([
      { id: 0 },
      { id: false },
      { id: null },
      { id: undefined },
    ]);
  });

  it('should work when all elements are identical', () => {
    const array = [
      { id: 1, name: 'Alice' },
      { id: 1, name: 'Alice' },
      { id: 1, name: 'Alice' },
    ];
    expect(uniqBy(array, 'id')).to.deep.equal([{ id: 1, name: 'Alice' }]);
  });

  it('should handle mixed types correctly', () => {
    const array = [{ id: 1 }, { id: '1' }, { id: 1.0 }, { id: true }, { id: false }];
    expect(uniqBy(array, 'id')).to.deep.equal([
      { id: 1 },
      { id: '1' },
      { id: true },
      { id: false },
    ]);
  });

  it('should handle undefined values in objects', () => {
    const array = [{ id: undefined }, { id: undefined }, { id: 1 }, { id: 2 }];
    expect(uniqBy(array, 'id')).to.deep.equal([{ id: undefined }, { id: 1 }, { id: 2 }]);
  });

  it('should not modify the original array', () => {
    const array = [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
      { id: 1, name: 'Alice' },
    ];
    const originalArray = [...array];
    uniqBy(array, 'id');
    expect(array).to.deep.equal(originalArray);
  });

  it('should call iteratee function for each element', () => {
    const array = [{ id: 1 }, { id: 2 }, { id: 1 }];
    const iteratee = sinon.spy((item) => item.id);

    uniqBy(array, iteratee);

    expect(iteratee.calledThrice).to.be.true;
    expect(iteratee.firstCall.returnValue).to.equal(1);
    expect(iteratee.secondCall.returnValue).to.equal(2);
    expect(iteratee.thirdCall.returnValue).to.equal(1);
  });

  it('should work with objects missing the given key', () => {
    const array = [
      { id: 1 },
      { name: 'Alice' }, // missing 'id'
      { id: 2 },
      { id: 1 },
    ];
    const result = uniqBy(array, 'id');
    expect(result).to.deep.equal([{ id: 1 }, { name: 'Alice' }, { id: 2 }]);
  });

  it('should work with an empty iteratee function', () => {
    const array = [{ id: 1 }, { id: 2 }];
    const result = uniqBy(array, () => {});
    expect(result.length).to.equal(1); // Everything maps to `undefined`, so only first is kept
  });

  it('should handle more than 1 duplicate efficiently', () => {
    const largeArray = Array.from({ length: 10000 }, (_, i) => ({ id: i % 100 }));
    const result = uniqBy(largeArray, 'id');
    expect(result.length).to.equal(100);
  });

  it('should return an empty array when array contains only undefined values', () => {
    const array = [undefined, undefined, undefined];
    expect(uniqBy(array, (x) => x)).to.deep.equal([undefined]);
  });
});

describe('runDetached', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('calls onSuccessCallback when promise resolves', async () => {
    const result = 'success';
    const callback = Promise.resolve(result);
    const onSuccessCallback = vi.fn();

    runDetached(callback, { onSuccessCallback });

    await callback; // wait for the promise to resolve

    expect(onSuccessCallback).toHaveBeenCalledWith(result);
  });

  it('calls onErrorCallback when promise rejects', async () => {
    const error = new Error('failure');
    const callback = Promise.reject(error);
    const onErrorCallback = vi.fn();

    runDetached(callback, { onErrorCallback });

    // since the cb errors out, wait for the next tick of the event loop
    // (i.e wait for the event loop to flush)
    await new Promise((resolve) => setImmediate(resolve));

    expect(onErrorCallback).toHaveBeenCalledWith(error);
  });

  it('calls default onError when no onErrorCallback is provided', async () => {
    const error = new Error('oops');
    const callback = Promise.reject(error);
    const sinkSpy = vi.fn();
    chatLoggerSystem.configureLoggers({
      default: { sink: sinkSpy, level: 'trace' },
    });

    runDetached(callback, { context: 'MyContext' });

    await new Promise((resolve) => setImmediate(resolve));

    expect(sinkSpy).toHaveBeenCalledWith(
      'error',
      expect.stringContaining('An error occurred in context "MyContext"'),
      expect.objectContaining({ error }),
    );

    chatLoggerSystem.restoreDefaults();
  });

  it('does not fail if onSuccessCallback is missing', async () => {
    const callback = Promise.resolve('value');
    expect(() => runDetached(callback)).not.toThrow();
    await expect(callback).resolves.toBe('value');
  });

  it('handles async onSuccessCallback', async () => {
    const callback = Promise.resolve('result');
    const onSuccessCallback = vi.fn(async () => {
      await new Promise((res) => setTimeout(res, 10));
    });

    runDetached(callback, { onSuccessCallback });
    await callback;

    expect(onSuccessCallback).toHaveBeenCalled();
  });

  it('handles async onErrorCallback', async () => {
    const error = new Error('fail');
    const callback = Promise.reject(error);
    const onErrorCallback = vi.fn(async () => {
      await new Promise((res) => setTimeout(res, 10));
    });

    runDetached(callback, { onErrorCallback });

    await new Promise((resolve) => setImmediate(resolve));

    expect(onErrorCallback).toHaveBeenCalledWith(error);
  });
});

describe('sleep', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves after the specified number of seconds', async () => {
    const waitPromise = sleep(2000);

    // Advance time by 2 seconds
    vi.advanceTimersByTime(2000);

    await expect(waitPromise).resolves.toBeUndefined();
  });

  it('does not resolve before the time has passed', async () => {
    const waitPromise = sleep(3000);

    let resolved = false;
    waitPromise.then(() => {
      resolved = true;
    });

    vi.advanceTimersByTime(2000);
    expect(resolved).toBe(false);

    vi.advanceTimersByTime(1000);
    await waitPromise;
    expect(resolved).toBe(true);
  });
});

describe('channelHasReadEvents', () => {
  const makeChannel = (own_capabilities?: ChannelOwnCapability[]) => {
    const client = new StreamChat('apiKey');
    client.user = { id: 'user' };
    const channel = client.channel('messaging', 'cap-id');
    channel.data = { own_capabilities };
    return channel;
  };

  it('returns true when own_capabilities includes read-events', () => {
    expect(channelHasReadEvents(makeChannel(['read-events']))).toBe(true);
  });

  it('returns false when own_capabilities is known and excludes read-events (e.g. livestream)', () => {
    expect(channelHasReadEvents(makeChannel([]))).toBe(false);
  });

  it('returns true (assumes read events on) when own_capabilities is unknown', () => {
    expect(channelHasReadEvents(makeChannel(undefined))).toBe(true);
  });

  it('returns true when the channel is undefined', () => {
    expect(channelHasReadEvents(undefined)).toBe(true);
  });
});

describe('channelTracksReadLocally', () => {
  const setup = ({
    isLocalUnreadCountEnabled,
    own_capabilities,
  }: {
    isLocalUnreadCountEnabled?: boolean;
    own_capabilities?: ChannelOwnCapability[];
  }) => {
    const client = new StreamChat('apiKey', { isLocalUnreadCountEnabled });
    client.user = { id: 'user' };
    const channel = client.channel('messaging', 'cap-id');
    channel.data = { own_capabilities };
    return { client, channel };
  };

  it('returns true when read events are disabled and local unread count is enabled', () => {
    const { channel } = setup({
      isLocalUnreadCountEnabled: true,
      own_capabilities: [],
    });
    expect(channelTracksReadLocally(channel)).toBe(true);
  });

  it('returns false when the channel has read events', () => {
    const { channel } = setup({
      isLocalUnreadCountEnabled: true,
      own_capabilities: ['read-events'],
    });
    expect(channelTracksReadLocally(channel)).toBe(false);
  });

  it('returns false when local unread count is disabled', () => {
    const { channel } = setup({
      isLocalUnreadCountEnabled: false,
      own_capabilities: [],
    });
    expect(channelTracksReadLocally(channel)).toBe(false);
  });

  it('returns false when the channel is undefined', () => {
    expect(channelTracksReadLocally(undefined)).toBe(false);
  });
});

describe('userHasReadReceipts', () => {
  const makeClient = (readReceiptsEnabled?: boolean) => {
    const client = new StreamChat('apiKey');
    client.user = {
      id: 'user',
      privacy_settings:
        readReceiptsEnabled === undefined
          ? undefined
          : { read_receipts: { enabled: readReceiptsEnabled } },
    };
    return client;
  };

  it('returns true when read receipts are enabled', () => {
    expect(userHasReadReceipts(makeClient(true))).toBe(true);
  });

  it('returns false when read receipts are explicitly disabled', () => {
    expect(userHasReadReceipts(makeClient(false))).toBe(false);
  });

  it('returns true (assumes enabled) when privacy settings are unset', () => {
    expect(userHasReadReceipts(makeClient(undefined))).toBe(true);
  });
});

describe('throttle', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires a single (non-burst) call on the trailing edge when leading is false', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 1000, { leading: false, trailing: true });

    throttled('a');
    expect(fn).not.toHaveBeenCalled(); // leading:false so nothing on the leading edge

    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith('a'); // the lone call's args reach the trailing edge
  });

  it('collapses a burst to one trailing call with the last args when leading is false', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 1000, { leading: false, trailing: true });

    throttled('a');
    throttled('b');
    throttled('c');
    expect(fn).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith('c');
  });

  it('fires on the leading edge and drops within-window calls when trailing is false', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 1000); // defaults { leading: true, trailing: false }

    throttled('a');
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith('a');

    throttled('b');
    throttled('c');
    expect(fn).toHaveBeenCalledTimes(1); // trailing: false so no trailing invocation

    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('fires on both leading and trailing edges when both are enabled', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 1000, { leading: true, trailing: true });

    throttled('a'); // leading edge
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenLastCalledWith('a');

    throttled('b'); // captured for the trailing edge
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(2); // trailing edge
    expect(fn).toHaveBeenLastCalledWith('b');
  });

  it('does not fire a duplicate trailing call for a solitary leading+trailing call', () => {
    const fn = vi.fn();
    const throttled = throttle(fn, 1000, { leading: true, trailing: true });

    throttled('a'); // leading only so no second call to schedule a trailing
    expect(fn).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1); // no duplicate trailing
  });
});
