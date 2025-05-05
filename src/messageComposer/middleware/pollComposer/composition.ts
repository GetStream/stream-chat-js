import type { MiddlewareHandler, MiddlewareHandlerParams } from '../../../middleware';
import type { MessageComposer } from '../../messageComposer';
import type { PollComposerCompositionMiddlewareValueState } from './types';

export type PollCompositionValidationMiddleware = {
  id: string;
  compose: MiddlewareHandler<PollComposerCompositionMiddlewareValueState>;
};

export const createPollCompositionValidationMiddleware = (
  composer: MessageComposer,
): PollCompositionValidationMiddleware => ({
  id: 'stream-io/poll-composer-composition',
  compose: ({
    discard,
    forward,
  }: MiddlewareHandlerParams<PollComposerCompositionMiddlewareValueState>) => {
    if (composer.pollComposer.canCreatePoll) return forward();
    return discard();
  },
});
