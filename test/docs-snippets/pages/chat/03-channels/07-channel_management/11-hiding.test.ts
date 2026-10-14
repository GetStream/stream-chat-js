import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Event, StreamChat } from '../../../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../../../helpers/clients';
import { Cleanup } from '../../../../helpers/cleanup';
import { uniqueId } from '../../../../helpers/ids';
import { getServerChannel, sendServerMessage } from '../../../../helpers/server';
import { retry } from '../../../../helpers/wait';

describe('_default/03-channels/07-channel_management/11-hiding.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const otherId = uniqueId('other');
  const channelId = uniqueId('hidden');
  let client: StreamChat;

  beforeAll(async () => {
    cleanup.users.push(userId, otherId);
    await serverClient.upsertUsers([{ id: otherId }]);
    client = await getClientSideClient({ id: userId });
    cleanup.channels.push(`messaging:${channelId}`);
    await client
      .channel('messaging', channelId, {
        members: [{ user_id: userId }, { user_id: otherId }],
      })
      .create();
    await sendServerMessage(serverClient, `messaging:${channelId}`, {
      text: 'before hiding',
      user_id: otherId,
    });
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('hides, hides with clear history, and shows a channel', async () => {
    const channel = client.channel('messaging', channelId);
    await channel.watch();
    const events: Event[] = [];
    const { unsubscribe } = client.on((event) => {
      if (event.type === 'channel.hidden' || event.type === 'channel.visible') {
        events.push(event);
      }
    });

    // #region snippet docs="chat/_default/03-channels/07-channel_management/11-hiding.md" heading="Hide a Channel" tab="JavaScript" index=1
    // hides the channel until a new message is added there
    await channel.hide();

    // hides the channel until a new message is added there. This also clears the history for the user
    await channel.hide({ clear_history: true });

    // shows a previously hidden channel
    await channel.show();
    // #endregion snippet

    // hiding an already hidden channel sends no second `channel.hidden` event
    await retry(() => {
      expect(
        events.map((e) => [
          e.type,
          e.type === 'channel.hidden' ? e.clear_history : undefined,
        ]),
      ).toEqual([
        ['channel.hidden', false],
        ['channel.visible', undefined],
      ]);
      return Promise.resolve();
    });
    unsubscribe();

    // shown again
    const [shown] = await client.queryChannelsAndHydrate({
      filter_conditions: { cid: `messaging:${channelId}` },
    });
    expect(shown?.cid).toBe(`messaging:${channelId}`);
    // and the history was cleared for this user (read server-side: the client's local
    // state keeps the messages it already had, since no second hidden event arrived)
    const fresh = await getServerChannel(serverClient, `messaging:${channelId}`, {
      user_id: userId,
    });
    expect(fresh.messages).toEqual([]);
  });

  it('hidden channels are excluded from queries until a new message arrives', async () => {
    const channel = client.channel('messaging', channelId);
    await channel.hide();
    const filter = { cid: `messaging:${channelId}` };

    expect(await client.queryChannelsAndHydrate({ filter_conditions: filter })).toEqual(
      [],
    );
    const hidden = await client.queryChannelsAndHydrate({
      filter_conditions: { ...filter, hidden: true },
    });
    expect(hidden.map((c) => c.cid)).toEqual([`messaging:${channelId}`]);

    await sendServerMessage(serverClient, `messaging:${channelId}`, {
      text: 'after hiding',
      user_id: otherId,
    });
    // unhiding on a new message is asynchronous
    await retry(async () => {
      const [found] = await client.queryChannelsAndHydrate({
        filter_conditions: filter,
      });
      expect(found?.cid).toBe(`messaging:${channelId}`);
    });
    // after the cleared history, only the new message is visible to the user
    const fresh = await getServerChannel(serverClient, filter.cid, { user_id: userId });
    expect(fresh.messages.map((m) => m.text)).toEqual(['after hiding']);
  });
});
