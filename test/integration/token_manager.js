/* eslint no-unused-vars: "off" */

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import chaiLike from 'chai-like';

import assertArrays from 'chai-arrays';

import { v4 as uuidv4 } from 'uuid';
import { TokenManager } from '../../src/token_manager';
import sinon from 'sinon';

const expect = chai.expect;
chai.use(assertArrays);
chai.use(chaiAsPromised);
chai.use(chaiLike);

describe('token_manager', function () {
	it('allows empty token for server side client', () => {
		const tm = new TokenManager(uuidv4());
		tm.getToken();
	});

	it('allows empty token for anonymous user', async () => {
		const tm = new TokenManager();

		await tm.setTokenOrProvider(null, { id: 'vishal', anon: true });
		tm.getToken();
	});

	it('fails for empty token for non-server side client', async () => {
		const tm = new TokenManager();
		try {
			await tm.setTokenOrProvider(null, { id: 'vishal' });
		} catch (e) {
			// nothing
			return;
		}

		throw Error('setTokenOrProvider should have failed');
	});

	it('fails for non-string and non-function token', async () => {
		const tm = new TokenManager();
		try {
			await tm.setTokenOrProvider(true, { id: 'vishal' });
		} catch (e) {
			// nothing
			return;
		}

		throw Error('setTokenOrProvider should have failed');
	});

	it('should call `tokenProvider` upon `loadToken`', async () => {
		const tm = new TokenManager();
		const tokenPrvider = sinon.fake();
		await tm.setTokenOrProvider(tokenPrvider, { id: 'vishal' });

		tm.loadToken();
		expect(tokenPrvider.called).to.equal(true);
	});

	it('`tokenReady()` should resolve when `loadToken()` is finished', async () => {
		const tm = new TokenManager();
		let didLoadTokenResolve;
		const tokenPrvider = () =>
			new Promise((resolve) => {
				setTimeout(() => {
					didLoadTokenResolve = true;
					resolve('demo_token');
				}, 300);
			});

		await tm.setTokenOrProvider(tokenPrvider, { id: 'vishal' });

		didLoadTokenResolve = false;
		tm.loadToken();
		expect(didLoadTokenResolve).to.equal(false);
		await tm.tokenReady();
		expect(didLoadTokenResolve).to.equal(true);
	});
});
