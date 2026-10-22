import type {
  AnyInterval,
  BasePaginatorConfig,
  CursorDeriveContext,
  CursorDeriveResult,
  DoRequestResponse,
  ExecuteQueryReturnValue,
  Interval,
  PaginationDirection,
  PaginationQueryParams,
  PaginatorState,
  QueryPagePlacement,
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
  ChannelStateResponse,
  GetRepliesResponse,
  LocalMessage,
  MessagePaginationParams,
  PinnedMessagePaginationOptions,
  SortParamRequest,
  StreamResponse,
  TimestampNS,
  UserResponse,
} from '../../types';
import type { Channel } from '../../channel';
import type { Thread } from '../../thread';
import { ChannelWatchStatus } from '../../channel_state';
import { CORE_NOTIFICATION_TYPE } from '../../notifications';
import { StateStore } from '@stream-io/state-store';
import {
  formatMessage,
  generateUUIDv4,
  isThreadOnlyReply,
  toDeletedMessage,
} from '../../utils';
import { makeComparator } from '../sortCompiler';
import type { FieldToDataResolver } from '../types.normalization';
import { resolveDotPathValue } from '../utility.normalization';
import { lowerBound } from '../utility.search';
import type { ItemIndexApi } from '../ItemIndex';
import type { EntityStoreChangeBatch } from '../../entityStore/EntityStore';
import { StoreBackedItemIndex } from '../../entityStore/StoreBackedItemIndex';
import { deriveCreatedAtAroundPaginationFlags } from '../cursorDerivation';
import { deriveIdAroundPaginationFlags } from '../cursorDerivation/idAroundPaginationFlags';
import {
  deriveLinearPaginationFlags,
  getLinearQueryDirection,
} from '../cursorDerivation/linearPaginationFlags';

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

/**
 * Whether a query asks for no messages (`limit: 0`). Its empty page says nothing about the channel,
 * so it must not be read as an empty one.
 */
const isQueryForNoMessages = (limit: number) => limit === 0;

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
  /** The thread whose replies this paginator lists; without it, it lists the channel's messages. */
  thread?: Thread;
  paginatorOptions?: PaginatorOptions<LocalMessage, MessageQueryShape>;
};

/**
 * Options for {@link MessageIntervalPaginator.reconcileNewestMessages} that enable reconciling
 * messages hard-deleted while the client received no events (no event reaches other clients). With
 * no options it prunes loaded messages inside `page`'s `created_at` span that are absent from it,
 * which is always safe: a live arrival is newer than `page`'s newest message.
 * `headIntervalItemIdsAtRequest` widens reconciliation at the top edge; `requestedLimit` says
 * whether the page reached the channel start.
 */
export type ReconcileNewestMessagesOptions = {
  /**
   * The `limit` the caller passed to the query that produced `page`. Compared to `page.length`, it
   * says whether `page` reached the channel start (see
   * {@link MessageIntervalPaginator.pageReachedChannelStart}, which ignores a limit above
   * `pageSize`), deciding `hasMoreTail`, whether `page` can be separated from the head window by
   * a gap, and whether a reload probes for messages deleted below the page (see
   * {@link MessageIntervalPaginator.pruneBelowWindowIfReachedStart}). On its own it never removes a
   * message. Pass the limit actually sent: a larger one makes a short page look like the channel
   * start, welding it to the head window across a real gap.
   */
  requestedLimit?: number;
  /**
   * The IDs of the head interval's server-confirmed items when the request for `page` went out,
   * taken with {@link MessageIntervalPaginator.getHeadIntervalItemIdsAtRequest} before the request
   * is awaited. Only these prove what `page` says about the head interval:
   *
   * - deletion: at or above `page`'s newest message, and for an empty `page`, only this snapshot
   *   tells a just-deleted message from one that arrived live, or was sent, during the request;
   * - contiguity: `page` starts inside the head interval only if its oldest message the head
   *   interval could hold is in this snapshot (see `isSeparatedFromHeadByGap`).
   *
   * Only the head interval receives live messages, so only its IDs are needed.
   */
  headIntervalItemIdsAtRequest?: ReadonlySet<string>;
};

/** An external query prepared by {@link MessageIntervalPaginator.prepareExternalQuery}. */
export type PreparedExternalQuery = {
  messagePaginationParams: MessagePaginationParams;
  isNewestPage: boolean;
  placePage: (page: LocalMessage[]) => boolean;
};

/**
 * What one of the message paginator's own queries got back, before its page is extracted (see
 * {@link MessageIntervalPaginator.fetchQueryResponse}), by where it came from.
 */
export type MessageQueryResponse =
  | {
      /** what a custom `doRequest` returned: the page, used as is */
      doRequestResponse: DoRequestResponse<LocalMessage>;
      source: 'doRequest';
    }
  | {
      /** the replies endpoint's response for a thread's reply list */
      repliesResponse: GetRepliesResponse;
      source: 'replies';
    }
  | {
      /** the response of a channel query: its messages, and the rest, applied once they are placed */
      channelResponse: StreamResponse<ChannelStateResponse>;
      source: 'channel';
      /** whether the query watched the channel, which applying the response records */
      watch: boolean;
    };

/**
 * A message list with a configurable backend request sort and a stable in-memory item order.
 * Ingested items are filtered only by local predicates (`filterQueryResults`).
 */
export class MessageIntervalPaginator extends BasePaginator<
  LocalMessage,
  MessageQueryShape,
  MessageQueryResponse
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
  /** See {@link MessagePaginatorOptions.thread}. */
  readonly thread?: Thread;
  /** Set when this is a thread's reply list, to the parent message's ID. */
  readonly parentMessageId?: string;
  readonly messageFocusSignal: StateStore<MessageFocusSignalState>;
  private clearMessageFocusSignalTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private messageFocusSignalToken = 0;
  protected _requestSort = DEFAULT_BACKEND_SORT;
  protected _itemOrder: MessagePaginatorSort = DEFAULT_BACKEND_SORT;
  /** Pending below-window reached-start probe (exposed so tests can await it). */
  private _belowWindowReconcile?: Promise<void>;
  /**
   * The ID of the newest server-confirmed message of the window whose head mark was cleared last
   * (see {@link unmarkedHeadInterval}). Forgotten once a newest page is reconciled with no head
   * window loaded, and when the loaded windows are cleared.
   */
  private unmarkedHeadEdgeId: string | undefined;
  sortComparator: (a: LocalMessage, b: LocalMessage) => number;
  /**
   * Whether a message belongs in intervals and state. Keep it consistent with `filterQueryResults`
   * and cursor flag derivation.
   */
  shouldIncludeMessageInInterval(message: LocalMessage): boolean {
    return !message.shadowed;
  }

  /**
   * Reconciles the held messages that changed in the entity store.
   *
   * @internal
   * @param batch - The change batch from the store.
   * @param batch.changedIds - IDs of the watched messages that changed.
   */
  onEntitiesChanged({ changedIds }: EntityStoreChangeBatch): void {
    this.reconcileChangedIds(changedIds);
  }

  /**
   * Drops a message from this paginator's windows after the entity store removed it.
   *
   * @internal
   * @param id - ID of the removed message.
   * @param message - The removed message.
   */
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
   * out of both halves of a prune and stops its ID from becoming the tailward cursor (`id_lt`).
   */
  protected isPaginationAnchorable(item: LocalMessage | undefined): boolean {
    return !!item && this.isServerConfirmedMessage(item);
  }

  protected get intervalItemIdsAreHeadFirst(): boolean {
    // Intervals hold messages in `created_at` ascending order: the head (newest) is at the END.
    return false;
  }

  protected get intervalSortDirection(): 'asc' | 'desc' {
    // `itemOrderComparator` is `created_at` ascending but newer head edges must come first.
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
      thread,
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
    this.thread = thread;
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
        deriveCursor: (ctx) => this.deriveCursorFromPage(ctx),
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
    // no server-known message at that edge: no cursor, so the query returns the newest page
    const cursorId = direction ? this.cursor?.[direction] : undefined;
    return {
      limit: this.pageSize,
      ...(cursorId && { [direction === 'tailward' ? 'id_lt' : 'id_gt']: cursorId }),
    };
  }

  getCursorFromQueryResults = ({
    direction,
    items,
  }: {
    direction?: PaginationDirection;
    items: LocalMessage[];
  }) => {
    // Newer side is the pagination head for messages.
    const { head, tail } = this.getPagePaginationEdges(items);
    if (!head || !tail) {
      return {
        tailward: undefined,
        headward: undefined,
      };
    }

    // Without a direction this is a jump: set both cursors.
    return {
      tailward: !direction || direction === 'tailward' ? this.getItemId(tail) : undefined,
      headward: !direction || direction === 'headward' ? this.getItemId(head) : undefined,
    };
  };

  /**
   * Runs the query pipeline (see `BasePaginator.executeQuery`). A query that goes to the channel —
   * not a thread's reply list, not a custom `doRequest` — runs as a tracked query of the channel
   * (`Channel.runTrackedQuery`), so the channel store keeps the channel until the query ends. A
   * disposed channel's query is not tracked: its fetch step is refused, and fails as any failed
   * request does.
   */
  override executeQuery(
    params: PaginationQueryParams<MessageQueryShape> = {},
  ): Promise<ExecuteQueryReturnValue<LocalMessage> | void> {
    const queriesChannel =
      !this.parentMessageId && !this.config.doRequest && !this.channel.pendingDisposal;
    if (!queriesChannel) return super.executeQuery(params);
    return this.channel.runTrackedQuery(() => super.executeQuery(params));
  }

  /**
   * The fetching step of the query pipeline: requests a page through a custom `doRequest`, the
   * replies endpoint for a thread's reply list, or the channel query otherwise, which takes in what
   * the response says about the channel itself and leaves the rest for the last step (see
   * `Channel.requestChannelState`). Reads `requestOptions.watch`: `true` also watches the channel
   * with the request. Ignored for a thread's reply list and with `doRequest`.
   */
  protected override fetchQueryResponse = async ({
    direction,
    queryShape,
    requestOptions,
  }: PaginationQueryParams<MessageQueryShape>): Promise<MessageQueryResponse> => {
    const options = queryShape ?? this.getNextQueryShape({ direction });

    if (this.config.doRequest) {
      return {
        doRequestResponse: await this.config.doRequest(options),
        source: 'doRequest',
      };
    }
    if (this.parentMessageId) {
      const repliesResponse = await this.channel
        .getClient()
        .getReplies(
          { parent_id: this.parentMessageId },
          { ...options, sort: this.requestSort },
        );
      return { repliesResponse, source: 'replies' };
    }
    const watch = requestOptions?.watch === true;
    const channelResponse = await this.channel.requestChannelState(
      {
        messages: options as MessagePaginationParams,
        ...(watch && { watch: true }),
        // todo: why do we query for watchers?
        // watchers: { limit: this.pageSize },
      },
      undefined,
    );
    return { channelResponse, source: 'channel', watch };
  };

  /**
   * The extracting step of the query pipeline: the messages in item order and their cursors, which
   * a custom `doRequest` reports and which are derived from the messages otherwise.
   */
  protected override extractQueryPage(
    response: MessageQueryResponse,
    { direction }: PaginationQueryParams<MessageQueryShape>,
  ): PaginationQueryReturnValue<LocalMessage> {
    if (response.source === 'doRequest') {
      const { cursor, items } = response.doRequestResponse;
      // Without a direction this is a jump: set both cursors.
      return {
        headward: !direction || direction === 'headward' ? cursor?.headward : undefined,
        items: this.getCanonicalQueryItems(items),
        tailward: !direction || direction === 'tailward' ? cursor?.tailward : undefined,
      };
    }
    const messages =
      response.source === 'replies'
        ? response.repliesResponse.messages
        : (response.channelResponse.messages ?? []);
    const items = this.getCanonicalQueryItems(messages.map(formatMessage));
    return { items, ...this.getCursorFromQueryResults({ direction, items }) };
  }

  /**
   * The last step of the query pipeline: the rest of a channel query's response, applied once its
   * page is placed (see `Channel.applyChannelStateFromResponse`). The other sources return nothing
   * else.
   */
  protected override applyQueryResponseRest(
    response: MessageQueryResponse,
    _placeParams: QueryPagePlacement<MessageQueryShape>,
  ) {
    if (response.source === 'channel') {
      // Not the latest message set the offline database stores: `watch()` and the channel list
      // store that.
      this.channel.applyChannelStateFromResponse(response.channelResponse, {
        isLatestMessageSet: false,
        watch: response.watch,
      });
    }
  }

  /**
   * Whether this paginator is active: the thread it lists is active (see `Thread.activate()`), or,
   * without a thread, its channel is (see `Channel.activate()`). A page from a query an active
   * paginator did not run leaves its active interval active; an inactive paginator shows a fresh
   * newest page instead, also one separated from the loaded messages by a gap (see
   * {@link reconcileNewestMessages}).
   */
  private isActivePaginator(): boolean {
    return (this.thread ?? this.channel).active;
  }

  /**
   * Places a page from an external query — one this paginator did not run, whose page the caller
   * chose — in the windows it belongs to, never removing anything loaded. Bringing the loaded
   * newest messages up to date with a fresh newest page, removals included, is
   * {@link reconcileNewestMessages}'s job instead.
   *
   * External queries are a channel query (`watch()`, see {@link prepareExternalQuery}), the
   * channel list's query (`client.hydrateChannels`), and the channel state the pinned list's first
   * page comes with. `messagePaginationParams` are the
   * options the page was queried with; they decide where it goes:
   *
   * - The newest page: when no window is active yet (nothing loaded, or only live messages), its
   *   window becomes the active one, as the channel's first page. When the active window is the
   *   newest window, the page lands in it.
   * - Any other page — a page at a cursor or around a message, or the newest page while an older
   *   window is active — is only stored, as a separate interval merged only with an interval it
   *   overlaps.
   *
   * The active interval stays active: changing it is this paginator's own methods' job
   * (`jumpToMessage()` and the like). The exception is an inactive paginator (see
   * {@link isActivePaginator}), where the newest page is shown as when no window is
   * active. A newest
   * page for loaded messages goes to {@link reconcileNewestMessages} instead
   * (`prepareExternalQuery`, the channel list's query). When a page lands in the active window,
   * overlaps it, or takes in an active window of live messages only, that window is shown again
   * with the page. The paginator's own queries are left alone too: a running one keeps its loading
   * flag, and its last query error and query shape stay.
   *
   * It runs synchronously, so a caller can apply the rest of the response right after with the page
   * in place, as it has to: read and delivery positions that come without a message id are looked
   * up among the loaded messages.
   *
   * Returns whether it showed the page as a first page.
   */
  placeExternalQueryPage(
    page: LocalMessage[],
    requestedPageSize: number,
    messagePaginationParams?: MessagePaginationParams,
  ): boolean {
    const queryShape: MessageQueryShape = {
      ...messagePaginationParams,
      limit: requestedPageSize,
    };
    const isJump = this.isJumpQueryShape(queryShape);
    const isNewestPage = this.isHeadPageQueryShape(queryShape);
    // In item order, as `extractQueryPage()` hands its pages over, so the page's edges are its
    // first and last item.
    const items = this.getCanonicalQueryItems(page);
    const { head: headItem, tail: tailItem } = this.getPagePaginationEdges(items);
    // the first page of a list not loaded yet, or the newest page
    const isFirstPage = typeof this.items === 'undefined' || isNewestPage;
    const activeInterval = this.itemIntervals.find((interval) =>
      this.isActiveInterval(interval),
    );
    // only live messages, with no page loaded yet, count as no active window, as does any window of
    // an inactive paginator
    const hasActiveInterval =
      !!activeInterval && !isLogicalInterval(activeInterval) && this.isActivePaginator();
    // The newest page lands in the active window when that is the newest window; any other page has
    // no known place relative to the active window, so it is stored as a separate interval.
    const landsInActiveInterval = isNewestPage && this.isActiveIntervalAtHead;
    const showsPage = isNewestPage && (!hasActiveInterval || landsInActiveInterval);
    const placed = this.placePage(
      {
        startsSeparateInterval: !landsInActiveInterval,
        // A jump/around page spans both directions; a page at a cursor pages the way its cursor
        // points, and a plain latest page paginates tailward (older).
        direction: isJump
          ? undefined
          : (getLinearQueryDirection(queryShape) ?? 'tailward'),
        isFirstPage,
        queryShape,
        requestedPageSize,
        results: {
          items,
          headward: isJump ? headItem?.id : undefined,
          tailward: tailItem?.id,
        },
        updateState: showsPage,
      },
      { endsQuery: false },
    );
    // A stored page that took in a live-only active window (only live messages, no page) carries
    // on as the active window: its live messages are still shown, with what the page added.
    const tookInActiveInterval =
      !!activeInterval &&
      !this.itemIntervals.some((interval) => this.isActiveInterval(interval));
    const intervalTakingOver = tookInActiveInterval ? placed.targetInterval : null;
    if (intervalTakingOver) {
      this.setActiveInterval(intervalTakingOver, { updateState: false });
      // placing did not publish it: the window it took in becomes the active one only here
      const { cursor, hasMoreHead, hasMoreTail } = placed.stateCandidate;
      this.publishActiveInterval({ cursor, hasMoreHead, hasMoreTail });
    }
    if (showsPage) {
      // shown without a query of this paginator, so its next query has to continue this window
      this.recordLoadedWindowQueryShape();
    }
    return showsPage && isFirstPage;
  }

  /**
   * Whether messages are loaded for {@link reconcileNewestMessages} to bring up to date. A list
   * loaded empty has none (no interval, not even live messages), so a fresh newest page is placed
   * as a first page instead ({@link placeExternalQueryPage}); reconciling would find nothing to
   * merge it into and drop it.
   */
  get canReconcileNewestMessages(): boolean {
    return typeof this.items !== 'undefined' && this.itemIntervals.length > 0;
  }

  /**
   * The snapshot a newest page is reconciled against (see
   * {@link ReconcileNewestMessagesOptions.headIntervalItemIdsAtRequest}): the IDs of the head
   * window's server-confirmed messages. Take it right before the request goes out. Unsent messages
   * are left out: one confirmed during the request proves neither that the page connects to the
   * head window nor, when the page lacks it, that it was deleted. `undefined` while no head window
   * is loaded.
   *
   * @internal
   */
  getHeadIntervalItemIdsAtRequest(): ReadonlySet<string> | undefined {
    const head = this.anchoredHeadInterval;
    if (!head) return undefined;
    return new Set(head.itemIds.filter((id) => this.isServerConfirmedItemId(id)));
  }

  /**
   * Whether the loaded message with this ID is server-confirmed
   * (see {@link isServerConfirmedMessage}).
   */
  private isServerConfirmedItemId(id: string): boolean {
    const message = this.getItem(id);
    return !!message && this.isServerConfirmedMessage(message);
  }

  /**
   * Prepares an external query for a page of these messages: the channel query `channel.watch()`
   * sends with the `messages` options its caller gave. Call it before
   * sending the query, and place the returned page with `placePage` before the response's read
   * state is applied: the read state is resolved against the loaded messages.
   *
   * - `messagePaginationParams`: the options to send as the query's `messages`, with `limit` set to
   *   the page size when not given.
   * - `isNewestPage`: whether the query asks for the newest page — no cursor, not around a message,
   *   and some messages.
   * - `placePage`: places the returned page. The newest page goes to
   *   {@link placeExternalNewestPage}, reconciled against the messages loaded when the query was
   *   prepared; any other page is placed by {@link placeExternalQueryPage}. A query for no messages
   *   (`limit: 0`) places nothing. Returns whether it showed a first page.
   */
  prepareExternalQuery(messages?: MessagePaginationParams): PreparedExternalQuery {
    const messagePaginationParams: MessagePaginationParams = {
      ...messages,
      limit: messages?.limit ?? this.pageSize,
    };
    const limit = messagePaginationParams.limit ?? this.pageSize;
    if (isQueryForNoMessages(limit)) {
      return { messagePaginationParams, isNewestPage: false, placePage: () => false };
    }

    const isNewestPage = this.isHeadPageQueryShape(messagePaginationParams);
    const headIntervalItemIdsAtRequest = isNewestPage
      ? this.getHeadIntervalItemIdsAtRequest()
      : undefined;
    return {
      messagePaginationParams,
      isNewestPage,
      placePage: (page) =>
        isNewestPage
          ? this.placeExternalNewestPage(page, {
              headIntervalItemIdsAtRequest,
              requestedLimit: limit,
            })
          : this.placeExternalQueryPage(page, limit, messagePaginationParams),
    };
  }

  /**
   * Places the newest page of an external query (a channel query, the channel list's query): it
   * reconciles the loaded newest messages ({@link reconcileNewestMessages}), or is placed as a
   * first page when none are loaded ({@link placeExternalQueryPage}). A query for no messages
   * (`requestedLimit: 0`) places nothing. Returns whether it showed a first page.
   *
   * @internal
   */
  placeExternalNewestPage(
    page: LocalMessage[],
    {
      headIntervalItemIdsAtRequest,
      requestedLimit,
    }: ReconcileNewestMessagesOptions & { requestedLimit: number },
  ): boolean {
    if (isQueryForNoMessages(requestedLimit)) return false;
    if (!this.canReconcileNewestMessages) {
      return this.placeExternalQueryPage(page, requestedLimit);
    }
    this.reconcileNewestMessages(page, { headIntervalItemIdsAtRequest, requestedLimit });
    return false;
  }

  isJumpQueryShape(queryShape: MessageQueryShape): boolean {
    return (
      !!queryShape?.id_around ||
      !!(queryShape as MessagePaginationParams)?.created_at_around
    );
  }

  /** Only a query without a cursor and not around a message returns the newest page. */
  protected override isHeadPageQueryShape(
    queryShape: MessageQueryShape | undefined,
  ): boolean {
    return (
      !queryShape ||
      (!this.isJumpQueryShape(queryShape) && !getLinearQueryDirection(queryShape))
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

  /**
   * Makes the interval holding the message the active one, querying the page around it when it is
   * not loaded. Resolves `false` when the message cannot be shown, or when a later claim on the
   * active interval (see `claimActiveInterval`) was made before the page arrived.
   */
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
    if (localMessage) {
      interval = this.locateIntervalForItem(localMessage);
      if (
        interval &&
        !isLogicalInterval(interval) &&
        !interval.itemIds.includes(messageId)
      ) {
        // The range match can return an interval that spans the target without holding it (a
        // neighbour grew across its position): use the one that holds the ID, or the jump may no-op.
        interval = this.itemIntervals.find(
          (candidate) =>
            !isLogicalInterval(candidate) && candidate.itemIds.includes(messageId),
        );
      }
    }

    // a loaded message needs no request, unless the jump is also to watch the channel
    if (!watch && localMessage && interval && !isLogicalInterval(interval)) {
      // showing a loaded interval claims the active interval, as a query for one does
      this.claimActiveInterval();
      this.showLoadedInterval(interval);
    } else {
      const result = await this.executeQuery({
        claimsActiveInterval: true,
        // Always send a limit: the replies endpoint ignores `id_around` without one.
        queryShape: { id_around: messageId, limit: pageSize ?? this.pageSize },
        ...(watch && { requestOptions: { watch: true } }),
        updateState: false,
      });
      // a later claim decides the active interval, and the page stays stored
      if (result?.isSuperseded) return false;
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
      this.showInterval(
        interval,
        isLogicalInterval(interval)
          ? result.stateCandidate
          : {
              ...result.stateCandidate,
              hasMoreHead: interval.hasMoreHead,
              hasMoreTail: interval.hasMoreTail,
              // Falls back to the interval-derived cursor when the stateCandidate is partial.
              cursor:
                result.stateCandidate.cursor ?? this.getCursorFromInterval(interval),
              items: this.intervalToItems(interval),
            },
      );
    }

    if (!suppressFocusSignal) {
      this.emitMessageFocusSignal({
        messageId,
        reason: focusReason ?? 'jump-to-message',
        ttlMs: focusSignalTtlMs,
      });
    }
    return true;
  };

  /**
   * Shows a loaded window as it is: its items, its own pagination flags and the cursor continuing
   * it. Claiming the active interval is the caller's choice (see `claimActiveInterval`).
   */
  protected showLoadedInterval(interval: Interval) {
    this.showInterval(interval, {
      hasMoreHead: interval.hasMoreHead,
      hasMoreTail: interval.hasMoreTail,
      cursor: this.getCursorFromInterval(interval),
      items: this.intervalToItems(interval),
    });
  }

  /** Makes `interval` the active window and publishes `state` for it in one update. */
  private showInterval(
    interval: AnyInterval,
    state: Partial<PaginatorState<LocalMessage>>,
  ) {
    if (!this.isActiveInterval(interval)) {
      this.setActiveInterval(interval, { updateState: false });
    }
    this.state.partialNext(state);
    // shown without a query of this paginator, so its next query has to continue this window
    this.recordLoadedWindowQueryShape();
  }

  /**
   * Shows the window holding the latest message and jumps to that message. Without a loaded head
   * window (see {@link latestHeadInterval}), the newest page is queried first: no cursor, so it
   * holds the latest message however many pages are missing. The page merges with a window it
   * overlaps and is a window of its own otherwise, and is shown either way. Resolves `false` when
   * the latest message cannot be shown, or when a later claim on the active interval (see
   * `claimActiveInterval`) was made before the page arrived: that page is then only stored.
   */
  jumpToTheLatestMessage = async (options?: JumpToMessageOptions): Promise<boolean> => {
    if (!this.latestHeadInterval) {
      const result = await this.executeQuery({
        claimsActiveInterval: true,
        queryShape: { limit: this.pageSize },
        updateState: false,
      });
      // a later claim decides the active interval, and the page stays stored
      if (result?.isSuperseded) return false;
    }

    const latestMessageId = this.latestHeadInterval?.itemIds.slice(-1)[0];
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
   * The head window when it is the newest loaded interval, so its newest message is the latest
   * one; `undefined` while no head window is loaded or live messages newer than it are.
   */
  private get latestHeadInterval(): Interval | undefined {
    const newest = this.itemIntervals[0];
    return newest && !isLogicalInterval(newest) && newest.isHead ? newest : undefined;
  }

  /**
   * Reconciles the loaded newest messages with a fresh newest page, without issuing a query: they
   * are brought up to date in place — messages added and updated, those the page proves were
   * hard-deleted removed — rather than blanked and reloaded. The page comes from an external query
   * (a reload, a channel-list query, connection recovery). In an active paginator (see
   * {@link isActivePaginator}) the active interval stays active, the head window included
   * (changing it is `jumpToTheLatestMessage()`'s job); in an inactive one, the head window is shown.
   *
   * Where the page goes depends on the head window, the loaded window reaching the newest message:
   *
   * 1. NO HEAD WINDOW (only live messages, a jumped-to window, or a cleared head mark, see
   *    {@link unmarkHead}) - the page becomes the head window, merging with the windows it
   *    overlaps, live messages included, minus what it proves was hard-deleted. It is shown if the
   *    live messages it absorbed were active; an active window that it overlaps grows. A
   *    page separated by a gap from the window whose head mark was cleared is placed as in 2.
   *
   * 2. SEPARATED BY A GAP (see {@link isSeparatedFromHeadByGap}) - merging would weld the two
   *    across the gap, hiding the messages in between, so the page takes the place of the head
   *    window (see {@link placeNewestPageAcrossGap}): stored beside the active interval when that
   *    is an older window, shown in place of the loaded windows otherwise.
   *
   * 3. OTHERWISE - the page merges into the head window, which keeps every loaded message and drops
   *    what the page proves was hard-deleted (see {@link reconcileHeadAgainstPage}). An active head
   *    window gets its tail boundary from the page (see {@link showHeadInterval}); otherwise the
   *    active interval stays active, and grows into the head window if the page overlaps it.
   *
   * Only a gap drops loaded windows, never an older active window, and with nothing loaded it
   * does nothing: placing a first page is {@link placeQueryPage}'s job. An empty page changes
   * nothing on its own but, given a pre-fetch snapshot (`options.headIntervalItemIdsAtRequest`), is
   * reconciled as "the channel has no messages": every server-confirmed message of the head window
   * is removed.
   *
   * The query shape of the loaded window is recorded on every exit (see
   * `recordLoadedWindowQueryShape`): a window left without one loses itself on the next pagination.
   *
   * @param page - The fetched newest window (may be empty). `created_at` order is normalized on
   *   ingest.
   * @param options - See {@link ReconcileNewestMessagesOptions}. Omit to prune only within the
   *   page's own span.
   */
  reconcileNewestMessages = (
    page: LocalMessage[],
    options?: ReconcileNewestMessagesOptions,
  ) => {
    // The page came back, so whatever the last query failure was, it is no longer the truth: a
    // failed "load older" would otherwise keep a UI's error surface latched through a successful
    // refresh. Placing a page clears it in `placeQueryPage`.
    if (this.state.getLatestValue().lastQueryError) {
      this.state.partialNext({ lastQueryError: undefined });
    }
    this._reconcileNewestMessages(page, options);
    this.recordLoadedWindowQueryShape();
  };

  private _reconcileNewestMessages = (
    page: LocalMessage[],
    options?: ReconcileNewestMessagesOptions,
  ) => {
    const headInterval = this.itemIntervals[0] as Interval | undefined;
    if (!headInterval?.isHead) {
      // The newest messages are not loaded as a window: only live content arrived (e.g. the first
      // query came back empty and the user's reply went to the logical head), only a jumped-to
      // window is loaded, or the head mark was cleared (see `unmarkHead`). The page becomes the
      // head window, and `ingestPage` merges into it the windows it overlaps, live messages
      // included, else the newest messages could never be reached. With nothing loaded, placing
      // a first page is `placeQueryPage`'s job.
      const logicalHead = this.liveHeadLogical;
      const hasAnchoredHead = this.itemIntervals.some(
        (interval) => !isLogicalInterval(interval) && interval.isHead,
      );
      if (!this.itemIntervals.length || hasAnchoredHead || !page?.length) return;

      // The window that reached the newest message until its head mark was cleared is judged as
      // the head window is, gap included. The page becomes the head window either way, so that
      // window is judged only once.
      const unmarkedHead = this.unmarkedHeadInterval;
      this.unmarkedHeadEdgeId = undefined;
      if (unmarkedHead && this.isSeparatedFromHeadByGap(unmarkedHead, page, options)) {
        this.placeNewestPageAcrossGap(page, unmarkedHead, options);
        return;
      }

      // Take over the view if the live content being absorbed is active, or the paginator is
      // inactive. An active interval elsewhere (a window jumped to) stays active, with the
      // page anchored as the head window (the rule the jumped away branch below enforces).
      const takeOverView =
        !this.isActivePaginator() ||
        (!!logicalHead && this.isActiveInterval(logicalHead));

      const anchored = this.ingestPage({ page, isHead: true, setActive: false });
      if (!anchored) return;
      // The page may have merged into a window that stopped reaching the newest message (see
      // `unmarkHead`); remove from it, as from the head, what the page proves was hard-deleted.
      this.reconcileHeadAgainstPage(page, options);
      if (!takeOverView) {
        // The page merged into the active window, which now reaches the head: show what it gained.
        if (this.isActiveInterval(anchored)) {
          this.publishActiveIntervalGrownIntoHead();
        }
        return;
      }
      this.showHeadInterval(page, options);
      return;
    }
    // Inputs for the below-window probe, captured before the merge overwrites state.
    const wasAtChannelStart = !this.state.getLatestValue().hasMoreTail;
    const preMergeLoadedCount = headInterval.itemIds.length;

    if (!page?.length) {
      // An empty page never blanks the list: only with a pre-fetch snapshot is it read as "channel
      // emptied" (the snapshot excludes messages that arrived live during the fetch).
      this.reconcileHeadAgainstPage([], options);
      return;
    }

    if (this.isSeparatedFromHeadByGap(headInterval, page, options)) {
      this.placeNewestPageAcrossGap(page, headInterval, options);
      return;
    }

    // Another window is shown; the head window is still reconciled, so returning to it
    // (scroll-to-latest) shows neither ghosts nor stale newest messages.
    if (!this.isActiveInterval(headInterval)) {
      this.reconcileHeadAgainstPage(page, options);
      this.mergePageIntoInactiveHead(page, options);
      return;
    }

    // the head window is active: merge in place, keeping every loaded message
    const interval = this.ingestPage({
      page,
      isHead: true,
      setActive: false,
      targetIntervalId: headInterval.id,
    });
    if (!interval) return;
    this.showHeadInterval(page, options);

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
   * Shows the head window a fresh newest page merged into, with no newer messages to load. It has
   * older ones unless the page reached the channel start (see {@link pageReachedChannelStart});
   * `isTail` follows, which also clears a stale offline-DB `isTail: true` that would let
   * `intervalsOverlap` weld a far page across a gap.
   */
  private showHeadInterval(
    page: LocalMessage[],
    options?: ReconcileNewestMessagesOptions,
  ) {
    // read here, as reconciling replaces the interval object a caller holds
    const interval = this.anchoredHeadInterval;
    if (!interval) return;
    const hasMoreTail = !this.pageReachedChannelStart(page, options);
    interval.hasMoreTail = hasMoreTail;
    interval.isTail = !hasMoreTail;
    this.setActiveInterval(interval, { updateState: false });
    const flags = { hasMoreHead: false, hasMoreTail };
    this.publishActiveInterval({
      ...flags,
      cursor: this.getCursorFromInterval(interval, flags),
    });
  }

  /**
   * Whether a fresh newest page and the head window (or the window whose head mark was cleared, see
   * {@link unmarkedHeadInterval}) are separated by a gap, with messages between them possibly not
   * loaded. They are not when the two together form one unbroken stretch of the channel:
   *
   * - the page starts inside the head window (see {@link pageStartsInsideHead});
   * - the page covers the head window (see {@link pageCoversHead});
   * - the page reached the channel start (see {@link pageReachedChannelStart}), so nothing older
   *   than it exists to be missing.
   *
   * Sharing a message is not enough on its own: a message the user sent while offline is confirmed
   * by the server before the reconnect's newest page is requested, so it sits at the top of the
   * head window and in the page, with the messages missed below it in neither. For example, the
   * window holds m1–m100 and the user's queued "hello"; the server got m101–m210 meanwhile. A page
   * of 25 holds m187–m210 and "hello": it does not start inside the window (m187 was never loaded)
   * nor cover it (m1 is not in it), so it is past a gap. When the user wrote the last 10 loaded
   * messages and others sent 20 since, a page of 25 holds the user's last 5 and the 20 new ones:
   * its oldest was loaded, so it starts inside the window.
   *
   * A message missed while the socket was down comes with connection recovery's newest page.
   */
  private isSeparatedFromHeadByGap(
    head: Interval,
    page: LocalMessage[],
    options?: ReconcileNewestMessagesOptions,
  ): boolean {
    if (this.pageStartsInsideHead(head, page, options)) return false;
    if (this.pageCoversHead(head, page)) return false;
    if (this.pageReachedChannelStart(page, options)) return false;
    return true;
  }

  /**
   * Whether the page's oldest message the head window could hold (see
   * {@link getPageOldestHoldableMessage}) was in the head window when the request went out. The
   * page runs unbroken from that message to the newest and the window is taken to run unbroken
   * below it, so nothing between them is missing.
   *
   * With a snapshot of the request (`options.headIntervalItemIdsAtRequest`), the message must be
   * in it and held by no window other than the head window: a message that reached the window
   * during the request, live or as a send confirmed meanwhile, may sit above messages the window
   * never loaded. One no longer loaded at all still counts: if the head window holds messages
   * older than it, the window ran unbroken through it and it was removed (e.g. hard-deleted);
   * if not, the page covers the window anyway. Without a snapshot, the message must be in the
   * head window and server-confirmed now.
   *
   * The window is not unbroken below a send the server confirmed while the channel received no
   * events, such as one replayed from the offline queue before the reconnect's newest page is
   * requested. If that send is exactly the page's oldest (as many newer messages as the page has
   * room for were sent after it), the page is taken to start inside the window although messages
   * below the send were missed. The page and the window cannot tell this apart from a send
   * confirmed while events were arriving.
   */
  private pageStartsInsideHead(
    head: Interval,
    page: LocalMessage[],
    options?: ReconcileNewestMessagesOptions,
  ): boolean {
    const pageOldest = this.getPageOldestHoldableMessage(page);
    if (!pageOldest) return false;
    const id = this.getItemId(pageOldest);
    const idsAtRequest = options?.headIntervalItemIdsAtRequest;
    if (!idsAtRequest) {
      return head.itemIds.includes(id) && this.isServerConfirmedItemId(id);
    }
    const heldByAnotherWindow = !head.itemIds.includes(id) && !!this.getItem(id);
    return idsAtRequest.has(id) && !heldByAnotherWindow;
  }

  /**
   * Whether the page spans the whole head window: the window holds no server-confirmed message
   * older than the page. What the window holds beyond the page is newer (it arrived as an event
   * after the page was produced) or unsent (it carries the device's clock).
   */
  private pageCoversHead(head: Interval, page: LocalMessage[]): boolean {
    const pageOldest = this.getPageOldestMessage(page);
    if (!pageOldest) return true;
    return !head.itemIds.some((id) => {
      const message = this.getItem(id);
      return (
        !!message &&
        this.isServerConfirmedMessage(message) &&
        this.aIsMoreTailwardThanB(message, pageOldest)
      );
    });
  }

  /**
   * The page's oldest message that the head window could have loaded: server-confirmed and kept
   * in intervals (see {@link filterQueryResults}). A message the window filters out, such as a
   * shadowed one, would never be found in it. {@link pageCoversHead} compares with the page's
   * oldest message of any kind instead: it only needs the page's span.
   */
  private getPageOldestHoldableMessage(page: LocalMessage[]): LocalMessage | undefined {
    const holdable = this.filterQueryResults(page).filter((message) =>
      this.isServerConfirmedMessage(message),
    );
    return this.getPageOldestMessage(holdable);
  }

  /**
   * The window whose head mark was cleared last (see {@link unmarkHead}), while it is still loaded.
   * It reached the newest message until then, so a newest page is judged against it while no head
   * window is loaded.
   */
  private get unmarkedHeadInterval(): Interval | undefined {
    const id = this.unmarkedHeadEdgeId;
    if (!id) return undefined;
    return this.itemIntervals.find(
      (interval): interval is Interval =>
        !isLogicalInterval(interval) && interval.itemIds.includes(id),
    );
  }

  /**
   * Remembers the window by a message that stays in it: a server-confirmed one, as an unsent one
   * may be deleted or retried; the raw newest item only when the window holds none.
   */
  protected override unmarkHead(interval: Interval) {
    const edge =
      this.getServerKnownEdges(interval).head ??
      this.getIntervalPaginationEdges(interval)?.head;
    this.unmarkedHeadEdgeId = edge ? this.getItemId(edge) : undefined;
    super.unmarkHead(interval);
  }

  protected override clearItemStorage() {
    this.unmarkedHeadEdgeId = undefined;
    super.clearItemStorage();
  }

  override resetState() {
    this.unmarkedHeadEdgeId = undefined;
    super.resetState();
  }

  private getPageOldestMessage(page: LocalMessage[]): LocalMessage | undefined {
    return this.getPagePaginationEdges(this.getCanonicalQueryItems(page)).tail;
  }

  /**
   * Places a fresh newest page separated by a gap from `headWindow` (the head window, or the
   * window whose head mark was cleared, see {@link isSeparatedFromHeadByGap}). The page becomes
   * the head window either way, and the windows nothing brought up to date are dropped, as a
   * message deleted meanwhile would come back with them:
   *
   * - an active interval other than the head window (see {@link getActiveIntervalApartFromHead})
   *   stays active, and the page is stored beside it (see
   *   {@link storeNewestPageBesideActiveInterval});
   * - otherwise the page replaces the loaded windows and is shown (see
   *   {@link replaceWindowsWithNewestPage}).
   */
  private placeNewestPageAcrossGap(
    page: LocalMessage[],
    headWindow: Interval,
    options?: ReconcileNewestMessagesOptions,
  ) {
    const activeInterval = this.getActiveIntervalApartFromHead(headWindow);
    if (activeInterval) {
      this.storeNewestPageBesideActiveInterval(page, activeInterval, options);
    } else {
      this.replaceWindowsWithNewestPage(page, options);
    }
  }

  /**
   * The active loaded window when it is not `headWindow`, such as a window jumped to; `undefined`
   * when `headWindow` or live messages only are active, and in an inactive paginator (see
   * {@link isActivePaginator}).
   */
  private getActiveIntervalApartFromHead(headWindow: Interval): Interval | undefined {
    if (!this.isActivePaginator()) return undefined;
    return this.itemIntervals.find(
      (interval): interval is Interval =>
        !isLogicalInterval(interval) &&
        this.isActiveInterval(interval) &&
        interval.id !== headWindow.id,
    );
  }

  /**
   * Replaces the loaded windows with a fresh newest page separated from the head window by a gap
   * (see {@link placeNewestPageAcrossGap}) and shows it. The page's window keeps the loaded
   * messages that must not be lost (see {@link getMessagesKeptAcrossGap}) and has older messages
   * to load.
   */
  private replaceWindowsWithNewestPage(
    page: LocalMessage[],
    options?: ReconcileNewestMessagesOptions,
  ) {
    const keptMessages = this.getMessagesKeptAcrossGap(page, this.itemIntervals);
    // one publish, once the page's window is in place and reconciled, so subscribers read it whole
    this.batch(
      () => {
        this.clearItemStorage();
        this.ingestPageAsHeadWindow(page, keptMessages, options);
        this.showHeadInterval(page, options);
      },
      { coalesce: true },
    );
  }

  /**
   * Stores a fresh newest page separated from the head window by a gap (see
   * {@link placeNewestPageAcrossGap}) as the head window, beside `activeInterval`, which stays
   * active and shown as it is. Every other loaded window is dropped and loads again on
   * demand. The page's window keeps the messages of the dropped windows that must not be lost (see
   * {@link getMessagesKeptAcrossGap}) and has older messages to load.
   *
   * The active interval keeps all its messages, unsent ones included, so nothing moves in the
   * shown list, and it is not brought up to date: a message deleted or edited meanwhile stays as it was
   * loaded. It can load newer messages, up to the head window it then joins.
   */
  private storeNewestPageBesideActiveInterval(
    page: LocalMessage[],
    activeInterval: Interval,
    options?: ReconcileNewestMessagesOptions,
  ) {
    const droppedWindows = this.itemIntervals.filter(
      (interval) => interval.id !== activeInterval.id,
    );
    const keptMessages = this.getMessagesKeptAcrossGap(page, droppedWindows);
    const keepingIds = new Set(
      [...page, ...keptMessages].map((message) => this.getItemId(message)),
    );
    // one publish, once the page's window is in place and reconciled, so subscribers read it whole
    this.batch(
      () => {
        this.dropWindows(droppedWindows, { keepingIds });
        this.unmarkedHeadEdgeId = undefined;
        // Not the head window: a head mark would weld the page to it (`intervalsOverlap` joins
        // anything beyond a head window's head edge).
        activeInterval.isHead = false;
        const pageWindow = this.ingestPageAsHeadWindow(page, keptMessages, options);
        if (pageWindow && this.isActiveInterval(pageWindow)) {
          // the page overlapped the active interval, which grew into the head window
          this.publishActiveIntervalGrownIntoHead();
          return;
        }
        this.markActiveIntervalBelowHead(activeInterval);
      },
      { coalesce: true },
    );
  }

  /**
   * Ingests a fresh newest page placed across a gap, with `keptMessages`, as the head window, which
   * has older messages to load, and removes from it what the page proves was hard-deleted (see
   * {@link reconcileHeadAgainstPage}). Returns the window the page landed in.
   */
  private ingestPageAsHeadWindow(
    page: LocalMessage[],
    keptMessages: LocalMessage[],
    options?: ReconcileNewestMessagesOptions,
  ): Interval | null {
    const pageWindow = this.ingestPage({
      page: [...page, ...keptMessages],
      isHead: true,
      isTail: false,
      setActive: false,
    });
    this.reconcileHeadAgainstPage(page, options);
    return pageWindow;
  }

  /**
   * Drops `windows` from storage and releases their messages, except those with `keepingIds`,
   * which the caller ingests again.
   */
  private dropWindows(
    windows: AnyInterval[],
    { keepingIds }: { keepingIds: ReadonlySet<string> },
  ) {
    for (const window of windows) {
      this.dropInterval(window.id);
      for (const id of window.itemIds) {
        if (!keepingIds.has(id)) this._itemIndex.remove(id);
      }
    }
  }

  /**
   * Marks the active interval, which does not reach the newest message, as able to load newer
   * messages. Publishes the flag and cursor only when they changed, so the window shown stays as
   * it is.
   */
  private markActiveIntervalBelowHead(window: Interval) {
    window.hasMoreHead = true;
    const cursor = this.getCursorFromInterval(window);
    const shown = this.state.getLatestValue();
    if (shown.hasMoreHead && shown.cursor?.headward === cursor.headward) return;
    this.state.partialNext({ hasMoreHead: true, cursor });
  }

  /**
   * The messages of `windows`, missing from a newest page placed across a gap, that the page's
   * window keeps:
   *
   * - unsent messages (see {@link isServerConfirmedMessage});
   * - messages from the page's oldest on: those that arrived during the request stay, and
   *   reconciling removes those the page proves were hard-deleted.
   */
  private getMessagesKeptAcrossGap(
    page: LocalMessage[],
    windows: AnyInterval[],
  ): LocalMessage[] {
    const pageIds = new Set(page.map((message) => this.getItemId(message)));
    const pageOldest = this.getPageOldestMessage(page);
    const isOlderThanPage = (message: LocalMessage) =>
      !!pageOldest && this.aIsMoreTailwardThanB(message, pageOldest);
    return windows
      .flatMap((interval) => this.intervalToItems(interval))
      .filter(
        (message) =>
          !pageIds.has(this.getItemId(message)) &&
          (!this.isServerConfirmedMessage(message) || !isOlderThanPage(message)),
      );
  }

  /**
   * Merges a fresh newest page, not separated by a gap, into the head window while another window
   * is shown. That window stays active and grows into the head window if the page overlaps it. In
   * an inactive paginator (see {@link isActivePaginator}), the head window is shown instead.
   */
  private mergePageIntoInactiveHead(
    page: LocalMessage[],
    options?: ReconcileNewestMessagesOptions,
  ) {
    const interval = this.ingestPage({ page, isHead: true, setActive: false });
    if (!interval) return;
    if (!this.isActivePaginator()) {
      this.showHeadInterval(page, options);
    } else if (this.isActiveInterval(interval)) {
      this.publishActiveIntervalGrownIntoHead();
    }
  }

  /** Publishes the active interval once a newest page grew it into the head window. */
  private publishActiveIntervalGrownIntoHead() {
    this.publishActiveInterval({
      hasMoreHead: false,
      cursor: { headward: null, tailward: this.cursor?.tailward ?? null },
    });
  }

  /**
   * Whether `page` proves it reached the channel's oldest message: the request was bounded by this
   * paginator's own `pageSize` and `page` came back shorter. A larger over-request (e.g.
   * `channel.reload`) may have been server-capped and never proves it. Gates `hasMoreTail` and the
   * gap rule ({@link isSeparatedFromHeadByGap}), never removing a message.
   */
  private pageReachedChannelStart(
    page: LocalMessage[],
    options?: ReconcileNewestMessagesOptions,
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
   * Whether this list holds `message`: it passes the filter and, in a channel's main list (no
   * `parentMessageId`), is not a reply only its thread lists (see `isThreadOnlyReply`).
   */
  private isListedMessage(message: LocalMessage): boolean {
    if (!this.matchesFilter(message)) return false;
    return !!this.parentMessageId || !isThreadOnlyReply(message);
  }

  /**
   * The failed messages a reload restores with {@link restoreFailedMessages}: those of the shown
   * window and the head window, and those of `persisted` (e.g. the offline database's rows of the
   * channel) this list holds (see {@link isListedMessage}). The loaded copy wins, as it is at least
   * as fresh. Take them before the reload's request.
   *
   * @internal
   */
  getFailedMessagesToRestore(persisted: LocalMessage[] = []): LocalMessage[] {
    const failedById = new Map<string, LocalMessage>();
    const listed = persisted.filter((message) => this.isListedMessage(message));
    const loaded = [...(this.items ?? []), ...this.anchoredHeadItems];
    for (const message of [...listed, ...loaded]) {
      if (message.status === 'failed') failedById.set(this.getItemId(message), message);
    }
    return [...failedById.values()];
  }

  /**
   * Ingests again each failed message taken before a reload (see
   * {@link getFailedMessagesToRestore}) that no window holds after it, so a reload never loses the
   * user's unsent work. One a window holds is left as it is: it may have been resent.
   *
   * @internal
   */
  restoreFailedMessages(failedMessages: LocalMessage[]) {
    const isNoLongerLoaded = (message: LocalMessage) =>
      !this.findIntervalHoldingItem(message);
    const toRestore = failedMessages.filter(isNoLongerLoaded);
    if (!toRestore.length) return;
    this.batch(
      () => {
        for (const message of toRestore) this.ingestItem(message);
      },
      { coalesce: true },
    );
  }

  /**
   * Destructive half of {@link reconcileNewestMessages}: removes loaded head-interval messages
   * that `page` (the fresh newest window) proves were hard-deleted while the client received no
   * events, by `created_at`:
   *
   * - within `page`'s span: a server-confirmed message absent from `page` was deleted (a live
   *   arrival is newer than `page`'s newest, so this needs no snapshot);
   * - at or above `page`'s newest, and for an empty `page`: only IDs in the pre-fetch
   *   `headIntervalItemIdsAtRequest` snapshot, which tells a just-deleted message from a live
   *   arrival or a send confirmed during the request.
   *
   * Messages below `page`'s oldest are kept (a hard-deleted oldest looks like a server-capped
   * over-request) and returned for {@link pruneBelowWindowIfReachedStart}. Removal goes through
   * {@link removeItem}, so the index, intervals, message store and any subclass bookkeeping (e.g.
   * the latest message of {@link MessagePaginator}) stay correct.
   *
   * @returns The below-window leftover IDs. Empty for the no-head and empty-page paths.
   */
  protected reconcileHeadAgainstPage(
    page: LocalMessage[],
    options?: ReconcileNewestMessagesOptions,
  ): string[] {
    const headInterval = this.itemIntervals[0] as Interval | undefined;
    if (!headInterval?.isHead) return [];

    const loadedIds = headInterval.itemIds;
    const headIntervalItemIdsAtRequest = options?.headIntervalItemIdsAtRequest;

    // Empty page: the channel has no messages. Only IDs from the pre-fetch snapshot are removed, so a
    // message that landed during the fetch survives.
    if (!page.length) {
      if (!headIntervalItemIdsAtRequest) return [];
      const toRemove = loadedIds.filter(
        (id) => headIntervalItemIdsAtRequest.has(id) && this.isServerConfirmedItemId(id),
      );
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
        // At or above the page's newest, a hard-deleted newest message, a live arrival and a send
        // confirmed during the request look the same: remove only IDs from the pre-fetch snapshot,
        // which holds none of the latter two.
        if (headIntervalItemIdsAtRequest?.has(id)) toRemove.push(id);
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

  /** Removes reconciled IDs in one coalesced batch (one publish), then mirrors it offline. */
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
    if (active) {
      // `setActiveInterval` does not emit for a logical interval, so its survivors are emitted here.
      if (isLogicalInterval(active)) {
        this.state.partialNext({ items: this.intervalToItems(active) });
      } else {
        this.setActiveInterval(active);
      }
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
   * Searches the loaded windows from the head down (each already sorted, O(log n) per window): the
   * first holding a message at or before `timestamp` holds the answer. Used by the receipts tracker
   * to resolve read/delivered cursors.
   */
  findItemByTimestamp = (
    timestamp: TimestampNS,
    exactTsMatch = false,
  ): LocalMessage | null => {
    for (const interval of this.sortIntervals(this.itemIntervals)) {
      const found = this.findItemByTimestampIn(
        this.intervalToItems(interval),
        timestamp,
        exactTsMatch,
      );
      if (found !== undefined) return found;
    }
    return null;
  };

  /**
   * {@link findItemByTimestamp} within one window (`items` ascending by `created_at`). `undefined`
   * when every item is newer than `timestamp`, so an older window has to be searched.
   */
  private findItemByTimestampIn(
    items: LocalMessage[],
    timestamp: TimestampNS,
    exactTsMatch: boolean,
  ): LocalMessage | null | undefined {
    if (!items.length) return undefined;
    // A floor, not a ceil: a cursor is the timestamp of the last message a participant reached, so a
    // ceil would count the oldest loaded message as read by a cursor that predates all of them.
    // `lowerBound` finds the first index strictly after the target.
    const firstAfter = lowerBound(items.length, (i) => {
      const t = getMessageCreatedAtTimestamp(items[i]);
      return t === null || t > timestamp;
    });
    if (firstAfter === 0) return undefined; // target precedes every message in this window
    const found = items[firstAfter - 1];
    const foundTimestamp = getMessageCreatedAtTimestamp(found);
    // A message without a server timestamp (e.g. optimistic) cannot be located.
    if (foundTimestamp === null) return null;
    if (!exactTsMatch) return found;
    return foundTimestamp === timestamp ? found : null;
  }

  override filterQueryResults(items: LocalMessage[]) {
    return items.filter(this.shouldIncludeMessageInInterval.bind(this));
  }

  private getCanonicalQueryItems(items: LocalMessage[]): LocalMessage[] {
    return [...items].sort(this.itemOrderComparator);
  }

  /**
   * The cursor and more-messages flags after a page is placed (`deriveCursor`), comparing the page
   * with the interval's outermost server-known messages (see {@link getServerKnownEdges}): a page
   * never holds an unsent message, so one at an edge must not hide that the page reached the edge.
   */
  private deriveCursorFromPage(
    ctx: CursorDeriveContext<LocalMessage, MessageQueryShape>,
  ): CursorDeriveResult {
    // The interval is built from the filtered page but `ctx.page` is the raw response. The
    // derivators compare the page's length with the requested size, and the linear one its edges
    // with the interval's server-known edges, so the locally filtered messages (e.g. shadowed) are
    // dropped here, or they would wrongly conclude the page is not at the bounds.
    const pageWithPermittedMessages: LocalMessage[] = [];
    let filteredLocallyCount = 0;
    for (const message of ctx.page) {
      if (!this.shouldIncludeMessageInInterval(message)) {
        filteredLocallyCount++;
      } else {
        pageWithPermittedMessages.push(message);
      }
    }

    const requestedPageSizeAfterAdjustment = Math.max(
      0,
      ctx.requestedPageSize - filteredLocallyCount,
    );
    if (ctx.interval.itemIds.length + filteredLocallyCount < ctx.page.length) {
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

    const derivationCtx = {
      ...ctx,
      intervalEdges: this.getServerKnownEdges(ctx.interval),
      page: pageWithPermittedMessages,
      requestedPageSize: requestedPageSizeAfterAdjustment,
    };
    const flags = (ctx.queryShape as MessagePaginationParams)?.created_at_around
      ? deriveCreatedAtAroundPaginationFlags<LocalMessage, MessagePaginationParams>(
          derivationCtx,
        )
      : ctx.queryShape?.id_around
        ? deriveIdAroundPaginationFlags(derivationCtx)
        : deriveLinearPaginationFlags(derivationCtx);
    return { ...flags, cursor: this.getCursorFromInterval(ctx.interval, flags) };
  }
}
