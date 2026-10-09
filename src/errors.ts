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

/**
 * Whether the error is the backend rejecting a send because a message with the same id
 * is already stored. This happens when a send whose response was lost (client timeout,
 * edge retry) is sent again with the same client-minted id: the backend inserts with
 * `ON CONFLICT DO NOTHING` and answers with the generic input error code (4), so the
 * message text has to be matched as well to tell it apart from other input errors
 * (e.g. a poll option or vote that already exists).
 */
export function isMessageAlreadyExistsError(error: unknown): boolean {
  const { code, response, status } = (error ?? {}) as {
    code?: unknown;
    response?: { data?: Partial<APIErrorResponse>; status?: number };
    status?: unknown;
  };
  const text = response?.data?.message;
  return (
    (status ?? response?.status) === 400 &&
    (code ?? response?.data?.code) === 4 &&
    typeof text === 'string' &&
    text.includes('a message with ID') &&
    text.includes('already exists')
  );
}
