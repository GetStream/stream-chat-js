import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { StreamChat } from '../../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { uniqueId } from '../../../helpers/ids';
import { getServerMember } from '../../../helpers/server';

describe('_default/03-channels/07-channel_management/08-archiving.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const channelId = uniqueId('example');
  let client: StreamChat;

  beforeAll(async () => {
    cleanup.users.push(userId);
    client = await getClientSideClient({ id: userId });
    const channel = client.channel('messaging', channelId, { members: [userId] });
    cleanup.channels.push(`messaging:${channelId}`);
    await channel.create();
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('archives, queries and unarchives a channel', async () => {
    const archiveSpy = vi.spyOn(client.channel('messaging', channelId), 'archive');

    // #region snippet docs="_default/03-channels/07-channel_management/08-archiving.md" heading="Archive a Channel" tab="JavaScript" index=1
    // COPY: channelId="example"
    // Get a channel
    const channel = client.channel('messaging', channelId);

    // Archive the channel
    await channel.archive();

    // Query for channels that are not archived
    const resp = await client.queryChannels({ archived: false });

    // Unarchive the channel
    await channel.unarchive();
    // #endregion snippet

    const [archived] = await Promise.all(archiveSpy.mock.results.map((r) => r.value));
    archiveSpy.mockRestore();
    expect(archived?.archived_at).toBeTruthy();
    expect(resp.map((c) => c.cid)).not.toContain(`messaging:${channelId}`);

    const member = await getServerMember(serverClient, `messaging:${channelId}`, userId);
    expect(member.archived_at).toBeFalsy();
  });
});
