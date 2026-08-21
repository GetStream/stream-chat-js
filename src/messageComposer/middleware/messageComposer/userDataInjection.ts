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
      // Exclude the following properties from client.user as they can be large objects
      // that provide no value for localMessage (and will never exist within message.user).
      // This way we make sure that our localMessage is enriched with data as close as
      // possible to the actual user.
      // The cast below is needed because `client.user` is `ClientUser`, which makes every
      // field but `id` optional — it is only fully populated once `connectUser` has run and
      // the connection hello event has arrived.

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
          // `blocked_user_ids` is optional on `OwnUserResponse` — the connect payload
          // omits it when nothing is blocked — but required on `UserResponse`. Supply the
          // empty case rather than assert it; `[]` is what the server sends for other users.
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
