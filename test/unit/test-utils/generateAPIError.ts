import type { AxiosResponse } from 'axios';
import { StreamAPIError } from '../../../src';
import type { APIError } from '../../../src';

export const generateAPIError = (code: number, reason?: string, status = 400) =>
  new StreamAPIError<APIError>('failed', {
    code,
    response: {
      data: {
        code,
        details: [],
        duration: '',
        exception_fields: reason ? { reason } : undefined,
        message: 'failed',
        more_info: '',
        status_code: status,
      },
    } as AxiosResponse<APIError>,
    status,
  });
