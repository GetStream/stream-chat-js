import { BasePaginator, ZERO_PAGE_CURSOR } from './BasePaginator';
import type {
  PaginationQueryParams,
  PaginationQueryReturnValue,
  PaginatorOptions,
} from './BasePaginator';
import type {
  QueryRemindersOptions,
  ReminderFilters,
  ReminderResponseData,
  ReminderSort,
} from '../../types';
import type { StreamChat } from '../../client';
import { StoreBackedItemIndex } from '../../messageStore/StoreBackedItemIndex';
import { makeComparator } from '../sortCompiler';
import { resolveDotPathValue } from '../utility.normalization';

// Reminders are keyed by the message they belong to; used for interval dedup and index addressing.
const getReminderId = (reminder: ReminderResponseData) => reminder.message_id;

// Fallback order for interval placement when no explicit sort is set. Order is not a pinned contract
// (ReminderManager stores reminders in a message_id-keyed Map), but interval storage needs a total
// order, so default to a deterministic one.
const DEFAULT_SORT: ReminderSort = [{ direction: 1, field: 'created_at' }];

export class ReminderPaginator extends BasePaginator<
  ReminderResponseData,
  QueryRemindersOptions
> {
  private client: StreamChat;
  protected _filters: ReminderFilters | undefined;
  protected _sort: ReminderSort | undefined;

  get filters(): ReminderFilters | undefined {
    return this._filters;
  }

  get sort(): ReminderSort | undefined {
    return this._sort;
  }

  set filters(filters: ReminderFilters | undefined) {
    this._filters = filters;
    this.resetState();
  }

  set sort(sort: ReminderSort | undefined) {
    this._sort = sort;
    this.sortComparator = this.buildSortComparator();
    this.resetState();
  }

  constructor(
    client: StreamChat,
    options?: PaginatorOptions<ReminderResponseData, QueryRemindersOptions>,
  ) {
    super({
      initialCursor: ZERO_PAGE_CURSOR,
      itemIndex: new StoreBackedItemIndex<ReminderResponseData>({ getId: getReminderId }),
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
    Pick<PaginationQueryParams<QueryRemindersOptions>, 'direction'>
  >): QueryRemindersOptions {
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
  }: PaginationQueryParams<QueryRemindersOptions>): Promise<
    PaginationQueryReturnValue<ReminderResponseData>
  > => {
    const { reminders: items, next, prev } = await this.client.queryReminders(queryShape);
    return { items, headward: prev, tailward: next };
  };

  filterQueryResults = (items: ReminderResponseData[]) => items;
}
