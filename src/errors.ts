import type { AxiosResponse } from 'axios';
import { isAxiosError, isCancel } from 'axios';
import { OfflineError } from './offline-support/types';
import type { APIError as Gen_APIError, StreamAPIError } from './types';

export const APIErrorCodes: Record<string, { name: string; retryable: boolean }> = {
  '-1': { name: 'InternalSystemError', retryable: true },
  '2': { name: 'AccessKeyError', retryable: false },
  '3': { name: 'AuthenticationFailedError', retryable: true },
  '4': { name: 'InputError', retryable: false },
  '6': { name: 'DuplicateUsernameError', retryable: false },
  '9': { name: 'RateLimitError', retryable: true },
  '16': { name: 'DoesNotExistError', retryable: false },
  '17': { name: 'NotAllowedError', retryable: false },
  '18': { name: 'EventNotSupportedError', retryable: false },
  '19': { name: 'ChannelFeatureNotSupportedError', retryable: false },
  '20': { name: 'MessageTooLongError', retryable: false },
  '21': { name: 'MultipleNestingLevelError', retryable: false },
  '22': { name: 'PayloadTooBigError', retryable: false },
  '23': { name: 'RequestTimeoutError', retryable: true },
  '24': { name: 'MaxHeaderSizeExceededError', retryable: false },
  '40': { name: 'AuthErrorTokenExpired', retryable: false },
  '41': { name: 'AuthErrorTokenNotValidYet', retryable: false },
  '42': { name: 'AuthErrorTokenUsedBeforeIssuedAt', retryable: false },
  '43': { name: 'AuthErrorTokenSignatureInvalid', retryable: false },
  '44': { name: 'CustomCommandEndpointMissingError', retryable: false },
  '45': { name: 'CustomCommandEndpointCallError', retryable: true },
  '46': { name: 'ConnectionIDNotFoundError', retryable: false },
  '60': { name: 'CoolDownError', retryable: true },
  '69': { name: 'ErrWrongRegion', retryable: false },
  '70': { name: 'ErrQueryChannelPermissions', retryable: false },
  '71': { name: 'ErrTooManyConnections', retryable: true },
  '99': { name: 'AppSuspendedError', retryable: false },
};

export type APIError = Error & {
  code: number;
  isWSFailure?: boolean;
  StatusCode?: number;
};

export function isAPIError(error: Error): error is APIError {
  return (error as APIError).code !== undefined;
}

/**
 * Whether the server answered "does not exist": an expected answer for a resource a caller may ask
 * about before it exists, not a failure.
 */
export function isDoesNotExistError(error: Error): boolean {
  return (
    isAPIError(error) && APIErrorCodes[`${error.code}`]?.name === 'DoesNotExistError'
  );
}

export function isErrorRetryable(error: APIError) {
  if (!error.code) return false;
  const err = APIErrorCodes[`${error.code}`];
  if (!err) return false;
  return err.retryable;
}

export function isConnectionIDError(error: APIError) {
  return error.code === 46; // ConnectionIDNotFoundError
}

/**
 * Whether an error is transient and worth queueing or retrying: the server never responded (no
 * `response`, e.g. an axios network error or an `OfflineError`) or responded with a retryable code
 * (see {@link APIErrorCodes}). A request cancelled by the caller is not ephemeral: it is dropped,
 * not queued for replay.
 */
export function isEphemeral(error: Error): boolean {
  if (isCancel(error)) return false;
  if (!(error as { response?: unknown }).response) return true;
  return isErrorRetryable(error as APIError);
}

export function isWSFailure(err: APIError): boolean {
  if (typeof err.isWSFailure === 'boolean') {
    return err.isWSFailure;
  }

  try {
    return JSON.parse(err.message).isWSFailure;
  } catch (_) {
    return false;
  }
}

export function isErrorResponse(
  res: AxiosResponse<unknown>,
): res is AxiosResponse<Gen_APIError> {
  return !res.status || res.status < 200 || 300 <= res.status;
}

/**
 * Whether a request failed in transport: axios sent it and got no response (and the caller did not
 * cancel it), or the offline layer refused to send it. An error thrown by anything else, such as an
 * integrator's own request handler, is not one, even though it carries no response either.
 */
const isTransportFailure = (error: unknown) =>
  error instanceof OfflineError ||
  (isAxiosError(error) && !error.response && !isCancel(error));

/**
 * Turns whatever a request threw into a plain error object, so it can be stored on a message. A
 * transport failure (see {@link isTransportFailure}) has no HTTP status and is given `status: 0`,
 * which is how a UI tells it from a rejection.
 */
export const parseError = (error: unknown): StreamAPIError => {
  const stringError = JSON.stringify(error);
  const parsed = (stringError ? JSON.parse(stringError) : {}) as StreamAPIError;
  return parsed.status == null && isTransportFailure(error)
    ? ({ ...parsed, status: 0 } as StreamAPIError)
    : parsed;
};

/** Whether the server rejected a send because a message with that ID already exists. */
export const isAlreadyExistsError = (error: unknown, parsed: StreamAPIError) =>
  parsed.code === 4 && error instanceof Error && error.message.includes('already exists');
