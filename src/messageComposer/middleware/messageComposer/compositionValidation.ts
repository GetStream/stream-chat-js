import { textIsEmpty } from '../../textComposer';
import type {
  MessageComposerMiddlewareState,
  MessageCompositionMiddleware,
  MessageDraftComposerMiddlewareValueState,
  MessageDraftCompositionMiddleware,
} from './types';
import type { MessageComposer } from '../../messageComposer';
import type { MiddlewareHandlerParams } from '../../../middleware';

export const createCompositionValidationMiddleware = (
  composer: MessageComposer,
): MessageCompositionMiddleware => ({
  id: 'stream-io/message-composer-middleware/data-validation',
  handlers: {
    compose: async ({
      state,
      discard,
      forward,
    }: MiddlewareHandlerParams<MessageComposerMiddlewareState>) => {
      const { maxLengthOnSend } = composer.config.text ?? {};
      const inputText = state.message.text ?? '';

      const hasExceededMaxLength =
        typeof maxLengthOnSend === 'number' && inputText.length > maxLengthOnSend;

      if (composer.compositionIsEmpty || hasExceededMaxLength) {
        return await discard();
      }

      return await forward();
    },
  },
});

export const createDraftCompositionValidationMiddleware = (
  composer: MessageComposer,
): MessageDraftCompositionMiddleware => ({
  id: 'stream-io/message-composer-middleware/draft-data-validation',
  handlers: {
    compose: async ({
      state,
      discard,
      forward,
    }: MiddlewareHandlerParams<MessageDraftComposerMiddlewareValueState>) => {
      const hasData =
        !textIsEmpty(state.draft.text ?? '') ||
        state.draft.attachments?.length ||
        state.draft.poll_id ||
        state.draft.quoted_message_id;

      const shouldCreateDraft = composer.lastChangeOriginIsLocal && hasData;

      if (!shouldCreateDraft) {
        return await discard();
      }

      return await forward();
    },
  },
});
