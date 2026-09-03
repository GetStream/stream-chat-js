import { generateUUIDv4 as uuidv4 } from '../../../src/utils';
import type { MessageResponse, UserResponse } from '../../../src';
import { convertDateToTimestamp } from './time';

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
  } as MessageResponse;

  return message;
};
