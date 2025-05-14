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
  MessageComposerMiddlewareState,
  MessageDraftComposerMiddlewareExecutorOptions,
  MessageDraftComposerMiddlewareValueState,
} from './types';
import {
  createCustomDataCompositionMiddleware,
  createDraftCustomDataCompositionMiddleware,
} from './customData';
import { createPollOnlyCompositionMiddleware } from './pollOnly';

export class MessageComposerMiddlewareExecutor extends MiddlewareExecutor<
  MessageComposerMiddlewareState,
  'compose'
> {
  constructor({ composer }: MessageComposerMiddlewareExecutorOptions) {
    super();
    // todo: document how to add custom data to a composed message using middleware
    //  or adding custom composer components (apart from AttachmentsManager, TextComposer etc.)
    this.use([
      createPollOnlyCompositionMiddleware(composer),
      createTextComposerCompositionMiddleware(composer),
      createAttachmentsCompositionMiddleware(composer),
      createLinkPreviewsCompositionMiddleware(composer),
      createMessageComposerStateCompositionMiddleware(composer),
      createCustomDataCompositionMiddleware(composer),
      createCompositionValidationMiddleware(composer),
      createCompositionDataCleanupMiddleware(composer),
    ]);
  }
}

export class MessageDraftComposerMiddlewareExecutor extends MiddlewareExecutor<
  MessageDraftComposerMiddlewareValueState,
  'compose'
> {
  constructor({ composer }: MessageDraftComposerMiddlewareExecutorOptions) {
    super();
    // todo: document how to add custom data to a composed message using middleware
    //  or adding custom composer components (apart from AttachmentsManager, TextComposer etc.)
    this.use([
      createDraftTextComposerCompositionMiddleware(composer),
      createDraftAttachmentsCompositionMiddleware(composer),
      createDraftLinkPreviewsCompositionMiddleware(composer),
      createDraftMessageComposerStateCompositionMiddleware(composer),
      createDraftCustomDataCompositionMiddleware(composer),
      createDraftCompositionValidationMiddleware(composer),
    ]);
  }
}
