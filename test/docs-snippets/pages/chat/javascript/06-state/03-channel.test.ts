import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Channel, LocalMessage, StreamChat } from '../../../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../../../helpers/clients';
import { Cleanup } from '../../../../helpers/cleanup';
import { uniqueId } from '../../../../helpers/ids';
import { retry } from '../../../../helpers/wait';

const DOCS = 'chat/javascript/06-state/03-channel.md';

describe(DOCS, () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const otherUserId = uniqueId('other');
  const channelId = uniqueId('channel');
  let client: StreamChat;
  let otherClient: StreamChat;
  let watchedChannel: Channel;

  beforeAll(async () => {
    cleanup.users.push(userId, otherUserId);
    client = await getClientSideClient({ id: userId });
    otherClient = await getClientSideClient({ id: otherUserId });
    await serverClient.chat.channel('messaging', channelId).getOrCreate({
      data: {
        created_by_id: userId,
        members: [{ user_id: userId }, { user_id: otherUserId }],
      },
    });
    cleanup.channels.push(`messaging:${channelId}`);
  });

  afterAll(async () => {
    await disconnectClients(client, otherClient);
    await cleanup.run();
  });

  it('gets a channel', async () => {
    // #region snippet docs="chat/javascript/06-state/03-channel.md" heading="Initialization" tab="JavaScript" index=1
    const channel = client.channel('messaging', channelId);
    await channel.watch();
    // #endregion snippet

    watchedChannel = channel;
    expect(client.channel('messaging', channelId)).toBe(channel);
    expect(channel.state.getLatestValue().memberCount).toBe(2);
  });

  it('queries channels', async () => {
    // #region snippet docs="chat/javascript/06-state/03-channel.md" heading="Initialization" tab="JavaScript" index=2
    const channels = await client.queryChannelsAndHydrate({
      filter_conditions: { type: 'messaging', members: { $in: [userId] } },
      sort: [{ field: 'last_message_at', direction: -1 }],
      limit: 15,
    });

    // The same instances `client.channel()` returns
    const [firstChannel] = channels;
    // #endregion snippet

    expect(channels).toHaveLength(1);
    expect(firstChannel).toBe(client.channel('messaging', channelId));
    expect(firstChannel.initialized).toBe(true);
    expect(firstChannel.state.getLatestValue().memberCount).toBe(2);
  });

  it('reads channel state', () => {
    const channel = watchedChannel;

    // #region snippet docs="chat/javascript/06-state/03-channel.md" heading="Reading" tab="JavaScript" index=1
    // Channel data, members, my membership and permissions, typing, read state, mute
    const {
      data,
      members,
      memberCount,
      membership,
      ownCapabilities,
      typing,
      read,
      muteStatus,
    } = channel.state.getLatestValue();

    // My unread count (derived from `read`)
    const unreadCount = channel.state.unreadCount;

    // Slow mode wait, in seconds
    const { cooldownRemaining } = channel.cooldownTimer.state.getLatestValue();

    // Channel config from the server
    const config = channel.serverConfig;
    // #endregion snippet

    expect(data?.id).toBe(channelId);
    expect(Object.keys(members).sort()).toEqual([otherUserId, userId].sort());
    expect(memberCount).toBe(2);
    expect(membership.user?.id).toBe(userId);
    expect(ownCapabilities).toContain('send-message');
    expect(typing).toEqual({});
    expect(read[userId]).toBeDefined();
    expect(muteStatus.muted).toBe(false);
    expect(unreadCount).toBe(0);
    expect(cooldownRemaining).toBe(0);
    expect(config?.name).toBe('messaging');
  });

  it('subscribes to channel state', async () => {
    const channel = watchedChannel;
    const renderHeader = vi.fn();

    // #region snippet docs="chat/javascript/06-state/03-channel.md" heading="Reading" tab="JavaScript" index=2
    const unsubscribe = channel.state.subscribeWithSelector(
      ({ read, members }) => ({ read, members }),
      ({ read, members }) => renderHeader(read, members),
    );
    // #endregion snippet

    try {
      expect(renderHeader).toHaveBeenCalledTimes(1);
      // The other member sends a message: my unread count goes up
      await otherClient.channel('messaging', channelId).sendMessage({
        message: { text: 'unread' },
      });
      await retry(() => {
        expect(renderHeader.mock.calls.length).toBeGreaterThan(1);
        expect(channel.state.unreadCount).toBe(1);
        return Promise.resolve();
      });
    } finally {
      unsubscribe();
    }
  });

  it('reads read receipts', async () => {
    const channel = watchedChannel;
    const { message: sent } = await channel.sendMessage({
      message: { text: 'read me' },
    });
    await retry(() => {
      expect(channel.messagePaginator.getItem(sent.id)).toBeDefined();
      return Promise.resolve();
    });
    const message = channel.messagePaginator.getItem(sent.id) as LocalMessage;
    const renderReceipts = vi.fn();

    // #region snippet docs="chat/javascript/06-state/03-channel.md" heading="Read receipts" tab="JavaScript" index=1
    const readers = channel.messageReceiptsTracker.readersForMessage({
      msgId: message.id,
      timestamp: message.created_at,
    });

    const unsubscribeReceipts = channel.messageReceiptsTracker.snapshotStore.subscribe(
      () => {
        renderReceipts(
          channel.messageReceiptsTracker.readersForMessage({
            msgId: message.id,
            timestamp: message.created_at,
          }),
        );
      },
    );
    // #endregion snippet

    try {
      expect(readers.map((user) => user.id)).not.toContain(otherUserId);
      // The other member reads the channel
      const otherChannel = otherClient.channel('messaging', channelId);
      await otherChannel.watch();
      await otherChannel.markRead();
      await retry(() => {
        expect(renderReceipts).toHaveBeenLastCalledWith(
          expect.arrayContaining([expect.objectContaining({ id: otherUserId })]),
        );
        return Promise.resolve();
      });
    } finally {
      unsubscribeReceipts();
    }
  });

  it('refreshes active channels after a reconnect', async () => {
    const channel = watchedChannel;

    // #region snippet docs="chat/javascript/06-state/03-channel.md" heading="Active channel" tab="JavaScript" index=1
    // While the channel is on screen
    const release = channel.activate();

    // When the channel leaves the screen
    release();
    // #endregion snippet

    expect(channel.active).toBe(false);

    // An active channel is reloaded after a reconnect, an inactive one isn't
    const reloadSpy = vi.spyOn(channel, 'reload');
    const reconnect = async () => {
      const recovered = new Promise<void>((resolve) => {
        const { unsubscribe } = client.on('connection.recovered', () => {
          unsubscribe();
          resolve();
        });
      });
      await client.closeConnection();
      await client.openConnection();
      await recovered;
    };
    try {
      await reconnect();
      expect(reloadSpy).not.toHaveBeenCalled();

      const releaseAgain = channel.activate();
      await reconnect();
      releaseAgain();
      expect(reloadSpy).toHaveBeenCalledTimes(1);
    } finally {
      reloadSpy.mockRestore();
    }
  });
});
