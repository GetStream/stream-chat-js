import { isQueuedForReplay } from './optimistic';
import type { StreamChat } from '../client';
import type { LocalMessage } from '../types';

/**
 * The offline-DB half of {@link MessageOperationsContext}, built once and shared by `Channel` and
 * `Thread` so the two cannot drift.
 *
 * Every write goes through `executeQuerySafely`, which is a no-op until the DB has initialized and
 * detaches the query rather than awaiting it: local state is the source of truth, so an operation must
 * never fail — or be delayed — because a mirror write did. Same shape `applyReactionLocally` uses.
 *
 * `getCid` is read lazily rather than captured: these hooks are built in the `Channel` constructor,
 * and a channel created before its server data arrives gets its `cid` later.
 */
export const createMessageOperationsPersistence = ({
  getCid,
  getClient,
}: {
  getCid: () => string;
  getClient: () => StreamChat;
}) => ({
  persist: (message: LocalMessage) => {
    const cid = getCid();
    getClient().offlineDb?.executeQuerySafely(
      (db) => db.upsertMessageWithChannelGuard({ message: { ...message, cid } }),
      { method: 'messageOperations:persist' },
    );
  },
  purge: (id: string) => {
    getClient().offlineDb?.executeQuerySafely((db) => db.hardDeleteMessage({ id }), {
      method: 'messageOperations:purge',
    });
  },
  isQueued: (messageId: string) => isQueuedForReplay(getClient(), messageId),
});
