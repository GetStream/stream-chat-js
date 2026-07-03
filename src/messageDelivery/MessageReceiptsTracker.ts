import type { ReadResponse, UserResponse } from '../types';
import { StateStore } from '../store';
import type { Channel } from '../channel';
import { WithSubscriptions } from '../utils/WithSubscriptions';

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
export type MessageReceiptsSnapshot = {
  revision: number;
  readersByMessageId: Record<MessageId, UserResponse[]>;
  deliveredByMessageId: Record<MessageId, UserResponse[]>;
};
export type ReadStoreReconcileMeta = {
  changedUserIds?: string[];
  removedUserIds?: string[];
};
type ReadStoreUserState = {
  last_read?: Date | string;
  unread_messages?: number;
  user?: UserResponse;
  first_unread_message_id?: string;
  last_read_message_id?: string;
  last_delivered_at?: Date | string;
  last_delivered_message_id?: string;
};

// ---------- ordering utilities ----------

const MIN_REF: MsgRef = { timestampMs: Number.NEGATIVE_INFINITY, msgId: '' } as const;

const toTimestampMs = (value: Date | string) =>
  value instanceof Date ? value.getTime() : new Date(value).getTime();

const isValidReadState = (
  readState: ReadStoreUserState | undefined,
): readState is ReadStoreUserState & {
  last_read: Date | string;
  user: UserResponse;
} => !!readState?.user && !!readState.last_read;

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
  channel: Channel;
  locateMessage?: OwnMessageReceiptsTrackerMessageLocator;
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
 * `new MessageReceiptsTracker({ channel, locateMessage? })`
 * - By default, message references are read through `channel.state.findMessageByTimestamp`.
 * - `locateMessage` can override this lookup strategy.
 *   If a message cannot be resolved locally, the event is ignored.
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
export class MessageReceiptsTracker extends WithSubscriptions {
  private byUser = new Map<UserId, UserProgress>();
  private readSorted: UserProgress[] = []; // asc by lastReadRef
  private deliveredSorted: UserProgress[] = []; // asc by lastDeliveredRef
  private channel: Channel;
  private locateMessage: OwnMessageReceiptsTrackerMessageLocator;
  private pendingReadStoreReconcileMeta?: ReadStoreReconcileMeta;
  readonly snapshotStore = new StateStore<MessageReceiptsSnapshot>({
    revision: 0,
    readersByMessageId: {},
    deliveredByMessageId: {},
  });

  constructor({ channel, locateMessage }: OwnMessageReceiptsTrackerOptions) {
    super();
    this.channel = channel;
    this.locateMessage =
      locateMessage ??
      ((timestampMs: number) => {
        const message = this.channel.state.findMessageByTimestamp(timestampMs);
        return message ? { timestampMs, msgId: message.id } : null;
      });
  }

  public registerSubscriptions = () => {
    this.incrementRefCount();
    if (this.hasSubscriptions) return;

    this.addUnsubscribeFunction(
      this.channel.state.readStore.subscribe((next, prev) => {
        this.reconcileFromReadStore({
          previousReadState: prev?.read,
          nextReadState: next.read,
          meta: this.pendingReadStoreReconcileMeta,
        });
        this.pendingReadStoreReconcileMeta = undefined;
      }),
    );
  };

  public unregisterSubscriptions = () => {
    this.pendingReadStoreReconcileMeta = undefined;
    return super.unregisterSubscriptions();
  };

  public setPendingReadStoreReconcileMeta(meta?: ReadStoreReconcileMeta) {
    this.pendingReadStoreReconcileMeta = meta;
  }

  reconcileFromReadStore({
    previousReadState,
    nextReadState,
    meta,
  }: {
    previousReadState?: Record<string, { user: UserResponse }>;
    nextReadState: Record<string, ReadStoreUserState>;
    meta?: ReadStoreReconcileMeta;
  }) {
    if (!previousReadState) {
      this.ingestInitial(this.readStoreStateToResponses(nextReadState));
      return;
    }

    // For non-bootstrap updates, we require patch metadata from channel read-store mutations.
    if (!meta) return;

    const removedUserIds = new Set(meta?.removedUserIds ?? []);
    const changedUserIds = new Set(meta?.changedUserIds ?? []);

    const changedOrRemovedUserIds = new Set<string>([
      ...changedUserIds,
      ...removedUserIds,
    ]);

    if (!changedOrRemovedUserIds.size) return;

    let hasEffectiveChange = false;

    for (const userId of changedOrRemovedUserIds) {
      if (removedUserIds.has(userId) || !nextReadState[userId]) {
        hasEffectiveChange = this.removeUserProgress(userId) || hasEffectiveChange;
        continue;
      }

      const nextUserReadState = nextReadState[userId];
      if (!isValidReadState(nextUserReadState)) continue;
      const resolvedProgress = this.readStateToUserProgress(nextUserReadState);
      hasEffectiveChange =
        this.upsertUserProgress(resolvedProgress) || hasEffectiveChange;
    }

    if (hasEffectiveChange) {
      this.emitSnapshot();
    }
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

    this.emitSnapshot();
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
    this.emitSnapshot();
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

    this.emitSnapshot();
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

    this.emitSnapshot();
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

  private removeUserProgress(userId: string) {
    const userProgress = this.byUser.get(userId);
    if (!userProgress) return false;

    removeByOldKey(
      this.readSorted,
      userProgress,
      userProgress.lastReadRef,
      (x) => x.lastReadRef,
    );
    removeByOldKey(
      this.deliveredSorted,
      userProgress,
      userProgress.lastDeliveredRef,
      (x) => x.lastDeliveredRef,
    );
    this.byUser.delete(userId);

    return true;
  }

  private upsertUserProgress(nextUserProgress: UserProgress) {
    const existingUserProgress = this.byUser.get(nextUserProgress.user.id);
    if (!existingUserProgress) {
      this.byUser.set(nextUserProgress.user.id, nextUserProgress);
      insertByKey(this.readSorted, nextUserProgress, (x) => x.lastReadRef);
      insertByKey(this.deliveredSorted, nextUserProgress, (x) => x.lastDeliveredRef);
      return true;
    }

    const hasSameReadRef =
      compareRefsAsc(existingUserProgress.lastReadRef, nextUserProgress.lastReadRef) ===
        0 &&
      existingUserProgress.lastReadRef.msgId === nextUserProgress.lastReadRef.msgId;
    const hasSameDeliveredRef =
      compareRefsAsc(
        existingUserProgress.lastDeliveredRef,
        nextUserProgress.lastDeliveredRef,
      ) === 0 &&
      existingUserProgress.lastDeliveredRef.msgId ===
        nextUserProgress.lastDeliveredRef.msgId;
    const hasSameUser = existingUserProgress.user.id === nextUserProgress.user.id;

    if (hasSameReadRef && hasSameDeliveredRef && hasSameUser) {
      return false;
    }

    removeByOldKey(
      this.readSorted,
      existingUserProgress,
      existingUserProgress.lastReadRef,
      (x) => x.lastReadRef,
    );
    removeByOldKey(
      this.deliveredSorted,
      existingUserProgress,
      existingUserProgress.lastDeliveredRef,
      (x) => x.lastDeliveredRef,
    );

    existingUserProgress.user = nextUserProgress.user;
    existingUserProgress.lastReadRef = nextUserProgress.lastReadRef;
    existingUserProgress.lastDeliveredRef = nextUserProgress.lastDeliveredRef;

    insertByKey(this.readSorted, existingUserProgress, (x) => x.lastReadRef);
    insertByKey(this.deliveredSorted, existingUserProgress, (x) => x.lastDeliveredRef);

    return true;
  }

  private readStateToUserProgress(readState: {
    last_read: Date | string;
    unread_messages?: number;
    user: UserResponse;
    first_unread_message_id?: string;
    last_read_message_id?: string;
    last_delivered_at?: Date | string;
    last_delivered_message_id?: string;
  }): UserProgress {
    const lastReadTimestamp = toTimestampMs(readState.last_read);
    const lastDeliveredTimestamp = readState.last_delivered_at
      ? toTimestampMs(readState.last_delivered_at)
      : null;
    const lastReadRef = readState.last_read_message_id
      ? { timestampMs: lastReadTimestamp, msgId: readState.last_read_message_id }
      : (this.locateMessage(lastReadTimestamp) ?? MIN_REF);
    let lastDeliveredRef = readState.last_delivered_message_id
      ? {
          timestampMs: lastDeliveredTimestamp ?? lastReadTimestamp,
          msgId: readState.last_delivered_message_id,
        }
      : lastDeliveredTimestamp
        ? (this.locateMessage(lastDeliveredTimestamp) ?? MIN_REF)
        : MIN_REF;

    if (compareRefsAsc(lastDeliveredRef, lastReadRef) < 0) {
      lastDeliveredRef = lastReadRef;
    }

    return {
      user: readState.user,
      lastReadRef,
      lastDeliveredRef,
    };
  }

  private readStoreStateToResponses(
    readState: Record<string, ReadStoreUserState>,
  ): ReadResponse[] {
    return Object.values(readState).reduce<ReadResponse[]>((responses, userReadState) => {
      if (!isValidReadState(userReadState)) return responses;
      const lastReadDate = new Date(userReadState.last_read);
      if (Number.isNaN(lastReadDate.getTime())) return responses;
      const lastReadIso = lastReadDate.toISOString();

      responses.push({
        last_read: lastReadIso,
        user: userReadState.user,
        last_read_message_id: userReadState.last_read_message_id,
        unread_messages: userReadState.unread_messages ?? 0,
        last_delivered_at: userReadState.last_delivered_at
          ? new Date(userReadState.last_delivered_at).toISOString()
          : undefined,
        last_delivered_message_id: userReadState.last_delivered_message_id,
      });

      return responses;
    }, []);
  }

  private emitSnapshot() {
    const readersByMessageId = this.groupUsersByLastReadMessage();
    const deliveredByMessageId = this.groupUsersByLastDeliveredMessage();
    const currentSnapshot = this.snapshotStore.getLatestValue();

    this.snapshotStore.next({
      revision: currentSnapshot.revision + 1,
      readersByMessageId,
      deliveredByMessageId,
    });
  }
}
