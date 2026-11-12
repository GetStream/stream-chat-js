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
import { SCHEDULED_MESSAGE_ACTIVE_STATUSES } from '../../scheduledMessages/constants';
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

const compareValues = <TValue extends number | string>(first: TValue, second: TValue) =>
  first < second ? -1 : first > second ? 1 : 0;

// Earliest first. Failed messages need no rule of their own: they failed at their send time, so they
// precede the pending ones. Messages due at the same time sort by text.
const defaultScheduledMessagesComparator = (
  first: ScheduledMessageResponse,
  second: ScheduledMessageResponse,
) =>
  compareValues<number>(first.scheduled_at, second.scheduled_at) ||
  compareValues(first.message.text ?? '', second.message.text ?? '') ||
  compareValues(first.id, second.id);

/**
 * The current user's scheduled messages, earliest `scheduled_at` first. Every copy it
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

    // the list already holds the copy that wins and placed it when it was stored (`onEntitiesChanged`
    // places copies other lists store): nothing to place
    if (this.getItem(latest.id) === latest) return false;

    return this.placeItem(latest);
  }

  /** Places `item` by the list's filter and order: moves it, or takes it out when it no longer matches. */
  private placeItem(item: ScheduledMessageResponse) {
    const changed = super.ingestItem(item);

    if (!this.matchesFilter(item)) this._itemIndex.remove(item.id);

    return changed;
  }

  /** The IDs the list holds. */
  public getItemIds(): ReadonlySet<string> {
    return new Set(this._itemIndex.values().map(getScheduledMessageId));
  }

  /** A page loaded and nothing more to load either way: the list holds every message it matches. */
  private get holdsCompleteList() {
    const { hasMoreHead, hasMoreTail } = this.state.getLatestValue();
    return this.hasLoadedPage && !hasMoreHead && !hasMoreTail;
  }

  /**
   * Applies a complete set (e.g. a channel query's `scheduled_messages`) through the paginator's own
   * operations: removes what was held at `itemIdsAtRequest` and is missing, and ingests the rest. A
   * list that does not hold a complete set yet is replaced by it instead. Messages taken since the
   * snapshot stay. Publishes once.
   */
  public hydrate(
    scheduledMessages: ScheduledMessageResponse[],
    itemIdsAtRequest: ReadonlySet<string> = new Set(),
  ) {
    const snapshot = this.filterQueryResults(scheduledMessages);

    if (!this.holdsCompleteList) {
      this.replaceWithFirstPage({ itemIdsAtRequest, page: snapshot, tailward: null });
      return;
    }

    const snapshotIds = new Set(snapshot.map(getScheduledMessageId));
    this.batch(
      () => {
        // held when the request went out and missing from the response: gone on the server
        itemIdsAtRequest.forEach((id) => {
          if (!snapshotIds.has(id)) this.removeItem({ id });
        });
        snapshot.forEach((item) => this.ingestItem(item));
      },
      { coalesce: true },
    );
  }

  /**
   * Re-queries the first page and applies it in place: the current messages stay until the response
   * lands, unlike the base `reload()`, which empties the list first. A complete response is applied
   * as {@link hydrate} does; a longer list is replaced by its first page. Messages taken by events
   * while the request was out stay. A failed query keeps the list and records `lastQueryError`; a
   * success clears it. Only the first load publishes `isLoading`. A call while one is in flight
   * joins it.
   */
  reload = (): Promise<void> => {
    this.reloadInFlight ??= this.reloadFirstPage().finally(() => {
      this.reloadInFlight = undefined;
    });
    return this.reloadInFlight;
  };

  private reloadInFlight?: Promise<void>;

  private reloadFirstPage = async () => {
    const isFirstLoad = !this.hasLoadedPage;
    const itemIdsAtRequest = this.getItemIds();
    if (isFirstLoad) this.state.partialNext({ isLoading: true });
    let applied = false;
    try {
      const fetchParams = {
        queryShape: this.getNextQueryShape(),
        retryCount: this.config.retryCount,
      };
      const response = await this.fetchQueryResponseWithRetries(fetchParams);
      if (!response) return;
      const { items, tailward } = this.extractQueryPage(response);
      if (tailward) {
        this.replaceWithFirstPage({
          itemIdsAtRequest,
          page: this.filterQueryResults(items),
          tailward,
        });
      } else {
        this.hydrate(items, itemIdsAtRequest);
      }
      applied = true;
    } finally {
      const clearError = applied && this.lastQueryError;
      if (isFirstLoad || clearError) {
        this.state.partialNext({
          ...(isFirstLoad ? { isLoading: false } : {}),
          ...(clearError ? { lastQueryError: undefined } : {}),
        });
      }
    }
  };

  /**
   * Replaces the list with `page` as its first page. Messages taken by events since the request went
   * out (held now, not at `itemIdsAtRequest`) stay; the others the page leaves out go. Publishes once.
   */
  private replaceWithFirstPage({
    itemIdsAtRequest,
    page,
    tailward,
  }: {
    itemIdsAtRequest: ReadonlySet<string>;
    page: ScheduledMessageResponse[];
    tailward: string | null | undefined;
  }) {
    const pageIds = new Set(page.map(getScheduledMessageId));
    const takenSinceRequest = this._itemIndex
      .values()
      .filter(({ id }) => !pageIds.has(id) && !itemIdsAtRequest.has(id));
    const keptIds = new Set([
      ...pageIds,
      ...takenSinceRequest.map(getScheduledMessageId),
    ]);

    this.batch(
      () => {
        this.setIntervals([]);
        this.setActiveInterval(undefined);
        this.clearIntervalViews();
        this._itemIndex.values().forEach(({ id }) => {
          if (!keptIds.has(id)) this._itemIndex.remove(id);
        });
        this.setItems({
          cursor: tailward ? { headward: null, tailward } : EXHAUSTED_CURSOR,
          isFirstPage: true,
          isLastPage: !tailward,
          valueOrFactory: [...page, ...takenSinceRequest].sort(this.sortComparator),
        });
      },
      { coalesce: true },
    );
  }

  /**
   * Another list stored a newer copy of items this one holds. A change can move a scheduled message
   * (`scheduled_at`) or take it out of this list (`status`), so each changed item is placed by this
   * list's filter and order.
   */
  public onEntitiesChanged({ changedIds }: EntityStoreChangeBatch) {
    this.batch(
      () => {
        changedIds.forEach((id) => {
          const item = this.getItem(id);
          if (item) this.placeItem(item);
        });
      },
      { coalesce: true },
    );
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
