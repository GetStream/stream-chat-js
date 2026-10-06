import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getServerClient } from '../../../helpers/clients';
import { Cleanup } from '../../../helpers/cleanup';
import { uniqueId } from '../../../helpers/ids';

describe('_default/03-channels/07-channel_management/16-channel_invites.md', () => {
  // The page's server-side snippets call the server client `client`.
  const client = getServerClient();
  const serverClient = client;
  const cleanup = new Cleanup(serverClient);
  const ownerId = uniqueId('owner');
  const nickId = uniqueId('nick');
  const robId = uniqueId('rob');

  /** Creates a channel owned by `ownerId` and invites `userId`. */
  const createInviteChannel = async (prefix: string, userId: string) => {
    const id = uniqueId(prefix);
    cleanup.channels.push(`messaging:${id}`);
    const channel = serverClient.channel('messaging', id, {
      created_by_id: ownerId,
      members: [ownerId],
    });
    await channel.create();
    await channel.inviteMembers([userId]);
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
    cleanup.users.push(ownerId, nickId, robId);
    await serverClient.upsertUsers([{ id: ownerId }, { id: nickId }, { id: robId }]);

    const accepted = await createInviteChannel('accepted', robId);
    await accepted.acceptInvite({ user_id: robId });
    acceptedId = accepted.id as string;
    const rejected = await createInviteChannel('rejected', robId);
    await rejected.rejectInvite({ user_id: robId });
    rejectedId = rejected.id as string;
    pendingId = (await createInviteChannel('pending', robId)).id as string;
  });

  afterAll(() => cleanup.run());

  it('invites users', async () => {
    const id = uniqueId('general');
    cleanup.channels.push(`messaging:${id}`);
    const channel = serverClient.channel('messaging', id, {
      created_by_id: ownerId,
      members: [ownerId],
    });
    await channel.create();

    // #region snippet docs="_default/03-channels/07-channel_management/16-channel_invites.md" heading="Invite Users" tab="Node.js" index=1
    // COPY: nickId="nick"
    await channel.inviteMembers([nickId]);
    // #endregion snippet

    const member = await memberOf(id, nickId);
    expect(member?.invited).toBe(true);
    expect(member?.status).toBe('pending');
  });

  it('accepts an invite', async () => {
    const channelId = (await createInviteChannel('awesome-chat', nickId)).id as string;

    // #region snippet docs="_default/03-channels/07-channel_management/16-channel_invites.md" heading="Accept an Invite" tab="Node.js" index=1
    // COPY: channelId="awesome-chat", nickId="nick"
    // initialize the channel
    const channel = client.channel('messaging', channelId);

    // accept the invite on behalf of a user
    await channel.acceptInvite({ user_id: nickId });
    // #endregion snippet

    const member = await memberOf(channelId, nickId);
    expect(member?.invite_accepted_at).toBeTruthy();
    expect(member?.status).toBe('member');
  });

  it('rejects an invite', async () => {
    const channel = await createInviteChannel('general', robId);

    // #region snippet docs="_default/03-channels/07-channel_management/16-channel_invites.md" heading="Reject an Invite" tab="Node.js" index=1
    // COPY: robId="rob"
    await channel.rejectInvite({ user_id: robId });
    // #endregion snippet

    const member = await memberOf(channel.id as string, robId);
    expect(member?.invite_rejected_at).toBeTruthy();
    expect(member?.status).toBe('rejected');
  });

  it('queries accepted invites', async () => {
    // #region snippet docs="_default/03-channels/07-channel_management/16-channel_invites.md" heading="Query Accepted Invites" tab="Node.js" index=1
    // COPY: robId="rob"
    // query invites for user rob
    const invites = await client.queryChannels(
      {
        invite: 'accepted',
      },
      {},
      { user_id: robId },
    );
    // #endregion snippet

    const ids = invites.map((c) => c.id);
    expect(ids).toContain(acceptedId);
    expect(ids).not.toContain(rejectedId);
    expect(ids).not.toContain(pendingId);
  });

  it('queries rejected invites', async () => {
    // #region snippet docs="_default/03-channels/07-channel_management/16-channel_invites.md" heading="Query Rejected Invites" tab="Node.js" index=1
    // COPY: robId="rob"
    // query invites for user rob
    const rejected = await client.queryChannels(
      {
        invite: 'rejected',
      },
      {},
      { user_id: robId },
    );
    // #endregion snippet

    const ids = rejected.map((c) => c.id);
    expect(ids).toContain(rejectedId);
    expect(ids).not.toContain(acceptedId);
    expect(ids).not.toContain(pendingId);
  });

  it('queries pending invites', async () => {
    // #region snippet docs="_default/03-channels/07-channel_management/16-channel_invites.md" heading="Query Pending Invites" tab="Node.js" index=1
    // COPY: robId="rob"
    // query invites for user rob
    const pending = await client.queryChannels(
      {
        invite: 'pending',
      },
      {},
      { user_id: robId },
    );
    // #endregion snippet

    const ids = pending.map((c) => c.id);
    expect(ids).toContain(pendingId);
    expect(ids).not.toContain(acceptedId);
    expect(ids).not.toContain(rejectedId);
  });
});
