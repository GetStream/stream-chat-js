import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  MessageReceiptsTracker,
  type MsgRef,
  ReadStateResponse,
  UserResponse,
} from '../../../src';
import { StateStore } from '../../../src/store';
import type { Channel } from '../../../src/channel';

const ownUserId = 'author';
const U = (id: string): UserResponse => ({ id, name: id }); // matches UserResponse shape for the service
// Read/delivery timestamps are plain wire numbers, in the same space as the message timeline below,
// so they are written inline — there is nothing left to convert.

// Timeline: 4 messages with ascending timestamps
const msgs = [
  { id: 'm1', ts: 1000 },
  { id: 'm2', ts: 2000 },
  { id: 'm3', ts: 3000 },
  { id: 'm4', ts: 4000 },
] as const;

const byTs = new Map<number, { id: string; ts: number }>(msgs.map((m) => [m.ts, m]));
const ref = (ts: number): MsgRef => ({ timestamp: ts, msgId: byTs.get(ts)!.id });

const defaultFindMessageByTimestamp = (timestamp?: number) => {
  if (!timestamp) return undefined;
  const m = byTs.get(timestamp);
  return m ? { id: m.id } : undefined;
};

const createChannelMock = ({
  findMessageByTimestamp = defaultFindMessageByTimestamp,
}: {
  findMessageByTimestamp?: (timestamp?: number) => { id: string } | undefined;
} = {}) => {
  const readStore = new StateStore({
    read: {},
  });

  return {
    channel: {
      // `channel.state` is the reactive store itself; the tracker subscribes to its `read` slice.
      state: readStore,
      // The default receipts locator now resolves timestamps via the message paginator; this mock
      // fn (still named findMessageByTimestamp in tests) backs messagePaginator.findItemByTimestamp.
      messagePaginator: {
        findItemByTimestamp: findMessageByTimestamp,
      },
    } as unknown as Channel,
    readStore,
  };
};

// Extract ids from user arrays for easier assertions
const ids = (users: any[]) => users.map((u) => u.id);

// ----------------------------------------------------------------

describe('MessageDeliveryReadTracker', () => {
  let tracker: MessageReceiptsTracker;
  let channelMock: ReturnType<typeof createChannelMock>;

  beforeEach(() => {
    channelMock = createChannelMock();
    tracker = new MessageReceiptsTracker({ channel: channelMock.channel });
  });

  describe('constructor', () => {
    it('allows locateMessage constructor override while requiring channel', () => {
      const customLocateMessage = vi.fn((timestamp: number) => ({
        timestamp,
        msgId: 'custom',
      }));
      const trackerWithCustomLocator = new MessageReceiptsTracker({
        channel: channelMock.channel,
        locateMessage: customLocateMessage,
      });

      trackerWithCustomLocator.onMessageRead({
        user: U('compat-user'),
        readAt: 2000,
      });

      expect(customLocateMessage).toHaveBeenCalledWith(2000);
      expect(
        trackerWithCustomLocator.getUserProgress('compat-user')?.lastReadRef.msgId,
      ).toBe('custom');
    });
  });

  describe('ingestInitial', () => {
    it('builds initial state and enforces delivered >= read', () => {
      const alice = U('alice');
      const bob = U('bob');

      // Alice read m2, delivered m1 -> delivered must be bumped to m2
      // Bob delivered m3, haven't read any message -> read stays MIN, delivered m3
      const snapshot: ReadStateResponse[] = [
        {
          user: alice,
          last_read: 2000,
          last_delivered_at: 1000,
        },
        {
          user: bob,
          last_read: 500,
          last_delivered_at: 3000,
        },
      ];

      tracker.ingestInitial(snapshot);

      const pAlice = tracker.getUserProgress('alice')!;
      const pBob = tracker.getUserProgress('bob')!;

      expect(pAlice.lastReadRef).toEqual(ref(2000));
      expect(pAlice.lastDeliveredRef).toEqual(ref(2000)); // bumped up

      expect(pBob.lastReadRef.timestamp).toBe(Number.NEGATIVE_INFINITY);
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

      const snapshot: ReadStateResponse[] = [
        {
          user: ownUser,
          last_read: 2000,
          last_delivered_at: 1000,
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
      tracker.onMessageRead({ user: carol, readAt: 3000 });

      const p1 = tracker.getUserProgress('carol')!;
      expect(p1.lastReadRef).toEqual(ref(3000));
      expect(p1.lastDeliveredRef).toEqual(ref(3000)); // bumped

      // older/equal reads are no-ops
      tracker.onMessageRead({ user: carol, readAt: 2000 });
      tracker.onMessageRead({ user: carol, readAt: 3000 });
      const p2 = tracker.getUserProgress('carol')!;
      expect(p2.lastReadRef).toEqual(ref(3000));
      expect(p2.lastDeliveredRef).toEqual(ref(3000));

      // later read moves forward and bumps delivered
      tracker.onMessageRead({ user: carol, readAt: 4000 });
      const p3 = tracker.getUserProgress('carol')!;
      expect(p3.lastReadRef).toEqual(ref(4000));
      expect(p3.lastDeliveredRef).toEqual(ref(4000));
    });

    it('ignores read events with unknown timestamps (locator returns null)', () => {
      // re-init with channel state that knows only m1..m3 (m4 is unknown)
      channelMock = createChannelMock({
        findMessageByTimestamp: (ts?: number) =>
          ts && ts <= 3000 ? { id: byTs.get(ts)!.id } : undefined,
      });
      tracker = new MessageReceiptsTracker({ channel: channelMock.channel });

      const dave = U('dave');
      tracker.onMessageRead({ user: dave, readAt: 4000 }); // unknown -> ignored
      expect(tracker.getUserProgress('dave')).toBeNull();

      // but a known read creates progress
      tracker.onMessageRead({ user: dave, readAt: 2000 });
      const pd = tracker.getUserProgress('dave')!;
      expect(pd.lastReadRef).toEqual(ref(2000));
      expect(pd.lastDeliveredRef).toEqual(ref(2000));
    });

    it('prevents search for message if last read message id is provided', () => {
      const findMessageByTimestamp = vi.fn().mockImplementation(() => {});
      channelMock = createChannelMock({ findMessageByTimestamp });
      tracker = new MessageReceiptsTracker({ channel: channelMock.channel });
      const user = U('frank');
      tracker.onMessageRead({
        user,
        readAt: 3000,
        lastReadMessageId: 'X',
      }); // unknown -> ignored
      expect(findMessageByTimestamp).not.toHaveBeenCalled();
      expect(tracker.getUserProgress('frank')).toStrictEqual({
        lastDeliveredRef: {
          msgId: 'X',
          timestamp: 3000,
        },
        lastReadRef: {
          msgId: 'X',
          timestamp: 3000,
        },
        user: {
          id: 'frank',
          name: 'frank',
        },
      });
    });

    it('does not ignore own message.read events', () => {
      const ownUser = U(ownUserId);
      tracker.onMessageRead({ user: ownUser, readAt: 2000 });
      expect(tracker.getUserProgress(ownUserId)!.user).toStrictEqual(ownUser);
    });
  });

  describe('onMessageDelivered', () => {
    it('creates user on first delivered; uses max(read, delivered)', () => {
      const eve = U('eve');

      tracker.onMessageDelivered({ user: eve, deliveredAt: 2000 });
      let progressEve = tracker.getUserProgress('eve')!;
      expect(progressEve.lastDeliveredRef).toEqual(ref(2000));
      expect(progressEve.lastReadRef.timestamp).toBe(Number.NEGATIVE_INFINITY);

      // deliver older/equal -> no-op
      tracker.onMessageDelivered({ user: eve, deliveredAt: 1000 });
      tracker.onMessageDelivered({ user: eve, deliveredAt: 2000 });
      progressEve = tracker.getUserProgress('eve')!;
      expect(progressEve.lastDeliveredRef).toEqual(ref(2000));

      // if read goes ahead to m3, and a delivery arrives for m2,
      // newDelivered = max(read, deliveredEvent) = read (m3)
      tracker.onMessageRead({ user: eve, readAt: 3000 });
      progressEve = tracker.getUserProgress('eve')!;
      expect(progressEve.lastReadRef).toEqual(ref(3000));
      expect(progressEve.lastDeliveredRef).toEqual(ref(3000)); // bumped by read

      // deliver at m4 -> moves forward
      tracker.onMessageDelivered({ user: eve, deliveredAt: 4000 });
      progressEve = tracker.getUserProgress('eve')!;
      expect(progressEve.lastDeliveredRef).toEqual(ref(4000));
      expect(progressEve.lastReadRef).toEqual(ref(3000));
    });

    it('ignores delivered events with unknown timestamps (locator returns null)', () => {
      channelMock = createChannelMock({
        findMessageByTimestamp: (t?: number) =>
          t && t <= 2000 ? { id: byTs.get(t)!.id } : undefined,
      });
      tracker = new MessageReceiptsTracker({ channel: channelMock.channel });

      const frank = U('frank');
      tracker.onMessageDelivered({ user: frank, deliveredAt: 3000 }); // unknown -> ignored
      expect(tracker.getUserProgress('frank')).toBeNull();

      tracker.onMessageDelivered({ user: frank, deliveredAt: 2000 }); // known -> creates
      const pf = tracker.getUserProgress('frank')!;
      expect(pf.lastDeliveredRef).toEqual(ref(2000));
    });

    it('prevents search for message if last read message id is provided', () => {
      const findMessageByTimestamp = vi.fn().mockImplementation(() => {});
      channelMock = createChannelMock({ findMessageByTimestamp });
      tracker = new MessageReceiptsTracker({ channel: channelMock.channel });
      const user = U('frank');
      tracker.onMessageDelivered({
        user,
        deliveredAt: 3000,
        lastDeliveredMessageId: 'X',
      }); // unknown -> ignored
      expect(findMessageByTimestamp).not.toHaveBeenCalled();
      expect(tracker.getUserProgress('frank')).toStrictEqual({
        lastDeliveredRef: {
          msgId: 'X',
          timestamp: 3000,
        },
        lastReadRef: {
          msgId: '',
          timestamp: Number.NEGATIVE_INFINITY,
        },
        user: {
          id: 'frank',
          name: 'frank',
        },
      });
    });

    it('does not ignore own message.delivered events', () => {
      const ownUser = U(ownUserId);
      tracker.onMessageDelivered({ user: ownUser, deliveredAt: 2000 });
      expect(tracker.getUserProgress(ownUserId)!.user).toStrictEqual(ownUser);
    });
  });

  describe('onNotificationMarkUnread', () => {
    const user = U('u');
    it('moves lastRead backward to the event boundary and keeps delivered unchanged (no backward move)', () => {
      tracker.onMessageRead({
        user,
        readAt: 3000,
        lastReadMessageId: 'm3',
      });

      tracker.onNotificationMarkUnread({
        user,
        lastReadAt: 2000,
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
        deliveredAt: 4000,
        lastDeliveredMessageId: 'm4',
      });
      tracker.onMessageRead({
        user,
        readAt: 2000,
        lastReadMessageId: 'm2',
      });

      let userProgress = tracker.getUserProgress(user.id)!;
      expect(userProgress.lastReadRef).toEqual(ref(2000));
      expect(userProgress.lastDeliveredRef).toEqual(ref(4000));

      // Unread everything (no lastReadAt) -> lastRead becomes MIN_REF; delivered stays at m4
      tracker.onNotificationMarkUnread({
        user,
      });

      userProgress = tracker.getUserProgress(user.id)!;
      expect(userProgress.lastReadRef.timestamp).toBe(Number.NEGATIVE_INFINITY);
      expect(userProgress.lastReadRef.msgId).toBe('');
      // delivered remains ahead (not decreased)
      expect(userProgress.lastDeliveredRef).toEqual(ref(4000));
    });

    it('is a no-op when the provided last_read equals current lastReadRef', () => {
      tracker.onMessageRead({ user, readAt: 3000 });
      const before = structuredClone(tracker.getUserProgress(user.id)!);

      tracker.onNotificationMarkUnread({
        user,
        lastReadAt: 3000,
        lastReadMessageId: 'm3',
      });

      const after = tracker.getUserProgress(user.id)!;
      expect(after.lastReadRef).toEqual(before.lastReadRef);
      expect(after.lastDeliveredRef).toEqual(before.lastDeliveredRef);
    });

    it('does not call locateMessage when lastReadMessageId is provided', () => {
      const findMessageByTimestamp = vi
        .fn()
        .mockImplementation(defaultFindMessageByTimestamp);
      channelMock = createChannelMock({ findMessageByTimestamp });
      tracker = new MessageReceiptsTracker({ channel: channelMock.channel });

      tracker.onNotificationMarkUnread({
        user,
        lastReadAt: 2000,
        lastReadMessageId: 'm2',
      });

      // new read state applied
      const userProgress = tracker.getUserProgress(user.id)!;
      expect(userProgress.lastReadRef).toEqual(ref(2000));

      // ensure locator wasn’t used to derive the read ref
      expect(findMessageByTimestamp).not.toHaveBeenCalled();
    });
  });

  describe('subscriptions', () => {
    it('reconciles from readStore emissions when subscribed and stops after unsubscribe', () => {
      const user = U('subscribed-user');
      tracker.registerSubscriptions();
      tracker.setPendingReadStoreReconcileMeta({ changedUserIds: [user.id] });

      channelMock.readStore.next({
        read: {
          [user.id]: {
            last_read: 2000,
            user,
            unread_messages: 0,
            last_read_message_id: 'm2',
          },
        },
      });
      expect(tracker.getUserProgress(user.id)?.lastReadRef).toEqual(ref(2000));

      tracker.unregisterSubscriptions();
      channelMock.readStore.next({
        read: {
          [user.id]: {
            last_read: 3000,
            user,
            unread_messages: 0,
            last_read_message_id: 'm3',
          },
        },
      });

      // no longer subscribed -> unchanged
      expect(tracker.getUserProgress(user.id)?.lastReadRef).toEqual(ref(2000));
    });
  });

  describe('queries', () => {
    it('readersForMessage / deliveredForMessage / deliveredNotReadForMessage', () => {
      const a = U('a');
      const b = U('b');
      const c = U('c');

      // a: read m3, delivered m3
      tracker.onMessageRead({ user: a, readAt: 3000 });
      // b: delivered m3 only (not read)
      tracker.onMessageDelivered({ user: b, deliveredAt: 3000 });
      // c: read m4, delivered m4
      tracker.onMessageRead({ user: c, readAt: 4000 });

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

      tracker.onMessageDelivered({ user: u1, deliveredAt: 2000 }); // delivered m2
      tracker.onMessageRead({ user: u2, readAt: 3000 }); // read m3 (delivered m3)

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
        tracker.onMessageRead({ user: a, readAt: 2000 });

        // b: read m3 -> delivered m3
        tracker.onMessageRead({ user: b, readAt: 3000 });

        // c: delivered m3 only
        tracker.onMessageDelivered({ user: c, deliveredAt: 3000 });

        // d: read at ts=3000 but with a different msgId "X" (tests plateau filtering by msgId)
        tracker.onMessageRead({
          user: d,
          readAt: 3000,
          lastReadMessageId: 'X',
        });

        // e: delivered at ts=3000 but with a different msgId "X"
        tracker.onMessageDelivered({
          user: e,
          deliveredAt: 3000,
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
        tracker.onMessageRead({ user, readAt: 2000 });
        expect(ids(tracker.usersWhoseLastReadIs(ref(2000)))).toEqual(['x']);
        expect(ids(tracker.usersWhoseLastDeliveredIs(ref(2000)))).toEqual(['x']);

        // x later reads m4 -> moves out of m2 group and into m4 group
        tracker.onMessageRead({ user, readAt: 4000 });
        expect(ids(tracker.usersWhoseLastReadIs(ref(2000)))).toEqual([]);
        expect(ids(tracker.usersWhoseLastReadIs(ref(4000)))).toEqual(['x']);

        // delivered follows read bump
        expect(ids(tracker.usersWhoseLastDeliveredIs(ref(2000)))).toEqual([]);
        expect(ids(tracker.usersWhoseLastDeliveredIs(ref(4000)))).toEqual(['x']);
      });

      it('returns empty array for empty message id', () => {
        expect(tracker.usersWhoseLastReadIs({ timestamp: 123, msgId: '' })).toEqual([]);
        expect(tracker.usersWhoseLastDeliveredIs({ timestamp: 123, msgId: '' })).toEqual(
          [],
        );
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
          deliveredAt: 2000,
          lastDeliveredMessageId: '2000',
        });
        tracker.onMessageDelivered({
          user: a,
          deliveredAt: 2000,
          lastDeliveredMessageId: '2000',
        });
        tracker.onMessageDelivered({
          user: e,
          deliveredAt: 3000,
          lastDeliveredMessageId: '3000',
        });
        tracker.onMessageDelivered({
          user: f,
          deliveredAt: 3000,
          lastDeliveredMessageId: '3000',
        });

        tracker.onMessageRead({ user: a, readAt: 1000, lastReadMessageId: '1000' });
        tracker.onMessageRead({ user: d, readAt: 3000, lastReadMessageId: '3000' });
        tracker.onMessageRead({ user: b, readAt: 3000, lastReadMessageId: '3000' });

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
      tracker.onMessageRead({ user: x, readAt: 2000 });
      tracker.onMessageRead({ user: y, readAt: 3000 });

      // Readers of m2 -> x, y
      expect(ids(tracker.readersForMessage(ref(2000)))).toEqual(['x', 'y']);

      // now x reads m4 (moves past y)
      tracker.onMessageRead({ user: x, readAt: 4000 });
      // Readers of m3 -> x, y? Actually only x (m4) and y (m3) both >= m3
      expect(ids(tracker.readersForMessage(ref(3000)))).toEqual(['y', 'x']);
      // and of m4 -> x only
      expect(ids(tracker.readersForMessage(ref(4000)))).toEqual(['x']);
    });
  });

  describe('snapshotStore', () => {
    it('updates revision on every ingestInitial call', () => {
      const snapshot = [{ user: U('alice'), last_read: 2000, last_delivered_at: 2000 }];

      tracker.ingestInitial(snapshot);
      expect(tracker.snapshotStore.getLatestValue().revision).toBe(1);
      expect(tracker.snapshotStore.getLatestValue().readersByMessageId).toEqual({
        m2: [U('alice')],
      });

      // same state still emits for full ingest calls
      tracker.ingestInitial(snapshot);
      expect(tracker.snapshotStore.getLatestValue().revision).toBe(2);

      // changed state -> new revision
      tracker.ingestInitial([
        { user: U('alice'), last_read: 3000, last_delivered_at: 3000 },
      ]);
      expect(tracker.snapshotStore.getLatestValue().revision).toBe(3);
    });

    it('updates revision for effective message.read changes only', () => {
      const user = U('reader');

      tracker.onMessageRead({ user, readAt: 2000 });
      expect(tracker.snapshotStore.getLatestValue().revision).toBe(1);

      // same/older read should be a no-op
      tracker.onMessageRead({ user, readAt: 2000 });
      tracker.onMessageRead({ user, readAt: 1000 });
      expect(tracker.snapshotStore.getLatestValue().revision).toBe(1);

      tracker.onMessageRead({ user, readAt: 3000 });
      expect(tracker.snapshotStore.getLatestValue().revision).toBe(2);
    });

    it('updates revision for effective message.delivered changes only', () => {
      const user = U('delivered-user');

      tracker.onMessageDelivered({ user, deliveredAt: 2000 });
      expect(tracker.snapshotStore.getLatestValue().revision).toBe(1);

      // same/older delivery should be a no-op
      tracker.onMessageDelivered({ user, deliveredAt: 2000 });
      tracker.onMessageDelivered({ user, deliveredAt: 1000 });
      expect(tracker.snapshotStore.getLatestValue().revision).toBe(1);

      tracker.onMessageDelivered({ user, deliveredAt: 3000 });
      expect(tracker.snapshotStore.getLatestValue().revision).toBe(2);
    });

    it('updates revision for effective notification.mark_unread changes only', () => {
      const user = U('mark-unread-user');

      tracker.onMessageRead({ user, readAt: 3000, lastReadMessageId: 'm3' });
      expect(tracker.snapshotStore.getLatestValue().revision).toBe(1);

      tracker.onNotificationMarkUnread({
        user,
        lastReadAt: 2000,
        lastReadMessageId: 'm2',
      });
      expect(tracker.snapshotStore.getLatestValue().revision).toBe(2);

      // same boundary -> no-op
      tracker.onNotificationMarkUnread({
        user,
        lastReadAt: 2000,
        lastReadMessageId: 'm2',
      });
      expect(tracker.snapshotStore.getLatestValue().revision).toBe(2);
    });
  });

  describe('reconcileFromReadStore', () => {
    it('reconciles changed/removed users from metadata deltas', () => {
      const alice = U('alice');
      const bob = U('bob');
      const carol = U('carol');
      const previousReadState = {
        [alice.id]: {
          last_read: 2000,
          unread_messages: 0,
          user: alice,
          last_read_message_id: 'm2',
        },
        [bob.id]: {
          last_read: 3000,
          unread_messages: 0,
          user: bob,
          last_read_message_id: 'm3',
          last_delivered_at: 3000,
          last_delivered_message_id: 'm3',
        },
      };
      const nextReadState = {
        [bob.id]: {
          last_read: 4000,
          unread_messages: 0,
          user: bob,
          last_read_message_id: 'm4',
          last_delivered_at: 4000,
          last_delivered_message_id: 'm4',
        },
        [carol.id]: {
          last_read: 2000,
          unread_messages: 0,
          user: carol,
          last_read_message_id: 'm2',
          last_delivered_at: 2000,
          last_delivered_message_id: 'm2',
        },
      };

      tracker.ingestInitial([
        { user: alice, last_read: 2000, last_delivered_at: 2000 },
        { user: bob, last_read: 3000, last_delivered_at: 3000 },
      ]);

      tracker.reconcileFromReadStore({
        previousReadState,
        nextReadState,
        meta: {
          changedUserIds: [bob.id, carol.id],
          removedUserIds: [alice.id],
        },
      });

      expect(tracker.getUserProgress(alice.id)).toBeNull();
      expect(tracker.getUserProgress(bob.id)?.lastReadRef).toEqual(ref(4000));
      expect(tracker.getUserProgress(carol.id)?.lastReadRef).toEqual(ref(2000));
    });

    it('accepts a read state whose last_read is the epoch', () => {
      // `0` is the epoch sentinel; a truthiness check would reject the state as invalid.
      const newcomer = U('newcomer');

      tracker.reconcileFromReadStore({
        previousReadState: {},
        nextReadState: {
          [newcomer.id]: {
            last_read: 0,
            unread_messages: 3,
            user: newcomer,
          },
        },
        meta: { changedUserIds: [newcomer.id], removedUserIds: [] },
      });

      // MIN_REF is correct — nothing at or below the epoch has been read.
      const progress = tracker.getUserProgress(newcomer.id);
      expect(progress).not.toBeNull();
      expect(progress?.user).toStrictEqual(newcomer);
      expect(progress?.lastReadRef.timestamp).toBe(Number.NEGATIVE_INFINITY);
    });

    it('ignores non-bootstrap reconcile when metadata is absent', () => {
      const user = U('missing-meta-user');

      tracker.reconcileFromReadStore({
        previousReadState: {},
        nextReadState: {
          [user.id]: {
            last_read: 3000,
            unread_messages: 0,
            user,
            last_read_message_id: 'm3',
            last_delivered_at: 3000,
            last_delivered_message_id: 'm3',
          },
        },
      });

      expect(tracker.getUserProgress(user.id)).toBeNull();
      expect(tracker.snapshotStore.getLatestValue().revision).toBe(0);
    });

    it('applies only metadata-declared user deltas', () => {
      const user = U('meta-user');
      tracker.ingestInitial([
        {
          user,
          last_read: 2000,
          last_delivered_at: 2000,
          last_read_message_id: 'm2',
          last_delivered_message_id: 'm2',
        },
      ]);
      expect(tracker.snapshotStore.getLatestValue().revision).toBe(1);

      tracker.reconcileFromReadStore({
        previousReadState: {
          [user.id]: {
            last_read: 2000,
            unread_messages: 0,
            user,
            last_read_message_id: 'm2',
            last_delivered_at: 2000,
            last_delivered_message_id: 'm2',
          },
        },
        nextReadState: {
          [user.id]: {
            last_read: 4000,
            unread_messages: 0,
            user,
            last_read_message_id: 'm4',
            last_delivered_at: 4000,
            last_delivered_message_id: 'm4',
          },
        },
        meta: { changedUserIds: [] },
      });

      // Metadata drives reconciliation; undeclared users are ignored.
      expect(tracker.getUserProgress(user.id)?.lastReadRef).toEqual(ref(2000));
      expect(tracker.snapshotStore.getLatestValue().revision).toBe(1);
    });
  });
  describe('read-store reconcile guards', () => {
    // A non-finite `last_read` used to reach `locateMessage`, whose lower-bound search finds no
    // index satisfying `t > NaN` and so resolves to the NEWEST loaded message — reporting the
    // whole channel as read. The row is skipped instead.
    it.each([
      ['NaN', Number.NaN],
      ['an ISO string', '2026-09-03T00:00:00.000Z'],
    ])('ignores a read row whose last_read is %s', (_label, lastRead) => {
      // Resolves any timestamp to the newest message, so a leaked non-finite value is visible.
      const { channel, readStore } = createChannelMock({
        findMessageByTimestamp: () => ({ id: 'm4' }),
      });
      const localTracker = new MessageReceiptsTracker({ channel });
      localTracker.registerSubscriptions();
      localTracker.setPendingReadStoreReconcileMeta({ changedUserIds: ['u1'] });

      readStore.next({
        read: { u1: { user: U('u1'), last_read: lastRead, unread_messages: 0 } },
      } as never);

      expect(localTracker.getUserProgress('u1')).toBeNull();
      expect(ids(localTracker.readersForMessage(ref(4000)))).toEqual([]);
    });

    it('still accepts the epoch, which means "nothing read"', () => {
      const { channel, readStore } = createChannelMock();
      const localTracker = new MessageReceiptsTracker({ channel });
      localTracker.registerSubscriptions();
      localTracker.setPendingReadStoreReconcileMeta({ changedUserIds: ['u1'] });

      readStore.next({
        read: { u1: { user: U('u1'), last_read: 0, unread_messages: 0 } },
      } as never);

      // Tracked, but ahead of nothing — the epoch resolves below every message.
      expect(localTracker.getUserProgress('u1')).not.toBeNull();
      expect(ids(localTracker.readersForMessage(ref(1000)))).toEqual([]);
    });
  });
});
