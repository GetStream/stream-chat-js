import { StreamChat } from '../../../src';
import { generateUUIDv4 as uuidv4 } from '../../../src/utils';

export const getClientWithUser = (user) => {
	const chatClient = new StreamChat('');

	const clientUser = user || { id: uuidv4() };

	chatClient.connectUser = () => {
		chatClient.user = clientUser;
		chatClient.userID = clientUser.id;
		chatClient.wsPromise = Promise.resolve();

		// sending a promise, since connectUser in actual SDK is an async function.
		return chatClient;
	};

	chatClient.connectUser();

	return chatClient;
};
