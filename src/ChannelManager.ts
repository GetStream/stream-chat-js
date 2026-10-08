import { EventHandlerPipeline } from './EventHandlerPipeline';
import { WithSubscriptions } from './utils/WithSubscriptions';
import type { ChannelInput, ChannelStateResponseFields, EventType } from './types';
import type { ChannelPaginator } from './pagination';
import type { StreamChat } from './client';
import type { Unsubscribe } from '@stream-io/state-store';
import { StateStore } from '@stream-io/state-store';
import type {
  EventHandlerPipelineHandler,
  FindEventHandlerParams,
  InsertEventHandlerPayload,
  LabeledEventHandler,
  PipelineEvent,
} from './EventHandlerPipeline';
import { filterConstrainsField } from './pagination/filterCompiler';
import { getChannel } from './pagination/utility.queryChannel';
import { Channel } from './channel';
import { ChannelWatchStatus } from './channel_state';
import { generateChannelTempId, getMemberUserId, runDetached } from './utils';
import { EntityStore } from './entityStore/EntityStore';

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
  channelManager: ChannelManager,
): Channel | undefined => {
  const cid = getCidFromEvent(event);
  return cid ? channelManager.get(cid) : undefined;
};

const removeItem: EventHandlerPipelineHandler<EventHandlerContext> = ({
  event,
  ctx: { channelManager },
}) => {
  // `getCidFromEvent`, not `event.cid`: on `channel.deleted` the cid can arrive nested in
  // `event.channel` only, and the legacy ChannelManager removed by `event.cid || event.channel?.cid`
  const cid = getCidFromEvent(event);
  if (!cid) return;
  const channel = channelManager.get(cid);
  channelManager.paginators.forEach((paginator) => {
    paginator.removeItem({ id: cid, item: channel });
  });
};

// todo: documentation: show how to implement allowNewMessagesFromUnfilteredChannels just by inserting event handler
//  at the start of the handler pipeline and filter out events for unknown channels
export const ignoreEventsForUnknownChannels: EventHandlerPipelineHandler<
  EventHandlerContext
> = ({ event, ctx: { channelManager } }) => {
  const channel = getCachedChannelFromEvent(event, channelManager);
  if (!channel) return { action: 'stop' };
};

/**
 * Restore a watch this client held and lost to a dropped socket.
 *
 * The server keys watches by connection ID, so a reconnect ends every watch the previous connection
 * held. Reconnect recovery re-watches the first page of each list plus the active channel; everything
 * else stays `WasWatching` — pages 2+ of a scrolled list, channels visited and navigated away from,
 * channels matching no mounted list. Such a channel still receives member-level events (e.g.
 * `notification.message_new`), which relocate its row but carry no message body, so its preview would
 * sit frozen until the channel was opened. Re-watching it the moment an event proves it relevant is
 * what closes that gap, without ever eagerly re-watching the whole cache.
 *
 * The request is idempotent, so a successful watch flips the status to `Watching`, and `getChannel`
 * dedupes concurrent watches for the same cid, so a burst of events cannot produce a burst of requests.
 */
const restoreInterruptedWatch = (channel: Channel, client: StreamChat) => {
  if (channel.pendingDisposal) return;
  if (channel.watchStatus !== ChannelWatchStatus.WasWatching) return;

  // Takes the client as an argument rather than calling `channel.getClient()`, which THROWS for a
  // channel pending disposal — the guard above makes that unreachable today, but a throw here would
  // reject the whole event handler, so it is not a hazard worth leaving one edit away.
  runDetached(getChannel({ channel, client }), {
    context: `restoreInterruptedWatch(${channel.cid})`,
  });
};

const updateLists: EventHandlerPipelineHandler<EventHandlerContext> = async ({
  event,
  ctx: { channelManager },
}) => {
  let channel: Channel | undefined = getCachedChannelFromEvent(event, channelManager);

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

  routeToPaginators(channelManager, channel);

  // AFTER routing, and not awaited: the row relocates immediately off the event, and the watch (plus
  // the state it hydrates) lands whenever it lands. `channel.hidden` is excluded — a channel being
  // hidden is the one routed event that must not resurrect a watch.
  if (event.type !== 'channel.hidden') {
    restoreInterruptedWatch(channel, channelManager.client);
  }
};

/**
 * Re-inserts a loaded channel whose data changed in place (`channel.updated`, `channel.truncated`), so
 * a list sorted or filtered by a changed field moves or drops it. Channels that aren't loaded are
 * ignored: these events don't make an unknown channel relevant.
 */
const reinsertItem: EventHandlerPipelineHandler<EventHandlerContext> = ({
  event,
  ctx: { channelManager },
}) => {
  const channel = getCachedChannelFromEvent(event, channelManager);
  if (!channel) return;
  routeToPaginators(channelManager, channel);
};

/** Ingests `channel` into the lists that match and own it, and removes it from the rest. */
function routeToPaginators(channelManager: ChannelManager, channel: Channel) {
  // The manager never boosts by default on any event — the sort is the single source of truth for
  // order, so a channel that just became relevant (new message, added, unhidden) relocates via its
  // updated sort key. Boosting remains a public per-paginator primitive (`paginator.boost`) for
  // integrators to opt into for specific channels (VIP/mention/deep-link).
  channelManager.ingestChannel(channel);
}

const channelDeletedHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: removeItem,
  id: 'ChannelManager:default-handler:channel.deleted',
};

const channelUpdatedHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: reinsertItem,
  id: 'ChannelManager:default-handler:channel.updated',
};

const channelTruncatedHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: reinsertItem,
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

/**
 * Sort fields the channel list's sort resolver resolves from read state. `SortParamRequest.field` is an open
 * string, so there is no type enumerating them.
 */
const READ_STATE_SORT_FIELDS: string[] = ['has_unread', 'unread_count'];

/**
 * Whether a read can change this list at all: its membership (`has_unread` filter) or its order
 * (`has_unread` / `unread_count` sort). Unread badges read `channel.state` directly, so nothing else
 * about the list depends on it.
 */
const dependsOnReadState = (paginator: ChannelPaginator) =>
  paginator.effectiveSort.some(
    ({ field }) => !!field && READ_STATE_SORT_FIELDS.includes(field),
  ) || filterConstrainsField(paginator.buildMatchFilters(), 'has_unread');

/**
 * Re-routes a channel whose read state changed. `message.read` only reaches watchers, so
 * `notification.mark_*` is the only signal for channels the user is not watching.
 *
 * Never fetches, unlike `updateLists`: a read cannot make an unknown channel belong to a list, and
 * these events are far too frequent to query on.
 */
const readStateChangedHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: ({ event, ctx: { channelManager } }) => {
    const { client } = channelManager;
    // another member's read receipt says nothing about this user's unread state
    if (event.type === 'message.read' && event.user?.id !== client.userId) return;

    // a thread read says nothing about the channel's own read state
    if (event.thread_id) return;

    // a mark-all-read names no channel, so there is no target to route
    const channel = getCachedChannelFromEvent(event, channelManager);
    if (!channel) return;

    // hot path: `message.read` fires on every channel the user opens
    if (!channelManager.paginators.some(dependsOnReadState)) return;

    channelManager.ingestChannel(channel);
  },
  id: 'ChannelManager:default-handler:read-state-changed',
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

/**
 * A stored channel, the key it is stored under, and what keeps it: its own state (`'watched'`,
 * `'active'`, `'querying-channel'`) and the names of its holders. None: a call to
 * `releaseUnusedChannels()` would remove it.
 */
export type ChannelUsage = {
  channel: Channel;
  key: string;
  keptBy: string[];
};

/** What in the channel's own state keeps it in the channel store. */
const keptByOwnState = (channel: Channel) => {
  const reasons: string[] = [];
  if (channel.watchStatus !== ChannelWatchStatus.NotWatching) reasons.push('watched');
  if (channel.active) reasons.push('active');
  if (channel.isQueryingChannel) reasons.push('querying-channel');
  return reasons;
};

export class ChannelManager extends WithSubscriptions {
  client: StreamChat;
  state: StateStore<ChannelManagerState>;
  /**
   * Every `Channel` instance, one per cid. A channel created from members, before the server assigns
   * its id, is stored under its temporary cid until {@link ChannelManager.changeChannelId} moves it.
   * A channel stays until a known end (deleted, or the current user removed from it) or logout removes
   * it, or the app calls {@link ChannelManager.releaseUnusedChannels} while it is neither watched nor
   * held; each removes it and runs its {@link Channel._disconnect}. A channel list holds the channels it shows by linking them, which also
   * tells it about removals and cid changes; other users hold theirs through claims.
   *
   * @internal
   */
  readonly channelStore = new EntityStore<Channel>({
    getEntityId: (channel) => channel.cid,
    onRelease: (channel) => channel._disconnect(),
    releaseOnLastUnlink: false,
  });

  protected _pipelines = new Map<
    SupportedEventType,
    EventHandlerPipeline<EventHandlerContext>
  >();
  protected ownershipResolver?: PaginatorOwnershipResolver;
  /**
   * Instances replaced by a stored one ({@link ChannelManager.supersedeChannel}). Not in the store, so
   * nothing else disconnects them ({@link Channel._disconnect}): each is disconnected and dropped from
   * here when its last activation ends, or with the rest on {@link ChannelManager.clearChannels}.
   */
  private readonly supersededChannels = new Set<Channel>();
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
    'message.read': [readStateChangedHandler],
    'message.read_locally': [readStateChangedHandler],
    'notification.added_to_channel': [notificationAddedToChannelHandler],
    'notification.channel_mutes_updated': [notificationChannelMutesUpdatedHandler],
    'notification.mark_read': [readStateChangedHandler],
    'notification.mark_unread': [readStateChangedHandler],
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

  /** The stored channel for `cid`, if any. */
  get(cid: string): Channel | undefined {
    return this.channelStore.get(cid);
  }

  /** Every stored channel. */
  values(): Channel[] {
    return this.channelStore.values();
  }

  /**
   * Returns the channel for `type` and `id`, creating it if it isn't stored yet. Use this to get a
   * channel instead of calling `new Channel()`; there is one instance per cid. A stored channel
   * already disconnected (`pendingDisposal`) is replaced by a fresh one.
   *
   * Leave out `id` and pass `data.members` for a distinct channel between those members (one channel
   * per set of members). It is stored under a temporary cid built from the member IDs until
   * `watch()`, `query()` or `create()` returns the real one; a stored distinct channel with the same
   * loaded members is returned instead. If another instance holds the real cid by then (its members
   * weren't loaded, or an event stored it meanwhile), that instance stays stored and this one is
   * left unstored. A group with the same members as another needs its own `id` instead.
   *
   * A channel created from members is {@link Channel.isProvisional} until its query is answered: it
   * has no id yet, so nothing but that query can be sent for it. A channel with an id is not, even one
   * whose id the app generated and the server doesn't have yet: requests for it go to the server.
   *
   * A channel got this way stays stored until it is deleted, the current user is removed from it, or
   * the user logs out. The SDK never releases it on its own; an app freeing memory calls
   * {@link ChannelManager.releaseUnusedChannels}, which releases it only while nothing uses it.
   *
   * ```ts
   * const general = client.channelManager.ensure({ type: 'messaging', id: 'general' });
   * const dm = client.channelManager.ensure({
   *   type: 'messaging',
   *   data: { members: [{ user_id: 'ann' }, { user_id: 'bob' }] },
   * });
   * await dm.watch();
   * ```
   *
   * @param params.type - The channel type.
   * @param params.id - The channel ID; leave it out for a distinct channel created from members.
   * @param params.data - Data for a new channel (members, custom fields). For a stored channel only
   *   `data.custom` is applied.
   * @returns The channel; initialize it with `channel.watch()`.
   */
  ensure({
    data = {},
    id,
    type,
  }: {
    type: string;
    id?: string | null;
    data?: ChannelInput;
  }): Channel {
    const { client } = this;
    if (!client.userId) {
      throw Error('Call connectUser or connectAnonymousUser before creating a channel');
    }
    if (type.includes(':')) {
      throw new Error(`Invalid channel group ${type}, can't contain the : character`);
    }
    if (id) return this.ensureById(type, id, data);
    if (data.members?.length) return this.ensureByMembers(type, data);
    return new Channel(client, type, undefined, data);
  }

  private ensureById(type: string, id: string, data: ChannelInput): Channel {
    if (id.includes(':')) {
      throw Error(`Invalid channel id ${id}, can't contain the : character`);
    }

    const cid = `${type}:${id}`;
    if (this.get(cid)?.pendingDisposal) this.removeChannel(cid);

    return this.getOrCreateChannel(
      cid,
      () => new Channel(this.client, type, id, data),
      (channel) => {
        // Only `custom` is applied to a stored channel, and only when the caller passed it: other
        // fields (e.g. `{ members }`) would otherwise wipe its existing custom data, such as its name.
        if (data.custom !== undefined) {
          channel.data = { ...channel.data, custom: data.custom };
          channel._data = { ...channel._data, custom: data.custom };
        }
      },
    );
  }

  private ensureByMembers(type: string, data: ChannelInput): Channel {
    // the id `Channel` gives itself until the server answers, from the same members
    const tempId = generateChannelTempId((data.members ?? []).map(getMemberUserId));
    if (!tempId) {
      throw Error('Please specify atleast one member when creating unique conversation');
    }
    const tempCid = `${type}:${tempId}`;

    // Stored under the temporary cid until the server returns the real one, then under the real
    // cid, whose id for a distinct channel starts with `!members-`. A loaded one with the same
    // members is that conversation.
    if (this.get(tempCid)?.pendingDisposal) this.removeChannel(tempCid);
    if (!this.get(tempCid)) {
      const existing = this.values().find(
        (channel) =>
          !channel.pendingDisposal &&
          channel.type === type &&
          channel.id?.startsWith('!members-') &&
          generateChannelTempId(Object.keys(channel.state.members)) === tempId,
      );
      if (existing) return existing;
    }

    return this.getOrCreateChannel(
      tempCid,
      () => new Channel(this.client, type, undefined, data),
    );
  }

  /**
   * Returns the channel stored under `cid`, passing it to `hydrate`, or stores and returns the result
   * of `create`.
   *
   * @internal
   */
  getOrCreateChannel(
    cid: string,
    create: () => Channel,
    hydrate?: (stored: Channel) => void,
  ): Channel {
    return this.channelStore.getOrCreate(cid, create, hydrate);
  }

  /**
   * Moves a channel from its temporary cid to the one the server assigned (see `Channel.query`).
   * Returns `false` when `oldCid` isn't stored or `newCid` already holds another channel.
   *
   * @internal
   */
  changeChannelId(oldCid: string, newCid: string): boolean {
    return this.channelStore.changeId(oldCid, newCid);
  }

  /**
   * `previous`, created without an id, was answered with a cid `successor` already holds (stored by an
   * event or a channel list while `previous` waited). `successor` stays the one instance for the cid
   * and takes over, without losing anything of its own:
   *
   * - the server's response, as a `queryChannels` result for a stored channel is applied: its data
   *   and members, and its messages merged into the loaded ones (a local message, such as a failed
   *   one, is never removed; an open channel's or a scrolled-back one's window isn't re-seeded);
   * - `previous`'s local messages (sending or failed), added by id; a message `successor` already has
   *   keeps `successor`'s copy;
   * - `previous`'s composer, when `previous` is open and `successor` isn't: the user is typing in
   *   `previous`, and nobody in `successor`. When both are open, neither composer is overwritten.
   *
   * `previous`'s own entry (`storedUnder`, its temporary cid) is dropped first, without disconnecting
   * it: its query is still being applied to it and it may be on screen. It is marked superseded
   * (`state.supersededBy`) so its holders switch over, and tracked here until it is disconnected
   * ({@link ChannelManager.releaseSupersededChannel}), so the SDK never loses track of it.
   *
   * @internal
   */
  supersedeChannel(
    previous: Channel,
    successor: Channel,
    response: ChannelStateResponseFields,
    { storedUnder, watch }: { storedUnder?: string; watch?: boolean } = {},
  ) {
    if (storedUnder && this.get(storedUnder) === previous) {
      this.channelStore.detach(storedUnder);
    }
    this.client.hydrateChannels([response], {}, { watch });
    successor.messagePaginator.batch(
      () => {
        for (const message of previous.messagePaginator.items ?? []) {
          if (message.status === 'received') continue;
          if (successor.messagePaginator.getItem(message.id)) continue;
          // composed in `previous`, it carries `previous`'s temporary cid
          successor.messagePaginator.ingestItem({ ...message, cid: successor.cid });
        }
      },
      { coalesce: true },
    );
    if (previous.active && !successor.active) {
      previous.messageComposer.transferTo(successor.messageComposer);
    }
    previous.state.partialNext({ supersededBy: successor });
    this.supersededChannels.add(previous);
  }

  /**
   * Disconnects a superseded instance ({@link Channel._disconnect}) and stops tracking it, once its
   * last activation ended.
   *
   * @internal
   */
  releaseSupersededChannel(channel: Channel) {
    if (!this.supersededChannels.delete(channel)) return;
    channel._disconnect();
  }

  /**
   * Removes, and disconnects ({@link Channel._disconnect}), every stored channel that is neither
   * watched nor held. A watched channel (`watching`,
   * or `wasWatching` until its watch is restored) stays, because its events keep it current; so does
   * an active one ({@link Channel.activate}), one being loaded (`watch()`, `query()` or `create()` in flight), and
   * one a holder holds in {@link ChannelManager.channelStore}: a channel list links each of its
   * channels, while threads, the composer cache and an active channel search hold theirs through
   * claims ({@link EntityStore.addClaim}).
   *
   * What remains is an unwatched snapshot nothing shows, which saves no request: using it again
   * needs a query, which stores it again.
   *
   * The SDK never calls this: it can't see the channels an app keeps in its own state, such as a
   * stopped watch kept for re-entry or search results held after the search ended. Call it when the
   * app is done with what it held, for example after closing a search screen
   * (`searchController.dispose()`, then this). A channel your code still uses but that none of the
   * above keeps would be released, so keep it with {@link Channel.activate} first.
   */
  releaseUnusedChannels() {
    for (const [key, channel] of this.channelStore.unheldEntries()) {
      if (!keptByOwnState(channel).length) this.removeChannel(key);
    }
  }

  /**
   * Every stored channel with what keeps it, by the same rule as
   * {@link ChannelManager.releaseUnusedChannels}: a channel kept by nothing would be released by a
   * call to it. For debugging tools.
   *
   * @internal
   */
  getChannelUsage(): ChannelUsage[] {
    return this.channelStore.entries().map(([key, channel]) => ({
      channel,
      key,
      keptBy: [...keptByOwnState(channel), ...this.channelStore.holderNames(key)],
    }));
  }

  /**
   * Removes the channel stored under `cid` whatever uses it, and disconnects it
   * ({@link Channel._disconnect}).
   * Every list showing it drops it too, as the store's removal reaches each list's index.
   *
   * @internal
   */
  removeChannel(cid: string) {
    this.channelStore.remove(cid);
  }

  /**
   * Removes and disconnects ({@link Channel._disconnect}) every stored channel, and every superseded
   * one.
   *
   * @internal
   */
  clearChannels() {
    this.channelStore.clear();
    this.supersededChannels.forEach((channel) => channel._disconnect());
    this.supersededChannels.clear();
  }

  /**
   * Fans the client-owned `mutedChannels` out to every stored channel's reactive `state.muteStatus`.
   * Each channel republishes only when its own mute status actually changed, so this stays cheap on
   * the frequent `health.check` path.
   *
   * @internal
   */
  reflectMutedChannels() {
    for (const channel of this.values()) channel._syncMuteStatus();
  }

  /**
   * Resets the AI indicator state to `Idle` on every stored channel. Invoked from `closeConnection`
   * as it's a deliberate shutdown and will not natively trigger a WS event.
   *
   * @internal
   */
  resetAIStateOnChannels() {
    for (const channel of this.values()) channel.state.resetAIState();
  }

  /**
   * Demotes every actively-watched channel to `WasWatching`. The server keys watches by connection
   * ID, so losing the socket ends every watch this client held — a reconnect issues a NEW id and the
   * channels have to be re-queried to watch again. `WasWatching` is what records that they should be.
   *
   * Only `Watching` is demoted: a channel the consumer stopped on purpose, or one already
   * disconnected (`_disconnect()`), stays `NotWatching` and must not be resurrected by a reconnect.
   *
   * Invoked from two places on the WebSocket, because neither covers the other:
   * `StableWSConnection._setHealth(false)` for an abnormal close/error, and `closeConnection()` for a
   * deliberate shutdown (e.g. mobile backgrounding), whose `disconnect()` writes the status through
   * `_applyHealth` and so never reaches `_setHealth`. After an `enableWSFallback` switch the
   * long-poll calls it too, from `WSConnectionFallback._setState()` whenever going closed or
   * disconnected takes the status offline.
   *
   * @internal
   */
  markChannelsWatchInterrupted() {
    for (const channel of this.values()) {
      if (channel.watchStatus === ChannelWatchStatus.Watching) {
        channel.watchStatus = ChannelWatchStatus.WasWatching;
      }
    }
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
    const matchingPaginatorIds = new Set(matchingPaginators.map((p) => p.id));
    const ownerIds = this.resolveOwnership(channel, matchingPaginators);

    for (const paginator of this.paginators) {
      const isOwner =
        matchingPaginatorIds.has(paginator.id) &&
        (ownerIds.size === 0 || ownerIds.has(paginator.id));
      if (isOwner) paginator.ingestItem(channel);
      else paginator.removeItem({ item: channel });
    }
  }

  /**
   * Drops a channel from the lists whose filters it no longer matches, adding it nowhere.
   *
   * For state the client changes without an event naming the channel — zeroing every unread count on a
   * global read. Removal-only: the backend rejects `has_unread: false`, so becoming read can never make
   * a channel belong to a list, and `ingestChannel` would pull unloaded channels into matching ones.
   */
  dropFromUnmatchedLists(channel: Channel) {
    this.paginators.forEach((paginator) => {
      if (paginator.matchesFilter(channel)) return;
      paginator.removeItem({ item: channel });
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

  reload = async () => {
    const results = await Promise.allSettled(
      this.paginators.map(async (paginator) => {
        await paginator.reload();
      }),
    );
    return results;
  };

  /**
   * Re-run every loaded list's own first-page query — the channel-list half of connection recovery,
   * driven by {@link ConnectionRecoveryManager}.
   *
   * Each list re-asserts its *own* `filters` / `sort` / `pageSize` rather than some substitute query,
   * and because `client.queryChannels` watches by default, that page's channels are re-watched as a
   * side effect. Channels below the first page are deliberately not touched — see
   * `restoreInterruptedWatch` for how they come back.
   *
   * `{ keepPreviousItems: true, reset: 'yes' }` is the non-destructive refresh: `reset` restarts the
   * window at page 1, while `keepPreviousItems` merges the fetched page into the loaded list instead
   * of replacing it and keeps the item index populated — the latter is what stops a concurrent
   * offline-replay ingest from rebuilding the list out of a cleared index. Notably NOT `silent`: the
   * `isLoading` transition it would suppress is the in-flight guard that keeps a second overlapping
   * query from being issued.
   *
   * Distinct from {@link ChannelManager.reload}, which is a destructive `reset` that blanks each list
   * to its loading state.
   *
   * Paginators that were never queried are skipped: they run their own first query when they mount,
   * and querying them here would race it.
   */
  recover = async () => {
    const results = await Promise.allSettled(
      this.paginators
        .filter((paginator) => paginator.isInitialized)
        .map(async (paginator) => {
          await paginator.toTail({ keepPreviousItems: true, reset: 'yes' });
        }),
    );
    return results;
  };
}
