import type { Middleware, MiddlewareExecutionResult } from '../../../middleware';
import type {
  LocalMessage,
  MessageRequest,
  SendMessageOptions,
  UpdatedMessage,
} from '../../../types';
import type { MessageComposer } from '../../messageComposer';

export type MessageComposerMiddlewareState = {
  message: MessageRequest | UpdatedMessage;
  localMessage: LocalMessage;
  sendOptions: SendMessageOptions;
};

export type MessageComposerMiddlewareValue =
  MiddlewareExecutionResult<MessageComposerMiddlewareState>;

export type MessageComposerMiddlewareExecutorOptions = {
  composer: MessageComposer;
};

export type MessageDraftComposerMiddlewareValueState = {
  draft: MessageRequest;
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
