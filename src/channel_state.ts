import { Channel } from './channel';
import {
  ChannelMemberResponse,
  ChannelMembership,
  FormatMessageResponse,
  Event,
  ExtendableGenerics,
  DefaultGenerics,
  MessageSetType,
  MessageResponse,
  ReactionResponse,
  UserResponse,
} from './types';

type ChannelReadStatus<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = Record<
  string,
  { last_read: Date; unread_messages: number; user: UserResponse<StreamChatGenerics> }
>;

/**
 * ChannelState - A container class for the channel state.
 */
export class ChannelState<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> {
  _channel: Channel<StreamChatGenerics>;
  watcher_count: number;
  typing: Record<string, Event<StreamChatGenerics>>;
  read: ChannelReadStatus<StreamChatGenerics>;
  pinnedMessages: Array<ReturnType<ChannelState<StreamChatGenerics>['formatMessage']>>;
  threads: Record<string, Array<ReturnType<ChannelState<StreamChatGenerics>['formatMessage']>>>;
  mutedUsers: Array<UserResponse<StreamChatGenerics>>;
  watchers: Record<string, UserResponse<StreamChatGenerics>>;
  members: Record<string, ChannelMemberResponse<StreamChatGenerics>>;
  unreadCount: number;
  membership: ChannelMembership<StreamChatGenerics>;
  last_message_at: Date | null;
  /**
   * Flag which indicates if channel state contain latest/recent messages or no.
   * This flag should be managed by UI sdks using a setter - setIsUpToDate.
   * When false, any new message (received by websocket event - message.new) will not
   * be pushed on to message list.
   */
  isUpToDate: boolean;
  /**
   * Disjoint lists of messages
   * Users can jump in the message list (with searching) and this can result in disjoint lists of messages
   * The state manages these lists and merges them when lists overlap
   * The messages array contains the currently active set
   */
  messageSets: {
    isCurrent: boolean;
    isLatest: boolean;
    messages: Array<ReturnType<ChannelState<StreamChatGenerics>['formatMessage']>>;
  }[] = [];
  constructor(channel: Channel<StreamChatGenerics>) {
    this._channel = channel;
    this.watcher_count = 0;
    this.typing = {};
    this.read = {};
    this.initMessages();
    this.pinnedMessages = [];
    this.threads = {};
    // a list of users to hide messages from
    this.mutedUsers = [];
    this.watchers = {};
    this.members = {};
    this.membership = {};
    this.unreadCount = 0;
    /**
     * Flag which indicates if channel state contain latest/recent messages or no.
     * This flag should be managed by UI sdks using a setter - setIsUpToDate.
     * When false, any new message (received by websocket event - message.new) will not
     * be pushed on to message list.
     */
    this.isUpToDate = true;
    this.last_message_at = channel?.state?.last_message_at != null ? new Date(channel.state.last_message_at) : null;
  }

  get messages() {
    return this.messageSets.find((s) => s.isCurrent)?.messages || [];
  }

  set messages(messages: Array<ReturnType<ChannelState<StreamChatGenerics>['formatMessage']>>) {
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

  set latestMessages(messages: Array<ReturnType<ChannelState<StreamChatGenerics>['formatMessage']>>) {
    const index = this.messageSets.findIndex((s) => s.isLatest);
    this.messageSets[index].messages = messages;
  }

  /**
   * addMessageSorted - Add a message to the state
   *
   * @param {MessageResponse<StreamChatGenerics>} newMessage A new message
   * @param {boolean} timestampChanged Whether updating a message with changed created_at value.
   * @param {boolean} addIfDoesNotExist Add message if it is not in the list, used to prevent out of order updated messages from being added.
   * @param {MessageSetType} messageSetToAddToIfDoesNotExist Which message set to add to if message is not in the list (only used if addIfDoesNotExist is true)
   */
  addMessageSorted(
    newMessage: MessageResponse<StreamChatGenerics>,
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
   * formatMessage - Takes the message object. Parses the dates, sets __html
   * and sets the status to received if missing. Returns a message object
   *
   * @param {MessageResponse<StreamChatGenerics>} message a message object
   *
   */
  formatMessage(message: MessageResponse<StreamChatGenerics>): FormatMessageResponse<StreamChatGenerics> {
    return {
      ...message,
      /**
       * @deprecated please use `html`
       */
      __html: message.html,
      // parse the date..
      pinned_at: message.pinned_at ? new Date(message.pinned_at) : null,
      created_at: message.created_at ? new Date(message.created_at) : new Date(),
      updated_at: message.updated_at ? new Date(message.updated_at) : new Date(),
      status: message.status || 'received',
    };
  }

  /**
   * addMessagesSorted - Add the list of messages to state and resorts the messages
   *
   * @param {Array<MessageResponse<StreamChatGenerics>>} newMessages A list of messages
   * @param {boolean} timestampChanged Whether updating messages with changed created_at value.
   * @param {boolean} initializing Whether channel is being initialized.
   * @param {boolean} addIfDoesNotExist Add message if it is not in the list, used to prevent out of order updated messages from being added.
   * @param {MessageSetType} messageSetToAddToIfDoesNotExist Which message set to add to if messages are not in the list (only used if addIfDoesNotExist is true)
   *
   */
  addMessagesSorted(
    newMessages: MessageResponse<StreamChatGenerics>[],
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

    for (let i = 0; i < messagesToAdd.length; i += 1) {
      const isFromShadowBannedUser = messagesToAdd[i].shadowed;
      if (isFromShadowBannedUser) {
        continue;
      }
      // If message is already formatted we can skip the tasks below
      // This will be true for messages that are already present at the state -> this happens when we perform merging of message sets
      // This will be also true for message previews used by some SDKs
      const isMessageFormatted = messagesToAdd[i].created_at instanceof Date;
      let message: ReturnType<ChannelState<StreamChatGenerics>['formatMessage']>;
      if (isMessageFormatted) {
        message = messagesToAdd[i] as ReturnType<ChannelState<StreamChatGenerics>['formatMessage']>;
      } else {
        message = this.formatMessage(messagesToAdd[i] as MessageResponse<StreamChatGenerics>);

        if (message.user && this._channel?.cid) {
          /**
           * Store the reference to user for this channel, so that when we have to
           * handle updates to user, we can use the reference map, to determine which
           * channels need to be updated with updated user object.
           */
          this._channel.getClient().state.updateUserReference(message.user, this._channel.cid);
        }

        if (initializing && message.id && this.threads[message.id]) {
          // If we are initializing the state of channel (e.g., in case of connection recovery),
          // then in that case we remove thread related to this message from threads object.
          // This way we can ensure that we don't have any stale data in thread object
          // and consumer can refetch the replies.
          delete this.threads[message.id];
        }

        if (!this.last_message_at) {
          this.last_message_at = new Date(message.created_at.getTime());
        }

        if (message.created_at.getTime() > this.last_message_at.getTime()) {
          this.last_message_at = new Date(message.created_at.getTime());
        }
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
        const threadMessages = this._addToMessageList(
          thread,
          message,
          timestampChanged,
          'created_at',
          addIfDoesNotExist,
        );
        this.threads[parentID] = threadMessages;
      }
    }
  }

  /**
   * addPinnedMessages - adds messages in pinnedMessages property
   *
   * @param {Array<MessageResponse<StreamChatGenerics>>} pinnedMessages A list of pinned messages
   *
   */
  addPinnedMessages(pinnedMessages: MessageResponse<StreamChatGenerics>[]) {
    for (let i = 0; i < pinnedMessages.length; i += 1) {
      this.addPinnedMessage(pinnedMessages[i]);
    }
  }

  /**
   * addPinnedMessage - adds message in pinnedMessages
   *
   * @param {MessageResponse<StreamChatGenerics>} pinnedMessage message to update
   *
   */
  addPinnedMessage(pinnedMessage: MessageResponse<StreamChatGenerics>) {
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
   * @param {MessageResponse<StreamChatGenerics>} message message to remove
   *
   */
  removePinnedMessage(message: MessageResponse<StreamChatGenerics>) {
    const { result } = this.removeMessageFromArray(this.pinnedMessages, message);
    this.pinnedMessages = result;
  }

  addReaction(
    reaction: ReactionResponse<StreamChatGenerics>,
    message?: MessageResponse<StreamChatGenerics>,
    enforce_unique?: boolean,
  ) {
    if (!message) return;
    const messageWithReaction = message;
    this._updateMessage(message, (msg) => {
      messageWithReaction.own_reactions = this._addOwnReactionToMessage(msg.own_reactions, reaction, enforce_unique);
      return this.formatMessage(messageWithReaction);
    });
    return messageWithReaction;
  }

  _addOwnReactionToMessage(
    ownReactions: ReactionResponse<StreamChatGenerics>[] | null | undefined,
    reaction: ReactionResponse<StreamChatGenerics>,
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
    ownReactions: ReactionResponse<StreamChatGenerics>[] | null | undefined,
    reaction: ReactionResponse<StreamChatGenerics>,
  ) {
    if (ownReactions) {
      return ownReactions.filter((item) => item.user_id !== reaction.user_id || item.type !== reaction.type);
    }
    return ownReactions;
  }

  removeReaction(reaction: ReactionResponse<StreamChatGenerics>, message?: MessageResponse<StreamChatGenerics>) {
    if (!message) return;
    const messageWithReaction = message;
    this._updateMessage(message, (msg) => {
      messageWithReaction.own_reactions = this._removeOwnReactionFromMessage(msg.own_reactions, reaction);
      return this.formatMessage(messageWithReaction);
    });
    return messageWithReaction;
  }

  removeQuotedMessageReferences(message: MessageResponse<StreamChatGenerics>) {
    const parseMessage = (m: ReturnType<ChannelState<StreamChatGenerics>['formatMessage']>) =>
      (({
        ...m,
        created_at: m.created_at.toString(),
        pinned_at: m.pinned_at?.toString(),
        updated_at: m.updated_at?.toString(),
      } as unknown) as MessageResponse<StreamChatGenerics>);

    this.messageSets.forEach((set) => {
      const updatedMessages = set.messages
        .filter((msg) => msg.quoted_message_id === message.id)
        .map(parseMessage)
        .map((msg) => ({ ...msg, quoted_message: { ...message, attachments: [] } }));

      this.addMessagesSorted(updatedMessages, true);
    });
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
      msg: ReturnType<ChannelState<StreamChatGenerics>['formatMessage']>,
    ) => ReturnType<ChannelState<StreamChatGenerics>['formatMessage']>,
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
        const msgIndex = this.messageSets[messageSetIndex].messages.findIndex((msg) => msg.id === message.id);
        if (msgIndex !== -1) {
          this.messageSets[messageSetIndex].messages[msgIndex] = updateFunc(
            this.messageSets[messageSetIndex].messages[msgIndex],
          );
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
   * @param {Array<ReturnType<ChannelState<StreamChatGenerics>['formatMessage']>>} messages A list of messages
   * @param message
   * @param {boolean} timestampChanged Whether updating a message with changed created_at value.
   * @param {string} sortBy field name to use to sort the messages by
   * @param {boolean} addIfDoesNotExist Add message if it is not in the list, used to prevent out of order updated messages from being added.
   */
  _addToMessageList(
    messages: Array<ReturnType<ChannelState<StreamChatGenerics>['formatMessage']>>,
    message: ReturnType<ChannelState<StreamChatGenerics>['formatMessage']>,
    timestampChanged = false,
    sortBy: 'pinned_at' | 'created_at' = 'created_at',
    addIfDoesNotExist = true,
  ) {
    const addMessageToList = addIfDoesNotExist || timestampChanged;
    let messageArr = messages;

    // if created_at has changed, message should be filtered and re-inserted in correct order
    // slow op but usually this only happens for a message inserted to state before actual response with correct timestamp
    if (timestampChanged) {
      messageArr = messageArr.filter((msg) => !(msg.id && message.id === msg.id));
    }

    // Get array length after filtering
    const messageArrayLength = messageArr.length;

    // for empty list just concat and return unless it's an update or deletion
    if (messageArrayLength === 0 && addMessageToList) {
      return messageArr.concat(message);
    } else if (messageArrayLength === 0) {
      return [...messageArr];
    }

    const messageTime = (message[sortBy] as Date).getTime();
    const messageIsNewest = (messageArr[messageArrayLength - 1][sortBy] as Date).getTime() < messageTime;

    // if message is newer than last item in the list concat and return unless it's an update or deletion
    if (messageIsNewest && addMessageToList) {
      return messageArr.concat(message);
    } else if (messageIsNewest) {
      return [...messageArr];
    }

    // find the closest index to push the new message
    let left = 0;
    let middle = 0;
    let right = messageArrayLength - 1;
    while (left <= right) {
      middle = Math.floor((right + left) / 2);
      if ((messageArr[middle][sortBy] as Date).getTime() <= messageTime) left = middle + 1;
      else right = middle - 1;
    }

    // message already exists and not filtered due to timestampChanged, update and return
    if (!timestampChanged && message.id) {
      if (messageArr[left] && message.id === messageArr[left].id) {
        messageArr[left] = message;
        return [...messageArr];
      }

      if (messageArr[left - 1] && message.id === messageArr[left - 1].id) {
        messageArr[left - 1] = message;
        return [...messageArr];
      }
    }

    // Do not add updated or deleted messages to the list if they do not already exist
    // or have a timestamp change.
    if (addMessageToList) {
      messageArr.splice(left, 0, message);
    }
    return [...messageArr];
  }

  /**
   * removeMessage - Description
   *
   * @param {{ id: string; parent_id?: string }} messageToRemove Object of the message to remove. Needs to have at id specified.
   *
   * @return {boolean} Returns if the message was removed
   */
  removeMessage(messageToRemove: { id: string; parent_id?: string }) {
    let isRemoved = false;
    if (messageToRemove.parent_id && this.threads[messageToRemove.parent_id]) {
      const { removed, result: threadMessages } = this.removeMessageFromArray(
        this.threads[messageToRemove.parent_id],
        messageToRemove,
      );

      this.threads[messageToRemove.parent_id] = threadMessages;
      isRemoved = removed;
    } else {
      const messageSetIndex = this.findMessageSetIndex(messageToRemove);
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
    msgArray: Array<ReturnType<ChannelState<StreamChatGenerics>['formatMessage']>>,
    msg: { id: string; parent_id?: string },
  ) => {
    const result = msgArray.filter((message) => !(!!message.id && !!msg.id && message.id === msg.id));

    return { removed: result.length < msgArray.length, result };
  };

  /**
   * Updates the message.user property with updated user object, for messages.
   *
   * @param {UserResponse<StreamChatGenerics>} user
   */
  updateUserMessages = (user: UserResponse<StreamChatGenerics>) => {
    const _updateUserMessages = (
      messages: Array<ReturnType<ChannelState<StreamChatGenerics>['formatMessage']>>,
      user: UserResponse<StreamChatGenerics>,
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
   * Marks the messages as deleted, from deleted user.
   *
   * @param {UserResponse<StreamChatGenerics>} user
   * @param {boolean} hardDelete
   */
  deleteUserMessages = (user: UserResponse<StreamChatGenerics>, hardDelete = false) => {
    const _deleteUserMessages = (
      messages: Array<ReturnType<ChannelState<StreamChatGenerics>['formatMessage']>>,
      user: UserResponse<StreamChatGenerics>,
      hardDelete = false,
    ) => {
      for (let i = 0; i < messages.length; i++) {
        const m = messages[i];
        if (m.user?.id !== user.id) {
          continue;
        }

        if (hardDelete) {
          /**
           * In case of hard delete, we need to strip down all text, html,
           * attachments and all the custom properties on message
           */
          messages[i] = ({
            cid: m.cid,
            created_at: m.created_at,
            deleted_at: user.deleted_at,
            id: m.id,
            latest_reactions: [],
            mentioned_users: [],
            own_reactions: [],
            parent_id: m.parent_id,
            reply_count: m.reply_count,
            status: m.status,
            thread_participants: m.thread_participants,
            type: 'deleted',
            updated_at: m.updated_at,
            user: m.user,
          } as unknown) as ReturnType<ChannelState<StreamChatGenerics>['formatMessage']>;
        } else {
          messages[i] = {
            ...m,
            type: 'deleted',
            deleted_at: user.deleted_at,
          };
        }
      }
    };

    this.messageSets.forEach((set) => _deleteUserMessages(set.messages, user, hardDelete));

    for (const parentId in this.threads) {
      _deleteUserMessages(this.threads[parentId], user, hardDelete);
    }

    _deleteUserMessages(this.pinnedMessages, user, hardDelete);
  };

  /**
   * filterErrorMessages - Removes error messages from the channel state.
   *
   */
  filterErrorMessages() {
    const filteredMessages = this.latestMessages.filter((message) => message.type !== 'error');

    this.latestMessages = filteredMessages;
  }

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
        delete this.typing[userID];
        this._channel.getClient().dispatchEvent({
          cid: this._channel.cid,
          type: 'typing.stop',
          user: { id: userID },
        } as Event<StreamChatGenerics>);
      }
    }
  }

  clearMessages() {
    this.initMessages();
    this.pinnedMessages = [];
  }

  initMessages() {
    this.messageSets = [{ messages: [], isLatest: true, isCurrent: true }];
  }

  /**
   * loadMessageIntoState - Loads a given message (and messages around it) into the state
   *
   * @param {string} messageId The id of the message, or 'latest' to indicate switching to the latest messages
   * @param {string} parentMessageId The id of the parent message, if we want load a thread reply
   */
  async loadMessageIntoState(messageId: string | 'latest', parentMessageId?: string) {
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
    loadedMessageThread = !parentMessageId || !!this.threads[parentMessageId]?.find((m) => m.id === messageId);
    if (switchedToMessageSet && loadedMessageThread) {
      return;
    }
    if (!switchedToMessageSet) {
      await this._channel.query({ messages: { id_around: messageIdToFind, limit: 25 } }, 'new');
    }
    if (!loadedMessageThread && parentMessageId) {
      await this._channel.getReplies(parentMessageId, { id_around: messageId, limit: 25 });
    }
    messageSetIndex = this.findMessageSetIndex({ id: messageIdToFind });
    if (messageSetIndex !== -1) {
      this.switchToMessageSet(messageSetIndex);
    }
  }

  private switchToMessageSet(index: number) {
    const currentMessages = this.messageSets.find((s) => s.isCurrent);
    if (!currentMessages) {
      return;
    }
    currentMessages.isCurrent = false;
    this.messageSets[index].isCurrent = true;
  }

  private areMessageSetsOverlap(messages1: Array<{ id: string }>, messages2: Array<{ id: string }>) {
    return messages1.some((m1) => messages2.find((m2) => m1.id === m2.id));
  }

  private findMessageSetIndex(message: { id?: string }) {
    return this.messageSets.findIndex((set) => !!set.messages.find((m) => m.id === message.id));
  }

  private findTargetMessageSet(
    newMessages: MessageResponse<StreamChatGenerics>[],
    addIfDoesNotExist = true,
    messageSetToAddToIfDoesNotExist: MessageSetType = 'current',
  ) {
    let messagesToAdd: (
      | MessageResponse<StreamChatGenerics>
      | ReturnType<ChannelState<StreamChatGenerics>['formatMessage']>
    )[] = newMessages;
    let targetMessageSetIndex!: number;
    if (addIfDoesNotExist) {
      const overlappingMessageSetIndices = this.messageSets
        .map((_, i) => i)
        .filter((i) => this.areMessageSetsOverlap(this.messageSets[i].messages, newMessages));
      switch (messageSetToAddToIfDoesNotExist) {
        case 'new':
          if (overlappingMessageSetIndices.length > 0) {
            targetMessageSetIndex = overlappingMessageSetIndices[0];
            // No new message set is created if newMessages only contains thread replies
          } else if (newMessages.some((m) => !m.parent_id)) {
            this.messageSets.push({ messages: [], isCurrent: false, isLatest: false });
            targetMessageSetIndex = this.messageSets.length - 1;
          }
          break;
        case 'current':
          targetMessageSetIndex = this.messageSets.findIndex((s) => s.isCurrent);
          break;
        case 'latest':
          targetMessageSetIndex = this.messageSets.findIndex((s) => s.isLatest);
          break;
        default:
          targetMessageSetIndex = -1;
      }
      // when merging the target set will be the first one from the overlapping message sets
      const mergeTargetMessageSetIndex = overlappingMessageSetIndices.splice(0, 1)[0];
      const mergeSourceMessageSetIndices = [...overlappingMessageSetIndices];
      if (mergeTargetMessageSetIndex !== undefined && mergeTargetMessageSetIndex !== targetMessageSetIndex) {
        mergeSourceMessageSetIndices.push(targetMessageSetIndex);
      }
      // merge message sets
      if (mergeSourceMessageSetIndices.length > 0) {
        const target = this.messageSets[mergeTargetMessageSetIndex];
        const sources = this.messageSets.filter((_, i) => mergeSourceMessageSetIndices.indexOf(i) !== -1);
        sources.forEach((messageSet) => {
          target.isLatest = target.isLatest || messageSet.isLatest;
          target.isCurrent = target.isCurrent || messageSet.isCurrent;
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
