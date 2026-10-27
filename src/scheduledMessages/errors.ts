import { ErrorFromResponse, ScheduledMessageErrorReason } from '../types';
import type { APIErrorResponse } from '../types';

export type ScheduledMessageAPIError = ErrorFromResponse<APIErrorResponse>;

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

const isErrorFromResponse = (error: Error): error is ScheduledMessageAPIError =>
  error instanceof ErrorFromResponse;

export const getScheduledMessageErrorReason = (
  error: Error,
): ScheduledMessageErrorReason | undefined => {
  if (!isErrorFromResponse(error)) return;

  const { code, response } = error;
  const errorData: Partial<APIErrorResponse> = response?.data ?? {};
  const { exception_fields: exceptionFields = {} } = errorData;
  const { reason } = exceptionFields;

  const reasonFromCode = code === null ? undefined : REASON_BY_ERROR_CODE[code];

  const errorReason = isKnownErrorReason(reason) ? reason : reasonFromCode;

  return errorReason;
};
