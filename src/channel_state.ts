import { Channel } from './channel';
import {
  ChannelMemberResponse,
  ChannelMembership,
  FormatMessageResponse,
  Event,
  LiteralStringForUnion,
  MessageResponse,
  ReactionResponse,
  UnknownType,
  UserResponse,
} from './types';

/**
 * ChannelState - A container class for the channel state.
 */
export class ChannelState<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> {
  _channel: Channel<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  watcher_count: number;
  typing: Record<
    string,
    Event<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >
  >;
  read: Record<string, { last_read: Date; user: UserResponse<UserType> }>;
  messages: Array<
    ReturnType<
      ChannelState<
        AttachmentType,
        ChannelType,
        CommandType,
        EventType,
        MessageType,
        ReactionType,
        UserType
      >['formatMessage']
    >
  >;
  pinnedMessages: Array<
    ReturnType<
      ChannelState<
        AttachmentType,
        ChannelType,
        CommandType,
        EventType,
        MessageType,
        ReactionType,
        UserType
      >['formatMessage']
    >
  >;
  threads: Record<
    string,
    Array<
      ReturnType<
        ChannelState<
          AttachmentType,
          ChannelType,
          CommandType,
          EventType,
          MessageType,
          ReactionType,
          UserType
        >['formatMessage']
      >
    >
  >;
  mutedUsers: Array<UserResponse<UserType>>;
  watchers: Record<string, UserResponse<UserType>>;
  members: Record<string, ChannelMemberResponse<UserType>>;
  unreadCount: number;
  membership: ChannelMembership<UserType>;
  last_message_at: Date | null;
  /**
   * Flag which indicates if channel state contain latest/recent messages or no.
   * This flag should be managed by UI sdks using a setter - setIsUpToDate.
   * When false, any new message (received by websocket event - message.new) will not
   * be pushed on to message list.
   */
  isUpToDate: boolean;
  constructor(
    channel: Channel<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >,
  ) {
    this._channel = channel;
    this.watcher_count = 0;
    this.typing = {};
    this.read = {};
    this.messages = [];
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
    this.last_message_at =
      channel?.state?.last_message_at != null
        ? new Date(channel.state.last_message_at)
        : null;
  }

  /**
   * addMessageSorted - Add a message to the state
   *
   * @param {MessageResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>} newMessage A new message
   * @param {boolean} timestampChanged Whether updating a message with changed created_at value.
   *
   */
  addMessageSorted(
    newMessage: MessageResponse<
      AttachmentType,
      ChannelType,
      CommandType,
      MessageType,
      ReactionType,
      UserType
    >,
    timestampChanged = false,
  ) {
    return this.addMessagesSorted([newMessage], timestampChanged);
  }

  /**
   * formatMessage - Takes the message object. Parses the dates, sets __html
   * and sets the status to received if missing. Returns a message object
   *
   * @param {MessageResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>} message a message object
   *
   */
  formatMessage(
    message: MessageResponse<
      AttachmentType,
      ChannelType,
      CommandType,
      MessageType,
      ReactionType,
      UserType
    >,
  ): FormatMessageResponse<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  > {
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
   * @param {Array<MessageResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>>} newMessages A list of messages
   * @param {boolean} timestampChanged Whether updating messages with changed created_at value.
   * @param {boolean} initializing Whether channel is being initialized.
   *
   */
  addMessagesSorted(
    newMessages: MessageResponse<
      AttachmentType,
      ChannelType,
      CommandType,
      MessageType,
      ReactionType,
      UserType
    >[],
    timestampChanged = false,
    initializing = false,
  ) {
    for (let i = 0; i < newMessages.length; i += 1) {
      const message = this.formatMessage(newMessages[i]);

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

      // update or append the messages...
      const parentID = message.parent_id;

      // add to the main message list
      if (!parentID || message.show_in_channel) {
        this.messages = this._addToMessageList(this.messages, message, timestampChanged);
      }

      // add to the thread if applicable..
      if (parentID) {
        const thread = this.threads[parentID] || [];
        const threadMessages = this._addToMessageList(thread, message, timestampChanged);
        this.threads[parentID] = threadMessages;
      }
    }
  }

  /**
   * addPinnedMessages - adds messages in pinnedMessages property
   *
   * @param {Array<MessageResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>>} pinnedMessages A list of pinned messages
   *
   */
  addPinnedMessages(
    pinnedMessages: MessageResponse<
      AttachmentType,
      ChannelType,
      CommandType,
      MessageType,
      ReactionType,
      UserType
    >[],
  ) {
    for (let i = 0; i < pinnedMessages.length; i += 1) {
      this.addPinnedMessage(pinnedMessages[i]);
    }
  }

  /**
   * addPinnedMessage - adds message in pinnedMessages
   *
   * @param {MessageResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>} pinnedMessage message to update
   *
   */
  addPinnedMessage(
    pinnedMessage: MessageResponse<
      AttachmentType,
      ChannelType,
      CommandType,
      MessageType,
      ReactionType,
      UserType
    >,
  ) {
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
   * @param {MessageResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>} message message to remove
   *
   */
  removePinnedMessage(
    message: MessageResponse<
      AttachmentType,
      ChannelType,
      CommandType,
      MessageType,
      ReactionType,
      UserType
    >,
  ) {
    const { result } = this.removeMessageFromArray(this.pinnedMessages, message);
    this.pinnedMessages = result;
  }

  addReaction(
    reaction: ReactionResponse<ReactionType, UserType>,
    message?: MessageResponse<
      AttachmentType,
      ChannelType,
      CommandType,
      MessageType,
      ReactionType,
      UserType
    >,
    enforce_unique?: boolean,
  ) {
    if (!message) return;
    const messageWithReaction = message;
    this._updateMessage(message, (msg) => {
      messageWithReaction.own_reactions = this._addOwnReactionToMessage(
        msg.own_reactions,
        reaction,
        enforce_unique,
      );
      return this.formatMessage(messageWithReaction);
    });
    return messageWithReaction;
  }

  _addOwnReactionToMessage(
    ownReactions: ReactionResponse<ReactionType, UserType>[] | null | undefined,
    reaction: ReactionResponse<ReactionType, UserType>,
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
    ownReactions: ReactionResponse<ReactionType, UserType>[] | null | undefined,
    reaction: ReactionResponse<ReactionType, UserType>,
  ) {
    if (ownReactions) {
      return ownReactions.filter(
        (item) => item.user_id !== reaction.user_id || item.type !== reaction.type,
      );
    }
    return ownReactions;
  }

  removeReaction(
    reaction: ReactionResponse<ReactionType, UserType>,
    message?: MessageResponse<
      AttachmentType,
      ChannelType,
      CommandType,
      MessageType,
      ReactionType,
      UserType
    >,
  ) {
    if (!message) return;
    const messageWithReaction = message;
    this._updateMessage(message, (msg) => {
      messageWithReaction.own_reactions = this._removeOwnReactionFromMessage(
        msg.own_reactions,
        reaction,
      );
      return this.formatMessage(messageWithReaction);
    });
    return messageWithReaction;
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
      msg: ReturnType<
        ChannelState<
          AttachmentType,
          ChannelType,
          CommandType,
          EventType,
          MessageType,
          ReactionType,
          UserType
        >['formatMessage']
      >,
    ) => ReturnType<
      ChannelState<
        AttachmentType,
        ChannelType,
        CommandType,
        EventType,
        MessageType,
        ReactionType,
        UserType
      >['formatMessage']
    >,
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
      const msgIndex = this.messages.findIndex((msg) => msg.id === message.id);
      if (msgIndex !== -1) {
        this.messages[msgIndex] = updateFunc(this.messages[msgIndex]);
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
   * @param {Array<ReturnType<ChannelState<AttachmentType, ChannelType, CommandType, EventType, MessageType, ReactionType, UserType>['formatMessage']>>} messages A list of messages
   * @param message
   * @param {boolean} timestampChanged Whether updating a message with changed created_at value.
   * @param {string} sortBy field name to use to sort the messages by
   */
  _addToMessageList(
    messages: Array<
      ReturnType<
        ChannelState<
          AttachmentType,
          ChannelType,
          CommandType,
          EventType,
          MessageType,
          ReactionType,
          UserType
        >['formatMessage']
      >
    >,
    message: ReturnType<
      ChannelState<
        AttachmentType,
        ChannelType,
        CommandType,
        EventType,
        MessageType,
        ReactionType,
        UserType
      >['formatMessage']
    >,
    timestampChanged = false,
    sortBy: 'pinned_at' | 'created_at' = 'created_at',
  ) {
    let messageArr = messages;

    // if created_at has changed, message should be filtered and re-inserted in correct order
    // slow op but usually this only happens for a message inserted to state before actual response with correct timestamp
    if (timestampChanged) {
      messageArr = messageArr.filter((msg) => !(msg.id && message.id === msg.id));
    }

    // for empty list just concat and return
    if (messageArr.length === 0) return messageArr.concat(message);

    const messageTime = (message[sortBy] as Date).getTime();

    // if message is newer than last item in the list concat and return
    if ((messageArr[messageArr.length - 1][sortBy] as Date).getTime() < messageTime)
      return messageArr.concat(message);

    // find the closest index to push the new message
    let left = 0;
    let middle = 0;
    let right = messageArr.length - 1;
    while (left <= right) {
      middle = Math.floor((right + left) / 2);
      if ((messageArr[middle][sortBy] as Date).getTime() <= messageTime)
        left = middle + 1;
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

    messageArr.splice(left, 0, message);
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
      const { removed, result: messages } = this.removeMessageFromArray(
        this.messages,
        messageToRemove,
      );
      this.messages = messages;
      isRemoved = removed;
    }

    return isRemoved;
  }

  removeMessageFromArray = (
    msgArray: Array<
      ReturnType<
        ChannelState<
          AttachmentType,
          ChannelType,
          CommandType,
          EventType,
          MessageType,
          ReactionType,
          UserType
        >['formatMessage']
      >
    >,
    msg: { id: string; parent_id?: string },
  ) => {
    const result = msgArray.filter(
      (message) => !(!!message.id && !!msg.id && message.id === msg.id),
    );

    return { removed: result.length < msgArray.length, result };
  };
  /**
   * filterErrorMessages - Removes error messages from the channel state.
   *
   */
  filterErrorMessages() {
    const filteredMessages = this.messages.filter((message) => message.type !== 'error');

    this.messages = filteredMessages;
  }

  /**
   * clean - Remove stale data such as users that stayed in typing state for more than 5 seconds
   */
  clean() {
    const now = new Date();
    // prevent old users from showing up as typing
    for (const [userID, lastEvent] of Object.entries(this.typing)) {
      const since =
        typeof lastEvent.received_at === 'string' &&
        now.getTime() - new Date(lastEvent.received_at).getTime();
      if (since > 7000) {
        delete this.typing[userID];
        this._channel.getClient().dispatchEvent({
          cid: this._channel.cid,
          type: 'typing.stop',
          user: { id: userID },
        } as Event<AttachmentType, ChannelType, CommandType, EventType, MessageType, ReactionType, UserType>);
      }
    }
  }

  clearMessages() {
    this.messages = [];
  }
}
