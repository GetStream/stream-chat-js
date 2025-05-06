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
>;

export type MessageDraftCompositionMiddleware = Middleware<
  MessageDraftComposerMiddlewareValueState,
  'compose'
>;
