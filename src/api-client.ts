import type { AxiosError, AxiosRequestConfig, AxiosResponse, Method } from 'axios';
import { isAxiosError } from 'axios';

import type {
  APIError,
  RateLimit,
  RequestMetadata,
  StreamRequestOptions,
  StreamResponse,
} from './types';
import { StreamAPIError } from './types';
import { chatCodes, randomId, retryInterval } from './utils';
import { toFormData } from './upload-utils';
import type { StreamChat } from './client';
import { chatLoggerSystem } from './logger';
import { runWithRetry } from './utils/retryable';

const logger = chatLoggerSystem.getLogger('api-client');

const MULTIPART_CONTENT_TYPE = 'multipart/form-data';

/** The WebSocket fallback's endpoint, which a local API serves on its own port. */
const LONG_POLL_PATH = '/api/v2/longpoll';

/**
 * Uploads must not inherit the axios instance timeout (3s by default) or the size caps.
 *
 * The request's `multipart/form-data` header must win over the global `axiosRequestConfig.headers`
 * (see `populateRequestConfigWithDefaults`): under a JSON content type axios serializes the form to
 * JSON, the file silently disappears and the request still returns 2xx.
 */
const UPLOAD_REQUEST_DEFAULTS: AxiosRequestConfig = {
  timeout: 0,
  maxContentLength: Infinity,
  maxBodyLength: Infinity,
};

export class ApiClient {
  client!: StreamChat;

  constructor(client?: StreamChat) {
    if (client) this.client = client;
  }

  _getToken(): string | undefined {
    return this.client.tokenManager.getToken();
  }

  /**
   * The transport of the generated API classes. Resolves to the response body with the request's
   * `metadata` merged in. `async` so synchronous throws (URL resolution, form encoding) become
   * rejections.
   */
  async sendRequest<T>(
    method: Method,
    url: string,
    pathParams?: Record<string, string>,
    queryParams?: Record<string, unknown>,
    body?: unknown,
    requestContentType?: string,
    options?: StreamRequestOptions,
  ): Promise<StreamResponse<T>> {
    const resolvedUrl = this.resolveUrl(url, pathParams);
    const isMultipart = requestContentType === MULTIPART_CONTENT_TYPE;

    const requestBody =
      isMultipart && body && typeof body === 'object'
        ? toFormData(body as Record<string, unknown>)
        : body;

    const response = await this._doRequest<T>(method, resolvedUrl, requestBody, {
      params: queryParams,
      headers: { 'Content-Type': requestContentType },
      ...(isMultipart ? UPLOAD_REQUEST_DEFAULTS : {}),
      // Last, so a caller-supplied signal and timeout win over the upload defaults.
      ...toAxiosRequestConfig(options),
    });

    return { ...response.body, metadata: response.metadata };
  }

  async doAxiosRequest<T>(
    type: string,
    url: string,
    data?: unknown,
    options: AxiosRequestConfig = {},
  ): Promise<T> {
    return (await this._doRequest<T>(type as Method, url, data, options)).body;
  }

  get<T>(url: string, params?: AxiosRequestConfig['params']) {
    return this._doRequest<T>('get', url, null, { params }).then((r) => r.body);
  }

  put<T>(url: string, data?: unknown) {
    return this._doRequest<T>('put', url, data).then((r) => r.body);
  }

  post<T>(url: string, data?: unknown) {
    return this._doRequest<T>('post', url, data).then((r) => r.body);
  }

  patch<T>(url: string, data?: unknown) {
    return this._doRequest<T>('patch', url, data).then((r) => r.body);
  }

  delete<T>(url: string, params?: AxiosRequestConfig['params']) {
    return this._doRequest<T>('delete', url, null, { params }).then((r) => r.body);
  }

  private resolveUrl(url: string, pathParams?: Record<string, string>): string {
    let resolved = url;
    if (pathParams) {
      for (const [key, value] of Object.entries(pathParams)) {
        // A key with no placeholder is a query or body field passed as a path param, which the
        // request would otherwise drop silently.
        if (!url.includes(`{${key}}`)) {
          throw new Error(
            `"${key}" is not a path parameter of ${url}; pass it in the request argument instead.`,
          );
        }
        resolved = resolved.replace(`{${key}}`, encodeURIComponent(value));
      }
    }
    if (resolved.startsWith('/')) {
      const baseURL =
        resolved === LONG_POLL_PATH
          ? // replace port if present for testing with local API
            this.client.baseURL?.replace(':3030', ':8900')
          : this.client.baseURL;
      resolved = baseURL + resolved;
    }
    return resolved;
  }

  populateRequestConfigWithDefaults(
    additonalConfig: AxiosRequestConfig,
  ): AxiosRequestConfig {
    const token = this._getToken();
    const axiosRequestConfig = this.client.config.getConfig('client')?.axiosRequestConfig;

    return {
      ...additonalConfig,
      headers: {
        ...axiosRequestConfig?.headers,
        ...additonalConfig.headers,
        Authorization: token,
        'stream-auth-type': this.client.getAuthType(),
        'x-stream-client': this.client.getUserAgent(),
        'x-client-request-id':
          additonalConfig.headers?.['x-client-request-id'] || randomId(),
      },
      params: {
        user_id: this.client.userId,
        api_key: this.client.key,
        // Read per request (the rest of `axiosRequestConfig` is applied when the axios instance is
        // created).
        ...axiosRequestConfig?.params,
        ...additonalConfig.params,
      },
    } satisfies AxiosRequestConfig;
  }

  private extractMetadata(
    response: AxiosResponse,
    clientRequestId: string,
  ): RequestMetadata {
    const headers = response.headers || {};
    const rateLimit: RateLimit = {};

    const limit = headers['x-ratelimit-limit'] as string | undefined;
    if (limit) rateLimit.rate_limit = parseInt(limit, 10);

    const remaining = headers['x-ratelimit-remaining'] as string | undefined;
    if (remaining) rateLimit.rate_limit_remaining = parseInt(remaining, 10);

    // Unix seconds: `new Date('1700000000')` is an Invalid Date, so convert the number explicitly.
    const reset = Number(headers['x-ratelimit-reset']);
    if (Number.isFinite(reset) && reset > 0)
      rateLimit.rate_limit_reset = new Date(reset * 1000);

    return {
      response_headers: headers as Record<string, string>,
      rate_limit: rateLimit,
      response_code: response.status,
      client_request_id: clientRequestId,
    };
  }

  private async _doRequest<T>(
    type: Method,
    url: string,
    data?: unknown | null,
    additionalConfig: AxiosRequestConfig = {},
  ): Promise<{ body: T; metadata: RequestMetadata }> {
    if (requiresConnectionId(additionalConfig.params, data)) {
      // The axios signal type is structural: a task revived from the offline db can carry a plain
      // object instead of an `AbortSignal`.
      const signal = additionalConfig.signal as AbortSignal | undefined;
      const connectionId = await this.client.connectionIdManager.getConnectionId(
        typeof signal?.addEventListener === 'function' ? signal : undefined,
      );
      additionalConfig = {
        ...additionalConfig,
        params: { ...additionalConfig.params, connection_id: connectionId },
      };
    }

    await this.client.tokenManager.tokenReady();
    const initialRequestConfig = this.populateRequestConfigWithDefaults(additionalConfig);

    const clientRequestId = initialRequestConfig.headers?.[
      'x-client-request-id'
    ] as string;

    // Only a token provider can hand out a fresh token. A static token reloads to the same expired
    // value, so its request fails immediately.
    const canRefreshExpiredToken = (error: unknown) =>
      isTokenExpiredError(error) && !this.client.tokenManager.isStatic();

    try {
      const response = await runWithRetry(
        async () => {
          await this.client.tokenManager.tokenReady();

          const token = this._getToken();

          const config: AxiosRequestConfig = {
            ...initialRequestConfig,
            method: type,
            url,
            data,
          };

          if (
            token &&
            config.headers?.Authorization &&
            token !== config.headers?.Authorization
          ) {
            config.headers.Authorization = token;
          }

          let requestResponse: AxiosResponse<T>;
          try {
            requestResponse = await this.client.axiosInstance.request<T>(config);
          } catch (error) {
            if (canRefreshExpiredToken(error)) {
              logger
                .withExtraTags('_doRequest')
                .debug(
                  `The token expired on a ${type.toUpperCase()} request. Reloading the token before retrying.`,
                  { url, config },
                );
              this.client.tokenManager.loadToken();
            }

            throw error;
          }

          return requestResponse;
        },
        {
          delayBetweenRetries: (attemptNumber) => retryInterval(attemptNumber + 1),
          retryAttempts: 10,
          isRetryable: canRefreshExpiredToken,
        },
      )();

      return {
        body: response.data,
        metadata: this.extractMetadata(response, clientRequestId),
      };
    } catch (error) {
      if (errorIsApiError(error)) {
        throw new StreamAPIError(error.response?.data.message ?? error.message, {
          code: error.response?.data.code,
          status: error.status,
          response: error.response,
        });
      } else {
        throw error;
      }
    }
  }
}

/**
 * Whether a request (one with a `watch` or `presence` flag) registers a server-side subscription
 * and so must wait for the connection id. Without it the server answers `200` but registers
 * nothing, and the channel never receives an event.
 *
 * Flagless operations that declare `connection_id` set it themselves (`stopWatchingChannel` through
 * `StreamChat`'s override, `longPoll` through the fallback); `connectionIdEndpoints.test.ts` pins
 * that set.
 */
export const requiresConnectionId = (
  params: Record<string, unknown> | undefined,
  body: unknown,
) => {
  const payload = params?.payload as Record<string, unknown> | undefined;
  const requestBody = (typeof body === 'object' && body !== null ? body : undefined) as
    | Record<string, unknown>
    | undefined;

  return Boolean(
    params?.watch ||
    params?.presence ||
    payload?.watch ||
    payload?.presence ||
    requestBody?.watch ||
    requestBody?.presence,
  );
};

/**
 * An `AbortSignal` persisted as JSON (an offline-db task payload) revives as a plain `{}`, and
 * axios throws a `TypeError` on it. Only forward a signal that can still be listened to.
 */
const isUsableAbortSignal = (signal: unknown): signal is AbortSignal =>
  typeof (signal as AbortSignal | undefined)?.addEventListener === 'function';

/** Maps `StreamRequestOptions` onto the axios request config; extend it when an option is added. */
const toAxiosRequestConfig = ({
  signal,
  onUploadProgress,
  timeout,
}: StreamRequestOptions = {}): AxiosRequestConfig => ({
  signal: isUsableAbortSignal(signal) ? signal : undefined,
  // Persisted offline-db options lose their functions.
  onUploadProgress: typeof onUploadProgress === 'function' ? onUploadProgress : undefined,
  // Only when set: an explicit `undefined` would clobber the upload defaults' `timeout: 0`.
  ...(typeof timeout === 'number' ? { timeout } : {}),
});

/**
 * Uses `isAxiosError` (a flag check) rather than `instanceof AxiosError`, so errors raised by a
 * second copy of axios (e.g. a React Native adapter) are wrapped with their Stream `code`.
 */
const errorIsApiError = (error: unknown): error is AxiosError<APIError> => {
  if (!isAxiosError(error)) return false;

  return (
    typeof (error as AxiosError<APIError | undefined>).response?.data?.code === 'number'
  );
};

const isTokenExpiredError = (error: unknown): boolean =>
  errorIsApiError(error) && error.response?.data.code === chatCodes.TOKEN_EXPIRED;
