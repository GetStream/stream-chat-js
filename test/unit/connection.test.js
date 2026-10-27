import sinon from 'sinon';
import url from 'url';
import { Server as WsServer } from 'isomorphic-ws';

import { StableWSConnection } from '../../src/connection';
import { StreamChat } from '../../src/client';
import { TokenManager } from '../../src/token_manager';
import { sleep } from '../../src/utils';
import { InsightMetrics } from '../../src/insights';

import { describe, expect, it, afterAll } from 'vitest';

describe('connection', function () {
	const wsBaseURL = 'http://localhost:9999';
	const tokenManager = new TokenManager('secret');
	const user = { name: 'amin', id: 'amin' };
	const newStreamChat = () => {
		const client = new StreamChat('key');
		client.wsBaseURL = wsBaseURL;
		client.tokenManager = tokenManager;
		client._user = user;
		client.userID = user.id;
		client.logger = () => null;
		client.options.enableInsights = true;
		client.userAgent = 'agent';
		client.clientID = 'clientID';
		client.insightMetrics = new InsightMetrics();
		client.dispatchEvent = () => null;
		client.recoverState = () => null;
		return client;
	};

	// dummy server to use instead of actual Stream API
	const wss = new WsServer({ port: 9999 });
	wss.on('connection', (ws) =>
		ws.send(
			'{"type":"health.check","connection_id":"61112366-0a15-3891-0000-000000000009","cid":"*","me":{"id":"amin","role":"user","created_at":"2021-07-27T13:18:23.293696Z","updated_at":"2021-07-27T13:20:08.047284Z","last_active":"2021-08-11T10:42:44.213510048Z","banned":false,"online":true,"invisible":false,"devices":[],"mutes":[],"channel_mutes":[],"unread_count":98,"total_unread_count":98,"unread_channels":18,"language":"","image":"https://cdn.fakercloud.com/avatars/Shriiiiimp_128.jpg","name":"amin"},"created_at":"2021-08-11T10:42:44.222203145Z"}',
		),
	);

	afterAll(() => wss.close());

	describe('Connection tokenProvider', () => {
		it('should handle token provider rejection ', async () => {
			const client = new StreamChat('apiKey', {
				allowServerSideConnect: true,
			});
			client.defaultWSTimeout = 20;
			const tokenProvider = () => Promise.reject(new Error('network failure'));
			await expect(client.connectUser({ id: 'amin' }, tokenProvider)).rejects.toThrow(
				/tokenProvider failed/,
			);
		});
	});

	describe('Connection _buildUrl', function () {
		const device = { id: 'device_id', push_provider: 'firebase' };
		const client = newStreamChat();
		client.options.device = device;
		client.wsBaseURL = 'https://stream-dummy-test.com';
		const ws = new StableWSConnection({ client });

		it('should create the correct url', function () {
			const { host, pathname, query } = url.parse(ws._buildUrl(), true);

			expect(host).to.be.eq('stream-dummy-test.com');
			expect(pathname).to.be.eq('/connect');
			expect(query['api_key']).to.be.eq('key');
			expect(query['stream-auth-type']).to.be.eq('jwt');
			expect(query['authorization']).to.be.eq(tokenManager.token);
			expect(query['X-Stream-Client']).to.be.eq('agent');

			const data = JSON.parse(query.json);
			expect(data.user_details).to.deep.equal(user);
			expect(data.device).to.deep.equal(device);
		});

		it('should properly encode X-Stream-Client', () => {
			const userAgent = 'agent|val=foo bar';
			client.userAgent = userAgent;
			const url = ws._buildUrl();

			const searchParams = new URLSearchParams({
				'X-Stream-Client': userAgent,
			});
			expect(url).to.contain(searchParams.toString());
		});

		it('should not include device if not there', function () {
			ws.client.options.device = undefined;
			const { query } = url.parse(ws._buildUrl(), true);
			const data = JSON.parse(query.json);
			expect(data.device).to.deep.undefined;
		});

		it('should include extra params when building url if provided', function () {
			const { query: prevQuery } = url.parse(ws._buildUrl(), true);
			ws.client.options.wsUrlParams = new URLSearchParams({ foo: '1', bar: '2' });
			const { query } = url.parse(ws._buildUrl(), true);

			// all of the previous query params should remain intact
			Object.keys(prevQuery).forEach((key) => {
				expect(prevQuery[key]).to.deep.equal(query[key]);
			});
			// only the updated query should contain the new ones
			expect(query.foo).to.equal('1');
			expect(query.bar).to.equal('2');
		});
	});

	describe('isResolved flag', () => {
		it('should set isResolved', async () => {
			const c = new StableWSConnection({ client: newStreamChat() });
			expect(c.isResolved).to.be.false;
			const res = await c.connect();
			expect(c.isResolved).to.be.true;
		});

		it('onmessage should ignore calling isResolved after promise is resolved', () => {
			const c = new StableWSConnection({ client: newStreamChat() });
			expect(c.isResolved).to.be.false;
			c.rejectPromise = sinon.spy();
			c.resolvePromise = sinon.spy();

			c.onmessage(c.wsID, { data: '{}' });
			expect(c.isResolved).to.be.true;
			expect(c.resolvePromise.calledOnce).to.be.true;
			expect(c.rejectPromise.notCalled).to.be.true;

			c.onmessage(c.wsID, { data: '{}' });
			expect(c.resolvePromise.calledOnce).to.be.true;
			expect(c.rejectPromise.notCalled).to.be.true;
		});

		it('onmessage parses event.data once and dispatches the parsed payload', () => {
			const client = newStreamChat();
			client.dispatchEvent = sinon.spy();
			const c = new StableWSConnection({ client });
			c.isResolved = true;
			c.scheduleConnectionCheck = () => null;

			const payload = { type: 'message.new', cid: 'messaging:foo' };
			c.onmessage(c.wsID, { data: JSON.stringify(payload) });

			expect(client.dispatchEvent.calledOnce).to.be.true;
			expect(client.dispatchEvent.firstCall.args[0]).to.deep.equal(payload);
		});
	});

	describe('isConnecting flag', () => {
		it('connect should throw if already connecting', async () => {
			const c = new StableWSConnection({ client: newStreamChat() });
			c.isConnecting = true;
			await expect(c.connect()).rejects.toThrow(/called connect twice/);
		});

		it('_recover should not call _connect if isConnecting is set', async () => {
			const c = new StableWSConnection({ client: newStreamChat() });
			c._connect = sinon.spy();
			c.isConnecting = true;
			await c._reconnect();
			expect(c._connect.called).to.be.false;
		});

		it('onclose should update isConnecting and call _reconnect', async () => {
			const c = new StableWSConnection({ client: newStreamChat() });
			c._reconnect = sinon.spy();
			c.isConnecting = true;
			c.onclose(c.wsID, {});
			expect(c.isConnecting).to.be.false;
			expect(c._reconnect.called).to.be.true;
		});

		it('onerror should update isConnecting and call _reconnect', async () => {
			const c = new StableWSConnection({ client: newStreamChat() });
			c._reconnect = sinon.spy();
			c.isConnecting = true;
			c.onerror(c.wsID, {});
			expect(c.isConnecting).to.be.false;
			expect(c._reconnect.called).to.be.true;
		});

		it('should set and unset the flag correctly without opening WS', async () => {
			const client = newStreamChat();
			client.wsBaseURL = 'https://stream-dummy-test.com';
			const c = new StableWSConnection({ client });

			expect(c.isConnecting).to.be.false;
			const connection = c.connect(1000);
			expect(c.isConnecting).to.be.true;
			try {
				await connection;
			} catch (err) {}
			expect(c.isConnecting).to.be.false;
		});

		it('should set and unset the flag correctly with opening WS', async () => {
			const c = new StableWSConnection({ client: newStreamChat() });
			expect(c.isConnecting).to.be.false;
			let connection = c.connect();
			expect(c.isConnecting).to.be.true;
			await connection;
			expect(c.isConnecting).to.be.false;
			connection = c.connect();
			expect(c.isConnecting).to.be.true;
			await connection;
			expect(c.isConnecting).to.be.false;
		});
	});

	describe('token expired by the server after connect', () => {
		const tokenExpiredEvent = JSON.stringify({
			type: 'connection.error',
			connection_id: '61112366-0a15-3891-0000-000000000009',
			error: {
				code: 40,
				message: 'JWTAuth error: token is expired (exp)',
				StatusCode: 401,
			},
		});

		const providerTokenManager = async (tokenProvider) => {
			const tm = new TokenManager();
			await tm.setTokenOrProvider(tokenProvider, user);
			return tm;
		};

		const resolvedConnection = (client) => {
			const c = new StableWSConnection({ client });
			c.isResolved = true;
			c.scheduleConnectionCheck = () => null;
			c._reconnect = sinon.spy();
			return c;
		};

		it('refreshes the token on the following close when a tokenProvider is used', async () => {
			const client = newStreamChat();
			client.tokenManager = await providerTokenManager(() => Promise.resolve('token'));
			const c = resolvedConnection(client);

			c.onmessage(c.wsID, { data: tokenExpiredEvent });
			expect(c.tokenExpiredByServer).to.be.true;

			c.onclose(c.wsID, { code: 1008, reason: 'token expired' });
			expect(c._reconnect.calledOnce).to.be.true;
			expect(c._reconnect.firstCall.args[0]).to.deep.equal({ refreshToken: true });
		});

		it('refreshes the token when an error event comes with the close', async () => {
			const client = newStreamChat();
			client.tokenManager = await providerTokenManager(() => Promise.resolve('token'));
			const c = resolvedConnection(client);

			c.onmessage(c.wsID, { data: tokenExpiredEvent });
			c.onerror(c.wsID, {});
			c.onclose(c.wsID, { code: 1008, reason: 'token expired' });

			expect(c._reconnect.calledTwice).to.be.true;
			expect(c._reconnect.firstCall.args[0]).to.deep.equal({ refreshToken: true });
			expect(c._reconnect.secondCall.args[0]).to.deep.equal({ refreshToken: true });
		});

		it('reconnects as before with a static token', () => {
			const c = resolvedConnection(newStreamChat());
			expect(c.client.tokenManager.isStatic()).to.be.true;

			c.onmessage(c.wsID, { data: tokenExpiredEvent });
			c.onclose(c.wsID, { code: 1008, reason: 'token expired' });

			expect(c._reconnect.calledOnce).to.be.true;
			expect(c._reconnect.firstCall.args).to.have.length(0);
		});

		it('does not refresh the token on a close without the event', async () => {
			const client = newStreamChat();
			client.tokenManager = await providerTokenManager(() => Promise.resolve('token'));
			const c = resolvedConnection(client);

			c.onclose(c.wsID, { code: 1008, reason: 'policy violation' });
			c.onclose(c.wsID, { code: 1006 });

			expect(c._reconnect.calledTwice).to.be.true;
			expect(c._reconnect.firstCall.args).to.have.length(0);
			expect(c._reconnect.secondCall.args).to.have.length(0);
		});

		it('ignores a connection.error with another code', async () => {
			const client = newStreamChat();
			client.tokenManager = await providerTokenManager(() => Promise.resolve('token'));
			const c = resolvedConnection(client);

			c.onmessage(c.wsID, {
				data: JSON.stringify({
					type: 'connection.error',
					error: { code: 17, message: 'not allowed', StatusCode: 403 },
				}),
			});
			expect(c.tokenExpiredByServer).to.be.false;

			c.onclose(c.wsID, { code: 1008 });
			expect(c._reconnect.firstCall.args).to.have.length(0);
		});

		it('does not reconnect on a 1000 close', async () => {
			const client = newStreamChat();
			client.tokenManager = await providerTokenManager(() => Promise.resolve('token'));
			const c = resolvedConnection(client);
			c.rejectPromise = sinon.spy();

			c.onmessage(c.wsID, { data: tokenExpiredEvent });
			c.onclose(c.wsID, { code: 1000, reason: 'closed' });

			expect(c._reconnect.notCalled).to.be.true;
		});

		it('still dispatches the event', () => {
			const client = newStreamChat();
			client.dispatchEvent = sinon.spy();
			const c = resolvedConnection(client);

			c.onmessage(c.wsID, { data: tokenExpiredEvent });

			expect(client.dispatchEvent.calledOnce).to.be.true;
			expect(client.dispatchEvent.firstCall.args[0]).to.deep.equal(
				JSON.parse(tokenExpiredEvent),
			);
		});

		it('is cleared when a new socket is set up and on disconnect', async () => {
			const client = newStreamChat();
			client.tokenManager = await providerTokenManager(() => Promise.resolve('token'));
			const c = resolvedConnection(client);

			c.onmessage(c.wsID, { data: tokenExpiredEvent });
			c._setupConnectionPromise();
			expect(c.tokenExpiredByServer).to.be.false;

			c.isResolved = true;
			c.onmessage(c.wsID, { data: tokenExpiredEvent });
			c.disconnect();
			expect(c.tokenExpiredByServer).to.be.false;
		});

		it('lets only one of two concurrent refreshing reconnects connect and recover', async () => {
			const client = newStreamChat();
			client.tokenManager = await providerTokenManager(() =>
				sleep(10).then(() => 'token'),
			);
			client.recoverState = sinon.spy(() => Promise.resolve());
			const c = new StableWSConnection({ client });
			// Mirrors the real _connect: a second call while connecting returns early.
			c._connect = sinon.spy(async () => {
				if (c.isConnecting) return;
				c.isConnecting = true;
				await sleep(10);
				c.isConnecting = false;
				c.isHealthy = true;
			});

			await Promise.all([
				c._reconnect({ interval: 1, refreshToken: true }),
				c._reconnect({ interval: 1, refreshToken: true }),
			]);

			expect(c._connect.calledOnce).to.be.true;
			expect(client.recoverState.calledOnce).to.be.true;
		});

		it('reconnects with a new token from the tokenProvider', async () => {
			const authorizations = [];
			const server = new WsServer({ port: 9998 });
			server.on('connection', (socket, req) => {
				const { query } = url.parse(req.url, true);
				authorizations.push(query.authorization);
				socket.send(
					JSON.stringify({ type: 'health.check', connection_id: 'connection-id' }),
				);
				if (authorizations.length === 1) {
					socket.send(tokenExpiredEvent);
					socket.close(1008, 'token expired');
				}
			});

			try {
				let calls = 0;
				const client = newStreamChat();
				client.wsBaseURL = 'http://localhost:9998';
				client.tokenManager = await providerTokenManager(() =>
					Promise.resolve(`token-${++calls}`),
				);
				const c = new StableWSConnection({ client });

				await c.connect();
				for (let i = 0; i < 100 && authorizations.length < 2; i++) {
					await sleep(50);
				}
				c.disconnect();

				expect(authorizations).to.deep.equal(['token-1', 'token-2']);
			} finally {
				server.close();
			}
		});
	});

	describe('Connection connect timeout', function () {
		const token =
			'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiYW1pbiJ9.dN0CCAW5CayCq0dsTXxLZvjxhQuZvlaeIfrJmxk9NkU';

		it('should fail with invalid URL', async function () {
			const client = new StreamChat('apiKey', {
				allowServerSideConnect: true,
				baseURL: 'http://localhost:1111', // invalid base url
			});
			client.defaultWSTimeout = 2000;

			await expect(client.connectUser({ id: 'amin' }, token)).rejects.toThrow(
				/initial WS connection could not be established/,
			);
		});

		it('should retry until connection is established', async function () {
			const client = new StreamChat('apiKey', {
				allowServerSideConnect: true,
				baseURL: 'http://localhost:1111', // invalid base url
			});
			client.defaultWSTimeout = 5000;

			await Promise.all([
				client.connectUser({ id: 'amin' }, token).then((health) => {
					expect(health.type).to.be.equal('health.check');
				}),
				sleep(1000).then(() => {
					// set the correct url after connectUser failed and is trying to connect
					client.setBaseURL(wsBaseURL);
					client.wsConnection.wsBaseURL = client.wsBaseURL;
				}),
			]);
		});
	});
});
