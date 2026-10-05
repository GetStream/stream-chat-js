import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getServerClient } from '../../helpers/clients';
import { Cleanup } from '../../helpers/cleanup';
import { uniqueId } from '../../helpers/ids';

describe('_default/03-channels/01-creating_channels.md', () => {
  const serverClient = getServerClient();
  // The page's Node.js tabs call the server-side client `client`.
  const client = serverClient;
  const cleanup = new Cleanup(serverClient);
  const myuserid = uniqueId('myuserid');
  const thierry = uniqueId('thierry');
  const tommaso = uniqueId('tommaso');

  beforeAll(async () => {
    cleanup.users.push(myuserid, thierry, tommaso);
    await serverClient.upsertUsers([{ id: myuserid }, { id: thierry }, { id: tommaso }]);
  });

  afterAll(() => cleanup.run());

  it('creates a channel using a channel ID', async () => {
    const travel = uniqueId('travel');
    cleanup.channels.push(`messaging:${travel}`);

    // #region snippet docs="_default/03-channels/01-creating_channels.md" heading="Creating a Channel Using a Channel ID" tab="Node.js" index=1
    // COPY: travel="travel", myuserid="myuserid"
    const channel = client.channel('messaging', travel, {
      name: 'Awesome channel about traveling',
      created_by_id: myuserid,
    });
    await channel.create();
    // #endregion snippet

    const { channel: created } = await serverClient
      .channel('messaging', travel)
      .query({});
    expect(created.id).toBe(travel);
    expect(created).toMatchObject({ name: 'Awesome channel about traveling' });
    expect(created.created_by?.id).toBe(myuserid);
  });

  it('creates a distinct channel', async () => {
    // #region snippet docs="_default/03-channels/01-creating_channels.md" heading="Distinct Channels" tab="Node.js" index=1
    // COPY: thierry="thierry", tommaso="tommaso", myuserid="myuserid"
    const channel = client.channel('messaging', {
      members: [thierry, tommaso],
      created_by_id: myuserid,
    });
    await channel.create();
    // #endregion snippet

    if (channel.cid) cleanup.channels.push(channel.cid);
    expect(channel.id).toMatch(/^!members-/);
    expect(Object.keys(channel.state.members).sort()).toEqual([thierry, tommaso].sort());
    expect(channel.data?.created_by?.id).toBe(myuserid);
  });
});
