import type { ReadResponse, UserResponse } from '../types';

type UserId = string;
type MessageId = string;
export type MsgRef = { timestampMs: number; msgId: MessageId };
export type OwnMessageReceiptsTrackerMessageLocator = (
  timestampMs: number,
) => MsgRef | null;
export type UserProgress = {
  user: UserResponse;
  lastReadRef: MsgRef; // MIN_REF if none
  lastDeliveredRef: MsgRef; // MIN_REF if none; always >= readRef
};

// ---------- ordering utilities ----------

const MIN_REF: MsgRef = { timestampMs: Number.NEGATIVE_INFINITY, msgId: '' } as const;

const compareRefsAsc = (a: MsgRef, b: MsgRef) =>
  a.timestampMs !== b.timestampMs ? a.timestampMs - b.timestampMs : 0;

const findIndex = <T>(arr: T[], target: MsgRef, keyOf: (x: T) => MsgRef): number => {
  let lo = 0,
    hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (compareRefsAsc(keyOf(arr[mid]), target) >= 0) hi = mid;
    else lo = mid + 1;
  }
  return lo;
};

/**
 * For insertion after the last equal item. E.g. array [a] exists and b is being inserted -> we want [a,b], not [b,a].
 * @param arr
 * @param target
 * @param keyOf
 */
const findUpperIndex = <T>(arr: T[], target: MsgRef, keyOf: (x: T) => MsgRef): number => {
  let lo = 0,
    hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (compareRefsAsc(keyOf(arr[mid]), target) > 0) hi = mid;
    else lo = mid + 1;
  }
  return lo;
};

const insertByKey = (
  arr: UserProgress[],
  item: UserProgress,
  keyOf: (x: UserProgress) => MsgRef,
) => arr.splice(findUpperIndex(arr, keyOf(item), keyOf), 0, item);

const removeByOldKey = (
  arr: UserProgress[],
  item: UserProgress,
  oldKey: MsgRef,
  keyOf: (x: UserProgress) => MsgRef,
) => {
  // Find the plateau for oldKey, scan to match by user id
  let i = findIndex(arr, oldKey, keyOf);
  while (i < arr.length && compareRefsAsc(keyOf(arr[i]), oldKey) === 0) {
    if (arr[i].user.id === item.user.id) {
      arr.splice(i, 1);
      return;
    }
    i++;
  }
};

export type OwnMessageReceiptsTrackerOptions = {
  locateMessage: OwnMessageReceiptsTrackerMessageLocator;
};

/**
 * MessageReceiptsTracker
 * --------------------------------
 * Tracks **other participants’** delivery/read progress toward **own (outgoing) messages**
 * within a **single timeline** (one channel/thread).
 *
 * How it works
 * ------------
 * - Each user has a compact progress record:
 *     - `lastReadRef`: latest message they have **read**
 *     - `lastDeliveredRef`: latest message they have **received** (always `>= lastReadRef`)
 * - Internally keeps two arrays sorted **ascending by timestamp**:
 *     - `readSorted` (by `lastReadRef`)
 *     - `deliveredSorted` (by `lastDeliveredRef`)
 * - Queries like “who read message M?” become a **binary search + suffix slice**.
 *
 * Construction
 * ------------
 * `new MessageReceiptsTracker({locateMessage})`
 * - `locateMessage(timestamp) => MsgRef | null` must resolve a message ref representation - `{ timestamp, msgId }`.
 *   - If `locateMessage` returns `null`, the event is ignored (message unknown locally).
 *
 * Event ingestion
 * ---------------
 * - `ingestInitial(rows: ReadResponse[])`: Builds initial state from server snapshot.
 *   If a user’s `last_read` is ahead of `last_delivered_at`, the tracker enforces
 *   the invariant `lastDeliveredRef >= lastReadRef`.
 * - `onMessageRead(user, readAtISO)`:
 *   Advances the user’s read; also bumps delivered to match if needed.
 * - `onMessageDelivered(user, deliveredAtISO)`:
 *   Advances the user’s delivered to `max(currentRead, deliveredAt)`.
 *
 * Queries
 * -------
 * - `readersForMessage(msgRef)         : UserResponse[]` → users with `lastReadRef >= msgRef`
 * - `deliveredForMessage(msgRef)       : UserResponse[]` → users with `lastDeliveredRef >= msgRef`
 * - `deliveredNotReadForMessage(msgRef): UserResponse[]` → delivered but `lastReadRef < msgRef`
 * - `usersWhoseLastReadIs              : UserResponse[]` →  users for whom `msgRef` is their *last read* (exact match)
 * - `usersWhoseLastDeliveredIs         : UserResponse[]` →  users for whom `msgRef` is their *last delivered* (exact match)
 * - `groupUsersByLastReadMessage       : Record<MsgId, UserResponse[]> → mapping of messages to their readers
 * - `groupUsersByLastDeliveredMessage  : Record<MsgId, UserResponse[]> → mapping of messages to their receivers
 * - `hasUserRead(msgRef, userId)       : boolean`
 * - `hasUserDelivered(msgRef, userId)  : boolean`
 *
 * Complexity
 * ----------
 * - Update on read/delivered: **O(log U)** (binary search + one splice) per event, where U is count of users stored by tracker.
 * - Query lists: **O(log U + K)** where `K` is the number of returned users (suffix length).
 * - Memory: **O(U)** - tracker’s memory grows linearly with the number of users in the channel/thread and does not depend on the number of messages.
 *
 * Scope & notes
 * -------------
 * - One tracker instance is **scoped to a single timeline**. Instantiate per channel/thread.
 * - Ordering is by **ascending timestamp**; ties are kept stable by inserting at the end of the
 *   equal-timestamp plateau (upper-bound insertion), preserving intuitive arrival order.
 * - This tracker models **others’ progress toward own messages**;
 */
export class MessageReceiptsTracker {
  private byUser = new Map<UserId, UserProgress>();
  private readSorted: UserProgress[] = []; // asc by lastReadRef
  private deliveredSorted: UserProgress[] = []; // asc by lastDeliveredRef
  private locateMessage: OwnMessageReceiptsTrackerMessageLocator;

  constructor({ locateMessage }: OwnMessageReceiptsTrackerOptions) {
    this.locateMessage = locateMessage;
  }

  /** Build initial state from server snapshots (single pass + sort). */
  ingestInitial(responses: ReadResponse[]) {
    this.byUser.clear();
    this.readSorted = [];
    this.deliveredSorted = [];
    for (const r of responses) {
      const lastReadTimestamp = r.last_read ? new Date(r.last_read).getTime() : null;
      const lastDeliveredTimestamp = r.last_delivered_at
        ? new Date(r.last_delivered_at).getTime()
        : null;
      const lastReadRef = lastReadTimestamp
        ? (this.locateMessage(lastReadTimestamp) ?? MIN_REF)
        : MIN_REF;
      let lastDeliveredRef = lastDeliveredTimestamp
        ? (this.locateMessage(lastDeliveredTimestamp) ?? MIN_REF)
        : MIN_REF;
      const isReadAfterDelivered = compareRefsAsc(lastDeliveredRef, lastReadRef) < 0;
      if (isReadAfterDelivered) lastDeliveredRef = lastReadRef;

      const userProgress: UserProgress = { user: r.user, lastReadRef, lastDeliveredRef };
      this.byUser.set(r.user.id, userProgress);
      this.readSorted.splice(
        findIndex(this.readSorted, lastReadRef, (up) => up.lastReadRef),
        0,
        userProgress,
      );
      this.deliveredSorted.splice(
        findIndex(this.deliveredSorted, lastDeliveredRef, (up) => up.lastDeliveredRef),
        0,
        userProgress,
      );
    }
  }

  /** message.delivered — user device confirmed delivery up to and including messageId. */
  onMessageDelivered({
    user,
    deliveredAt,
    lastDeliveredMessageId,
  }: {
    user: UserResponse;
    deliveredAt: string;
    lastDeliveredMessageId?: string;
  }) {
    const timestampMs = new Date(deliveredAt).getTime();
    const msgRef = lastDeliveredMessageId
      ? { timestampMs, msgId: lastDeliveredMessageId }
      : this.locateMessage(new Date(deliveredAt).getTime());
    if (!msgRef) return;
    const userProgress = this.ensureUser(user);

    const newDelivered =
      compareRefsAsc(msgRef, userProgress.lastReadRef) < 0
        ? userProgress.lastReadRef
        : msgRef; // max(read, loc)
    // newly announced delivered is older than or equal what is already registered
    if (compareRefsAsc(newDelivered, userProgress.lastDeliveredRef) <= 0) return;

    removeByOldKey(
      this.deliveredSorted,
      userProgress,
      userProgress.lastDeliveredRef,
      (x) => x.lastDeliveredRef,
    );
    userProgress.lastDeliveredRef = newDelivered;
    insertByKey(this.deliveredSorted, userProgress, (x) => x.lastDeliveredRef);
  }

  /** message.read — user read up to and including messageId. */
  onMessageRead({
    user,
    readAt,
    lastReadMessageId,
  }: {
    user: UserResponse;
    readAt: string;
    lastReadMessageId?: string;
  }) {
    const timestampMs = new Date(readAt).getTime();
    const msgRef = lastReadMessageId
      ? { timestampMs, msgId: lastReadMessageId }
      : this.locateMessage(timestampMs);
    if (!msgRef) return;
    const userProgress = this.ensureUser(user);
    // newly announced read message is older than or equal the already recorded last read message
    if (compareRefsAsc(msgRef, userProgress.lastReadRef) <= 0) return;

    // move in readSorted
    removeByOldKey(
      this.readSorted,
      userProgress,
      userProgress.lastReadRef,
      (x) => x.lastReadRef,
    );
    userProgress.lastReadRef = msgRef;
    insertByKey(this.readSorted, userProgress, (x) => x.lastReadRef);

    // keep delivered >= read
    if (compareRefsAsc(userProgress.lastDeliveredRef, userProgress.lastReadRef) < 0) {
      removeByOldKey(
        this.deliveredSorted,
        userProgress,
        userProgress.lastDeliveredRef,
        (x) => x.lastDeliveredRef,
      );
      userProgress.lastDeliveredRef = userProgress.lastReadRef;
      insertByKey(this.deliveredSorted, userProgress, (x) => x.lastDeliveredRef);
    }
  }

  /** notification.mark_unread — user marked messages unread starting at `first_unread_message_id`.
   * Sets lastReadRef to the event’s last_read_* values. Delivery never moves backward.
   * The event is sent only to the user that triggered the action (own user), so we will never adjust read ref
   * for other users - we will not see changes in the UI for other users. However, this implementation does not
   * take into consideration this fact and is ready to handle the mark-unread event for any user.
   */
  onNotificationMarkUnread({
    user,
    lastReadAt,
    lastReadMessageId,
  }: {
    user: UserResponse;
    lastReadAt?: string;
    lastReadMessageId?: string;
  }) {
    const userProgress = this.ensureUser(user);

    const newReadRef: MsgRef = lastReadAt
      ? { timestampMs: new Date(lastReadAt).getTime(), msgId: lastReadMessageId ?? '' }
      : { ...MIN_REF };

    // If no change, exit early.
    if (
      compareRefsAsc(newReadRef, userProgress.lastReadRef) === 0 &&
      newReadRef.msgId === userProgress.lastReadRef.msgId
    ) {
      return;
    }

    removeByOldKey(
      this.readSorted,
      userProgress,
      userProgress.lastReadRef,
      (x) => x.lastReadRef,
    );
    userProgress.lastReadRef = newReadRef;
    insertByKey(this.readSorted, userProgress, (x) => x.lastReadRef);

    // Maintain invariant delivered >= read.
    if (compareRefsAsc(userProgress.lastDeliveredRef, userProgress.lastReadRef) < 0) {
      removeByOldKey(
        this.deliveredSorted,
        userProgress,
        userProgress.lastDeliveredRef,
        (x) => x.lastDeliveredRef,
      );
      userProgress.lastDeliveredRef = userProgress.lastReadRef;
      insertByKey(this.deliveredSorted, userProgress, (x) => x.lastDeliveredRef);
    }
  }

  /** All users who READ this message. */
  readersForMessage(msgRef: MsgRef): UserResponse[] {
    const index = findIndex(this.readSorted, msgRef, ({ lastReadRef }) => lastReadRef);
    return this.readSorted.slice(index).map((x) => x.user);
  }

  /** All users who have it DELIVERED (includes readers). */
  deliveredForMessage(msgRef: MsgRef): UserResponse[] {
    const pos = findIndex(
      this.deliveredSorted,
      msgRef,
      ({ lastDeliveredRef }) => lastDeliveredRef,
    );
    return this.deliveredSorted.slice(pos).map((x) => x.user);
  }

  /** Users who delivered but have NOT read. */
  deliveredNotReadForMessage(msgRef: MsgRef): UserResponse[] {
    const pos = findIndex(
      this.deliveredSorted,
      msgRef,
      ({ lastDeliveredRef }) => lastDeliveredRef,
    );
    const usersDeliveredNotRead: UserResponse[] = [];
    for (let i = pos; i < this.deliveredSorted.length; i++) {
      const userProgress = this.deliveredSorted[i];
      if (compareRefsAsc(userProgress.lastReadRef, msgRef) < 0)
        usersDeliveredNotRead.push(userProgress.user);
    }
    return usersDeliveredNotRead;
  }

  /** Users for whom `msgRef` is their *last read* (exact match). */
  usersWhoseLastReadIs(msgRef: MsgRef): UserResponse[] {
    if (!msgRef.msgId) return [];
    const start = findIndex(this.readSorted, msgRef, (x) => x.lastReadRef);
    const end = findUpperIndex(this.readSorted, msgRef, (x) => x.lastReadRef);
    const users: UserResponse[] = [];
    for (let i = start; i < end; i++) {
      const up = this.readSorted[i];
      if (up.lastReadRef.msgId === msgRef.msgId) users.push(up.user);
    }
    return users;
  }

  /** Users for whom `msgRef` is their *last delivered* (exact match). */
  usersWhoseLastDeliveredIs(msgRef: MsgRef): UserResponse[] {
    if (!msgRef.msgId) return [];
    const start = findIndex(this.deliveredSorted, msgRef, (x) => x.lastDeliveredRef);
    const end = findUpperIndex(this.deliveredSorted, msgRef, (x) => x.lastDeliveredRef);
    const users: UserResponse[] = [];
    for (let i = start; i < end; i++) {
      const up = this.deliveredSorted[i];
      if (up.lastDeliveredRef.msgId === msgRef.msgId) users.push(up.user);
    }
    return users;
  }

  // ---- queries: per-user status ----

  hasUserRead(msgRef: MsgRef, userId: string): boolean {
    const up = this.byUser.get(userId);
    return !!up && compareRefsAsc(up.lastReadRef, msgRef) >= 0;
  }

  hasUserDelivered(msgRef: MsgRef, userId: string): boolean {
    const up = this.byUser.get(userId);
    return !!up && compareRefsAsc(up.lastDeliveredRef, msgRef) >= 0;
  }

  getUserProgress(userId: string): UserProgress | null {
    const userProgress = this.byUser.get(userId);
    if (!userProgress) return null;
    return userProgress;
  }

  groupUsersByLastReadMessage(): Record<MessageId, UserResponse[]> {
    return Array.from(this.byUser.values()).reduce<Record<MessageId, UserResponse[]>>(
      (acc, userProgress) => {
        const msgId = userProgress.lastReadRef.msgId;
        if (!msgId) return acc;
        if (!acc[msgId]) acc[msgId] = [];
        acc[msgId].push(userProgress.user);
        return acc;
      },
      {},
    );
  }

  groupUsersByLastDeliveredMessage(): Record<MessageId, UserResponse[]> {
    return Array.from(this.byUser.values()).reduce<Record<MessageId, UserResponse[]>>(
      (acc, userProgress) => {
        const msgId = userProgress.lastDeliveredRef.msgId;
        if (!msgId) return acc;
        if (!acc[msgId]) acc[msgId] = [];
        acc[msgId].push(userProgress.user);
        return acc;
      },
      {},
    );
  }

  private ensureUser(user: UserResponse): UserProgress {
    let up = this.byUser.get(user.id);
    if (!up) {
      up = { user, lastReadRef: MIN_REF, lastDeliveredRef: MIN_REF };
      this.byUser.set(user.id, up);
      insertByKey(this.readSorted, up, (x) => x.lastReadRef);
      insertByKey(this.deliveredSorted, up, (x) => x.lastDeliveredRef);
    }
    return up;
  }
}
