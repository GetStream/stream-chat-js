import type { MessageComposerMiddlewareValue } from './types';
import type { MessageComposer } from '../../messageComposer';
import type { LocalMessage, LocalMessageBase } from '../../../types';

export const createMessageComposerStateMiddleware = (composer: MessageComposer) => ({
  id: 'messageComposerState',
  compose: ({
    input,
    nextHandler,
  }: {
    input: MessageComposerMiddlewareValue;
    nextHandler: (
      input: MessageComposerMiddlewareValue,
    ) => Promise<MessageComposerMiddlewareValue>;
  }) => {
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
