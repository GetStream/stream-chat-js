import type {
  MessageComposerMiddlewareState,
  MessageCompositionMiddleware,
  MessageDraftComposerMiddlewareValueState,
  MessageDraftCompositionMiddleware,
} from './types';
import type { MessageComposer } from '../../messageComposer';
import type { LocalMessage, LocalMessageBase } from '../../../types';
import type { MiddlewareHandlerParams } from '../../../middleware';

export const createMessageComposerStateCompositionMiddleware = (
  composer: MessageComposer,
): MessageCompositionMiddleware => ({
  id: 'stream-io/message-composer-middleware/own-state',
  handlers: {
    compose: ({
      state,
      next,
    }: MiddlewareHandlerParams<MessageComposerMiddlewareState>) => {
      const payload: Pick<LocalMessage, 'poll_id' | 'quoted_message_id'> = {};
      if (composer.quotedMessage) {
        payload.quoted_message_id = composer.quotedMessage.id;
      }
      if (composer.pollId) {
        payload.poll_id = composer.pollId;
      }

      return next({
        ...state,
        localMessage: {
          ...state.localMessage,
          ...payload,
          quoted_message: (composer.quotedMessage as LocalMessageBase) ?? undefined,
        },
        message: {
          ...state.message,
          ...payload,
        },
      });
    },
  },
});

export const createDraftMessageComposerStateCompositionMiddleware = (
  composer: MessageComposer,
): MessageDraftCompositionMiddleware => ({
  id: 'stream-io/message-composer-middleware/draft-own-state',
  handlers: {
    compose: ({
      state,
      next,
    }: MiddlewareHandlerParams<MessageDraftComposerMiddlewareValueState>) => {
      const payload: Pick<LocalMessage, 'poll_id' | 'quoted_message_id'> = {};
      if (composer.quotedMessage) {
        payload.quoted_message_id = composer.quotedMessage.id;
      }
      if (composer.pollId) {
        payload.poll_id = composer.pollId;
      }

      return next({
        ...state,
        draft: {
          ...state.draft,
          ...payload,
        },
      });
    },
  },
});
