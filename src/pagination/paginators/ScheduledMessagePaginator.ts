import { BasePaginator, ZERO_PAGE_CURSOR } from './BasePaginator';
import type {
  PaginationQueryParams,
  PaginationQueryReturnValue,
  PaginatorCursor,
  PaginatorOptions,
} from './BasePaginator';
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

export type ScheduledMessagePaginatorOptions = {
  client: StreamChat;
  cid?: string;
  paginatorOptions?: PaginatorOptions<
    ScheduledMessageResponse,
    QueryScheduledMessagesRequest
  >;
  resolveLatest?: (
    incoming: ScheduledMessageResponse,
  ) => ScheduledMessageResponse | undefined;
  store?: EntityStore<ScheduledMessageResponse>;
};

const SCHEDULED_MESSAGES_PAGE_SIZE = 100;

const EXHAUSTED_CURSOR: PaginatorCursor = { headward: null, tailward: null };

const getScheduledMessageId = ({ id }: ScheduledMessageResponse) => id;

const keepIncoming = (incoming: ScheduledMessageResponse) => incoming;

const isDefined = <T>(value: T | undefined): value is T => value !== undefined;

const isFailed = ({ status }: ScheduledMessageResponse) =>
  status === SCHEDULED_MESSAGE_STATUS.Failed;

const compareValues = <TValue extends number | string>(first: TValue, second: TValue) =>
  first < second ? -1 : first > second ? 1 : 0;

export const compareScheduledMessages = (
  first: ScheduledMessageResponse,
  second: ScheduledMessageResponse,
) =>
  compareValues(Number(isFailed(first)), Number(isFailed(second))) ||
  compareValues<number>(first.scheduled_at, second.scheduled_at) ||
  compareValues(first.id, second.id);

export class ScheduledMessagePaginator extends BasePaginator<
  ScheduledMessageResponse,
  QueryScheduledMessagesRequest
> {
  private client: StreamChat;
  private resolveLatest: (
    incoming: ScheduledMessageResponse,
  ) => ScheduledMessageResponse | undefined;

  public readonly cid: string | undefined;

  constructor({
    cid,
    client,
    paginatorOptions,
    resolveLatest = keepIncoming,
    store,
  }: ScheduledMessagePaginatorOptions) {
    super(
      {
        initialCursor: ZERO_PAGE_CURSOR,
        createItemIndex: (owner) =>
          new StoreBackedItemIndex<ScheduledMessageResponse>({
            getEntityId: getScheduledMessageId,
            holderName: 'scheduled-message-paginator',
            owner: owner as ScheduledMessagePaginator,
            store,
          }),
        ...paginatorOptions,
      },
      { pageSize: SCHEDULED_MESSAGES_PAGE_SIZE },
    );

    this.cid = cid;
    this.client = client;
    this.resolveLatest = resolveLatest;
    this.sortComparator = compareScheduledMessages;
  }

  private get queryFilter(): ScheduledMessagesFilter {
    const { cid } = this;
    const status = SCHEDULED_MESSAGE_ACTIVE_STATUSES;

    const queryFilter = cid ? { cid, status } : { status };

    return queryFilter;
  }

  private get isEmptyCompleteList() {
    const { hasMoreHead, hasMoreTail, items } = this.state.getLatestValue();

    return !!items && !items.length && !hasMoreHead && !hasMoreTail;
  }

  private markEmptyComplete() {
    this._lastQueryShape = this.getNextQueryShape();
    this.state.partialNext({
      cursor: EXHAUSTED_CURSOR,
      hasMoreHead: false,
      hasMoreTail: false,
      items: [],
    });
  }

  public getItemId(item: ScheduledMessageResponse): string {
    return getScheduledMessageId(item);
  }

  protected getNextQueryShape(): QueryScheduledMessagesRequest {
    return { filter: this.queryFilter, limit: this.pageSize };
  }

  protected buildMatchFilters() {
    const { cid } = this;
    const status = { $in: SCHEDULED_MESSAGE_ACTIVE_STATUSES };

    const matchFilters = cid ? { cid, status } : { status };

    return matchFilters;
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

    const page = { headward: null, items, tailward: next || null };

    return page;
  };

  protected override extractQueryPage(
    response: PaginationQueryReturnValue<ScheduledMessageResponse>,
  ) {
    return response;
  }

  protected override applyQueryResponseRest() {
    if (!this.isEmptyCompleteList) return;

    const liveItems = [...this.logicalHeadItems, ...this.logicalTailItems];

    if (liveItems.length) this.setCompleteList(liveItems);
  }

  public filterQueryResults(items: ScheduledMessageResponse[]) {
    const latestItems = items.map(this.resolveLatest).filter(isDefined);

    const matchingItems = latestItems.filter((item) => this.matchesFilter(item));

    return matchingItems;
  }

  public ingestItem(item: ScheduledMessageResponse): boolean {
    if (this.isEmptyCompleteList && this.matchesFilter(item)) {
      this.setCompleteList([item]);
      return true;
    }

    const changed = super.ingestItem(item);

    if (!this.matchesFilter(item)) this._itemIndex.remove(item.id);

    return changed;
  }

  public setCompleteList(items: ScheduledMessageResponse[]) {
    const sortedItems = items
      .filter((item) => this.matchesFilter(item))
      .sort(this.sortComparator);

    if (!sortedItems.length) {
      this.markEmptyComplete();
      return;
    }

    this.setItems({
      cursor: EXHAUSTED_CURSOR,
      isFirstPage: true,
      isLastPage: true,
      valueOrFactory: sortedItems,
    });
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
