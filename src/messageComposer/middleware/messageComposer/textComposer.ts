import type { MessageComposerMiddlewareValue } from './types';
import type { MessageComposer } from '../../messageComposer';

export const createTextComposerMiddleware = (composer: MessageComposer) => ({
  id: 'text',
  compose: ({
    input,
    nextHandler,
  }: {
    input: MessageComposerMiddlewareValue;
    nextHandler: (
      input: MessageComposerMiddlewareValue,
    ) => Promise<MessageComposerMiddlewareValue>;
  }) =>
    nextHandler({
      ...input,
      state: {
        ...input.state,
        message: {
          ...input.state.message,
          mentioned_users: composer.textComposer.mentionedUsers.map((user) => user.id),
          poll_id: composer.pollId ?? undefined,
          text: composer.textComposer.text,
        },
      },
    }),
});
