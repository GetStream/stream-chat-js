import { MiddlewareExecutor } from '../../../middleware';
import { createPollComposerStateMiddleware } from './state';
import { createPollCompositionValidationMiddleware } from './composition';
import type {
  PollComposerCompositionMiddlewareValueState,
  PollComposerStateChangeMiddlewareValue,
} from './types';
import type { MessageComposer } from '../../messageComposer';

export type PollComposerMiddlewareExecutorOptions = {
  composer: MessageComposer;
};

export class PollComposerCompositionMiddlewareExecutor extends MiddlewareExecutor<
  PollComposerCompositionMiddlewareValueState,
  'compose'
> {
  constructor({ composer }: PollComposerMiddlewareExecutorOptions) {
    super();
    this.use([createPollCompositionValidationMiddleware(composer)]);
  }
}

export class PollComposerStateMiddlewareExecutor extends MiddlewareExecutor<
  PollComposerStateChangeMiddlewareValue,
  'handleFieldChange' | 'handleFieldBlur'
> {
  constructor() {
    super();
    this.use([createPollComposerStateMiddleware()]);
  }
}
