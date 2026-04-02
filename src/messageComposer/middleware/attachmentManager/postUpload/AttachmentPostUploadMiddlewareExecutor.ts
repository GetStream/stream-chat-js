import { MiddlewareExecutor } from '../../../../middleware';
import type {
  AttachmentPostUploadMiddlewareExecutorOptions,
  AttachmentPostUploadMiddlewareState,
} from '../types';
import { createPostUploadAttachmentEnrichmentMiddleware } from './attachmentEnrichment';
import { createUploadErrorHandlerMiddleware } from './uploadErrorHandler';
import { createUploadManagerCleanUpMiddleware } from './uploadManagerCleanUp';

export class AttachmentPostUploadMiddlewareExecutor extends MiddlewareExecutor<
  AttachmentPostUploadMiddlewareState,
  'postProcess'
> {
  constructor({ composer }: AttachmentPostUploadMiddlewareExecutorOptions) {
    super();
    this.use([
      createUploadErrorHandlerMiddleware(composer),
      createPostUploadAttachmentEnrichmentMiddleware(),
      createUploadManagerCleanUpMiddleware(composer),
    ]);
  }
}
