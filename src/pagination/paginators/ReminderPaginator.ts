import { BasePaginator, ZERO_PAGE_CURSOR } from './BasePaginator';
import type {
  PaginationQueryParams,
  PaginationQueryReturnValue,
  PaginatorOptions,
} from './BasePaginator';
import type {
  QueryRemindersRequest,
  ReminderFilters,
  ReminderResponseData,
  SortParamRequest,
} from '../../types';
import type { StreamChat } from '../../client';
import { StoreBackedItemIndex } from '../../entityStore/StoreBackedItemIndex';
import { makeComparator } from '../sortCompiler';
import { resolveDotPathValue } from '../utility.normalization';

// Reminders are keyed by the message they belong to.
const getReminderId = (reminder: ReminderResponseData) => reminder.message_id;

// Interval storage needs a total order, so default to a deterministic one when no sort is set.
const DEFAULT_SORT: SortParamRequest[] = [{ direction: 1, field: 'created_at' }];

export class ReminderPaginator extends BasePaginator<
  ReminderResponseData,
  QueryRemindersRequest
> {
  private client: StreamChat;
  protected _filters: ReminderFilters | undefined;
  protected _sort: SortParamRequest[] | undefined;

  get filters(): ReminderFilters | undefined {
    return this._filters;
  }

  get sort(): SortParamRequest[] | undefined {
    return this._sort;
  }

  set filters(filters: ReminderFilters | undefined) {
    this._filters = filters;
    this.resetState();
  }

  set sort(sort: SortParamRequest[] | undefined) {
    this._sort = sort;
    this.sortComparator = this.buildSortComparator();
    this.resetState();
  }

  constructor(
    client: StreamChat,
    options?: PaginatorOptions<ReminderResponseData, QueryRemindersRequest>,
  ) {
    super({
      initialCursor: ZERO_PAGE_CURSOR,
      itemIndex: new StoreBackedItemIndex<ReminderResponseData>({
        getEntityId: getReminderId,
        holderName: 'reminder-paginator',
      }),
      ...options,
    });
    this.client = client;
    this.sortComparator = this.buildSortComparator();
  }

  getItemId(item: ReminderResponseData): string {
    return getReminderId(item);
  }

  // Total order for interval storage: the requested sort, with a message_id tiebreaker.
  private buildSortComparator() {
    return makeComparator<ReminderResponseData>({
      sort: this._sort ?? DEFAULT_SORT,
      resolvePathValue: resolveDotPathValue,
      tiebreaker: (l, r) =>
        l.message_id < r.message_id ? -1 : l.message_id > r.message_id ? 1 : 0,
    });
  }

  protected getNextQueryShape(): QueryRemindersRequest {
    return {
      filter: this.filters,
      sort: this.sort,
      limit: this.pageSize,
    };
  }

  protected override fetchQueryResponse = async ({
    direction,
    queryShape,
  }: PaginationQueryParams<QueryRemindersRequest>): Promise<
    PaginationQueryReturnValue<ReminderResponseData>
  > => {
    const cursor = direction ? (this.cursor?.[direction] ?? undefined) : undefined;
    const request: QueryRemindersRequest = {
      ...(queryShape ?? this.getNextQueryShape()),
      // The request names its cursors after the response's `next` / `prev`, not after the direction.
      ...(cursor ? { [direction === 'tailward' ? 'next' : 'prev']: cursor } : {}),
    };
    const { reminders: items, next, prev } = await this.client.queryReminders(request);
    return { items, headward: prev, tailward: next };
  };

  /** The extracting step of the query pipeline: the response is the page. */
  protected override extractQueryPage(
    response: PaginationQueryReturnValue<ReminderResponseData>,
    _params: PaginationQueryParams<QueryRemindersRequest>,
  ) {
    return response;
  }
}
