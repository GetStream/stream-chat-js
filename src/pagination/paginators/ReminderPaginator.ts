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
    this.resetState();
  }

  constructor(
    client: StreamChat,
    options?: PaginatorOptions<ReminderResponse, QueryRemindersOptions>,
  ) {
    super({ initialCursor: ZERO_PAGE_CURSOR, ...options });
    this.client = client;
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
