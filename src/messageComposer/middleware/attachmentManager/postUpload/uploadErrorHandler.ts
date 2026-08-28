import type { MiddlewareHandlerParams } from '../../../../middleware';
import type { MessageComposer } from '../../../messageComposer';
import type {
  AttachmentPostUploadMiddleware,
  AttachmentPostUploadMiddlewareState,
} from '../types';
import { isUploadCancellation } from '../../../../uploadManager';

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
      // A cancellation is the user getting what they asked for, so it gets no error
      // notification. `StreamChat.doAxiosRequest` draws the same line for the same reason.
      if (isUploadCancellation(error)) return forward();

      const reason = error instanceof Error ? error.message : 'unknown error';
      composer.client.notifications.addError({
        message: 'Error uploading attachment',
        origin: {
          emitter: 'AttachmentManager',
          context: { attachment },
        },
        options: {
          type: 'api:attachment:upload:failed',
          metadata: { reason },
          originalError: error,
        },
      });

      return forward();
    },
  },
});
