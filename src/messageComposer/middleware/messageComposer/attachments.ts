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
    if (composer.attachmentManager.uploadsInProgressCount > 0) {
      composer.client.notifications.addWarning({
        message: 'Wait until all attachments have uploaded',
        origin: {
          emitter: 'MessageComposer',
          context: { messageId: composer.id, threadId: composer.threadId },
        },
      });
      return nextHandler({ ...input, status: 'discard' });
    }

    const attachments = composer.attachmentManager.successfulUploads.map(
      (localAttachment) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { localMetadata: _, ...attachment } = localAttachment;
        return attachment as Attachment;
      },
    );

    return nextHandler({
      ...input,
      state: {
        ...input.state,
        message: {
          ...input.state.message,
          attachments: input.state.message.attachments.concat(attachments),
        },
      },
    });
  },
});
