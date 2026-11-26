import type {
  ScheduledMessageFailureReason,
  ScheduledMessageQueryStatus,
  ScheduledMessageStatus,
} from '../gen/models';

export const SCHEDULED_MESSAGE_STATUS = {
  Canceled: 'canceled',
  Failed: 'failed',
  Scheduled: 'scheduled',
  Sending: 'sending',
  Sent: 'sent',
} as const satisfies Record<string, ScheduledMessageStatus>;

export const SCHEDULED_MESSAGE_ACTIVE_STATUSES: ScheduledMessageQueryStatus[] = [
  SCHEDULED_MESSAGE_STATUS.Scheduled,
  SCHEDULED_MESSAGE_STATUS.Sending,
  SCHEDULED_MESSAGE_STATUS.Failed,
];

export const SCHEDULED_MESSAGE_FAILURE_REASON = {
  Banned: 'banned',
  ChannelDeleted: 'channel_deleted',
  ChannelFrozen: 'channel_frozen',
  Expired: 'expired',
  HookRejected: 'hook_rejected',
  InternalError: 'internal_error',
  InvalidMessage: 'invalid_message',
  ModerationBlocked: 'moderation_blocked',
  NoPermission: 'no_permission',
  PendingNotSupported: 'pending_not_supported',
  UserDeleted: 'user_deleted',
} as const satisfies Record<string, ScheduledMessageFailureReason>;

export const ScheduledMessageErrorReason = {
  AlreadySent: 'scheduled_message_already_sent',
  Canceled: 'scheduled_message_canceled',
  ChannelLimit: 'scheduled_limit_channel',
  Conflict: 'scheduled_message_conflict',
  Disabled: 'scheduled_messages_disabled',
  IdTaken: 'scheduled_message_id_taken',
  NotEditable: 'scheduled_message_not_editable',
  Sending: 'scheduled_message_sending',
  TooFar: 'scheduled_at_too_far',
  TooSoon: 'scheduled_at_too_soon',
  UserLimit: 'scheduled_limit_user',
} as const;

export type ScheduledMessageErrorReason =
  (typeof ScheduledMessageErrorReason)[keyof typeof ScheduledMessageErrorReason];

export const ScheduledMessageBlockReason = {
  Command: 'command',
  Unavailable: 'unavailable',
} as const;

export type ScheduledMessageBlockReason =
  (typeof ScheduledMessageBlockReason)[keyof typeof ScheduledMessageBlockReason];

export const ScheduledMessageCompositionEndReason = {
  Deleted: 'deleted',
  Failed: 'failed',
  Sent: 'sent',
} as const;

export type ScheduledMessageCompositionEndReason =
  (typeof ScheduledMessageCompositionEndReason)[keyof typeof ScheduledMessageCompositionEndReason];

export const ScheduledMessageEventType = {
  Created: 'scheduled_message.created',
  Deleted: 'scheduled_message.deleted',
  Failed: 'scheduled_message.failed',
  Sent: 'scheduled_message.sent',
  Updated: 'scheduled_message.updated',
} as const;

export type ScheduledMessageEventType =
  (typeof ScheduledMessageEventType)[keyof typeof ScheduledMessageEventType];
