import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StreamChat } from '../../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { uniqueId } from '../../../helpers/ids';

describe('_default/03-channels/07-channel_management/09-pinning.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const amyId = uniqueId('amy');
  const benId = uniqueId('ben');
  const channelId = uniqueId('example');
  const otherChannelId = uniqueId('other');
  let client: StreamChat;

  beforeAll(async () => {
    cleanup.users.push(userId, amyId, benId);
    await serverClient.upsertUsers([{ id: amyId }, { id: benId }]);
    client = await getClientSideClient({ id: userId });
    cleanup.channels.push(`messaging:${channelId}`, `messaging:${otherChannelId}`);
    // created first, so without the pinned_at sort it would come after the other channel
    await client
      .channel('messaging', channelId, { members: [userId, amyId, benId] })
      .create();
    await client
      .channel('messaging', otherChannelId, { members: [userId, amyId, benId] })
      .create();
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('pins, queries and unpins a channel', async () => {
    // #region snippet docs="_default/03-channels/07-channel_management/09-pinning.md" heading="Pin a Channel" tab="JavaScript" index=1
    // COPY: channelId="example", amyId="amy", benId="ben"
    // Get a channel
    const channel = client.channel('messaging', channelId);

    // Pin the channel
    await channel.pin();

    // Query for channels that are pinned
    const resp = await client.queryChannels({ pinned: true });

    // Query for channels for specific members and show pinned first
    const pinnedFirst = await client.queryChannels(
      { members: { $in: [amyId, benId] } },
      { pinned_at: -1 },
    );

    // Unpin the channel
    await channel.unpin();
    // #endregion snippet

    expect(resp.map((c) => c.cid)).toEqual([`messaging:${channelId}`]);
    expect(pinnedFirst.map((c) => c.cid)).toEqual([
      `messaging:${channelId}`,
      `messaging:${otherChannelId}`,
    ]);

    const { members } = await serverClient
      .channel('messaging', channelId)
      .queryMembers({ id: userId });
    expect(members[0]?.pinned_at).toBeFalsy();
  });
});
