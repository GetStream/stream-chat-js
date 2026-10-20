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
 * With `composer`, the preview is released only while the attachment is still in
 * `attachmentManager.attachments`: an upload can finish after the composer was cleared (see
 * {@link AttachmentManagerConfig.pendingUploadsEnabled}), and a sent message may still render from it.
 * Without `composer`, it is always released.
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
