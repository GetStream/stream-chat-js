import { ChannelMute, LiteralStringForUnion } from './base';
import {
  ChannelMemberResponse,
  ChannelResponse,
  MessageResponse,
  OwnUserResponse,
  ReactionResponse,
  UserResponse,
} from './response';
import { UnknownType } from './util';

/**
 * Event base types
 */

type ChatEvent = {
  created_at?: string;
  received_at?: string | Date;
  watcher_count?: number;
};

export type EventWithChannel<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType extends UnknownType = UnknownType
> = {
  channel: ChannelResponse<ChannelType, CommandType, UserType>;
  channel_id: string;
  channel_type: string;
};

export type EventWithMember<UserType extends UnknownType = UnknownType> = {
  member: ChannelMemberResponse<UserType>;
};

export type EventWithMessage<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = {
  message: MessageResponse<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  >;
};

export type EventWithMe<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType extends UnknownType = UnknownType
> = {
  me: OwnUserResponse<ChannelType, CommandType, UserType>;
};

export type EventWithReaction<
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = {
  reaction: ReactionResponse<ReactionType, UserType>;
};

export type EventWithUser<UserType extends UnknownType = UnknownType> = {
  user: UserResponse<UserType>;
};

/**
 * Event Types
 */

export type ChannelCreatedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> & {
    cid: string;
    type: 'channel.created';
  };

export type ChannelDeletedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  Partial<EventWithUser<UserType>> & {
    cid: string;
    type: 'channel.deleted';
  };

export type ChannelHiddenEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> & {
    cid: string;
    clear_history: boolean;
    type: 'channel.hidden';
  };

export type ChannelMutedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithUser<UserType> & {
    channel_mute: ChannelMute<ChannelType, CommandType, UserType>;
    type: 'channel.muted';
  };

export type ChannelTruncatedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  Partial<EventWithUser<UserType>> & {
    cid: string;
    type: 'channel.truncated';
  };

export type ChannelUnmutedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithUser<UserType> & {
    channel_mute: ChannelMute<ChannelType, CommandType, UserType>;
    type: 'channel.unmuted';
  };

export type ChannelUpdatedEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  Partial<EventWithUser<UserType>> &
  Partial<
    EventWithMessage<
      AttachmentType,
      ChannelType,
      CommandType,
      MessageType,
      ReactionType,
      UserType
    >
  > & {
    cid: string;
    type: 'channel.updated';
  };

export type ChannelVisibleEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> & {
    type: 'channel.visible';
  };

export type ConnectionChangedEvent = {
  type: 'connection.changed';
  online?: boolean;
  received_at?: string | Date;
  watcher_count?: number;
};

export type ConnectionRecoveredEvent = {
  type: 'connection.recovered';
  received_at?: string | Date;
  watcher_count?: number;
};

export type HealthCheckEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithMe<ChannelType, CommandType, UserType> & {
    connection_id: string;
    type: 'health.check';
  };

export type MemberAddedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> &
  EventWithMember<UserType> & {
    type: 'member.added';
  };

export type MemberRemovedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> & {
    type: 'member.removed';
  };

export type MemberUpdatedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> &
  EventWithMember<UserType> & {
    type: 'member.updated';
  };

export type MessageDeletedEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  Partial<EventWithUser<UserType>> &
  EventWithMessage<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  > & {
    type: 'message.deleted';
  };

export type MessageReadEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> & {
    type: 'message.read';
  };

export type MessageUpdatedEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> &
  EventWithMessage<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  > & {
    type: 'message.updated';
  };

export type MessageNewEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> &
  EventWithMessage<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  > & {
    cid: string;
    type: 'message.new';
    total_unread_count?: number;
    unread_channels?: number;
  };

export type NotificationAddedToChannelEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> &
  EventWithMember<UserType> & {
    cid: string;
    type: 'notification.added_to_channel';
  };

export type NotificationChannelDeletedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> & {
    cid: string;
    type: 'notification.channel_deleted';
  };

export type NotificationChannelMutesUpdatedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithMe<ChannelType, CommandType, UserType> & {
    type: 'notification.channel_mutes_updated';
  };

export type NotificationChannelTruncatedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> &
  EventWithMember<UserType> & {
    cid: string;
    type: 'notification.channel_truncated';
  };

export type NotificationInviteAcceptedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> &
  EventWithMember<UserType> & {
    cid: string;
    type: 'notification.invite_accepted';
  };

export type NotificationInvitedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> &
  EventWithMember<UserType> & {
    cid: string;
    type: 'notification.invited';
  };

export type NotificationInviteRejectedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> &
  EventWithMember<UserType> & {
    cid: string;
    type: 'notification.invite_rejected';
  };

export type NotificationMarkReadEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  Partial<EventWithChannel<ChannelType, CommandType, UserType>> &
  EventWithUser<UserType> & {
    cid: string;
    type: 'notification.mark_read';
    total_unread_count?: number;
    unread_channels?: number;
  };

export type NotificationMessageNewEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithMessage<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  > & {
    cid: string;
    type: 'notification.message_new';
    total_unread_count?: number;
    unread_channels?: number;
  };

export type NotificationMutesUpdatedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithMe<ChannelType, CommandType, UserType> & {
    type: 'notification.mutes_updated';
  };

export type NotificationRemovedFromChannelEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> &
  EventWithMember<UserType> & {
    cid: string;
    type: 'notification.removed_from_channel';
  };

export type ReactionDeletedEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> &
  Partial<
    EventWithMessage<
      AttachmentType,
      ChannelType,
      CommandType,
      MessageType,
      ReactionType,
      UserType
    >
  > &
  EventWithReaction<ReactionType, UserType> & {
    type: 'reaction.deleted';
  };

export type ReactionNewEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> &
  Partial<
    EventWithMessage<
      AttachmentType,
      ChannelType,
      CommandType,
      MessageType,
      ReactionType,
      UserType
    >
  > &
  EventWithReaction<ReactionType, UserType> & {
    type: 'reaction.new';
  };

export type ReactionUpdatedEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> &
  Partial<
    EventWithMessage<
      AttachmentType,
      ChannelType,
      CommandType,
      MessageType,
      ReactionType,
      UserType
    >
  > &
  EventWithReaction<ReactionType, UserType> & {
    type: 'reaction.updated';
  };

export type TypingStartEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> & {
    cid: string;
    type: 'typing.start';
    parent_id?: string;
  };

export type TypingStopEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithChannel<ChannelType, CommandType, UserType> &
  EventWithUser<UserType> & {
    cid: string;
    type: 'typing.stop';
    parent_id?: string;
  };

export type UserBannedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  Partial<EventWithChannel<ChannelType, CommandType, UserType>> &
  EventWithUser<UserType> & {
    cid: string;
    type: 'user.banned';
    expiration?: Date;
  };

export type UserCustomEvent<EventType extends UnknownType = UnknownType> = EventType & {
  type: string;
};

export type UserDeletedEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithUser<UserType> & {
    type: 'user.deleted';
    hard_delete?: boolean;
    mark_messages_deleted?: boolean;
  };

export type UserMutedEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  EventType &
  ChatEvent &
  EventWithUser<UserType> & {
    target_user: UserResponse<UserType>;
    type: 'user.muted';
  };

export type UserPresenceChangedEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithUser<UserType> & {
    type: 'user.presence.changed';
  };

export type UserWatchingStartEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  Partial<EventWithChannel<ChannelType, CommandType, UserType>> &
  EventWithUser<UserType> & {
    channel_id: string;
    channel_type: string;
    cid: string;
    type: 'user.watching.start';
  };

export type UserWatchingStopEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithUser<UserType> & {
    cid: string;
    type: 'user.watching.stop';
  };

export type UserUnbannedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  Partial<EventWithChannel<ChannelType, CommandType, UserType>> &
  EventWithUser<UserType> & {
    cid: string;
    type: 'user.unbanned';
  };

export type UserUnmutedEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithUser<UserType> & {
    target_user: UserResponse<UserType>;
    type: 'user.unmuted';
  };

export type UserUpdatedEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventWithUser<UserType> & {
    type: 'user.updated';
  };

/**
 * Event grouping types
 */

export type EventHandler<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType,
  SpecificEventType extends EventTypes = 'all'
> = (
  event: StreamEvent<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType,
    SpecificEventType
  >,
) => void;

type EventMap<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = {
  'channel.created': ChannelCreatedEvent<ChannelType, CommandType, EventType, UserType>;
  'channel.deleted': ChannelDeletedEvent<ChannelType, CommandType, EventType, UserType>;
  'channel.hidden': ChannelHiddenEvent<ChannelType, CommandType, EventType, UserType>;
  'channel.muted': ChannelMutedEvent<ChannelType, CommandType, EventType, UserType>;
  'channel.truncated': ChannelTruncatedEvent<
    ChannelType,
    CommandType,
    EventType,
    UserType
  >;
  'channel.unmuted': ChannelUnmutedEvent<ChannelType, CommandType, EventType, UserType>;
  'channel.updated': ChannelUpdatedEvent<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  'channel.visible': ChannelVisibleEvent<ChannelType, CommandType, EventType, UserType>;
  'connection.changed': ConnectionChangedEvent;
  'connection.recovered': ConnectionRecoveredEvent;
  'health.check': HealthCheckEvent<ChannelType, CommandType, EventType, UserType>;
  'member.added': MemberAddedEvent<ChannelType, CommandType, EventType, UserType>;
  'member.removed': MemberRemovedEvent<ChannelType, CommandType, EventType, UserType>;
  'member.updated': MemberUpdatedEvent<ChannelType, CommandType, EventType, UserType>;
  'message.deleted': MessageDeletedEvent<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  'message.new': MessageNewEvent<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  'message.read': MessageReadEvent<ChannelType, CommandType, EventType, UserType>;
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
  'notification.invite_accepted': NotificationInviteAcceptedEvent<
    ChannelType,
    CommandType,
    EventType,
    UserType
  >;
  'notification.invite_rejected': NotificationInviteRejectedEvent<
    ChannelType,
    CommandType,
    EventType,
    UserType
  >;
  'notification.invited': NotificationInvitedEvent<
    ChannelType,
    CommandType,
    EventType,
    UserType
  >;
  'notification.mark_read': NotificationMarkReadEvent<
    ChannelType,
    CommandType,
    EventType,
    UserType
  >;
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
    ChannelType,
    CommandType,
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
  'reaction.updated': ReactionUpdatedEvent<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  'typing.start': TypingStartEvent<ChannelType, CommandType, EventType, UserType>;
  'typing.stop': TypingStopEvent<ChannelType, CommandType, EventType, UserType>;
  'user.banned': UserBannedEvent<ChannelType, CommandType, EventType, UserType>;
  'user.deleted': UserDeletedEvent<EventType, UserType>;
  'user.muted': UserMutedEvent<EventType, UserType>;
  'user.presence.changed': UserPresenceChangedEvent<EventType, UserType>;
  'user.unbanned': UserUnbannedEvent<ChannelType, CommandType, EventType, UserType>;
  'user.unmuted': UserUnmutedEvent<EventType, UserType>;
  'user.updated': UserUpdatedEvent<EventType, UserType>;
  'user.watching.start': UserWatchingStartEvent<
    ChannelType,
    CommandType,
    EventType,
    UserType
  >;
  'user.watching.stop': UserWatchingStopEvent<EventType, UserType>;
};

export type EventTypes = keyof EventMap | 'all';

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

export type StreamEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType,
  SpecificEventType extends EventTypes = 'all'
> = SpecificEventType extends Exclude<EventTypes, 'all'>
  ? EventMap<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >[SpecificEventType]
  : EventUnion<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >;
