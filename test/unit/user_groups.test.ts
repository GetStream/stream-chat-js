import { beforeEach, describe, expect, it, vi } from 'vitest';

import { StreamChat } from '../../src/client';
import type {
  AddUserGroupMembersOptions,
  AddUserGroupMembersResponse,
  APIResponse,
  CreateUserGroupOptions,
  CreateUserGroupResponse,
  DeleteUserGroupOptions,
  GetUserGroupOptions,
  GetUserGroupResponse,
  QueryUserGroupsOptions,
  QueryUserGroupsResponse,
  RemoveUserGroupMembersOptions,
  RemoveUserGroupMembersResponse,
  SearchUserGroupsOptions,
  SearchUserGroupsResponse,
  UpdateUserGroupOptions,
  UpdateUserGroupResponse,
  UserGroupResponse,
} from '../../src/types';

const createUserGroup = (
  overrides: Partial<UserGroupResponse> = {},
): UserGroupResponse => ({
  id: 'group-1',
  name: 'Backend Support',
  created_at: '2026-01-01T00:00:00.000000000Z',
  updated_at: '2026-01-01T00:00:00.000000000Z',
  ...overrides,
});

describe('User Groups', () => {
  let client: StreamChat;

  beforeEach(() => {
    client = new StreamChat('api_key');
  });

  describe('queryUserGroups', () => {
    it('should query user groups with cursor options', async () => {
      const mockResponse: QueryUserGroupsResponse = {
        duration: '0.01s',
        user_groups: [createUserGroup()],
      };
      const getSpy = vi.spyOn(client, 'get').mockResolvedValue(mockResponse);
      const options: QueryUserGroupsOptions = {
        limit: 10,
        id_gt: 'group-0',
        created_at_gt: '2025-12-31T23:59:59.000000000Z',
        team_id: 'engineering',
      };

      const result = await client.queryUserGroups(options);

      expect(getSpy).toHaveBeenCalledWith(`${client.baseURL}/usergroups`, options);
      expect(result.user_groups).toHaveLength(1);
      expect(result.user_groups[0].id).toBe('group-1');
    });
  });

  describe('createUserGroup', () => {
    it('should create a user group', async () => {
      const mockResponse: CreateUserGroupResponse = {
        duration: '0.01s',
        user_group: createUserGroup(),
      };
      const postSpy = vi.spyOn(client, 'post').mockResolvedValue(mockResponse);
      const options: CreateUserGroupOptions = {
        id: 'backend-support',
        name: 'Backend Support',
        description: 'On-call backend engineers',
        team_id: 'engineering',
        member_ids: ['tom', 'sara'],
      };

      const result = await client.createUserGroup(options);

      expect(postSpy).toHaveBeenCalledWith(`${client.baseURL}/usergroups`, options);
      expect(result.user_group.id).toBe('group-1');
    });
  });

  describe('getUserGroup', () => {
    it('should get a user group by id', async () => {
      const mockResponse: GetUserGroupResponse = {
        duration: '0.01s',
        user_group: createUserGroup(),
      };
      const getSpy = vi.spyOn(client, 'get').mockResolvedValue(mockResponse);
      const options: GetUserGroupOptions = {
        team_id: 'engineering',
      };

      const result = await client.getUserGroup('backend-support', options);

      expect(getSpy).toHaveBeenCalledWith(
        `${client.baseURL}/usergroups/backend-support`,
        options,
      );
      expect(result.user_group.name).toBe('Backend Support');
    });
  });

  describe('searchUserGroups', () => {
    it('should search user groups with prefix cursor options', async () => {
      const mockResponse: SearchUserGroupsResponse = {
        duration: '0.01s',
        user_groups: [createUserGroup()],
      };
      const getSpy = vi.spyOn(client, 'get').mockResolvedValue(mockResponse);
      const options: SearchUserGroupsOptions = {
        query: 'backend',
        limit: 5,
        name_gt: 'Backend Ops',
        id_gt: 'group-0',
        team_id: 'engineering',
      };

      const result = await client.searchUserGroups(options);

      expect(getSpy).toHaveBeenCalledWith(`${client.baseURL}/usergroups/search`, options);
      expect(result.user_groups).toHaveLength(1);
      expect(result.user_groups[0].name).toBe('Backend Support');
    });
  });

  describe('updateUserGroup', () => {
    it('should update a user group', async () => {
      const mockResponse: UpdateUserGroupResponse = {
        duration: '0.01s',
        user_group: createUserGroup({ description: 'Updated description' }),
      };
      const putSpy = vi.spyOn(client, 'put').mockResolvedValue(mockResponse);
      const options: UpdateUserGroupOptions = {
        description: 'Updated description',
        name: 'Backend Support',
        team_id: 'engineering',
      };

      const result = await client.updateUserGroup('backend-support', options);

      expect(putSpy).toHaveBeenCalledWith(
        `${client.baseURL}/usergroups/backend-support`,
        options,
      );
      expect(result.user_group.description).toBe('Updated description');
    });
  });

  describe('deleteUserGroup', () => {
    it('should delete a user group', async () => {
      const mockResponse: APIResponse = {
        duration: '0.01s',
      };
      const deleteSpy = vi.spyOn(client, 'delete').mockResolvedValue(mockResponse);
      const options: DeleteUserGroupOptions = {
        team_id: 'engineering',
      };

      const result = await client.deleteUserGroup('backend-support', options);

      expect(deleteSpy).toHaveBeenCalledWith(
        `${client.baseURL}/usergroups/backend-support`,
        options,
      );
      expect(result.duration).toBe('0.01s');
    });
  });

  describe('addUserGroupMembers', () => {
    it('should add members to a user group', async () => {
      const mockResponse: AddUserGroupMembersResponse = {
        duration: '0.01s',
        user_group: createUserGroup(),
      };
      const postSpy = vi.spyOn(client, 'post').mockResolvedValue(mockResponse);
      const options: AddUserGroupMembersOptions = {
        member_ids: ['tom', 'sara'],
        as_admin: true,
        team_id: 'engineering',
      };

      const result = await client.addUserGroupMembers('backend-support', options);

      expect(postSpy).toHaveBeenCalledWith(
        `${client.baseURL}/usergroups/backend-support/members`,
        options,
      );
      expect(result.user_group.id).toBe('group-1');
    });
  });

  describe('removeUserGroupMembers', () => {
    it('should remove members from a user group', async () => {
      const mockResponse: RemoveUserGroupMembersResponse = {
        duration: '0.01s',
        user_group: createUserGroup(),
      };
      const postSpy = vi.spyOn(client, 'post').mockResolvedValue(mockResponse);
      const options: RemoveUserGroupMembersOptions = {
        member_ids: ['tom', 'sara'],
        team_id: 'engineering',
      };

      const result = await client.removeUserGroupMembers('backend-support', options);

      expect(postSpy).toHaveBeenCalledWith(
        `${client.baseURL}/usergroups/backend-support/members/delete`,
        options,
      );
      expect(result.user_group.id).toBe('group-1');
    });
  });
});
