import type { MiddlewareHandlerParams } from '../../../middleware';
import type { MessageComposer } from '../../messageComposer';
import type {
  MessageComposerMiddlewareState,
  MessageCompositionMiddleware,
  MessageDraftComposerMiddlewareValueState,
  MessageDraftCompositionMiddleware,
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

export const createDraftSharedLocationCompositionMiddleware = (
  composer: MessageComposer,
): MessageDraftCompositionMiddleware => ({
  id: 'stream-io/message-composer-middleware/draft-shared-location',
  handlers: {
    compose: ({
      state,
      next,
      forward,
    }: MiddlewareHandlerParams<MessageDraftComposerMiddlewareValueState>) => {
      const { locationComposer } = composer;
      const location = locationComposer.validLocation;
      if (!locationComposer || !location) return forward();

      return next({
        ...state,
        draft: {
          ...state.draft,
          shared_location: location,
        },
      });
    },
  },
});
