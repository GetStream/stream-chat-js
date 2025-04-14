import type { MiddlewareHandlerParams } from '../../../middleware';
import { formatMessage, toUpdatedMessagePayload } from '../../../utils';
import type { MessageComposer } from '../../messageComposer';
import type { MessageComposerMiddlewareValueState } from './types';

export const createCompositionDataCleanupMiddleware = (composer: MessageComposer) => ({
  id: 'stream-io/message-composer-middleware/data-cleanup',
  compose: ({
    input,
    nextHandler,
  }: MiddlewareHandlerParams<MessageComposerMiddlewareValueState>) => {
    const common = {
      type: composer.editedMessage?.type ?? 'regular',
    };

    const editedMessagePayloadToBeSent = composer.editedMessage
      ? toUpdatedMessagePayload(composer.editedMessage)
      : undefined;

    return nextHandler({
      ...input,
      state: {
        ...input.state,
        localMessage: formatMessage({
          ...composer.editedMessage,
          ...input.state.localMessage,
          ...common,
          user: composer.client.user,
        }),
        message: {
          ...editedMessagePayloadToBeSent,
          ...input.state.message,
          ...common,
        },
        sendOptions:
          composer.editedMessage && input.state.sendOptions?.skip_enrich_url
            ? { skip_enrich_url: input.state.sendOptions?.skip_enrich_url }
            : input.state.sendOptions,
      },
    });
  },
});
