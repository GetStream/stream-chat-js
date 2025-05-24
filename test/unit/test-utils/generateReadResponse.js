import { generateUser } from './generateUser';

export const generateReadResponse = (options = {}) => {
	const userResponse = options.user ?? generateUser();
	return {
		last_read: new Date().toISOString(),
		user: userResponse,
		last_read_message_id: '123321',
		unread_messages: 0,
		...options,
	};
};
