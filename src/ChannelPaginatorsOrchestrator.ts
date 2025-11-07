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
    if (paginator.findItem(channel) && items) {
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

  orchestrator.paginators.forEach((paginator) => {
    if (paginator.matchesFilter(channel)) {
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
    } else {
      // remove if it does not match the filter anymore
      paginator.removeItem({ item: channel });
    }
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
};

export class ChannelPaginatorsOrchestrator extends WithSubscriptions {
  client: StreamChat;
  state: StateStore<ChannelPaginatorsOrchestratorState>;
  protected _pipelines = new Map<
    SupportedEventType,
    EventHandlerPipeline<EventHandlerContext>
  >();

  protected static readonly defaultEventHandlers: ChannelPaginatorsOrchestratorEventHandlers =
    {
      'channel.deleted': [channelDeletedHandler],
      'channel.hidden': [channelDeletedHandler],
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
  }: ChannelPaginatorsOrchestratorOptions) {
    super();
    this.client = client;
    this.state = new StateStore({ paginators: paginators ?? [] });
    const finalEventHandlers =
      eventHandlers ?? ChannelPaginatorsOrchestrator.getDefaultHandlers();
    for (const [type, handlers] of Object.entries(finalEventHandlers)) {
      if (handlers) this.ensurePipeline(type).replaceAll(handlers);
    }
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
