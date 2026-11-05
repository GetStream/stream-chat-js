import { ScheduledMessageEventType } from './constants';
import type {
  EventHandlerPipelineHandler,
  LabeledEventHandler,
} from '../EventHandlerPipeline';
import type {
  ScheduledMessageManagerEventHandlerContext,
  ScheduledMessageManagerEventHandlers,
} from './types';

type ScheduledMessageEventHandler =
  EventHandlerPipelineHandler<ScheduledMessageManagerEventHandlerContext>;

const DEFAULT_HANDLER_ID_PREFIX = 'ScheduledMessageManager:default-handler';

const CONNECTION_RECOVERED_EVENT_TYPE = 'connection.recovered';

const upsertScheduledMessage: ScheduledMessageEventHandler = ({
  ctx: { scheduledMessageManager },
  event: { scheduled_message: scheduledMessage },
}) => {
  if (!scheduledMessage) return;

  scheduledMessageManager.upsertToState(scheduledMessage);
};

const removeScheduledMessage: ScheduledMessageEventHandler = ({
  ctx: { scheduledMessageManager },
  event: { scheduled_message: scheduledMessage },
}) => {
  if (!scheduledMessage) return;

  scheduledMessageManager.removeFromState(scheduledMessage.id);
};

const reloadLoadedLists: ScheduledMessageEventHandler = async ({
  ctx: { scheduledMessageManager },
}) => {
  await scheduledMessageManager.reload();
};

const toDefaultHandler = (
  eventType: string,
  handle: ScheduledMessageEventHandler,
): LabeledEventHandler<ScheduledMessageManagerEventHandlerContext>[] => [
  { handle, id: `${DEFAULT_HANDLER_ID_PREFIX}:${eventType}` },
];

export const DEFAULT_SCHEDULED_MESSAGE_EVENT_HANDLERS: ScheduledMessageManagerEventHandlers =
  {
    [ScheduledMessageEventType.Created]: toDefaultHandler(
      ScheduledMessageEventType.Created,
      upsertScheduledMessage,
    ),
    [ScheduledMessageEventType.Deleted]: toDefaultHandler(
      ScheduledMessageEventType.Deleted,
      removeScheduledMessage,
    ),
    [ScheduledMessageEventType.Failed]: toDefaultHandler(
      ScheduledMessageEventType.Failed,
      upsertScheduledMessage,
    ),
    [ScheduledMessageEventType.Sent]: toDefaultHandler(
      ScheduledMessageEventType.Sent,
      removeScheduledMessage,
    ),
    [ScheduledMessageEventType.Updated]: toDefaultHandler(
      ScheduledMessageEventType.Updated,
      upsertScheduledMessage,
    ),
    [CONNECTION_RECOVERED_EVENT_TYPE]: toDefaultHandler(
      CONNECTION_RECOVERED_EVENT_TYPE,
      reloadLoadedLists,
    ),
  };
