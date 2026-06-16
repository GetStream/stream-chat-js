import type {
  ModerationFlagOptions,
  ModerationMuteOptions,
  UnmuteUserResponse,
} from './types';
import type { StreamChat } from './client';
import { ModerationApi } from './gen/moderation/ModerationApi';

export const MODERATION_ENTITY_TYPES = {
  user: 'stream:user',
  message: 'stream:chat:v1:message',
};

// Moderation class provides all the endpoints related to moderation v2.
export class Moderation {
  client: StreamChat;
  private moderationApi: ModerationApi;

  constructor(client: StreamChat) {
    this.client = client;
    this.moderationApi = new ModerationApi(client.api);
  }

  /**
   * Flag a user.
   *
   * @param flaggedUserId User ID to be flagged.
   * @param reason Reason for flagging the user.
   * @param options Additional options for flagging the user (optional, defaults to `{}`).
   * @param options.custom Additional data to be stored with the flag (optional).
   * @returns The flag response.
   */
  flagUser(flaggedUserId: string, reason: string, options: ModerationFlagOptions = {}) {
    return this.flag(MODERATION_ENTITY_TYPES.user, flaggedUserId, '', reason, options);
  }

  /**
   * Flag a message.
   *
   * @param messageId Message ID to be flagged.
   * @param reason Reason for flagging the message.
   * @param options Additional options for flagging the message (optional, defaults to `{}`).
   * @param options.custom Additional data to be stored with the flag (optional).
   * @returns The flag response.
   */
  flagMessage(messageId: string, reason: string, options: ModerationFlagOptions = {}) {
    return this.flag(MODERATION_ENTITY_TYPES.message, messageId, '', reason, options);
  }

  /**
   * Flag an entity.
   *
   * @param entityType Entity type to be flagged.
   * @param entityId Entity ID to be flagged.
   * @param entityCreatorId User ID of the entity creator.
   * @param reason Reason for flagging the entity.
   * @param options Additional options for flagging the entity (optional, defaults to `{}`).
   * @param options.moderation_payload Content to be flagged, e.g.
   *   `{ texts: ['text1', 'text2'], images: ['image1', 'image2'] }` (optional).
   * @param options.custom Additional data to be stored with the flag (optional).
   * @returns The flag response.
   */
  async flag(
    entityType: string,
    entityId: string,
    entityCreatorId: string,
    reason: string,
    options: ModerationFlagOptions = {},
  ) {
    return await this.moderationApi.flag({
      entity_type: entityType,
      entity_id: entityId,
      entity_creator_id: entityCreatorId,
      reason,
      ...options,
    });
  }

  /**
   * Mute a user.
   *
   * @param targetId User ID to be muted.
   * @param options Additional options for muting the user (optional, defaults to `{}`).
   * @param options.timeout Timeout for the mute in minutes (optional).
   * @returns The mute response.
   */
  async muteUser(targetId: string, options: ModerationMuteOptions = {}) {
    return await this.moderationApi.mute({
      target_ids: [targetId],
      ...options,
    });
  }

  /**
   * Unmute a user.
   *
   * @param targetId User ID to be unmuted.
   * @returns The unmute response.
   */
  async unmuteUser(targetId: string) {
    return await this.client.api.post<UnmuteUserResponse>(
      this.client.baseURL + '/api/v2/moderation/unmute',
      {
        target_ids: [targetId],
      },
    );
  }
}
