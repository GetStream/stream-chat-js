import { createMessageOperationsPersistence } from './persistence';
import { localMessageToNewMessagePayload } from '../utils';
import { MessageOperations } from './MessageOperations';
import type { Channel } from '../channel';
import type { MessagePaginator } from '../pagination/paginators';

/**
 * Builds the `MessageOperations` a message collection owns.
 *
 * `Channel` and `Thread` used to write this out separately, ~95 lines each that differed in four
 * tokens (`this.` versus `this.channel.`) plus the `parent_id` stamp. They are one definition here,
 * for the same reason {@link createMessageOperationsPersistence} is: two copies of this plumbing is
 * how the two silently drift, and a drift here is a correctness bug in optimistic send/edit/delete.
 *
 * A shared base class is not available — `Channel` extends the generated `ChannelApi` and `Thread`
 * extends `WithSubscriptions`, so single inheritance is spent on both sides. Composition into an
 * owned collaborator is what the rest of the SDK does (see `ConfigController`), and this follows it.
 *
 * @param params.channel - The channel the requests and offline-DB rows belong to. A `Thread` passes
 *   its parent channel: a reply is sent, persisted and reacted to against the channel like any other
 *   message.
 * @param params.paginator - The collection's own message list — `channel.messagePaginator` for a
 *   channel, `thread.messagePaginator` for a thread. This is the list an operation reads and writes
 *   first; the client-global message store is the fallback.
 * @param params.parentMessageId - Set by a `Thread`. Stamps `parent_id` onto every outgoing message,
 *   which is what makes a composed message a reply.
 */
export const createMessageOperations = ({
  channel,
  paginator,
  parentMessageId,
}: {
  channel: Channel;
  paginator: MessagePaginator;
  parentMessageId?: string;
}) =>
  new MessageOperations({
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
    // One fan-out covering every collection that can hold the message, rather than the mirror-image
    // pair the two owners used to write in opposite directions. Each call is a no-op when that list
    // does not hold the id, so naming all of them is cheaper than working out which one applies:
    //
    // - the owning list first (for a channel this *is* `channel.messagePaginator`, so the next call
    //   collapses into it);
    // - the channel's own list and its pinned list, because a reply with `show_in_channel` is held
    //   there too and removing it from the reply list alone would leave a ghost until the
    //   `message.deleted` event arrives;
    // - the reply list of whichever thread claims the message as its parent.
    remove: (id) => {
      const client = channel.getClient();
      const parentId =
        paginator.getItem(id)?.parent_id ?? client.messageStore.get(id)?.parent_id;

      paginator.removeItem({ id });
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
