import type {
  MessageComposerMiddlewareValue,
  MessageDraftComposerMiddlewareValue,
} from './types';
import type { MessageComposer } from '../../messageComposer';
import type { Attachment } from '../../../types';
import type { LocalAttachment } from '../../types';

const localAttachmentToAttachment = (localAttachment: LocalAttachment) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { localMetadata, ...attachment } = localAttachment;
  return attachment as Attachment;
};

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
    const { attachmentManager, uploadManager } = composer;
    if (!attachmentManager || !uploadManager) return nextHandler(input);

    if (uploadManager.uploadsInProgressCount > 0) {
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
      uploadManager.successfulUploads.map(localAttachmentToAttachment),
    );

    // prevent introducing attachments array into the payload sent to the server
    if (!attachments.length) return nextHandler(input);

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

export const createDraftAttachmentsMiddleware = (composer: MessageComposer) => ({
  id: 'attachments',
  compose: ({
    input,
    nextHandler,
  }: {
    input: MessageDraftComposerMiddlewareValue;
    nextHandler: (
      input: MessageDraftComposerMiddlewareValue,
    ) => Promise<MessageDraftComposerMiddlewareValue>;
  }) => {
    const { uploadManager } = composer;
    if (!uploadManager) return nextHandler(input);

    if (uploadManager.uploadsInProgressCount > 0) {
      return nextHandler({ ...input, status: 'discard' });
    }
    const successfulUploads = uploadManager.successfulUploads;
    const attachments = successfulUploads.length
      ? (input.state.draft.attachments ?? []).concat(
          successfulUploads.map(localAttachmentToAttachment),
        )
      : undefined;

    return nextHandler({
      ...input,
      state: {
        ...input.state,
        draft: {
          ...input.state.draft,
          attachments,
        },
      },
    });
  },
});
