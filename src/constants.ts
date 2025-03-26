import type { ReservedUpdatedMessageFields } from './types';

export const DEFAULT_QUERY_CHANNELS_MESSAGE_LIST_PAGE_SIZE = 25;
export const DEFAULT_QUERY_CHANNEL_MESSAGE_LIST_PAGE_SIZE = 100;
export const DEFAULT_MESSAGE_SET_PAGINATION = { hasNext: false, hasPrev: false };
export const DEFAULT_UPLOAD_SIZE_LIMIT_BYTES = 100 * 1024 * 1024; // 100 MB
export const API_MAX_FILES_ALLOWED_PER_MESSAGE = 10;
export const MAX_CHANNEL_MEMBER_COUNT_IN_CHANNEL_QUERY = 100;
export const RESERVED_UPDATED_MESSAGE_FIELDS: Array<ReservedUpdatedMessageFields> = [
  // Dates should not be converted back to ISO strings as JS looses precision on them (milliseconds)
  'created_at',
  'deleted_at',
  'pinned_at',
  'updated_at',
  'command',
  // Back-end enriches these fields
  'mentioned_users',
  'quoted_message',
  // Client-specific fields
  'latest_reactions',
  'own_reactions',
  'reaction_counts',
  'reply_count',
  // Message text related fields that shouldn't be in update
  'i18n',
  'type',
  'user',
  'html',
  '__html',
] as const;

export const LOCAL_MESSAGE_FIELDS = ['error'] as const;
