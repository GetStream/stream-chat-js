import type { ModerationFlagOptions, StreamRequestOptions } from './types';
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
   * Flags a user.
   *
   * @param flaggedUserId - User ID to be flagged.
   * @param reason - Reason for flagging the user.
   * @param options - Additional options for flagging the user (optional, defaults to `{}`).
   * @param options.custom - Additional data to be stored with the flag (optional).
   * @param options.entity_creator_id - ID of the user who created the flagged entity.
   *   Overrides the empty-string default (optional).
   * @param options.moderation_payload - Content submitted for moderation alongside the
   *   flag (optional).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The flag response.
   */
  flagUser(
    flaggedUserId: string,
    reason?: string,
    options: ModerationFlagOptions = {},
    requestOptions?: StreamRequestOptions,
  ) {
    return this.flag(
      {
        entity_type: MODERATION_ENTITY_TYPES.user,
        entity_id: flaggedUserId,
        entity_creator_id: '',
        reason,
        ...options,
      },
      requestOptions,
    );
  }

  /**
   * Flags a message.
   *
   * @param messageId - MessageRequest ID to be flagged.
   * @param reason - Reason for flagging the message.
   * @param options - Additional options for flagging the message (optional, defaults to `{}`).
   * @param options.custom - Additional data to be stored with the flag (optional).
   * @param options.entity_creator_id - ID of the user who created the flagged entity.
   *   Overrides the empty-string default (optional).
   * @param options.moderation_payload - Content submitted for moderation alongside the
   *   flag (optional).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The flag response.
   */
  flagMessage(
    messageId: string,
    reason?: string,
    options: ModerationFlagOptions = {},
    requestOptions?: StreamRequestOptions,
  ) {
    return this.flag(
      {
        entity_type: MODERATION_ENTITY_TYPES.message,
        entity_id: messageId,
        entity_creator_id: '',
        reason,
        ...options,
      },
      requestOptions,
    );
  }

  /**
   * Unmutes a user.
   *
   * @param targetId - User ID to be unmuted.
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The unmute response.
   */
  async unmuteUser(targetId: string, requestOptions?: StreamRequestOptions) {
    return await this.unmute({ target_ids: [targetId] }, requestOptions);
  }
}
