import { MiddlewareExecutor } from '../../../middleware';
import {
  createDraftTextComposerCompositionMiddleware,
  createTextComposerCompositionMiddleware,
} from './textComposer';
import {
  createAttachmentsCompositionMiddleware,
  createDraftAttachmentsCompositionMiddleware,
} from './attachments';
import {
  createDraftLinkPreviewsCompositionMiddleware,
  createLinkPreviewsCompositionMiddleware,
} from './linkPreviews';
import {
  createDraftMessageComposerStateCompositionMiddleware,
  createMessageComposerStateCompositionMiddleware,
} from './messageComposerState';
import {
  createCompositionValidationMiddleware,
  createDraftCompositionValidationMiddleware,
} from './compositionValidation';
import { createCompositionDataCleanupMiddleware } from './cleanData';
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
      createTextComposerCompositionMiddleware(composer),
      createAttachmentsCompositionMiddleware(composer),
      createLinkPreviewsCompositionMiddleware(composer),
      createMessageComposerStateCompositionMiddleware(composer),
      createCompositionValidationMiddleware(composer),
      createCompositionDataCleanupMiddleware(composer),
    ]);
  }
}

export class MessageDraftComposerMiddlewareExecutor extends MiddlewareExecutor<MessageDraftComposerMiddlewareValueState> {
  constructor({ composer }: MessageDraftComposerMiddlewareExecutorOptions) {
    super();
    // todo: document how to add custom data to a composed message using middleware
    //  or adding custom composer components (apart from AttachmentsManager, TextComposer etc.)
    this.use([
      createDraftTextComposerCompositionMiddleware(composer),
      createDraftAttachmentsCompositionMiddleware(composer),
      createDraftLinkPreviewsCompositionMiddleware(composer),
      createDraftMessageComposerStateCompositionMiddleware(composer),
      createDraftCompositionValidationMiddleware(composer),
    ]);
  }
}
