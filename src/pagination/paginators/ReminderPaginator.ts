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

// Reminders are keyed by the message they belong to; used for interval dedup and index addressing.
const getReminderId = (reminder: ReminderResponseData) => reminder.message_id;

// Fallback order for interval placement when no explicit sort is set. Order is not a pinned contract
// (ReminderManager stores reminders in a message_id-keyed Map), but interval storage needs a total
// order, so default to a deterministic one.
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
      }),
      ...options,
    });
    this.client = client;
    this.sortComparator = this.buildSortComparator();
  }

  getItemId(item: ReminderResponseData): string {
    return getReminderId(item);
  }

  // Interval storage needs a total order. Derive it from the requested sort (rebuilt when `sort`
  // changes, which also resets the accumulated pages), with a message_id tiebreaker.
  private buildSortComparator() {
    return makeComparator<ReminderResponseData>({
      sort: this._sort ?? DEFAULT_SORT,
      resolvePathValue: resolveDotPathValue,
      tiebreaker: (l, r) =>
        l.message_id < r.message_id ? -1 : l.message_id > r.message_id ? 1 : 0,
    });
  }

  protected getNextQueryShape({
    direction,
  }: Required<
    Pick<PaginationQueryParams<QueryRemindersRequest>, 'direction'>
  >): QueryRemindersRequest {
    const cursor = this.cursor?.[direction];
    return {
      filter: this.filters,
      sort: this.sort,
      limit: this.pageSize,
      [direction]: cursor,
    };
  }

  query = async ({
    queryShape,
  }: PaginationQueryParams<QueryRemindersRequest>): Promise<
    PaginationQueryReturnValue<ReminderResponseData>
  > => {
    const { reminders: items, next, prev } = await this.client.queryReminders(queryShape);
    return { items, headward: prev, tailward: next };
  };

  filterQueryResults = (items: ReminderResponseData[]) => items;
}
