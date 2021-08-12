import chai from 'chai';
import url from 'url';
import { Server as WsServer } from 'ws';
import chaiAsPromised from 'chai-as-promised';

import { StableWSConnection } from '../../src/connection';
import { StreamChat } from '../../src/client';
import { TokenManager } from '../../src/token_manager';
import { sleep } from '../../src/utils';

chai.use(chaiAsPromised);
const expect = chai.expect;

describe('Connection _buildUrl', function () {
	const tokenManager = new TokenManager('secret');
	const user = { name: 'amin' };
	const device = { id: 'device_id', push_provider: 'firebase' };
	const ws = new StableWSConnection({
		tokenManager,
		user,
		device,
		wsBaseURL: 'https://url.com',
		clientID: 'clientID',
		userID: 'userID',
		authType: 'jwt',
		userAgent: 'agent',
		apiKey: 'key',
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

describe('Connection connect timeout', function () {
	// dummy server to use instead of actual Stream API
	const wss = new WsServer({ port: 9999 });
	wss.on('connection', (ws) =>
		ws.send(
			'{"type":"health.check","connection_id":"61112366-0a15-3891-0000-000000000009","cid":"*","me":{"id":"amin","role":"user","created_at":"2021-07-27T13:18:23.293696Z","updated_at":"2021-07-27T13:20:08.047284Z","last_active":"2021-08-11T10:42:44.213510048Z","banned":false,"online":true,"invisible":false,"devices":[],"mutes":[],"channel_mutes":[],"unread_count":98,"total_unread_count":98,"unread_channels":18,"language":"","image":"https://cdn.fakercloud.com/avatars/Shriiiiimp_128.jpg","name":"amin"},"created_at":"2021-08-11T10:42:44.222203145Z"}',
		),
	);

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
				client.setBaseURL('http://localhost:9999');
				client.wsConnection.wsBaseURL = client.wsBaseURL;
			}),
		]);
	});
});
