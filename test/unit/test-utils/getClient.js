import { StreamChat } from '../../../src';
import { generateUUIDv4 as uuidv4 } from '../../../src/utils';

export const getClientWithUser = (user) => {
	const chatClient = new StreamChat('');
	chatClient.tokenManager.getToken = () => 'mock-token';
	const clientUser = user || { id: uuidv4() };

	chatClient.connectUser = () => {
		chatClient.user = clientUser;

		chatClient.wsPromise = Promise.resolve();

		// Mark the socket up as well as the user connected. This helper exists to produce a connected
		// client without touching the network, and in the real SDK "connected" means there is a live
		// socket with a connection id — so leaving the WS status down was an incomplete fiction. It
		// became load-bearing once `channel.watch()` and `client.queryChannels()` started waiting for
		// a live socket instead of degrading to `watch: false`: without this every one of them would
		// wait out its timeout.
		//
		// A test that wants the socket *down* should say so explicitly with
		// `client.wsConnection._setStatus({ isOnline: false })`.
		chatClient.wsConnection._setStatus({
			isOnline: true,
			connectionId: 'test-connection-id',
		});

		// sending a promise, since connectUser in actual SDK is an async function.
		return chatClient;
	};

	chatClient.connectUser();

	return chatClient;
};
