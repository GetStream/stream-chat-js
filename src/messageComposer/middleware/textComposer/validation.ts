import type { MiddlewareHandlerParams } from '../../../middleware';
import type { TextSelection } from './types';
import type { TextComposerState } from './types';
import type { MessageComposer } from '../../messageComposer';

export const createTextComposerPreValidationMiddleware = (composer: MessageComposer) => ({
  id: 'stream-io/text-composer/pre-validation-middleware',
  onChange: ({
    state,
    next,
    forward,
  }: MiddlewareHandlerParams<
    TextComposerState,
    {
      selection: TextSelection;
      text: string;
    }
  >) => {
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
});
