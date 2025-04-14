import type {
  MessageComposerMiddlewareValue,
  MessageDraftComposerMiddlewareValue,
} from './types';
import type { MessageComposer } from '../../messageComposer';

export const createTextComposerCompositionMiddleware = (composer: MessageComposer) => ({
  id: 'stream-io/message-composer-middleware/text-composition',
  compose: ({
    input,
    nextHandler,
  }: {
    input: MessageComposerMiddlewareValue;
    nextHandler: (
      input: MessageComposerMiddlewareValue,
    ) => Promise<MessageComposerMiddlewareValue>;
  }) => {
    if (!composer.textComposer) return nextHandler(input);
    const { mentionedUsers, text } = composer.textComposer;
    // Instead of checking if a user is still mentioned every time the text changes,
    // just filter out non-mentioned users before submit, which is cheaper
    // and allows users to easily undo any accidental deletion
    const mentioned_users = Array.from(
      new Set(
        mentionedUsers.filter(
          ({ id, name }) => text.includes(`@${id}`) || text.includes(`@${name}`),
        ),
      ),
    );

    // prevent introducing text and mentioned_users array into the payload sent to the server
    if (!text && mentioned_users.length === 0) return nextHandler(input);

    return nextHandler({
      ...input,
      state: {
        ...input.state,
        localMessage: {
          ...input.state.localMessage,
          mentioned_users,
          text,
        },
        message: {
          ...input.state.message,
          mentioned_users: mentioned_users.map((u) => u.id),
          text,
        },
      },
    });
  },
});

export const createDraftTextComposerCompositionMiddleware = (
  composer: MessageComposer,
) => ({
  id: 'stream-io/message-composer-middleware/draft-text-composition',
  compose: ({
    input,
    nextHandler,
  }: {
    input: MessageDraftComposerMiddlewareValue;
    nextHandler: (
      input: MessageDraftComposerMiddlewareValue,
    ) => Promise<MessageDraftComposerMiddlewareValue>;
  }) => {
    if (!composer.textComposer) return nextHandler(input);
    const { maxLengthOnSend } = composer.config.text ?? {};
    const { mentionedUsers, text: inputText } = composer.textComposer;
    // Instead of checking if a user is still mentioned every time the text changes,
    // just filter out non-mentioned users before submit, which is cheaper
    // and allows users to easily undo any accidental deletion
    const mentioned_users = mentionedUsers.length
      ? Array.from(
          new Set(
            mentionedUsers.filter(
              ({ id, name }) =>
                inputText.includes(`@${id}`) || inputText.includes(`@${name}`),
            ),
          ),
        )
      : undefined;

    const text =
      typeof maxLengthOnSend === 'number' && inputText.length > maxLengthOnSend
        ? inputText.slice(0, maxLengthOnSend)
        : inputText;

    return nextHandler({
      ...input,
      state: {
        ...input.state,
        draft: {
          ...input.state.draft,
          mentioned_users: mentioned_users?.map((u) => u.id),
          text,
        },
      },
    });
  },
});
