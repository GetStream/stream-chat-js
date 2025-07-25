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
import { createUserDataInjectionMiddleware } from './userDataInjection';
import { createPollOnlyCompositionMiddleware } from './pollOnly';
import { createSharedLocationCompositionMiddleware } from './sharedLocation';

export class MessageComposerMiddlewareExecutor extends MiddlewareExecutor<
  MessageComposerMiddlewareState,
  'compose'
> {
  constructor({ composer }: MessageComposerMiddlewareExecutorOptions) {
    super();
    // todo: document how to add custom data to a composed message using middleware
    //  or adding custom composer components (apart from AttachmentsManager, TextComposer etc.)
    this.use([
      createUserDataInjectionMiddleware(composer),
      createPollOnlyCompositionMiddleware(composer),
      createTextComposerCompositionMiddleware(composer),
      createAttachmentsCompositionMiddleware(composer),
      createLinkPreviewsCompositionMiddleware(composer),
      createSharedLocationCompositionMiddleware(composer),
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
