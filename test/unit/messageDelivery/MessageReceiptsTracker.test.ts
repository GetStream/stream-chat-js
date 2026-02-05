import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MessageReceiptsTracker,
  type MsgRef,
  ReadResponse,
  UserResponse,
} from '../../../src';

const ownUserId = 'author';
const U = (id: string): UserResponse => ({ id, name: id }); // matches UserResponse shape for the service

// Timeline: 4 messages with ascending timestamps
const msgs = [
  { id: 'm1', ts: 1000 },
  { id: 'm2', ts: 2000 },
  { id: 'm3', ts: 3000 },
  { id: 'm4', ts: 4000 },
] as const;

const byTs = new Map<number, { id: string; ts: number }>(msgs.map((m) => [m.ts, m]));
const ref = (ts: number): MsgRef => ({ timestampMs: ts, msgId: byTs.get(ts)!.id });

// Message locator used by the service (O(1) lookup by exact timestamp)
const makeLocator = () => (timestampMs?: number) => {
  if (!timestampMs) return null;
  const m = byTs.get(timestampMs);
  return m ? { timestampMs: m.ts, msgId: m.id } : null;
};

// ISO builders (service parses Date strings)
const iso = (ts: number) => new Date(ts).toISOString();

// Extract ids from user arrays for easier assertions
const ids = (users: any[]) => users.map((u) => u.id);

// ----------------------------------------------------------------

describe('MessageDeliveryReadTracker', () => {
  let tracker: MessageReceiptsTracker;

  beforeEach(() => {
    tracker = new MessageReceiptsTracker({ locateMessage: makeLocator() });
  });

  describe('ingestInitial', () => {
    it('builds initial state and enforces delivered >= read', () => {
      const alice = U('alice');
      const bob = U('bob');

      // Alice read m2, delivered m1 -> delivered must be bumped to m2
      // Bob delivered m3, haven't read any message -> read stays MIN, delivered m3
      const snapshot: ReadResponse[] = [
        {
          user: alice,
          last_read: iso(2000),
          last_delivered_at: iso(1000),
        },
        {
          user: bob,
          last_read: iso(500),
          last_delivered_at: iso(3000),
        },
      ];

      tracker.ingestInitial(snapshot);

      const pAlice = tracker.getUserProgress('alice')!;
      const pBob = tracker.getUserProgress('bob')!;

      expect(pAlice.lastReadRef).toEqual(ref(2000));
      expect(pAlice.lastDeliveredRef).toEqual(ref(2000)); // bumped up

      expect(pBob.lastReadRef.timestampMs).toBe(Number.NEGATIVE_INFINITY);
      expect(pBob.lastDeliveredRef).toEqual(ref(3000));

      // Readers of m2: Alice only
      expect(ids(tracker.readersForMessage(ref(2000)))).toEqual(['alice']);
      // Delivered for m2: Alice (m2) and Bob (m3)
      expect(ids(tracker.deliveredForMessage(ref(2000)))).toEqual(['alice', 'bob']);
      // Delivered-not-read for m2: Bob only
      expect(ids(tracker.deliveredNotReadForMessage(ref(2000)))).toEqual(['bob']);
    });

    it('includes own read state', () => {
      const ownUser = U(ownUserId);

      const snapshot: ReadResponse[] = [
        {
          user: ownUser,
          last_read: iso(2000),
          last_delivered_at: iso(1000),
        },
      ];

      tracker.ingestInitial(snapshot);

      expect(tracker.getUserProgress(ownUserId)!.user).toStrictEqual(ownUser);
    });
  });

  describe('onMessageRead', () => {
    it('creates user on first read and keeps delivered >= read', () => {
      const carol = U('carol');
      const p0 = tracker.getUserProgress('carol');
      expect(p0).toBeNull();

      // first read at m3
      tracker.onMessageRead({ user: carol, readAt: iso(3000) });

      const p1 = tracker.getUserProgress('carol')!;
      expect(p1.lastReadRef).toEqual(ref(3000));
      expect(p1.lastDeliveredRef).toEqual(ref(3000)); // bumped

      // older/equal reads are no-ops
      tracker.onMessageRead({ user: carol, readAt: iso(2000) });
      tracker.onMessageRead({ user: carol, readAt: iso(3000) });
      const p2 = tracker.getUserProgress('carol')!;
      expect(p2.lastReadRef).toEqual(ref(3000));
      expect(p2.lastDeliveredRef).toEqual(ref(3000));

      // later read moves forward and bumps delivered
      tracker.onMessageRead({ user: carol, readAt: iso(4000) });
      const p3 = tracker.getUserProgress('carol')!;
      expect(p3.lastReadRef).toEqual(ref(4000));
      expect(p3.lastDeliveredRef).toEqual(ref(4000));
    });

    it('ignores read events with unknown timestamps (locator returns null)', () => {
      // re-init with a locator that knows only m1..m3 (m4 is unknown)
      const locator = (ts?: number) =>
        ts && ts <= 3000 ? { timestampMs: ts, msgId: byTs.get(ts)!.id } : null;
      tracker = new MessageReceiptsTracker({ locateMessage: locator });

      const dave = U('dave');
      tracker.onMessageRead({ user: dave, readAt: iso(4000) }); // unknown -> ignored
      expect(tracker.getUserProgress('dave')).toBeNull();

      // but a known read creates progress
      tracker.onMessageRead({ user: dave, readAt: iso(2000) });
      const pd = tracker.getUserProgress('dave')!;
      expect(pd.lastReadRef).toEqual(ref(2000));
      expect(pd.lastDeliveredRef).toEqual(ref(2000));
    });

    it('prevents search for message if last read message id is provided', () => {
      const locator = vi.fn().mockImplementation(() => {});
      tracker = new MessageReceiptsTracker({ locateMessage: locator });
      const user = U('frank');
      tracker.onMessageRead({ user, readAt: iso(3000), lastReadMessageId: 'X' }); // unknown -> ignored
      expect(locator).not.toHaveBeenCalled();
      expect(tracker.getUserProgress('frank')).toStrictEqual({
        lastDeliveredRef: {
          msgId: 'X',
          timestampMs: 3000,
        },
        lastReadRef: {
          msgId: 'X',
          timestampMs: 3000,
        },
        user: {
          id: 'frank',
          name: 'frank',
        },
      });
    });

    it('does not ignore own message.read events', () => {
      const ownUser = U(ownUserId);
      tracker.onMessageRead({ user: ownUser, readAt: iso(2000) });
      expect(tracker.getUserProgress(ownUserId)!.user).toStrictEqual(ownUser);
    });
  });

  describe('onMessageDelivered', () => {
    it('creates user on first delivered; uses max(read, delivered)', () => {
      const eve = U('eve');

      tracker.onMessageDelivered({ user: eve, deliveredAt: iso(2000) });
      let progressEve = tracker.getUserProgress('eve')!;
      expect(progressEve.lastDeliveredRef).toEqual(ref(2000));
      expect(progressEve.lastReadRef.timestampMs).toBe(Number.NEGATIVE_INFINITY);

      // deliver older/equal -> no-op
      tracker.onMessageDelivered({ user: eve, deliveredAt: iso(1000) });
      tracker.onMessageDelivered({ user: eve, deliveredAt: iso(2000) });
      progressEve = tracker.getUserProgress('eve')!;
      expect(progressEve.lastDeliveredRef).toEqual(ref(2000));

      // if read goes ahead to m3, and a delivery arrives for m2,
      // newDelivered = max(read, deliveredEvent) = read (m3)
      tracker.onMessageRead({ user: eve, readAt: iso(3000) });
      progressEve = tracker.getUserProgress('eve')!;
      expect(progressEve.lastReadRef).toEqual(ref(3000));
      expect(progressEve.lastDeliveredRef).toEqual(ref(3000)); // bumped by read

      // deliver at m4 -> moves forward
      tracker.onMessageDelivered({ user: eve, deliveredAt: iso(4000) });
      progressEve = tracker.getUserProgress('eve')!;
      expect(progressEve.lastDeliveredRef).toEqual(ref(4000));
      expect(progressEve.lastReadRef).toEqual(ref(3000));
    });

    it('ignores delivered events with unknown timestamps (locator returns null)', () => {
      const locator = (t?: number) =>
        t && t <= 2000 ? { timestampMs: t, msgId: byTs.get(t)!.id } : null;
      tracker = new MessageReceiptsTracker({ locateMessage: locator });

      const frank = U('frank');
      tracker.onMessageDelivered({ user: frank, deliveredAt: iso(3000) }); // unknown -> ignored
      expect(tracker.getUserProgress('frank')).toBeNull();

      tracker.onMessageDelivered({ user: frank, deliveredAt: iso(2000) }); // known -> creates
      const pf = tracker.getUserProgress('frank')!;
      expect(pf.lastDeliveredRef).toEqual(ref(2000));
    });

    it('prevents search for message if last read message id is provided', () => {
      const locator = vi.fn().mockImplementation(() => {});
      tracker = new MessageReceiptsTracker({ locateMessage: locator });
      const user = U('frank');
      tracker.onMessageDelivered({
        user,
        deliveredAt: iso(3000),
        lastDeliveredMessageId: 'X',
      }); // unknown -> ignored
      expect(locator).not.toHaveBeenCalled();
      expect(tracker.getUserProgress('frank')).toStrictEqual({
        lastDeliveredRef: {
          msgId: 'X',
          timestampMs: 3000,
        },
        lastReadRef: {
          msgId: '',
          timestampMs: Number.NEGATIVE_INFINITY,
        },
        user: {
          id: 'frank',
          name: 'frank',
        },
      });
    });

    it('does not ignore own message.delivered events', () => {
      const ownUser = U(ownUserId);
      tracker.onMessageDelivered({ user: ownUser, deliveredAt: iso(2000) });
      expect(tracker.getUserProgress(ownUserId)!.user).toStrictEqual(ownUser);
    });
  });

  describe('onNotificationMarkUnread', () => {
    const user = U('u');
    it('moves lastRead backward to the event boundary and keeps delivered unchanged (no backward move)', () => {
      tracker.onMessageRead({ user, readAt: iso(3000), lastReadMessageId: 'm3' });

      tracker.onNotificationMarkUnread({
        user,
        lastReadAt: iso(2000),
        lastReadMessageId: 'm2',
      });

      const userProgress = tracker.getUserProgress(user.id)!;
      // read moved back to m2
      expect(userProgress.lastReadRef).toEqual(ref(2000));
      // delivered did NOT move backward (stays at m3)
      expect(userProgress.lastDeliveredRef).toEqual(ref(3000));

      // sanity checks in queries
      expect(tracker.hasUserRead(ref(2000), 'u')).toBe(true);
      expect(tracker.hasUserRead(ref(3000), 'u')).toBe(false);
      expect(tracker.hasUserDelivered(ref(3000), 'u')).toBe(true);
    });

    it('supports unread to MIN when lastReadAt is not provided', () => {
      // v delivered m4 and read m2
      tracker.onMessageDelivered({
        user,
        deliveredAt: iso(4000),
        lastDeliveredMessageId: 'm4',
      });
      tracker.onMessageRead({ user, readAt: iso(2000), lastReadMessageId: 'm2' });

      let userProgress = tracker.getUserProgress(user.id)!;
      expect(userProgress.lastReadRef).toEqual(ref(2000));
      expect(userProgress.lastDeliveredRef).toEqual(ref(4000));

      // Unread everything (no lastReadAt) -> lastRead becomes MIN_REF; delivered stays at m4
      tracker.onNotificationMarkUnread({
        user,
      });

      userProgress = tracker.getUserProgress(user.id)!;
      expect(userProgress.lastReadRef.timestampMs).toBe(Number.NEGATIVE_INFINITY);
      expect(userProgress.lastReadRef.msgId).toBe('');
      // delivered remains ahead (not decreased)
      expect(userProgress.lastDeliveredRef).toEqual(ref(4000));
    });

    it('is a no-op when the provided last_read equals current lastReadRef', () => {
      tracker.onMessageRead({ user, readAt: iso(3000) });
      const before = structuredClone(tracker.getUserProgress(user.id)!);

      tracker.onNotificationMarkUnread({
        user,
        lastReadAt: iso(3000),
        lastReadMessageId: 'm3',
      });

      const after = tracker.getUserProgress(user.id)!;
      expect(after.lastReadRef).toEqual(before.lastReadRef);
      expect(after.lastDeliveredRef).toEqual(before.lastDeliveredRef);
    });

    it('does not call locateMessage when lastReadMessageId is provided', () => {
      const locator = vi.fn().mockImplementation(makeLocator());
      tracker = new MessageReceiptsTracker({ locateMessage: locator });

      tracker.onNotificationMarkUnread({
        user,
        lastReadAt: iso(2000),
        lastReadMessageId: 'm2',
      });

      // new read state applied
      const userProgress = tracker.getUserProgress(user.id)!;
      expect(userProgress.lastReadRef).toEqual(ref(2000));

      // ensure locator wasn’t used to derive the read ref
      expect(locator).not.toHaveBeenCalled();
    });
  });

  describe('queries', () => {
    it('readersForMessage / deliveredForMessage / deliveredNotReadForMessage', () => {
      const a = U('a');
      const b = U('b');
      const c = U('c');

      // a: read m3, delivered m3
      tracker.onMessageRead({ user: a, readAt: iso(3000) });
      // b: delivered m3 only (not read)
      tracker.onMessageDelivered({ user: b, deliveredAt: iso(3000) });
      // c: read m4, delivered m4
      tracker.onMessageRead({ user: c, readAt: iso(4000) });

      // Readers of m2 => a, c
      expect(ids(tracker.readersForMessage(ref(2000)))).toEqual(['a', 'c']);

      // Delivered for m2 => a, b, c
      expect(ids(tracker.deliveredForMessage(ref(2000)))).toEqual(['a', 'b', 'c']);

      // Delivered-not-read for m3 => b only
      expect(ids(tracker.deliveredNotReadForMessage(ref(3000)))).toEqual(['b']);
    });

    it('hasUserRead / hasUserDelivered flags reflect progress', () => {
      const u1 = U('u1');
      const u2 = U('u2');

      tracker.onMessageDelivered({ user: u1, deliveredAt: iso(2000) }); // delivered m2
      tracker.onMessageRead({ user: u2, readAt: iso(3000) }); // read m3 (delivered m3)

      // For m2:
      expect(tracker.hasUserDelivered(ref(2000), 'u1')).toBe(true);
      expect(tracker.hasUserRead(ref(2000), 'u1')).toBe(false);

      expect(tracker.hasUserDelivered(ref(2000), 'u2')).toBe(true);
      expect(tracker.hasUserRead(ref(2000), 'u2')).toBe(true);

      // For m3:
      expect(tracker.hasUserDelivered(ref(3000), 'u1')).toBe(false);
      expect(tracker.hasUserRead(ref(3000), 'u1')).toBe(false);

      expect(tracker.hasUserDelivered(ref(3000), 'u2')).toBe(true);
      expect(tracker.hasUserRead(ref(3000), 'u2')).toBe(true);
    });

    describe('usersWhoseLastReadIs / usersWhoseLastDeliveredIs', () => {
      it('returns users for whom the given message is their exact *last* read/delivered', () => {
        const a = U('a');
        const b = U('b');
        const c = U('c');
        const d = U('d'); // will share timestamp with m3 but different msgId via direct id override
        const e = U('e'); // same for delivered side

        // a: read m2 -> delivered m2
        tracker.onMessageRead({ user: a, readAt: iso(2000) });

        // b: read m3 -> delivered m3
        tracker.onMessageRead({ user: b, readAt: iso(3000) });

        // c: delivered m3 only
        tracker.onMessageDelivered({ user: c, deliveredAt: iso(3000) });

        // d: read at ts=3000 but with a different msgId "X" (tests plateau filtering by msgId)
        tracker.onMessageRead({ user: d, readAt: iso(3000), lastReadMessageId: 'X' });

        // e: delivered at ts=3000 but with a different msgId "X"
        tracker.onMessageDelivered({
          user: e,
          deliveredAt: iso(3000),
          lastDeliveredMessageId: 'X',
        });

        // Last READ is m2: only a
        expect(ids(tracker.usersWhoseLastReadIs(ref(2000)))).toEqual(['a']);

        // Last READ is m3: only b (d is same timestamp but different msgId)
        expect(ids(tracker.usersWhoseLastReadIs(ref(3000)))).toEqual(['b']);

        // Last DELIVERED is m2: only a
        expect(ids(tracker.usersWhoseLastDeliveredIs(ref(2000)))).toEqual(['a']);

        // Last DELIVERED is m3: b (read bumps delivered) and c (delivered-only); e excluded (msgId "X")
        expect(ids(tracker.usersWhoseLastDeliveredIs(ref(3000)))).toEqual(['b', 'c']);
      });

      it('updates membership when a user advances beyond the message', () => {
        const user = U('x');

        // x reads m2 -> last read m2 (and delivered m2)
        tracker.onMessageRead({ user, readAt: iso(2000) });
        expect(ids(tracker.usersWhoseLastReadIs(ref(2000)))).toEqual(['x']);
        expect(ids(tracker.usersWhoseLastDeliveredIs(ref(2000)))).toEqual(['x']);

        // x later reads m4 -> moves out of m2 group and into m4 group
        tracker.onMessageRead({ user, readAt: iso(4000) });
        expect(ids(tracker.usersWhoseLastReadIs(ref(2000)))).toEqual([]);
        expect(ids(tracker.usersWhoseLastReadIs(ref(4000)))).toEqual(['x']);

        // delivered follows read bump
        expect(ids(tracker.usersWhoseLastDeliveredIs(ref(2000)))).toEqual([]);
        expect(ids(tracker.usersWhoseLastDeliveredIs(ref(4000)))).toEqual(['x']);
      });

      it('returns empty array for empty message id', () => {
        expect(tracker.usersWhoseLastReadIs({ timestampMs: 123, msgId: '' })).toEqual([]);
        expect(
          tracker.usersWhoseLastDeliveredIs({ timestampMs: 123, msgId: '' }),
        ).toEqual([]);
      });
    });

    describe('groupUsersByLastReadMessage / groupUsersByLastDeliveredMessage', () => {
      it('returns users for whom the given message is their exact *last* read/delivered', () => {
        const a = U('a');
        const b = U('b');
        const c = U('c');
        const d = U('d'); // will share timestamp with m3 but different msgId via direct id override
        const e = U('e'); // same for delivered side
        const f = U('f'); // same for delivered side

        tracker.onMessageDelivered({
          user: c,
          deliveredAt: iso(2000),
          lastDeliveredMessageId: '2000',
        });
        tracker.onMessageDelivered({
          user: a,
          deliveredAt: iso(2000),
          lastDeliveredMessageId: '2000',
        });
        tracker.onMessageDelivered({
          user: e,
          deliveredAt: iso(3000),
          lastDeliveredMessageId: '3000',
        });
        tracker.onMessageDelivered({
          user: f,
          deliveredAt: iso(3000),
          lastDeliveredMessageId: '3000',
        });

        tracker.onMessageRead({ user: a, readAt: iso(1000), lastReadMessageId: '1000' });
        tracker.onMessageRead({ user: d, readAt: iso(3000), lastReadMessageId: '3000' });
        tracker.onMessageRead({ user: b, readAt: iso(3000), lastReadMessageId: '3000' });

        expect(tracker.groupUsersByLastDeliveredMessage()).toStrictEqual({
          '2000': [c, a],
          '3000': [e, f, d, b],
        });
        expect(tracker.groupUsersByLastReadMessage()).toStrictEqual({
          '1000': [a],
          '3000': [d, b],
        });
      });
    });
  });

  describe('ordering & movement in sorted arrays', () => {
    it('repositions users correctly when progress advances', () => {
      const x = U('x');
      const y = U('y');

      // x reads m2, y reads m3
      tracker.onMessageRead({ user: x, readAt: iso(2000) });
      tracker.onMessageRead({ user: y, readAt: iso(3000) });

      // Readers of m2 -> x, y
      expect(ids(tracker.readersForMessage(ref(2000)))).toEqual(['x', 'y']);

      // now x reads m4 (moves past y)
      tracker.onMessageRead({ user: x, readAt: iso(4000) });
      // Readers of m3 -> x, y? Actually only x (m4) and y (m3) both >= m3
      expect(ids(tracker.readersForMessage(ref(3000)))).toEqual(['y', 'x']);
      // and of m4 -> x only
      expect(ids(tracker.readersForMessage(ref(4000)))).toEqual(['x']);
    });
  });
});
