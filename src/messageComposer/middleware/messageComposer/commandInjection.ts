import type { MessageComposer } from '../../messageComposer';
import type {
  MessageComposerMiddlewareState,
  MessageCompositionMiddleware,
  MessageDraftComposerMiddlewareValueState,
  MessageDraftCompositionMiddleware,
} from '../messageComposer/types';
import type { MiddlewareHandlerParams } from '../../../middleware';

export const createCommandInjectionMiddleware = (
  composer: MessageComposer,
): MessageCompositionMiddleware => ({
  handlers: {
    compose: ({
      complete,
      forward,
      state,
    }: MiddlewareHandlerParams<MessageComposerMiddlewareState>) => {
      const command = composer.textComposer.command;
      if (!command) {
        return forward();
      }
      const { text } = state.localMessage;

      const injection = `/${command?.name}`;
      const enrichedText = `${injection} ${text}`;

      return complete({
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
  id: 'stream-io/message-composer-middleware/command-injection',
});

export const createDraftCommandInjectionMiddleware = (
  composer: MessageComposer,
): MessageDraftCompositionMiddleware => ({
  handlers: {
    compose: ({
      forward,
      state,
      complete,
    }: MiddlewareHandlerParams<MessageDraftComposerMiddlewareValueState>) => {
      const command = composer.textComposer.command;
      if (!command) {
        return forward();
      }
      const { text } = state.draft;

      const injection = `/${command?.name}`;
      const enrichedText = `${injection} ${text}`;

      return complete({
        ...state,
        draft: {
          ...state.draft,
          text: enrichedText,
        },
      });
    },
  },
  id: 'stream-io/message-composer-middleware/draft-command-injection',
});
