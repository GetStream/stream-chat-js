import type { WSEvent } from '../models';
import { decoders } from '../model-decoders/decoders';

const eventDecoderMapping: {
  [key in WSEvent['type']]: (data: Record<string, any>) => WSEvent;
} = {
  '*': (data: Record<string, any>) => decoders.CustomEvent(data),

  'ai_indicator.clear': (data: Record<string, any>) =>
    decoders.AIIndicatorClearEvent(data),

  'ai_indicator.stop': (data: Record<string, any>) => decoders.AIIndicatorStopEvent(data),

  'ai_indicator.update': (data: Record<string, any>) =>
    decoders.AIIndicatorUpdateEvent(data),

  'app.updated': (data: Record<string, any>) => decoders.AppUpdatedEvent(data),

  'channel.created': (data: Record<string, any>) => decoders.ChannelCreatedEvent(data),

  'channel.deleted': (data: Record<string, any>) => decoders.ChannelDeletedEvent(data),

  'channel.frozen': (data: Record<string, any>) => decoders.ChannelFrozenEvent(data),

  'channel.hidden': (data: Record<string, any>) => decoders.ChannelHiddenEvent(data),

  'channel.kicked': (data: Record<string, any>) => decoders.ChannelKickedEvent(data),

  'channel.max_streak_changed': (data: Record<string, any>) =>
    decoders.MaxStreakChangedEvent(data),

  'channel.truncated': (data: Record<string, any>) =>
    decoders.ChannelTruncatedEvent(data),

  'channel.unfrozen': (data: Record<string, any>) => decoders.ChannelUnFrozenEvent(data),

  'channel.updated': (data: Record<string, any>) => decoders.ChannelUpdatedEvent(data),

  'channel.visible': (data: Record<string, any>) => decoders.ChannelVisibleEvent(data),

  'draft.deleted': (data: Record<string, any>) => decoders.DraftDeletedEvent(data),

  'draft.updated': (data: Record<string, any>) => decoders.DraftUpdatedEvent(data),

  'health.check': (data: Record<string, any>) => decoders.HealthCheckEvent(data),

  'member.added': (data: Record<string, any>) => decoders.MemberAddedEvent(data),

  'member.removed': (data: Record<string, any>) => decoders.MemberRemovedEvent(data),

  'member.updated': (data: Record<string, any>) => decoders.MemberUpdatedEvent(data),

  'message.deleted': (data: Record<string, any>) => decoders.MessageDeletedEvent(data),

  'message.delivered': (data: Record<string, any>) =>
    decoders.MessageDeliveredEvent(data),

  'message.new': (data: Record<string, any>) => decoders.MessageNewEvent(data),

  'message.pending': (data: Record<string, any>) => decoders.PendingMessageEvent(data),

  'message.read': (data: Record<string, any>) => decoders.MessageReadEvent(data),

  'message.undeleted': (data: Record<string, any>) =>
    decoders.MessageUndeletedEvent(data),

  'message.updated': (data: Record<string, any>) => decoders.MessageUpdatedEvent(data),

  'moderation.custom_action': (data: Record<string, any>) =>
    decoders.ModerationCustomActionEvent(data),

  'moderation.flagged': (data: Record<string, any>) =>
    decoders.ModerationFlaggedEvent(data),

  'moderation.mark_reviewed': (data: Record<string, any>) =>
    decoders.ModerationMarkReviewedEvent(data),

  'notification.added_to_channel': (data: Record<string, any>) =>
    decoders.NotificationAddedToChannelEvent(data),

  'notification.channel_deleted': (data: Record<string, any>) =>
    decoders.NotificationChannelDeletedEvent(data),

  'notification.channel_mutes_updated': (data: Record<string, any>) =>
    decoders.NotificationChannelMutesUpdatedEvent(data),

  'notification.channel_truncated': (data: Record<string, any>) =>
    decoders.NotificationChannelTruncatedEvent(data),

  'notification.invite_accepted': (data: Record<string, any>) =>
    decoders.NotificationInviteAcceptedEvent(data),

  'notification.invite_rejected': (data: Record<string, any>) =>
    decoders.NotificationInviteRejectedEvent(data),

  'notification.invited': (data: Record<string, any>) =>
    decoders.NotificationInvitedEvent(data),

  'notification.mark_read': (data: Record<string, any>) =>
    decoders.NotificationMarkReadEvent(data),

  'notification.mark_unread': (data: Record<string, any>) =>
    decoders.NotificationMarkUnreadEvent(data),

  'notification.message_new': (data: Record<string, any>) =>
    decoders.NotificationNewMessageEvent(data),

  'notification.mutes_updated': (data: Record<string, any>) =>
    decoders.NotificationMutesUpdatedEvent(data),

  'notification.reminder_due': (data: Record<string, any>) =>
    decoders.ReminderNotificationEvent(data),

  'notification.removed_from_channel': (data: Record<string, any>) =>
    decoders.NotificationRemovedFromChannelEvent(data),

  'notification.thread_message_new': (data: Record<string, any>) =>
    decoders.NotificationThreadMessageNewEvent(data),

  'poll.closed': (data: Record<string, any>) => decoders.PollClosedEvent(data),

  'poll.deleted': (data: Record<string, any>) => decoders.PollDeletedEvent(data),

  'poll.updated': (data: Record<string, any>) => decoders.PollUpdatedEvent(data),

  'poll.vote_casted': (data: Record<string, any>) => decoders.PollVoteCastedEvent(data),

  'poll.vote_changed': (data: Record<string, any>) => decoders.PollVoteChangedEvent(data),

  'poll.vote_removed': (data: Record<string, any>) => decoders.PollVoteRemovedEvent(data),

  'reaction.deleted': (data: Record<string, any>) => decoders.ReactionDeletedEvent(data),

  'reaction.new': (data: Record<string, any>) => decoders.ReactionNewEvent(data),

  'reaction.updated': (data: Record<string, any>) => decoders.ReactionUpdatedEvent(data),

  'reminder.created': (data: Record<string, any>) => decoders.ReminderCreatedEvent(data),

  'reminder.deleted': (data: Record<string, any>) => decoders.ReminderDeletedEvent(data),

  'reminder.updated': (data: Record<string, any>) => decoders.ReminderUpdatedEvent(data),

  'thread.updated': (data: Record<string, any>) => decoders.ThreadUpdatedEvent(data),

  'typing.start': (data: Record<string, any>) => decoders.TypingStartEvent(data),

  'typing.stop': (data: Record<string, any>) => decoders.TypingStopEvent(data),

  'user.banned': (data: Record<string, any>) => decoders.UserBannedEvent(data),

  'user.deactivated': (data: Record<string, any>) => decoders.UserDeactivatedEvent(data),

  'user.deleted': (data: Record<string, any>) => decoders.UserDeletedEvent(data),

  'user.messages.deleted': (data: Record<string, any>) =>
    decoders.UserMessagesDeletedEvent(data),

  'user.muted': (data: Record<string, any>) => decoders.UserMutedEvent(data),

  'user.presence.changed': (data: Record<string, any>) =>
    decoders.UserPresenceChangedEvent(data),

  'user.reactivated': (data: Record<string, any>) => decoders.UserReactivatedEvent(data),

  'user.unbanned': (data: Record<string, any>) => decoders.UserUnbannedEvent(data),

  'user.updated': (data: Record<string, any>) => decoders.UserUpdatedEvent(data),

  'user.watching.start': (data: Record<string, any>) =>
    decoders.UserWatchingStartEvent(data),

  'user.watching.stop': (data: Record<string, any>) =>
    decoders.UserWatchingStopEvent(data),

  'user_group.created': (data: Record<string, any>) =>
    decoders.UserGroupCreatedEvent(data),

  'user_group.deleted': (data: Record<string, any>) =>
    decoders.UserGroupDeletedEvent(data),

  'user_group.member_added': (data: Record<string, any>) =>
    decoders.UserGroupMemberAddedEvent(data),

  'user_group.member_removed': (data: Record<string, any>) =>
    decoders.UserGroupMemberRemovedEvent(data),

  'user_group.updated': (data: Record<string, any>) =>
    decoders.UserGroupUpdatedEvent(data),
};

export const decodeWSEvent = (data: { type: string } & Record<string, any>) => {
  if (Object.hasOwn(eventDecoderMapping, data.type)) {
    return eventDecoderMapping[data.type as WSEvent['type']](data);
  } else {
    return data;
  }
};
