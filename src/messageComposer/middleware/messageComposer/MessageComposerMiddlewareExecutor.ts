import { MiddlewareExecutor } from '../../../middleware';
import { createTextComposerMiddleware } from './textComposer';
import { createAttachmentsMiddleware } from './attachments';
import { createLinkPreviewsMiddleware } from './linkPreviews';
import { createMessageComposerStateMiddleware } from './messageComposerState';
import { createCompositionValidationMiddleware } from './compositionValidation';
import { createCleanDataMiddleware } from './cleanData';
import type {
  MessageComposerMiddlewareExecutorOptions,
  MessageComposerMiddlewareValue,
} from './types';

export class MessageComposerMiddlewareExecutor extends MiddlewareExecutor<
  MessageComposerMiddlewareValue['state'],
  MessageComposerMiddlewareValue
> {
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
