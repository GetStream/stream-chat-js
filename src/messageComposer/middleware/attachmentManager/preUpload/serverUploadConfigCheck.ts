import type { MiddlewareHandlerParams } from '../../../../middleware';
import type { MessageComposer } from '../../../messageComposer';
import type {
  AttachmentPreUploadMiddleware,
  AttachmentPreUploadMiddlewareState,
} from '../types';
import type { LocalUploadAttachment } from '../../../types';

export const createUploadConfigCheckMiddleware = (
  composer: MessageComposer,
): AttachmentPreUploadMiddleware => ({
  id: 'stream-io/attachment-manager-middleware/file-upload-config-check',
  handlers: {
    prepare: async ({
      state,
      next,
      discard,
    }: MiddlewareHandlerParams<AttachmentPreUploadMiddlewareState>) => {
      const { attachmentManager } = composer;
      if (!attachmentManager || !state.attachment) return discard();
      const uploadPermissionCheck = await attachmentManager.getUploadConfigCheck(
        state.attachment.localMetadata.file,
      );

      const attachment: LocalUploadAttachment = {
        ...state.attachment,
        localMetadata: {
          ...state.attachment.localMetadata,
          uploadPermissionCheck,
          uploadState: uploadPermissionCheck.uploadBlocked ? 'blocked' : 'pending',
        },
      };

      return next({
        ...state,
        attachment,
      });
    },
  },
});
