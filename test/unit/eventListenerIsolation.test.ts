import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { StreamChat } from '../../src';
import type { Event } from '../../src';
import { getClientWithUser } from './test-utils/getClient';

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('client event listener isolation', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => null);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('keeps calling later listeners when one throws synchronously', () => {
    const client = getClientWithUser();
    const second = vi.fn();

    client.on('message.new', () => {
      throw new Error('listener boom');
    });
    client.on('message.new', second);

    expect(() => client.dispatchEvent({ type: 'message.new' } as Event)).not.toThrow();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('reports a synchronous throw to console.error when no logger is configured', () => {
    const client = getClientWithUser();
    const error = new Error('listener boom');

    client.on('message.new', () => {
      throw error;
    });
    client.dispatchEvent({ type: 'message.new' } as Event);

    expect(consoleError).toHaveBeenCalledWith(error);
  });

  it('captures a rejection from an async listener', async () => {
    const client = getClientWithUser();
    const error = new Error('async boom');
    const rejections: unknown[] = [];
    const onUnhandled = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', onUnhandled);

    client.on('message.new', async () => {
      throw error;
    });
    client.dispatchEvent({ type: 'message.new' } as Event);
    await flush();
    process.off('unhandledRejection', onUnhandled);

    expect(rejections).toHaveLength(0);
    expect(consoleError).toHaveBeenCalledWith(error);
  });

  it('reports through a configured logger at error level', () => {
    const logger = vi.fn();
    const client = new StreamChat('key', { logger });
    const error = new Error('listener boom');

    client.on('message.new', () => {
      throw error;
    });
    client.dispatchEvent({ type: 'message.new' } as Event);

    expect(logger).toHaveBeenCalledWith(
      'error',
      'Unhandled error in event listener',
      expect.objectContaining({ error }),
    );
    // a configured logger takes over, no duplicate console output
    expect(consoleError).not.toHaveBeenCalledWith(error);
  });

  it('does not invoke a listener that subscribes during dispatch', () => {
    const client = getClientWithUser();
    const late = vi.fn();

    client.on('message.new', () => {
      client.on('message.new', late);
    });
    client.dispatchEvent({ type: 'message.new' } as Event);

    expect(late).not.toHaveBeenCalled();

    // it is picked up by the next event
    client.dispatchEvent({ type: 'message.new' } as Event);
    expect(late).toHaveBeenCalledTimes(1);
  });

  it('terminates when a listener re-subscribes itself on every dispatch', () => {
    const client = getClientWithUser();
    let calls = 0;
    const handler = () => {
      calls += 1;
      if (calls > 100) throw new Error('runaway dispatch loop');
      client.on('message.new', handler);
    };

    client.on('message.new', handler);
    client.dispatchEvent({ type: 'message.new' } as Event);

    expect(calls).toBe(1);
  });

  it('still runs post-listener callbacks and channel listeners after a throw', () => {
    const client = getClientWithUser();
    const channel = client.channel('messaging', 'evicted');
    client.activeChannels[channel.cid] = channel;

    const channelListener = vi.fn();
    channel.on('notification.removed_from_channel', channelListener);
    client.on('notification.removed_from_channel', () => {
      throw new Error('listener boom');
    });

    client.dispatchEvent({
      type: 'notification.removed_from_channel',
      cid: channel.cid,
    } as Event);

    expect(channelListener).toHaveBeenCalledTimes(1);
    // postListenerCallbacks evict the channel; a throwing listener must not skip them
    expect(client.activeChannels[channel.cid]).toBeUndefined();
  });
});

describe('channel event listener isolation', () => {
  let consoleError: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, 'error').mockImplementation(() => null);
  });

  afterEach(() => {
    consoleError.mockRestore();
  });

  it('keeps calling later channel listeners when one throws', () => {
    const client = getClientWithUser();
    const channel = client.channel('messaging', 'isolation');
    client.activeChannels[channel.cid] = channel;
    const second = vi.fn();

    channel.on('message.new', () => {
      throw new Error('channel listener boom');
    });
    channel.on('message.new', second);

    expect(() =>
      client.dispatchEvent({ type: 'message.new', cid: channel.cid } as Event),
    ).not.toThrow();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('captures a rejection from an async channel listener', async () => {
    const client = getClientWithUser();
    const channel = client.channel('messaging', 'isolation-async');
    client.activeChannels[channel.cid] = channel;
    const error = new Error('channel async boom');
    const rejections: unknown[] = [];
    const onUnhandled = (reason: unknown) => rejections.push(reason);
    process.on('unhandledRejection', onUnhandled);

    channel.on('message.new', async () => {
      throw error;
    });
    client.dispatchEvent({ type: 'message.new', cid: channel.cid } as Event);
    await flush();
    process.off('unhandledRejection', onUnhandled);

    expect(rejections).toHaveLength(0);
    expect(consoleError).toHaveBeenCalledWith(error);
  });
});
