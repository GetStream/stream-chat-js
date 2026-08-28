import { isFinishedUpload, isPendingUpload } from '../../attachmentIdentity';
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

/**
 * The composition step used by {@link createSendWithPendingUploadsAttachmentsMiddleware}.
 *
 * The two payloads part ways here: `localMessage.attachments` keeps `localMetadata` for
 * anything still uploading - `id` (the `client.uploadManager` key), `file` (the handle needed
 * to await the upload) and `previewUri` (so the message list can render the user's own file
 * meanwhile) - while `message.attachments`, which goes to the API, carries only attachments
 * that already resolved to a URL. Whoever performs the send fills in the rest once the uploads
 * settle.
 */
const composeWithPendingUploads = ({
  composer,
  state,
}: {
  composer: MessageComposer;
  state: MessageComposerMiddlewareState;
}): MessageComposerMiddlewareState => {
  // `useSubmitHandler` in the UI SDKs deliberately skips `MessageComposer.clear()` when the
  // composition carries a poll - it keeps the composer's contents as a draft. Handing a
  // still-uploading attachment to such a message would leave the same `localMetadata.id` owned
  // by both the sent message and the composer: the user could send it a second time, and the
  // second `UploadManager.upload` call would restart the request under an id whose in-flight
  // entry had already been cleaned up. So a pending upload stays in the composer in that case
  // and rides along with the next message once it finishes.
  const composerIsKeptAsDraft = !!composer.pollId;

  // Composer order is preserved in both payloads so previews do not reshuffle when an upload
  // settles.
  const relevantAttachments = composer.attachmentManager.attachments.filter(
    (attachment) =>
      isFinishedUpload(attachment) ||
      (!composerIsKeptAsDraft && isPendingUpload(attachment)),
  );

  const localAttachments = (state.localMessage.attachments ?? []).concat(
    relevantAttachments.map((attachment) =>
      isPendingUpload(attachment) ? attachment : localAttachmentToAttachment(attachment),
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
 * Drop-in replacement for {@link createAttachmentsCompositionMiddleware} that lets a message be
 * composed while its attachments are still uploading.
 *
 * Reuses the same middleware id, so installing it with
 * `compositionMiddlewareExecutor.replace([...])` keeps its position in the chain. The default
 * refuses instead: it warns "Wait until all attachments have uploaded" and discards the
 * composition.
 *
 * **Installing this is only half of the flow.** The composition it produces is not ready for the
 * wire — `message.attachments` omits everything that has no URL yet. Whoever performs the send
 * has to await those uploads (`UploadManager.upload` is idempotent by `localMetadata.id`, so
 * calling it again returns the in-flight promise), write the resolved URLs in, and send after
 * that.
 *
 * Sendability follows on its own: the `allowsPendingUploads` declaration below is what
 * {@link MessageComposer.hasSendableData} reads to stop treating an upload in flight as a
 * blocker, so installing this middleware is the only switch there is.
 *
 * This is why there is no config option turning it on: the switch belongs to the UI SDK that
 * implements the other half. stream-chat-react exposes it as a `Chat` prop;
 * stream-chat-react-native as `allowSendBeforeAttachmentsUpload` on the message input.
 */
export const createSendWithPendingUploadsAttachmentsMiddleware = (
  composer: MessageComposer,
): MessageCompositionMiddleware => ({
  allowsPendingUploads: true,
  id: 'stream-io/message-composer-middleware/attachments',
  handlers: {
    compose: ({
      state,
      next,
      forward,
    }: MiddlewareHandlerParams<MessageComposerMiddlewareState>) => {
      const { attachmentManager } = composer;
      if (!attachmentManager) return forward();

      return next(composeWithPendingUploads({ composer, state }));
    },
  },
});

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
