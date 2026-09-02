import { BasePaginator, ZERO_PAGE_CURSOR } from './BasePaginator';
import type {
  PaginationQueryParams,
  PaginationQueryReturnValue,
  PaginatorOptions,
  PaginatorState,
} from './BasePaginator';
import type { ListUserGroupsOptions, UserGroupResponse } from '../../types';
import type { StreamChat } from '../../client';
import { nsToRfc3339 } from '../../utils/time';
import { StoreBackedItemIndex } from '../../entityStore/StoreBackedItemIndex';

type UserGroupListCursor = {
  created_at_gt: string;
  id_gt: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const decodeCursor = <TCursor extends object>(cursor: string | null | undefined) => {
  if (!cursor) return undefined;

  try {
    const parsed = JSON.parse(cursor);
    return isRecord(parsed) ? (parsed as TCursor) : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Paginates user-group listing through `/usergroups`.
 *
 * This entity only supports forward (tailward) cursor pagination via
 * `created_at_gt` and `id_gt`. Backward (headward) pagination is not available
 * because the API does not expose a backward cursor, so the headward cursor is
 * initialized as exhausted (`null`).
 */
export class UserGroupPaginator extends BasePaginator<
  UserGroupResponse,
  ListUserGroupsOptions
> {
  private client: StreamChat;
  protected _teamId: string | undefined;

  constructor(
    client: StreamChat,
    options?: PaginatorOptions<UserGroupResponse, ListUserGroupsOptions>,
  ) {
    super({
      initialCursor: { ...ZERO_PAGE_CURSOR, headward: null },
      itemIndex: new StoreBackedItemIndex<UserGroupResponse>({
        getEntityId: (group) => group.id,
      }),
      ...options,
    });
    this.client = client;
    // Interval storage needs a total order for its placement/merge math. The listing is ordered by
    // the forward cursor (`created_at_gt`, `id_gt`), i.e. ascending `created_at` then `id` — mirror
    // that here so the visible order matches the server's.
    this.sortComparator = (a, b) => {
      if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    };
  }

  get initialState(): PaginatorState<UserGroupResponse> {
    return {
      ...super.initialState,
      hasMoreHead: false,
    };
  }

  get teamId() {
    return this._teamId;
  }

  set teamId(teamId: string | undefined) {
    if (teamId === this._teamId) return;
    this._teamId = teamId;
    this.resetState();
  }

  private buildNextCursor = (items: UserGroupResponse[]) => {
    if (items.length < this.pageSize) return undefined;
    const lastItem = items[items.length - 1];
    if (!lastItem) return undefined;

    return JSON.stringify({
      // The cursor is a request value, so it has to go back out as RFC3339 rather than as the
      // wire number the item carries. `nsToRfc3339` and not `nsToDate(...).toISOString()`:
      // `Date` holds only milliseconds, so flooring the boundary item's timestamp would put the
      // cursor below it and a strict `created_at_gt` could hand that same item back on the next
      // page.
      created_at_gt: nsToRfc3339(lastItem.created_at),
      id_gt: lastItem.id,
    } satisfies UserGroupListCursor);
  };

  // The query shape must stay stable across pages: the paginator resets its
  // accumulated list when the query shape changes ('auto' reset policy), so the
  // forward cursor is NOT part of the shape — it is applied per request in `query`.
  protected getNextQueryShape(): ListUserGroupsOptions {
    return {
      limit: this.pageSize,
      ...(this.teamId ? { team_id: this.teamId } : {}),
    };
  }

  query = async ({
    direction,
    queryShape,
  }: PaginationQueryParams<ListUserGroupsOptions>): Promise<
    PaginationQueryReturnValue<UserGroupResponse>
  > => {
    if (direction === 'headward') {
      return { items: [] };
    }

    const cursor = decodeCursor<UserGroupListCursor>(this.cursor?.tailward);
    const options: ListUserGroupsOptions = {
      ...(queryShape ?? this.getNextQueryShape()),
      ...(cursor?.id_gt ? { id_gt: cursor.id_gt } : {}),
      ...(cursor?.created_at_gt ? { created_at_gt: cursor.created_at_gt } : {}),
    };

    const { user_groups: items } = await this.client.listUserGroups(options);
    return { items, tailward: this.buildNextCursor(items) };
  };

  filterQueryResults = (items: UserGroupResponse[]) => items;
}
