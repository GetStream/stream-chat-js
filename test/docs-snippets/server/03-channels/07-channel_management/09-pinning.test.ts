import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getServerClient } from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { uniqueId } from '../../../helpers/ids';

describe('_default/03-channels/07-channel_management/09-pinning.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const amyId = uniqueId('amy');
  const benId = uniqueId('ben');
  const channelId = uniqueId('general');
  const otherChannelId = uniqueId('other');

  beforeAll(async () => {
    cleanup.users.push(amyId, benId);
    await serverClient.upsertUsers([{ id: amyId }, { id: benId }]);
    cleanup.channels.push(`messaging:${channelId}`, `messaging:${otherChannelId}`);
    // created first, so without the pinned_at sort it would come after the other channel
    await serverClient
      .channel('messaging', channelId, { created_by_id: amyId, members: [amyId, benId] })
      .create();
    await serverClient
      .channel('messaging', otherChannelId, {
        created_by_id: amyId,
        members: [amyId, benId],
      })
      .create();
  });

  afterAll(() => cleanup.run());

  it('pins, queries and unpins a channel for a user', async () => {
    // #region snippet docs="_default/03-channels/07-channel_management/09-pinning.md" heading="Pin a Channel" tab="Node.js" index=1
    // COPY: channelId="general", amyId="amy", benId="ben"
    // Get a channel
    const channel = serverClient.channel('messaging', channelId);

    // Pin the channel for user amy
    const member = await channel.pin({ user_id: amyId });

    // Query for channels that are pinned
    const pinnedChannels = await serverClient.queryChannels(
      { pinned: true },
      {},
      { user_id: amyId },
    );

    // Query for channels for specific members and show pinned first
    const pinnedFirst = await serverClient.queryChannels(
      { members: { $in: [amyId, benId] } },
      { pinned_at: -1 },
      { user_id: amyId },
    );

    // Unpin the channel
    await channel.unpin({ user_id: amyId });
    // #endregion snippet

    expect(member.pinned_at).toBeTruthy();
    expect(pinnedChannels.map((c) => c.cid)).toEqual([`messaging:${channelId}`]);
    expect(pinnedFirst.map((c) => c.cid)).toEqual([
      `messaging:${channelId}`,
      `messaging:${otherChannelId}`,
    ]);

    const { members } = await serverClient
      .channel('messaging', channelId)
      .queryMembers({ id: amyId });
    expect(members[0]?.pinned_at).toBeFalsy();
  });
});
