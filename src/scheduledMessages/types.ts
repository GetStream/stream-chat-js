import type { StreamChat } from '../client';
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
import type { ScheduledMessagePaginator } from '../pagination/paginators/ScheduledMessagePaginator';
import type { ScheduledMessagePaginatorsManager } from './ScheduledMessagePaginatorsManager';

export type ScheduledMessagePaginatorsManagerState = {
  /** A registered list's last query failed with error 114 (feature off). */
  isDisabled: boolean;
  paginators: ScheduledMessagePaginator[];
};

export type ScheduledMessagePaginatorsManagerEventHandlerContext = {
  scheduledMessagePaginators: ScheduledMessagePaginatorsManager;
};

export type ScheduledMessagePaginatorsManagerEventType = EventType | (string & {});

export type ScheduledMessagePaginatorsManagerEventHandlers = Partial<
  Record<
    ScheduledMessagePaginatorsManagerEventType,
    LabeledEventHandler<ScheduledMessagePaginatorsManagerEventHandlerContext>[]
  >
>;

export type AddScheduledMessageEventHandlerParams = {
  eventType: ScheduledMessagePaginatorsManagerEventType;
} & InsertEventHandlerPayload<ScheduledMessagePaginatorsManagerEventHandlerContext>;

export type SetScheduledMessageEventHandlersParams = {
  eventType: ScheduledMessagePaginatorsManagerEventType;
  handlers: LabeledEventHandler<ScheduledMessagePaginatorsManagerEventHandlerContext>[];
};

export type RemoveScheduledMessageEventHandlersParams = {
  eventType: ScheduledMessagePaginatorsManagerEventType;
  handlers: FindEventHandlerParams<ScheduledMessagePaginatorsManagerEventHandlerContext>[];
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

export type ScheduledMessagePaginatorsManagerOptions = {
  client: StreamChat;
  eventHandlers?: ScheduledMessagePaginatorsManagerEventHandlers;
};

export type ScheduledMessageEvent = EventPayload<`scheduled_message.${string}`>;

export type ScheduledMessageLimits = {
  maxLeadTimeSeconds: number;
  maxPerChannel: number;
  maxPerUser: number;
  minLeadTimeSeconds: number;
};
