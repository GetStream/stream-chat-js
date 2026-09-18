import { computeOwnReactions, formatMessage } from '../utils';
import type { StreamChat } from '../client';
import type { LocalMessage, MessageResponse, ReactionResponse } from '../types';

/**
 * Applies a `reaction.new` / `reaction.updated` / `reaction.deleted` event to the canonical copy of
 * the message, addressed by id — the server-event counterpart of `applyReactionLocally`.
 *
 * The event carries the server's updated counts, so those are taken as they are; only `own_reactions`
 * is derived, because the event either omits the current user's reactions or reports another user's.
 * The base for that derivation is whatever the store already holds, so a reaction by someone else
 * cannot wipe yours.
 *
 * One write reaches every collection holding the message — main list, pinned list, thread replies,
 * and a thread's subscribed parent, which lives in no paginator at all. Calling it once per
 * collection instead is what produced 9 publishes for a single reaction: each call minted a fresh
 * object, so the store's reference bail never fired and every write re-projected the others.
 *
 * No-op when nothing holds the message — there is no view to update.
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
