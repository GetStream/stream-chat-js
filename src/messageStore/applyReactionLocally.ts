import type { StreamChat } from '../client';
import type { Reaction, ReactionResponse } from '../types';
import {
  computeOwnReactions,
  messageWithReactionAdded,
  messageWithReactionRemoved,
} from '../utils';

/**
 * Applies a reaction to the single canonical copy of a message in the client-global
 * {@link MessageStore}, addressed purely by id — NOT through any paginator's membership. It reads the
 * current message POJO (`store.get`), produces a new POJO with the reaction folded into its
 * `reaction_groups` / `latest_reactions` (shared count helpers) and `own_reactions`
 * ({@link computeOwnReactions}), and writes it back (`store.upsert`). The store then notifies every
 * collection currently holding that id — the main-list / thread-reply paginators, a thread's
 * subscribed parent, any future consumer — and each re-projects. The message stays a plain object;
 * the store's per-id registry is the reactivity.
 *
 * Because it is keyed by id rather than by a paginator's `getItem`, it reaches a message held by ANY
 * collection, including the thread parent that lives in no paginator — with no per-home wiring.
 *
 * Writes memory (synchronous) + the offline DB (fire-and-forget), and returns an `undo()` reversing
 * both on the current state (inverse deltas, concurrency-safe), or `undefined` when the user isn't
 * connected or the message isn't in the store.
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
    reaction: Reaction;
    enforceUnique?: boolean;
    removed?: boolean;
  },
): (() => void) | undefined => {
  const store = client.messageStore;
  const user = client.user;
  const existing = store.get(messageId);
  if (!user || !existing) return;

  const now = new Date().toISOString();
  const reactionResponse: ReactionResponse = {
    created_at: now,
    message_id: messageId,
    updated_at: now,
    user,
    user_id: user.id,
    ...reaction,
  };

  // Capture what this op removes so undo() can restore it faithfully (reaction spread last): the
  // deleted reaction for a removal, or the user's displaced reactions for an enforce_unique add.
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
