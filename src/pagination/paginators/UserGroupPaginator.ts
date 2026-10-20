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
 * Paginates `/usergroups` forward (tailward) only, via `created_at_gt` and `id_gt`. The API has no
 * backward cursor, so the headward cursor starts exhausted (`null`).
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
        holderName: 'user-group-paginator',
      }),
      ...options,
    });
    this.client = client;
    // Total order for interval storage, mirroring the server's ascending (`created_at`, `id`).
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
      // `nsToRfc3339` keeps the nanoseconds: a `Date` would floor the boundary timestamp and the
      // strict `created_at_gt` could return that same item on the next page.
      created_at_gt: nsToRfc3339(lastItem.created_at),
      id_gt: lastItem.id,
    } satisfies UserGroupListCursor);
  };

  // The cursor stays out of the shape (a shape change resets the list): `query` applies it.
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
