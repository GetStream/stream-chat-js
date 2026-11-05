import type { StreamChat } from '../client';
import type { EventPayload } from '../types';

export type ScheduledMessageManagerState = {
  isDisabled: boolean;
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
