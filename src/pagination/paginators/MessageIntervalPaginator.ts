import type {
  AnyInterval,
  BasePaginatorConfig,
  CursorDerivator,
  CursorDeriveResult,
  Interval,
  PaginationDirection,
  PaginationQueryParams,
  PaginatorCursor,
  PaginatorState,
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
  LocalMessage,
  MessagePaginationParams,
  PinnedMessagePaginationOptions,
  SortParamRequest,
  TimestampNS,
  UserResponse,
} from '../../types';
import type { Channel } from '../../channel';
import { ChannelWatchStatus } from '../../channel_state';
import { CORE_NOTIFICATION_TYPE } from '../../notifications';
import { StateStore } from '@stream-io/state-store';
import { formatMessage, generateUUIDv4, toDeletedMessage } from '../../utils';
import { makeComparator } from '../sortCompiler';
import type { FieldToDataResolver } from '../types.normalization';
import { resolveDotPathValue } from '../utility.normalization';
import { lowerBound } from '../utility.search';
import type { ItemIndexApi } from '../ItemIndex';
import type { EntityStoreChangeBatch } from '../../entityStore/EntityStore';
import { StoreBackedItemIndex } from '../../entityStore/StoreBackedItemIndex';
import { deriveCreatedAtAroundPaginationFlags } from '../cursorDerivation';
import { deriveIdAroundPaginationFlags } from '../cursorDerivation/idAroundPaginationFlags';
import { deriveLinearPaginationFlags } from '../cursorDerivation/linearPaginationFlags';

export type MessageFocusReason =
  | 'jump-to-message'
  | 'jump-to-first-unread'
  | 'jump-to-latest';

export type MessageFocusSignal = {
  messageId: string;
  reason: MessageFocusReason;
  token: number;
  createdAt: number;
  ttlMs: number;
};

export type MessageFocusSignalState = {
  signal: MessageFocusSignal | null;
};

export type JumpToMessageOptions = {
  pageSize?: number;
  /** Reason attached to the emitted focus signal. Defaults to `jump-to-message`. */
  focusReason?: MessageFocusReason;
  /** TTL of the emitted focus signal in milliseconds. Defaults to `3000`. */
  focusSignalTtlMs?: number;
  /** Suppresses the focus signal after a successful jump. */
  suppressFocusSignal?: boolean;
  /**
   * Also watches the channel (so it receives events) when it is not watched yet. The request that
   * loads the window around the message asks to watch too, so it stays one request, and a message
   * already loaded is loaded again. Ignored for a thread's reply list (its request cannot watch)
   * and when the paginator's `doRequest` loads the messages.
   */
  watchChannel?: boolean;
};

export type MessagePaginatorSort = SortParamRequest[];

export type MessagePaginatorFilter = {
  cid: string;
  parent_id?: string;
};

const DEFAULT_BACKEND_SORT: MessagePaginatorSort = [
  {
    field: 'created_at',
    direction: 1,
  },
];

// server's default size is 100
const DEFAULT_CHANNEL_MESSAGE_LIST_PAGE_SIZE = 100;

export type MessagePaginatorState = PaginatorState<LocalMessage>;
export type MessageQueryShape = MessagePaginationParams | PinnedMessagePaginationOptions;

/** Query shapes are cursors within one list (the sort cannot change), so a change never resets it. */
const hasPaginationQueryShapeChanged: PaginationQueryShapeChangeIdentifier<
  MessageQueryShape
> = () => false;

const dataFieldFilterResolver: FieldToDataResolver<LocalMessage> = {
  matchesField: () => true,
  resolve: (message, path) => resolveDotPathValue(message, path),
};

/** A message's `created_at` (unix nanoseconds), or `null` when absent or not finite. */
export const getMessageCreatedAtTimestamp = (
  message: LocalMessage | null | undefined,
): TimestampNS | null => {
  const timestamp = message?.created_at;
  return typeof timestamp === 'number' && Number.isFinite(timestamp) ? timestamp : null;
};

export type MessagePaginatorOptions = {
  channel: Channel;
  id?: string;
  itemIndex?: ItemIndexApi<LocalMessage>;
  parentMessageId?: string;
  /** Sort sent to the backend messages/replies query. Does not affect in-memory ordering. */
  requestSort?: MessagePaginatorSort;
  /**
   * @deprecated Use `requestSort` instead.
   */
  sort?: MessagePaginatorSort;
  /** In-memory ordering of the items exposed by paginator state. */
  itemOrder?: MessagePaginatorSort;
  paginatorOptions?: PaginatorOptions<LocalMessage, MessageQueryShape>;
};

/**
 * Options for {@link MessageIntervalPaginator.mergeNewestPage} that enable reconciling messages
 * hard-deleted while the client was offline (no event reaches other clients). With no options it
 * prunes loaded messages inside `page`'s `created_at` span that are absent from it, which is always
 * safe: a live arrival is newer than `page`'s newest message. `candidateIds` widens reconciliation
 * at the top edge; `requestedLimit` only tunes `hasMoreTail`.
 */
export type MergeNewestPageOptions = {
  /**
   * The `limit` of the query that produced `page`, used only to derive `hasMoreTail`. Trusted only
   * when not larger than the paginator's `pageSize` (see
   * {@link MessageIntervalPaginator.pageReachedChannelStart}): a larger over-request (e.g.
   * `channel.reload`) may have been server-capped.
   */
  requestedLimit?: number;
  /**
   * Loaded message ids snapshotted before the caller's fetch await. Needed to prune a hard-deleted
   * message newer than `page`'s newest and to reconcile an empty `page`: at or above that edge only
   * the pre-fetch snapshot tells a just-deleted message from one that arrived live during the fetch.
   */
  candidateIds?: ReadonlySet<string>;
};

/** Options for {@link MessageIntervalPaginator.seedFirstPageSync}, the channel-open seed. */
export type SeedFirstPageOptions = {
  /**
   * When true and the paginator was already seeded, folds the page in via
   * {@link MessageIntervalPaginator.mergeNewestPage} instead of a plain first-page ingest, so
   * `channel.reload`, the channel-list hydrate and connection recovery share one reconciling path.
   * Leave false for the pinned list (different sort). No-op on a cold open.
   */
  reconcile?: boolean;
  /**
   * Message ids snapshotted before the caller's network await, forwarded to
   * {@link MergeNewestPageOptions.candidateIds}. Only used when {@link reconcile} is set.
   */
  candidateIds?: ReadonlySet<string>;
};

/**
 * A message list with a configurable backend request sort and a stable in-memory item order.
 * Ingested items are filtered only by local predicates (`filterQueryResults`).
 */
export class MessageIntervalPaginator extends BasePaginator<
  LocalMessage,
  MessageQueryShape
> {
  /**
   * Holder name of this list's index in the message store. A getter, so a subclass's value is in
   * place while the base constructor builds the index.
   */
  protected get holderName() {
    return 'message-interval-paginator';
  }

  declare state: StateStore<MessagePaginatorState>;
  private readonly _id: string;
  /** The channel this list belongs to. A thread's reply list holds its parent channel. */
  readonly channel: Channel;
  /** Set when this is a thread's reply list, to the parent message's id. */
  readonly parentMessageId?: string;
  readonly messageFocusSignal: StateStore<MessageFocusSignalState>;
  private clearMessageFocusSignalTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private messageFocusSignalToken = 0;
  protected _requestSort = DEFAULT_BACKEND_SORT;
  protected _itemOrder: MessagePaginatorSort = DEFAULT_BACKEND_SORT;
  protected _nextQueryShape: MessageQueryShape | undefined;
  /** Pending below-window reached-start probe (exposed so tests can await it). */
  private _belowWindowReconcile?: Promise<void>;
  sortComparator: (a: LocalMessage, b: LocalMessage) => number;
  /**
   * Whether a message belongs in intervals and state. Keep it consistent with `filterQueryResults`
   * and cursor flag derivation.
   */
  shouldIncludeMessageInInterval(message: LocalMessage): boolean {
    return !message.shadowed;
  }

  onEntitiesChanged({ changedIds }: EntityStoreChangeBatch): void {
    this.reconcileChangedIds(changedIds);
  }

  onEntityRemoved(id: string, message: unknown): void {
    this.removeItem({ id, item: message as LocalMessage });
  }

  /** Entity-store subscriber flush after an optimistic (local-user) write: skips the throttle. */
  flushState(): void {
    this.flushPendingPublishes();
  }

  /** UI-driven "hold off on pruning" signal ({@link setPruningSuspended}). Off by default. */
  protected get isPruningSuspended(): boolean {
    return this._pruningSuspended;
  }

  private _pruningSuspended = false;

  /**
   * Holds off dropping the oldest loaded messages, so pruning does not pull content from under a user
   * reading near them: the window may grow past `maxLoadedItems` until they scroll back. A plain
   * field, not a `StateStore`: nothing observes it and a scroll-driven signal must not cost a render.
   */
  setPruningSuspended = (suspended: boolean) => {
    this._pruningSuspended = suspended;
  };

  /**
   * A message anchors pagination once the server has acknowledged it. This keeps an unsent message
   * out of both halves of a prune and stops its id from becoming the tailward cursor (`id_lt`).
   */
  protected isPaginationAnchorable(item: LocalMessage | undefined): boolean {
    return !!item && this.isServerConfirmedMessage(item);
  }

  protected get intervalItemIdsAreHeadFirst(): boolean {
    // Intervals hold messages in `created_at` ascending order: the head (newest) is at the END.
    return false;
  }

  protected get intervalSortDirection(): 'asc' | 'desc' {
    // `sortComparator` is `created_at` ascending but newer head edges must come first.
    return 'desc';
  }

  constructor(
    {
      channel,
      id,
      itemIndex,
      parentMessageId,
      requestSort,
      sort,
      itemOrder,
      paginatorOptions,
    }: MessagePaginatorOptions,
    builtInDefaults: Partial<BasePaginatorConfig<LocalMessage, MessageQueryShape>> = {},
  ) {
    const resolvedRequestSort = requestSort ?? sort ?? DEFAULT_BACKEND_SORT;
    const resolvedItemOrder = itemOrder ?? resolvedRequestSort;
    super(
      {
        itemIndex,
        ...paginatorOptions,
        // Backed by the client's message store: a message held in several lists has one canonical
        // copy and updates fan out to all holders. Without a store (e.g. a detached paginator in a
        // test) the index is private. Overridable via `paginatorOptions.createItemIndex`/`itemIndex`.
        createItemIndex:
          paginatorOptions?.createItemIndex ??
          ((owner) =>
            new StoreBackedItemIndex<LocalMessage>({
              store: channel.getClient?.().messageStore,
              owner: owner as MessageIntervalPaginator,
              getEntityId: owner.getItemId.bind(owner),
              holderName: (owner as MessageIntervalPaginator).holderName,
            })),
      },
      // SDK defaults: a declarative registration (`client.config.set({ messagePaginator })`) wins.
      {
        hasPaginationQueryShapeChanged,
        initialCursor: ZERO_PAGE_CURSOR,
        pageSize: DEFAULT_CHANNEL_MESSAGE_LIST_PAGE_SIZE,
        ...builtInDefaults,
      },
    );
    this.channel = channel;
    this.parentMessageId = parentMessageId;
    this._id = id ?? `message-paginator-${generateUUIDv4()}`;
    this._requestSort = resolvedRequestSort;
    this._itemOrder = resolvedItemOrder;
    this.messageFocusSignal = new StateStore<MessageFocusSignalState>({
      signal: null,
    });
    this.sortComparator = makeComparator<LocalMessage>({
      sort: this._requestSort,
      resolvePathValue: resolveDotPathValue,
      tiebreaker: (l, r) => {
        const leftId = this.getItemId(l);
        const rightId = this.getItemId(r);
        return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
      },
    });
    this.installIntervalBehaviour();
    this.setFilterResolvers([dataFieldFilterResolver]);
  }

  /**
   * Memoized: `initializeConfig` folds it in and skips the publish when nothing moved, which needs
   * stable references. Safe to build once: `_itemOrder` is set in the constructor, with no setter.
   */
  private intervalBehaviour?: Partial<
    BasePaginatorConfig<LocalMessage, MessageQueryShape>
  >;

  private buildIntervalBehaviour(): Partial<
    BasePaginatorConfig<LocalMessage, MessageQueryShape>
  > {
    if (!this.intervalBehaviour) {
      this.intervalBehaviour = {
        deriveCursor: makeDeriveCursor(this),
        itemOrderComparator: makeComparator<LocalMessage>({
          sort: this._itemOrder,
          resolvePathValue: resolveDotPathValue,
          tiebreaker: (l, r) => {
            const leftId = this.getItemId(l);
            const rightId = this.getItemId(r);
            return leftId < rightId ? -1 : leftId > rightId ? 1 : 0;
          },
        }),
      };
    }
    return this.intervalBehaviour;
  }

  /**
   * Installs cursor derivation and item ordering on `config` through the base derivation
   * ({@link BasePaginator.getBehaviourOverrides}), so one re-derivation is one publish.
   */
  protected override getBehaviourOverrides(): Partial<
    BasePaginatorConfig<LocalMessage, MessageQueryShape>
  > {
    return this.buildIntervalBehaviour();
  }

  /**
   * The constructor's route to the same overlay. It calls the private builder, not the overridable
   * hook, which would run a subclass override before its fields are initialized.
   */
  protected installIntervalBehaviour(): void {
    this.updateConfig(this.buildIntervalBehaviour());
  }

  get id() {
    return this._id;
  }

  get sort() {
    return this._requestSort ?? DEFAULT_BACKEND_SORT;
  }

  get requestSort() {
    return this._requestSort ?? DEFAULT_BACKEND_SORT;
  }

  get itemOrder() {
    return this._itemOrder ?? this._requestSort ?? DEFAULT_BACKEND_SORT;
  }

  /** Not sent to the server: drives client-side item ingestion. */
  buildMatchFilters = (): MessagePaginatorFilter => ({
    cid: this.channel.cid,
    ...(this.parentMessageId ? { parent_id: this.parentMessageId } : {}),
  });

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

    const head = this.intervalItemIdsAreHeadFirst ? start : end;
    const tail = this.intervalItemIdsAreHeadFirst ? end : start;

    // Without a direction this is a jump: set both cursors.
    return {
      tailward: !direction || direction === 'tailward' ? this.getItemId(tail) : undefined,
      headward: !direction || direction === 'headward' ? this.getItemId(head) : undefined,
    };
  };

  /**
   * Reads `requestOptions.watch`: `true` also watches the channel with the request. Ignored for a
   * thread's reply list and with `doRequest`.
   */
  query = async ({
    direction,
    requestOptions,
  }: PaginationQueryParams<MessageQueryShape>): Promise<
    PaginationQueryReturnValue<LocalMessage>
  > => {
    if (!this._nextQueryShape) {
      this._nextQueryShape = this.getNextQueryShape({ direction });
    }

    const options = this._nextQueryShape;
    let items: LocalMessage[];
    let tailward: string | undefined;
    let headward: string | undefined;
    if (this.config.doRequest) {
      const result = await this.config.doRequest(options);
      items = this.getCanonicalQueryItems(result?.items ?? []);
      // Without a direction this is a jump: set both cursors.
      tailward =
        !direction || direction === 'tailward'
          ? (result.cursor?.tailward ?? undefined)
          : undefined;
      headward =
        !direction || direction === 'headward'
          ? (result.cursor?.headward ?? undefined)
          : undefined;
    } else {
      const { messages } = this.parentMessageId
        ? await this.channel
            .getClient()
            .getReplies(
              { parent_id: this.parentMessageId },
              { ...options, sort: this.requestSort },
            )
        : await this.channel.query({
            messages: options as MessagePaginationParams,
            ...(requestOptions?.watch === true && { watch: true }),
            // todo: why do we query for watchers?
            // watchers: { limit: this.pageSize },
          });
      items = this.getCanonicalQueryItems(messages.map(formatMessage));
      const cursor = this.getCursorFromQueryResults({ direction, items });
      tailward = cursor.tailward;
      headward = cursor.headward;
    }

    return { items, headward, tailward };
  };

  /**
   * Seeds the paginator with the page a channel-open query just fetched (`Channel.query` with
   * `watch`/`create`, `client.hydrateChannels`). Those paths hydrate the read state in the same
   * synchronous tick (`Channel._initializeState`), and the read patch drives
   * `MessageReceiptsTracker`, which resolves cursors against this paginator
   * (`findItemByTimestamp`) when the server omits the message ids, so the paginator must be
   * populated first. First-page reconciliation also takes the unread snapshot.
   *
   * The page is not always the latest window: a channel can open around a message (`id_around` /
   * `created_at_around`), so the original pagination options are passed as the query shape and
   * `postQueryReconcile` applies jump semantics instead of flagging the window as the newest page.
   */
  seedFirstPageSync(
    messages: LocalMessage[],
    requestedPageSize: number,
    messagePaginationOptions?: MessagePaginationParams,
    options?: SeedFirstPageOptions,
  ) {
    const queryShape: MessageQueryShape = {
      ...messagePaginationOptions,
      limit: requestedPageSize,
    };
    const isJump = this.isJumpQueryShape(queryShape);

    // A list loaded empty has no interval to reconcile against (the merge would drop the page), so
    // it seeds like a first open.
    if (
      options?.reconcile &&
      !isJump &&
      typeof this.items !== 'undefined' &&
      this.itemIntervals.length > 0
    ) {
      // Clears a stale query error, as `postQueryReconcile` does on the branch below (skipped here).
      if (this.state.getLatestValue().lastQueryError) {
        this.state.partialNext({ lastQueryError: undefined });
      }
      this.mergeNewestPage(messages, {
        candidateIds: options.candidateIds,
        requestedLimit: requestedPageSize,
      });
      return;
    }

    this.postQueryReconcile({
      // A jump/around page spans both directions; a plain latest page paginates tailward (older).
      direction: isJump ? undefined : 'tailward',
      isFirstPage: true,
      queryShape,
      requestedPageSize,
      results: {
        items: messages,
        headward: isJump ? messages[messages.length - 1]?.id : undefined,
        tailward: messages[0]?.id,
      },
    });
  }

  isJumpQueryShape(queryShape: MessageQueryShape): boolean {
    return (
      !!queryShape?.id_around ||
      !!(queryShape as MessagePaginationParams)?.created_at_around
    );
  }

  /** A jump sends its own `limit`: head/tail flags are derived against it, not `pageSize`. */
  protected override getRequestedPageSize(
    queryShape: MessageQueryShape | undefined,
  ): number {
    return queryShape && this.isJumpQueryShape(queryShape)
      ? (queryShape.limit ?? this.pageSize)
      : this.pageSize;
  }

  jumpToMessage = async (
    messageId: string,
    {
      focusReason,
      focusSignalTtlMs,
      pageSize,
      suppressFocusSignal,
      watchChannel,
    }: JumpToMessageOptions = {},
  ): Promise<boolean> => {
    const watch =
      !!watchChannel &&
      !this.parentMessageId &&
      !this.config.doRequest &&
      this.channel.watchStatus !== ChannelWatchStatus.Watching;
    let localMessage = this.getItem(messageId);
    let interval: AnyInterval | undefined;
    let state: Partial<PaginatorState<LocalMessage>> | undefined;
    if (localMessage) {
      interval = this.locateIntervalForItem(localMessage);
      if (
        interval &&
        !isLogicalInterval(interval) &&
        !interval.itemIds.includes(messageId)
      ) {
        // The range match can return an interval that spans the target without holding it (a
        // neighbour grew across its position): use the one that holds the id, or the jump may no-op.
        interval = this.itemIntervals.find(
          (candidate) =>
            !isLogicalInterval(candidate) && candidate.itemIds.includes(messageId),
        );
      }
    }

    // a loaded message needs no request, unless the jump is also to watch the channel
    if (!watch && localMessage && interval && !isLogicalInterval(interval)) {
      state = {
        hasMoreHead: interval.hasMoreHead,
        hasMoreTail: interval.hasMoreTail,
        cursor: this.getCursorFromInterval(interval),
        items: this.intervalToItems(interval),
      };
    } else {
      const result = await this.executeQuery({
        // Always send a limit: the replies endpoint ignores `id_around` without one.
        queryShape: { id_around: messageId, limit: pageSize ?? this.pageSize },
        ...(watch && { requestOptions: { watch: true } }),
        updateState: false,
      });
      localMessage = this.getItem(messageId);
      if (!localMessage || !result || !result.targetInterval) {
        this.channel.getClient().notifications.addError({
          message: 'Jump to message unsuccessful',
          origin: { emitter: 'MessagePaginator.jumpToMessage', context: { messageId } },
          options: { type: CORE_NOTIFICATION_TYPE.messageJumpFailed },
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
            // Falls back to the interval-derived cursor when the stateCandidate is partial.
            cursor: result.stateCandidate.cursor ?? this.getCursorFromInterval(interval),
            items: this.intervalToItems(interval),
          };
    }

    if (!this.isActiveInterval(interval)) {
      this.setActiveInterval(interval, { updateState: false });
    }
    if (state) this.state.partialNext(state);
    if (!suppressFocusSignal) {
      this.emitMessageFocusSignal({
        messageId,
        reason: focusReason ?? 'jump-to-message',
        ttlMs: focusSignalTtlMs,
      });
    }
    return true;
  };

  jumpToTheLatestMessage = async (options?: JumpToMessageOptions): Promise<boolean> => {
    let latestMessageId: string | undefined;
    if (!(this.itemIntervals[0] as Interval)?.isHead) {
      // Load the newest page when on an older window (a short headward response marks the head).
      await this.executeQuery({ direction: 'headward', updateState: false });
    }

    // Re-read after the query: `itemIntervals` returns a fresh array on each call.
    const headInterval = this.itemIntervals[0] as Interval | undefined;
    if (headInterval?.isHead) {
      latestMessageId = headInterval.itemIds.slice(-1)[0];
    }

    if (!latestMessageId) {
      this.channel.getClient().notifications.addError({
        message: 'Jump to latest message unsuccessful',
        origin: { emitter: 'MessagePaginator.jumpToTheLatestMessage' },
        options: { type: CORE_NOTIFICATION_TYPE.messageJumpToLatestFailed },
      });
      return false;
    }

    return await this.jumpToMessage(latestMessageId, {
      suppressFocusSignal: true,
      ...options,
      focusReason: 'jump-to-latest',
    });
  };

  /**
   * Folds an already fetched newest (head) page into the loaded items without a query. A page that
   * shares an id with the loaded head merges in place (reconciling by id, appending new items,
   * keeping older pages), sets the tail boundary via {@link pageReachedChannelStart} and runs
   * {@link reconcileHeadAgainstPage}. A disjoint page would weld the two across a gap, so the
   * loaded set is rebuilt from it as a fresh head (`hasMoreTail: true`) and the gap loads when
   * paginating older.
   *
   * No-op unless the head interval is loaded and in view (or only live content is loaded, which the
   * page then anchors). When the caller jumped to an older window only offline hard-deletes are
   * pruned from the hidden head. An empty page never wipes the list, except that with
   * `options.candidateIds` it reads as "the channel has no messages". The query shape is recorded
   * on every exit (see `recordLoadedWindowQueryShape`).
   *
   * @param page - The fetched newest window (may be empty). Ingest normalizes `created_at` order.
   */
  mergeNewestPage = (page: LocalMessage[], options?: MergeNewestPageOptions) => {
    this._mergeNewestPage(page, options);
    this.recordLoadedWindowQueryShape();
  };

  private _mergeNewestPage = (page: LocalMessage[], options?: MergeNewestPageOptions) => {
    const headInterval = this.itemIntervals[0] as Interval | undefined;
    if (!headInterval?.isHead) {
      // Only live content is loaded (e.g. the first query came back empty and the user's reply went
      // to the logical head): anchor it so `ingestPage` folds the overlapping logical intervals in,
      // else the window never catches up. Only `liveHeadLogical` qualifies, not `itemIntervals[0]`
      // (a head by convention only). With nothing loaded, seeding is `postQueryReconcile`'s job.
      const logicalHead = this.liveHeadLogical;
      const hasAnchoredHead = this.itemIntervals.some(
        (interval) => !isLogicalInterval(interval) && interval.isHead,
      );
      if (!logicalHead || hasAnchoredHead || !page?.length) return;

      // Take over the view only if the reader is on the live content being absorbed: if they
      // jumped to another interval, anchor for their return and leave them there.
      const takeOverView = this.isActiveInterval(logicalHead);

      const anchored = this.ingestPage({ page, isHead: true, setActive: false });
      if (!anchored || !takeOverView) return;

      const hasMoreTail = !this.pageReachedChannelStart(page, options);
      anchored.hasMoreTail = hasMoreTail;
      anchored.isTail = !hasMoreTail;

      this.setActiveInterval(anchored, { updateState: false });
      this.state.partialNext({
        items: this.intervalToItems(anchored),
        hasMoreHead: false,
        hasMoreTail,
        cursor: {
          headward: null,
          tailward: hasMoreTail ? (anchored.itemIds[0] ?? null) : null,
        },
      });
      return;
    }
    // Inputs for the below-window probe, captured before the merge overwrites state.
    const wasAtChannelStart = !this.state.getLatestValue().hasMoreTail;
    const preMergeLoadedCount = headInterval.itemIds.length;
    // The caller jumped to an older window and the head is merely loaded underneath. Do not merge
    // or switch the view (that would yank them to the newest), but still prune offline hard-deletes
    // from the hidden head, or scroll-to-latest later surfaces ghosts.
    if (!this.isActiveInterval(headInterval)) {
      this.reconcileHeadAgainstPage(page, options);
      return;
    }

    if (!page?.length) {
      // An empty page never blanks the list: only with a pre-fetch snapshot is it read as "channel
      // emptied" (the snapshot excludes messages that arrived live during the fetch).
      this.reconcileHeadAgainstPage([], options);
      return;
    }

    const loadedIds = new Set(headInterval.itemIds);
    const overlapsLoadedHead = page.some((item) => loadedIds.has(this.getItemId(item)));

    if (!overlapsLoadedHead) {
      // Disjoint: rebuild from the page as a fresh newest slice. Clearing the intervals first keeps
      // `ingestPage` from merging across the gap, and the cursor at the page's oldest item keeps
      // "load older" contiguous.
      this.setIntervals([]);
      this.setActiveInterval(undefined);
      const resetInterval = this.ingestPage({
        page,
        isHead: true,
        // The loaded head was entirely older than this window, so older data (the gap) always exists.
        isTail: false,
        setActive: false,
      });
      if (!resetInterval) return;
      this.setActiveInterval(resetInterval, { updateState: false });
      this.state.partialNext({
        items: this.intervalToItems(resetInterval),
        cursor: this.getCursorFromInterval(resetInterval),
        hasMoreHead: resetInterval.hasMoreHead,
        hasMoreTail: resetInterval.hasMoreTail,
      });
      return;
    }

    const interval = this.ingestPage({ page, isHead: true, setActive: false });
    if (!interval) return;

    // Only a request bounded by our own pageSize proves (by a short page) that the channel start was
    // reached; an over-request may have been server-capped, so it biases to `true`. This decides only
    // the "load older" affordance, never removes a message. `isTail` mirrors it, which also clears a
    // stale offline-DB `isTail: true` and stops `intervalsOverlap` welding a far page across a gap.
    const hasMoreTail = !this.pageReachedChannelStart(page, options);
    interval.hasMoreTail = hasMoreTail;
    interval.isTail = !hasMoreTail;

    this.setActiveInterval(interval, { updateState: false });
    this.state.partialNext({
      items: this.intervalToItems(interval),
      hasMoreHead: false,
      hasMoreTail,
      // The oldest loaded id (ids are `created_at` ascending), `null` at the channel start.
      cursor: {
        headward: null,
        tailward: hasMoreTail ? (interval.itemIds[0] ?? null) : null,
      },
    });

    const belowWindow = this.reconcileHeadAgainstPage(page, options);

    // The leftovers are ambiguous (hard-deleted oldest vs server-capped over-request). Only a
    // full-window reload (`requestedLimit >= loaded`, not the small list hydrate) that believed it
    // was at the start can settle them: probe then, otherwise skip.
    const requestedLimit = options?.requestedLimit;
    if (
      belowWindow.length &&
      wasAtChannelStart &&
      typeof requestedLimit === 'number' &&
      requestedLimit >= preMergeLoadedCount
    ) {
      this._belowWindowReconcile = this.pruneBelowWindowIfReachedStart(
        belowWindow,
        this.getItemId(page[0]),
      );
    }
  };

  /**
   * Whether `page` proves it reached the channel's oldest message: the request was bounded by this
   * paginator's own `pageSize` (so a short page means the end). A larger over-request (e.g.
   * `channel.reload`) may have been server-capped and never proves it. Only gates `hasMoreTail`.
   */
  private pageReachedChannelStart(
    page: LocalMessage[],
    options?: MergeNewestPageOptions,
  ): boolean {
    const requestedLimit = options?.requestedLimit;
    return (
      typeof requestedLimit === 'number' &&
      requestedLimit <= this.pageSize &&
      page.length < requestedLimit
    );
  }

  /**
   * Settles the below-window leftovers {@link reconcileHeadAgainstPage} returned (loaded messages
   * older than `anchorId`, the page's oldest, and absent from it): from the page alone a
   * hard-deleted oldest looks like a server-capped over-request. It asks the server whether anything
   * is older than `anchorId`; if not, they are real deletes and are removed and the tail settled. A
   * probe failure or a head change across the await keeps them. The caller decides when this runs.
   */
  private async pruneBelowWindowIfReachedStart(
    belowWindow: string[],
    anchorId: string,
  ): Promise<void> {
    const headId = (this.itemIntervals[0] as Interval | undefined)?.id;
    // Something older exists (or the probe failed): the start is not proven, keep the leftovers.
    if (await this.hasMessagesOlderThan(anchorId).catch(() => true)) return;
    // Revalidate the head across the await (a jump, reset or newer merge aborts).
    const head = this.itemIntervals[0] as Interval | undefined;
    if (!head?.isHead || head.id !== headId) return;
    this.removeReconciledItems(belowWindow);
    head.hasMoreTail = false;
    head.isTail = true;
    if (this.isActiveInterval(head)) {
      this.state.partialNext({
        hasMoreTail: false,
        cursor: { headward: null, tailward: null },
      });
    }
  }

  /** One `limit: 1` fetch of messages older than `id` (channel main list or thread replies). */
  private async hasMessagesOlderThan(id: string): Promise<boolean> {
    const pagination = { limit: 1, id_lt: id } as MessagePaginationParams;
    const { messages } = this.parentMessageId
      ? await this.channel
          .getClient()
          .getReplies({ parent_id: this.parentMessageId }, pagination)
      : await this.channel.query({ messages: pagination });
    return Array.isArray(messages) && messages.length > 0;
  }

  /**
   * Whether a loaded message is server-confirmed, so it may be reconciled away when absent from an
   * authoritative page. Optimistic (`sending`), `failed` and client-side `error` messages are not, so
   * an unsent message is never mistaken for a hard delete.
   */
  protected isServerConfirmedMessage(message: LocalMessage): boolean {
    return (
      message.status !== 'sending' &&
      message.status !== 'failed' &&
      message.type !== 'error'
    );
  }

  /**
   * Destructive half of {@link mergeNewestPage}: removes loaded head-interval messages that `page`
   * (the fresh newest window) proves were hard-deleted while offline, by `created_at`:
   *
   * - within `page`'s span: a server-confirmed message absent from `page` was deleted (a live
   *   arrival is newer than `page`'s newest, so this needs no snapshot);
   * - at or above `page`'s newest, and for an empty `page`: only ids in the pre-fetch `candidateIds`
   *   snapshot, which tells a just-deleted message from a live arrival.
   *
   * Messages below `page`'s oldest are kept (a hard-deleted oldest looks like a server-capped
   * over-request) and returned for {@link pruneBelowWindowIfReachedStart}. Removal goes through
   * {@link removeItem}, so the index, intervals, message store and the {@link MessagePaginator}
   * tracked last message stay correct.
   *
   * @returns the below-window leftover ids. Empty for the no-head and empty-page paths.
   */
  protected reconcileHeadAgainstPage(
    page: LocalMessage[],
    options?: MergeNewestPageOptions,
  ): string[] {
    const headInterval = this.itemIntervals[0] as Interval | undefined;
    if (!headInterval?.isHead) return [];

    const loadedIds = headInterval.itemIds;
    const candidateIds = options?.candidateIds;

    // Empty page: the channel has no messages. Only ids from the pre-fetch snapshot are removed, so a
    // message that landed during the fetch survives.
    if (!page.length) {
      if (!candidateIds) return [];
      const toRemove = loadedIds.filter((id) => {
        if (!candidateIds.has(id)) return false;
        const message = this.getItem(id);
        return !!message && this.isServerConfirmedMessage(message);
      });
      this.removeReconciledItems(toRemove);
      return [];
    }

    const pageIds = new Set(page.map((message) => this.getItemId(message)));
    const newestReturnedTs = getMessageCreatedAtTimestamp(page[page.length - 1]);
    const oldestReturnedTs = getMessageCreatedAtTimestamp(page[0]);

    // Nothing below the page's oldest is removed here: those go to `belowWindow` for the probe.
    const windowLowTs = oldestReturnedTs ?? Number.POSITIVE_INFINITY;

    const toRemove: string[] = [];
    const belowWindow: string[] = [];
    for (const id of loadedIds) {
      if (pageIds.has(id)) continue;
      const message = this.getItem(id);
      if (!message || !this.isServerConfirmedMessage(message)) continue;
      const ts = getMessageCreatedAtTimestamp(message);
      if (ts === null) continue; // no server timestamp (optimistic)

      if (newestReturnedTs !== null && ts >= newestReturnedTs) {
        // At or above the page's newest, a hard-deleted newest message and a live arrival look the
        // same: remove only ids from the pre-fetch snapshot, which excludes live arrivals.
        if (candidateIds?.has(id)) toRemove.push(id);
        continue;
      }
      // Within the page's span a live arrival cannot be here, so absence means a hard delete. At or
      // below the page's oldest the page cannot decide: return it for the reached-start probe.
      if (ts > windowLowTs) toRemove.push(id);
      else belowWindow.push(id);
    }

    this.removeReconciledItems(toRemove);
    return belowWindow;
  }

  /** Removes reconciled ids in one coalesced batch (one publish), then mirrors it offline. */
  private removeReconciledItems(ids: string[]) {
    if (!ids.length) return;
    this.batch(
      () => {
        for (const id of ids) this.removeItem({ id });
      },
      { coalesce: true },
    );
    this.purgeReconciledFromOfflineDb(ids);
  }

  /**
   * Mirrors a reconciliation into the offline DB: a hard delete done while offline reaches it via no
   * event and the reconnect query upserts (never removing absent rows), so a cold start would re-seed
   * the ghosts. Fire-and-forget, no-op without offline support.
   */
  private purgeReconciledFromOfflineDb(ids: string[]) {
    const offlineDb = this.channel.getClient?.()?.offlineDb;
    if (!offlineDb) return;
    offlineDb.hardDeleteMessages({ ids }).catch(() => {
      // Best effort: the live list is already correct.
    });
  }

  protected resolveUnreadBoundaryIdsByTimestamp = ({
    lastReadAt,
    messages,
  }: {
    lastReadAt: TimestampNS;
    messages: LocalMessage[];
  }): { firstUnreadMessageId: string | null; lastReadMessageId: string | null } => {
    // Messages are chronological: `lastReadMessageId` is the newest with `created_at <= lastReadAt`,
    // `firstUnreadMessageId` the first with `created_at > lastReadAt`. If the page starts after
    // `lastReadAt`, the whole page is unread and its first message is the unread anchor.
    const lastReadTimestamp = lastReadAt;
    if (!Number.isFinite(lastReadTimestamp) || !messages.length) {
      return { firstUnreadMessageId: null, lastReadMessageId: null };
    }

    let firstUnreadMessageId: string | null = null;
    let lastReadMessageId: string | null = null;

    for (const message of messages) {
      const messageTimestamp = getMessageCreatedAtTimestamp(message);
      if (messageTimestamp === null) continue;

      if (messageTimestamp <= lastReadTimestamp) {
        lastReadMessageId = message.id;
      } else if (!firstUnreadMessageId) {
        firstUnreadMessageId = message.id;
      }
    }

    const firstMessageWithTimestamp = messages.find(
      (message) => getMessageCreatedAtTimestamp(message) !== null,
    );
    const firstMessageTimestamp =
      firstMessageWithTimestamp &&
      getMessageCreatedAtTimestamp(firstMessageWithTimestamp);
    if (
      firstMessageWithTimestamp &&
      typeof firstMessageTimestamp === 'number' &&
      lastReadTimestamp < firstMessageTimestamp
    ) {
      return {
        firstUnreadMessageId: firstMessageWithTimestamp.id,
        lastReadMessageId,
      };
    }

    return { firstUnreadMessageId, lastReadMessageId };
  };

  emitMessageFocusSignal = ({
    messageId,
    reason,
    ttlMs = 3000,
  }: {
    messageId: string;
    reason: MessageFocusReason;
    ttlMs?: number;
  }): MessageFocusSignal => {
    this.messageFocusSignalToken += 1;
    const signal: MessageFocusSignal = {
      messageId,
      reason,
      token: this.messageFocusSignalToken,
      createdAt: Date.now(),
      ttlMs,
    };

    if (this.clearMessageFocusSignalTimeoutId) {
      clearTimeout(this.clearMessageFocusSignalTimeoutId);
      this.clearMessageFocusSignalTimeoutId = null;
    }

    this.messageFocusSignal.next({ signal });

    // The auto-dismiss countdown does not start here: the message list may not be visible yet (e.g.
    // covered by a thread panel), so the consumer starts it via `scheduleMessageFocusSignalClear`.
    return signal;
  };

  /**
   * Starts the auto-dismiss countdown for the active focus signal. Call it once the focused message
   * is viewed, so the highlight lasts from when the user could see it. No-op if the signal was
   * cleared or superseded (guarded by `token`).
   */
  scheduleMessageFocusSignalClear = ({
    token,
    ttlMs,
  }: { token?: number; ttlMs?: number } = {}) => {
    const current = this.messageFocusSignal.getLatestValue().signal;
    if (!current) return;
    if (typeof token !== 'undefined' && current.token !== token) return;

    if (this.clearMessageFocusSignalTimeoutId) {
      clearTimeout(this.clearMessageFocusSignalTimeoutId);
      this.clearMessageFocusSignalTimeoutId = null;
    }

    this.clearMessageFocusSignalTimeoutId = setTimeout(() => {
      this.clearMessageFocusSignal({ token: current.token });
    }, ttlMs ?? current.ttlMs);
  };

  clearMessageFocusSignal = ({ token }: { token?: number } = {}) => {
    const current = this.messageFocusSignal.getLatestValue().signal;
    if (!current) return;
    if (typeof token !== 'undefined' && current.token !== token) return;

    if (this.clearMessageFocusSignalTimeoutId) {
      clearTimeout(this.clearMessageFocusSignalTimeoutId);
      this.clearMessageFocusSignalTimeoutId = null;
    }

    this.messageFocusSignal.next({ signal: null });
  };

  clearStateAndCache() {
    this.resetState();
    this._itemIndex.clear();
    this.clearMessageFocusSignal();
  }

  /**
   * Partial truncation for `channel.truncated` with a `truncated_at`: drops every loaded message
   * strictly older than the cutoff across all windows (a full truncation uses
   * {@link MessageIntervalPaginator.clearStateAndCache}). Only the interval straddling the cutoff is
   * scanned member by member and becomes the new global tail; intervals entirely newer keep their
   * flags, since unloaded older messages may sit between them and the cutoff. The active window is
   * re-emitted once.
   */
  truncate({ truncatedAt }: { truncatedAt: TimestampNS }) {
    const cutoff = truncatedAt;
    if (!Number.isFinite(cutoff)) return;

    const isOld = (item: LocalMessage | undefined) => {
      const time = getMessageCreatedAtTimestamp(item);
      return time !== null && time < cutoff;
    };

    const removedIds: string[] = [];
    const survivingIntervals: AnyInterval[] = [];
    // iterate from head to tail
    for (const interval of this.itemIntervals) {
      const edges = this.getIntervalPaginationEdges(interval);
      if (!edges || !isOld(edges.tail)) {
        survivingIntervals.push(interval); // oldest edge >= cutoff → nothing to drop
      } else if (isOld(edges.head)) {
        removedIds.push(...interval.itemIds); // newest edge < cutoff → whole interval is older
      } else {
        // Items are chronological, so the old ones come first: binary-search the split.
        const ids = interval.itemIds;
        const splitIndex = lowerBound(
          ids.length,
          (index) => !isOld(this._itemIndex.get(ids[index])),
        );
        removedIds.push(...ids.slice(0, splitIndex));
        const kept = ids.slice(splitIndex);
        survivingIntervals.push(
          isLogicalInterval(interval)
            ? { ...interval, itemIds: kept }
            : { ...interval, itemIds: kept, isTail: true, hasMoreTail: false },
        );
      }
    }

    if (!removedIds.length) return;
    for (const id of removedIds) this._itemIndex.remove(id);

    // No re-sort: intervals keep their order and truncation only removes tailward items, so the head
    // edge (the interval sort key) never changes.
    this.setIntervals(survivingIntervals);

    // `setIntervals` does not emit: re-emit the active window once.
    const active = this._activeIntervalId
      ? this._itemIntervals.get(this._activeIntervalId)
      : undefined;
    if (active && !isLogicalInterval(active)) {
      this.setActiveInterval(active);
      return;
    }

    // The active window was truncated away: activate the tail-most (oldest) surviving anchored
    // interval rather than blank the message list.
    const anchoredSurvivors = this.itemIntervals.filter(
      (itv): itv is Interval => !isLogicalInterval(itv),
    );

    const fallback = this.getTailIntervalFromSortedIntervals(anchoredSurvivors);
    if (fallback) {
      this.setActiveInterval(fallback);
    } else {
      // Nothing loaded survived the truncation.
      this.state.partialNext({ items: [] });
    }
  }

  applyMessageDeletionForUser = ({
    userId,
    hardDelete = false,
    deletedAt,
  }: {
    userId: string;
    hardDelete?: boolean;
    deletedAt: TimestampNS;
  }) => {
    const loadedMessages = this._itemIndex.values();

    // Coalesce: one emit for this window and one shared-store flush for the sibling holders.
    this.batch(
      () => {
        for (const message of loadedMessages) {
          if (message.user?.id === userId) {
            if (hardDelete) {
              this.removeItem({ id: message.id });
            } else {
              this.ingestItem(
                toDeletedMessage({
                  message,
                  hardDelete,
                  deletedAt,
                }) as LocalMessage,
              );
            }
            continue;
          }

          if (
            message.quoted_message?.user?.id === userId &&
            message.quoted_message.type !== 'deleted'
          ) {
            this.ingestItem({
              ...message,
              quoted_message: toDeletedMessage({
                message: formatMessage(message.quoted_message),
                hardDelete,
                deletedAt,
              }) as LocalMessage,
            });
          }
        }
      },
      { coalesce: true },
    );
  };

  /** Updates the quoted-message snapshot of every cached message that quotes `message`. */
  reflectQuotedMessageUpdate = (message: LocalMessage) => {
    const cachedMessages = this._itemIndex.values();

    // Several cached messages may quote it: coalesce the shared-store fan-out into one flush.
    this.batch(() => {
      for (const cachedMessage of cachedMessages) {
        if (cachedMessage.quoted_message_id !== message.id) continue;

        this.ingestItem({
          ...cachedMessage,
          quoted_message: message,
        });
      }
    });
  };

  /**
   * Reflects an updated `user` onto every cached message authored by that user (not
   * `quoted_message.user`). Patches the shared item index in one batch and re-emits the active
   * window once, if it held an affected message.
   */
  reflectUserUpdate(user: UserResponse) {
    const activeIds = new Set((this.items ?? []).map((m) => this.getItemId(m)));
    let activeAffected = false;
    // A rename can touch many messages: coalesce the shared-store fan-out into one flush.
    this.batch(() => {
      for (const message of this._itemIndex.values()) {
        if (message.user?.id !== user.id) continue;
        if (message.user === user) continue;
        this._itemIndex.setOne({ ...message, user });
        if (activeIds.has(this.getItemId(message))) activeAffected = true;
      }
    });
    if (activeAffected) {
      this.state.partialNext({
        items: (this.items ?? []).map((m) => this.getItem(this.getItemId(m)) ?? m),
      });
    }
  }

  /**
   * The last loaded message created at or before `timestamp` (a floor), or `null` when it precedes
   * every loaded message. With `exactTsMatch`, only a message created exactly at `timestamp` matches.
   * Searches the newest loaded window (already sorted) in O(log n). Used by the receipts tracker to
   * resolve read/delivered cursors.
   */
  findItemByTimestamp = (
    timestamp: TimestampNS,
    exactTsMatch = false,
  ): LocalMessage | null => {
    const items = this.headItems; // ascending by created_at
    if (!items.length) return null;
    // A floor, not a ceil: a cursor is the timestamp of the last message a participant reached, so a
    // ceil would count the oldest loaded message as read by a cursor that predates all of them.
    // `lowerBound` finds the first index strictly after the target.
    const firstAfter = lowerBound(items.length, (i) => {
      const t = getMessageCreatedAtTimestamp(items[i]);
      return t === null || t > timestamp;
    });
    if (firstAfter === 0) return null; // target precedes every loaded message
    const found = items[firstAfter - 1];
    const foundTimestamp = getMessageCreatedAtTimestamp(found);
    // A message without a server timestamp (e.g. optimistic) cannot be located.
    if (foundTimestamp === null) return null;
    if (!exactTsMatch) return found;
    return foundTimestamp === timestamp ? found : null;
  };

  filterQueryResults = (items: LocalMessage[]) =>
    items.filter(this.shouldIncludeMessageInInterval.bind(this));

  private getCanonicalQueryItems(items: LocalMessage[]): LocalMessage[] {
    return [...items].sort(this.itemOrderComparator);
  }
}

const makeDeriveCursor =
  (
    paginator: MessageIntervalPaginator,
  ): CursorDerivator<LocalMessage, MessageQueryShape> =>
  (ctx) => {
    // The interval is built from the filtered page but `ctx.page` is the raw response. The derivators
    // compare page edges and lengths against `interval.itemIds`, so the locally filtered messages
    // (e.g. shadowed) are dropped here, or they would wrongly conclude the page is not at the bounds.
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

    if ((ctx.queryShape as MessagePaginationParams)?.created_at_around) {
      return injectCursor(
        deriveCreatedAtAroundPaginationFlags<LocalMessage, MessagePaginationParams>({
          ...ctx,
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
