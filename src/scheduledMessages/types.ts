import type { StreamChat } from '../client';
import type {
  FindEventHandlerParams,
  InsertEventHandlerPayload,
  LabeledEventHandler,
} from '../EventHandlerPipeline';
import type { EventPayload, EventType } from '../types';
import type { ScheduledMessageManager } from './ScheduledMessageManager';

export type ScheduledMessageManagerState = {
  isDisabled: boolean;
};

export type ScheduledMessageManagerEventHandlerContext = {
  scheduledMessageManager: ScheduledMessageManager;
};

export type ScheduledMessageManagerEventType = EventType | (string & {});

export type ScheduledMessageManagerEventHandlers = Partial<
  Record<
    ScheduledMessageManagerEventType,
    LabeledEventHandler<ScheduledMessageManagerEventHandlerContext>[]
  >
>;

export type AddScheduledMessageEventHandlerParams = {
  eventType: ScheduledMessageManagerEventType;
} & InsertEventHandlerPayload<ScheduledMessageManagerEventHandlerContext>;

export type SetScheduledMessageEventHandlersParams = {
  eventType: ScheduledMessageManagerEventType;
  handlers: LabeledEventHandler<ScheduledMessageManagerEventHandlerContext>[];
};

export type RemoveScheduledMessageEventHandlersParams = {
  eventType: ScheduledMessageManagerEventType;
  handlers: FindEventHandlerParams<ScheduledMessageManagerEventHandlerContext>[];
};

export type ScheduledMessageManagerOptions = {
  client: StreamChat;
  eventHandlers?: ScheduledMessageManagerEventHandlers;
};

export type ScheduledMessageEvent = EventPayload<`scheduled_message.${string}`>;

export type ScheduledMessageLimits = {
  maxLeadTimeSeconds: number;
  maxPerChannel: number;
  maxPerUser: number;
  minLeadTimeSeconds: number;
};
