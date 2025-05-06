import type { MiddlewareHandlerParams } from '../../../middleware';
import type { MessageComposer } from '../../messageComposer';
import type {
  MessageComposerMiddlewareState,
  MessageCompositionMiddleware,
  MessageDraftComposerMiddlewareValueState,
  MessageDraftCompositionMiddleware,
} from './types';

export const createCustomDataCompositionMiddleware = (
  composer: MessageComposer,
): MessageCompositionMiddleware => ({
  id: 'stream-io/message-composer-middleware/custom-data',
  handlers: {
    compose: ({
      state,
      next,
      forward,
    }: MiddlewareHandlerParams<MessageComposerMiddlewareState>) => {
      const data = composer.customDataManager.customMessageData;
      if (!data) return forward();

      return next({
        ...state,
        localMessage: {
          ...state.localMessage,
          ...data,
        },
        message: {
          ...state.message,
          ...data,
        },
      });
    },
  },
});

export const createDraftCustomDataCompositionMiddleware = (
  composer: MessageComposer,
): MessageDraftCompositionMiddleware => ({
  id: 'stream-io/message-composer-middleware/draft-custom-data',
  handlers: {
    compose: ({
      state,
      next,
      forward,
    }: MiddlewareHandlerParams<MessageDraftComposerMiddlewareValueState>) => {
      const data = composer.customDataManager.customMessageData;
      if (!data) return forward();

      return next({
        ...state,
        draft: {
          ...state.draft,
          ...data,
        },
      });
    },
  },
});
