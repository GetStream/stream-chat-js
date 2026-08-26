import { isQueuedForReplay } from './optimistic';
import type { Channel } from '../channel';
import type { LocalMessage } from '../types';

/**
 * The offline-DB half of {@link MessageOperationsContext}, built once and shared by `Channel` and
 * `Thread` so the two cannot drift.
 *
 * Every write goes through `executeQuerySafely`, which is a no-op until the DB has initialized and
 * detaches the query rather than awaiting it: local state is the source of truth, so an operation must
 * never fail — or be delayed — because a mirror write did. Same shape `applyReactionLocally` uses.
 *
 * @param params.channel - The channel these writes belong to. A `Thread` passes its parent channel,
 *   since a reply's row is stored against the channel like any other message.
 */
export const createMessageOperationsPersistence = ({
  channel,
}: {
  channel: Channel;
}) => ({
  persist: (message: LocalMessage) => {
    channel
      .getClient()
      .offlineDb?.executeQuerySafely(
        (db) =>
          db.upsertMessageWithChannelGuard({ message: { ...message, cid: channel.cid } }),
        { method: 'messageOperations:persist' },
      );
  },
  purge: (id: string) => {
    channel
      .getClient()
      .offlineDb?.executeQuerySafely((db) => db.hardDeleteMessage({ id }), {
        method: 'messageOperations:purge',
      });
  },
  isQueued: (messageId: string) => isQueuedForReplay(channel.getClient(), messageId),
});
