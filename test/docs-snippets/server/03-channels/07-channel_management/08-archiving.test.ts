import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getServerClient } from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { uniqueId } from '../../../helpers/ids';

describe('_default/03-channels/07-channel_management/08-archiving.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('amy');
  const channelId = uniqueId('general');

  beforeAll(async () => {
    cleanup.users.push(userId);
    await serverClient.upsertUser({ id: userId });
    cleanup.channels.push(`messaging:${channelId}`);
    await serverClient
      .channel('messaging', channelId, { created_by_id: userId, members: [userId] })
      .create();
  });

  afterAll(() => cleanup.run());

  it('archives, queries and unarchives a channel for a user', async () => {
    // #region snippet docs="_default/03-channels/07-channel_management/08-archiving.md" heading="Archive a Channel" tab="Node.js" index=1
    // COPY: channelId="general", userId="amy"
    // Get a channel
    const channel = serverClient.channel('messaging', channelId);

    // Archive the channel for user amy
    const member = await channel.archive({ user_id: userId });

    // Query for channels that are archived
    const archivedChannels = await serverClient.queryChannels(
      { archived: true },
      {},
      { user_id: userId },
    );

    // Unarchive the channel
    await channel.unarchive({ user_id: userId });
    // #endregion snippet

    expect(member.archived_at).toBeTruthy();
    expect(archivedChannels.map((c) => c.cid)).toContain(`messaging:${channelId}`);

    const { members } = await serverClient
      .channel('messaging', channelId)
      .queryMembers({ id: userId });
    expect(members[0]?.archived_at).toBeFalsy();
  });
});
