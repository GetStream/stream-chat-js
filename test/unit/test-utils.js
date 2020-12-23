import { v4 as uuidv4 } from 'uuid';

export const generateMsg = (msg = {}) => {
	const date = msg.date || new Date().toISOString();
	return {
		id: uuidv4(),
		text: 'x',
		html: '<p>x</p>\n',
		type: 'regular',
		user: { id: 'id' },
		attachments: [],
		latest_reactions: [],
		own_reactions: [],
		reaction_counts: null,
		reaction_scores: {},
		reply_count: 0,
		created_at: date,
		updated_at: date,
		mentioned_users: [],
		silent: false,
		status: 'received',
		__html: '<p>x</p>\n',
		...msg,
	};
};
