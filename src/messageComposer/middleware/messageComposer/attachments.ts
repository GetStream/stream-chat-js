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
 * The composition step taken when {@link AttachmentManagerConfig.pendingUploadsEnabled}
 * is on.
 *
 * The two payloads part ways here: `localMessage.attachments` keeps `localMetadata` for every
 * attachment that has not resolved to a URL - `id` (the `client.uploadManager` key), `file` (the
 * handle needed to await or retry the upload) and `previewUri` (so the message list can render
 * the user's own file meanwhile) - while `message.attachments`, which goes to the API, carries
 * only attachments that already resolved to a URL. `MessageOperations` fills in the rest once the
 * uploads settle.
 *
 * That includes uploads that already `failed`: dropping them here is how a file the user attached
 * disappears without trace, because the UI clears the composer on send. Riding along on the
 * optimistic message instead keeps the preview visible and leaves the `file` handle in reach of
 * `settlePendingAttachmentUploads`, which retries a failed upload rather than dropping it.
 * `blocked` is the one state that stays behind - the server's upload configuration refused it, so
 * no retry can ever settle it, and it belongs in the composer where the user can remove it.
 */
const composeWithPendingUploads = ({
  composer,
  state,
}: {
  composer: MessageComposer;
  state: MessageComposerMiddlewareState;
}): MessageComposerMiddlewareState => {
  // `useSubmitHandler` in the UI SDKs deliberately skips `MessageComposer.clear()` when the
  // composition carries a poll - it keeps the composer's contents as a draft. Handing an
  // unresolved attachment to such a message would leave the same `localMetadata.id` owned by
  // both the sent message and the composer: the user could send it a second time, and the
  // second `UploadManager.upload` call would restart the request under an id whose in-flight
  // entry had already been cleaned up. The same collision is what a retry from two places would
  // cause, so both pending and failed uploads stay in the composer in that case and ride along
  // with the next message once they settle.
  const composerIsKeptAsDraft = !!composer.pollId;

  // Composer order is preserved in both payloads so previews do not reshuffle when an upload
  // settles.
  const relevantAttachments = composer.attachmentManager.attachments.filter(
    (attachment) =>
      isFinishedUpload(attachment) ||
      (!composerIsKeptAsDraft &&
        (isPendingUpload(attachment) || isFailedUpload(attachment))),
  );

  const localAttachments = (state.localMessage.attachments ?? []).concat(
    // Only a finished upload has a URL of its own. Everything else keeps `localMetadata`, which
    // is what the message list joins to the live `uploadManager` record and what a retry needs.
    relevantAttachments.map((attachment) =>
      isFinishedUpload(attachment) ? localAttachmentToAttachment(attachment) : attachment,
    ),
  );
  const messageAttachments = (state.message.attachments ?? []).concat(
    relevantAttachments.filter(isFinishedUpload).map(localAttachmentToAttachment),
  );

  if (!localAttachments.length && !messageAttachments.length) return state;

  // Each payload gets the `attachments` key only when there is something to put in it, matching
  // the default middleware. An empty array is not "nothing to say": on an edit the API reads it
  // as "remove every attachment", and a message whose uploads are all still in flight produces
  // exactly that - no finished upload to put in `message.attachments` yet.
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
 * Composes the message's attachments.
 *
 * By default an upload still in flight blocks the send: the chain warns and discards the
 * composition. With {@link AttachmentManagerConfig.pendingUploadsEnabled} on it composes
 * anyway, leaving `message.attachments` without the unresolved ones — `MessageOperations` awaits
 * those uploads and fills in the URLs before the request goes out.
 *
 * The config is read per composition rather than at construction, so `updateConfig` takes effect
 * on the next send with no need to reinstall anything.
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
