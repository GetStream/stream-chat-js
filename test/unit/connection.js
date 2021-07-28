import chai from 'chai';
import url from 'url';
import { v4 as uuidv4 } from 'uuid';

import { StableWSConnection } from '../../src/connection';
import { TokenManager } from '../../src/token_manager';

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
