import type { MiddlewareHandlerParams } from '../../../middleware';
import type { SharedLocationResponseData as Gen_SharedLocationResponseData } from '../../../gen/models';
import type { MessageComposer } from '../../messageComposer';
import { dateToNs, nowNs } from '../../../utils/time';
import type {
  MessageComposerMiddlewareState,
  MessageCompositionMiddleware,
} from './types';

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
      const location = locationComposer.validLocation;
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
