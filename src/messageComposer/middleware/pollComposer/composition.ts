import type { PollComposerCompositionMiddlewareValueState } from './types';
import type { MessageComposer } from '../../messageComposer';
import type { Middleware } from '../../../middleware';
import type { MiddlewareHandlerParams } from '../../../middleware';

export const createPollCompositionValidationMiddleware = (
  composer: MessageComposer,
): Middleware<PollComposerCompositionMiddlewareValueState> => ({
  id: 'stream-io/poll-composer-composition',
  compose: ({
    input,
    nextHandler,
  }: MiddlewareHandlerParams<PollComposerCompositionMiddlewareValueState>) => {
    if (composer.pollComposer.canCreatePoll) return nextHandler(input);
    return nextHandler({ ...input, status: 'discard' });
  },
});
