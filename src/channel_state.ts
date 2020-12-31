import Immutable from 'seamless-immutable';
import { Channel } from './channel';
import {
  ChannelMemberResponse,
  ChannelMembership,
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
  typing: Immutable.ImmutableObject<{
    [key: string]: Immutable.Immutable<
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
  }>;
  read: Immutable.ImmutableObject<{
    [key: string]: Immutable.Immutable<{ last_read: Date; user: UserResponse<UserType> }>;
  }>;
  messages: Immutable.ImmutableArray<
    ReturnType<
      ChannelState<
        AttachmentType,
        ChannelType,
        CommandType,
        EventType,
        MessageType,
        ReactionType,
        UserType
      >['messageToImmutable']
    >
  >;
  threads: Immutable.ImmutableObject<{
    [key: string]: Immutable.ImmutableArray<
      ReturnType<
        ChannelState<
          AttachmentType,
          ChannelType,
          CommandType,
          EventType,
          MessageType,
          ReactionType,
          UserType
        >['messageToImmutable']
      >
    >;
  }>;
  mutedUsers: Immutable.ImmutableArray<UserResponse<UserType>>;
  watchers: Immutable.ImmutableObject<{
    [key: string]: Immutable.Immutable<UserResponse<UserType>>;
  }>;
  members: Immutable.ImmutableObject<{
    [key: string]: Immutable.Immutable<ChannelMemberResponse<UserType>>;
  }>;
  unreadCount: number;
  membership: Immutable.ImmutableObject<ChannelMembership<UserType>>;
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
    this.typing = Immutable<{
      [key: string]: Immutable.Immutable<
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
    }>({});
    this.read = Immutable<{
      [key: string]: Immutable.Immutable<{
        last_read: Date;
        user: UserResponse<UserType>;
      }>;
    }>({});
    this.messages = Immutable([]);
    this.threads = Immutable<{
      [key: string]: Immutable.ImmutableArray<
        ReturnType<
          ChannelState<
            AttachmentType,
            ChannelType,
            CommandType,
            EventType,
            MessageType,
            ReactionType,
            UserType
          >['messageToImmutable']
        >
      >;
    }>({});
    // a list of users to hide messages from
    this.mutedUsers = Immutable([]);
    this.watchers = Immutable<{
      [key: string]: Immutable.Immutable<UserResponse<UserType>>;
    }>({});
    this.members = Immutable<{
      [key: string]: Immutable.Immutable<ChannelMemberResponse<UserType>>;
    }>({});
    this.membership = Immutable<ChannelMembership<UserType>>({});
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
   * messageToImmutable - Takes the message object. Parses the dates, sets __html
   * and sets the status to received if missing. Returns an immutable message object
   *
   * @param {MessageResponse<AttachmentType, ChannelType, CommandType, MessageType, ReactionType, UserType>} message an Immutable message object
   *
   */
  messageToImmutable(
    message: MessageResponse<
      AttachmentType,
      ChannelType,
      CommandType,
      MessageType,
      ReactionType,
      UserType
    >,
  ) {
    return Immutable({
      ...message,
      __html: message.html,
      // parse the date..
      created_at: message.created_at ? new Date(message.created_at) : new Date(),
      updated_at: message.updated_at ? new Date(message.updated_at) : new Date(),
      status: message.status || 'received',
    });
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
      const message = this.messageToImmutable(newMessages[i]);

      if (initializing && message.id && this.threads[message.id]) {
        // If we are initializing the state of channel (e.g., in case of connection recovery),
        // then in that case we remove thread related to this message from threads object.
        // This way we can ensure that we don't have any stale data in thread object
        // and consumer can refetch the replies.
        this.threads = this.threads.without(message.id);
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
        const thread = this.threads[parentID] || Immutable([]);
        const threadMessages = this._addToMessageList(thread, message, timestampChanged);
        this.threads = this.threads.set(parentID, threadMessages);
      }
    }
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
    const { messages } = this;
    if (!message) return;
    const { parent_id, show_in_channel } = message;

    if (parent_id && this.threads[parent_id]) {
      const thread = this.threads[parent_id];

      for (let i = 0; i < thread.length; i++) {
        const msg = thread[i];
        const messageWithReaction = this._addReactionToMessage(
          msg,
          reaction,
          enforce_unique,
        );
        if (!messageWithReaction) {
          continue;
        }

        // @ts-expect-error - ImmutableArray.set exists in the documentation but not in the DefinitelyTyped types
        this.threads = this.threads.set(parent_id, thread.set(i, messageWithReaction));
        break;
      }
    }

    if ((!show_in_channel && !parent_id) || show_in_channel) {
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const messageWithReaction = this._addReactionToMessage(
          msg,
          reaction,
          enforce_unique,
        );
        if (!messageWithReaction) {
          continue;
        }

        // @ts-expect-error - ImmutableArray.set exists in the documentation but not in the DefinitelyTyped types
        this.messages = messages.set(i, messageWithReaction);
        break;
      }
    }
  }

  _addReactionToMessage(
    message: Immutable.Immutable<
      ReturnType<
        ChannelState<
          AttachmentType,
          ChannelType,
          CommandType,
          EventType,
          MessageType,
          ReactionType,
          UserType
        >['messageToImmutable']
      >
    >,
    reaction: ReactionResponse<ReactionType, UserType>,
    enforce_unique?: boolean,
  ) {
    const idMatch = !!message.id && message.id === reaction.message_id;

    if (!idMatch) {
      return false;
    }

    let newMessage = this._removeReactionFromMessage(message, reaction, enforce_unique);
    if (this._channel.getClient().userID === reaction.user?.id) {
      newMessage = newMessage.update(
        'own_reactions',
        (old: ReactionResponse<ReactionType, UserType>[]) => old.concat([reaction]),
      );
    }
    newMessage = newMessage.update(
      'latest_reactions',
      (old: ReactionResponse<ReactionType, UserType>[]) => old.concat([reaction]),
    );

    newMessage = newMessage.updateIn(['reaction_counts', reaction.type], (old: number) =>
      old ? old + 1 : 1,
    );

    return newMessage;
  }

  _removeReactionFromMessage(
    message: Immutable.Immutable<
      ReturnType<
        ChannelState<
          AttachmentType,
          ChannelType,
          CommandType,
          EventType,
          MessageType,
          ReactionType,
          UserType
        >['messageToImmutable']
      >
    >,
    reaction: ReactionResponse<ReactionType, UserType>,
    enforce_unique?: boolean,
  ) {
    const filterReaction = (old: ReactionResponse<ReactionType, UserType>[]) =>
      old.filter((item) =>
        enforce_unique
          ? item.user?.id !== reaction.user?.id
          : item.type !== reaction.type || item.user?.id !== reaction.user?.id,
      );
    let newMessage = message.update('own_reactions', filterReaction);
    newMessage = newMessage.update('latest_reactions', filterReaction);
    if (enforce_unique) {
      const oldReaction = message.own_reactions?.find(
        ({ type }) => type === reaction.type,
      );
      if (oldReaction) {
        newMessage = newMessage.updateIn(
          ['reaction_counts', oldReaction.type],
          (old: number) => (old ? old - 1 : 0),
        );
      }
    }
    return newMessage;
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
    const { messages } = this;
    if (!message) return;
    const { parent_id, show_in_channel } = message;

    if (parent_id && this.threads[parent_id]) {
      const thread = this.threads[parent_id];
      for (let i = 0; i < thread.length; i++) {
        const msg = thread[i];
        const idMatch = !!msg.id && msg.id === reaction.message_id;

        if (!idMatch) {
          continue;
        }
        let messageWithReaction = this._removeReactionFromMessage(msg, reaction);
        messageWithReaction = messageWithReaction.updateIn(
          ['reaction_counts', reaction.type],
          (old: number) => (old ? old - 1 : 0),
        );

        // @ts-expect-error - ImmutableArray.set exists in the documentation but not in the DefinitelyTyped types
        this.threads = this.threads.set(parent_id, thread.set(i, messageWithReaction));
        break;
      }
    }
    if ((!show_in_channel && !parent_id) || show_in_channel) {
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const idMatch = !!msg.id && msg.id === reaction.message_id;

        if (!idMatch) {
          continue;
        }
        let messageWithReaction = this._removeReactionFromMessage(msg, reaction);
        messageWithReaction = messageWithReaction.updateIn(
          ['reaction_counts', reaction.type],
          (old: number) => (old ? old - 1 : 0),
        );

        // @ts-expect-error - ImmutableArray.set exists in the documentation but not in the DefinitelyTyped types
        this.messages = messages.set(i, messageWithReaction);
        break;
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
   * @param {Immutable.ImmutableArray<ReturnType<ChannelState<AttachmentType, ChannelType, CommandType, EventType, MessageType, ReactionType, UserType>['messageToImmutable']>>} messages A list of messages
   * @param {ReturnType<ChannelState<AttachmentType, ChannelType, CommandType, EventType, MessageType, ReactionType, UserType>['messageToImmutable']>} newMessage The new message
   * @param {boolean} timestampChanged Whether updating a message with changed created_at value.
   *
   */
  _addToMessageList(
    messages: Immutable.ImmutableArray<
      ReturnType<
        ChannelState<
          AttachmentType,
          ChannelType,
          CommandType,
          EventType,
          MessageType,
          ReactionType,
          UserType
        >['messageToImmutable']
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
      >['messageToImmutable']
    >,
    timestampChanged = false,
  ) {
    let messageArr = messages;

    // if created_at has changed, message should be filtered and re-inserted in correct order
    // slow op but usually this only happens for a message inserted to state before actual response with correct timestamp
    if (timestampChanged) {
      messageArr = messageArr.filter((msg) => !(msg.id && message.id === msg.id));
    }

    // for empty list just concat and return
    if (messageArr.length === 0) return messageArr.concat(message);

    const messageTime = message.created_at.getTime();

    // if message is newer than last item in the list concat and return
    if (messageArr[messageArr.length - 1].created_at.getTime() < messageTime)
      return messageArr.concat(message);

    // find the closest index to push the new message
    let left = 0;
    let middle = 0;
    let right = messageArr.length - 1;
    while (left <= right) {
      middle = Math.floor((right + left) / 2);
      if (messageArr[middle].created_at.getTime() <= messageTime) left = middle + 1;
      else right = middle - 1;
    }

    // message already exists and not filtered due to timestampChanged, update and return
    if (!timestampChanged && message.id) {
      if (messageArr[left] && message.id === messageArr[left].id)
        // @ts-expect-error - ImmutableArray.set exists in the documentation but not in the DefinitelyTyped types
        return messageArr.set(left, message);

      if (messageArr[left - 1] && message.id === messageArr[left - 1].id)
        // @ts-expect-error - ImmutableArray.set exists in the documentation but not in the DefinitelyTyped types
        return messageArr.set(left - 1, message);
    }

    const mutable = messageArr.asMutable() as Array<
      ReturnType<
        ChannelState<
          AttachmentType,
          ChannelType,
          CommandType,
          EventType,
          MessageType,
          ReactionType,
          UserType
        >['messageToImmutable']
      >
    >;
    mutable.splice(left, 0, message);
    return Immutable(mutable);
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

      // @ts-expect-error - ImmutableArray.set exists in the documentation but not in the DefinitelyTyped types
      this.threads = this.threads[messageToRemove.parent_id].set(
        messageToRemove.parent_id,
        threadMessages,
      );
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
    msgArray: Immutable.ImmutableArray<
      ReturnType<
        ChannelState<
          AttachmentType,
          ChannelType,
          CommandType,
          EventType,
          MessageType,
          ReactionType,
          UserType
        >['messageToImmutable']
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
        this.typing = this.typing.without(userID);
        this._channel.getClient().dispatchEvent({
          type: 'typing.stop',
          user: { id: userID },
          cid: this._channel.cid,
        } as Event<AttachmentType, ChannelType, CommandType, EventType, MessageType, ReactionType, UserType>);
      }
    }
  }

  clearMessages() {
    this.messages = Immutable([]);
  }
}
