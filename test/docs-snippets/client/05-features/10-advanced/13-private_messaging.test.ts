import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StreamChat } from '../../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { grantMessagingMembers } from '../../../helpers/grants';
import { uniqueId } from '../../../helpers/ids';
import { waitForChannelTypePropagation } from '../../../helpers/wait';

// `messaging` doesn't grant channel members `CreateSystemMessage` or
// `CreateRestrictedVisibilityMessage` in the test app: add them for this file and restore them.
const EXTRA_MEMBER_GRANTS = [
  'create-system-message',
  'create-restricted-visibility-message',
];

describe('_default/05-features/10-advanced/13-private_messaging.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('john');
  const janeId = uniqueId('jane');
  const bobId = uniqueId('bob');
  const channelId = uniqueId('ride');
  let client: StreamChat;

  const messagesSeenBy = async (memberId: string) => {
    const [channel] = await serverClient.queryChannels(
      { cid: `messaging:${channelId}` },
      {},
      { user_id: memberId, message_limit: 10 },
    );
    return channel.state.messages.map((m) => m.id);
  };

  beforeAll(async () => {
    cleanup.users.push(userId, janeId, bobId);
    await serverClient.upsertUsers([{ id: janeId }, { id: bobId }]);
    await grantMessagingMembers(serverClient, cleanup, EXTRA_MEMBER_GRANTS);
    await waitForChannelTypePropagation();

    client = await getClientSideClient({ id: userId });
    cleanup.channels.push(`messaging:${channelId}`);
    await client
      .channel('messaging', channelId, { members: [userId, janeId, bobId] })
      .create();
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('sends a message with restricted visibility', async () => {
    // #region snippet docs="_default/05-features/10-advanced/13-private_messaging.md" heading="Sending a message with restricted visibility" tab="JavaScript" index=1
    // COPY: channelId="ride-08467339", janeId="jane"
    // Get a channel
    const channel = client.channel('messaging', channelId);

    // Send a message only visible to Jane
    const message = await channel.sendMessage({
      text: 'Hi Jane, your driver John will be at your location in 1 minute',
      type: 'system',
      restricted_visibility: [janeId],
    });
    // #endregion snippet

    const messageId = message.message.id;
    expect(message.message.type).toBe('system');
    expect(message.message.restricted_visibility).toEqual([janeId]);
    expect(await messagesSeenBy(janeId)).toContain(messageId);
    expect(await messagesSeenBy(userId)).toContain(messageId);
    expect(await messagesSeenBy(bobId)).not.toContain(messageId);
  });
});
