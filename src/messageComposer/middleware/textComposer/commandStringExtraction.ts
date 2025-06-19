import type { TextComposerMiddlewareExecutorState } from './TextComposerMiddlewareExecutor';
import type { CommandSuggestion } from './types';
import type { Middleware } from '../../../middleware';
import { escapeRegExp } from './textMiddlewareUtils';

export type CommandStringExtractionMiddleware = Middleware<
  TextComposerMiddlewareExecutorState<CommandSuggestion>,
  'onChange' | 'onSuggestionItemSelect'
>;

const stripCommandFromText = (text: string, commandName: string) =>
  text.replace(new RegExp(`^${escapeRegExp(`/${commandName}`)}\\s*`), '');

export const createCommandStringExtractionMiddleware =
  (): CommandStringExtractionMiddleware => ({
    handlers: {
      onChange: ({ complete, forward, state }) => {
        const { command } = state;

        if (!command?.name) {
          return forward();
        }

        const newText = stripCommandFromText(state.text, command.name);

        return complete({
          ...state,
          selection: {
            end: newText.length,
            start: newText.length,
          },
          text: newText,
        });
      },
      onSuggestionItemSelect: ({ next, forward, state }) => {
        const { command } = state;

        if (!command) {
          return forward();
        }

        const triggerWithCommand = `/${command?.name} `;

        const newText = state.text.slice(triggerWithCommand.length);
        return next({
          ...state,
          selection: {
            end: newText.length,
            start: newText.length,
          },
          text: newText,
        });
      },
    },
    id: 'stream-io/text-composer/command-string-extraction',
  });
