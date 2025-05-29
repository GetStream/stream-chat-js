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

        const trigger = `/${command.name}`;
        const newText = state.text.replace(new RegExp(`^${trigger}(\\s|$)`), '');

        return complete({
          ...state,
          selection: {
            end: state.selection.end - trigger.length,
            start: state.selection.start - trigger.length,
          },
          suggestions: undefined,
          text: newText,
        });
      },
      onSuggestionItemSelect: ({ complete, forward, state }) => {
        const { command } = state;

        if (!command) {
          return forward();
        }

        const trigger = `/${command?.name} `;

        const newText = state.text.slice(trigger.length);
        return complete({
          ...state,
          selection: {
            end: state.selection.end - trigger.length,
            start: state.selection.start - trigger.length,
          },
          suggestions: undefined,
          text: newText,
        });
      },
    },
    id: 'stream-io/text-composer/apply-command-settings',
  });
