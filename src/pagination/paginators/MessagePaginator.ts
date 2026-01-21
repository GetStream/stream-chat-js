import type {
  AnyInterval,
  CursorDerivator,
  CursorDeriveResult,
  ExecuteQueryReturnValue,
  Interval,
  PaginationDirection,
  PaginationQueryParams,
  PaginatorCursor,
  PaginatorState,
  PostQueryReconcileParams,
} from './BasePaginator';
import {
  BasePaginator,
  isLogicalInterval,
  type PaginationQueryReturnValue,
  type PaginationQueryShapeChangeIdentifier,
  type PaginatorOptions,
  ZERO_PAGE_CURSOR,
} from './BasePaginator';
import type {
  AscDesc,
  LocalMessage,
  MessagePaginationOptions,
  PinnedMessagePaginationOptions,
} from '../../types';
import type { Channel } from '../../channel';
import { StateStore } from '../../store';
import { formatMessage, generateUUIDv4 } from '../../utils';
import { makeComparator } from '../sortCompiler';
import type { FieldToDataResolver } from '../types.normalization';
import { resolveDotPathValue } from '../utility.normalization';
import { ItemIndex } from '../ItemIndex';
import { deriveCreatedAtAroundPaginationFlags } from '../cursorDerivation';
import { deriveIdAroundPaginationFlags } from '../cursorDerivation/idAroundPaginationFlags';
import { deriveLinearPaginationFlags } from '../cursorDerivation/linearPaginationFlags';

export type JumpToMessageOptions = { pageSize?: number };

export type MessagePaginatorSort = { created_at: AscDesc } | { created_at: AscDesc }[];

export type MessagePaginatorFilter = {
  cid: string;
};

const DEFAULT_BACKEND_SORT: MessagePaginatorSort = {
  created_at: 1,
};

// server's default size is 100
const DEFAULT_CHANNEL_MESSAGE_LIST_PAGE_SIZE = 100;

export type MessagePaginatorState = PaginatorState<LocalMessage>;
export type MessageQueryShape = MessagePaginationOptions | PinnedMessagePaginationOptions;

/**
 * At the moment all the pagination parameters are just different types of cursors, e.g.
 * id_lt, id_gt, ...
 * But we always paginate within the same list without changing the sorting params.
 * It is currently not possible to change the sorting params.
 */
const hasPaginationQueryShapeChanged: PaginationQueryShapeChangeIdentifier<
  MessageQueryShape
> = () => false;

const dataFieldFilterResolver: FieldToDataResolver<LocalMessage> = {
  matchesField: () => true,
  resolve: (message, path) => resolveDotPathValue(message, path),
};

export type MessagePaginatorOptions = {
  channel: Channel;
  id?: string;
  itemIndex?: ItemIndex<LocalMessage>;
  paginatorOptions?: PaginatorOptions<LocalMessage, MessageQueryShape>;
  /**
   * Controls whether `jumpToTheFirstUnreadMessage()` should prefer the `unreadStateSnapshot`
   * state over `channel.state.read[...]`.
   *
   * - 'snapshot' (default): retrieve the first unread message id from the unreadStateSnapshot state when jumping to the first unread message
   * - 'read-state-only': retrieve the last read message id from the channel read state when jumping to the first unread message
   */
  unreadReferencePolicy?: 'snapshot' | 'read-state-only';
};

export type UnreadSnapshotState = {
  lastReadAt: Date | null;
  unreadCount: number;
  /**
   * Snapshot of the first unread message id for the user.
   * This is intentionally decoupled from `channel.state.read[...]` because apps
   * may mark the channel read immediately on open, while still wanting to render
   * UI indicators that jump to the previously-unread location.
   */
  firstUnreadMessageId: string | null;
  /**
   * Snapshot of the last read message id for the user (fallback when first unread
   * is not known).
   */
  lastReadMessageId: string | null;
};

/**
 * MessagePaginator does not allow for sorting or filtering the items, because it is based on channe.query() and
 * not client.search() calls. So the paginator just updates the cursor.
 */
export class MessagePaginator extends BasePaginator<LocalMessage, MessageQueryShape> {
  private readonly _id: string;
  private channel: Channel;
  private unreadReferencePolicy: 'snapshot' | 'read-state-only';
  /**
   * Independent unread reference state (not tied to `channel.state.read`).
   * Consumers may set this right before calling markRead / when opening a channel.
   */
  readonly unreadStateSnapshot: StateStore<UnreadSnapshotState>;
  protected _sort = DEFAULT_BACKEND_SORT;
  protected _nextQueryShape: MessageQueryShape | undefined;
  sortComparator: (a: LocalMessage, b: LocalMessage) => number;
  /**
   * Single source of truth for whether a message should be included in paginator intervals/state.
   * Keep this consistent with `filterQueryResults` AND cursor flag derivation.
   */
  shouldIncludeMessageInInterval(message: LocalMessage): boolean {
    return !message.shadowed;
  }

  protected get intervalItemIdsAreHeadFirst(): boolean {
    // Messages are stored in chronological order (created_at asc) within an interval.
    // Pagination "head" (newest side) is therefore at the END of the `itemIds` array.
    return false;
  }

  protected get intervalSortDirection(): 'asc' | 'desc' {
    // Head edge is newest, but sortComparator is created_at asc => newer head edges
    // should come first => reverse interval ordering.
    return 'desc';
  }

  constructor({
    channel,
    id,
    itemIndex = new ItemIndex({ getId: (item) => item.id }),
    paginatorOptions,
    unreadReferencePolicy = 'snapshot',
  }: MessagePaginatorOptions) {
    super({
      hasPaginationQueryShapeChanged,
      initialCursor: ZERO_PAGE_CURSOR,
      itemIndex,
      ...paginatorOptions,
      pageSize: paginatorOptions?.pageSize ?? DEFAULT_CHANNEL_MESSAGE_LIST_PAGE_SIZE,
    });
    this.config.deriveCursor = makeDeriveCursor(this);
    this.channel = channel;
    this._id = id ?? `message-paginator-${generateUUIDv4()}`;
    this._sort = DEFAULT_BACKEND_SORT;
    this.unreadReferencePolicy = unreadReferencePolicy;
    this.unreadStateSnapshot = new StateStore<UnreadSnapshotState>({
      lastReadAt: null,
      firstUnreadMessageId: null,
      lastReadMessageId: null,
      unreadCount: 0,
    });
    this.sortComparator = makeComparator<LocalMessage, MessagePaginatorSort>({
      sort: this._sort,
      resolvePathValue: resolveDotPathValue,
      tiebreaker: (l, r) => {
        const leftId = this.getItemId(l);
        const rightId = this.getItemId(r);
        return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
      },
    });
    this.setFilterResolvers([dataFieldFilterResolver]);
  }

  get id() {
    return this._id;
  }

  get sort() {
    return this._sort ?? DEFAULT_BACKEND_SORT;
  }

  /**
   * Even though we do not send filters object to the server, we need to have filters for client-side item ingestion logic.
   */
  buildFilters = (): MessagePaginatorFilter => ({
    cid: this.channel.cid,
  });

  // invoked inside BasePaginator.executeQuery() to keep it as a query descriptor;
  protected getNextQueryShape({
    direction,
  }: Omit<
    PaginationQueryParams<MessageQueryShape>,
    'isFirstPageQuery'
  >): MessageQueryShape {
    return {
      limit: this.pageSize,
      [direction === 'tailward' ? 'id_lt' : 'id_gt']:
        direction && this.cursor?.[direction],
    };
  }

  getCursorFromQueryResults = ({
    direction,
    items,
  }: {
    direction?: PaginationDirection;
    items: LocalMessage[];
  }) => {
    if (!items.length) {
      return {
        tailward: undefined,
        headward: undefined,
      };
    }

    const start = items[0];
    const end = items[items.length - 1];

    // Newer side is the pagination head for messages. Which bound is considered "head"
    // is determined by intervalItemIdsAreHeadFirst (see BasePaginator.getIntervalPaginationEdges).
    const head = this.intervalItemIdsAreHeadFirst ? start : end;
    const tail = this.intervalItemIdsAreHeadFirst ? end : start;

    // if there is no direction, then we are jumping, and we want to set both directions in the cursor
    return {
      tailward: !direction || direction === 'tailward' ? this.getItemId(tail) : undefined,
      headward: !direction || direction === 'headward' ? this.getItemId(head) : undefined,
    };
  };

  query = async ({
    direction,
  }: PaginationQueryParams<MessageQueryShape>): Promise<
    PaginationQueryReturnValue<LocalMessage>
  > => {
    // get the params only if they were not generated previously
    if (!this._nextQueryShape) {
      this._nextQueryShape = this.getNextQueryShape({ direction });
    }

    const options = this._nextQueryShape;
    let items: LocalMessage[];
    let tailward: string | undefined;
    let headward: string | undefined;
    if (this.config.doRequest) {
      const result = await this.config.doRequest(options);
      items = result?.items ?? [];
      // if there is no direction, then we are jumping, and we want to set both directions in the cursor
      tailward =
        !direction || direction === 'tailward'
          ? (result.cursor?.tailward ?? undefined)
          : undefined;
      headward =
        !direction || direction === 'headward'
          ? (result.cursor?.headward ?? undefined)
          : undefined;
    } else {
      const { messages } = await this.channel.query({
        messages: options,
        // todo: why do we query for watchers?
        // watchers: { limit: this.pageSize },
      });
      items = messages.map(formatMessage);
      const cursor = this.getCursorFromQueryResults({ direction, items });
      tailward = cursor.tailward;
      headward = cursor.headward;
    }

    return { items, headward, tailward };
  };

  /**
   * Invokes the super.postQueryReconcile() and takes unread state snapshot on the first page query.
   * The snapshot has to be taken immediately after the query as the viewed channel is marked read immediately after opening it.
   * The snapshot can be used to display unread UI indicators.
   */
  async postQueryReconcile(
    params: PostQueryReconcileParams<LocalMessage, MessageQueryShape>,
  ): Promise<ExecuteQueryReturnValue<LocalMessage>> {
    const result = await super.postQueryReconcile(params);

    // Take unread state snapshot
    const ownUserId = this.channel.getClient().user?.id;
    const ownReadState = ownUserId ? this.channel.state.read[ownUserId] : undefined;
    if (ownReadState && params.isFirstPage) {
      this.setUnreadSnapshot({
        firstUnreadMessageId: null,
        lastReadAt: ownReadState.last_read,
        lastReadMessageId: ownReadState.last_read_message_id,
        unreadCount: ownReadState.unread_messages,
      });
    }
    return result;
  }

  isJumpQueryShape(queryShape: MessageQueryShape): boolean {
    return (
      !!queryShape?.id_around ||
      !!(queryShape as MessagePaginationOptions)?.created_at_around
    );
  }

  jumpToMessage = async (
    messageId: string,
    { pageSize }: JumpToMessageOptions = {},
  ): Promise<boolean> => {
    let localMessage = this.getItem(messageId);
    let interval: AnyInterval | undefined;
    let state: Partial<PaginatorState<LocalMessage>> | undefined;
    if (localMessage) {
      interval = this.locateIntervalForItem(localMessage);
    }

    if (localMessage && interval && !isLogicalInterval(interval)) {
      state = {
        hasMoreHead: interval.hasMoreHead,
        hasMoreTail: interval.hasMoreTail,
        cursor: this.getCursorFromInterval(interval),
        items: this.intervalToItems(interval),
      };
    } else if (!localMessage || !interval || isLogicalInterval(interval)) {
      const result = await this.executeQuery({
        queryShape: { id_around: messageId, limit: pageSize },
        updateState: false,
      });
      localMessage = this.getItem(messageId);
      if (!localMessage || !result || !result.targetInterval) {
        this.channel.getClient().notifications.addError({
          message: 'Jump to message unsuccessful',
          origin: { emitter: 'MessagePaginator.jumpToMessage', context: { messageId } },
          options: { type: 'api:messages:query:failed' },
        });
        return false;
      }
      interval = result.targetInterval;
      state = isLogicalInterval(interval)
        ? result.stateCandidate
        : {
            ...result.stateCandidate,
            hasMoreHead: interval.hasMoreHead,
            hasMoreTail: interval.hasMoreTail,
            // Prefer the cursor derived during postQueryReconcile, but fall back to
            // interval-derived cursor to keep jumps consistent if the stateCandidate
            // is partial.
            cursor: result.stateCandidate.cursor ?? this.getCursorFromInterval(interval),
            items: this.intervalToItems(interval),
          };
    }

    if (!this.isActiveInterval(interval)) {
      this.setActiveInterval(interval, { updateState: false });
      if (state) this.state.partialNext(state);
    }
    return true;
  };

  jumpToTheLatestMessage = async (options?: JumpToMessageOptions): Promise<boolean> => {
    let latestMessageId: string | undefined;
    const intervals = this.itemIntervals;
    if (!(intervals[0] as Interval)?.isHead) {
      // get the first page (in case the pagination has not started at the head)
      await this.executeQuery({ direction: 'headward', updateState: false });
    }

    const headInterval = intervals[0];
    if ((intervals[0] as Interval)?.isHead) {
      latestMessageId = headInterval.itemIds.slice(-1)[0];
    }

    if (!latestMessageId) {
      this.channel.getClient().notifications.addError({
        message: 'Jump to latest message unsuccessful',
        origin: { emitter: 'MessagePaginator.jumpToTheLatestMessage' },
        options: { type: 'api:message:query:failed' },
      });
      return false;
    }

    return await this.jumpToMessage(latestMessageId, options);
  };

  /**
   * Jumps to the unread reference message.
   *
   * IMPORTANT: This intentionally does *not* rely on `channel.state.read[ownUserId]` only,
   * because apps may mark a channel read immediately after opening it, while still
   * wanting to keep "jump to unread" UI indicators alive (based on a snapshot).
   */
  jumpToTheFirstUnreadMessage = async (options?: JumpToMessageOptions) => {
    const ownUserId = this.channel.getClient().user?.id;
    if (!ownUserId) return false;

    const unreadSnapshot =
      this.unreadReferencePolicy === 'snapshot'
        ? this.unreadStateSnapshot.getLatestValue()
        : { firstUnreadMessageId: null, lastReadMessageId: null };
    const firstUnreadFromSnapshot = unreadSnapshot.firstUnreadMessageId;
    const lastReadFromSnapshot = unreadSnapshot.lastReadMessageId;

    const firstUnreadFromReadState =
      this.channel.state.read[ownUserId]?.first_unread_message_id ?? null;
    const lastReadFromReadState =
      this.channel.state.read[ownUserId]?.last_read_message_id ?? null;

    const firstUnreadMessageId = firstUnreadFromSnapshot ?? firstUnreadFromReadState;
    if (firstUnreadMessageId) {
      return await this.jumpToMessage(firstUnreadMessageId, options);
    }

    const lastReadMessageId = lastReadFromSnapshot ?? lastReadFromReadState;
    if (!lastReadMessageId) return false;
    return await this.jumpToMessage(lastReadMessageId, options);
  };

  setUnreadSnapshot = (next: Partial<UnreadSnapshotState>): UnreadSnapshotState => {
    this.unreadStateSnapshot.partialNext(next);
    return this.unreadStateSnapshot.getLatestValue();
  };

  clearUnreadSnapshot = () => {
    this.unreadStateSnapshot.next({
      firstUnreadMessageId: null,
      lastReadMessageId: null,
      lastReadAt: null,
      unreadCount: 0,
    });
  };

  filterQueryResults = (items: LocalMessage[]) =>
    items.filter(this.shouldIncludeMessageInInterval.bind(this));
}

const makeDeriveCursor =
  (paginator: MessagePaginator): CursorDerivator<LocalMessage, MessageQueryShape> =>
  (ctx) => {
    // Not included in the interval (filtered out by MessagePaginator.filterQueryResults).
    //
    // IMPORTANT: We must keep cursor derivation consistent with the ingested interval.
    // The interval is built from the filtered page, but ctx.page contains the raw response.
    // Around/linear derivators compare page edges and lengths against interval.itemIds. If we
    // pass a page that includes locally filtered messages (e.g. shadowed), those comparisons
    // can incorrectly conclude that the page is not at the dataset bounds.
    const pageWithPermittedMessages: LocalMessage[] = [];
    let filteredLocallyCount = 0;
    for (const message of ctx.page) {
      if (!paginator.shouldIncludeMessageInInterval(message)) {
        filteredLocallyCount++;
      } else {
        pageWithPermittedMessages.push(message);
      }
    }

    const requestedPageSizeAfterAdjustment = Math.max(
      0,
      ctx.requestedPageSize - filteredLocallyCount,
    );

    if (
      ctx.interval &&
      ctx.interval.itemIds.length + filteredLocallyCount < ctx.page.length
    ) {
      console.error(
        'error',
        'Corrupted message set state: parent set size < returned page size',
      );
      return {
        cursor: ctx.cursor,
        hasMoreHead: ctx.hasMoreHead,
        hasMoreTail: ctx.hasMoreTail,
      };
    }

    const injectCursor = ({
      hasMoreHead,
      hasMoreTail,
    }: {
      hasMoreHead: boolean;
      hasMoreTail: boolean;
    }): CursorDeriveResult => {
      const cursor: PaginatorCursor = {
        headward: !hasMoreHead ? null : (ctx.interval?.itemIds.slice(-1)[0] ?? null),
        tailward: !hasMoreTail ? null : (ctx.interval?.itemIds[0] ?? null),
      };
      return { cursor, hasMoreHead, hasMoreTail };
    };

    if ((ctx.queryShape as MessagePaginationOptions)?.created_at_around) {
      return injectCursor(
        deriveCreatedAtAroundPaginationFlags<
          LocalMessage,
          MessagePaginationOptions,
          MessagePaginator
        >({
          ...ctx,
          paginator,
          page: pageWithPermittedMessages,
          requestedPageSize: requestedPageSizeAfterAdjustment,
        }),
      );
    } else if (ctx.queryShape?.id_around) {
      return injectCursor(
        deriveIdAroundPaginationFlags({
          ...ctx,
          page: pageWithPermittedMessages,
          requestedPageSize: requestedPageSizeAfterAdjustment,
        }),
      );
    } else {
      return injectCursor(
        deriveLinearPaginationFlags({
          ...ctx,
          page: pageWithPermittedMessages,
          requestedPageSize: requestedPageSizeAfterAdjustment,
        }),
      );
    }
  };
