import type { StreamChat } from './client';
import type {
  DefaultGenerics,
  ExtendableGenerics,
  Event,
  ChannelOptions,
  ChannelStateOptions,
  ChannelFilters,
  ChannelSort,
} from './types';
import { StateStore } from './store';
import { Channel } from './channel';
import {
  findLastPinnedChannelIndex,
  findPinnedAtSortOrder,
  getAndWatchChannel,
  isChannelArchived,
  isChannelPinned,
  shouldConsiderArchivedChannels,
  shouldConsiderPinnedChannels,
} from './utils';

export type ChannelManagerPagination<SCG extends ExtendableGenerics = DefaultGenerics> = {
  filters: ChannelFilters<SCG>;
  hasNext: boolean;
  isLoading: boolean;
  isLoadingNext: boolean;
  options: ChannelOptions;
  sort: ChannelSort<SCG>;
  stateOptions: ChannelStateOptions;
};

export type ChannelManagerState<SCG extends ExtendableGenerics = DefaultGenerics> = {
  channels: Channel<SCG>[];
  pagination: ChannelManagerPagination<SCG>;
  ready: boolean;
};

export type SetterParameterType<T> = T | ((prevState: T) => T);
export type ChannelSetterParameterType<SCG extends ExtendableGenerics = DefaultGenerics> = SetterParameterType<
  ChannelManagerState<SCG>['channels']
>;
export type ChannelSetterType<SCG extends ExtendableGenerics = DefaultGenerics> = (
  arg: ChannelSetterParameterType<SCG>,
) => void;

// TODO: Figure out a better way to infer a generic handler type here
export type GenericEventHandlerType<T extends unknown[]> = (
  ...args: T
) => void | (() => void) | ((...args: T) => Promise<void>);
export type EventHandlerType<SCG extends ExtendableGenerics = DefaultGenerics> = GenericEventHandlerType<[Event<SCG>]>;
export type EventHandlerOverrideType<SCG extends ExtendableGenerics = DefaultGenerics> = GenericEventHandlerType<
  [ChannelSetterType<SCG>, Event<SCG>]
>;

export type ChannelManagerEventTypes =
  | 'notification.added_to_channel'
  | 'notification.message_new'
  | 'notification.removed_from_channel'
  | 'message.new'
  | 'member.updated'
  | 'channel.deleted'
  | 'channel.hidden'
  | 'channel.truncated'
  | 'channel.visible'
  | 'channel.updated';

export type ChannelManagerEventHandlerNames =
  | 'channelDeletedHandler'
  | 'channelHiddenHandler'
  | 'channelTruncatedHandler'
  | 'channelVisibleHandler'
  | 'channelUpdatedHandler'
  | 'newMessageHandler'
  | 'memberUpdatedHandler'
  | 'notificationAddedToChannelHandler'
  | 'notificationNewMessageHandler'
  | 'notificationRemovedFromChannelHandler'
  | 'userPresenceHandler';

export type ChannelManagerEventHandlerOverrides<SCG extends ExtendableGenerics = DefaultGenerics> = Partial<
  Record<ChannelManagerEventHandlerNames, EventHandlerOverrideType<SCG>>
>;

const eventTypes = [
  'notification.added_to_channel',
  'notification.message_new',
  'notification.removed_from_channel',
  'message.new',
  'member.updated',
  'channel.deleted',
  'channel.hidden',
  'channel.truncated',
  'channel.visible',
  'channel.updated',
  'user.presence.changed',
  'user.updated',
];

const eventToHandlerMapping: { [key in ChannelManagerEventTypes]: ChannelManagerEventHandlerNames } = {
  'channel.deleted': 'channelDeletedHandler',
  'channel.hidden': 'channelHiddenHandler',
  'channel.truncated': 'channelTruncatedHandler',
  'channel.visible': 'channelVisibleHandler',
  'channel.updated': 'channelUpdatedHandler',
  'message.new': 'newMessageHandler',
  'member.updated': 'memberUpdatedHandler',
  'notification.added_to_channel': 'notificationAddedToChannelHandler',
  'notification.message_new': 'notificationNewMessageHandler',
  'notification.removed_from_channel': 'notificationRemovedFromChannelHandler',
};

export type ChannelManagerOptions = {
  lockChannelOrder?: boolean;
};

export class ChannelManager<SCG extends ExtendableGenerics = DefaultGenerics> {
  public readonly state: StateStore<ChannelManagerState<SCG>>;
  private client: StreamChat<SCG>;
  private unsubscribeFunctions: Set<() => void> = new Set();
  private eventHandlers: Map<string, EventHandlerType<SCG>> = new Map();
  private eventHandlerOverrides: Map<string, EventHandlerOverrideType<SCG>> = new Map();
  private options: ChannelManagerOptions;

  constructor({
    client,
    eventHandlerOverrides = {},
    options = {},
  }: {
    client: StreamChat<SCG>;
    eventHandlerOverrides?: ChannelManagerEventHandlerOverrides<SCG>;
    options?: ChannelManagerOptions;
  }) {
    this.client = client;
    this.state = new StateStore<ChannelManagerState<SCG>>({
      channels: [],
      pagination: {
        isLoading: false,
        isLoadingNext: false,
        hasNext: false,
        filters: {},
        sort: {},
        options: { limit: 10, offset: 0 },
        stateOptions: {},
      },
      ready: false,
    });
    const truthyEventHandlerOverrides = Object.entries(eventHandlerOverrides).reduce<
      Partial<ChannelManagerEventHandlerOverrides<SCG>>
    >((acc, [key, value]) => {
      if (value) {
        acc[key as keyof ChannelManagerEventHandlerOverrides<SCG>] = value;
      }
      return acc;
    }, {});
    this.eventHandlerOverrides = new Map(
      Object.entries(truthyEventHandlerOverrides) as [string, EventHandlerOverrideType<SCG>][],
    );
    this.eventHandlers = new Map(
      Object.entries({
        channelDeletedHandler: this.channelDeletedHandler,
        channelHiddenHandler: this.channelHiddenHandler,
        channelVisibleHandler: this.channelVisibleHandler,
        channelUpdatedHandler: this.channelUpdatedHandler,
        newMessageHandler: this.newMessageHandler,
        notificationAddedToChannelHandler: this.notificationAddedToChannelHandler,
        notificationNewMessageHandler: this.notificationNewMessageHandler,
        notificationRemovedFromChannelHandler: this.notificationRemovedFromChannelHandler,
      }) as [string, EventHandlerType<SCG>][],
    );
    this.options = options;
  }

  public setChannels = (valueOrFactory: ChannelSetterParameterType<SCG>) => {
    const { channels: prevChannels } = this.state.getLatestValue();
    let newValue = valueOrFactory;
    if (newValue && typeof newValue === 'function') {
      newValue = newValue(prevChannels);
    }

    this.state.partialNext({ channels: newValue ? [...newValue] : newValue });
  };

  public queryChannels = async (
    filters: ChannelFilters<SCG>,
    sort: ChannelSort<SCG> = [],
    options: ChannelOptions = {},
    stateOptions: ChannelStateOptions = {},
  ) => {
    const { offset = 0, limit = 10 } = options;
    const {
      pagination: { isLoading },
    } = this.state.getLatestValue();

    if (isLoading) {
      return;
    }

    try {
      this.state.next((currentState) => ({
        ...currentState,
        pagination: {
          ...currentState.pagination,
          isLoading: true,
          isLoadingNext: false,
          filters,
          sort,
          options,
          stateOptions,
        },
      }));

      const channels = await this.client.queryChannels(filters, sort, options, stateOptions);
      const newOffset = offset + (channels?.length ?? 0);
      const newOptions = { ...options, offset: newOffset };
      const { pagination } = this.state.getLatestValue();

      this.state.partialNext({
        channels,
        pagination: {
          ...pagination,
          hasNext: (channels?.length ?? 0) >= limit,
          isLoading: false,
          options: newOptions,
        },
        ready: true,
      });
    } catch (error) {
      this.client.logger('error', (error as Error).message);
      this.state.next((currentState) => ({
        ...currentState,
        pagination: { ...currentState.pagination, isLoading: false },
      }));
    }
  };

  public loadNext = async () => {
    const { pagination, channels } = this.state.getLatestValue();
    const { filters, sort, options, stateOptions, isLoadingNext, hasNext } = pagination;

    if (isLoadingNext || !hasNext) {
      return;
    }

    try {
      const { offset = 0, limit = 10 } = options;
      this.state.partialNext({
        pagination: { ...pagination, isLoading: false, isLoadingNext: true },
      });
      const nextChannels = await this.client.queryChannels(filters, sort, options, stateOptions);
      const newOffset = offset + (nextChannels?.length ?? 0);
      const newOptions = { ...options, offset: newOffset };

      this.state.partialNext({
        channels: [...(channels || []), ...nextChannels],
        pagination: {
          ...pagination,
          hasNext: (channels?.length ?? 0) >= limit,
          isLoading: false,
          isLoadingNext: false,
          options: newOptions,
        },
      });
    } catch (error) {
      this.client.logger('error', (error as Error).message);
      this.state.next((currentState) => ({
        ...currentState,
        pagination: { ...currentState.pagination, isLoadingNext: false },
      }));
    }
  };

  private notificationAddedToChannelHandler = async (event: Event<SCG>) => {
    const { id, type, members } = event?.channel ?? {};
    if (type) {
      const channel = await getAndWatchChannel({
        client: this.client,
        id,
        members: members?.reduce<string[]>((acc, { user, user_id }) => {
          const userId = user_id || user?.id;
          if (userId) {
            acc.push(userId);
          }
          return acc;
        }, []),
        type,
      });
      const { channels } = this.state.getLatestValue();
      this.state.partialNext({
        channels: channels ? [channel, ...channels.filter((c) => channel.cid !== c.cid)] : channels,
      });
    }
  };

  private channelDeletedHandler = (event: Event<SCG>) => {
    const { channels } = this.state.getLatestValue();
    if (!channels) return;
    this.state.partialNext({
      channels: channels.filter((c) => c.cid !== (event.cid || event.channel?.cid)),
    });
  };
  private channelHiddenHandler = this.channelDeletedHandler;

  private channelUpdatedHandler = (event: Event<SCG>) => {
    const { channels } = this.state.getLatestValue();
    if (!channels) return channels;

    const index = channels.findIndex((channel) => channel.cid === (event.cid || event.channel?.cid));
    if (index >= 0 && event.channel) {
      channels[index].data = {
        ...event.channel,
        hidden: event.channel?.hidden ?? channels[index].data?.hidden,
        own_capabilities: event.channel?.own_capabilities ?? channels[index].data?.own_capabilities,
      };
    }

    this.state.partialNext({ channels: [...channels] });
  };

  private newMessageHandler = (event: Event<SCG>) => {
    const { channels } = this.state.getLatestValue();
    if (!channels) return;
    const channelInList = channels.filter((channel) => channel.cid === event.cid).length > 0;

    if (!channelInList && event?.channel?.type && event?.channel?.id) {
      // If channel doesn't exist in existing list, check in activeChannels as well.
      // It may happen that channel was hidden using channel.hide(). In that case
      // We remove it from `channels` state, but it's still being watched and exists in client.activeChannels.
      const channel = this.client.channel(event.channel.type, event?.channel?.id);
      this.state.partialNext({ channels: [channel, ...channels] });
      return;
    }

    if (!this.options.lockChannelOrder && event.cid) {
      const channelIndex = channels.findIndex((c) => c.cid === event.cid);
      this.state.partialNext({ channels: [channels[channelIndex], ...channels.filter((c) => c.cid !== event.cid)] });
    }
  };

  private notificationNewMessageHandler = async (event: Event<SCG>) => {
    const { id, type } = event?.channel ?? {};

    if (id && type) {
      const channel = await getAndWatchChannel({
        client: this.client,
        id,
        type,
      });
      const { channels } = this.state.getLatestValue();
      this.state.partialNext({ channels: [channel, ...channels.filter((c) => c.cid !== event.cid)] });
    }
  };

  private channelVisibleHandler = this.notificationNewMessageHandler;

  private notificationRemovedFromChannelHandler = this.channelDeletedHandler;

  private subscriptionOrOverride = (event: Event<SCG>) => {
    const handlerName = eventToHandlerMapping[event.type as ChannelManagerEventTypes];
    const defaultEventHandler = this.eventHandlers.get(handlerName);
    const eventHandlerOverride = this.eventHandlerOverrides.get(handlerName);
    if (eventHandlerOverride && typeof eventHandlerOverride === 'function') {
      eventHandlerOverride(this.setChannels, event);
      return;
    }

    if (defaultEventHandler && typeof defaultEventHandler === 'function') {
      defaultEventHandler(event);
    }
  };

  private memberUpdatedHandler = (event: Event<SCG>) => {
    const { pagination, channels } = this.state.getLatestValue();
    const { filters, sort } = pagination;
    if (!event.member?.user || event.member.user.id !== this.client.userID || !event.channel_type) {
      return;
    }
    const channelType = event.channel_type;
    const channelId = event.channel_id;

    const considerPinnedChannels = shouldConsiderPinnedChannels(sort);
    const considerArchivedChannels = shouldConsiderArchivedChannels(filters);
    const pinnedAtSort = findPinnedAtSortOrder({ sort });

    if (!channels) {
      return;
    }

    const targetChannel = this.client.channel(channelType, channelId);
    // assumes that channel instances are not changing
    const targetChannelIndex = channels.indexOf(targetChannel);
    const targetChannelExistsWithinList = targetChannelIndex >= 0;

    const isTargetChannelPinned = isChannelPinned(targetChannel);
    const isTargetChannelArchived = isChannelArchived(targetChannel);

    if (!considerPinnedChannels || this.options.lockChannelOrder) {
      return;
    }

    const newChannels = [...channels];

    if (targetChannelExistsWithinList) {
      newChannels.splice(targetChannelIndex, 1);
    }

    // handle archiving (remove channel)
    if (
      // When archived filter true, and channel is unarchived
      (considerArchivedChannels && !isTargetChannelArchived && filters?.archived) ||
      // When archived filter false, and channel is archived
      (considerArchivedChannels && isTargetChannelArchived && !filters?.archived)
    ) {
      this.state.partialNext({ channels: newChannels });
      return;
    }

    // handle pinning
    let lastPinnedChannelIndex: number | null = null;

    if (pinnedAtSort === 1 || (pinnedAtSort === -1 && !isTargetChannelPinned)) {
      lastPinnedChannelIndex = findLastPinnedChannelIndex({ channels: newChannels });
    }
    const newTargetChannelIndex = typeof lastPinnedChannelIndex === 'number' ? lastPinnedChannelIndex + 1 : 0;

    // skip state update if the position of the channel does not change
    if (channels[newTargetChannelIndex] === targetChannel) {
      return;
    }

    newChannels.splice(newTargetChannelIndex, 0, targetChannel);
    this.state.partialNext({ channels: newChannels });
  };

  public registerSubscriptions = () => {
    if (this.unsubscribeFunctions.size) {
      // Already listening for events and changes
      return;
    }

    for (const eventType of eventTypes) {
      this.unsubscribeFunctions.add(this.client.on(eventType, this.subscriptionOrOverride).unsubscribe);
    }
  };

  public unregisterSubscriptions = () => {
    this.unsubscribeFunctions.forEach((cleanupFunction) => cleanupFunction());
    this.unsubscribeFunctions.clear();
  };
}
