type Decoder = (i: any) => any;

type TypeMapping = Record<string, { type: string; isSingle: boolean }>;

export const decoders: Record<string, Decoder> = {};

const decodeDatetimeType = (input: number | string) =>
  typeof input === 'number' ? new Date(Math.floor(input / 1000000)) : new Date(input);

decoders.DatetimeType = decodeDatetimeType;

const decode = (typeMappings: TypeMapping, input?: Record<string, any>) => {
  if (!input || Object.keys(typeMappings).length === 0) return input;

  Object.keys(typeMappings).forEach((key) => {
    if (input[key] != null) {
      if (typeMappings[key]) {
        const decoder = decoders[typeMappings[key].type];
        if (decoder) {
          if (typeMappings[key].isSingle) {
            input[key] = decoder(input[key]);
          } else {
            Object.keys(input[key]).forEach((k) => {
              input[key][k] = decoder(input[key][k]);
            });
          }
        }
      }
    }
  });

  return input;
};

decoders['AIIndicatorClearEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['AIIndicatorStopEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['AIIndicatorUpdateEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ActionLogResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    review_queue_item: { type: 'ReviewQueueItemResponse', isSingle: true },

    target_user: { type: 'UserResponse', isSingle: true },

    user: { type: 'UserResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['AddUserGroupMembersResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    user_group: { type: 'UserGroupResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['AppUpdatedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['AppealItemResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    actions: { type: 'ActionLogResponse', isSingle: false },

    flags: { type: 'ModerationFlagResponse', isSingle: false },

    moderation_action: { type: 'ActionLogResponse', isSingle: true },

    original_moderation_action: { type: 'ActionLogResponse', isSingle: true },

    user: { type: 'UserResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['AutomodDetailsResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    result: { type: 'MessageModerationResult', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['BanInfoResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    expires: { type: 'DatetimeType', isSingle: true },

    created_by: { type: 'UserResponse', isSingle: true },

    user: { type: 'UserResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['BanResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    expires: { type: 'DatetimeType', isSingle: true },

    banned_by: { type: 'UserResponse', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    user: { type: 'UserResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['BlockListResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['BlockUsersResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['BlockedUserResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    blocked_user: { type: 'UserResponse', isSingle: true },

    user: { type: 'UserResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['BulkActionAppealsResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    results: { type: 'BulkAppealResult', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['BulkAppealResult'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    appeal_item: { type: 'AppealItemResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['CallResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    ended_at: { type: 'DatetimeType', isSingle: true },

    starts_at: { type: 'DatetimeType', isSingle: true },

    created_by: { type: 'UserResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ChannelConfigWithInfo'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    commands: { type: 'Command', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['ChannelCreatedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ChannelDeletedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ChannelFrozenEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ChannelHiddenEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ChannelKickedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ChannelMemberResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    archived_at: { type: 'DatetimeType', isSingle: true },

    ban_expires: { type: 'DatetimeType', isSingle: true },

    deleted_at: { type: 'DatetimeType', isSingle: true },

    invite_accepted_at: { type: 'DatetimeType', isSingle: true },

    invite_rejected_at: { type: 'DatetimeType', isSingle: true },

    pinned_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ChannelMute'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    expires: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    user: { type: 'UserResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ChannelPushPreferencesResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    disabled_until: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ChannelResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    deleted_at: { type: 'DatetimeType', isSingle: true },

    hide_messages_before: { type: 'DatetimeType', isSingle: true },

    last_message_at: { type: 'DatetimeType', isSingle: true },

    mute_expires_at: { type: 'DatetimeType', isSingle: true },

    truncated_at: { type: 'DatetimeType', isSingle: true },

    members: { type: 'ChannelMemberResponse', isSingle: false },

    config: { type: 'ChannelConfigWithInfo', isSingle: true },

    created_by: { type: 'UserResponse', isSingle: true },

    truncated_by: { type: 'UserResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ChannelStateResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    members: { type: 'ChannelMemberResponse', isSingle: false },

    messages: { type: 'MessageResponse', isSingle: false },

    pinned_messages: { type: 'MessageResponse', isSingle: false },

    threads: { type: 'ThreadStateResponse', isSingle: false },

    hide_messages_before: { type: 'DatetimeType', isSingle: true },

    active_live_locations: { type: 'SharedLocationResponseData', isSingle: false },

    pending_messages: { type: 'PendingMessageResponse', isSingle: false },

    read: { type: 'ReadStateResponse', isSingle: false },

    watchers: { type: 'UserResponse', isSingle: false },

    channel: { type: 'ChannelResponse', isSingle: true },

    draft: { type: 'DraftResponse', isSingle: true },

    membership: { type: 'ChannelMemberResponse', isSingle: true },

    push_preferences: { type: 'ChannelPushPreferencesResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ChannelStateResponseFields'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    members: { type: 'ChannelMemberResponse', isSingle: false },

    messages: { type: 'MessageResponse', isSingle: false },

    pinned_messages: { type: 'MessageResponse', isSingle: false },

    threads: { type: 'ThreadStateResponse', isSingle: false },

    hide_messages_before: { type: 'DatetimeType', isSingle: true },

    active_live_locations: { type: 'SharedLocationResponseData', isSingle: false },

    pending_messages: { type: 'PendingMessageResponse', isSingle: false },

    read: { type: 'ReadStateResponse', isSingle: false },

    watchers: { type: 'UserResponse', isSingle: false },

    channel: { type: 'ChannelResponse', isSingle: true },

    draft: { type: 'DraftResponse', isSingle: true },

    membership: { type: 'ChannelMemberResponse', isSingle: true },

    push_preferences: { type: 'ChannelPushPreferencesResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ChannelTruncatedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    message: { type: 'MessageResponse', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ChannelUnFrozenEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ChannelUpdatedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    message: { type: 'MessageResponse', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ChannelVisibleEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ChatDraftPayloadResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    mentioned_users: { type: 'UserResponse', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['ChatDraftResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    message: { type: 'ChatDraftPayloadResponse', isSingle: true },

    parent_message: { type: 'ChatMessageResponse', isSingle: true },

    quoted_message: { type: 'ChatMessageResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ChatMessageResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    latest_reactions: { type: 'ChatReactionResponse', isSingle: false },

    mentioned_users: { type: 'UserResponse', isSingle: false },

    own_reactions: { type: 'ChatReactionResponse', isSingle: false },

    user: { type: 'UserResponse', isSingle: true },

    deleted_at: { type: 'DatetimeType', isSingle: true },

    message_text_updated_at: { type: 'DatetimeType', isSingle: true },

    pin_expires: { type: 'DatetimeType', isSingle: true },

    pinned_at: { type: 'DatetimeType', isSingle: true },

    mentioned_groups: { type: 'UserGroupResponse', isSingle: false },

    thread_participants: { type: 'UserResponse', isSingle: false },

    draft: { type: 'ChatDraftResponse', isSingle: true },

    member: { type: 'ChannelMemberResponse', isSingle: true },

    pinned_by: { type: 'UserResponse', isSingle: true },

    poll: { type: 'PollResponseData', isSingle: true },

    quoted_message: { type: 'ChatMessageResponse', isSingle: true },

    reaction_groups: { type: 'ChatReactionGroupResponse', isSingle: false },

    reminder: { type: 'ChatReminderResponseData', isSingle: true },

    shared_location: { type: 'ChatSharedLocationResponseData', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ChatReactionGroupResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    first_reaction_at: { type: 'DatetimeType', isSingle: true },

    last_reaction_at: { type: 'DatetimeType', isSingle: true },

    latest_reactions_by: { type: 'ChatReactionGroupUserResponse', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['ChatReactionGroupUserResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ChatReactionResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ChatReminderResponseData'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    remind_at: { type: 'DatetimeType', isSingle: true },

    message: { type: 'ChatMessageResponse', isSingle: true },

    user: { type: 'UserResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ChatSharedLocationResponseData'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    end_at: { type: 'DatetimeType', isSingle: true },

    message: { type: 'ChatMessageResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['Command'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ConfigResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['CreateBlockListResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    blocklist: { type: 'BlockListResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['CreateDraftResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    draft: { type: 'DraftResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['CreateGuestResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    user: { type: 'UserResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['CreateUserGroupResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    user_group: { type: 'UserGroupResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['CustomEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['DeleteChannelResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    channel: { type: 'ChannelResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['DeleteMessageResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    message: { type: 'MessageResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['DeleteReactionResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    message: { type: 'MessageResponse', isSingle: true },

    reaction: { type: 'ReactionResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['DeviceResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['DraftDeletedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    draft: { type: 'DraftResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['DraftPayloadResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    mentioned_users: { type: 'UserResponse', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['DraftResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    message: { type: 'DraftPayloadResponse', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    parent_message: { type: 'MessageResponse', isSingle: true },

    quoted_message: { type: 'MessageResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['DraftUpdatedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    draft: { type: 'DraftResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['EntityCreatorResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    deactivated_at: { type: 'DatetimeType', isSingle: true },

    deleted_at: { type: 'DatetimeType', isSingle: true },

    last_active: { type: 'DatetimeType', isSingle: true },

    revoke_tokens_issued_before: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['FeedsBookmarkResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['FeedsEnrichedCollectionResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['FeedsFeedResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    created_by: { type: 'UserResponse', isSingle: true },

    deleted_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['FeedsReactionGroupResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    first_reaction_at: { type: 'DatetimeType', isSingle: true },

    last_reaction_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['FeedsReactionResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['FeedsV3ActivityResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    comments: { type: 'FeedsV3CommentResponse', isSingle: false },

    latest_reactions: { type: 'FeedsReactionResponse', isSingle: false },

    mentioned_users: { type: 'UserResponse', isSingle: false },

    own_bookmarks: { type: 'FeedsBookmarkResponse', isSingle: false },

    own_reactions: { type: 'FeedsReactionResponse', isSingle: false },

    collections: { type: 'FeedsEnrichedCollectionResponse', isSingle: false },

    reaction_groups: { type: 'FeedsReactionGroupResponse', isSingle: false },

    user: { type: 'UserResponse', isSingle: true },

    deleted_at: { type: 'DatetimeType', isSingle: true },

    edited_at: { type: 'DatetimeType', isSingle: true },

    expires_at: { type: 'DatetimeType', isSingle: true },

    friend_reactions: { type: 'FeedsReactionResponse', isSingle: false },

    current_feed: { type: 'FeedsFeedResponse', isSingle: true },

    parent: { type: 'FeedsV3ActivityResponse', isSingle: true },

    poll: { type: 'PollResponseData', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['FeedsV3CommentResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    mentioned_users: { type: 'UserResponse', isSingle: false },

    own_reactions: { type: 'FeedsReactionResponse', isSingle: false },

    user: { type: 'UserResponse', isSingle: true },

    deleted_at: { type: 'DatetimeType', isSingle: true },

    edited_at: { type: 'DatetimeType', isSingle: true },

    latest_reactions: { type: 'FeedsReactionResponse', isSingle: false },

    reaction_groups: { type: 'FeedsReactionGroupResponse', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['FlagDetailsResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    automod: { type: 'AutomodDetailsResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['FlagFeedbackResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['FullUserResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    channel_mutes: { type: 'ChannelMute', isSingle: false },

    devices: { type: 'DeviceResponse', isSingle: false },

    mutes: { type: 'UserMuteResponse', isSingle: false },

    ban_expires: { type: 'DatetimeType', isSingle: true },

    deactivated_at: { type: 'DatetimeType', isSingle: true },

    deleted_at: { type: 'DatetimeType', isSingle: true },

    last_active: { type: 'DatetimeType', isSingle: true },

    revoke_tokens_issued_before: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['FutureChannelBanResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    expires: { type: 'DatetimeType', isSingle: true },

    banned_by: { type: 'UserResponse', isSingle: true },

    user: { type: 'UserResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['GetAppealResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    item: { type: 'AppealItemResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['GetBlockedUsersResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    blocks: { type: 'BlockedUserResponse', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['GetConfigResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    config: { type: 'ConfigResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['GetDraftResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    draft: { type: 'DraftResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['GetManyMessagesResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    messages: { type: 'MessageResponse', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['GetMessageResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    message: { type: 'MessageWithChannelResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['GetReactionsResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    reactions: { type: 'ReactionResponse', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['GetRepliesResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    messages: { type: 'MessageResponse', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['GetThreadResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    thread: { type: 'ThreadStateResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['GetUserGroupResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    user_group: { type: 'UserGroupResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['GroupedChannelsBucket'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    channels: { type: 'ChannelStateResponseFields', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['GroupedQueryChannelsResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    groups: { type: 'GroupedChannelsBucket', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['HealthCheckEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    me: { type: 'OwnUserResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ListBlockListResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    blocklists: { type: 'BlockListResponse', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['ListDevicesResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    devices: { type: 'DeviceResponse', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['ListUserGroupsResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    user_groups: { type: 'UserGroupResponse', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['MarkReadResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    event: { type: 'MarkReadResponseEvent', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['MarkReadResponseEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    channel_last_message_at: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    thread: { type: 'ThreadResponse', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['MaxStreakChangedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['MemberAddedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    member: { type: 'ChannelMemberResponse', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['MemberRemovedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    member: { type: 'ChannelMemberResponse', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['MemberUpdatedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    member: { type: 'ChannelMemberResponse', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['MembersResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    members: { type: 'ChannelMemberResponse', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['MessageActionResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    message: { type: 'MessageResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['MessageDeletedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    message: { type: 'MessageResponse', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['MessageDeliveredEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['MessageFlagResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    approved_at: { type: 'DatetimeType', isSingle: true },

    rejected_at: { type: 'DatetimeType', isSingle: true },

    reviewed_at: { type: 'DatetimeType', isSingle: true },

    details: { type: 'FlagDetailsResponse', isSingle: true },

    message: { type: 'MessageResponse', isSingle: true },

    moderation_feedback: { type: 'FlagFeedbackResponse', isSingle: true },

    moderation_result: { type: 'MessageModerationResult', isSingle: true },

    reviewed_by: { type: 'UserResponse', isSingle: true },

    user: { type: 'UserResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['MessageModerationResult'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['MessageNewEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    message: { type: 'MessageResponse', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    thread_participants: { type: 'UserResponseCommonFields', isSingle: false },

    channel: { type: 'ChannelResponse', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['MessageReadEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    thread: { type: 'ThreadResponse', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['MessageResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    latest_reactions: { type: 'ReactionResponse', isSingle: false },

    mentioned_users: { type: 'UserResponse', isSingle: false },

    own_reactions: { type: 'ReactionResponse', isSingle: false },

    user: { type: 'UserResponse', isSingle: true },

    deleted_at: { type: 'DatetimeType', isSingle: true },

    message_text_updated_at: { type: 'DatetimeType', isSingle: true },

    pin_expires: { type: 'DatetimeType', isSingle: true },

    pinned_at: { type: 'DatetimeType', isSingle: true },

    mentioned_groups: { type: 'UserGroupResponse', isSingle: false },

    thread_participants: { type: 'UserResponse', isSingle: false },

    draft: { type: 'DraftResponse', isSingle: true },

    member: { type: 'ChannelMemberResponse', isSingle: true },

    pinned_by: { type: 'UserResponse', isSingle: true },

    poll: { type: 'PollResponseData', isSingle: true },

    quoted_message: { type: 'MessageResponse', isSingle: true },

    reaction_groups: { type: 'ReactionGroupResponse', isSingle: false },

    reminder: { type: 'ReminderResponseData', isSingle: true },

    shared_location: { type: 'SharedLocationResponseData', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['MessageUndeletedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    message: { type: 'MessageResponse', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['MessageUpdatedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    message: { type: 'MessageResponse', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['MessageWithChannelResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    latest_reactions: { type: 'ReactionResponse', isSingle: false },

    mentioned_users: { type: 'UserResponse', isSingle: false },

    own_reactions: { type: 'ReactionResponse', isSingle: false },

    channel: { type: 'ChannelResponse', isSingle: true },

    user: { type: 'UserResponse', isSingle: true },

    deleted_at: { type: 'DatetimeType', isSingle: true },

    message_text_updated_at: { type: 'DatetimeType', isSingle: true },

    pin_expires: { type: 'DatetimeType', isSingle: true },

    pinned_at: { type: 'DatetimeType', isSingle: true },

    mentioned_groups: { type: 'UserGroupResponse', isSingle: false },

    thread_participants: { type: 'UserResponse', isSingle: false },

    draft: { type: 'DraftResponse', isSingle: true },

    member: { type: 'ChannelMemberResponse', isSingle: true },

    pinned_by: { type: 'UserResponse', isSingle: true },

    poll: { type: 'PollResponseData', isSingle: true },

    quoted_message: { type: 'MessageResponse', isSingle: true },

    reaction_groups: { type: 'ReactionGroupResponse', isSingle: false },

    reminder: { type: 'ReminderResponseData', isSingle: true },

    shared_location: { type: 'SharedLocationResponseData', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ModerationCustomActionEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    review_queue_item: { type: 'ReviewQueueItemResponse', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    message: { type: 'MessageResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ModerationFlagResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    review_queue_item: { type: 'ReviewQueueItemResponse', isSingle: true },

    user: { type: 'UserResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ModerationFlaggedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ModerationMarkReviewedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    item: { type: 'ReviewQueueItemResponse', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    message: { type: 'MessageResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['MuteChannelResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    channel_mutes: { type: 'ChannelMute', isSingle: false },

    channel_mute: { type: 'ChannelMute', isSingle: true },

    own_user: { type: 'OwnUserResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['MuteResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    mutes: { type: 'UserMuteResponse', isSingle: false },

    own_user: { type: 'OwnUserResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['NotificationAddedToChannelEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    member: { type: 'ChannelMemberResponse', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['NotificationChannelDeletedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['NotificationChannelMutesUpdatedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    me: { type: 'OwnUserResponse', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['NotificationChannelTruncatedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    message: { type: 'MessageResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['NotificationInviteAcceptedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    member: { type: 'ChannelMemberResponse', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['NotificationInviteRejectedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    member: { type: 'ChannelMemberResponse', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['NotificationInvitedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    member: { type: 'ChannelMemberResponse', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['NotificationMarkReadEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    thread: { type: 'ThreadResponse', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['NotificationMarkUnreadEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    last_read_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['NotificationMutesUpdatedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    me: { type: 'OwnUserResponse', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['NotificationNewMessageEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    message: { type: 'MessageResponse', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    thread_participants: { type: 'UserResponseCommonFields', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['NotificationRemovedFromChannelEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    member: { type: 'ChannelMemberResponse', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['NotificationThreadMessageNewEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    message: { type: 'MessageResponse', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    thread_participants: { type: 'UserResponseCommonFields', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['OwnUserResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    channel_mutes: { type: 'ChannelMute', isSingle: false },

    devices: { type: 'DeviceResponse', isSingle: false },

    mutes: { type: 'UserMuteResponse', isSingle: false },

    deactivated_at: { type: 'DatetimeType', isSingle: true },

    deleted_at: { type: 'DatetimeType', isSingle: true },

    last_active: { type: 'DatetimeType', isSingle: true },

    revoke_tokens_issued_before: { type: 'DatetimeType', isSingle: true },

    push_preferences: { type: 'PushPreferencesResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['PendingMessageEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    message: { type: 'MessageResponse', isSingle: true },

    user: { type: 'UserResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['PendingMessageResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    channel: { type: 'ChannelResponse', isSingle: true },

    message: { type: 'MessageResponse', isSingle: true },

    user: { type: 'UserResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['PollClosedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    poll: { type: 'PollResponseData', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['PollDeletedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    poll: { type: 'PollResponseData', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['PollResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    poll: { type: 'PollResponseData', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['PollResponseData'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    latest_answers: { type: 'PollVoteResponseData', isSingle: false },

    own_votes: { type: 'PollVoteResponseData', isSingle: false },

    created_by: { type: 'UserResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['PollUpdatedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    poll: { type: 'PollResponseData', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['PollVoteCastedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    poll: { type: 'PollResponseData', isSingle: true },

    poll_vote: { type: 'PollVoteResponseData', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['PollVoteChangedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    poll: { type: 'PollResponseData', isSingle: true },

    poll_vote: { type: 'PollVoteResponseData', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['PollVoteRemovedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    poll: { type: 'PollResponseData', isSingle: true },

    poll_vote: { type: 'PollVoteResponseData', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['PollVoteResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    poll: { type: 'PollResponseData', isSingle: true },

    vote: { type: 'PollVoteResponseData', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['PollVoteResponseData'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['PollVotesResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    votes: { type: 'PollVoteResponseData', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['PushPreferencesResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    disabled_until: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['QueryAppealsResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    items: { type: 'AppealItemResponse', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['QueryBannedUsersResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    bans: { type: 'BanResponse', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['QueryChannelsResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    channels: { type: 'ChannelStateResponseFields', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['QueryDraftsResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    drafts: { type: 'DraftResponse', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['QueryFutureChannelBansResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    bans: { type: 'FutureChannelBanResponse', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['QueryMessageFlagsResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    flags: { type: 'MessageFlagResponse', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['QueryModerationConfigsResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    configs: { type: 'ConfigResponse', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['QueryPollsResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    polls: { type: 'PollResponseData', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['QueryReactionsResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    reactions: { type: 'ReactionResponse', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['QueryRemindersResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    reminders: { type: 'ReminderResponseData', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['QueryReviewQueueResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    items: { type: 'ReviewQueueItemResponse', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['QueryThreadsResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    threads: { type: 'ThreadStateResponse', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['QueryUsersResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    users: { type: 'FullUserResponse', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['Reaction'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    deleted_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ReactionDeletedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    thread_participants: { type: 'UserResponseCommonFields', isSingle: false },

    message: { type: 'MessageResponse', isSingle: true },

    reaction: { type: 'ReactionResponse', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ReactionGroupResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    first_reaction_at: { type: 'DatetimeType', isSingle: true },

    last_reaction_at: { type: 'DatetimeType', isSingle: true },

    latest_reactions_by: { type: 'ReactionGroupUserResponse', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['ReactionGroupUserResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ReactionNewEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    thread_participants: { type: 'UserResponseCommonFields', isSingle: false },

    message: { type: 'MessageResponse', isSingle: true },

    reaction: { type: 'ReactionResponse', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ReactionResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ReactionUpdatedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    message: { type: 'MessageResponse', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    reaction: { type: 'ReactionResponse', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ReadStateResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    last_read: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponse', isSingle: true },

    last_delivered_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ReminderCreatedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    reminder: { type: 'ReminderResponseData', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ReminderDeletedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    reminder: { type: 'ReminderResponseData', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ReminderNotificationEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    reminder: { type: 'ReminderResponseData', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ReminderResponseData'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    remind_at: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    message: { type: 'MessageResponse', isSingle: true },

    user: { type: 'UserResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ReminderUpdatedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    reminder: { type: 'ReminderResponseData', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['RemoveUserGroupMembersResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    user_group: { type: 'UserGroupResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ReviewQueueItemResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    actions: { type: 'ActionLogResponse', isSingle: false },

    bans: { type: 'BanInfoResponse', isSingle: false },

    flags: { type: 'ModerationFlagResponse', isSingle: false },

    completed_at: { type: 'DatetimeType', isSingle: true },

    escalated_at: { type: 'DatetimeType', isSingle: true },

    reviewed_at: { type: 'DatetimeType', isSingle: true },

    appeal: { type: 'AppealItemResponse', isSingle: true },

    assigned_to: { type: 'UserResponse', isSingle: true },

    call: { type: 'CallResponse', isSingle: true },

    entity_creator: { type: 'EntityCreatorResponse', isSingle: true },

    feeds_v2_reaction: { type: 'Reaction', isSingle: true },

    feeds_v3_activity: { type: 'FeedsV3ActivityResponse', isSingle: true },

    feeds_v3_comment: { type: 'FeedsV3CommentResponse', isSingle: true },

    message: { type: 'ChatMessageResponse', isSingle: true },

    reaction: { type: 'Reaction', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['Role'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['SearchResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    results: { type: 'SearchResult', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['SearchResult'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    message: { type: 'SearchResultMessage', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['SearchResultMessage'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    latest_reactions: { type: 'ReactionResponse', isSingle: false },

    mentioned_users: { type: 'UserResponse', isSingle: false },

    own_reactions: { type: 'ReactionResponse', isSingle: false },

    user: { type: 'UserResponse', isSingle: true },

    deleted_at: { type: 'DatetimeType', isSingle: true },

    message_text_updated_at: { type: 'DatetimeType', isSingle: true },

    pin_expires: { type: 'DatetimeType', isSingle: true },

    pinned_at: { type: 'DatetimeType', isSingle: true },

    mentioned_groups: { type: 'UserGroupResponse', isSingle: false },

    thread_participants: { type: 'UserResponse', isSingle: false },

    channel: { type: 'ChannelResponse', isSingle: true },

    draft: { type: 'DraftResponse', isSingle: true },

    member: { type: 'ChannelMemberResponse', isSingle: true },

    pinned_by: { type: 'UserResponse', isSingle: true },

    poll: { type: 'PollResponseData', isSingle: true },

    quoted_message: { type: 'MessageResponse', isSingle: true },

    reaction_groups: { type: 'ReactionGroupResponse', isSingle: false },

    reminder: { type: 'ReminderResponseData', isSingle: true },

    shared_location: { type: 'SharedLocationResponseData', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['SearchRolesResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    roles: { type: 'Role', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['SearchUserGroupsResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    user_groups: { type: 'UserGroupResponse', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['SendMessageResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    message: { type: 'MessageResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['SendReactionResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    message: { type: 'MessageResponse', isSingle: true },

    reaction: { type: 'ReactionResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['SharedLocationResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    end_at: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    message: { type: 'MessageResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['SharedLocationResponseData'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    end_at: { type: 'DatetimeType', isSingle: true },

    channel: { type: 'ChannelResponse', isSingle: true },

    message: { type: 'MessageResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['SharedLocationsResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    active_live_locations: { type: 'SharedLocationResponseData', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['SubmitActionResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    appeal_item: { type: 'AppealItemResponse', isSingle: true },

    item: { type: 'ReviewQueueItemResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ThreadParticipant'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    last_read_at: { type: 'DatetimeType', isSingle: true },

    last_thread_message_at: { type: 'DatetimeType', isSingle: true },

    left_thread_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ThreadResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    deleted_at: { type: 'DatetimeType', isSingle: true },

    last_message_at: { type: 'DatetimeType', isSingle: true },

    thread_participants: { type: 'ThreadParticipant', isSingle: false },

    channel: { type: 'ChannelResponse', isSingle: true },

    created_by: { type: 'UserResponse', isSingle: true },

    parent_message: { type: 'MessageResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ThreadStateResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    latest_replies: { type: 'MessageResponse', isSingle: false },

    deleted_at: { type: 'DatetimeType', isSingle: true },

    last_message_at: { type: 'DatetimeType', isSingle: true },

    read: { type: 'ReadStateResponse', isSingle: false },

    thread_participants: { type: 'ThreadParticipant', isSingle: false },

    channel: { type: 'ChannelResponse', isSingle: true },

    created_by: { type: 'UserResponse', isSingle: true },

    draft: { type: 'DraftResponse', isSingle: true },

    parent_message: { type: 'MessageResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['ThreadUpdatedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    thread: { type: 'ThreadResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['TruncateChannelResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    channel: { type: 'ChannelResponse', isSingle: true },

    message: { type: 'MessageResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['TypingStartEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['TypingStopEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UnreadCountsChannel'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    last_read: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UnreadCountsThread'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    last_read: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UpdateBlockListResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    blocklist: { type: 'BlockListResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UpdateChannelPartialResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    members: { type: 'ChannelMemberResponse', isSingle: false },

    channel: { type: 'ChannelResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UpdateChannelResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    members: { type: 'ChannelMemberResponse', isSingle: false },

    channel: { type: 'ChannelResponse', isSingle: true },

    message: { type: 'MessageResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UpdateMemberPartialResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    channel_member: { type: 'ChannelMemberResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UpdateMessagePartialResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    message: { type: 'MessageResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UpdateMessageResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    message: { type: 'MessageResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UpdateReminderResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    reminder: { type: 'ReminderResponseData', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UpdateThreadPartialResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    thread: { type: 'ThreadResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UpdateUserGroupResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    user_group: { type: 'UserGroupResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UpdateUsersResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    users: { type: 'FullUserResponse', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['UpsertConfigResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    config: { type: 'ConfigResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UpsertPushPreferencesResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    user_preferences: { type: 'PushPreferencesResponse', isSingle: false },
  };
  return decode(typeMappings, input);
};

decoders['UserBannedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },

    expiration: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    created_by: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UserDeactivatedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    created_by: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UserDeletedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UserGroupCreatedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UserGroupDeletedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UserGroupMemberAddedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UserGroupMemberRemovedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UserGroupResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UserGroupUpdatedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UserMessagesDeletedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UserMuteResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    expires: { type: 'DatetimeType', isSingle: true },

    target: { type: 'UserResponse', isSingle: true },

    user: { type: 'UserResponse', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UserMutedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    target_users: { type: 'UserResponseCommonFields', isSingle: false },

    target_user: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UserPresenceChangedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UserReactivatedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    created_by: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UserResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    deactivated_at: { type: 'DatetimeType', isSingle: true },

    deleted_at: { type: 'DatetimeType', isSingle: true },

    last_active: { type: 'DatetimeType', isSingle: true },

    revoke_tokens_issued_before: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UserResponseCommonFields'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    updated_at: { type: 'DatetimeType', isSingle: true },

    deactivated_at: { type: 'DatetimeType', isSingle: true },

    deleted_at: { type: 'DatetimeType', isSingle: true },

    last_active: { type: 'DatetimeType', isSingle: true },

    revoke_tokens_issued_before: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UserUnbannedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },

    created_by: { type: 'UserResponseCommonFields', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UserUpdatedEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UserWatchingStartEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['UserWatchingStopEvent'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    created_at: { type: 'DatetimeType', isSingle: true },

    user: { type: 'UserResponseCommonFields', isSingle: true },

    received_at: { type: 'DatetimeType', isSingle: true },
  };
  return decode(typeMappings, input);
};

decoders['WrappedUnreadCountsResponse'] = (input?: { [key: string]: any }) => {
  const typeMappings: TypeMapping = {
    channels: { type: 'UnreadCountsChannel', isSingle: false },

    threads: { type: 'UnreadCountsThread', isSingle: false },
  };
  return decode(typeMappings, input);
};
