import { StreamChat } from '../src';

const apiKey = '892s22ypvt6m';
const apiSecret = '5cssrefv55rs3cnkk38kfjam2k7c2ykwn4h79dqh66ym89gm65cxy4h9jx4cypd6';

export function getTestClient(serverSide) {
	return new StreamChat(apiKey, serverSide ? apiSecret : null);
}

export function getServerTestClient() {
	return getTestClient(true);
}

export function getTestClientForUser2(userID, status, options) {
	const client = getTestClient(false);
	client.setUser({ id: userID, status, ...options }, createUserToken(userID));
	return client;
}

export async function getTestClientForUser(userID, status, options) {
	const client = getTestClient(false);
	await client.setUser({ id: userID, status, ...options }, createUserToken(userID));
	return client;
}

export function createUserToken(userID) {
	const c = new StreamChat(apiKey, apiSecret);
	return c.createToken(userID);
}

export function sleep(ms) {
	return new Promise(resolve => {
		setTimeout(resolve, ms);
	});
}

export function assertHTTPErrorCode(r, done, code) {
	r.then(() => done('should fail')).catch(e => {
		e.status === code ? done() : done(`status code is not ${code} but ${e.status}`);
	});
}

export function runAndLogPromise(promiseCallable) {
	promiseCallable()
		.then(() => {})
		.catch(err => {
			console.warn('runAndLogPromise failed with error', err);
		});
}

export async function createUsers(userIDs) {
	const serverClient = getServerTestClient();
	const users = [];
	for (let userID of userIDs) {
		users.push({ id: userID });
	}
	const response = await serverClient.updateUsers(users);
	return response;
}
