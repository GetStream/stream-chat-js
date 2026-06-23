import type { ModerationFlagOptions, UnmuteUserResponse } from './types';
import type { StreamChat } from './client';
import { ModerationApi } from './gen/moderation/ModerationApi';

export const MODERATION_ENTITY_TYPES = {
  user: 'stream:user',
  message: 'stream:chat:v1:message',
};

// Moderation class provides all the endpoints related to moderation v2.
export class Moderation extends ModerationApi {
  client: StreamChat;

  constructor(client: StreamChat) {
    super(client.api);
    this.client = client;
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
    return this.flag({
      entity_type: MODERATION_ENTITY_TYPES.user,
      entity_id: flaggedUserId,
      entity_creator_id: '',
      reason,
      ...options,
    });
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
    return this.flag({
      entity_type: MODERATION_ENTITY_TYPES.message,
      entity_id: messageId,
      entity_creator_id: '',
      reason,
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
