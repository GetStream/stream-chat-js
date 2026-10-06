import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Channel } from '../../../../../src';
import { getServerClient } from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { uniqueId } from '../../../helpers/ids';
import { waitForChannelTypePropagation } from '../../../helpers/wait';

describe('_default/03-channels/07-channel_management/14-freezing.md', () => {
  // The page's Node.js tab calls the server client `client`.
  const client = getServerClient();
  const serverClient = client;
  const cleanup = new Cleanup(serverClient);
  const thierryId = uniqueId('thierry');
  let channel: Channel;

  beforeAll(async () => {
    cleanup.users.push(thierryId);
    await serverClient.upsertUsers([{ id: thierryId }]);
    const id = uniqueId('general');
    cleanup.channels.push(`messaging:${id}`);
    channel = serverClient.channel('messaging', id, {
      created_by_id: thierryId,
      members: [thierryId],
    });
    await channel.create();
  });

  afterAll(() => cleanup.run());

  it('freezes a channel', async () => {
    // #region snippet docs="_default/03-channels/07-channel_management/14-freezing.md" heading="Freeze a Channel" tab="Node.js" index=1
    // COPY: thierryId="Thierry"
    const update = await channel.update(
      { frozen: true },
      { text: 'Thierry has frozen the channel', user_id: thierryId },
    );

    const partialUpdate = await channel.updatePartial({ set: { frozen: true } });
    // #endregion snippet

    expect(update.channel.frozen).toBe(true);
    expect(update.message?.user?.id).toBe(thierryId);
    expect(partialUpdate.channel.frozen).toBe(true);
  });

  it('unfreezes a channel', async () => {
    // #region snippet docs="_default/03-channels/07-channel_management/14-freezing.md" heading="Unfreeze a Channel" tab="Node.js" index=1
    // COPY: thierryId="Thierry"
    const update = await channel.update(
      { frozen: false },
      { text: 'Thierry has unfrozen the channel', user_id: thierryId },
    );
    // #endregion snippet

    expect(update.channel.frozen).toBe(false);
    expect(update.message?.user?.id).toBe(thierryId);
  });

  it('grants the frozen channel permission to admins', async () => {
    const original = await serverClient.getChannelType('messaging');
    expect(original.grants.admin).not.toContain('use-frozen-channel');
    cleanup.add(async () => {
      await serverClient.updateChannelType('messaging', { grants: original.grants });
      await waitForChannelTypePropagation();
    });

    // #region snippet docs="_default/03-channels/07-channel_management/14-freezing.md" heading="Granting the Frozen Channel Permission" tab="Node.js" index=1
    const { grants } = await client.getChannelType('messaging');
    grants.admin.push('use-frozen-channel');
    await client.updateChannelType('messaging', {
      grants: { admin: grants.admin },
    });
    // #endregion snippet

    await waitForChannelTypePropagation();
    const updated = await serverClient.getChannelType('messaging');
    expect(updated.grants.admin).toContain('use-frozen-channel');
  });
});
