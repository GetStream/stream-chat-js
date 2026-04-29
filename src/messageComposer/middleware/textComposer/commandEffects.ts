import type { Middleware } from '../../../middleware';
import type { CommandResponse } from '../../../types';
import type {
  CommandSuggestion,
  TextComposerCommandActivationEffect,
  TextComposerStateSnapshot,
} from './types';
import type { TextComposerMiddlewareExecutorState } from './TextComposerMiddlewareExecutor';

export type CommandEffectsMiddleware = Middleware<
  TextComposerMiddlewareExecutorState<CommandSuggestion>,
  'onChange' | 'onSuggestionItemSelect'
>;

const emptyCommandStateSnapshot: TextComposerStateSnapshot = {
  mentionedUsers: [],
  selection: { start: 0, end: 0 },
  text: '',
};

const createCommandActivationEffect = (
  command: CommandResponse,
): TextComposerCommandActivationEffect => ({
  command,
  stateToRestore: emptyCommandStateSnapshot,
  type: 'command.activate',
});

const isCommandResponse = (suggestion: unknown): suggestion is CommandSuggestion =>
  typeof (suggestion as CommandSuggestion | undefined)?.name === 'string';

export const createCommandEffectsMiddleware = (): CommandEffectsMiddleware => ({
  handlers: {
    onChange: ({ forward }) => forward(),
    onSuggestionItemSelect: ({ state, next, forward }) => {
      const { selectedSuggestion } = state.change ?? {};
      if (
        !isCommandResponse(selectedSuggestion) ||
        !state.command ||
        state.command.name !== selectedSuggestion.name
      ) {
        return forward();
      }

      return next({
        ...state,
        effects: [...(state.effects ?? []), createCommandActivationEffect(state.command)],
      });
    },
  },
  id: 'stream-io/text-composer/command-effects-middleware',
});
