import sinon from 'sinon';
import url from 'url';

import { StableWSConnection } from '../../src/connection';
import { StreamChat } from '../../src/client';
import { TokenManager } from '../../src/token_manager';
import { sleep } from '../../src/utils';
import { InsightMetrics } from '../../src/insights';

import { describe, expect, it } from 'vitest';

// A test-only WebSocket that immediately opens and pushes the canned
// `health.check` frame the real Stream backend sends on the first message.
// Used with `client.options.WebSocketImpl` so tests never touch the network.
const HEALTH_CHECK_PAYLOAD =
	'{"type":"health.check","connection_id":"61112366-0a15-3891-0000-000000000009","cid":"*","me":{"id":"amin","role":"user","created_at":"2021-07-27T13:18:23.293696Z","updated_at":"2021-07-27T13:20:08.047284Z","last_active":"2021-08-11T10:42:44.213510048Z","banned":false,"online":true,"invisible":false,"devices":[],"mutes":[],"channel_mutes":[],"unread_count":98,"total_unread_count":98,"unread_channels":18,"language":"","image":"https://cdn.fakercloud.com/avatars/Shriiiiimp_128.jpg","name":"amin"},"created_at":"2021-08-11T10:42:44.222203145Z"}';

class MockWebSocket {
	static CONNECTING = 0;
	static OPEN = 1;
	static CLOSING = 2;
	static CLOSED = 3;

	CONNECTING = 0;
	OPEN = 1;
	CLOSING = 2;
	CLOSED = 3;

	onopen = null;
	onclose = null;
	onerror = null;
	onmessage = null;

	constructor(url) {
		this.url = url;
		this.readyState = MockWebSocket.CONNECTING;

		queueMicrotask(() => {
			this.readyState = MockWebSocket.OPEN;
			this.onopen?.({ type: 'open' });
			this.onmessage?.({ data: HEALTH_CHECK_PAYLOAD });
		});
	}

	send() {}

	close() {
		this.readyState = MockWebSocket.CLOSED;
		this.onclose?.({ code: 1000, reason: '', wasClean: true });
	}
}

// A test-only WebSocket that fails to connect — mirrors a real WebSocket
// against an unreachable host (fires an error, then a code 1006 close).
class FailingWebSocket {
	static CONNECTING = 0;
	static OPEN = 1;
	static CLOSING = 2;
	static CLOSED = 3;

	CONNECTING = 0;
	OPEN = 1;
	CLOSING = 2;
	CLOSED = 3;

	onopen = null;
	onclose = null;
	onerror = null;
	onmessage = null;

	constructor(url) {
		this.url = url;
		this.readyState = FailingWebSocket.CONNECTING;

		queueMicrotask(() => {
			this.readyState = FailingWebSocket.CLOSED;
			this.onerror?.({ type: 'error' });
			this.onclose?.({ code: 1006, reason: '', wasClean: false });
		});
	}

	send() {}

	close() {
		this.readyState = FailingWebSocket.CLOSED;
	}
}

describe('connection', function () {
	const wsBaseURL = 'ws://localhost:9999';
	const tokenManager = new TokenManager();
	tokenManager.token = 't.oke.n';
	const user = { name: 'amin', id: 'amin' };
	const newStreamChat = () => {
		const client = new StreamChat('key', { WebSocketImpl: MockWebSocket });
		client.wsBaseURL = wsBaseURL;
		client.tokenManager = tokenManager;
		client._user = user;
		client.options.enableInsights = true;
		client.userAgent = 'agent';
		client.clientID = 'clientID';
		client.insightMetrics = new InsightMetrics();
		client.dispatchEvent = () => null;
		client.recoverState = () => null;
		return client;
	};

	describe('Connection tokenProvider', () => {
		it('should handle token provider rejection ', async () => {
			const client = new StreamChat('apiKey', {
				allowServerSideConnect: true,
				WebSocketImpl: MockWebSocket,
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
			await c.connect();
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
			client.options.WebSocketImpl = FailingWebSocket;
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

	describe('Connection connect timeout', function () {
		const token =
			'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiYW1pbiJ9.dN0CCAW5CayCq0dsTXxLZvjxhQuZvlaeIfrJmxk9NkU';

		it('should fail with invalid URL', async function () {
			const client = new StreamChat('apiKey', {
				allowServerSideConnect: true,
				baseURL: 'http://localhost:1111', // invalid base url
				WebSocketImpl: FailingWebSocket,
			});
			client.defaultWSTimeout = 2000;

			await expect(client.connectUser({ id: 'amin' }, token)).rejects.toThrow(
				/initial WS connection could not be established/,
			);
		});

		it('should retry until connection is established', async function () {
			const client = new StreamChat('apiKey', {
				allowServerSideConnect: true,
				baseURL: 'http://localhost:1111',
				WebSocketImpl: FailingWebSocket,
			});
			client.defaultWSTimeout = 5000;

			await Promise.all([
				client.connectUser({ id: 'amin' }, token).then((health) => {
					expect(health.type).to.be.equal('health.check');
				}),
				sleep(1000).then(() => {
					// swap in the healthy mock so the retrying connect will succeed
					client.options.WebSocketImpl = MockWebSocket;
					client.setBaseURL(wsBaseURL);
					client.wsConnection.wsBaseURL = client.wsBaseURL;
				}),
			]);
		});
	});
});
