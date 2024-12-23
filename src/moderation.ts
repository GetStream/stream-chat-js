import {
  APIResponse,
  ModerationConfig,
  DefaultGenerics,
  ExtendableGenerics,
  GetConfigResponse,
  GetUserModerationReportResponse,
  MuteUserResponse,
  ReviewQueueFilters,
  ReviewQueuePaginationOptions,
  ReviewQueueResponse,
  ReviewQueueSort,
  UpsertConfigResponse,
  ModerationFlagOptions,
  ModerationMuteOptions,
  GetUserModerationReportOptions,
  SubmitActionOptions,
  QueryModerationConfigsFilters,
  QueryModerationConfigsSort,
  Pager,
  CustomCheckFlag,
  ReviewQueueItem,
  QueryConfigsResponse,
} from './types';
import { StreamChat } from './client';
import { normalizeQuerySort } from './utils';

export const MODERATION_ENTITY_TYPES = {
  user: 'stream:user',
  message: 'stream:chat:v1:message',
};

// Moderation class provides all the endpoints related to moderation v2.
export class Moderation<StreamChatGenerics extends ExtendableGenerics = DefaultGenerics> {
  client: StreamChat<StreamChatGenerics>;

  constructor(client: StreamChat<StreamChatGenerics>) {
    this.client = client;
  }

  /**
   * Flag a user
   *
   * @param {string} flaggedUserID User ID to be flagged
   * @param {string} reason Reason for flagging the user
   * @param {Object} options Additional options for flagging the user
   * @param {string} options.user_id (For server side usage) User ID of the user who is flagging the target user
   * @param {Object} options.custom Additional data to be stored with the flag
   * @returns
   */
  async flagUser(flaggedUserID: string, reason: string, options: ModerationFlagOptions = {}) {
    return this.flag(MODERATION_ENTITY_TYPES.user, flaggedUserID, '', reason, options);
  }

  /**
   * Flag a message
   *
   * @param {string} messageID Message ID to be flagged
   * @param {string} reason Reason for flagging the message
   * @param {Object} options Additional options for flagging the message
   * @param {string} options.user_id (For server side usage) User ID of the user who is flagging the target message
   * @param {Object} options.custom Additional data to be stored with the flag
   * @returns
   */
  async flagMessage(messageID: string, reason: string, options: ModerationFlagOptions = {}) {
    return this.flag(MODERATION_ENTITY_TYPES.message, messageID, '', reason, options);
  }

  /**
   * Flag a user
   *
   * @param {string} entityType Entity type to be flagged
   * @param {string} entityId Entity ID to be flagged
   * @param {string} entityCreatorID User ID of the entity creator
   * @param {string} reason Reason for flagging the entity
   * @param {Object} options Additional options for flagging the entity
   * @param {string} options.user_id (For server side usage) User ID of the user who is flagging the target entity
   * @param {Object} options.moderation_payload Content to be flagged e.g., { texts: ['text1', 'text2'], images: ['image1', 'image2']}
   * @param {Object} options.custom Additional data to be stored with the flag
   * @returns
   */
  async flag(
    entityType: string,
    entityId: string,
    entityCreatorID: string,
    reason: string,
    options: ModerationFlagOptions = {},
  ) {
    return await this.client.post<{ item_id: string } & APIResponse>(this.client.baseURL + '/api/v2/moderation/flag', {
      entity_type: entityType,
      entity_id: entityId,
      entity_creator_id: entityCreatorID,
      reason,
      ...options,
    });
  }

  /**
   * Mute a user
   * @param {string} targetID  User ID to be muted
   * @param {Object} options Additional options for muting the user
   * @param {string} options.user_id (For server side usage) User ID of the user who is muting the target user
   * @param {number} options.timeout Timeout for the mute in minutes
   * @returns
   */
  async muteUser(targetID: string, options: ModerationMuteOptions = {}) {
    return await this.client.post<MuteUserResponse<StreamChatGenerics> & APIResponse>(
      this.client.baseURL + '/api/v2/moderation/mute',
      {
        target_ids: [targetID],
        ...options,
      },
    );
  }

  /**
   * Unmute a user
   * @param {string} targetID  User ID to be unmuted
   * @param {Object} options Additional options for unmuting the user
   * @param {string} options.user_id (For server side usage) User ID of the user who is unmuting the target user
   * @returns
   */
  async unmuteUser(
    targetID: string,
    options: {
      user_id?: string;
    },
  ) {
    return await this.client.post<{ item_id: string } & APIResponse>(
      this.client.baseURL + '/api/v2/moderation/unmute',
      {
        target_ids: [targetID],
        ...options,
      },
    );
  }

  /**
   * Get moderation report for a user
   * @param {string} userID User ID for which moderation report is to be fetched
   * @param {Object} options Additional options for fetching the moderation report
   * @param {boolean} options.create_user_if_not_exists Create user if not exists
   * @param {boolean} options.include_user_blocks Include user blocks
   * @param {boolean} options.include_user_mutes Include user mutes
   */
  async getUserModerationReport(userID: string, options: GetUserModerationReportOptions = {}) {
    return await this.client.get<GetUserModerationReportResponse<StreamChatGenerics>>(
      this.client.baseURL + `/api/v2/moderation/user_report`,
      {
        user_id: userID,
        ...options,
      },
    );
  }

  /**
   * Query review queue
   * @param {Object} filterConditions Filter conditions for querying review queue
   * @param {Object} sort Sort conditions for querying review queue
   * @param {Object} options Pagination options for querying review queue
   */
  async queryReviewQueue(
    filterConditions: ReviewQueueFilters = {},
    sort: ReviewQueueSort = [],
    options: ReviewQueuePaginationOptions = {},
  ) {
    return await this.client.post<ReviewQueueResponse>(this.client.baseURL + '/api/v2/moderation/review_queue', {
      filter: filterConditions,
      sort: normalizeQuerySort(sort),
      ...options,
    });
  }

  /**
   * Upsert moderation config
   * @param {Object} config Moderation config to be upserted
   */
  async upsertConfig(config: ModerationConfig) {
    return await this.client.post<UpsertConfigResponse>(this.client.baseURL + '/api/v2/moderation/config', config);
  }

  /**
   * Get moderation config
   * @param {string} key Key for which moderation config is to be fetched
   */
  async getConfig(key: string, data?: { team?: string }) {
    return await this.client.get<GetConfigResponse>(this.client.baseURL + '/api/v2/moderation/config/' + key, data);
  }

  async deleteConfig(key: string, data?: { team?: string }) {
    return await this.client.delete(this.client.baseURL + '/api/v2/moderation/config/' + key, data);
  }

  /**
   * Query moderation configs
   * @param {Object} filterConditions Filter conditions for querying moderation configs
   * @param {Object} sort Sort conditions for querying moderation configs
   * @param {Object} options Additional options for querying moderation configs
   */
  async queryConfigs(
    filterConditions: QueryModerationConfigsFilters,
    sort: QueryModerationConfigsSort,
    options: Pager = {},
  ) {
    return await this.client.post<QueryConfigsResponse>(this.client.baseURL + '/api/v2/moderation/configs', {
      filter: filterConditions,
      sort,
      ...options,
    });
  }

  async submitAction(actionType: string, itemID: string, options: SubmitActionOptions = {}) {
    return await this.client.post<{ item_id: string } & APIResponse>(
      this.client.baseURL + '/api/v2/moderation/submit_action',
      {
        action_type: actionType,
        item_id: itemID,
        ...options,
      },
    );
  }

  /**
   *
   * @param {string} entityType string Type of entity to be checked E.g., stream:user, stream:chat:v1:message, or any custom string
   * @param {string} entityID string ID of the entity to be checked. This is mainly for tracking purposes
   * @param {string} entityCreatorID string ID of the entity creator
   * @param {object} moderationPayload object Content to be checked for moderation. E.g., { texts: ['text1', 'text2'], images: ['image1', 'image2']}
   * @param {Array} moderationPayload.texts array Array of texts to be checked for moderation
   * @param {Array} moderationPayload.images array Array of images to be checked for moderation
   * @param {Array} moderationPayload.videos array Array of videos to be checked for moderation
   * @param configKey
   * @param options
   * @returns
   */
  async check(
    entityType: string,
    entityID: string,
    entityCreatorID: string,
    moderationPayload: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      custom?: Record<string, any>;
      images?: string[];
      texts?: string[];
      videos?: string[];
    },
    configKey: string,
    options?: {
      force_sync?: boolean;
    },
  ) {
    return await this.client.post(this.client.baseURL + `/api/v2/moderation/check`, {
      entity_type: entityType,
      entity_id: entityID,
      entity_creator_id: entityCreatorID,
      moderation_payload: moderationPayload,
      config_key: configKey,
      options,
    });
  }

  /**
   *
   * @param {string} entityType string Type of entity to be checked E.g., stream:user, stream:chat:v1:message, or any custom string
   * @param {string} entityID string ID of the entity to be checked. This is mainly for tracking purposes
   * @param {string} entityCreatorID string ID of the entity creator
   * @param {object} moderationPayload object Content to be checked for moderation. E.g., { texts: ['text1', 'text2'], images: ['image1', 'image2']}
   * @param {Array} moderationPayload.texts array Array of texts to be checked for moderation
   * @param {Array} moderationPayload.images array Array of images to be checked for moderation
   * @param {Array} moderationPayload.videos array Array of videos to be checked for moderation
   * @param {Array<CustomCheckFlag>} flags Array of CustomCheckFlag to be passed to flag the entity
   * @returns
   */
  async addCustomFlags(
    entityType: string,
    entityID: string,
    entityCreatorID: string,
    moderationPayload: {
      images?: string[];
      texts?: string[];
      videos?: string[];
    },
    flags: CustomCheckFlag[],
  ) {
    return await this.client.post<{ id: string; item: ReviewQueueItem; status: string } & APIResponse>(
      this.client.baseURL + `/api/v2/moderation/custom_check`,
      {
        entity_type: entityType,
        entity_id: entityID,
        entity_creator_id: entityCreatorID,
        moderation_payload: moderationPayload,
        flags,
      },
    );
  }

  /**
   * Add custom flags to a message
   * @param {string} messageID Message ID to be flagged
   * @param {Array<CustomCheckFlag>} flags Array of CustomCheckFlag to be passed to flag the message
   * @returns
   */
  async addCustomMessageFlags(messageID: string, flags: CustomCheckFlag[]) {
    return await this.addCustomFlags(MODERATION_ENTITY_TYPES.message, messageID, '', {}, flags);
  }
}
