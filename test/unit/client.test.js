import sinon from 'sinon';
import { generateMsg } from './test-utils/generateMessage';
import { getClientWithUser } from './test-utils/getClient';

import * as utils from '../../src/utils';
import { StreamChat } from '../../src/client';
import { ConnectionState } from '../../src/connection_fallback';
import { StableWSConnection } from '../../src/connection';
import { mockChannelQueryResponse } from './test-utils/mockChannelQueryResponse';
import { DEFAULT_QUERY_CHANNEL_MESSAGE_LIST_PAGE_SIZE } from '../../src/constants';

import {
	describe,
	beforeEach,
	it,
	expect,
	beforeAll,
	afterEach,
	afterAll,
	vi,
} from 'vitest';
import { Channel } from '../../src';
import { normalizeQuerySort } from '../../src/utils';
import { MockOfflineDB } from './offline-support/MockOfflineDB';

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

		await expect(client2.connectUser({ id: 'Amin' }, 'token')).rejects.toThrow(
			/connectUser was called twice/,
		);
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

	it('should set axios request config correctly', async () => {
		const client = StreamChat.getInstance('key', 'secret', {
			axiosRequestConfig: {
				headers: {
					'Cache-Control': 'no-cache',
					Pragma: 'no-cache',
				},
			},
		});

		let requestConfig = {};
		client.axiosInstance.get = (url, config) => {
			requestConfig = config;
			return {
				status: 200,
			};
		};

		await client.getChannelType('messaging');

		expect(requestConfig.headers).to.haveOwnProperty('Cache-Control', 'no-cache');
		expect(requestConfig.headers).to.haveOwnProperty('Pragma', 'no-cache');
	});

	it('app settings do not mutate', async () => {
		const client = new StreamChat('key', 'secret');
		const cert = Buffer.from('test');
		const options = { apn_config: { p12_cert: cert } };
		await expect(client.updateAppSettings(options)).rejects.toThrow(/.*/);

		expect(options.apn_config.p12_cert).to.be.eql(cert);
	});

	it('should correctly resolve _cacheEnabled', async () => {
		const client1 = new StreamChat('key', 'secret', {
			disableCache: true,
		});
		expect(client1._cacheEnabled()).to.be.equal(false);
		const client2 = new StreamChat('key', 'secret', {
			disableCache: false,
		});
		expect(client2._cacheEnabled()).to.be.equal(true);
		const client3 = new StreamChat('key', {
			disableCache: true,
		});
		expect(client3._cacheEnabled()).to.be.equal(true);
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

describe('Client active channels cache', () => {
	const client = new StreamChat('', '');
	const user = { id: 'user' };

	client.connectUser = async () => {
		client.user = user;
		client.wsPromise = Promise.resolve();
	};
	beforeEach(() => {
		client.activeChannels = {
			vish: { state: { unreadCount: 1 } },
			vish2: { state: { unreadCount: 2 } },
		};
	});

	const countUnreadChannels = (channels) =>
		Object.values(channels).reduce(
			(prevSum, currSum) => prevSum + currSum.state.unreadCount,
			0,
		);

	it('should mark all active channels as read on notification.mark_read event if event.unread_channels is 0', function () {
		client.dispatchEvent({
			type: 'notification.mark_read',
			unread_channels: 0,
		});

		expect(countUnreadChannels(client.activeChannels)).to.be.equal(0);
	});

	it('should not mark any active channel as read on notification.mark_read event if event.unread_channels > 0', function () {
		client.dispatchEvent({
			type: 'notification.mark_read',
			unread_channels: 1,
		});

		expect(countUnreadChannels(client.activeChannels)).to.be.equal(3);
	});
});

describe('Client openConnection', () => {
	let client;

	beforeEach(() => {
		const wsConnection = new StableWSConnection({});
		wsConnection.isConnecting = false;
		wsConnection.connect = function () {
			this.isConnecting = true;
			return new Promise((resolve) => {
				setTimeout(() => {
					resolve({
						connection_id: utils.generateUUIDv4(),
					});
				}, 1000);
			});
		};

		client = new StreamChat('', { allowServerSideConnect: true, wsConnection });
	});

	it('should return same promise in case of multiple calls', async () => {
		client.userID = 'vishal';
		client._setUser({
			id: 'vishal',
		});

		const promise1 = client.openConnection();
		const promise2 = client.openConnection();

		expect(await promise2).to.equal(await promise1);
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
		await expect(client.connectUser({ user: 'user' }, 'token')).rejects.toThrow(
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
		await expect(client.connectUser({ id: 'Amin' }, 'token')).rejects.toThrow(
			/connectUser was called twice/,
		);
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

describe('Client disconnectUser', () => {
	it(`it should reset token manager after WS is disconnected, but before disconnect promise is resolved`, async () => {
		const client = new StreamChat('', '');
		client.tokenManager = {
			reset: sinon.spy(),
		};
		const { resolve, promise } = Promise.withResolvers();
		client.wsConnection = { disconnect: () => promise };
		client.wsFallback = null;
		const disconnectPromise = client.disconnectUser();
		expect(client.tokenManager.reset.called).to.be.false;
		resolve();
		await disconnectPromise;
		expect(client.tokenManager.reset.called).to.be.true;
	});

	it('should reset token manager even if WS disconnect fails', async () => {
		const client = new StreamChat('', '');
		client.tokenManager = {
			reset: sinon.spy(),
		};
		client.wsConnection = { disconnect: () => Promise.reject() };
		await expect(client.disconnectUser()).rejects.toThrow();
		expect(client.tokenManager.reset.called).to.be.true;
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

describe('Client deleteUsers', () => {
	it('should allow completely optional options', async () => {
		const client = await getClientWithUser();

		client.post = () => Promise.resolve();

		await expect(client.deleteUsers(['_'])).resolves.toEqual();
	});

	it('delete types - options.conversations', async () => {
		const client = await getClientWithUser();

		client.post = () => Promise.resolve();

		await expect(client.deleteUsers(['_'], { conversations: 'hard' })).resolves.toEqual();
		await expect(client.deleteUsers(['_'], { conversations: 'soft' })).resolves.toEqual();
		await expect(
			client.deleteUsers(['_'], { conversations: 'pruning' }),
		).rejects.toThrow();
		await expect(client.deleteUsers(['_'], { conversations: '' })).rejects.toThrow();
	});

	it('delete types - options.messages', async () => {
		const client = await getClientWithUser();

		client.post = () => Promise.resolve();

		await expect(client.deleteUsers(['_'], { messages: 'hard' })).resolves.toEqual();
		await expect(client.deleteUsers(['_'], { messages: 'soft' })).resolves.toEqual();
		await expect(client.deleteUsers(['_'], { messages: 'pruning' })).resolves.toEqual();
		await expect(client.deleteUsers(['_'], { messages: '' })).rejects.toThrow();
	});

	it('delete types - options.user', async () => {
		const client = await getClientWithUser();

		client.post = () => Promise.resolve();

		await expect(client.deleteUsers(['_'], { user: 'hard' })).resolves.toEqual();
		await expect(client.deleteUsers(['_'], { user: 'soft' })).resolves.toEqual();
		await expect(client.deleteUsers(['_'], { user: 'pruning' })).resolves.toEqual();
		await expect(client.deleteUsers(['_'], { user: '' })).rejects.toThrow();
	});
});

describe('updateMessage should maintain data integrity', () => {
	let client;

	beforeEach(async () => {
		client = await getClientWithUser();
	});

	it('should convert mentioned_users from array of user objects to array of userIds', async () => {
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

	it('should remove reserved and volatile fields before running the update', async () => {
		const postSpy = sinon.stub(client, 'post');
		const updatedMessage = generateMsg({
			text: 'test message',
			pinned_at: new Date().toISOString(),
			mentioned_users: undefined,
		});

		await client.updateMessage(updatedMessage);

		const messageInQuery = {
			attachments: updatedMessage.attachments,
			mentioned_users: updatedMessage.mentioned_users,
			reaction_scores: updatedMessage.reaction_scores,
			silent: updatedMessage.silent,
			status: updatedMessage.status,
			text: updatedMessage.text,
		};

		expect(postSpy.callCount).to.equal(1);
		expect(postSpy.firstCall.args[1].message).to.toMatchObject(messageInQuery);
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
	it('sorting and offset works', async () => {
		await expect(
			client.search({ cid: 'messaging:my-cid' }, 'query', {
				offset: 1,
				sort: [{ custom_field: -1 }],
			}),
		).resolves.toEqual();
	});
	it('next and offset fails', async () => {
		await expect(
			client.search({ cid: 'messaging:my-cid' }, 'query', {
				offset: 1,
				next: 'next',
			}),
		).rejects.toThrow(Error);
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
		client.wsConnection = new StableWSConnection({});
		client.wsConnection.isHealthy = true;
		client.wsConnection.connectionID = 'ID';

		expect(() =>
			client.setLocalDevice({ id: 'id3', push_provider: 'firebase' }),
		).to.throw();
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
		const eventDate = new Date(Date.UTC(2009, 1, 3, 23, 3, 3));
		const stub = sinon
			.stub()
			.onCall(0)
			.resolves({ event: { connection_id: 'new_id', received_at: eventDate } });

		client.doAxiosRequest = stub;
		client.wsBaseURL = 'ws://getstream.io';
		const health = await client.connectUser({ id: 'amin' }, userToken);
		expect(health).to.be.eql({ connection_id: 'new_id', received_at: eventDate });
		expect(client.wsFallback.state).to.be.eql(ConnectionState.Connected);
		expect(client.wsFallback.connectionID).to.be.eql('new_id');
		expect(client.wsFallback.consecutiveFailures).to.be.eql(0);

		expect(client.wsConnection.isHealthy).to.be.false;
		expect(client.wsConnection.isDisconnected).to.be.true;
		expect(client.wsConnection.connectionID).to.be.undefined;
		expect(client.wsConnection.totalFailures).to.be.greaterThan(1);
		await client.disconnectUser();
		expect(client.wsFallback.state).to.be.eql(ConnectionState.Disconnected);
		stub.reset();
	});

	it('should fire transport.changed and health.check event', async () => {
		const eventDate = new Date(Date.UTC(2009, 1, 3, 23, 3, 3));
		sinon.spy(client, 'dispatchEvent');
		client.doAxiosRequest = () => ({
			event: { type: 'health.check', connection_id: 'new_id', received_at: eventDate },
		});
		client.wsBaseURL = 'ws://getstream.io';
		const health = await client.connectUser({ id: 'amin' }, userToken);
		await client.disconnectUser();
		expect(health).to.be.eql({
			type: 'health.check',
			connection_id: 'new_id',
			received_at: eventDate,
		});

		expect(
			client.dispatchEvent.calledWithMatch({
				type: 'transport.changed',
				mode: 'longpoll',
			}),
		).to.be.true;
		expect(
			client.dispatchEvent.calledWithMatch({
				type: 'health.check',
				connection_id: 'new_id',
				received_at: eventDate,
			}),
		).to.be.true;
	});

	it('should ignore fallback if flag is false', async () => {
		client.wsBaseURL = 'ws://getstream.io';
		client.options.enableWSFallback = false;

		await expect(client.connectUser({ id: 'amin' }, userToken)).rejects.toThrow(
			/"initial WS connection could not be established","isWSFailure":true/,
		);

		expect(client.wsFallback).to.be.undefined;
	});

	// FIXME: this test is wrong and all kinds of flaky
	it.skip('should ignore fallback if browser is offline', async () => {
		client.wsBaseURL = 'ws://getstream.io';
		client.options.enableWSFallback = true;
		sinon.stub(utils, 'isOnline').returns(false);

		await expect(client.connectUser({ id: 'amin' }, userToken)).rejects.toThrow(
			/"initial WS connection could not be established","isWSFailure":true/,
		);

		expect(client.wsFallback).to.be.undefined;
	});

	it('should reuse the fallback if already created', async () => {
		client.options.enableWSFallback = true;
		const fallback = {
			isHealthy: () => false,
			connect: sinon.stub().returns({ connection_id: 'id' }),
		};
		client.wsFallback = fallback;
		sinon.stub(utils, 'isOnline').returns(false);

		const health = await client.connectUser({ id: 'amin' }, userToken);

		expect(health).to.be.eql({ connection_id: 'id' });
		expect(client.wsFallback).to.be.equal(fallback);
	});
});

describe('StreamChat.queryChannels', async () => {
	it('should not hydrate activeChannels and channel configs when disableCache is true', async () => {
		const client = await getClientWithUser();
		client._cacheEnabled = () => false;
		const mockedChannelsQueryResponse = Array.from({ length: 10 }, () => ({
			...mockChannelQueryResponse,
			messages: Array.from(
				{ length: DEFAULT_QUERY_CHANNEL_MESSAGE_LIST_PAGE_SIZE },
				generateMsg,
			),
		}));
		const mock = sinon.mock(client);
		mock.expects('post').returns(Promise.resolve(mockedChannelsQueryResponse));
		await client.queryChannels();
		expect(Object.keys(client.activeChannels).length).to.be.equal(0);
		expect(Object.keys(client.configs).length).to.be.equal(0);
		mock.restore();
	});

	it('should return hydrated channels as Channel instances from queryChannels', async () => {
		const client = await getClientWithUser();
		const mockedChannelsQueryResponse = Array.from({ length: 10 }, () => ({
			...mockChannelQueryResponse,
			messages: Array.from(
				{ length: DEFAULT_QUERY_CHANNEL_MESSAGE_LIST_PAGE_SIZE },
				generateMsg,
			),
		}));
		const postStub = sinon
			.stub(client, 'post')
			.returns(Promise.resolve({ channels: mockedChannelsQueryResponse }));
		const queryChannelsResponse = await client.queryChannels();
		expect(queryChannelsResponse.length).to.be.equal(mockedChannelsQueryResponse.length);
		queryChannelsResponse.forEach((item) => {
			expect(item).to.be.instanceOf(Channel);
		});
		postStub.restore();
	});

	it('should return the raw channels response from queryChannelsRequest', async () => {
		const client = await getClientWithUser();
		const mockedChannelsQueryResponse = Array.from({ length: 10 }, () => ({
			...mockChannelQueryResponse,
			messages: Array.from(
				{ length: DEFAULT_QUERY_CHANNEL_MESSAGE_LIST_PAGE_SIZE },
				generateMsg,
			),
		}));
		const postStub = sinon
			.stub(client, 'post')
			.returns(Promise.resolve({ channels: mockedChannelsQueryResponse }));
		const queryChannelsResponse = await client.queryChannelsRequest();
		expect(queryChannelsResponse.length).to.be.equal(mockedChannelsQueryResponse.length);
		expect(queryChannelsResponse).to.deep.equal(mockedChannelsQueryResponse);
		postStub.restore();
	});

	it('should not update pagination for queried message set', async () => {
		const client = await getClientWithUser();
		const mockedChannelsQueryResponse = Array.from({ length: 10 }, () => ({
			...mockChannelQueryResponse,
			messages: Array.from(
				{ length: DEFAULT_QUERY_CHANNEL_MESSAGE_LIST_PAGE_SIZE },
				generateMsg,
			),
		}));
		const mock = sinon.mock(client);
		mock.expects('post').returns(Promise.resolve(mockedChannelsQueryResponse));
		await client.queryChannels();
		Object.values(client.activeChannels).forEach((channel) => {
			expect(channel.state.messageSets.length).to.be.equal(1);
			expect(channel.state.messageSets[0].pagination).to.eql({
				hasNext: true,
				hasPrev: true,
			});
		});
		mock.restore();
	});

	it('should update pagination for queried message set to prevent more pagination', async () => {
		const client = await getClientWithUser();
		const mockedChannelQueryResponse = Array.from({ length: 10 }, () => ({
			...mockChannelQueryResponse,
			messages: Array.from(
				{ length: DEFAULT_QUERY_CHANNEL_MESSAGE_LIST_PAGE_SIZE - 1 },
				generateMsg,
			),
		}));
		const mock = sinon.mock(client);
		mock.expects('post').returns(Promise.resolve(mockedChannelQueryResponse));
		await client.queryChannels();
		Object.values(client.activeChannels).forEach((channel) => {
			expect(channel.state.messageSets.length).to.be.equal(1);
			expect(channel.state.messageSets[0].pagination).to.eql({
				hasNext: true,
				hasPrev: false,
			});
		});
		mock.restore();
	});
});

describe('StreamChat.queryReactions', () => {
	let client;
	let dispatchSpy;
	let postStub;
	const messageId = 'msg-1';
	const filter = { type: { $in: ['like', 'love'] } };
	const sort = [{ created_at: -1 }];
	const options = { limit: 50 };

	const offlineReactions = [
		{ type: 'like', user_id: 'user-1', message_id: messageId },
		{ type: 'love', user_id: 'user-2', message_id: messageId },
	];

	const postResponse = {
		reactions: [
			{ type: 'like', user_id: 'user-1', message_id: messageId },
			{ type: 'love', user_id: 'user-2', message_id: messageId },
		],
	};

	beforeEach(async () => {
		client = await getClientWithUser();
		const offlineDb = new MockOfflineDB({ client });

		client.setOfflineDBApi(offlineDb);
		await client.offlineDb.init(client.userID);

		dispatchSpy = vi.spyOn(client, 'dispatchEvent');
		postStub = vi.spyOn(client, 'post').mockResolvedValueOnce(postResponse);
		client.offlineDb.getReactions.mockResolvedValue(offlineReactions);
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	it('should query reactions from offlineDb and dispatch offline_reactions.queried event', async () => {
		const result = await client.queryReactions(messageId, filter, sort, options);

		expect(client.offlineDb.getReactions).toHaveBeenCalledWith({
			messageId,
			filters: filter,
			sort,
			limit: options.limit,
		});

		expect(dispatchSpy).toHaveBeenCalledTimes(1);
		// dispatchEvent enriches the event with some extra data which
		// makes testing inconvenient.
		const dispatchSpyCallArguments = dispatchSpy.mock.calls[0];
		delete dispatchSpyCallArguments[0].received_at;
		expect(dispatchSpyCallArguments).toStrictEqual([
			{
				type: 'offline_reactions.queried',
				offlineReactions,
			},
		]);

		expect(postStub).toHaveBeenCalledTimes(1);
		expect(postStub).toHaveBeenCalledWith(
			`${client.baseURL}/messages/${encodeURIComponent(messageId)}/reactions`,
			{
				filter,
				sort: normalizeQuerySort(sort),
				limit: 50,
			},
		);

		expect(result).to.eql(postResponse);
	});

	it('should skip querying offlineDb if options.next is true', async () => {
		await client.queryReactions(messageId, filter, sort, { next: true, limit: 20 });

		expect(client.offlineDb.getReactions).not.toHaveBeenCalled();

		expect(postStub).toHaveBeenCalledWith(
			`${client.baseURL}/messages/${encodeURIComponent(messageId)}/reactions`,
			{
				filter,
				sort: normalizeQuerySort(sort),
				next: true,
				limit: 20,
			},
		);
	});

	it('should not dispatch event if offlineDb returns null', async () => {
		client.offlineDb.getReactions.mockResolvedValue(null);

		await client.queryReactions(messageId, filter, sort, options);

		expect(client.offlineDb.getReactions).toHaveBeenCalledTimes(1);
		expect(dispatchSpy).not.toHaveBeenCalled();
		expect(postStub).toHaveBeenCalledWith(
			`${client.baseURL}/messages/${encodeURIComponent(messageId)}/reactions`,
			{
				filter,
				sort: normalizeQuerySort(sort),
				limit: 50,
			},
		);
	});

	it('should log a warning if offlineDb.getReactions throws', async () => {
		client.offlineDb.getReactions.mockRejectedValue(new Error('DB error'));
		const loggerSpy = vi.fn();
		client.logger = loggerSpy;

		await client.queryReactions(messageId, filter, sort, options);

		expect(loggerSpy).toHaveBeenCalledWith(
			'warn',
			'An error has occurred while querying offline reactions',
			expect.objectContaining({
				error: expect.any(Error),
			}),
		);
		expect(dispatchSpy).not.toHaveBeenCalled();
		expect(postStub).toHaveBeenCalledWith(
			`${client.baseURL}/messages/${encodeURIComponent(messageId)}/reactions`,
			{
				filter,
				sort: normalizeQuerySort(sort),
				limit: 50,
			},
		);
	});
});

describe('message deletion', () => {
	const messageId = 'msg-123';

	let client;
	let loggerSpy;
	let queueTaskSpy;
	let clientDeleteSpy;

	beforeEach(async () => {
		client = await getClientWithUser();
		const offlineDb = new MockOfflineDB({ client });

		client.setOfflineDBApi(offlineDb);
		await client.offlineDb.init(client.userID);

		loggerSpy = vi.spyOn(client, 'logger').mockImplementation(vi.fn());
		clientDeleteSpy = vi.spyOn(client, 'delete').mockResolvedValue({});
		queueTaskSpy = vi.spyOn(client.offlineDb, 'queueTask').mockResolvedValue({});
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	describe('deleteMessage', () => {
		let _deleteMessageSpy;

		beforeEach(() => {
			_deleteMessageSpy = vi.spyOn(client, '_deleteMessage').mockResolvedValue({});
		});

		afterEach(() => {
			vi.resetAllMocks();
		});

		it('should soft delete the message and queue task if hardDelete is false', async () => {
			await client.deleteMessage(messageId, false);

			expect(client.offlineDb.softDeleteMessage).toHaveBeenCalledTimes(1);
			expect(client.offlineDb.softDeleteMessage).toHaveBeenCalledWith({ id: messageId });
			expect(client.offlineDb.hardDeleteMessage).not.toHaveBeenCalled();
			expect(queueTaskSpy).toHaveBeenCalledTimes(1);

			const taskArg = queueTaskSpy.mock.calls[0][0];
			expect(taskArg).to.deep.equal({
				task: {
					messageId,
					payload: [messageId, false],
					type: 'delete-message',
				},
			});
			expect(_deleteMessageSpy).not.toHaveBeenCalled();
		});

		it('should hard delete the message and queue task if hardDelete is true', async () => {
			await client.deleteMessage(messageId, true);

			expect(client.offlineDb.hardDeleteMessage).toHaveBeenCalledTimes(1);
			expect(client.offlineDb.hardDeleteMessage).toHaveBeenCalledWith({ id: messageId });
			expect(client.offlineDb.softDeleteMessage).not.toHaveBeenCalled();
			expect(queueTaskSpy).toHaveBeenCalledTimes(1);

			const taskArg = queueTaskSpy.mock.calls[0][0];
			expect(taskArg).to.deep.equal({
				task: {
					messageId,
					payload: [messageId, true],
					type: 'delete-message',
				},
			});
			expect(_deleteMessageSpy).not.toHaveBeenCalled();
		});

		it('should fall back to _deleteMessage if offlineDb is not set', async () => {
			client.offlineDb = undefined;

			await client.deleteMessage(messageId, true);

			expect(_deleteMessageSpy).toHaveBeenCalledTimes(1);
			expect(_deleteMessageSpy).toHaveBeenCalledWith(messageId, true);
		});

		it('should log and fall back to _deleteMessage if offline delete throws', async () => {
			client.offlineDb.softDeleteMessage.mockRejectedValue(new Error('Offline failure'));

			await client.deleteMessage(messageId, false);

			expect(loggerSpy).toHaveBeenCalledTimes(1);
			expect(queueTaskSpy).not.toHaveBeenCalled();
			expect(_deleteMessageSpy).toHaveBeenCalledTimes(1);
			expect(_deleteMessageSpy).toHaveBeenCalledWith(messageId, false);
		});
	});

	describe('_deleteMessage', () => {
		it('should call delete with correct URL and no params when hardDelete is false/undefined', async () => {
			await client._deleteMessage(messageId);

			expect(clientDeleteSpy).toHaveBeenCalledTimes(1);
			expect(clientDeleteSpy).toHaveBeenCalledWith(
				`${client.baseURL}/messages/${encodeURIComponent(messageId)}`,
				{},
			);
		});

		it('should call delete with hard=true param when hardDelete is true', async () => {
			await client._deleteMessage(messageId, true);

			expect(clientDeleteSpy).toHaveBeenCalledTimes(1);
			expect(clientDeleteSpy).toHaveBeenCalledWith(
				`${client.baseURL}/messages/${encodeURIComponent(messageId)}`,
				{ hard: true },
			);
		});

		it('should return the response from delete', async () => {
			clientDeleteSpy.mockResolvedValue({
				message: { id: messageId },
			});
			const result = await client._deleteMessage(messageId);

			expect(result).toEqual({
				message: { id: messageId },
			});
		});
	});
});

describe('user.messages.deleted', () => {
	let client;

	beforeEach(async () => {
		client = await getClientWithUser();
	});

	const bannedUser = { id: 'banned-user' };
	const otherUser = { id: 'other-user' };
	const messageSet1 = [
		{
			attachments: [
				{
					type: 'image',
					title: 'YouTube',
					title_link: 'https://www.youtube.com/',
					text: 'Enjoy the videos and music you love, upload original content, and share it all with friends, family, and the world on YouTube.',
					image_url: 'https://www.youtube.com/img/desktop/yt_1200.png',
					thumb_url: 'https://www.youtube.com/img/desktop/yt_1200.png',
					og_scrape_url: 'https://www.youtube.com/',
				},
			],
			created_at: '2021-01-01T00:01:00',
			pinned: true,
			pinned_at: '2022-01-01T00:01:00',
			user: bannedUser,
		},
		{
			created_at: '2021-01-01T00:02:00',
			pinned: true,
			pinned_at: '2022-01-01T00:02:00',
			user: otherUser,
		},
		{ created_at: '2021-01-01T00:03:00', user: bannedUser },
	].map(generateMsg);

	const quoted_message = messageSet1[0];
	const messageSet2 = [
		{
			created_at: '2020-01-01T00:01:00',
			pinned: true,
			pinned_at: '2022-01-01T00:03:00',
			user: bannedUser,
		},
		{
			created_at: '2020-01-01T00:02:00',
			quoted_message,
			quoted_message_id: quoted_message.id,
			user: otherUser,
		},
		{ created_at: '2020-01-01T00:03:00', user: bannedUser },
		{ created_at: '2020-01-01T00:04:00', user: otherUser },
	].map(generateMsg);

	const parent_id = messageSet2[0].id;
	const thread1 = [
		{ created_at: '2020-01-01T00:01:30', parent_id, user: bannedUser, type: 'reply' },
		{ created_at: '2020-01-01T00:02:35', parent_id, user: otherUser, type: 'reply' },
		{ created_at: '2020-01-01T00:03:45', parent_id, user: bannedUser, type: 'reply' },
		{ created_at: '2020-01-01T00:04:00', parent_id, user: otherUser, type: 'reply' },
	];

	const pinnedMessages = [messageSet1[0], messageSet1[1], messageSet2[0]];

	const setupChannel = (type, id) => {
		const channel = client.channel(type, id);
		channel.state.addMessagesSorted(messageSet1);
		channel.state.addMessagesSorted(messageSet2, false, false, true, 'new');

		// pinned messages
		channel.state.addPinnedMessages(pinnedMessages);

		// thread replies
		channel.state.addMessagesSorted(thread1);

		expect(channel.state.messageSets).toHaveLength(2);
		expect(channel.state.messageSets[0].messages).toHaveLength(messageSet1.length);
		expect(channel.state.messageSets[1].messages).toHaveLength(messageSet2.length);
		expect(channel.state.pinnedMessages).toHaveLength(pinnedMessages.length);
		expect(channel.state.threads[parent_id]).toHaveLength(thread1.length);

		return channel;
	};

	it('ignores channel specific event', () => {
		const channels = [setupChannel('type', 'id1'), setupChannel('type', 'id2')];
		const event = {
			type: 'user.messages.deleted',
			cid: channels[0].cid,
			channel_type: channels[0].type,
			channel_id: channels[0].id,
			user: bannedUser,
			hard_delete: true,
			created_at: '2025-02-01T14:01:30.000Z',
		};
		client._handleClientEvent(event);

		channels.forEach((channel) => {
			expect(channel.state.messageSets[0].messages).toHaveLength(messageSet1.length);
			expect(channel.state.messageSets[1].messages).toHaveLength(messageSet2.length);

			const check = (message) => {
				expect(message).toEqual(message);
			};

			channel.state.messageSets[0].messages.forEach(check);
			channel.state.messageSets[1].messages.forEach(check);
			channel.state.pinnedMessages.forEach(check);
			Object.values(channel.state.threads).forEach((replies) => replies.forEach(check));
		});
	});

	it('removes the messages on hard delete', () => {
		const channels = [setupChannel('type', 'id1'), setupChannel('type', 'id2')];

		const event = {
			type: 'user.messages.deleted',
			user: bannedUser,
			hard_delete: true,
			created_at: '2025-02-01T14:01:30.000Z',
		};
		client._handleClientEvent(event);
		channels.forEach((channel) => {
			expect(channel.state.messageSets[0].messages).toHaveLength(messageSet1.length);
			expect(channel.state.messageSets[1].messages).toHaveLength(messageSet2.length);

			const check = (message) => {
				const deletedMessage = {
					attachments: [],
					cid: message.cid,
					created_at: message.created_at,
					deleted_at: new Date(event.created_at),
					id: message.id,
					latest_reactions: [],
					mentioned_users: [],
					own_reactions: [],
					parent_id: message.parent_id,
					reply_count: message.reply_count,
					status: message.status,
					thread_participants: message.thread_participants,
					type: 'deleted',
					updated_at: message.updated_at,
					user: message.user,
				};
				if (message.user.id === bannedUser.id) {
					expect(message).toStrictEqual(deletedMessage);
				} else if (message.quoted_message) {
					expect(message).toStrictEqual({
						...message,
						quoted_message: {
							...deletedMessage,
							id: message.quoted_message.id,
							user: message.quoted_message.user,
							created_at: message.quoted_message.created_at,
							updated_at: message.quoted_message.updated_at,
						},
					});
				} else {
					expect(message).toEqual(message);
				}
			};

			channel.state.messageSets[0].messages.forEach(check);
			channel.state.messageSets[1].messages.forEach(check);
			channel.state.pinnedMessages.forEach(check);
			Object.values(channel.state.threads).forEach((replies) => replies.forEach(check));
		});
	});

	it('removes the messages on soft delete', () => {
		const channels = [setupChannel('type', 'id1'), setupChannel('type', 'id2')];

		const event = {
			type: 'user.messages.deleted',
			user: bannedUser,
			soft_delete: true,
			created_at: '2025-02-01T14:01:30.000Z',
		};
		client._handleClientEvent(event);
		channels.forEach((channel) => {
			expect(channel.state.messageSets[0].messages).toHaveLength(messageSet1.length);
			expect(channel.state.messageSets[1].messages).toHaveLength(messageSet2.length);

			const check = (message) => {
				if (message.user.id === bannedUser.id) {
					expect(message).toStrictEqual({
						...message,
						attachments: [],
						deleted_at: new Date(event.created_at),
						type: 'deleted',
					});
				} else if (message.quoted_message) {
					expect(message).toStrictEqual({
						...message,
						quoted_message: {
							...message.quoted_message,
							attachments: [],
							deleted_at: new Date(event.created_at),
							type: 'deleted',
						},
					});
				} else {
					expect(message).toEqual(message);
				}
			};

			channel.state.messageSets[0].messages.forEach(check);
			channel.state.messageSets[1].messages.forEach(check);
			channel.state.pinnedMessages.forEach(check);
			Object.values(channel.state.threads).forEach((replies) => replies.forEach(check));
		});
	});
});

describe('dispatchEvent: offlineDb.executeQuerySafely', () => {
	let client;
	let executeQuerySafelySpy;

	beforeEach(async () => {
		client = await getClientWithUser({ id: 'user-abc' });
		const offlineDb = new MockOfflineDB({ client });
		await offlineDb.init(client.userID);
		client.setOfflineDBApi(offlineDb);

		executeQuerySafelySpy = vi.spyOn(offlineDb, 'executeQuerySafely');
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('should call executeQuerySafely with correct event', () => {
		const testEvent = {
			type: 'message.new',
			cid: 'messaging:test',
		};

		vi.spyOn(client.offlineDb, 'handleEvent').mockResolvedValue({});

		client.dispatchEvent(testEvent);

		expect(executeQuerySafelySpy).toHaveBeenCalledTimes(1);
		expect(executeQuerySafelySpy).toHaveBeenCalledWith(expect.any(Function), {
			method: 'handleEvent;message.new',
		});

		// Verify the inner function calls db.handleEvent correctly
		const fn = executeQuerySafelySpy.mock.calls[0][0];
		fn(client.offlineDb);

		expect(client.offlineDb.handleEvent).toHaveBeenCalledWith({ event: testEvent });
	});

	it('should work normally if client.offlineDb is not set', () => {
		client.offlineDb = undefined;

		const event = { type: 'user.updated' };

		expect(() => client.dispatchEvent(event)).not.toThrow();
		expect(executeQuerySafelySpy).not.toHaveBeenCalled();
	});
});

describe('X-Stream-Client header', () => {
	let client;

	beforeAll(() => {
		process.env.PKG_VERSION = '1.2.3';
		process.env.CLIENT_BUNDLE = 'browser-esm';
	});

	afterAll(() => {
		// clean up
		process.env.PKG_VERSION = undefined;
		process.env.CLIENT_BUNDLE = undefined;
	});

	beforeEach(async () => {
		client = await getClientWithUser();
	});

	it('server-side integration', () => {
		const userAgent = client.getUserAgent();

		expect(userAgent).toMatchInlineSnapshot(
			`"stream-chat-js-v1.2.3-node|client_bundle=browser-esm"`,
		);
	});

	it('client-side integration', () => {
		client.node = false;
		const userAgent = client.getUserAgent();

		expect(userAgent).toMatchInlineSnapshot(
			`"stream-chat-js-v1.2.3-browser|client_bundle=browser-esm"`,
		);
	});

	it('SDK integration', () => {
		client.sdkIdentifier = { name: 'react', version: '2.3.4' };
		const userAgent = client.getUserAgent();

		expect(userAgent).toMatchInlineSnapshot(
			`"stream-chat-react-v2.3.4-llc-v1.2.3|client_bundle=browser-esm"`,
		);
	});

	it('SDK integration with deviceIdentifier', () => {
		client.sdkIdentifier = { name: 'react-native', version: '2.3.4' };
		client.deviceIdentifier = { os: 'iOS 15.0', model: 'iPhone17,4' };
		const userAgent = client.getUserAgent();

		expect(userAgent).toMatchInlineSnapshot(
			`"stream-chat-react-native-v2.3.4-llc-v1.2.3|os=iOS 15.0|device_model=iPhone17,4|client_bundle=browser-esm"`,
		);
	});

	it('setUserAgent is now deprecated', () => {
		client.setUserAgent('deprecated');
		const userAgent = client.getUserAgent();

		expect(userAgent).toMatchInlineSnapshot(`"deprecated"`);
	});

	describe('getHookEvents', () => {
		let clientGetSpy;

		beforeEach(() => {
			clientGetSpy = vi.spyOn(client, 'get').mockResolvedValue({});
		});

		it('should call get with correct URL and no params when no products specified', async () => {
			await client.getHookEvents();

			expect(clientGetSpy).toHaveBeenCalledTimes(1);
			expect(clientGetSpy).toHaveBeenCalledWith(`${client.baseURL}/hook/events`, {});
		});

		it('should call get with correct URL and empty params when empty products array specified', async () => {
			await client.getHookEvents([]);

			expect(clientGetSpy).toHaveBeenCalledTimes(1);
			expect(clientGetSpy).toHaveBeenCalledWith(`${client.baseURL}/hook/events`, {});
		});

		it('should call get with product params when products specified', async () => {
			await client.getHookEvents(['chat', 'video']);

			expect(clientGetSpy).toHaveBeenCalledTimes(1);
			expect(clientGetSpy).toHaveBeenCalledWith(`${client.baseURL}/hook/events`, {
				product: 'chat,video',
			});
		});

		it('should call get with single product param', async () => {
			await client.getHookEvents(['chat']);

			expect(clientGetSpy).toHaveBeenCalledTimes(1);
			expect(clientGetSpy).toHaveBeenCalledWith(`${client.baseURL}/hook/events`, {
				product: 'chat',
			});
		});

		it('should return the response from get', async () => {
			const mockResponse = {
				events: [
					{
						name: 'message.new',
						description: 'When a new message is added',
						products: ['chat'],
					},
					{
						name: 'call.created',
						description: 'The call was created',
						products: ['video'],
					},
				],
			};
			clientGetSpy.mockResolvedValue(mockResponse);

			const result = await client.getHookEvents(['chat', 'video']);

			expect(result).toEqual(mockResponse);
		});
	});
});

describe('markChannelsDelivered', () => {
	let client;
	const user = { id: 'user' };

	beforeEach(() => {
		client = new StreamChat('', '');

		vi.spyOn(client, 'post').mockResolvedValue({
			ok: true,
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('prevents triggering the request with empty payload', async () => {
		await client.markChannelsDelivered();
		expect(client.post).not.toHaveBeenCalled();

		await client.markChannelsDelivered({});
		expect(client.post).not.toHaveBeenCalled();

		await client.markChannelsDelivered({ latest_delivered_messages: [] });
		expect(client.post).not.toHaveBeenCalled();

		await client.markChannelsDelivered({ user, user_id: user.id });
		expect(client.post).not.toHaveBeenCalled();
	});

	it('triggers the request with at least on channel to report', async () => {
		const delivered = [{ cid: 'cid', id: 'message-id' }];
		await client.markChannelsDelivered({ latest_delivered_messages: delivered });
		expect(client.post).toHaveBeenCalledWith(
			'https://chat.stream-io-api.com/channels/delivered',
			{ latest_delivered_messages: delivered },
		);
	});
});
