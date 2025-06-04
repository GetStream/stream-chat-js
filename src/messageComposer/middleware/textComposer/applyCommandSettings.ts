import type { Middleware } from '../../../middleware';
import type { TextComposerMiddlewareExecutorState } from './TextComposerMiddlewareExecutor';
import type { CommandSuggestion } from './types';

export type ApplyCommandSettingsMiddleware = Middleware<
  TextComposerMiddlewareExecutorState<CommandSuggestion>,
  'onChange' | 'onSuggestionItemSelect'
>;

export const createApplyCommandSettingsMiddleware =
  (): ApplyCommandSettingsMiddleware => ({
    handlers: {
      onChange: ({ complete, forward, state }) => {
        const { command } = state;

        if (!command) {
          return forward();
        }

        const triggerWithCommand = `/${command.name}`;
        const newText = state.text.replace(new RegExp(`^${triggerWithCommand}\\s*`), '');

        return complete({
          ...state,
          selection: {
            end: state.selection.end - triggerWithCommand.length,
            start: state.selection.start - triggerWithCommand.length,
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
            end: state.selection.end - triggerWithCommand.length,
            start: state.selection.start - triggerWithCommand.length,
          },
          text: newText,
        });
      },
    },
    id: 'stream-io/text-composer/apply-command-settings',
  });
