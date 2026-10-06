import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Channel } from '../../../../../src';
import { getServerClient } from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { uniqueId } from '../../../helpers/ids';

describe('_default/03-channels/07-channel_management/12-disabling.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('john');
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

  it('disables and enables a channel with full and partial updates', async () => {
    const updateSpy = vi.spyOn(Channel.prototype, 'update');
    const partialSpy = vi.spyOn(Channel.prototype, 'updatePartial');

    // #region snippet docs="_default/03-channels/07-channel_management/12-disabling.md" heading="Disable a Channel" tab="Node.js" index=1
    // COPY: channelId="general"
    const channel = serverClient.channel('messaging', channelId);

    // disable a channel with full update
    await channel.update({ disabled: true });

    // disable a channel with partial update
    await channel.updatePartial({ set: { disabled: true } });

    // enable a channel with full update
    await channel.update({ disabled: false });

    // enable a channel with partial update
    await channel.updatePartial({ set: { disabled: false } });
    // #endregion snippet

    const updates = await Promise.all(updateSpy.mock.results.map((r) => r.value));
    const partials = await Promise.all(partialSpy.mock.results.map((r) => r.value));
    updateSpy.mockRestore();
    partialSpy.mockRestore();
    expect(updates.map((r) => r.channel.disabled)).toEqual([true, false]);
    expect(partials.map((r) => r.channel.disabled)).toEqual([true, false]);
  });

  it('disabled channels are only returned with the disabled filter', async () => {
    const channel = serverClient.channel('messaging', channelId);
    const filter = { members: { $in: [userId] } };
    await channel.updatePartial({ set: { disabled: true } });

    // excluded by default (a `cid` filter would still return it)
    expect(await serverClient.queryChannels(filter, {}, { user_id: userId })).toEqual([]);
    const disabled = await serverClient.queryChannels(
      { ...filter, disabled: true },
      {},
      { user_id: userId },
    );
    expect(disabled.map((c) => c.cid)).toEqual([`messaging:${channelId}`]);

    await channel.updatePartial({ set: { disabled: false } });
    const [enabled] = await serverClient.queryChannels(filter, {}, { user_id: userId });
    expect(enabled?.data?.disabled).toBe(false);
  });
});
