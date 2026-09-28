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

/** Per-page query options the thread list has always requested. */
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
  /** The store the list holds its threads in (`client.threads`' thread store). Omitted, it keeps a private one. */
  store?: EntityStore<Thread>;
  paginatorOptions?: PaginatorOptions<Thread, QueryThreadsRequest>;
};

/**
 * The thread list, in the order `queryThreads` returns it.
 *
 * There is deliberately no client-side sort. The server's default order (unread first, then by
 * latest reply) reads state a `Thread` mutates in place, so a comparator over it would corrupt the
 * interval storage on every mark-read or reply. Pages append in server order and a reload replaces
 * the list ({@link ThreadPaginator.reload}).
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
        store,
      }),
      pageSize: DEFAULT_THREAD_PAGE_SIZE,
      ...paginatorOptions,
    });
    this.client = client;
    this.store = store;
  }

  /**
   * No next page until a load has landed (`master`'s `nextCursor: null`), so `toTail()` is a no-op
   * before the first successful reload, e.g. when an empty list fires `onEndReached` on mount.
   */
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

  query = async ({
    queryShape,
  }: PaginationQueryParams<QueryThreadsRequest>): Promise<
    PaginationQueryReturnValue<Thread>
  > => {
    const { threads, next } = await this.client.queryThreadsAndHydrate(queryShape);
    return { items: threads.map(this.toStoredInstance), tailward: next };
  };

  /**
   * The stored instance for a queried thread, so there's one per id. The index upserts, so a second
   * instance would replace the stored one. A stale stored thread is refreshed from the query, unless
   * it's open (active) at which point it reloads itself and this would replace the replies on screen.
   */
  private toStoredInstance = (incoming: Thread): Thread => {
    const stored = this.store.get(incoming.id);
    if (!stored) return incoming;
    if (stored.hasStaleState && !stored.state.getLatestValue().active) {
      stored.hydrateState(incoming);
    }
    return stored;
  };

  filterQueryResults = (threads: Thread[]) => threads;

  /**
   * Re-queries the first page and swaps the list in place, in server order; also the first load. The
   * current threads stay until the response lands, and a failed query leaves them untouched and
   * records `lastQueryError`; a successful one clears it. Like any paginator, the first load publishes
   * `isLoading`; a reload of a loaded list does not, since `isLoading` with items means the next page.
   */
  reload = async ({ limit = this.pageSize }: { limit?: number } = {}) => {
    const isFirstLoad = this.items === undefined;
    if (isFirstLoad) this.state.partialNext({ isLoading: true });
    let replaced = false;
    try {
      const results = await this.runQueryRetryable({
        queryShape: { ...DEFAULT_THREAD_QUERY, limit },
        retryCount: this.config.retryCount,
      });
      if (!results) return;

      // We have to replace here as we can't hold then, since the sorting is server driven
      // and stale ids get replaced (and subsequently evicted from the entity index if no holders
      // exist).
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

  /**
   * Also releases the list's hold on its threads, which the base reset leaves in the index. Released
   * before the base publishes, so a subscriber sees the threads already gone from the registry.
   */
  resetState() {
    this._itemIndex.clear();
    super.resetState();
  }
}
