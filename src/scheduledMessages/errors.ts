import { StreamAPIError } from '../types';
import { ScheduledMessageErrorReason } from './constants';

const NOT_FOUND_STATUS = 404;

const REASON_BY_ERROR_CODE: Record<number, ScheduledMessageErrorReason> = {
  114: ScheduledMessageErrorReason.Disabled,
  115: ScheduledMessageErrorReason.TooSoon,
  116: ScheduledMessageErrorReason.TooFar,
  117: ScheduledMessageErrorReason.ChannelLimit,
  118: ScheduledMessageErrorReason.UserLimit,
  119: ScheduledMessageErrorReason.IdTaken,
  120: ScheduledMessageErrorReason.NotEditable,
  121: ScheduledMessageErrorReason.Sending,
  122: ScheduledMessageErrorReason.Conflict,
  123: ScheduledMessageErrorReason.AlreadySent,
  124: ScheduledMessageErrorReason.Canceled,
};

const KNOWN_ERROR_REASONS = new Set<string>(Object.values(ScheduledMessageErrorReason));

const isKnownErrorReason = (reason?: string): reason is ScheduledMessageErrorReason =>
  !!reason && KNOWN_ERROR_REASONS.has(reason);

const isStreamAPIError = (error: unknown): error is StreamAPIError =>
  error instanceof StreamAPIError;

export const getScheduledMessageErrorReason = (
  error: unknown,
): ScheduledMessageErrorReason | undefined => {
  if (!isStreamAPIError(error)) return;

  const { code, response } = error;
  const { exception_fields: exceptionFields = {} } = response?.data ?? {};
  const { reason } = exceptionFields;

  const reasonFromCode = code === undefined ? undefined : REASON_BY_ERROR_CODE[code];

  const errorReason = isKnownErrorReason(reason) ? reason : reasonFromCode;

  return errorReason;
};

export const isScheduledMessageError = (
  error: unknown,
  reason: ScheduledMessageErrorReason,
) => getScheduledMessageErrorReason(error) === reason;

export const isScheduledMessageNotFoundError = (error: unknown) =>
  isStreamAPIError(error) && error.status === NOT_FOUND_STATUS;
