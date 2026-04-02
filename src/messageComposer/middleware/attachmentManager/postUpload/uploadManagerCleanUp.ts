import type { MiddlewareHandlerParams } from '../../../../middleware';
import type { MessageComposer } from '../../../messageComposer';
import type {
  AttachmentPostUploadMiddleware,
  AttachmentPostUploadMiddlewareState,
} from '../types';

export const createUploadManagerCleanUpMiddleware = (
  composer: MessageComposer,
): AttachmentPostUploadMiddleware => ({
  id: 'stream-io/attachment-manager-middleware/uploadManagerCleanUp',
  handlers: {
    postProcess: ({
      state,
      forward,
    }: MiddlewareHandlerParams<AttachmentPostUploadMiddlewareState>) => {
      const id = state.attachment?.localMetadata?.id;
      if (id) {
        composer.client.uploadManager.deleteUploadRecords((upload) => upload.id === id);
      }
      return forward();
    },
  },
});
