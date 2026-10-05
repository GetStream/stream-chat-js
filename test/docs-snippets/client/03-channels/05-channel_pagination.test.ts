import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Channel, StreamChat } from '../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../helpers/clients';
import { Cleanup } from '../../helpers/cleanup';
import { uniqueId } from '../../helpers/ids';

const DOCS = '_default/03-channels/05-channel_pagination.md';
const MESSAGE_COUNT = 30;
const MEMBER_COUNT = 25;

describe(DOCS, () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const owner = uniqueId('owner');
  const others = Array.from({ length: MEMBER_COUNT - 1 }, () => uniqueId('member'));
  // Sent in this order, so the last id is the newest message.
  const messageIds: string[] = [];
  let client: StreamChat;
  let channel: Channel;

  beforeAll(async () => {
    cleanup.users.push(owner, ...others);
    await serverClient.upsertUsers(others.map((id) => ({ id })));
    client = await getClientSideClient({ id: owner });
    channel = client.channel('messaging', uniqueId('channel'), {
      members: [owner, ...others],
    });
    await channel.create();
    if (channel.cid) cleanup.channels.push(channel.cid);
    for (let i = 0; i < MESSAGE_COUNT; i++) {
      const { message } = await channel.sendMessage({ text: `message ${i}` });
      messageIds.push(message.id);
    }
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('paginates messages by id', async () => {
    // The docs' placeholders: the current (latest) page and a message to jump to.
    const { messages } = await channel.query({ messages: { limit: 20 } });
    const messageId = messageIds[10];

    // #region snippet docs="_default/03-channels/05-channel_pagination.md" heading="Pagination Parameters" tab="JavaScript" index=1
    // Get the ID of the oldest message on the current page
    const lastMessageId = messages[0].id;

    // Fetch older messages
    const result = await channel.query({
      messages: { limit: 20, id_lt: lastMessageId },
    });

    // Fetch messages around a specific message
    const aroundResult = await channel.query({
      messages: { limit: 20, id_around: messageId },
    });
    // #endregion snippet

    expect(messages.map((m) => m.id)).toEqual(messageIds.slice(-20));
    expect(result.messages.map((m) => m.id)).toEqual(messageIds.slice(0, 10));
    const aroundIds = aroundResult.messages.map((m) => m.id);
    expect(aroundIds).toContain(messageId);
    expect(aroundIds.length).toBeGreaterThan(1);
    expect(aroundIds.length).toBeLessThanOrEqual(20);
  });

  it('paginates members and watchers', async () => {
    // #region snippet docs="_default/03-channels/05-channel_pagination.md" heading="Member and Watcher Pagination" tab="JavaScript" index=1
    // Paginate members and watchers
    const result = await channel.query({
      members: { limit: 20, offset: 0 },
      watchers: { limit: 20, offset: 0 },
    });

    const membersResult = await channel.query({
      state: true,
      members: { limit: 110, offset: 0 },
    });
    // #endregion snippet

    expect(result.members).toHaveLength(20);
    expect(membersResult.members).toHaveLength(MEMBER_COUNT);
    expect(membersResult.members.map((m) => m.user_id).sort()).toEqual(
      [owner, ...others].sort(),
    );
  });
});
