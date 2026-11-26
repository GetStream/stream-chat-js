import { BasePaginator, ZERO_PAGE_CURSOR } from './BasePaginator';
import type {
  ExecuteQueryReturnValue,
  PaginationQueryParams,
  PaginationQueryReturnValue,
  PaginatorOptions,
  PaginatorState,
  PlaceQueryPageParams,
} from './BasePaginator';
import type {
  MessageMarkWithUserResponse,
  QueryMessageMarksFilter,
  QueryMessageMarksRequest,
} from '../../types';
import type { StreamChat } from '../../client';
import { ComparisonResult } from '../types.normalization';
import { generateUUIDv4 } from '../../utils';
import { chatLoggerSystem } from '../../logger';

// A mark has no ID of its own: a user marks a message once per type.
const getMarkId = (mark: MessageMarkWithUserResponse) =>
  `${mark.message_id}:${mark.user_id}:${mark.type}`;

// Newest first, as the server returns them. Ties need equal nanosecond timestamps; the ID keeps
// the order total. The paginator checks for exactly -1 and 1, so no differences.
const compareMarks = (
  a: MessageMarkWithUserResponse,
  b: MessageMarkWithUserResponse,
): ComparisonResult => {
  if (a.created_at !== b.created_at) {
    return a.created_at > b.created_at
      ? ComparisonResult.A_PRECEDES_B
      : ComparisonResult.A_COMES_AFTER_B;
  }
  const idA = getMarkId(a);
  const idB = getMarkId(b);
  if (idA === idB) return ComparisonResult.A_IS_EQUAL_TO_B;
  return idA < idB ? ComparisonResult.A_PRECEDES_B : ComparisonResult.A_COMES_AFTER_B;
};

export type MessageMarkPaginatorOptions = {
  /** Identifies the list in `client.messageMarks`. Generated when left out. */
  id?: string;
  /** The message whose marks are listed. */
  messageId: string;
  /** Lists only the marks it matches, for example `{ type: 'played' }`. */
  filter?: QueryMessageMarksFilter;
  /** How the list is fetched, for example its `pageSize`. */
  paginatorOptions?: PaginatorOptions<
    MessageMarkWithUserResponse,
    QueryMessageMarksRequest
  >;
};

/**
 * Lists the marks on one message, with the users who made them, newest first. The API pages
 * forward only, so the headward cursor starts exhausted (`null`). New marks are added at the head
 * through `ingestItem`, which `client.messageMarks` calls for `message.mark_added`.
 *
 * With offline support, the first page opens with the marks the offline database holds while the
 * request runs, and keeps them when the request fails.
 */
export class MessageMarkPaginator extends BasePaginator<
  MessageMarkWithUserResponse,
  QueryMessageMarksRequest
> {
  private client: StreamChat;
  private readonly _id: string;
  readonly messageId: string;
  readonly filter: QueryMessageMarksFilter | undefined;
  private activeRefCount = 0;
  private _isStateStale = false;

  constructor(
    client: StreamChat,
    { id, messageId, filter, paginatorOptions }: MessageMarkPaginatorOptions,
  ) {
    super({
      initialCursor: { ...ZERO_PAGE_CURSOR, headward: null },
      ...paginatorOptions,
    });
    this.client = client;
    this._id = id ?? `message-mark-paginator-${generateUUIDv4()}`;
    this.messageId = messageId;
    this.filter = filter;
    this.sortComparator = compareMarks;
  }

  get initialState(): PaginatorState<MessageMarkWithUserResponse> {
    return {
      ...super.initialState,
      hasMoreHead: false,
    };
  }

  get id() {
    return this._id;
  }

  getItemId(item: MessageMarkWithUserResponse): string {
    return getMarkId(item);
  }

  /** See {@link MessageMarkPaginator.activate}. */
  get active() {
    return this.activeRefCount > 0;
  }

  /** Whether marks may have been missed, for example while the connection was down. */
  get isStateStale() {
    return this._isStateStale;
  }

  /**
   * Call this when a screen starts showing the list, and call the returned function when it stops.
   * A stale list reloads as soon as it is shown. The list counts as shown until every caller has
   * released it, and releasing twice does nothing.
   */
  activate = (): (() => void) => {
    this.activeRefCount += 1;
    if (this.activeRefCount === 1) this.reloadIfStale();

    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.activeRefCount -= 1;
    };
  };

  /**
   * Flags the loaded marks as possibly incomplete. An active list reloads now, an inactive one when
   * it is next activated.
   */
  markStale = () => {
    this._isStateStale = true;
    if (this.active) this.reloadIfStale();
  };

  private reloadIfStale() {
    if (!this._isStateStale) return;
    this._isStateStale = false;
    // Nothing loaded yet: the first page will be fresh anyway.
    if (typeof this.items === 'undefined') return;
    void this.reload();
  }

  override get isOfflineSupportEnabled() {
    return !!this.client.offlineDb;
  }

  override preloadFirstPageFromOfflineDb = async (): Promise<
    MessageMarkWithUserResponse[] | undefined
  > => {
    const { offlineDb } = this.client;
    if (!offlineDb) return undefined;
    try {
      const marks = await offlineDb.getMessageMarks({
        filter: this.filter,
        limit: this.pageSize,
        messageId: this.messageId,
      });
      return marks?.length ? marks : undefined;
    } catch (error) {
      chatLoggerSystem
        .getLogger('offline-db')
        .warn('Reading the stored message marks failed.', { error });
      return undefined;
    }
  };

  // When the request fails, the stored marks are all the list has. It pages no further and counts
  // as stale, so reconnecting or showing it again reloads it.
  override placeQueryPage(
    params: PlaceQueryPageParams<MessageMarkWithUserResponse, QueryMessageMarksRequest>,
  ): ExecuteQueryReturnValue<MessageMarkWithUserResponse> {
    const placed = super.placeQueryPage(params);
    if (!params.results && this.showsOfflinePage) {
      this._isStateStale = true;
      this.state.partialNext({ hasMoreTail: false });
    }
    return placed;
  }

  protected override buildMatchFilters() {
    return { message_id: this.messageId, ...this.filter };
  }

  // The cursor stays out of the shape: `fetchQueryResponse` applies it.
  protected getNextQueryShape(): QueryMessageMarksRequest {
    return {
      limit: this.pageSize,
      ...(this.filter ? { filter: this.filter } : {}),
    };
  }

  protected override fetchQueryResponse = async ({
    direction,
    queryShape,
  }: PaginationQueryParams<QueryMessageMarksRequest>): Promise<
    PaginationQueryReturnValue<MessageMarkWithUserResponse>
  > => {
    if (direction === 'headward') {
      return { items: [] };
    }

    const next = direction ? (this.cursor?.tailward ?? undefined) : undefined;
    const { marks: items, next: tailward } = await this.client.queryMessageMarks(
      { id: this.messageId },
      { ...(queryShape ?? this.getNextQueryShape()), ...(next ? { next } : {}) },
    );
    return { items, tailward };
  };

  /** The extracting step of the query pipeline: the response is the page. */
  protected override extractQueryPage(
    response: PaginationQueryReturnValue<MessageMarkWithUserResponse>,
    _params: PaginationQueryParams<QueryMessageMarksRequest>,
  ) {
    return response;
  }
}
