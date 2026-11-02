import type { MiddlewareHandlerParams } from '../../../middleware';
import { formatMessage, toUpdatedMessagePayload } from '../../../utils';
import type { CustomMessageData } from '../../../custom_types';
import type { LocalMessage } from '../../../types';
import type { MessageComposer } from '../../messageComposer';
import type {
  MessageComposerMiddlewareState,
  MessageCompositionMiddleware,
} from './types';

const keepEditedMessageCustom = <T extends { custom?: CustomMessageData }>(
  composed: T,
  editedMessage: LocalMessage | undefined,
): T => {
  if (!editedMessage?.custom) return composed;
  return { ...composed, custom: { ...editedMessage.custom, ...composed.custom } };
};

export const createCompositionDataCleanupMiddleware = (
  composer: MessageComposer,
): MessageCompositionMiddleware => ({
  id: 'stream-io/message-composer-middleware/data-cleanup',
  handlers: {
    compose: ({
      state,
      next,
    }: MiddlewareHandlerParams<MessageComposerMiddlewareState>) => {
      const messageType =
        !composer.editedMessage?.type || composer.editedMessage.type === 'error'
          ? 'regular'
          : composer.editedMessage.type;

      const common = {
        type: messageType,
      };

      const editedMessagePayloadToBeSent = composer.editedMessage
        ? toUpdatedMessagePayload(composer.editedMessage)
        : undefined;

      return next({
        ...state,
        localMessage: formatMessage({
          ...composer.editedMessage,
          ...keepEditedMessageCustom(state.localMessage, composer.editedMessage),
          ...common,
        }),
        message: {
          ...editedMessagePayloadToBeSent,
          ...keepEditedMessageCustom(state.message, composer.editedMessage),
          ...common,
        } as typeof state.message,
        sendOptions:
          composer.editedMessage && state.sendOptions?.skip_enrich_url
            ? { skip_enrich_url: state.sendOptions?.skip_enrich_url }
            : state.sendOptions,
      });
    },
  },
});
