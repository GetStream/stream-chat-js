import type { Channel } from './channel';
import type {
  ChannelMemberResponse,
  Event,
  LocalMessage,
  MessageResponse,
  MessageResponseBase,
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

export type MutedUsersState = {
  mutedUsers: Array<UserResponse>;
};

export type MembersState = {
  members: Record<string, ChannelMemberResponse>;
  memberCount: number;
};

export type OwnCapabilitiesState = {
  ownCapabilities: string[];
};

/**
 * ChannelState - A container class for the channel state.
 */
export class ChannelState {
  _channel: Channel;
  readonly watcherStore: StateStore<WatcherState>;
  readonly typingStore: StateStore<TypingUsersState>;
  readonly readStore: StateStore<ReadState>;
  readonly membersStore: StateStore<MembersState>;
  readonly ownCapabilitiesStore: StateStore<OwnCapabilitiesState>;
  // todo: is this actually used somewhere?
  readonly mutedUsersStore: StateStore<MutedUsersState>;
  pending_messages: Array<PendingMessageResponse>;
  unreadCount: number;
  membership: ChannelMemberResponse;
  last_message_at: Date | null;
  /**
   * Flag which indicates if channel state contain latest/recent messages or no.
   * This flag should be managed by UI sdks using a setter - setIsUpToDate.
   * When false, any new message (received by websocket event - message.new) will not
   * be pushed on to message list.
   */
  isUpToDate: boolean;

  constructor(channel: Channel) {
    this._channel = channel;
    this.watcherStore = new StateStore<WatcherState>({
      watcherCount: 0,
      watchers: {},
    });
    this.typingStore = new StateStore<TypingUsersState>({
      typing: {},
    });
    this.readStore = new StateStore<ReadState>({ read: {} });
    // a list of users to hide messages from
    this.mutedUsersStore = new StateStore<MutedUsersState>({ mutedUsers: [] });
    this.membersStore = new StateStore<MembersState>({ members: {}, memberCount: 0 });
    this.ownCapabilitiesStore = new StateStore<OwnCapabilitiesState>({
      ownCapabilities: [],
    });
    this.syncMemberCountFromChannelData(channel?.data);
    this.syncOwnCapabilitiesFromChannelData(channel?.data);
    this.pending_messages = [];
    this.membership = {};
    this.unreadCount = 0;
    /**
     * Flag which indicates if channel state contain latest/recent messages or no.
     * This flag should be managed by UI sdks using a setter - setIsUpToDate.
     * When false, any new message (received by websocket event - message.new) will not
     * be pushed on to message list.
     */
    this.isUpToDate = true;
    this.last_message_at =
      channel?.state?.last_message_at != null
        ? new Date(channel.state.last_message_at)
        : null;
  }

  get members() {
    return this.membersStore.getLatestValue().members;
  }

  set members(members: Record<string, ChannelMemberResponse>) {
    this.membersStore.partialNext({ members });
  }

  get member_count() {
    return this.membersStore.getLatestValue().memberCount;
  }

  set member_count(memberCount: number) {
    this.membersStore.partialNext({ memberCount });
  }

  get read() {
    return this.readStore.getLatestValue().read;
  }

  set read(read: ChannelReadStatus) {
    this.readStore.next({ read });
  }

  get typing() {
    return (
      this._channel?.messageComposer?.textComposer.typing ??
      this.typingStore.getLatestValue().typing
    );
  }

  set typing(typing: Record<string, Event>) {
    this.typingStore.next({ typing });

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
        : this.membersStore.getLatestValue().memberCount;

    if (!data || typeof data !== 'object') {
      this.membersStore.partialNext({ memberCount: fallbackMemberCount ?? 0 });
      return;
    }

    const dataDescriptor = Object.getOwnPropertyDescriptor(data, 'member_count');
    let memberCount =
      typeof data.member_count === 'number'
        ? data.member_count
        : typeof fallbackMemberCount === 'number'
          ? fallbackMemberCount
          : undefined;

    this.membersStore.partialNext({ memberCount: memberCount ?? 0 });

    Object.defineProperty(data, 'member_count', {
      configurable: true,
      enumerable: dataDescriptor?.enumerable ?? false,
      get: () => memberCount,
      set: (nextMemberCount: number | undefined) => {
        memberCount = typeof nextMemberCount === 'number' ? nextMemberCount : undefined;
        this.membersStore.partialNext({ memberCount: memberCount ?? 0 });
      },
    });
  }

  syncOwnCapabilitiesFromChannelData(
    data: Channel['data'],
    fallbackData: Channel['data'] = this._channel?.data,
  ) {
    if (!data || typeof data !== 'object') {
      this.ownCapabilitiesStore.next({ ownCapabilities: [] });
      return;
    }

    let ownCapabilities: string[] | undefined = Array.isArray(data.own_capabilities)
      ? [...data.own_capabilities]
      : Array.isArray(fallbackData?.own_capabilities)
        ? [...fallbackData.own_capabilities]
        : undefined;

    this.ownCapabilitiesStore.next({ ownCapabilities: ownCapabilities ?? [] });

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
        this.ownCapabilitiesStore.next({ ownCapabilities: ownCapabilities ?? [] });
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

  get mutedUsers() {
    return this.mutedUsersStore.getLatestValue().mutedUsers;
  }

  set mutedUsers(mutedUsers: Array<UserResponse>) {
    this.mutedUsersStore.next({ mutedUsers });
  }

  get watchers() {
    return this.watcherStore.getLatestValue().watchers;
  }

  set watchers(watchers: Record<string, UserResponse>) {
    this.watcherStore.partialNext({ watchers });
  }

  get watcher_count() {
    return this.watcherStore.getLatestValue().watcherCount;
  }

  set watcher_count(watcherCount: number) {
    this.watcherStore.partialNext({ watcherCount });
  }

  /**
   * addMessageSorted - Register a single message's channel-level side effects.
   *
   * The channel message list lives in `channel.messagePaginator` and thread replies in the
   * `Thread` object now; this only advances `last_message_at` and records the user reference.
   *
   * @param {MessageResponse} newMessage A new message
   * @param {boolean} timestampChanged Whether updating a message with changed created_at value.
   * @param {boolean} addIfDoesNotExist Add message if it is not in the list, used to prevent out of order updated messages from being added.
   */
  addMessageSorted(
    newMessage: MessageResponse | LocalMessage,
    timestampChanged = false,
    addIfDoesNotExist = true,
  ) {
    return this.addMessagesSorted(
      [newMessage],
      timestampChanged,
      false,
      addIfDoesNotExist,
    );
  }

  /**
   * Takes the message object, parses the dates, sets `__html`
   * and sets the status to `received` if missing; returns a new message object.
   *
   * @param {MessageResponse} message `MessageResponse` object
   */
  formatMessage = (message: MessageResponse | MessageResponseBase | LocalMessage) =>
    formatMessage(message);

  /**
   * addMessagesSorted - Register channel-level side effects for a list of messages.
   *
   * The channel message list lives in `channel.messagePaginator` and thread replies in the `Thread`
   * object now; this only records the user reference (for user-update propagation) and advances
   * `last_message_at`. It is retained until the paginators fully own those concerns.
   *
   * @param {Array<MessageResponse>} newMessages A list of messages
   * @param {boolean} timestampChanged Whether updating messages with changed created_at value.
   * @param {boolean} initializing Whether channel is being initialized.
   * @param {boolean} addIfDoesNotExist Add message if it is not in the list, used to prevent out of order updated messages from being added.
   */
  addMessagesSorted(
    newMessages: (MessageResponse | LocalMessage)[],
    timestampChanged = false,
    initializing = false,
    addIfDoesNotExist = true,
  ) {
    // `timestampChanged` / `initializing` are retained for positional-call compatibility only —
    // the message list and thread replies now live in the paginators, so neither affects this
    // channel-meta path. (This method is slated for removal once the paginators own last_message_at
    // and the user reference map.)
    void timestampChanged;
    void initializing;
    for (let i = 0; i < newMessages.length; i += 1) {
      if (newMessages[i].shadowed && addIfDoesNotExist) {
        continue;
      }
      // Already-formatted messages have run through this side-effect path already; skip them.
      const isMessageFormatted = newMessages[i].created_at instanceof Date;
      if (isMessageFormatted) {
        continue;
      }
      const message = this.formatMessage(newMessages[i]);

      if (message.user && this._channel?.cid) {
        /**
         * Store the reference to user for this channel, so that when we have to
         * handle updates to user, we can use the reference map, to determine which
         * channels need to be updated with updated user object.
         */
        this._channel
          .getClient()
          .state.updateUserReference(message.user, this._channel.cid);
      }

      const shouldSkipLastMessageAtUpdate =
        this._channel.getConfig()?.skip_last_msg_update_for_system_msgs &&
        message.type === 'system';

      if (
        !shouldSkipLastMessageAtUpdate &&
        (!this.last_message_at ||
          message.created_at.getTime() > this.last_message_at.getTime())
      ) {
        this.last_message_at = new Date(message.created_at.getTime());
      }
    }
  }

  /**
   * Setter for isUpToDate.
   *
   * @param isUpToDate  Flag which indicates if channel state contain latest/recent messages or no.
   *                    This flag should be managed by UI sdks using a setter - setIsUpToDate.
   *                    When false, any new message (received by websocket event - message.new) will not
   *                    be pushed on to message list.
   */
  setIsUpToDate = (isUpToDate: boolean) => {
    this.isUpToDate = isUpToDate;
  };

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
