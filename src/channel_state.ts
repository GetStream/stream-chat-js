import type { Channel } from './channel';
import type {
  AIState,
  ChannelMemberResponse,
  Event,
  LocalMessage,
  MessageResponse,
  PendingMessageResponse,
  TimestampNS,
  UserResponse,
} from './types';
import { AIStates } from './types';
import { formatMessage } from './utils';
import { nowNs, nsToMs } from './utils/time';
import { StateStore } from '@stream-io/state-store';

type ChannelReadStatus = Record<
  string,
  {
    /** Unix nanoseconds, as the API sends it. */
    last_read: TimestampNS;
    unread_messages: number;
    user: UserResponse;
    first_unread_message_id?: string;
    last_read_message_id?: string;
    /** Unix nanoseconds, as the API sends it. */
    last_delivered_at?: TimestampNS;
    last_delivered_message_id?: string;
  }
>;

/**
 * Whether this client holds a server-side watch on the channel (channel events are delivered to it).
 * Three values because a watch lost to a dropped socket should be restored on reconnect, while one the
 * consumer stopped must not be. The server keys watches by connection ID, so a dropped socket ends
 * every watch this client held.
 */
export const ChannelWatchStatus = {
  /** Never watched, or the consumer stopped watching: do NOT re-watch. */
  NotWatching: 'notWatching',
  /** Was watching until the connection dropped: the watch is gone and SHOULD be restored. */
  WasWatching: 'wasWatching',
  /** Holds a live watch. */
  Watching: 'watching',
} as const;

export type ChannelWatchStatus =
  (typeof ChannelWatchStatus)[keyof typeof ChannelWatchStatus];

/** Who is watching the channel, and whether this client is. */
export type ChannelWatchState = {
  watcherCount: number;
  watchers: Record<string, UserResponse>;
  /**
   * See {@link ChannelWatchStatus}. Becomes `Watching` when a query with `watch: true` succeeds
   * (`channel.watch()`, `channel.query({ watch: true })`, `client.queryChannels()`), `WasWatching` when
   * the connection is lost (only from `Watching`), and `NotWatching` on `channel.stopWatching()` or
   * `channel.disconnect()`.
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
   * From `channel.data.member_count`. Set on query, watch and hydration (including the offline DB) and
   * on `channel.updated`, not on `member.added` / `member.removed`: `channel.updated` fires on every
   * member change and is authoritative, while counting per member event double-counts (#1761).
   */
  memberCount: number;
};

export type MembershipState = {
  membership: ChannelMemberResponse;
};

export type OwnCapabilitiesState = {
  ownCapabilities: string[];
};

export type ChannelDataState = {
  data: Channel['data'];
};

/** Whether this channel is muted for the current user, mirrored from `client.mutedChannels`. */
export type ChannelMuteStatus = {
  muted: boolean;
  /** Unix nanoseconds, as the API sends it. */
  createdAt: TimestampNS | null;
  /** Unix nanoseconds, as the API sends it. */
  expiresAt: TimestampNS | null;
};

/**
 * Kept in sync with `client.mutedChannels` (`notification.channel_mutes_updated`, `health.check`).
 * Muted users are client-global (`client.mutedUsersStore`), not part of channel state.
 */
export type MuteStatusState = {
  muteStatus: ChannelMuteStatus;
};

/**
 * Read through the `channel.initialized` / `offlineMode` / `pendingDisposal` getters. Only
 * `channel.disconnect()` sets `pendingDisposal`.
 */
export type ChannelLifecycleState = {
  /**
   * Whether a live server response (a query or a `queryChannels` result) was applied to this instance
   * since it was created. `false`: nothing confirmed the channel yet, so it may or may not exist on
   * the server. Data restored from the offline database does not count (see `offlineMode`).
   * `watchStatus` tells whether the data is kept current. Never reset.
   */
  initialized: boolean;
  /**
   * Whether the state was populated manually (e.g. offline hydration) rather than by a live query: the
   * channel exists on the backend but is not watched yet.
   */
  offlineMode: boolean;
  /**
   * Whether `channel.disconnect()` has run: the channel was deleted, the current user removed from
   * it, the client disconnected, or nothing uses it. Terminal, see {@link Channel.pendingDisposal}.
   */
  pendingDisposal: boolean;
  /**
   * The stored instance that replaced this one: this one was created without an id and, when the server
   * answered with the cid, another instance was already stored under it. That instance took this one's
   * server data, local messages and (if this one was open and it was not) its composer. Set once.
   */
  supersededBy: Channel | undefined;
};

/** Consumer-declared, never returned by the API. */
export type ChannelActivationState = {
  /**
   * Whether a consumer declared this channel as the one it is reading, via `channel.activate()`. Its
   * own state then takes precedence over bulk writes: channel-list hydration does not re-seed the
   * message list of an `active` channel (`channel.reload()` owns that window).
   */
  active: boolean;
};

/**
 * Driven by the `ai_indicator.update` / `.clear` / `.stop` events. Reset to `Idle` when the connection
 * closes or goes unhealthy, as the `clear`/`stop` that ends a response is missed and not replayed.
 */
export type AIIndicatorState = {
  aiState: AIState;
};

/**
 * All per-channel reactive state, in one flat `StateStore`. Subscribe with a selector, e.g.
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
 * A `StateStore<ChannelStateData>` that also exposes getters/setters (`members`, `read`, `typing`,
 * `watchers`, ...) over the same store.
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
      // written by the `Channel.data` setter, which the channel calls once its state exists
      data: undefined,
      muteStatus: { muted: false, createdAt: null, expiresAt: null },
      initialized: false,
      offlineMode: false,
      pendingDisposal: false,
      supersededBy: undefined,
      active: false,
      aiState: AIStates.Idle,
    });
    this._channel = channel;
    this.pending_messages = [];
  }

  /**
   * The current user's unread count, derived from `read[ownUserId].unread_messages` so it cannot drift
   * from `channel.countUnread()`. Written through `Channel._setOwnUnreadCount`.
   */
  get unreadCount() {
    // `_client` is read directly: `getClient()` throws on a channel pending disposal, which reads 0.
    const userId = this._channel?._client?.userId;
    if (!userId) return 0;
    return this.getLatestValue().read[userId]?.unread_messages ?? 0;
  }

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
    return this.getLatestValue().typing;
  }

  set typing(typing: Record<string, Event>) {
    this.partialNext({ typing });
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

  /** Returns a new message object with the SDK-specific fields (`status`, `error`) added. */
  formatMessage = (message: MessageResponse | LocalMessage) => formatMessage(message);

  /** Removes users typing for more than 7 seconds without a new event, dispatching `typing.stop`. */
  clean() {
    const now = nowNs();
    for (const [userID, lastEvent] of Object.entries(this.typing)) {
      const receivedAt = lastEvent.received_at ?? now;
      if (nsToMs(now - receivedAt) > 7000) {
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
   * Resets the AI indicator to `Idle`. Called when the connection closes or goes unhealthy: the
   * `ai_indicator.clear`/`.stop` that ends a response is missed then and not replayed on reconnect.
   */
  resetAIState() {
    if (this.getLatestValue().aiState === AIStates.Idle) return;
    this.partialNext({ aiState: AIStates.Idle });
  }
}
