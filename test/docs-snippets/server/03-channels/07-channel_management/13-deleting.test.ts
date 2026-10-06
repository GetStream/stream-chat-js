import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getServerClient } from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { uniqueId } from '../../../helpers/ids';
import { waitForTask } from '../../../helpers/wait';

describe('_default/03-channels/07-channel_management/13-deleting.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('john');
  const otherIds = [uniqueId('jack'), uniqueId('jane'), uniqueId('jim')];

  const createChannel = async (name: string) => {
    const id = uniqueId(name);
    cleanup.channels.push(`messaging:${id}`);
    const channel = serverClient.channel('messaging', id, {
      created_by_id: userId,
      members: [userId],
    });
    await channel.create();
    await channel.sendMessage({ text: 'before deleting', user_id: userId });
    return channel;
  };

  /** Creates a distinct channel of `userId` and `otherId` with one message. */
  const createDistinctChannel = async (otherId: string) => {
    const channel = serverClient.channel('messaging', {
      members: [userId, otherId],
      created_by_id: userId,
    });
    await channel.create();
    cleanup.channels.push(channel.cid);
    await channel.sendMessage({ text: 'kept history', user_id: userId });
    return channel;
  };

  /** Recreates the distinct channel and returns the messages `userId` sees in it. */
  const recreatedMessages = async (otherId: string) => {
    const channel = serverClient.channel('messaging', {
      members: [userId, otherId],
      created_by_id: userId,
    });
    await channel.create();
    const [found] = await serverClient.queryChannels(
      { cid: channel.cid },
      {},
      { user_id: userId },
    );
    return found?.state.messages.map((m) => m.text);
  };

  beforeAll(async () => {
    cleanup.users.push(userId, ...otherIds);
    await serverClient.upsertUsers([userId, ...otherIds].map((id) => ({ id })));
  });

  afterAll(() => cleanup.run());

  it('deletes a channel', async () => {
    const channel = serverClient.channel(
      'messaging',
      (await createChannel('general')).id,
    );

    // #region snippet docs="_default/03-channels/07-channel_management/13-deleting.md" heading="Deleting a Channel" tab="Node.js" index=1
    const destroy = await channel.delete();
    // #endregion snippet

    expect(destroy.channel.cid).toBe(channel.cid);
    expect(destroy.channel.deleted_at).toBeTruthy();
    expect(
      await serverClient.queryChannels({ cid: channel.cid }, {}, { user_id: userId }),
    ).toEqual([]);
  });

  it('preserves message history of a distinct channel', async () => {
    const [otherId] = otherIds as [string];
    await createDistinctChannel(otherId);

    // #region snippet docs="_default/03-channels/07-channel_management/13-deleting.md" heading="Preserving Message History" tab="Node.js" index=1
    // COPY: userId="john", otherId="jack"
    const channel = serverClient.channel('messaging', {
      members: [userId, otherId],
      created_by_id: userId,
    });
    await channel.create();

    // Preserve history through the soft delete (distinct channels only)
    await channel.delete({ skip_truncate: true });
    // #endregion snippet

    expect(await recreatedMessages(otherId)).toEqual(['kept history']);
  });

  it('deletes many channels (soft, hard, preserving history)', async () => {
    const [, janeId, jimId] = otherIds as [string, string, string];
    const cid1 = (await createChannel('one')).cid;
    const cid2 = (await createChannel('two')).cid;
    const distinctCid1 = (await createDistinctChannel(janeId)).cid;
    const distinctCid2 = (await createDistinctChannel(jimId)).cid;

    // #region snippet docs="_default/03-channels/07-channel_management/13-deleting.md" heading="Deleting Many Channels" tab="Node.js" index=1
    // soft delete
    const response = await serverClient.deleteChannels([cid1, cid2]);

    // hard delete
    const hardResponse = await serverClient.deleteChannels([cid1, cid2], {
      hard_delete: true,
    });

    if (hardResponse.task_id) {
      const result = await serverClient.getTask(hardResponse.task_id);
      if (result['status'] === 'completed') {
        // success!
      }
    }

    // preserve history (distinct channels only)
    const preserveResponse = await serverClient.deleteChannels(
      [distinctCid1, distinctCid2],
      {
        skip_truncate: true,
      },
    );
    // #endregion snippet

    // server-side the response holds a `task_id` (and no per-cid `result`)
    expect(response.task_id).toEqual(expect.any(String));
    expect(hardResponse.task_id).toEqual(expect.any(String));
    await waitForTask(serverClient, hardResponse.task_id as string);
    expect(
      await serverClient.queryChannels(
        { cid: { $in: [cid1, cid2] } },
        {},
        { user_id: userId },
      ),
    ).toEqual([]);

    await waitForTask(serverClient, preserveResponse.task_id as string);
    expect(await recreatedMessages(janeId)).toEqual(['kept history']);
    expect(await recreatedMessages(jimId)).toEqual(['kept history']);
  });
});
