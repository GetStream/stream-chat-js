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
import { Channel } from './channel';
import { ChannelWatchStatus } from './channel_state';
import { generateChannelTempId, getMemberUserId, runDetached } from './utils';
import { EntityStore } from './entityStore/EntityStore';
import { chatLoggerSystem } from './logger';

const logger = chatLoggerSystem.getLogger('channel-manager');

export type ChannelManagerEventHandlerContext = {
  channelManager: ChannelManager;
};

type EventHandlerContext = ChannelManagerEventHandlerContext;

type SupportedEventType = EventType | (string & {});

/**
 * Picks which paginators own a channel that matches several, by returning their IDs. An empty list
 * means every matching paginator keeps it.
 */
export type PaginatorOwnershipResolver = (args: {
  channel: Channel;
  matchingPaginators: ChannelPaginator[];
}) => string[];

/**
 * Priority-based ownership resolver. `priority` lists paginator IDs from highest to lowest: of the
 * paginators matching a channel, the highest-priority one owns it. If none of them is listed, all
 * keep it.
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
    const winner = [...matchingPaginators].sort((a, b) => {
      const rankA = rank.get(a.id);
      const rankB = rank.get(b.id);
      const valueA = rankA === undefined ? Number.POSITIVE_INFINITY : rankA;
      const valueB = rankB === undefined ? Number.POSITIVE_INFINITY : rankB;
      return valueA - valueB;
    })[0];
    const winnerValue = rank.get(winner.id);
    // None of the matches is listed: keep all.
    if (winnerValue === undefined) {
      return matchingPaginators.map((p) => p.id);
    }
    return [winner.id];
  };
};

/**
 * The cid the event refers to. Events carry it as `cid`, as `channel_type` + `channel_id`, or only
 * in `event.channel` (e.g. `notification.added_to_channel`).
 */
const getCidFromEvent = (event: PipelineEvent): string | undefined => {
  if (event.cid) return event.cid;
  // todo: is there a central method to construct the cid from type and channel id?
  if (event.channel_id && event.channel_type) {
    return `${event.channel_type}:${event.channel_id}`;
  }
  return event.channel?.cid;
};

// A channel pending disposal counts as not stored, so an event that makes its cid relevant again
// gets a live instance.
const getCachedChannelFromEvent = (
  event: PipelineEvent,
  channelManager: ChannelManager,
): Channel | undefined => {
  const cid = getCidFromEvent(event);
  const channel = cid ? channelManager.get(cid) : undefined;
  return channel?.pendingDisposal ? undefined : channel;
};

const removeItem: EventHandlerPipelineHandler<EventHandlerContext> = ({
  event,
  ctx: { channelManager },
}) => {
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
 * Re-watches a channel whose watch a dropped socket ended (`WasWatching`). Recovery re-watches only
 * the first page of each list and the active channel, so the others re-watch when an event proves
 * them relevant. `ensureWatched()` joins an in-flight watch, so a burst sends one request.
 */
const restoreInterruptedWatch = (channel: Channel) => {
  // A disposed channel refuses requests.
  if (channel.pendingDisposal) return;
  if (channel.watchStatus !== ChannelWatchStatus.WasWatching) return;

  runDetached(channel.ensureWatched(), {
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

    channel = await channelManager.ensure({ id, type }).ensureWatched();
  }

  if (!channel) return;

  routeToPaginators(channelManager, channel);

  // After routing and not awaited, so the row relocates off the event without waiting for the
  // watch. `channel.hidden` must not resurrect a watch.
  if (event.type !== 'channel.hidden') {
    restoreInterruptedWatch(channel);
  }
};

/**
 * Re-inserts a loaded channel whose data changed in place (`channel.updated`, `channel.truncated`), so
 * lists sorted or filtered by a changed field move or drop it. Unknown channels are ignored.
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
  // No boosting: the sort alone decides the order (`paginator.boost` is there for integrators).
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

// a hard delete of the last message might move the channel's `last_message_at` back
const messageDeletedHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: (context) => (context.event.hard_delete ? reinsertItem(context) : undefined),
  id: 'ChannelManager:default-handler:message.deleted',
};

const channelVisibleHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: updateLists,
  id: 'ChannelManager:default-handler:channel.visible',
};

const channelHiddenHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: updateLists,
  id: 'ChannelManager:default-handler:channel.hidden',
};

// Member IDs are stable, but `member.user.name` can affect a list's filter.
const memberUpdatedHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: updateLists,
  id: 'ChannelManager:default-handler:member.updated',
};

const messageNewHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: updateLists,
  id: 'ChannelManager:default-handler:message.new',
};

/** Sort fields resolved from read state (`SortParamRequest.field` is an open string). */
const READ_STATE_SORT_FIELDS: string[] = ['has_unread', 'unread_count'];

/**
 * Whether a read can change this list: its membership (`has_unread` filter) or its order
 * (`has_unread` / `unread_count` sort).
 */
const dependsOnReadState = (paginator: ChannelPaginator) =>
  paginator.effectiveSort.some(
    ({ field }) => !!field && READ_STATE_SORT_FIELDS.includes(field),
  ) || filterConstrainsField(paginator.buildMatchFilters(), 'has_unread');

/**
 * Re-routes a channel whose read state changed. `message.read` only reaches watchers, so
 * `notification.mark_*` is the only signal for channels the user is not watching. Never fetches
 * (unlike `updateLists`): these events are too frequent to query on.
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
 * `muted` is filterable but a mute change emits only this user-level event, so channels are
 * re-routed here. The client applies `event.me.channel_mutes` first, so filters see the new state.
 */
const notificationChannelMutesUpdatedHandler: LabeledEventHandler<EventHandlerContext> = {
  handle: ({ ctx: { channelManager } }) => {
    const seen = new Set<string>();
    channelManager.paginators.forEach((paginator) => {
      (paginator.items ?? []).forEach((channel) => {
        if (seen.has(channel.cid)) return; // ingest once, not once per list
        seen.add(channel.cid);
        channelManager.ingestChannel(channel);
      });
    });
  },
  id: 'ChannelManager:default-handler:notification.channel_mutes_updated',
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
   * The complete set of event handlers, replacing the defaults. Start from
   * `ChannelManager.getDefaultHandlers()` (a copy) and enrich it. `client.channelManager` is built
   * without this option: customize it through `addEventHandler` / `setEventHandlers` /
   * `removeEventHandlers`.
   */
  eventHandlers?: ChannelManagerEventHandlers;
  /**
   * Picks which paginator(s) own a channel that matches several. Defaults to all of them. A function
   * returns the owning paginator IDs; an array is a priority list (highest first), so the
   * highest-priority match owns the channel, and if none of them is listed all keep it.
   */
  ownershipResolver?: PaginatorOwnershipResolver | string[];
};

/**
 * A stored channel, its store key, and what keeps it: its own state (`'watched'`, `'active'`,
 * `'querying-channel'`) and the names of its holders. If none, `releaseUnusedChannels()` removes
 * it.
 */
export type ChannelUsage = {
  channel: Channel;
  key: string;
  keptBy: string[];
};

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
   * Every `Channel`, one per cid (a channel created from members sits under a temporary cid until
   * {@link ChannelManager.changeChannelId}). A channel stays until it is deleted, the user is
   * removed from it or logs out, or {@link ChannelManager.releaseUnusedChannels} removes it;
   * removal runs {@link Channel.disconnect}. Lists hold the channels they show by linking them,
   * others by claims.
   *
   * @internal
   */
  readonly channelStore = new EntityStore<Channel>({
    getEntityId: (channel) => channel.cid,
    onRelease: (channel) => channel.disconnect(),
    releaseOnLastUnlink: false,
  });

  protected _pipelines = new Map<
    SupportedEventType,
    EventHandlerPipeline<EventHandlerContext>
  >();
  protected ownershipResolver?: PaginatorOwnershipResolver;
  /**
   * Instances replaced by a stored one ({@link ChannelManager.supersedeChannel}). Not in the store,
   * so they are disconnected at logout ({@link ChannelManager.clearChannels}).
   */
  private readonly supersededChannels = new Set<Channel>();
  /**
   * The `filterQueryResults` each registered paginator had before `wrapPaginatorFiltering` wrapped
   * it. Keys mark paginators already wrapped, values are restored on removal. Weakly keyed.
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
    'message.deleted': [messageDeletedHandler],
    'message.new': [messageNewHandler],
    'message.read': [readStateChangedHandler],
    'message.read_locally': [readStateChangedHandler],
    'notification.added_to_channel': [notificationAddedToChannelHandler],
    'notification.channel_mutes_updated': [notificationChannelMutesUpdatedHandler],
    'notification.mark_read': [readStateChangedHandler],
    'notification.mark_unread': [readStateChangedHandler],
    'notification.message_new': [notificationMessageNewHandler],
    'notification.removed_from_channel': [notificationRemovedFromChannelHandler],
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

    // A supplied map replaces the defaults: an event type missing from it is not handled.
    const finalEventHandlers = eventHandlers ?? ChannelManager.getDefaultHandlers();
    for (const [type, handlers] of Object.entries(finalEventHandlers)) {
      if (handlers) this.ensurePipeline(type).replaceAll(handlers);
    }
    this.paginators.forEach((p) => this.wrapPaginatorFiltering(p));
  }

  get paginators(): ChannelPaginator[] {
    return this.state.getLatestValue().paginators;
  }

  /**
   * Returns the stored channel for a cid.
   *
   * @param cid - The channel's cid.
   * @returns The stored channel, or `undefined` when none is stored.
   */
  get(cid: string): Channel | undefined {
    return this.channelStore.get(cid);
  }

  /**
   * The instance a channel list should show for `channel`: the one that superseded it, else the one
   * stored under its cid, else `channel` itself, so a list never displaces the stored instance.
   * `undefined` when that instance is disconnected (`pendingDisposal`): it receives no events.
   *
   * @internal
   */
  resolveListedChannel(channel: Channel): Channel | undefined {
    const candidate = channel.supersededBy ?? channel;
    const stored = this.get(candidate.cid);
    const resolved = stored ?? candidate;
    if (resolved.pendingDisposal) return undefined;
    if (resolved !== channel) {
      logger
        .withExtraTags('resolveListedChannel', channel.cid)
        .warn(
          'A channel list was given an instance other than the stored one; listing the stored one.',
        );
    }
    return resolved;
  }

  /**
   * Returns every stored channel.
   *
   * @returns The stored channels.
   */
  values(): Channel[] {
    return this.channelStore.values();
  }

  /**
   * Returns the channel for `type` and `id`, creating it if it is not stored yet (one instance per
   * cid; a stored `pendingDisposal` channel is replaced by a fresh one). Use it instead of
   * `new Channel()`.
   *
   * Leave out `id` and pass `data.members` for a distinct channel between those members. It is
   * stored under a temporary cid until `watch()`, `query()` or `create()` returns the real one; a
   * stored distinct channel with the same loaded members is returned instead. If another instance
   * holds the real cid by then, it stays stored and this one is left unstored. A group with the
   * same members as another needs its own `id`.
   *
   * A channel created from members is {@link Channel.isProvisional} until its query is answered: it
   * has no ID yet, so nothing but that query can be sent for it.
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
        // Only `custom`, and only when passed: other fields would wipe the stored custom data (e.g.
        // its name).
        if (data.custom !== undefined) {
          channel.data = { ...channel.data, custom: data.custom };
          channel._data = { ...channel._data, custom: data.custom };
        }
      },
    );
  }

  private ensureByMembers(type: string, data: ChannelInput): Channel {
    // The ID `Channel` gives itself until the server answers.
    const tempId = generateChannelTempId((data.members ?? []).map(getMemberUserId));
    if (!tempId) {
      throw Error('Please specify atleast one member when creating unique conversation');
    }
    const tempCid = `${type}:${tempId}`;

    // The real ID of a distinct channel starts with `!members-`: a loaded one with the same members
    // is this conversation.
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
   * `previous`, created without an ID, was answered with a cid `successor` already holds (stored by
   * an event or a list meanwhile). `successor` stays the one instance and takes over: the response
   * is applied to it like a `queryChannels` result (local messages are never removed),
   * `previous`'s local messages (sending or failed) are added by ID (`successor`'s copy wins), and
   * `previous`'s composer moves over when `previous` is open and `successor` is not.
   *
   * `successor` is marked watched only when the query asked to watch. `previous` is dropped from
   * the store (`storedUnder`) without disconnecting, as it may be on screen, marked superseded
   * (`state.supersededBy`) so its holders switch over, and disconnected at logout.
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
    // `false`, not `undefined`: a missing `watch` means "watched if connected" to
    // `hydrateChannels`.
    this.client.hydrateChannels([response], {}, { watch: watch === true });
    successor.messagePaginator.batch(
      () => {
        for (const message of previous.messagePaginator.items ?? []) {
          if (message.status === 'received') continue;
          if (successor.messagePaginator.getItem(message.id)) continue;
          // Composed in `previous`, so it carries the temporary cid.
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
   * Removes every stored channel the app disconnected (`pendingDisposal`), whatever holds it, then
   * every one that is neither watched nor held; lists drop them. Kept: watched channels
   * (`watching`, or `wasWatching` until restored), active ones ({@link Channel.activate}), ones
   * being loaded, and ones held in {@link ChannelManager.channelStore} (lists link theirs; threads,
   * the composer cache and channel search hold theirs through claims,
   * {@link EntityStore.addClaim}).
   *
   * The SDK never calls this, as it cannot see channels an app keeps in its own state. Call it when
   * the app is done with them (e.g. after `searchController.dispose()`), and keep a channel your
   * code still uses with {@link Channel.activate} first.
   */
  releaseUnusedChannels() {
    for (const [key, channel] of this.channelStore.entries()) {
      if (channel.pendingDisposal) this.removeChannel(key);
    }
    for (const [key, channel] of this.channelStore.unheldEntries()) {
      if (!keptByOwnState(channel).length) this.removeChannel(key);
    }
  }

  /**
   * Every stored channel with what keeps it, by the rule of
   * {@link ChannelManager.releaseUnusedChannels}. For debugging tools.
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
   * ({@link Channel.disconnect}). Every list showing it drops it too.
   *
   * @internal
   */
  removeChannel(cid: string) {
    this.channelStore.remove(cid);
  }

  /**
   * Removes and disconnects ({@link Channel.disconnect}) every stored channel, and every superseded
   * one.
   *
   * @internal
   */
  clearChannels() {
    this.channelStore.clear();
    this.supersededChannels.forEach((channel) => channel.disconnect());
    this.supersededChannels.clear();
  }

  /**
   * Fans the client-owned `mutedChannels` out to every stored channel's `state.muteStatus` (a
   * channel republishes only when its status changed, as this runs on every `health.check`).
   *
   * @internal
   */
  reflectMutedChannels() {
    for (const channel of this.values()) channel._syncMuteStatus();
  }

  /**
   * Resets the AI indicator state to `Idle` on every stored channel. Invoked from
   * `closeConnection`, a deliberate shutdown that triggers no WS event.
   *
   * @internal
   */
  resetAIStateOnChannels() {
    for (const channel of this.values()) channel.state.resetAIState();
  }

  /**
   * Demotes every `Watching` channel to `WasWatching`: the server keys watches by connection ID, so
   * a dropped socket ends them all. Channels stopped on purpose or disconnected stay `NotWatching`.
   * Called when the socket goes unhealthy or offline (`StableWSConnection`, `WSConnectionFallback`)
   * and by `closeConnection()`, whose `disconnect()` writes health through `_applyHealth` and never
   * reaches `_setHealth`.
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

  /** Returns a copy of the default handler mapping, to enrich or replace. */
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
   * Sets the rule deciding which paginator(s) own a channel matched by several. Pass paginator IDs
   * (highest priority first) for the built-in priority resolver, a custom resolver, or `undefined`
   * for the default (every matching paginator keeps the channel). A setter because the client
   * builds the manager before the app creates its paginators.
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

  /** Ids of the paginators that own the channel among the matches. Empty: all of them. */
  resolveOwnership(
    channel: Channel,
    matchingPaginators: ChannelPaginator[],
  ): Set<string> {
    return new Set(this.ownershipResolver?.({ channel, matchingPaginators }) ?? []);
  }

  /**
   * Routes a channel into the paginator(s) that own it and removes it from any list it no longer
   * belongs to, as for live WS updates. Use it to surface a channel the app just opened (a search
   * result, a new DM) without a re-query; repeated calls are safe. A channel created from members
   * is ignored until its first query gives it an ID. A channel matching no paginator is added
   * nowhere: register a catch-all paginator (empty filter) with the lowest ownership priority as a
   * fallback.
   */
  ingestChannel(input: Channel) {
    // Not listed until it has its ID (see `ChannelPaginator.ingestItem`).
    if (input.isProvisional) return;
    const channel = this.resolveListedChannel(input);
    if (!channel) return;
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
   * Drops a channel from the lists whose filters it no longer matches, adding it nowhere. For state
   * the client changes without an event naming the channel (e.g. zeroing every unread count on a
   * global read). Removal-only: becoming read cannot make a channel belong to a list (the backend
   * rejects `has_unread: false`).
   */
  dropFromUnmatchedLists(channel: Channel) {
    this.paginators.forEach((paginator) => {
      if (paginator.matchesFilter(channel)) return;
      paginator.removeItem({ item: channel });
    });
  }

  /** Filters a page of query results for `paginator` by ownership (no owners: all matches keep). */
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
   * Makes a registered paginator apply the ownership rules to the pages it fetches itself (server
   * queries bypass the manager), by composing `filterItemsByOwnership` onto its
   * `filterQueryResults`. Its own filtering runs first. Idempotent: wrapping twice would lose the
   * true original.
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
   * Restores the `filterQueryResults` the paginator had before `wrapPaginatorFiltering`: a detached
   * paginator must not keep applying ownership rules resolved against lists it left.
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
   * Replaces the whole set of lists in one state update (the primitive `insertPaginator` and
   * `removePaginator` build on). Dropped paginators are detached as `removePaginator` does; a
   * repeated ID keeps only its first occurrence.
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
    // An equivalent set would hand subscribers a new array and re-render every list.
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
    nextPaginators.forEach((paginator) => this.wrapPaginatorFiltering(paginator));
  }

  /**
   * Detaches every list as `removePaginator` does, in one update.
   *
   * @returns The paginators the manager held, in the order it held them.
   */
  clearPaginators(): ChannelPaginator[] {
    const cleared = this.paginators;
    this.setPaginators([]);
    return cleared;
  }

  /**
   * Inserts a paginator. One already held with the same ID is removed first, so this moves it, or
   * replaces it when it is another instance.
   *
   * @param params.paginator - The paginator to insert or move.
   * @param params.index - Target index, clamped to the list. Defaults to appending.
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
   * Removes a paginator: it leaves `state.paginators`, stops receiving WS-driven updates and gets
   * its own `filterQueryResults` back. Its loaded items stay, and a query scheduled through
   * `nextDebounced` is cancelled.
   *
   * @param paginatorOrId - The paginator to remove, or its ID.
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
   * Discards the loaded data of every registered list but keeps the registrations: each paginator
   * returns to "never queried" (`items: undefined`) with its debounced query cancelled.
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

  /** Subscribes to client events. The returned function releases this registration. */
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

  /**
   * Re-runs every loaded list's own first-page query, the channel-list half of connection recovery
   * ({@link ConnectionRecoveryManager}). The page's channels are re-watched (`queryChannels`
   * watches by default), those below it come back through `restoreInterruptedWatch`.
   * Never-queried paginators are skipped: they run their own first query on mount, and querying them
   * here would race it. Unlike {@link ChannelManager.reload}, it merges the page into the loaded
   * list (`keepPreviousItems`) instead of blanking it, and is not `silent`: the `isLoading`
   * transition guards against an overlapping query.
   */
  recover = async () =>
    await Promise.allSettled(
      this.paginators
        .filter((paginator) => paginator.isInitialized)
        .map(async (paginator) => {
          await paginator.recoverLoadedItems();
        }),
    );
}
