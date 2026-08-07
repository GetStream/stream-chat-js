import { EventHandlerPipeline } from './EventHandlerPipeline';
import { WithSubscriptions } from './utils/WithSubscriptions';
import type { EventType } from './types';
import type { ChannelPaginator } from './pagination';
import type { StreamChat } from './client';
import type { Unsubscribe } from './store';
import { StateStore } from './store';
import type {
  EventHandlerPipelineHandler,
  FindEventHandlerParams,
  InsertEventHandlerPayload,
  LabeledEventHandler,
  PipelineEvent,
} from './EventHandlerPipeline';
import { getChannel } from './pagination/utility.queryChannel';
import type { Channel } from './channel';

export type ChannelManagerEventHandlerContext = {
  channelManager: ChannelManager;
};

type EventHandlerContext = ChannelManagerEventHandlerContext;

type SupportedEventType = EventType | (string & {});

/**
 * Resolves which paginators should be the "owners" of a channel
 * when the channel matches multiple paginator filters.
 *
 * Return a set of paginator ids that should keep/own the item.
 * Returning an empty set means the channel will be removed everywhere.
 */
export type PaginatorOwnershipResolver = (args: {
  channel: Channel;
  matchingPaginators: ChannelPaginator[];
}) => string[];

/**
 * Convenience factory for a priority-based ownership resolver.
 * - Provide an ordered list of paginator ids from highest to lowest priority.
 * - If two or more paginators match a channel, the one with the highest priority wins.
 * - If none of the matching paginator ids are in the priority list, all matches are kept (back-compat).
 */
export const createPriorityOwnershipResolver = (
  priority?: string[],
): PaginatorOwnershipResolver => {
  if (!priority) {
    return ({ matchingPaginators }) => matchingPaginators.map((p) => p.id);
  }
  const rank = new Map<string, number>(priority.map((id, index) => [id, index]));
  return ({ matchingPaginators }) => {
    if (matchingPaginators.length <= 1) {
      return matchingPaginators.map((p) => p.id);
    }
    // The winner is the first item in the sorted array of matching paginators
    const winner = [...matchingPaginators].sort((a, b) => {
      const rankA = rank.get(a.id);
      const rankB = rank.get(b.id);
      const valueA = rankA === undefined ? Number.POSITIVE_INFINITY : rankA;
      const valueB = rankB === undefined ? Number.POSITIVE_INFINITY : rankB;
      return valueA - valueB;
    })[0];
    const winnerValue = rank.get(winner.id);
    // If no explicit priority is set for any, keep all (preserve current behavior)
    if (winnerValue === undefined) {
      return matchingPaginators.map((p) => p.id);
    }
    return [winner.id];
  };
};

/**
 * The cid the event refers to. Events are inconsistent about how they identify their channel: some carry
 * a top-level `cid`, some only `channel_type` + `channel_id`, and some (e.g.
 * `notification.added_to_channel`) have all three optional and identify the channel solely through the
 * required `event.channel`.
 */
const getCidFromEvent = (event: PipelineEvent): string | undefined => {
  if (event.cid) return event.cid;
  // todo: is there a central method to construct the cid from type and channel id?
  if (event.channel_id && event.channel_type) {
    return `${event.channel_type}:${event.channel_id}`;
  }
  return event.channel?.cid;
};

const getCachedChannelFromEvent = (
  event: PipelineEvent,
  cache: Record<string, Channel>,
): Channel | undefined => {
  const cid = getCidFromEvent(event);
  return cid ? cache[cid] : undefined;
};

const reEmit: EventHandlerPipelineHandler<EventHandlerContext> = ({
  event,
  ctx: { channelManager },
}) => {
  if (!event.cid) return;
  const channel = channelManager.client.activeChannels[event.cid];
  if (!channel) return;
  channelManager.paginators.forEach((paginator) => {
    const items = paginator.items;
    const { state } = paginator.locateByItem(channel);
    if ((state?.currentIndex ?? -1) > -1 && items) {
      paginator.state.partialNext({ items: [...items] });
    }
  });
};

const removeItem: EventHandlerPipelineHandler<EventHandlerContext> = ({
  event,
  ctx: { channelManager },
}) => {
  // `getCidFromEvent`, not `event.cid`: on `channel.deleted` the cid can arrive nested in
  // `event.channel` only, and the legacy ChannelManager removed by `event.cid || event.channel?.cid`
  const cid = getCidFromEvent(event);
  if (!cid) return;
  const channel = channelManager.client.activeChannels[cid];
  channelManager.paginators.forEach((paginator) => {
    paginator.removeItem({ id: cid, item: channel });
  });
};

// todo: documentation: show how to implement allowNewMessagesFromUnfilteredChannels just by inserting event handler
//  at the start of the handler pipeline and filter out events for unknown channels
export const ignoreEventsForUnknownChannels: EventHandlerPipelineHandler<
  EventHandlerContext
> = ({ event, ctx: { channelManager } }) => {
  const channel: Channel | undefined = getCachedChannelFromEvent(
    event,
    channelManager.client.activeChannels,
  );
  if (!channel) return { action: 'stop' };
};

const updateLists: EventHandlerPipelineHandler<EventHandlerContext> = async ({
  event,
  ctx: { channelManager },
}) => {
  let channel: Channel | undefined = getCachedChannelFromEvent(
    event,
    channelManager.client.activeChannels,
  );

  if (!channel) {
    const [type, id] = getCidFromEvent(event)?.split(':') ?? [];
    if (!type) return;

    channel = await getChannel({
      client: channelManager.client,
      id,
      type,
    });
  }

  if (!channel) return;

  const matchingPaginators = channelManager.paginators.filter((p) =>
    p.matchesFilter(channel),
  );
  const matchingIds = new Set(matchingPaginators.map((p) => p.id));

  const ownerIds = channelManager.resolveOwnership(channel, matchingPaginators);

  channelManager.paginators.forEach((paginator) => {
    if (!matchingIds.has(paginator.id)) {
      // remove if it does not match the filter anymore
      paginator.removeItem({ item: channel });
      return;
    }

    // Only if owners are specified, the items is removed from the non-owner matching paginators
    if (ownerIds.size > 0 && !ownerIds.has(paginator.id)) {
      // matched, but not selected to own - remove to enforce exclusivity
      paginator.removeItem({ item: channel });
      return;
    }

    // Selected owner: optionally boost then ingest
    const channelBoost = paginator.getBoost(channel.cid);
    if (
      [
        'message.new',
        'notification.message_new',
        'notification.added_to_channel',
        'channel.visible',
      ].includes(event.type) &&
      (!channelBoost || channelBoost.seq < paginator.maxBoostSeq)
    ) {
      paginator.boost(channel.cid, { seq: paginator.maxBoostSeq + 1 });
    }
    paginator.ingestItem(channel);
  });
};

// we have to make sure that client.activeChannels is always up-to-date
const channelDeletedHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: removeItem,
  id: 'ChannelManager:default-handler:channel.deleted',
};

// fixme: this handler should not be handled by the channel manager but as Channel does not have reactive state,
// we need to re-emit the whole list to reflect the changes
const channelUpdatedHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: reEmit,
  id: 'ChannelManager:default-handler:channel.updated',
};

// fixme: this handler should not be handled by the channel manager but as Channel does not have reactive state,
// we need to re-emit the whole list to reflect the changes
const channelTruncatedHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: reEmit,
  id: 'ChannelManager:default-handler:channel.truncated',
};

const channelVisibleHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: updateLists,
  id: 'ChannelManager:default-handler:channel.visible',
};

const channelHiddenHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: updateLists,
  id: 'ChannelManager:default-handler:channel.hidden',
};

// members filter - should not be impacted as id is stable - cannot be updated
// member.user.name - can be impacted
const memberUpdatedHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: updateLists,
  id: 'ChannelManager:default-handler:member.updated',
};

const messageNewHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: updateLists,
  id: 'ChannelManager:default-handler:message.new',
};

const notificationAddedToChannelHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: updateLists,
  id: 'ChannelManager:default-handler:notification.added_to_channel',
};

const notificationMessageNewHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: updateLists,
  id: 'ChannelManager:default-handler:notification.message_new',
};

const notificationRemovedFromChannelHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: removeItem,
  id: 'ChannelManager:default-handler:notification.removed_from_channel',
};

/**
 * `muted` is filterable (resolved from `client.mutedChannels`), but a mute change emits only this
 * user-level event — nothing about the channel — so without re-routing here a channel would keep its
 * old list until some unrelated event touched it. The client applies `event.me.channel_mutes` before
 * its listeners run, so the filters already see the new state.
 */
const notificationChannelMutesUpdatedHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: ({ ctx: { channelManager } }) => {
    const seen = new Set<string>();
    channelManager.paginators.forEach((paginator) => {
      (paginator.items ?? []).forEach((channel) => {
        if (seen.has(channel.cid)) return; // prevent ingestig -> emitting more than once
        seen.add(channel.cid);
        channelManager.ingestChannel(channel);
      });
    });
  },
  id: 'ChannelManager:default-handler:notification.channel_mutes_updated',
};

// fixme: updates users for member object in all the channels which are loaded with that member - normalization would be beneficial
const userPresenceChangedHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: ({ event, ctx: { channelManager } }) => {
    const eventUser = event.user;
    if (!eventUser?.id) return;
    channelManager.paginators.forEach((paginator) => {
      const paginatorItems = paginator.items;
      if (!paginatorItems) return;
      let updated = false;
      paginatorItems.forEach((channel) => {
        if (channel.state.members[eventUser.id]) {
          channel.state.members[eventUser.id].user = event.user;
          updated = true;
        }
        if (channel.state.membership.user?.id === eventUser.id) {
          channel.state.membership.user = eventUser;
          updated = true;
        }
      });
      if (updated) {
        // fixme: user is not reactive and so the whole list has to be re-rendered
        paginator.state.partialNext({ items: [...paginatorItems] });
      }
    });
  },
  id: 'ChannelManager:default-handler:user.presence.changed',
};

export type ChannelManagerState = {
  paginators: ChannelPaginator[];
};

export type ChannelManagerEventHandlers = Partial<
  Record<SupportedEventType, LabeledEventHandler<EventHandlerContext>[]>
>;

export type ChannelManagerOptions = {
  client: StreamChat;
  paginators?: ChannelPaginator[];
  /**
   * The complete set of event handlers to run, replacing the defaults rather than extending them.
   * Start from `ChannelManager.getDefaultHandlers()` (a fresh copy) and enrich it, unless the
   * intention really is to route events differently from scratch. Note that the manager the client
   * instantiates (`client.channelManager`) is constructed without this option — customize that one
   * through `addEventHandler` / `setEventHandlers` / `removeEventHandlers`.
   */
  eventHandlers?: ChannelManagerEventHandlers;
  /**
   * Decide which paginator(s) should own a channel when multiple match.
   * Defaults to keeping the channel in all matching paginators.
   * Channels are kept only in the paginators that are listed in the ownershipResolver array.
   * Empty ownershipResolver array means that the channel is kept in all matching paginators.
   */
  ownershipResolver?: PaginatorOwnershipResolver | string[];
};

export class ChannelManager extends WithSubscriptions {
  client: StreamChat;
  state: StateStore<ChannelManagerState>;
  protected _pipelines = new Map<
    SupportedEventType,
    EventHandlerPipeline<EventHandlerContext>
  >();
  protected ownershipResolver?: PaginatorOwnershipResolver;
  /**
   * The `filterQueryResults` each registered paginator had before this manager wrapped it.
   *
   * A server query bypasses the manager — the paginator fetches and ingests a page on its own, and
   * the backend knows nothing about client-side ownership — so a "Work" (`{ team: 'work' }`) channel
   * comes back in a catch-all list's page too and would render in both. `wrapPaginatorFiltering`
   * therefore composes the ownership check onto that hook, which every page passes through.
   *
   * Keys = already wrapped (so re-inserting does not wrap twice); values = what to restore on
   * removal, since a detached paginator must stop applying rules resolved against lists it left.
   * Weakly keyed so a dropped paginator is not kept alive by this manager.
   */
  protected filterQueryResultsBeforeWrapping = new WeakMap<
    ChannelPaginator,
    ChannelPaginator['filterQueryResults']
  >();

  protected static readonly defaultEventHandlers: ChannelManagerEventHandlers = {
    'channel.deleted': [channelDeletedHandler],
    'channel.updated': [channelUpdatedHandler],
    'channel.truncated': [channelTruncatedHandler],
    'channel.hidden': [channelHiddenHandler],
    'channel.visible': [channelVisibleHandler],
    'member.updated': [memberUpdatedHandler],
    'message.new': [messageNewHandler],
    'notification.added_to_channel': [notificationAddedToChannelHandler],
    'notification.channel_mutes_updated': [notificationChannelMutesUpdatedHandler],
    'notification.message_new': [notificationMessageNewHandler],
    'notification.removed_from_channel': [notificationRemovedFromChannelHandler],
    'user.presence.changed': [userPresenceChangedHandler],
  };

  constructor({
    client,
    eventHandlers,
    paginators,
    ownershipResolver,
  }: ChannelManagerOptions) {
    super();
    this.client = client;
    this.state = new StateStore({ paginators: paginators ?? [] });
    this.setOwnershipResolver(ownershipResolver);

    // A supplied map replaces the defaults wholesale — an event type missing from it is simply not
    // handled. `getDefaultHandlers()` returns a copy to enrich when that is what you want.
    const finalEventHandlers = eventHandlers ?? ChannelManager.getDefaultHandlers();
    for (const [type, handlers] of Object.entries(finalEventHandlers)) {
      if (handlers) this.ensurePipeline(type).replaceAll(handlers);
    }
    // Ensure ownership rules are applied to initial paginators' query results
    this.paginators.forEach((p) => this.wrapPaginatorFiltering(p));
  }

  get paginators(): ChannelPaginator[] {
    return this.state.getLatestValue().paginators;
  }

  get pipelines(): Map<SupportedEventType, EventHandlerPipeline<EventHandlerContext>> {
    return this._pipelines;
  }

  private get ctx(): EventHandlerContext {
    return { channelManager: this };
  }

  /**
   * Returns deep copy of default handlers mapping.
   * The defaults can be enriched with custom handlers or the custom handlers can be replaced.
   */
  static getDefaultHandlers(): ChannelManagerEventHandlers {
    const src = ChannelManager.defaultEventHandlers;
    const out: ChannelManagerEventHandlers = {};
    for (const [type, handlers] of Object.entries(src)) {
      if (!handlers) continue;
      out[type as SupportedEventType] = [...handlers];
    }
    return out;
  }

  /**
   * Replace the rule deciding which paginator(s) own a channel matched by several of them. Pass an
   * ordered array of paginator ids (highest priority first) for the built-in priority resolver, a
   * custom resolver function, or `undefined` to go back to the default (a channel is kept in every
   * paginator whose filter it matches).
   *
   * Available as a setter because the manager is constructed by the client, before the app has had
   * a chance to create its paginators — their ids are therefore only known later.
   */
  setOwnershipResolver(ownershipResolver?: PaginatorOwnershipResolver | string[]) {
    if (!ownershipResolver) {
      this.ownershipResolver = undefined;
      return;
    }
    this.ownershipResolver = Array.isArray(ownershipResolver)
      ? createPriorityOwnershipResolver(ownershipResolver)
      : ownershipResolver;
  }

  /**
   * Which paginators should own the channel among the ones that matched.
   * Default behavior keeps the channel in all matching paginators.
   */
  resolveOwnership(
    channel: Channel,
    matchingPaginators: ChannelPaginator[],
  ): Set<string> {
    return new Set(this.ownershipResolver?.({ channel, matchingPaginators }) ?? []);
  }

  /**
   * Route a channel into the paginator(s) that should own it, and remove it from any list it
   * no longer belongs to. Ownership is resolved exactly as for live WS updates — the channel is
   * ingested into every paginator whose filter it matches (or, when an ownership resolver picks
   * winners among several matches, only into the owner(s)).
   *
   * Use this to surface a channel the app just opened — a search result, a freshly created DM —
   * in the list(s) without a full re-query. `ingestItem` dedupes by cid and inserts in sort
   * order, so calling this repeatedly is safe.
   *
   * A channel that matches no paginator is not added anywhere. To have such channels still
   * appear, register a catch-all paginator (empty filter) with the lowest ownership priority as
   * a local fallback list.
   */
  ingestChannel(channel: Channel) {
    const matchingPaginators = this.paginators.filter((p) => p.matchesFilter(channel));
    const matchingIds = new Set(matchingPaginators.map((p) => p.id));
    const ownerIds = this.resolveOwnership(channel, matchingPaginators);

    this.paginators.forEach((paginator) => {
      const isMatch = matchingIds.has(paginator.id);
      const isOwner = ownerIds.size === 0 || ownerIds.has(paginator.id);
      if (isMatch && isOwner) {
        paginator.ingestItem(channel);
      } else {
        // Not a match, or matched but not the selected owner — enforce exclusivity.
        paginator.removeItem({ item: channel });
      }
    });
  }

  /**
   * Filter a page of query results for a specific paginator according to ownership rules.
   * If no owners are specified by the resolver, all matching paginators keep the item.
   */
  protected filterItemsByOwnership({
    paginator,
    items,
  }: {
    paginator: ChannelPaginator;
    items: Channel[];
  }): Channel[] {
    if (!items.length) return items;
    const result: Channel[] = [];
    for (const ch of items) {
      const matchingPaginators = this.paginators.filter((p) => p.matchesFilter(ch));
      const ownerIds = this.resolveOwnership(ch, matchingPaginators);
      const noOwnersOrPaginatorIsOwner =
        ownerIds.size === 0 || ownerIds.has(paginator.id);

      if (noOwnersOrPaginatorIsOwner) {
        result.push(ch);
      }
    }
    return result;
  }

  /**
   * Makes a registered paginator apply this manager's ownership rules to the pages it fetches
   * itself, by composing `filterItemsByOwnership` onto its `filterQueryResults`.
   *
   * A channel can enter a list through two doors, and only one of them goes through the manager:
   * - **WS events / `ingestChannel`** — the manager routes the channel and consults
   *   `resolveOwnership` before ingesting, so exclusivity holds by construction.
   * - **A server query** — `paginator.next()` (a `ChannelList` scrolling, `reload()`) queries and
   *   ingests on its own; the manager is not involved. Without this wrapper a page would land in
   *   every list whose *server-side* filter matched it, so a channel matching both
   *   `channels:archived` and `channels:default` would show up in both lists until some later event
   *   re-routed it — the exact duplication the resolver exists to prevent.
   *
   * Wrapping (rather than subclassing or a constructor hook) is what lets the manager inject this
   * into paginators it does not construct: `filterQueryResults` is an instance property, so the
   * original is captured here and handed back by `unwrapPaginatorFiltering` when the paginator is
   * detached. The paginator's own filtering runs first and stays authoritative — ownership only ever
   * removes further items, never adds any back.
   *
   * Idempotent: the `WeakMap` guard keeps a re-inserted paginator from being wrapped twice, which
   * would filter the same page repeatedly and, worse, lose the reference to the true original.
   */
  protected wrapPaginatorFiltering(paginator: ChannelPaginator) {
    if (this.filterQueryResultsBeforeWrapping.has(paginator)) return;
    const original = paginator.filterQueryResults.bind(paginator);
    paginator.filterQueryResults = (items: Channel[]) => {
      const filtered = original(items) as Channel[];
      return this.filterItemsByOwnership({ paginator, items: filtered });
    };
    this.filterQueryResultsBeforeWrapping.set(paginator, original);
  }

  /**
   * Undo `wrapPaginatorFiltering` — restore the `filterQueryResults` the paginator had before this
   * manager wrapped it. A paginator that has left the manager must not keep applying its ownership
   * rules: those are resolved against the paginators the manager still holds, so a detached
   * paginator would drop channels owned by lists it is no longer part of.
   */
  protected unwrapPaginatorFiltering(paginator: ChannelPaginator) {
    const original = this.filterQueryResultsBeforeWrapping.get(paginator);
    if (!original) return;
    paginator.filterQueryResults = original;
    this.filterQueryResultsBeforeWrapping.delete(paginator);
  }

  getPaginatorById(id: string) {
    return this.paginators.find((p) => p.id === id);
  }

  /**
   * Replace the whole set of lists in a single state update — the primitive `insertPaginator` and
   * `removePaginator` build on, and what to use for a wholesale swap instead of publishing an
   * intermediate state per step. Paginators dropped from the set are detached exactly as
   * `removePaginator` detaches them; a repeated id keeps only its first occurrence.
   *
   * @param paginators - The lists this manager should hold, in render order.
   */
  setPaginators(paginators: ChannelPaginator[]) {
    const nextPaginators: ChannelPaginator[] = [];
    const seenIds = new Set<string>();
    for (const paginator of paginators) {
      if (seenIds.has(paginator.id)) continue;
      seenIds.add(paginator.id);
      nextPaginators.push(paginator);
    }

    const currentPaginators = this.paginators;
    // Publishing an equivalent set would hand subscribers a new array for no reason — a
    // `state.paginators` selector shallow-compares by reference, so every list would re-render.
    const isUnchanged =
      currentPaginators.length === nextPaginators.length &&
      currentPaginators.every((paginator, i) => paginator === nextPaginators[i]);
    if (isUnchanged) return;

    const detached = currentPaginators.filter(
      (paginator) => !nextPaginators.includes(paginator),
    );

    this.state.partialNext({ paginators: nextPaginators });

    detached.forEach((paginator) => {
      this.unwrapPaginatorFiltering(paginator);
      paginator.cancelScheduledQuery();
    });
    // Wrap the current set to enforce ownership on their query results
    nextPaginators.forEach((paginator) => this.wrapPaginatorFiltering(paginator));
  }

  /**
   * Detach every list at once — the teardown counterpart of `setPaginators`. Each paginator is
   * released exactly as `removePaginator` releases it (ownership-filtering wrapper removed,
   * scheduled query canceled, loaded items kept), in a single state update.
   *
   * @returns The paginators the manager held, in the order it held them.
   */
  clearPaginators(): ChannelPaginator[] {
    const cleared = this.paginators;
    this.setPaginators([]);
    return cleared;
  }

  /**
   * If paginator already exists → remove old, reinsert at new index.
   * If index not provided → append at the end.
   * If index provided → insert (or move) at that index.
   *
   * @param params - The insertion parameters.
   * @param params.paginator - The paginator to insert or move.
   * @param params.index - Target index; when omitted the paginator is appended.
   */
  insertPaginator({ paginator, index }: { paginator: ChannelPaginator; index?: number }) {
    const paginators = [...this.paginators];
    const existingIndex = paginators.findIndex((p) => p.id === paginator.id);
    if (existingIndex > -1) {
      paginators.splice(existingIndex, 1);
    }
    const validIndex = Math.max(
      0,
      Math.min(index ?? paginators.length, paginators.length),
    );
    paginators.splice(validIndex, 0, paginator);
    this.setPaginators(paginators);
  }

  /**
   * Remove a paginator from the manager. The paginator stops receiving WS-driven updates and
   * disappears from `state.paginators` (so UIs rendering one list per paginator drop its list), and
   * gets its own `filterQueryResults` back — from here on it is an independent paginator again.
   *
   * Its loaded items are left untouched: the paginator can be re-inserted later, or kept and
   * queried on its own. Any query scheduled through `nextDebounced` is canceled, so a list that was
   * just removed does not fire one more request.
   *
   * @param paginatorOrId - The paginator to remove, or its id.
   * @returns The removed paginator, or `undefined` when this manager did not hold it.
   */
  removePaginator(
    paginatorOrId: ChannelPaginator | string,
  ): ChannelPaginator | undefined {
    const id = typeof paginatorOrId === 'string' ? paginatorOrId : paginatorOrId.id;
    const removed = this.getPaginatorById(id);
    if (!removed) return undefined;

    this.setPaginators(this.paginators.filter((paginator) => paginator !== removed));
    return removed;
  }

  /**
   * Discard the loaded data of every registered list, keeping the registrations themselves: which
   * lists exist is application configuration, while the channels in them belong to the connected
   * user and become invalid on `disconnectUser`. Each paginator returns to "never queried"
   * (`items: undefined`) with its debounced query canceled. Deliberately not named `resetState` —
   * this manager's own `state` *is* the paginator list, which this must not touch.
   */
  resetPaginatorStates() {
    this.paginators.forEach((paginator) => {
      paginator.cancelScheduledQuery();
      paginator.resetState();
    });
  }

  addEventHandler({
    eventType,
    ...payload
  }: {
    eventType: SupportedEventType;
  } & InsertEventHandlerPayload<EventHandlerContext>): Unsubscribe {
    return this.ensurePipeline(eventType).insert(payload);
  }

  setEventHandlers({
    eventType,
    handlers,
  }: {
    eventType: SupportedEventType;
    handlers: LabeledEventHandler<EventHandlerContext>[];
  }) {
    return this.ensurePipeline(eventType).replaceAll(handlers);
  }

  removeEventHandlers({
    eventType,
    handlers,
  }: {
    eventType: SupportedEventType;
    handlers: FindEventHandlerParams<EventHandlerContext>[];
  }) {
    const pipeline = this._pipelines.get(eventType);
    if (!pipeline) return;
    handlers.forEach((params) => pipeline.remove(params));
  }

  /** Subscribe to WS (and more buses via attachBus) */
  registerSubscriptions(): Unsubscribe {
    if (!this.hasSubscriptions) {
      this.addUnsubscribeFunction(
        // todo: maybe we should have a wrapper here to decide, whether the event is a LocalEventBus event or else supported by client
        this.client.on((event) => {
          const pipe = this._pipelines.get(event.type);
          if (pipe) {
            pipe.run(event, this.ctx);
          }
        }).unsubscribe,
      );
    }

    this.incrementRefCount();
    return () => this.unregisterSubscriptions();
  }

  ensurePipeline(
    eventType: SupportedEventType,
  ): EventHandlerPipeline<EventHandlerContext> {
    let pipe = this._pipelines.get(eventType);
    if (!pipe) {
      pipe = new EventHandlerPipeline<EventHandlerContext>({
        id: `ChannelManager:${eventType}`,
      });
      this._pipelines.set(eventType, pipe);
    }
    return pipe;
  }

  reload = async () =>
    await Promise.allSettled(
      this.paginators.map(async (paginator) => {
        await paginator.reload();
      }),
    );
}
