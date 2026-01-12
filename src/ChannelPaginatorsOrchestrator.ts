import { EventHandlerPipeline } from './EventHandlerPipeline';
import { WithSubscriptions } from './utils/WithSubscriptions';
import type { Event, EventTypes } from './types';
import type { ChannelPaginator } from './pagination';
import type { StreamChat } from './client';
import type { Unsubscribe } from './store';
import { StateStore } from './store';
import type {
  EventHandlerPipelineHandler,
  FindEventHandlerParams,
  InsertEventHandlerPayload,
  LabeledEventHandler,
} from './EventHandlerPipeline';
import { getChannel } from './pagination/utility.queryChannel';
import type { Channel } from './channel';

export type ChannelPaginatorsOrchestratorEventHandlerContext = {
  orchestrator: ChannelPaginatorsOrchestrator;
};

type EventHandlerContext = ChannelPaginatorsOrchestratorEventHandlerContext;

type SupportedEventType = EventTypes | (string & {});

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

const getCachedChannelFromEvent = (
  event: Event,
  cache: Record<string, Channel>,
): Channel | undefined => {
  let channel: Channel | undefined = undefined;
  if (event.cid) {
    channel = cache[event.cid];
  } else if (event.channel_id && event.channel_type) {
    // todo: is there a central method to construct the cid from type and channel id?
    channel = cache[`${event.channel_type}:${event.channel_id}`];
  } else if (event.channel) {
    channel = cache[event.channel.cid];
  } else {
    return;
  }
  return channel;
};

const reEmit: EventHandlerPipelineHandler<EventHandlerContext> = ({
  event,
  ctx: { orchestrator },
}) => {
  if (!event.cid) return;
  const channel = orchestrator.client.activeChannels[event.cid];
  if (!channel) return;
  orchestrator.paginators.forEach((paginator) => {
    const items = paginator.items;
    const { state } = paginator.locateByItem(channel);
    if ((state?.currentIndex ?? -1) > -1 && items) {
      paginator.state.partialNext({ items: [...items] });
    }
  });
};

const removeItem: EventHandlerPipelineHandler<EventHandlerContext> = ({
  event,
  ctx: { orchestrator },
}) => {
  if (!event.cid) return;
  const channel = orchestrator.client.activeChannels[event.cid];
  orchestrator.paginators.forEach((paginator) => {
    paginator.removeItem({ id: event.cid, item: channel });
  });
};

// todo: documentation: show how to implement allowNewMessagesFromUnfilteredChannels just by inserting event handler
//  at the start of the handler pipeline and filter out events for unknown channels
export const ignoreEventsForUnknownChannels: EventHandlerPipelineHandler<
  EventHandlerContext
> = ({ event, ctx: { orchestrator } }) => {
  const channel: Channel | undefined = getCachedChannelFromEvent(
    event,
    orchestrator.client.activeChannels,
  );
  if (!channel) return { action: 'stop' };
};

const updateLists: EventHandlerPipelineHandler<EventHandlerContext> = async ({
  event,
  ctx: { orchestrator },
}) => {
  let channel: Channel | undefined = getCachedChannelFromEvent(
    event,
    orchestrator.client.activeChannels,
  );

  if (!channel) {
    const [type, id] = event.cid
      ? event.cid.split(':')
      : [event.channel_type, event.channel_id];

    channel = await getChannel({
      client: orchestrator.client,
      id,
      type,
    });
  }

  if (!channel) return;

  const matchingPaginators = orchestrator.paginators.filter((p) =>
    p.matchesFilter(channel),
  );
  const matchingIds = new Set(matchingPaginators.map((p) => p.id));

  const ownerIds = orchestrator.resolveOwnership(channel, matchingPaginators);

  orchestrator.paginators.forEach((paginator) => {
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
  id: 'ChannelPaginatorsOrchestrator:default-handler:channel.deleted',
};

// fixme: this handler should not be handled by the orchestrator but as Channel does not have reactive state,
// we need to re-emit the whole list to reflect the changes
const channelUpdatedHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: reEmit,
  id: 'ChannelPaginatorsOrchestrator:default-handler:channel.updated',
};

// fixme: this handler should not be handled by the orchestrator but as Channel does not have reactive state,
// we need to re-emit the whole list to reflect the changes
const channelTruncatedHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: reEmit,
  id: 'ChannelPaginatorsOrchestrator:default-handler:channel.truncated',
};

const channelVisibleHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: updateLists,
  id: 'ChannelPaginatorsOrchestrator:default-handler:channel.visible',
};

// members filter - should not be impacted as id is stable - cannot be updated
// member.user.name - can be impacted
const memberUpdatedHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: updateLists,
  id: 'ChannelPaginatorsOrchestrator:default-handler:member.updated',
};

const messageNewHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: updateLists,
  id: 'ChannelPaginatorsOrchestrator:default-handler:message.new',
};

const notificationAddedToChannelHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: updateLists,
  id: 'ChannelPaginatorsOrchestrator:default-handler:notification.added_to_channel',
};

const notificationMessageNewHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: updateLists,
  id: 'ChannelPaginatorsOrchestrator:default-handler:notification.message_new',
};

const notificationRemovedFromChannelHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: removeItem,
  id: 'ChannelPaginatorsOrchestrator:default-handler:notification.removed_from_channel',
};

// fixme: updates users for member object in all the channels which are loaded with that member - normalization would be beneficial
const userPresenceChangedHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: ({ event, ctx: { orchestrator } }) => {
    const eventUser = event.user;
    if (!eventUser?.id) return;
    orchestrator.paginators.forEach((paginator) => {
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
  id: 'ChannelPaginatorsOrchestrator:default-handler:user.presence.changed',
};

export type ChannelPaginatorsOrchestratorState = {
  paginators: ChannelPaginator[];
};

export type ChannelPaginatorsOrchestratorEventHandlers = Partial<
  Record<SupportedEventType, LabeledEventHandler<EventHandlerContext>[]>
>;

export type ChannelPaginatorsOrchestratorOptions = {
  client: StreamChat;
  paginators?: ChannelPaginator[];
  eventHandlers?: ChannelPaginatorsOrchestratorEventHandlers;
  /**
   * Decide which paginator(s) should own a channel when multiple match.
   * Defaults to keeping the channel in all matching paginators.
   * Channels are kept only in the paginators that are listed in the ownershipResolver array.
   * Empty ownershipResolver array means that the channel is kept in all matching paginators.
   */
  ownershipResolver?: PaginatorOwnershipResolver | string[];
};

export class ChannelPaginatorsOrchestrator extends WithSubscriptions {
  client: StreamChat;
  state: StateStore<ChannelPaginatorsOrchestratorState>;
  protected _pipelines = new Map<
    SupportedEventType,
    EventHandlerPipeline<EventHandlerContext>
  >();
  protected ownershipResolver?: PaginatorOwnershipResolver;
  /** Track paginators already wrapped with ownership-aware filtering */
  protected ownershipFilterAppliedPaginators = new WeakSet<ChannelPaginator>();

  protected static readonly defaultEventHandlers: ChannelPaginatorsOrchestratorEventHandlers =
    {
      'channel.deleted': [channelDeletedHandler],
      'channel.updated': [channelUpdatedHandler],
      'channel.truncated': [channelTruncatedHandler],
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
  }: ChannelPaginatorsOrchestratorOptions) {
    super();
    this.client = client;
    this.state = new StateStore({ paginators: paginators ?? [] });
    if (ownershipResolver) {
      this.ownershipResolver = Array.isArray(ownershipResolver)
        ? createPriorityOwnershipResolver(ownershipResolver)
        : ownershipResolver;
    }

    const finalEventHandlers =
      eventHandlers ?? ChannelPaginatorsOrchestrator.getDefaultHandlers();
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
    return { orchestrator: this };
  }

  /**
   * Returns deep copy of default handlers mapping.
   * The defaults can be enriched with custom handlers or the custom handlers can be replaced.
   */
  static getDefaultHandlers(): ChannelPaginatorsOrchestratorEventHandlers {
    const src = ChannelPaginatorsOrchestrator.defaultEventHandlers;
    const out: ChannelPaginatorsOrchestratorEventHandlers = {};
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
   * @param paginator
   * @param index
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
        this.client.on((event: Event) => {
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
        id: `ChannelPaginatorsOrchestrator:${eventType}`,
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
