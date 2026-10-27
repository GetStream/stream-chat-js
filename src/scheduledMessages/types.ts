import type { APIErrorResponse, ErrorFromResponse } from '../types';

export type ScheduledMessageAPIError = ErrorFromResponse<APIErrorResponse>;

export type ScheduledMessageLimits = {
  maxLeadTimeSeconds: number;
  maxPerChannel: number;
  maxPerUser: number;
  minLeadTimeSeconds: number;
};
