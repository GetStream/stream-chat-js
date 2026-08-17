import type { MiddlewareHandlerParams } from '../../../../middleware';
import { CORE_NOTIFICATION_TYPE } from '../../../../notifications';
import type { MessageComposer } from '../../../messageComposer';
import type {
  AttachmentPreUploadMiddleware,
  AttachmentPreUploadMiddlewareState,
} from '../types';

export const createBlockedAttachmentUploadNotificationMiddleware = (
  composer: MessageComposer,
): AttachmentPreUploadMiddleware => ({
  id: 'stream-io/attachment-manager-middleware/blocked-upload-notification',
  handlers: {
    prepare: ({
      state: { attachment },
      forward,
    }: MiddlewareHandlerParams<AttachmentPreUploadMiddlewareState>) => {
      if (!attachment) return forward();

      if (attachment.localMetadata.uploadPermissionCheck?.uploadBlocked) {
        composer.client.notifications.addError({
          message: `The attachment upload was blocked`,
          origin: {
            emitter: 'AttachmentManager',
            context: { blockedAttachment: attachment },
          },
          options: {
            type: CORE_NOTIFICATION_TYPE.attachmentUploadBlocked,
            metadata: {
              reason: attachment.localMetadata.uploadPermissionCheck?.reason,
            },
          },
        });
      }

      return forward();
    },
  },
});
