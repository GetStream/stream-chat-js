import { beforeEach, describe, expect, it, vi } from 'vitest';

import { getClientWithUser } from './test-utils/getClient';
import { generateMsg } from './test-utils/generateMessage';
import { formatMessage } from '../../src';
import type { Channel, StreamChat } from '../../src';
import { getMessageCreatedAtTimestamp } from '../../src/pagination/paginators/MessageIntervalPaginator';
import { dateToNs, msToNs, nowNs, nsToDate, nsToMs } from '../../src/utils/time';

/**
 * Regressions for the unit itself, not for any one feature.
 *
 * Every server-sent timestamp is a unix-**nanosecond** number. Almost nothing about getting that
 * wrong is a type error — `new Date(number)` compiles, `number - number` compiles, and a `Date`
 * assigned into a numeric field only fails where the field is actually typed. So the failures this
 * change was made to prevent are all silent, and this suite is the only mechanical guard on them.
 *
 * Every case below uses a REALISTIC nanosecond value rather than something built from
 * `Date.now()`, because that is what makes a regression visible: `new Date(1.79e18)` is out of
 * Date's range, so a stray conversion produces an `Invalid Date` or a year ~58,000 rather than a
 * plausible-looking timestamp that quietly passes.
 */

/** A real on-device value, from the bug report that prompted the ns work. */
const NANOS = 1786219962651957000;

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

describe('wire timestamps (unix nanoseconds)', () => {
  let client: StreamChat;
  let channel: Channel;

  beforeEach(() => {
    client = getClientWithUser({ id: 'own-user' });
    channel = client.channel('messaging', 'wire-timestamps');
  });

  it('is out of Date range, which is what makes every stray conversion silent', () => {
    // The premise of the whole suite. If this ever stops holding, the guards below stop guarding.
    expect(Number.isNaN(new Date(NANOS).getTime())).toBe(true);
    expect(nsToMs(NANOS)).toBe(Math.floor(NANOS / 1e6));
    expect(new Date(nsToMs(NANOS)).getFullYear()).toBe(2026);
  });

  describe('message ordering', () => {
    it('reads created_at as a finite number', () => {
      const message = formatMessage(generateMsg({ created_at: NANOS }));

      expect(getMessageCreatedAtTimestamp(message)).toBe(NANOS);
    });

    it('advances lastMessageAt rather than leaving it null', () => {
      // The regression: `created_at instanceof Date` was the gate here, so this returned `null` for
      // every message and silently disabled channel-list sorting.
      seedLatestWindow(channel, generateMsg({ created_at: NANOS }));

      expect(channel.messagePaginator.lastMessageAt).toBe(NANOS);
    });

    it('orders by the wire value, not by a coerced one', () => {
      const older = generateMsg({ id: 'older', created_at: NANOS });
      const newer = generateMsg({ id: 'newer', created_at: NANOS + msToNs(60_000) });

      seedLatestWindow(channel, older, newer);

      expect(channel.messagePaginator.lastMessageAt).toBe(newer.created_at);
      expect(channel.messagePaginator.headmostItem?.id).toBe('newer');
    });

    it('takes the server seed as the floor when it is newer than anything loaded', () => {
      const seed = NANOS + msToNs(120_000);
      seedLatestWindow(channel, generateMsg({ created_at: NANOS }));

      channel.messagePaginator.seedLastMessageAt(seed);

      expect(channel.messagePaginator.lastMessageAt).toBe(seed);
    });
  });

  describe('unread counting', () => {
    it('counts only messages newer than the last-read wire timestamp', () => {
      seedLatestWindow(
        channel,
        generateMsg({ created_at: NANOS - msToNs(1000), user: { id: 'other' } }),
        generateMsg({ created_at: NANOS + msToNs(1000), user: { id: 'other' } }),
        generateMsg({ created_at: NANOS + msToNs(2000), user: { id: 'other' } }),
      );

      // Comparing against a `Date` here coerced it to milliseconds, so every message looked newer.
      expect(channel.countUnread(NANOS)).toBe(2);
    });
  });

  describe('expiry checks against the local clock', () => {
    it('reads an elapsed channel mute as expired', () => {
      // The regression: comparing a nanosecond `expires` against `Date.now()` made every mute look
      // far-future, so an expired mute never lapsed.
      client.mutedChannels = [
        {
          channel: { cid: channel.cid },
          created_at: nowNs() - msToNs(120_000),
          expires: nowNs() - msToNs(60_000),
        },
      ] as StreamChat['mutedChannels'];

      expect(client._muteStatus(channel.cid).muted).toBe(false);
    });

    it('reads a mute expiring in the future as active', () => {
      client.mutedChannels = [
        {
          channel: { cid: channel.cid },
          created_at: nowNs(),
          expires: nowNs() + msToNs(60_000),
        },
      ] as StreamChat['mutedChannels'];

      expect(client._muteStatus(channel.cid).muted).toBe(true);
    });
  });

  describe('slow mode', () => {
    it('reports remaining cooldown from an own message inside the window', () => {
      // The regression: the own-message timestamp went through `new Date(ns)`, yielding an Invalid
      // Date that was discarded — so the cooldown never showed at all.
      channel.data = { ...channel.data, cooldown: 30, own_capabilities: [] };
      seedLatestWindow(
        channel,
        generateMsg({ created_at: nowNs() - msToNs(10_000), user: { id: 'own-user' } }),
      );

      channel.cooldownTimer.refresh();

      expect(channel.cooldownTimer.ownLatestMessageTimestamp).toEqual(expect.any(Number));
      expect(channel.cooldownTimer.cooldownRemaining).toBe(20);
    });

    it('reports no cooldown once the window has elapsed', () => {
      channel.data = { ...channel.data, cooldown: 30, own_capabilities: [] };
      seedLatestWindow(
        channel,
        generateMsg({ created_at: nowNs() - msToNs(60_000), user: { id: 'own-user' } }),
      );

      channel.cooldownTimer.refresh();

      expect(channel.cooldownTimer.cooldownRemaining).toBe(0);
    });
  });

  describe('durations stay milliseconds', () => {
    it('derives a reminder countdown in milliseconds from a wire deadline', async () => {
      const { Reminder } = await import('../../src');
      const remindAt = nowNs() + msToNs(60_000);

      const reminder = new Reminder({
        data: {
          channel_cid: channel.cid,
          created_at: nowNs(),
          message_id: 'm1',
          remind_at: remindAt,
          updated_at: nowNs(),
          user_id: 'own-user',
        } as never,
      });

      // Milliseconds, not nanoseconds — this is what `setTimeout` and every "time left" reader use.
      expect(reminder.timeLeftMs).toBeGreaterThan(55_000);
      expect(reminder.timeLeftMs).toBeLessThanOrEqual(60_000);
      reminder.clearTimer();
    });

    it('treats the epoch as a real deadline rather than as "unset"', async () => {
      const { Reminder } = await import('../../src');

      // `0` is a legitimate timestamp but it is falsy, so the truthiness checks these guards
      // replaced read the epoch as "no reminder set" and left `timeLeftMs` null.
      const reminder = new Reminder({
        data: {
          channel_cid: channel.cid,
          created_at: nowNs(),
          message_id: 'm-epoch',
          remind_at: 0,
          updated_at: nowNs(),
          user_id: 'own-user',
        } as never,
      });

      expect(reminder.remindAt).toBe(0);
      expect(reminder.timeLeftMs).not.toBeNull();
      // Long overdue, since the deadline is 1970.
      expect(reminder.timeLeftMs!).toBeLessThan(0);
      reminder.clearTimer();
    });
  });

  describe('request boundaries still take Date', () => {
    it('sends a Date, built from the read state, for a created_at_around jump', async () => {
      // Request date fields are still typed `Date`, so a wire value crossing back out has to be
      // converted. Passing the raw number produced an unparseable `created_at_around`.
      const lastReadAt = NANOS;
      channel.state.read['own-user'] = {
        last_read: lastReadAt,
        unread_messages: 3,
        user: { id: 'own-user' } as never,
      };
      const executeQuery = vi
        .spyOn(channel.messagePaginator, 'executeQuery')
        .mockResolvedValue({
          stateCandidate: { items: [] },
          targetInterval: null,
        } as never);
      vi.spyOn(channel.messagePaginator, 'jumpToMessage').mockResolvedValue(
        true as never,
      );

      await channel.messagePaginator.jumpToTheFirstUnreadMessage({ pageSize: 25 });

      const sent = executeQuery.mock.calls[0][0] as {
        queryShape: { created_at_around: Date };
      };
      expect(sent.queryShape.created_at_around).toBeInstanceOf(Date);
      expect(sent.queryShape.created_at_around.toISOString()).toBe(
        new Date(nsToMs(lastReadAt)).toISOString(),
      );
    });

    it('round-trips a wire timestamp through Date without losing the millisecond', () => {
      const asDate = nsToDate(NANOS);

      expect(dateToNs(asDate)).toBe(msToNs(nsToMs(NANOS)));
      expect(asDate.toISOString()).toBe(new Date(nsToMs(NANOS)).toISOString());
    });
  });
});
