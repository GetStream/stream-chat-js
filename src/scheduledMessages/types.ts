import type { StreamChat } from '../client';
import type { DeclarativePaginatorConfig } from '../pagination/paginators/BasePaginator';
import type {
  FindEventHandlerParams,
  InsertEventHandlerPayload,
  LabeledEventHandler,
} from '../EventHandlerPipeline';
import type {
  DeleteScheduledMessageResponse,
  SendMessageRequest,
  SendMessageResponse,
  SendScheduledMessageNowResponse,
  UpdateScheduledMessageRequest,
  UpdateScheduledMessageResponse,
} from '../gen/models';
import type { EventPayload, EventType, StreamResponse } from '../types';
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

export type DefaultScheduledMessageRequest<TParams, TResponse> = (
  params: TParams,
) => Promise<StreamResponse<TResponse>>;

export type ScheduledMessageRequestFn<TParams, TResponse> = (
  params: TParams,
  defaultRequest: DefaultScheduledMessageRequest<TParams, TResponse>,
) => Promise<StreamResponse<TResponse>>;

export type ScheduledMessageIdRequestParams = {
  id: string;
};

export type UpdateScheduledMessageRequestParams = {
  id: string;
  request: UpdateScheduledMessageRequest;
};

export type ScheduleMessageRequestFn = ScheduledMessageRequestFn<
  SendMessageRequest,
  SendMessageResponse
>;

export type UpdateScheduledMessageRequestFn = ScheduledMessageRequestFn<
  UpdateScheduledMessageRequestParams,
  UpdateScheduledMessageResponse
>;

export type DeleteScheduledMessageRequestFn = ScheduledMessageRequestFn<
  ScheduledMessageIdRequestParams,
  DeleteScheduledMessageResponse
>;

export type SendScheduledMessageNowRequestFn = ScheduledMessageRequestFn<
  ScheduledMessageIdRequestParams,
  SendScheduledMessageNowResponse
>;

export type ScheduledMessageRequestHandlers = {
  deleteScheduledMessageRequest?: DeleteScheduledMessageRequestFn;
  scheduleMessageRequest?: ScheduleMessageRequestFn;
  sendScheduledMessageNowRequest?: SendScheduledMessageNowRequestFn;
  updateScheduledMessageRequest?: UpdateScheduledMessageRequestFn;
};

export type ScheduledMessageManagerConfig = {
  paginator?: DeclarativePaginatorConfig;
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
