export const DEFAULT_QUERY_CHANNELS_MESSAGE_LIST_PAGE_SIZE = 25;
export const DEFAULT_QUERY_CHANNEL_MESSAGE_LIST_PAGE_SIZE = 100;
export const DEFAULT_MESSAGE_SET_PAGINATION = { hasNext: false, hasPrev: false };
export const DEFAULT_UPLOAD_SIZE_LIMIT_BYTES = 100 * 1024 * 1024; // 100 MB
export const API_MAX_FILES_ALLOWED_PER_MESSAGE = 10;
export const MAX_CHANNEL_MEMBER_COUNT_IN_CHANNEL_QUERY = 100;
export const RESERVED_UPDATED_MESSAGE_FIELDS = {
  // Dates should not be converted back to ISO strings as JS looses precision on them (milliseconds)
  created_at: true,
  deleted_at: true,
  pinned_at: true,
  updated_at: true,
  command: true,
  // Back-end enriches these fields
  mentioned_users: true,
  quoted_message: true,
  // Client-specific fields
  latest_reactions: true,
  own_reactions: true,
  reaction_counts: true,
  reply_count: true,
  // Message text related fields that shouldn't be in update
  i18n: true,
  type: true,
  html: true,
  __html: true,
  user: true,
} as const;
export const LOCAL_MESSAGE_FIELDS = { error: true } as const;
export const DEFAULT_QUERY_CHANNELS_RETRY_COUNT = 3;
export const DEFAULT_QUERY_CHANNELS_MS_BETWEEN_RETRIES = 1000; // 1 second
