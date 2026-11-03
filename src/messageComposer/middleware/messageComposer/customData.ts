import type { MiddlewareHandlerParams } from '../../../middleware';
import type { MessageComposer } from '../../messageComposer';
import type {
  MessageComposerMiddlewareState,
  MessageCompositionMiddleware,
  MessageDraftComposerMiddlewareValueState,
  MessageDraftCompositionMiddleware,
} from './types';

const hasFields = (data?: object) => !!data && Object.keys(data).length > 0;

/**
 * An edit started with `initState({ composition: message })` loads a copy of the message's `custom`
 * into the composer, so composer data without fields means the fields were cleared. The edit then
 * sends an empty `custom`, because the data cleanup middleware fills a missing `custom` from the
 * edited message.
 */
const editClearsCustomData = (composer: MessageComposer) =>
  hasFields(composer.editedMessage?.custom) &&
  !hasFields(composer.customDataManager.customMessageData);

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
      if (!hasFields(data) && !editClearsCustomData(composer)) return forward();

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
      if (!hasFields(data)) return forward();

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
