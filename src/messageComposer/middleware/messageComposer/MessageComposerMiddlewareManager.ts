import { Middleware } from '../../../middleware';
import type { MessageComposerMiddlewareValue } from './types';

export class MessageComposerMiddlewareManager extends Middleware<
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
