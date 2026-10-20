import { computeOwnReactions, formatMessage } from '../utils';
import type { StreamChat } from '../client';
import type { LocalMessage, MessageResponse, ReactionResponse } from '../types';

/**
 * Applies a `reaction.new` / `reaction.updated` / `reaction.deleted` event to the canonical copy of the
 * message, by id. The event's counts are taken as they are; `own_reactions` is derived from what the
 * store holds, because the event omits the current user's reactions or reports another user's.
 *
 * One write reaches every collection holding the message (main list, pinned list, thread replies, a
 * thread's parent). No-op when nothing holds the message.
 */
export const reflectReactionEvent = (
  client: StreamChat,
  {
    enforceUnique = false,
    message,
    reaction,
    removed = false,
  }: {
    message: MessageResponse | LocalMessage;
    reaction: ReactionResponse;
    enforceUnique?: boolean;
    removed?: boolean;
  },
): void => {
  const store = client.messageStore;
  if (!store.has(message.id)) return;

  const formatted = formatMessage(message);
  const existing = store.get(message.id);

  store.upsert({
    ...formatted,
    own_reactions: computeOwnReactions({
      current: existing?.own_reactions ?? formatted.own_reactions ?? [],
      enforceUnique,
      reaction,
      removed,
      userId: client.userId,
    }),
  });
};
