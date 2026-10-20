import { BasePaginator, ZERO_PAGE_CURSOR } from './BasePaginator';
import type {
  PaginationQueryParams,
  PaginationQueryReturnValue,
  PaginationQueryShapeChangeIdentifier,
  PaginatorOptions,
  PaginatorState,
} from './BasePaginator';
import type { StreamChat } from '../../client';
import { EntityStore } from '../../entityStore/EntityStore';
import { StoreBackedItemIndex } from '../../entityStore/StoreBackedItemIndex';
import type { Thread } from '../../thread';
import type { QueryThreadsRequest } from '../../types';
import { isEqual } from '../../utils/mergeWith/mergeWithCore';

export const DEFAULT_THREAD_PAGE_SIZE = 25;

/** Default query options for every page of the thread list. */
export const DEFAULT_THREAD_QUERY: QueryThreadsRequest = {
  participant_limit: 10,
  reply_limit: 10,
  watch: true,
};

/** What identifies the query, as opposed to which page of it is requested. */
const getQueryIdentity = (queryShape: QueryThreadsRequest | undefined) => {
  if (!queryShape) return queryShape;
  const { limit: _, next: __, prev: ___, ...identity } = queryShape;
  return identity;
};

const hasPaginationQueryShapeChanged: PaginationQueryShapeChangeIdentifier<
  QueryThreadsRequest
> = (prevQueryShape, nextQueryShape) =>
  !isEqual(getQueryIdentity(prevQueryShape), getQueryIdentity(nextQueryShape));

export type ThreadPaginatorOptions = {
  client: StreamChat;
  /** Store holding the list's threads (`client.threads`' thread store). Omitted: a private one. */
  store?: EntityStore<Thread>;
  paginatorOptions?: PaginatorOptions<Thread, QueryThreadsRequest>;
};

/**
 * The thread list, in the order `queryThreads` returns it. There is no client-side sort: the server
 * order (unread first, then latest reply) depends on state a `Thread` mutates in place, so a
 * comparator would corrupt interval storage. Pages append in server order and
 * {@link ThreadPaginator.reload} replaces the list.
 */
export class ThreadPaginator extends BasePaginator<Thread, QueryThreadsRequest> {
  private readonly client: StreamChat;
  private readonly store: EntityStore<Thread>;

  constructor({
    client,
    store = new EntityStore<Thread>({ getEntityId: (thread) => thread.id }),
    paginatorOptions,
  }: ThreadPaginatorOptions) {
    super({
      hasPaginationQueryShapeChanged,
      initialCursor: ZERO_PAGE_CURSOR,
      itemIndex: new StoreBackedItemIndex<Thread>({
        getEntityId: (thread) => thread.id,
        holderName: 'thread-paginator',
        store,
      }),
      pageSize: DEFAULT_THREAD_PAGE_SIZE,
      ...paginatorOptions,
    });
    this.client = client;
    this.store = store;
  }

  /** No next page until a load has landed, so `toTail()` is a no-op before the first reload. */
  get initialState(): PaginatorState<Thread> {
    return {
      ...super.initialState,
      hasMoreTail: false,
    };
  }

  getItemId(thread: Thread): string {
    return thread.id;
  }

  protected getNextQueryShape({
    direction,
  }: Required<
    Pick<PaginationQueryParams<QueryThreadsRequest>, 'direction'>
  >): QueryThreadsRequest {
    const cursor = this.cursor?.[direction] ?? undefined;
    return {
      ...DEFAULT_THREAD_QUERY,
      limit: this.pageSize,
      ...(cursor ? { [direction === 'tailward' ? 'next' : 'prev']: cursor } : {}),
    };
  }

  protected override fetchQueryResponse = async ({
    queryShape,
  }: PaginationQueryParams<QueryThreadsRequest>): Promise<
    PaginationQueryReturnValue<Thread>
  > => {
    const { threads, next } = await this.client.queryThreadsAndHydrate(queryShape);
    return { items: threads.map(this.toStoredInstance), tailward: next };
  };

  /** The extracting step of the query pipeline: the response is the page. */
  protected override extractQueryPage(
    response: PaginationQueryReturnValue<Thread>,
    _params: PaginationQueryParams<QueryThreadsRequest>,
  ) {
    return response;
  }

  /**
   * Keeps one instance per ID (the index upserts, so a second one would replace the stored one). A
   * stale stored thread is hydrated from the query unless it is active: it reloads itself, and
   * hydrating would replace the replies on screen.
   */
  private toStoredInstance = (incoming: Thread): Thread => {
    const stored = this.store.get(incoming.id);
    if (!stored) return incoming;
    if (stored.hasStaleState && !stored.state.getLatestValue().active) {
      stored.hydrateState(incoming);
    }
    return stored;
  };

  /**
   * Re-queries the first page and replaces the list in server order; also the first load. The
   * current threads stay until the response lands. A failed query leaves them and records
   * `lastQueryError`; a success clears it. Only the first load publishes `isLoading` (with items it
   * would mean the next page).
   */
  reload = async ({ limit = this.pageSize }: { limit?: number } = {}) => {
    const isFirstLoad = !this.hasResults;
    if (isFirstLoad) this.state.partialNext({ isLoading: true });
    let replaced = false;
    try {
      const fetchParams = {
        queryShape: { ...DEFAULT_THREAD_QUERY, limit },
        retryCount: this.config.retryCount,
      };
      const response = await this.fetchQueryResponseWithRetries(fetchParams);
      if (!response) return;
      // The query pipeline's steps (see `executeQuery`) with a placing step of its own, below. A
      // thread list's response is its page, so nothing else is left to apply.
      const results = this.extractQueryPage(response, fetchParams);

      // Replace rather than merge (the order is server-driven): IDs absent from the response go.
      const nextIds = new Set(results.items.map((thread) => thread.id));
      this.setIntervals([]);
      this.setActiveInterval(undefined);
      for (const [id] of this._itemIndex.entries()) {
        if (!nextIds.has(id)) this._itemIndex.remove(id);
      }
      this.setItems({
        cursor: { headward: undefined, tailward: results.tailward },
        isFirstPage: true,
        isLastPage: !results.tailward,
        valueOrFactory: results.items,
      });
      replaced = true;
    } finally {
      const clearError = replaced && this.lastQueryError;
      if (isFirstLoad || clearError) {
        this.state.partialNext({
          ...(isFirstLoad ? { isLoading: false } : {}),
          ...(clearError ? { lastQueryError: undefined } : {}),
        });
      }
    }
  };

  /** Also clears the item index (the base reset keeps it), before the base publishes. */
  resetState() {
    this._itemIndex.clear();
    super.resetState();
  }
}
