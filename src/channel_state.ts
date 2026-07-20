import type { Channel } from './channel';
import type {
  ChannelMemberResponse,
  Event,
  LocalMessage,
  MessageResponse,
  MessageResponseBase,
  PendingMessageResponse,
  ReactionResponse,
  UserResponse,
} from './types';
import {
  deleteUserMessages as _deleteUserMessages,
  addToMessageList,
  formatMessage,
} from './utils';
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
  pinnedMessages: Array<LocalMessage>;
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
    this.pinnedMessages = [];
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
   * addPinnedMessages - adds messages in pinnedMessages property
   *
   * @param {Array<MessageResponse>} pinnedMessages A list of pinned messages
   *
   */
  addPinnedMessages(pinnedMessages: MessageResponse[]) {
    for (let i = 0; i < pinnedMessages.length; i += 1) {
      this.addPinnedMessage(pinnedMessages[i]);
    }
  }

  /**
   * addPinnedMessage - adds message in pinnedMessages
   *
   * @param {MessageResponse} pinnedMessage message to update
   *
   */
  addPinnedMessage(pinnedMessage: MessageResponse) {
    this.pinnedMessages = this._addToMessageList(
      this.pinnedMessages,
      this.formatMessage(pinnedMessage),
      false,
      'pinned_at',
    );
  }

  /**
   * removePinnedMessage - removes pinned message from pinnedMessages
   *
   * @param {MessageResponse} message message to remove
   *
   */
  removePinnedMessage(message: MessageResponse) {
    const { result } = this.removeMessageFromArray(this.pinnedMessages, message);
    this.pinnedMessages = result;
  }

  /**
   * addReaction - keeps the pinned-message copy's reactions in sync and enriches the passed
   * `event.message` with the current user's `own_reactions`.
   *
   * The channel message list is owned by `channel.messagePaginator` (see `reflectReaction`) and
   * thread replies by the `Thread` object; this only maintains the pinned-message cache.
   */
  addReaction(
    reaction: ReactionResponse,
    message?: MessageResponse,
    enforce_unique?: boolean,
  ) {
    if (!message) {
      return;
    }

    const messageWithReaction = message;
    const updateData = {
      id: messageWithReaction.id,
      parent_id: messageWithReaction.parent_id,
      pinned: messageWithReaction.pinned,
      show_in_channel: messageWithReaction.show_in_channel,
    };

    this._updateMessage(updateData, (msg) => {
      const updatedMessage = { ...messageWithReaction };
      // This part will remove own_reactions from what is essentially
      // a copy of event.message; we do not want to return that as someone
      // else reaction would remove our own_reactions needlessly. This
      // only happens when we are not the sender of the reaction. We need
      // the variable itself so that the event can be properly enriched
      // later on.
      messageWithReaction.own_reactions = this._addOwnReactionToMessage(
        msg.own_reactions,
        reaction,
        enforce_unique,
      );
      // Whenever we are the ones sending the reaction, the helper enriches
      // own_reactions as normal so we can use that, otherwise we fallback
      // to whatever state we had.
      updatedMessage.own_reactions =
        this._channel.getClient().userID === reaction.user_id
          ? messageWithReaction.own_reactions
          : msg.own_reactions;
      return this.formatMessage(updatedMessage);
    });
    return messageWithReaction;
  }

  _addOwnReactionToMessage(
    ownReactions: ReactionResponse[] | null | undefined,
    reaction: ReactionResponse,
    enforce_unique?: boolean,
  ) {
    if (enforce_unique) {
      ownReactions = [];
    } else {
      ownReactions = this._removeOwnReactionFromMessage(ownReactions, reaction);
    }

    ownReactions = ownReactions || [];
    if (this._channel.getClient().userID === reaction.user_id) {
      ownReactions.push(reaction);
    }

    return ownReactions;
  }

  _removeOwnReactionFromMessage(
    ownReactions: ReactionResponse[] | null | undefined,
    reaction: ReactionResponse,
  ) {
    if (ownReactions) {
      return ownReactions.filter(
        (item) => item.user_id !== reaction.user_id || item.type !== reaction.type,
      );
    }
    return ownReactions;
  }

  /**
   * removeReaction - keeps the pinned-message copy's reactions in sync (see `addReaction`).
   */
  removeReaction(reaction: ReactionResponse, message?: MessageResponse) {
    if (!message) {
      return;
    }

    const messageWithRemovedReaction = message;
    const updateData = {
      id: messageWithRemovedReaction.id,
      parent_id: messageWithRemovedReaction.parent_id,
      pinned: messageWithRemovedReaction.pinned,
      show_in_channel: messageWithRemovedReaction.show_in_channel,
    };
    this._updateMessage(updateData, (msg) => {
      messageWithRemovedReaction.own_reactions = this._removeOwnReactionFromMessage(
        msg.own_reactions,
        reaction,
      );
      return this.formatMessage(messageWithRemovedReaction);
    });
    return messageWithRemovedReaction;
  }

  /**
   * Updates the pinned-message copy of the given message. The channel message list is owned by
   * `channel.messagePaginator` and thread replies by the `Thread` object.
   * @param message
   * @param updateFunc
   */
  _updateMessage(
    message: {
      id?: string;
      pinned?: boolean;
    },
    updateFunc: (msg: LocalMessage) => LocalMessage,
  ) {
    const { pinned } = message;

    if (pinned) {
      const msgIndex = this.pinnedMessages.findIndex((msg) => msg.id === message.id);
      if (msgIndex !== -1) {
        this.pinnedMessages[msgIndex] = updateFunc(this.pinnedMessages[msgIndex]);
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
   * _addToMessageList - Adds a message to a list of messages, tries to update first, appends if message isn't found
   *
   * @param {Array<LocalMessage>} messages A list of messages
   * @param message
   * @param {boolean} timestampChanged Whether updating a message with changed created_at value.
   * @param {string} sortBy field name to use to sort the messages by
   * @param {boolean} addIfDoesNotExist Add message if it is not in the list, used to prevent out of order updated messages from being added.
   */
  _addToMessageList(
    messages: Array<LocalMessage>,
    message: LocalMessage,
    timestampChanged = false,
    sortBy: 'pinned_at' | 'created_at' = 'created_at',
    addIfDoesNotExist = true,
  ) {
    return addToMessageList(
      messages,
      message,
      timestampChanged,
      sortBy,
      addIfDoesNotExist,
    );
  }

  removeMessageFromArray = (
    msgArray: Array<LocalMessage>,
    msg: { id: string; parent_id?: string },
  ) => {
    const result = msgArray.filter(
      (message) => !(!!message.id && !!msg.id && message.id === msg.id),
    );

    return { removed: result.length < msgArray.length, result };
  };

  /**
   * Updates the message.user property with updated user object, for messages.
   *
   * @param {UserResponse} user
   */
  updateUserMessages = (user: UserResponse) => {
    // The channel message list updates user references on the paginator
    // (messagePaginator.reflectUserUpdate) and thread replies via the Thread object; this keeps the
    // pinned-message cache in sync.
    for (let i = 0; i < this.pinnedMessages.length; i++) {
      const m = this.pinnedMessages[i];
      if (m.user?.id === user.id) {
        this.pinnedMessages[i] = { ...m, user };
      }
    }
  };

  /**
   * Marks the messages as deleted, from deleted user.
   *
   * @param {UserResponse} user
   * @param {boolean} hardDelete
   */
  deleteUserMessages = (
    user: UserResponse,
    hardDelete = false,
    deletedAt?: LocalMessage['deleted_at'],
  ) => {
    // The channel message list applies deletions on the paginator
    // (messagePaginator.applyMessageDeletionForUser) and thread replies via the Thread object; this
    // keeps the pinned-message cache in sync.
    _deleteUserMessages({
      messages: this.pinnedMessages,
      user,
      hardDelete,
      deletedAt: deletedAt ?? null,
    });
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

  /**
   * Clears the pinned-message cache. The main channel message list is owned by the paginator
   * (clear it via `channel.messagePaginator.clearStateAndCache()`).
   */
  clearMessages() {
    this.pinnedMessages = [];
  }
}
