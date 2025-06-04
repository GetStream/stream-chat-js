import { BasePaginator } from './BasePaginator';
import type {
  PaginationQueryParams,
  PaginationQueryReturnValue,
  PaginatorOptions,
} from './BasePaginator';
import type { ReminderFilters, ReminderResponse, ReminderSort } from '../types';
import type { StreamChat } from '../client';

export class ReminderPaginator extends BasePaginator<ReminderResponse> {
  private client: StreamChat;
  filters: ReminderFilters | undefined;
  sort: ReminderSort | undefined;

  constructor(client: StreamChat, options?: PaginatorOptions) {
    super(options);
    this.client = client;
  }

  query = async ({
    direction,
  }: PaginationQueryParams): Promise<PaginationQueryReturnValue<ReminderResponse>> => {
    const cursor = this.cursor?.[direction];
    const {
      reminders: items,
      next,
      prev,
    } = await this.client.queryReminders({
      filter: this.filters,
      sort: this.sort,
      limit: this.pageSize,
      [direction]: cursor,
    });
    return { items, next, prev };
  };

  filterQueryResults = (items: ReminderResponse[]) => items;
}
