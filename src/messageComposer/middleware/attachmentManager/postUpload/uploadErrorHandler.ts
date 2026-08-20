import type { MiddlewareHandlerParams } from '../../../../middleware';
import { CORE_NOTIFICATION_TYPE } from '../../../../notifications';
import type { MessageComposer } from '../../../messageComposer';
import type {
  AttachmentPostUploadMiddleware,
  AttachmentPostUploadMiddlewareState,
} from '../types';

export const createUploadErrorHandlerMiddleware = (
  composer: MessageComposer,
): AttachmentPostUploadMiddleware => ({
  id: 'stream-io/attachment-manager-middleware/upload-error',
  handlers: {
    postProcess: ({
      state,
      discard,
      forward,
    }: MiddlewareHandlerParams<AttachmentPostUploadMiddlewareState>) => {
      const { attachment, error } = state;
      if (!error) return forward();
      if (!attachment) return discard();

      const reason = error instanceof Error ? error.message : 'unknown error';
      composer.client.notifications.addError({
        message: 'Error uploading attachment',
        origin: {
          emitter: 'AttachmentManager',
          context: { attachment },
        },
        options: {
          type: CORE_NOTIFICATION_TYPE.attachmentUploadFailed,
          metadata: { reason },
          originalError: error,
        },
      });

      return forward();
    },
  },
});
