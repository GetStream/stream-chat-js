import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StreamChat } from '../../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { uniqueId } from '../../../helpers/ids';

describe('_default/03-channels/07-channel_management/16-channel_invites.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const ownerId = uniqueId('owner');
  const nickId = uniqueId('nick');
  let ownerClient: StreamChat;
  // the invited user; the page's snippets call their client `client`
  let client: StreamChat;

  /** Creates a channel owned by `ownerId` and invites `nickId` server-side. */
  const createInviteChannel = async (prefix: string) => {
    const id = uniqueId(prefix);
    cleanup.channels.push(`messaging:${id}`);
    const channel = serverClient.channel('messaging', id, {
      created_by_id: ownerId,
      members: [ownerId],
    });
    await channel.create();
    await channel.inviteMembers([nickId]);
    return channel;
  };

  const memberOf = async (channelId: string, userId: string) => {
    const { members } = await serverClient
      .channel('messaging', channelId)
      .queryMembers({ user_id: userId });
    return members[0];
  };

  let acceptedId: string;
  let rejectedId: string;
  let pendingId: string;

  beforeAll(async () => {
    cleanup.users.push(ownerId, nickId);
    ownerClient = await getClientSideClient({ id: ownerId });
    client = await getClientSideClient({ id: nickId });

    const accepted = await createInviteChannel('accepted');
    await accepted.acceptInvite({ user_id: nickId });
    acceptedId = accepted.id as string;
    const rejected = await createInviteChannel('rejected');
    await rejected.rejectInvite({ user_id: nickId });
    rejectedId = rejected.id as string;
    pendingId = (await createInviteChannel('pending')).id as string;
  });

  afterAll(async () => {
    await disconnectClients(ownerClient, client);
    await cleanup.run();
  });

  it('invites users', async () => {
    const id = uniqueId('general');
    cleanup.channels.push(`messaging:${id}`);
    const channel = ownerClient.channel('messaging', id, { members: [ownerId] });
    await channel.create();

    // #region snippet docs="_default/03-channels/07-channel_management/16-channel_invites.md" heading="Invite Users" tab="JavaScript" index=1
    // COPY: nickId="nick"
    await channel.inviteMembers([nickId]);
    // #endregion snippet

    const member = await memberOf(id, nickId);
    expect(member?.invited).toBe(true);
    expect(member?.status).toBe('pending');
  });

  it('accepts an invite', async () => {
    const channelId = (await createInviteChannel('awesome-chat')).id as string;

    // #region snippet docs="_default/03-channels/07-channel_management/16-channel_invites.md" heading="Accept an Invite" tab="JavaScript" index=1
    // COPY: channelId="awesome-chat"
    // initialize the channel
    const channel = client.channel('messaging', channelId);

    // accept the invite
    await channel.acceptInvite({
      message: { text: 'Nick joined this channel!' },
    });
    // #endregion snippet

    const member = await memberOf(channelId, nickId);
    expect(member?.invite_accepted_at).toBeTruthy();
    expect(member?.status).toBe('member');
    const { messages } = await serverClient
      .channel('messaging', channelId)
      .query({ messages: { limit: 10 } });
    expect(messages.map((m) => m.text)).toContain('Nick joined this channel!');
  });

  it('rejects an invite', async () => {
    const channelId = (await createInviteChannel('general')).id as string;
    const channel = client.channel('messaging', channelId);

    // #region snippet docs="_default/03-channels/07-channel_management/16-channel_invites.md" heading="Reject an Invite" tab="JavaScript" index=1
    await channel.rejectInvite();
    // #endregion snippet

    const member = await memberOf(channelId, nickId);
    expect(member?.invite_rejected_at).toBeTruthy();
    expect(member?.status).toBe('rejected');
  });

  it('queries accepted invites', async () => {
    // #region snippet docs="_default/03-channels/07-channel_management/16-channel_invites.md" heading="Query Accepted Invites" tab="JavaScript" index=1
    const invites = await client.queryChannels({
      invite: 'accepted',
    });
    // #endregion snippet

    const ids = invites.map((c) => c.id);
    expect(ids).toContain(acceptedId);
    expect(ids).not.toContain(rejectedId);
    expect(ids).not.toContain(pendingId);
  });

  it('queries rejected invites', async () => {
    // #region snippet docs="_default/03-channels/07-channel_management/16-channel_invites.md" heading="Query Rejected Invites" tab="JavaScript" index=1
    const rejected = await client.queryChannels({
      invite: 'rejected',
    });
    // #endregion snippet

    const ids = rejected.map((c) => c.id);
    expect(ids).toContain(rejectedId);
    expect(ids).not.toContain(acceptedId);
    expect(ids).not.toContain(pendingId);
  });

  it('queries pending invites', async () => {
    // #region snippet docs="_default/03-channels/07-channel_management/16-channel_invites.md" heading="Query Pending Invites" tab="JavaScript" index=1
    const pending = await client.queryChannels({
      invite: 'pending',
    });
    // #endregion snippet

    const ids = pending.map((c) => c.id);
    expect(ids).toContain(pendingId);
    expect(ids).not.toContain(acceptedId);
    expect(ids).not.toContain(rejectedId);
  });
});
