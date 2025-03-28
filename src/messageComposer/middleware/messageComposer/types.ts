import type { MiddlewareValue } from '../../../middleware';
import type {
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
  MiddlewareValue<MessageComposerMiddlewareValueState>;

export type MessageComposerMiddlewareExecutorOptions = {
  composer: MessageComposer;
};
