import sinon from 'sinon';
import { afterEach, describe, expect, it } from 'vitest';

import type { Channel, ChannelResponse, StreamChat } from '../../src';
import { generateChannel } from './test-utils/generateChannel';
import { getClientWithUser } from './test-utils/getClient';

const queriedChannelData = (overrides: Partial<ChannelResponse> = {}) =>
  generateChannel({ channel: { active_member_count: 4, member_count: 5, ...overrides } })
    .channel;

const setUpQueriedChannel = async () => {
  const client: StreamChat = await getClientWithUser();
  const channelResponse = generateChannel({
    channel: { active_member_count: 4, member_count: 5 },
  });
  const post = sinon.stub(client, 'post').resolves({ channels: [channelResponse] });

  const [channel] = await client.queryChannels(
    { cid: channelResponse.channel.cid },
    {},
    { include_active_member_count: true },
  );
  post.restore();

  return { channel, client };
};

describe('Channel active member count', () => {
  afterEach(() => {
    sinon.restore();
  });

  it('sends include_active_member_count with queryChannels', async () => {
    const client: StreamChat = await getClientWithUser();
    const post = sinon.stub(client, 'post').resolves({ channels: [] });

    await client.queryChannels({}, {}, { include_active_member_count: true });

    expect(post.firstCall.args[1]).toMatchObject({ include_active_member_count: true });
  });

  it('keeps the count from Query Channels', async () => {
    const { channel } = await setUpQueriedChannel();

    expect(channel.data?.active_member_count).toBe(4);
  });

  it('keeps the count when a consumer replaces channel.data without it', async () => {
    const { channel } = await setUpQueriedChannel();
    const { active_member_count: _omitted, ...eventChannel } = queriedChannelData({
      cid: channel.cid,
      id: channel.id,
      name: 'renamed',
    });

    channel.data = { ...eventChannel, own_capabilities: channel.data?.own_capabilities };

    expect(channel.data).toMatchObject({ active_member_count: 4, name: 'renamed' });
  });

  it('does not move the count with member_count, only caps it', async () => {
    const { channel } = await setUpQueriedChannel();

    // member_count grew (5 -> 6): the carried count is kept as-is, not shifted up.
    channel.data = { ...channel.data, active_member_count: undefined, member_count: 6 };
    expect(channel.data?.active_member_count).toBe(4);

    // member_count dropped below it (-> 3): the carried count is capped at member_count.
    channel.data = { ...channel.data, active_member_count: undefined, member_count: 3 };
    expect(channel.data?.active_member_count).toBe(3);
  });

  it('keeps the count after a channel.updated event without it', async () => {
    const { channel } = await setUpQueriedChannel();
    const { active_member_count: _omitted, ...eventChannel } = queriedChannelData({
      cid: channel.cid,
      id: channel.id,
    });

    channel._handleChannelEvent({
      channel: eventChannel as ChannelResponse,
      cid: channel.cid,
      type: 'channel.updated',
    });

    expect(channel.data?.active_member_count).toBe(4);
  });

  it('keeps the count after a channel query that omits it', async () => {
    const { channel, client } = await setUpQueriedChannel();
    const { active_member_count: _omitted, ...queriedChannel } = queriedChannelData({
      cid: channel.cid,
      id: channel.id,
    });
    sinon.stub(client, 'post').resolves(generateChannel({ channel: queriedChannel }));

    await channel.query({});

    expect(channel.data?.active_member_count).toBe(4);
  });

  it('takes a new count from the server over the carried one', async () => {
    const { channel } = await setUpQueriedChannel();

    channel.data = queriedChannelData({ active_member_count: 2, cid: channel.cid });

    expect(channel.data?.active_member_count).toBe(2);
  });

  it('keeps the assigned object when there is nothing to carry', async () => {
    const client: StreamChat = await getClientWithUser();
    const channel: Channel = client.channel('messaging', 'no-count');
    const data = { member_count: 3, name: 'plain' };

    channel.data = data;

    expect(channel.data).toBe(data);
  });

  it('lets channel.data be cleared', async () => {
    const { channel } = await setUpQueriedChannel();

    channel.data = undefined;

    expect(channel.data).toBeUndefined();
  });
});
