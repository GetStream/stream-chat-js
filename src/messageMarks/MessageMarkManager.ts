import type { StreamChat } from '../client';
import type { MessageMarkPaginator } from '../pagination/paginators/MessageMarkPaginator';
import { getMessageCreatedAtTimestamp } from '../pagination/paginators/MessageIntervalPaginator';
import type { MessageMarkWithUserResponse, TimestampNS } from '../types';
import { WithSubscriptions } from '../utils/WithSubscriptions';

type Entry = {
  /** The channel of the message, to drop its lists when the channel goes away. */
  cid?: string;
  /** When the message was created, to tell whether a truncation removed it. */
  createdAt: TimestampNS | null;
  paginator: MessageMarkPaginator;
};

/**
 * Keeps the registered {@link MessageMarkPaginator}s current: `message.mark_added` adds the mark to
 * the lists of its message, and a reconnect flags them stale, so each reloads when it is next
 * active. Lists are registered by their `id` and stay until removed. Subscribes when the first list
 * is registered.
 */
export class MessageMarkManager extends WithSubscriptions {
  private client: StreamChat;
  private entries = new Map<string, Entry>();

  constructor({ client }: { client: StreamChat }) {
    super();
    this.client = client;
  }

  /** The registered lists. */
  get paginators(): MessageMarkPaginator[] {
    return [...this.entries.values()].map(({ paginator }) => paginator);
  }

  getPaginatorById(id: string): MessageMarkPaginator | undefined {
    return this.entries.get(id)?.paginator;
  }

  /**
   * Registers a list, so it follows `message.mark_added` and reconnects. One already registered
   * with the same ID is replaced. Display it between `paginator.activate()` and its release, so a
   * stale list reloads while it is shown.
   *
   * @returns The registered paginator.
   */
  registerPaginator({
    paginator,
  }: {
    paginator: MessageMarkPaginator;
  }): MessageMarkPaginator {
    const message = this.client.messageStore.get(paginator.messageId);
    this.entries.set(paginator.id, {
      cid: message?.cid,
      createdAt: getMessageCreatedAtTimestamp(message),
      paginator,
    });
    this.registerSubscriptions();
    return paginator;
  }

  /**
   * Unregisters a list: it stops following events, and its loaded marks stay.
   *
   * @param paginatorOrId - The paginator to remove, or its ID.
   * @returns The removed paginator, or `undefined` when it was not registered.
   */
  removePaginator(
    paginatorOrId: MessageMarkPaginator | string,
  ): MessageMarkPaginator | undefined {
    const id = typeof paginatorOrId === 'string' ? paginatorOrId : paginatorOrId.id;
    const removed = this.getPaginatorById(id);
    if (removed) this.entries.delete(id);
    return removed;
  }

  /**
   * Empties and unregisters every list. Called by `client.disconnectUser()`: the marks belong to
   * that user.
   */
  clear = () => {
    this.unregisterSubscriptions();
    this.dropPaginator(() => true);
  };

  public registerSubscriptions = () => {
    if (this.hasSubscriptions) return;
    this.addUnsubscribeFunction(
      this.client.on('message.mark_added', (event) => {
        // The marker comes on the event, next to the mark. A mark without one waits for the next
        // load of the list.
        if (event.mark && event.user) this.addMark({ ...event.mark, user: event.user });
      }).unsubscribe,
    );
    this.addUnsubscribeFunction(
      this.client.on('connection.recovered', () => {
        this.entries.forEach(({ paginator }) => paginator.markStale());
      }).unsubscribe,
    );
    // A hard delete removes the message's marks with it.
    this.addUnsubscribeFunction(
      this.client.on('message.deleted', (event) => {
        if (event.hard_delete && event.message?.id) {
          this.dropPaginator(
            ({ paginator }) => paginator.messageId === event.message?.id,
          );
        }
      }).unsubscribe,
    );
    (['channel.deleted', 'notification.removed_from_channel'] as const).forEach(
      (eventType) =>
        this.addUnsubscribeFunction(
          this.client.on(eventType, (event) => {
            if (event.cid) this.dropPaginator((entry) => entry.cid === event.cid);
          }).unsubscribe,
        ),
    );
    // A truncation with a cutoff keeps the messages created after it.
    this.addUnsubscribeFunction(
      this.client.on('channel.truncated', (event) => {
        if (!event.cid) return;
        const truncatedAt = event.channel?.truncated_at;
        this.dropPaginator(
          ({ cid, createdAt }) =>
            cid === event.cid &&
            (truncatedAt == null || createdAt == null || createdAt < truncatedAt),
        );
      }).unsubscribe,
    );
  };

  private addMark(mark: MessageMarkWithUserResponse) {
    this.entries.forEach(({ paginator }) => {
      if (paginator.messageId === mark.message_id) paginator.ingestItem(mark);
    });
  }

  // Unregisters the lists whose marks are gone. A list still shown empties instead of showing them.
  private dropPaginator(shouldDrop: (entry: Entry) => boolean) {
    this.entries.forEach((entry, id) => {
      if (!shouldDrop(entry)) return;
      entry.paginator.resetState();
      this.entries.delete(id);
    });
  }
}
