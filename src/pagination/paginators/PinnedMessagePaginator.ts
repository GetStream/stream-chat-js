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
 * The channel's pinned messages, ordered by `pinned_at` ascending (oldest-pinned first). Extends
 * {@link MessageIntervalPaginator} rather than {@link MessagePaginator}: pinned messages are a subset
 * of the channel and take no part in read/unread or delivery-receipt tracking.
 *
 * Fetches through `channel.getPinnedMessages`, includes only pinned, non-shadowed messages and
 * matches `{ cid, pinned: true }`, so `ingestItem` adds on pin and removes on unpin.
 */
export class PinnedMessagePaginator extends MessageIntervalPaginator {
  protected get holderName() {
    return 'pinned-message-paginator';
  }

  constructor({
    channel,
    id,
    itemIndex,
    paginatorOptions,
  }: PinnedMessagePaginatorOptions) {
    super({
      channel,
      id: id ?? `pinned-message-paginator-${generateUUIDv4()}`,
      // Omitted: the inherited store-backed index shares one copy of each message with the main list.
      itemIndex,
      paginatorOptions,
    });

    this.installPinnedMessageBehaviour();
  }

  /** Memoized: stable references let the base derivation skip a publish when nothing moved. */
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

        // The base `query` passes the resolved shape (including `id_around` jumps) as `options`.
        // Both cursors are returned and the base gates them by direction.
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

  /** Adds the pinned ordering and request behaviour to the derivation, over the interval overlay. */
  protected override getBehaviourOverrides(): Partial<
    BasePaginatorConfig<LocalMessage, MessageQueryShape>
  > {
    return { ...super.getBehaviourOverrides(), ...this.buildPinnedBehaviour() };
  }

  private installPinnedMessageBehaviour(): void {
    // Ascending `pinned_at` keeps the head edge (most recently pinned) at the end of an interval,
    // like the base's `created_at` ascending. A plain field rather than config, so a re-derivation
    // never touches it and only the constructor sets it.
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
