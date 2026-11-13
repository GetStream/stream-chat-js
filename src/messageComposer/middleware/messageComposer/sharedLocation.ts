import type { MiddlewareHandlerParams } from '../../../middleware';
import type { SharedLocationResponseData as Gen_SharedLocationResponseData } from '../../../gen/models';
import type { MessageComposer } from '../../messageComposer';
import { SCHEDULED_MESSAGE_STATUS } from '../../../scheduledMessages/constants';
import { dateToNs, nowNs, nsToDate } from '../../../utils/time';
import type {
  MessageComposerMiddlewareState,
  MessageCompositionMiddleware,
} from './types';

/**
 * When the message is sent: the requested send time, the send time of the pending scheduled
 * message being edited, or `undefined` for now.
 */
const getSendTime = (
  composer: MessageComposer,
  state: MessageComposerMiddlewareState,
): Date | undefined => {
  const scheduledAt = state.sendOptions.scheduled_at;
  if (scheduledAt) return new Date(scheduledAt);
  const { editedScheduledMessage } = composer;
  if (
    editedScheduledMessage &&
    editedScheduledMessage.status !== SCHEDULED_MESSAGE_STATUS.Failed
  ) {
    return nsToDate(editedScheduledMessage.scheduled_at);
  }
  return undefined;
};

export const createSharedLocationCompositionMiddleware = (
  composer: MessageComposer,
): MessageCompositionMiddleware => ({
  id: 'stream-io/message-composer-middleware/shared-location',
  handlers: {
    compose: ({
      state,
      next,
      forward,
    }: MiddlewareHandlerParams<MessageComposerMiddlewareState>) => {
      const { locationComposer } = composer;
      // a live location shared in a scheduled message starts sharing when the message is sent
      const location = locationComposer.validateLocation({
        sharingStartsAt: getSendTime(composer, state),
      });
      if (!locationComposer || !location || !composer.client.user) return forward();
      const timestamp = nowNs();

      // `localMessage` is response-shaped, so `end_at` crosses from `Date` to unix nanoseconds.
      const { end_at, ...locationRest } = location;

      return next({
        ...state,
        localMessage: {
          ...state.localMessage,
          shared_location: {
            ...locationRest,
            ...(end_at != null ? { end_at: dateToNs(end_at) } : {}),
            channel_cid: composer.channel.cid,
            created_at: timestamp,
            updated_at: timestamp,
            user_id: composer.client.user.id,
          } as Gen_SharedLocationResponseData,
        },
        message: {
          ...state.message,
          shared_location: location,
        } as typeof state.message,
      });
    },
  },
});
