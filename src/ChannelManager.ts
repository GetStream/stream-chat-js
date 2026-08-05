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
  if (!event.cid) return;
  const channel = channelManager.client.activeChannels[event.cid];
  channelManager.paginators.forEach((paginator) => {
    paginator.removeItem({ id: event.cid, item: channel });
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
  /** Track paginators already wrapped with ownership-aware filtering */
  protected ownershipFilterAppliedPaginators = new WeakSet<ChannelPaginator>();

  protected static readonly defaultEventHandlers: ChannelManagerEventHandlers = {
    'channel.deleted': [channelDeletedHandler],
    'channel.updated': [channelUpdatedHandler],
    'channel.truncated': [channelTruncatedHandler],
    'channel.hidden': [channelHiddenHandler],
    'channel.visible': [channelVisibleHandler],
    'member.updated': [memberUpdatedHandler],
    'message.new': [messageNewHandler],
    'notification.added_to_channel': [notificationAddedToChannelHandler],
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
    if (ownershipResolver) {
      this.ownershipResolver = Array.isArray(ownershipResolver)
        ? createPriorityOwnershipResolver(ownershipResolver)
        : ownershipResolver;
    }

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
   * Wrap paginator.filterQueryResults so that ownership rules are applied whenever
   * the paginator ingests results from a server query (first page and subsequent pages).
   */
  protected wrapPaginatorFiltering(paginator: ChannelPaginator) {
    if (this.ownershipFilterAppliedPaginators.has(paginator)) return;
    const original = paginator.filterQueryResults.bind(paginator);
    paginator.filterQueryResults = (items: Channel[]) => {
      const filtered = original(items) as Channel[];
      return this.filterItemsByOwnership({ paginator, items: filtered });
    };
    this.ownershipFilterAppliedPaginators.add(paginator);
  }

  getPaginatorById(id: string) {
    return this.paginators.find((p) => p.id === id);
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
    this.state.partialNext({ paginators });
    // Wrap newly inserted paginator to enforce ownership on query results
    this.wrapPaginatorFiltering(paginator);
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
