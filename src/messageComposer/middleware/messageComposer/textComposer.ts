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
  }) => {
    const { text } = composer.textComposer;
    // Instead of checking if a user is still mentioned every time the text changes,
    // just filter out non-mentioned users before submit, which is cheaper
    // and allows users to easily undo any accidental deletion
    const mentioned_users = Array.from(
      new Set(
        composer.textComposer.mentionedUsers.filter(
          ({ id, name }) => text.includes(`@${id}`) || text.includes(`@${name}`),
        ),
      ),
    );

    return nextHandler({
      ...input,
      state: {
        ...input.state,
        message: {
          ...input.state.message,
          mentioned_users,
          poll_id: composer.pollId ?? undefined,
          text,
        },
      },
    });
  },
});
