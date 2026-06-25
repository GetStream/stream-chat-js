import { generateUUIDv4 as uuidv4 } from '../../../src/utils';
import type { MessageResponse, UserResponse } from '../../../src';

export const generateMsg = (
  msg: Partial<MessageResponse> & { date?: Date } = {},
): MessageResponse => {
  const date = msg?.date ?? new Date();
  return {
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
  };
};
