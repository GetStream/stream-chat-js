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

  describe('websocket event handlers', () => {
    let setChannelsStub: sinon.SinonStub;
    let isChannelPinnedStub: sinon.SinonStub;
    let isChannelArchivedStub: sinon.SinonStub;
    let shouldConsiderArchivedChannelsStub: sinon.SinonStub;
    let shouldConsiderPinnedChannelsStub: sinon.SinonStub;
    let moveChannelUpwardsSpy: sinon.SinonSpy;
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
      moveChannelUpwardsSpy = sinon.spy(Utils, 'moveChannelUpwards');
      channelToRemove = channelsResponse[1];
    })

    afterEach(() => {
      sinon.restore();
      sinon.reset();
    })

    describe('channelDeletedHandler and channelHiddenHandler', () => {
      (['channel.deleted', 'channel.hidden'] as const).forEach((eventType) => {
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
  })
})
