import sinon from 'sinon';
import {
  Channel,
  ChannelAPIResponse,
  ChannelManager,
  ChannelResponse,
  StreamChat,
  ChannelManagerOptions,
  DEFAULT_CHANNEL_MANAGER_OPTIONS,
  channelManagerEventToHandlerMapping,
  DEFAULT_CHANNEL_MANAGER_PAGINATION_OPTIONS,
  QueryChannelsRequestType,
} from '../../src';

import { generateChannel } from './test-utils/generateChannel';
import { getClientWithUser } from './test-utils/getClient';
import * as utils from '../../src/utils';

import { describe, beforeEach, afterEach, expect, it, vi, MockInstance } from 'vitest';
import { MockOfflineDB } from './offline-support/MockOfflineDB';
import { DEFAULT_QUERY_CHANNELS_RETRY_COUNT } from '../../src/constants';

describe('ChannelManager', () => {
  let client: StreamChat;
  let channelManager: ChannelManager;
  let channelsResponse: ChannelAPIResponse[];

  beforeEach(async () => {
    client = await getClientWithUser();
    channelManager = client.createChannelManager({});
    channelManager.registerSubscriptions();
    channelsResponse = [
      generateChannel({ channel: { id: 'channel1' } }),
      generateChannel({ channel: { id: 'channel2' } }),
      generateChannel({ channel: { id: 'channel3' } }),
    ];
    client.hydrateActiveChannels(channelsResponse);
    const channels = channelsResponse.map((c) =>
      client.channel(c.channel.type, c.channel.id),
    );
    channelManager.state.partialNext({ channels, initialized: true });
  });

  afterEach(() => {
    sinon.restore();
    sinon.reset();
  });

  describe('initialization', () => {
    let channelManager: ChannelManager;

    beforeEach(() => {
      channelManager = client.createChannelManager({});
    });

    afterEach(() => {
      sinon.restore();
      sinon.reset();
    });

    it('initializes properly', () => {
      const state = channelManager.state.getLatestValue();
      expect(state.channels).to.be.empty;
      expect(state.pagination).to.deep.equal({
        isLoading: false,
        isLoadingNext: false,
        hasNext: false,
        filters: {},
        sort: {},
        options: DEFAULT_CHANNEL_MANAGER_PAGINATION_OPTIONS,
      });
      expect(state.initialized).to.be.false;
    });

    it('should properly set eventHandlerOverrides, options and queryChannelsRequest if they are passed', async () => {
      const eventHandlerOverrides = {
        newMessageHandler: () => {},
      };
      const options = {
        allowNotLoadedChannelPromotionForEvent: {
          'channel.visible': false,
          'message.new': false,
          'notification.added_to_channel': false,
          'notification.message_new': false,
        },
      };
      const queryChannelsOverride = async () => {
        console.log('Called from override.');
        return new Promise<Channel[]>((resolve) => {
          resolve([]);
        });
      };
      const newChannelManager = client.createChannelManager({
        eventHandlerOverrides,
        options,
        queryChannelsOverride,
      });

      expect(
        Object.fromEntries((newChannelManager as any).eventHandlerOverrides),
      ).to.deep.equal(eventHandlerOverrides);
      expect((newChannelManager as any).options).to.deep.equal({
        ...DEFAULT_CHANNEL_MANAGER_OPTIONS,
        ...options,
      });

      const consoleLogSpy = vi.spyOn(console, 'log');
      await (newChannelManager as any).queryChannelsRequest({});
      expect(consoleLogSpy).toHaveBeenCalledWith('Called from override.');
    });

    it('should properly set the default event handlers', async () => {
      const {
        eventHandlers,
        channelDeletedHandler,
        channelHiddenHandler,
        channelVisibleHandler,
        memberUpdatedHandler,
        newMessageHandler,
        notificationAddedToChannelHandler,
        notificationNewMessageHandler,
        notificationRemovedFromChannelHandler,
      } = channelManager as any;

      expect(Object.fromEntries(eventHandlers)).to.deep.equal({
        channelDeletedHandler,
        channelHiddenHandler,
        channelVisibleHandler,
        memberUpdatedHandler,
        newMessageHandler,
        notificationAddedToChannelHandler,
        notificationNewMessageHandler,
        notificationRemovedFromChannelHandler,
      });

      const clientQueryChannelsSpy = vi
        .spyOn(client, 'queryChannels')
        .mockImplementation(async () => []);
      await (channelManager as any).queryChannelsRequest({});
      expect(clientQueryChannelsSpy).toHaveBeenCalledOnce();
    });
  });

  describe('setters', () => {
    it('should properly set eventHandlerOverrides and filter out falsy values', () => {
      const eventHandlerOverrides = {
        newMessageHandler: () => {},
        channelDeletedHandler: () => {},
      };

      channelManager.setEventHandlerOverrides(eventHandlerOverrides);
      expect(
        Object.fromEntries((channelManager as any).eventHandlerOverrides),
      ).to.deep.equal(eventHandlerOverrides);

      channelManager.setEventHandlerOverrides({
        ...eventHandlerOverrides,
        notificationRemovedFromChannelHandler: undefined,
        channelHiddenHandler: undefined,
      });
      expect(
        Object.fromEntries((channelManager as any).eventHandlerOverrides),
      ).to.deep.equal(eventHandlerOverrides);
    });

    it('should properly set queryChannelRequest', async () => {
      const queryChannelsOverride = async () => {
        console.log('Called from override.');
        return new Promise<Channel[]>((resolve) => {
          resolve([]);
        });
      };

      channelManager.setQueryChannelsRequest(queryChannelsOverride);

      const consoleLogSpy = vi.spyOn(console, 'log');
      await (channelManager as any).queryChannelsRequest({});
      expect(consoleLogSpy).toHaveBeenCalledWith('Called from override.');
    });

    it('should properly set options', () => {
      const options = {
        lockChannelOrder: true,
        allowNotLoadedChannelPromotionForEvent: {
          'channel.visible': false,
          'message.new': false,
          'notification.added_to_channel': true,
          'notification.message_new': true,
        },
        abortInFlightQuery: false,
      };
      channelManager.setOptions(options);

      expect((channelManager as any).options).to.deep.equal(options);
    });

    it('should respect option defaults if not explicitly provided', () => {
      const partialOptions1: ChannelManagerOptions = { lockChannelOrder: true };
      const partialOptions2: ChannelManagerOptions = {};

      channelManager.setOptions(partialOptions1);
      let options = (channelManager as any).options;
      Object.entries(DEFAULT_CHANNEL_MANAGER_OPTIONS).forEach(([k, val]) => {
        const key = k as keyof ChannelManagerOptions;
        const wantedValue = partialOptions1[key] ?? DEFAULT_CHANNEL_MANAGER_OPTIONS[key];
        expect(options[key]).to.deep.equal(wantedValue);
      });

      channelManager.setOptions(partialOptions2);
      options = (channelManager as any).options;
      Object.entries(DEFAULT_CHANNEL_MANAGER_OPTIONS).forEach(([k, val]) => {
        const key = k as keyof ChannelManagerOptions;
        const wantedValue = partialOptions2[key] ?? DEFAULT_CHANNEL_MANAGER_OPTIONS[key];
        expect(options[key]).to.deep.equal(wantedValue);
      });
    });

    describe('setChannels', () => {
      it('should properly set channels if a direct value is provided', () => {
        const { channels: prevChannels } = channelManager.state.getLatestValue();
        channelManager.setChannels(prevChannels.splice(1));

        const { channels: newChannels } = channelManager.state.getLatestValue();

        expect(newChannels.map((c) => c.id)).to.deep.equal(['channel2', 'channel3']);
      });

      it('should update the reference of state.channels if changed', () => {
        const { channels: prevChannels } = channelManager.state.getLatestValue();
        channelManager.setChannels([...prevChannels]);

        const { channels: newChannels } = channelManager.state.getLatestValue();

        expect(newChannels.map((c) => c.id)).to.deep.equal(prevChannels.map((c) => c.id));
        expect(newChannels).to.not.equal(prevChannels);
      });

      it('should use a factory function to calculate the new state if provided', () => {
        const { channels: prevChannels } = channelManager.state.getLatestValue();
        channelManager.setChannels((prevChannelsRef) => {
          expect(prevChannelsRef).to.equal(prevChannels);
          return prevChannelsRef.reverse();
        });

        const { channels: newChannels } = channelManager.state.getLatestValue();

        expect(newChannels.map((c) => c.id)).to.deep.equal([
          'channel3',
          'channel2',
          'channel1',
        ]);
      });

      it('should maintain referential integrity if the same channels are passed', () => {
        const { channels: prevChannels } = channelManager.state.getLatestValue();
        channelManager.setChannels(prevChannels);

        const { channels: newChannels } = channelManager.state.getLatestValue();

        expect(newChannels.map((c) => c.id)).to.deep.equal(prevChannels.map((c) => c.id));
        expect(newChannels).to.equal(prevChannels);
      });

      it('should maintain referential integrity from the setter factory as well', () => {
        const { channels: prevChannels } = channelManager.state.getLatestValue();
        channelManager.setChannels((prevChannelsRef) => {
          return prevChannelsRef;
        });

        const { channels: newChannels } = channelManager.state.getLatestValue();

        expect(newChannels.map((c) => c.id)).to.deep.equal(prevChannels.map((c) => c.id));
        expect(newChannels).to.equal(prevChannels);
      });
    });
  });

  describe('event subscriptions', () => {
    it('should only invoke event handlers if registerSubscriptions has been called', () => {
      const newChannelManager = client.createChannelManager({});

      const originalNewMessageHandler = (newChannelManager as any).eventHandlers.get(
        'newMessageHandler',
      );
      const originalNotificationAddedToChannelHandler = (
        newChannelManager as any
      ).eventHandlers.get('notificationAddedToChannelHandler');

      const newMessageHandlerSpy = sinon.spy(originalNewMessageHandler);
      const notificationAddedToChannelHandlerSpy = sinon.spy(
        originalNotificationAddedToChannelHandler,
      );
      const clientOnSpy = sinon.spy(client, 'on');

      (newChannelManager as any).eventHandlers.set(
        'newMessageHandler',
        newMessageHandlerSpy,
      );
      (newChannelManager as any).eventHandlers.set(
        'notificationAddedToChannelHandler',
        notificationAddedToChannelHandlerSpy,
      );

      client.dispatchEvent({ type: 'message.new' });
      client.dispatchEvent({ type: 'notification.added_to_channel' });

      expect(clientOnSpy.called).to.be.false;
      expect(newMessageHandlerSpy.called).to.be.false;
      expect(notificationAddedToChannelHandlerSpy.called).to.be.false;

      newChannelManager.registerSubscriptions();

      expect(clientOnSpy.called).to.be.true;

      client.dispatchEvent({ type: 'message.new' });
      client.dispatchEvent({ type: 'notification.added_to_channel' });

      expect(newMessageHandlerSpy.calledOnce).to.be.true;
      expect(notificationAddedToChannelHandlerSpy.calledOnce).to.be.true;
    });

    it('should register listeners to all configured event handlers and do it exactly once', () => {
      const clientOnSpy = sinon.spy(client, 'on');
      const newChannelManager = client.createChannelManager({});

      newChannelManager.registerSubscriptions();
      newChannelManager.registerSubscriptions();

      expect(clientOnSpy.callCount).to.equal(
        Object.keys(channelManagerEventToHandlerMapping).length,
      );
      Object.keys(channelManagerEventToHandlerMapping).forEach((eventType) => {
        expect(clientOnSpy.calledWith(eventType)).to.be.true;
      });
    });

    it('should unregister subscriptions if unregisterSubscriptions is called', () => {
      const newChannelManager = client.createChannelManager({});

      const originalNewMessageHandler = (newChannelManager as any).eventHandlers.get(
        'newMessageHandler',
      );
      const originalNotificationAddedToChannelHandler = (
        newChannelManager as any
      ).eventHandlers.get('notificationAddedToChannelHandler');

      const newMessageHandlerSpy = sinon.spy(originalNewMessageHandler);
      const notificationAddedToChannelHandlerSpy = sinon.spy(
        originalNotificationAddedToChannelHandler,
      );

      (newChannelManager as any).eventHandlers.set(
        'newMessageHandler',
        newMessageHandlerSpy,
      );
      (newChannelManager as any).eventHandlers.set(
        'notificationAddedToChannelHandler',
        notificationAddedToChannelHandlerSpy,
      );

      newChannelManager.registerSubscriptions();
      newChannelManager.unregisterSubscriptions();

      client.dispatchEvent({ type: 'message.new' });
      client.dispatchEvent({ type: 'notification.added_to_channel' });

      expect(newMessageHandlerSpy.called).to.be.false;
      expect(notificationAddedToChannelHandlerSpy.called).to.be.false;
    });

    it('should call overrides for event handlers if they exist', () => {
      const newChannelManager = client.createChannelManager({});

      const originalNewMessageHandler = (newChannelManager as any).eventHandlers.get(
        'newMessageHandler',
      );
      const originalNotificationAddedToChannelHandler = (
        newChannelManager as any
      ).eventHandlers.get('notificationAddedToChannelHandler');

      const newMessageHandlerSpy = sinon.spy(originalNewMessageHandler);
      const notificationAddedToChannelHandlerSpy = sinon.spy(
        originalNotificationAddedToChannelHandler,
      );
      const newMessageHandlerOverrideSpy = sinon.spy(() => {});

      (newChannelManager as any).eventHandlers.set(
        'newMessageHandler',
        newMessageHandlerSpy,
      );
      (newChannelManager as any).eventHandlers.set(
        'notificationAddedToChannelHandler',
        notificationAddedToChannelHandlerSpy,
      );

      newChannelManager.registerSubscriptions();
      newChannelManager.setEventHandlerOverrides({
        newMessageHandler: newMessageHandlerOverrideSpy,
      });

      client.dispatchEvent({ type: 'message.new' });
      client.dispatchEvent({ type: 'notification.added_to_channel' });

      expect(newMessageHandlerSpy.called).to.be.false;
      expect(newMessageHandlerOverrideSpy.called).to.be.true;
      expect(notificationAddedToChannelHandlerSpy.called).to.be.true;
    });
  });

  it('should call channel.updated event handler override', () => {
    const spy = sinon.spy(() => {});
    channelManager.setEventHandlerOverrides({ channelUpdatedHandler: spy });
    spy.resetHistory();

    client.dispatchEvent({ type: 'channel.updated' });

    expect(spy.callCount).to.be.equal(1);
  });

  it('should call channel.truncated event handler override', () => {
    const spy = sinon.spy(() => {});
    channelManager.setEventHandlerOverrides({ channelTruncatedHandler: spy });
    spy.resetHistory();

    client.dispatchEvent({ type: 'channel.truncated' });

    expect(spy.callCount).to.be.equal(1);
  });

  (['channel.updated', 'channel.truncated'] as const).forEach((eventType) => {
    it(`should do nothing on ${eventType} by default`, () => {
      const spy = sinon.spy(() => {});
      channelManager.state.subscribe(spy);
      spy.resetHistory();

      const channel = channelsResponse[channelsResponse.length - 1].channel;
      client.dispatchEvent({
        type: eventType,
        channel_type: channel.type,
        channel_id: channel.id,
      });

      expect(spy.called).to.be.false;
    });
  });

  describe('querying and pagination', () => {
    let clientQueryChannelsStub: sinon.SinonStub;
    let mockChannelPages: Array<Array<Channel>>;
    let mockChannelCidMap: Record<string, Channel>;
    let channelManager: ChannelManager;

    beforeEach(() => {
      channelManager = client.createChannelManager({});
      const channelQueryResponses = [
        Array.from({ length: 10 }, () => generateChannel()),
        Array.from({ length: 10 }, () => generateChannel()),
        Array.from({ length: 5 }, () => generateChannel()),
      ];
      mockChannelPages = channelQueryResponses.map((channelQueryResponse) => {
        client.hydrateActiveChannels(channelQueryResponse);
        return channelQueryResponse.map((c) =>
          client.channel(c.channel.type, c.channel.id),
        );
      });
      mockChannelCidMap = Object.fromEntries(
        mockChannelPages.flat().map((obj) => [obj.cid, obj]),
      );
      clientQueryChannelsStub = sinon
        .stub(client, 'queryChannels')
        .callsFake((filters, _sort, options) => {
          if (
            typeof filters.cid === 'object' &&
            filters.cid !== null &&
            '$in' in filters.cid
          ) {
            const toReturn = (filters.cid['$in'] ?? []) as string[];
            return Promise.resolve(toReturn.map((cid) => mockChannelCidMap[cid]));
          }
          const offset = options?.offset ?? 0;
          return Promise.resolve(mockChannelPages[Math.floor(offset / 10)]);
        });
    });

    afterEach(() => {
      sinon.restore();
      sinon.reset();
    });

    describe('queryChannels', () => {
      describe('with OfflineDB', () => {
        let hydrateActiveChannelsSpy: sinon.SinonSpy;
        let executeChannelsQuerySpy: sinon.SinonSpy;
        let scheduleSyncStatusCallbackSpy: sinon.SinonSpy;

        beforeEach(async () => {
          client.setOfflineDBApi(new MockOfflineDB({ client }));
          await client.offlineDb!.init(client.userID as string);
          (
            client.offlineDb!.getChannelsForQuery as unknown as MockInstance
          ).mockResolvedValue(mockChannelPages[0]);

          hydrateActiveChannelsSpy = sinon.stub(client, 'hydrateActiveChannels');
          executeChannelsQuerySpy = sinon.stub(
            channelManager as any,
            'executeChannelsQuery',
          );
          scheduleSyncStatusCallbackSpy = sinon.spy(
            client.offlineDb!.syncManager,
            'scheduleSyncStatusChangeCallback',
          );

          channelManager.state.partialNext({ initialized: false });
        });

        afterEach(() => {
          sinon.restore();
          sinon.reset();
        });

        it('hydrates channels from DB if not initialized and user ID is available', async () => {
          const stateChangeSpy = sinon.spy();
          channelManager.state.subscribeWithSelector(
            (nextValue) => ({ channels: nextValue.channels }),
            stateChangeSpy,
          );
          stateChangeSpy.resetHistory();

          await channelManager.queryChannels({ filterA: true }, { asc: 1 });

          const { channels } = channelManager.state.getLatestValue();

          expect(client.offlineDb!.getChannelsForQuery).toHaveBeenCalledExactlyOnceWith({
            userId: client.userID,
            filters: { filterA: true },
            sort: { asc: 1 },
          });

          expect(
            hydrateActiveChannelsSpy.calledOnceWithExactly(mockChannelPages[0], {
              offlineMode: true,
              skipInitialization: [],
            }),
          ).toBe(true);

          expect(stateChangeSpy.calledOnceWithExactly(channels));
          expect(executeChannelsQuerySpy.called).to.be.false;
          expect(scheduleSyncStatusCallbackSpy.called).to.be.true;
        });

        it('does NOT hydrate from DB if already initialized', async () => {
          channelManager.state.partialNext({ initialized: true });
          const stateChangeSpy = sinon.spy();
          channelManager.state.subscribeWithSelector(
            (nextValue) => ({ channels: nextValue.channels }),
            stateChangeSpy,
          );
          stateChangeSpy.resetHistory();

          await channelManager.queryChannels({ filterA: true }, { asc: 1 });

          expect(client.offlineDb!.getChannelsForQuery).not.toHaveBeenCalled();
          expect(hydrateActiveChannelsSpy.called).to.be.false;
          expect(stateChangeSpy.called).to.be.false;
          expect(executeChannelsQuerySpy.called).to.be.false;
          expect(scheduleSyncStatusCallbackSpy.called).to.be.true;
        });

        it('schedules sync callback if syncStatus is false and invoke it when synced', async () => {
          const stateChangeSpy = sinon.spy();
          channelManager.state.subscribeWithSelector(
            (nextValue) => ({ channels: nextValue.channels }),
            stateChangeSpy,
          );
          stateChangeSpy.resetHistory();

          await channelManager.queryChannels({ filterA: true }, { asc: 1 });

          expect(executeChannelsQuerySpy.called).to.be.false;
          expect(scheduleSyncStatusCallbackSpy.calledOnce).toBe(true);

          const [id, callback] = scheduleSyncStatusCallbackSpy.firstCall.args;

          expect(id).toBe((channelManager as any).id);
          expect(typeof callback).toBe('function');

          await callback();

          expect(
            executeChannelsQuerySpy.calledOnceWithExactly({
              filters: { filterA: true },
              sort: { asc: 1 },
              options: {},
              stateOptions: {},
            }),
          ).to.be.true;

          const callbackSpy = sinon.spy(callback);
          client.offlineDb!.syncManager['scheduledSyncStatusCallbacks'].set(
            id,
            callbackSpy,
          );

          await client.offlineDb!.syncManager['invokeSyncStatusListeners'](true);

          expect(callbackSpy.called).to.be.true;
        });

        it('does NOT schedule sync callback if syncStatus is true', async () => {
          client.offlineDb!.syncManager.syncStatus = true;

          const stateChangeSpy = sinon.spy();
          channelManager.state.subscribeWithSelector(
            (nextValue) => ({ channels: nextValue.channels }),
            stateChangeSpy,
          );
          stateChangeSpy.resetHistory();

          await channelManager.queryChannels({ filterA: true }, { asc: 1 });

          expect(client.offlineDb!.getChannelsForQuery).toHaveBeenCalled();
          expect(hydrateActiveChannelsSpy.called).to.be.true;
          expect(stateChangeSpy.called).to.be.true;
          expect(scheduleSyncStatusCallbackSpy.called).to.be.false;
          expect(executeChannelsQuerySpy.calledOnce).to.be.true;
        });

        it('continues with normal queryChannels flow if client.user is missing', async () => {
          client.user = undefined;

          const stateChangeSpy = sinon.spy();
          channelManager.state.subscribeWithSelector(
            (nextValue) => ({ channels: nextValue.channels }),
            stateChangeSpy,
          );
          stateChangeSpy.resetHistory();

          await channelManager.queryChannels({ filterA: true }, { asc: 1 });

          expect(client.offlineDb!.getChannelsForQuery).not.toHaveBeenCalled();
          expect(hydrateActiveChannelsSpy.called).to.be.false;
          expect(stateChangeSpy.called).to.be.false;
          expect(scheduleSyncStatusCallbackSpy.called).to.be.false;
          expect(executeChannelsQuerySpy.calledOnce).to.be.true;
        });
      });

      it('should not query if pagination.isLoading is true', async () => {
        channelManager.state.next((prevState) => ({
          ...prevState,
          pagination: {
            ...prevState.pagination,
            isLoading: true,
          },
        }));

        await channelManager.queryChannels({});

        expect(clientQueryChannelsStub.called).to.be.false;
      });

      it('should not query more than once from the same manager for 2 different queries', async () => {
        await Promise.all([
          channelManager.queryChannels({}),
          channelManager.queryChannels({}),
        ]);
        expect(clientQueryChannelsStub.calledOnce).to.be.true;
      });

      it('should query more than once if channelManager.options.abortInFlightQuery is true', async () => {
        channelManager.setOptions({ abortInFlightQuery: true });
        await Promise.all([
          channelManager.queryChannels({}),
          channelManager.queryChannels({}),
        ]);
        expect(clientQueryChannelsStub.callCount).to.equal(2);
      });

      it('should set the state to loading while an active query is happening', async () => {
        const stateChangeSpy = sinon.spy();
        channelManager.state.subscribeWithSelector(
          (nextValue) => ({ isLoading: nextValue.pagination.isLoading }),
          stateChangeSpy,
        );
        // TODO: Check why the test doesn't work without this;
        //       something keeps invoking one extra state change
        //       and I can't figure out what.
        stateChangeSpy.resetHistory();

        await channelManager.queryChannels({});

        expect(clientQueryChannelsStub.calledOnce).to.be.true;
        expect(stateChangeSpy.callCount).to.equal(2);
        expect(stateChangeSpy.args[0][0]).to.deep.equal({ isLoading: true });
        expect(stateChangeSpy.args[1][0]).to.deep.equal({ isLoading: false });
      });

      it('should set state.initialized to true after the first queryChannels is done', async () => {
        const stateChangeSpy = sinon.spy();
        channelManager.state.subscribeWithSelector(
          (nextValue) => ({ initialized: nextValue.initialized }),
          stateChangeSpy,
        );
        stateChangeSpy.resetHistory();

        const { initialized } = channelManager.state.getLatestValue();

        expect(initialized).to.be.false;

        await channelManager.queryChannels({});

        expect(clientQueryChannelsStub.calledOnce).to.be.true;
        expect(stateChangeSpy.calledOnce).to.be.true;
        expect(stateChangeSpy.args[0][0]).to.deep.equal({ initialized: true });
      });

      describe('executeChannelsQuery', () => {
        it('should properly update the options after executeChannelsQuery', async () => {
          const stateChangeSpy = sinon.spy();
          channelManager.state.subscribeWithSelector(
            (nextValue) => ({ pagination: nextValue.pagination }),
            stateChangeSpy,
          );
          stateChangeSpy.resetHistory();

          await channelManager['executeChannelsQuery']({
            filters: { filterA: true },
            sort: { asc: 1 },
            options: { limit: 10, offset: 0 },
          });

          const { channels } = channelManager.state.getLatestValue();

          expect(clientQueryChannelsStub.calledOnce).to.be.true;
          expect(
            clientQueryChannelsStub.calledWith(
              { filterA: true },
              { asc: 1 },
              { limit: 10, offset: 0 },
            ),
          );
          expect(stateChangeSpy.callCount).to.equal(1);
          expect(stateChangeSpy.args[0][0]).to.deep.equal({
            pagination: {
              filters: {},
              hasNext: true,
              isLoading: false,
              isLoadingNext: false,
              options: { limit: 10, offset: 10 },
              sort: {},
            },
          });
          expect(channels.length).to.equal(10);
        });

        it('should properly update hasNext and offset after executeChannelsQuery if the first returned page is less than the limit', async () => {
          clientQueryChannelsStub.callsFake(() => mockChannelPages[2]);
          await channelManager['executeChannelsQuery']({
            filters: { filterA: true },
            sort: { asc: 1 },
            options: { limit: 10, offset: 0 },
          });

          const {
            channels,
            pagination: {
              hasNext,
              options: { offset },
            },
          } = channelManager.state.getLatestValue();

          expect(clientQueryChannelsStub.calledOnce).to.be.true;
          expect(channels.length).to.equal(5);
          expect(offset).to.equal(5);
          expect(hasNext).to.be.false;
        });

        it('retries up to 3 times when queryChannels fails', async () => {
          clientQueryChannelsStub.rejects(new Error('fail'));
          const sleepSpy = vi.spyOn(utils, 'sleep');
          const stateChangeSpy = sinon.spy();
          channelManager.state.subscribeWithSelector(
            (nextValue) => ({ error: nextValue.error }),
            stateChangeSpy,
          );
          stateChangeSpy.resetHistory();

          await channelManager['executeChannelsQuery']({
            filters: { filterA: true },
            sort: { asc: 1 },
            options: { limit: 10, offset: 0 },
          });

          const { channels, initialized } = channelManager.state.getLatestValue();

          expect(clientQueryChannelsStub.callCount).to.equal(
            DEFAULT_QUERY_CHANNELS_RETRY_COUNT + 1,
          ); // // initial + however many retried are configured
          expect(sleepSpy).toHaveBeenCalledTimes(DEFAULT_QUERY_CHANNELS_RETRY_COUNT);
          expect(stateChangeSpy.callCount).to.equal(1);
          expect(stateChangeSpy.args[0][0]).to.deep.equal({
            error: new Error(
              'Maximum number of retries reached in queryChannels. Last error message is: Error: fail',
            ),
          });
          expect(channels.length).to.equal(0);
          expect(initialized).to.be.false;
        });

        it('should not set error when offline support is enabled and there are channels in the DB', async () => {
          clientQueryChannelsStub.callsFake(() => mockChannelPages[2]);
          client.setOfflineDBApi(new MockOfflineDB({ client }));
          await client.offlineDb!.init(client.userID as string);

          channelManager.state.partialNext({
            channels: mockChannelPages[2],
          });

          clientQueryChannelsStub.rejects(new Error('fail'));
          const sleepSpy = vi.spyOn(utils, 'sleep');
          const stateChangeSpy = sinon.spy();
          channelManager.state.subscribeWithSelector(
            (nextValue) => ({
              error: nextValue.error,
            }),
            stateChangeSpy,
          );
          stateChangeSpy.resetHistory();

          await channelManager['executeChannelsQuery']({
            filters: { filterA: true },
            sort: { asc: 1 },
            options: { limit: 10, offset: 0 },
          });

          const { channels, initialized, error, pagination } =
            channelManager.state.getLatestValue();

          expect(clientQueryChannelsStub.callCount).to.equal(
            DEFAULT_QUERY_CHANNELS_RETRY_COUNT + 1,
          ); // initial + however many retried are configured
          expect(sleepSpy).toHaveBeenCalledTimes(DEFAULT_QUERY_CHANNELS_RETRY_COUNT);
          expect(error).toEqual(undefined);
          expect(channels.length).to.equal(5);
          expect(initialized).to.be.false;
          expect(pagination.isLoading).to.be.false;
        });

        it('does not retry more than 3 times', async () => {
          clientQueryChannelsStub.rejects(new Error('fail'));
          const sleepSpy = vi.spyOn(utils, 'sleep');
          const stateChangeSpy = sinon.spy();
          channelManager.state.subscribeWithSelector(
            (nextValue) => ({ error: nextValue.error }),
            stateChangeSpy,
          );
          stateChangeSpy.resetHistory();

          await channelManager['executeChannelsQuery'](
            {
              filters: { filterA: true },
              sort: { asc: 1 },
              options: { limit: 10, offset: 0 },
            },
            3,
          );

          const { channels, initialized } = channelManager.state.getLatestValue();

          expect(clientQueryChannelsStub.callCount).to.equal(1);
          expect(sleepSpy).toHaveBeenCalledTimes(0);
          expect(stateChangeSpy.callCount).to.equal(1);
          expect(stateChangeSpy.args[0][0]).to.deep.equal({
            error: new Error(
              'Maximum number of retries reached in queryChannels. Last error message is: Error: fail',
            ),
          });
          expect(channels.length).to.equal(0);
          expect(initialized).to.be.false;
        });

        it('retries once and succeeds on second try', async () => {
          clientQueryChannelsStub.onFirstCall().rejects(new Error('flaky'));
          const sleepSpy = vi.spyOn(utils, 'sleep');
          const stateChangeSpy = sinon.spy();
          channelManager.state.subscribeWithSelector(
            (nextValue) => ({ error: nextValue.error, channels: nextValue.channels }),
            stateChangeSpy,
          );
          stateChangeSpy.resetHistory();

          await channelManager['executeChannelsQuery']({
            filters: { filterA: true },
            sort: { asc: 1 },
            options: { limit: 10, offset: 0 },
          });

          const { channels, initialized } = channelManager.state.getLatestValue();

          expect(clientQueryChannelsStub.callCount).to.equal(2);
          expect(sleepSpy).toHaveBeenCalledTimes(1);
          expect(stateChangeSpy.callCount).to.equal(1);
          expect(stateChangeSpy.args[0][0].channels.length).to.equal(10);
          expect(channels.length).to.equal(10);
          expect(initialized).to.be.true;
        });
      });

      it('should properly set the new pagination parameters and update the offset after the query', async () => {
        const stateChangeSpy = sinon.spy();
        channelManager.state.subscribeWithSelector(
          (nextValue) => ({ pagination: nextValue.pagination }),
          stateChangeSpy,
        );
        stateChangeSpy.resetHistory();

        await channelManager.queryChannels(
          { filterA: true },
          { asc: 1 },
          { limit: 10, offset: 0 },
        );

        const { channels } = channelManager.state.getLatestValue();

        expect(clientQueryChannelsStub.calledOnce).to.be.true;
        expect(stateChangeSpy.callCount).to.equal(2);
        expect(stateChangeSpy.args[0][0]).to.deep.equal({
          pagination: {
            filters: { filterA: true },
            hasNext: false,
            isLoading: true,
            isLoadingNext: false,
            options: { limit: 10, offset: 0 },
            sort: { asc: 1 },
          },
        });
        expect(stateChangeSpy.args[1][0]).to.deep.equal({
          pagination: {
            filters: { filterA: true },
            hasNext: true,
            isLoading: false,
            isLoadingNext: false,
            options: { limit: 10, offset: 10 },
            sort: { asc: 1 },
          },
        });
        expect(channels.length).to.equal(10);
      });

      it('should properly update hasNext and offset if the first returned page is less than the limit', async () => {
        clientQueryChannelsStub.callsFake(() => mockChannelPages[2]);
        await channelManager.queryChannels(
          { filterA: true },
          { asc: 1 },
          { limit: 10, offset: 0 },
        );

        const {
          channels,
          pagination: {
            hasNext,
            options: { offset },
          },
        } = channelManager.state.getLatestValue();

        expect(clientQueryChannelsStub.calledOnce).to.be.true;
        expect(channels.length).to.equal(5);
        expect(offset).to.equal(5);
        expect(hasNext).to.be.false;
      });

      it('should execute queryChannelsOverride if set', async () => {
        const fetchedChannels = mockChannelPages[2].concat(mockChannelPages[1]);
        const queryChannelsOverride = async (
          ...params: Parameters<QueryChannelsRequestType>
        ) => {
          const [filters, ...restParams] = params;
          filters.cid = { $in: fetchedChannels.map((c) => c.cid) };

          return await client.queryChannels(filters, ...restParams);
        };
        channelManager.setQueryChannelsRequest(queryChannelsOverride);

        await channelManager.queryChannels(
          { filterA: true },
          { asc: 1 },
          { limit: 15, offset: 0 },
        );

        const {
          channels,
          pagination: {
            hasNext,
            options: { offset },
          },
        } = channelManager.state.getLatestValue();

        expect(clientQueryChannelsStub.calledOnce).to.be.true;
        expect(channels.length).to.equal(15);
        expect(channels).to.deep.equal(fetchedChannels);
        expect(offset).to.equal(15);
        expect(hasNext).to.be.true;
      });
    });

    describe('loadNext', () => {
      it('should not run loadNext if queryChannels has not been run at least once', async () => {
        channelManager.state.partialNext({ initialized: false });

        await channelManager.loadNext();

        expect(clientQueryChannelsStub.called).to.be.false;
      });

      it('should not run loadNext if a query is already in progress or if we are at the last page', async () => {
        channelManager.state.next((prevState) => ({
          ...prevState,
          initialized: true,
          pagination: { ...prevState.pagination, isLoadingNext: true, hasNext: true },
        }));
        await channelManager.loadNext();
        expect(clientQueryChannelsStub.called).to.be.false;

        channelManager.state.next((prevState) => ({
          ...prevState,
          initialized: true,
          pagination: { ...prevState.pagination, isLoadingNext: false, hasNext: false },
        }));
        await channelManager.loadNext();
        expect(clientQueryChannelsStub.called).to.be.false;
      });

      it('should not queryChannels more than once regardless of number of consecutive loadNext invocations', async () => {
        channelManager.state.next((prevState) => ({
          ...prevState,
          initialized: true,
          pagination: { ...prevState.pagination, isLoadingNext: false, hasNext: true },
        }));
        await Promise.all([channelManager.loadNext(), channelManager.loadNext()]);
        expect(clientQueryChannelsStub.calledOnce).to.be.true;
      });

      it('should set the state to loading next page while an active query is happening', async () => {
        channelManager.state.next((prevState) => ({
          ...prevState,
          initialized: true,
          pagination: { ...prevState.pagination, isLoadingNext: false, hasNext: true },
        }));
        const stateChangeSpy = sinon.spy();
        channelManager.state.subscribeWithSelector(
          (nextValue) => ({ isLoadingNext: nextValue.pagination.isLoadingNext }),
          stateChangeSpy,
        );
        stateChangeSpy.resetHistory();

        await channelManager.loadNext();

        expect(clientQueryChannelsStub.calledOnce).to.be.true;
        expect(stateChangeSpy.callCount).to.equal(2);
        expect(stateChangeSpy.args[0][0]).to.deep.equal({ isLoadingNext: true });
        expect(stateChangeSpy.args[1][0]).to.deep.equal({ isLoadingNext: false });
      });

      it('should properly set the new pagination parameters and update the offset after loading next', async () => {
        await channelManager.queryChannels(
          { filterA: true },
          { asc: 1 },
          { limit: 10, offset: 0 },
        );

        const stateChangeSpy = sinon.spy();
        channelManager.state.subscribeWithSelector(
          (nextValue) => ({ pagination: nextValue.pagination }),
          stateChangeSpy,
        );
        stateChangeSpy.resetHistory();

        await channelManager.loadNext();

        const { channels } = channelManager.state.getLatestValue();

        // one from queryChannels and one from loadNext
        expect(clientQueryChannelsStub.callCount).to.equal(2);
        expect(stateChangeSpy.callCount).to.equal(2);
        expect(stateChangeSpy.args[0][0]).to.deep.equal({
          pagination: {
            filters: { filterA: true },
            hasNext: true,
            isLoading: false,
            isLoadingNext: true,
            options: { limit: 10, offset: 10 },
            sort: { asc: 1 },
          },
        });
        expect(stateChangeSpy.args[1][0]).to.deep.equal({
          pagination: {
            filters: { filterA: true },
            hasNext: true,
            isLoading: false,
            isLoadingNext: false,
            options: { limit: 10, offset: 20 },
            sort: { asc: 1 },
          },
        });
        expect(channels.length).to.equal(20);
      });

      it('should properly paginate even if state.channels gets modified in the meantime', async () => {
        await channelManager.queryChannels(
          { filterA: true },
          { asc: 1 },
          { limit: 10, offset: 0 },
        );
        channelManager.state.next((prevState) => ({
          ...prevState,
          channels: [...mockChannelPages[2].slice(0, 5), ...prevState.channels],
        }));

        const stateChangeSpy = sinon.spy();
        channelManager.state.subscribeWithSelector(
          (nextValue) => ({ pagination: nextValue.pagination }),
          stateChangeSpy,
        );

        stateChangeSpy.resetHistory();

        await channelManager.loadNext();

        const { channels } = channelManager.state.getLatestValue();

        expect(clientQueryChannelsStub.callCount).to.equal(2);
        expect(stateChangeSpy.callCount).to.equal(2);
        expect(stateChangeSpy.args[0][0]).to.deep.equal({
          pagination: {
            filters: { filterA: true },
            hasNext: true,
            isLoading: false,
            isLoadingNext: true,
            options: { limit: 10, offset: 10 },
            sort: { asc: 1 },
          },
        });
        expect(stateChangeSpy.args[1][0]).to.deep.equal({
          pagination: {
            filters: { filterA: true },
            hasNext: true,
            isLoading: false,
            isLoadingNext: false,
            options: { limit: 10, offset: 20 },
            sort: { asc: 1 },
          },
        });
        expect(channels.length).to.equal(25);
      });

      it('should properly deduplicate when paginating if channels from the next page have been promoted', async () => {
        await channelManager.queryChannels(
          { filterA: true },
          { asc: 1 },
          { limit: 10, offset: 0 },
        );
        channelManager.state.next((prevState) => ({
          ...prevState,
          channels: [...mockChannelPages[1].slice(0, 5), ...prevState.channels],
        }));

        const stateChangeSpy = sinon.spy();
        channelManager.state.subscribeWithSelector(
          (nextValue) => ({ pagination: nextValue.pagination }),
          stateChangeSpy,
        );

        stateChangeSpy.resetHistory();

        await channelManager.loadNext();

        const { channels } = channelManager.state.getLatestValue();

        expect(clientQueryChannelsStub.callCount).to.equal(2);
        expect(stateChangeSpy.callCount).to.equal(2);
        expect(stateChangeSpy.args[0][0]).to.deep.equal({
          pagination: {
            filters: { filterA: true },
            hasNext: true,
            isLoading: false,
            isLoadingNext: true,
            options: { limit: 10, offset: 10 },
            sort: { asc: 1 },
          },
        });
        expect(stateChangeSpy.args[1][0]).to.deep.equal({
          pagination: {
            filters: { filterA: true },
            hasNext: true,
            isLoading: false,
            isLoadingNext: false,
            options: { limit: 10, offset: 20 },
            sort: { asc: 1 },
          },
        });
        expect(channels.length).to.equal(20);
      });

      it('should properly deduplicate when paginating if channels latter pages have been promoted and reached', async () => {
        await channelManager.queryChannels(
          { filterA: true },
          { asc: 1 },
          { limit: 10, offset: 0 },
        );
        channelManager.state.next((prevState) => ({
          ...prevState,
          channels: [...mockChannelPages[2].slice(0, 3), ...prevState.channels],
        }));

        const stateChangeSpy = sinon.spy();
        channelManager.state.subscribeWithSelector(
          (nextValue) => ({ pagination: nextValue.pagination }),
          stateChangeSpy,
        );

        stateChangeSpy.resetHistory();

        await channelManager.loadNext();

        const { channels: channelsAfterFirstPagination } =
          channelManager.state.getLatestValue();
        expect(channelsAfterFirstPagination.length).to.equal(23);

        await channelManager.loadNext();

        const { channels } = channelManager.state.getLatestValue();

        expect(clientQueryChannelsStub.callCount).to.equal(3);
        expect(stateChangeSpy.callCount).to.equal(4);
        expect(stateChangeSpy.args[0][0]).to.deep.equal({
          pagination: {
            filters: { filterA: true },
            hasNext: true,
            isLoading: false,
            isLoadingNext: true,
            options: { limit: 10, offset: 10 },
            sort: { asc: 1 },
          },
        });
        expect(stateChangeSpy.args[1][0]).to.deep.equal({
          pagination: {
            filters: { filterA: true },
            hasNext: true,
            isLoading: false,
            isLoadingNext: false,
            options: { limit: 10, offset: 20 },
            sort: { asc: 1 },
          },
        });
        expect(stateChangeSpy.args[3][0]).to.deep.equal({
          pagination: {
            filters: { filterA: true },
            hasNext: false,
            isLoading: false,
            isLoadingNext: false,
            options: { limit: 10, offset: 25 },
            sort: { asc: 1 },
          },
        });
        expect(channels.length).to.equal(25);
      });

      it('should correctly update hasNext and offset if the last page has been reached', async () => {
        const { channels: initialChannels } = channelManager.state.getLatestValue();
        expect(initialChannels.length).to.equal(0);

        await channelManager.queryChannels(
          { filterA: true },
          { asc: 1 },
          { limit: 10, offset: 0 },
        );
        await channelManager.loadNext();

        const {
          channels: secondToLastPage,
          pagination: { hasNext: prevHasNext },
        } = channelManager.state.getLatestValue();
        expect(secondToLastPage.length).to.equal(20);
        expect(prevHasNext).to.be.true;

        await channelManager.loadNext();

        const {
          channels: lastPage,
          pagination: {
            hasNext,
            options: { offset },
          },
        } = channelManager.state.getLatestValue();

        expect(lastPage.length).to.equal(25);
        expect(hasNext).to.be.false;
        expect(offset).to.equal(25);
      });

      it('should properly paginate with queryChannelsOverride if set', async () => {
        const fetchedChannels = mockChannelPages[2].concat(mockChannelPages[1]);
        const fetchedNextPageChannels = mockChannelPages[0];
        const queryChannelsOverride = async (
          ...params: Parameters<QueryChannelsRequestType>
        ) => {
          const [filters, sort, options, ...restParams] = params;
          const isInitialPage = options?.offset === 0;
          filters.cid = {
            $in: (isInitialPage ? fetchedChannels : fetchedNextPageChannels).map(
              (c) => c.cid,
            ),
          };

          return await client.queryChannels(filters, sort, options, ...restParams);
        };

        channelManager.setQueryChannelsRequest(queryChannelsOverride);

        await channelManager.queryChannels(
          { filterA: true },
          { asc: 1 },
          { limit: 15, offset: 0 },
        );

        const {
          channels: prevChannels,
          pagination: {
            hasNext: prevHasNext,
            options: { offset: prevOffset },
          },
        } = channelManager.state.getLatestValue();

        expect(prevChannels.length).to.equal(15);
        expect(prevChannels).to.deep.equal(fetchedChannels);
        expect(prevOffset).to.equal(15);
        expect(prevHasNext).to.be.true;

        await channelManager.loadNext();

        const {
          channels,
          pagination: {
            hasNext,
            options: { offset },
          },
        } = channelManager.state.getLatestValue();

        expect(channels.length).to.equal(25);
        expect(channels).to.deep.equal(fetchedChannels.concat(fetchedNextPageChannels));
        expect(offset).to.equal(25);
        expect(hasNext).to.be.false;
      });
    });
  });

  describe('websocket event handlers', () => {
    let setChannelsStub: MockInstance<ChannelManager['setChannels']>;
    let isChannelPinnedStub: MockInstance<(typeof utils)['isChannelPinned']>;
    let isChannelArchivedStub: MockInstance<(typeof utils)['isChannelArchived']>;
    let shouldConsiderArchivedChannelsStub: MockInstance<
      (typeof utils)['shouldConsiderArchivedChannels']
    >;
    let shouldConsiderPinnedChannelsStub: MockInstance<
      (typeof utils)['shouldConsiderPinnedChannels']
    >;
    let promoteChannelSpy: MockInstance<(typeof utils)['promoteChannel']>;
    let getAndWatchChannelStub: MockInstance<(typeof utils)['getAndWatchChannel']>;
    let findLastPinnedChannelIndexStub: MockInstance<
      (typeof utils)['findLastPinnedChannelIndex']
    >;
    let extractSortValueStub: MockInstance<(typeof utils)['extractSortValue']>;

    beforeEach(() => {
      setChannelsStub = vi.spyOn(channelManager, 'setChannels');
      isChannelPinnedStub = vi.spyOn(utils, 'isChannelPinned');
      isChannelArchivedStub = vi.spyOn(utils, 'isChannelArchived');
      shouldConsiderArchivedChannelsStub = vi.spyOn(
        utils,
        'shouldConsiderArchivedChannels',
      );
      shouldConsiderPinnedChannelsStub = vi.spyOn(utils, 'shouldConsiderPinnedChannels');
      getAndWatchChannelStub = vi.spyOn(utils, 'getAndWatchChannel');
      findLastPinnedChannelIndexStub = vi.spyOn(utils, 'findLastPinnedChannelIndex');
      extractSortValueStub = vi.spyOn(utils, 'extractSortValue');
      promoteChannelSpy = vi.spyOn(utils, 'promoteChannel');
    });

    afterEach(() => {
      vi.resetAllMocks();
      sinon.restore();
      sinon.reset();
    });

    describe('channelDeletedHandler, channelHiddenHandler and notificationRemovedFromChannelHandler', () => {
      let channelToRemove: ChannelResponse;

      beforeEach(() => {
        channelToRemove = channelsResponse[1].channel;
      });

      (
        [
          'channel.deleted',
          'channel.hidden',
          'notification.removed_from_channel',
        ] as const
      ).forEach((eventType) => {
        it('should return early if channels is undefined', () => {
          channelManager.state.partialNext({ channels: undefined });

          client.dispatchEvent({ type: eventType, cid: channelToRemove.cid });
          client.dispatchEvent({ type: eventType, channel: channelToRemove });

          expect(setChannelsStub).toHaveBeenCalledTimes(0);
        });

        it('should remove the channel when event.cid matches', () => {
          client.dispatchEvent({ type: eventType, cid: channelToRemove.cid });

          expect(setChannelsStub).toHaveBeenCalledOnce();
          const channels = setChannelsStub.mock.lastCall?.[0] as Channel[];

          expect(channels.map((c) => c.id)).to.deep.equal(['channel1', 'channel3']);
        });

        it('should remove the channel when event.channel?.cid matches', () => {
          client.dispatchEvent({ type: eventType, channel: channelToRemove });

          expect(setChannelsStub).toHaveBeenCalledOnce();
          expect(
            (setChannelsStub.mock.calls[0][0] as Channel[]).map((c) => c.id),
          ).to.deep.equal(['channel1', 'channel3']);
        });

        it('should not modify the list if no channels match', () => {
          const { channels: prevChannels } = channelManager.state.getLatestValue();
          client.dispatchEvent({ type: eventType, cid: 'channel123' });
          const { channels: newChannels } = channelManager.state.getLatestValue();

          expect(setChannelsStub).toHaveBeenCalledTimes(0);
          expect(prevChannels).to.equal(newChannels);
          expect(prevChannels).to.deep.equal(newChannels);
        });
      });
    });

    describe('newMessageHandler', () => {
      it('should not update the state early if channels are not defined', () => {
        channelManager.state.partialNext({ channels: undefined });

        client.dispatchEvent({
          type: 'message.new',
          channel_type: 'messaging',
          channel_id: 'channel2',
        });

        expect(setChannelsStub).toHaveBeenCalledTimes(0);
      });

      it('should not update the state if channel is pinned and sorting considers pinned channels', () => {
        const { channels: prevChannels } = channelManager.state.getLatestValue();
        isChannelPinnedStub.mockReturnValueOnce(true);
        shouldConsiderPinnedChannelsStub.mockReturnValueOnce(true);

        client.dispatchEvent({
          type: 'message.new',
          channel_type: 'messaging',
          channel_id: 'channel2',
        });

        const { channels: newChannels } = channelManager.state.getLatestValue();

        expect(setChannelsStub).toHaveBeenCalledTimes(0);
        expect(prevChannels).to.equal(newChannels);
        expect(prevChannels).to.deep.equal(newChannels);
      });

      it('should not update the state if channel is archived and sorting considers archived channels, but the filter is false', () => {
        const { channels: prevChannels } = channelManager.state.getLatestValue();
        channelManager.state.next((prevState) => ({
          ...prevState,
          pagination: { ...prevState.pagination, filters: { archived: false } },
        }));
        isChannelArchivedStub.mockReturnValueOnce(true);
        shouldConsiderArchivedChannelsStub.mockReturnValueOnce(true);

        client.dispatchEvent({
          type: 'message.new',
          channel_type: 'messaging',
          channel_id: 'channel2',
        });

        const { channels: newChannels } = channelManager.state.getLatestValue();

        expect(setChannelsStub).toHaveBeenCalledTimes(0);
        expect(prevChannels).to.equal(newChannels);
        expect(prevChannels).to.deep.equal(newChannels);
      });

      it('should not update the state if channel is not archived and sorting considers archived channels, but the filter is true', () => {
        const { channels: prevChannels } = channelManager.state.getLatestValue();
        channelManager.state.next((prevState) => ({
          ...prevState,
          pagination: { ...prevState.pagination, filters: { archived: true } },
        }));
        isChannelArchivedStub.mockReturnValueOnce(false);
        shouldConsiderArchivedChannelsStub.mockReturnValueOnce(true);

        client.dispatchEvent({
          type: 'message.new',
          channel_type: 'messaging',
          channel_id: 'channel2',
        });

        const { channels: newChannels } = channelManager.state.getLatestValue();

        expect(setChannelsStub).toHaveBeenCalledTimes(0);
        expect(prevChannels).to.equal(newChannels);
        expect(prevChannels).to.deep.equal(newChannels);
      });

      it('should not update the state if channelManager.options.lockChannelOrder is true', () => {
        const { channels: prevChannels } = channelManager.state.getLatestValue();
        channelManager.setOptions({ lockChannelOrder: true });

        client.dispatchEvent({
          type: 'message.new',
          channel_type: 'messaging',
          channel_id: 'channel2',
        });

        const { channels: newChannels } = channelManager.state.getLatestValue();

        expect(setChannelsStub).toHaveBeenCalledTimes(0);
        expect(prevChannels).to.equal(newChannels);
        expect(prevChannels).to.deep.equal(newChannels);

        channelManager.setOptions({});
      });

      it('should not update the state if the channel is not part of the list and allowNotLoadedChannelPromotionForEvent["message.new"] if false', () => {
        const { channels: prevChannels } = channelManager.state.getLatestValue();
        isChannelPinnedStub.mockReturnValueOnce(false);
        isChannelArchivedStub.mockReturnValueOnce(false);
        shouldConsiderArchivedChannelsStub.mockReturnValueOnce(false);
        shouldConsiderPinnedChannelsStub.mockReturnValueOnce(false);
        channelManager.setOptions({
          allowNotLoadedChannelPromotionForEvent: {
            'channel.visible': true,
            'message.new': false,
            'notification.added_to_channel': true,
            'notification.message_new': true,
          },
        });

        client.dispatchEvent({
          type: 'message.new',
          channel_type: 'messaging',
          channel_id: 'channel4',
        });

        const { channels: newChannels } = channelManager.state.getLatestValue();

        expect(setChannelsStub).toHaveBeenCalledTimes(0);
        expect(prevChannels).to.equal(newChannels);
        expect(prevChannels).to.deep.equal(newChannels);

        channelManager.setOptions({});
      });

      it('should move the channel upwards if it is not part of the list and allowNotLoadedChannelPromotionForEvent["message.new"] is true', () => {
        isChannelPinnedStub.mockReturnValue(false);
        isChannelArchivedStub.mockReturnValue(false);
        shouldConsiderArchivedChannelsStub.mockReturnValue(false);
        shouldConsiderPinnedChannelsStub.mockReturnValue(false);

        const stateBefore = channelManager.state.getLatestValue();

        client.dispatchEvent({
          type: 'message.new',
          channel_type: 'messaging',
          channel_id: 'channel4',
        });

        const stateAfter = channelManager.state.getLatestValue();

        expect(setChannelsStub).toHaveBeenCalledOnce();
        expect(promoteChannelSpy).toHaveBeenCalledOnce();

        expect(stateBefore.channels.map((v) => v.cid)).toMatchInlineSnapshot(`
          [
            "messaging:channel1",
            "messaging:channel2",
            "messaging:channel3",
          ]
        `);
        expect(stateAfter.channels.map((v) => v.cid)).toMatchInlineSnapshot(`
          [
            "messaging:channel4",
            "messaging:channel1",
            "messaging:channel2",
            "messaging:channel3",
          ]
        `);
      });

      it('should move the channel upwards if all conditions allow it', () => {
        isChannelPinnedStub.mockReturnValueOnce(false);
        isChannelArchivedStub.mockReturnValueOnce(false);
        shouldConsiderArchivedChannelsStub.mockReturnValueOnce(false);
        shouldConsiderPinnedChannelsStub.mockReturnValueOnce(false);

        const stateBefore = channelManager.state.getLatestValue();

        client.dispatchEvent({
          type: 'message.new',
          channel_type: 'messaging',
          channel_id: 'channel2',
        });

        const stateAfter = channelManager.state.getLatestValue();

        expect(promoteChannelSpy).toHaveBeenCalledOnce();
        expect(setChannelsStub).toHaveBeenCalledOnce();

        expect(stateBefore.channels.map((v) => v.cid)).toMatchInlineSnapshot(`
          [
            "messaging:channel1",
            "messaging:channel2",
            "messaging:channel3",
          ]
        `);
        expect(stateAfter.channels.map((v) => v.cid)).toMatchInlineSnapshot(`
          [
            "messaging:channel2",
            "messaging:channel1",
            "messaging:channel3",
          ]
        `);
      });
    });

    describe('notificationNewMessageHandler', () => {
      let clock: sinon.SinonFakeTimers;

      beforeEach(() => {
        clock = sinon.useFakeTimers();
      });

      afterEach(() => {
        clock.restore();
      });

      it('should not update the state if the event has no id and type', async () => {
        client.dispatchEvent({
          type: 'notification.message_new',
          channel: {} as unknown as ChannelResponse,
        });

        await clock.runAllAsync();

        expect(getAndWatchChannelStub).toHaveBeenCalledTimes(0);
        expect(setChannelsStub).toHaveBeenCalledTimes(0);
      });

      it('should execute getAndWatchChannel if id and type are provided', async () => {
        const newChannelResponse = generateChannel({ channel: { id: 'channel4' } });
        const newChannel = client.channel(
          newChannelResponse.channel.type,
          newChannelResponse.channel.id,
        );
        getAndWatchChannelStub.mockResolvedValue(newChannel);
        client.dispatchEvent({
          type: 'notification.message_new',
          channel: { type: 'messaging', id: 'channel4' } as unknown as ChannelResponse,
        });

        await clock.runAllAsync();

        expect(getAndWatchChannelStub).toHaveBeenCalledOnce();
        expect(getAndWatchChannelStub).toHaveBeenCalledWith({
          client,
          id: 'channel4',
          type: 'messaging',
        });
      });

      it('should not update the state if channel is archived and filters do not allow it', async () => {
        isChannelArchivedStub.mockReturnValue(true);
        shouldConsiderArchivedChannelsStub.mockReturnValue(true);
        const newChannelResponse = generateChannel({ channel: { id: 'channel4' } });
        getAndWatchChannelStub.mockImplementation(async () =>
          client.channel(newChannelResponse.channel.type, newChannelResponse.channel.id),
        );

        channelManager.state.next((prevState) => ({
          ...prevState,
          pagination: { ...prevState.pagination, filters: { archived: false } },
        }));

        client.dispatchEvent({
          type: 'notification.message_new',
          channel: newChannelResponse.channel as ChannelResponse,
        });

        await clock.runAllAsync();

        expect(getAndWatchChannelStub).toHaveBeenCalled();
        expect(setChannelsStub).toHaveBeenCalledTimes(0);
      });

      it('should not update the state if channel is not archived and and filters allow it', async () => {
        isChannelArchivedStub.mockReturnValueOnce(false);
        shouldConsiderArchivedChannelsStub.mockReturnValueOnce(true);
        const newChannelResponse = generateChannel({ channel: { id: 'channel4' } });
        getAndWatchChannelStub.mockImplementation(async () =>
          client.channel(newChannelResponse.channel.type, newChannelResponse.channel.id),
        );

        channelManager.state.next((prevState) => ({
          ...prevState,
          pagination: { ...prevState.pagination, filters: { archived: true } },
        }));

        client.dispatchEvent({
          type: 'notification.message_new',
          channel: newChannelResponse.channel as ChannelResponse,
        });

        await clock.runAllAsync();

        expect(getAndWatchChannelStub).toHaveBeenCalled();
        expect(setChannelsStub).toHaveBeenCalledTimes(0);
      });

      it('should not update the state if allowNotLoadedChannelPromotionForEvent["notification.message_new"] is false', async () => {
        const newChannelResponse = generateChannel({ channel: { id: 'channel4' } });
        const newChannel = client.channel(
          newChannelResponse.channel.type,
          newChannelResponse.channel.id,
        );
        getAndWatchChannelStub.mockResolvedValueOnce(newChannel);
        channelManager.setOptions({
          allowNotLoadedChannelPromotionForEvent: {
            'channel.visible': true,
            'message.new': true,
            'notification.added_to_channel': true,
            'notification.message_new': false,
          },
        });
        client.dispatchEvent({
          type: 'notification.message_new',
          channel: { type: 'messaging', id: 'channel4' } as unknown as ChannelResponse,
        });

        await clock.runAllAsync();

        expect(getAndWatchChannelStub).toHaveBeenCalled();
        expect(setChannelsStub).toHaveBeenCalledTimes(0);

        channelManager.setOptions({});
      });

      it('should move channel when all criteria are met', async () => {
        const newChannelResponse = generateChannel({ channel: { id: 'channel4' } });
        const newChannel = client.channel(
          newChannelResponse.channel.type,
          newChannelResponse.channel.id,
        );
        getAndWatchChannelStub.mockResolvedValueOnce(newChannel);

        const stateBefore = channelManager.state.getLatestValue();

        client.dispatchEvent({
          type: 'notification.message_new',
          channel: { type: 'messaging', id: 'channel4' } as unknown as ChannelResponse,
        });

        await clock.runAllAsync();

        const stateAfter = channelManager.state.getLatestValue();

        expect(getAndWatchChannelStub).toHaveBeenCalledOnce();
        expect(promoteChannelSpy).toHaveBeenCalledOnce();
        expect(setChannelsStub).toHaveBeenCalledOnce();
        expect(stateBefore.channels.map((c) => c.cid)).toMatchInlineSnapshot(`
          [
            "messaging:channel1",
            "messaging:channel2",
            "messaging:channel3",
          ]
        `);
        expect(stateAfter.channels.map((c) => c.cid)).toMatchInlineSnapshot(`
          [
            "messaging:channel4",
            "messaging:channel1",
            "messaging:channel2",
            "messaging:channel3",
          ]
        `);
      });

      it('should not add duplicate channels for multiple event invocations', async () => {
        const newChannelResponse = generateChannel({ channel: { id: 'channel4' } });
        const newChannel = client.channel(
          newChannelResponse.channel.type,
          newChannelResponse.channel.id,
        );
        getAndWatchChannelStub.mockResolvedValue(newChannel);

        const stateBefore = channelManager.state.getLatestValue();

        const event = {
          type: 'notification.message_new',
          channel: newChannelResponse.channel as ChannelResponse,
        } as const;
        // call the event 3 times
        client.dispatchEvent(event);
        client.dispatchEvent(event);
        client.dispatchEvent(event);

        await clock.runAllAsync();

        const stateAfter = channelManager.state.getLatestValue();

        expect(getAndWatchChannelStub.mock.calls.length).to.equal(3);
        expect(promoteChannelSpy.mock.calls.length).to.equal(3);
        expect(setChannelsStub.mock.calls.length).to.equal(3);
        expect(stateBefore.channels.map((c) => c.cid)).toMatchInlineSnapshot(`
          [
            "messaging:channel1",
            "messaging:channel2",
            "messaging:channel3",
          ]
        `);
        expect(stateAfter.channels.map((c) => c.cid)).toMatchInlineSnapshot(`
          [
            "messaging:channel4",
            "messaging:channel1",
            "messaging:channel2",
            "messaging:channel3",
          ]
        `);
      });
    });

    describe('channelVisibleHandler', () => {
      let clock: sinon.SinonFakeTimers;

      beforeEach(() => {
        clock = sinon.useFakeTimers();
      });

      afterEach(() => {
        clock.restore();
      });

      it('should not update the state if the event has no id and type', async () => {
        client.dispatchEvent({
          type: 'channel.visible',
          channel: {} as unknown as ChannelResponse,
        });

        await clock.runAllAsync();

        expect(getAndWatchChannelStub).toHaveBeenCalledTimes(0);
        expect(setChannelsStub).toHaveBeenCalledTimes(0);
      });

      it('should not update the state if channels is undefined', async () => {
        channelManager.state.partialNext({ channels: undefined });
        const newChannelResponse = generateChannel({ channel: { id: 'channel4' } });
        getAndWatchChannelStub.mockImplementation(async () =>
          client.channel(newChannelResponse.channel.type, newChannelResponse.channel.id),
        );
        client.dispatchEvent({
          type: 'channel.visible',
          channel_id: newChannelResponse.channel.id,
          channel_type: newChannelResponse.channel.type,
        });

        await clock.runAllAsync();

        expect(getAndWatchChannelStub).toHaveBeenCalled();
        expect(setChannelsStub).toHaveBeenCalledTimes(0);
      });

      it('should not update the state if the channel is archived and filters do not allow it (archived:false)', async () => {
        isChannelArchivedStub.mockReturnValueOnce(true);
        shouldConsiderArchivedChannelsStub.mockReturnValueOnce(true);
        const newChannelResponse = generateChannel({ channel: { id: 'channel4' } });

        getAndWatchChannelStub.mockImplementation(async () =>
          client.channel(newChannelResponse.channel.type, newChannelResponse.channel.id),
        );

        channelManager.state.next((prevState) => ({
          ...prevState,
          pagination: { ...prevState.pagination, filters: { archived: false } },
        }));

        client.dispatchEvent({
          type: 'channel.visible',
          channel_id: newChannelResponse.channel.cid,
          channel_type: newChannelResponse.channel.type,
        });

        await clock.runAllAsync();

        expect(getAndWatchChannelStub).toHaveBeenCalled();
        expect(setChannelsStub).toHaveBeenCalledTimes(0);
      });

      it('should not update the state if the channel is archived and filters do not allow it (archived:true)', async () => {
        isChannelArchivedStub.mockReturnValueOnce(false);
        shouldConsiderArchivedChannelsStub.mockReturnValueOnce(true);

        const newChannelResponse = generateChannel({ channel: { id: 'channel4' } });

        getAndWatchChannelStub.mockImplementation(async () =>
          client.channel(newChannelResponse.channel.type, newChannelResponse.channel.id),
        );

        channelManager.state.next((prevState) => ({
          ...prevState,
          pagination: { ...prevState.pagination, filters: { archived: true } },
        }));

        client.dispatchEvent({
          type: 'channel.visible',
          channel_id: newChannelResponse.channel.id,
          channel_type: newChannelResponse.channel.type,
        });

        await clock.runAllAsync();

        expect(getAndWatchChannelStub).toHaveBeenCalled();
        expect(setChannelsStub).toHaveBeenCalledTimes(0);
      });

      it('should add the channel to the list if all criteria are met', async () => {
        const newChannelResponse = generateChannel({ channel: { id: 'channel4' } });
        const newChannel = client.channel(
          newChannelResponse.channel.type,
          newChannelResponse.channel.id,
        );
        getAndWatchChannelStub.mockResolvedValue(newChannel);

        const stateBefore = channelManager.state.getLatestValue();

        client.dispatchEvent({
          type: 'channel.visible',
          channel_id: 'channel4',
          channel_type: 'messaging',
        });

        await clock.runAllAsync();

        const stateAfter = channelManager.state.getLatestValue();

        expect(getAndWatchChannelStub).toHaveBeenCalledOnce();
        expect(promoteChannelSpy).toHaveBeenCalledOnce();
        expect(setChannelsStub).toHaveBeenCalledOnce();
        expect(stateBefore.channels.map((c) => c.cid)).toMatchInlineSnapshot(`
          [
            "messaging:channel1",
            "messaging:channel2",
            "messaging:channel3",
          ]
        `);
        expect(stateAfter.channels.map((c) => c.cid)).toMatchInlineSnapshot(`
          [
            "messaging:channel4",
            "messaging:channel1",
            "messaging:channel2",
            "messaging:channel3",
          ]
        `);
      });
    });

    describe('memberUpdatedHandler', () => {
      let clock: sinon.SinonFakeTimers;
      let dispatchMemberUpdatedEvent: (id?: string) => void;

      beforeEach(() => {
        clock = sinon.useFakeTimers();
        dispatchMemberUpdatedEvent = (id?: string) =>
          client.dispatchEvent({
            type: 'member.updated',
            channel_id: id ?? 'channel2',
            channel_type: 'messaging',
            member: { user: { id: client?.userID ?? 'anonymous' } },
          });
      });

      afterEach(() => {
        clock.restore();
      });

      it('should not update state if event member does not have user or user id does not match', () => {
        client.dispatchEvent({
          type: 'member.updated',
          channel_id: 'channel2',
          channel_type: 'messaging',
          member: { user: { id: 'wrongUserID' } },
        });
        expect(setChannelsStub).toHaveBeenCalledTimes(0);

        client.dispatchEvent({
          type: 'member.updated',
          channel_id: 'channel2',
          channel_type: 'messaging',
          member: {},
        });
        expect(setChannelsStub).toHaveBeenCalledTimes(0);
      });

      it('should not update state if channel_type or channel_id is not present', () => {
        client.dispatchEvent({
          type: 'member.updated',
          member: { user: { id: 'user123' } },
        });
        expect(setChannelsStub).toHaveBeenCalledTimes(0);
        client.dispatchEvent({
          type: 'member.updated',
          member: { user: { id: 'user123' } },
          channel_type: 'messaging',
        });
        expect(setChannelsStub).toHaveBeenCalledTimes(0);
        client.dispatchEvent({
          type: 'member.updated',
          member: { user: { id: 'user123' } },
          channel_id: 'channel2',
        });
        expect(setChannelsStub).toHaveBeenCalledTimes(0);
      });

      it('should not update state early if channels are not available in state', () => {
        channelManager.state.partialNext({ channels: undefined });
        dispatchMemberUpdatedEvent();

        expect(setChannelsStub).toHaveBeenCalledTimes(0);
      });

      it('should not update state if options.lockChannelOrder is true', () => {
        channelManager.setOptions({ lockChannelOrder: true });
        dispatchMemberUpdatedEvent();

        expect(setChannelsStub).toHaveBeenCalledTimes(0);
      });

      it('should not update state if neither channel pinning nor archiving should not be considered', () => {
        shouldConsiderPinnedChannelsStub.mockReturnValueOnce(false);
        shouldConsiderArchivedChannelsStub.mockReturnValueOnce(false);
        dispatchMemberUpdatedEvent();

        expect(setChannelsStub).toHaveBeenCalledTimes(0);
      });

      it('should update the state if only pinned channels should be considered', () => {
        shouldConsiderPinnedChannelsStub.mockReturnValueOnce(true);
        shouldConsiderArchivedChannelsStub.mockReturnValueOnce(false);
        dispatchMemberUpdatedEvent();

        expect(setChannelsStub).toHaveBeenCalledOnce();
      });

      it('should update the state if only archived channels should be considered', () => {
        shouldConsiderPinnedChannelsStub.mockReturnValueOnce(false);
        shouldConsiderArchivedChannelsStub.mockReturnValueOnce(true);
        dispatchMemberUpdatedEvent();

        expect(setChannelsStub).toHaveBeenCalledOnce();
      });

      it('should handle archiving correctly', () => {
        channelManager.state.next((prevState) => ({
          ...prevState,
          pagination: { ...prevState.pagination, filters: { archived: true } },
        }));
        isChannelArchivedStub.mockReturnValueOnce(true);
        shouldConsiderArchivedChannelsStub.mockReturnValueOnce(true);
        shouldConsiderPinnedChannelsStub.mockReturnValueOnce(true);
        dispatchMemberUpdatedEvent();

        expect(setChannelsStub).toHaveBeenCalledOnce();
        expect(
          (setChannelsStub.mock.calls[0][0] as Channel[]).map((c) => c.id),
        ).to.deep.equal(['channel2', 'channel1', 'channel3']);
      });

      it('should pin channel at the correct position when pinnedAtSort is 1', () => {
        isChannelPinnedStub.mockReturnValueOnce(false);
        shouldConsiderPinnedChannelsStub.mockReturnValueOnce(true);
        findLastPinnedChannelIndexStub.mockReturnValueOnce(0);
        extractSortValueStub.mockReturnValueOnce(1);
        dispatchMemberUpdatedEvent('channel3');

        expect(setChannelsStub).toHaveBeenCalledOnce();
        expect(
          (setChannelsStub.mock.calls[0][0] as Channel[]).map((c) => c.id),
        ).to.deep.equal(['channel1', 'channel3', 'channel2']);
      });

      it('should pin channel at the correct position when pinnedAtSort is -1 and the target is not pinned', () => {
        isChannelPinnedStub.mockImplementationOnce((c) => c.id === 'channel1');
        shouldConsiderPinnedChannelsStub.mockReturnValueOnce(true);
        findLastPinnedChannelIndexStub.mockReturnValueOnce(0);
        extractSortValueStub.mockReturnValueOnce(-1);
        dispatchMemberUpdatedEvent('channel3');

        expect(setChannelsStub).toHaveBeenCalledOnce();
        expect(
          (setChannelsStub.mock.calls[0][0] as Channel[]).map((c) => c.id),
        ).to.deep.equal(['channel1', 'channel3', 'channel2']);
      });

      it('should pin channel at the correct position when pinnedAtSort is -1 and the target is pinned', () => {
        isChannelPinnedStub.mockImplementationOnce((c) =>
          ['channel1', 'channel3'].includes(c.id!),
        );
        shouldConsiderPinnedChannelsStub.mockReturnValueOnce(true);
        findLastPinnedChannelIndexStub.mockReturnValueOnce(0);
        extractSortValueStub.mockReturnValueOnce(-1);
        dispatchMemberUpdatedEvent('channel3');

        expect(setChannelsStub).toHaveBeenCalledOnce();
        expect(
          (setChannelsStub.mock.calls[0][0] as Channel[]).map((c) => c.id),
        ).to.deep.equal(['channel3', 'channel1', 'channel2']);
      });

      it('should not update state if position of target channel does not change', () => {
        isChannelPinnedStub.mockReturnValueOnce(false);
        shouldConsiderPinnedChannelsStub.mockReturnValueOnce(true);
        findLastPinnedChannelIndexStub.mockReturnValueOnce(0);
        extractSortValueStub.mockReturnValueOnce(1);
        dispatchMemberUpdatedEvent();

        const { channels } = channelManager.state.getLatestValue();

        expect(setChannelsStub).toHaveBeenCalledTimes(0);
        expect(channels[1].id).to.equal('channel2');
      });
    });

    describe('notificationAddedToChannelHandler', () => {
      let clock: sinon.SinonFakeTimers;

      beforeEach(() => {
        clock = sinon.useFakeTimers();
      });

      afterEach(() => {
        clock.restore();
      });

      it('should not update state if event.channel defaults are missing', async () => {
        client.dispatchEvent({ type: 'notification.added_to_channel' });
        await clock.runAllAsync();
        expect(setChannelsStub).toHaveBeenCalledTimes(0);

        client.dispatchEvent({
          type: 'notification.added_to_channel',
          channel: { id: '123' } as unknown as ChannelResponse,
        });
        await clock.runAllAsync();
        expect(setChannelsStub).toHaveBeenCalledTimes(0);
      });

      it('should not update state if allowNotLoadedChannelPromotionForEvent["notification.added_to_channel"] is false', async () => {
        const newChannelResponse = generateChannel({ channel: { id: 'channel4' } });
        const newChannel = client.channel(
          newChannelResponse.channel.type,
          newChannelResponse.channel.id,
        );
        getAndWatchChannelStub.mockResolvedValueOnce(newChannel);
        channelManager.setOptions({
          allowNotLoadedChannelPromotionForEvent: {
            'channel.visible': true,
            'message.new': true,
            'notification.added_to_channel': false,
            'notification.message_new': true,
          },
        });
        client.dispatchEvent({
          type: 'notification.added_to_channel',
          channel: {
            id: 'channel4',
            type: 'messaging',
            members: [{ user_id: 'user1' }],
          } as unknown as ChannelResponse,
        });

        await clock.runAllAsync();

        expect(setChannelsStub).toHaveBeenCalledTimes(0);
        channelManager.setOptions({});
      });

      it('should call getAndWatchChannel with correct parameters', async () => {
        const newChannelResponse = generateChannel({ channel: { id: 'channel4' } });
        const newChannel = client.channel(
          newChannelResponse.channel.type,
          newChannelResponse.channel.id,
        );
        getAndWatchChannelStub.mockResolvedValueOnce(newChannel);
        client.dispatchEvent({
          type: 'notification.added_to_channel',
          channel: {
            id: 'channel4',
            type: 'messaging',
            members: [{ user_id: 'user1' }],
          } as unknown as ChannelResponse,
        });

        await clock.runAllAsync();

        expect(getAndWatchChannelStub).toHaveBeenCalledOnce();
        expect(getAndWatchChannelStub.mock.calls[0][0]).to.deep.equal({
          client,
          id: 'channel4',
          type: 'messaging',
          members: ['user1'],
        });
      });

      it('should move the channel upwards when criteria is met', async () => {
        const newChannelResponse = generateChannel({ channel: { id: 'channel4' } });
        const newChannel = client.channel(
          newChannelResponse.channel.type,
          newChannelResponse.channel.id,
        );
        getAndWatchChannelStub.mockResolvedValue(newChannel);

        const stateBefore = channelManager.state.getLatestValue();

        client.dispatchEvent({
          type: 'notification.added_to_channel',
          channel: {
            id: 'channel4',
            type: 'messaging',
            members: [{ user_id: 'user1' }],
          } as unknown as ChannelResponse,
        });

        await clock.runAllAsync();

        const stateAfter = channelManager.state.getLatestValue();

        expect(setChannelsStub).toHaveBeenCalledOnce();
        expect(promoteChannelSpy).toHaveBeenCalledOnce();
        expect(stateBefore.channels.map((c) => c.cid)).toMatchInlineSnapshot(`
          [
            "messaging:channel1",
            "messaging:channel2",
            "messaging:channel3",
          ]
        `);
        expect(stateAfter.channels.map((c) => c.cid)).toMatchInlineSnapshot(`
          [
            "messaging:channel4",
            "messaging:channel1",
            "messaging:channel2",
            "messaging:channel3",
          ]
        `);
      });
    });
  });
});
