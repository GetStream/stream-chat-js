import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { StreamClient } from '@stream-io/node-sdk';
import type { StreamChat } from '../../../../src';
import {
  disconnectClients,
  getClientSideClient,
  getServerClient,
} from '../../helpers/clients';
import { Cleanup } from '../../helpers/cleanup';
import { DOCS_TEST_PREFIX, uniqueId } from '../../helpers/ids';
import { waitForAppSetting } from '../../helpers/server';

const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : String(error);

/** Deletes a user group, treating "not found" (e.g. already deleted by a snippet) as done. */
const deleteGroupIfExists = async (
  serverClient: StreamClient,
  id: string,
  teamId?: string,
) => {
  try {
    await serverClient.deleteUserGroup({ id, team_id: teamId });
  } catch (error) {
    if (!/not found/.test(errorMessage(error))) throw error;
  }
};

describe('_default/02-init_and_users/04-user_groups.md', () => {
  const serverClient = getServerClient();
  const cleanup = new Cleanup(serverClient);
  const userId = uniqueId('john');
  const alice = uniqueId('alice');
  const bob = uniqueId('bob');
  const charlie = uniqueId('charlie');
  const dave = uniqueId('dave');
  const eve = uniqueId('eve');
  const frank = uniqueId('frank');
  const grace = uniqueId('grace');
  const teamId = uniqueId('my-team');
  // Group names are unique per app (and matched by the leak check), so never "Design Team".
  const groupName = uniqueId('design-team');
  const updatedGroupName = uniqueId('design-product-team');
  // Group the update / member snippets run on (created by `client`, so it owns the group).
  const groupId = uniqueId('design-team');
  const teamGroupId = uniqueId('design-team');
  const teamGroupName = uniqueId('design-team');
  // Groups created without / with a team; deleted in cleanup.
  const groupIds: string[] = [groupId];
  const teamGroupIds: string[] = [teamGroupId];
  let client: StreamChat;

  beforeAll(async () => {
    cleanup.users.push(userId, alice, bob, charlie, dave, eve, frank, grace);
    // Without multi-tenancy, `team_id` is rejected; with it, it's required. Groups without a
    // team are deleted after multi-tenancy is restored, team groups before.
    cleanup.add(() =>
      Promise.all(groupIds.map((id) => deleteGroupIfExists(serverClient, id))),
    );
    const { app } = await serverClient.getApp();
    const originalMultiTenancy = app.multi_tenant_enabled;
    cleanup.add(async () => {
      await serverClient.updateApp({
        multi_tenant_enabled: originalMultiTenancy,
      });
      await waitForAppSetting(serverClient, 'multi_tenant_enabled', originalMultiTenancy);
    });
    cleanup.add(() =>
      Promise.all(
        teamGroupIds.map((id) => deleteGroupIfExists(serverClient, id, teamId)),
      ),
    );

    await serverClient.upsertUsers(
      [alice, bob, charlie, dave, eve, frank, grace].map((id) => ({
        id,
        teams: [teamId],
      })),
    );
    client = await getClientSideClient({ id: userId, teams: [teamId] });
    await client.createUserGroup({ id: groupId, name: uniqueId('design-team') });
  });

  afterAll(async () => {
    await disconnectClients(client);
    await cleanup.run();
  });

  it('creates a user group', async () => {
    // #region snippet docs="_default/02-init_and_users/04-user_groups.md" heading="Creating a User Group" tab="JavaScript" index=1
    // COPY: groupName="Design Team", alice="alice", bob="bob", charlie="charlie"
    const { user_group } = await client.createUserGroup({
      name: groupName,
      description: 'Product design team members',
      member_ids: [alice, bob, charlie],
    });
    // #endregion snippet
    groupIds.push(user_group.id);

    expect(user_group.id).toBeTruthy();
    expect(user_group.name).toBe(groupName);
    expect(user_group.description).toBe('Product design team members');
    expect(user_group.created_by).toBe(userId);
    expect(user_group.members?.map((member) => member.user_id).sort()).toEqual(
      [alice, bob, charlie].sort(),
    );
  });

  it('updates a user group', async () => {
    // #region snippet docs="_default/02-init_and_users/04-user_groups.md" heading="Updating a User Group" tab="JavaScript" index=1
    // COPY: groupId="design-team", updatedGroupName="Design & Product Team"
    const { user_group } = await client.updateUserGroup(groupId, {
      name: updatedGroupName,
      description: 'Product and design team members',
    });
    // #endregion snippet

    expect(user_group.name).toBe(updatedGroupName);
    expect(user_group.description).toBe('Product and design team members');
  });

  it('adds members and changes their admin status', async () => {
    // #region snippet docs="_default/02-init_and_users/04-user_groups.md" heading="Adding Members" tab="JavaScript" index=1
    // COPY: groupId="design-team", dave="dave", eve="eve", frank="frank", grace="grace"
    // Add members as regular members
    const { user_group } = await client.addUserGroupMembers(groupId, {
      member_ids: [dave, eve, frank],
    });

    // Add members as group admins
    const { user_group: admins } = await client.addUserGroupMembers(groupId, {
      member_ids: [grace],
      as_admin: true,
    });

    // Promote an existing member to admin
    await client.addUserGroupMembers(groupId, {
      member_ids: [dave],
      as_admin: true,
    });

    // Demote an admin back to regular member
    await client.addUserGroupMembers(groupId, {
      member_ids: [dave],
      as_admin: false,
    });
    // #endregion snippet

    const isAdmin = (id: string, members = user_group.members) =>
      members?.find((member) => member.user_id === id)?.is_admin;
    expect(isAdmin(dave)).toBe(false);
    expect(isAdmin(frank)).toBe(false);
    expect(isAdmin(grace, admins.members)).toBe(true);

    const { user_group: group } = await client.getUserGroup(groupId);
    expect(group.members?.map((member) => member.user_id).sort()).toEqual(
      [dave, eve, frank, grace].sort(),
    );
    expect(isAdmin(dave, group.members)).toBe(false);
    expect(isAdmin(grace, group.members)).toBe(true);
  });

  it('removes members', async () => {
    // #region snippet docs="_default/02-init_and_users/04-user_groups.md" heading="Removing Members" tab="JavaScript" index=1
    // COPY: groupId="design-team", dave="dave", eve="eve"
    const { user_group } = await client.removeUserGroupMembers(groupId, {
      member_ids: [dave, eve],
    });
    // #endregion snippet

    expect(user_group.members?.map((member) => member.user_id).sort()).toEqual(
      [frank, grace].sort(),
    );
  });

  // These snippets pass `team_id`, which the API only accepts with multi-tenancy enabled.
  describe('with multi-tenancy', () => {
    beforeAll(async () => {
      await serverClient.updateApp({ multi_tenant_enabled: true });
      await waitForAppSetting(serverClient, 'multi_tenant_enabled', true);
      await client.createUserGroup({
        id: teamGroupId,
        name: teamGroupName,
        team_id: teamId,
      });
    });

    it('retrieves a user group', async () => {
      // #region snippet docs="_default/02-init_and_users/04-user_groups.md" heading="Retrieving a User Group" tab="JavaScript" index=1
      // COPY: teamGroupId="design-team", teamId="my-team"
      const { user_group } = await client.getUserGroup(teamGroupId, {
        team_id: teamId, // only with multi-tenancy
      });
      // #endregion snippet

      expect(user_group.id).toBe(teamGroupId);
      expect(user_group.name).toBe(teamGroupName);
      expect(user_group.team_id).toBe(teamId);
    });

    it('lists user groups', async () => {
      // Any id below the test group's id, so it is on the first page.
      const lastId = DOCS_TEST_PREFIX;
      // #region snippet docs="_default/02-init_and_users/04-user_groups.md" heading="Listing User Groups" tab="JavaScript" index=1
      // COPY: lastId="last-id", teamId="my-team"
      const { user_groups } = await client.queryUserGroups({
        limit: 20,
        id_gt: lastId, // optional: cursor for pagination
        created_at_gt: '2024-01-01T00:00:00Z', // optional: filter by creation date
        team_id: teamId, // only with multi-tenancy
      });
      // #endregion snippet

      expect(user_groups.map((group) => group.id)).toContain(teamGroupId);
      expect(user_groups.every((group) => group.team_id === teamId)).toBe(true);
    });

    it('searches user groups', async () => {
      const namePrefix = teamGroupName;
      const lastId = DOCS_TEST_PREFIX;
      // #region snippet docs="_default/02-init_and_users/04-user_groups.md" heading="Searching User Groups" tab="JavaScript" index=1
      // COPY: namePrefix="design", lastId="last-id", teamId="my-team"
      const { user_groups } = await client.searchUserGroups({
        query: namePrefix, // prefix search on group name
        limit: 10,
        name_gt: 'abc', // optional: cursor for pagination by name
        id_gt: lastId, // optional: cursor for pagination by ID
        team_id: teamId, // only with multi-tenancy
      });
      // #endregion snippet

      expect(user_groups.map((group) => group.id)).toEqual([teamGroupId]);
    });

    it('deletes a user group', async () => {
      // #region snippet docs="_default/02-init_and_users/04-user_groups.md" heading="Deleting a User Group" tab="JavaScript" index=1
      // COPY: teamGroupId="design-team", teamId="my-team"
      await client.deleteUserGroup(teamGroupId, {
        team_id: teamId, // only with multi-tenancy
      });
      // #endregion snippet

      await expect(client.getUserGroup(teamGroupId, { team_id: teamId })).rejects.toThrow(
        /not found/,
      );
    });
  });
});
