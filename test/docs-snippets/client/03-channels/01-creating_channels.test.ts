import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StreamChat } from '../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../helpers/clients';
import { Cleanup } from '../../helpers/cleanup';
import { uniqueId } from '../../helpers/ids';
import { sendServerMessage } from '../../helpers/server';

describe('_default/03-channels/01-creating_channels.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const thierry = uniqueId('thierry');
  const tommaso = uniqueId('tommaso');
  let client: StreamChat;

  beforeAll(async () => {
    cleanup.users.push(thierry, tommaso);
    await serverClient.upsertUsers([{ id: tommaso }]);
    client = await getClientSideClient({ id: thierry });
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('creates a channel using a channel ID', async () => {
    const travel = uniqueId('travel');
    cleanup.channels.push(`messaging:${travel}`);

    // #region snippet docs="_default/03-channels/01-creating_channels.md" heading="Creating a Channel Using a Channel ID" tab="JavaScript" index=1
    // COPY: travel="travel"
    const channel = client.channel('messaging', travel, {
      name: 'Awesome channel about traveling',
    });
    // Here, 'travel' will be the channel ID
    await channel.create();
    // #endregion snippet

    expect(channel.id).toBe(travel);
    const { channel: created } = await serverClient.chat
      .channel('messaging', travel)
      .getOrCreate();
    expect(created?.custom).toMatchObject({ name: 'Awesome channel about traveling' });
    expect(created?.created_by?.id).toBe(thierry);
  });

  it('creates a distinct channel', async () => {
    // #region snippet docs="_default/03-channels/01-creating_channels.md" heading="Distinct Channels" tab="JavaScript" index=1
    // COPY: thierry="thierry", tommaso="tommaso"
    const channel = client.channel('messaging', {
      members: [thierry, tommaso],
    });
    await channel.create();
    // #endregion snippet

    if (channel.cid) cleanup.channels.push(channel.cid);
    expect(channel.id).toMatch(/^!members-/);
    expect(Object.keys(channel.state.members).sort()).toEqual([thierry, tommaso].sort());

    // Same members, in any order: the same channel.
    const again = client.channel('messaging', { members: [tommaso, thierry] });
    await again.create();
    expect(again.cid).toBe(channel.cid);
  });

  it('watches a channel', async () => {
    const travelChannel = uniqueId('travel-channel');
    cleanup.channels.push(`messaging:${travelChannel}`);

    // #region snippet docs="_default/03-channels/01-creating_channels.md" heading="Watching Channels" tab="JavaScript" index=1
    // COPY: travelChannel="travel-channel"
    const channel = client.channel('messaging', travelChannel);

    const state = await channel.watch();
    // #endregion snippet

    // get-or-create: the channel didn't exist before.
    expect(state.channel.id).toBe(travelChannel);
    expect(state.channel.created_by?.id).toBe(thierry);
    expect(Array.isArray(state.messages)).toBe(true);
    // Watched: events of the channel now reach this client over the WebSocket.
    const received = new Promise<string | undefined>((resolve) => {
      const { unsubscribe } = channel.on('message.new', (event) => {
        unsubscribe();
        resolve(event.message?.text);
      });
    });
    await sendServerMessage(serverClient, `messaging:${travelChannel}`, {
      text: 'Hello watchers',
      user_id: thierry,
    });
    await expect(received).resolves.toBe('Hello watchers');
    expect(channel.initialized).toBe(true);
  });
});
