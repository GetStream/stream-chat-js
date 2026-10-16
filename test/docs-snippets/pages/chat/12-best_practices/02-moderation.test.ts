import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { StreamChat } from '../../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { uniqueId } from '../../../helpers/ids';
import {
  getServerChannel,
  getServerMember,
  sendServerMessage,
} from '../../../helpers/server';
import { retry } from '../../../helpers/wait';

const DOCS = '_default/12-best_practices/02-moderation.md';

describe(DOCS, () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const ownerId = uniqueId('owner');
  const adminId = uniqueId('admin');
  const jamesBondId = uniqueId('james_bond');
  const spammerId = uniqueId('spammer');
  const blockTargets = [uniqueId('blocked'), uniqueId('blocked'), uniqueId('blocked')];
  const channelId = uniqueId('channel');
  // Regular user: channel owner, flags messages, blocks users.
  let client: StreamChat;
  // Admin user: the review queue needs admin or moderator permissions.
  let adminClient: StreamChat;
  const flaggedMessageIds: string[] = [];

  const sendSpamMessage = async (text: string) => {
    const message = await sendServerMessage(serverClient, `messaging:${channelId}`, {
      text,
      user_id: spammerId,
    });
    return message.id;
  };

  /** The flags on `messageId`'s review queue item (server-side). */
  const flagsOn = async (messageId: string) => {
    const { items } = await serverClient.moderation.queryReviewQueue({
      filter: { entity_type: 'stream:chat:v1:message', entity_id: messageId },
    });
    return items.flatMap((item) => item.flags);
  };

  beforeAll(async () => {
    cleanup.users.push(ownerId, adminId, jamesBondId, spammerId, ...blockTargets);
    await serverClient.upsertUsers(
      [jamesBondId, spammerId, ...blockTargets].map((id) => ({ id })),
    );
    client = await getClientSideClient({ id: ownerId, name: 'Owner' });
    adminClient = await getClientSideClient({ id: adminId, role: 'admin' });

    const channel = client.channel('messaging', channelId, {
      members: [{ user_id: ownerId }, { user_id: spammerId }],
    });
    cleanup.channels.push(`messaging:${channelId}`);
    await channel.create();
  });

  afterAll(async () => {
    await disconnectClients(client, adminClient);
    await cleanup.run();
  });

  it('adds a member with the moderator role', async () => {
    const id = uniqueId('channel');
    const channel = client.channel('messaging', id, { members: [{ user_id: ownerId }] });
    cleanup.channels.push(`messaging:${id}`);
    await channel.create();

    // #region snippet docs="chat/_default/12-best_practices/02-moderation.md" heading="Giving moderators more permissions" tab="JavaScript" index=1
    // COPY: jamesBondId="james_bond"
    // Add a member with moderator role
    await channel.addMembers([
      { user_id: jamesBondId, channel_role: 'channel_moderator' },
    ]);
    // #endregion snippet

    const member = await getServerMember(serverClient, `messaging:${id}`, jamesBondId);
    expect(member.channel_role).toBe('channel_moderator');
  });

  it('enables and disables slow mode', async () => {
    const id = uniqueId('channel');
    const channel = client.channel('messaging', id, { members: [{ user_id: ownerId }] });
    cleanup.channels.push(`messaging:${id}`);
    await channel.create();
    // Changing the cooldown needs UpdateChannelCooldown (a channel creator gets 403 code 17).
    await serverClient.chat
      .channel('messaging', id)
      .update({ add_moderators: [ownerId] });
    const enableSpy = vi.spyOn(channel, 'enableSlowMode');

    // #region snippet docs="chat/_default/12-best_practices/02-moderation.md" heading="Slow mode" tab="JavaScript" index=1
    // enable slow mode and set cooldown to 1s
    await channel.enableSlowMode(1);

    // increase cooldown to 30s
    await channel.enableSlowMode(30);

    // disable slow mode
    await channel.disableSlowMode();
    // #endregion snippet

    const results = await Promise.all(enableSpy.mock.results.map((r) => r.value));
    expect(results.map((r) => r.channel?.cooldown)).toEqual([1, 30]);
    const serverChannel = await getServerChannel(serverClient, channel.cid);
    expect(serverChannel.channel?.cooldown ?? 0).toBe(0);
  });

  it('flags a message', async () => {
    const messageId = await sendSpamMessage('Buy now!');
    flaggedMessageIds.push(messageId);

    // #region snippet docs="chat/_default/12-best_practices/02-moderation.md" heading="Flag" tab="JavaScript" index=1
    // A user's flag on a message is recorded once: flagging it again doesn't update the reason or custom data
    // Flag a message
    const flag = await client.moderation.flagMessage(messageId);

    // Flag with a reason and custom data
    const flagWithReason = await client.moderation.flagMessage(messageId, 'spammy_user', {
      custom: {
        user_comment: 'This user is spamming.',
      },
    });
    // #endregion snippet

    // Both flags land on the message's review queue item.
    expect(flag.item_id).toEqual(expect.any(String));
    expect(flagWithReason.item_id).toBe(flag.item_id);
    await retry(async () => {
      const flags = await flagsOn(messageId);
      // Only the first flag is recorded, without a reason.
      expect(flags.map((f) => [f.user_id, f.reason])).toEqual([[ownerId, undefined]]);
    });
  });

  it('flags a message with reasons and custom data', async () => {
    const messageID = await sendSpamMessage('Buy more!');
    flaggedMessageIds.push(messageID);
    const flagSpy = vi.spyOn(client.moderation, 'flagMessage');

    // #region snippet docs="chat/_default/12-best_practices/02-moderation.md" heading="Reasons & custom data" tab="JavaScript" index=1
    // A user's flag on a message is recorded once: flagging it again doesn't update the reason or custom data
    // flag with a reason
    let flag = await client.moderation.flagMessage(messageID, 'spammy_user');

    // flag with a reason and additional custom data
    flag = await client.moderation.flagMessage(messageID, 'spammy_user', {
      custom: {
        user_comment: 'This user is spamming the homepage.',
        page: 'homepage',
      },
    });

    // flag with only custom data
    flag = await client.moderation.flagMessage(messageID, undefined, {
      custom: {
        page: 'homepage',
      },
    });
    // #endregion snippet

    const responses = await Promise.all(flagSpy.mock.results.map((r) => r.value));
    flagSpy.mockRestore();
    // All three flags land on the message's review queue item.
    expect(responses.map((r) => r.item_id)).toEqual([
      flag.item_id,
      flag.item_id,
      flag.item_id,
    ]);
    await retry(async () => {
      const flags = await flagsOn(messageID);
      // Only the first flag is recorded: its reason, no custom data.
      expect(flags.map((f) => [f.user_id, f.reason, f.custom])).toEqual([
        [ownerId, 'spammy_user', undefined],
      ]);
    });
  });

  it('queries flagged messages from the review queue', async () => {
    // Client-side, the review queue needs moderator or admin permissions.
    const client = adminClient;
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      // #region snippet docs="chat/_default/12-best_practices/02-moderation.md" heading="Query Flagged Messages" tab="JavaScript" index=1
      const response = await client.moderation.queryReviewQueue({
        filter: { entity_type: 'stream:chat:v1:message' },
        sort: [{ field: 'created_at', direction: -1 }],
      });

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

    // #region snippet docs="chat/_default/12-best_practices/02-moderation.md" heading="Block" tab="JavaScript" index=1
    // COPY: userToBlock="user-to-block"
    await client.blockUser(userToBlock);
    // #endregion snippet

    const { blocks } = await serverClient.getBlockedUsers({ user_id: ownerId });
    expect(blocks.map((b) => b.blocked_user_id)).toContain(userToBlock);
  });

  it('blocks, unblocks and lists blocked users', async () => {
    const userToBlock = blockTargets[1];
    const blockedUser = blockTargets[1];

    // #region snippet docs="chat/_default/12-best_practices/02-moderation.md" heading="Block User" tab="JavaScript" index=1
    // COPY: userToBlock="user-to-block"
    await client.blockUser(userToBlock);
    // #endregion snippet

    const before = await serverClient.getBlockedUsers({ user_id: ownerId });
    expect(before.blocks.map((b) => b.blocked_user_id)).toContain(blockedUser);

    // #region snippet docs="chat/_default/12-best_practices/02-moderation.md" heading="Unblock user" tab="JavaScript" index=1
    await client.unblockUser(blockedUser);
    // #endregion snippet

    // #region snippet docs="chat/_default/12-best_practices/02-moderation.md" heading="List of Blocked Users" tab="JavaScript" index=1
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
      // #region snippet docs="chat/_default/12-best_practices/02-moderation.md" heading="Server Side" tab="JavaScript" index=1
      // Blocks a user on behalf of the connected user.
      // Must be called after client.connectUser has resolved.
      try {
        await chatClient.blockUser(userId);
      } catch (err) {
        console.log('Error blocking user:', err);
      }
      // #endregion snippet

      const blocked = await serverClient.getBlockedUsers({ user_id: ownerId });
      expect(blocked.blocks.map((b) => b.blocked_user_id)).toContain(userId);

      // #region snippet docs="chat/_default/12-best_practices/02-moderation.md" heading="Server Side" tab="JavaScript" index=2
      // Unblocks a user on behalf of the connected user.
      try {
        await chatClient.unblockUser(userId);
      } catch (err) {
        console.log('Error unblocking user:', err);
      }
      // #endregion snippet

      expect(logSpy).not.toHaveBeenCalled();
    } finally {
      logSpy.mockRestore();
    }

    // #region snippet docs="chat/_default/12-best_practices/02-moderation.md" heading="Server Side" tab="JavaScript" index=3
    const resp = await client.getBlockedUsers();
    // #endregion snippet

    const blockedIds = resp.blocks.map((b) => b.blocked_user_id);
    expect(blockedIds).not.toContain(userId);
    expect(blockedIds).toContain(blockTargets[0]);
  });
});
