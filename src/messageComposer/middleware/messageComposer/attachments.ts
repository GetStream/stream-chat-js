import {
  isFailedUpload,
  isFinishedUpload,
  isPendingUpload,
} from '../../attachmentIdentity';
import type { MiddlewareHandlerParams } from '../../../middleware';
import { CORE_NOTIFICATION_TYPE } from '../../../notifications';
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
  const { localMetadata: _localMetadata, ...attachment } = localAttachment;
  return attachment as Attachment;
};

/**
 * Composition when {@link AttachmentManagerConfig.pendingUploadsEnabled} is on. `message.attachments`
 * (sent to the API) carries only resolved uploads; `MessageOperations` adds the rest once uploads
 * settle. `localMessage.attachments` also carries pending and `failed` ones with their
 * `localMetadata` (`id`, `file`, `previewUri`), so `settlePendingAttachmentUploads` can await or retry
 * them, unless the composer retains its content. `blocked` uploads cannot be retried and stay put.
 */
const composeWithPendingUploads = ({
  composer,
  state,
}: {
  composer: MessageComposer;
  state: MessageComposerMiddlewareState;
}): MessageComposerMiddlewareState => {
  // When the composer keeps its content, unresolved uploads stay in it too: one `localMetadata.id`
  // must not be owned by both the composer and the sent message.
  const composerIsKeptAsDraft = composer.retainsCompositionOnSubmit;

  // Composer order is kept in both payloads, so previews do not reshuffle when an upload settles.
  const relevantAttachments = composer.attachmentManager.attachments.filter(
    (attachment) =>
      isFinishedUpload(attachment) ||
      (!composerIsKeptAsDraft &&
        (isPendingUpload(attachment) || isFailedUpload(attachment))),
  );

  const localAttachments = (state.localMessage.attachments ?? []).concat(
    // Only a finished upload has a URL; the rest keep `localMetadata` (joined to the upload record).
    relevantAttachments.map((attachment) =>
      isFinishedUpload(attachment) ? localAttachmentToAttachment(attachment) : attachment,
    ),
  );
  const messageAttachments = (state.message.attachments ?? []).concat(
    relevantAttachments.filter(isFinishedUpload).map(localAttachmentToAttachment),
  );

  if (!localAttachments.length && !messageAttachments.length) return state;

  // `attachments` is set only when non-empty: on an edit the API reads an empty array as "remove every
  // attachment".
  return {
    ...state,
    localMessage: localAttachments.length
      ? {
          ...state.localMessage,
          attachments: localAttachments,
        }
      : state.localMessage,
    message: messageAttachments.length
      ? {
          ...state.message,
          attachments: messageAttachments,
        }
      : state.message,
  };
};

/**
 * Composes the message's attachments. An upload in flight blocks the send (warns and discards) unless
 * {@link AttachmentManagerConfig.pendingUploadsEnabled} is on. The config is read per composition.
 */
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

      if (attachmentManager.config.pendingUploadsEnabled) {
        return next(composeWithPendingUploads({ composer, state }));
      }

      if (attachmentManager.uploadsInProgressCount > 0) {
        composer.client.notifications.addWarning({
          message: 'Wait until all attachments have uploaded',
          origin: {
            emitter: 'MessageComposer',
            context: { composer },
          },
          options: {
            type: CORE_NOTIFICATION_TYPE.attachmentUploadInProgress,
          },
        });
        return discard();
      }

      const attachments = (state.message.attachments ?? []).concat(
        attachmentManager.successfulUploads.map(localAttachmentToAttachment),
      );

      // Do not add an empty `attachments` array to the payload.
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
