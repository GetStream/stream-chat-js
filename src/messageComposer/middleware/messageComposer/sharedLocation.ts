import type { MiddlewareHandlerParams } from '../../../middleware';
import type { MessageComposer } from '../../messageComposer';
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
      const timestamp = new Date().toISOString();

      return next({
        ...state,
        localMessage: {
          ...state.localMessage,
          shared_location: {
            ...location,
            channel_cid: composer.channel.cid,
            created_at: timestamp,
            updated_at: timestamp,
            user_id: composer.client.user.id,
          },
        },
        message: {
          ...state.message,
          shared_location: location,
        },
      });
    },
  },
});
