import type { MessageComposer } from '../../messageComposer';
import type {
  MessageComposerMiddlewareState,
  MessageCompositionMiddleware,
} from './types';
import type { MiddlewareHandlerParams } from '../../../middleware';
import type { UserResponse } from '../../../types';

export const createUserDataInjectionMiddleware = (
  composer: MessageComposer,
): MessageCompositionMiddleware => ({
  id: 'stream-io/message-composer-middleware/user-data-injection',
  handlers: {
    compose: ({
      state,
      next,
      forward,
    }: MiddlewareHandlerParams<MessageComposerMiddlewareState>) => {
      if (!composer.client.user) {
        return forward();
      }
      // Leave out large properties that never exist on `message.user`.
      const {
        channel_mutes: _channel_mutes,
        devices: _devices,
        mutes: _mutes,
        ...messageUser
      } = composer.client.user;
      return next({
        ...state,
        localMessage: {
          ...state.localMessage,
          // `ClientUser` makes every field but `id` optional, so the cast holds only after connect.
          // `blocked_user_ids` is optional on `OwnUserResponse` (omitted when nothing is blocked)
          // but required on `UserResponse`.
          user: {
            ...messageUser,
            blocked_user_ids: messageUser.blocked_user_ids ?? [],
          } as UserResponse,
          user_id: messageUser.id,
        },
      });
    },
  },
});
