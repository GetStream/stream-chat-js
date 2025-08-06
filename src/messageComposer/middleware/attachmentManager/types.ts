import type { LocalUploadAttachment } from '../../types';
import type { Middleware } from '../../../middleware';
import type { MessageComposer } from '../../messageComposer';
import type { MinimumUploadRequestResult } from '../../configuration';

export type AttachmentPreUploadMiddlewareState = {
  attachment: LocalUploadAttachment;
};

export type AttachmentPostUploadMiddlewareState = {
  attachment: LocalUploadAttachment;
  error?: Error;
  response?: MinimumUploadRequestResult;
};

export type AttachmentPreUploadMiddleware = Middleware<
  AttachmentPreUploadMiddlewareState,
  'prepare'
>;

export type AttachmentPostUploadMiddleware = Middleware<
  AttachmentPostUploadMiddlewareState,
  'postProcess'
>;

export type AttachmentPostUploadMiddlewareExecutorOptions = {
  composer: MessageComposer;
};

export type AttachmentPreUploadMiddlewareExecutorOptions = {
  composer: MessageComposer;
};
