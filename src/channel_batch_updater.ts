import type { StreamChat } from './client';
import type {
  APIResponse,
  BatchChannelDataUpdate,
  ChannelBatchDataUpdateOptions,
  NewMemberPayload,
  UpdateChannelsBatchFilters,
  UpdateChannelsBatchResponse,
} from './types';

const isChannelBatchDataUpdateOptions = (
  update: BatchChannelDataUpdate | ChannelBatchDataUpdateOptions,
): update is ChannelBatchDataUpdateOptions =>
  'data' in update || 'custom_set' in update || 'custom_unset' in update;

/**
 * ChannelBatchUpdater - A class that provides convenience methods for batch channel operations
 */
export class ChannelBatchUpdater {
  client: StreamChat;

  constructor(client: StreamChat) {
    this.client = client;
  }

  // Member operations

  /**
   * addMembers - Add members to channels matching the filter
   *
   * @param {UpdateChannelsBatchFilters} filter Filter to select channels
   * @param {string[] | NewMemberPayload[]} members Members to add
   * @return {Promise<APIResponse & UpdateChannelsBatchResponse>} The server response
   */
  async addMembers(
    filter: UpdateChannelsBatchFilters,
    members: string[] | NewMemberPayload[],
  ): Promise<APIResponse & UpdateChannelsBatchResponse> {
    return await this.client.updateChannelsBatch({
      operation: 'addMembers',
      filter,
      members,
    });
  }

  /**
   * removeMembers - Remove members from channels matching the filter
   *
   * @param {UpdateChannelsBatchFilters} filter Filter to select channels
   * @param {string[]} members Member IDs to remove
   * @return {Promise<APIResponse & UpdateChannelsBatchResponse>} The server response
   */
  async removeMembers(
    filter: UpdateChannelsBatchFilters,
    members: string[],
  ): Promise<APIResponse & UpdateChannelsBatchResponse> {
    return await this.client.updateChannelsBatch({
      operation: 'removeMembers',
      filter,
      members,
    });
  }

  /**
   * inviteMembers - Invite members to channels matching the filter
   *
   * @param {UpdateChannelsBatchFilters} filter Filter to select channels
   * @param {string[] | NewMemberPayload[]} members Members to invite
   * @return {Promise<APIResponse & UpdateChannelsBatchResponse>} The server response
   */
  async inviteMembers(
    filter: UpdateChannelsBatchFilters,
    members: string[] | NewMemberPayload[],
  ): Promise<APIResponse & UpdateChannelsBatchResponse> {
    return await this.client.updateChannelsBatch({
      operation: 'inviteMembers',
      filter,
      members,
    });
  }

  /**
   * addModerators - Add moderators to channels matching the filter
   *
   * @param {UpdateChannelsBatchFilters} filter Filter to select channels
   * @param {string[]} members Member IDs to promote to moderator
   * @return {Promise<APIResponse & UpdateChannelsBatchResponse>} The server response
   */
  async addModerators(
    filter: UpdateChannelsBatchFilters,
    members: string[],
  ): Promise<APIResponse & UpdateChannelsBatchResponse> {
    return await this.client.updateChannelsBatch({
      operation: 'addModerators',
      filter,
      members,
    });
  }

  /**
   * demoteModerators - Remove moderator role from members in channels matching the filter
   *
   * @param {UpdateChannelsBatchFilters} filter Filter to select channels
   * @param {string[]} members Member IDs to demote
   * @return {Promise<APIResponse & UpdateChannelsBatchResponse>} The server response
   */
  async demoteModerators(
    filter: UpdateChannelsBatchFilters,
    members: string[],
  ): Promise<APIResponse & UpdateChannelsBatchResponse> {
    return await this.client.updateChannelsBatch({
      operation: 'demoteModerators',
      filter,
      members,
    });
  }

  /**
   * assignRoles - Assign roles to members in channels matching the filter
   *
   * @param {UpdateChannelsBatchFilters} filter Filter to select channels
   * @param {NewMemberPayload[]} members Members with role assignments
   * @return {Promise<APIResponse & UpdateChannelsBatchResponse>} The server response
   */
  async assignRoles(
    filter: UpdateChannelsBatchFilters,
    members: NewMemberPayload[],
  ): Promise<APIResponse & UpdateChannelsBatchResponse> {
    return await this.client.updateChannelsBatch({
      operation: 'assignRoles',
      filter,
      members,
    });
  }

  // Visibility operations

  /**
   * hide - Hide channels matching the filter
   *
   * @param {UpdateChannelsBatchFilters} filter Filter to select channels
   * @return {Promise<APIResponse & UpdateChannelsBatchResponse>} The server response
   */
  async hide(
    filter: UpdateChannelsBatchFilters,
  ): Promise<APIResponse & UpdateChannelsBatchResponse> {
    return await this.client.updateChannelsBatch({
      operation: 'hide',
      filter,
    });
  }

  /**
   * show - Show channels matching the filter
   *
   * @param {UpdateChannelsBatchFilters} filter Filter to select channels
   * @return {Promise<APIResponse & UpdateChannelsBatchResponse>} The server response
   */
  async show(
    filter: UpdateChannelsBatchFilters,
  ): Promise<APIResponse & UpdateChannelsBatchResponse> {
    return await this.client.updateChannelsBatch({
      operation: 'show',
      filter,
    });
  }

  /**
   * archive - Archive channels matching the filter
   *
   * @param {UpdateChannelsBatchFilters} filter Filter to select channels
   * @return {Promise<APIResponse & UpdateChannelsBatchResponse>} The server response
   */
  async archive(
    filter: UpdateChannelsBatchFilters,
  ): Promise<APIResponse & UpdateChannelsBatchResponse> {
    return await this.client.updateChannelsBatch({
      operation: 'archive',
      filter,
    });
  }

  /**
   * unarchive - Unarchive channels matching the filter
   *
   * @param {UpdateChannelsBatchFilters} filter Filter to select channels
   * @return {Promise<APIResponse & UpdateChannelsBatchResponse>} The server response
   */
  async unarchive(
    filter: UpdateChannelsBatchFilters,
  ): Promise<APIResponse & UpdateChannelsBatchResponse> {
    return await this.client.updateChannelsBatch({
      operation: 'unarchive',
      filter,
    });
  }

  // Data operations

  /**
   * updateData - Update data on channels matching the filter
   *
   * `data.custom` replaces the channel's whole custom object. To patch
   * individual custom keys, pass an options object with `custom_set` or
   * `custom_unset`. The client sends those fields at the request root rather
   * than inside `data`. The options object can also include `data` to update
   * channel fields in the same request.
   *
   * @param {UpdateChannelsBatchFilters} filter Filter to select channels
   * @param {BatchChannelDataUpdate | ChannelBatchDataUpdateOptions} update Data or update options
   * @return {Promise<APIResponse & UpdateChannelsBatchResponse>} The server response
   */
  async updateData(
    filter: UpdateChannelsBatchFilters,
    data: BatchChannelDataUpdate,
  ): Promise<APIResponse & UpdateChannelsBatchResponse>;
  async updateData(
    filter: UpdateChannelsBatchFilters,
    options: ChannelBatchDataUpdateOptions,
  ): Promise<APIResponse & UpdateChannelsBatchResponse>;
  async updateData(
    filter: UpdateChannelsBatchFilters,
    update: BatchChannelDataUpdate | ChannelBatchDataUpdateOptions,
  ): Promise<APIResponse & UpdateChannelsBatchResponse> {
    const { data, custom_set, custom_unset } = isChannelBatchDataUpdateOptions(update)
      ? update
      : { data: update };

    return await this.client.updateChannelsBatch({
      operation: 'updateData',
      filter,
      ...(data && { data }),
      ...(custom_set && { custom_set }),
      ...(custom_unset && { custom_unset }),
    });
  }
}
