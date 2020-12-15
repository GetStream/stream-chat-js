import { StreamChat } from '../../src';
import chai from 'chai';
import http from 'http';
const expect = chai.expect;
require('dotenv').config();
const apiKey = process.env.STREAM_API_KEY;
const apiSecret = process.env.STREAM_API_SECRET;

export function getTestClient(serverSide) {
	return new StreamChat(apiKey, serverSide ? apiSecret : null, { timeout: 15000 });
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
	client.health = await client.setUser(
		{ id: userID, status, ...options },
		createUserToken(userID),
	);
	return client;
}

export function getTestClientWithWarmUp() {
	return new StreamChat(apiKey, { warmUp: true });
}

export function createUserToken(userID, exp) {
	const c = new StreamChat(apiKey, apiSecret);
	return c.createToken(userID, exp);
}

export function sleep(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

export async function expectHTTPErrorCode(code, request, expectedMessage) {
	let response;
	try {
		response = await request;
	} catch (e) {
		// check http status code
		let actualCode = e.status;
		const actualMessage = e.message;

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
			if (expectedMessage) {
				expect(actualMessage).to.be.equal(expectedMessage);
			}
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
		.catch((err) => {
			console.warn('runAndLogPromise failed with error', err);
		});
}

export async function createUsers(userIDs) {
	const serverClient = getServerTestClient();
	const users = [];
	for (const userID of userIDs) {
		users.push({ id: userID });
	}
	return await serverClient.upsertUsers(users);
}

export function createEventWaiter(clientOrChannel, eventTypes) {
	const capturedEvents = [];

	if (typeof eventTypes === 'string' || eventTypes instanceof String) {
		eventTypes = [eventTypes];
	}

	return new Promise((resolve) => {
		const handler = (event) => {
			console.log(event.type);
			const i = eventTypes.indexOf(event.type);
			if (i !== -1) {
				eventTypes.splice(i, 1);
				capturedEvents.push(event);
			}
			if (eventTypes.length === 0) {
				clientOrChannel.off(handler);
				resolve(capturedEvents);
			}
		};
		clientOrChannel.on(handler);
	});
}

export async function setupWebhook(client, appWebhookOptionName, onRequest) {
	const localHost = process.env.STREAM_LOCAL_TEST_HOST ? '0.0.0.0' : '127.0.0.1';
	const hookHost = process.env.STREAM_LOCAL_TEST_HOST ? 'chat-qa' : '127.0.0.1';

	const webhook = {
		requested: false,
		fail: false,
		request: {},
		response: null,
		reset() {
			this.requested = false;
			this.message = null;
			this.fail = false;
			this.response = null;
		},
		async tearDown() {
			await Promise.all([
				client.updateAppSettings({
					[appWebhookOptionName]: '',
				}),
				server.close(),
			]);
		},
		async onRequest(request, body, res) {
			if (onRequest !== undefined) {
				onRequest(request, body, res);
				return;
			}
			this.requested = true;
			this.request = JSON.parse(body);
			if (this.fail) {
				res.writeHead(500);
				res.end();
				return;
			}
			let response;
			if (this.response != null) {
				response = await this.response(this.request);
			} else {
				response = this.request;
			}
			res.writeHead(200, { 'Content-Type': 'application/json' });
			res.end(JSON.stringify(response));
		},
	};
	const port = Math.floor(Math.random() * 1000) + 60000;
	const server = http.createServer(function (req, res) {
		let body = '';

		req.on('data', (chunk) => {
			body += chunk.toString(); // convert Buffer to string
		});

		req.on('end', () => {
			webhook.onRequest(req, body, res);
		});
	});

	await Promise.all([
		client.updateAppSettings({
			[appWebhookOptionName]: `http://${hookHost}:${port}`,
		}),
		server.listen(port, localHost),
	]);
	
	return webhook;
}
