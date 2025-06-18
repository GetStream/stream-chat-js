import type { Middleware } from '../../../middleware';
import type { TextComposerMiddlewareExecutorState } from './TextComposerMiddlewareExecutor';

export type PreCommandMiddleware = Middleware<
  TextComposerMiddlewareExecutorState,
  'onChange' | 'onSuggestionItemSelect'
>;

export const createActiveCommandGuardMiddleware = (): PreCommandMiddleware => ({
  handlers: {
    onChange: ({ complete, forward, state }) => {
      if (state.command) {
        return complete(state);
      }
      return forward();
    },
    onSuggestionItemSelect: ({ forward }) => forward(),
  },
  id: 'stream-io/text-composer/active-command-guard',
});
