import type { Channel } from './channel';
import type {
  AIState,
  ChannelMemberResponse,
  Event,
  LocalMessage,
  MessageResponse,
  PendingMessageResponse,
  UserResponse,
} from './types';
import { AIStates } from './types';
import { formatMessage } from './utils';
import { StateStore } from './store';

type ChannelReadStatus = Record<
  string,
  {
    last_read: Date;
    unread_messages: number;
    user: UserResponse;
    first_unread_message_id?: string;
    last_read_message_id?: string;
    last_delivered_at?: Date;
    last_delivered_message_id?: string;
  }
>;

/**
 * Whether this client holds a server-side watch on the channel — i.e. whether channel events are
 * being delivered to it.
 *
 * Three values rather than a boolean, because "not watching" alone cannot say whether a re-watch is
 * wanted: a watch lost to a dead socket should be restored on reconnect, one the consumer stopped
 * deliberately must not be. The server keys watches by connection ID, so a dropped socket ends every
 * watch this client held — even if it reconnects moments later with a fresh ID.
 */
export const ChannelWatchStatus = {
  /** Never watched, or the consumer stopped watching on purpose — do NOT re-watch. */
  NotWatching: 'notWatching',
  /** Was watching until the connection dropped — the watch is gone and SHOULD be restored. */
  WasWatching: 'wasWatching',
  /** Holding a live watch: events are flowing. */
  Watching: 'watching',
} as const;

export type ChannelWatchStatus =
  (typeof ChannelWatchStatus)[keyof typeof ChannelWatchStatus];

/**
 * Everything about watching this channel: who else is watching it, and whether *we* are.
 */
export type ChannelWatchState = {
  watcherCount: number;
  watchers: Record<string, UserResponse>;
  /**
   * See {@link ChannelWatchStatus}. Goes to `Watching` when a query carrying `watch: true` succeeds
   * (`channel.watch()`, `channel.query({ watch: true })`, `client.queryChannels()`); to
   * `WasWatching` when the WS connection is lost (only from `Watching` — a deliberate stop is never
   * resurrected); and to `NotWatching` on `channel.stopWatching()` or teardown.
   *
   * Note `channel.watch()` silently downgrades to a non-watching query when the client has no
   * connection ID; this is what makes that observable.
   */
  watchStatus: ChannelWatchStatus;
};

export type TypingUsersState = {
  typing: Record<string, Event>;
};

export type ReadState = {
  read: ChannelReadStatus;
};

export type MembersState = {
  members: Record<string, ChannelMemberResponse>;
  /**
   * Total member count, sourced from `channel.data.member_count`. Set on query / watch / hydration
   * (incl. offline-DB rehydration) and on `channel.updated` — deliberately NOT on `member.added` /
   * `member.removed`. `channel.updated` fires on every member change and is the authoritative count;
   * incrementing per member event double-counted when several members changed at once.
   * See https://github.com/GetStream/stream-chat-js/pull/1761.
   */
  memberCount: number;
};

/** The current user's own membership in this channel (role, pinned_at, archived_at, …). */
export type MembershipState = {
  membership: ChannelMemberResponse;
};

export type OwnCapabilitiesState = {
  ownCapabilities: string[];
};

/**
 * The channel's server-provided `data` (name, image, frozen, hidden, blocked, config,
 * `member_count`, `own_capabilities`, …), mirrored reactively so consumers can subscribe to
 * channel-level changes via `useStateStore(channel.state, (s) => ({ data: s.data }))`.
 */
export type ChannelDataState = {
  data: Channel['data'];
};

/** Whether THIS channel is muted for the current user, mirrored from `client.mutedChannels`. */
export type ChannelMuteStatus = {
  muted: boolean;
  createdAt: Date | null;
  expiresAt: Date | null;
};

/**
 * Reactive channel-mute state — is this channel muted for the current user. Mirrors the client-owned
 * `client.mutedChannels` (updated on `notification.channel_mutes_updated` + `health.check`) and is
 * subscribable via `useStateStore(channel.state, (s) => ({ muteStatus: s.muteStatus }))`. Muted
 * USERS remain client-global on `client.mutedUsersStore` and are NOT part of channel state.
 */
export type MuteStatusState = {
  muteStatus: ChannelMuteStatus;
};

/**
 * Connection / initialization lifecycle flags for the channel. Previously plain fields on `Channel`;
 * now store-backed so consumers can react to them via `useStateStore(channel.state, selector)`.
 * Read/written through the `channel.initialized` / `channel.offlineMode` /
 * `channel.pendingDisposal` getters/setters, which proxy this slice.
 */
export type ChannelLifecycleState = {
  /**
   * A vague indication of whether the channel exists on the chat backend. `true` once the channel
   * has been initialized by `channel.create()` / `channel.query()` / `channel.watch()`. `false`
   * means the channel may or may not exist — only those calls confirm it.
   */
  initialized: boolean;
  /**
   * Whether the channel was initialized by manually populating its state (e.g. offline hydration)
   * rather than a live watch. Such static state means the channel exists on the backend but is not
   * being watched yet.
   */
  offlineMode: boolean;
  /**
   * Whether the channel has been torn down and is awaiting disposal (deleted, the current user
   * removed, or the client disconnected). One-way and terminal — see
   * {@link Channel.pendingDisposal}: the instance is never revived.
   */
  pendingDisposal: boolean;
};

/**
 * Whether the channel is currently being consumed — consumer-declared, never returned by the API.
 * Mirrors `thread.state.active`.
 */
export type ChannelActivationState = {
  /**
   * Whether a consumer has declared this channel as the one it is currently reading, via
   * `channel.activate()` / `channel.deactivate()` (refcounted, as a single `Channel` instance can
   * be held by several consumers at once). It carries no rendering semantics; it tells the client
   * that the channel's own state is being consumed and takes precedence over bulk state writes —
   * channel-list hydration does not re-seed the message list of an `active` channel (the channel's
   * own `channel.reload()` owns that window).
   */
  active: boolean;
};

/**
 * Reactive AI-indicator state — driven by the `ai_indicator.update` / `.clear` / `.stop` events (see
 * `Channel._handleChannelEvent`). Seeded to `AIStates.Idle` and subscribable via
 * `useStateStore(channel.state, (s) => ({ aiState: s.aiState }))`. Reset to `Idle` on unwatch /
 * disconnect (a live server sends `ai_indicator.clear` when the AI response starts streaming).
 */
export type AIIndicatorState = {
  aiState: AIState;
};

/**
 * The single, unified reactive state for a channel. All per-channel reactive state is published
 * through this one `StateStore` and subscribed to with `useStateStore(channel.state, selector)`
 * (mirroring `thread.state`).
 *
 * The shape is FLAT — subscribe to any slice via a selector, e.g.
 * `useStateStore(channel.state, (s) => ({ read: s.read }))`.
 */
export type ChannelStateData = ChannelWatchState &
  TypingUsersState &
  ReadState &
  MembersState &
  MembershipState &
  OwnCapabilitiesState &
  ChannelDataState &
  MuteStatusState &
  ChannelLifecycleState &
  ChannelActivationState &
  AIIndicatorState;

/**
 * ChannelState - the container for a channel's reactive state.
 *
 * It IS a `StateStore<ChannelStateData>` (so `useStateStore(channel.state, selector)` works,
 * mirroring `thread.state`) while additionally exposing convenience getters/setters
 * (`members`, `read`, `typing`, `watchers`, …) that read/write the same unified store.
 */
export class ChannelState extends StateStore<ChannelStateData> {
  _channel: Channel;
  pending_messages: Array<PendingMessageResponse>;

  constructor(channel: Channel) {
    super({
      watcherCount: 0,
      watchers: {},
      watchStatus: ChannelWatchStatus.NotWatching,
      typing: {},
      read: {},
      members: {},
      memberCount: 0,
      membership: {} as ChannelMemberResponse,
      ownCapabilities: [],
      data: channel?.data,
      muteStatus: { muted: false, createdAt: null, expiresAt: null },
      initialized: false,
      offlineMode: false,
      pendingDisposal: false,
      active: false,
      aiState: AIStates.Idle,
    });
    this._channel = channel;
    this.syncStateFromChannelData(channel?.data);
    this.pending_messages = [];
  }

  /**
   * The current user's unread message count, derived from the `read` slice
   * (`read[ownUserId].unread_messages`) rather than stored a second time — there is exactly one
   * place holding this value, so the count the unread badge reads can never drift from the count
   * `channel.countUnread()` returns. Written through `Channel._setOwnUnreadCount`.
   */
  get unreadCount() {
    // read `_client` directly: `getClient()` throws on a channel pending disposal, and reading a
    // count off a dead instance should yield 0, not blow up.
    const userId = this._channel?._client?.userId;
    if (!userId) return 0;
    return this.getLatestValue().read[userId]?.unread_messages ?? 0;
  }

  /** The current user's own membership; store-backed so `useStateStore` can subscribe to it. */
  get membership() {
    return this.getLatestValue().membership;
  }

  set membership(membership: ChannelMemberResponse) {
    this.partialNext({ membership });
  }

  get members() {
    return this.getLatestValue().members;
  }

  set members(members: Record<string, ChannelMemberResponse>) {
    this.partialNext({ members });
  }

  get member_count() {
    return this.getLatestValue().memberCount;
  }

  set member_count(memberCount: number) {
    this.partialNext({ memberCount });
  }

  get read() {
    return this.getLatestValue().read;
  }

  set read(read: ChannelReadStatus) {
    this.partialNext({ read });
  }

  get typing() {
    return (
      this._channel?.messageComposer?.textComposer.typing ?? this.getLatestValue().typing
    );
  }

  set typing(typing: Record<string, Event>) {
    this.partialNext({ typing });

    if (this._channel?.messageComposer) {
      this._channel.messageComposer.textComposer.setTyping(typing);
    }
  }

  /**
   * Reflects the channel's server-provided `data` into the unified store and derives the
   * `memberCount` and `ownCapabilities` slices from it.
   *
   * `fallbackData` (the previous `channel.data`) makes both derived fields sticky: a data update
   * that omits `member_count`/`own_capabilities` keeps the last known value rather than wiping it.
   * The sticky value is written back onto `data` as a plain field (only when `data` itself is
   * missing it) so raw readers — e.g. `channelHasReadEvents`, which inspects
   * `channel.data.own_capabilities` directly — stay consistent with the store. `own_capabilities`
   * is never coerced to `[]` while unknown, so "not yet loaded" is not mistaken for "explicitly no
   * capabilities" (regression #1732). This replaces the previous `Object.defineProperty` machinery;
   * direct in-place mutation of `channel.data.member_count`/`own_capabilities` no longer syncs to
   * the store — reassign `channel.data` (as the WS handlers do) instead.
   */
  syncStateFromChannelData(
    data: Channel['data'],
    fallbackData: Channel['data'] = this._channel?.data,
  ) {
    const fallbackMemberCount =
      typeof fallbackData?.member_count === 'number'
        ? fallbackData.member_count
        : this.getLatestValue().memberCount;

    const memberCount =
      typeof data?.member_count === 'number'
        ? data.member_count
        : typeof fallbackMemberCount === 'number'
          ? fallbackMemberCount
          : undefined;

    const ownCapabilities = Array.isArray(data?.own_capabilities)
      ? [...data.own_capabilities]
      : Array.isArray(fallbackData?.own_capabilities)
        ? [...fallbackData.own_capabilities]
        : undefined;

    // Carry a genuinely-known previous value forward onto the new `data` object when the update
    // omits it — never fabricate one (an empty channel keeps `data === {}`, its `own_capabilities`
    // undefined). This is a plain assignment, not an accessor.
    if (data && typeof data === 'object') {
      if (
        typeof data.member_count !== 'number' &&
        typeof fallbackData?.member_count === 'number'
      ) {
        data.member_count = fallbackData.member_count;
      }
      if (
        !Array.isArray(data.own_capabilities) &&
        Array.isArray(fallbackData?.own_capabilities)
      ) {
        data.own_capabilities = [...fallbackData.own_capabilities];
      }
    }

    this.partialNext({
      data,
      memberCount: memberCount ?? 0,
      ownCapabilities: ownCapabilities ?? [],
    });
  }

  setTypingEvent(userID: string, event: Event) {
    this.typing = { ...this.typing, [userID]: event };
  }

  removeTypingEvent(userID: string) {
    if (!this.typing[userID]) return;

    const typing = { ...this.typing };
    delete typing[userID];
    this.typing = typing;
  }

  get watchers() {
    return this.getLatestValue().watchers;
  }

  set watchers(watchers: Record<string, UserResponse>) {
    this.partialNext({ watchers });
  }

  get watcher_count() {
    return this.getLatestValue().watcherCount;
  }

  set watcher_count(watcherCount: number) {
    this.partialNext({ watcherCount });
  }

  /**
   * Takes the message object, adds SDK-specific fields (status, error),
   * and returns a new message object.
   *
   * @param message - `MessageResponse` object
   */
  formatMessage = (message: MessageResponse | LocalMessage) => formatMessage(message);

  /**
   * clean - Remove stale data such as users that stayed in typing state for more than 5 seconds
   */
  clean() {
    const now = new Date();
    // prevent old users from showing up as typing
    for (const [userID, lastEvent] of Object.entries(this.typing)) {
      const receivedAt =
        typeof lastEvent.received_at === 'string'
          ? new Date(lastEvent.received_at)
          : lastEvent.received_at || new Date();
      if (now.getTime() - receivedAt.getTime() > 7000) {
        this.removeTypingEvent(userID);
        this._channel.getClient().dispatchEvent({
          cid: this._channel.cid,
          type: 'typing.stop',
          user: { id: userID },
        } as Event);
      }
    }
  }

  /**
   * Resets the AI indicator to `Idle`. Called when the connection drops, as while the connection is
   * severed we miss the `ai_indicator.clear`/`.stop` that ends a response and it isn't replayed on
   * reconnect, so the indicator would otherwise stay stuck on "Generating". Noop when already `Idle`.
   */
  resetAIState() {
    if (this.getLatestValue().aiState === AIStates.Idle) return;
    this.partialNext({ aiState: AIStates.Idle });
  }
}
