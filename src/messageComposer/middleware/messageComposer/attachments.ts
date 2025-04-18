import type { MiddlewareHandlerParams } from '../../../middleware';
import type { Attachment } from '../../../types';
import type { MessageComposer } from '../../messageComposer';
import type { LocalAttachment } from '../../types';
import type {
  MessageComposerMiddlewareValueState,
  MessageDraftComposerMiddlewareValueState,
} from './types';

const localAttachmentToAttachment = (localAttachment: LocalAttachment) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { localMetadata, ...attachment } = localAttachment;
  return attachment as Attachment;
};

export const createAttachmentsCompositionMiddleware = (composer: MessageComposer) => ({
  id: 'stream-io/message-composer-middleware/attachments',
  compose: ({
    input,
    nextHandler,
  }: MiddlewareHandlerParams<MessageComposerMiddlewareValueState>) => {
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
      attachmentManager.successfulUploads.map(localAttachmentToAttachment),
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

export const createDraftAttachmentsCompositionMiddleware = (
  composer: MessageComposer,
) => ({
  id: 'stream-io/message-composer-middleware/draft-attachments',
  compose: ({
    input,
    nextHandler,
  }: MiddlewareHandlerParams<MessageDraftComposerMiddlewareValueState>) => {
    const { attachmentManager } = composer;
    if (!attachmentManager) return nextHandler(input);

    const successfulUploads = attachmentManager.successfulUploads;
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
