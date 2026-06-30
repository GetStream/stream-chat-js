import type { Channel } from './channel';
import type {
  ChannelMemberResponse,
  EventPayload,
  LocalMessage,
  MessageResponse,
  MessageSet,
  MessageSetType,
  PendingMessageResponse,
  ReactionResponse,
  UserResponse,
} from './types';
import {
  deleteUserMessages as _deleteUserMessages,
  addToMessageList,
  formatMessage,
  isBlockedMessage,
} from './utils';
import { DEFAULT_MESSAGE_SET_PAGINATION } from './constants';
import type {
  ReadStateResponse as Gen_ReadStateResponse,
  UserResponseCommonFields as Gen_UserResponseCommonFields,
} from './gen/models';

type ChannelReadStatus = Record<
  string,
  Gen_ReadStateResponse & {
    first_unread_message_id?: string;
  }
>;

const messageSetBounds = (
  a: LocalMessage[] | MessageResponse[],
  b: LocalMessage[] | MessageResponse[],
) => ({
  newestMessageA: new Date(a[0]?.created_at ?? 0),
  oldestMessageA: new Date(a.slice(-1)[0]?.created_at ?? 0),
  newestMessageB: new Date(b[0]?.created_at ?? 0),
  oldestMessageB: new Date(b.slice(-1)[0]?.created_at ?? 0),
});

const aContainsOrEqualsB = (a: LocalMessage[], b: LocalMessage[]) => {
  const { newestMessageA, newestMessageB, oldestMessageA, oldestMessageB } =
    messageSetBounds(a, b);
  return newestMessageA >= newestMessageB && oldestMessageB >= oldestMessageA;
};

const aOverlapsB = (a: LocalMessage[], b: LocalMessage[]) => {
  const { newestMessageA, newestMessageB, oldestMessageA, oldestMessageB } =
    messageSetBounds(a, b);
  return (
    oldestMessageA < oldestMessageB &&
    oldestMessageB < newestMessageA &&
    newestMessageA < newestMessageB
  );
};

const messageSetsOverlapByTimestamp = (a: LocalMessage[], b: LocalMessage[]) =>
  aContainsOrEqualsB(a, b) ||
  aContainsOrEqualsB(b, a) ||
  aOverlapsB(a, b) ||
  aOverlapsB(b, a);

/**
 * Container class for the channel state.
 */
export class ChannelState {
  _channel: Channel;
  watcher_count: number;
  typing: Record<string, EventPayload<'typing.start' | 'typing.stop'>>;
  read: ChannelReadStatus;
  pinnedMessages: Array<ReturnType<ChannelState['formatMessage']>>;
  pending_messages: Array<PendingMessageResponse>;
  threads: Record<string, Array<ReturnType<ChannelState['formatMessage']>>>;
  mutedUsers: Array<UserResponse>;
  watchers: Record<string, UserResponse>;
  members: Record<string, ChannelMemberResponse>;
  unreadCount: number;
  membership: ChannelMemberResponse | undefined;
  last_message_at: Date | null;
  /**
   * Flag which indicates if channel state contain latest/recent messages or no.
   * This flag should be managed by UI sdks using a setter - setIsUpToDate.
   * When false, any new message (received by WebSocket event - message.new) will not
   * be pushed on to message list.
   */
  isUpToDate: boolean;
  /**
   * Disjoint lists of messages
   * Users can jump in the message list (with searching) and this can result in disjoint lists of messages
   * The state manages these lists and merges them when lists overlap
   * The messages array contains the currently active set
   */
  messageSets: MessageSet[] = [];

  constructor(channel: Channel) {
    this._channel = channel;
    this.watcher_count = 0;
    this.typing = {};
    this.read = {};
    this.initMessages();
    this.pinnedMessages = [];
    this.pending_messages = [];
    this.threads = {};
    // a list of users to hide messages from
    this.mutedUsers = [];
    this.watchers = {};
    this.members = {};
    this.membership = undefined;
    this.unreadCount = 0;
    /**
     * Flag which indicates if channel state contain latest/recent messages or no.
     * This flag should be managed by UI sdks using a setter - setIsUpToDate.
     * When false, any new message (received by WebSocket event - message.new) will not
     * be pushed on to message list.
     */
    this.isUpToDate = true;
    this.last_message_at =
      channel?.state?.last_message_at != null
        ? new Date(channel.state.last_message_at)
        : null;
  }

  get messages() {
    return this.messageSets.find((s) => s.isCurrent)?.messages || [];
  }

  set messages(messages: Array<ReturnType<ChannelState['formatMessage']>>) {
    const index = this.messageSets.findIndex((s) => s.isCurrent);
    this.messageSets[index].messages = messages;
  }

  /**
   * The list of latest messages
   * The messages array not always contains the latest messages (for example if a user searched for an earlier message, that is in a different message set)
   */
  get latestMessages() {
    return this.messageSets.find((s) => s.isLatest)?.messages || [];
  }

  set latestMessages(messages: Array<ReturnType<ChannelState['formatMessage']>>) {
    const index = this.messageSets.findIndex((s) => s.isLatest);
    this.messageSets[index].messages = messages;
  }

  get messagePagination() {
    return (
      this.messageSets.find((s) => s.isCurrent)?.pagination ||
      DEFAULT_MESSAGE_SET_PAGINATION
    );
  }

  pruneOldest(maxMessages: number) {
    const currentIndex = this.messageSets.findIndex((s) => s.isCurrent);
    if (this.messageSets[currentIndex].isLatest) {
      const newMessages = this.messageSets[currentIndex].messages;
      this.messageSets[currentIndex].messages = newMessages.slice(-maxMessages);
      this.messageSets[currentIndex].pagination.hasPrev = true;
    }
  }

  /**
   * Adds the provided message to the state.
   *
   * @param newMessage - The new message to add.
   * @param timestampChanged - Whether updating a message with a changed `created_at` value
   *   (optional, defaults to `false`).
   * @param addIfDoesNotExist - Add the message if it is not in the list. Used to prevent
   *   out-of-order updated messages from being added (optional, defaults to `true`).
   * @param messageSetToAddToIfDoesNotExist - Which message set to add to if the message is not in
   *   the list. Only used when `addIfDoesNotExist` is `true` (optional, defaults to `'latest'`).
   */
  addMessageSorted(
    newMessage: MessageResponse | LocalMessage,
    timestampChanged = false,
    addIfDoesNotExist = true,
    messageSetToAddToIfDoesNotExist: MessageSetType = 'latest',
  ) {
    return this.addMessagesSorted(
      [newMessage],
      timestampChanged,
      false,
      addIfDoesNotExist,
      messageSetToAddToIfDoesNotExist,
    );
  }

  /**
   * Takes the message object, parses the dates, sets `__html`
   * and sets the status to `received` if missing; returns a new message object.
   *
   * @param message - `MessageResponse` object
   */
  formatMessage = (message: MessageResponse | LocalMessage) => formatMessage(message);

  /**
   * Adds the provided messages to state and resorts the list.
   *
   * @param newMessages - The list of messages to add.
   * @param timestampChanged - Whether updating messages with a changed `created_at` value
   *   (optional, defaults to `false`).
   * @param initializing - Whether the channel is being initialized (optional, defaults to `false`).
   * @param addIfDoesNotExist - Add the message if it is not in the list. Used to prevent
   *   out-of-order updated messages from being added (optional, defaults to `true`).
   * @param messageSetToAddToIfDoesNotExist - Which message set to add to if messages are not in
   *   the list. Only used when `addIfDoesNotExist` is `true` (optional, defaults to `'current'`).
   */
  addMessagesSorted(
    newMessages: (MessageResponse | LocalMessage)[],
    timestampChanged = false,
    initializing = false,
    addIfDoesNotExist = true,
    messageSetToAddToIfDoesNotExist: MessageSetType = 'current',
  ) {
    const { messagesToAdd, targetMessageSetIndex } = this.findTargetMessageSet(
      newMessages,
      addIfDoesNotExist,
      messageSetToAddToIfDoesNotExist,
    );

    const filteredMessageIds: string[] = [];

    for (let i = 0; i < messagesToAdd.length; i += 1) {
      const isFromShadowBannedUser = messagesToAdd[i].shadowed;
      if (isFromShadowBannedUser && addIfDoesNotExist) {
        filteredMessageIds.push(messagesToAdd[i].id);
        continue;
      }
      // If message is already formatted we can skip the tasks below
      // This will be true for messages that are already present at the state -> this happens when we perform merging of message sets
      // This will be also true for message previews used by some SDKs
      const isMessageFormatted =
        typeof (messagesToAdd[i] as LocalMessage).status === 'string';
      let message: ReturnType<ChannelState['formatMessage']>;
      if (isMessageFormatted) {
        message = messagesToAdd[i] as ReturnType<ChannelState['formatMessage']>;
      } else {
        message = this.formatMessage(messagesToAdd[i]);
      }

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

      // update or append the messages...
      const parentID = message.parent_id;

      // add to the given message set
      if ((!parentID || message.show_in_channel) && targetMessageSetIndex !== -1) {
        this.messageSets[targetMessageSetIndex].messages = this._addToMessageList(
          this.messageSets[targetMessageSetIndex].messages,
          message,
          timestampChanged,
          'created_at',
          addIfDoesNotExist,
        );
      }

      /**
       * Add message to thread if applicable and the message
       * was added when querying for replies, or the thread already exits.
       * This is to prevent the thread state from getting out of sync if
       * a thread message is shown in channel but older than the newest thread
       * message. This situation can result in a thread state where a random
       * message is "oldest" message, and newer messages are therefore not loaded.
       * This can also occur if an old thread message is updated.
       */
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

    return {
      messageSet: this.messageSets[targetMessageSetIndex],
      filteredMessageIds,
    };
  }

  /**
   * Adds the provided messages to the `pinnedMessages` property.
   *
   * @param pinnedMessages - A list of pinned messages.
   */
  addPinnedMessages(pinnedMessages: MessageResponse[]) {
    for (let i = 0; i < pinnedMessages.length; i += 1) {
      this.addPinnedMessage(pinnedMessages[i]);
    }
  }

  /**
   * Adds a single message to the `pinnedMessages` list.
   *
   * @param pinnedMessage - The pinned message to add or update.
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
   * Removes the provided pinned message from `pinnedMessages`.
   *
   * @param message - The pinned message to remove.
   */
  removePinnedMessage(message: MessageResponse) {
    const { result } = this.removeMessageFromArray(this.pinnedMessages, message);
    this.pinnedMessages = result;
  }

  addReaction(
    reaction: ReactionResponse,
    message?: MessageResponse,
    enforce_unique?: boolean,
  ): MessageResponse | LocalMessage | undefined {
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
          this._channel.getClient().userId === reaction.user_id
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
          latest_reactions_by: [],
        }
      : {
          count: 1,
          first_reaction_at: reaction.created_at,
          last_reaction_at: reaction.created_at,
          sum_scores: score,
          latest_reactions_by: [],
        };

    // 3. Update the own_reactions with the new reaction.
    messageFromState.own_reactions = this._addOwnReactionToMessage(
      messageFromState.own_reactions,
      reaction,
      enforce_unique,
    );

    // 4. Finally, update the latest_reactions with the new reaction,
    //    while respecting enforce_unique.
    const userId = this._channel.getClient().userId;
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
    if (this._channel.getClient().userId === reaction.user_id) {
      ownReactions.push(reaction);
    }

    return ownReactions;
  }

  _removeOwnReactionFromMessage(
    ownReactions: ReactionResponse[] | null | undefined,
    reaction: ReactionResponse,
  ): ReactionResponse[] {
    if (ownReactions) {
      return ownReactions.filter(
        (item) => item.user_id !== reaction.user_id || item.type !== reaction.type,
      );
    }
    return [];
  }

  removeReaction(
    reaction: ReactionResponse,
    message?: MessageResponse,
  ): MessageResponse | LocalMessage | undefined {
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
    const userId = this._channel.getClient().userId;
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
    const update = (messages: LocalMessage[]) => {
      const updatedMessages = messages.reduce<LocalMessage[]>((acc, msg) => {
        if (msg.quoted_message_id === message.id) {
          acc.push({
            ...msg,
            quoted_message: remove ? { ...message, attachments: [] } : message,
          });
        }
        return acc;
      }, []);
      this.addMessagesSorted(updatedMessages, true);
    };

    if (!message.parent_id) {
      this.messageSets.forEach((set) => update(set.messages));
    } else if (message.parent_id && this.threads[message.parent_id]) {
      // prevent going through all the threads even though it is possible to quote a message from another thread
      update(this.threads[message.parent_id]);
    }
  }

  removeQuotedMessageReferences(message: MessageResponse) {
    this._updateQuotedMessageReferences({ message, remove: true });
  }

  /**
   * Updates all instances of given message in channel state.
   *
   * @param message - The message identity (`id`, optional `parent_id`, `pinned`, `show_in_channel`).
   * @param updateFunc - Transform applied to the existing formatted message.
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
    const { parent_id, show_in_channel, pinned } = message;

    if (parent_id && this.threads[parent_id]) {
      const thread = this.threads[parent_id];
      const msgIndex = thread.findIndex((msg) => msg.id === message.id);
      if (msgIndex !== -1) {
        thread[msgIndex] = updateFunc(thread[msgIndex]);
        this.threads[parent_id] = thread;
      }
    }

    if ((!show_in_channel && !parent_id) || show_in_channel) {
      const messageSetIndex = this.findMessageSetIndex(message);
      if (messageSetIndex !== -1) {
        const msgIndex = this.messageSets[messageSetIndex].messages.findIndex(
          (msg) => msg.id === message.id,
        );
        if (msgIndex !== -1) {
          const upMsg = updateFunc(this.messageSets[messageSetIndex].messages[msgIndex]);
          this.messageSets[messageSetIndex].messages[msgIndex] = upMsg;
        }
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
   * @param isUpToDate  - Flag which indicates if channel state contain latest/recent messages or no.
   *                    This flag should be managed by UI sdks using a setter - setIsUpToDate.
   *                    When false, any new message (received by WebSocket event - message.new) will not
   *                    be pushed on to message list.
   */
  setIsUpToDate = (isUpToDate: boolean) => {
    this.isUpToDate = isUpToDate;
  };

  /**
   * Adds a message to a list of messages. Tries to update first; appends if the message isn't found.
   *
   * @param messages - A list of messages.
   * @param message - The formatted message to add or update.
   * @param timestampChanged - Whether updating a message with a changed `created_at` value
   *   (optional, defaults to `false`).
   * @param sortBy - Field name to use to sort the messages by (optional, defaults to `'created_at'`).
   * @param addIfDoesNotExist - Add the message if it is not in the list. Used to prevent
   *   out-of-order updated messages from being added (optional, defaults to `true`).
   * @returns The updated list of messages.
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
   * Removes a message from channel state.
   *
   * @param messageToRemove - The message to remove. Must have at least its `id` specified.
   * @returns `true` when a matching message was found and removed.
   */
  removeMessage(messageToRemove: {
    id: string;
    messageSetIndex?: number;
    parent_id?: string;
  }) {
    let isRemoved = false;
    if (messageToRemove.parent_id && this.threads[messageToRemove.parent_id]) {
      const { removed, result: threadMessages } = this.removeMessageFromArray(
        this.threads[messageToRemove.parent_id],
        messageToRemove,
      );

      this.threads[messageToRemove.parent_id] = threadMessages;
      isRemoved = removed;
    } else {
      const messageSetIndex =
        messageToRemove.messageSetIndex ?? this.findMessageSetIndex(messageToRemove);
      if (messageSetIndex !== -1) {
        const { removed, result: messages } = this.removeMessageFromArray(
          this.messageSets[messageSetIndex].messages,
          messageToRemove,
        );
        this.messageSets[messageSetIndex].messages = messages;
        isRemoved = removed;
      }
    }

    return isRemoved;
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
   * Updates the `message.user` property with the supplied user object across all messages.
   *
   * @param user - The user whose embedded copy should be refreshed on each authored message.
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

    this.messageSets.forEach((set) => _updateUserMessages(set.messages, user));

    for (const parentId in this.threads) {
      _updateUserMessages(this.threads[parentId], user);
    }

    _updateUserMessages(this.pinnedMessages, user);
  };

  /**
   * Marks all messages authored by the given user as deleted.
   *
   * @param user - The user whose messages should be marked deleted.
   * @param hardDelete - When `true`, drop the messages instead of marking them deleted
   *   (optional, defaults to `false`).
   * @param deletedAt - Override timestamp for the `deleted_at` field (optional).
   */
  deleteUserMessages = (
    user: UserResponse,
    hardDelete = false,
    deletedAt?: LocalMessage['deleted_at'],
  ) => {
    this.messageSets.forEach(({ messages }) =>
      _deleteUserMessages({ messages, user, hardDelete, deletedAt }),
    );

    for (const parentId in this.threads) {
      _deleteUserMessages({
        messages: this.threads[parentId],
        user,
        hardDelete,
        deletedAt,
      });
    }

    _deleteUserMessages({
      messages: this.pinnedMessages,
      user,
      hardDelete,
      deletedAt,
    });
  };

  /**
   * Removes error messages from the channel state.
   */
  filterErrorMessages() {
    const filteredMessages = this.latestMessages.filter(
      (message) => message.type !== 'error',
    );

    const blockedMessages = this.latestMessages.filter(isBlockedMessage);
    // We need to hard delete the blocked messages from the offline database.
    for (const message of blockedMessages) {
      this._channel.getClient().offlineDb?.hardDeleteMessage({ id: message.id });
    }

    this.latestMessages = filteredMessages;
  }

  /**
   * Removes stale data such as users that stayed in typing state for more than 5 seconds.
   */
  clean() {
    const now = new Date();
    // prevent old users from showing up as typing
    for (const [userId, lastEvent] of Object.entries(this.typing)) {
      const receivedAt =
        typeof lastEvent.received_at === 'string'
          ? new Date(lastEvent.received_at)
          : lastEvent.received_at || new Date();
      if (now.getTime() - receivedAt.getTime() > 7000) {
        delete this.typing[userId];
        this._channel.getClient().dispatchEvent({
          cid: this._channel.cid,
          type: 'typing.stop',
          user: { id: userId } as Gen_UserResponseCommonFields,
          custom: {},
          created_at: new Date(),
        });
      }
    }
  }

  clearMessages() {
    this.initMessages();
    this.pinnedMessages = [];
  }

  initMessages() {
    this.messageSets = [
      {
        messages: [],
        isLatest: true,
        isCurrent: true,
        pagination: { ...DEFAULT_MESSAGE_SET_PAGINATION },
      },
    ];
  }

  /**
   * Loads a given message (and messages around it) into the state.
   *
   * @param messageId - The ID of the message, or `'latest'` to indicate switching to the latest messages.
   * @param parentMessageId - The ID of the parent message, when we want to load a thread reply
   *   (optional).
   * @param limit - The page size if the message has to be queried from the server (optional,
   *   defaults to `25`).
   */
  async loadMessageIntoState(
    messageId: string | 'latest',
    parentMessageId?: string,
    limit = 25,
  ) {
    let messageSetIndex: number;
    let switchedToMessageSet = false;
    let loadedMessageThread = false;
    const messageIdToFind = parentMessageId || messageId;
    if (messageId === 'latest') {
      if (this.messages === this.latestMessages) {
        return;
      }
      messageSetIndex = this.messageSets.findIndex((s) => s.isLatest);
    } else {
      messageSetIndex = this.findMessageSetIndex({ id: messageIdToFind });
    }
    if (messageSetIndex !== -1) {
      this.switchToMessageSet(messageSetIndex);
      switchedToMessageSet = true;
    }
    loadedMessageThread =
      !parentMessageId ||
      !!this.threads[parentMessageId]?.find((m) => m.id === messageId);
    if (switchedToMessageSet && loadedMessageThread) {
      return;
    }
    if (!switchedToMessageSet) {
      await this._channel.query(
        { messages: { id_around: messageIdToFind, limit } },
        'new',
      );
    }
    if (!loadedMessageThread && parentMessageId) {
      await this._channel.getReplies({
        parent_id: parentMessageId,
        id_around: messageId,
        limit,
      });
    }
    messageSetIndex = this.findMessageSetIndex({ id: messageIdToFind });
    if (messageSetIndex !== -1) {
      this.switchToMessageSet(messageSetIndex);
    }
  }

  /**
   * Finds a message inside the state.
   *
   * @param messageId - The ID of the message.
   * @param parentMessageId - The ID of the parent message, when we want to load a thread reply
   *   (optional).
   * @returns The matching message, or `undefined` if no message was found.
   */
  findMessage(messageId: string, parentMessageId?: string) {
    if (parentMessageId) {
      const messages = this.threads[parentMessageId];
      if (!messages) {
        return undefined;
      }
      return messages.find((m) => m.id === messageId);
    }

    const messageSetIndex = this.findMessageSetIndex({ id: messageId });
    if (messageSetIndex === -1) {
      return undefined;
    }
    return this.messageSets[messageSetIndex].messages.find((m) => m.id === messageId);
  }

  findMessageByTimestamp(
    timestampMs: number,
    parentMessageId?: string,
    exactTsMatch: boolean = false,
  ): LocalMessage | null {
    if (
      (parentMessageId && !this.threads[parentMessageId]) ||
      this.messageSets.length === 0
    )
      return null;
    const setIndex = this.findMessageSetByOldestTimestamp(timestampMs);
    const targetMsgSet = this.messageSets[setIndex]?.messages;
    if (!targetMsgSet?.length) return null;
    const firstMsgTimestamp = targetMsgSet[0].created_at.getTime();
    const lastMsgTimestamp = targetMsgSet.slice(-1)[0].created_at.getTime();
    const isOutOfBound =
      timestampMs < firstMsgTimestamp || lastMsgTimestamp < timestampMs;
    if (isOutOfBound && exactTsMatch) return null;

    let msgIndex = 0,
      hi = targetMsgSet.length - 1;
    while (msgIndex < hi) {
      const mid = (msgIndex + hi) >>> 1;
      if (timestampMs <= targetMsgSet[mid].created_at.getTime()) hi = mid;
      else msgIndex = mid + 1;
    }

    const foundMessage = targetMsgSet[msgIndex];
    return !exactTsMatch
      ? foundMessage
      : foundMessage.created_at.getTime() === timestampMs
        ? foundMessage
        : null;
  }

  private switchToMessageSet(index: number) {
    const currentMessages = this.messageSets.find((s) => s.isCurrent);
    if (!currentMessages) {
      return;
    }
    currentMessages.isCurrent = false;
    this.messageSets[index].isCurrent = true;
  }

  private areMessageSetsOverlap(
    messages1: Array<{ id: string }>,
    messages2: Array<{ id: string }>,
  ) {
    return messages1.some((m1) => messages2.find((m2) => m1.id === m2.id));
  }

  private findMessageSetIndex(message: { id?: string }) {
    return this.messageSets.findIndex(
      (set) => !!set.messages.find((m) => m.id === message.id),
    );
  }

  /**
   * Identifies the set index into which a message set would belong if its first item's creation
   * date corresponded to `oldestTimestampMs`.
   *
   * @param oldestTimestampMs - The oldest timestamp (in milliseconds) of the candidate message set.
   * @returns The matching message set index, or `-1` when none is found.
   */
  private findMessageSetByOldestTimestamp = (oldestTimestampMs: number): number => {
    let lo = 0,
      hi = this.messageSets.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const msgSet = this.messageSets[mid];
      // should not happen
      if (msgSet.messages.length === 0) return -1;

      const oldestMessageTimestampInSet = msgSet.messages[0].created_at.getTime();
      if (oldestMessageTimestampInSet <= oldestTimestampMs) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  };

  private findTargetMessageSet(
    newMessages: (MessageResponse | LocalMessage)[],
    addIfDoesNotExist = true,
    messageSetToAddToIfDoesNotExist: MessageSetType = 'current',
  ) {
    let messagesToAdd: (MessageResponse | LocalMessage)[] = newMessages;
    let targetMessageSetIndex!: number;
    if (newMessages.length === 0)
      return { targetMessageSetIndex: 0, messagesToAdd: newMessages };
    if (addIfDoesNotExist) {
      const overlappingMessageSetIndicesByMsgIds = this.messageSets
        .map((_, i) => i)
        .filter((i) =>
          this.areMessageSetsOverlap(this.messageSets[i].messages, newMessages),
        );
      const overlappingMessageSetIndicesByTimestamp = this.messageSets
        .map((_, i) => i)
        .filter((i) =>
          messageSetsOverlapByTimestamp(
            this.messageSets[i].messages,
            newMessages.map(formatMessage),
          ),
        );
      switch (messageSetToAddToIfDoesNotExist) {
        case 'new':
          if (overlappingMessageSetIndicesByMsgIds.length > 0) {
            targetMessageSetIndex = overlappingMessageSetIndicesByMsgIds[0];
          } else if (overlappingMessageSetIndicesByTimestamp.length > 0) {
            targetMessageSetIndex = overlappingMessageSetIndicesByTimestamp[0];
            // No new message set is created if newMessages only contains thread replies
          } else if (newMessages.some((m) => !m.parent_id)) {
            // find the index to insert the set
            const setIngestIndex = this.findMessageSetByOldestTimestamp(
              // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
              new Date(newMessages[0].created_at!).getTime(),
            );
            if (setIngestIndex === -1) {
              this.messageSets.push({
                messages: [],
                isCurrent: false,
                isLatest: false,
                pagination: { ...DEFAULT_MESSAGE_SET_PAGINATION },
              });
              targetMessageSetIndex = this.messageSets.length - 1;
            } else {
              const isLatest = setIngestIndex === 0;
              this.messageSets.splice(setIngestIndex, 0, {
                messages: [],
                isCurrent: false,
                isLatest,
                pagination: { ...DEFAULT_MESSAGE_SET_PAGINATION }, // fixme: it is problematic decide about pagination without having data
              });
              if (isLatest) {
                this.messageSets.slice(1).forEach((set) => {
                  set.isLatest = false;
                });
              }
              targetMessageSetIndex = setIngestIndex;
            }
          }
          break;
        case 'current':
          // determine if there is another set to which it would match taken into consideration the timestamp
          if (overlappingMessageSetIndicesByTimestamp.length > 0) {
            targetMessageSetIndex = overlappingMessageSetIndicesByTimestamp[0];
          } else {
            targetMessageSetIndex = this.messageSets.findIndex((s) => s.isCurrent);
          }
          break;
        case 'latest':
          // determine if there is another set to which it would match taken into consideration the timestamp
          if (overlappingMessageSetIndicesByTimestamp.length > 0) {
            targetMessageSetIndex = overlappingMessageSetIndicesByTimestamp[0];
          } else {
            targetMessageSetIndex = this.messageSets.findIndex((s) => s.isLatest);
          }
          break;
        default:
          targetMessageSetIndex = -1;
      }
      // when merging the target set will be the first one from the overlapping message sets
      const mergeTargetMessageSetIndex = overlappingMessageSetIndicesByMsgIds.splice(
        0,
        1,
      )[0];
      const mergeSourceMessageSetIndices = [...overlappingMessageSetIndicesByMsgIds];
      if (
        mergeTargetMessageSetIndex !== undefined &&
        mergeTargetMessageSetIndex !== targetMessageSetIndex
      ) {
        mergeSourceMessageSetIndices.push(targetMessageSetIndex);
      }
      // merge message sets
      if (mergeSourceMessageSetIndices.length > 0) {
        const target = this.messageSets[mergeTargetMessageSetIndex];
        const sources = this.messageSets.filter(
          (_, i) => mergeSourceMessageSetIndices.indexOf(i) !== -1,
        );
        sources.forEach((messageSet) => {
          target.isLatest = target.isLatest || messageSet.isLatest;
          target.isCurrent = target.isCurrent || messageSet.isCurrent;
          target.pagination.hasPrev =
            messageSet.messages[0].created_at < target.messages[0].created_at
              ? messageSet.pagination.hasPrev
              : target.pagination.hasPrev;
          target.pagination.hasNext =
            target.messages.slice(-1)[0].created_at <
            messageSet.messages.slice(-1)[0].created_at
              ? messageSet.pagination.hasNext
              : target.pagination.hasNext;
          messagesToAdd = [...messagesToAdd, ...messageSet.messages];
        });
        sources.forEach((s) => this.messageSets.splice(this.messageSets.indexOf(s), 1));
        const overlappingMessageSetIndex = this.messageSets.findIndex((s) =>
          this.areMessageSetsOverlap(s.messages, newMessages),
        );
        targetMessageSetIndex = overlappingMessageSetIndex;
      }
    } else {
      // assumes that all new messages belong to the same set
      targetMessageSetIndex = this.findMessageSetIndex(newMessages[0]);
    }

    return { targetMessageSetIndex, messagesToAdd };
  }
}
