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
  /**
   * Optional reason attached to emitted focus signal.
   * Defaults to `jump-to-message`.
   */
  focusReason?: MessageFocusReason;
  /**
   * TTL for the emitted focus signal in milliseconds.
   * Defaults to `3000`.
   */
  focusSignalTtlMs?: number;
  /**
   * If true, suppresses focus signal emission after a successful jump.
   */
  suppressFocusSignal?: boolean;
  /**
   * Also watch the channel, so it receives its events, when it isn't watched yet: the request that
   * loads the window around the message asks to watch too, so it takes one request. A message
   * already loaded is then loaded again with that request. Ignored for a thread's reply list, which
   * loads replies through a request that can't watch, and when the paginator's `doRequest` loads
   * the messages.
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

/**
 * A message's `created_at` as the comparable wire timestamp (unix nanoseconds), or `null` when it
 * is absent or not a finite number.
 *
 * Accepts `null`/`undefined` so callers holding an optional message (e.g.
 * `MessagePaginator.latestMessage`) do not each repeat the guard.
 */
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
  /**
   * Sort passed to backend message/replies query.
   * Does not affect in-memory item ordering.
   */
  requestSort?: MessagePaginatorSort;
  /**
   * @deprecated Use `requestSort` instead.
   */
  sort?: MessagePaginatorSort;
  /**
   * In-memory ordering for items exposed by paginator state.
   */
  itemOrder?: MessagePaginatorSort;
  paginatorOptions?: PaginatorOptions<LocalMessage, MessageQueryShape>;
};

/**
 * Options for the destructive part of {@link MessageIntervalPaginator.reconcileNewestMessages} —
 * removing messages that were hard-deleted (by anyone) while the client received no events (a
 * dropped socket, a backgrounded app). A hard delete reaches only the clients connected at that
 * moment, and merging a page is otherwise additive, so without this such a message lingers as a
 * ghost after reconnect.
 *
 * Throughout, `page` is the newest window the server returned for `reconcileNewestMessages`, and
 * "`page`'s newest / oldest message" are its bounds by `created_at`. With NO options,
 * `reconcileNewestMessages` prunes any loaded message that falls WITHIN `page`'s `created_at` span
 * but is absent from it — unconditionally safe (a message that arrived live during the caller's
 * fetch is always strictly newer than `page`'s newest message, so it can never fall in that span).
 * `headIntervalItemIdsAtRequest` widens the reconcilable window at the TOP edge; `requestedLimit`
 * says whether the page reached the channel start:
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
   * The ids of the head interval's items when the request for `page` went out. Required to prune
   * messages NEWER than `page`'s newest message (a hard-deleted newest message) and to reconcile an
   * empty `page` (a fully-emptied channel): at/above that top edge a just-deleted message and a
   * message that arrived live during the request are indistinguishable by timestamp — only this
   * snapshot separates them (a live arrival is not in it). Only the head interval receives live
   * messages, so only its ids are needed. Must be captured before the request is awaited; the
   * paginator's own items at merge time already include any live arrival.
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
 * MessageIntervalPaginator allows configuring backend request sort, while keeping internal item ordering stable.
 * Filtering of ingested items is still limited to local predicates (`filterQueryResults`).
 */
export class MessageIntervalPaginator extends BasePaginator<
  LocalMessage,
  MessageQueryShape,
  MessageQueryResponse
> {
  /**
   * The name this list's index goes by as a holder in the message store. A prototype getter, so it
   * is already the subclass's while the base constructor builds the index.
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
  /** Pending below-window reached-start probe (exposed for deterministic test awaiting). */
  private _belowWindowReconcile?: Promise<void>;
  sortComparator: (a: LocalMessage, b: LocalMessage) => number;
  /**
   * Single source of truth for whether a message should be included in paginator intervals/state.
   * Keep this consistent with `filterQueryResults` AND cursor flag derivation.
   */
  shouldIncludeMessageInInterval(message: LocalMessage): boolean {
    return !message.shadowed;
  }

  /**
   * Entity-store adapter (this paginator is an `EntityStoreSubscriber`): the `EntityStore` calls this
   * on each holder with the subset of its watched ids that changed. Unwraps the batch and delegates to
   * the base's store-agnostic {@link BasePaginator.reconcileChangedIds}. Lives here, not on the generic
   * `BasePaginator`, so the base stays free of `EntityStore` types — only message paginators are
   * store-backed.
   */
  onEntitiesChanged({ changedIds }: EntityStoreChangeBatch): void {
    this.reconcileChangedIds(changedIds);
  }

  /**
   * Entity-store subscriber: the store removed a message this paginator holds, so it drops it from
   * its windows.
   */
  onEntityRemoved(id: string, message: unknown): void {
    this.removeItem({ id, item: message as LocalMessage });
  }

  /**
   * Entity-store subscriber flush (the optional `EntityStoreSubscriber.flushState`): the `EntityStore`
   * calls this after an optimistic (local-user) write so the change renders without throttle delay.
   * Delegates to the base's generic {@link BasePaginator.flushPendingPublishes}.
   */
  flushState(): void {
    this.flushPendingPublishes();
  }

  /**
   * UI-driven "hold off on pruning" signal, set via {@link setPruningSuspended}. Defaults to not
   * suspended, so a paginator with no UI attached still honours its configured cap.
   */
  protected get isPruningSuspended(): boolean {
    return this._pruningSuspended;
  }

  private _pruningSuspended = false;

  /**
   * Tells the paginator to hold off on dropping the oldest loaded messages. The SDK calls this from
   * its viewability tracking: while the user is reading near the oldest loaded message, pruning there
   * would pull content out from under them, so the window is allowed to grow past its cap until they
   * scroll back. Only meaningful alongside `maxLoadedItems`.
   *
   * Deliberately a plain field rather than a `StateStore` — nothing observes it, and a scroll-driven
   * signal must not be able to cost a render.
   */
  setPruningSuspended = (suspended: boolean) => {
    this._pruningSuspended = suspended;
  };

  /**
   * A message can anchor pagination once the server has acknowledged it. Narrowing this is what keeps
   * an unsent message out of both halves of a prune: it is skipped rather than dropped, and it can
   * never become the window's tailward cursor (its id would go out as `id_lt` and mean nothing to the
   * server).
   */
  protected isPaginationAnchorable(item: LocalMessage | undefined): boolean {
    return !!item && this.isServerConfirmedMessage(item);
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
        // Back every message-interval paginator (channel main list, thread reply list, pinned list)
        // with the client-global message store, so a message held in more than one of them has a
        // single canonical copy and updates (reactions/edits) fan out to all holders — no copy-to-copy
        // sync. When the store is unavailable (e.g. a detached paginator in a test) the index falls
        // back to a private store and behaves exactly like a plain per-instance index. Overridable per
        // instance via `paginatorOptions.createItemIndex` or an explicit `itemIndex`.
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
      // SDK-supplied, so a declarative registration overrides them. `hasPaginationQueryShapeChanged`
      // and the zero cursor were previously spread into the caller's options, where they outranked
      // every `client.config.set({ messagePaginator: … })`.
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
   * Memoized so every derivation sees the *same* two functions. `initializeConfig` folds this into the
   * config it publishes and skips the publish when nothing moved — which only works if these references
   * are stable.
   *
   * Safe to build once: both close over `this` and read `_itemOrder`, which is assigned in the
   * constructor and has no setter.
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
   * Cursor derivation and in-memory item ordering, which this class installs on `config` rather than
   * passing as constructor options.
   *
   * Contributed to the base derivation rather than written after it — see
   * {@link BasePaginator.getBehaviourOverrides}. That is what keeps one re-derivation to one publish,
   * and stops the intermediate publish that had these two stripped.
   */
  protected override getBehaviourOverrides(): Partial<
    BasePaginatorConfig<LocalMessage, MessageQueryShape>
  > {
    return this.buildIntervalBehaviour();
  }

  /**
   * The constructor's route to the same overlay. Deliberately calls the private builder rather than the
   * overridable hook: this runs inside the constructor, and a subclass override would execute before its
   * own fields were initialized.
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

  /**
   * Even though we do not send filters object to the server, we need to have filters for client-side item ingestion logic.
   */
  buildMatchFilters = (): MessagePaginatorFilter => ({
    cid: this.channel.cid,
    ...(this.parentMessageId ? { parent_id: this.parentMessageId } : {}),
  });

  // invoked inside BasePaginator.executeQuery() to keep it as a query descriptor;
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

    // if there is no direction, then we are jumping, and we want to set both directions in the cursor
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
      // if there is no direction, then we are jumping, and we want to set both directions in the cursor
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
   * Whether someone reads this list, so a page from a query this paginator did not run leaves them
   * on the window they are on. When nobody does, a fresh newest page is shown instead. The
   * channel's own message list is read while the channel is active (see `Channel.activate()`).
   * Any other list, such as a thread's replies, always counts as read: the channel being active
   * says nothing about it.
   */
  private isBeingRead(): boolean {
    // widened: TypeScript does not compare the polymorphic `this` with a subclass
    const isChannelMessageList =
      this.channel.messagePaginator === (this as MessageIntervalPaginator);
    return !isChannelMessageList || this.channel.active;
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
   * The reader stays on the window they are on: moving them is this paginator's own methods' job
   * (`jumpToMessage()` and the like). The exception is a list nobody reads (see
   * {@link isBeingRead}), where the newest page is shown as when no window is active. When a page
   * lands in the active window, overlaps it, or takes in an active window of live messages only,
   * that window is shown again with the page. The paginator's own queries are left alone too: a
   * running one keeps its loading flag, and its last query error and query shape stay.
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
    // only live messages, with no page loaded yet, count as no active window, as does a window
    // nobody reads
    const hasActiveInterval =
      !!activeInterval && !isLogicalInterval(activeInterval) && this.isBeingRead();
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
   * Prepares an external query for a page of these messages: the channel query `channel.watch()`
   * sends with the `messages` options its caller gave. Call it before
   * sending the query, and place the returned page with `placePage` before the response's read
   * state is applied: the read state is resolved against the loaded messages.
   *
   * - `messagePaginationParams`: the options to send as the query's `messages`, with `limit` set to
   *   the page size when not given.
   * - `isNewestPage`: whether the query asks for the newest page — no cursor, not around a message,
   *   and some messages.
   * - `placePage`: places the returned page. The newest page reconciles the loaded newest messages
   *   ({@link reconcileNewestMessages}), against the messages loaded when the query was prepared,
   *   or is placed as a first page when none are loaded; any other page is placed by
   *   {@link placeExternalQueryPage}. A query for no messages (`limit: 0`) places nothing. Returns
   *   whether it showed a first page.
   */
  prepareExternalQuery(messages?: MessagePaginationParams): PreparedExternalQuery {
    const messagePaginationParams: MessagePaginationParams = {
      ...messages,
      limit: messages?.limit ?? this.pageSize,
    };
    const limit = messagePaginationParams.limit ?? this.pageSize;
    // A page of no messages says nothing about the channel, so it must not be read as an empty one.
    if (limit === 0) {
      return { messagePaginationParams, isNewestPage: false, placePage: () => false };
    }

    const isNewestPage = this.isHeadPageQueryShape(messagePaginationParams);
    // Read before the request: the newest page tells a message hard-deleted while no events were
    // received (in the head interval now, missing from the page) from one that arrives live during
    // the request (not in it now).
    // TODO(perf/cleanup): `anchoredHeadItems` materializes full message objects (intervalToItems) just
    // to map them down to ids. A cheaper, clearer equivalent is a straight copy of the paginator index's
    // own id set — expose `memberIds` on StoreBackedItemIndex (e.g. `snapshotMembers()` returning
    // `new Set(this.memberIds)`) and use it here AND in client.queryChannelsAndHydrate. The broader
    // scope (all intervals vs just the head) is inert: the reconcile only consults head ids, older
    // island ids are never at/above-newest, and local messages are guarded by isServerConfirmedMessage.
    const headIntervalItemIdsAtRequest = isNewestPage
      ? new Set(this.anchoredHeadItems.map((message) => this.getItemId(message)))
      : undefined;
    return {
      messagePaginationParams,
      isNewestPage,
      placePage: (page) => {
        if (isNewestPage && this.canReconcileNewestMessages) {
          this.reconcileNewestMessages(page, {
            headIntervalItemIdsAtRequest,
            requestedLimit: limit,
          });
          return false;
        }
        return this.placeExternalQueryPage(page, limit, messagePaginationParams);
      },
    };
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

  /** A jump sends its own `limit`, so its head/tail flags are derived against that, not `pageSize`. */
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
    let state: Partial<PaginatorState<LocalMessage>> | undefined;
    if (localMessage) {
      interval = this.locateIntervalForItem(localMessage);
      if (
        interval &&
        !isLogicalInterval(interval) &&
        !interval.itemIds.includes(messageId)
      ) {
        // locateIntervalForItem can match by created_at RANGE and return an interval whose range
        // spans the target while its loaded itemIds do NOT contain it (e.g. a neighbouring interval
        // grew across the target's position without merging). Prefer the interval that actually
        // holds the id so the jump activates the window the message really lives in - otherwise, if
        // the range-matched interval happens to be active, the jump becomes a no-op.
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
      state = {
        hasMoreHead: interval.hasMoreHead,
        hasMoreTail: interval.hasMoreTail,
        cursor: this.getCursorFromInterval(interval),
        items: this.intervalToItems(interval),
      };
    } else {
      const result = await this.executeQuery({
        claimsActiveInterval: true,
        // Always send a limit, since the replies endpoint ignores `id_around` without one and returns the
        // newest replies instead.
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
      state = isLogicalInterval(interval)
        ? result.stateCandidate
        : {
            ...result.stateCandidate,
            hasMoreHead: interval.hasMoreHead,
            hasMoreTail: interval.hasMoreTail,
            // Prefer the cursor derived during placeQueryPage, but fall back to
            // interval-derived cursor to keep jumps consistent if the stateCandidate
            // is partial.
            cursor: result.stateCandidate.cursor ?? this.getCursorFromInterval(interval),
            items: this.intervalToItems(interval),
          };
    }

    if (!this.isActiveInterval(interval)) {
      this.setActiveInterval(interval, { updateState: false });
    }
    if (state) this.state.partialNext(state);
    // A window an external query stored is shown without a query of this paginator: record the
    // shape its next query continues from.
    this.recordLoadedWindowQueryShape();
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
      // load the newest page in case pagination is currently on an older window (an empty/partial
      // headward response marks the interval as the head)
      const result = await this.executeQuery({
        claimsActiveInterval: true,
        direction: 'headward',
        updateState: false,
      });
      // a later claim decides the active interval, and the page stays stored
      if (result?.isSuperseded) return false;
    }

    // Re-read itemIntervals AFTER the query: the getter returns a fresh array each call, so a
    // reference captured before executeQuery would be stale and miss the head we just loaded.
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
   * Reconciles the loaded newest messages with a fresh newest page, without issuing a query: they
   * are brought up to date in place — messages added and updated, those the page proves were
   * hard-deleted removed — rather than blanked and reloaded. The page comes from an external query
   * (a reload, a channel-list query, connection recovery). The reader stays on their window;
   * moving them is `jumpToTheLatestMessage()`'s job. In a list nobody reads (see
   * {@link isBeingRead}), the head window is shown instead.
   *
   * Where the page goes depends on the head window, the loaded window reaching the newest message:
   *
   * 1. NO HEAD WINDOW (only live messages, a jumped-to window, or a cleared head mark, see
   *    {@link unmarkHead}) - the page becomes the head window, merging with the windows it
   *    overlaps, live messages included, minus what it proves was hard-deleted. It is shown if the
   *    reader was on the live messages it absorbed; a window being read that it overlaps grows.
   *
   * 2. SEPARATED BY A GAP (see {@link isSeparatedFromHeadByGap}) - merging would weld the two
   *    across the gap, hiding the messages in between, so the page becomes a head window of its
   *    own (see {@link placeNewestPageAcrossGap}).
   *
   * 3. OTHERWISE - the page merges into the head window, which keeps every loaded message and drops
   *    what the page proves was hard-deleted (see {@link reconcileHeadAgainstPage}). A head window
   *    being read gets its tail boundary from the page (see {@link showHeadInterval}); otherwise
   *    the reader stays, and a window being read that the page overlaps grows into the head window.
   *
   * It never blanks the loaded windows, and with nothing loaded it does nothing: placing a first
   * page is {@link placeQueryPage}'s job. An empty page changes nothing on its own but, given a
   * pre-fetch snapshot (`options.headIntervalItemIdsAtRequest`), is reconciled as "the channel has
   * no messages": every server-confirmed message of the head window is removed.
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
      // The newest messages are not loaded as a window: only live content arrived (the first query
      // came back empty and the reply the user then sent went to the logical head, a thread/channel
      // creation for example), only a window the reader jumped to is loaded, or the head mark was
      // cleared (see `unmarkHead`). Returning would discard the fetched page, so the newest
      // messages could never be reached. We mark it as the head window, and `ingestPage` merges
      // into it the windows it overlaps, live messages included.
      //
      // Nothing loaded at all stays a no-op: placing a first page is `placeQueryPage`'s job.
      const logicalHead = this.liveHeadLogical;
      const hasAnchoredHead = this.itemIntervals.some(
        (interval) => !isLogicalInterval(interval) && interval.isHead,
      );
      if (!this.itemIntervals.length || hasAnchoredHead || !page?.length) return;

      // Take over the view if the reader is on the live content being absorbed, or nobody reads the
      // list. A reader who jumped to another interval stays there, with the page anchored for their
      // return (the rule the jumped away branch below enforces).
      const takeOverView =
        !this.isBeingRead() || (!!logicalHead && this.isActiveInterval(logicalHead));

      const anchored = this.ingestPage({ page, isHead: true, setActive: false });
      if (!anchored) return;
      // The page may have merged into a window that stopped reaching the newest message (see
      // `unmarkHead`); remove from it, as from the head, what the page proves was hard-deleted.
      this.reconcileHeadAgainstPage(page, options);
      if (!takeOverView) {
        // The page merged into the window being read, which now reaches the head: show what it gained.
        if (this.isActiveInterval(anchored)) {
          this.publishActiveIntervalGrownIntoHead();
        }
        return;
      }
      this.showHeadInterval(page, options);
      return;
    }
    // Captured BEFORE the merge overwrites state — inputs for the below-window reached-start probe
    // (overlap branch only): did we believe we were at the channel start, and how much was loaded.
    const wasAtChannelStart = !this.state.getLatestValue().hasMoreTail;
    const preMergeLoadedCount = headInterval.itemIds.length;

    if (!page?.length) {
      // Empty page: never blanks the list by itself. Only when the caller supplied a pre-fetch
      // snapshot do we treat it as authoritative "channel emptied" and remove ghosts (a message that
      // arrived live during the fetch is excluded by the snapshot).
      this.reconcileHeadAgainstPage([], options);
      return;
    }

    if (this.isSeparatedFromHeadByGap(headInterval, page, options)) {
      this.placeNewestPageAcrossGap(headInterval, page, options);
      return;
    }

    // Another window is shown; the head window is still reconciled, so returning to it
    // (scroll-to-latest) shows neither ghosts nor stale newest messages.
    if (!this.isActiveInterval(headInterval)) {
      this.reconcileHeadAgainstPage(page, options);
      this.mergePageIntoInactiveHead(page, options);
      return;
    }

    // the head window is being read: merge in place, keeping every loaded message
    const interval = this.ingestPage({
      page,
      isHead: true,
      setActive: false,
      targetIntervalId: headInterval.id,
    });
    if (!interval) return;
    this.showHeadInterval(page, options);

    // With the newest page merged in, drop any loaded message the page proves was hard-deleted, and
    // collect the below-window leftovers it cannot decide from the page alone.
    const belowWindow = this.reconcileHeadAgainstPage(page, options);

    // The leftovers are ambiguous (hard-deleted oldest vs server-capped over-request). Only a
    // full-window reload (`requestedLimit >= loaded`, so NOT the small list hydrate) that we believed
    // reached the start could have reached it — probe to settle them there; anything else can't, so skip.
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
   * Whether a fresh newest page and the head window are separated by a gap, with messages between
   * them possibly not loaded. They are not when:
   *
   * - they share a message;
   * - the head window holds no server message older than the page: the rest is within the page's
   *   span, newer (sent after the page was produced, so it arrived as an event), or unsent (it
   *   carries the device's clock);
   * - the page reached the channel start (see {@link pageReachedChannelStart}).
   *
   * A message missed while the socket was down comes with connection recovery's newest page.
   */
  private isSeparatedFromHeadByGap(
    head: Interval,
    page: LocalMessage[],
    options?: ReconcileNewestMessagesOptions,
  ): boolean {
    const headIds = new Set(head.itemIds);
    const sharesMessage = page.some((message) => headIds.has(this.getItemId(message)));
    if (sharesMessage) return false;
    if (!this.holdsServerMessageOlderThan(head, page)) return false;
    if (this.pageReachedChannelStart(page, options)) return false;
    return true;
  }

  /** Whether the interval holds a server-confirmed message older than every message of `page`. */
  private holdsServerMessageOlderThan(interval: Interval, page: LocalMessage[]): boolean {
    const pageOldest = this.getPageOldestMessage(page);
    if (!pageOldest) return false;
    return interval.itemIds.some((id) => {
      const message = this.getItem(id);
      return (
        !!message &&
        this.isServerConfirmedMessage(message) &&
        this.aIsMoreTailwardThanB(message, pageOldest)
      );
    });
  }

  private getPageOldestMessage(page: LocalMessage[]): LocalMessage | undefined {
    return this.getPagePaginationEdges(this.getCanonicalQueryItems(page)).tail;
  }

  /**
   * Places a fresh newest page separated from the head window by a gap (see
   * {@link isSeparatedFromHeadByGap}) as a head window of its own, with older messages to load:
   *
   * - The old head window keeps the messages older than the page and stops being the head: it can
   *   load newer messages up to the page, then merges with it. It stays shown if being read; in a
   *   list nobody reads (see {@link isBeingRead}), the page's window is shown instead.
   * - Its messages from the page's oldest on (arrivals during the request, unsent messages and ones
   *   the page proves were hard-deleted) move to the page's window, so the two never overlap and
   *   are never welded across the gap. Reconciling then removes the hard-deleted ones.
   */
  private placeNewestPageAcrossGap(
    head: Interval,
    page: LocalMessage[],
    options?: ReconcileNewestMessagesOptions,
  ) {
    const pageOldest = this.getPageOldestMessage(page);
    const isOlderThanPage = (id: string) => {
      const message = this.getItem(id);
      return !!message && !!pageOldest && this.aIsMoreTailwardThanB(message, pageOldest);
    };
    const keptHead: Interval = {
      ...head,
      hasMoreHead: true,
      isHead: false,
      itemIds: head.itemIds.filter(isOlderThanPage),
    };
    const movedMessages = head.itemIds
      .filter((id) => !isOlderThanPage(id))
      .map((id) => this.getItem(id))
      .filter((message): message is LocalMessage => !!message);

    // one publish, once the head window is in place and reconciled, so subscribers read it whole
    this.batch(
      () => {
        this.commitInterval(keptHead);
        const newHead = this.ingestPage({
          page: [...page, ...movedMessages],
          isHead: true,
          isTail: false,
          setActive: false,
        });
        this.reconcileHeadAgainstPage(page, options);
        if (newHead && !this.isBeingRead()) {
          this.showHeadInterval(page, options);
        } else if (this.isActiveInterval(keptHead)) {
          this.publishActiveInterval({
            cursor: this.getCursorFromInterval(keptHead),
            hasMoreHead: true,
          });
        } else if (newHead && this.isActiveInterval(newHead)) {
          // The page overlaps the window being read, which grew into the head window.
          this.publishActiveIntervalGrownIntoHead();
        }
      },
      { coalesce: true },
    );
  }

  /**
   * Merges a fresh newest page, not separated by a gap, into the head window while another window
   * is shown. A reader stays on that window, which grows into the head window if the page overlaps
   * it. In a list nobody reads (see {@link isBeingRead}), the head window is shown instead.
   */
  private mergePageIntoInactiveHead(
    page: LocalMessage[],
    options?: ReconcileNewestMessagesOptions,
  ) {
    const interval = this.ingestPage({ page, isHead: true, setActive: false });
    if (!interval) return;
    if (!this.isBeingRead()) {
      this.showHeadInterval(page, options);
    } else if (this.isActiveInterval(interval)) {
      this.publishActiveIntervalGrownIntoHead();
    }
  }

  /** Publishes the window being read once a newest page grew it into the head window. */
  private publishActiveIntervalGrownIntoHead() {
    this.publishActiveInterval({
      hasMoreHead: false,
      cursor: { headward: null, tailward: this.cursor?.tailward ?? null },
    });
  }

  /**
   * Whether `page` proves it reached the channel's own oldest message: the caller's request was
   * bounded by this paginator's OWN `pageSize` AND `page` came back shorter than that request.
   *
   * `pageSize <= the server's max page size` is already the invariant normal pagination
   * (`executeQuery`) relies on — `page.length < pageSize` ⟹ reached the end — so a request no larger
   * than `pageSize` returns exactly what was asked unless the channel ended. This needs no hardcoded
   * max page size and is per-paginator, so a thread reply paginator uses its own `pageSize`.
   *
   * An OVER-request (larger than `pageSize`, e.g. `channel.reload` re-fetching the whole loaded window
   * to reconcile as much as possible) may have been silently capped by the server, so a short page
   * there is NOT proof of reaching the start — return `false` and stay conservative. It gates
   * `hasMoreTail` and the gap rule ({@link isSeparatedFromHeadByGap}), never removing a message.
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
   * Settle the below-window leftovers {@link reconcileHeadAgainstPage} handed back (loaded messages
   * older than `anchorId` — the returned page's oldest — and absent from the page). From the page alone
   * they're ambiguous: a hard-deleted oldest vs a server-capped over-request. Ask the server "anything
   * older than `anchorId`?" — the only cap-free way to tell. Nothing older ⇒ genuine deletes ⇒ remove
   * them and settle the tail. A probe failure or a head change across the await keeps them (never a false
   * delete). The caller decides WHEN this runs.
   */
  private async pruneBelowWindowIfReachedStart(
    belowWindow: string[],
    anchorId: string,
  ): Promise<void> {
    const headId = (this.itemIntervals[0] as Interval | undefined)?.id;
    // older exists (or the probe failed), we we're not provably the start, so
    // keep the leftovers
    if (await this.hasMessagesOlderThan(anchorId).catch(() => true)) return;
    // revalidate the head across the await (a jump/reset/newer merge aborts), then remove the leftovers
    const head = this.itemIntervals[0] as Interval | undefined;
    if (!head?.isHead || head.id !== headId) return;
    this.removeReconciledItems(belowWindow);
    head.hasMoreTail = false; // we now KNOW we reached the start, so settle the "load older" affordance
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
   * Whether a loaded message is server-confirmed and therefore eligible to be reconciled away when
   * absent from an authoritative page. Excludes local-only messages the server has never
   * acknowledged — optimistic (`sending`) and `failed` sends, and client-side `error` placeholders —
   * so a legitimately-unsent message is never mistaken for a hard delete.
   */
  protected isServerConfirmedMessage(message: LocalMessage): boolean {
    return (
      message.status !== 'sending' &&
      message.status !== 'failed' &&
      message.type !== 'error'
    );
  }

  /**
   * Destructive half of {@link reconcileNewestMessages}: remove messages in the loaded head
   * interval that `page` proves were hard-deleted while the client received no events (a hard
   * delete reaches only the clients connected at that moment, and the merge is additive, so they
   * would otherwise linger forever).
   *
   * Here `page` is the freshly-fetched newest window the server returned for the query that produced
   * it. Its two bounds are its NEWEST message (`page`'s last item by `created_at`) and its OLDEST
   * message (`page`'s first item). Reconciliation removes ONLY messages `page` actually covers — no
   * hardcoded page size is involved — in two regions, by a loaded message's `created_at`:
   *
   * - WITHIN `page` (strictly between `page`'s oldest and newest message): a server-confirmed loaded
   *   message absent from `page` was hard-deleted. Safe with no snapshot — a message that arrived live
   *   during the caller's fetch is always strictly newer than `page`'s newest message, so it can never
   *   fall in this span.
   * - AT/ABOVE `page`'s newest message (a hard-deleted newest message), and the empty-`page` case:
   *   only reconcilable with a pre-fetch `headIntervalItemIdsAtRequest` snapshot, which alone tells a just-deleted
   *   message from one that arrived live during the fetch at that top edge.
   *
   * A loaded message BELOW `page`'s oldest is NOT removed here (window-only) — from the page alone a
   * hard-deleted oldest is indistinguishable from a server-capped over-request. Those messages are
   * instead RETURNED (the below-window leftovers) so {@link pruneBelowWindowIfReachedStart} can settle
   * them with a `limit: 1` "anything older?" probe — the only cap-free proof — and remove them only if
   * the server confirms nothing older exists. Absent that proof they are kept (a later cold/fresh query
   * omits any real delete).
   *
   * Removal goes through {@link removeItem} (batched) so the item index, intervals, shared message
   * store and — via the {@link MessagePaginator} override — the latest message all stay correct;
   * the active window is then re-emitted once.
   *
   * @returns the below-window leftover ids (loaded, server-confirmed, older than `page`'s oldest, absent
   *   from it) for the caller's reached-start probe. Empty for the no-head / empty-page paths.
   */
  protected reconcileHeadAgainstPage(
    page: LocalMessage[],
    options?: ReconcileNewestMessagesOptions,
  ): string[] {
    const headInterval = this.itemIntervals[0] as Interval | undefined;
    if (!headInterval?.isHead) return [];

    const loadedIds = headInterval.itemIds;
    const headIntervalItemIdsAtRequest = options?.headIntervalItemIdsAtRequest;

    // Empty page → the channel has no messages. Every server-confirmed loaded message is gone, but
    // only remove ids from the pre-fetch snapshot so a message that landed during the fetch survives.
    if (!page.length) {
      if (!headIntervalItemIdsAtRequest) return [];
      const toRemove = loadedIds.filter((id) => {
        if (!headIntervalItemIdsAtRequest.has(id)) return false;
        const message = this.getItem(id);
        return !!message && this.isServerConfirmedMessage(message);
      });
      this.removeReconciledItems(toRemove);
      return [];
    }

    const pageIds = new Set(page.map((message) => this.getItemId(message)));
    const newestReturnedTs = getMessageCreatedAtTimestamp(page[page.length - 1]);
    const oldestReturnedTs = getMessageCreatedAtTimestamp(page[0]);

    // Window-only: never remove below the returned page's oldest here, because from the page alone a
    // hard-deleted oldest is indistinguishable from a server-capped over-request. Below-window messages
    // are collected into `belowWindow` and returned instead, for the reached-start probe to settle.
    const windowLowTs = oldestReturnedTs ?? Number.POSITIVE_INFINITY;

    const toRemove: string[] = [];
    const belowWindow: string[] = [];
    for (const id of loadedIds) {
      if (pageIds.has(id)) continue; // present on the server → keep
      const message = this.getItem(id);
      if (!message || !this.isServerConfirmedMessage(message)) continue; // local-only → keep
      const ts = getMessageCreatedAtTimestamp(message);
      if (ts === null) continue; // no server timestamp (optimistic) → keep

      if (newestReturnedTs !== null && ts >= newestReturnedTs) {
        // At/above the newest returned message: a hard-deleted newest message and a message that
        // arrived live during the fetch are indistinguishable here. Only remove ids present in the
        // pre-fetch snapshot, which excludes live arrivals. (The newest returned message itself is
        // in the page, so it is already skipped above.)
        if (headIntervalItemIdsAtRequest?.has(id)) toRemove.push(id);
        continue;
      }
      // Below the newest returned message: within the page's span (a live arrival can never be here, so
      // absence = a hard delete) → remove; at/below the page's oldest → a below-window leftover the page
      // cannot decide, returned for the reached-start probe.
      if (ts > windowLowTs) toRemove.push(id);
      else belowWindow.push(id);
    }

    this.removeReconciledItems(toRemove);
    return belowWindow;
  }

  /**
   * Remove a set of reconciled (hard-deleted) ids from this paginator's loaded state in one coalesced
   * batch. Each id goes through {@link removeItem}, which drops it from THREE places — not a single
   * interval:
   *
   * 1. the item index — unlinks this paginator's membership from the shared entity store (GC'ing the
   *    content if this was the last holder);
   * 2. the interval that holds it — located by id, so it is NOT head-specific in general; in practice
   *    it is always the head interval, because the sole caller ({@link reconcileHeadAgainstPage})
   *    sources these ids from `headInterval.itemIds` and an item has single-interval membership;
   * 3. the active window (`state.items`) if visible — blanking to `[]` when the window empties, per
   *    {@link flushWindowPublish}.
   *
   * The coalesced batch collapses all of that into a single `state.items` publish. Then mirror the
   * removal into the offline DB (see {@link purgeReconciledFromOfflineDb}) so a cold start does not
   * re-seed the ghosts from SQLite. No-op for an empty set, so an unaffected merge does not touch
   * state a second time.
   */
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
   * Mirror a destructive reconciliation into the offline DB. A hard delete performed while the client
   * was offline reaches it via no event, so the offline store never ran its own hard-delete for these
   * ids; the reconnect query re-hydrates the DB by UPSERT (which never removes what is absent from the
   * page), so without this the ghosts survive in SQLite and a cold start would re-seed them after the
   * in-memory list already dropped them.
   *
   * Owned by the state layer, NOT the SDK: the SDK only supplies the platform `offlineDb`
   * implementation and never orchestrates DB writes for reconciliation. Fire-and-forget and
   * best-effort — the in-memory removal is the source of truth for the live list, so a failed/absent
   * DB write is no worse than before (the ghost merely re-appears on a cold start until the next
   * reconcile). No-op when offline support is off (`client.offlineDb` undefined). The ids are already
   * server-confirmed (the reconcile excludes pending/failed/optimistic), so a plain hard delete —
   * without the pending-task teardown of a local failed message — is correct.
   */
  private purgeReconciledFromOfflineDb(ids: string[]) {
    const offlineDb = this.channel.getClient?.()?.offlineDb;
    if (!offlineDb) return;
    // The offline DB owns the batching (single transaction); we just hand it the reconciled ids.
    offlineDb.hardDeleteMessages({ ids }).catch(() => {
      // best-effort persistence cleanup — see doc comment; the live list is already correct.
    });
  }

  protected resolveUnreadBoundaryIdsByTimestamp = ({
    lastReadAt,
    messages,
  }: {
    lastReadAt: TimestampNS;
    messages: LocalMessage[];
  }): { firstUnreadMessageId: string | null; lastReadMessageId: string | null } => {
    // Messages are expected in chronological order. We find:
    // - lastReadMessageId: newest message with created_at <= lastReadAt
    // - firstUnreadMessageId: first message with created_at > lastReadAt
    //
    // If the page starts after lastReadAt, the entire page is unread and the first message is
    // used as unread anchor (legacy "whole channel is unread" behavior for this queried window).
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

    // NOTE: the auto-dismissal countdown is intentionally NOT started here. A focused message may
    // be emitted while its message list is not yet visible (e.g. the channel is covered by a thread
    // panel when a "view in channel" jump resolves), so measuring the highlight lifetime from the
    // moment the jump resolved would burn it while the message is still off-screen. The consumer
    // starts the countdown via `scheduleMessageFocusSignalClear` once the message is actually
    // viewed.
    return signal;
  };

  /**
   * Starts the auto-dismissal countdown for the currently active focus signal. Call this once the
   * focused message has been viewed (rendered and visible), so the highlight's lifetime is measured
   * from when the user could actually see it rather than from when the jump resolved. No-op if the
   * signal has already been cleared or superseded (guarded by `token`).
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
   * Partial truncation for `channel.truncated` carrying a `truncated_at`: drop every loaded
   * message strictly older than the cutoff (keeping newer ones) across all loaded windows,
   * mirroring the legacy per-message-set pruning. For a full truncation (no `truncated_at`) use
   * {@link MessageIntervalPaginator.clearStateAndCache} instead.
   *
   * Batched and edge-classified: because messages are chronological, each interval is classified by
   * its `tail` (oldest) and `head` (newest) edges, so only the single interval that *straddles* the
   * cutoff is scanned member-by-member — the rest are kept or dropped wholesale. The straddling
   * interval becomes the new global tail (nothing older than the cutoff exists anymore), so its
   * `isTail`/`hasMoreTail` are set; intervals entirely newer keep their flags (unloaded older
   * messages may still sit between them and the cutoff). The active window is re-emitted once.
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
        // determines the cutoff. Items are chronological, so the old ones are at the beginning of the array,
        // binary-search rather than scanning every member.
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

    // No re-sort needed: `survivingIntervals` preserves the order of the already-sorted
    // `itemIntervals` (we only keep/prune/drop, never reorder), and truncation removes only
    // tailward items — an interval's head edge (the intervalComparator sort key) never changes.
    this.setIntervals(survivingIntervals);

    // Single re-emit of the active window (setIntervals does not emit).
    const active = this._activeIntervalId
      ? this._itemIntervals.get(this._activeIntervalId)
      : undefined;
    if (active && !isLogicalInterval(active)) {
      this.setActiveInterval(active);
      return;
    }

    // The active window was truncated away entirely. It sat below the cutoff, so it was older
    // than every survivor — activate the nearest surviving window (the tail-most, i.e. oldest,
    // anchored interval) rather than emitting an empty page, which would blank the message list.
    const anchoredSurvivors = this.itemIntervals.filter(
      (itv): itv is Interval => !isLogicalInterval(itv),
    );

    // If the active interval was truncated, we move to the neareast interval - which is the tail now
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
    const loadedMessages = this.items ?? [];

    // One logical operation touching many messages so we `coalesce` so this paginator's own window
    // emits once at the end rather than per message, and the shared-store fan-out folds into a
    // single flush so sibling holders are notified once too.
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

  /**
   * Ensures quoted-message snapshots across loaded paginator cache are in sync
   * with the provided message.
   *
   * Scans cached messages and updates any item where `quoted_message_id`
   * matches `message.id`.
   */
  reflectQuotedMessageUpdate = (message: LocalMessage) => {
    const cachedMessages = this._itemIndex.values();

    // Batch: several cached messages may quote the updated one; coalesce the shared-store fan-out
    // to a single flush instead of one per re-ingested quoting message.
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
   * Reflect an updated `user` object onto every cached message authored by that user, mirroring
   * the legacy `ChannelState.updateUserMessages` for the main message list (does not touch
   * `quoted_message.user` — that is not part of the legacy behavior).
   *
   * Batched: a user rename can affect many messages, so this patches the shared item index and
   * re-emits the active window a single time (if it held an affected message) rather than one
   * `ingestItem` re-emit per message.
   */
  reflectUserUpdate(user: UserResponse) {
    const activeIds = new Set((this.items ?? []).map((m) => this.getItemId(m)));
    let activeAffected = false;
    // Batch: a user rename can touch many messages; coalesce the shared-store fan-out to sibling
    // holders into a single flush. This paginator's own active window is re-emitted once below.
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
   * Map a timestamp to a loaded message — the last loaded message created at or before `timestamp`.
   * Used by the receipts tracker to resolve read/delivered cursors. Searches the loaded windows from
   * the head down; the first one holding a message at or before `timestamp` holds the answer, since
   * every newer window starts after it. Each window is already sorted, so this is O(log n) per window
   * with no re-sort.
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
    // Resolve the last message created AT OR BEFORE `timestamp` (floor). The sole caller is
    // read/delivered cursor resolution (MessageReceiptsTracker): the cursor carries the timestamp of
    // the last message a participant reached, so a message created strictly after the cursor has NOT
    // been reached. A ceil match (first message >= target) would over-count it — e.g. a participant
    // whose read cursor predates every loaded message would be reported as having read the oldest one.
    // `lowerBound` returns the first index whose created_at is strictly greater than the target, so
    // the floor is the item immediately before it.
    const firstAfter = lowerBound(items.length, (i) => {
      const t = getMessageCreatedAtTimestamp(items[i]);
      return t === null || t > timestamp;
    });
    if (firstAfter === 0) return undefined; // target precedes every message in this window
    const found = items[firstAfter - 1];
    const foundTimestamp = getMessageCreatedAtTimestamp(found);
    // A message without a resolvable created_at (e.g. an optimistic message still missing its
    // server timestamp) cannot be located by timestamp.
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
    // Not included in the interval (filtered out by MessageIntervalPaginator.filterQueryResults).
    //
    // IMPORTANT: We must keep cursor derivation consistent with the ingested interval.
    // The interval is built from the filtered page, but ctx.page contains the raw response.
    // The derivators compare the page's length with the requested size, and the linear one its
    // edges with the interval's server-known edges. A page that includes locally filtered
    // messages (e.g. shadowed) would make them conclude the page is not at the dataset bounds.
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
