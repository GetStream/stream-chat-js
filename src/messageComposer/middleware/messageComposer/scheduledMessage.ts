import { CORE_NOTIFICATION_TYPE } from '../../../notifications';
import { ScheduledMessageBlockReason } from '../../../scheduledMessages/constants';
import { CommandSearchSource } from '../textComposer/commands';
import { getCurrentCommand } from '../textComposer/commandUtils';
import type { MiddlewareHandlerParams } from '../../../middleware';
import type { MessageComposer } from '../../messageComposer';
import type {
  MessageComposerMiddlewareState,
  MessageCompositionMiddleware,
} from './types';

export const SCHEDULED_MESSAGE_COMPOSITION_MIDDLEWARE_ID =
  'stream-io/message-composer-middleware/scheduled-message';

export const getScheduleBlockReason = (
  composer: MessageComposer,
  commandSearchSource: CommandSearchSource,
): ScheduledMessageBlockReason | undefined => {
  const { channel, locationComposer, pollId } = composer;

  if (!channel.scheduledMessagesEnabled) return ScheduledMessageBlockReason.Unavailable;

  if (getCurrentCommand(composer, commandSearchSource)) {
    return ScheduledMessageBlockReason.Command;
  }

  if (pollId) return ScheduledMessageBlockReason.Poll;

  if (locationComposer.validLocation) return ScheduledMessageBlockReason.SharedLocation;

  return undefined;
};

const notifyScheduleBlocked = (
  composer: MessageComposer,
  reason: ScheduledMessageBlockReason,
) => {
  composer.client.notifications.addWarning({
    message: 'This message cannot be scheduled',
    origin: {
      emitter: 'MessageComposer',
      context: { composer },
    },
    options: {
      type: CORE_NOTIFICATION_TYPE.scheduledMessageBlocked,
      metadata: { reason },
    },
  });
};

export const createScheduledMessageCompositionMiddleware = (
  composer: MessageComposer,
  commandSearchSource?: CommandSearchSource,
): MessageCompositionMiddleware => {
  const effectiveCommandSearchSource =
    commandSearchSource ?? new CommandSearchSource(composer.channel);

  return {
    id: SCHEDULED_MESSAGE_COMPOSITION_MIDDLEWARE_ID,
    handlers: {
      compose: async ({
        state,
        discard,
        forward,
      }: MiddlewareHandlerParams<MessageComposerMiddlewareState>) => {
        const { scheduled_at: scheduledAt } = state.sendOptions;
        const isScheduling = !!scheduledAt || !!composer.editedScheduledMessage;

        if (!isScheduling) return await forward();

        const blockReason = getScheduleBlockReason(
          composer,
          effectiveCommandSearchSource,
        );

        if (!blockReason) return await forward();

        notifyScheduleBlocked(composer, blockReason);

        return await discard();
      },
    },
  };
};
