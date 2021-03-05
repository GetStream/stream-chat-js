import { ChannelState, StreamChat, Channel } from '../../../src';
import { v4 as uuidv4 } from 'uuid';

export const getClientWithUser = async (user) => {
	const chatClient = new StreamChat('', '');

	const clientUser = user || { id: uuidv4() };
	chatClient.connectUser = () => {
		chatClient.user = clientUser;
		chatClient.userID = clientUser.id;
		chatClient.wsPromise = Promise.resolve();

		// sending a promise, since connectUser in actual SDK is an async function.
		return Promise.resolve(chatClient);
	};

	await chatClient.connectUser();

	return chatClient;
};
