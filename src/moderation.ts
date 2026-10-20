import type { ModerationFlagOptions, StreamRequestOptions } from './types';
import type { StreamChat } from './client';
import { ModerationApi } from './gen/moderation/ModerationApi';

export const MODERATION_ENTITY_TYPES = {
  user: 'stream:user',
  message: 'stream:chat:v1:message',
};

/** Moderation v2 endpoints. */
export class Moderation extends ModerationApi {
  client: StreamChat;

  constructor(client: StreamChat) {
    super(client.api);
    this.client = client;
  }

  /**
   * Flags a user.
   *
   * @param request - The user to flag, the reason and any other flag option.
   * @param request.user_id - User ID to be flagged.
   * @param request.reason - Reason for flagging the user (optional).
   * @param request.custom - Additional data to be stored with the flag (optional).
   * @param request.entity_creator_id - ID of the user who created the flagged entity.
   *   Omitted when not supplied; the server resolves it from the entity (optional).
   * @param request.moderation_payload - Content submitted for moderation alongside the
   *   flag (optional).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The flag response.
   */
  flagUser(
    {
      user_id,
      reason,
      ...options
    }: { user_id: string; reason?: string } & ModerationFlagOptions,
    requestOptions?: StreamRequestOptions,
  ) {
    return this.flag(
      {
        entity_type: MODERATION_ENTITY_TYPES.user,
        entity_id: user_id,
        reason,
        ...options,
      },
      requestOptions,
    );
  }

  /**
   * Flags a message.
   *
   * @param request - The message to flag, the reason and any other flag option.
   * @param request.message_id - ID of the message to be flagged.
   * @param request.reason - Reason for flagging the message (optional).
   * @param request.custom - Additional data to be stored with the flag (optional).
   * @param request.entity_creator_id - ID of the user who created the flagged entity.
   *   Omitted when not supplied; the server resolves it from the entity (optional).
   * @param request.moderation_payload - Content submitted for moderation alongside the
   *   flag (optional).
   * @param requestOptions - Per-request options such as an abort `signal`. Never serialized
   *   into the request (optional).
   * @returns The flag response.
   */
  flagMessage(
    {
      message_id,
      reason,
      ...options
    }: { message_id: string; reason?: string } & ModerationFlagOptions,
    requestOptions?: StreamRequestOptions,
  ) {
    return this.flag(
      {
        entity_type: MODERATION_ENTITY_TYPES.message,
        entity_id: message_id,
        reason,
        ...options,
      },
      requestOptions,
    );
  }

  /**
   * Unmutes a user. `requestOptions` (e.g. an abort `signal`) are never serialized into the
   * request.
   */
  async unmuteUser(targetId: string, requestOptions?: StreamRequestOptions) {
    return await this.unmute({ target_ids: [targetId] }, requestOptions);
  }
}
