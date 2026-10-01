import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getClientWithUser } from './test-utils/getClient';
import { generateChannel } from './test-utils/generateChannel';
import { generateMsg } from './test-utils/generateMessage';
import { formatMessage } from '../../src/utils';
import { ChannelPaginator, ChannelWatchStatus } from '../../src';
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
  });
});

describe('channel holds', () => {
  let client: StreamChat;

  beforeEach(() => {
    client = getClientWithUser({ id: 'ann' });
  });

  it('tears down a channel whose only hold was its watch when the watch ends', () => {
    const channel = client.channel('messaging', 'general');
    channel.watchStatus = ChannelWatchStatus.Watching;

    channel.watchStatus = ChannelWatchStatus.NotWatching;

    expect(channel.pendingDisposal).toBe(true);
    expect(client.channelManager.get('messaging:general')).toBeUndefined();
  });

  it('keeps a channel whose watch was interrupted, so it can be restored', () => {
    const channel = client.channel('messaging', 'general');
    channel.watchStatus = ChannelWatchStatus.Watching;

    channel.watchStatus = ChannelWatchStatus.WasWatching;

    expect(channel.pendingDisposal).toBe(false);
    expect(client.channelManager.get('messaging:general')).toBe(channel);
  });

  it('keeps an opened channel for the session after it is released and unwatched', () => {
    const channel = client.channel('messaging', 'general');
    channel.watchStatus = ChannelWatchStatus.Watching;
    const release = channel.activate();

    release();
    release();
    channel.watchStatus = ChannelWatchStatus.NotWatching;

    expect(channel.active).toBe(false);
    expect(channel.pendingDisposal).toBe(false);
    expect(client.channelManager.get('messaging:general')).toBe(channel);
  });

  it('tears down an opened channel on a known end', () => {
    const channel = client.channel('messaging', 'general');
    channel.activate();

    client.dispatchEvent({ type: 'channel.deleted', cid: channel.cid });

    expect(channel.pendingDisposal).toBe(true);
    expect(client.channelManager.get('messaging:general')).toBeUndefined();
  });

  it('tears down an opened channel on logout', async () => {
    const channel = client.channel('messaging', 'general');
    channel.activate();

    await client.disconnectUser();

    expect(channel.pendingDisposal).toBe(true);
    expect(client.channelManager.values()).toEqual([]);
  });

  it('runs the teardown once when releasing the last hold triggers it', () => {
    const channel = client.channel('messaging', 'general');
    const unregister = vi.spyOn(channel.cooldownTimer, 'unregisterSubscriptions');
    channel.watchStatus = ChannelWatchStatus.Watching;

    channel.watchStatus = ChannelWatchStatus.NotWatching;

    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it('holds a channel created from members under its temporary cid, and keeps the hold when it moves', async () => {
    const channel = client.channel('messaging', { members: ['ann', 'bob'] });
    channel.activate();
    vi.spyOn(client, 'getOrCreateDistinctChannel').mockResolvedValue({
      ...generateChannel({ channel: { id: '!members-xyz', type: 'messaging' } }),
      members: [member('ann'), member('bob')],
    } as unknown as ChannelStateResponseFields & { duration: string });
    await channel.query({});

    channel.watchStatus = ChannelWatchStatus.NotWatching;

    expect(channel.pendingDisposal).toBe(false);
    expect(client.channelManager.get('messaging:!members-xyz')).toBe(channel);
  });
});

describe('channel lists as holders', () => {
  let client: StreamChat;

  beforeEach(() => {
    client = getClientWithUser({ id: 'ann' });
  });

  const list = (filters: Record<string, unknown> = { type: 'messaging' }) =>
    new ChannelPaginator({ client, filters });

  it('keeps a listed channel until every list that holds it lets it go', () => {
    const channel = client.channel('messaging', 'general');
    const first = list();
    const second = list();
    first.setItems({ isFirstPage: true, isLastPage: true, valueOrFactory: [channel] });
    second.setItems({ isFirstPage: true, isLastPage: true, valueOrFactory: [channel] });

    first.removeItem({ item: channel });
    expect(channel.pendingDisposal).toBe(false);
    expect(client.channelManager.get(channel.cid)).toBe(channel);

    second.removeItem({ item: channel });
    expect(channel.pendingDisposal).toBe(true);
    expect(client.channelManager.get(channel.cid)).toBeUndefined();
    expect(client.channelManager.get(channel.cid)).toBeUndefined();
  });

  it('keeps a listed channel that is also watched or opened', () => {
    const watched = client.channel('messaging', 'watched');
    const opened = client.channel('messaging', 'opened');
    watched.watchStatus = ChannelWatchStatus.Watching;
    opened.activate();
    const paginator = list();
    paginator.setItems({
      isFirstPage: true,
      isLastPage: true,
      valueOrFactory: [watched, opened],
    });

    paginator.removeItem({ item: watched });
    paginator.removeItem({ item: opened });

    expect(watched.pendingDisposal).toBe(false);
    expect(opened.pendingDisposal).toBe(false);
  });

  it('lets go of its channels when its state is reset', () => {
    const channel = client.channel('messaging', 'general');
    const paginator = list();
    paginator.setItems({
      isFirstPage: true,
      isLastPage: true,
      valueOrFactory: [channel],
    });

    paginator.resetState();

    expect(channel.pendingDisposal).toBe(true);
  });

  it('lets go of a channel that stops matching its filter', () => {
    const channel = client.channel('messaging', 'general');
    channel.data = { ...channel.data, team: 'a' };
    const paginator = list({ team: 'a' });
    paginator.setItems({
      isFirstPage: true,
      isLastPage: true,
      valueOrFactory: [channel],
    });

    channel.data = { ...channel.data, team: 'b' };
    paginator.ingestItem(channel);

    expect(paginator.items).toEqual([]);
    expect(channel.pendingDisposal).toBe(true);
  });

  it('keeps the instance when a channel moves from one list to another', () => {
    const channel = client.channel('messaging', 'general');
    channel.data = { ...channel.data, team: 'a' };
    const teamA = list({ team: 'a' });
    const teamB = list({ team: 'b' });
    teamA.setItems({ isFirstPage: true, isLastPage: true, valueOrFactory: [channel] });
    teamB.setItems({ isFirstPage: true, isLastPage: true, valueOrFactory: [] });
    client.channelManager.setPaginators([teamA, teamB]);

    channel.data = { ...channel.data, team: 'b' };
    client.channelManager.ingestChannel(channel);

    expect(channel.pendingDisposal).toBe(false);
    expect(teamB.items).toEqual([channel]);
    expect(teamA.items).toEqual([]);
  });
});

describe('known ends and logout', () => {
  let client: StreamChat;

  beforeEach(() => {
    client = getClientWithUser({ id: 'ann' });
  });

  // a channel every hold keeps: listed, opened and watched
  const heldChannel = () => {
    const channel = client.channel('messaging', 'general');
    const paginator = new ChannelPaginator({ client, filters: {} });
    paginator.setItems({
      isFirstPage: true,
      isLastPage: true,
      valueOrFactory: [channel],
    });
    client.channelManager.setPaginators([paginator]);
    client.channelManager.registerSubscriptions();
    channel.activate();
    channel.watchStatus = ChannelWatchStatus.Watching;
    return { channel, paginator };
  };

  it.each([
    'channel.deleted',
    'notification.channel_deleted',
    'notification.removed_from_channel',
  ])(
    'removes the channel from the store and every list on %s, whatever holds it',
    async (type) => {
      const { channel, paginator } = heldChannel();

      client.dispatchEvent({
        type,
        cid: channel.cid,
        channel_type: channel.type,
        channel_id: channel.id,
      } as never);

      expect(channel.pendingDisposal).toBe(true);
      expect(client.channelManager.get(channel.cid)).toBeUndefined();
      await vi.waitFor(() => expect(paginator.items ?? []).toEqual([]));
    },
  );

  it('removes every channel from the store and every list on logout', async () => {
    const { channel, paginator } = heldChannel();

    await client.disconnectUser();

    expect(channel.pendingDisposal).toBe(true);
    expect(client.channelManager.values()).toEqual([]);
    expect(paginator.items ?? []).toEqual([]);
  });
});

describe('store removals reach the lists', () => {
  let client: StreamChat;

  beforeEach(() => {
    client = getClientWithUser({ id: 'ann' });
  });

  it('drops a channel removed from the channel store from every list holding it', () => {
    const channel = client.channel('messaging', 'general');
    const first = new ChannelPaginator({ client, filters: {} });
    const second = new ChannelPaginator({ client, filters: {} });
    first.setItems({ isFirstPage: true, isLastPage: true, valueOrFactory: [channel] });
    second.setItems({ isFirstPage: true, isLastPage: true, valueOrFactory: [channel] });

    client.channelManager.channelStore.remove(channel.cid);

    expect(first.items).toEqual([]);
    expect(second.items).toEqual([]);
  });

  it('drops a message removed from the message store from the message list', () => {
    const channel = client.channel('messaging', 'general');
    const message = formatMessage(generateMsg({ id: 'm1' }));
    channel.messagePaginator.setItems({
      isFirstPage: true,
      isLastPage: true,
      valueOrFactory: [message],
    });

    client.messageStore.remove('m1');
    expect(channel.messagePaginator.items).toEqual([]);

    // the list let go of it rather than only hiding it: storing the message again doesn't bring it back
    client.messageStore.upsert(message);
    expect(channel.messagePaginator.getItem('m1')).toBeUndefined();
  });
});
