import type {
  MessageComposerMiddlewareState,
  MessageCompositionMiddleware,
  MessageDraftComposerMiddlewareValueState,
  MessageDraftCompositionMiddleware,
} from './types';
import type { MessageComposer } from '../../messageComposer';
import type { MiddlewareHandlerParams } from '../../../middleware';

export const createTextComposerCompositionMiddleware = (
  composer: MessageComposer,
): MessageCompositionMiddleware => ({
  id: 'stream-io/message-composer-middleware/text-composition',
  handlers: {
    compose: ({
      state,
      next,
      forward,
    }: MiddlewareHandlerParams<MessageComposerMiddlewareState>) => {
      if (!composer.textComposer) return forward();
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
      if (!text && mentioned_users.length === 0) return forward();

      return next({
        ...state,
        localMessage: {
          ...state.localMessage,
          mentioned_users,
          text,
        },
        message: {
          ...state.message,
          mentioned_users: mentioned_users.map((u) => u.id),
          text,
        },
      });
    },
  },
});

export const createDraftTextComposerCompositionMiddleware = (
  composer: MessageComposer,
): MessageDraftCompositionMiddleware => ({
  id: 'stream-io/message-composer-middleware/draft-text-composition',
  handlers: {
    compose: ({
      state,
      next,
      forward,
    }: MiddlewareHandlerParams<MessageDraftComposerMiddlewareValueState>) => {
      if (!composer.textComposer) return forward();
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

      return next({
        ...state,
        draft: {
          ...state.draft,
          mentioned_users: mentioned_users?.map((u) => u.id),
          text,
        },
      });
    },
  },
});
