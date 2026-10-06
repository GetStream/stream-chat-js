import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getClientWithUser } from './test-utils/getClient';
import { generateChannel } from './test-utils/generateChannel';
import { generateMsg } from './test-utils/generateMessage';
import { formatMessage } from '../../src/utils';
import { ChannelPaginator, ChannelWatchStatus, MessageComposer } from '../../src';
import type {
  Channel,
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

  it('returns the same instance for a cid from client.channelManager.ensure()', () => {
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });

    expect(client.channelManager.ensure({ type: 'messaging', id: 'general' })).toBe(
      channel,
    );
    expect(client.channelManager.get('messaging:general')).toBe(channel);
    expect(client.channelManager.values()).toEqual([channel]);
  });

  it('hydrates the stored instance from queryChannels results instead of creating a new one', async () => {
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    vi.spyOn(client, 'queryChannels').mockResolvedValue({
      channels: [generateChannel({ channel: { id: 'general', name: 'General' } })],
    } as unknown as QueryChannelsResponse);

    const [hydrated] = await client.queryChannelsAndHydrate();

    expect(hydrated).toBe(channel);
    expect(channel.data?.name).toBe('General');
    expect(client.channelManager.values()).toEqual([channel]);
  });

  it('keeps the instance of a channel created from members when it gets its real cid', async () => {
    const channel = client.channelManager.ensure({
      type: 'messaging',
      data: { members: ['ann', 'bob'] },
    });
    expect(client.channelManager.get('messaging:!members-ann,bob')).toBe(channel);

    vi.spyOn(client, 'getOrCreateDistinctChannel').mockResolvedValue({
      ...generateChannel({ channel: { id: '!members-xyz', type: 'messaging' } }),
      members: [member('ann'), member('bob')],
    } as unknown as ChannelStateResponseFields & { duration: string });
    await channel.query({});

    expect(channel.cid).toBe('messaging:!members-xyz');
    expect(client.channelManager.get('messaging:!members-xyz')).toBe(channel);
    expect(client.channelManager.get('messaging:!members-ann,bob')).toBeUndefined();
    expect(client.channelManager.ensure({ type: 'messaging', id: '!members-xyz' })).toBe(
      channel,
    );
    expect(
      client.channelManager.ensure({
        type: 'messaging',
        data: { members: ['bob', 'ann'] },
      }),
    ).toBe(channel);
  });

  it('replaces another instance that holds the real cid by the channel created from members', async () => {
    // stored while the created channel's query was in flight, e.g. by an event
    const stored = client.channelManager.ensure({
      type: 'messaging',
      id: '!members-xyz',
    });
    const paginator = new ChannelPaginator({ client, filters: { type: 'messaging' } });
    paginator.setItems({ isFirstPage: true, isLastPage: true, valueOrFactory: [stored] });
    client.channelManager.setPaginators([paginator]);
    const created = client.channelManager.ensure({
      type: 'messaging',
      data: { members: ['ann', 'bob'] },
    });
    vi.spyOn(client, 'getOrCreateDistinctChannel').mockResolvedValue({
      ...generateChannel({ channel: { id: '!members-xyz', type: 'messaging' } }),
      members: [member('ann'), member('bob')],
    } as unknown as ChannelStateResponseFields & { duration: string });

    await created.query({});

    expect(client.channelManager.get('messaging:!members-xyz')).toBe(created);
    expect(client.channelManager.get('messaging:!members-ann,bob')).toBeUndefined();
    expect(stored.pendingDisposal).toBe(true);
    expect(paginator.items).toEqual([created]);
    expect(client.channelManager.values()).toEqual([created]);
  });

  it('swaps the replaced instance in each list with one update, never dropping the conversation', async () => {
    const stored = client.channelManager.ensure({
      type: 'messaging',
      id: '!members-xyz',
    });
    const paginator = new ChannelPaginator({ client, filters: { type: 'messaging' } });
    paginator.setItems({ isFirstPage: true, isLastPage: true, valueOrFactory: [stored] });
    client.channelManager.setPaginators([paginator]);
    const created = client.channelManager.ensure({
      type: 'messaging',
      data: { members: ['ann', 'bob'] },
    });
    vi.spyOn(client, 'getOrCreateDistinctChannel').mockResolvedValue({
      ...generateChannel({ channel: { id: '!members-xyz', type: 'messaging' } }),
      members: [member('ann'), member('bob')],
    } as unknown as ChannelStateResponseFields & { duration: string });
    const published: (Channel[] | undefined)[] = [];
    const unsubscribe = paginator.state.subscribeWithSelector(
      ({ items }) => ({ items }),
      ({ items }) => published.push(items),
    );
    published.length = 0; // the subscription reports the current value first

    await created.query({});
    unsubscribe();

    expect(published).toEqual([[created]]);
  });

  it('replaces a torn-down channel with a fresh instance', () => {
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    channel._disconnect();

    const fresh = client.channelManager.ensure({ type: 'messaging', id: 'general' });

    expect(fresh).not.toBe(channel);
    expect(client.channelManager.get('messaging:general')).toBe(fresh);
  });

  it('tears down and drops every channel on disconnectUser', async () => {
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });

    await client.disconnectUser();

    expect(channel.pendingDisposal).toBe(true);
    expect(client.channelManager.values()).toEqual([]);
  });
});

describe('keeping channels', () => {
  let client: StreamChat;
  const release = () => client.channelManager.releaseUnusedChannels();

  beforeEach(() => {
    client = getClientWithUser({ id: 'ann' });
  });

  it('keeps a watched channel, and releases it at the next release once unwatched', () => {
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    channel.watchStatus = ChannelWatchStatus.Watching;
    release();
    expect(client.channelManager.get('messaging:general')).toBe(channel);

    channel.watchStatus = ChannelWatchStatus.NotWatching;
    expect(channel.pendingDisposal).toBe(false);

    release();
    expect(channel.pendingDisposal).toBe(true);
    expect(client.channelManager.get('messaging:general')).toBeUndefined();
  });

  it('keeps a channel whose watch was interrupted, so it can be restored', () => {
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    channel.watchStatus = ChannelWatchStatus.Watching;

    channel.watchStatus = ChannelWatchStatus.WasWatching;
    release();

    expect(channel.pendingDisposal).toBe(false);
    expect(client.channelManager.get('messaging:general')).toBe(channel);
  });

  it('keeps an active channel while it is unwatched', () => {
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    channel.activate();

    release();

    expect(channel.pendingDisposal).toBe(false);
    expect(client.channelManager.get('messaging:general')).toBe(channel);
  });

  it('releases a channel at the next release once it is no longer active and unwatched', () => {
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    channel.watchStatus = ChannelWatchStatus.Watching;
    const deactivateFirst = channel.activate();
    const deactivateSecond = channel.activate();

    deactivateFirst();
    deactivateFirst();
    channel.watchStatus = ChannelWatchStatus.NotWatching;
    release();
    expect(channel.active).toBe(true);
    expect(channel.pendingDisposal).toBe(false);

    deactivateSecond();
    release();

    expect(channel.active).toBe(false);
    expect(channel.pendingDisposal).toBe(true);
    expect(client.channelManager.get('messaging:general')).toBeUndefined();
  });

  it('can be activated after it was torn down, without storing it again', () => {
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    client.channelManager.removeChannel(channel.cid);

    const release = channel.activate();
    release();

    expect(client.channelManager.get(channel.cid)).toBeUndefined();
  });

  it('tears down an opened channel on a known end', () => {
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    channel.activate();

    client.dispatchEvent({ type: 'channel.deleted', cid: channel.cid });

    expect(channel.pendingDisposal).toBe(true);
    expect(client.channelManager.get('messaging:general')).toBeUndefined();
  });

  it('tears down an opened channel on logout', async () => {
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    channel.activate();

    await client.disconnectUser();

    expect(channel.pendingDisposal).toBe(true);
    expect(client.channelManager.values()).toEqual([]);
  });

  it('runs the teardown once when releaseUnusedChannels() releases the channel', () => {
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    const unregister = vi.spyOn(channel.cooldownTimer, 'unregisterSubscriptions');

    release();
    release();

    expect(unregister).toHaveBeenCalledTimes(1);
  });

  it('keeps an opened channel created from members when it moves to its real cid', async () => {
    const channel = client.channelManager.ensure({
      type: 'messaging',
      data: { members: ['ann', 'bob'] },
    });
    channel.activate();
    vi.spyOn(client, 'getOrCreateDistinctChannel').mockResolvedValue({
      ...generateChannel({ channel: { id: '!members-xyz', type: 'messaging' } }),
      members: [member('ann'), member('bob')],
    } as unknown as ChannelStateResponseFields & { duration: string });
    await channel.query({});

    channel.watchStatus = ChannelWatchStatus.NotWatching;
    release();

    expect(channel.pendingDisposal).toBe(false);
    expect(client.channelManager.get('messaging:!members-xyz')).toBe(channel);
  });

  it('keeps a channel while a query for it is in flight', async () => {
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    let respond: (value: unknown) => void = () => undefined;
    vi.spyOn(channel, 'getOrCreate').mockReturnValue(
      new Promise((resolve) => {
        respond = resolve;
      }) as never,
    );

    const watching = channel.watch();
    release();
    expect(channel.pendingDisposal).toBe(false);

    respond(generateChannel({ channel: { id: 'general', type: 'messaging' } }));
    await watching;
    release();

    expect(channel.watchStatus).toBe(ChannelWatchStatus.Watching);
    expect(client.channelManager.get(channel.cid)).toBe(channel);
  });

  it("keeps a thread's channel while the thread is in client.threads", () => {
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    const thread = client.threads.ensure({
      channel,
      parentMessage: generateMsg({ cid: channel.cid }),
    });

    release();

    expect(thread.channel).toBe(channel);
    expect(client.channelManager.get(channel.cid)).toBe(channel);
  });

  it("keeps a cached composer's channel, such as a message edit's", () => {
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    const message = formatMessage(generateMsg({ cid: channel.cid }));
    client.messageComposerCache.add(
      message.id,
      new MessageComposer({ client, compositionContext: message }),
    );

    release();

    expect(client.channelManager.get(channel.cid)).toBe(channel);
  });

  it('keeps the channels a claim lists, until it is removed', () => {
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    const removeClaim = client.channelManager.channelStore.addClaim({
      heldBy: () => [channel],
      name: 'test',
    });
    release();
    expect(client.channelManager.get(channel.cid)).toBe(channel);

    removeClaim();
    release();
    expect(client.channelManager.get(channel.cid)).toBeUndefined();
  });

  it('reports what keeps each stored channel, and nothing for one the next release removes', () => {
    const watched = client.channelManager.ensure({ type: 'messaging', id: 'watched' });
    const opened = client.channelManager.ensure({ type: 'messaging', id: 'opened' });
    const listed = client.channelManager.ensure({ type: 'messaging', id: 'listed' });
    const threaded = client.channelManager.ensure({ type: 'messaging', id: 'threaded' });
    client.channelManager.ensure({ type: 'messaging', id: 'unused' });
    watched.watchStatus = ChannelWatchStatus.Watching;
    opened.activate();
    client.channelManager.channelStore.addClaim({
      heldBy: () => [opened],
      name: 'test',
    });
    new ChannelPaginator({ client, filters: {} }).setItems({
      isFirstPage: true,
      isLastPage: true,
      valueOrFactory: [listed],
    });
    client.threads.ensure({
      channel: threaded,
      parentMessage: generateMsg({ cid: threaded.cid }),
    });

    const keptBy = Object.fromEntries(
      client.channelManager.getChannelUsage().map(({ key, keptBy }) => [key, keptBy]),
    );

    expect(keptBy).toEqual({
      'messaging:listed': ['channel-paginator'],
      'messaging:opened': ['active', 'test'],
      'messaging:threaded': ['threads'],
      'messaging:unused': [],
      'messaging:watched': ['watched'],
    });
  });

  it('releases unused channels when the lists reload and when the connection recovers', async () => {
    const reloaded = client.channelManager.ensure({ type: 'messaging', id: 'reloaded' });
    await client.channelManager.reload();
    expect(reloaded.pendingDisposal).toBe(true);

    const recovered = client.channelManager.ensure({
      type: 'messaging',
      id: 'recovered',
    });
    await client.channelManager.recover();
    expect(recovered.pendingDisposal).toBe(true);
  });
});

describe('channel lists as users', () => {
  let client: StreamChat;
  const release = () => client.channelManager.releaseUnusedChannels();

  beforeEach(() => {
    client = getClientWithUser({ id: 'ann' });
  });

  const list = (filters: Record<string, unknown> = { type: 'messaging' }) =>
    new ChannelPaginator({ client, filters });

  it('keeps a listed channel until no list shows it, then releases it at the next release', () => {
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    const first = list();
    const second = list();
    first.setItems({ isFirstPage: true, isLastPage: true, valueOrFactory: [channel] });
    second.setItems({ isFirstPage: true, isLastPage: true, valueOrFactory: [channel] });

    first.removeItem({ item: channel });
    release();
    expect(client.channelManager.get(channel.cid)).toBe(channel);

    second.removeItem({ item: channel });
    expect(channel.pendingDisposal).toBe(false);
    release();
    expect(channel.pendingDisposal).toBe(true);
    expect(client.channelManager.get(channel.cid)).toBeUndefined();
  });

  it('keeps a listed channel that is also watched or opened', () => {
    const watched = client.channelManager.ensure({ type: 'messaging', id: 'watched' });
    const opened = client.channelManager.ensure({ type: 'messaging', id: 'opened' });
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
    release();

    expect(watched.pendingDisposal).toBe(false);
    expect(opened.pendingDisposal).toBe(false);
  });

  it('stops using its channels when its state is reset', () => {
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    const paginator = list();
    paginator.setItems({
      isFirstPage: true,
      isLastPage: true,
      valueOrFactory: [channel],
    });

    paginator.resetState();
    release();

    expect(channel.pendingDisposal).toBe(true);
  });

  it('stops using a channel that stops matching its filter', () => {
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    channel.data = { ...channel.data, team: 'a' };
    const paginator = list({ team: 'a' });
    paginator.setItems({
      isFirstPage: true,
      isLastPage: true,
      valueOrFactory: [channel],
    });

    channel.data = { ...channel.data, team: 'b' };
    paginator.ingestItem(channel);
    release();

    expect(paginator.items).toEqual([]);
    expect(channel.pendingDisposal).toBe(true);
  });

  it('keeps the instance when a channel moves from one list to another', () => {
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
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
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
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
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    const first = new ChannelPaginator({ client, filters: {} });
    const second = new ChannelPaginator({ client, filters: {} });
    first.setItems({ isFirstPage: true, isLastPage: true, valueOrFactory: [channel] });
    second.setItems({ isFirstPage: true, isLastPage: true, valueOrFactory: [channel] });

    client.channelManager.channelStore.remove(channel.cid);

    expect(first.items).toEqual([]);
    expect(second.items).toEqual([]);
  });

  it('names each message list as a holder in the message store', () => {
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    const message = formatMessage(generateMsg({ id: 'm1', pinned: true }));
    const page = { isFirstPage: true, isLastPage: true, valueOrFactory: [message] };
    channel.messagePaginator.setItems(page);
    channel.pinnedMessagesPaginator.setItems(page);

    expect(client.messageStore.holderNames('m1')).toEqual([
      'message-paginator',
      'pinned-message-paginator',
    ]);
  });

  it('drops a message removed from the message store from the message list', () => {
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
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

describe('client.channel()', () => {
  let client: StreamChat;

  beforeEach(() => {
    client = getClientWithUser({ id: 'ann' });
  });

  it('returns the instance channelManager.ensure() returns for a type and id', () => {
    const channel = client.channel('messaging', 'general', {
      custom: { name: 'General' },
    });

    expect(client.channelManager.ensure({ type: 'messaging', id: 'general' })).toBe(
      channel,
    );
    expect(client.channel('messaging', 'general')).toBe(channel);
    expect(channel.data?.custom?.name).toBe('General');
  });

  it('builds a distinct channel from members passed in place of the id', () => {
    const channel = client.channel('messaging', { members: ['ann', 'bob'] });

    expect(channel.id).toBeUndefined();
    expect(client.channelManager.get('messaging:!members-ann,bob')).toBe(channel);
    expect(client.channel('messaging', undefined, { members: ['bob', 'ann'] })).toBe(
      channel,
    );
  });

  it('builds an unstored channel for no id and no members, as ensure() does', () => {
    const channel = client.channel('messaging', null, { custom: { name: 'Draft' } });

    expect(channel.id).toBeUndefined();
    expect(client.channelManager.values()).not.toContain(channel);
    expect(client.channel('messaging', '', {})).not.toBe(channel);
  });

  it('validates its input like ensure()', () => {
    expect(() => client.channel('messa:ging', 'general')).toThrow(
      "Invalid channel group messa:ging, can't contain the : character",
    );
  });
});
