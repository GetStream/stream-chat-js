import type { MessageComposer } from '../../messageComposer';
import type {
  MessageComposerMiddlewareState,
  MessageCompositionMiddleware,
  MessageDraftComposerMiddlewareValueState,
  MessageDraftCompositionMiddleware,
} from '../messageComposer/types';
import type { MiddlewareHandlerParams } from '../../../middleware';
import { textStartsWithCommand } from '../textComposer/commandUtils';

/**
 * Puts the active command back in front of the sent text (`/giphy` + `cats` → `/giphy cats`). Text
 * that already starts with the command is sent as it is, so the command is never injected twice.
 */
export const createCommandInjectionMiddleware = (
  composer: MessageComposer,
): MessageCompositionMiddleware => ({
  handlers: {
    compose: ({
      forward,
      next,
      state,
    }: MiddlewareHandlerParams<MessageComposerMiddlewareState>) => {
      const command = composer.textComposer.command;
      const { text } = state.localMessage;
      if (!command || textStartsWithCommand(text, command.name)) {
        return forward();
      }

      const injection = `/${command?.name}`;
      const enrichedText = `${injection} ${text}`;

      return next({
        ...state,
        localMessage: {
          ...state.localMessage,
          text: enrichedText,
        },
        message: {
          ...state.message,
          text: enrichedText,
        },
      });
    },
  },
  id: 'stream-io/message-composer-middleware/command-string-injection',
});

/** Puts the active command back in front of the draft text, like the command injection middleware. */
export const createDraftCommandInjectionMiddleware = (
  composer: MessageComposer,
): MessageDraftCompositionMiddleware => ({
  handlers: {
    compose: ({
      forward,
      next,
      state,
    }: MiddlewareHandlerParams<MessageDraftComposerMiddlewareValueState>) => {
      const command = composer.textComposer.command;
      const { text } = state.draft;
      if (!command || textStartsWithCommand(text ?? '', command.name)) {
        return forward();
      }

      const injection = `/${command?.name}`;
      const enrichedText = `${injection} ${text}`;

      return next({
        ...state,
        draft: {
          ...state.draft,
          text: enrichedText,
        },
      });
    },
  },
  id: 'stream-io/message-composer-middleware/draft-command-string-injection',
});
