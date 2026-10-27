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
      if (!data || !Object.keys(data).length) return forward();

      return next({
        ...state,
        localMessage: {
          ...state.localMessage,
          custom: { ...state.localMessage.custom, ...data },
        },
        message: {
          ...state.message,
          custom: { ...state.message.custom, ...data },
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
      if (!data || !Object.keys(data).length) return forward();

      return next({
        ...state,
        draft: {
          ...state.draft,
          custom: { ...state.draft.custom, ...data },
        },
      });
    },
  },
});
