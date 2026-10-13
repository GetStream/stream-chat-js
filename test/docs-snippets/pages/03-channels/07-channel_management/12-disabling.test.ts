import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { StreamChat } from '../../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { uniqueId } from '../../../helpers/ids';

describe('_default/03-channels/07-channel_management/12-disabling.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const enabledId = uniqueId('enabled');
  const disabledId = uniqueId('disabled');
  let client: StreamChat;

  beforeAll(async () => {
    cleanup.users.push(userId);
    client = await getClientSideClient({ id: userId });
    for (const id of [enabledId, disabledId]) {
      cleanup.channels.push(`messaging:${id}`);
      await client.channel('messaging', id, { members: [userId] }).create();
    }
    await serverClient.chat
      .channel('messaging', disabledId)
      .updateChannelPartial({ set: { disabled: true } });
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('filters out disabled channels', async () => {
    const spy = vi.spyOn(client, 'queryChannels');

    // #region snippet docs="_default/03-channels/07-channel_management/12-disabling.md" heading="" tab="JavaScript" index=1
    await client.queryChannels({ disabled: false });
    // #endregion snippet

    const results = await Promise.all(spy.mock.results.map((r) => r.value));
    spy.mockRestore();
    expect(results).toHaveLength(1);
    const cids = results.flat().map((c) => c.cid);
    expect(cids).toContain(`messaging:${enabledId}`);
    expect(cids).not.toContain(`messaging:${disabledId}`);
  });

  it('disabled channels are excluded client-side even without the filter', async () => {
    const cids = (
      await client.queryChannels({
        cid: { $in: [`messaging:${enabledId}`, `messaging:${disabledId}`] },
      })
    ).map((c) => c.cid);
    expect(cids).toEqual([`messaging:${enabledId}`]);
  });

  it('client-side reads and writes of a disabled channel fail, and disabling is server-only', async () => {
    const disabled = client.channel('messaging', disabledId);
    await expect(disabled.watch()).rejects.toThrow(/code 17.*is disabled/);
    await expect(disabled.sendMessage({ text: 'hi' })).rejects.toThrow(
      /code 17.*is disabled/,
    );

    const enabled = client.channel('messaging', enabledId);
    await expect(enabled.update({ disabled: true })).rejects.toThrow(
      'changing channel disabled is not allowed client-side',
    );
    await expect(enabled.updatePartial({ set: { disabled: true } })).rejects.toThrow(
      'field `disabled` can only be updated using server-side auth',
    );
  });
});
