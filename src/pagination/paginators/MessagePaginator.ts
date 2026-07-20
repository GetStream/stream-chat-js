import type { ExecuteQueryReturnValue, PostQueryReconcileParams } from './BasePaginator';
import {
  type MessagePaginatorOptions as BaseMessagePaginatorOptions,
  type JumpToMessageOptions,
  MessageIntervalPaginator,
  type MessageQueryShape,
} from './MessageIntervalPaginator';
import type { LocalMessage } from '../../types';
import { StateStore } from '../../store';

export type {
  JumpToMessageOptions,
  MessageFocusReason,
  MessageFocusSignal,
  MessageFocusSignalState,
  MessagePaginatorFilter,
  MessagePaginatorSort,
  MessagePaginatorState,
  MessageQueryShape,
} from './MessageIntervalPaginator';
export { MessageIntervalPaginator } from './MessageIntervalPaginator';

export type MessagePaginatorOptions = BaseMessagePaginatorOptions & {
  /**
   * Controls whether `jumpToTheFirstUnreadMessage()` should prefer the `unreadStateSnapshot`
   * state over `channel.state.read[...]`.
   *
   * - 'snapshot' (default): retrieve the first unread message id from the unreadStateSnapshot state when jumping to the first unread message
   * - 'read-state-only': retrieve the last read message id from the channel read state when jumping to the first unread message
   */
  unreadReferencePolicy?: 'snapshot' | 'read-state-only';
};

export type UnreadSnapshotState = {
  lastReadAt: Date | null;
  unreadCount: number;
  /**
   * Snapshot of the first unread message id for the user.
   * This is intentionally decoupled from `channel.state.read[...]` because apps
   * may mark the channel read immediately on open, while still wanting to render
   * UI indicators that jump to the previously-unread location.
   */
  firstUnreadMessageId: string | null;
  /**
   * Snapshot of the last read message id for the user (fallback when first unread
   * is not known).
   */
  lastReadMessageId: string | null;
};

/**
 * External, UI-driven signal: `true` while the user is actively viewing the latest messages of
 * this collection (app foregrounded AND the newest message on screen). The owning SDK sets it — the
 * state layer has no viewport. When live, an incoming message is NOT counted as unread (the count /
 * snapshot bump is skipped), so the "N new" separator/banner never flash for a message the user is
 * already looking at. Defaults to `false` (assume not viewing until the SDK proves otherwise).
 */
export type LiveViewState = {
  isViewingLive: boolean;
};

/**
 * MessagePaginator extends {@link MessageIntervalPaginator} with the unread/live-view concern:
 * an independent unread reference snapshot, the UI-driven "viewing the latest messages" signal, and
 * the "jump to first unread" navigation built on top of them.
 */
export class MessagePaginator extends MessageIntervalPaginator {
  private unreadReferencePolicy: 'snapshot' | 'read-state-only';
  /**
   * Independent unread reference state (not tied to `channel.state.read`).
   * Consumers may set this right before calling markRead / when opening a channel.
   */
  readonly unreadStateSnapshot: StateStore<UnreadSnapshotState>;
  /**
   * UI-driven "viewing the latest messages" signal (see {@link LiveViewState}). Set by the SDK via
   * {@link setViewingLive}; read by the channel to gate the unread bump on `message.new`. Subscribe to
   * this store for reactivity, or read the current boolean directly via the {@link isViewingLive} getter.
   */
  readonly liveViewState: StateStore<LiveViewState>;

  constructor({
    unreadReferencePolicy = 'snapshot',
    ...options
  }: MessagePaginatorOptions) {
    super(options);
    this.unreadReferencePolicy = unreadReferencePolicy;
    this.unreadStateSnapshot = new StateStore<UnreadSnapshotState>({
      lastReadAt: null,
      firstUnreadMessageId: null,
      lastReadMessageId: null,
      unreadCount: 0,
    });
    this.liveViewState = new StateStore<LiveViewState>({
      isViewingLive: false,
    });
  }

  /**
   * (Re)seed the unread state snapshot from the current own read state.
   *
   * Called after the first-page query, and can be called again by the SDK whenever a channel is
   * (re)opened from a cached paginator — where no fresh first-page query runs — so the snapshot
   * reflects the CURRENT read boundary rather than one frozen at the very first open. Without a
   * re-seed the separator position, unread count and "jump to first unread" target all go stale
   * across reopens.
   *
   * `firstUnreadMessageId` is intentionally reset to `null`: it represents an EXPLICIT mark-unread
   * (set by `notification.mark_unread`), not a live/computed boundary. Persisting a computed value
   * here would make the channel look explicitly marked-unread and suppress auto-mark-read.
   */
  seedUnreadSnapshot = () => {
    // A paginator query (BasePaginator.executeQuery) awaits the network before running its
    // synchronous postQueryReconcile, which calls this on the first page. If the channel was
    // disconnected while that request was in flight, reading the client below throws ("You can't
    // use a channel after client.disconnect()"), so guard against that.
    if (this.channel.disconnected) return;
    const ownUserId = this.channel.getClient().user?.id;
    const ownReadState = ownUserId ? this.channel.state.read[ownUserId] : undefined;
    if (!ownReadState) return;
    this.setUnreadSnapshot({
      firstUnreadMessageId: null,
      lastReadAt: ownReadState.last_read ?? null,
      lastReadMessageId: ownReadState.last_read_message_id ?? null,
      unreadCount: ownReadState.unread_messages ?? 0,
    });
  };

  /**
   * Invokes super.postQueryReconcile() and takes an unread state snapshot on the first-page query.
   * The snapshot has to be taken immediately after the query as the viewed channel is marked read
   * immediately after opening it. The snapshot can be used to display unread UI indicators.
   */
  postQueryReconcile(
    params: PostQueryReconcileParams<LocalMessage, MessageQueryShape>,
  ): ExecuteQueryReturnValue<LocalMessage> {
    const result = super.postQueryReconcile(params);

    if (params.isFirstPage) {
      this.seedUnreadSnapshot();
    }
    return result;
  }

  /**
   * Jumps to the unread reference message.
   *
   * IMPORTANT: This intentionally does *not* rely on `channel.state.read[ownUserId]` only,
   * because apps may mark a channel read immediately after opening it, while still
   * wanting to keep "jump to unread" UI indicators alive (based on a snapshot).
   *
   * Resolution order:
   * 1) explicit first-unread id from snapshot/read-state (mark-unread) — jump straight to it
   * 2) last-read timestamp: infer the FIRST UNREAD message from it — using the already-loaded
   *    window when it straddles the boundary, otherwise a `created_at_around` query — and jump there
   * 3) last read id from snapshot/read-state (last-resort fallback when no timestamp is available)
   *
   * The timestamp inference (2) is preferred over jumping to the last-read id so that the jump lands
   * ON (and highlights) the first unread message rather than the last read one. The last-read id is
   * only used as a fallback when we cannot infer an unread boundary. The inference is NOT persisted
   * back into the snapshot (that is reserved for explicit mark-unread).
   */
  jumpToTheFirstUnreadMessage = async (options?: JumpToMessageOptions) => {
    const ownUserId = this.channel.getClient().user?.id;
    if (!ownUserId) return false;

    const unreadSnapshot =
      this.unreadReferencePolicy === 'snapshot'
        ? this.unreadStateSnapshot.getLatestValue()
        : { firstUnreadMessageId: null, lastReadAt: null, lastReadMessageId: null };
    const firstUnreadFromSnapshot = unreadSnapshot.firstUnreadMessageId;
    const lastReadAtFromSnapshot = unreadSnapshot.lastReadAt;
    const lastReadIdFromSnapshot = unreadSnapshot.lastReadMessageId;

    const ownReadState = this.channel.state.read[ownUserId];
    const firstUnreadFromReadState = ownReadState?.first_unread_message_id ?? null;
    const lastReadAtFromReadState = ownReadState?.last_read ?? null;
    const lastReadIdFromReadState = ownReadState?.last_read_message_id ?? null;

    // 1) A stable first-unread id is known (mark-unread, or a previously persisted inference):
    // jump straight to it.
    const firstUnreadMessageId = firstUnreadFromSnapshot ?? firstUnreadFromReadState;
    if (firstUnreadMessageId) {
      return await this.jumpToMessage(firstUnreadMessageId, {
        ...options,
        focusReason: 'jump-to-first-unread',
      });
    }

    const lastReadMessageId = lastReadIdFromSnapshot ?? lastReadIdFromReadState;
    // Prefer the SNAPSHOT timestamp over the fresh read-state one. The snapshot is the frozen UI
    // boundary the "N new" separator/banner render from, so a banner tap must jump to where that
    // indicator points. On (re)open the SDK marks the channel read (`markReadOnMount`) which advances
    // the read-state `last_read` to ~now and clears the server unread — so preferring read-state
    // would make a later banner tap infer "nothing unread" and jump to the latest message. The
    // snapshot is kept fresh on genuine catch-up (the SDK's mark-read resets it), so it is only
    // "frozen" precisely while there are unreads to jump to.
    const lastReadAt = lastReadAtFromSnapshot ?? lastReadAtFromReadState;

    // 2) No explicit first-unread id, but we know when the channel was last read. Infer the first
    // unread message from that timestamp so we land ON (and highlight) the first unread message
    // instead of the last read one. Prefer the already-loaded window (the common "a few unreads at
    // the bottom" case — no extra request); only query a page around last-read when the loaded
    // window does not straddle the boundary (i.e. every loaded message is newer than last-read).
    //
    // We deliberately do NOT persist the inferred boundary back into the snapshot: writing
    // `firstUnreadMessageId` would make the channel look explicitly marked-unread and suppress
    // auto-mark-read at the bottom. The separator reads the (re-seeded) snapshot directly.
    if (lastReadAt) {
      let {
        firstUnreadMessageId: inferredFirstUnreadMessageId,
        lastReadMessageId: inferredLastReadMessageId,
      } = this.resolveUnreadBoundaryIdsByTimestamp({
        lastReadAt,
        messages: this.state.getLatestValue().items ?? [],
      });

      if (!inferredLastReadMessageId) {
        const result = await this.executeQuery({
          queryShape: {
            created_at_around: lastReadAt.toISOString(),
            limit: options?.pageSize,
          },
          updateState: false,
        });
        if (result) {
          ({
            firstUnreadMessageId: inferredFirstUnreadMessageId,
            lastReadMessageId: inferredLastReadMessageId,
          } = this.resolveUnreadBoundaryIdsByTimestamp({
            lastReadAt,
            messages: result.stateCandidate.items ?? [],
          }));
        }
      }

      const targetMessageId =
        inferredFirstUnreadMessageId ?? inferredLastReadMessageId ?? lastReadMessageId;
      if (targetMessageId) {
        return await this.jumpToMessage(targetMessageId, {
          ...options,
          focusReason: 'jump-to-first-unread',
        });
      }
    }

    // 3) Last resort: jump to the known last-read message when that is all we have.
    if (lastReadMessageId) {
      return await this.jumpToMessage(lastReadMessageId, {
        ...options,
        focusReason: 'jump-to-first-unread',
      });
    }

    return false;
  };

  setUnreadSnapshot = (next: Partial<UnreadSnapshotState>): UnreadSnapshotState => {
    this.unreadStateSnapshot.partialNext(next);
    return this.unreadStateSnapshot.getLatestValue();
  };

  /**
   * Set the UI-driven "viewing the latest messages" signal (see {@link LiveViewState}). Called by
   * the SDK from its message-list viewability + app-state tracking. No-ops when unchanged.
   *
   * Intentionally NOT reset by `clearStateAndCache` — it is an external input owned by the SDK, not
   * derived pagination state.
   */
  /** Current "viewing the latest messages" boolean (convenience read of {@link liveViewState}). */
  get isViewingLive(): boolean {
    return this.liveViewState.getLatestValue().isViewingLive;
  }

  setViewingLive = (isViewingLive: boolean) => {
    if (this.isViewingLive === isViewingLive) return;
    this.liveViewState.next({ isViewingLive });
  };

  clearUnreadSnapshot = () => {
    this.unreadStateSnapshot.next({
      firstUnreadMessageId: null,
      lastReadMessageId: null,
      lastReadAt: null,
      unreadCount: 0,
    });
  };

  clearStateAndCache() {
    super.clearStateAndCache();
    this.clearUnreadSnapshot();
  }
}
