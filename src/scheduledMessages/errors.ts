import type { APIErrorResponse, ScheduledMessageErrorReason } from '../types';

const reasonByCode: Record<number, ScheduledMessageErrorReason> = {
  114: 'scheduled_messages_disabled',
  115: 'scheduled_at_too_soon',
  116: 'scheduled_at_too_far',
  117: 'scheduled_limit_channel',
  118: 'scheduled_limit_user',
  119: 'scheduled_message_id_taken',
  120: 'scheduled_message_not_editable',
  121: 'scheduled_message_sending',
  122: 'scheduled_message_conflict',
  123: 'scheduled_message_already_sent',
  124: 'scheduled_message_canceled',
};

const reasons = new Set<string>(Object.values(reasonByCode));

const isScheduledMessageErrorReason = (
  value: unknown,
): value is ScheduledMessageErrorReason =>
  typeof value === 'string' && reasons.has(value);

export const getScheduledMessageErrorReason = (
  error: unknown,
): ScheduledMessageErrorReason | undefined => {
  if (!error || typeof error !== 'object') return;
  const { code, response } = error as {
    code?: unknown;
    response?: { data?: Partial<APIErrorResponse> };
  };
  const reason = response?.data?.exception_fields?.reason;
  if (isScheduledMessageErrorReason(reason)) return reason;
  return typeof code === 'number' ? reasonByCode[code] : undefined;
};
