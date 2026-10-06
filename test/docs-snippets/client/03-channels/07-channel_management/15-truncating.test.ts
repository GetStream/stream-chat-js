import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Channel, StreamChat } from '../../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { uniqueId } from '../../../helpers/ids';

describe('_default/03-channels/07-channel_management/15-truncating.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('owner');
  const janeId = uniqueId('jane');
  const johnId = uniqueId('john');
  let client: StreamChat;
  let janeClient: StreamChat;

  const createChannel = async () => {
    const id = uniqueId('general');
    cleanup.channels.push(`messaging:${id}`);
    const channel = client.channel('messaging', id, {
      members: [userId, janeId, johnId],
    });
    await channel.create();
    return channel;
  };

  // The messages `viewer` gets back when it queries `channel`.
  const messageTexts = async (viewer: StreamChat, channel: Channel) => {
    const [result] = await viewer.queryChannels(
      { cid: channel.cid },
      {},
      { message_limit: 10, watch: false, state: true },
    );
    return result.state.messages.map((message) => message.text);
  };

  beforeAll(async () => {
    cleanup.users.push(userId, janeId, johnId);
    await serverClient.upsertUsers([{ id: johnId }]);
    client = await getClientSideClient({ id: userId });
    janeClient = await getClientSideClient({ id: janeId });
  });

  afterAll(async () => {
    await disconnectClients(client, janeClient);
    await cleanup.run();
  });

  it('truncates a channel', async () => {
    const channel = await createChannel();
    await channel.sendMessage({ text: 'first' });

    // #region snippet docs="_default/03-channels/07-channel_management/15-truncating.md" heading="Truncate a Channel" tab="JavaScript" index=1
    await channel.truncate();

    // Or with parameters:
    await channel.truncate({
      hard_delete: true,
      skip_push: false,
      message: {
        text: 'Dear Everyone. The channel has been truncated.',
      },
    });
    // #endregion snippet

    const { channel: data } = await channel.query({ messages: { limit: 10 } });
    expect(data.truncated_at).toBeDefined();
    expect(await messageTexts(client, channel)).toEqual([
      'Dear Everyone. The channel has been truncated.',
    ]);
  });

  it('truncates a channel for specific members', async () => {
    const channel = await createChannel();
    await channel.sendMessage({ text: 'history' });

    // #region snippet docs="_default/03-channels/07-channel_management/15-truncating.md" heading="Truncate for Specific Members" tab="JavaScript" index=1
    // COPY: janeId="jane", johnId="john"
    // Hide the history for two members; everyone else keeps their full view
    await channel.truncate({
      member_ids: [janeId, johnId],
    });

    // Hide only the messages created before a given time
    await channel.truncate({
      member_ids: [janeId],
      truncated_at: new Date('2026-01-01T00:00:00Z'),
    });
    // #endregion snippet

    // john's history is hidden; jane's cutoff was moved back before the channel existed,
    // so she sees the history again; the owner (not listed) keeps the full view
    expect(await messageTexts(client, channel)).toEqual(['history']);
    expect(await messageTexts(janeClient, channel)).toEqual(['history']);
    const [johnView] = await serverClient.queryChannels(
      { cid: channel.cid },
      {},
      { user_id: johnId, message_limit: 10, watch: false, state: true },
    );
    expect(johnView.state.messages).toEqual([]);
  });
});
