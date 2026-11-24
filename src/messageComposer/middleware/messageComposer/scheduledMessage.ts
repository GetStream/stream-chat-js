import { CORE_NOTIFICATION_TYPE } from '../../../notifications';
import type { MiddlewareHandlerParams } from '../../../middleware';
import type { MessageComposer } from '../../messageComposer';
import type {
  MessageComposerMiddlewareState,
  MessageCompositionMiddleware,
} from './types';

export const SCHEDULED_MESSAGE_COMPOSITION_MIDDLEWARE_ID =
  'stream-io/message-composer-middleware/scheduled-message';

export const createScheduledMessageCompositionMiddleware = (
  composer: MessageComposer,
): MessageCompositionMiddleware => ({
  id: SCHEDULED_MESSAGE_COMPOSITION_MIDDLEWARE_ID,
  handlers: {
    compose: async ({
      state,
      discard,
      forward,
    }: MiddlewareHandlerParams<MessageComposerMiddlewareState>) => {
      const isScheduling = !!state.sendOptions.scheduled_at;

      if (!isScheduling) return await forward();

      const { scheduleBlockReason } = composer;

      if (!scheduleBlockReason) return await forward();

      composer.notifyWarning('This message cannot be scheduled', {
        type: CORE_NOTIFICATION_TYPE.scheduledMessageBlocked,
        metadata: { reason: scheduleBlockReason },
      });

      return await discard();
    },
  },
});
