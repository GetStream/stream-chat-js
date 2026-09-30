import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getClientWithUser } from './test-utils/getClient';
import { generateChannel } from './test-utils/generateChannel';
import type {
  ChannelStateResponseFields,
  QueryChannelsResponse,
  StreamChat,
} from '../../src';

const member = (id: string) => ({ user: { id }, user_id: id });

describe('ChannelManager channel store', () => {
  let client: StreamChat;

  beforeEach(() => {
    client = getClientWithUser({ id: 'ann' });
  });

  it('returns the same instance for a cid from client.channel()', () => {
    const channel = client.channel('messaging', 'general');

    expect(client.channel('messaging', 'general')).toBe(channel);
    expect(client.channelManager.get('messaging:general')).toBe(channel);
    expect(client.channelManager.values()).toEqual([channel]);
  });

  it('hydrates the stored instance from queryChannels results instead of creating a new one', async () => {
    const channel = client.channel('messaging', 'general');
    vi.spyOn(client, 'queryChannels').mockResolvedValue({
      channels: [generateChannel({ channel: { id: 'general', name: 'General' } })],
    } as unknown as QueryChannelsResponse);

    const [hydrated] = await client.queryChannelsAndHydrate();

    expect(hydrated).toBe(channel);
    expect(channel.data?.name).toBe('General');
    expect(client.channelManager.values()).toEqual([channel]);
  });

  it('keeps the instance of a channel created from members when it gets its real cid', async () => {
    const channel = client.channel('messaging', { members: ['ann', 'bob'] });
    expect(client.channelManager.get('messaging:!members-ann,bob')).toBe(channel);

    vi.spyOn(client, 'getOrCreateDistinctChannel').mockResolvedValue({
      ...generateChannel({ channel: { id: '!members-xyz', type: 'messaging' } }),
      members: [member('ann'), member('bob')],
    } as unknown as ChannelStateResponseFields & { duration: string });
    await channel.query({});

    expect(channel.cid).toBe('messaging:!members-xyz');
    expect(client.channelManager.get('messaging:!members-xyz')).toBe(channel);
    expect(client.channelManager.get('messaging:!members-ann,bob')).toBeUndefined();
    expect(client.channel('messaging', '!members-xyz')).toBe(channel);
    expect(client.channel('messaging', { members: ['bob', 'ann'] })).toBe(channel);
  });

  it('replaces a torn-down channel with a fresh instance', () => {
    const channel = client.channel('messaging', 'general');
    channel._disconnect();

    const fresh = client.channel('messaging', 'general');

    expect(fresh).not.toBe(channel);
    expect(client.channelManager.get('messaging:general')).toBe(fresh);
  });

  it('tears down and drops every channel on disconnectUser', async () => {
    const channel = client.channel('messaging', 'general');

    await client.disconnectUser();

    expect(channel.pendingDisposal).toBe(true);
    expect(client.channelManager.values()).toEqual([]);
    expect(client.activeChannels).toEqual({});
  });
});
