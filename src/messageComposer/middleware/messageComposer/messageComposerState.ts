import type {
  MessageComposerMiddlewareValueState,
  MessageDraftComposerMiddlewareValueState,
} from './types';
import type { MessageComposer } from '../../messageComposer';
import type { LocalMessage, LocalMessageBase } from '../../../types';
import type { MiddlewareHandlerParams } from '../../../middleware';

export const createMessageComposerStateCompositionMiddleware = (
  composer: MessageComposer,
) => ({
  id: 'stream-io/message-composer-middleware/own-state',
  compose: ({
    input,
    nextHandler,
  }: MiddlewareHandlerParams<MessageComposerMiddlewareValueState>) => {
    const payload: Pick<LocalMessage, 'poll_id' | 'quoted_message_id'> = {};
    if (composer.quotedMessage) {
      payload.quoted_message_id = composer.quotedMessage.id;
    }
    if (composer.pollId) {
      payload.poll_id = composer.pollId;
    }

    return nextHandler({
      ...input,
      state: {
        ...input.state,
        localMessage: {
          ...input.state.localMessage,
          ...payload,
          quoted_message: (composer.quotedMessage as LocalMessageBase) ?? undefined,
        },
        message: {
          ...input.state.message,
          ...payload,
        },
      },
    });
  },
});

export const createDraftMessageComposerStateCompositionMiddleware = (
  composer: MessageComposer,
) => ({
  id: 'stream-io/message-composer-middleware/draft-own-state',
  compose: ({
    input,
    nextHandler,
  }: MiddlewareHandlerParams<MessageDraftComposerMiddlewareValueState>) => {
    const payload: Pick<LocalMessage, 'poll_id' | 'quoted_message_id'> = {};
    if (composer.quotedMessage) {
      payload.quoted_message_id = composer.quotedMessage.id;
    }
    if (composer.pollId) {
      payload.poll_id = composer.pollId;
    }

    return nextHandler({
      ...input,
      state: {
        ...input.state,
        draft: {
          ...input.state.draft,
          ...payload,
        },
      },
    });
  },
});
