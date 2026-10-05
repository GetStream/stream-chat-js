import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getServerClient } from '../../helpers/clients';
import { Cleanup } from '../../helpers/cleanup';
import { uniqueId } from '../../helpers/ids';

describe('_default/03-channels/03-channel_update.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const thierry = uniqueId('thierry');

  beforeAll(async () => {
    cleanup.users.push(thierry);
    await serverClient.upsertUser({ id: thierry });
  });

  afterAll(() => cleanup.run());

  it('partially updates a channel', async () => {
    // The docs' placeholder values.
    const type = 'messaging';
    const id = uniqueId('channel');
    cleanup.channels.push(`${type}:${id}`);

    // #region snippet docs="_default/03-channels/03-channel_update.md" heading="Partial Update" tab="Node.js" index=1
    // COPY: thierry="thierry"
    // Here's a channel with some custom field data that might be useful
    const channel = serverClient.channel(type, id, {
      created_by_id: thierry,
      source: 'user',
      source_detail: { user_id: 123 },
      channel_detail: { topic: 'Plants and Animals', rating: 'pg' },
    });
    await channel.create();

    // let's change the source of this channel
    await channel.updatePartial({ set: { source: 'system' } });

    // since it's system generated we no longer need source_detail
    await channel.updatePartial({ unset: ['source_detail'] });

    // and finally update one of the nested fields in the channel_detail
    await channel.updatePartial({ set: { 'channel_detail.topic': 'Nature' } });

    // and maybe we decide we no longer need a rating
    await channel.updatePartial({ unset: ['channel_detail.rating'] });
    // #endregion snippet

    const { channel: updated } = await serverClient.channel(type, id).query({});
    expect(updated.source).toBe('system');
    expect(updated.source_detail).toBeUndefined();
    expect(updated.channel_detail).toEqual({ topic: 'Nature' });
  });

  it('fully updates a channel', async () => {
    const channel = serverClient.channel('messaging', uniqueId('channel'), {
      created_by_id: thierry,
      source: 'user',
    });
    await channel.create();
    if (channel.cid) cleanup.channels.push(channel.cid);

    // #region snippet docs="_default/03-channels/03-channel_update.md" heading="Full Update" tab="Node.js" index=1
    // COPY: thierry="thierry"
    const update = await channel.update(
      { name: 'myspecialchannel', color: 'green' },
      { text: 'Thierry changed the channel color to green', user_id: thierry },
    );
    // #endregion snippet

    expect(update.channel).toMatchObject({ name: 'myspecialchannel', color: 'green' });
    // Fields not included in a full update are removed.
    expect(update.channel.source).toBeUndefined();
    expect(update.message?.text).toBe('Thierry changed the channel color to green');
  });
});
