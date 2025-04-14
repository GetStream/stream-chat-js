import { textIsEmpty } from '../../textComposer';
import type {
  MessageComposerMiddlewareValueState,
  MessageDraftComposerMiddlewareValueState,
} from './types';
import type { MessageComposer } from '../../messageComposer';
import type { MiddlewareHandlerParams } from '../../../middleware';

export const createCompositionValidationMiddleware = (composer: MessageComposer) => ({
  id: 'stream-io/message-composer-middleware/data-validation',
  compose: async ({
    input,
    nextHandler,
  }: MiddlewareHandlerParams<MessageComposerMiddlewareValueState>) => {
    const { maxLengthOnSend } = composer.config.text ?? {};
    const inputText = input.state.message.text ?? '';
    const isEmptyMessage =
      textIsEmpty(inputText) &&
      !input.state.message.attachments?.length &&
      !input.state.message.poll_id;

    const hasExceededMaxLength =
      typeof maxLengthOnSend === 'number' && inputText.length > maxLengthOnSend;

    if (isEmptyMessage || !composer.lastChangeOriginIsLocal || hasExceededMaxLength) {
      return await nextHandler({ ...input, status: 'discard' });
    }

    return await nextHandler(input);
  },
});

export const createDraftCompositionValidationMiddleware = (
  composer: MessageComposer,
) => ({
  id: 'stream-io/message-composer-middleware/draft-data-validation',
  compose: async ({
    input,
    nextHandler,
  }: MiddlewareHandlerParams<MessageDraftComposerMiddlewareValueState>) => {
    const hasData =
      !textIsEmpty(input.state.draft.text ?? '') ||
      input.state.draft.attachments?.length ||
      input.state.draft.poll_id ||
      input.state.draft.quoted_message_id;

    const shouldCreateDraft = composer.lastChangeOriginIsLocal && hasData;

    if (!shouldCreateDraft) {
      return await nextHandler({ ...input, status: 'discard' });
    }

    return await nextHandler(input);
  },
});
