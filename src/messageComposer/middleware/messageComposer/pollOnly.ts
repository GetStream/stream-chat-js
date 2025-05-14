import type {
  MessageComposerMiddlewareState,
  MessageCompositionMiddleware,
} from './types';
import type { MessageComposer } from '../../messageComposer';
import type { MiddlewareHandlerParams } from '../../../middleware';
import type { LocalMessage } from '../../../types';

const pollLocalMessageNullifiedFields: Pick<
  LocalMessage,
  'attachments' | 'mentioned_users' | 'parent_id' | 'quoted_message' | 'text'
> = {
  attachments: [],
  mentioned_users: [],
  parent_id: undefined,
  quoted_message: undefined,
  text: '',
};

export const createPollOnlyCompositionMiddleware = (
  composer: MessageComposer,
): MessageCompositionMiddleware => ({
  id: 'stream-io/message-composer-middleware/poll-only',
  handlers: {
    compose: ({
      state,
      complete,
      forward,
    }: MiddlewareHandlerParams<MessageComposerMiddlewareState>) => {
      const pollId = composer.pollId;
      const isEditingMessage = !!composer.editedMessage;
      const isComposingThreadReply = !!composer.threadId;
      if (!pollId || isComposingThreadReply || isEditingMessage) return forward();

      return complete({
        ...state,
        localMessage: {
          ...state.localMessage,
          ...pollLocalMessageNullifiedFields,
          poll_id: pollId,
        },
        message: {
          id: state.localMessage.id,
          poll_id: pollId,
        },
      });
    },
  },
});
