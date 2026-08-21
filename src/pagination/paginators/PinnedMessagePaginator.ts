import type {
  BasePaginatorConfig,
  PaginatorCursor,
  PaginatorOptions,
} from './BasePaginator';
import {
  MessageIntervalPaginator,
  type MessageQueryShape,
} from './MessageIntervalPaginator';
import type {
  LocalMessage,
  PinnedMessagePaginationOptions,
  SortParamRequest,
} from '../../types';
import type { Channel } from '../../channel';
import { formatMessage, generateUUIDv4 } from '../../utils';
import { makeComparator } from '../sortCompiler';
import { resolveDotPathValue } from '../utility.normalization';
import type { ItemIndexApi } from '../ItemIndex';

export type PinnedMessagePaginatorFilter = {
  cid: string;
  pinned: boolean;
};

export type PinnedMessagePaginatorOptions = {
  channel: Channel;
  id?: string;
  itemIndex?: ItemIndexApi<LocalMessage>;
  paginatorOptions?: PaginatorOptions<LocalMessage, MessageQueryShape>;
};

const PINNED_AT_SORT: SortParamRequest[] = [{ field: 'pinned_at', direction: 1 }];

/**
 * Pinned-message list paginator.
 *
 * Extends the unread-free {@link MessageIntervalPaginator} base — pinned messages are a subset of
 * the channel and MUST NOT participate in read/unread or delivery-receipt tracking (that belongs to
 * the channel and thread message timelines). By extending the base rather than {@link MessagePaginator}
 * it simply never gets the unread surface.
 *
 * Differences from the main list:
 * - fetches from the `/pinned_messages` endpoint (`channel.getPinnedMessages`) rather than
 *   `channel.query({ messages })`;
 * - includes only pinned, non-shadowed messages (`shouldIncludeMessageInInterval`), and filters on
 *   `{ cid, pinned: true }` so `ingestItem` auto-adds on pin and auto-removes on unpin;
 * - orders by `pinned_at` ascending (oldest-pinned first), matching the legacy
 *   `channel.state.pinnedMessages` order.
 *
 * Navigation (`jumpToMessage` / `jumpToTheLatestMessage`) is inherited and meaningful — the endpoint
 * supports `id_around` — but no unread-coupled navigation exists.
 */
export class PinnedMessagePaginator extends MessageIntervalPaginator {
  constructor({
    channel,
    id,
    itemIndex,
    paginatorOptions,
  }: PinnedMessagePaginatorOptions) {
    super({
      channel,
      id: id ?? `pinned-message-paginator-${generateUUIDv4()}`,
      // No explicit index: inherit the store-backed item index from MessageIntervalPaginator so a
      // pinned message shares the single canonical copy with the main list / thread and reflects
      // reactions & edits applied elsewhere. A caller may still inject a custom `itemIndex`.
      itemIndex,
      paginatorOptions,
    });

    this.installPinnedMessageBehaviour();
  }

  /**
   * Memoized for the reason {@link MessageIntervalPaginator}'s overlay is: the base derivation folds
   * this in and skips the publish when nothing moved, which needs stable references. Both close over
   * `this` and over a fixed `pinned_at` sort, so there is nothing to rebuild.
   */
  private pinnedBehaviour?: Partial<BasePaginatorConfig<LocalMessage, MessageQueryShape>>;

  private buildPinnedBehaviour(): Partial<
    BasePaginatorConfig<LocalMessage, MessageQueryShape>
  > {
    if (!this.pinnedBehaviour) {
      this.pinnedBehaviour = {
        itemOrderComparator: makeComparator<LocalMessage>({
          sort: PINNED_AT_SORT,
          resolvePathValue: resolveDotPathValue,
          tiebreaker: this.pinnedTiebreaker,
        }),

        // Fetch from the pinned-messages endpoint. The base `query` feeds the resolved query shape
        // (including `id_around` jumps) here as `options`; we return both cursors and let the base gate
        // them by direction.
        doRequest: async (
          options: MessageQueryShape,
        ): Promise<{ cursor?: PaginatorCursor; items: LocalMessage[] }> => {
          const { messages } = await this.channel.getPinnedMessages({
            ...(options as PinnedMessagePaginationOptions),
            sort: PINNED_AT_SORT,
          });
          const items = messages.map(formatMessage);
          return { cursor: this.getCursorFromQueryResults({ items }), items };
        },
      };
    }
    return this.pinnedBehaviour;
  }

  private pinnedTiebreaker = (l: LocalMessage, r: LocalMessage) => {
    const leftId = this.getItemId(l);
    const rightId = this.getItemId(r);
    return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
  };

  /**
   * The ordering and request behaviour that makes this a *pinned*-message paginator, contributed to the
   * base derivation so a re-derivation cannot drop it and does not need a second write to restore it.
   * Spread over the interval overlay, so this class's `pinned_at` comparator wins.
   */
  protected override getBehaviourOverrides(): Partial<
    BasePaginatorConfig<LocalMessage, MessageQueryShape>
  > {
    return { ...super.getBehaviourOverrides(), ...this.buildPinnedBehaviour() };
  }

  private installPinnedMessageBehaviour(): void {
    // Order by pinned_at (ascending), overriding the base's created_at comparators. Ascending keeps
    // the head edge (most-recently-pinned) at the end of an interval, matching the base's interval
    // direction getters (which are shared with created_at-asc semantics).
    //
    // A plain field rather than config, so a re-derivation never touches it — which is why only the
    // constructor sets it.
    this.sortComparator = makeComparator<LocalMessage>({
      sort: PINNED_AT_SORT,
      resolvePathValue: resolveDotPathValue,
      tiebreaker: this.pinnedTiebreaker,
    });
    this.updateConfig(this.buildPinnedBehaviour());
  }

  buildMatchFilters = (): PinnedMessagePaginatorFilter => ({
    cid: this.channel.cid,
    pinned: true,
  });

  shouldIncludeMessageInInterval(message: LocalMessage): boolean {
    return !message.shadowed && !!message.pinned;
  }
}
