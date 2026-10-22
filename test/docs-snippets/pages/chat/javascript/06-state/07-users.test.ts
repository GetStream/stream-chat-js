import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { StreamChat } from '../../../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
  upsertUsers,
} from '../../../../helpers/clients';
import { Cleanup } from '../../../../helpers/cleanup';
import { uniqueId } from '../../../../helpers/ids';

const DOCS = 'chat/javascript/06-state/07-users.md';

describe(DOCS, () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('user');
  const otherUserId = uniqueId('other');
  const channelId = uniqueId('users');
  let client: StreamChat;

  beforeAll(async () => {
    cleanup.users.push(userId, otherUserId);
    await upsertUsers(serverClient, [{ id: otherUserId, name: 'Other' }]);
    // Mute and block before connecting: `connectUser` brings them in
    const setupClient = await getClientSideClient({ id: userId, name: 'Me' });
    await setupClient.moderation.mute({ target_ids: [otherUserId] });
    await setupClient.blockUser(otherUserId);
    await disconnectClients(setupClient);

    client = await getClientSideClient({ id: userId, name: 'Me' });
    // A channel with the other user, so the client has seen them
    const channel = client.channel('messaging', channelId, {
      members: [{ user_id: userId }, { user_id: otherUserId }],
    });
    cleanup.channels.push(`messaging:${channelId}`);
    await channel.watch();
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('reads users', () => {
    // #region snippet docs="chat/javascript/06-state/07-users.md" heading="Reading" tab="JavaScript" index=1
    // The current user (not reactive, updated on `user.updated`)
    const currentUser = client.user;

    // Any user the client has seen (not reactive)
    const otherUser = client.state.users[otherUserId];

    // Muted users
    const { mutedUsers } = client.mutedUsersStore.getLatestValue();

    // Blocked user ids
    const { userIds } = client.blockedUsers.getLatestValue();
    // #endregion snippet

    expect(currentUser?.id).toBe(userId);
    expect(otherUser?.name).toBe('Other');
    expect(mutedUsers.map((mute) => mute.target?.id)).toEqual([otherUserId]);
    expect(userIds).toEqual([otherUserId]);
  });

  it('subscribes to muted and blocked users', () => {
    const renderMutedUsers = vi.fn();
    const renderBlockedUsers = vi.fn();

    // #region snippet docs="chat/javascript/06-state/07-users.md" heading="Reading" tab="JavaScript" index=2
    const unsubscribeMutes = client.mutedUsersStore.subscribe(({ mutedUsers }) =>
      renderMutedUsers(mutedUsers),
    );

    const unsubscribeBlocks = client.blockedUsers.subscribe(({ userIds }) =>
      renderBlockedUsers(userIds),
    );
    // #endregion snippet

    unsubscribeMutes();
    unsubscribeBlocks();
    expect(renderMutedUsers).toHaveBeenCalledWith([
      expect.objectContaining({ target: expect.objectContaining({ id: otherUserId }) }),
    ]);
    expect(renderBlockedUsers).toHaveBeenCalledWith([otherUserId]);
  });
});
