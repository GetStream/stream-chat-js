import type { Middleware } from '../../../middleware';
import type { MessageComposer } from '../../messageComposer';
import type {
  PollComposerCompositionMiddlewareValue,
  PollComposerCompositionMiddlewareValueState,
} from './types';

export const createPollComposerValidationMiddleware = (
  composer: MessageComposer,
): Middleware<
  PollComposerCompositionMiddlewareValueState,
  PollComposerCompositionMiddlewareValue
> => ({
  id: 'pollComposerComposition',
  compose: ({ input, nextHandler }) => {
    if (composer.pollComposer.canCreatePoll) return nextHandler(input);
    return nextHandler({ ...input, status: 'discard' });
  },
});
