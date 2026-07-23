import type { AxiosResponse } from 'axios';
import type { APIErrorResponse } from './types';

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

export function isErrorRetryable(error: APIError) {
  if (!error.code) return false;
  const err = APIErrorCodes[`${error.code}`];
  if (!err) return false;
  return err.retryable;
}

/**
 * Whether an error is EPHEMERAL — a transient failure worth queueing/retrying rather than a
 * definitive rejection. True when the server never responded (connection/network/offline error - no
 * `response`, i.e an axios network error or an `OfflineError`) and when the server responded with a
 * retryable code (see {@link APIErrorCodes}); false only when the server responded with a
 * non-retryable code (InputError 4, DoesNotExist 16, NotAllowed 17, …).
 */
export function isEphemeral(error: Error): boolean {
  if (!(error as { response?: unknown }).response) return true;
  return isErrorRetryable(error as APIError);
}

export function isConnectionIDError(error: APIError) {
  return error.code === 46; // ConnectionIDNotFoundError
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
): res is AxiosResponse<APIErrorResponse> {
  return !res.status || res.status < 200 || 300 <= res.status;
}
