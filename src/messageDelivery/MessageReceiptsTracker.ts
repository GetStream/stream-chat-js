import type { ReadStateResponse, TimestampNS, UserResponse } from '../types';
import { StateStore } from '@stream-io/state-store';
import type { Channel } from '../channel';
import { asTimestampNS } from '../utils/time';
import { WithSubscriptions } from '../utils/WithSubscriptions';

type UserId = string;
type MessageId = string;
export type MsgRef = { timestamp: TimestampNS; msgId: MessageId };
export type OwnMessageReceiptsTrackerMessageLocator = (
  timestamp: TimestampNS,
) => MsgRef | null;
export type UserProgress = {
  user: UserResponse;
  lastReadRef: MsgRef; // MIN_REF if none
  lastDeliveredRef: MsgRef; // MIN_REF if none; always >= readRef
};
export type MessageReceiptsSnapshot = {
  revision: number;
  /**
   * Users whose read cursor sits on each message: one entry per user, not everyone who has read it.
   * For "who has read X" use {@link MessageReceiptsTracker.readersForMessage}.
   */
  readersByMessageId: Record<MessageId, UserResponse[]>;
  /** As {@link readersByMessageId}, for delivery. */
  deliveredByMessageId: Record<MessageId, UserResponse[]>;
  /** Furthest delivered ref of any other member, or `null`. A message at or before it is delivered. */
  lastDeliveredRefByOthers: MsgRef | null;
  /** As {@link lastDeliveredRefByOthers}, for reads. */
  lastReadRefByOthers: MsgRef | null;
};
export type ReadStoreReconcileMeta = {
  changedUserIds?: string[];
  removedUserIds?: string[];
};
type ReadStoreUserState = {
  last_read?: TimestampNS;
  unread_messages?: number;
  user?: UserResponse;
  first_unread_message_id?: string;
  last_read_message_id?: string;
  last_delivered_at?: TimestampNS;
  last_delivered_message_id?: string;
};

const MIN_REF: MsgRef = {
  timestamp: asTimestampNS(Number.NEGATIVE_INFINITY),
  msgId: '',
} as const;

const isValidReadState = (
  readState: ReadStoreUserState | undefined,
): readState is ReadStoreUserState & {
  last_read: TimestampNS;
  user: UserResponse;
} => !!readState?.user && Number.isFinite(readState.last_read);

const compareRefsAsc = (a: MsgRef, b: MsgRef) =>
  a.timestamp !== b.timestamp ? a.timestamp - b.timestamp : 0;

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

/** Insertion index after the last equal item, so ties keep arrival order. */
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
  // Find the plateau for oldKey, scan to match by user ID
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
 * Tracks other participants' delivery and read progress toward own messages in one timeline
 * (channel or thread). Per user it keeps `lastReadRef` and `lastDeliveredRef` (always
 * `>= lastReadRef`) in two arrays sorted by timestamp, so "who read message M?" is a binary search
 * plus a suffix slice.
 *
 * Messages resolve through `channel.messagePaginator.findItemByTimestamp` unless `locateMessage` is
 * passed. Events for messages that cannot be resolved are ignored.
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
    lastDeliveredRefByOthers: null,
    lastReadRefByOthers: null,
  });

  constructor({ channel, locateMessage }: OwnMessageReceiptsTrackerOptions) {
    super();
    this.channel = channel;
    this.locateMessage =
      locateMessage ??
      ((timestamp: TimestampNS) => {
        const message = this.channel.messagePaginator.findItemByTimestamp(timestamp);
        return message ? { timestamp, msgId: message.id } : null;
      });
  }

  public registerSubscriptions = () => {
    this.incrementRefCount();
    if (this.hasSubscriptions) return;

    this.addUnsubscribeFunction(
      // Only the `read` slice, to skip unrelated channel-state writes.
      this.channel.state.subscribeWithSelector(
        (currentState) => ({ read: currentState.read }),
        (next, prev) => {
          this.reconcileFromReadStore({
            previousReadState: prev?.read,
            nextReadState: next.read,
            meta: this.pendingReadStoreReconcileMeta,
          });
          this.pendingReadStoreReconcileMeta = undefined;
        },
      ),
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

    // After the initial bootstrap, only updates that carry patch metadata are applied.
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

  /** Replaces the tracker's state with the given server read states. */
  ingestInitial(responses: ReadStateResponse[]) {
    this.byUser.clear();
    this.readSorted = [];
    this.deliveredSorted = [];
    for (const r of responses) {
      const lastReadTimestamp = r.last_read ?? null;
      const lastDeliveredTimestamp = r.last_delivered_at ?? null;
      const lastReadRef =
        lastReadTimestamp != null
          ? (this.locateMessage(lastReadTimestamp) ?? MIN_REF)
          : MIN_REF;
      let lastDeliveredRef =
        lastDeliveredTimestamp != null
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

  /** `message.delivered`: delivery confirmed up to and including the message. */
  onMessageDelivered({
    user,
    deliveredAt,
    lastDeliveredMessageId,
  }: {
    user: UserResponse;
    /** Unix nanoseconds, as the API sends it. */
    deliveredAt: TimestampNS;
    lastDeliveredMessageId?: string;
  }) {
    const timestamp = deliveredAt;
    const msgRef = lastDeliveredMessageId
      ? { timestamp, msgId: lastDeliveredMessageId }
      : this.locateMessage(deliveredAt);
    if (!msgRef) return;
    const userProgress = this.ensureUser(user);

    const newDelivered =
      compareRefsAsc(msgRef, userProgress.lastReadRef) < 0
        ? userProgress.lastReadRef
        : msgRef; // max(read, loc)
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

  /** `message.read`: read up to and including the message. */
  onMessageRead({
    user,
    readAt,
    lastReadMessageId,
  }: {
    user: UserResponse;
    /** Unix nanoseconds, as the API sends it. */
    readAt: TimestampNS;
    lastReadMessageId?: string;
  }) {
    const timestamp = readAt;
    const msgRef = lastReadMessageId
      ? { timestamp, msgId: lastReadMessageId }
      : this.locateMessage(timestamp);
    if (!msgRef) return;
    const userProgress = this.ensureUser(user);
    if (compareRefsAsc(msgRef, userProgress.lastReadRef) <= 0) return;

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

  /** `notification.mark_unread`: sets `lastReadRef` from `last_read_*`; delivery never moves back. */
  onNotificationMarkUnread({
    user,
    lastReadAt,
    lastReadMessageId,
  }: {
    user: UserResponse;
    /** Unix nanoseconds, as the API sends it. */
    lastReadAt?: TimestampNS;
    lastReadMessageId?: string;
  }) {
    const userProgress = this.ensureUser(user);

    // A missing or non-finite `lastReadAt` means "never read".
    const newReadRef: MsgRef =
      lastReadAt != null && Number.isFinite(lastReadAt)
        ? { timestamp: lastReadAt, msgId: lastReadMessageId ?? '' }
        : { ...MIN_REF };

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

  /**
   * Whether any other member has this message delivered. Uses the furthest cursor, so it is monotonic
   * across messages.
   */
  isDeliveredToOthers(msgRef: MsgRef): boolean {
    const ref = this.snapshotStore.getLatestValue().lastDeliveredRefByOthers;
    return !!ref && compareRefsAsc(msgRef, ref) <= 0;
  }

  /** As {@link isDeliveredToOthers}, for reads. */
  isReadByOthers(msgRef: MsgRef): boolean {
    const ref = this.snapshotStore.getLatestValue().lastReadRefByOthers;
    return !!ref && compareRefsAsc(msgRef, ref) <= 0;
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
    // by reference: an updated user (a new name or image) arrives as a new object with the same ID
    const hasSameUser = existingUserProgress.user === nextUserProgress.user;

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
    last_read: TimestampNS;
    unread_messages?: number;
    user: UserResponse;
    first_unread_message_id?: string;
    last_read_message_id?: string;
    last_delivered_at?: TimestampNS;
    last_delivered_message_id?: string;
  }): UserProgress {
    const lastReadTimestamp = readState.last_read;
    const lastDeliveredTimestamp = readState.last_delivered_at ?? null;
    const lastReadRef = readState.last_read_message_id
      ? { timestamp: lastReadTimestamp, msgId: readState.last_read_message_id }
      : (this.locateMessage(lastReadTimestamp) ?? MIN_REF);
    let lastDeliveredRef = readState.last_delivered_message_id
      ? {
          timestamp: lastDeliveredTimestamp ?? lastReadTimestamp,
          msgId: readState.last_delivered_message_id,
        }
      : lastDeliveredTimestamp != null && Number.isFinite(lastDeliveredTimestamp)
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
  ): ReadStateResponse[] {
    return Object.values(readState).reduce<ReadStateResponse[]>(
      (responses, userReadState) => {
        if (!isValidReadState(userReadState)) return responses;

        responses.push({
          last_read: userReadState.last_read,
          user: userReadState.user,
          last_read_message_id: userReadState.last_read_message_id,
          unread_messages: userReadState.unread_messages ?? 0,
          last_delivered_at: userReadState.last_delivered_at,
          last_delivered_message_id: userReadState.last_delivered_message_id,
        });

        return responses;
      },
      [],
    );
  }

  /**
   * The furthest ref in an ascending-by-cursor array, ignoring this user's own progress - your own
   * cursor says nothing about whether anyone received the message.
   */
  private furthestRefByOthers(
    sorted: UserProgress[],
    refOf: (progress: UserProgress) => MsgRef,
  ): MsgRef | null {
    const ownUserId = this.channel.getClient().userId;

    for (let i = sorted.length - 1; i >= 0; i -= 1) {
      if (sorted[i].user.id === ownUserId) continue;
      const ref = refOf(sorted[i]);
      return Number.isFinite(ref.timestamp) ? ref : null;
    }

    return null;
  }

  private emitSnapshot() {
    const readersByMessageId = this.groupUsersByLastReadMessage();
    const deliveredByMessageId = this.groupUsersByLastDeliveredMessage();
    const currentSnapshot = this.snapshotStore.getLatestValue();

    this.snapshotStore.next({
      revision: currentSnapshot.revision + 1,
      readersByMessageId,
      deliveredByMessageId,
      lastDeliveredRefByOthers: this.furthestRefByOthers(
        this.deliveredSorted,
        ({ lastDeliveredRef }) => lastDeliveredRef,
      ),
      lastReadRefByOthers: this.furthestRefByOthers(
        this.readSorted,
        ({ lastReadRef }) => lastReadRef,
      ),
    });
  }
}
