import type { MessageComposer } from '../../messageComposer';
import type {
  MessageComposerMiddlewareState,
  MessageCompositionMiddleware,
} from './types';
import type { MiddlewareHandlerParams } from '../../../middleware';
import type { OwnUserResponse } from '../../../types';

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
      // The reason why we need to explicitly cast is because OwnUserResponse only takes
      // precedence after we connectUser the first time and we get the connection health
      // check event. Due to how liberal the type of client.user is, we have to do it this
      // way to maintain type safety.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { channel_mutes, devices, mutes, ...messageUser } = composer.client
        .user as OwnUserResponse;
      return next({
        ...state,
        localMessage: {
          ...state.localMessage,
          user: messageUser,
          user_id: messageUser.id,
        },
      });
    },
  },
});
