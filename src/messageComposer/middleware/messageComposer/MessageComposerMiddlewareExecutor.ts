import { MiddlewareExecutor } from '../../../middleware';
import type { MessageComposerMiddlewareValue } from './types';

export class MessageComposerMiddlewareExecutor extends MiddlewareExecutor<
  MessageComposerMiddlewareValue['state'],
  MessageComposerMiddlewareValue
> {
  constructor(threadId: string | null = null) {
    super();
    if (threadId) {
      this.use({
        id: 'thread',
        compose: ({ input, nextHandler }) =>
          nextHandler({
            ...input,
            state: {
              ...input.state,
              message: {
                ...input.state.message,
                parent_id: threadId,
              },
            },
          }),
      });
    }
  }
}
