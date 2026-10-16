import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { StreamChat } from '../../../../../../src';
import { ChannelPaginator, ignoreEventsForUnknownChannels } from '../../../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
  upsertUsers,
} from '../../../../helpers/clients';
import { Cleanup } from '../../../../helpers/cleanup';
import { uniqueId } from '../../../../helpers/ids';
import { sendServerMessage } from '../../../../helpers/server';
import { retry } from '../../../../helpers/wait';

const DOCS = 'chat/javascript/06-state/05-channel-list.md';
// More than one page (10 channels by default)
const CHANNEL_COUNT = 12;

describe(DOCS, () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const channelIds = Array.from({ length: CHANNEL_COUNT }, () =>
    uniqueId('channel-list'),
  );
  const cid = `messaging:${channelIds[0]}`;
  // `team` channels for the WebSocket events: outside the `messaging` list above
  const teamTopId = uniqueId('team-top');
  const teamIgnoredId = uniqueId('team-ignored');
  const teamFetchedId = uniqueId('team-fetched');
  let client: StreamChat;
  let paginator: ChannelPaginator;

  const createChannel = async (type: string, id: string) => {
    await serverClient.chat.channel(type, id).getOrCreate({
      data: { created_by_id: userId, members: [{ user_id: userId }] },
    });
    cleanup.channels.push(`${type}:${id}`);
  };

  beforeAll(async () => {
    cleanup.users.push(userId);
    // Created before the user connects, so the client hasn't loaded any of them
    await upsertUsers(serverClient, [{ id: userId }]);
    for (const id of channelIds) {
      await createChannel('messaging', id);
      await sendServerMessage(serverClient, `messaging:${id}`, {
        text: 'hi',
        user_id: userId,
      });
    }
    for (const id of [teamFetchedId, teamIgnoredId, teamTopId]) {
      await createChannel('team', id);
      await sendServerMessage(serverClient, `team:${id}`, {
        text: 'hi',
        user_id: userId,
      });
    }
    client = await getClientSideClient({ id: userId });
  });

  afterAll(async () => {
    client.channelManager.unregisterSubscriptions();
    await disconnectClients(client);
    await cleanup.run();
  });

  it('loads a channel list', async () => {
    // #region snippet docs="chat/javascript/06-state/05-channel-list.md" heading="Initialization" tab="JavaScript" index=1
    const channelPaginator = new ChannelPaginator({
      client,
      filters: { type: 'messaging', members: { $in: [userId] } },
      sort: [{ field: 'last_message_at', direction: -1 }],
    });

    client.channelManager.registerSubscriptions();
    client.channelManager.insertPaginator({ paginator: channelPaginator });

    await channelPaginator.toTail();
    // #endregion snippet

    paginator = channelPaginator;
    // The first page, newest message first, holding the instances `client.channel()` returns
    const lastId = channelIds[CHANNEL_COUNT - 1];
    expect(channelPaginator.items).toHaveLength(10);
    expect(channelPaginator.items?.[0]).toBe(client.channel('messaging', lastId));
  });

  it('reads the channel list', () => {
    const channelPaginator = paginator;

    // #region snippet docs="chat/javascript/06-state/05-channel-list.md" heading="Reading" tab="JavaScript" index=1
    const {
      items: channels,
      isLoading,
      hasMoreTail,
    } = channelPaginator.state.getLatestValue();
    // #endregion snippet

    expect(channels).toHaveLength(10);
    expect(isLoading).toBe(false);
    expect(hasMoreTail).toBe(true);
  });

  it('loads more channels', async () => {
    const channelPaginator = paginator;

    // #region snippet docs="chat/javascript/06-state/05-channel-list.md" heading="Loading more channels" tab="JavaScript" index=1
    const { hasMoreTail } = channelPaginator.state.getLatestValue();

    if (hasMoreTail) {
      await channelPaginator.toTail();
    }
    // #endregion snippet

    expect(hasMoreTail).toBe(true);
    expect(channelPaginator.items).toHaveLength(CHANNEL_COUNT);
    expect(channelPaginator.state.getLatestValue().hasMoreTail).toBe(false);
  });

  it('subscribes to the channel list', async () => {
    const channelPaginator = paginator;
    const renderChannelList = vi.fn();

    // #region snippet docs="chat/javascript/06-state/05-channel-list.md" heading="Reading" tab="JavaScript" index=2
    const unsubscribe = channelPaginator.state.subscribeWithSelector(
      ({ items }) => ({ items }),
      ({ items }) => renderChannelList(items),
    );
    // #endregion snippet

    try {
      expect(renderChannelList).toHaveBeenCalledTimes(1);
      // `message.new` moves the oldest channel to the top
      await client.channel('messaging', channelIds[0]).sendMessage({
        message: { text: 'bump' },
      });
      await retry(() => {
        const [items] = renderChannelList.mock.lastCall ?? [];
        expect(items?.[0]?.cid).toBe(cid);
        return Promise.resolve();
      });
    } finally {
      unsubscribe();
    }
  });

  it('adds and removes event handlers', () => {
    // #region snippet docs="chat/javascript/06-state/05-channel-list.md" heading="WebSocket events" tab="JavaScript" index=1
    const removeHandler = client.channelManager.addEventHandler({
      eventType: 'notification.message_new',
      handle: ignoreEventsForUnknownChannels,
      index: 0,
    });

    // Back to the default behavior
    removeHandler();
    // #endregion snippet

    expect(typeof removeHandler).toBe('function');
  });

  it('fetches unknown channels unless they are ignored', async () => {
    // A `team` list showing only its first channel: the other two aren't loaded
    const teamPaginator = new ChannelPaginator({
      client,
      filters: { type: 'team', members: { $in: [userId] } },
      sort: [{ field: 'last_message_at', direction: -1 }],
      paginatorOptions: { pageSize: 1 },
    });
    client.channelManager.insertPaginator({ paginator: teamPaginator });
    await teamPaginator.toTail();
    expect(teamPaginator.items?.map((channel) => channel.id)).toEqual([teamTopId]);
    expect(client.channelManager.get(`team:${teamIgnoredId}`)).toBeUndefined();

    const nextMessageNew = () =>
      new Promise<void>((resolve) => {
        const { unsubscribe } = client.on('notification.message_new', () => {
          unsubscribe();
          resolve();
        });
      });

    try {
      // With `ignoreEventsForUnknownChannels`, the event leaves the list as it is
      const removeHandler = client.channelManager.addEventHandler({
        eventType: 'notification.message_new',
        handle: ignoreEventsForUnknownChannels,
        index: 0,
      });
      const ignoredEvent = nextMessageNew();
      await sendServerMessage(serverClient, `team:${teamIgnoredId}`, {
        text: 'ignored',
        user_id: userId,
      });
      await ignoredEvent;
      removeHandler();
      expect(teamPaginator.items?.map((channel) => channel.id)).toEqual([teamTopId]);

      // By default, the unknown channel is fetched and moved to its position
      await sendServerMessage(serverClient, `team:${teamFetchedId}`, {
        text: 'fetched',
        user_id: userId,
      });
      await retry(() => {
        expect(teamPaginator.items?.[0]?.id).toBe(teamFetchedId);
        return Promise.resolve();
      });
      // Events run in order: the ignored channel would have been added by now
      expect(teamPaginator.items?.map((channel) => channel.id)).not.toContain(
        teamIgnoredId,
      );
    } finally {
      client.channelManager.removePaginator(teamPaginator);
    }
  });

  it('re-queries registered lists after a reconnect', async () => {
    const toTailSpy = vi.spyOn(paginator, 'toTail');
    try {
      await client.closeConnection();
      await client.openConnection();
      await retry(() => {
        expect(toTailSpy).toHaveBeenCalled();
        return Promise.resolve();
      });
    } finally {
      toTailSpy.mockRestore();
    }
  });
});
