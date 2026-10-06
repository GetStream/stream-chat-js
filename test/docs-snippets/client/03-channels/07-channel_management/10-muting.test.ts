import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { StreamChat } from '../../../../../src';
import { disconnectClients, getServerClient } from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { uniqueId } from '../../../helpers/ids';
import { retry } from '../../../helpers/wait';

describe('_default/03-channels/07-channel_management/10-muting.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const channelId = uniqueId('channel');
  const otherChannelId = uniqueId('other');
  const premutedChannelId = uniqueId('premuted');
  const user = { id: userId };
  const token = serverClient.createToken(userId);
  const client = new StreamChat(process.env.STREAM_API_KEY as string, {
    allowServerSideConnect: true,
  });

  beforeAll(async () => {
    cleanup.users.push(userId);
    await serverClient.upsertUser(user);
    cleanup.channels.push(
      `messaging:${channelId}`,
      `messaging:${otherChannelId}`,
      `messaging:${premutedChannelId}`,
    );
    for (const id of [channelId, otherChannelId, premutedChannelId]) {
      await serverClient
        .channel('messaging', id, { created_by_id: userId, members: [userId] })
        .create();
    }
    // muted before connecting, so the connect response lists it in channel_mutes
    await serverClient.channel('messaging', premutedChannelId).mute({ user_id: userId });
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('connects, mutes a channel and reads its mute status', async () => {
    // #region snippet docs="_default/03-channels/07-channel_management/10-muting.md" heading="Mute a Channel" tab="JavaScript" index=1
    // COPY: channelId="channel-id"
    const reply = await client.connectUser(user, token);

    // reply.me.channel_mutes contains the list of channel mutes
    console.log(reply?.me?.channel_mutes);

    const channel = client.channel('messaging', channelId);
    await channel.watch();

    // mute channel for current user
    await channel.mute();

    // mute a channel for 2 weeks
    await channel.mute({ expiration: 14 * 24 * 60 * 60 * 1000 });

    // mute a channel for 10 seconds
    await channel.mute({ expiration: 10000 });

    // check if channel is muted
    // { muted: true | false, createdAt: Date | null, expiresAt: Date | null}
    channel.muteStatus();
    // #endregion snippet

    expect(reply?.me?.channel_mutes.map((m) => m.channel?.cid)).toContain(
      `messaging:${premutedChannelId}`,
    );
    // the local mute list is updated by the notification.channel_mutes_updated WS event
    const status = await retry(() => {
      const s = channel.muteStatus();
      if (!s.muted || !s.expiresAt) throw new Error('mute status not updated yet');
      return Promise.resolve(s);
    });
    expect(status.muted).toBe(true);
    expect(status.expiresAt).toBeInstanceOf(Date);
  });

  it('queries muted and not muted channels', async () => {
    // make sure the mute doesn't expire during the query
    await client.channel('messaging', channelId).mute();
    const spy = vi.spyOn(client, 'queryChannels');

    // #region snippet docs="_default/03-channels/07-channel_management/10-muting.md" heading="Query Muted Channels" tab="JavaScript" index=1
    // retrieve all channels excluding muted ones
    await client.queryChannels({ members: { $in: [userId] }, muted: false });

    // retrieve all muted channels
    await client.queryChannels({ muted: true });
    // #endregion snippet

    const [notMuted, muted] = await Promise.all(spy.mock.results.map((r) => r.value));
    spy.mockRestore();
    expect(notMuted.map((c: { cid: string }) => c.cid)).toEqual([
      `messaging:${otherChannelId}`,
    ]);
    expect(muted.map((c: { cid: string }) => c.cid).sort()).toEqual(
      [`messaging:${channelId}`, `messaging:${premutedChannelId}`].sort(),
    );
  });

  it('unmutes a channel', async () => {
    const channel = client.channel('messaging', channelId);

    // #region snippet docs="_default/03-channels/07-channel_management/10-muting.md" heading="Remove a Channel Mute" tab="JavaScript" index=1
    // unmute channel for current user
    await channel.unmute();
    // #endregion snippet

    const muted = await client.queryChannels({ muted: true });
    expect(muted.map((c) => c.cid)).toEqual([`messaging:${premutedChannelId}`]);
  });
});
