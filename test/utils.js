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
	const health = await client.setUser(
		{ id: userID, status, ...options },
		createUserToken(userID),
	);
	client.health = health;
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

export async function expectHTTPErrorCode(code, request) {
	let response;
	try {
		response = await request;
	} catch (e) {
		// check http status code
		let actualCode = e.status;

		if (!actualCode) {
			// if no http status code get code from message message
			let message;
			try {
				message = JSON.parse(e.message);
			} catch (e) {
				// best effort json decoding
			}
			actualCode = message && message.StatusCode;
		}
		if (actualCode === code) {
			return;
		}

		// log error for easy debugging a test failure
		console.log(e);
		throw new Error(`status code is not ${code} but ${actualCode}`);
	}
	// log response for easy debugging a test failure
	console.log(response);
	throw new Error('request should have failed');
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
	for (const userID of userIDs) {
		users.push({ id: userID });
	}
	const response = await serverClient.updateUsers(users);
	return response;
}
