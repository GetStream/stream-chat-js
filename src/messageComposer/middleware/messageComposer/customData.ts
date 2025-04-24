import type { MiddlewareHandlerParams } from '../../../middleware';
import type { MessageComposer } from '../../messageComposer';
import type {
  MessageComposerMiddlewareValueState,
  MessageDraftComposerMiddlewareValueState,
} from './types';

export const createCustomDataCompositionMiddleware = (composer: MessageComposer) => ({
  id: 'stream-io/message-composer-middleware/custom-data',
  compose: ({
    input,
    nextHandler,
  }: MiddlewareHandlerParams<MessageComposerMiddlewareValueState>) => {
    const data = composer.customDataManager.data;
    if (!data) return nextHandler(input);

    return nextHandler({
      ...input,
      state: {
        ...input.state,
        localMessage: {
          ...input.state.localMessage,
          ...data,
        },
        message: {
          ...input.state.message,
          ...data,
        },
      },
    });
  },
});

export const createDraftCustomDataCompositionMiddleware = (
  composer: MessageComposer,
) => ({
  id: 'stream-io/message-composer-middleware/draft-custom-data',
  compose: ({
    input,
    nextHandler,
  }: MiddlewareHandlerParams<MessageDraftComposerMiddlewareValueState>) => {
    const data = composer.customDataManager.data;
    if (!data) return nextHandler(input);

    return nextHandler({
      ...input,
      state: {
        ...input.state,
        draft: {
          ...input.state.draft,
          ...data,
        },
      },
    });
  },
});
