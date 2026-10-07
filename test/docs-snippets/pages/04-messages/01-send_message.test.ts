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
import { sendServerMessage } from '../../helpers/server';
import { waitForChannelTypePropagation } from '../../helpers/wait';

// `messaging` doesn't grant channel members `CreateAttachment`, `CreateMention` or the
// `Notify*` mention permissions in the test app: add them for this file and restore them.
const EXTRA_MEMBER_GRANTS = [
  'create-attachment',
  'create-mention',
  'notify-here',
  'notify-channel',
  'notify-role',
  'notify-group',
];

describe('_default/04-messages/01-send_message.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const joshId = uniqueId('josh');
  const channelType = 'messaging';
  const channelId = uniqueId('general');
  const cid = `${channelType}:${channelId}`;
  let client: StreamChat;
  let channel: Channel;

  beforeAll(async () => {
    cleanup.users.push(userId, joshId);
    await serverClient.upsertUsers([{ id: joshId, name: 'Josh' }]);
    await grantMessagingMembers(serverClient, cleanup, EXTRA_MEMBER_GRANTS);
    await waitForChannelTypePropagation();

    client = await getClientSideClient({ id: userId });
    channel = client.channel(channelType, channelId, { members: [userId, joshId] });
    cleanup.channels.push(`${channelType}:${channelId}`);
    await channel.watch();
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('sends a message', async () => {
    // #region snippet docs="_default/04-messages/01-send_message.md" heading="Sending a Message" tab="JavaScript" index=1
    const message = await channel.sendMessage({
      text: 'Hello, world!',
    });
    // #endregion snippet

    expect(message.message.text).toBe('Hello, world!');
    expect(message.message.user?.id).toBe(userId);
  });

  it('sends messages with mentions', async () => {
    const designTeamId = uniqueId('design-team');
    cleanup.add(() => serverClient.deleteUserGroup({ id: designTeamId }));
    await serverClient.createUserGroup({
      id: designTeamId,
      name: designTeamId,
      member_ids: [joshId],
    });

    // #region snippet docs="_default/04-messages/01-send_message.md" heading="Mentions" tab="JavaScript" index=1
    // COPY: designTeamId="design-team-id"
    // Send a message mentioning all online users
    const message = await channel.sendMessage({
      text: 'Hey everyone!',
      mentioned_here: true,
    });

    // Send a message mentioning all channel members
    const allMessage = await channel.sendMessage({
      text: 'Important announcement!',
      mentioned_channel: true,
    });

    // Send a message mentioning specific roles
    const roleMessage = await channel.sendMessage({
      text: 'Attention moderators!',
      mentioned_roles: ['channel_moderator', 'admin'],
    });

    // Send a message mentioning a user group
    const groupMessage = await channel.sendMessage({
      text: 'Design team, please review!',
      mentioned_group_ids: [designTeamId],
    });
    // #endregion snippet

    expect(message.message.mentioned_here).toBe(true);
    expect(allMessage.message.mentioned_channel).toBe(true);
    expect(roleMessage.message.mentioned_roles).toEqual(['channel_moderator', 'admin']);
    expect(groupMessage.message.mentioned_group_ids).toEqual([designTeamId]);
  });

  it('sends a message with attachments', async () => {
    // The docs' `josh` is a user the app already has.
    const josh = { id: joshId };

    // #region snippet docs="_default/04-messages/01-send_message.md" heading="Sending Messages with Attachments" tab="JavaScript" index=1
    const message = await channel.sendMessage(
      {
        text: '@Josh Check out this image!',
        attachments: [
          {
            type: 'image',
            asset_url: 'https://bit.ly/2K74TaG',
            thumb_url: 'https://bit.ly/2Uumxti',
            myCustomField: 123,
          },
        ],
        mentioned_users: [josh.id],
        priority: 'high',
      },
      { skip_push: true },
    );
    // #endregion snippet

    expect(message.message.attachments?.[0]).toMatchObject({
      type: 'image',
      asset_url: 'https://bit.ly/2K74TaG',
      myCustomField: 123,
    });
    expect(message.message.mentioned_users?.map((u) => u.id)).toEqual([joshId]);
    expect(message.message.priority).toBe('high');
  });

  it('enriches URLs', async () => {
    // #region snippet docs="_default/04-messages/01-send_message.md" heading="URL Enrichment" tab="JavaScript" index=1
    const response = await channel.sendMessage({
      text: 'Check this out https://imgur.com/r/bears/4zmGbMN',
    });
    // #endregion snippet

    // Scraping depends on imgur: only check that the message went through.
    expect(response.message.text).toContain('https://imgur.com/r/bears/4zmGbMN');
  });

  it('retrieves a message', async () => {
    const messageID = (
      await sendServerMessage(serverClient, cid, { text: 'to retrieve', user_id: userId })
    ).id;

    // #region snippet docs="_default/04-messages/01-send_message.md" heading="Retrieving a Message" tab="JavaScript" index=1
    const message = await client.getMessage(messageID);
    // #endregion snippet

    expect(message.message.id).toBe(messageID);
    expect(message.message.text).toBe('to retrieve');
  });

  it('updates a message', async () => {
    const messageId = (
      await sendServerMessage(serverClient, cid, {
        text: 'original text',
        user_id: userId,
      })
    ).id;

    // #region snippet docs="_default/04-messages/01-send_message.md" heading="Updating a Message" tab="JavaScript" index=1
    const message = { id: messageId, text: 'Updated message text' };
    const updated = await client.updateMessage(message);
    // #endregion snippet

    expect(updated.message.text).toBe('Updated message text');
  });

  it('partially updates a message', async () => {
    const { message: originalMessage } = await channel.sendMessage({
      text: 'original',
      color: 'red',
      details: { status: 'pending' },
    });

    // #region snippet docs="_default/04-messages/01-send_message.md" heading="Partial Update" tab="JavaScript" index=1
    // Update text
    await client.partialUpdateMessage(originalMessage.id, {
      set: { text: 'Updated text' },
    });

    // Remove a custom field
    await client.partialUpdateMessage(originalMessage.id, {
      unset: ['color'],
    });

    // Update nested properties
    await client.partialUpdateMessage(originalMessage.id, {
      set: { 'details.status': 'complete' },
    });
    // #endregion snippet

    const { message } = await client.getMessage(originalMessage.id);
    expect(message.text).toBe('Updated text');
    expect(message.color).toBeUndefined();
    expect(message.details).toEqual({ status: 'complete' });
  });

  it('deletes a message', async () => {
    const messageID = (
      await sendServerMessage(serverClient, cid, { text: 'to delete', user_id: userId })
    ).id;
    const anotherMessageID = (
      await sendServerMessage(serverClient, cid, {
        text: 'to delete for me',
        user_id: userId,
      })
    ).id;

    // #region snippet docs="_default/04-messages/01-send_message.md" heading="Deleting a Message" tab="JavaScript" index=1
    // Soft delete
    await client.deleteMessage(messageID);

    // Hard delete
    await client.deleteMessage(messageID, { hardDelete: true });

    // Delete for me
    await client.deleteMessage(anotherMessageID, { deleteForMe: true });
    // #endregion snippet

    await expect(serverClient.chat.getMessage({ id: messageID })).rejects.toMatchObject({
      code: 16,
    });
    // Deleted only for the connected user: other users still see it.
    const { message: forOthers } = await serverClient.chat.getMessage({
      id: anotherMessageID,
    });
    expect(forOthers.type).not.toBe('deleted');
    const { message: forMe } = await client.getMessage(anotherMessageID);
    expect(forMe.deleted_for_me).toBe(true);
  });
});
