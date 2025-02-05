import { expect } from 'chai';
import sinon from 'sinon';
import { ChannelManager, ChannelResponse, StreamChat } from '../../src';

import { generateMsg } from './test-utils/generateMessage';
import { generateChannel } from './test-utils/generateChannel';
import { generateMember } from './test-utils/generateMember';
import { generateUser } from './test-utils/generateUser';
import { getClientWithUser } from './test-utils/getClient';
import * as Utils from '../../src/utils';
import { Channel } from 'node:diagnostics_channel';
import { extractSortValue } from '../../src/utils';

describe('ChannelManager', () => {
  let client: StreamChat;
  let channelManager: ChannelManager;

  beforeEach(async () => {
    client = await getClientWithUser();
    channelManager = client.createChannelManager({});
    channelManager.registerSubscriptions();
  })

  afterEach(() => {
    sinon.restore();
    sinon.reset();
  })

  describe.only('websocket event handlers', () => {
    let setChannelsStub: sinon.SinonStub;
    let isChannelPinnedStub: sinon.SinonStub;
    let isChannelArchivedStub: sinon.SinonStub;
    let shouldConsiderArchivedChannelsStub: sinon.SinonStub;
    let shouldConsiderPinnedChannelsStub: sinon.SinonStub;
    let moveChannelUpwardsSpy: sinon.SinonSpy;
    let getAndWatchChannelStub: sinon.SinonStub;
    let findLastPinnedChannelIndexStub: sinon.SinonStub;
    let extractSortValueStub: sinon.SinonStub;
    let channelToRemove: ChannelResponse;

    beforeEach(() => {
      const channelsResponse = [generateChannel({ channel: { id: 'channel1' }}), generateChannel({ channel: { id: 'channel2' }}), generateChannel({ channel: { id: 'channel3' }})]
      client.hydrateActiveChannels(channelsResponse);
      const channels = channelsResponse.map((c) => client.channel(c.channel.type, c.channel.id));
      channelManager.state.partialNext({ channels, ready: true })
      setChannelsStub = sinon.stub(channelManager, 'setChannels');
      isChannelPinnedStub = sinon.stub(Utils, 'isChannelPinned');
      isChannelArchivedStub = sinon.stub(Utils, 'isChannelArchived');
      shouldConsiderArchivedChannelsStub = sinon.stub(Utils, 'shouldConsiderArchivedChannels');
      shouldConsiderPinnedChannelsStub = sinon.stub(Utils, 'shouldConsiderPinnedChannels');
      getAndWatchChannelStub = sinon.stub(Utils, 'getAndWatchChannel');
      findLastPinnedChannelIndexStub = sinon.stub(Utils, 'findLastPinnedChannelIndex');
      extractSortValueStub = sinon.stub(Utils, 'extractSortValue');
      moveChannelUpwardsSpy = sinon.spy(Utils, 'moveChannelUpwards');
      channelToRemove = channelsResponse[1].channel;
    })

    afterEach(() => {
      sinon.restore();
      sinon.reset();
    })

    describe('channelDeletedHandler and channelHiddenHandler', () => {
      (['channel.deleted', 'channel.hidden', 'notification.removed_from_channel'] as const).forEach((eventType) => {
        it('should return early if channels is undefined', () => {
          channelManager.state.partialNext({ channels: undefined })

          client.dispatchEvent({ type: eventType, cid: channelToRemove.cid })
          client.dispatchEvent({ type: eventType, channel: channelToRemove })

          expect(setChannelsStub.called).to.be.false;
        });

        it('should remove the channel when event.cid matches', () => {
          client.dispatchEvent({ type: eventType, cid: channelToRemove.cid })

          expect(setChannelsStub.calledOnce).to.be.true;
          expect(setChannelsStub.args[0][0].map((c: ChannelResponse) => c.id)).to.deep.equal(['channel1', 'channel3']);
        });

        it('should remove the channel when event.channel?.cid matches', () => {
          client.dispatchEvent({ type: eventType, channel: channelToRemove })

          expect(setChannelsStub.calledOnce).to.be.true;
          expect(setChannelsStub.args[0][0].map((c: ChannelResponse) => c.id)).to.deep.equal(['channel1', 'channel3']);
        });

        it('should not modify the list if no channels match', () => {
          const { channels: prevChannels } = channelManager.state.getLatestValue();
          client.dispatchEvent({ type: eventType, cid: 'channel123' })
          const { channels: newChannels } = channelManager.state.getLatestValue();

          expect(setChannelsStub.called).to.be.false;
          expect(prevChannels).to.equal(newChannels)
          expect(prevChannels).to.deep.equal(newChannels);
        });
      })
    });

    describe('newMessageHandler', () => {
      it('should not update the state early if channels are not defined', () => {
        channelManager.state.partialNext({ channels: undefined })

        client.dispatchEvent({ type: 'message.new', channel_type: 'messaging', channel_id: 'channel2' })

        expect(setChannelsStub.called).to.be.false;
      });

      it('should not update the state if channel is pinned and sorting considers pinned channels', () => {
        const { channels: prevChannels } = channelManager.state.getLatestValue();
        isChannelPinnedStub.returns(true);
        shouldConsiderPinnedChannelsStub.returns(true);

        client.dispatchEvent({ type: 'message.new', channel_type: 'messaging', channel_id: 'channel2' })

        const { channels: newChannels } = channelManager.state.getLatestValue();

        expect(setChannelsStub.called).to.be.false;
        expect(prevChannels).to.equal(newChannels);
        expect(prevChannels).to.deep.equal(newChannels);
      });

      it('should not update the state if channel is archived and sorting considers archived channels, but the filter is false', () => {
        const { channels: prevChannels } = channelManager.state.getLatestValue();
        channelManager.state.next(prevState => ({ ...prevState, pagination: { ...prevState.pagination, filters: { archived: false }}}))
        isChannelArchivedStub.returns(true);
        shouldConsiderArchivedChannelsStub.returns(true);

        client.dispatchEvent({ type: 'message.new', channel_type: 'messaging', channel_id: 'channel2' })

        const { channels: newChannels } = channelManager.state.getLatestValue();

        expect(setChannelsStub.called).to.be.false;
        expect(prevChannels).to.equal(newChannels);
        expect(prevChannels).to.deep.equal(newChannels);
      });

      it('should not update the state if channel is not archived and sorting considers archived channels, but the filter is true', () => {
        const { channels: prevChannels } = channelManager.state.getLatestValue();
        channelManager.state.next(prevState => ({ ...prevState, pagination: { ...prevState.pagination, filters: { archived: true }}}))
        isChannelArchivedStub.returns(false);
        shouldConsiderArchivedChannelsStub.returns(true);

        client.dispatchEvent({ type: 'message.new', channel_type: 'messaging', channel_id: 'channel2' })

        const { channels: newChannels } = channelManager.state.getLatestValue();

        expect(setChannelsStub.called).to.be.false;
        expect(prevChannels).to.equal(newChannels);
        expect(prevChannels).to.deep.equal(newChannels);
      });

      it('should not update the state if channelManager.options.lockChannelOrder is true', () => {
        const { channels: prevChannels } = channelManager.state.getLatestValue();
        channelManager.setOptions({ lockChannelOrder: true });

        client.dispatchEvent({ type: 'message.new', channel_type: 'messaging', channel_id: 'channel2' })

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

        client.dispatchEvent({ type: 'message.new', channel_type: 'messaging', channel_id: 'channel4' })

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

        client.dispatchEvent({ type: 'message.new', channel_type: 'messaging', channel_id: 'channel4' })

        const { pagination: { sort }, channels } = channelManager.state.getLatestValue();
        const moveChannelUpwardsArgs = moveChannelUpwardsSpy.args[0][0];
        const newChannel = client.channel('messaging', 'channel4')

        expect(setChannelsStub.calledOnce).to.be.true;
        expect(moveChannelUpwardsSpy.calledOnce).to.be.true;
        expect(moveChannelUpwardsArgs).to.deep.equal({ channels, channelToMove: newChannel, channelToMoveIndexWithinChannels: -1, sort });
        expect(setChannelsStub.args[0][0]).to.deep.equal(Utils.moveChannelUpwards(moveChannelUpwardsArgs))
      });

      it('should move the channel upwards if all conditions allow it', () => {
        isChannelPinnedStub.returns(false);
        isChannelArchivedStub.returns(false);
        shouldConsiderArchivedChannelsStub.returns(false);
        shouldConsiderPinnedChannelsStub.returns(false);

        client.dispatchEvent({ type: 'message.new', channel_type: 'messaging', channel_id: 'channel2' })

        const { pagination: { sort }, channels } = channelManager.state.getLatestValue();
        const moveChannelUpwardsArgs = moveChannelUpwardsSpy.args[0][0];

        expect(setChannelsStub.calledOnce).to.be.true;
        expect(moveChannelUpwardsSpy.calledOnce).to.be.true;
        expect(moveChannelUpwardsArgs).to.deep.equal({ channels, channelToMove: channels[1], channelToMoveIndexWithinChannels: 1, sort });
        expect(setChannelsStub.args[0][0]).to.deep.equal(Utils.moveChannelUpwards(moveChannelUpwardsArgs))
      });
    })

    describe('notificationNewMessageHandler', () => {
      let clock: sinon.SinonFakeTimers;

      beforeEach(() => {
        clock = sinon.useFakeTimers();
      })

      afterEach(() => {
        clock.restore();
      })

      it('should not update the state if the event has no id and type', async () => {
        client.dispatchEvent({ type: 'notification.message_new', channel: {} as unknown as ChannelResponse })

        await clock.runAllAsync();

        expect(getAndWatchChannelStub.called).to.be.false;
        expect(setChannelsStub.called).to.be.false;
      });

      it('should execute getAndWatchChannel if id and type are provided', async () => {
        const newChannelResponse = generateChannel({ channel: { id: 'channel4' } })
        const newChannel = client.channel(newChannelResponse.channel.type, newChannelResponse.channel.id)
        getAndWatchChannelStub.resolves(newChannel);
        client.dispatchEvent({ type: 'notification.message_new', channel: { type: 'messaging', id: 'channel4' } as unknown as ChannelResponse })

        await clock.runAllAsync();

        expect(getAndWatchChannelStub.calledOnce).to.be.true;
        expect(getAndWatchChannelStub.calledWith({ client, id: 'channel4', type: 'messaging' })).to.be.true;
      })

      it('should not update the state if channel is archived and filters do not allow it', async () => {
        isChannelArchivedStub.returns(true);
        shouldConsiderArchivedChannelsStub.returns(true);
        channelManager.state.next(prevState => ({ ...prevState, pagination: { ...prevState.pagination, filters: { archived: false }}}))

        client.dispatchEvent({ type: 'notification.message_new', channel: { type: 'messaging', id: 'channel4' } as unknown as ChannelResponse })

        await clock.runAllAsync();

        expect(getAndWatchChannelStub.called).to.be.true;
        expect(setChannelsStub.called).to.be.false;
      });

      it('should not update the state if allowNewMessagesFromUnfilteredChannels is false', async () => {
        channelManager.setOptions({ allowNewMessagesFromUnfilteredChannels: false });
        client.dispatchEvent({ type: 'notification.message_new', channel: { type: 'messaging', id: 'channel4' } as unknown as ChannelResponse })

        await clock.runAllAsync();

        expect(getAndWatchChannelStub.called).to.be.true;
        expect(setChannelsStub.called).to.be.false;

        channelManager.setOptions({});
      });

      it('should move channel when all criteria are met', async () => {
        const newChannelResponse = generateChannel({ channel: { id: 'channel4' } })
        const newChannel = client.channel(newChannelResponse.channel.type, newChannelResponse.channel.id)
        getAndWatchChannelStub.resolves(newChannel);
        client.dispatchEvent({ type: 'notification.message_new', channel: { type: 'messaging', id: 'channel4' } as unknown as ChannelResponse })

        await clock.runAllAsync();

        const { pagination: { sort }, channels } = channelManager.state.getLatestValue();
        const moveChannelUpwardsArgs = moveChannelUpwardsSpy.args[0][0];

        expect(getAndWatchChannelStub.calledOnce).to.be.true;
        expect(moveChannelUpwardsSpy.calledOnce).to.be.true
        expect(setChannelsStub.calledOnce).to.be.true;
        expect(moveChannelUpwardsArgs).to.deep.equal({ channels, channelToMove: newChannel, sort });
        expect(setChannelsStub.args[0][0]).to.deep.equal(Utils.moveChannelUpwards(moveChannelUpwardsArgs))
      });
    });

    describe('channelVisibleHandler', () => {
      let clock: sinon.SinonFakeTimers;

      beforeEach(() => {
        clock = sinon.useFakeTimers();
      })

      afterEach(() => {
        clock.restore();
      })

      it('should not update the state if the event has no id and type', async () => {
        client.dispatchEvent({ type: 'channel.visible', channel: {} as unknown as ChannelResponse })

        await clock.runAllAsync();

        expect(getAndWatchChannelStub.called).to.be.false;
        expect(setChannelsStub.called).to.be.false;
      });

      it('should not update the state if channels is undefined', async () => {
        channelManager.state.partialNext({ channels: undefined });
        client.dispatchEvent({ type: 'channel.visible', channel_id: 'channel4', channel_type: 'messaging' })

        await clock.runAllAsync();

        expect(getAndWatchChannelStub.called).to.be.false;
        expect(setChannelsStub.called).to.be.false;
      });

      it('should add the channel to the list if all criteria are met', async () => {
        const newChannelResponse = generateChannel({ channel: { id: 'channel4' } })
        const newChannel = client.channel(newChannelResponse.channel.type, newChannelResponse.channel.id)
        getAndWatchChannelStub.resolves(newChannel);
        client.dispatchEvent({ type: 'channel.visible', channel_id: 'channel4', channel_type: 'messaging' })

        await clock.runAllAsync();

        const { pagination: { sort }, channels } = channelManager.state.getLatestValue();
        const moveChannelUpwardsArgs = moveChannelUpwardsSpy.args[0][0];

        expect(getAndWatchChannelStub.calledOnce).to.be.true;
        expect(moveChannelUpwardsSpy.calledOnce).to.be.true
        expect(setChannelsStub.calledOnce).to.be.true;
        expect(moveChannelUpwardsArgs).to.deep.equal({ channels, channelToMove: newChannel, sort });
        expect(setChannelsStub.args[0][0]).to.deep.equal(Utils.moveChannelUpwards(moveChannelUpwardsArgs))
      });
    });

    describe.only('memberUpdatedHandler', () => {
      let clock: sinon.SinonFakeTimers;
      let dispatchMemberUpdatedEvent: (id?: string) => void;

      beforeEach(() => {
        clock = sinon.useFakeTimers();
        dispatchMemberUpdatedEvent = (id?: string) => client.dispatchEvent({ type: 'member.updated', channel_id: id ?? 'channel2', channel_type: 'messaging', member: { user: { id: client?.userID ?? 'anonymous' } }});
      })

      afterEach(() => {
        clock.restore();
      })


      it('should not update state if event member does not have user or user id does not match', () => {
        client.dispatchEvent({ type: 'member.updated', channel_id: 'channel2', channel_type: 'messaging', member: { user: { id: 'wrongUserID' } }});
        expect(setChannelsStub.calledOnce).to.be.false;

        client.dispatchEvent({ type: 'member.updated', channel_id: 'channel2', channel_type: 'messaging', member: {}});
        expect(setChannelsStub.calledOnce).to.be.false;
      });

      it('should not update state if channel_type or channel_id is not present', () => {
        client.dispatchEvent({ type: 'member.updated', member: { user: { id: 'user123' }}});
        expect(setChannelsStub.calledOnce).to.be.false;
        client.dispatchEvent({ type: 'member.updated', member: { user: { id: 'user123' }}, channel_type: 'messaging' });
        expect(setChannelsStub.calledOnce).to.be.false;
        client.dispatchEvent({ type: 'member.updated', member: { user: { id: 'user123' }}, channel_id: 'channel2' });
        expect(setChannelsStub.calledOnce).to.be.false;
      });

      it('should not update state early if channels are not available in state', () => {
        channelManager.state.partialNext({ channels: undefined });
        dispatchMemberUpdatedEvent();

        expect(setChannelsStub.calledOnce).to.be.false;
      });

      it('should not update state is channel pinning should not be considered', () => {
        shouldConsiderPinnedChannelsStub.returns(false)
        dispatchMemberUpdatedEvent();

        expect(setChannelsStub.calledOnce).to.be.false;
      });

      it('should handle archiving correctly', () => {
        channelManager.state.next(prevState => ({ ...prevState, pagination: { ...prevState.pagination, filters: { archived: true }}}))
        isChannelArchivedStub.returns(true);
        shouldConsiderArchivedChannelsStub.returns(true);
        shouldConsiderPinnedChannelsStub.returns(true);
        dispatchMemberUpdatedEvent();

        expect(setChannelsStub.calledOnce).to.be.true;
        expect(setChannelsStub.args[0][0].map((c: ChannelResponse) => c.id)).to.deep.equal(['channel2', 'channel1', 'channel3']);
      });

      it('should pin channel at the correct position when pinnedAtSort is 1', () => {
        isChannelPinnedStub.returns(false);
        shouldConsiderPinnedChannelsStub.returns(true);
        findLastPinnedChannelIndexStub.returns(0);
        extractSortValueStub.returns(1);
        dispatchMemberUpdatedEvent('channel3');

        expect(setChannelsStub.calledOnce).to.be.true;
        expect(setChannelsStub.args[0][0].map((c: ChannelResponse) => c.id)).to.deep.equal(['channel1', 'channel3', 'channel2']);
      });

      it('should pin channel at the correct position when pinnedAtSort is -1 and the target is not pinned', function () {
        isChannelPinnedStub.callsFake(c => c.id === 'channel1');
        shouldConsiderPinnedChannelsStub.returns(true);
        findLastPinnedChannelIndexStub.returns(0);
        extractSortValueStub.returns(-1);
        dispatchMemberUpdatedEvent('channel3');

        expect(setChannelsStub.calledOnce).to.be.true;
        expect(setChannelsStub.args[0][0].map((c: ChannelResponse) => c.id)).to.deep.equal(['channel1', 'channel3', 'channel2']);
      });

      it('should pin channel at the correct position when pinnedAtSort is -1 and the target is pinned', () => {
        isChannelPinnedStub.callsFake(c => ['channel1', 'channel3'].includes(c.id));
        shouldConsiderPinnedChannelsStub.returns(true);
        findLastPinnedChannelIndexStub.returns(0);
        extractSortValueStub.returns(-1);
        dispatchMemberUpdatedEvent('channel3');

        expect(setChannelsStub.calledOnce).to.be.true;
        expect(setChannelsStub.args[0][0].map((c: ChannelResponse) => c.id)).to.deep.equal(['channel3', 'channel1', 'channel2']);
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
  })
})
