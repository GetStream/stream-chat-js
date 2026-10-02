import { isQueuedForReplay } from './optimistic';
import { queueOrRun } from '../offline-support/queueableOperations';
import { getPendingTaskChannelData } from '../offline-support/util';
import { keepSendOrderWhilePendingUploadsAllowed } from './sendOrdering';
import { settlePendingAttachmentUploads } from './settlePendingAttachmentUploads';
import { toUpdatedMessagePayload } from '../utils';
import { MessageOperations } from './MessageOperations';
import type { Channel } from '../channel';
import type { PendingTaskOf, QueueableType } from '../offline-support/types';
import type { Thread } from '../thread';

/**
 * Builds the `MessageOperations` a message collection owns, shared by `Channel` and `Thread` so the
 * two cannot drift.
 *
 * Everything it needs is derivable from the collection: a `Thread` sends against its parent channel
 * and stamps its own id as `parent_id`, a `Channel` against itself with no stamp.
 */
export const createMessageOperations = (collection: Channel | Thread) => {
  // Read off the paginator rather than discriminating on the collection: it already holds both, and a
  // `Channel | Thread` discriminator would have to be either an `instanceof` (a value import that
  // closes a module-load cycle back to `channel.ts`) or a duck-type that a codegen run could silently
  // invert.
  const paginator = collection.messagePaginator;
  const { channel, parentMessageId } = paginator;

  const queued = <T extends QueueableType>(
    task: PendingTaskOf<T>,
    { queue = true }: { queue?: boolean } = {},
  ) => queueOrRun({ channel, client: channel.getClient(), queue, task });
  // Read on every call, because a channel created from its member list only gets an id once the
  // server has created it.
  const channelTaskData = () => ({ channelId: channel.id, channelType: channel.type });

  return new MessageOperations({
    sequenceRequests: (kind, request) =>
      keepSendOrderWhilePendingUploadsAllowed({
        channelCid: channel.cid,
        composer: collection.messageComposer,
        kind,
        request,
      }),
    settlePendingUploads: (attachments) =>
      settlePendingAttachmentUploads({
        attachments,
        // A reply uploads against the channel the thread belongs to - there is no thread-scoped
        // upload target.
        channelCid: channel.cid,
        client: channel.getClient(),
      }),
    channel,
    // We don't wait for the offline DB here. It only mirrors what's in memory, so if it isn't ready
    // or the write fails, the message operation should carry on as if nothing happened.
    // Replies are stored under their channel, like any other message.
    persist: (message) => {
      channel.getClient().offlineDb?.executeQuerySafely(
        (db) =>
          db.upsertMessageWithChannelGuard({
            message: { ...message, cid: channel.cid },
          }),
        { method: 'messageOperations:persist' },
      );
    },
    purge: (id) => {
      channel
        .getClient()
        .offlineDb?.executeQuerySafely((db) => db.hardDeleteMessage({ id }), {
          method: 'messageOperations:purge',
        });
    },
    isQueued: (messageId, types) =>
      isQueuedForReplay(channel.getClient(), messageId, types),
    ingest: (m) => {
      const store = channel.getClient().messageStore;
      // The paginator is the entry point whenever it can hold the message — it owns interval
      // placement, and its "no longer matches the filter" branch correctly evicts a message that
      // stopped matching. But its filter is `{ cid, parent_id? }`, so an operation aimed at a message
      // this paginator does not accept (most importantly a THREAD PARENT edited or deleted from
      // inside the open thread, which the reply paginator rejects for having no `parent_id`) would
      // otherwise be silently dropped. Falling back to the client-global store reaches the message
      // wherever it is held and fans out to every collection holding it — the same reason
      // `applyReactionLocally` addresses purely by id.
      if (paginator.matchesFilter(m)) {
        paginator.ingestItem(m);
      } else if (store.has(m.id)) {
        store.upsert(m);
      }
      store.flushSubscribers(m.id);
    },
    // Mirrors `ingest`'s routing: a message this paginator does not hold can still be held by the
    // client-global store (a thread parent, a message displayed by another collection), and the
    // policy uses this both for its freshness comparison and to decide whether there is anything to
    // update optimistically at all. Reading only the paginator would make those two disagree.
    get: (id) => paginator.getItem(id) ?? channel.getClient().messageStore.get(id),
    remove: (id) => {
      const client = channel.getClient();
      const parentId =
        paginator.getItem(id)?.parent_id ?? client.messageStore.get(id)?.parent_id;

      channel.messagePaginator.removeItem({ id });
      channel.pinnedMessagesPaginator.removeItem({ id });

      if (parentId) {
        client.threads.get(parentId)?.messagePaginator.removeItem({ id });
      }
    },
    ...(parentMessageId
      ? {
          normalizeOutgoingMessage: (m) => ({ ...m, parent_id: parentMessageId }),
        }
      : {
          // We stop typing before the send and don't wait for it. A send with an upload can take as
          // long as the transfer, and everyone would see us typing the whole time.
          beforeSend: () => {
            if (collection.messageComposer.config.text.publishTypingEvents) {
              channel.stopTyping().catch(() => undefined);
            }
          },
        }),
    // Hands an integrator's handler exactly the documented fields, not whatever else the params carry.
    handlers: () => {
      const {
        deleteMessageRequest,
        retrySendMessageRequest,
        sendMessageRequest,
        updateMessageRequest,
      } = channel.configState.getLatestValue().requestHandlers ?? {};
      return {
        delete:
          deleteMessageRequest &&
          (({ localMessage, options }, defaultRequest) =>
            deleteMessageRequest({ localMessage, options }, defaultRequest)),
        retry:
          retrySendMessageRequest &&
          (({ localMessage, message, options }, defaultRequest) =>
            retrySendMessageRequest({ localMessage, message, options }, defaultRequest)),
        send:
          sendMessageRequest &&
          (({ localMessage, message, options }, defaultRequest) =>
            sendMessageRequest({ localMessage, message, options }, defaultRequest)),
        update:
          updateMessageRequest &&
          (({ localMessage, options }, defaultRequest) =>
            updateMessageRequest({ localMessage, options }, defaultRequest)),
      };
    },
    // The HTTP requests, through the offline queue so they replay on reconnect.
    defaults: {
      delete: async (id, o) => {
        const { message } = await queued({
          messageId: id,
          payload: [{ id, ...o }],
          type: 'delete-message',
        });
        return { message };
      },
      send: async (m, o) => {
        const { message } = await queued(
          {
            ...channelTaskData(),
            messageId: m.id,
            payload: [{ message: m, ...o }],
            type: 'send-message',
          },
          // Without a message id there is nothing to key a queue entry on, so it just runs.
          { queue: !!m.id },
        );
        return { message };
      },
      update: async (m, o) => {
        const request = { id: m.id, message: toUpdatedMessagePayload(m), ...o };
        const { message } = await queued({
          ...getPendingTaskChannelData(m.cid),
          messageId: m.id,
          payload: [request],
          type: 'update-message',
        });
        return { message };
      },
      sendReaction: (...args) =>
        queued({
          ...channelTaskData(),
          messageId: args[0].id,
          payload: args,
          type: 'send-reaction',
        }),
      deleteReaction: (...args) =>
        queued({
          ...channelTaskData(),
          messageId: args[0].id,
          payload: args,
          type: 'delete-reaction',
        }),
    },
  });
};
