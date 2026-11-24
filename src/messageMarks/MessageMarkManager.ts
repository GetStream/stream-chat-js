import type { StreamChat } from '../client';
import { MessageMarkPaginator } from '../pagination/paginators/MessageMarkPaginator';
import type { MessageMarkPaginatorOptions } from '../pagination/paginators/MessageMarkPaginator';
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

// Sorts object keys, so equal filters give equal keys whatever their key order.
const stableStringify = (value: unknown): string =>
  JSON.stringify(value, (_key, nested: unknown) =>
    nested && typeof nested === 'object' && !Array.isArray(nested)
      ? Object.fromEntries(
          Object.entries(nested).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
        )
      : nested,
  );

// What a list holds: its message and its whole filter. `paginatorOptions` only shape how it loads.
const getKey = ({ messageId, filter }: MessageMarkPaginatorOptions) =>
  `${messageId}:${stableStringify(filter ?? {})}`;

/**
 * Keeps one {@link MessageMarkPaginator} per message and filter for the session and keeps them
 * current: `message.mark_added` adds the mark to the lists of its message, and a reconnect flags
 * them stale, so each reloads when it is next active. Subscribes when the first list is created.
 */
export class MessageMarkManager extends WithSubscriptions {
  private client: StreamChat;
  private entries = new Map<string, Entry>();

  constructor({ client }: { client: StreamChat }) {
    super();
    this.client = client;
  }

  /**
   * The list of the message's marks that `filter` matches, created on first use and reused after,
   * with the pages it has loaded. `paginatorOptions` apply when the list is created, and a later
   * call gets the existing list whatever it passes. Display it between `paginator.activate()` and
   * its release, so a stale list reloads while it is shown.
   */
  getOrCreatePaginator = (params: MessageMarkPaginatorOptions): MessageMarkPaginator => {
    const key = getKey(params);
    const existing = this.entries.get(key);
    if (existing) return existing.paginator;

    const paginator = new MessageMarkPaginator(this.client, params);
    const message = this.client.messageStore.get(params.messageId);
    this.entries.set(key, {
      cid: message?.cid,
      createdAt: getMessageCreatedAtTimestamp(message),
      paginator,
    });
    this.registerSubscriptions();
    return paginator;
  };

  /** Drops every list. Called by `client.disconnectUser()`: the marks belong to that user. */
  clear = () => {
    this.unregisterSubscriptions();
    this.entries.clear();
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
          this.drop(({ paginator }) => paginator.messageId === event.message?.id);
        }
      }).unsubscribe,
    );
    (['channel.deleted', 'notification.removed_from_channel'] as const).forEach(
      (eventType) =>
        this.addUnsubscribeFunction(
          this.client.on(eventType, (event) => {
            if (event.cid) this.drop((entry) => entry.cid === event.cid);
          }).unsubscribe,
        ),
    );
    // A truncation with a cutoff keeps the messages created after it.
    this.addUnsubscribeFunction(
      this.client.on('channel.truncated', (event) => {
        if (!event.cid) return;
        const truncatedAt = event.channel?.truncated_at;
        this.drop(
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

  private drop(predicate: (entry: Entry) => boolean) {
    this.entries.forEach((entry, key) => {
      if (!predicate(entry)) return;
      // A list still shown empties instead of showing marks that no longer exist.
      entry.paginator.resetState();
      this.entries.delete(key);
    });
  }
}
