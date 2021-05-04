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

// Needed because of edge case where we used to export 'ConnectionChangeEvent type so users may already be using it
export type ConnectionChangeEvent<
  TypeGroupingStrategy extends _TypeGroupingStrategies = 'deprecated_intersection'
> = {
  type: TypeGroupingStrategy extends 'union' ? 'connection.changed' : EventTypes;
  online?: boolean;
  received_at?: string | Date;
  watcher_count?: number;
};

export type ConnectionRecovered = {
  type: 'connection.recovered';
  received_at?: string | Date;
  watcher_count?: number;
};

type ChatEvent = {
  created_at: string;
  received_at?: string | Date;
  watcher_count?: number;
};

type EventUser<UserType extends UnknownType = UnknownType> = {
  user: UserResponse<UserType>;
};

type EventChannel<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType extends UnknownType = UnknownType
> = {
  channel: ChannelResponse<ChannelType, CommandType, UserType>;
  channel_id: string;
  channel_type: string;
};

type EventMessage<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = {
  message?: MessageResponse<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  >;
};

type EventReaction<
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = {
  reaction: ReactionResponse<ReactionType, UserType>;
};

type EventMember<UserType extends UnknownType = UnknownType> = {
  member: ChannelMemberResponse<UserType>;
};

type EventOwnUser<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  UserType extends UnknownType = UnknownType
> = {
  me: OwnUserResponse<ChannelType, CommandType, UserType>;
};

export type ChannelCreatedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventChannel<ChannelType, CommandType, UserType> &
  EventUser<UserType> & {
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
  EventChannel<ChannelType, CommandType, UserType> &
  Partial<EventUser<UserType>> & {
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
  EventChannel<ChannelType, CommandType, UserType> &
  EventUser<UserType> & {
    cid: string;
    clear_history: boolean;
    type: 'channel.hidden';
  };

export type ChannelMuteEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventUser<UserType> & {
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
  EventChannel<ChannelType, CommandType, UserType> &
  Partial<EventUser<UserType>> & {
    cid: string;
    type: 'channel.truncated';
  };

export type ChannelUnmuteEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventUser<UserType> & {
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
  EventChannel<ChannelType, CommandType, UserType> &
  Partial<EventUser<UserType>> &
  Partial<
    EventMessage<
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
  EventChannel<ChannelType, CommandType, UserType> &
  EventUser<UserType> & {
    type: 'channel.visible';
  };

export type HealthEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventOwnUser<ChannelType, CommandType, UserType> & {
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
  EventChannel<ChannelType, CommandType, UserType> &
  EventUser<UserType> &
  EventMember<UserType> & {
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
  EventChannel<ChannelType, CommandType, UserType> &
  EventUser<UserType> & {
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
  EventChannel<ChannelType, CommandType, UserType> &
  EventUser<UserType> &
  EventMember<UserType> & {
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
  EventChannel<ChannelType, CommandType, UserType> &
  Partial<EventUser<UserType>> &
  EventMessage<
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
  EventChannel<ChannelType, CommandType, UserType> &
  EventUser<UserType> & {
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
  EventChannel<ChannelType, CommandType, UserType> &
  EventUser<UserType> &
  EventMessage<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  > & {
    type: 'message.updated';
  };

export type NewMessageEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventChannel<ChannelType, CommandType, UserType> &
  EventUser<UserType> &
  EventMessage<
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
  EventChannel<ChannelType, CommandType, UserType> &
  EventUser<UserType> &
  EventMember<UserType> & {
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
  EventChannel<ChannelType, CommandType, UserType> & {
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
  EventOwnUser<ChannelType, CommandType, UserType> & {
    type: 'notification.channel_mutes_updated';
  };

export type NotificationChannelTruncatedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventChannel<ChannelType, CommandType, UserType> &
  EventUser<UserType> &
  EventMember<UserType> & {
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
  EventChannel<ChannelType, CommandType, UserType> &
  EventUser<UserType> &
  EventMember<UserType> & {
    cid: string;
    type: 'notification.invite_accepted';
  };

export type NotificationInviteRejectedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventChannel<ChannelType, CommandType, UserType> &
  EventUser<UserType> &
  EventMember<UserType> & {
    cid: string;
    type: 'notification.invite_rejected';
  };

export type NotificationInvitedEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventChannel<ChannelType, CommandType, UserType> &
  EventUser<UserType> &
  EventMember<UserType> & {
    cid: string;
    type: 'notification.invited';
  };

export type NotificationMarkReadEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  Partial<EventChannel<ChannelType, CommandType, UserType>> &
  EventUser<UserType> & {
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
  EventChannel<ChannelType, CommandType, UserType> &
  EventMessage<
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
  EventOwnUser<ChannelType, CommandType, UserType> & {
    type: 'notification.mutes_updated';
  };

export type NotificationRemovedFromChannelEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventChannel<ChannelType, CommandType, UserType> &
  EventUser<UserType> &
  EventMember<UserType> & {
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
  EventChannel<ChannelType, CommandType, UserType> &
  EventUser<UserType> &
  EventMessage<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  > &
  EventReaction<ReactionType, UserType> & {
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
  EventChannel<ChannelType, CommandType, UserType> &
  EventUser<UserType> &
  EventMessage<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  > &
  EventReaction<ReactionType, UserType> & {
    type: 'reaction.new';
  };

export type ReactionUpdateEvent<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventChannel<ChannelType, CommandType, UserType> &
  EventUser<UserType> &
  EventMessage<
    AttachmentType,
    ChannelType,
    CommandType,
    MessageType,
    ReactionType,
    UserType
  > &
  EventReaction<ReactionType, UserType> & {
    type: 'reaction.updated';
  };

// keeping unused params for backwards compatibility
export type TypingStartEvent<
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  MessageType extends UnknownType = UnknownType,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventChannel<ChannelType, CommandType, UserType> &
  EventUser<UserType> & {
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
  EventChannel<ChannelType, CommandType, UserType> &
  EventUser<UserType> & {
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
  Partial<EventChannel<ChannelType, CommandType, UserType>> &
  EventUser<UserType> & {
    cid: string;
    type: 'user.banned';
    expiration?: Date;
  };

export type UserDeletedEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventUser<UserType> & {
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
  EventUser<UserType> & {
    target_user: UserResponse<UserType>;
    type: 'user.muted';
  };

export type UserPresenceChangedEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventUser<UserType> & {
    type: 'user.presence.changed';
  };

export type UserStartWatchingEvent<
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  Partial<EventChannel<ChannelType, CommandType, UserType>> &
  EventUser<UserType> & {
    channel_id: string;
    channel_type: string;
    cid: string;
    type: 'user.watching.start';
  };

export type UserStopWatchingEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventUser<UserType> & {
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
  Partial<EventChannel<ChannelType, CommandType, UserType>> &
  EventUser<UserType> & {
    cid: string;
    type: 'user.unbanned';
  };

export type UserUnmutedEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventUser<UserType> & {
    target_user: UserResponse<UserType>;
    type: 'user.unmuted';
  };

export type UserUpdatedEvent<
  EventType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType
> = EventType &
  ChatEvent &
  EventUser<UserType> & {
    type: 'user.updated';
  };

/**
 * Internal temporary type parameter used to enable/disable new union type for events. Defaults to 'deprecated_intersection'.
 *
 *
 * @example
 * // Event type should be narrowed to `ChannelCreatedEvent`
 * client.on<'union'>((event) => {
 *   if(event.type === 'channel.created') {
 *     console.log(event.user);
 *   }
 * })
 *
 * @desc This is part of the migration steps for the new union type for events:
 * 1. Release it with its default value set to 'deprecated_intersection', avoiding breaking changes and allowing
 *    users to use the new union type by using this flag
 * 2. Release it with its default value set to 'union',  forcing users who are still using the old version to
 *    manually set the 'deprecated_intersection' flag
 * 3. Remove this type parameter entirely, allowing only the events union type to exist
 */
export type _TypeGroupingStrategies = 'union' | 'deprecated_intersection';

/**
 * @deprecated This is being deprecated and will eventually be removed
 */
type EventIntersection<
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
  'channel.created': ChannelCreatedEvent<ChannelType, CommandType, EventType, UserType>;
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
  'channel.visible': ChannelVisibleEvent<ChannelType, CommandType, EventType, UserType>;
  'connection.changed': ConnectionChangeEvent<'union'>;
  'connection.recovered': ConnectionRecovered;
  'health.check': HealthEvent<ChannelType, CommandType, EventType, UserType>;
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
  'message.new': NewMessageEvent<
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
  'reaction.updated': ReactionUpdateEvent<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  'typing.start': TypingStartEvent<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType
  >;
  'typing.stop': TypingStopEvent<ChannelType, CommandType, EventType, UserType>;
  'user.banned': UserBannedEvent<ChannelType, CommandType, EventType, UserType>;
  'user.deleted': UserDeletedEvent<EventType, UserType>;
  'user.muted': UserMutedEvent<EventType, UserType>;
  'user.presence.changed': UserPresenceChangedEvent<EventType, UserType>;
  'user.unbanned': UserUnbannedEvent<ChannelType, CommandType, EventType, UserType>;
  'user.unmuted': UserUnmutedEvent<EventType, UserType>;
  'user.updated': UserUpdatedEvent<EventType, UserType>;
  'user.watching.start': UserStartWatchingEvent<
    ChannelType,
    CommandType,
    EventType,
    UserType
  >;
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

type EventUnionOrSpecific<
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

export type EventTypes = keyof EventMap | 'all';

export type Event<
  AttachmentType extends UnknownType = UnknownType,
  ChannelType extends UnknownType = UnknownType,
  CommandType extends string = LiteralStringForUnion,
  EventType extends UnknownType = UnknownType,
  MessageType extends UnknownType = UnknownType,
  ReactionType extends UnknownType = UnknownType,
  UserType extends UnknownType = UnknownType,
  TypeGroupingStrategy extends _TypeGroupingStrategies = 'deprecated_intersection',
  SpecificEventType extends EventTypes = 'all'
> = TypeGroupingStrategy extends 'deprecated_intersection'
  ? EventIntersection<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType
    >
  : EventUnionOrSpecific<
      AttachmentType,
      ChannelType,
      CommandType,
      EventType,
      MessageType,
      ReactionType,
      UserType,
      SpecificEventType
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
  TypeGroupingStrategy extends _TypeGroupingStrategies = 'deprecated_intersection',
  SpecificEventType extends EventTypes = 'all'
> = (
  event: Event<
    AttachmentType,
    ChannelType,
    CommandType,
    EventType,
    MessageType,
    ReactionType,
    UserType,
    TypeGroupingStrategy,
    SpecificEventType
  >,
) => void;
