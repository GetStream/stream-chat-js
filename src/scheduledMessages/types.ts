import type { StreamChat } from '../client';
import type { Event, ScheduledMessageResponse } from '../types';

export type ScheduledMessageManagerState = {
  isDisabled: boolean;
  isLoaded: boolean;
  isLoading: boolean;
  scheduledMessages: Map<string, ScheduledMessageResponse>;
  lastQueryError?: Error;
  next?: string;
};

export type ScheduledMessageManagerOptions = {
  client: StreamChat;
};

export type ScheduledMessageEvent = Event & {
  scheduled_message: ScheduledMessageResponse;
};

export type ScheduledMessageLimits = {
  maxLeadTimeSeconds: number;
  maxPerChannel: number;
  maxPerUser: number;
  minLeadTimeSeconds: number;
};
