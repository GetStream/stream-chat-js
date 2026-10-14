import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StreamChat } from '../../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { uniqueId } from '../../../helpers/ids';
import { sendServerMessage } from '../../../helpers/server';

describe('_default/05-features/10-advanced/15-pending_messages.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('thierry');
  const otherId = uniqueId('other');
  const channelId = uniqueId('pending');
  const pendingIds: string[] = [];
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

    // Pending messages can only be sent server-side.
    for (const text of ['pending 1', 'pending 2']) {
      const message = await sendServerMessage(
        serverClient,
        `messaging:${channelId}`,
        { text, user_id: userId },
        { pending: true, pending_message_metadata: { my: 'metadata' } },
      );
      pendingIds.push(message.id);
    }
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('retrieves own pending messages', async () => {
    const [pendingMessageId1, pendingMessageId2] = pendingIds;
    const pendingMessageId = pendingMessageId1;
    const channel = client.channel('messaging', channelId);

    // #region snippet docs="_default/05-features/10-advanced/15-pending_messages.md" heading="Querying pending messages" tab="JavaScript" index=1
    // COPY: pendingMessageId="pending_message_id", pendingMessageId1="pending_message_id_1", pendingMessageId2="pending_message_id_2"
    // To retrieve a single message
    const response = await client.getMessage({ id: pendingMessageId });

    // To retrieve several messages from one channel
    const messages = await channel.getMessagesById([
      pendingMessageId1,
      pendingMessageId2,
    ]);
    // #endregion snippet

    expect(response.message.id).toBe(pendingMessageId);
    expect(messages.messages.map((m) => m.id).sort()).toEqual([...pendingIds].sort());

    // Pending messages are only visible to their sender.
    const otherClient = await getClientSideClient({ id: otherId });
    try {
      await expect(otherClient.getMessage({ id: pendingMessageId })).rejects.toThrow(
        /doesn't exist/,
      );
    } finally {
      await disconnectClients(otherClient);
    }
  });

  it("returns each channel's pending messages from queryChannels", async () => {
    // #region snippet docs="_default/05-features/10-advanced/15-pending_messages.md" heading="Query channels" tab="JavaScript" index=1
    // COPY: userId="thierry"
    // Querying multiple channels returns each channel's pending messages
    const channels = await client.queryChannelsAndHydrate({
      filter_conditions: { type: 'messaging', members: { $in: [userId] } },
      sort: [{ field: 'last_message_at', direction: -1 }],
    });

    // Pending messages of the first channel
    const pendingMessages = channels[0]?.state.pending_messages;
    // #endregion snippet

    // The user's only channel is the one with the pending messages.
    expect(channels.map((c) => c.id)).toEqual([channelId]);
    expect((pendingMessages ?? []).map((p) => p.message?.id).sort()).toEqual(
      [...pendingIds].sort(),
    );
  });
});
