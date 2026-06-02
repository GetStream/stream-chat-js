import type { AxiosRequestConfig, AxiosResponse, Method } from 'axios';
import { AxiosError } from 'axios';

import type {
  APIErrorResponse,
  RateLimit,
  RequestMetadata,
  SendFileAPIResponse,
  UserResponse,
} from './types';
import { ErrorFromResponse } from './types';
import { addFileToFormData, chatCodes, randomId, retryInterval } from './utils';
import type { StreamChat } from './client';
import { runWithRetry } from './utils/retryable';

export class ApiClient {
  client: StreamChat;

  private nextRequestAbortController: AbortController | null = null;

  constructor(client: StreamChat) {
    this.client = client;
  }

  _getToken(): string | undefined {
    if (this.client.getAuthType() === 'anonymous') return;

    return this.client.tokenManager.getToken();
  }

  createAbortControllerForNextRequest() {
    return (this.nextRequestAbortController = new AbortController());
  }

  sendRequest<T>(
    method: Method,
    url: string,
    pathParams?: Record<string, string>,
    queryParams?: Record<string, unknown>,
    body?: unknown,
    requestContentType?: string,
  ): Promise<{ body: T; metadata: RequestMetadata }> {
    const resolvedUrl = this.resolveUrl(url, pathParams);

    return this._doRequest<T>(method, resolvedUrl, body, {
      params: queryParams,
      headers: { 'Content-Type': requestContentType },
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

  sendFile(
    url: string,
    uri: string | NodeJS.ReadableStream | Buffer | File,
    name?: string,
    contentType?: string,
    user?: UserResponse,
    axiosRequestConfig?: AxiosRequestConfig,
  ) {
    const data = addFileToFormData(uri, name, contentType || 'multipart/form-data');
    if (user != null) data.append('user', JSON.stringify(user));

    return this._doRequest<SendFileAPIResponse>('post', url, data, {
      headers: data.getHeaders ? data.getHeaders() : {},
      timeout: 0,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      ...axiosRequestConfig,
    }).then((response) => response.body);
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

  private getNextAbortSignal(): AbortSignal | undefined {
    if (!this.nextRequestAbortController) return;

    const signal = this.nextRequestAbortController.signal;
    this.nextRequestAbortController = null;
    return signal;
  }

  populateRequestConfigWithDefaults(
    additonalConfig: AxiosRequestConfig,
  ): AxiosRequestConfig {
    const token = this._getToken();
    const signal = this.getNextAbortSignal();

    return {
      ...additonalConfig,
      headers: {
        Authorization: token,
        'stream-auth-type': this.client.getAuthType(),
        'x-stream-client': this.client.getUserAgent(),
        ...additonalConfig.headers,
        // TODO: figure out whether this is needed, setting these at a later time (client.options.axiosRequestConfig = {...}) should probably be a setter
        // that updates existing axios instance options instead
        ...this.client.options.axiosRequestConfig?.headers,
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
      signal,
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

  private errorFromResponse(response: AxiosResponse<APIErrorResponse>) {
    const message =
      typeof response.data.code !== 'undefined'
        ? `StreamChat error code ${response.data.code}: ${response.data.message}`
        : `StreamChat error HTTP code: ${response.status}`;

    return new ErrorFromResponse<APIErrorResponse>(message, {
      code: response.data.code ?? null,
      response,
      status: response.status,
    });
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
      if (error instanceof AxiosError && error.response) {
        throw this.errorFromResponse(error.response);
      } else {
        throw error;
      }
    }
  }
}

const errorIsApiError = (error: unknown): error is AxiosError<APIErrorResponse> => {
  if (!(error instanceof AxiosError)) return false;

  return (
    typeof (error as AxiosError<APIErrorResponse | undefined>).response?.data?.code ===
    'number'
  );
};

const isTokenExpiredError = (error: unknown): boolean =>
  errorIsApiError(error) && error.response?.data.code === chatCodes.TOKEN_EXPIRED;
