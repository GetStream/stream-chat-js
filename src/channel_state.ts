import type { Channel } from './channel';
import type {
  ChannelMemberResponse,
  Event,
  LocalMessage,
  MessageResponse,
  PendingMessageResponse,
  UserResponse,
} from './types';
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

export type WatcherState = {
  watcherCount: number;
  watchers: Record<string, UserResponse>;
};

export type TypingUsersState = {
  typing: Record<string, Event>;
};

export type ReadState = {
  read: ChannelReadStatus;
};

export type MembersState = {
  members: Record<string, ChannelMemberResponse>;
  memberCount: number;
};

export type OwnCapabilitiesState = {
  ownCapabilities: string[];
};

/** UI-driven channel lifecycle state (not returned by the API; set by the UI SDK). */
export type ChannelUIState = {
  /**
   * Whether the channel is currently mounted / actively viewed on-screen. UI-driven and
   * refcounted via `channel.activate()` / `channel.deactivate()`. While `active`, the channel
   * auto-marks messages read, and channel-list hydration does NOT re-seed its message list
   * (the channel's own `channel.reload()` owns that window).
   */
  active: boolean;
};

/**
 * The single, unified reactive state for a channel. All per-channel reactive state is published
 * through this one `StateStore` and subscribed to with `useStateStore(channel.state, selector)`
 * (mirroring `thread.state`).
 *
 * The shape is FLAT — subscribe to any slice via a selector, e.g.
 * `useStateStore(channel.state, (s) => ({ read: s.read }))`.
 */
export type ChannelStateData = WatcherState &
  TypingUsersState &
  ReadState &
  MembersState &
  OwnCapabilitiesState &
  ChannelUIState;

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
  unreadCount: number;
  membership: ChannelMemberResponse;

  constructor(channel: Channel) {
    super({
      watcherCount: 0,
      watchers: {},
      typing: {},
      read: {},
      members: {},
      memberCount: 0,
      ownCapabilities: [],
      active: false,
    });
    this._channel = channel;
    this.syncMemberCountFromChannelData(channel?.data);
    this.syncOwnCapabilitiesFromChannelData(channel?.data);
    this.pending_messages = [];
    this.membership = {} as ChannelMemberResponse;
    this.unreadCount = 0;
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

  syncMemberCountFromChannelData(
    data: Channel['data'],
    fallbackData: Channel['data'] = this._channel?.data,
  ) {
    const fallbackMemberCount =
      typeof fallbackData?.member_count === 'number'
        ? fallbackData.member_count
        : this.getLatestValue().memberCount;

    if (!data || typeof data !== 'object') {
      this.partialNext({ memberCount: fallbackMemberCount ?? 0 });
      return;
    }

    const dataDescriptor = Object.getOwnPropertyDescriptor(data, 'member_count');
    let memberCount =
      typeof data.member_count === 'number'
        ? data.member_count
        : typeof fallbackMemberCount === 'number'
          ? fallbackMemberCount
          : undefined;

    this.partialNext({ memberCount: memberCount ?? 0 });

    Object.defineProperty(data, 'member_count', {
      configurable: true,
      enumerable: dataDescriptor?.enumerable ?? false,
      get: () => memberCount,
      set: (nextMemberCount: number | undefined) => {
        memberCount = typeof nextMemberCount === 'number' ? nextMemberCount : undefined;
        this.partialNext({ memberCount: memberCount ?? 0 });
      },
    });
  }

  syncOwnCapabilitiesFromChannelData(
    data: Channel['data'],
    fallbackData: Channel['data'] = this._channel?.data,
  ) {
    if (!data || typeof data !== 'object') {
      this.partialNext({ ownCapabilities: [] });
      return;
    }

    let ownCapabilities: string[] | undefined = Array.isArray(data.own_capabilities)
      ? [...data.own_capabilities]
      : Array.isArray(fallbackData?.own_capabilities)
        ? [...fallbackData.own_capabilities]
        : undefined;

    this.partialNext({ ownCapabilities: ownCapabilities ?? [] });

    // Keep the reactive getter/setter so backward-compatible assignments still sync to
    // the store, but return `undefined` until capabilities are actually known. Forcing
    // `[]` on an unloaded channel would make read-events–gated logic (e.g. unread
    // counting, regression #1732) treat "not yet loaded" as "explicitly no capabilities".
    Object.defineProperty(data, 'own_capabilities', {
      configurable: true,
      enumerable: true,
      get: () => ownCapabilities,
      set: (nextOwnCapabilities: string[] | undefined) => {
        ownCapabilities = Array.isArray(nextOwnCapabilities)
          ? [...nextOwnCapabilities]
          : undefined;
        this.partialNext({ ownCapabilities: ownCapabilities ?? [] });
      },
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
}
