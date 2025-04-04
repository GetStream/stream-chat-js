import { MiddlewareExecutor } from '../../../middleware';
import {
  createDraftTextComposerMiddleware,
  createTextComposerMiddleware,
} from './textComposer';
import {
  createAttachmentsMiddleware,
  createDraftAttachmentsMiddleware,
} from './attachments';
import {
  createDraftLinkPreviewsMiddleware,
  createLinkPreviewsMiddleware,
} from './linkPreviews';
import {
  createDraftMessageComposerStateMiddleware,
  createMessageComposerStateMiddleware,
} from './messageComposerState';
import {
  createCompositionValidationMiddleware,
  createDraftCompositionValidationMiddleware,
} from './compositionValidation';
import { createCleanDataMiddleware } from './cleanData';
import type {
  MessageComposerMiddlewareExecutorOptions,
  MessageComposerMiddlewareValueState,
  MessageDraftComposerMiddlewareExecutorOptions,
  MessageDraftComposerMiddlewareValueState,
} from './types';
import {} from './types';

export class MessageComposerMiddlewareExecutor extends MiddlewareExecutor<MessageComposerMiddlewareValueState> {
  constructor({ composer }: MessageComposerMiddlewareExecutorOptions) {
    super();
    // todo: document how to add custom data to a composed message using middleware
    //  or adding custom composer components (apart from AttachmentsManager, TextComposer etc.)
    this.use([
      createTextComposerMiddleware(composer),
      createAttachmentsMiddleware(composer),
      createLinkPreviewsMiddleware(composer),
      createMessageComposerStateMiddleware(composer),
      createCompositionValidationMiddleware(),
      createCleanDataMiddleware(composer),
    ]);
  }
}

export class MessageDraftComposerMiddlewareExecutor extends MiddlewareExecutor<MessageDraftComposerMiddlewareValueState> {
  constructor({ composer }: MessageDraftComposerMiddlewareExecutorOptions) {
    super();
    // todo: document how to add custom data to a composed message using middleware
    //  or adding custom composer components (apart from AttachmentsManager, TextComposer etc.)
    this.use([
      createDraftTextComposerMiddleware(composer),
      createDraftAttachmentsMiddleware(composer),
      createDraftLinkPreviewsMiddleware(composer),
      createDraftMessageComposerStateMiddleware(composer),
      createDraftCompositionValidationMiddleware(composer),
    ]);
  }
}
