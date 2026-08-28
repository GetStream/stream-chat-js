import type { Middleware, MiddlewareExecutionResult } from '../../../middleware';
import type {
  DraftMessagePayload,
  LocalMessage,
  Message,
  SendMessageOptions,
  UpdatedMessage,
} from '../../../types';
import type { MessageComposer } from '../../messageComposer';

export type MessageComposerMiddlewareState = {
  message: Message | UpdatedMessage;
  localMessage: LocalMessage;
  sendOptions: SendMessageOptions;
};

export type MessageComposerMiddlewareValue =
  MiddlewareExecutionResult<MessageComposerMiddlewareState>;

export type MessageComposerMiddlewareExecutorOptions = {
  composer: MessageComposer;
};

export type MessageDraftComposerMiddlewareValueState = {
  draft: DraftMessagePayload;
};

export type MessageDraftComposerMiddlewareExecutorOptions = {
  composer: MessageComposer;
};

export type MessageCompositionMiddleware = Middleware<
  MessageComposerMiddlewareState,
  'compose'
> & {
  /**
   * Declares that this middleware composes messages whose attachment uploads are still in
   * flight, instead of refusing to compose until they finish.
   *
   * {@link MessageComposer.hasSendableData} reads this: an upload in flight must not block the
   * send while such a middleware is installed, or the send could never be triggered. Any
   * middleware implementing that contract may set it - the composer keys off the declaration,
   * not off a middleware id, so a custom implementation is treated the same as the one shipped
   * here.
   *
   * Composing this way is only half of the flow: whoever performs the send has to await those
   * uploads and write the resolved URLs into the payload. See
   * {@link createSendWithPendingUploadsAttachmentsMiddleware}.
   *
   * **Temporary API.** In v10 sending with pending uploads becomes part of the composer
   * configuration (`MessageComposerConfig`, set through `updateConfig`), and this declaration,
   * together with {@link MessageComposer.allowsPendingUploads}, is replaced by that config
   * field.
   */
  allowsPendingUploads?: boolean;
};

export type MessageDraftCompositionMiddleware = Middleware<
  MessageDraftComposerMiddlewareValueState,
  'compose'
>;
