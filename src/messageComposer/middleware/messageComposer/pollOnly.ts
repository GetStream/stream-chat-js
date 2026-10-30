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

export const POLL_ONLY_COMPOSITION_MIDDLEWARE_ID =
  'stream-io/message-composer-middleware/poll-only';

/**
 * Sends a composer's poll as a message of its own (outside threads and edits), leaving the text,
 * attachments and quoted message in the composer. Remove it from the composer's
 * `compositionMiddlewareExecutor` to send the poll together with the rest of the message instead.
 */
export const createPollOnlyCompositionMiddleware = (
  composer: MessageComposer,
): MessageCompositionMiddleware => ({
  id: POLL_ONLY_COMPOSITION_MIDDLEWARE_ID,
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
