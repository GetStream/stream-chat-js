import type { StreamChat } from '../client';
import type {
  APIErrorResponse,
  ErrorFromResponse,
  Event,
  QueryScheduledMessagesResponse,
  ScheduledMessageResponse,
} from '../types';

export type ScheduledMessageMap = Map<string, ScheduledMessageResponse>;

export type ScheduledMessageManagerState = {
  isDisabled: boolean;
  isLoaded: boolean;
  isLoading: boolean;
  scheduledMessages: ScheduledMessageMap;
  lastQueryError?: Error;
  next?: string;
};

export type ScheduledMessageManagerOptions = {
  client: StreamChat;
};

export type ScheduledMessageEvent = Event & {
  scheduled_message: ScheduledMessageResponse;
};

export type ScheduledMessageQueryResultHandler = (
  response: QueryScheduledMessagesResponse,
) => Partial<ScheduledMessageManagerState> | void;

export type ScheduledMessageAPIError = ErrorFromResponse<APIErrorResponse>;

export type ScheduledMessageLimits = {
  maxLeadTimeSeconds: number;
  maxPerChannel: number;
  maxPerUser: number;
  minLeadTimeSeconds: number;
};
