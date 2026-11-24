import type { MiddlewareHandlerParams } from '../../../middleware';
import type { SharedLocationResponseData as Gen_SharedLocationResponseData } from '../../../gen/models';
import type { MessageComposer } from '../../messageComposer';
import { dateToNs, nowNs } from '../../../utils/time';
import type {
  MessageComposerMiddlewareState,
  MessageCompositionMiddleware,
} from './types';

/**
 * When the message is sent: the requested send time (a scheduled save passes the send time of the
 * scheduled message it updates), or `undefined` for now.
 */
const getSendTime = (state: MessageComposerMiddlewareState): Date | undefined => {
  const scheduledAt = state.sendOptions.scheduled_at;
  return scheduledAt ? new Date(scheduledAt) : undefined;
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
        sharingStartsAt: getSendTime(state),
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
