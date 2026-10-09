import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getClientWithUser } from './test-utils/getClient';
import { generateChannel } from './test-utils/generateChannel';
import { generateMsg } from './test-utils/generateMessage';
import { formatMessage } from '../../src/utils';
import {
  Channel as ChannelClass,
  ChannelPaginator,
  ChannelWatchStatus,
  MessageComposer,
} from '../../src';
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

  describe('a channel created from members', () => {
    const TEMP_CID = 'messaging:!members-ann,bob';
    const respondWith = (id: string, memberIds = ['ann', 'bob']) =>
      vi.spyOn(client, 'getOrCreateDistinctChannel').mockResolvedValue({
        ...generateChannel({ channel: { id, type: 'messaging' } }),
        members: memberIds.map(member),
      } as unknown as ChannelStateResponseFields & { duration: string });

    it('is stored under a temporary cid built from its members until the server answers', () => {
      const channel = client.channelManager.ensure({
        type: 'messaging',
        data: { members: ['bob', 'ann'] },
      });

      expect(channel.id).toBeUndefined();
      expect(channel.cid).toBe(TEMP_CID);
      expect(client.channelManager.get(TEMP_CID)).toBe(channel);
      expect(
        client.channelManager.ensure({
          type: 'messaging',
          data: { members: ['ann', 'bob'] },
        }),
      ).toBe(channel);
    });

    it('moves the same instance to the cid the server gives it', async () => {
      const channel = client.channelManager.ensure({
        type: 'messaging',
        data: { members: ['ann', 'bob'] },
      });
      respondWith('!members-xyz');

      await channel.query({});

      expect(channel.cid).toBe('messaging:!members-xyz');
      expect(client.channelManager.get('messaging:!members-xyz')).toBe(channel);
      expect(client.channelManager.get(TEMP_CID)).toBeUndefined();
      expect(client.channelManager.values()).toEqual([channel]);
    });

    it('moves from the key it is stored under even when the server lists other members', async () => {
      // e.g. the distinct channel exists and carl was added to it since
      const channel = client.channelManager.ensure({
        type: 'messaging',
        data: { members: ['ann', 'bob'] },
      });
      respondWith('!members-xyz', ['ann', 'bob', 'carl']);

      await channel.query({});

      expect(client.channelManager.get(TEMP_CID)).toBeUndefined();
      expect(client.channelManager.values()).toEqual([channel]);
    });

    it('is listed only once the server gives it an id, under its real cid', async () => {
      const paginator = new ChannelPaginator({ client, filters: { type: 'messaging' } });
      paginator.setItems({ isFirstPage: true, isLastPage: true, valueOrFactory: [] });
      client.channelManager.setPaginators([paginator]);
      const channel = client.channelManager.ensure({
        type: 'messaging',
        data: { members: [{ user_id: 'ann' }, { user_id: 'bob' }] },
      });

      expect(paginator.ingestItem(channel)).toBe(false);
      client.channelManager.ingestChannel(channel);
      expect(paginator.items).toEqual([]);

      respondWith('!members-xyz');
      await channel.query({});
      client.channelManager.ingestChannel(channel);

      expect(paginator.items).toEqual([channel]);
      expect(paginator.getItem('messaging:!members-xyz')).toBe(channel);
      // the list keeps working for it: a later ingestion and removal find it by its real cid
      expect(() => client.channelManager.ingestChannel(channel)).not.toThrow();
      paginator.removeItem({ item: channel });
      expect(paginator.items).toEqual([]);
    });

    it('lists the instance that superseded it, never the superseded one', async () => {
      const stored = client.channelManager.ensure({
        type: 'messaging',
        id: '!members-xyz',
      });
      const paginator = new ChannelPaginator({ client, filters: { type: 'messaging' } });
      paginator.setItems({
        isFirstPage: true,
        isLastPage: true,
        valueOrFactory: [stored],
      });
      client.channelManager.setPaginators([paginator]);
      const created = client.channelManager.ensure({
        type: 'messaging',
        data: { members: [{ user_id: 'ann' }, { user_id: 'bob' }] },
      });
      respondWith('!members-xyz');
      await created.query({});
      expect(created.supersededBy).toBe(stored);

      client.channelManager.ingestChannel(created);
      paginator.ingestItem(created);

      expect(client.channelManager.get(stored.cid)).toBe(stored);
      expect(paginator.items).toEqual([stored]);
      expect(stored.pendingDisposal).toBe(false);
    });

    it('ensureWatched() resolves with the instance superseding it during its watch', async () => {
      const stored = client.channelManager.ensure({
        type: 'messaging',
        id: '!members-xyz',
      });
      stored.watchStatus = ChannelWatchStatus.Watching;
      const created = client.channelManager.ensure({
        type: 'messaging',
        data: { members: [{ user_id: 'ann' }, { user_id: 'bob' }] },
      });
      respondWith('!members-xyz');

      const watched = await created.ensureWatched();

      expect(created.supersededBy).toBe(stored);
      expect(watched).toBe(stored);
    });

    it('ensureWatched() on a superseded instance resolves with its successor', async () => {
      const stored = client.channelManager.ensure({
        type: 'messaging',
        id: '!members-xyz',
      });
      stored.watchStatus = ChannelWatchStatus.Watching;
      const created = client.channelManager.ensure({
        type: 'messaging',
        data: { members: [{ user_id: 'ann' }, { user_id: 'bob' }] },
      });
      respondWith('!members-xyz');
      await created.query({});
      const watch = vi.spyOn(created, 'watch');
      const storedWatch = vi.spyOn(stored, 'watch');

      expect(await created.ensureWatched()).toBe(stored);
      expect(watch).not.toHaveBeenCalled();
      expect(storedWatch).not.toHaveBeenCalled();
    });

    it('is not watched once its watch supersedes it; the stored instance is', async () => {
      const stored = client.channelManager.ensure({
        type: 'messaging',
        id: '!members-xyz',
      });
      const created = client.channelManager.ensure({
        type: 'messaging',
        data: { members: [{ user_id: 'ann' }, { user_id: 'bob' }] },
      });
      respondWith('!members-xyz');

      await created.watch();

      expect(created.supersededBy).toBe(stored);
      expect(created.watchStatus).toBe(ChannelWatchStatus.NotWatching);
      expect(stored.watchStatus).toBe(ChannelWatchStatus.Watching);
    });

    it('resolves to a stored distinct channel with the same loaded members', () => {
      const stored = client.channelManager.ensure({
        type: 'messaging',
        id: '!members-xyz',
      });
      stored.state.members = { ann: member('ann'), bob: member('bob') } as never;

      expect(
        client.channelManager.ensure({
          type: 'messaging',
          data: { members: ['ann', 'bob'] },
        }),
      ).toBe(stored);
    });

    it('leaves another instance holding the cid the server answers in place, and is not stored', async () => {
      // stored while the created channel's query was in flight, e.g. by an event
      const stored = client.channelManager.ensure({
        type: 'messaging',
        id: '!members-xyz',
      });
      const paginator = new ChannelPaginator({ client, filters: { type: 'messaging' } });
      paginator.setItems({
        isFirstPage: true,
        isLastPage: true,
        valueOrFactory: [stored],
      });
      client.channelManager.setPaginators([paginator]);
      const created = client.channelManager.ensure({
        type: 'messaging',
        data: { members: ['ann', 'bob'] },
      });
      respondWith('!members-xyz');

      await created.query({});

      expect(client.channelManager.get('messaging:!members-xyz')).toBe(stored);
      expect(client.channelManager.get(TEMP_CID)).toBeUndefined();
      expect(stored.pendingDisposal).toBe(false);
      expect(paginator.items).toEqual([stored]);
      expect(client.channelManager.values()).toEqual([stored]);
      // not disconnected: its caller can keep using it
      expect(created.pendingDisposal).toBe(false);
    });
  });

  describe('when the server answers with a cid another instance holds', () => {
    const REAL_CID = 'messaging:!members-xyz';
    /** B: stored under the real cid meanwhile (e.g. by an event); A: created from members. */
    const setup = () => {
      const stored = client.channelManager.ensure({
        type: 'messaging',
        id: '!members-xyz',
      });
      const created = client.channelManager.ensure({
        type: 'messaging',
        data: { members: ['ann', 'bob'] },
      });
      return { created, stored };
    };
    const message = (id: string, overrides: Record<string, unknown> = {}) =>
      formatMessage(
        generateMsg({ cid: REAL_CID, id, ...overrides }) as Parameters<
          typeof formatMessage
        >[0],
      );
    const respond = (messages: ReturnType<typeof generateMsg>[] = []) =>
      vi.spyOn(client, 'getOrCreateDistinctChannel').mockResolvedValue({
        ...generateChannel({
          channel: { custom: { name: 'Fresh' }, id: '!members-xyz', type: 'messaging' },
          members: [member('ann'), member('bob')],
          messages,
        } as never),
      } as unknown as ChannelStateResponseFields & { duration: string });

    it('keeps the stored instance, which takes the server data, and marks the other superseded', async () => {
      const { created, stored } = setup();
      respond([generateMsg({ cid: REAL_CID, id: 'from-server' })]);

      await created.query({}, 'latest');

      expect(client.channelManager.values()).toEqual([stored]);
      expect(stored.data?.custom?.name).toBe('Fresh');
      expect(stored.messagePaginator.getItem('from-server')).toBeDefined();
      expect(created.supersededBy).toBe(stored);
      expect(created.pendingDisposal).toBe(false);
    });

    it("keeps the stored instance's local messages", async () => {
      const { created, stored } = setup();
      stored.messagePaginator.ingestItem(message('failed', { status: 'failed' }));
      respond([generateMsg({ cid: REAL_CID, id: 'from-server' })]);

      await created.query({}, 'latest');

      expect(stored.messagePaginator.getItem('failed')?.status).toBe('failed');
    });

    it("adds the other instance's local messages, keeping the stored copy of one both have", async () => {
      const { created, stored } = setup();
      // composed in A, under A's temporary cid
      created.messagePaginator.ingestItem(
        message('sending', { cid: created.cid, status: 'sending' }),
      );
      created.messagePaginator.ingestItem(
        message('both', { cid: created.cid, status: 'failed', text: 'theirs' }),
      );
      stored.messagePaginator.ingestItem(
        message('both', { status: 'failed', text: 'mine' }),
      );
      respond();

      await created.query({}, 'latest');

      expect(stored.messagePaginator.getItem('sending')?.status).toBe('sending');
      expect(stored.messagePaginator.getItem('both')?.text).toBe('mine');
    });

    it('moves the composer from the open instance to the stored one that is not open', async () => {
      const { created, stored } = setup();
      created.activate();
      created.messageComposer.textComposer.setText('hello');
      respond();

      await created.query({}, 'latest');

      expect(stored.messageComposer.textComposer.text).toBe('hello');
      expect(created.messageComposer.textComposer.text).toBe('');
    });

    it('hands an upload the other one started to the stored instance, still running', async () => {
      const { created, stored } = setup();
      created.activate();
      let signal: AbortSignal | undefined;
      let finish: (result: { file: string }) => void = () => undefined;
      created.messageComposer.attachmentManager.setCustomUploadFn((_file, options) => {
        signal = options?.abortSignal;
        return new Promise((resolve) => {
          finish = resolve;
        });
      });
      vi.spyOn(
        created.messageComposer.attachmentManager,
        'getUploadConfigCheck',
      ).mockResolvedValue({ uploadBlocked: false });
      const uploaded = created.messageComposer.attachmentManager.uploadFile(
        new File(['x'], 'x.png', { type: 'image/png' }),
      );
      await vi.waitFor(() => expect(signal).toBeDefined());
      respond();

      await created.query({}, 'latest');

      expect(signal?.aborted).toBe(false);
      expect(created.messageComposer.attachmentManager.attachments).toEqual([]);
      expect(stored.messageComposer.attachmentManager.attachments).toEqual([
        expect.objectContaining({
          localMetadata: expect.objectContaining({ uploadState: 'uploading' }),
        }),
      ]);

      finish({ file: 'https://cdn/x.png' });
      await uploaded;

      await vi.waitFor(() =>
        expect(stored.messageComposer.attachmentManager.attachments).toEqual([
          expect.objectContaining({
            image_url: 'https://cdn/x.png',
            localMetadata: expect.objectContaining({ uploadState: 'finished' }),
          }),
        ]),
      );
      expect(created.messageComposer.attachmentManager.attachments).toEqual([]);
    });

    it('overwrites neither composer when both instances are open', async () => {
      const { created, stored } = setup();
      created.activate();
      stored.activate();
      created.messageComposer.textComposer.setText('theirs');
      stored.messageComposer.textComposer.setText('mine');
      respond();

      await created.query({}, 'latest');

      expect(stored.messageComposer.textComposer.text).toBe('mine');
      expect(created.messageComposer.textComposer.text).toBe('theirs');
    });

    it('keeps the superseded instance connected when its last consumer releases it', async () => {
      const { created } = setup();
      const release = created.activate();
      respond();
      await created.query({}, 'latest');

      release();

      expect(created.state.getLatestValue().active).toBe(false);
      expect(created.pendingDisposal).toBe(false);
    });

    it('disconnects a superseded instance nobody released on disconnectUser', async () => {
      const { created } = setup();
      respond();
      await created.query({}, 'latest');

      await client.disconnectUser();

      expect(created.pendingDisposal).toBe(true);
    });
  });

  it('replaces a torn-down channel with a fresh instance', () => {
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    channel.disconnect();

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

  it('empties each list in one update on disconnectUser, writing nothing to the offline DB', async () => {
    const channels = ['a', 'b', 'c'].map((id) =>
      client.channelManager.ensure({ type: 'messaging', id }),
    );
    const paginator = new ChannelPaginator({ client, filters: { type: 'messaging' } });
    paginator.setItems({ isFirstPage: true, isLastPage: true, valueOrFactory: channels });
    client.channelManager.setPaginators([paginator]);
    const cacheCids = vi.spyOn(
      paginator as unknown as { cacheCidsForQuery: () => void },
      'cacheCidsForQuery',
    );
    const published: unknown[] = [];
    const unsubscribe = paginator.state.subscribe((state) => published.push(state.items));
    published.length = 0; // subscribe reports the current state first

    await client.disconnectUser();
    unsubscribe();

    expect(published).toEqual([undefined]);
    expect(cacheCids).not.toHaveBeenCalled();
    expect(channels.every((channel) => channel.pendingDisposal)).toBe(true);
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

  it('does not activate a disposed channel, and hands back a release that does nothing', () => {
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    client.channelManager.removeChannel(channel.cid);

    const release = channel.activate();

    expect(channel.active).toBe(false);
    expect(() => release()).not.toThrow();
    expect(channel.active).toBe(false);
    expect(client.channelManager.get(channel.cid)).toBeUndefined();
  });

  it('tears down an opened channel on a known end', () => {
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    channel.activate();

    client.dispatchEvent({ type: 'channel.deleted', cid: channel.cid });

    expect(channel.pendingDisposal).toBe(true);
    expect(client.channelManager.get('messaging:general')).toBeUndefined();
  });

  it.each([
    ['channel.deleted'],
    ['notification.channel_deleted'],
    ['notification.removed_from_channel'],
  ])('keeps the fresh instance a %s listener got for the channel', (type) => {
    const ended = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    let fresh: ReturnType<typeof client.channelManager.ensure> | undefined;
    client.on(type as never, () => {
      fresh = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    });

    client.dispatchEvent({ type, cid: ended.cid } as never);

    expect(ended.pendingDisposal).toBe(true);
    expect(fresh).toBeDefined();
    expect(fresh).not.toBe(ended);
    expect(fresh?.pendingDisposal).toBe(false);
    expect(client.channelManager.get('messaging:general')).toBe(fresh);
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

  it('leaves unused channels stored when the lists reload and when the connection recovers', async () => {
    // nothing keeps it, but the app may: only the app releases it
    const unused = client.channelManager.ensure({ type: 'messaging', id: 'unused' });

    await client.channelManager.reload();
    await client.channelManager.recover();

    expect(unused.pendingDisposal).toBe(false);
    expect(client.channelManager.get('messaging:unused')).toBe(unused);
  });

  it('releases an unused channel when the app asks for it', () => {
    const unused = client.channelManager.ensure({ type: 'messaging', id: 'unused' });

    client.channelManager.releaseUnusedChannels();

    expect(unused.pendingDisposal).toBe(true);
    expect(client.channelManager.get('messaging:unused')).toBeUndefined();
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

  it('keeps a disconnected channel stored and listed until the app releases unused channels', () => {
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    const paginator = list();
    paginator.setItems({
      isFirstPage: true,
      isLastPage: true,
      valueOrFactory: [channel],
    });

    channel.disconnect();

    expect(channel.pendingDisposal).toBe(true);
    expect(client.channelManager.get(channel.cid)).toBe(channel);
    expect(paginator.items).toEqual([channel]);
  });

  it('passes events for a stored, disconnected channel to listeners without handling them', () => {
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    channel.disconnect();
    const clientListener = vi.fn();
    const channelListener = vi.fn();
    client.on('message.new', clientListener);
    channel.on('message.new', channelListener);
    const stateBefore = channel.state.getLatestValue();

    expect(() =>
      client.dispatchEvent({
        cid: channel.cid,
        message: generateMsg({ cid: channel.cid }),
        type: 'message.new',
      } as never),
    ).not.toThrow();

    expect(clientListener).toHaveBeenCalledTimes(1);
    expect(channelListener).toHaveBeenCalledTimes(1);
    expect(channel.state.getLatestValue()).toBe(stateBefore);
  });

  it('releases a disconnected channel whatever still holds or uses it', () => {
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    const paginator = list();
    paginator.setItems({
      isFirstPage: true,
      isLastPage: true,
      valueOrFactory: [channel],
    });
    channel.activate();
    client.channelManager.channelStore.addClaim({ heldBy: () => [channel] });
    channel.disconnect();

    release();

    expect(client.channelManager.get(channel.cid)).toBeUndefined();
    expect(paginator.items).toEqual([]);
    expect(client.channelManager.ensure({ type: 'messaging', id: 'general' })).not.toBe(
      channel,
    );
  });

  it('lists the stored instance when given another instance for its cid', () => {
    const stored = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    const paginator = list();
    paginator.setItems({ isFirstPage: true, isLastPage: true, valueOrFactory: [stored] });
    client.channelManager.setPaginators([paginator]);
    const other = new ChannelClass(client, 'messaging', 'general', {});

    client.channelManager.ingestChannel(other);
    paginator.ingestItem(other);

    expect(client.channelManager.get('messaging:general')).toBe(stored);
    expect(paginator.items).toEqual([stored]);
  });

  it('lists the fresh stored instance when given a disconnected one for its cid', () => {
    const disconnected = client.channelManager.ensure({
      type: 'messaging',
      id: 'general',
    });
    disconnected.disconnect();
    release();
    const fresh = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    const paginator = list();
    paginator.setItems({ isFirstPage: true, isLastPage: true, valueOrFactory: [fresh] });
    client.channelManager.setPaginators([paginator]);

    client.channelManager.ingestChannel(disconnected);
    paginator.ingestItem(disconnected);

    expect(client.channelManager.get('messaging:general')).toBe(fresh);
    expect(paginator.items).toEqual([fresh]);
  });

  it('neither lists nor stores again a disconnected instance whose cid has none stored', () => {
    const disconnected = client.channelManager.ensure({
      type: 'messaging',
      id: 'general',
    });
    disconnected.disconnect();
    release();
    const paginator = list();
    paginator.setItems({ isFirstPage: true, isLastPage: true, valueOrFactory: [] });
    client.channelManager.setPaginators([paginator]);

    client.channelManager.ingestChannel(disconnected);
    expect(paginator.ingestItem(disconnected)).toBe(false);

    expect(client.channelManager.get('messaging:general')).toBeUndefined();
    expect(paginator.items).toEqual([]);
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

  it('lists a stored channel that a message reaches before any channel query', async () => {
    // as a thread builds its channel: stored, but `data` carries no `type`
    const channel = client.channelManager.ensure({
      type: 'messaging',
      id: 'from-thread',
      data: { custom: {} } as never,
    });
    const paginator = list();
    paginator.setItems({ isFirstPage: true, isLastPage: true, valueOrFactory: [] });
    client.channelManager.setPaginators([paginator]);
    client.channelManager.registerSubscriptions();

    client.dispatchEvent({
      type: 'message.new',
      cid: channel.cid,
      channel_type: channel.type,
      channel_id: channel.id,
      message: generateMsg({ cid: channel.cid }),
    } as never);

    await vi.waitFor(() => expect(paginator.items).toEqual([channel]));
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

  it('still writes the offline DB when a holder throws as the ended channel is removed', () => {
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    client.channelManager.channelStore.link(channel.cid, {
      onEntityRemoved: () => {
        throw new Error('holder failed');
      },
    });
    const executeQuerySafely = vi.fn();
    client.offlineDb = { executeQuerySafely } as never;
    const event = { type: 'channel.deleted', cid: channel.cid } as never;

    expect(() => client.dispatchEvent(event)).not.toThrow();

    expect(client.channelManager.get(channel.cid)).toBeUndefined();
    expect(executeQuerySafely).toHaveBeenCalledWith(expect.any(Function), {
      method: 'handleEvent;channel.deleted',
    });
  });

  it('finishes logging out when a holder throws while the channels are cleared', async () => {
    const channel = client.channelManager.ensure({ type: 'messaging', id: 'general' });
    client.channelManager.channelStore.link(channel.cid, {
      onEntityRemoved: () => {
        throw new Error('holder failed');
      },
    } as never);
    client.mutedChannels = [{ channel: { cid: channel.cid } }] as never;
    const stateBefore = client.state;
    let disconnected: Promise<void> | undefined;

    expect(() => {
      disconnected = client.disconnectUser();
    }).not.toThrow();
    await disconnected;

    expect(channel.pendingDisposal).toBe(true);
    expect(client.channelManager.values()).toEqual([]);
    // the steps after clearing the channels ran
    expect(client.state).not.toBe(stateBefore);
    expect(client.mutedChannels).toEqual([]);
  });

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

describe('a channel list removing a channel', () => {
  let client: StreamChat;

  beforeEach(() => {
    client = getClientWithUser({ id: 'ann' });
  });

  const unread = (channel: ReturnType<typeof listed>[number], count: number) => {
    channel.state.read = {
      ...channel.state.read,
      ann: { last_read: 0, unread_messages: count, user: { id: 'ann' } } as never,
    };
  };

  const listed = (field: string, ids = ['a', 'b', 'c']) => {
    const channels = ids.map((id) =>
      client.channelManager.ensure({ type: 'messaging', id }),
    );
    const paginator = new ChannelPaginator({
      client,
      filters: { type: 'messaging' },
      sort: [{ direction: -1, field }],
    });
    paginator.setItems({ isFirstPage: true, isLastPage: true, valueOrFactory: channels });
    client.channelManager.setPaginators([paginator]);
    return Object.assign(channels, { paginator });
  };

  it.each([['has_unread'], ['unread_count']])(
    'drops a deleted channel from a list sorted by %s',
    (field) => {
      const channels = listed(field);
      channels.forEach((channel, index) => unread(channel, index));

      expect(() =>
        client.dispatchEvent({
          channel: { cid: 'messaging:b', id: 'b', type: 'messaging' },
          channel_id: 'b',
          channel_type: 'messaging',
          cid: 'messaging:b',
          type: 'channel.deleted',
        } as never),
      ).not.toThrow();

      expect(channels.paginator.items?.map((channel) => channel.cid)).not.toContain(
        'messaging:b',
      );
      expect(client.channelManager.get('messaging:b')).toBeUndefined();
    },
  );

  it('sorts by unread_count a channel without a read entry for the user', () => {
    const channels = listed('unread_count');

    expect(channels.paginator.items).toHaveLength(3);
  });

  it('removes a channel whose sort value changed since it was placed', () => {
    const channels = listed('unread_count', ['a', 'b', 'c', 'd', 'e']);
    channels.forEach((channel, index) => unread(channel, index));
    channels.paginator.setItems({
      isFirstPage: true,
      isLastPage: true,
      valueOrFactory: [...channels].reverse(),
    });
    // a now sorts first, but the list hasn't re-sorted it: a search by order looks in the wrong place
    unread(channels[0], 10);

    channels.paginator.removeItem({ id: 'messaging:a', item: channels[0] });

    expect(channels.paginator.items?.map((channel) => channel.cid)).toEqual([
      'messaging:e',
      'messaging:d',
      'messaging:c',
      'messaging:b',
    ]);
  });
});

describe('the channel clean loop', () => {
  let client: StreamChat;

  beforeEach(() => {
    vi.useFakeTimers();
    client = getClientWithUser({ id: 'ann' });
  });

  afterEach(() => {
    clearInterval(client.cleaningIntervalRef);
    client.cleaningIntervalRef = undefined;
    vi.useRealTimers();
  });

  const stored = (ids: string[]) =>
    ids.map((id) => {
      const channel = client.channelManager.ensure({ type: 'messaging', id });
      return { channel, clean: vi.spyOn(channel, 'clean') };
    });

  it('cleans the channels after a disposed one still stored', () => {
    const [a, b, c] = stored(['a', 'b', 'c']);
    // disposed, but not yet removed from the store
    b.channel.disconnect();

    client._startCleaning();
    vi.advanceTimersByTime(500);

    expect(a.clean).toHaveBeenCalledTimes(1);
    expect(b.clean).not.toHaveBeenCalled();
    expect(c.clean).toHaveBeenCalledTimes(1);
  });

  it('cleans the channels after one whose clean throws', () => {
    const [a, b, c] = stored(['a', 'b', 'c']);
    b.clean.mockImplementation(() => {
      throw new Error('clean failed');
    });

    client._startCleaning();

    expect(() => vi.advanceTimersByTime(500)).not.toThrow();
    expect(a.clean).toHaveBeenCalledTimes(1);
    expect(c.clean).toHaveBeenCalledTimes(1);
  });
});
