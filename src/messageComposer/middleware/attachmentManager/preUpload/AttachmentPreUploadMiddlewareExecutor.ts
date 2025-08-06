import { MiddlewareExecutor } from '../../../../middleware';
import type {
  AttachmentPreUploadMiddlewareExecutorOptions,
  AttachmentPreUploadMiddlewareState,
} from '../types';
import { createUploadConfigCheckMiddleware } from './serverUploadConfigCheck';
import { createBlockedAttachmentUploadNotificationMiddleware } from './blockedUploadNotification';

export class AttachmentPreUploadMiddlewareExecutor extends MiddlewareExecutor<
  AttachmentPreUploadMiddlewareState,
  'prepare'
> {
  constructor({ composer }: AttachmentPreUploadMiddlewareExecutorOptions) {
    super();
    this.use([
      createUploadConfigCheckMiddleware(composer),
      createBlockedAttachmentUploadNotificationMiddleware(composer),
    ]);
  }
}
