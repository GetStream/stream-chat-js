import type { StreamChat } from './client';
import type { DefaultGenerics, EventTypes, ExtendableGenerics } from './types';
import { ChannelOptions, ChannelStateOptions, ChannelFilters, ChannelSort } from './types';
import { StateStore } from './store';
import { Channel } from './channel';
import type { Event } from '../dist/types';

export type ChannelManagerPagination<SCG extends ExtendableGenerics = DefaultGenerics> = {
  filters: ChannelFilters<SCG>;
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
export type ChannelSetterParameterType<SCG extends ExtendableGenerics = DefaultGenerics> = SetterParameterType<ChannelManagerState<SCG>['channels']>;
export type ChannelSetterType<SCG extends ExtendableGenerics = DefaultGenerics> = (arg: ChannelSetterParameterType<SCG>) => void

// TODO: Figure out a better way to infer a generic handler type here
export type GenericEventHandlerType<T extends unknown[]> = (...args: T) => void | (() => void) | ((...args: T) => Promise<void>);
export type EventHandlerType<SCG extends ExtendableGenerics = DefaultGenerics> = GenericEventHandlerType<[Event<SCG>]>;
export type EventHandlerOverrideType<SCG extends ExtendableGenerics = DefaultGenerics> = GenericEventHandlerType<[ChannelSetterType<SCG>, Event<SCG>]>

export type ChannelEventHandlerOverrides<SCG extends ExtendableGenerics = DefaultGenerics> = Partial<
  Record<
    | 'channelDeletedHandler'
    | 'channelHiddenHandler'
    | 'channelTruncatedHandler'
    | 'channelVisibleHandler'
    | 'newMessageHandler'
    | 'notificationAddedToChannelHandler'
    | 'notificationNewMessageHandler'
    | 'notificationRemovedFromChannelHandler'
    | 'userPresenceHandler',
    EventHandlerOverrideType<SCG>
  >
>;

export class ChannelManager<SCG extends ExtendableGenerics = DefaultGenerics> {
  public readonly state: StateStore<ChannelManagerState<SCG>>;
  private client: StreamChat<SCG>;
  private unsubscribeFunctions: Set<() => void> = new Set();
  private eventHandlers: Map<string, EventHandlerType<SCG>> = new Map();
  private eventHandlerOverrides: Map<string, EventHandlerOverrideType<SCG>> = new Map();

  constructor({ client, eventHandlerOverrides = {} }: { client: StreamChat<SCG>; eventHandlerOverrides?: ChannelEventHandlerOverrides<SCG> }) {
    this.client = client;
    this.state = new StateStore<ChannelManagerState<SCG>>({
      channels: [],
      ready: true,
      pagination: {
        isLoading: false,
        isLoadingNext: false,
        // nextCursor: null,
        filters: {},
        sort: {},
        options: { limit: 10, offset: 0 },
        stateOptions: {},
      },
    });
    const truthyEventHandlerOverrides = Object.entries(eventHandlerOverrides).reduce<Partial<ChannelEventHandlerOverrides<SCG>>>((acc, [key, value]) => {
      if (value) {
        acc[key as keyof ChannelEventHandlerOverrides<SCG>] = value;
      }
      return acc;
    }, {});
    this.eventHandlerOverrides = new Map(Object.entries(truthyEventHandlerOverrides) as [string, EventHandlerOverrideType<SCG>][]);
    this.eventHandlers = new Map(
      Object.entries({
        channelDeletedHandler: this.channelDeletedHandler,
        channelHiddenHandler: this.channelHiddenHandler,
        channelTruncatedHandler: this.channelTruncatedHandler,
        channelVisibleHandler: this.channelVisibleHandler,
        newMessageHandler: this.newMessageHandler,
        notificationAddedToChannelHandler: this.notificationAddedToChannelHandler,
        notificationNewMessageHandler: this.notificationNewMessageHandler,
        notificationRemovedFromChannelHandler: this.notificationRemovedFromChannelHandler,
        userPresenceHandler: this.userPresenceHandler,
      }) as [string, EventHandlerType<SCG>][],
    );
  }

  public setChannels = (valueOrFactory: ChannelSetterParameterType<SCG>) => {
    const { channels: prevChannels } = this.state.getLatestValue();
    let newValue = valueOrFactory;
    if (newValue && typeof newValue === 'function') {
      newValue = newValue(prevChannels);
    }

    this.state.partialNext({ channels: newValue });
  }

  public queryChannels = async (
    filters: ChannelFilters<SCG>,
    sort: ChannelSort<SCG> = [],
    options: ChannelOptions = {},
    stateOptions: ChannelStateOptions = {},
  ) => {
    const { offset = 0 } = options;
    this.state.partialNext({
      pagination: { isLoading: true, isLoadingNext: false, filters, sort, options, stateOptions },
    });

    const channels = await this.client.queryChannels(filters, sort, options, stateOptions);
    const newOffset = offset + (channels?.length ?? 0);
    const newOptions = { ...options, offset: newOffset };
    const { pagination } = this.state.getLatestValue();

    this.state.partialNext({
      channels,
      pagination: {
        ...pagination,
        isLoading: false,
        options: newOptions,
      },
    });
  };

  public loadNext = async () => {
    const { pagination } = this.state.getLatestValue();
    const { filters, sort, options, stateOptions } = pagination;
    const { offset = 0 } = options;
    const { channels } = this.state.getLatestValue();
    this.state.partialNext({
      pagination: { ...pagination, isLoading: false, isLoadingNext: true },
    });
    const nextChannels = await this.client.queryChannels(filters, sort, options, stateOptions);
    const newOffset = offset + (nextChannels?.length ?? 0);
    const newOptions = { ...options, offset: newOffset };

    this.state.partialNext({
      channels: [...channels, ...nextChannels],
      pagination: {
        ...pagination,
        isLoading: false,
        isLoadingNext: false,
        options: newOptions,
      },
    });
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
      channels: channels.filter((c) => c.cid === (event.cid || event.channel?.cid)),
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
      // We remove it from `channels` state, but its still being watched and exists in client.activeChannels.
      const channel = this.client.channel(event.channel.type, event?.channel?.id);
      this.state.partialNext({ channels: [channel, ...channels] });
      return;
    }

    // FIXME: Propagate this through overrides
    const lockChannelOrder = false;

    if (!lockChannelOrder && event.cid) {
      const channelIndex = channels.findIndex((c) => c.cid === event.cid);
      this.state.partialNext({ channels: [channels[channelIndex], ...channels.filter((c) => c.cid !== event.cid)] });
    }
  };

  private notificationNewMessageHandler = this.notificationAddedToChannelHandler;

  private notificationRemovedFromChannelHandler = this.channelDeletedHandler;

  private userPresenceHandler = (event: Event<SCG>) => {
    const { channels } = this.state.getLatestValue();
    if (!channels) return channels;

    const newChannels = channels.map((channel) => {
      if (!event.user?.id || !channel.state.members[event.user.id]) {
        return channel;
      }
      channel.state.members[event.user.id].user = event.user;
      return channel;
    });

    this.state.partialNext({ channels: [...newChannels] });
  };

  private subscriptionOrOverride = (event: Event<SCG>) => {
    const eventToHandlerMapping = {
      'channel.deleted': 'channelDeletedHandler',
      'channel.hidden': 'channelHiddenHandler',
      'channel.truncated': 'channelTruncatedHandler',
      'channel.visible': 'channelVisibleHandler',
      'message.new': 'newMessageHandler',
      'notification.added_to_channel': 'notificationAddedToChannelHandler',
      'notification.message_new': 'notificationNewMessageHandler',
      'notification.removed_from_channel': 'notificationRemovedFromChannelHandler',
      'user.presence.changed': 'userPresenceHandler',
      'user.updated': 'userPresenceHandler',
    };
    const handlerName = eventToHandlerMapping[event.type];
    const defaultEventHandler = this.eventHandlers.get(handlerName);
    const eventHandlerOverride = this.eventHandlerOverrides.get(handlerName);
    if (eventHandlerOverride && typeof eventHandlerOverride === 'function') {
      eventHandlerOverride(this.setChannels, event);
      return;
    }

    if (defaultEventHandler && typeof defaultEventHandler === 'function') {
      defaultEventHandler(event);
    }
  }

  public registerSubscriptions = () => {
    if (this.unsubscribeFunctions.size) {
      // Already listening for events and changes
      return;
    }

    const notificationAddedToChannelListener = this.client.on('notification.added_to_channel', this.subscriptionOrOverride).unsubscribe;

    this.unsubscribeFunctions.add(notificationAddedToChannelListener);
  };
}
