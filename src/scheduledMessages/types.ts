import type { StreamChat } from '../client';
import type { ScheduledMessageResponse } from '../gen/models';
import type { EventPayload } from '../types';

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

export type ScheduledMessageEvent = EventPayload<`scheduled_message.${string}`>;

export type ScheduledMessageLimits = {
  maxLeadTimeSeconds: number;
  maxPerChannel: number;
  maxPerUser: number;
  minLeadTimeSeconds: number;
};
