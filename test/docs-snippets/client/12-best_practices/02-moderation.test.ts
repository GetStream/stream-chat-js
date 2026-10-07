import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { FlagMessageResponse, StreamChat } from '../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../helpers/clients';
import { Cleanup } from '../../helpers/cleanup';
import { uniqueId } from '../../helpers/ids';

const DOCS = '_default/12-best_practices/02-moderation.md';

describe(DOCS, () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const ownerId = uniqueId('owner');
  const adminId = uniqueId('admin');
  const jamesBondId = uniqueId('james_bond');
  const spammerId = uniqueId('spammer');
  const blockTargets = [uniqueId('blocked'), uniqueId('blocked'), uniqueId('blocked')];
  const blocklistName = uniqueId('no-cakes');
  const channelId = uniqueId('channel');
  // Regular user: channel owner, flags messages, blocks users.
  let client: StreamChat;
  // Admin user: blocklists and the review queue need admin or moderator permissions.
  let adminClient: StreamChat;
  const flaggedMessageIds: string[] = [];

  const sendSpamMessage = async (text: string) => {
    const { message } = await serverClient
      .channel('messaging', channelId)
      .sendMessage({ text, user_id: spammerId });
    return message.id;
  };

  beforeAll(async () => {
    cleanup.users.push(ownerId, adminId, jamesBondId, spammerId, ...blockTargets);
    await serverClient.upsertUsers(
      [jamesBondId, spammerId, ...blockTargets].map((id) => ({ id })),
    );
    client = await getClientSideClient({ id: ownerId, name: 'Owner' });
    adminClient = await getClientSideClient({ id: adminId, role: 'admin' });

    const channel = client.channel('messaging', channelId, {
      members: [ownerId, spammerId],
    });
    cleanup.channels.push(`messaging:${channelId}`);
    await channel.create();

    cleanup.add(async () => {
      try {
        await serverClient.deleteBlockList(blocklistName);
      } catch (error) {
        // Already deleted by the "Delete a blocklist" snippet.
        if (!/not found|does not exist|doesn't exist/i.test(String(error))) throw error;
      }
    });
    await serverClient.createBlockList({
      name: blocklistName,
      words: ['fudge', 'cream', 'sugar'],
    });
  });

  afterAll(async () => {
    await disconnectClients(client, adminClient);
    await cleanup.run();
  });

  it('adds a member with the moderator role', async () => {
    const id = uniqueId('channel');
    const channel = client.channel('messaging', id, { members: [ownerId] });
    cleanup.channels.push(`messaging:${id}`);
    await channel.create();

    // #region snippet docs="_default/12-best_practices/02-moderation.md" heading="Giving moderators more permissions" tab="JavaScript" index=1
    // COPY: jamesBondId="james_bond"
    // Add a member with moderator role
    await channel.addMembers([
      { user_id: jamesBondId, channel_role: 'channel_moderator' },
    ]);
    // #endregion snippet

    const { members } = await serverClient
      .channel('messaging', id)
      .queryMembers({ user_id: jamesBondId });
    expect(members[0]?.channel_role).toBe('channel_moderator');
  });

  it('enables and disables slow mode', async () => {
    const id = uniqueId('channel');
    const channel = client.channel('messaging', id, { members: [ownerId] });
    cleanup.channels.push(`messaging:${id}`);
    await channel.create();
    // Changing the cooldown needs UpdateChannelCooldown (a channel creator gets 403 code 17).
    await serverClient.channel('messaging', id).addModerators([ownerId]);
    const enableSpy = vi.spyOn(channel, 'enableSlowMode');

    // #region snippet docs="_default/12-best_practices/02-moderation.md" heading="Slow mode" tab="JavaScript" index=1
    // enable slow mode and set cooldown to 1s
    await channel.enableSlowMode(1);

    // increase cooldown to 30s
    await channel.enableSlowMode(30);

    // disable slow mode
    await channel.disableSlowMode();
    // #endregion snippet

    const results = await Promise.all(enableSpy.mock.results.map((r) => r.value));
    expect(results.map((r) => r.channel.cooldown)).toEqual([1, 30]);
    const [queried] = await serverClient.queryChannels({ cid: channel.cid });
    expect(queried.data?.cooldown ?? 0).toBe(0);
  });

  it.skip('BLOCKED: lists blocklists (client-side ListBlockLists fails with code 4 "Multi-tenant blocklist is not enabled for this app", also for admins and with multi-tenancy on)', async () => {
    const response =
      // #region snippet docs="_default/12-best_practices/02-moderation.md" heading="List available blocklists" tab="JavaScript" index=1
      await client.listBlockLists();
    // #endregion snippet

    expect(response.blocklists.map((b) => b.name)).toContain(blocklistName);
  });

  it('updates a blocklist', async () => {
    const client = adminClient;

    // #region snippet docs="_default/12-best_practices/02-moderation.md" heading="Update a blocklist" tab="JavaScript" index=1
    // COPY: blocklistName="no-cakes"
    await client.updateBlockList(blocklistName, {
      words: ['fudge', 'cream', 'sugar', 'vanilla'],
    });
    // #endregion snippet

    const { blocklist } = await serverClient.getBlockList(blocklistName);
    expect(blocklist.words).toEqual(['fudge', 'cream', 'sugar', 'vanilla']);
  });

  it('deletes a blocklist', async () => {
    const client = adminClient;

    // #region snippet docs="_default/12-best_practices/02-moderation.md" heading="Delete a blocklist" tab="JavaScript" index=1
    // COPY: blocklistName="no-cakes"
    await client.deleteBlockList(blocklistName);
    // #endregion snippet

    await expect(serverClient.getBlockList(blocklistName)).rejects.toThrow();
  });

  it('flags a message', async () => {
    const messageId = await sendSpamMessage('Buy now!');
    flaggedMessageIds.push(messageId);

    // #region snippet docs="_default/12-best_practices/02-moderation.md" heading="Flag" tab="JavaScript" index=1
    // Flag a message
    const flag = await client.flagMessage(messageId);

    // Flag with a reason and custom data
    const flagWithReason = await client.flagMessage(messageId, {
      reason: 'spammy_user',
      custom: {
        user_comment: 'This user is spamming.',
      },
    });
    // #endregion snippet

    expect(flag.flag.target_message_id).toBe(messageId);
    expect(flag.flag.user.id).toBe(ownerId);
    expect(flagWithReason.flag.reason).toBe('spammy_user');
    expect(flagWithReason.flag.custom).toEqual({
      user_comment: 'This user is spamming.',
    });
  });

  it('flags a message with reasons and custom data', async () => {
    const messageID = await sendSpamMessage('Buy more!');
    flaggedMessageIds.push(messageID);
    const flagSpy = vi.spyOn(client, 'flagMessage');

    // #region snippet docs="_default/12-best_practices/02-moderation.md" heading="Reasons & custom data" tab="JavaScript" index=1
    // flag with a reason
    let flag = await client.flagMessage(messageID, {
      reason: 'spammy_user',
    });

    // flag with a reason and additional custom data
    flag = await client.flagMessage(messageID, {
      reason: 'spammy_user',
      custom: {
        user_comment: 'This user is spamming the homepage.',
        page: 'homepage',
      },
    });

    // flag with only custom data
    flag = await client.flagMessage(messageID, {
      custom: {
        page: 'homepage',
      },
    });
    // #endregion snippet

    const [withReason, withReasonAndCustom]: FlagMessageResponse[] = await Promise.all(
      flagSpy.mock.results.map((r) => r.value),
    );
    flagSpy.mockRestore();
    expect(withReason.flag.reason).toBe('spammy_user');
    expect(withReasonAndCustom.flag.reason).toBe('spammy_user');
    expect(withReasonAndCustom.flag.custom).toEqual({
      user_comment: 'This user is spamming the homepage.',
      page: 'homepage',
    });
    expect(flag.flag.target_message_id).toBe(messageID);
    expect(flag.flag.custom).toEqual({ page: 'homepage' });
  });

  it('queries flagged messages from the review queue', async () => {
    // Client-side, the review queue needs moderator or admin permissions.
    const client = adminClient;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      // #region snippet docs="_default/12-best_practices/02-moderation.md" heading="Query Flagged Messages" tab="JavaScript" index=1
      const response = await client.moderation.queryReviewQueue(
        { entity_type: 'stream:chat:v1:message' },
        [{ created_at: -1 }],
      );

      for (const item of response.items) {
        console.log(item.message?.id);
        console.log(item.message?.text);
        console.log(item.message?.type);
        console.log(item.message?.created_at);
      }

      console.log(response.next); // <-- next cursor for pagination
      // #endregion snippet

      expect(response.items.length).toBeGreaterThan(0);
      for (const item of response.items) {
        expect(item.entity_type).toBe('stream:chat:v1:message');
      }
      const loggedIds = logSpy.mock.calls.map(([value]) => value);
      expect(loggedIds).toContain(response.items[0].message?.id);
      // The messages flagged above are the newest items in the queue.
      expect(loggedIds).toEqual(expect.arrayContaining(flaggedMessageIds));
    } finally {
      logSpy.mockRestore();
    }
  });

  it('blocks a user (Block)', async () => {
    const userToBlock = blockTargets[0];

    // #region snippet docs="_default/12-best_practices/02-moderation.md" heading="Block" tab="JavaScript" index=1
    // COPY: userToBlock="user-to-block"
    await client.blockUser(userToBlock);
    // #endregion snippet

    const { blocks } = await serverClient.getBlockedUsers(ownerId);
    expect(blocks.map((b) => b.blocked_user_id)).toContain(userToBlock);
  });

  it('blocks, unblocks and lists blocked users', async () => {
    const userToBlock = blockTargets[1];
    const blockedUser = blockTargets[1];

    // #region snippet docs="_default/12-best_practices/02-moderation.md" heading="Block User" tab="JavaScript" index=1
    // COPY: userToBlock="user-to-block"
    await client.blockUser(userToBlock);
    // #endregion snippet

    const before = await serverClient.getBlockedUsers(ownerId);
    expect(before.blocks.map((b) => b.blocked_user_id)).toContain(blockedUser);

    // #region snippet docs="_default/12-best_practices/02-moderation.md" heading="Unblock user" tab="JavaScript" index=1
    await client.unBlockUser(blockedUser);
    // #endregion snippet

    // #region snippet docs="_default/12-best_practices/02-moderation.md" heading="List of Blocked Users" tab="JavaScript" index=1
    const resp = await client.getBlockedUsers();
    // #endregion snippet

    const blockedIds = resp.blocks.map((b) => b.blocked_user_id);
    expect(blockedIds).not.toContain(blockedUser);
    expect(blockedIds).toContain(blockTargets[0]);
  });

  it('blocks, unblocks and lists blocked users (Server Side section)', async () => {
    const chatClient = client;
    const userId = blockTargets[2];
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      // #region snippet docs="_default/12-best_practices/02-moderation.md" heading="Server Side" tab="JavaScript" index=1
      // Blocks a user on behalf of the connected user.
      // Must be called after client.connectUser has resolved.
      try {
        await chatClient.blockUser(userId);
      } catch (err) {
        console.log('Error blocking user:', err);
      }
      // #endregion snippet

      const blocked = await serverClient.getBlockedUsers(ownerId);
      expect(blocked.blocks.map((b) => b.blocked_user_id)).toContain(userId);

      // #region snippet docs="_default/12-best_practices/02-moderation.md" heading="Server Side" tab="JavaScript" index=2
      // Unblocks a user on behalf of the connected user.
      try {
        await chatClient.unBlockUser(userId);
      } catch (err) {
        console.log('Error unblocking user:', err);
      }
      // #endregion snippet

      expect(logSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
    }

    // #region snippet docs="_default/12-best_practices/02-moderation.md" heading="Server Side" tab="JavaScript" index=3
    const resp = await client.getBlockedUsers();
    // #endregion snippet

    const blockedIds = resp.blocks.map((b) => b.blocked_user_id);
    expect(blockedIds).not.toContain(userId);
    expect(blockedIds).toContain(blockTargets[0]);
  });
});
