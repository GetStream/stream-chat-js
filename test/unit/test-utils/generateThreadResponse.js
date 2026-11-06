import { convertDateToTimestamp } from './time';

export const generateThreadResponse = (channel, parent, opts = {}) => {
	return {
		parent_message_id: parent.id,
		parent_message: parent,
		channel,
		title: 'title',
		created_at: convertDateToTimestamp(),
		updated_at: convertDateToTimestamp(),
		channel_cid: channel.cid,
		last_message_at: convertDateToTimestamp(),
		deleted_at: undefined,
		read: [],
		reply_count: 0,
		latest_replies: [],
		thread_participants: [],
		created_by_user_id: '',
		...opts,
	};
};
