import {
  UserResponse,
  ChannelResponse,
  MessageResponse,
  OwnUserResponse,
  ChannelMemberResponse,
  ReactionResponse,
} from './response';

import { UnknownType } from './util';

import { LiteralStringForUnion } from './base';

/**
 * Event Types
 */

export type ConnectionChangeEvent = {
  type: EventTypes;
  online?: boolean;
};

export type Event<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  type: EventTypes;
  channel?: ChannelResponse<ChannelType, CommandType, UserType>;
  channel_id?: string;
  channel_type?: string;
  cid?: string;
  clear_history?: boolean;
  connection_id?: string;
  created_at?: string;
  me?: OwnUserResponse<ChannelType, CommandType, UserType>;
  member?: ChannelMemberResponse<UserType>;
  message?: MessageResponse<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  >;
  online?: boolean;
  parent_id?: string;
  reaction?: ReactionResponse<ReactionType, UserType>;
  received_at?: string | Date;
  total_unread_count?: number;
  unread_channels?: number;
  unread_count?: number;
  user?: UserResponse<UserType>;
  user_id?: string;
  watcher_count?: number;
};

export type EventHandler<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = (
  event: Event<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >,
) => void;

export type EventTypes =
  | 'all'
  | 'channel.created'
  | 'channel.deleted'
  | 'channel.hidden'
  | 'channel.muted'
  | 'channel.truncated'
  | 'channel.unmuted'
  | 'channel.updated'
  | 'channel.visible'
  | 'connection.changed'
  | 'connection.recovered'
  | 'health.check'
  | 'member.added'
  | 'member.removed'
  | 'member.updated'
  | 'message.deleted'
  | 'message.new'
  | 'message.read'
  | 'message.updated'
  | 'notification.added_to_channel'
  | 'notification.channel_deleted'
  | 'notification.channel_mutes_updated'
  | 'notification.channel_truncated'
  | 'notification.invite_accepted'
  | 'notification.invite_rejected'
  | 'notification.invited'
  | 'notification.mark_read'
  | 'notification.message_new'
  | 'notification.mutes_updated'
  | 'notification.removed_from_channel'
  | 'reaction.deleted'
  | 'reaction.new'
  | 'reaction.updated'
  | 'typing.start'
  | 'typing.stop'
  | 'user.banned'
  | 'user.deleted'
  | 'user.presence.changed'
  | 'user.unbanned'
  | 'user.updated'
  | 'user.watching.start'
  | 'user.watching.stop';
