import type { MessageComposer } from '../../messageComposer';
import type { TextComposerMiddlewareParams } from './types';
import type { UserSuggestion } from './mentions';

export const createTextComposerPreValidationMiddleware = (composer: MessageComposer) => ({
  id: 'stream-io/text-composer/pre-validation-middleware',
  onChange: ({ input, nextHandler }: TextComposerMiddlewareParams<UserSuggestion>) => {
    const { maxLengthOnEdit } = composer.config.text ?? {};
    if (
      typeof maxLengthOnEdit === 'number' &&
      input.state.text.length > maxLengthOnEdit
    ) {
      input.state.text = input.state.text.slice(0, maxLengthOnEdit);
      return nextHandler({
        ...input,
        state: {
          ...input.state,
          text: input.state.text,
        },
      });
    }
    return nextHandler(input);
  },
});
