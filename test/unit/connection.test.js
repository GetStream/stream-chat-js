import sinon from 'sinon';
import url from 'url';

import { StableWSConnection } from '../../src/connection';
import { StreamChat } from '../../src/client';
import { TokenManager } from '../../src/token_manager';
import { sleep } from '../../src/utils';
import { InsightMetrics } from '../../src/insights';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// A test-only WebSocket that immediately opens and pushes the canned hello frame
// the real Stream backend sends on the first message. Used with
// `client.options.WebSocketImpl` so tests never touch the network.
const HEALTH_CHECK_PAYLOAD =
	'{"type":"health.check","connection_id":"61112366-0a15-3891-0000-000000000009","cid":"*","me":{"id":"amin","role":"user","created_at":"2021-07-27T13:18:23.293696Z","updated_at":"2021-07-27T13:20:08.047284Z","last_active":"2021-08-11T10:42:44.213510048Z","banned":false,"online":true,"invisible":false,"devices":[],"mutes":[],"channel_mutes":[],"unread_count":98,"total_unread_count":98,"unread_channels":18,"language":"","image":"https://cdn.fakercloud.com/avatars/Shriiiiimp_128.jpg","name":"amin"},"created_at":"2021-08-11T10:42:44.222203145Z"}';

// The `/api/v2/connect` hello frame. Unlike `health.check` it has no `cid`, and it
// carries the duplicate `chat` block alongside `me`.
const CONNECTION_OK_PAYLOAD =
	'{"type":"connection.ok","connection_id":"61112366-0a15-3891-0000-000000000009","me":{"id":"amin","role":"user","created_at":"2021-07-27T13:18:23.293696Z","updated_at":"2021-07-27T13:20:08.047284Z","last_active":"2021-08-11T10:42:44.213510048Z","banned":false,"online":true,"invisible":false,"devices":[],"mutes":[],"channel_mutes":[],"unread_count":98,"total_unread_count":98,"unread_channels":18,"language":"","image":"https://cdn.fakercloud.com/avatars/Shriiiiimp_128.jpg","name":"amin"},"chat":{"mutes":[],"channel_mutes":[],"total_unread_count":98,"unread_channels":18,"unread_threads":0,"latest_hidden_channels":null},"created_at":"2021-08-11T10:42:44.222203145Z"}';

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

	// Frames the client sent us, in order. The first is the auth message.
	sent = [];

	// Mirrors the server: it only replies once the auth frame has arrived. Override
	// per-test to assert on a different hello event.
	static helloPayload = HEALTH_CHECK_PAYLOAD;
	// Set to make send() throw, exercising the auth-frame failure path.
	static sendThrows = false;
	// Every instance constructed during a test, so tests can assert one was (not) made.
	static instances = [];

	static reset() {
		MockWebSocket.helloPayload = HEALTH_CHECK_PAYLOAD;
		MockWebSocket.sendThrows = false;
		MockWebSocket.instances = [];
	}

	constructor(url) {
		this.url = url;
		this.readyState = MockWebSocket.CONNECTING;
		MockWebSocket.instances.push(this);

		queueMicrotask(() => {
			this.readyState = MockWebSocket.OPEN;
			this.onopen?.({ type: 'open' });
		});
	}

	send(data) {
		if (MockWebSocket.sendThrows) throw new Error('send failed');
		this.sent.push(data);
		// The server answers only after it has read the auth message.
		if (this.sent.length === 1) {
			this.onmessage?.({ data: MockWebSocket.helloPayload });
		}
	}

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
		client.clientId = 'clientID';
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
		const client = newStreamChat();
		client.wsBaseURL = 'https://stream-dummy-test.com';
		const ws = new StableWSConnection({ client });

		it('should create the correct url', function () {
			const { host, pathname, query } = url.parse(ws._buildUrl(), true);

			expect(host).to.be.eq('stream-dummy-test.com');
			expect(pathname).to.be.eq('/api/v2/connect');
			expect(query['api_key']).to.be.eq('key');
			expect(query['stream-auth-type']).to.be.eq('jwt');
			expect(query['X-Stream-Client']).to.be.eq('agent');
		});

		it('should not carry the auth payload in the query string', function () {
			// /api/v2/connect authenticates off the first WS frame, not the URL. A token
			// in the query would leak into logs and proxies for no benefit.
			const { query } = url.parse(ws._buildUrl(), true);

			expect(query.json).to.be.undefined;
			expect(query.authorization).to.be.undefined;
		});

		it('should use stream-auth-type=anonymous for anonymous users', function () {
			const anonClient = newStreamChat();
			anonClient.wsBaseURL = 'https://stream-dummy-test.com';
			// getAuthType() reads client.anonymous, which is backed by tokenManager.isAnonymous
			const anonUser = { id: 'anon-id', anon: true };
			anonClient.tokenManager = new TokenManager();
			anonClient.tokenManager.setTokenOrProvider('', anonUser);
			anonClient.user = anonUser;
			anonClient._user = anonUser;
			const { query } = url.parse(
				new StableWSConnection({ client: anonClient })._buildUrl(),
				true,
			);

			expect(query['stream-auth-type']).to.be.eq('anonymous');
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

	describe('Connection auth frame', () => {
		beforeEach(() => MockWebSocket.reset());
		afterEach(() => MockWebSocket.reset());

		const connectAndGetFrame = async (client) => {
			const c = new StableWSConnection({ client });
			await c.connect();
			const [socket] = MockWebSocket.instances;
			return { c, socket, frame: JSON.parse(socket.sent[0]) };
		};

		it('should send exactly one auth frame with the token, user and products', async () => {
			const { socket, frame } = await connectAndGetFrame(newStreamChat());

			expect(socket.sent).to.have.length(1);
			expect(frame.token).to.equal('t.oke.n');
			expect(frame.user_details).to.deep.equal(user);
			// Without 'chat' the server treats the connection as video-only and drops
			// every chat event and unread count.
			expect(frame.products).to.deep.equal(['chat']);
		});

		it('should not send v1-only fields', async () => {
			const { frame } = await connectAndGetFrame(newStreamChat());

			// The v2 auth message has no device / client_request_id / user_id field;
			// sending them would be silently dropped and is misleading.
			expect(frame).to.not.have.property('device');
			expect(frame).to.not.have.property('client_request_id');
			expect(frame).to.not.have.property('user_id');
		});

		it('should send a non-empty placeholder token for anonymous users', async () => {
			const client = newStreamChat();
			client.user = { id: 'anon-id', anon: true };
			client._user = { id: 'anon-id', anon: true };
			client.tokenManager = new TokenManager();
			client.tokenManager.setTokenOrProvider('', { id: 'anon-id', anon: true });

			const { frame } = await connectAndGetFrame(client);

			// The server rejects an empty token on `required` validation, but skips JWT
			// parsing for anything that is not shaped like a JWT — so a placeholder works.
			expect(frame.token).to.be.a('string').and.not.equal('');
			expect(frame.token.split('.')).to.not.have.length(3);
			// literal `!anon` would fail the server's user-id regex; the server assigns it
			expect(frame.user_details.id).to.match(/^[@\w .-]*$/);
		});

		it('should reject before opening a socket when the token is unavailable', async () => {
			const client = newStreamChat();
			client.tokenManager = new TokenManager();

			const c = new StableWSConnection({ client });
			await expect(c.connect(200)).rejects.toThrow();
			// Failing fast matters: an opened-but-unauthenticated socket would otherwise
			// sit there until the server's 10s auth deadline killed it.
			expect(MockWebSocket.instances).to.have.length(0);
		});

		it('should not send the auth frame for a superseded socket', async () => {
			const c = new StableWSConnection({ client: newStreamChat() });
			const socket = {
				readyState: MockWebSocket.OPEN,
				OPEN: MockWebSocket.OPEN,
				sent: [],
				send(d) {
					this.sent.push(d);
				},
			};
			c.ws = socket;
			const staleWsID = c.wsID;
			c.wsID += 1;

			c.onopen(staleWsID, '{"token":"t.oke.n"}');

			expect(socket.sent).to.have.length(0);
		});

		it('should not send the auth frame when the socket is already gone', async () => {
			const c = new StableWSConnection({ client: newStreamChat() });
			c.ws = undefined;

			expect(() => c.onopen(c.wsID, '{"token":"t.oke.n"}')).to.not.throw();
		});

		it('should reject the connection when the auth frame cannot be sent', async () => {
			MockWebSocket.sendThrows = true;
			const c = new StableWSConnection({ client: newStreamChat() });

			await expect(c.connect(200)).rejects.toThrow();
		});
	});

	describe('connection.ok hello event', () => {
		beforeEach(() => {
			MockWebSocket.reset();
			MockWebSocket.helloPayload = CONNECTION_OK_PAYLOAD;
		});
		afterEach(() => MockWebSocket.reset());

		it('should resolve the connection and set the connection id', async () => {
			const c = new StableWSConnection({ client: newStreamChat() });
			const health = await c.connect();

			expect(health.type).to.equal('connection.ok');
			expect(health.connection_id).to.equal('61112366-0a15-3891-0000-000000000009');
			expect(c.connectionID).to.equal('61112366-0a15-3891-0000-000000000009');
			expect(c.isHealthy).to.be.true;
		});

		it('should decode dates on the event', async () => {
			const c = new StableWSConnection({ client: newStreamChat() });
			const health = await c.connect();

			// connection.ok is absent from the generated decoders, so without the shim in
			// connection.ts these would still be strings.
			expect(health.created_at).to.be.instanceOf(Date);
			expect(health.me.created_at).to.be.instanceOf(Date);
		});

		it('should schedule the next ping', async () => {
			const c = new StableWSConnection({ client: newStreamChat() });
			const spy = sinon.spy(c, 'scheduleNextPing');
			await c.connect();

			// The server only echoes health checks in reply to an inbound frame. Failing
			// to ping here means the 35s connection check tears the socket down, in a loop.
			expect(spy.called).to.be.true;
		});

		it('should reject when the first frame is connection.error', async () => {
			MockWebSocket.helloPayload =
				'{"type":"connection.error","error":{"code":42,"message":"nope","StatusCode":401}}';
			const c = new StableWSConnection({ client: newStreamChat() });

			await expect(c.connect(200)).rejects.toThrow();
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
