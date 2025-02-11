import { expect } from 'chai';
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
} from '../../src';

import { generateChannel } from './test-utils/generateChannel';
import { getClientWithUser } from './test-utils/getClient';
import * as Utils from '../../src/utils';

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
    const channels = channelsResponse.map((c) => client.channel(c.channel.type, c.channel.id));
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

    it('should properly set eventHandlerOverrides and options if they are passed', () => {
      const eventHandlerOverrides = { newMessageHandler: () => {} };
      const options = { allowNewMessagesFromUnfilteredChannels: false };
      const newChannelManager = client.createChannelManager({ eventHandlerOverrides, options });

      expect(Object.fromEntries((newChannelManager as any).eventHandlerOverrides)).to.deep.equal(eventHandlerOverrides);
      expect((newChannelManager as any).options).to.deep.equal({ ...DEFAULT_CHANNEL_MANAGER_OPTIONS, ...options });
    });

    it('should properly set the default event handlers', () => {
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
    });
  });

  describe('setters', () => {
    it('should properly set eventHandlerOverrides and filter out falsy values', () => {
      const eventHandlerOverrides = { newMessageHandler: () => {}, channelDeletedHandler: () => {} };

      channelManager.setEventHandlerOverrides(eventHandlerOverrides);
      expect(Object.fromEntries((channelManager as any).eventHandlerOverrides)).to.deep.equal(eventHandlerOverrides);

      channelManager.setEventHandlerOverrides({
        ...eventHandlerOverrides,
        notificationRemovedFromChannelHandler: undefined,
        channelHiddenHandler: undefined,
      });
      expect(Object.fromEntries((channelManager as any).eventHandlerOverrides)).to.deep.equal(eventHandlerOverrides);
    });

    it('should properly set options', () => {
      const options = {
        lockChannelOrder: true,
        allowNewMessagesFromUnfilteredChannels: false,
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

        expect(newChannels.map((c) => c.id)).to.deep.equal(['channel3', 'channel2', 'channel1']);
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

      const originalNewMessageHandler = (newChannelManager as any).eventHandlers.get('newMessageHandler');
      const originalNotificationAddedToChannelHandler = (newChannelManager as any).eventHandlers.get(
        'notificationAddedToChannelHandler',
      );

      const newMessageHandlerSpy = sinon.spy(originalNewMessageHandler);
      const notificationAddedToChannelHandlerSpy = sinon.spy(originalNotificationAddedToChannelHandler);
      const clientOnSpy = sinon.spy(client, 'on');

      (newChannelManager as any).eventHandlers.set('newMessageHandler', newMessageHandlerSpy);
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

      expect(clientOnSpy.callCount).to.equal(Object.keys(channelManagerEventToHandlerMapping).length);
      Object.keys(channelManagerEventToHandlerMapping).forEach((eventType) => {
        expect(clientOnSpy.calledWith(eventType)).to.be.true;
      });
    });

    it('should unregister subscriptions if unregisterSubscriptions is called', () => {
      const newChannelManager = client.createChannelManager({});

      const originalNewMessageHandler = (newChannelManager as any).eventHandlers.get('newMessageHandler');
      const originalNotificationAddedToChannelHandler = (newChannelManager as any).eventHandlers.get(
        'notificationAddedToChannelHandler',
      );

      const newMessageHandlerSpy = sinon.spy(originalNewMessageHandler);
      const notificationAddedToChannelHandlerSpy = sinon.spy(originalNotificationAddedToChannelHandler);

      (newChannelManager as any).eventHandlers.set('newMessageHandler', newMessageHandlerSpy);
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

      const originalNewMessageHandler = (newChannelManager as any).eventHandlers.get('newMessageHandler');
      const originalNotificationAddedToChannelHandler = (newChannelManager as any).eventHandlers.get(
        'notificationAddedToChannelHandler',
      );

      const newMessageHandlerSpy = sinon.spy(originalNewMessageHandler);
      const notificationAddedToChannelHandlerSpy = sinon.spy(originalNotificationAddedToChannelHandler);
      const newMessageHandlerOverrideSpy = sinon.spy(() => {});

      (newChannelManager as any).eventHandlers.set('newMessageHandler', newMessageHandlerSpy);
      (newChannelManager as any).eventHandlers.set(
        'notificationAddedToChannelHandler',
        notificationAddedToChannelHandlerSpy,
      );

      newChannelManager.registerSubscriptions();
      newChannelManager.setEventHandlerOverrides({ newMessageHandler: newMessageHandlerOverrideSpy });

      client.dispatchEvent({ type: 'message.new' });
      client.dispatchEvent({ type: 'notification.added_to_channel' });

      expect(newMessageHandlerSpy.called).to.be.false;
      expect(newMessageHandlerOverrideSpy.called).to.be.true;
      expect(notificationAddedToChannelHandlerSpy.called).to.be.true;
    });
  });

  describe('querying and pagination', () => {
    let clientQueryChannelsStub: sinon.SinonStub;
    let mockChannelPages: Array<Array<Channel>>;
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
        return channelQueryResponse.map((c) => client.channel(c.channel.type, c.channel.id));
      });
      clientQueryChannelsStub = sinon.stub(client, 'queryChannels').callsFake((_filters, _sort, options) => {
        const offset = options?.offset ?? 0;
        return Promise.resolve(mockChannelPages[offset / 10]);
      });
    });

    afterEach(() => {
      sinon.restore();
      sinon.reset();
    });

    describe('queryChannels', () => {
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
        await Promise.all([channelManager.queryChannels({}), channelManager.queryChannels({})]);
        expect(clientQueryChannelsStub.calledOnce).to.be.true;
      });

      it('should query more than once if channelManager.options.abortInFlightQuery is true', async () => {
        channelManager.setOptions({ abortInFlightQuery: true });
        await Promise.all([channelManager.queryChannels({}), channelManager.queryChannels({})]);
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

      it('should properly set the new pagination parameters and update the offset after the query', async () => {
        const stateChangeSpy = sinon.spy();
        channelManager.state.subscribeWithSelector(
          (nextValue) => ({ pagination: nextValue.pagination }),
          stateChangeSpy,
        );
        stateChangeSpy.resetHistory();

        await channelManager.queryChannels({ filterA: true }, { asc: 1 }, { limit: 10, offset: 0 });

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
        await channelManager.queryChannels({ filterA: true }, { asc: 1 }, { limit: 10, offset: 0 });

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
        await channelManager.queryChannels({ filterA: true }, { asc: 1 }, { limit: 10, offset: 0 });

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

      it('should correctly update hasNext and offset if the last page has been reached', async () => {
        const { channels: initialChannels } = channelManager.state.getLatestValue();
        expect(initialChannels.length).to.equal(0);

        await channelManager.queryChannels({ filterA: true }, { asc: 1 }, { limit: 10, offset: 0 });
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
    });
  });

  describe('websocket event handlers', () => {
    let setChannelsStub: sinon.SinonStub;
    let isChannelPinnedStub: sinon.SinonStub;
    let isChannelArchivedStub: sinon.SinonStub;
    let shouldConsiderArchivedChannelsStub: sinon.SinonStub;
    let shouldConsiderPinnedChannelsStub: sinon.SinonStub;
    let promoteChannelSpy: sinon.SinonSpy;
    let getAndWatchChannelStub: sinon.SinonStub;
    let findLastPinnedChannelIndexStub: sinon.SinonStub;
    let extractSortValueStub: sinon.SinonStub;

    beforeEach(() => {
      setChannelsStub = sinon.stub(channelManager, 'setChannels');
      isChannelPinnedStub = sinon.stub(Utils, 'isChannelPinned');
      isChannelArchivedStub = sinon.stub(Utils, 'isChannelArchived');
      shouldConsiderArchivedChannelsStub = sinon.stub(Utils, 'shouldConsiderArchivedChannels');
      shouldConsiderPinnedChannelsStub = sinon.stub(Utils, 'shouldConsiderPinnedChannels');
      getAndWatchChannelStub = sinon.stub(Utils, 'getAndWatchChannel');
      findLastPinnedChannelIndexStub = sinon.stub(Utils, 'findLastPinnedChannelIndex');
      extractSortValueStub = sinon.stub(Utils, 'extractSortValue');
      promoteChannelSpy = sinon.spy(Utils, 'promoteChannel');
    });

    afterEach(() => {
      sinon.restore();
      sinon.reset();
    });

    describe('channelDeletedHandler, channelHiddenHandler and notificationRemovedFromChannelHandler', () => {
      let channelToRemove: ChannelResponse;

      beforeEach(() => {
        channelToRemove = channelsResponse[1].channel;
      });

      (['channel.deleted', 'channel.hidden', 'notification.removed_from_channel'] as const).forEach((eventType) => {
        it('should return early if channels is undefined', () => {
          channelManager.state.partialNext({ channels: undefined });

          client.dispatchEvent({ type: eventType, cid: channelToRemove.cid });
          client.dispatchEvent({ type: eventType, channel: channelToRemove });

          expect(setChannelsStub.called).to.be.false;
        });

        it('should remove the channel when event.cid matches', () => {
          client.dispatchEvent({ type: eventType, cid: channelToRemove.cid });

          expect(setChannelsStub.calledOnce).to.be.true;
          expect(setChannelsStub.args[0][0].map((c: ChannelResponse) => c.id)).to.deep.equal(['channel1', 'channel3']);
        });

        it('should remove the channel when event.channel?.cid matches', () => {
          client.dispatchEvent({ type: eventType, channel: channelToRemove });

          expect(setChannelsStub.calledOnce).to.be.true;
          expect(setChannelsStub.args[0][0].map((c: ChannelResponse) => c.id)).to.deep.equal(['channel1', 'channel3']);
        });

        it('should not modify the list if no channels match', () => {
          const { channels: prevChannels } = channelManager.state.getLatestValue();
          client.dispatchEvent({ type: eventType, cid: 'channel123' });
          const { channels: newChannels } = channelManager.state.getLatestValue();

          expect(setChannelsStub.called).to.be.false;
          expect(prevChannels).to.equal(newChannels);
          expect(prevChannels).to.deep.equal(newChannels);
        });
      });
    });

    describe('newMessageHandler', () => {
      it('should not update the state early if channels are not defined', () => {
        channelManager.state.partialNext({ channels: undefined });

        client.dispatchEvent({ type: 'message.new', channel_type: 'messaging', channel_id: 'channel2' });

        expect(setChannelsStub.called).to.be.false;
      });

      it('should not update the state if channel is pinned and sorting considers pinned channels', () => {
        const { channels: prevChannels } = channelManager.state.getLatestValue();
        isChannelPinnedStub.returns(true);
        shouldConsiderPinnedChannelsStub.returns(true);

        client.dispatchEvent({ type: 'message.new', channel_type: 'messaging', channel_id: 'channel2' });

        const { channels: newChannels } = channelManager.state.getLatestValue();

        expect(setChannelsStub.called).to.be.false;
        expect(prevChannels).to.equal(newChannels);
        expect(prevChannels).to.deep.equal(newChannels);
      });

      it('should not update the state if channel is archived and sorting considers archived channels, but the filter is false', () => {
        const { channels: prevChannels } = channelManager.state.getLatestValue();
        channelManager.state.next((prevState) => ({
          ...prevState,
          pagination: { ...prevState.pagination, filters: { archived: false } },
        }));
        isChannelArchivedStub.returns(true);
        shouldConsiderArchivedChannelsStub.returns(true);

        client.dispatchEvent({ type: 'message.new', channel_type: 'messaging', channel_id: 'channel2' });

        const { channels: newChannels } = channelManager.state.getLatestValue();

        expect(setChannelsStub.called).to.be.false;
        expect(prevChannels).to.equal(newChannels);
        expect(prevChannels).to.deep.equal(newChannels);
      });

      it('should not update the state if channel is not archived and sorting considers archived channels, but the filter is true', () => {
        const { channels: prevChannels } = channelManager.state.getLatestValue();
        channelManager.state.next((prevState) => ({
          ...prevState,
          pagination: { ...prevState.pagination, filters: { archived: true } },
        }));
        isChannelArchivedStub.returns(false);
        shouldConsiderArchivedChannelsStub.returns(true);

        client.dispatchEvent({ type: 'message.new', channel_type: 'messaging', channel_id: 'channel2' });

        const { channels: newChannels } = channelManager.state.getLatestValue();

        expect(setChannelsStub.called).to.be.false;
        expect(prevChannels).to.equal(newChannels);
        expect(prevChannels).to.deep.equal(newChannels);
      });

      it('should not update the state if channelManager.options.lockChannelOrder is true', () => {
        const { channels: prevChannels } = channelManager.state.getLatestValue();
        channelManager.setOptions({ lockChannelOrder: true });

        client.dispatchEvent({ type: 'message.new', channel_type: 'messaging', channel_id: 'channel2' });

        const { channels: newChannels } = channelManager.state.getLatestValue();

        expect(setChannelsStub.called).to.be.false;
        expect(prevChannels).to.equal(newChannels);
        expect(prevChannels).to.deep.equal(newChannels);

        channelManager.setOptions({});
      });

      it('should not update the state if the channel is not part of the list and allowNewMessagesFromUnfilteredChannels if false', () => {
        const { channels: prevChannels } = channelManager.state.getLatestValue();
        isChannelPinnedStub.returns(false);
        isChannelArchivedStub.returns(false);
        shouldConsiderArchivedChannelsStub.returns(false);
        shouldConsiderPinnedChannelsStub.returns(false);
        channelManager.setOptions({ allowNewMessagesFromUnfilteredChannels: false });

        client.dispatchEvent({ type: 'message.new', channel_type: 'messaging', channel_id: 'channel4' });

        const { channels: newChannels } = channelManager.state.getLatestValue();

        expect(setChannelsStub.called).to.be.false;
        expect(prevChannels).to.equal(newChannels);
        expect(prevChannels).to.deep.equal(newChannels);

        channelManager.setOptions({});
      });

      it('should move the channel upwards if it is not part of the list and allowNewMessagesFromUnfilteredChannels is true', () => {
        isChannelPinnedStub.returns(false);
        isChannelArchivedStub.returns(false);
        shouldConsiderArchivedChannelsStub.returns(false);
        shouldConsiderPinnedChannelsStub.returns(false);

        client.dispatchEvent({ type: 'message.new', channel_type: 'messaging', channel_id: 'channel4' });

        const {
          pagination: { sort },
          channels,
        } = channelManager.state.getLatestValue();
        const promoteChannelArgs = promoteChannelSpy.args[0][0];
        const newChannel = client.channel('messaging', 'channel4');

        expect(setChannelsStub.calledOnce).to.be.true;
        expect(promoteChannelSpy.calledOnce).to.be.true;
        expect(promoteChannelArgs).to.deep.equal({
          channels,
          channelToMove: newChannel,
          channelToMoveIndexWithinChannels: -1,
          sort,
        });
        expect(setChannelsStub.args[0][0]).to.deep.equal(Utils.promoteChannel(promoteChannelArgs));
      });

      it('should move the channel upwards if all conditions allow it', () => {
        isChannelPinnedStub.returns(false);
        isChannelArchivedStub.returns(false);
        shouldConsiderArchivedChannelsStub.returns(false);
        shouldConsiderPinnedChannelsStub.returns(false);

        client.dispatchEvent({ type: 'message.new', channel_type: 'messaging', channel_id: 'channel2' });

        const {
          pagination: { sort },
          channels,
        } = channelManager.state.getLatestValue();
        const promoteChannelArgs = promoteChannelSpy.args[0][0];

        expect(setChannelsStub.calledOnce).to.be.true;
        expect(promoteChannelSpy.calledOnce).to.be.true;
        expect(promoteChannelArgs).to.deep.equal({
          channels,
          channelToMove: channels[1],
          channelToMoveIndexWithinChannels: 1,
          sort,
        });
        expect(setChannelsStub.args[0][0]).to.deep.equal(Utils.promoteChannel(promoteChannelArgs));
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
        client.dispatchEvent({ type: 'notification.message_new', channel: ({} as unknown) as ChannelResponse });

        await clock.runAllAsync();

        expect(getAndWatchChannelStub.called).to.be.false;
        expect(setChannelsStub.called).to.be.false;
      });

      it('should execute getAndWatchChannel if id and type are provided', async () => {
        const newChannelResponse = generateChannel({ channel: { id: 'channel4' } });
        const newChannel = client.channel(newChannelResponse.channel.type, newChannelResponse.channel.id);
        getAndWatchChannelStub.resolves(newChannel);
        client.dispatchEvent({
          type: 'notification.message_new',
          channel: ({ type: 'messaging', id: 'channel4' } as unknown) as ChannelResponse,
        });

        await clock.runAllAsync();

        expect(getAndWatchChannelStub.calledOnce).to.be.true;
        expect(getAndWatchChannelStub.calledWith({ client, id: 'channel4', type: 'messaging' })).to.be.true;
      });

      it('should not update the state if channel is archived and filters do not allow it', async () => {
        isChannelArchivedStub.returns(true);
        shouldConsiderArchivedChannelsStub.returns(true);
        channelManager.state.next((prevState) => ({
          ...prevState,
          pagination: { ...prevState.pagination, filters: { archived: false } },
        }));

        client.dispatchEvent({
          type: 'notification.message_new',
          channel: ({ type: 'messaging', id: 'channel4' } as unknown) as ChannelResponse,
        });

        await clock.runAllAsync();

        expect(getAndWatchChannelStub.called).to.be.true;
        expect(setChannelsStub.called).to.be.false;
      });

      it('should not update the state if channel is not archived and and filters allow it', async () => {
        isChannelArchivedStub.returns(false);
        shouldConsiderArchivedChannelsStub.returns(true);
        channelManager.state.next((prevState) => ({
          ...prevState,
          pagination: { ...prevState.pagination, filters: { archived: true } },
        }));

        client.dispatchEvent({
          type: 'notification.message_new',
          channel: ({ type: 'messaging', id: 'channel4' } as unknown) as ChannelResponse,
        });

        await clock.runAllAsync();

        expect(getAndWatchChannelStub.called).to.be.true;
        expect(setChannelsStub.called).to.be.false;
      });

      it('should not update the state if allowNewMessagesFromUnfilteredChannels is false', async () => {
        channelManager.setOptions({ allowNewMessagesFromUnfilteredChannels: false });
        client.dispatchEvent({
          type: 'notification.message_new',
          channel: ({ type: 'messaging', id: 'channel4' } as unknown) as ChannelResponse,
        });

        await clock.runAllAsync();

        expect(getAndWatchChannelStub.called).to.be.true;
        expect(setChannelsStub.called).to.be.false;

        channelManager.setOptions({});
      });

      it('should move channel when all criteria are met', async () => {
        const newChannelResponse = generateChannel({ channel: { id: 'channel4' } });
        const newChannel = client.channel(newChannelResponse.channel.type, newChannelResponse.channel.id);
        getAndWatchChannelStub.resolves(newChannel);
        client.dispatchEvent({
          type: 'notification.message_new',
          channel: ({ type: 'messaging', id: 'channel4' } as unknown) as ChannelResponse,
        });

        await clock.runAllAsync();

        const {
          pagination: { sort },
          channels,
        } = channelManager.state.getLatestValue();
        const promoteChannelArgs = promoteChannelSpy.args[0][0];

        expect(getAndWatchChannelStub.calledOnce).to.be.true;
        expect(promoteChannelSpy.calledOnce).to.be.true;
        expect(setChannelsStub.calledOnce).to.be.true;
        expect(promoteChannelArgs).to.deep.equal({ channels, channelToMove: newChannel, sort });
        expect(setChannelsStub.args[0][0]).to.deep.equal(Utils.promoteChannel(promoteChannelArgs));
      });

      it('should not add duplicate channels for multiple event invocations', async () => {
        const newChannelResponse = generateChannel({ channel: { id: 'channel4' } });
        const newChannel = client.channel(newChannelResponse.channel.type, newChannelResponse.channel.id);
        getAndWatchChannelStub.resolves(newChannel);

        const event = {
          type: 'notification.message_new',
          channel: ({ type: 'messaging', id: 'channel4' } as unknown) as ChannelResponse,
        } as const;
        // call the event 3 times
        client.dispatchEvent(event);
        client.dispatchEvent(event);
        client.dispatchEvent(event);

        await clock.runAllAsync();

        const {
          pagination: { sort },
          channels,
        } = channelManager.state.getLatestValue();
        const promoteChannelArgs = { channels, channelToMove: newChannel, sort };

        expect(getAndWatchChannelStub.callCount).to.equal(3);
        expect(promoteChannelSpy.callCount).to.equal(3);
        expect(setChannelsStub.callCount).to.equal(3);
        promoteChannelSpy.args.forEach((arg) => {
          expect(arg[0]).to.deep.equal(promoteChannelArgs);
        });
        setChannelsStub.args.forEach((arg) => {
          expect(arg[0]).to.deep.equal(Utils.promoteChannel(promoteChannelArgs));
        });
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
        client.dispatchEvent({ type: 'channel.visible', channel: ({} as unknown) as ChannelResponse });

        await clock.runAllAsync();

        expect(getAndWatchChannelStub.called).to.be.false;
        expect(setChannelsStub.called).to.be.false;
      });

      it('should not update the state if channels is undefined', async () => {
        channelManager.state.partialNext({ channels: undefined });
        client.dispatchEvent({ type: 'channel.visible', channel_id: 'channel4', channel_type: 'messaging' });

        await clock.runAllAsync();

        expect(getAndWatchChannelStub.called).to.be.false;
        expect(setChannelsStub.called).to.be.false;
      });

      it('should not update the state if the channel is archived and filters do not allow it', async() => {
        isChannelArchivedStub.returns(true);
        shouldConsiderArchivedChannelsStub.returns(true);
        channelManager.state.next((prevState) => ({
          ...prevState,
          pagination: { ...prevState.pagination, filters: { archived: false } },
        }));

        client.dispatchEvent({ type: 'channel.visible', channel_id: 'channel4', channel_type: 'messaging' });

        await clock.runAllAsync();

        expect(getAndWatchChannelStub.called).to.be.true;
        expect(setChannelsStub.called).to.be.false;
      })

      it('should not update the state if the channel is archived and filters do not allow it', async() => {
        isChannelArchivedStub.returns(false);
        shouldConsiderArchivedChannelsStub.returns(true);
        channelManager.state.next((prevState) => ({
          ...prevState,
          pagination: { ...prevState.pagination, filters: { archived: true } },
        }));

        client.dispatchEvent({ type: 'channel.visible', channel_id: 'channel4', channel_type: 'messaging' });

        await clock.runAllAsync();

        expect(getAndWatchChannelStub.called).to.be.true;
        expect(setChannelsStub.called).to.be.false;
      })

      it('should add the channel to the list if all criteria are met', async () => {
        const newChannelResponse = generateChannel({ channel: { id: 'channel4' } });
        const newChannel = client.channel(newChannelResponse.channel.type, newChannelResponse.channel.id);
        getAndWatchChannelStub.resolves(newChannel);
        client.dispatchEvent({ type: 'channel.visible', channel_id: 'channel4', channel_type: 'messaging' });

        await clock.runAllAsync();

        const {
          pagination: { sort },
          channels,
        } = channelManager.state.getLatestValue();
        const promoteChannelArgs = promoteChannelSpy.args[0][0];

        expect(getAndWatchChannelStub.calledOnce).to.be.true;
        expect(promoteChannelSpy.calledOnce).to.be.true;
        expect(setChannelsStub.calledOnce).to.be.true;
        expect(promoteChannelArgs).to.deep.equal({ channels, channelToMove: newChannel, sort });
        expect(setChannelsStub.args[0][0]).to.deep.equal(Utils.promoteChannel(promoteChannelArgs));
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
        expect(setChannelsStub.calledOnce).to.be.false;

        client.dispatchEvent({ type: 'member.updated', channel_id: 'channel2', channel_type: 'messaging', member: {} });
        expect(setChannelsStub.calledOnce).to.be.false;
      });

      it('should not update state if channel_type or channel_id is not present', () => {
        client.dispatchEvent({ type: 'member.updated', member: { user: { id: 'user123' } } });
        expect(setChannelsStub.calledOnce).to.be.false;
        client.dispatchEvent({
          type: 'member.updated',
          member: { user: { id: 'user123' } },
          channel_type: 'messaging',
        });
        expect(setChannelsStub.calledOnce).to.be.false;
        client.dispatchEvent({ type: 'member.updated', member: { user: { id: 'user123' } }, channel_id: 'channel2' });
        expect(setChannelsStub.calledOnce).to.be.false;
      });

      it('should not update state early if channels are not available in state', () => {
        channelManager.state.partialNext({ channels: undefined });
        dispatchMemberUpdatedEvent();

        expect(setChannelsStub.calledOnce).to.be.false;
      });

      it('should not update state if options.lockChannelOrder is true', () => {
        channelManager.setOptions({ lockChannelOrder: true });
        dispatchMemberUpdatedEvent();

        expect(setChannelsStub.calledOnce).to.be.false;
      });

      it('should not update state if neither channel pinning nor archiving should not be considered', () => {
        shouldConsiderPinnedChannelsStub.returns(false);
        shouldConsiderArchivedChannelsStub.returns(false);
        dispatchMemberUpdatedEvent();

        expect(setChannelsStub.calledOnce).to.be.false;
      });

      it('should update the state if only pinned channels should be considered', () => {
        shouldConsiderPinnedChannelsStub.returns(true);
        shouldConsiderArchivedChannelsStub.returns(false);
        dispatchMemberUpdatedEvent();

        expect(setChannelsStub.calledOnce).to.be.true;
      });

      it('should update the state if only archived channels should be considered', () => {
        shouldConsiderPinnedChannelsStub.returns(false);
        shouldConsiderArchivedChannelsStub.returns(true);
        dispatchMemberUpdatedEvent();

        expect(setChannelsStub.calledOnce).to.be.true;
      });

      it('should handle archiving correctly', () => {
        channelManager.state.next((prevState) => ({
          ...prevState,
          pagination: { ...prevState.pagination, filters: { archived: true } },
        }));
        isChannelArchivedStub.returns(true);
        shouldConsiderArchivedChannelsStub.returns(true);
        shouldConsiderPinnedChannelsStub.returns(true);
        dispatchMemberUpdatedEvent();

        expect(setChannelsStub.calledOnce).to.be.true;
        expect(setChannelsStub.args[0][0].map((c: ChannelResponse) => c.id)).to.deep.equal([
          'channel2',
          'channel1',
          'channel3',
        ]);
      });

      it('should pin channel at the correct position when pinnedAtSort is 1', () => {
        isChannelPinnedStub.returns(false);
        shouldConsiderPinnedChannelsStub.returns(true);
        findLastPinnedChannelIndexStub.returns(0);
        extractSortValueStub.returns(1);
        dispatchMemberUpdatedEvent('channel3');

        expect(setChannelsStub.calledOnce).to.be.true;
        expect(setChannelsStub.args[0][0].map((c: ChannelResponse) => c.id)).to.deep.equal([
          'channel1',
          'channel3',
          'channel2',
        ]);
      });

      it('should pin channel at the correct position when pinnedAtSort is -1 and the target is not pinned', () => {
        isChannelPinnedStub.callsFake((c) => c.id === 'channel1');
        shouldConsiderPinnedChannelsStub.returns(true);
        findLastPinnedChannelIndexStub.returns(0);
        extractSortValueStub.returns(-1);
        dispatchMemberUpdatedEvent('channel3');

        expect(setChannelsStub.calledOnce).to.be.true;
        expect(setChannelsStub.args[0][0].map((c: ChannelResponse) => c.id)).to.deep.equal([
          'channel1',
          'channel3',
          'channel2',
        ]);
      });

      it('should pin channel at the correct position when pinnedAtSort is -1 and the target is pinned', () => {
        isChannelPinnedStub.callsFake((c) => ['channel1', 'channel3'].includes(c.id));
        shouldConsiderPinnedChannelsStub.returns(true);
        findLastPinnedChannelIndexStub.returns(0);
        extractSortValueStub.returns(-1);
        dispatchMemberUpdatedEvent('channel3');

        expect(setChannelsStub.calledOnce).to.be.true;
        expect(setChannelsStub.args[0][0].map((c: ChannelResponse) => c.id)).to.deep.equal([
          'channel3',
          'channel1',
          'channel2',
        ]);
      });

      it('should not update state if position of target channel does not change', () => {
        isChannelPinnedStub.returns(false);
        shouldConsiderPinnedChannelsStub.returns(true);
        findLastPinnedChannelIndexStub.returns(0);
        extractSortValueStub.returns(1);
        dispatchMemberUpdatedEvent();

        const { channels } = channelManager.state.getLatestValue();

        expect(setChannelsStub.calledOnce).to.be.false;
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
        expect(setChannelsStub.calledOnce).to.be.false;

        client.dispatchEvent({
          type: 'notification.added_to_channel',
          channel: ({ id: '123' } as unknown) as ChannelResponse,
        });
        await clock.runAllAsync();
        expect(setChannelsStub.calledOnce).to.be.false;
      });

      it('should not update state if allowNewMessagesFromUnfilteredChannels is false', async () => {
        channelManager.setOptions({ allowNewMessagesFromUnfilteredChannels: false });
        client.dispatchEvent({
          type: 'notification.added_to_channel',
          channel: ({
            id: 'channel4',
            type: 'messaging',
            members: [{ user_id: 'user1' }],
          } as unknown) as ChannelResponse,
        });

        expect(setChannelsStub.calledOnce).to.be.false;
        channelManager.setOptions({});
      });

      it('should call getAndWatchChannel with correct parameters', async () => {
        const newChannelResponse = generateChannel({ channel: { id: 'channel4' } });
        const newChannel = client.channel(newChannelResponse.channel.type, newChannelResponse.channel.id);
        getAndWatchChannelStub.resolves(newChannel);
        client.dispatchEvent({
          type: 'notification.added_to_channel',
          channel: ({
            id: 'channel4',
            type: 'messaging',
            members: [{ user_id: 'user1' }],
          } as unknown) as ChannelResponse,
        });

        await clock.runAllAsync();

        expect(getAndWatchChannelStub.calledOnce).to.be.true;
        expect(getAndWatchChannelStub.args[0][0]).to.deep.equal({
          client,
          id: 'channel4',
          type: 'messaging',
          members: ['user1'],
        });
      });

      it('should move the channel upwards when criteria is met', async () => {
        const newChannelResponse = generateChannel({ channel: { id: 'channel4' } });
        const newChannel = client.channel(newChannelResponse.channel.type, newChannelResponse.channel.id);
        getAndWatchChannelStub.resolves(newChannel);
        client.dispatchEvent({
          type: 'notification.added_to_channel',
          channel: ({
            id: 'channel4',
            type: 'messaging',
            members: [{ user_id: 'user1' }],
          } as unknown) as ChannelResponse,
        });

        await clock.runAllAsync();

        const {
          pagination: { sort },
          channels,
        } = channelManager.state.getLatestValue();
        const promoteChannelArgs = promoteChannelSpy.args[0][0];

        expect(setChannelsStub.calledOnce).to.be.true;
        expect(promoteChannelSpy.calledOnce).to.be.true;
        expect(promoteChannelArgs).to.deep.equal({
          channels,
          channelToMove: newChannel,
          sort,
        });
        expect(setChannelsStub.args[0][0]).to.deep.equal(Utils.promoteChannel(promoteChannelArgs));
      });
    });
  });
});
