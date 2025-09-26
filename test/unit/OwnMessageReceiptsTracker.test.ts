import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  OwnMessageReceiptsTracker,
  type MsgRef,
  ReadResponse,
  UserResponse,
} from '../../src/';

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

describe('OwnMessageDeliveryReadTracker', () => {
  let tracker: OwnMessageReceiptsTracker;

  beforeEach(() => {
    tracker = new OwnMessageReceiptsTracker({ locateMessage: makeLocator(), ownUserId });
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
      tracker = new OwnMessageReceiptsTracker({ locateMessage: locator, ownUserId });

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
      tracker = new OwnMessageReceiptsTracker({ locateMessage: locator, ownUserId });
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
      tracker = new OwnMessageReceiptsTracker({ locateMessage: locator, ownUserId });

      const frank = U('frank');
      tracker.onMessageDelivered({ user: frank, deliveredAt: iso(3000) }); // unknown -> ignored
      expect(tracker.getUserProgress('frank')).toBeNull();

      tracker.onMessageDelivered({ user: frank, deliveredAt: iso(2000) }); // known -> creates
      const pf = tracker.getUserProgress('frank')!;
      expect(pf.lastDeliveredRef).toEqual(ref(2000));
    });

    it('prevents search for message if last read message id is provided', () => {
      const locator = vi.fn().mockImplementation(() => {});
      tracker = new OwnMessageReceiptsTracker({ locateMessage: locator, ownUserId });
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
