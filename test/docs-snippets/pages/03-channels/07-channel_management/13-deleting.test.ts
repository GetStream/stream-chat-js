import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StreamChat } from '../../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { uniqueId } from '../../../helpers/ids';

describe('_default/03-channels/07-channel_management/13-deleting.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const otherId = uniqueId('other');
  let client: StreamChat;

  const createChannel = async (name: string) => {
    const id = uniqueId(name);
    cleanup.channels.push(`messaging:${id}`);
    const channel = client.channel('messaging', id, { members: [userId, otherId] });
    await channel.create();
    await channel.sendMessage({ text: 'before deleting' });
    return channel;
  };

  beforeAll(async () => {
    cleanup.users.push(userId, otherId);
    await serverClient.upsertUsers([{ id: otherId }]);
    client = await getClientSideClient({ id: userId });
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('deletes a channel', async () => {
    const channel = await createChannel('general');

    // #region snippet docs="_default/03-channels/07-channel_management/13-deleting.md" heading="Deleting a Channel" tab="JavaScript" index=1
    const destroy = await channel.delete();
    // #endregion snippet

    expect(destroy.channel.cid).toBe(channel.cid);
    expect(destroy.channel.deleted_at).toBeTruthy();
    expect(await client.queryChannels({ cid: channel.cid })).toEqual([]);
  });

  it('deletes many channels (soft and hard)', async () => {
    const [first, second] = [await createChannel('one'), await createChannel('two')];
    const cid1 = first.cid;
    const cid2 = second.cid;

    // #region snippet docs="_default/03-channels/07-channel_management/13-deleting.md" heading="Deleting Many Channels" tab="JavaScript" index=1
    // soft delete
    const response = await client.deleteChannels([cid1, cid2]);

    // hard delete
    const hardResponse = await client.deleteChannels([cid1, cid2], {
      hard_delete: true,
    });
    const result = hardResponse.result; // holds deletion result
    // #endregion snippet

    // client-side the response has a per-cid `result` and no `task_id`
    expect(Object.keys(response.result).sort()).toEqual([cid1, cid2].sort());
    expect(Object.keys(result).sort()).toEqual([cid1, cid2].sort());
    expect(hardResponse.task_id).toBeUndefined();
    expect(await client.queryChannels({ cid: { $in: [cid1, cid2] } })).toEqual([]);
  });
});
