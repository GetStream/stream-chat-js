import { AxiosResponse } from 'axios';
import { APIErrorResponse } from './types';

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

type APIError = Error & { code: number; isWSFailure?: boolean };

export function isAPIError(error: unknown): error is APIError {
  return error instanceof Error && 'code' in error && typeof error.code === 'number';
}

export function isErrorRetryable(error: unknown) {
  if (!isAPIError(error)) return false;
  const err = APIErrorCodes[`${error.code}`];
  if (!err) return false;
  return err.retryable;
}

export function isConnectionIDError(error: unknown) {
  return isAPIError(error) && error.code === 46; // ConnectionIDNotFoundError
}

interface ErrorWithMessage {
  message: string;
}

export function isErrorWithMessage(error: unknown): error is ErrorWithMessage {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as Record<string, unknown>).message === 'string'
  );
}

export function isWSFailure(err: unknown): boolean {
  if (isAPIError(err)) {
    return err.isWSFailure ?? false;
  }

  try {
    if (isErrorWithMessage(err)) {
      const message = JSON.parse(err.message);
      if ('isWSFailure' in message && typeof message.isWSFailure === 'boolean') {
        return message.isWSFailure;
      }
    }
    return false;
  } catch (_) {
    return false;
  }
}

export function isErrorResponse(res: AxiosResponse<unknown>): res is AxiosResponse<APIErrorResponse> {
  return !res.status || res.status < 200 || 300 <= res.status;
}
