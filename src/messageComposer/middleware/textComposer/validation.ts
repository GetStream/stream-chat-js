import type { MessageComposer } from '../../messageComposer';
import type { TextComposerMiddlewareExecutorState } from './TextComposerMiddlewareExecutor';
import type { Suggestion } from './types';
import type { Middleware } from '../../../middleware';

export type TextComposerPreValidationMiddleware = Middleware<
  TextComposerMiddlewareExecutorState<Suggestion>,
  'onChange' | 'onSuggestionItemSelect'
>;

export const createTextComposerPreValidationMiddleware = (
  composer: MessageComposer,
): TextComposerPreValidationMiddleware => ({
  id: 'stream-io/text-composer/pre-validation-middleware',
  handlers: {
    onChange: ({ state, next, forward }) => {
      const { maxLengthOnEdit } = composer.config.text ?? {};
      if (typeof maxLengthOnEdit === 'number' && state.text.length > maxLengthOnEdit) {
        state.text = state.text.slice(0, maxLengthOnEdit);
        return next({
          ...state,
          text: state.text,
        });
      }
      return forward();
    },
    onSuggestionItemSelect: ({ forward }) => forward(),
  },
});
