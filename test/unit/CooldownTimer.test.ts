import { afterEach, describe, expect, it, vi } from 'vitest';

import { getClientWithUser } from './test-utils/getClient';
import { generateMsg } from './test-utils/generateMessage';
import type { ChannelResponse, Event } from '../../src';

describe('CooldownTimer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('computes remaining seconds and resets to 0 after timeout', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-01-01T00:00:10.000Z');
    vi.setSystemTime(now);

    const client = await getClientWithUser({ id: 'user-1' });
    const channel = client.channel('messaging', 'cooldown-1');

    channel.data = {
      cooldown: 12,
      own_capabilities: [],
    };

    const lastOwnMessageAt = new Date('2026-01-01T00:00:00.000Z');
    channel.state.addMessageSorted(
      generateMsg({
        created_at: lastOwnMessageAt.toISOString(),
        updated_at: lastOwnMessageAt.toISOString(),
        user: { id: client.userID as string },
      }),
    );

    channel.cooldownTimer.refresh();

    expect(channel.cooldownTimer.state.getLatestValue()).toMatchObject({
      cooldownConfigSeconds: 12,
      cooldownRemaining: 2,
      canSkipCooldown: false,
    });

    await vi.advanceTimersByTimeAsync(2000);
    expect(channel.cooldownTimer.cooldownRemaining).toBe(0);
  });

  it('does not set a timeout when cooldown is 0 or undefined', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-01-01T00:00:10.000Z');
    vi.setSystemTime(now);

    const client = await getClientWithUser({ id: 'user-1' });
    const channel = client.channel('messaging', 'cooldown-0');

    channel.data = {
      own_capabilities: [],
    };

    channel.state.addMessageSorted(
      generateMsg({
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        user: { id: client.userID as string },
      }),
    );

    channel.cooldownTimer.refresh();
    expect(channel.cooldownTimer.cooldownRemaining).toBe(0);
    expect(vi.getTimerCount()).toBe(0);

    channel.data.cooldown = 0;

    channel.state.addMessageSorted(
      generateMsg({
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        user: { id: client.userID as string },
      }),
    );

    channel.cooldownTimer.refresh();
    expect(channel.cooldownTimer.cooldownRemaining).toBe(0);
    expect(vi.getTimerCount()).toBe(0);

    channel.data.cooldown = 10;

    channel.state.addMessageSorted(
      generateMsg({
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        user: { id: client.userID as string },
      }),
    );

    channel.cooldownTimer.refresh();
    expect(channel.cooldownTimer.cooldownRemaining).toBe(10);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(10000);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('does not set a timeout when remaining is 0', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-01-01T00:00:10.000Z');
    vi.setSystemTime(now);

    const client = await getClientWithUser({ id: 'user-1' });
    const channel = client.channel('messaging', 'cooldown-remaining-0');

    channel.data = {
      cooldown: 5,
      own_capabilities: [],
    };

    const lastOwnMessageAt = new Date('2026-01-01T00:00:00.000Z'); // 10s ago
    channel.state.addMessageSorted(
      generateMsg({
        created_at: lastOwnMessageAt.toISOString(),
        updated_at: lastOwnMessageAt.toISOString(),
        user: { id: client.userID as string },
      }),
    );

    channel.cooldownTimer.refresh();
    expect(channel.cooldownTimer.cooldownRemaining).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('skips cooldown when user has skip-slow-mode capability', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-01-01T00:00:10.000Z');
    vi.setSystemTime(now);

    const client = await getClientWithUser({ id: 'user-1' });
    const channel = client.channel('messaging', 'cooldown-skip');

    channel.data = {
      cooldown: 10,
      own_capabilities: ['skip-slow-mode'],
    };

    channel.state.addMessageSorted(
      generateMsg({
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        user: { id: client.userID as string },
      }),
    );

    channel.cooldownTimer.refresh();
    expect(channel.cooldownTimer.cooldownRemaining).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('adjusts remaining on channel.updated when cooldown is increased', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-01-01T00:00:10.000Z');
    vi.setSystemTime(now);

    const client = await getClientWithUser({ id: 'user-1' });
    const channel = client.channel('messaging', 'cooldown-updated-increase');

    // timeSince = 2s
    const lastOwnMessageAt = new Date('2026-01-01T00:00:08.000Z');
    channel.state.addMessageSorted(
      generateMsg({
        created_at: lastOwnMessageAt.toISOString(),
        updated_at: lastOwnMessageAt.toISOString(),
        user: { id: client.userID as string },
      }),
    );

    channel.data = { cooldown: 10, own_capabilities: [] };
    channel.cooldownTimer.refresh();
    expect(channel.cooldownTimer.cooldownRemaining).toBe(8);
    expect(vi.getTimerCount()).toBe(1);

    // increase cooldown by +4s -> remaining should become 12
    channel._handleChannelEvent({
      type: 'channel.updated',
      cid: channel.cid,
      channel: { cid: channel.cid, cooldown: 14 },
    } as Event);

    expect(channel.cooldownTimer.cooldownRemaining).toBe(12);
    expect(vi.getTimerCount()).toBe(1);
  });

  it('clears remaining on channel.updated when cooldown becomes smaller than timeSince', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-01-01T00:00:10.000Z');
    vi.setSystemTime(now);

    const client = await getClientWithUser({ id: 'user-1' });
    const channel = client.channel('messaging', 'cooldown-updated-decrease-to-zero');

    // timeSince = 2s
    const lastOwnMessageAt = new Date('2026-01-01T00:00:08.000Z');
    channel.state.addMessageSorted(
      generateMsg({
        created_at: lastOwnMessageAt.toISOString(),
        updated_at: lastOwnMessageAt.toISOString(),
        user: { id: client.userID as string },
      }),
    );

    channel.data = { cooldown: 10, own_capabilities: [] };
    channel.cooldownTimer.refresh();
    expect(channel.cooldownTimer.cooldownRemaining).toBe(8);
    expect(vi.getTimerCount()).toBe(1);

    // cooldown smaller than timeSince (1 < 2) -> remaining 0 and timeout cleared
    channel._handleChannelEvent({
      type: 'channel.updated',
      cid: channel.cid,
      channel: { cid: channel.cid, cooldown: 1 },
    } as Event);

    expect(channel.cooldownTimer.cooldownRemaining).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('clears remaining on channel.updated when cooldown becomes 0', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-01-01T00:00:10.000Z');
    vi.setSystemTime(now);

    const client = await getClientWithUser({ id: 'user-1' });
    const channel = client.channel('messaging', 'cooldown-updated-to-0');

    // timeSince = 2s
    const lastOwnMessageAt = new Date('2026-01-01T00:00:08.000Z');
    channel.state.addMessageSorted(
      generateMsg({
        created_at: lastOwnMessageAt.toISOString(),
        updated_at: lastOwnMessageAt.toISOString(),
        user: { id: client.userID as string },
      }),
    );

    channel.data = { cooldown: 10, own_capabilities: [] };
    channel.cooldownTimer.refresh();
    expect(channel.cooldownTimer.cooldownRemaining).toBe(8);
    expect(vi.getTimerCount()).toBe(1);

    channel._handleChannelEvent({
      type: 'channel.updated',
      cid: channel.cid,
      channel: { cid: channel.cid, cooldown: 0 },
    } as Event);

    expect(channel.cooldownTimer.cooldownRemaining).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('updates via Channel message.new for own messages', async () => {
    vi.useFakeTimers();
    const now = new Date('2026-01-01T00:00:10.000Z');
    vi.setSystemTime(now);

    const client = await getClientWithUser({ id: 'user-1' });
    const channel = client.channel('messaging', 'cooldown-4');

    channel.data = { cooldown: 5, own_capabilities: [] };
    channel.cooldownTimer.refresh();
    expect(channel.cooldownTimer.cooldownRemaining).toBe(0);

    channel._handleChannelEvent({
      type: 'message.new',
      user: { id: client.userID as string },
      message: generateMsg({
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
        user: { id: client.userID as string },
      }),
    } as Event);

    expect(channel.cooldownTimer.cooldownRemaining).toBe(5);

    await vi.advanceTimersByTimeAsync(5000);
    expect(channel.cooldownTimer.cooldownRemaining).toBe(0);
  });
});
