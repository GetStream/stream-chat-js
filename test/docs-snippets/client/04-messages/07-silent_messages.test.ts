import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Channel, StreamChat } from '../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../helpers/clients';
import { Cleanup } from '../../helpers/cleanup';
import { grantMessagingMembers } from '../../helpers/grants';
import { uniqueId } from '../../helpers/ids';
import { waitForChannelTypePropagation } from '../../helpers/wait';

// `messaging` doesn't grant channel members `CreateAttachment` or `CreateSystemMessage` in
// the test app: add them for this file and restore them.
const EXTRA_MEMBER_GRANTS = ['create-attachment', 'create-system-message'];

describe('_default/04-messages/07-silent_messages.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const otherId = uniqueId('other');
  const channelType = 'messaging';
  const channelId = uniqueId('trip');
  let client: StreamChat;
  let channel: Channel;

  const unreadCountOfOther = async () => {
    const { channels } = await serverClient.getUnreadCount(otherId);
    return (
      channels.find((c) => c.channel_id === `${channelType}:${channelId}`)
        ?.unread_count ?? 0
    );
  };

  beforeAll(async () => {
    cleanup.users.push(userId, otherId);
    await serverClient.upsertUsers([{ id: otherId }]);
    await grantMessagingMembers(serverClient, cleanup, EXTRA_MEMBER_GRANTS);
    await waitForChannelTypePropagation();
    client = await getClientSideClient({ id: userId });
    channel = client.channel(channelType, channelId, { members: [userId, otherId] });
    cleanup.channels.push(`${channelType}:${channelId}`);
    await channel.watch();
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('sends a silent message', async () => {
    const tripData = { title: 'Trip to the airport', distance_km: 12 };
    const before = await unreadCountOfOther();

    // #region snippet docs="_default/04-messages/07-silent_messages.md" heading="Silent Messages" tab="JavaScript" index=1
    const message = {
      text: 'You completed your trip',
      silent: true,
      attachments: [{ type: 'trip', ...tripData }],
    };
    await channel.sendMessage(message);
    // #endregion snippet

    const { messages } = await channel.query({ messages: { limit: 2 } });
    const sent = messages[0];
    expect(sent.text).toBe('You completed your trip');
    expect(sent.silent).toBe(true);
    expect(sent.attachments?.[0]?.type).toBe('trip');
    expect(await unreadCountOfOther()).toBe(before);
    // A regular message does count, so the check above is meaningful.
    await channel.sendMessage({ text: 'Regular message' });
    expect(await unreadCountOfOther()).toBe(before + 1);
  });

  it('sends a system message', async () => {
    // #region snippet docs="_default/04-messages/07-silent_messages.md" heading="System Messages" tab="JavaScript" index=1
    await channel.sendMessage({
      text: 'You completed your trip',
      type: 'system',
    });
    // #endregion snippet

    const { messages } = await channel.query({ messages: { limit: 1 } });
    const sent = messages[messages.length - 1];
    expect(sent.text).toBe('You completed your trip');
    expect(sent.type).toBe('system');
  });
});
