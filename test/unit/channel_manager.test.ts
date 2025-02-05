import { expect } from 'chai';
import sinon from 'sinon';
import { ChannelManager, ChannelResponse, StreamChat } from '../../src';

import { generateMsg } from './test-utils/generateMessage';
import { generateChannel } from './test-utils/generateChannel';
import { generateMember } from './test-utils/generateMember';
import { generateUser } from './test-utils/generateUser';
import { getClientWithUser } from './test-utils/getClient';
import { afterEach } from 'mocha';

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
    let setChannelsSpy: sinon.SinonSpy;
    let channelToRemove: ChannelResponse;

    beforeEach(() => {
      const channels = [generateChannel({ channel: { id: 'channel1' }}).channel, generateChannel({ channel: { id: 'channel2' }}).channel, generateChannel({ channel: { id: 'channel3' }}).channel]
      channelManager.state.partialNext({ channels, ready: true })
      setChannelsSpy = sinon.spy(channelManager, 'setChannels');
      channelToRemove = channels[1];
    })

    afterEach(() => {
      sinon.restore();
      sinon.reset();
    })

    describe('channelDeletedHandler', () => {
      it('should return early if channels is undefined', () => {
        channelManager.state.partialNext({ channels: undefined })

        client.dispatchEvent({ type: 'channel.deleted', cid: channelToRemove.cid })
        client.dispatchEvent({ type: 'channel.deleted', channel: channelToRemove })

        expect(setChannelsSpy.calledOnce).to.be.false;
      });

      it('should remove the channel when event.cid matches', () => {
        client.dispatchEvent({ type: 'channel.deleted', cid: channelToRemove.cid })

        expect(setChannelsSpy.calledOnce).to.be.true;
        expect(setChannelsSpy.args[0][0].map((c: ChannelResponse) => c.id)).to.deep.equal(['channel1', 'channel3']);
      });

      it('should remove the channel when event.channel?.cid matches', () => {
        client.dispatchEvent({ type: 'channel.deleted', channel: channelToRemove })

        expect(setChannelsSpy.calledOnce).to.be.true;
        expect(setChannelsSpy.args[0][0].map((c: ChannelResponse) => c.id)).to.deep.equal(['channel1', 'channel3']);
      });

      it('should not modify the list if no channels match', () => {
        const { channels: prevChannels } = channelManager.state.getLatestValue();
        client.dispatchEvent({ type: 'channel.deleted', cid: 'channel123' })
        const { channels: newChannels } = channelManager.state.getLatestValue();

        expect(setChannelsSpy.calledOnce).to.be.false;
        expect(prevChannels).to.equal(newChannels)
        expect(prevChannels).to.deep.equal(newChannels);
      });
    });
  })
})
