import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getServerClient } from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { uniqueId } from '../../../helpers/ids';

describe('_default/03-channels/07-channel_management/11-hiding.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('john');
  const otherId = uniqueId('other');
  const channelId = uniqueId('general');

  beforeAll(async () => {
    cleanup.users.push(userId, otherId);
    await serverClient.upsertUsers([{ id: userId }, { id: otherId }]);
    cleanup.channels.push(`messaging:${channelId}`);
    await serverClient
      .channel('messaging', channelId, {
        created_by_id: otherId,
        members: [userId, otherId],
      })
      .create();
    await serverClient
      .channel('messaging', channelId)
      .sendMessage({ text: 'before hiding', user_id: otherId });
  });

  afterAll(() => cleanup.run());

  it('hides, hides with clear history, and shows a channel for a user', async () => {
    // #region snippet docs="_default/03-channels/07-channel_management/11-hiding.md" heading="Hide a Channel" tab="Node.js" index=1
    // COPY: channelId="general", userId="john"
    const channel = serverClient.channel('messaging', channelId);

    // hides the channel for user john until a new message is added there
    await channel.hide(userId);

    // hides the channel and also clears the history for user john
    await channel.hide(userId, true);

    // shows a previously hidden channel
    await channel.show(userId);
    // #endregion snippet

    const [shown] = await serverClient.queryChannels(
      { cid: `messaging:${channelId}` },
      {},
      { user_id: userId },
    );
    expect(shown?.cid).toBe(`messaging:${channelId}`);
    expect(shown?.state.messages).toEqual([]);
  });

  it('hidden channels are only returned with the hidden filter', async () => {
    const channel = serverClient.channel('messaging', channelId);
    await channel.hide(userId);
    const filter = { cid: `messaging:${channelId}` };

    expect(await serverClient.queryChannels(filter, {}, { user_id: userId })).toEqual([]);
    const hidden = await serverClient.queryChannels(
      { ...filter, hidden: true },
      {},
      { user_id: userId },
    );
    expect(hidden.map((c) => c.cid)).toEqual([`messaging:${channelId}`]);
    await channel.show(userId);
  });
});
