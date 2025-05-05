import type { MiddlewareHandlerParams } from '../../../middleware';
import type { MessageComposer } from '../../messageComposer';
import type {
  MessageComposerMiddlewareValueState,
  MessageDraftComposerMiddlewareValueState,
} from './types';

export const createCustomDataCompositionMiddleware = (composer: MessageComposer) => ({
  id: 'stream-io/message-composer-middleware/custom-data',
  compose: ({
    state,
    next,
    forward,
  }: MiddlewareHandlerParams<MessageComposerMiddlewareValueState>) => {
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
});

export const createDraftCustomDataCompositionMiddleware = (
  composer: MessageComposer,
) => ({
  id: 'stream-io/message-composer-middleware/draft-custom-data',
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
});
