import { BasePaginator, ZERO_PAGE_CURSOR } from './BasePaginator';
import type {
  PaginationQueryParams,
  PaginationQueryReturnValue,
  PaginatorOptions,
} from './BasePaginator';
import type {
  QueryRemindersOptions,
  ReminderFilters,
  ReminderResponse,
  ReminderSort,
} from '../../types';
import type { StreamChat } from '../../client';
import { ItemIndex } from '../ItemIndex';
import { makeComparator } from '../sortCompiler';
import { resolveDotPathValue } from '../utility.normalization';

// Reminders are keyed by the message they belong to; used for interval dedup and index addressing.
const getReminderId = (reminder: ReminderResponse) => reminder.message_id;

// Fallback order for interval placement when no explicit sort is set. Order is not a pinned contract
// (ReminderManager stores reminders in a message_id-keyed Map), but interval storage needs a total
// order, so default to a deterministic one.
const DEFAULT_SORT: ReminderSort = { created_at: 1 };

export class ReminderPaginator extends BasePaginator<
  ReminderResponse,
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
    options?: PaginatorOptions<ReminderResponse, QueryRemindersOptions>,
  ) {
    super({
      initialCursor: ZERO_PAGE_CURSOR,
      itemIndex: new ItemIndex<ReminderResponse>({ getId: getReminderId }),
      ...options,
    });
    this.client = client;
    this.sortComparator = this.buildSortComparator();
  }

  getItemId(item: ReminderResponse): string {
    return getReminderId(item);
  }

  // Interval storage needs a total order. Derive it from the requested sort (rebuilt when `sort`
  // changes, which also resets the accumulated pages), with a message_id tiebreaker.
  private buildSortComparator() {
    return makeComparator<ReminderResponse, ReminderSort>({
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
    PaginationQueryReturnValue<ReminderResponse>
  > => {
    const { reminders: items, next, prev } = await this.client.queryReminders(queryShape);
    return { items, headward: prev, tailward: next };
  };

  filterQueryResults = (items: ReminderResponse[]) => items;
}
