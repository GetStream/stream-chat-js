import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import sinon from 'sinon';
import { generateMsg } from './test-utils/generateMessage';
import { getClientWithUser } from './test-utils/getClient';

import * as utils from '../../src/utils';
import { StreamChat } from '../../src/client';
import { ConnectionState } from '../../src/connection_fallback';

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('StreamChat getInstance', () => {
	beforeEach(() => {
		delete StreamChat._instance;
	});

	it('instance is stored as static property', () => {
		expect(StreamChat._instance).to.be.undefined;

		const client = StreamChat.getInstance('key');
		expect(client).to.equal(StreamChat._instance);
	});

	it('always return the same instance', () => {
		const client1 = StreamChat.getInstance('key1');
		const client2 = StreamChat.getInstance('key1');
		const client3 = StreamChat.getInstance('key1');
		expect(client1).to.equal(client2);
		expect(client2).to.equal(client3);
	});

	it('changin params has no effect', () => {
		const client1 = StreamChat.getInstance('key2');
		const client2 = StreamChat.getInstance('key3');

		expect(client1).to.equal(client2);
		expect(client2.key).to.eql('key2');
	});

	it('should throw error if connectUser called twice on an instance', async () => {
		const client1 = StreamChat.getInstance('key2', { allowServerSideConnect: true });
		client1.openConnection = () => Promise.resolve();
		client1._setToken = () => Promise.resolve();

		await client1.connectUser({ id: 'vishal' }, 'token');
		const client2 = StreamChat.getInstance('key2');

		await expect(client2.connectUser({ id: 'Amin' }, 'token')).to.be.rejectedWith(/connectUser was called twice/);
	});

	it('should not throw error if connectUser called twice with the same user', async () => {
		const client1 = StreamChat.getInstance('key2', { allowServerSideConnect: true });
		client1.openConnection = () => Promise.resolve('openConnection');
		client1._setToken = () => Promise.resolve();

		await client1.connectUser({ id: 'Amin' }, 'token');
		const client2 = StreamChat.getInstance('key2');
		const connection = await client2.connectUser({ id: 'Amin' }, 'token');
		expect(connection).to.equal('openConnection');
	});

	it('should set base url correctly', async () => {
		const baseURL = 'http://example.com';
		const client = StreamChat.getInstance('key3', { baseURL });

		expect(client.baseURL).to.equal(baseURL);
	});
});

describe('Client userMuteStatus', function () {
	const client = new StreamChat('', '');
	const user = { id: 'user' };

	client.connectUser = async () => {
		client.user = user;
		client.wsPromise = Promise.resolve();
	};

	const mutes = [
		{ user, target: { id: 'mute1' } },
		{ user, target: { id: 'mute2' } },
		{ user, target: { id: 'mute3' } },
		{ user, target: { id: 'mute4' } },
	];

	it('default userMutes should be empty', function () {
		expect(client.mutedUsers).to.have.length(0);
	});

	it('should throw error if connectUser is not called', function () {
		expect(() => client.userMuteStatus('')).to.throw();
	});

	it('should not throw error if connectUser is called', async function () {
		await client.connectUser();
		expect(() => client.userMuteStatus('')).not.to.throw();
	});

	it('should return correctly when checking mute status', function () {
		client.dispatchEvent({ type: 'health.check', me: { ...user, mutes } });

		expect(client.userMuteStatus('mute1')).to.be.ok;
		expect(client.userMuteStatus('mute2')).to.be.ok;
		expect(client.userMuteStatus('mute3')).to.be.ok;
		expect(client.userMuteStatus('mute4')).to.be.ok;
		expect(client.userMuteStatus('missingUser')).not.to.be.ok;
	});

	it('should return correctly when mutes is updated', function () {
		client.dispatchEvent({
			type: 'notification.mutes_updated',
			me: {
				...user,
				mutes: [
					{ user, target: { id: 'mute1' } },
					{ user, target: { id: 'mute5' } },
				],
			},
		});

		expect(client.userMuteStatus('mute1')).to.be.ok;
		expect(client.userMuteStatus('mute5')).to.be.ok;
		expect(client.userMuteStatus('mute2')).not.to.be.ok;
		expect(client.userMuteStatus('mute3')).not.to.be.ok;
		expect(client.userMuteStatus('mute4')).not.to.be.ok;
		expect(client.userMuteStatus('missingUser')).not.to.be.ok;
	});
});

describe('Client connectUser', () => {
	let client;
	beforeEach(() => {
		client = new StreamChat('', { allowServerSideConnect: true });
		client.openConnection = () => Promise.resolve('openConnection');
		client._setToken = () => Promise.resolve('_setToken');
	});

	it('should throw err for missing user id', async () => {
		await expect(client.connectUser({ user: 'user' }, 'token')).to.be.rejectedWith(
			/The "id" field on the user is missing/,
		);
	});

	it('should return a promise when called', async () => {
		const promise = client.connectUser({ id: 'user' }, 'token');
		expect(promise).to.be.a('promise');

		const resolved = await promise;
		expect(resolved).to.equal('openConnection');
	});

	it('should throw error if connectUser called twice on the client with different user', async () => {
		await client.connectUser({ id: 'vishal' }, 'token');
		await expect(client.connectUser({ id: 'Amin' }, 'token')).to.be.rejectedWith(/connectUser was called twice/);
	});

	it('should work for multiple call for the same user', async () => {
		const promise1 = client.connectUser({ id: 'vishal' }, 'token');
		const promise2 = client.connectUser({ id: 'vishal' }, 'token');

		expect(await promise1).to.equal(await promise2);
	});

	it('should work for a second call with different user after disconnecting from first user', async () => {
		const connection1 = await client.connectUser({ id: 'vishal' }, 'token');
		expect(connection1).to.equal('openConnection');

		await client.disconnectUser();

		const connection = await client.connectUser({ id: 'amin' }, 'token');
		expect(connection).to.equal('openConnection');
	});

	it('_getConnectionID, _hasConnectionID', () => {
		expect(client._hasConnectionID()).to.be.false;
		expect(client._getConnectionID()).to.equal(undefined);
		client.wsConnection = { connectionID: 'ID' };
		expect(client._getConnectionID()).to.equal('ID');
		expect(client._hasConnectionID()).to.be.true;
	});
});

describe('Detect node environment', () => {
	const client = new StreamChat('', '');
	it('node property should be true', () => {
		expect(client.node).to.be.true;
	});

	it('should warn when using connectUser on a node environment', async () => {
		const _warn = console.warn;
		let warning = '';
		console.warn = (msg) => {
			warning = msg;
		};

		try {
			await client.connectUser({ id: 'user' }, 'fake token');
		} catch (e) {}

		await client.disconnectUser();
		expect(warning).to.equal(
			'Please do not use connectUser server side. connectUser impacts MAU and concurrent connection usage and thus your bill. If you have a valid use-case, add "allowServerSideConnect: true" to the client options to disable this warning.',
		);

		console.warn = _warn;
	});

	it('should not warn when adding the allowServerSideConnect flag', async () => {
		const client2 = new StreamChat('', '', { allowServerSideConnect: true });

		const _warn = console.warn;
		let warning = '';
		console.warn = (msg) => {
			warning = msg;
		};

		try {
			await client2.connectUser({ id: 'user' }, 'fake token');
		} catch (e) {}

		await client2.disconnect();
		expect(warning).to.equal('');

		console.warn = _warn;
	});
});

describe('updateMessage should ensure sanity of `mentioned_users`', () => {
	it('should convert mentioned_users from array of user objects to array of userIds', async () => {
		const client = await getClientWithUser();
		client.post = (url, config) => {
			expect(typeof config.message.mentioned_users[0]).to.be.equal('string');
			expect(config.message.mentioned_users[0]).to.be.equal('uthred');
		};
		await client.updateMessage(
			generateMsg({
				mentioned_users: [
					{
						id: 'uthred',
						name: 'Uthred Of Bebbanburg',
					},
				],
			}),
		);

		await client.updateMessage(
			generateMsg({
				mentioned_users: ['uthred'],
			}),
		);
	});

	it('should allow empty mentioned_users', async () => {
		const client = await getClientWithUser();
		client.post = (url, config) => {
			expect(config.message.mentioned_users[0]).to.be.equal(undefined);
		};

		await client.updateMessage(
			generateMsg({
				mentioned_users: [],
			}),
		);

		client.post = (url, config) => {
			expect(config.message.mentioned_users).to.be.equal(undefined);
		};

		await client.updateMessage(
			generateMsg({
				text: 'test message',
				mentioned_users: undefined,
			}),
		);
	});
});

describe('Client search', async () => {
	const client = await getClientWithUser();

	it('search with sorting by defined field', async () => {
		client.get = (url, config) => {
			expect(config.payload.sort).to.be.eql([{ field: 'updated_at', direction: -1 }]);
		};
		await client.search({ cid: 'messaging:my-cid' }, 'query', {
			sort: [{ updated_at: -1 }],
		});
	});
	it('search with sorting by custom field', async () => {
		client.get = (url, config) => {
			expect(config.payload.sort).to.be.eql([{ field: 'custom_field', direction: -1 }]);
		};
		await client.search({ cid: 'messaging:my-cid' }, 'query', {
			sort: [{ custom_field: -1 }],
		});
	});
	it('sorting and offset fails', async () => {
		await expect(
			client.search({ cid: 'messaging:my-cid' }, 'query', {
				offset: 1,
				sort: [{ custom_field: -1 }],
			}),
		).to.be.rejectedWith(Error);
	});
	it('next and offset fails', async () => {
		await expect(
			client.search({ cid: 'messaging:my-cid' }, 'query', {
				offset: 1,
				next: 'next',
			}),
		).to.be.rejectedWith(Error);
	});
});

describe('Client setLocalDevice', async () => {
	const device = { id: 'id1', push_provider: 'apn' };
	const client = new StreamChat('', '', { device });

	it('should update device info before ws open', async () => {
		expect(client.options.device).to.deep.equal(device);
		const newDevice = { id: 'id2', push_provider: 'firebase' };
		client.setLocalDevice(newDevice);
		expect(client.options.device).to.deep.equal(newDevice);
	});

	it('should throw error when updating device with ws open', async () => {
		client.wsConnection = true;

		expect(() => client.setLocalDevice({ id: 'id3', push_provider: 'firebase' })).to.throw();
	});
});

describe('Client WSFallback', () => {
	let client;
	const userToken =
		'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiYW1pbiJ9.1R88K_f1CC2yrR6j1_OzMEbasfS_dxRSNbundEDBlJI';
	beforeEach(() => {
		sinon.restore();
		client = new StreamChat('', { allowServerSideConnect: true, enableWSFallback: true });
		client.defaultWSTimeout = 500;
		client.defaultWSTimeoutWithFallback = 500;
	});

	it('_getConnectionID, _hasConnectionID', () => {
		expect(client._hasConnectionID()).to.be.false;
		expect(client._getConnectionID()).to.equal(undefined);
		client.wsFallback = { connectionID: 'ID' };
		expect(client._getConnectionID()).to.equal('ID');
		expect(client._hasConnectionID()).to.be.true;
	});

	it('should try wsFallback if WebSocket fails', async () => {
		const stub = sinon
			.stub()
			.onCall(0)
			.resolves({ event: { connection_id: 'new_id' } })
			.resolves({});
		client.doAxiosRequest = stub;
		client.wsBaseURL = 'ws://invalidWS.xyz';
		const health = await client.connectUser({ id: 'amin' }, userToken);
		expect(health).to.be.eql({ connection_id: 'new_id' });
		expect(client.wsFallback.state).to.be.eql(ConnectionState.Connected);
		expect(client.wsFallback.connectionID).to.be.eql('new_id');
		expect(client.wsFallback.consecutiveFailures).to.be.eql(0);

		expect(client.wsConnection.isHealthy).to.be.false;
		expect(client.wsConnection.isDisconnected).to.be.true;
		expect(client.wsConnection.connectionID).to.be.undefined;
		expect(client.wsConnection.totalFailures).to.be.greaterThan(1);
		await client.disconnectUser();
		expect(client.wsFallback.state).to.be.eql(ConnectionState.Disconnected);
	});

	it('should ignore fallback if flag is false', async () => {
		client.wsBaseURL = 'ws://invalidWS.xyz';
		client.options.enableWSFallback = false;

		await expect(client.connectUser({ id: 'amin' }, userToken)).to.be.rejectedWith(
			/"initial WS connection could not be established","isWSFailure":true/,
		);

		expect(client.wsFallback).to.be.undefined;
	});

	it('should ignore fallback if browser is offline', async () => {
		client.wsBaseURL = 'ws://invalidWS.xyz';
		client.options.enableWSFallback = true;
		sinon.stub(utils, 'isOnline').returns(false);

		await expect(client.connectUser({ id: 'amin' }, userToken)).to.be.rejectedWith(
			/"initial WS connection could not be established","isWSFailure":true/,
		);

		expect(client.wsFallback).to.be.undefined;
	});

	it('should reuse the fallback if already created', async () => {
		client.options.enableWSFallback = true;
		const fallback = { isHealthy: () => false, connect: sinon.stub().returns({ connection_id: 'id' }) };
		client.wsFallback = fallback;
		sinon.stub(utils, 'isOnline').returns(false);

		const health = await client.connectUser({ id: 'amin' }, userToken);

		expect(health).to.be.eql({ connection_id: 'id' });
		expect(client.wsFallback).to.be.equal(fallback);
	});
});
