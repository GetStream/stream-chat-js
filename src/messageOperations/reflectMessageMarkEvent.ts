import type { StreamChat } from '../client';
import type { MessageMarkResponse } from '../types';

/**
 * Applies a `message.mark_added` event to the canonical copy of the message, by ID, as an
 * idempotent set-add keyed (message_id, user_id, type). The mark joins `mark_groups` on the
 * current user's own message, or `own_marks` when the current user marked another user's message.
 * No-op when nothing holds the message or the client has no user.
 */
export const reflectMessageMarkEvent = (
  client: StreamChat,
  mark: MessageMarkResponse,
): void => {
  const userId = client.userId;
  if (!userId) return;

  const store = client.messageStore;
  const existing = store.get(mark.message_id);
  if (!existing) return;
  if (existing.user?.id === userId) {
    const group = existing.mark_groups?.[mark.type] ?? { count: 0, latest_by: [] };
    if (group.latest_by.some((marker) => marker.user_id === mark.user_id)) return;
    store.upsert({
      ...existing,
      mark_groups: {
        ...existing.mark_groups,
        [mark.type]: {
          count: group.count + 1,
          latest_by: [
            { created_at: mark.created_at, user_id: mark.user_id },
            ...group.latest_by,
          ],
        },
      },
    });
    return;
  }

  if (mark.user_id === userId) {
    const ownMarks = existing.own_marks ?? [];
    if (ownMarks.some((own) => own.type === mark.type)) return;
    store.upsert({
      ...existing,
      own_marks: [...ownMarks, { created_at: mark.created_at, type: mark.type }],
    });
  }
};
