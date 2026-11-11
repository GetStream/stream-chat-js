import type {
  PaginationQueryParams,
  PaginationQueryReturnValue,
  PaginatorOptions,
} from './BasePaginator';
import { BasePaginator, EXHAUSTED_CURSOR, ZERO_PAGE_CURSOR } from './BasePaginator';
import { StoreBackedItemIndex } from '../../entityStore/StoreBackedItemIndex';
import type { EntityStore, EntityStoreChangeBatch } from '../../entityStore/EntityStore';
import type { StreamChat } from '../../client';
import type {
  QueryScheduledMessagesRequest,
  ScheduledMessageResponse,
  ScheduledMessagesFilter,
} from '../../gen/models';
import {
  SCHEDULED_MESSAGE_ACTIVE_STATUSES,
  SCHEDULED_MESSAGE_STATUS,
} from '../../scheduledMessages/constants';
import { generateUUIDv4 } from '../../utils';

export type ScheduledMessagePaginatorOptions = {
  client: StreamChat;
  /**
   * The query filter, also deciding which ingested messages the list takes. `status` defaults to all
   * the query accepts. Changed later through the `filter` setter.
   */
  filter?: ScheduledMessagesFilter;
  /** Generated when omitted. */
  id?: string;
  paginatorOptions?: PaginatorOptions<
    ScheduledMessageResponse,
    QueryScheduledMessagesRequest
  >;
  /** Defaults to `client.scheduledMessageStore`. */
  store?: EntityStore<ScheduledMessageResponse>;
};

const SCHEDULED_MESSAGES_PAGE_SIZE = 100;

const getScheduledMessageId = ({ id }: ScheduledMessageResponse) => id;

const isFailed = ({ status }: ScheduledMessageResponse) =>
  status === SCHEDULED_MESSAGE_STATUS.Failed;

const compareValues = <TValue extends number | string>(first: TValue, second: TValue) =>
  first < second ? -1 : first > second ? 1 : 0;

const defaultScheduledMessagesComparator = (
  first: ScheduledMessageResponse,
  second: ScheduledMessageResponse,
) =>
  compareValues(Number(isFailed(first)), Number(isFailed(second))) ||
  compareValues<number>(first.scheduled_at, second.scheduled_at) ||
  compareValues(first.id, second.id);

/**
 * The current user's scheduled messages, pending before failed, each by `scheduled_at`. Every copy it
 * takes is resolved against the shared store first (see `shouldReplaceScheduledMessage`).
 */
export class ScheduledMessagePaginator extends BasePaginator<
  ScheduledMessageResponse,
  QueryScheduledMessagesRequest
> {
  private readonly client: StreamChat;
  private readonly store: EntityStore<ScheduledMessageResponse>;
  private readonly _id: string;
  private _filter: ScheduledMessagesFilter;

  constructor({
    client,
    filter = {},
    id,
    paginatorOptions,
    store,
  }: ScheduledMessagePaginatorOptions) {
    const entityStore = store ?? client.scheduledMessageStore;
    super(
      {
        initialCursor: ZERO_PAGE_CURSOR,
        createItemIndex: (owner) =>
          new StoreBackedItemIndex<ScheduledMessageResponse>({
            getEntityId: getScheduledMessageId,
            holderName: 'scheduled-message-paginator',
            owner: owner as ScheduledMessagePaginator,
            store: entityStore,
          }),
        ...paginatorOptions,
      },
      { pageSize: SCHEDULED_MESSAGES_PAGE_SIZE },
    );

    this.client = client;
    this.store = entityStore;
    this._id = id ?? `scheduled-message-paginator-${generateUUIDv4()}`;
    this._filter = filter;
    this.sortComparator = defaultScheduledMessagesComparator;
  }

  get id() {
    return this._id;
  }

  /** The query filter, sent as given: without a `status` the server lists all it lists. */
  get filter(): ScheduledMessagesFilter {
    return this._filter;
  }

  /** Replaces the filter and resets the list; load it again with `reload()`. */
  set filter(filter: ScheduledMessagesFilter) {
    this._filter = filter;
    this.resetState();
  }

  get cid() {
    return this.filter.cid;
  }

  protected override get startsIntervalInEmptyCompleteList() {
    return true;
  }

  public getItemId(item: ScheduledMessageResponse): string {
    return getScheduledMessageId(item);
  }

  protected getNextQueryShape(): QueryScheduledMessagesRequest {
    return { filter: this.filter, limit: this.pageSize };
  }

  /**
   * The query filter, with the server's default statuses when it names none: matching on `status`
   * is what takes sent and canceled messages out of the list. The matcher reads the array as any of
   * them.
   */
  protected buildMatchFilters(): ScheduledMessagesFilter {
    const { cid, status } = this.filter;
    const statuses = status?.length ? status : SCHEDULED_MESSAGE_ACTIVE_STATUSES;

    // an undefined `cid` would match nothing
    return cid ? { cid, status: statuses } : { status: statuses };
  }

  protected override fetchQueryResponse = async ({
    direction,
    queryShape,
  }: PaginationQueryParams<QueryScheduledMessagesRequest>): Promise<
    PaginationQueryReturnValue<ScheduledMessageResponse>
  > => {
    const cursor = direction === 'tailward' ? this.cursor?.tailward : undefined;
    const request: QueryScheduledMessagesRequest = {
      ...(queryShape ?? this.getNextQueryShape()),
      ...(cursor ? { next: cursor } : {}),
    };

    const { next, scheduled_messages: items } =
      await this.client.queryScheduledMessages(request);

    return { headward: null, items, tailward: next || null };
  };

  protected override extractQueryPage(
    response: PaginationQueryReturnValue<ScheduledMessageResponse>,
  ) {
    return response;
  }

  public filterQueryResults(items: ScheduledMessageResponse[]) {
    const latestItems = items.map((item) => this.store.resolveCanonicalEntity(item));

    return latestItems.filter((item) => this.matchesFilter(item));
  }

  public ingestItem(item: ScheduledMessageResponse): boolean {
    const latest = this.store.resolveCanonicalEntity(item);

    // the list already holds the copy that wins (e.g. `item` is stale): nothing to place
    if (this.getItem(latest.id) === latest) return false;

    const changed = super.ingestItem(latest);

    if (!this.matchesFilter(latest)) this._itemIndex.remove(latest.id);

    return changed;
  }

  /** The IDs the list holds. */
  public getItemIds(): ReadonlySet<string> {
    return new Set(this._itemIndex.values().map(getScheduledMessageId));
  }

  /**
   * Applies a complete set (e.g. a channel query's `scheduled_messages`) through the paginator's own
   * operations: removes what was held at `itemIdsAtRequest` and is missing, ingests the rest, or
   * places it as the first, complete page. Messages taken since the snapshot stay. Publishes once.
   */
  public hydrate(
    scheduledMessages: ScheduledMessageResponse[],
    itemIdsAtRequest: ReadonlySet<string> = new Set(),
  ) {
    const snapshot = this.filterQueryResults(scheduledMessages);
    const snapshotIds = new Set(snapshot.map(getScheduledMessageId));

    this.batch(
      () => {
        // held when the request went out and missing from the response: gone on the server
        itemIdsAtRequest.forEach((id) => {
          if (!snapshotIds.has(id)) this.removeItem({ id });
        });

        if (this.hasLoadedPage) {
          snapshot.forEach((item) => this.ingestItem(item));
          return;
        }

        // events that arrived before the first page wait in the logical intervals, which
        // `setItems` folds into the page
        const waitingItems = [...this.logicalHeadItems, ...this.logicalTailItems].filter(
          ({ id }) => !snapshotIds.has(id),
        );
        this.setItems({
          cursor: EXHAUSTED_CURSOR,
          isFirstPage: true,
          isLastPage: true,
          valueOrFactory: [...snapshot, ...waitingItems].sort(this.sortComparator),
        });
      },
      { coalesce: true },
    );
  }

  public onEntitiesChanged({ changedIds }: EntityStoreChangeBatch) {
    this.reconcileChangedIds(changedIds);
  }

  public onEntityRemoved(id: string, item: unknown) {
    this.removeItem({ id, item: item as ScheduledMessageResponse });
  }

  public flushState() {
    this.flushPendingPublishes();
  }

  public resetState() {
    super.resetState();
    this._itemIndex.clear();
  }
}
