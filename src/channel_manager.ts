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
import { StateStore, ValueOrPatch, isPatch } from './store';
import { Channel } from './channel';
import {
  extractSortValue,
  findLastPinnedChannelIndex,
  getAndWatchChannel,
  isChannelArchived,
  isChannelPinned,
  promoteChannel,
  shouldConsiderArchivedChannels,
  shouldConsiderPinnedChannels,
  uniqBy,
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
  /**
   * This value will become true the first time queryChannels is successfully executed and
   * will remain false otherwise. It's used as a control property regarding whether the list
   * has been initialized yet (i.e a query has already been done at least once) or not. We do
   * this to prevent state.channels from being forced to be nullable.
   */
  initialized: boolean;
  pagination: ChannelManagerPagination<SCG>;
};

export type ChannelSetterParameterType<SCG extends ExtendableGenerics = DefaultGenerics> = ValueOrPatch<
  ChannelManagerState<SCG>['channels']
>;
export type ChannelSetterType<SCG extends ExtendableGenerics = DefaultGenerics> = (
  arg: ChannelSetterParameterType<SCG>,
) => void;

export type GenericEventHandlerType<T extends unknown[]> = (
  ...args: T
) => void | (() => void) | ((...args: T) => Promise<void>) | Promise<void>;
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

export const channelManagerEventToHandlerMapping: {
  [key in ChannelManagerEventTypes]: ChannelManagerEventHandlerNames;
} = {
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
  /**
   * Aborts a channels query that is already in progress and runs the new one.
   */
  abortInFlightQuery?: boolean;
  /**
   * Allows channel promotion to be applied where applicable for channels that are
   * currently not part of the channel list within the state. A good example of
   * this would be a channel that is being watched and it receives a new message,
   * but is not part of the list initially.
   */
  allowNotLoadedChannelPromotionForEvent?: {
    'channel.visible': boolean;
    'message.new': boolean;
    'notification.added_to_channel': boolean;
    'notification.message_new': boolean;
  };
  /**
   * Allows us to lock the order of channels within the list. Any event that would
   * change the order of channels within the list will do nothing.
   */
  lockChannelOrder?: boolean;
};

export const DEFAULT_CHANNEL_MANAGER_OPTIONS = {
  abortInFlightQuery: false,
  allowNotLoadedChannelPromotionForEvent: {
    'channel.visible': true,
    'message.new': true,
    'notification.added_to_channel': true,
    'notification.message_new': true,
  },
  lockChannelOrder: false,
};

export const DEFAULT_CHANNEL_MANAGER_PAGINATION_OPTIONS = {
  limit: 10,
  offset: 0,
};

/**
 * A class that manages a list of channels and changes it based on configuration and WS events. The
 * list of channels is reactive as well as the pagination and it can be subscribed to for state updates.
 *
 * @internal
 */
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
        options: DEFAULT_CHANNEL_MANAGER_PAGINATION_OPTIONS,
      },
      initialized: false,
    });
    this.setEventHandlerOverrides(eventHandlerOverrides);
    this.setOptions(options);
    this.eventHandlers = new Map(
      Object.entries<EventHandlerType<SCG>>({
        channelDeletedHandler: this.channelDeletedHandler,
        channelHiddenHandler: this.channelHiddenHandler,
        channelVisibleHandler: this.channelVisibleHandler,
        memberUpdatedHandler: this.memberUpdatedHandler,
        newMessageHandler: this.newMessageHandler,
        notificationAddedToChannelHandler: this.notificationAddedToChannelHandler,
        notificationNewMessageHandler: this.notificationNewMessageHandler,
        notificationRemovedFromChannelHandler: this.notificationRemovedFromChannelHandler,
      }),
    );
  }

  public setChannels = (valueOrFactory: ChannelSetterParameterType<SCG>) => {
    this.state.next((current) => {
      const { channels: currentChannels } = current;
      const newChannels = isPatch(valueOrFactory) ? valueOrFactory(currentChannels) : valueOrFactory;

      // If the references between the two values are the same, just return the
      // current state; otherwise trigger a state change.
      if (currentChannels === newChannels) {
        return current;
      }
      return { ...current, channels: newChannels };
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
    this.eventHandlerOverrides = new Map(Object.entries<EventHandlerOverrideType<SCG>>(truthyEventHandlerOverrides));
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
    const { offset, limit } = { ...DEFAULT_CHANNEL_MANAGER_PAGINATION_OPTIONS, ...options };
    const {
      pagination: { isLoading },
    } = this.state.getLatestValue();

    if (isLoading && !this.options.abortInFlightQuery) {
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
        initialized: true,
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
    const { pagination, initialized } = this.state.getLatestValue();
    const { filters, sort, options, isLoadingNext, hasNext } = pagination;

    if (!initialized || isLoadingNext || !hasNext) {
      return;
    }

    try {
      const { offset, limit } = { ...DEFAULT_CHANNEL_MANAGER_PAGINATION_OPTIONS, ...options };
      this.state.partialNext({
        pagination: { ...pagination, isLoading: false, isLoadingNext: true },
      });
      const nextChannels = await this.client.queryChannels(filters, sort, options, this.stateOptions);
      const { channels } = this.state.getLatestValue();
      const newOffset = offset + (nextChannels?.length ?? 0);
      const newOptions = { ...options, offset: newOffset };

      this.state.partialNext({
        channels: uniqBy<Channel<SCG>>([...(channels || []), ...nextChannels], 'cid'),
        pagination: {
          ...pagination,
          hasNext: (nextChannels?.length ?? 0) >= limit,
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

    if (!type || !this.options.allowNotLoadedChannelPromotionForEvent?.['notification.added_to_channel']) {
      return;
    }

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
      promoteChannel({
        channels,
        channelToMove: channel,
        sort,
      }),
    );
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

    if (!channelType || !channelId) {
      return;
    }

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
      (!targetChannelExistsWithinList && !this.options.allowNotLoadedChannelPromotionForEvent?.['message.new'])
    ) {
      return;
    }

    this.setChannels(
      promoteChannel({
        channels,
        channelToMove: targetChannel,
        channelToMoveIndexWithinChannels: targetChannelIndex,
        sort,
      }),
    );
  };

  private notificationNewMessageHandler = async (event: Event<SCG>) => {
    const { id, type } = event?.channel ?? {};

    if (!id || !type) {
      return;
    }

    const channel = await getAndWatchChannel({
      client: this.client,
      id,
      type,
    });

    const { channels, pagination } = this.state.getLatestValue();
    const { filters, sort } = pagination ?? {};

    const considerArchivedChannels = shouldConsiderArchivedChannels(filters);
    const isTargetChannelArchived = isChannelArchived(channel);

    if (
      !channels ||
      (considerArchivedChannels && isTargetChannelArchived && !filters.archived) ||
      (considerArchivedChannels && !isTargetChannelArchived && filters.archived) ||
      !this.options.allowNotLoadedChannelPromotionForEvent?.['notification.message_new']
    ) {
      return;
    }

    this.setChannels(
      promoteChannel({
        channels,
        channelToMove: channel,
        sort,
      }),
    );
  };

  private channelVisibleHandler = async (event: Event<SCG>) => {
    const { channel_type: channelType, channel_id: channelId } = event;

    if (!channelType || !channelId) {
      return;
    }

    const channel = await getAndWatchChannel({
      client: this.client,
      id: event.channel_id,
      type: event.channel_type,
    });

    const { channels, pagination } = this.state.getLatestValue();
    const { sort, filters } = pagination ?? {};

    const considerArchivedChannels = shouldConsiderArchivedChannels(filters);
    const isTargetChannelArchived = isChannelArchived(channel);

    if (
      !channels ||
      (considerArchivedChannels && isTargetChannelArchived && !filters.archived) ||
      (considerArchivedChannels && !isTargetChannelArchived && filters.archived) ||
      !this.options.allowNotLoadedChannelPromotionForEvent?.['channel.visible']
    ) {
      return;
    }

    this.setChannels(
      promoteChannel({
        channels,
        channelToMove: channel,
        sort,
      }),
    );
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

    if (!channels || (!considerPinnedChannels && !considerArchivedChannels) || this.options.lockChannelOrder) {
      return;
    }

    const targetChannel = this.client.channel(channelType, channelId);
    // assumes that channel instances are not changing
    const targetChannelIndex = channels.indexOf(targetChannel);
    const targetChannelExistsWithinList = targetChannelIndex >= 0;

    const isTargetChannelPinned = isChannelPinned(targetChannel);
    const isTargetChannelArchived = isChannelArchived(targetChannel);

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
