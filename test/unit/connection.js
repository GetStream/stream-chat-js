import chai from 'chai';
import sinon from 'sinon';
import url from 'url';
import { Server as WsServer } from 'ws';
import chaiAsPromised from 'chai-as-promised';

import { StableWSConnection } from '../../src/connection';
import { StreamChat } from '../../src/client';
import { TokenManager } from '../../src/token_manager';
import { sleep } from '../../src/utils';

chai.use(chaiAsPromised);
const expect = chai.expect;

describe('connection', function () {
	const wsBaseURL = 'http://localhost:9999';
	const tokenManager = new TokenManager('secret');
	const user = { name: 'amin' };
	const wsDefaults = {
		wsBaseURL,
		tokenManager,
		user,
		logger: () => null,
		eventCallback: () => null,
		recoverCallback: () => null,
		messageCallback: () => null,
		clientID: 'clientID',
		userID: 'amin',
		authType: 'jwt',
		userAgent: 'agent',
		apiKey: 'key',
	};
	// dummy server to use instead of actual Stream API
	const wss = new WsServer({ port: 9999 });
	wss.on('connection', (ws) =>
		ws.send(
			'{"type":"health.check","connection_id":"61112366-0a15-3891-0000-000000000009","cid":"*","me":{"id":"amin","role":"user","created_at":"2021-07-27T13:18:23.293696Z","updated_at":"2021-07-27T13:20:08.047284Z","last_active":"2021-08-11T10:42:44.213510048Z","banned":false,"online":true,"invisible":false,"devices":[],"mutes":[],"channel_mutes":[],"unread_count":98,"total_unread_count":98,"unread_channels":18,"language":"","image":"https://cdn.fakercloud.com/avatars/Shriiiiimp_128.jpg","name":"amin"},"created_at":"2021-08-11T10:42:44.222203145Z"}',
		),
	);

	after(() => wss.close());

	describe('Connection _buildUrl', function () {
		const device = { id: 'device_id', push_provider: 'firebase' };
		const ws = new StableWSConnection({
			...wsDefaults,
			device,
			wsBaseURL: 'https://url.com',
		});

		it('should create the correct url', function () {
			const { host, pathname, query } = url.parse(ws._buildUrl(), true);

			expect(host).to.be.eq('url.com');
			expect(pathname).to.be.eq('/connect');
			expect(query['api_key']).to.be.eq('key');
			expect(query['stream-auth-type']).to.be.eq('jwt');
			expect(query['authorization']).to.be.eq(tokenManager.token);
			expect(query['X-Stream-Client']).to.be.eq('agent');

			const data = JSON.parse(query.json);
			expect(data.user_details).to.deep.equal(user);
			expect(data.device).to.deep.equal(device);
			expect(data.user_token).to.be.eq(tokenManager.token);
			expect(data.server_determines_connection_id).to.be.ok;
		});

		it('should not include device if not there', function () {
			ws.device = undefined;
			const { query } = url.parse(ws._buildUrl(), true);
			const data = JSON.parse(query.json);
			expect(data.device).to.deep.undefined;
		});
	});

	describe('isResolved flag', () => {
		it('should set isResolved', async () => {
			const c = new StableWSConnection(wsDefaults);
			expect(c.isResolved).to.be.false;
			const res = await c.connect();
			expect(c.isResolved).to.be.true;
		});

		it('onmessage should ignore calling isResolved after promise is resolved', () => {
			const c = new StableWSConnection(wsDefaults);
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
	});

	describe('isConnecting flag', () => {
		it('connect should throw if already connecting', async () => {
			const c = new StableWSConnection(wsDefaults);
			c.isConnecting = true;
			await expect(c.connect()).to.be.rejectedWith(/called connect twice/);
		});

		it('_recover should not call _connect if isConnecting is set', async () => {
			const c = new StableWSConnection(wsDefaults);
			c._connect = sinon.spy();
			c.isConnecting = true;
			await c._reconnect();
			expect(c._connect.called).to.be.false;
		});

		it('onclose should update isConnecting and call _reconnect', async () => {
			const c = new StableWSConnection(wsDefaults);
			c._reconnect = sinon.spy();
			c.isConnecting = true;
			c.onclose(c.wsID, {});
			expect(c.isConnecting).to.be.false;
			expect(c._reconnect.called).to.be.true;
		});

		it('onerror should update isConnecting and call _reconnect', async () => {
			const c = new StableWSConnection(wsDefaults);
			c._reconnect = sinon.spy();
			c.isConnecting = true;
			c.onerror(c.wsID, {});
			expect(c.isConnecting).to.be.false;
			expect(c._reconnect.called).to.be.true;
		});

		it('should set and unset the flag correctly without opening WS', async () => {
			const c = new StableWSConnection({
				...wsDefaults,
				wsBaseURL: 'https://url.com',
			});
			expect(c.isConnecting).to.be.false;
			const connection = c.connect();
			expect(c.isConnecting).to.be.true;
			try {
				await connection;
			} catch (err) {}
			expect(c.isConnecting).to.be.false;
		});

		it('should set and unset the flag correctly with opening WS', async () => {
			const c = new StableWSConnection(wsDefaults);
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
		const client = new StreamChat('apiKey', {
			allowServerSideConnect: true,
			baseURL: 'http://localhost:1111', // invalid base url
		});

		const token =
			'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiYW1pbiJ9.dN0CCAW5CayCq0dsTXxLZvjxhQuZvlaeIfrJmxk9NkU';

		it('should fail with invalid URL', async function () {
			await expect(client.connectUser({ id: 'amin' }, token)).to.be.rejectedWith(
				/initial WS connection could not be established/,
			);
		});

		it('should retry until connection is establsihed', async function () {
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
