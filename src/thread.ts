import { StreamChat } from './client';
import {
  DefaultGenerics,
  ExtendableGenerics,
  MessageResponse,
  ThreadResponse,
  ChannelResponse,
  FormatMessageResponse,
} from './types';
import { addToMessageList, formatMessage } from './utils';

export class Thread<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> {
  id: string;
  latestReplies: FormatMessageResponse<StreamChatGenerics>[] = [];
  participants: ThreadResponse['thread_participants'] = [];
  message: FormatMessageResponse<StreamChatGenerics>;
  channel: ChannelResponse<StreamChatGenerics>;
  replyCount = 0;
  _client: StreamChat<StreamChatGenerics>;

  constructor(client: StreamChat<StreamChatGenerics>, t: ThreadResponse<StreamChatGenerics>) {
    this.id = t.parent_message.id;
    this.message = formatMessage(t.parent_message);
    this.latestReplies = t.latest_replies.map(formatMessage);
    this.participants = t.thread_participants;
    this.replyCount = t.reply_count;
    this.channel = t.channel;
    this._client = client;
  }

  getClient(): StreamChat<StreamChatGenerics> {
    return this._client;
  }

  addReply(message: MessageResponse<StreamChatGenerics>) {
    this.latestReplies = addToMessageList(this.latestReplies, formatMessage(message));
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
    }

    if (!message.parent_id && message.id === this.message.id) {
      this.message = formatMessage(message);
    }
  }
}
