import type { MiddlewareHandlerParams } from '../../../middleware';
import { formatMessage, toUpdatedMessagePayload } from '../../../utils';
import type { MessageComposer } from '../../messageComposer';
import type { MessageComposerMiddlewareValueState } from './types';

export const createCompositionDataCleanupMiddleware = (composer: MessageComposer) => ({
  id: 'stream-io/message-composer-middleware/data-cleanup',
  compose: ({
    state,
    next,
  }: MiddlewareHandlerParams<MessageComposerMiddlewareValueState>) => {
    const common = {
      type: composer.editedMessage?.type ?? 'regular',
    };

    const editedMessagePayloadToBeSent = composer.editedMessage
      ? toUpdatedMessagePayload(composer.editedMessage)
      : undefined;

    return next({
      ...state,
      localMessage: formatMessage({
        ...composer.editedMessage,
        ...state.localMessage,
        ...common,
        user: composer.client.user,
      }),
      message: {
        ...editedMessagePayloadToBeSent,
        ...state.message,
        ...common,
      },
      sendOptions:
        composer.editedMessage && state.sendOptions?.skip_enrich_url
          ? { skip_enrich_url: state.sendOptions?.skip_enrich_url }
          : state.sendOptions,
    });
  },
});
