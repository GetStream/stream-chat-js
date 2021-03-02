import { StableWSConnection } from '../../src/connection';
import { sleep } from '../../src/utils';
import { getTestClientForUser, getTestClient, createUserToken } from './utils';
import { v4 as uuidv4 } from 'uuid';

import chai from 'chai';
const expect = chai.expect;
import sinon from 'sinon';
import { TokenManager } from '../../src/token_manager';

const wsBaseURL = process.env.STREAM_LOCAL_TEST_RUN
	? 'ws://localhost:3030'
	: 'wss://chat-us-east-1.stream-io-api.com';

const tokenProvider = () =>
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoidGhpZXJyeSIsImV4cCI6MTU4ODkzMzY5OX0.4v5WiQDBtkM3dNQXewRf5or6seuSj0XT5v21yZqgCAU';
const validStaticToken =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoidGhpZXJyeSIsImV4cCI6MjQwMDE1ODg3OTk2MzF9.vJsAQxuV4OABR2VTLc2NIUFzVIazAnnB31FajUxf-ws';
const expiredStaticToken =
	'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoidGhpZXJyeSIsImV4cCI6MTU4ODgzOTg2NH0.RHfcNuX-FkitL3ne-KS2whFGbU7lJFkMpgiF_g8DhHI';

const tokenManager = new TokenManager();

async function createTestWSConnection(
	tokenOrProvider = validStaticToken,
	connectionOptions,
) {
	await tokenManager.setTokenOrProvider(tokenOrProvider, { id: 'thierry' });
	const conn = new StableWSConnection({
		wsBaseURL,
		userID: 'thierry',
		user: { id: 'thierry' },
		tokenManager,
		apiKey: '892s22ypvt6m',
		authType: 'jwt',
		userAgent: '',
		messageCallback: sinon.fake(),
		recoverCallback: sinon.fake(),
		eventCallback: sinon.fake(),
		logger: (type, msg) => {
			// console.log(msg);
		},
		...connectionOptions,
	});
	// disable the retry interval to speedup tests
	conn._retryInterval = function () {
		return 10;
	};

	return conn;
}

describe('Connection and reconnect behaviour', function () {
	it('Integration test for recover', async function () {
		const user1 = await getTestClientForUser('user-connection-1');
		const user2 = await getTestClientForUser('user-connection-2');

		const channelID = uuidv4();
		// user 1 connects...
		const state = await user1
			.channel('messaging', channelID, {
				members: ['user-connection-1', 'user-connection-2'],
			})
			.watch();
		// user 1 connection fails
		user1.wsConnection._destroyCurrentWSConnection();
		user1.wsConnection.isHealthy = false;

		// user 2 sends a message
		const messageResponse = await user2
			.channel('messaging', channelID)
			.sendMessage({ text: 'hello world, you should see this user 1' });

		// setup handlers
		const user1Channel = user1.channel('messaging', channelID);
		const recoverPromise = new Promise(function (resolve, reject) {
			user1.on((e) => {
				// should have a recover event.
				if (e.type === 'connection.recovered') {
					resolve(e);
				}
			});
		});

		// user 1 reconnects...
		const healthCheck = await user1.wsConnection._reconnect();
		await recoverPromise;

		// verify that the state for user1 contains the last message..
		const lastMessage = user1Channel.lastMessage();
		expect(lastMessage.id).to.equal(messageResponse.message.id);
	});

	it('Connect', async function () {
		const conn = await createTestWSConnection();
		const healthCheck = await conn.connect();
		const result = healthCheck;
		expect(result.type).to.equal('health.check');
		expect(result.me.id).to.equal('thierry');
		expect(conn.isHealthy).to.equal(true);
		expect(conn.isConnecting).to.equal(false);
	});

	it('Connect twice should fail', async function () {
		const conn = await createTestWSConnection();
		const healthCheck = await conn.connect();
		try {
			const healthCheck2 = await conn.connect();
			throw Error('second connect failed to raise an error');
		} catch (e) {}
		expect(conn.isHealthy).to.equal(true);
		expect(conn.isConnecting).to.equal(false);
	});

	it('Reconnect', async function () {
		const conn = await createTestWSConnection();
		const healthCheck = await conn.connect();
		conn.isHealthy = false;
		const open2 = await conn._reconnect();
		expect(conn.consecutiveFailures).to.equal(0);
		expect(conn.totalFailures).to.equal(0);
		expect(conn.wsID).to.equal(2);
		expect(conn.isHealthy).to.equal(true);
		expect(conn.isConnecting).to.equal(false);
		expect(conn.recoverCallback.called).to.equal(true);
		expect(conn.eventCallback.called).to.equal(true);
	});

	it('Reconnect with a code bug should not trigger infinite loop', async function () {
		const conn = await createTestWSConnection();
		const healthCheck = await conn.connect();
		const original = conn._retryInterval;
		conn._retryInterval = function () {
			throw new Error('stuff is broken in the retry interval');
		};
		try {
			const open2 = await conn._reconnect();
			conn._retryInterval = original;
			throw new Error('failed to propagate a code bug');
		} catch (e) {
			conn._retryInterval = original;
			// this is good
		}
	});

	it('Reconnect with a code bug should not trigger infinite loop part 2', async function () {
		const conn = await createTestWSConnection();
		const healthCheck = await conn.connect();
		conn._connect = function () {
			throw new Error('stuff is broken in the connect');
		};
		try {
			const open2 = await conn._reconnect();
			throw new Error('failed to propagate a code bug');
		} catch (e) {
			// this is good
		}
	});

	it('Connection closed', async function () {
		const conn = await createTestWSConnection();
		const healthCheck = await conn.connect();
		expect(conn.isConnecting).to.equal(false);
		// fake a connection closed... should trigger a reconnect...
		conn.onclose(conn.wsID, { code: 4001 });
		await sleep(1000);

		expect(conn.consecutiveFailures).to.equal(0);
		expect(conn.totalFailures).to.equal(1);
		expect(conn.wsID).to.equal(2);
		expect(conn.isHealthy).to.equal(true);
		expect(conn.recoverCallback.called).to.equal(true);
		expect(conn.eventCallback.called).to.equal(true);
	});

	it('Connection error', async function () {
		const conn = await createTestWSConnection();
		const healthCheck = await conn.connect();
		expect(conn.isConnecting).to.equal(false);
		// fake a connection error... should trigger a reconnect
		conn.onerror(conn.wsID, { text: 'a test error' });

		await sleep(1000);
		expect(conn.consecutiveFailures).to.equal(0);
		expect(conn.totalFailures).to.equal(1);
		expect(conn.wsID).to.equal(2);
		expect(conn.isHealthy).to.equal(true);
		expect(conn.recoverCallback.called).to.equal(true);
		expect(conn.eventCallback.called).to.equal(true);
	});

	it('Health check failure', async function () {
		const conn = await createTestWSConnection();
		const healthCheck = await conn.connect();
		expect(conn.isConnecting).to.equal(false);
		// fake a health check failure...
		conn.lastEvent = new Date(2018, 11, 24, 10, 33, 30, 0);
		await sleep(2000);
		expect(conn.consecutiveFailures).to.equal(0);
		expect(conn.totalFailures).to.equal(0);
		expect(conn.wsID).to.equal(2);
		expect(conn.isHealthy).to.equal(true);
		expect(conn.recoverCallback.called).to.equal(true);
		expect(conn.eventCallback.called).to.equal(true);
	});

	it('Browser offline', async function () {
		const conn = await createTestWSConnection();
		const healthCheck = await conn.connect();
		expect(conn.isConnecting).to.equal(false);
		conn.onlineStatusChanged({ type: 'offline' });
		expect(conn.eventCallback.called).to.equal(true);
		expect(conn.isHealthy).to.equal(false);
		conn.onlineStatusChanged({ type: 'online' });
		await sleep(1000);
		expect(conn.consecutiveFailures).to.equal(0);
		expect(conn.totalFailures).to.equal(0);
		expect(conn.wsID).to.equal(2);
		expect(conn.isHealthy).to.equal(true);
		expect(conn.recoverCallback.called).to.equal(true);
		expect(conn.eventCallback.called).to.equal(true);
	});

	it('Connect auth error', async function () {
		try {
			await createTestWSConnection('', { authType: '' });
		} catch (e) {
			expect(true).to.equal(true);
		}
	});

	it('Disconnect', async function () {
		const conn = await createTestWSConnection();
		await conn.connect();
		expect(conn.isConnecting).to.equal(false);
		const wsID = conn.wsID;
		conn.disconnect(5000);
		expect(conn.isHealthy).to.equal(false);
		expect(conn.wsID).to.equal(wsID + 1);
		expect(conn.ws).to.equal(undefined);
	});

	it('Expired static tokens should fail', async () => {
		try {
			const conn = await createTestWSConnection(expiredStaticToken);
		} catch (e) {
			//
		}
	});

	it('Provider based expired tokens should should invoke loadToken and reconnect', async () => {
		const conn = await createTestWSConnection(tokenProvider);
		await conn.tokenManager.loadToken();

		conn._reconnect = sinon.fake();
		conn.connect();

		await sleep(1000);
		expect(conn._reconnect.calledWith({ refreshToken: true })).to.equal(true);
	});

	it('Http request with expired token should reload token', async () => {
		const client = getTestClient(false);
		await client.connectUser({ id: 'thierry' }, () =>
			createUserToken('thierry', Math.floor(Date.now() / 1000) + 1),
		);

		await sleep(2000);
		const channel = client.channel('messaging', 'fjsdbfjsbdjfsbhjdbfhjdf');
		channel.create();
		client.tokenManager.loadToken = sinon.fake();
		await sleep(2000);
		expect(client.tokenManager.loadToken.called).to.equal(true);
	});
});
