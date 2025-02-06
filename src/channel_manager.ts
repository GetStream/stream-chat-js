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
  extractSortValue,
  findLastPinnedChannelIndex,
  getAndWatchChannel,
  isChannelArchived,
  isChannelPinned,
  moveChannelUpwards,
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
  | 'channel.visible';

export type ChannelManagerEventHandlerNames =
  | 'channelDeletedHandler'
  | 'channelHiddenHandler'
  | 'channelTruncatedHandler'
  | 'channelVisibleHandler'
  | 'newMessageHandler'
  | 'memberUpdatedHandler'
  | 'notificationAddedToChannelHandler'
  | 'notificationNewMessageHandler'
  | 'notificationRemovedFromChannelHandler';

export type ChannelManagerEventHandlerOverrides<SCG extends ExtendableGenerics = DefaultGenerics> = Partial<
  Record<ChannelManagerEventHandlerNames, EventHandlerOverrideType<SCG>>
>;

export const channelManagerEventToHandlerMapping: { [key in ChannelManagerEventTypes]: ChannelManagerEventHandlerNames } = {
  'channel.deleted': 'channelDeletedHandler',
  'channel.hidden': 'channelHiddenHandler',
  'channel.truncated': 'channelTruncatedHandler',
  'channel.visible': 'channelVisibleHandler',
  'message.new': 'newMessageHandler',
  'member.updated': 'memberUpdatedHandler',
  'notification.added_to_channel': 'notificationAddedToChannelHandler',
  'notification.message_new': 'notificationNewMessageHandler',
  'notification.removed_from_channel': 'notificationRemovedFromChannelHandler',
};

export type ChannelManagerOptions = {
  allowNewMessagesFromUnfilteredChannels?: boolean;
  lockChannelOrder?: boolean;
};

export const DEFAULT_CHANNEL_MANAGER_OPTIONS = {
  allowNewMessagesFromUnfilteredChannels: true,
  lockChannelOrder: false,
};

export class ChannelManager<SCG extends ExtendableGenerics = DefaultGenerics> {
  public readonly state: StateStore<ChannelManagerState<SCG>>;
  private client: StreamChat<SCG>;
  private unsubscribeFunctions: Set<() => void> = new Set();
  private eventHandlers: Map<string, EventHandlerType<SCG>> = new Map();
  private eventHandlerOverrides: Map<string, EventHandlerOverrideType<SCG>> = new Map();
  private options: ChannelManagerOptions = {};
  private stateOptions: ChannelStateOptions = {};

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
      },
      ready: false,
    });
    this.setEventHandlerOverrides(eventHandlerOverrides);
    this.setOptions(options);
    this.eventHandlers = new Map(
      Object.entries({
        channelDeletedHandler: this.channelDeletedHandler,
        channelHiddenHandler: this.channelHiddenHandler,
        channelVisibleHandler: this.channelVisibleHandler,
        memberUpdatedHandler: this.memberUpdatedHandler,
        newMessageHandler: this.newMessageHandler,
        notificationAddedToChannelHandler: this.notificationAddedToChannelHandler,
        notificationNewMessageHandler: this.notificationNewMessageHandler,
        notificationRemovedFromChannelHandler: this.notificationRemovedFromChannelHandler,
      }) as [string, EventHandlerType<SCG>][],
    );
  }

  public setChannels = (valueOrFactory: ChannelSetterParameterType<SCG>) => {
    this.state.next((current) => {
      const { channels: prevChannels } = current;
      let newValue = valueOrFactory;
      if (newValue && typeof newValue === 'function') {
        newValue = newValue(prevChannels);
      }

      // If the references between the two values are the same, just return the
      // current state; otherwise trigger a state change.
      if (prevChannels === newValue) {
        return current;
      }
      return { ...current, channels: newValue };
    });
  };

  public setEventHandlerOverrides = (eventHandlerOverrides: ChannelManagerEventHandlerOverrides<SCG> = {}) => {
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
  };

  public setOptions = (options: ChannelManagerOptions = {}) => {
    this.options = { ...DEFAULT_CHANNEL_MANAGER_OPTIONS, ...options };
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
      this.stateOptions = stateOptions;
      this.state.next((currentState) => ({
        ...currentState,
        pagination: {
          ...currentState.pagination,
          isLoading: true,
          isLoadingNext: false,
          filters,
          sort,
          options,
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
      throw error;
    }
  };

  public loadNext = async () => {
    const { pagination, channels } = this.state.getLatestValue();
    const { filters, sort, options, isLoadingNext, hasNext } = pagination;

    if (isLoadingNext || !hasNext) {
      return;
    }

    try {
      const { offset = 0, limit = 10 } = options;
      this.state.partialNext({
        pagination: { ...pagination, isLoading: false, isLoadingNext: true },
      });
      const nextChannels = await this.client.queryChannels(filters, sort, options, this.stateOptions);
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
      throw error;
    }
  };

  private notificationAddedToChannelHandler = async (event: Event<SCG>) => {
    const { id, type, members } = event?.channel ?? {};
    if (type && this.options.allowNewMessagesFromUnfilteredChannels) {
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
      const { pagination, channels } = this.state.getLatestValue();
      if (!channels) {
        return;
      }

      const { sort } = pagination ?? {};

      this.setChannels(
        moveChannelUpwards({
          channels,
          channelToMove: channel,
          sort,
        }),
      );
    }
  };

  private channelDeletedHandler = (event: Event<SCG>) => {
    const { channels } = this.state.getLatestValue();
    if (!channels) {
      return;
    }

    const newChannels = [...channels];
    const channelIndex = newChannels.findIndex((channel) => channel.cid === (event.cid || event.channel?.cid));

    if (channelIndex < 0) {
      return;
    }

    newChannels.splice(channelIndex, 1);
    this.setChannels(newChannels);
  };

  private channelHiddenHandler = this.channelDeletedHandler;

  private newMessageHandler = (event: Event<SCG>) => {
    const { pagination, channels } = this.state.getLatestValue();
    if (!channels) {
      return;
    }
    const { filters, sort } = pagination ?? {};

    const channelType = event.channel_type;
    const channelId = event.channel_id;

    if (channelType && channelId) {
      const targetChannel = this.client.channel(channelType, channelId);
      const targetChannelIndex = channels.indexOf(targetChannel);
      const targetChannelExistsWithinList = targetChannelIndex >= 0;

      const isTargetChannelPinned = isChannelPinned(targetChannel);
      const isTargetChannelArchived = isChannelArchived(targetChannel);

      const considerArchivedChannels = shouldConsiderArchivedChannels(filters);
      const considerPinnedChannels = shouldConsiderPinnedChannels(sort);

      if (
        // filter is defined, target channel is archived and filter option is set to false
        (considerArchivedChannels && isTargetChannelArchived && !filters.archived) ||
        // filter is defined, target channel isn't archived and filter option is set to true
        (considerArchivedChannels && !isTargetChannelArchived && filters.archived) ||
        // sort option is defined, target channel is pinned
        (considerPinnedChannels && isTargetChannelPinned) ||
        // list order is locked
        this.options.lockChannelOrder ||
        // target channel is not within the loaded list and loading from cache is disallowed
        (!targetChannelExistsWithinList && !this.options.allowNewMessagesFromUnfilteredChannels)
      ) {
        return;
      }

      this.setChannels(
        moveChannelUpwards({
          channels,
          channelToMove: targetChannel,
          channelToMoveIndexWithinChannels: targetChannelIndex,
          sort,
        }),
      );
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
      const { channels, pagination } = this.state.getLatestValue();
      const { filters, sort } = pagination ?? {};

      const considerArchivedChannels = shouldConsiderArchivedChannels(filters);
      if (isChannelArchived(channel) && considerArchivedChannels && !filters.archived) {
        return;
      }

      if (!this.options.allowNewMessagesFromUnfilteredChannels) {
        return;
      }

      this.setChannels(
        moveChannelUpwards({
          channels,
          channelToMove: channel,
          sort,
        }),
      );
    }
  };

  private channelVisibleHandler = async (event: Event<SCG>) => {
    const { channels, pagination } = this.state.getLatestValue();
    const { sort } = pagination ?? {};
    if (channels && event.channel_type && event.channel_id) {
      const channel = await getAndWatchChannel({
        client: this.client,
        id: event.channel_id,
        type: event.channel_type,
      });

      this.setChannels(
        moveChannelUpwards({
          channels,
          channelToMove: channel,
          sort,
        }),
      );
    }
  };

  private notificationRemovedFromChannelHandler = this.channelDeletedHandler;

  private memberUpdatedHandler = (event: Event<SCG>) => {
    const { pagination, channels } = this.state.getLatestValue();
    const { filters, sort } = pagination;
    if (
      !event.member?.user ||
      event.member.user.id !== this.client.userID ||
      !event.channel_type ||
      !event.channel_id
    ) {
      return;
    }
    const channelType = event.channel_type;
    const channelId = event.channel_id;

    const considerPinnedChannels = shouldConsiderPinnedChannels(sort);
    const considerArchivedChannels = shouldConsiderArchivedChannels(filters);
    const pinnedAtSort = extractSortValue({ atIndex: 0, sort, targetKey: 'pinned_at' });

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
      this.setChannels(newChannels);
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
    this.setChannels(newChannels);
  };

  private subscriptionOrOverride = (event: Event<SCG>) => {
    const handlerName = channelManagerEventToHandlerMapping[event.type as ChannelManagerEventTypes];
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

  public registerSubscriptions = () => {
    if (this.unsubscribeFunctions.size) {
      // Already listening for events and changes
      return;
    }

    for (const eventType of Object.keys(channelManagerEventToHandlerMapping)) {
      this.unsubscribeFunctions.add(this.client.on(eventType, this.subscriptionOrOverride).unsubscribe);
    }
  };

  public unregisterSubscriptions = () => {
    this.unsubscribeFunctions.forEach((cleanupFunction) => cleanupFunction());
    this.unsubscribeFunctions.clear();
  };
}
