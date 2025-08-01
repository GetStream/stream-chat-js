import type { MiddlewareHandlerParams } from '../../../../middleware';
import type {
  AttachmentPostUploadMiddleware,
  AttachmentPostUploadMiddlewareState,
} from '../types';
import { isLocalImageAttachment } from '../../../attachmentIdentity';
import type { LocalNotImageAttachment } from '../../../types';

export const createPostUploadAttachmentEnrichmentMiddleware =
  (): AttachmentPostUploadMiddleware => ({
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
        if (isLocalImageAttachment(attachment)) {
          if (attachment.localMetadata.previewUri) {
            URL.revokeObjectURL(attachment.localMetadata.previewUri);
            delete enrichedAttachment.localMetadata.previewUri;
          }
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
