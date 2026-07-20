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
  pinnedMessages: Array<ReturnType<ChannelState['formatMessage']>>;
  pending_messages: Array<PendingMessageResponse>;
  threads: Record<string, Array<ReturnType<ChannelState['formatMessage']>>>;
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
    this.threads = {};
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
   * addMessageSorted - Maintain thread-reply state for a single message.
   *
   * The main channel message list lives in `channel.messagePaginator` now; this only appends thread
   * replies to `state.threads` and advances `last_message_at`.
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
   * addMessagesSorted - Add the list of messages to state and resorts the messages
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
    for (let i = 0; i < newMessages.length; i += 1) {
      if (newMessages[i].shadowed && addIfDoesNotExist) {
        continue;
      }
      // If message is already formatted we can skip the tasks below.
      const isMessageFormatted = newMessages[i].created_at instanceof Date;
      let message: ReturnType<ChannelState['formatMessage']>;
      if (isMessageFormatted) {
        message = newMessages[i] as ReturnType<ChannelState['formatMessage']>;
      } else {
        message = this.formatMessage(newMessages[i]);

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

        if (
          initializing &&
          message.id &&
          this.threads[message.id] &&
          !this._channel.getClient().preventThreadCleanup
        ) {
          // If we are initializing the state of channel (e.g., in case of connection recovery),
          // then in that case we remove thread related to this message from threads object.
          // This way we can ensure that we don't have any stale data in thread object
          // and consumer can refetch the replies.
          delete this.threads[message.id];
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

      /**
       * Add message to thread if applicable and the message was added when querying for replies,
       * or the thread already exists. The main channel message list is owned by the paginator.
       */
      const parentID = message.parent_id;
      if (parentID && !initializing) {
        const thread = this.threads[parentID] || [];
        this.threads[parentID] = this._addToMessageList(
          thread,
          message,
          timestampChanged,
          'created_at',
          addIfDoesNotExist,
        );
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

  addReaction(
    reaction: ReactionResponse,
    message?: MessageResponse,
    enforce_unique?: boolean,
  ) {
    const messageWithReaction = message;
    let messageFromState: LocalMessage | undefined;
    if (!messageWithReaction) {
      messageFromState = this.findMessage(reaction.message_id);
    }

    if (!messageWithReaction && !messageFromState) {
      return;
    }

    const messageToUpdate = messageWithReaction ?? messageFromState;
    const updateData = {
      id: messageToUpdate?.id,
      parent_id: messageToUpdate?.parent_id,
      pinned: messageToUpdate?.pinned,
      show_in_channel: messageToUpdate?.show_in_channel,
    };

    this._updateMessage(updateData, (msg) => {
      if (messageWithReaction) {
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
      }

      if (messageFromState) {
        return this._addReactionToState(messageFromState, reaction, enforce_unique);
      }

      return msg;
    });
    return messageWithReaction ?? messageFromState;
  }

  _addReactionToState(
    messageFromState: LocalMessage,
    reaction: ReactionResponse,
    enforce_unique?: boolean,
  ) {
    if (!messageFromState.reaction_groups) {
      messageFromState.reaction_groups = {};
    }

    // 1. Firstly, get rid of all of our own reactions from the reaction_groups
    //    if enforce_unique is enabled.
    if (enforce_unique) {
      for (const ownReaction of messageFromState.own_reactions ?? []) {
        const oldOwnReactionTypeData = messageFromState.reaction_groups[ownReaction.type];
        messageFromState.reaction_groups[ownReaction.type] = {
          ...oldOwnReactionTypeData,
          count: oldOwnReactionTypeData.count - 1,
          sum_scores: oldOwnReactionTypeData.sum_scores - (ownReaction.score ?? 1),
        };
        // If there are no reactions left in this group, simply remove it.
        if (messageFromState.reaction_groups[ownReaction.type].count < 1) {
          delete messageFromState.reaction_groups[ownReaction.type];
        }
      }
    }

    const newReactionGroups = messageFromState.reaction_groups;
    const oldReactionTypeData = newReactionGroups[reaction.type];
    const score = reaction.score ?? 1;

    // 2. Next, update the reaction_groups with the new reaction.
    messageFromState.reaction_groups[reaction.type] = oldReactionTypeData
      ? {
          ...oldReactionTypeData,
          count: oldReactionTypeData.count + 1,
          sum_scores: oldReactionTypeData.sum_scores + score,
          last_reaction_at: reaction.created_at,
        }
      : {
          count: 1,
          first_reaction_at: reaction.created_at,
          last_reaction_at: reaction.created_at,
          sum_scores: score,
        };

    // 3. Update the own_reactions with the new reaction.
    messageFromState.own_reactions = this._addOwnReactionToMessage(
      messageFromState.own_reactions,
      reaction,
      enforce_unique,
    );

    // 4. Finally, update the latest_reactions with the new reaction,
    //    while respecting enforce_unique.
    const userId = this._channel.getClient().userID;
    messageFromState.latest_reactions = enforce_unique
      ? [
          ...(messageFromState.latest_reactions || []).filter(
            (r) => r.user_id !== userId,
          ),
          reaction,
        ]
      : [...(messageFromState.latest_reactions || []), reaction];

    return messageFromState;
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

  removeReaction(reaction: ReactionResponse, message?: MessageResponse) {
    const messageWithRemovedReaction = message;
    let messageFromState: LocalMessage | undefined;
    if (!messageWithRemovedReaction) {
      messageFromState = this.findMessage(reaction.message_id);
    }

    if (!messageWithRemovedReaction && !messageFromState) {
      return;
    }

    const messageToUpdate = messageWithRemovedReaction ?? messageFromState;
    const updateData = {
      id: messageToUpdate?.id,
      parent_id: messageToUpdate?.parent_id,
      pinned: messageToUpdate?.pinned,
      show_in_channel: messageToUpdate?.show_in_channel,
    };
    this._updateMessage(updateData, (msg) => {
      if (messageWithRemovedReaction) {
        messageWithRemovedReaction.own_reactions = this._removeOwnReactionFromMessage(
          msg.own_reactions,
          reaction,
        );
        return this.formatMessage(messageWithRemovedReaction);
      }

      if (messageFromState) {
        return this._removeReactionFromState(messageFromState, reaction);
      }

      return msg;
    });
    return messageWithRemovedReaction;
  }

  _removeReactionFromState(messageFromState: LocalMessage, reaction: ReactionResponse) {
    const reactionToRemove = messageFromState.own_reactions?.find(
      (r) => r.type === reaction.type,
    );
    if (reactionToRemove && messageFromState.reaction_groups?.[reactionToRemove.type]) {
      const newReactionGroup = messageFromState.reaction_groups[reactionToRemove.type];
      messageFromState.reaction_groups[reactionToRemove.type] = {
        ...newReactionGroup,
        count: newReactionGroup.count - 1,
        sum_scores: newReactionGroup.sum_scores - (reactionToRemove.score ?? 1),
      };
      // If there are no reactions left in this group, simply remove it.
      if (messageFromState.reaction_groups[reactionToRemove.type].count < 1) {
        delete messageFromState.reaction_groups[reactionToRemove.type];
      }
    }
    messageFromState.own_reactions = messageFromState.own_reactions?.filter(
      (r) => r.type !== reaction.type,
    );
    const userId = this._channel.getClient().userID;
    messageFromState.latest_reactions = messageFromState.latest_reactions?.filter(
      (r) => !(r.user_id === userId && r.type === reaction.type),
    );
    return messageFromState;
  }

  _updateQuotedMessageReferences({
    message,
    remove,
  }: {
    message: MessageResponse;
    remove?: boolean;
  }) {
    const parseMessage = (m: ReturnType<ChannelState['formatMessage']>) =>
      ({
        ...m,
        created_at: m.created_at.toISOString(),
        pinned_at: m.pinned_at?.toISOString(),
        updated_at: m.updated_at?.toISOString(),
      }) as unknown as MessageResponse;

    const update = (messages: LocalMessage[]) => {
      const updatedMessages = messages.reduce<MessageResponse[]>((acc, msg) => {
        if (msg.quoted_message_id === message.id) {
          acc.push({
            ...parseMessage(msg),
            quoted_message: remove ? { ...message, attachments: [] } : message,
          });
        }
        return acc;
      }, []);
      this.addMessagesSorted(updatedMessages, true);
    };

    // Main-list quoted-reference updates are handled by messagePaginator.reflectQuotedMessageUpdate;
    // here we only keep thread replies in sync.
    if (message.parent_id && this.threads[message.parent_id]) {
      update(this.threads[message.parent_id]);
    }
  }

  removeQuotedMessageReferences(message: MessageResponse) {
    this._updateQuotedMessageReferences({ message, remove: true });
  }

  /**
   * Updates all instances of given message in channel state
   * @param message
   * @param updateFunc
   */
  _updateMessage(
    message: {
      id?: string;
      parent_id?: string;
      pinned?: boolean;
      show_in_channel?: boolean;
    },
    updateFunc: (
      msg: ReturnType<ChannelState['formatMessage']>,
    ) => ReturnType<ChannelState['formatMessage']>,
  ) {
    const { parent_id, pinned } = message;

    if (parent_id && this.threads[parent_id]) {
      const thread = this.threads[parent_id];
      const msgIndex = thread.findIndex((msg) => msg.id === message.id);
      if (msgIndex !== -1) {
        thread[msgIndex] = updateFunc(thread[msgIndex]);
        this.threads[parent_id] = thread;
      }
    }

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
   * @param {Array<ReturnType<ChannelState['formatMessage']>>} messages A list of messages
   * @param message
   * @param {boolean} timestampChanged Whether updating a message with changed created_at value.
   * @param {string} sortBy field name to use to sort the messages by
   * @param {boolean} addIfDoesNotExist Add message if it is not in the list, used to prevent out of order updated messages from being added.
   */
  _addToMessageList(
    messages: Array<ReturnType<ChannelState['formatMessage']>>,
    message: ReturnType<ChannelState['formatMessage']>,
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

  /**
   * removeMessage - Description
   *
   * @param {{ id: string; parent_id?: string }} messageToRemove Object of the message to remove. Needs to have at id specified.
   *
   * @return {boolean} Returns if the message was removed
   */
  removeMessage(messageToRemove: { id: string; parent_id?: string }) {
    // The main channel message list is owned by the paginator (use messagePaginator.removeItem);
    // this only removes thread replies from state.threads.
    if (messageToRemove.parent_id && this.threads[messageToRemove.parent_id]) {
      const { removed, result: threadMessages } = this.removeMessageFromArray(
        this.threads[messageToRemove.parent_id],
        messageToRemove,
      );

      this.threads[messageToRemove.parent_id] = threadMessages;
      return removed;
    }

    return false;
  }

  removeMessageFromArray = (
    msgArray: Array<ReturnType<ChannelState['formatMessage']>>,
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
    const _updateUserMessages = (
      messages: Array<ReturnType<ChannelState['formatMessage']>>,
      user: UserResponse,
    ) => {
      for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        if (m.user?.id === user.id) {
          messages[i] = { ...m, user };
        }
      }
    };

    // Main-list user references are updated on the paginator (messagePaginator.reflectUserUpdate).
    for (const parentId in this.threads) {
      _updateUserMessages(this.threads[parentId], user);
    }

    _updateUserMessages(this.pinnedMessages, user);
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
    // Main-list deletions are applied on the paginator (messagePaginator.applyMessageDeletionForUser).
    for (const parentId in this.threads) {
      _deleteUserMessages({
        messages: this.threads[parentId],
        user,
        hardDelete,
        deletedAt: deletedAt ?? null,
      });
    }

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

  /**
   * findMessage - Finds a message inside the state
   *
   * @param {string} messageId The id of the message
   * @param {string} parentMessageId The id of the parent message, if we want load a thread reply
   *
   * @return {ReturnType<ChannelState['formatMessage']>} Returns the message, or undefined if the message wasn't found
   */
  findMessage(messageId: string, parentMessageId?: string) {
    if (parentMessageId) {
      const messages = this.threads[parentMessageId];
      if (!messages) {
        return undefined;
      }
      return messages.find((m) => m.id === messageId);
    }

    // Main channel messages live in the paginator — use channel.messagePaginator.getItem.
    return undefined;
  }
}
