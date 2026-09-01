import { generateUUIDv4 as uuidv4 } from '../../../src/utils';
import type { MessageResponse, UserResponse } from '../../../src';
import { convertDateToTimestamp } from './time';

/** The message fields the API sends as unix-nanosecond numbers. */
const TIMESTAMP_FIELDS = [
  'created_at',
  'updated_at',
  'deleted_at',
  'pinned_at',
  'pin_expires',
  'message_text_updated_at',
] as const;

export const generateMsg = (
  msg: Partial<MessageResponse> & { date?: Date | number | string } = {},
): MessageResponse => {
  const date = convertDateToTimestamp(msg?.date);
  const message = {
    cid: 'messaging:general',
    pinned: false,
    id: uuidv4(),
    text: uuidv4(),
    html: '<p>x</p>\n',
    type: 'regular',
    user: { id: 'id' } as UserResponse,
    attachments: [],
    latest_reactions: [],
    own_reactions: [],
    reaction_counts: {},
    reaction_scores: {},
    reply_count: 0,
    created_at: date,
    updated_at: date,
    mentioned_users: [],
    silent: false,
    status: 'received',
    ...msg,
  } as MessageResponse & Record<string, unknown>;

  // Tests read far better overriding a timestamp with a date literal, but the wire carries numbers —
  // and a fixture that hands the SDK a `Date` cannot catch the bugs that unit exists to prevent.
  // Normalize every timestamp override here, so no individual test has to.
  for (const field of TIMESTAMP_FIELDS) {
    const value = message[field];
    if (value != null && typeof value !== 'number') {
      message[field] = convertDateToTimestamp(value as Date | number | string);
    }
  }

  return message;
};
