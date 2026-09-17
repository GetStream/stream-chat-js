import { StreamChat } from '../../../src';
import { generateUUIDv4 as uuidv4 } from '../../../src/utils';

export const getClientWithUser = (user) => {
	const chatClient = new StreamChat('');
	chatClient.tokenManager.getToken = () => 'mock-token';
	const clientUser = user || { id: uuidv4() };

	chatClient.connectUser = () => {
		chatClient.user = clientUser;

		chatClient.wsPromise = Promise.resolve();

		// Mark the socket up and publish a connection id, because in the real SDK "connected" means
		// both. It is load-bearing: `ApiClient` holds any request that watches or subscribes to
		// presence until an id exists, so without this every one of them would wait forever.
		//
		// A test that wants the socket *down* should say so explicitly with
		// `client.wsConnection._setStatus({ isHealthy: false })`, and one that wants no connection id
		// with `client.connectionIdManager.reset()`.
		chatClient.wsConnection._setStatus({ isHealthy: true });
		chatClient.connectionIdManager.resolveConnectionId('test-connection-id');

		// sending a promise, since connectUser in actual SDK is an async function.
		return chatClient;
	};

	chatClient.connectUser();

	return chatClient;
};
