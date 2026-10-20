import { isQueuedForReplay, queueOrRun } from '../offline-support/queueableOperations';
import { getPendingTaskChannelData } from '../offline-support/util';
import { keepSendOrderWhilePendingUploadsAllowed } from './sendOrdering';
import { settlePendingAttachmentUploads } from './settlePendingAttachmentUploads';
import { toUpdatedMessagePayload } from '../utils';
import { MessageOperations } from './MessageOperations';
import type { Channel } from '../channel';
import type { PendingTaskOf, QueueableType } from '../offline-support/types';
import type { Thread } from '../thread';

/**
 * Builds the `MessageOperations` a message collection owns, shared by `Channel` and `Thread`. A
 * `Thread` sends against its parent channel and stamps its own id as `parent_id`; a `Channel` sends
 * against itself.
 */
export const createMessageOperations = (collection: Channel | Thread) => {
  // Read off the paginator, which holds both: an `instanceof` check would import `channel.ts` back.
  const paginator = collection.messagePaginator;
  const { channel, parentMessageId } = paginator;

  const queueOrRunTask = <T extends QueueableType>(
    task: PendingTaskOf<T>,
    { queue = true }: { queue?: boolean } = {},
  ) => queueOrRun({ channel, client: channel.getClient(), queue, task });
  // Read on every call: a channel created from its member list only gets an id once the server has
  // created it.
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
        // A reply uploads against its channel: there is no thread-scoped upload target.
        channelCid: channel.cid,
        client: channel.getClient(),
      }),
    channel,
    // Not awaited: the offline DB only mirrors memory, so a slow or failed write must not affect the
    // operation. Replies are stored under their channel.
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
      // The paginator ingests what matches its filter (`{ cid, parent_id? }`). Otherwise fall back to
      // the client-global store, so an operation on a message the paginator rejects (a thread parent
      // edited from inside its thread) is not dropped.
      if (paginator.matchesFilter(m)) {
        paginator.ingestItem(m);
      } else if (store.has(m.id)) {
        store.upsert(m);
      }
      store.flushSubscribers(m.id);
    },
    // Mirrors `ingest`: a message the paginator does not hold may still be in the client-global store
    // (a thread parent).
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
      ? { normalizeOutgoingMessage: (m) => ({ ...m, parent_id: parentMessageId }) }
      : {}),
    // Typing stops before the send, without waiting for it: a send with an upload lasts as long as the
    // transfer. A thread reply stops typing in its thread.
    beforeSend: () => {
      if (collection.messageComposer.config.text.publishTypingEvents) {
        channel.stopTyping(parentMessageId).catch(() => undefined);
      }
    },
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
    defaults: {
      delete: async (id, o) => {
        const { message } = await queueOrRunTask({
          messageId: id,
          payload: [{ id }, o],
          type: 'delete-message',
        });
        return { message };
      },
      send: async (m, o) => {
        const { message } = await queueOrRunTask(
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
        const { message } = await queueOrRunTask({
          ...getPendingTaskChannelData(m.cid),
          messageId: m.id,
          payload: [{ id: m.id }, { message: toUpdatedMessagePayload(m), ...o }],
          type: 'update-message',
        });
        return { message };
      },
      sendReaction: (...args) =>
        queueOrRunTask({
          ...channelTaskData(),
          messageId: args[0].id,
          payload: args,
          type: 'send-reaction',
        }),
      deleteReaction: (...args) =>
        queueOrRunTask({
          ...channelTaskData(),
          messageId: args[0].id,
          payload: args,
          type: 'delete-reaction',
        }),
    },
  });
};
