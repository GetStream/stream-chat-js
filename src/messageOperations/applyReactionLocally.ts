import type { StreamChat } from '../client';
import type { ReactionResponse, UserResponse } from '../types';
import { nowNs } from '../utils/time';
import {
  computeOwnReactions,
  messageWithReactionAdded,
  messageWithReactionRemoved,
} from '../utils';

/**
 * Applies a reaction to the canonical copy of a message in `client.messageStore`, by ID, and mirrors it
 * to the offline DB (fire-and-forget). The store notifies every collection holding the message. Returns
 * an `undo()` reversing both on the current state, or `undefined` when the user is not connected or the
 * message is not in the store.
 */
export const applyReactionLocally = (
  client: StreamChat,
  {
    enforceUnique = false,
    messageId,
    reaction,
    removed = false,
  }: {
    messageId: string;
    /** A response-shaped partial the caller holds, such as a captured reaction re-applied by `undo()`. */
    reaction: Partial<ReactionResponse> & Pick<ReactionResponse, 'type'>;
    enforceUnique?: boolean;
    removed?: boolean;
  },
): (() => void) | undefined => {
  const store = client.messageStore;
  const user = client.user;
  const existing = store.get(messageId);
  if (!user || !existing) return;

  const now = nowNs();
  // Spread first so the derived fields below win; `??` keeps what the caller carried (e.g. the
  // original `created_at` on undo).
  const reactionResponse: ReactionResponse = {
    ...reaction,
    created_at: reaction.created_at ?? now,
    custom: reaction.custom ?? {},
    message_id: messageId,
    score: reaction.score ?? 1,
    type: reaction.type,
    updated_at: reaction.updated_at ?? now,
    user: user as UserResponse,
    user_id: user.id,
  };

  // What this op removes, so undo() can restore it: the deleted reaction, or those an enforce_unique
  // add displaces.
  const removedReactions: ReactionResponse[] = removed
    ? (existing.own_reactions?.filter((r) => r.type === reactionResponse.type) ?? [])
    : enforceUnique
      ? (existing.own_reactions ?? [])
      : [];

  const withCounts = removed
    ? messageWithReactionRemoved(existing, reactionResponse)
    : messageWithReactionAdded(existing, reactionResponse, enforceUnique);
  const own_reactions = computeOwnReactions({
    current: existing.own_reactions ?? [],
    enforceUnique,
    reaction: reactionResponse,
    removed,
    userId: user.id,
  });
  store.upsert({ ...withCounts, own_reactions });
  store.flushSubscribers(messageId);

  const persisted = store.get(messageId);
  if (persisted) {
    client.offlineDb?.executeQuerySafely(
      (db) =>
        removed
          ? db.deleteReaction({ message: persisted, reaction: reactionResponse })
          : enforceUnique
            ? db.updateReaction({ message: persisted, reaction: reactionResponse })
            : db.insertReaction({ message: persisted, reaction: reactionResponse }),
      { method: 'applyReactionLocally' },
    );
  }

  return () => {
    if (!removed) {
      applyReactionLocally(client, {
        messageId,
        reaction: reactionResponse,
        removed: true,
      });
    }
    for (const removedReaction of removedReactions) {
      applyReactionLocally(client, {
        messageId,
        reaction: removedReaction,
        removed: false,
      });
    }
  };
};
