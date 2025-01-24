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

export type ChannelManagerPagination<SCG extends ExtendableGenerics = DefaultGenerics> = {
  filters: ChannelFilters<SCG>;
  hasNext: boolean;
  isLoading: boolean;
  isLoadingNext: boolean;
  options: ChannelOptions;
  sort: ChannelSort<SCG>;
  stateOptions: ChannelStateOptions;
  // nextCursor: string | null;
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
  | 'channel.deleted'
  | 'channel.hidden'
  | 'channel.truncated'
  | 'channel.visible'
  | 'channel.updated'
  | 'user.presence.changed'
  | 'user.updated';

export type ChannelManagerEventHandlerNames =
  | 'channelDeletedHandler'
  | 'channelHiddenHandler'
  | 'channelTruncatedHandler'
  | 'channelVisibleHandler'
  | 'channelUpdatedHandler'
  | 'newMessageHandler'
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
  'notification.added_to_channel': 'notificationAddedToChannelHandler',
  'notification.message_new': 'notificationNewMessageHandler',
  'notification.removed_from_channel': 'notificationRemovedFromChannelHandler',
  'user.presence.changed': 'userPresenceHandler',
  'user.updated': 'userPresenceHandler',
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
        channelTruncatedHandler: this.channelTruncatedHandler,
        channelVisibleHandler: this.channelVisibleHandler,
        channelUpdatedHandler: this.channelUpdatedHandler,
        newMessageHandler: this.newMessageHandler,
        notificationAddedToChannelHandler: this.notificationAddedToChannelHandler,
        notificationNewMessageHandler: this.notificationNewMessageHandler,
        notificationRemovedFromChannelHandler: this.notificationRemovedFromChannelHandler,
        userPresenceHandler: this.userPresenceHandler,
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
    const { id, type } = event?.channel ?? {};
    if (id && type) {
      const channel = this.client.channel(type, id);
      await channel.watch();
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

  // TODO: This is currently used like so because of the fact that
  //       the channel.state is not yet reactive. When it does become
  //       reactive, we can let the channels themselves handle this
  //       behaviour.
  private channelTruncatedHandler = () => {
    const { channels } = this.state.getLatestValue();
    if (!channels) return;
    this.state.partialNext({
      channels: [...channels],
    });
  };

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

  private channelVisibleHandler = this.notificationAddedToChannelHandler;

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

  private notificationNewMessageHandler = this.notificationAddedToChannelHandler;

  private notificationRemovedFromChannelHandler = this.channelDeletedHandler;

  // TODO: This doesn't belong here nor does it trigger rerenders properly due to the fact
  //       that channels are not reactive. Needless to say, it doesn't work properly.
  private userPresenceHandler = (event: Event<SCG>) => {
    const { channels } = this.state.getLatestValue();
    if (!channels) return channels;

    const newChannels = channels.map((channel) => {
      if (!event.user?.id || !channel.state.members[event.user.id]) {
        return channel;
      }
      const newChannel = channel;
      newChannel.state.members[event.user.id].user = event.user;
      return newChannel;
    });

    this.state.partialNext({ channels: [...newChannels] });
  };

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
