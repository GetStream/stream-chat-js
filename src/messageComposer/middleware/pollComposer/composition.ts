import type { Middleware, MiddlewareHandlerParams } from '../../../middleware';
import type { MessageComposer } from '../../messageComposer';
import type { PollComposerCompositionMiddlewareValueState } from './types';

export type PollCompositionValidationMiddleware = Middleware<
  PollComposerCompositionMiddlewareValueState,
  'compose'
>;

export const createPollCompositionValidationMiddleware = (
  composer: MessageComposer,
): PollCompositionValidationMiddleware => ({
  id: 'stream-io/poll-composer-composition',
  handlers: {
    compose: ({
      discard,
      forward,
    }: MiddlewareHandlerParams<PollComposerCompositionMiddlewareValueState>) => {
      if (composer.pollComposer.canCreatePoll) return forward();
      return discard();
    },
  },
});
