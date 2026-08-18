import type { AxiosRequestConfig, AxiosResponse, Method } from 'axios';
import { AxiosError } from 'axios';

import type { APIError, RateLimit, RequestMetadata, StreamRequestOptions } from './types';
import { StreamAPIError } from './types';
import { chatCodes, randomId, retryInterval, toFormData } from './utils';
import type { StreamChat } from './client';
import { chatLoggerSystem } from './logger';
import { runWithRetry } from './utils/retryable';

const logger = chatLoggerSystem.getLogger('api-client');

const MULTIPART_CONTENT_TYPE = 'multipart/form-data';

/**
 * Upload requests must not inherit the axios instance timeout (3s by default) or the size
 * caps - either would abort a large or slow upload.
 *
 * The body needs no `transformRequest` pin: for a `FormData` body axios' default transform is a
 * no-op unless the resolved `Content-Type` contains `application/json`, and
 * `populateRequestConfigWithDefaults` now lets this request's `multipart/form-data` win over an
 * integrator's global `axiosRequestConfig.headers`. If that precedence is ever reversed, an
 * upload turns into `JSON.stringify(formDataToJSON(form))` - the file silently disappears and
 * the request still returns 2xx.
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
    if (this.client.getAuthType() === 'anonymous') return;

    return this.client.tokenManager.getToken();
  }

  sendRequest<T>(
    method: Method,
    url: string,
    pathParams?: Record<string, string>,
    queryParams?: Record<string, unknown>,
    body?: unknown,
    requestContentType?: string,
    options?: StreamRequestOptions,
  ): Promise<{ body: T; metadata: RequestMetadata }> {
    const resolvedUrl = this.resolveUrl(url, pathParams);
    const isMultipart = requestContentType === MULTIPART_CONTENT_TYPE;

    const requestBody =
      isMultipart && body && typeof body === 'object'
        ? toFormData(body as Record<string, unknown>)
        : body;

    return this._doRequest<T>(method, resolvedUrl, requestBody, {
      params: queryParams,
      headers: { 'Content-Type': requestContentType },
      ...(isMultipart ? UPLOAD_REQUEST_DEFAULTS : {}),
      // Keep this last so a caller-supplied signal wins - and keep it returning only the keys
      // it owns, so it can never clobber the upload defaults above.
      ...toAxiosRequestConfig(options),
    });
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

  // --- private ---

  private resolveUrl(url: string, pathParams?: Record<string, string>): string {
    let resolved = url;
    if (pathParams) {
      for (const [key, value] of Object.entries(pathParams)) {
        resolved = resolved.replace(`{${key}}`, encodeURIComponent(value));
      }
    }
    if (resolved.startsWith('/')) {
      resolved = this.client.baseURL + resolved;
    }
    return resolved;
  }

  populateRequestConfigWithDefaults(
    additonalConfig: AxiosRequestConfig,
  ): AxiosRequestConfig {
    const token = this._getToken();

    return {
      ...additonalConfig,
      headers: {
        ...this.client.options.axiosRequestConfig?.headers,
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
        // TODO: figure out whether this is needed, setting these at a later time (client.options.axiosRequestConfig = {...}) should probably be a setter
        // that updates existing axios instance options instead
        ...this.client.options.axiosRequestConfig?.params,
        ...additonalConfig.params,
        connection_id:
          additonalConfig.params?.connection_id || this.client._getConnectionID(),
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

    const reset = headers['x-ratelimit-reset'] as string | undefined;
    if (reset) rateLimit.rate_limit_reset = new Date(reset);

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
    const initialRequestConfig = this.populateRequestConfigWithDefaults(additionalConfig);

    const clientRequestId = initialRequestConfig.headers?.[
      'x-client-request-id'
    ] as string;

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
            if (isTokenExpiredError(error)) {
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
          isRetryable: (error) => {
            if (!(error instanceof AxiosError)) return false;

            if (error.status === 429 || isTokenExpiredError(error)) return true;

            return false;
          },
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
 * An `AbortSignal` that went through JSON persistence - as it does when an offline-db task
 * payload is stored and replayed after a restart - revives as a plain `{}`: `aborted` is
 * `undefined` and `addEventListener` is gone. Axios reaches straight for
 * `signal.addEventListener`, so handing it such an object throws a `TypeError` and takes the
 * replay down with it. Only forward a signal that can still be listened to.
 */
const isUsableAbortSignal = (signal: unknown): signal is AbortSignal =>
  typeof (signal as AbortSignal | undefined)?.addEventListener === 'function';

/**
 * Maps the SDK-level per-request options onto the axios request config they
 * translate to. Extend this when a new option is added to `StreamRequestOptions`.
 */
const toAxiosRequestConfig = ({
  signal,
  onUploadProgress,
}: StreamRequestOptions = {}): AxiosRequestConfig => ({
  signal: isUsableAbortSignal(signal) ? signal : undefined,
  // Same reasoning as `isUsableAbortSignal`: an options object revived from a persisted
  // offline-db task payload has lost its functions.
  onUploadProgress: typeof onUploadProgress === 'function' ? onUploadProgress : undefined,
});

const errorIsApiError = (error: unknown): error is AxiosError<APIError> => {
  if (!(error instanceof AxiosError)) return false;

  return (
    typeof (error as AxiosError<APIError | undefined>).response?.data?.code === 'number'
  );
};

const isTokenExpiredError = (error: unknown): boolean =>
  errorIsApiError(error) && error.response?.data.code === chatCodes.TOKEN_EXPIRED;
