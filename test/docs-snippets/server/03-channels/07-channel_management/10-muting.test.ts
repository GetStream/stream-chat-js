import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getServerClient } from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { uniqueId } from '../../../helpers/ids';

describe('_default/03-channels/07-channel_management/10-muting.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const channelId = uniqueId('channel');
  const otherChannelId = uniqueId('other');

  beforeAll(async () => {
    cleanup.users.push(userId);
    await serverClient.upsertUser({ id: userId });
    cleanup.channels.push(`messaging:${channelId}`, `messaging:${otherChannelId}`);
    for (const id of [channelId, otherChannelId]) {
      await serverClient
        .channel('messaging', id, { created_by_id: userId, members: [userId] })
        .create();
    }
  });

  afterAll(() => cleanup.run());

  it('mutes a channel for a user', async () => {
    // #region snippet docs="_default/03-channels/07-channel_management/10-muting.md" heading="Mute a Channel" tab="Node.js" index=1
    // COPY: channelId="channel-id"
    const channel = serverClient.channel('messaging', channelId);

    // mute channel for a user
    await channel.mute({ user_id: userId });

    // mute a channel for 2 weeks
    await channel.mute({ user_id: userId, expiration: 14 * 24 * 60 * 60 * 1000 });

    // mute a channel for 10 seconds
    const response = await channel.mute({ user_id: userId, expiration: 10000 });
    // #endregion snippet

    expect(response.channel_mute.user.id).toBe(userId);
    expect(response.channel_mute.channel?.cid).toBe(`messaging:${channelId}`);
    expect(response.channel_mute.expires).toBeTruthy();
  });

  it('queries muted and not muted channels', async () => {
    // make sure the mute doesn't expire during the query
    await serverClient.channel('messaging', channelId).mute({ user_id: userId });

    // #region snippet docs="_default/03-channels/07-channel_management/10-muting.md" heading="Query Muted Channels" tab="Node.js" index=1
    // retrieve all channels excluding muted ones
    const notMuted = await serverClient.queryChannels(
      { members: { $in: [userId] }, muted: false },
      {},
      { user_id: userId },
    );

    // retrieve all muted channels
    const muted = await serverClient.queryChannels(
      { muted: true },
      {},
      { user_id: userId },
    );
    // #endregion snippet

    expect(notMuted.map((c) => c.cid)).toEqual([`messaging:${otherChannelId}`]);
    expect(muted.map((c) => c.cid)).toEqual([`messaging:${channelId}`]);
  });

  it('unmutes a channel for a user', async () => {
    const channel = serverClient.channel('messaging', channelId);

    // #region snippet docs="_default/03-channels/07-channel_management/10-muting.md" heading="Remove a Channel Mute" tab="Node.js" index=1
    // unmute channel for a user
    await channel.unmute({ user_id: userId });
    // #endregion snippet

    const muted = await serverClient.queryChannels(
      { muted: true },
      {},
      { user_id: userId },
    );
    expect(muted).toEqual([]);
  });
});
