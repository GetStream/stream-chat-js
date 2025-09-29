import type { MiddlewareHandlerParams } from '../../../middleware';
import type { Attachment } from '../../../types';
import type { MessageComposer } from '../../messageComposer';
import type { LocalAttachment } from '../../types';
import type {
  MessageComposerMiddlewareState,
  MessageCompositionMiddleware,
  MessageDraftComposerMiddlewareValueState,
  MessageDraftCompositionMiddleware,
} from './types';

const localAttachmentToAttachment = (localAttachment: LocalAttachment) => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { localMetadata, ...attachment } = localAttachment;
  return attachment as Attachment;
};

export const createAttachmentsCompositionMiddleware = (
  composer: MessageComposer,
): MessageCompositionMiddleware => ({
  id: 'stream-io/message-composer-middleware/attachments',
  handlers: {
    compose: ({
      state,
      next,
      discard,
      forward,
    }: MiddlewareHandlerParams<MessageComposerMiddlewareState>) => {
      const { attachmentManager } = composer;
      if (!attachmentManager) return forward();

      if (attachmentManager.uploadsInProgressCount > 0) {
        composer.client.notifications.addWarning({
          message: 'Wait until all attachments have uploaded',
          origin: {
            emitter: 'MessageComposer',
            context: { composer },
          },
          options: {
            type: 'validation:attachment:upload:in-progress',
          },
        });
        return discard();
      }

      const attachments = (state.message.attachments ?? []).concat(
        attachmentManager.successfulUploads.map(localAttachmentToAttachment),
      );

      // prevent introducing attachments array into the payload sent to the server
      if (!attachments.length) return forward();

      return next({
        ...state,
        localMessage: {
          ...state.localMessage,
          attachments,
        },
        message: {
          ...state.message,
          attachments,
        },
      });
    },
  },
});

export const createDraftAttachmentsCompositionMiddleware = (
  composer: MessageComposer,
): MessageDraftCompositionMiddleware => ({
  id: 'stream-io/message-composer-middleware/draft-attachments',
  handlers: {
    compose: ({
      state,
      next,
      forward,
    }: MiddlewareHandlerParams<MessageDraftComposerMiddlewareValueState>) => {
      const { attachmentManager } = composer;
      if (!attachmentManager) return forward();

      const successfulUploads = attachmentManager.successfulUploads;
      const attachments = successfulUploads.length
        ? (state.draft.attachments ?? []).concat(
            successfulUploads.map(localAttachmentToAttachment),
          )
        : undefined;

      return next({
        ...state,
        draft: {
          ...state.draft,
          attachments,
        },
      });
    },
  },
});
