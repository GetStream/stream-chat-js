import { MiddlewareExecutor } from '../../../middleware';
import { createPollComposerStateMiddleware } from './state';
import { createPollComposerValidationMiddleware } from './composition';
import type {
  PollComposerCompositionMiddlewareValueState,
  PollComposerStateMiddlewareValueState,
} from './types';
import type { MessageComposer } from '../../messageComposer';

export type PollComposerMiddlewareExecutorOptions = {
  composer: MessageComposer;
};

export class PollComposerCompositionMiddlewareExecutor extends MiddlewareExecutor<PollComposerCompositionMiddlewareValueState> {
  constructor({ composer }: PollComposerMiddlewareExecutorOptions) {
    super();
    this.use([createPollComposerValidationMiddleware(composer)]);
  }
}

export class PollComposerStateMiddlewareExecutor extends MiddlewareExecutor<PollComposerStateMiddlewareValueState> {
  constructor() {
    super();
    this.use([createPollComposerStateMiddleware()]);
  }
}
