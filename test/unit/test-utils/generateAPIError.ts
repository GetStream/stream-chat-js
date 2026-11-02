import type { AxiosResponse } from 'axios';
import { ErrorFromResponse } from '../../../src';
import type { APIErrorResponse } from '../../../src';

export const generateAPIError = (code: number, reason?: string, status = 400) =>
  new ErrorFromResponse<APIErrorResponse>('failed', {
    code,
    response: {
      data: {
        code,
        duration: '',
        exception_fields: reason ? { reason } : undefined,
        message: 'failed',
        more_info: '',
        StatusCode: status,
      },
    } as AxiosResponse<APIErrorResponse>,
    status,
  });
