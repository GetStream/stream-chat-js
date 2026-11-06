import { generateUser } from './generateUser';
import { convertDateToTimestamp } from './time';

export const generateReadResponse = (options = {}) => {
	const userResponse = options.user ?? generateUser();
	return {
		last_read: convertDateToTimestamp(),
		user: userResponse,
		last_read_message_id: '123321',
		unread_messages: 0,
		...options,
	};
};
