import {
  UserResponse,
  ChannelResponse,
  MessageResponse,
  OwnUserResponse,
  ChannelMemberResponse,
  ReactionResponse,
} from './response';

import { UnknownType } from './util';

import { LiteralStringForUnion, ChannelMute } from './base';

/**
 * Event Types
 */

export type ConnectionChangeEvent = {
  type: 'connection.changed';
  online?: boolean;
  received_at?: string | Date;
  watcher_count?: number;
};

export type ConnectionRecovered = {
  type: 'connection.recovered';
  received_at?: string | Date;
  watcher_count?: number;
};

export type ChannelCreatedEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel: ChannelResponse<ChannelType, CommandType, UserType>;
  channel_id: string;
  channel_type: string;
  cid: string;
  type: 'channel.created';
  user: UserResponse<UserType>;
  created_at?: string;
  message?: MessageResponse<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  >;
  received_at?: string | Date;
  watcher_count?: number;
};

export type ChannelDeletedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel: ChannelResponse<ChannelType, CommandType, UserType>;
  channel_id: string;
  channel_type: string;
  cid: string;
  type: 'channel.deleted';
  created_at?: string;
  received_at?: string | Date;
  user?: UserResponse<UserType>;
  watcher_count?: number;
};

export type ChannelHiddenEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel: ChannelResponse<ChannelType, CommandType, UserType>;
  channel_id: string;
  channel_type: string;
  cid: string;
  clear_history: boolean;
  type: 'channel.hidden';
  created_at?: string;
  received_at?: string | Date;
  user?: UserResponse<UserType>;
  watcher_count?: number;
};

export type ChannelMuteEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel_mute: ChannelMute<ChannelType, CommandType, UserType>;
  type: 'channel.muted';
  created_at?: string;
  received_at?: string | Date;
  watcher_count?: number;
};

export type ChannelTruncatedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel: ChannelResponse<ChannelType, CommandType, UserType>;
  channel_id: string;
  channel_type: string;
  cid: string;
  type: 'channel.truncated';
  user: UserResponse<UserType>;
  created_at?: string;
  received_at?: string | Date;
  watcher_count?: number;
};

export type ChannelUnmuteEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel_mute: ChannelMute<ChannelType, CommandType, UserType>;
  type: 'channel.unmuted';
  created_at?: string;
  received_at?: string | Date;
  watcher_count?: number;
};

export type ChannelUpdatedEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel: ChannelResponse<ChannelType, CommandType, UserType>;
  channel_id: string;
  channel_type: string;
  cid: string;
  type: 'channel.updated';
  created_at?: string;
  message?: MessageResponse<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  >;
  received_at?: string | Date;
  watcher_count?: number;
};

export type ChannelVisibleEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel_id: string;
  channel_type: string;
  cid: string;
  type: 'channel.visible';
  user: UserResponse<UserType>;
  created_at?: string;
  received_at?: string | Date;
  watcher_count?: number;
};

export type HealthEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  connection_id: string;
  type: 'health.check';
  created_at?: string;
  me?: OwnUserResponse<ChannelType, CommandType, UserType>;
  received_at?: string | Date;
  watcher_count?: number;
};

export type MemberAddedEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel_id: string;
  channel_type: string;
  cid: string;
  member: ChannelMemberResponse<UserType>;
  type: 'member.added';
  user: UserResponse<UserType>;
  created_at?: string;
  received_at?: string | Date;
  watcher_count?: number;
};

export type MemberRemovedEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel_id: string;
  channel_type: string;
  cid: string;
  type: 'member.removed';
  user: UserResponse<UserType>;
  created_at?: string;
  received_at?: string | Date;
  watcher_count?: number;
};

export type MemberUpdatedEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel_id: string;
  channel_type: string;
  cid: string;
  member: ChannelMemberResponse<UserType>;
  type: 'member.updated';
  user: UserResponse<UserType>;
  created_at?: string;
  received_at?: string | Date;
  watcher_count?: number;
};

export type MessageDeletedEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel_id: string;
  channel_type: string;
  cid: string;
  type: 'message.deleted';
  user: UserResponse<UserType>;
  created_at?: string;
  message?: MessageResponse<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  >;
  received_at?: string | Date;
  watcher_count?: number;
};

export type MessageReadEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel_id: string;
  channel_type: string;
  cid: string;
  type: 'message.read';
  user: UserResponse<UserType>;
  created_at?: string;
  received_at?: string | Date;
  watcher_count?: number;
};

export type MessageUpdatedEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel_id: string;
  channel_type: string;
  cid: string;
  type: 'message.updated';
  user: UserResponse<UserType>;
  created_at?: string;
  message?: MessageResponse<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  >;
  received_at?: string | Date;
  watcher_count?: number;
};

export type NewMessageEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel_id: string;
  channel_type: string;
  cid: string;
  type: 'message.new';
  user: UserResponse<UserType>;
  created_at?: string;
  message?: MessageResponse<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  >;
  received_at?: string | Date;
  total_unread_count?: number;
  unread_channels?: number;
  watcher_count?: number;
};

export type NotificationAddedToChannelEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel: ChannelResponse<ChannelType, CommandType, UserType>;
  channel_id: string;
  channel_type: string;
  cid: string;
  type: 'notification.added_to_channel';
  created_at?: string;
  received_at?: string | Date;
  watcher_count?: number;
};

export type NotificationChannelDeletedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel: ChannelResponse<ChannelType, CommandType, UserType>;
  channel_id: string;
  channel_type: string;
  cid: string;
  type: 'notification.channel_deleted';
  created_at?: string;
  received_at?: string | Date;
  user?: UserResponse<UserType>;
  watcher_count?: number;
};

export type NotificationChannelMutesUpdatedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  me: OwnUserResponse<ChannelType, CommandType, UserType>;
  type: 'notification.channel_mutes_updated';
  created_at?: string;
  received_at?: string | Date;
  watcher_count?: number;
};

export type NotificationChannelTruncatedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel: ChannelResponse<ChannelType, CommandType, UserType>;
  channel_id: string;
  channel_type: string;
  cid: string;
  type: 'notification.channel_truncated';
  created_at?: string;
  received_at?: string | Date;
  user?: UserResponse<UserType>;
  watcher_count?: number;
};

export type NotificationInviteAcceptedEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel_id: string;
  channel_type: string;
  cid: string;
  member: ChannelMemberResponse<UserType>;
  type: 'notification.invite_accepted';
  created_at?: string;
  received_at?: string | Date;
  user?: UserResponse<UserType>;
  watcher_count?: number;
};

export type NotificationInviteRejectedEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel_id: string;
  channel_type: string;
  cid: string;
  member: ChannelMemberResponse<UserType>;
  type: 'notification.invite_rejected';
  created_at?: string;
  received_at?: string | Date;
  user?: UserResponse<UserType>;
  watcher_count?: number;
};

export type NotificationInvitedEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel_id: string;
  channel_type: string;
  cid: string;
  member: ChannelMemberResponse<UserType>;
  type: 'notification.invited';
  created_at?: string;
  received_at?: string | Date;
  user?: UserResponse<UserType>;
  watcher_count?: number;
};

export type NotificationMarkReadEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel_id: string;
  channel_type: string;
  cid: string;
  type: 'notification.mark_read';
  user: UserResponse<UserType>;
  created_at?: string;
  received_at?: string | Date;
  total_unread_count?: number;
  unread_channels?: number;
  watcher_count?: number;
};

export type NotificationMessageNewEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel: ChannelResponse<ChannelType, CommandType, UserType>;
  channel_id: string;
  channel_type: string;
  cid: string;
  type: 'notification.message_new';
  created_at?: string;
  message?: MessageResponse<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  >;
  received_at?: string | Date;
  total_unread_count?: number;
  unread_channels?: number;
  watcher_count?: number;
};

export type NotificationMutesUpdatedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  me: OwnUserResponse<ChannelType, CommandType, UserType>;
  type: 'notification.mutes_updated';
  created_at?: string;
  received_at?: string | Date;
  watcher_count?: number;
};

export type NotificationRemovedFromChannelEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel_id: string;
  channel_type: string;
  cid: string;
  type: 'notification.removed_from_channel';
  created_at?: string;
  received_at?: string | Date;
  user?: UserResponse<UserType>;
  watcher_count?: number;
};

export type ReactionDeletedEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel_id: string;
  channel_type: string;
  cid: string;
  reaction: ReactionResponse<ReactionType, UserType>;
  type: 'reaction.deleted';
  created_at?: string;
  message?: MessageResponse<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  >;
  received_at?: string | Date;
  user?: UserResponse<UserType>;
  watcher_count?: number;
};

export type ReactionNewEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel_id: string;
  channel_type: string;
  cid: string;
  reaction: ReactionResponse<ReactionType, UserType>;
  type: 'reaction.new';
  user: UserResponse<UserType>;
  created_at?: string;
  message?: MessageResponse<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  >;
  received_at?: string | Date;
  watcher_count?: number;
};

export type ReactionUpdateEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel_id: string;
  channel_type: string;
  cid: string;
  reaction: ReactionResponse<ReactionType, UserType>;
  type: 'reaction.updated';
  user: UserResponse<UserType>;
  created_at?: string;
  message?: MessageResponse<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  >;
  received_at?: string | Date;
  watcher_count?: number;
};

// todo Keeping unused type params for compatibility
export type TypingStartEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel_id: string;
  channel_type: string;
  cid: string;
  type: 'typing.start';
  user: UserResponse<UserType>;
  created_at?: string;
  parent_id?: string;
  received_at?: string | Date;
  watcher_count?: number;
};

export type TypingStopEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel_id: string;
  channel_type: string;
  cid: string;
  type: 'typing.stop';
  user: UserResponse<UserType>;
  created_at?: string;
  parent_id?: string;
  received_at?: string | Date;
  watcher_count?: number;
};

export type UserBannedEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel_id: string;
  channel_type: string;
  cid: string;
  type: 'user.banned';
  user: UserResponse<UserType>;
  created_at?: string;
  expiration?: Date;
  received_at?: string | Date;
  watcher_count?: number;
};

export type UserDeletedEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  type: 'user.deleted';
  user: UserResponse<UserType>;
  created_at?: string;
  hard_delete?: boolean;
  mark_messages_deleted?: boolean;
  received_at?: string | Date;
  watcher_count?: number;
};

export type UserMutedEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  target_user: UserResponse<UserType>;
  type: 'user.muted';
  user: UserResponse<UserType>;
  created_at?: string;
  received_at?: string | Date;
  watcher_count?: number;
};

export type UserPresenceChangedEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  type: 'user.presence.changed';
  user: UserResponse<UserType>;
  created_at?: string;
  received_at?: string | Date;
  watcher_count?: number;
};

export type UserStartWatchingEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel_id: string;
  channel_type: string;
  cid: string;
  type: 'user.watching.start';
  user: UserResponse<UserType>;
  created_at?: string;
  received_at?: string | Date;
  watcher_count?: number;
};

export type UserStopWatchingEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel_id: string;
  channel_type: string;
  cid: string;
  type: 'user.watching.stop';
  user: UserResponse<UserType>;
  created_at?: string;
  received_at?: string | Date;
  watcher_count?: number;
};

export type UserUnbannedEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  channel_id: string;
  channel_type: string;
  cid: string;
  type: 'user.unbanned';
  user: UserResponse<UserType>;
  created_at?: string;
  received_at?: string | Date;
  watcher_count?: number;
};

export type UserUnmutedEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  target_user: UserResponse<UserType>;
  type: 'user.unmuted';
  user: UserResponse<UserType>;
  created_at?: string;
  received_at?: string | Date;
  watcher_count?: number;
};

export type UserUpdatedEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType & {
  type: 'user.updated';
  user: UserResponse<UserType>;
  created_at?: string;
  received_at?: string | Date;
  watcher_count?: number;
};

export type EventIntersection<
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
  hard_delete?: boolean;
  mark_messages_deleted?: boolean;
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

type EventMap<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = {
  'channel.created': ChannelCreatedEvent<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  'channel.deleted': ChannelDeletedEvent<ChannelType, CommandType, EventType, UserType>;
  'channel.hidden': ChannelHiddenEvent<ChannelType, CommandType, EventType, UserType>;
  'channel.muted': ChannelMuteEvent<ChannelType, CommandType, EventType, UserType>;
  'channel.truncated': ChannelTruncatedEvent<
    ChannelType,
    CommandType,
    EventType,
    UserType
  >;
  'channel.unmuted': ChannelUnmuteEvent<ChannelType, CommandType, EventType, UserType>;
  'channel.updated': ChannelUpdatedEvent<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  'channel.visible': ChannelVisibleEvent<EventType, UserType>;
  'connection.changed': ConnectionChangeEvent;
  'connection.recovered': ConnectionRecovered;
  'health.check': HealthEvent<ChannelType, CommandType, EventType, UserType>;
  'member.added': MemberAddedEvent<EventType, UserType>;
  'member.removed': MemberRemovedEvent<EventType, UserType>;
  'member.updated': MemberUpdatedEvent<EventType, UserType>;
  'message.deleted': MessageDeletedEvent<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  'message.new': NewMessageEvent<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  'message.read': MessageReadEvent<EventType, UserType>;
  'message.updated': MessageUpdatedEvent<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  'notification.added_to_channel': NotificationAddedToChannelEvent<
    ChannelType,
    CommandType,
    EventType,
    UserType
  >;
  'notification.channel_deleted': NotificationChannelDeletedEvent<
    ChannelType,
    CommandType,
    EventType,
    UserType
  >;
  'notification.channel_mutes_updated': NotificationChannelMutesUpdatedEvent<
    ChannelType,
    CommandType,
    EventType,
    UserType
  >;
  'notification.channel_truncated': NotificationChannelTruncatedEvent<
    ChannelType,
    CommandType,
    EventType,
    UserType
  >;
  'notification.invite_accepted': NotificationInviteAcceptedEvent<EventType, UserType>;
  'notification.invite_rejected': NotificationInviteRejectedEvent<EventType, UserType>;
  'notification.invited': NotificationInvitedEvent<EventType, UserType>;
  'notification.mark_read': NotificationMarkReadEvent<EventType, UserType>;
  'notification.message_new': NotificationMessageNewEvent<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  'notification.mutes_updated': NotificationMutesUpdatedEvent<
    ChannelType,
    CommandType,
    EventType,
    UserType
  >;
  'notification.removed_from_channel': NotificationRemovedFromChannelEvent<
    EventType,
    UserType
  >;
  'reaction.deleted': ReactionDeletedEvent<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  'reaction.new': ReactionNewEvent<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  'reaction.updated': ReactionUpdateEvent<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  'typing.start': TypingStartEvent<EventType, UserType>;
  'typing.stop': TypingStopEvent<EventType, UserType>;
  'user.banned': UserBannedEvent<EventType, UserType>;
  'user.deleted': UserDeletedEvent<EventType, UserType>;
  'user.muted': UserMutedEvent<EventType, UserType>;
  'user.presence.changed': UserPresenceChangedEvent<EventType, UserType>;
  'user.unbanned': UserUnbannedEvent<EventType, UserType>;
  'user.unmuted': UserUnmutedEvent<EventType, UserType>;
  'user.updated': UserUpdatedEvent<EventType, UserType>;
  'user.watching.start': UserStartWatchingEvent<EventType, UserType>;
  'user.watching.stop': UserStopWatchingEvent<EventType, UserType>;
};

type EventUnion<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = {
  [key in keyof EventMap<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >]: EventMap<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >[key];
}[keyof EventMap<
  AttachmentType,
  ChannelType,
  CommandType,
  EventType,
  MessageType,
  ReactionType,
  UserType
>];

type AllEvents<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType,
  AllowNarrowingEvents extends boolean = false
> = AllowNarrowingEvents extends true
  ? EventUnion<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >
  : EventIntersection<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >;

export type EventTypes = keyof EventMap | 'all';

export type Event<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType,
  SpecificType extends EventTypes = 'all',
  AllowNarrowingEvents extends boolean = false
> = SpecificType extends Exclude<EventTypes, 'all'>
  ? EventMap<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >[SpecificType]
  : AllEvents<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType,
      AllowNarrowingEvents
    >;

export type UserCustomEvent<EventType extends UnknownType = UnknownType> = EventType & {
  type: string;
};

export type EventHandler<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType,
  SpecificType extends EventTypes = 'all',
  AllowNarrowingEvents extends boolean = false
> = (
  event: Event<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType,
    SpecificType,
    AllowNarrowingEvents
  >,
) => void;
