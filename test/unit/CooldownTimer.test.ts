import { afterEach, describe, expect, it, vi } from 'vitest';

import { getClientWithUser } from './test-utils/getClient';
import { generateMsg } from './test-utils/generateMessage';
import { formatMessage } from '../../src';
import type { Channel, ChannelResponse, Event } from '../../src';

// CooldownTimer.refresh() derives the current user's latest message from the message paginator's
// latest (head) window, so tests seed the paginator (formatted) rather than legacy channel state.
const seedLatestWindow = (
  channel: Channel,
  ...messages: ReturnType<typeof generateMsg>[]
) =>
  channel.messagePaginator.ingestPage({
    page: messages.map((m) => formatMessage(m)),
    isHead: true,
    isTail: true,
    setActive: true,
  });

describe('CooldownTimer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * `canSkipCooldown` derives from `own_capabilities` and is *stored*, so a capability-only change has to
   * trigger a refresh. `channel.updated` handling is guarded on `cooldown` having moved, which filters
   * exactly this case out, and `updatePartial()` announced the change without refreshing.
   *
   * These drive `channel.updatePartial()` — the real route — rather than registering the timer's own
   * subscriptions and dispatching the event by hand. The earlier version of this suite did the latter, and
   * it proved nothing: nothing in `src/` calls `cooldownTimer.registerSubscriptions()`, so the subscription
   * it exercised does not exist in a running app. A probe has to fail in the broken configuration to be
   * worth anything, and that one passed against code that was inert.
   */
  describe('capability changes through updatePartial', () => {
    const setup = async (own_capabilities: string[]) => {
      const client = await getClientWithUser({ id: 'user-1' });
      const channel = client.channel('messaging', 'cooldown-capabilities');
      channel.data = {
        cid: channel.cid,
        cooldown: 30,
        id: channel.id,
        own_capabilities,
        type: channel.type,
      } as Partial<ChannelResponse>;
      channel.cooldownTimer.refresh();
      return { channel, client };
    };

    const updatePartialWithCapabilities = async (
      channel: Channel,
      own_capabilities: string[],
    ) => {
      vi.spyOn(channel, 'updateChannelPartial').mockResolvedValue({
        channel: { ...channel.data, own_capabilities },
      } as never);
      await channel.updatePartial({ set: { frozen: false } } as never);
    };

    it('picks up a newly granted skip-slow-mode', async () => {
      const { channel } = await setup([]);
      expect(channel.cooldownTimer.canSkipCooldown).toBe(false);

      await updatePartialWithCapabilities(channel, ['skip-slow-mode']);

      expect(channel.cooldownTimer.canSkipCooldown).toBe(true);
    });

    it('picks up a revoked skip-slow-mode', async () => {
      const { channel } = await setup(['skip-slow-mode']);
      expect(channel.cooldownTimer.canSkipCooldown).toBe(true);

      await updatePartialWithCapabilities(channel, []);

      expect(channel.cooldownTimer.canSkipCooldown).toBe(false);
    });

    it('clears a running cooldown as soon as the capability is granted', async () => {
      const { channel } = await setup([]);
      channel.cooldownTimer.setCooldownRemaining(12);
      expect(channel.cooldownTimer.cooldownRemaining).toBe(12);

      await updatePartialWithCapabilities(channel, ['skip-slow-mode']);

      // `refresh()` short-circuits to zero once the cooldown can be skipped.
      expect(channel.cooldownTimer.cooldownRemaining).toBe(0);
    });
  });

  it('ticks down every second until it reaches 0', async () => {
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
    seedLatestWindow(
      channel,
      generateMsg({
        created_at: lastOwnMessageAt,
        updated_at: lastOwnMessageAt,
        user: { id: client.userID as string },
      }),
    );

    channel.cooldownTimer.refresh();

    expect(channel.cooldownTimer.state.getLatestValue()).toMatchObject({
      cooldownConfigSeconds: 12,
      cooldownRemaining: 2,
      canSkipCooldown: false,
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(channel.cooldownTimer.cooldownRemaining).toBe(1);

    await vi.advanceTimersByTimeAsync(1000);
    expect(channel.cooldownTimer.cooldownRemaining).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
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

    seedLatestWindow(
      channel,
      generateMsg({
        created_at: now,
        updated_at: now,
        user: { id: client.userID as string },
      }),
    );

    channel.cooldownTimer.refresh();
    expect(channel.cooldownTimer.cooldownRemaining).toBe(0);
    expect(vi.getTimerCount()).toBe(0);

    channel.data.cooldown = 0;

    seedLatestWindow(
      channel,
      generateMsg({
        created_at: now,
        updated_at: now,
        user: { id: client.userID as string },
      }),
    );

    channel.cooldownTimer.refresh();
    expect(channel.cooldownTimer.cooldownRemaining).toBe(0);
    expect(vi.getTimerCount()).toBe(0);

    channel.data.cooldown = 10;

    seedLatestWindow(
      channel,
      generateMsg({
        created_at: now,
        updated_at: now,
        user: { id: client.userID as string },
      }),
    );

    channel.cooldownTimer.refresh();
    expect(channel.cooldownTimer.cooldownRemaining).toBe(10);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1000);
    expect(channel.cooldownTimer.cooldownRemaining).toBe(9);
    await vi.advanceTimersByTimeAsync(9000);
    expect(channel.cooldownTimer.cooldownRemaining).toBe(0);
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
    seedLatestWindow(
      channel,
      generateMsg({
        created_at: lastOwnMessageAt,
        updated_at: lastOwnMessageAt,
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

    seedLatestWindow(
      channel,
      generateMsg({
        created_at: now,
        updated_at: now,
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
    seedLatestWindow(
      channel,
      generateMsg({
        created_at: lastOwnMessageAt,
        updated_at: lastOwnMessageAt,
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
    seedLatestWindow(
      channel,
      generateMsg({
        created_at: lastOwnMessageAt,
        updated_at: lastOwnMessageAt,
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
    seedLatestWindow(
      channel,
      generateMsg({
        created_at: lastOwnMessageAt,
        updated_at: lastOwnMessageAt,
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
        cid: channel.cid, // must match the paginator filter so message.new ingests into an interval
        created_at: now,
        updated_at: now,
        user: { id: client.userID as string },
      }),
    } as Event);

    expect(channel.cooldownTimer.cooldownRemaining).toBe(5);

    await vi.advanceTimersByTimeAsync(1000);
    expect(channel.cooldownTimer.cooldownRemaining).toBe(4);

    await vi.advanceTimersByTimeAsync(4000);
    expect(channel.cooldownTimer.cooldownRemaining).toBe(0);
  });
});
