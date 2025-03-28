import type { MessageComposerMiddlewareValue } from './types';
import { textIsEmpty } from '../../textComposer';

export const createCompositionValidationMiddleware = () => ({
  id: 'validation',
  compose: async ({
    input,
    nextHandler,
  }: {
    input: MessageComposerMiddlewareValue;
    nextHandler: (
      input: MessageComposerMiddlewareValue,
    ) => Promise<MessageComposerMiddlewareValue>;
  }) => {
    const isEmptyMessage =
      textIsEmpty(input.state.message.text ?? '') &&
      !input.state.message.attachments?.length &&
      !input.state.message.poll_id;

    if (isEmptyMessage) {
      return await nextHandler({ ...input, status: 'discard' });
    }

    return await nextHandler(input);
  },
});
