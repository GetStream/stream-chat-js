import { SCHEDULED_MESSAGE_STATUS, ScheduledMessageEventType } from './constants';
import type {
  EventHandlerPipelineHandler,
  LabeledEventHandler,
} from '../EventHandlerPipeline';
import type { ScheduledMessageResponse, ScheduledMessageStatus } from '../gen/models';
import type {
  ScheduledMessagePaginatorsManagerEventHandlerContext,
  ScheduledMessagePaginatorsManagerEventHandlers,
} from './types';

type ScheduledMessageEventHandler =
  EventHandlerPipelineHandler<ScheduledMessagePaginatorsManagerEventHandlerContext>;

const DEFAULT_HANDLER_ID_PREFIX = 'ScheduledMessagePaginatorsManager:default-handler';

const STATUS_BY_EVENT_TYPE: Partial<Record<string, ScheduledMessageStatus>> = {
  [ScheduledMessageEventType.Deleted]: SCHEDULED_MESSAGE_STATUS.Canceled,
  [ScheduledMessageEventType.Sent]: SCHEDULED_MESSAGE_STATUS.Sent,
};

/** The event's scheduled message in the status the event leaves it in (`deleted` → canceled, `sent` → sent). */
export const getScheduledMessageFromEvent = ({
  scheduled_message: scheduledMessage,
  type,
}: {
  scheduled_message?: ScheduledMessageResponse;
  type: string;
}): ScheduledMessageResponse | undefined => {
  if (!scheduledMessage) return undefined;

  const status = STATUS_BY_EVENT_TYPE[type];

  return status ? { ...scheduledMessage, status } : scheduledMessage;
};

const ingestScheduledMessage: ScheduledMessageEventHandler = ({
  ctx: { scheduledMessagePaginators },
  event,
}) => {
  const scheduledMessage = getScheduledMessageFromEvent(event);

  if (scheduledMessage) scheduledMessagePaginators.ingest(scheduledMessage);
};

const toDefaultHandler = (
  eventType: string,
): LabeledEventHandler<ScheduledMessagePaginatorsManagerEventHandlerContext>[] => [
  { handle: ingestScheduledMessage, id: `${DEFAULT_HANDLER_ID_PREFIX}:${eventType}` },
];

export const DEFAULT_SCHEDULED_MESSAGE_EVENT_HANDLERS: ScheduledMessagePaginatorsManagerEventHandlers =
  Object.fromEntries(
    Object.values(ScheduledMessageEventType).map((eventType) => [
      eventType,
      toDefaultHandler(eventType),
    ]),
  );
