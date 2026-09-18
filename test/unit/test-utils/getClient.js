import { StreamChat } from '../../../src';
import { generateUUIDv4 as uuidv4 } from '../../../src/utils';

export const getClientWithUser = (user) => {
	const chatClient = new StreamChat('');
	chatClient.tokenManager.getToken = () => 'mock-token';
	const clientUser = user || { id: uuidv4() };

	chatClient.connectUser = () => {
		chatClient.user = clientUser;

		chatClient.wsPromise = Promise.resolve();

		// A connected user means both an id and a healthy socket, and both are load-bearing here.
		// `ApiClient` holds every request that watches or subscribes to presence until an id exists,
		// so without the first line each of those waits forever; connection recovery and the offline
		// sync manager read the socket's status, so without the second they never fire.
		//
		// In that order, matching the real handshake: the id is published before the socket announces
		// itself, so "the socket is up" implies there is an id to watch on.
		//
		// A test that wants the socket *down* says so with
		// `client.wsConnection._setStatus({ isHealthy: false })`, and one that wants no connection id
		// with `client.connectionIdManager.reset()`.
		chatClient.connectionIdManager.resolveConnectionId('mock-connection-id');
		chatClient.wsConnection._setStatus({ isHealthy: true });

		// sending a promise, since connectUser in actual SDK is an async function.
		return chatClient;
	};

	chatClient.connectUser();

	return chatClient;
};
