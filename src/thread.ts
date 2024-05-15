import { StreamChat } from './client';
import { Channel } from './channel';
import {
  DefaultGenerics,
  ExtendableGenerics,
  MessageResponse,
  ThreadResponse,
  FormatMessageResponse,
  ReactionResponse,
  UserResponse,
} from './types';
import { addToMessageList, formatMessage } from './utils';
import { SimpleStateStore } from './store/SimpleStateStore';

type ThreadReadStatus<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> = Record<
  string,
  {
    last_read: string;
    last_read_message_id: string;
    lastRead: Date;
    unread_messages: number;
    user: UserResponse<StreamChatGenerics>;
  }
>;

// const formatReadState = () =>

export class Thread<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> {
  public readonly state: SimpleStateStore<{
    channel: Channel<StreamChatGenerics>;
    channelData: ThreadResponse<StreamChatGenerics>['channel'];
    createdAt: string;
    deletedAt: string;
    latestReplies: Array<FormatMessageResponse<StreamChatGenerics>>;
    parentMessage: FormatMessageResponse<StreamChatGenerics> | undefined;
    participants: ThreadResponse<StreamChatGenerics>['thread_participants'];
    read: ThreadReadStatus<StreamChatGenerics>;
    replyCount: number;
    updatedAt: string;
  }>;
  public id: string;
  private client: StreamChat<StreamChatGenerics>;

  constructor(client: StreamChat<StreamChatGenerics>, threadData: ThreadResponse<StreamChatGenerics>) {
    // TODO: move to function "formatReadStatus"
    const { read: unformattedRead = [] } = threadData;
    // TODO: check why this one is sometimes undefined (should return empty array instead)
    const read = unformattedRead.reduce<ThreadReadStatus<StreamChatGenerics>>((pv, cv) => {
      pv[cv.user.id] ??= {
        ...cv,
        lastRead: new Date(cv.last_read),
      };
      return pv;
    }, {});

    console.log({ parent: threadData.parent_message, id: threadData.parent_message_id });

    this.state = new SimpleStateStore({
      channelData: threadData.channel, // not channel instance
      channel: client.channel(threadData.channel.type, threadData.channel.id),
      createdAt: threadData.created_at,
      deletedAt: threadData.deleted_at,
      latestReplies: threadData.latest_replies.map(formatMessage),
      // TODO: check why this is sometimes undefined
      parentMessage: threadData.parent_message && formatMessage(threadData.parent_message),
      participants: threadData.thread_participants,
      read,
      replyCount: threadData.reply_count,
      updatedAt: threadData.updated_at,
    });

    // parent_message_id is being re-used as thread.id
    this.id = threadData.parent_message_id;
    this.client = client;

    // TODO: register WS listeners (message.new / reply )
    // client.on()
  }

  get channel() {
    return this.state.getLatestValue().channel;
  }

  addReply = (message: MessageResponse<StreamChatGenerics>) => {
    if (message.parent_id !== this.id) {
      throw new Error('Message does not belong to this thread');
    }

    this.state.next((pv) => ({
      ...pv,
      latestReplies: addToMessageList(pv.latestReplies, formatMessage(message), true),
    }));
  };

  updateReply = (message: MessageResponse<StreamChatGenerics>) => {
    this.state.next((pv) => ({
      ...pv,
      latestReplies: pv.latestReplies.map((m) => {
        if (m.id === message.id) return formatMessage(message);
        return m;
      }),
    }));
  };

  updateParentMessage = (message: MessageResponse<StreamChatGenerics>) => {
    if (message.id !== this.id) {
      throw new Error('Message does not belong to this thread');
    }

    this.state.next((pv) => {
      const newData = { ...pv, parentMessage: formatMessage(message) };
      // update channel if channelData change (unlikely but handled anyway)
      if (message.channel) {
        newData['channel'] = this.client.channel(message.channel.type, message.channel.id);
      }
      return newData;
    });
  };

  updateMessageOrReplyIfExists(message: MessageResponse<StreamChatGenerics>) {
    if (message.parent_id === this.id) {
      this.updateReply(message);
    }

    if (!message.parent_id && message.id === this.id) {
      this.updateParentMessage(message);
    }
  }

  addReaction(
    reaction: ReactionResponse<StreamChatGenerics>,
    message?: MessageResponse<StreamChatGenerics>,
    enforceUnique?: boolean,
  ) {
    if (!message) return;

    this.state.next((pv) => ({
      ...pv,
      latestReplies: pv.latestReplies.map((reply) => {
        if (reply.id !== message.id) return reply;

        // FIXME: this addReaction API weird (maybe clean it up later)
        const updatedMessage = pv.channel.state.addReaction(reaction, message, enforceUnique);
        if (updatedMessage) return formatMessage(updatedMessage);

        return reply;
      }),
    }));
  }

  removeReaction(reaction: ReactionResponse<StreamChatGenerics>, message?: MessageResponse<StreamChatGenerics>) {
    if (!message) return;

    this.state.next((pv) => ({
      ...pv,
      latestReplies: pv.latestReplies.map((reply) => {
        if (reply.id !== message.id) return reply;

        // FIXME: this removeReaction API is weird (maybe clean it up later)
        const updatedMessage = pv.channel.state.removeReaction(reaction, message);
        if (updatedMessage) return formatMessage(updatedMessage);

        return reply;
      }),
    }));
  }

  loadNext = async ({
    options = {
      id_gt: this.state.getLatestValue().latestReplies.at(-1)?.id,
    },
    sort = [{ created_at: -1 }],
  }: {
    options: Parameters<Channel<StreamChatGenerics>['getReplies']>['1'];
    sort: Parameters<Channel<StreamChatGenerics>['getReplies']>['2'];
  }) => {
    // todo: loading/error states
    const vals = await this.channel.getReplies(this.id, options, sort);
  };

  // TODO: impl
  loadPrevious = () => {
    // ...
  };
}
