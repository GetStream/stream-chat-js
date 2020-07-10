import Immutable, { ImmutableDate } from 'seamless-immutable';
import { Channel } from 'channel';
import type {
  Event,
  User,
  MessageResponse,
  ChannelMemberResponse,
  ChannelMembership,
  ReactionResponse,
  ImmutableMessageResponse,
} from '../types/types';

/**
 * ChannelState - A container class for the channel state.
 */

function byDate(a: { created_at: ImmutableDate }, b: { created_at: ImmutableDate }) {
  return a.created_at.getTime() - b.created_at.getTime();
}

export class ChannelState<UserType, MessageType, ReactionType> {
  _channel: Channel;
  watcher_count: number;
  typing: Immutable.ImmutableObject<{ [key: string]: Immutable.Immutable<Event> }>;
  read: Immutable.ImmutableObject<{
    [key: string]: Immutable.Immutable<{ user: User<UserType>; last_read: Date }>;
  }>;
  messages: Immutable.ImmutableArray<ImmutableMessageResponse<MessageType, ReactionType>>;
  threads: Immutable.ImmutableObject<{
    [key: string]: Immutable.ImmutableArray<ImmutableMessageResponse<MessageType, ReactionType>>;
  }>;
  mutedUsers: Immutable.ImmutableArray<User<UserType>>;
  watchers: Immutable.ImmutableObject<{
    [key: string]: Immutable.Immutable<User<UserType>>;
  }>;
  members: Immutable.ImmutableObject<{
    [key: string]: Immutable.Immutable<ChannelMemberResponse>;
  }>;
  membership: Immutable.ImmutableObject<ChannelMembership>;
  last_message_at: Date | null;
  constructor(channel: Channel) {
    this._channel = channel;
    this.watcher_count = 0;
    this.typing = Immutable<{ [key: string]: Immutable.Immutable<Event> }>({});
    this.read = Immutable<{
      [key: string]: Immutable.Immutable<{ user: User<UserType>; last_read: Date }>;
    }>({});
    this.messages = Immutable([]);
    this.threads = Immutable<{
      [key: string]: Immutable.ImmutableArray<ImmutableMessageResponse<MessageType, ReactionType>>;
    }>({});
    // a list of users to hide messages from
    this.mutedUsers = Immutable([]);
    this.watchers = Immutable<{ [key: string]: Immutable.Immutable<User<UserType>> }>({});
    this.members = Immutable<{
      [key: string]: Immutable.Immutable<ChannelMemberResponse>;
    }>({});
    this.membership = Immutable<ChannelMembership>({});
    this.last_message_at =
      channel.state.last_message_at != null
        ? new Date(channel.state.last_message_at)
        : null;
  }

  /**
   * addMessageSorted - Add a message to the state
   *
   * @param {object} newMessage A new message
   *
   */
  addMessageSorted(newMessage: MessageResponse<MessageType, ReactionType>) {
    return this.addMessagesSorted([newMessage]);
  }

  /**
   * messageToImmutable - Takes the message object. Parses the dates, sets __html
   * and sets the status to received if missing. Returns an immutable message object
   *
   * @param {object} message an Immutable message object
   *
   */
  messageToImmutable(message: MessageResponse<MessageType, ReactionType>): ImmutableMessageResponse<MessageType, ReactionType> {
    return Immutable({
      ...message,
      __html: message.html,
      // parse the date..
      created_at: new Date(message.created_at),
      updated_at: new Date(message.updated_at),
      status: message.status || 'received',
    });
  }

  /**
   * addMessagesSorted - Add the list of messages to state and resorts the messages
   *
   * @param {array}   newMessages    A list of messages
   * @param {boolean} initializing   Weather channel is being initialized.
   *
   */
  addMessagesSorted(
    newMessages: MessageResponse<MessageType, ReactionType>[],
    initializing = false,
  ) {
    // parse all the new message dates and add __html for react
    const parsedMessages: ImmutableMessageResponse<MessageType, ReactionType>[] = [];
    for (const message of newMessages) {
      if (initializing && this.threads[message.id]) {
        // If we are initializing the state of channel (e.g., in case of connection recovery),
        // then in that case we remove thread related to this message from threads object.
        // This way we can ensure that we don't have any stale data in thread object
        // and consumer can refetch the replies.
        this.threads = this.threads.without(message.id);
      }
      const parsedMsg = this.messageToImmutable(message);
      parsedMessages.push(parsedMsg);
      if (
        this.last_message_at &&
        parsedMsg.created_at.getTime() > this.last_message_at.getTime()
      ) {
        this.last_message_at = new Date(parsedMsg.created_at.getDate());
      }
    }

    // update or append the messages...
    const updatedThreads: string[] = [];
    for (const message of parsedMessages) {
      const isThreadReply = !!(message.parent_id && !message.show_in_channel);
      // add to the main message list
      if (!isThreadReply) {
        this.messages = this._addToMessageList(this.messages, message);
      }
      // add to the thread if applicable..
      const parentID = message.parent_id;
      if (parentID) {
        const thread = this.threads[parentID] || Immutable([]);
        const threadMessages = this._addToMessageList(thread, message);
        this.threads = this.threads.set(parentID, threadMessages);
        updatedThreads.push(parentID);
      }
    }

    // Resort the main messages and the threads that changed...
    const messages = Immutable.asMutable(this.messages);
    messages.sort(byDate);
    this.messages = Immutable(messages);
    for (const parentID of updatedThreads) {
      const threadMessages = this.threads[parentID]
        ? Immutable.asMutable(this.threads[parentID])
        : [];
      threadMessages.sort(byDate);
      this.threads = this.threads.set(parentID, threadMessages);
    }
  }

  addReaction(
    reaction: ReactionResponse<ReactionType>,
    message?: MessageResponse<MessageType, ReactionType>,
  ) {
    const { messages } = this;
    if (!message) return;
    const { parent_id, show_in_channel } = message;

    if (parent_id && this.threads[parent_id]) {
      const thread = this.threads[parent_id];

      for (let i = 0; i < thread.length; i++) {
        const msg = thread[i];
        const messageWithReaction = this._addReactionToMessage(msg, reaction);
        if (!messageWithReaction) {
          continue;
        }
        // TODO: Add types to def typed
        this.threads = this.threads.set(parent_id, thread.set(i, messageWithReaction));
        break;
      }
    }

    if ((!show_in_channel && !parent_id) || show_in_channel) {
      for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        const messageWithReaction = this._addReactionToMessage(msg, reaction);
        if (!messageWithReaction) {
          continue;
        }
        this.messages = messages.set(i, messageWithReaction);
        break;
      }
    }
  }

  _addReactionToMessage(
    message: Immutable.Immutable<ImmutableMessageResponse<MessageType, ReactionType>>,
    reaction: ReactionResponse<ReactionType>,
  ) {
    const idMatch = !!message.id && message.id === reaction.message_id;

    if (!idMatch) {
      return false;
    }

    let newMessage = this._removeReactionFromMessage(message, reaction);
    if (this._channel.getClient().userID === reaction.user?.id) {
      newMessage = newMessage.update('own_reactions', (old = []) =>
        old.concat([reaction]),
      );
    }
    newMessage = newMessage.update('latest_reactions', (old = []) =>
      old.concat([reaction]),
    );

    newMessage = newMessage.updateIn(['reaction_counts', reaction.type], old =>
      old ? old + 1 : 1,
    );

    return newMessage;
  }

  _removeReactionFromMessage(
    message: Immutable.Immutable<ImmutableMessageResponse<MessageType, ReactionType>>,
    reaction: ReactionResponse<ReactionType>,
  ) {
    const filterReaction = (old: ReactionResponse<ReactionType>[]) =>
      old.filter(
        item => item.type !== reaction.type || item.user?.id !== reaction.user?.id,
      );
    let newMessage = message.update('own_reactions', filterReaction);
    newMessage = newMessage.update('latest_reactions', filterReaction);
    return newMessage;
  }

  removeReaction(
    reaction: ReactionResponse<ReactionType>,
    message?: MessageResponse<MessageType, ReactionType>,
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
          old => (old ? old - 1 : 0),
        );

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
          old => (old ? old - 1 : 0),
        );

        this.messages = messages.set(i, messageWithReaction);
        break;
      }
    }
  }

  /**
   * _addToMessageList - Adds a message to a list of messages, tries to update first, appends if message isnt found
   *
   * @param {array} messages A list of messages
   * @param {object} newMessage The new message
   *
   */
  _addToMessageList(
    messages: Immutable.ImmutableArray<ImmutableMessageResponse<MessageType, ReactionType>>,
    newMessage: ImmutableMessageResponse<MessageType, ReactionType>,
  ) {
    let updated = false;
    let newMessages: Immutable.ImmutableArray<ImmutableMessageResponse<MessageType, ReactionType>> = Immutable([]);

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      const idMatch = !!message.id && !!newMessage.id && message.id === newMessage.id;

      if (idMatch) {
        newMessages = messages.set(i, newMessage);
        updated = true;
      }
    }

    if (!updated) {
      newMessages = messages.concat([newMessage]);
    }

    return newMessages;
  }

  /**
   * removeMessage - Description
   *
   * @param {type} messageToRemove Object of the message to remove. Needs to have at id specified.
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
    msgArray: Immutable.ImmutableArray<ImmutableMessageResponse<MessageType, ReactionType>>,
    msg: { id: string; parent_id?: string },
  ) => {
    const result = msgArray.filter(
      message => !(!!message.id && !!msg.id && message.id === msg.id),
    );

    return { removed: result.length < msgArray.length, result };
  };
  /**
   * filterErrorMessages - Removes error messages from the channel state.
   *
   */
  filterErrorMessages() {
    const filteredMessages = this.messages.filter(message => message.type !== 'error');

    this.messages = filteredMessages;
  }

  /**
   * clean - Remove stale data such as users that stayed in typing state for more than 5 seconds
   */
  clean() {
    const now = new Date();
    // prevent old users from showing up as typing
    for (const [userID, lastEvent] of Object.entries(this.typing)) {
      const since = now.getTime() - new Date(lastEvent.received_at).getTime();
      if (since > 7000) {
        this.typing = this.typing.without(userID);
        this._channel.getClient().dispatchEvent({
          type: 'typing.stop',
          user: { id: userID },
          cid: this._channel.cid,
        });
      }
    }
  }

  clearMessages() {
    this.messages = Immutable([]);
  }
}
