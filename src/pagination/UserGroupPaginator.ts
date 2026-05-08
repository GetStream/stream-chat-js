import { BasePaginator } from './BasePaginator';
import type {
  PaginationQueryParams,
  PaginationQueryReturnValue,
  PaginatorOptions,
  PaginatorState,
} from './BasePaginator';
import type { QueryUserGroupsOptions, UserGroupResponse } from '../types';
import type { StreamChat } from '../client';

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
 * This entity only supports forward cursor pagination via `created_at_gt` and `id_gt`.
 * Previous-page pagination is not available because the API does not expose a backward cursor.
 */
export class UserGroupPaginator extends BasePaginator<UserGroupResponse> {
  private client: StreamChat;
  protected _teamId: string | undefined;

  constructor(client: StreamChat, options?: PaginatorOptions) {
    super(options);
    this.client = client;
  }

  get initialState(): PaginatorState<UserGroupResponse> {
    return {
      ...super.initialState,
      hasPrev: false,
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
      created_at_gt: lastItem.created_at,
      id_gt: lastItem.id,
    } satisfies UserGroupListCursor);
  };

  query = async ({
    direction,
  }: PaginationQueryParams): Promise<PaginationQueryReturnValue<UserGroupResponse>> => {
    if (direction === 'prev') {
      return { items: [] };
    }

    const cursor = decodeCursor<UserGroupListCursor>(this.cursor?.next);
    const options: QueryUserGroupsOptions = {
      limit: this.pageSize,
      ...(this.teamId ? { team_id: this.teamId } : {}),
      ...(cursor?.id_gt ? { id_gt: cursor.id_gt } : {}),
      ...(cursor?.created_at_gt ? { created_at_gt: cursor.created_at_gt } : {}),
    };

    const { user_groups: items } = await this.client.queryUserGroups(options);
    return { items, next: this.buildNextCursor(items) };
  };

  filterQueryResults = (items: UserGroupResponse[]) => items;
}
