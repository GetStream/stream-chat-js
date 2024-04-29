import { StreamChat } from './client';
import {
  DefaultGenerics,
  ExtendableGenerics,
  MessageResponse,
  ThreadResponse,
  ChannelResponse,
  FormatMessageResponse,
  ReactionResponse,
  UserResponse,
} from './types';
import { addToMessageList, formatMessage } from './utils';

type ThreadReadStatus<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = Record<
  string,
  {
    last_read: Date;
    last_read_message_id: string;
    unread_messages: number;
    user: UserResponse<StreamChatGenerics>;
  }
>;

export class Thread<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> {
  id: string;
  latestReplies: FormatMessageResponse<StreamChatGenerics>[] = [];
  participants: ThreadResponse['thread_participants'] = [];
  message: FormatMessageResponse<StreamChatGenerics>;
  channel: ChannelResponse<StreamChatGenerics>;
  _channel: ReturnType<StreamChat<StreamChatGenerics>['channel']>;
  replyCount = 0;
  _client: StreamChat<StreamChatGenerics>;
  read: ThreadReadStatus<StreamChatGenerics> = {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: Record<string, any> = {};

  constructor(client: StreamChat<StreamChatGenerics>, t: ThreadResponse<StreamChatGenerics>) {
    const {
      parent_message_id,
      parent_message,
      latest_replies,
      thread_participants,
      reply_count,
      channel,
      read,
      ...data
    } = t;

    this.id = parent_message_id;
    this.message = formatMessage(parent_message);
    this.latestReplies = latest_replies.map(formatMessage);
    this.participants = thread_participants;
    this.replyCount = reply_count;
    this.channel = channel;
    this._channel = client.channel(t.channel.type, t.channel.id);
    this._client = client;
    if (read) {
      for (const r of read) {
        this.read[r.user.id] = {
          ...r,
          last_read: new Date(r.last_read),
        };
      }
    }
    this.data = data;
  }

  getClient(): StreamChat<StreamChatGenerics> {
    return this._client;
  }

  /**
   * addReply - Adds or updates a latestReplies to the thread
   *
   * @param {MessageResponse<StreamChatGenerics>} message reply message to be added.
   */
  addReply(message: MessageResponse<StreamChatGenerics>) {
    if (message.parent_id !== this.message.id) {
      throw new Error('Message does not belong to this thread');
    }

    this.latestReplies = addToMessageList(this.latestReplies, formatMessage(message), true);
  }

  updateReply(message: MessageResponse<StreamChatGenerics>) {
    this.latestReplies = this.latestReplies.map((m) => {
      if (m.id === message.id) {
        return formatMessage(message);
      }
      return m;
    });
  }

  updateMessageOrReplyIfExists(message: MessageResponse<StreamChatGenerics>) {
    if (!message.parent_id && message.id !== this.message.id) {
      return;
    }

    if (message.parent_id && message.parent_id !== this.message.id) {
      return;
    }

    if (message.parent_id && message.parent_id === this.message.id) {
      this.updateReply(message);
      return;
    }

    if (!message.parent_id && message.id === this.message.id) {
      this.message = formatMessage(message);
    }
  }

  addReaction(
    reaction: ReactionResponse<StreamChatGenerics>,
    message?: MessageResponse<StreamChatGenerics>,
    enforce_unique?: boolean,
  ) {
    if (!message) return;

    this.latestReplies = this.latestReplies.map((m) => {
      if (m.id === message.id) {
        return formatMessage(
          this._channel.state.addReaction(reaction, message, enforce_unique) as MessageResponse<StreamChatGenerics>,
        );
      }
      return m;
    });
  }

  removeReaction(reaction: ReactionResponse<StreamChatGenerics>, message?: MessageResponse<StreamChatGenerics>) {
    if (!message) return;

    this.latestReplies = this.latestReplies.map((m) => {
      if (m.id === message.id) {
        return formatMessage(
          this._channel.state.removeReaction(reaction, message) as MessageResponse<StreamChatGenerics>,
        );
      }
      return m;
    });
  }
}
