import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Channel, StreamChat } from '../../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { uniqueId } from '../../../helpers/ids';
import { sendServerMessage } from '../../../helpers/server';

describe('_default/03-channels/07-channel_management/14-freezing.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  // Freezing needs `UpdateChannelFrozen`: by default only (channel) moderators and admins
  // have it. A plain channel member gets 403 code 17.
  const userId = uniqueId('thierry');
  const otherId = uniqueId('other');
  let client: StreamChat;
  let channel: Channel;

  beforeAll(async () => {
    cleanup.users.push(userId, otherId);
    await serverClient.upsertUsers([{ id: otherId }]);
    client = await getClientSideClient({ id: userId });
    const id = uniqueId('general');
    cleanup.channels.push(`messaging:${id}`);
    channel = client.channel('messaging', id, { members: [userId, otherId] });
    await channel.create();
    await serverClient.chat.channel('messaging', id).update({ add_moderators: [userId] });
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('freezes a channel', async () => {
    const otherMessage = await sendServerMessage(serverClient, channel.cid, {
      text: 'before freezing',
      user_id: otherId,
    });

    // #region snippet docs="_default/03-channels/07-channel_management/14-freezing.md" heading="Freeze a Channel" tab="JavaScript" index=1
    const update = await channel.update(
      { frozen: true },
      { text: 'Thierry has frozen the channel' },
    );

    const partialUpdate = await channel.updatePartial({ set: { frozen: true } });
    // #endregion snippet

    expect(update.channel.frozen).toBe(true);
    expect(update.message?.text).toBe('Thierry has frozen the channel');
    expect(partialUpdate.channel.frozen).toBe(true);

    // sending a message returns an error message, reacting fails with 403
    const sent = await channel.sendMessage({ text: 'while frozen' });
    expect(sent.message.type).toBe('error');
    await expect(channel.sendReaction(otherMessage.id, { type: 'like' })).rejects.toThrow(
      /frozen/,
    );
  });

  it('unfreezes a channel', async () => {
    // #region snippet docs="_default/03-channels/07-channel_management/14-freezing.md" heading="Unfreeze a Channel" tab="JavaScript" index=1
    const update = await channel.update(
      { frozen: false },
      { text: 'Thierry has unfrozen the channel' },
    );
    // #endregion snippet

    expect(update.channel.frozen).toBe(false);
    const sent = await channel.sendMessage({ text: 'after unfreezing' });
    expect(sent.message.type).toBe('regular');
  });
});
