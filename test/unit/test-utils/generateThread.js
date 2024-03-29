import { v4 as uuidv4 } from 'uuid';
import { generateUser } from './generateUser';

export const generateThread = (channel, parent, opts = {}) => {
	return {
		parent_message_id: parent.id,
		parent_message: parent,
		channel,
		title: 'title',
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString(),
		channel_cid: channel.cid,
		last_message_at: new Date().toISOString(),
		deleted_at: '',
		read: [],
		reply_count: 0,
		latest_replies: [],
		thread_participants: [],
		...opts,
	};
};
