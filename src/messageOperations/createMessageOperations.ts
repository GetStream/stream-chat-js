import { createMessageOperationsPersistence } from './persistence';
import { localMessageToNewMessagePayload } from '../utils';
import { MessageOperations } from './MessageOperations';
import type { Channel } from '../channel';
import type { Thread } from '../thread';

/**
 * Builds the `MessageOperations` a message collection owns, shared by `Channel` and `Thread` so the
 * two cannot drift — the same reason {@link createMessageOperationsPersistence} exists.
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

  return new MessageOperations({
    ...createMessageOperationsPersistence({ channel }),
    channel,
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
        client.threads.threadsById[parentId]?.messagePaginator.removeItem({ id });
      }
    },
    ...(parentMessageId
      ? {
          normalizeOutgoingMessage: (m) => ({ ...m, parent_id: parentMessageId }),
        }
      : {}),
    handlers: () => {
      const { requestHandlers } = channel.configState.getLatestValue();
      const deleteMessageRequest = requestHandlers?.deleteMessageRequest;
      const sendMessageRequest = requestHandlers?.sendMessageRequest;
      const retrySendMessageRequest = requestHandlers?.retrySendMessageRequest;
      const updateMessageRequest = requestHandlers?.updateMessageRequest;
      return {
        delete: deleteMessageRequest
          ? (p) =>
              deleteMessageRequest({
                localMessage: p.localMessage,
                options: p.options,
              })
          : undefined,
        send: sendMessageRequest
          ? (p) =>
              sendMessageRequest({
                localMessage: p.localMessage,
                message: p.message,
                options: p.options,
              })
          : undefined,
        retry: retrySendMessageRequest
          ? (p) =>
              retrySendMessageRequest({
                localMessage: p.localMessage,
                message: p.message,
                options: p.options,
              })
          : undefined,
        update: updateMessageRequest
          ? (p) =>
              updateMessageRequest({
                localMessage: p.localMessage,
                options: p.options,
              })
          : undefined,
      };
    },
    defaults: {
      delete: async (id, o) => {
        const result = await channel.getClient().deleteMessage({ id, ...o });
        return { message: result.message };
      },
      send: async (m, o) => {
        const result = await channel.sendMessage({ message: m, ...o });
        return { message: result.message };
      },
      update: async (m, o) => {
        const result = await channel.getClient().updateMessage({
          id: m.id,
          message: localMessageToNewMessagePayload(m),
          ...o,
        });
        return { message: result.message };
      },
    },
  });
};
