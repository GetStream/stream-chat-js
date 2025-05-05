import type { MiddlewareExecutionResult } from '../../../middleware';
import type {
  DraftMessagePayload,
  LocalMessage,
  Message,
  SendMessageOptions,
  UpdatedMessage,
} from '../../../types';
import type { MessageComposer } from '../../messageComposer';

export type MessageComposerMiddlewareValueState = {
  message: Message | UpdatedMessage;
  localMessage: LocalMessage;
  sendOptions: SendMessageOptions;
};

export type MessageComposerMiddlewareValue =
  MiddlewareExecutionResult<MessageComposerMiddlewareValueState>;

export type MessageComposerMiddlewareExecutorOptions = {
  composer: MessageComposer;
};

export type MessageDraftComposerMiddlewareValueState = {
  draft: DraftMessagePayload;
};

export type MessageDraftComposerMiddlewareExecutorOptions = {
  composer: MessageComposer;
};
