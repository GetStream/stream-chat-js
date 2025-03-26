import type { MessageComposerMiddlewareValue } from './types';
import type { MessageComposer } from '../../messageComposer';
import type { Attachment } from '../../../types';

export const createAttachmentsMiddleware = (composer: MessageComposer) => ({
  id: 'attachments',
  compose: ({
    input,
    nextHandler,
  }: {
    input: MessageComposerMiddlewareValue;
    nextHandler: (
      input: MessageComposerMiddlewareValue,
    ) => Promise<MessageComposerMiddlewareValue>;
  }) => {
    const { attachmentManager } = composer;
    if (!attachmentManager) return nextHandler(input);

    if (attachmentManager.uploadsInProgressCount > 0) {
      composer.client.notifications.addWarning({
        message: 'Wait until all attachments have uploaded',
        origin: {
          emitter: 'MessageComposer',
          context: { composer },
        },
      });
      return nextHandler({ ...input, status: 'discard' });
    }

    const attachments = (input.state.message.attachments ?? []).concat(
      attachmentManager.successfulUploads.map((localAttachment) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { localMetadata, ...attachment } = localAttachment;
        return attachment as Attachment;
      }),
    );

    return nextHandler({
      ...input,
      state: {
        ...input.state,
        localMessage: {
          ...input.state.localMessage,
          attachments,
        },
        message: {
          ...input.state.message,
          attachments,
        },
      },
    });
  },
});
