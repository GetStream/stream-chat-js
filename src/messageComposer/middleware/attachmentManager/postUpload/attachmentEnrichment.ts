import type { MiddlewareHandlerParams } from '../../../../middleware';
import type {
  AttachmentPostUploadMiddleware,
  AttachmentPostUploadMiddlewareState,
} from '../types';
import { isLocalImageAttachment } from '../../../attachmentIdentity';
import type { MessageComposer } from '../../../messageComposer';
import type { LocalNotImageAttachment } from '../../../types';

/**
 * Writes the uploaded URL onto the attachment and releases its local preview.
 *
 * The preview is a blob URL the composer created for the file. Releasing it once the CDN URL is
 * in is what keeps the browser from holding the file in memory.
 *
 * Pass `composer` and the preview is released only while the attachment is still one of the
 * composer's own — still listed in `attachmentManager.attachments`, i.e. still shown above the
 * input, waiting to be sent.
 *
 * This runs when an upload finishes, which can be after the composer was cleared: `uploadFile`
 * executes this chain before the (by then no-op) `updateAttachment`. If the attachment is gone
 * from the composer, a message is rendering from the preview instead, and releasing it would
 * blank that message out. A message can be sent with uploads still running — see
 * `createSendWithPendingUploadsAttachmentsMiddleware`.
 *
 * Omit `composer` and the preview is always released.
 */
export const createPostUploadAttachmentEnrichmentMiddleware = (
  composer?: MessageComposer,
): AttachmentPostUploadMiddleware => ({
  id: 'stream-io/attachment-manager-middleware/post-upload-enrichment',
  handlers: {
    postProcess: ({
      state,
      discard,
      forward,
      next,
    }: MiddlewareHandlerParams<AttachmentPostUploadMiddlewareState>) => {
      const { attachment, error, response } = state;
      if (error) return forward();
      if (!attachment || !response) return discard();

      const enrichedAttachment = { ...attachment };
      const { id, previewUri } = attachment.localMetadata;
      // `attachmentsById` is built from the composer's current attachment state, so a hit means
      // the attachment is still in the composer and its preview is not in use elsewhere.
      const attachmentIsStillInComposer =
        !composer || !!composer.attachmentManager.attachmentsById[id];

      if (previewUri && attachmentIsStillInComposer) {
        if (previewUri.startsWith('blob:')) URL.revokeObjectURL?.(previewUri);
        delete enrichedAttachment.localMetadata.previewUri;
      }
      if (isLocalImageAttachment(attachment)) {
        enrichedAttachment.image_url = response.file;
      } else {
        (enrichedAttachment as LocalNotImageAttachment).asset_url = response.file;
      }
      if (response.thumb_url) {
        (enrichedAttachment as LocalNotImageAttachment).thumb_url = response.thumb_url;
      }

      return next({
        ...state,
        attachment: enrichedAttachment,
      });
    },
  },
});
