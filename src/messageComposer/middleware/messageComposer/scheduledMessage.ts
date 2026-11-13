import { CORE_NOTIFICATION_TYPE } from '../../../notifications';
import {
  SCHEDULED_MESSAGE_STATUS,
  ScheduledMessageBlockReason,
} from '../../../scheduledMessages/constants';
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
  const { channel } = composer;

  if (!channel.scheduledMessagesEnabled) return ScheduledMessageBlockReason.Unavailable;

  if (getCurrentCommand(composer, commandSearchSource)) {
    return ScheduledMessageBlockReason.Command;
  }

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
        const { editedScheduledMessage } = composer;
        // saving a pending one is scheduling; a failed one sent again now is not
        const isScheduling =
          !!scheduledAt ||
          (!!editedScheduledMessage &&
            editedScheduledMessage.status !== SCHEDULED_MESSAGE_STATUS.Failed);

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
