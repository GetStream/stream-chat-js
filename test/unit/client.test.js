import sinon from 'sinon';
import { generateMsg } from './test-utils/generateMessage';
import { getClientWithUser } from './test-utils/getClient';

import * as utils from '../../src/utils';
import { StreamChat } from '../../src/client';
import { ChatApi } from '../../src/gen-imports';
import { chatLoggerSystem } from '../../src/logger';
import { StableWSConnection } from '../../src/connection';
import { mockChannelQueryResponse } from './test-utils/mockChannelQueryResponse';
import { generateThreadResponse } from './test-utils/generateThreadResponse';
import {
	DEFAULT_QUERY_CHANNEL_MESSAGE_LIST_PAGE_SIZE,
	DEFAULT_QUERY_CHANNELS_MESSAGE_LIST_PAGE_SIZE,
} from '../../src/constants';

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
		const client = StreamChat.getInstance('key', {
			axiosRequestConfig: {
				headers: {
					'Cache-Control': 'no-cache',
					Pragma: 'no-cache',
				},
			},
		});
		client.tokenManager.getToken = () => 'mock-token';

		const requestSpy = vi
			.spyOn(client.axiosInstance, 'request')
			.mockResolvedValueOnce({ data: {}, status: 200 });

		await client.getAppSettings();

		expect(requestSpy).toHaveBeenCalledTimes(1);
		expect(requestSpy.mock.calls[0][0].headers).to.haveOwnProperty(
			'Cache-Control',
			'no-cache',
		);
		expect(requestSpy.mock.calls[0][0].headers).to.haveOwnProperty('Pragma', 'no-cache');
	});

	it('should correctly resolve _cacheEnabled', async () => {
		const client1 = new StreamChat('key', { disableCache: true });
		expect(client1._cacheEnabled()).to.be.equal(false);
		const client2 = new StreamChat('key', { disableCache: false });
		expect(client2._cacheEnabled()).to.be.equal(true);
		const client3 = new StreamChat('key');
		expect(client3._cacheEnabled()).to.be.equal(true);
	});
});

describe('StreamChat config(s) store', () => {
	it('initializes channelServerConfigsStore and keeps configs access backward compatible', () => {
		const client = new StreamChat('key', 'secret');

		expect(client.channelServerConfigs).to.eql({});
		expect(client.channelServerConfigsStore.getLatestValue()).to.eql({ configs: {} });

		const nextConfigs = { 'messaging:next': { typing_events: true } };
		client.channelServerConfigs = nextConfigs;

		expect(client.channelServerConfigs).to.equal(nextConfigs);
		expect(client.channelServerConfigsStore.getLatestValue()).to.eql({
			configs: nextConfigs,
		});
	});

	it('updates channelServerConfigsStore through _addChannelConfig when cache is enabled', () => {
		const client = new StreamChat('key', 'secret');

		client._addChannelConfig({
			cid: 'messaging:general',
			config: { replies: true },
		});

		expect(client.channelServerConfigsStore.getLatestValue()).to.eql({
			configs: {
				// Keyed by cid: a channel's `config_overrides` can make it differ from its siblings.
				'messaging:general': { replies: true },
			},
		});
	});

	it('does not update channelServerConfigsStore through _addChannelConfig when cache is disabled', () => {
		const client = new StreamChat('key', 'secret');
		client._cacheEnabled = () => false;

		client._addChannelConfig({
			cid: 'messaging:general',
			config: { replies: true },
		});

		expect(client.channelServerConfigsStore.getLatestValue()).to.eql({ configs: {} });
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

describe('Client anonymous auth type', () => {
	it('should stay anonymous after the hello event replaces client.user', async () => {
		const client = new StreamChat('key', { allowServerSideConnect: true });
		await client.tokenManager.setTokenOrProvider('', { id: 'local-anon-id', anon: true });
		client._setUser({ id: 'local-anon-id', anon: true });

		expect(client.anonymous).to.be.true;
		expect(client.getAuthType()).to.equal('anonymous');

		// The server's own-user payload has role 'anonymous' but NO `anon` flag. Reading
		// the flag off client.user made every later HTTP request send stream-auth-type:
		// jwt with an empty token, which the API rejects with 401 "token missing".
		client.dispatchEvent({
			type: 'connection.ok',
			connection_id: 'id',
			me: { id: '!anon', role: 'anonymous', mutes: [], channel_mutes: [] },
		});

		expect(client.user.id).to.equal('!anon');
		expect(client.user.anon).to.be.undefined;
		expect(client.anonymous).to.be.true;
		expect(client.getAuthType()).to.equal('anonymous');
	});

	it('should send an empty token rather than omitting it for anonymous sessions', async () => {
		const client = new StreamChat('key', { allowServerSideConnect: true });
		await client.tokenManager.setTokenOrProvider('', { id: 'local-anon-id', anon: true });

		expect(client.api._getToken()).to.equal('');
	});

	it('should report jwt for a regular user', async () => {
		const client = new StreamChat('key', { allowServerSideConnect: true });
		const token =
			'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiYW1pbiJ9.1R88K_f1CC2yrR6j1_OzMEbasfS_dxRSNbundEDBlJI';
		await client.tokenManager.setTokenOrProvider(token, { id: 'amin' });

		expect(client.anonymous).to.be.false;
		expect(client.getAuthType()).to.equal('jwt');
		expect(client.api._getToken()).to.equal(token);
	});

	it('should reset the anonymous flag on disconnect', async () => {
		const client = new StreamChat('key', { allowServerSideConnect: true });
		await client.tokenManager.setTokenOrProvider('', { id: 'local-anon-id', anon: true });
		expect(client.anonymous).to.be.true;

		client.tokenManager.reset();

		expect(client.anonymous).to.be.false;
		expect(client.getAuthType()).to.equal('jwt');
	});
});

describe('Client createGuest', () => {
	const guestResponse = {
		access_token: 'guest.tok.en',
		user: { id: 'guest-1', role: 'guest' },
	};

	// sinon stubs on ChatApi.prototype outlive the test that installed them
	afterEach(() => sinon.restore());

	it('should send the request as anonymous when the client has no token', async () => {
		const client = new StreamChat('key', { allowServerSideConnect: true });
		let authTypeDuringRequest;
		let tokenDuringRequest;
		sinon.stub(ChatApi.prototype, 'createGuest').callsFake(async () => {
			// /api/v2/guest is only accepted with stream-auth-type: anonymous; a fresh
			// client otherwise defaults to jwt with no token and the API returns 401.
			authTypeDuringRequest = client.getAuthType();
			tokenDuringRequest = client.api._getToken();
			return guestResponse;
		});

		const result = await client.createGuest({ user: { id: 'guest-1' } });

		expect(authTypeDuringRequest).to.equal('anonymous');
		expect(tokenDuringRequest).to.equal('');
		expect(result).to.equal(guestResponse);
	});

	it('should restore the un-authenticated state afterwards', async () => {
		const client = new StreamChat('key', { allowServerSideConnect: true });
		sinon.stub(ChatApi.prototype, 'createGuest').resolves(guestResponse);

		await client.createGuest({ user: { id: 'guest-1' } });

		expect(client.anonymous).to.be.false;
		expect(client.tokenManager.token).to.be.undefined;
	});

	it('should restore state even when the request fails', async () => {
		const client = new StreamChat('key', { allowServerSideConnect: true });
		sinon.stub(ChatApi.prototype, 'createGuest').rejects(new Error('boom'));

		await expect(client.createGuest({ user: { id: 'guest-1' } })).rejects.toThrow(/boom/);

		expect(client.anonymous).to.be.false;
		expect(client.tokenManager.token).to.be.undefined;
	});

	it('should not touch the auth mode of an already authenticated client', async () => {
		const client = new StreamChat('key', { allowServerSideConnect: true });
		const token = 'xyz.eyJ1c2VyX2lkIjoiYW1pbiJ9.xyz';
		await client.tokenManager.setTokenOrProvider(token, { id: 'amin' });

		let authTypeDuringRequest;
		sinon.stub(ChatApi.prototype, 'createGuest').callsFake(async () => {
			authTypeDuringRequest = client.getAuthType();
			return guestResponse;
		});

		await client.createGuest({ user: { id: 'guest-1' } });

		// Swapping auth out from under a live session would be worse than the rejection.
		expect(authTypeDuringRequest).to.equal('jwt');
		expect(client.tokenManager.token).to.equal(token);
	});
});

describe('Client connection.ok hello event', () => {
	const user = { id: 'user' };
	const newConnectedClient = async () => {
		const client = new StreamChat('', '');
		client.connectUser = async () => {
			client.user = user;
			client.wsPromise = Promise.resolve();
		};
		await client.connectUser();
		return client;
	};

	it('should populate own-user state from the v2 hello event', async () => {
		const client = await newConnectedClient();
		const mutes = [{ user, target: { id: 'mute1' } }];
		const channel_mutes = [{ user, channel: { cid: 'messaging:muted' } }];

		client.dispatchEvent({
			type: 'connection.ok',
			connection_id: 'id',
			me: { ...user, mutes, channel_mutes, blocked_user_ids: ['blocked1'] },
		});

		expect(client.user.id).to.equal('user');
		expect(client.mutedUsers).to.deep.equal(mutes);
		expect(client.mutedChannels).to.deep.equal(channel_mutes);
		expect(client.blockedUsers.getLatestValue().userIds).to.deep.equal(['blocked1']);
		expect(client.userMuteStatus('mute1')).to.be.ok;
	});

	it('should default blocked users to an empty list', async () => {
		const client = await newConnectedClient();

		client.dispatchEvent({
			type: 'connection.ok',
			connection_id: 'id',
			me: { ...user, mutes: [], channel_mutes: [] },
		});

		expect(client.blockedUsers.getLatestValue().userIds).to.deep.equal([]);
	});
});

describe('Client active channels cache', () => {
	const client = new StreamChat('', '');
	const user = { id: 'user' };

	client.connectUser = async () => {
		client.user = user;
		client.wsPromise = Promise.resolve();
	};
	const makeChannelMock = (unreadCount) => ({
		state: { unreadCount },
		_setOwnUnreadCount(next) {
			this.state.unreadCount = next;
		},
	});

	beforeEach(() => {
		client.activeChannels = {
			vish: makeChannelMock(1),
			vish2: makeChannelMock(2),
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

describe('client.channel() custom-data preservation', () => {
	let client;
	beforeEach(async () => {
		client = await getClientWithUser();
	});

	it("does not wipe an existing channel's custom when re-resolved with a non-custom arg", () => {
		// First resolution seeds the channel's custom data (e.g. its display name).
		const channel = client.channel('messaging', 'little-italy', {
			custom: { name: 'Little-Italy' },
		});
		expect(channel.data.custom.name).to.equal('Little-Italy');

		// A later `client.channel(type, id, arg)` for the SAME channel that passes other fields but
		// no `custom` — as thread hydration and getChannel do (`{ members }`, or even
		// `{ members: undefined }` when no members are given) — must NOT blank the channel's custom.
		// Regression: getChannelById used to run `channel.data.custom = arg.custom` on any non-empty
		// arg, wiping custom to `undefined` and dropping the channel's name from the channel list.
		const viaMembers = client.channel('messaging', 'little-italy', {
			members: [{ user_id: 'u2' }],
		});
		expect(viaMembers).to.equal(channel); // same cached instance
		expect(channel.data.custom.name).to.equal('Little-Italy');

		client.channel('messaging', 'little-italy', { members: undefined });
		expect(channel.data.custom.name).to.equal('Little-Italy');
	});

	it('applies custom when the caller actually provides it', () => {
		const channel = client.channel('messaging', 'ch-custom', { custom: { name: 'Old' } });
		client.channel('messaging', 'ch-custom', { custom: { name: 'New' } });
		expect(channel.data.custom.name).to.equal('New');
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
		client.user = { id: 'vishal' };
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

	it('should clear upload manager records', async () => {
		const client = new StreamChat('', '');
		client.uploadManager.state.next(() => ({
			uploads: {
				'upload-x': {
					id: 'upload-x',
					uploadProgress: 0,
				},
			},
		}));
		const { resolve, promise } = Promise.withResolvers();
		client.wsConnection = { disconnect: () => promise };
		const disconnectPromise = client.disconnectUser();
		expect(Object.keys(client.uploadManager.uploads)).to.have.length(0);
		resolve();
		await disconnectPromise;
		expect(client.uploadManager.uploads).to.deep.equal({});
	});

	it('should clear the message composer cache', async () => {
		const client = new StreamChat('', '');
		client.messageComposerCache.add('cid:a', {});
		client.messageComposerCache.add('cid:b', {});

		const { resolve, promise } = Promise.withResolvers();
		client.wsConnection = { disconnect: () => promise };
		const disconnectPromise = client.disconnectUser();

		expect(client.messageComposerCache.peek('cid:a')).to.be.undefined;
		expect(client.messageComposerCache.peek('cid:b')).to.be.undefined;

		resolve();
		await disconnectPromise;
	});
});

describe('Detect node environment', () => {
	const client = new StreamChat('', '');
	it('node property should be true', () => {
		expect(client.node).to.be.true;
	});

	it('should warn when using connectUser on a node environment', async () => {
		const sinkSpy = vi.fn();
		chatLoggerSystem.configureLoggers({
			default: { sink: sinkSpy, level: 'trace' },
		});

		try {
			await client.connectUser({ id: 'user' }, 'fake token');
		} catch (e) {}

		await client.disconnectUser();
		expect(sinkSpy).toHaveBeenCalledWith(
			'warn',
			expect.stringContaining('Do not use connectUser server-side.'),
		);

		chatLoggerSystem.restoreDefaults();
	});
});

describe('message update', () => {
	let client;
	let loggerSpy;
	let queueTaskSpy;
	let _updateMessageSpy;

	beforeEach(async () => {
		client = await getClientWithUser();
		const offlineDb = new MockOfflineDB({ client });

		client.setOfflineDBApi(offlineDb);
		await client.offlineDb.init(client.userID);

		loggerSpy = vi.fn();
		chatLoggerSystem.configureLoggers({
			default: { sink: loggerSpy, level: 'trace' },
		});
		queueTaskSpy = vi.spyOn(client.offlineDb, 'queueTask').mockResolvedValue({});
		_updateMessageSpy = vi.spyOn(client, '_updateMessage').mockResolvedValue({});
	});

	afterEach(() => {
		chatLoggerSystem.restoreDefaults();
		vi.resetAllMocks();
	});

	describe('updateMessage', () => {
		it('queues replayable updates through offlineDb', async () => {
			const message = generateMsg({
				id: 'msg-123',
				cid: 'messaging:channel-123',
				text: 'edited',
			});
			const request = { id: message.id, message, skip_enrich_url: true };

			await client.updateMessage(request);

			expect(queueTaskSpy).toHaveBeenCalledTimes(1);
			expect(queueTaskSpy).toHaveBeenCalledWith({
				task: {
					channelId: 'channel-123',
					channelType: 'messaging',
					messageId: 'msg-123',
					payload: [request],
					type: 'update-message',
				},
			});
			expect(_updateMessageSpy).not.toHaveBeenCalled();
		});

		it('queues replayable updates without channel data if cid is missing or invalid', async () => {
			const message = generateMsg({
				id: 'msg-123',
				cid: 'invalid-cid',
				text: 'edited',
			});
			const request = { id: message.id, message };

			await client.updateMessage(request);

			expect(queueTaskSpy).toHaveBeenCalledWith({
				task: {
					messageId: 'msg-123',
					payload: [request],
					type: 'update-message',
				},
			});
		});

		it('falls back to _updateMessage if offlineDb is not set', async () => {
			const message = generateMsg({
				id: 'msg-123',
				text: 'edited',
			});
			const request = { id: message.id, message, skip_enrich_url: true };

			client.offlineDb = undefined;

			await client.updateMessage(request);

			expect(_updateMessageSpy).toHaveBeenCalledTimes(1);
			expect(_updateMessageSpy).toHaveBeenCalledWith(request);
		});

		it('routes updates with local attachment metadata through offlineDb queue handling', async () => {
			const message = generateMsg({
				id: 'msg-123',
				attachments: [
					{
						type: 'image',
						image_url: 'https://example.com/image.jpg',
						localMetadata: {
							file: { uri: 'file://test.jpg' },
							id: 'local-1',
							uploadState: 'pending',
						},
					},
				],
			});
			const request = { id: message.id, message };

			await client.updateMessage(request);

			expect(queueTaskSpy).toHaveBeenCalledTimes(1);
			expect(queueTaskSpy).toHaveBeenCalledWith({
				task: {
					messageId: 'msg-123',
					payload: [request],
					type: 'update-message',
				},
			});
			expect(_updateMessageSpy).not.toHaveBeenCalled();
		});

		it('routes updates with originalFile attachments through offlineDb queue handling', async () => {
			const message = generateMsg({
				id: 'msg-123',
				attachments: [
					{
						type: 'file',
						asset_url: 'https://example.com/test.pdf',
						originalFile: { uri: 'content://test.pdf' },
					},
				],
			});
			const request = { id: message.id, message };

			await client.updateMessage(request);

			expect(queueTaskSpy).toHaveBeenCalledTimes(1);
			expect(queueTaskSpy).toHaveBeenCalledWith({
				task: {
					messageId: 'msg-123',
					payload: [request],
					type: 'update-message',
				},
			});
			expect(_updateMessageSpy).not.toHaveBeenCalled();
		});

		it('logs and falls back to _updateMessage if offline queueing throws', async () => {
			const message = generateMsg({
				id: 'msg-123',
				text: 'edited',
			});
			const request = { id: message.id, message };
			queueTaskSpy.mockRejectedValue(new Error('Offline failure'));

			await client.updateMessage(request);

			expect(loggerSpy).toHaveBeenCalledTimes(1);
			expect(_updateMessageSpy).toHaveBeenCalledTimes(1);
			expect(_updateMessageSpy).toHaveBeenCalledWith(request);
		});

		it('logs and falls back to _updateMessage when queueTask rethrows for failed offline edits', async () => {
			const failedEditedMessage = generateMsg({
				id: 'msg-123',
				status: 'failed',
				text: 'edited',
				message_text_updated_at: '2026-04-01T20:48:43.886269Z',
			});
			const request = { id: failedEditedMessage.id, message: failedEditedMessage };

			client.wsConnection = { isHealthy: false };
			queueTaskSpy.mockRejectedValue(new Error('Offline failure'));
			_updateMessageSpy.mockResolvedValue({ message: failedEditedMessage });

			const response = await client.updateMessage(request);

			expect(queueTaskSpy).toHaveBeenCalledTimes(1);
			expect(loggerSpy).toHaveBeenCalledTimes(1);
			expect(_updateMessageSpy).toHaveBeenCalledTimes(1);
			expect(_updateMessageSpy).toHaveBeenCalledWith(request);
			expect(response.message.text).toBe('edited');
			expect(response.message.status).toBe('failed');
		});
	});
});

describe('StreamChat.queryChannels', async () => {
	/**
	 * A queryChannels response entry for a DISTINCT channel with messages carrying distinct,
	 * deterministic timestamps.
	 *
	 * Both matter for the paginator assertions: spreading `mockChannelQueryResponse` repeatedly yields
	 * N entries sharing one cid, so the same channel gets re-seeded N times with disjoint "newest"
	 * pages — and because `generateMsg()` stamps `created_at` with `new Date()`, all those messages land
	 * in the same millisecond, leaving the sort order to the random-uuid tiebreaker. A later page whose
	 * head then happens to sort above the head interval force-merges into it (a first-page seed marks
	 * the interval `isHead`), welding every page together, which made the item-count assertions fail in
	 * roughly 5% of runs.
	 */
	const generateQueriedChannel = ({ index, messageCount }) => {
		const id = `queried-channel-${index}`;
		return {
			...mockChannelQueryResponse,
			channel: {
				...mockChannelQueryResponse.channel,
				id,
				cid: `messaging:${id}`,
			},
			messages: Array.from({ length: messageCount }, (_, messageIndex) =>
				generateMsg({
					date: new Date(Date.UTC(2024, 0, 1, 0, 0, messageIndex)),
				}),
			),
		};
	};

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
		sinon
			.stub(client, 'queryChannels')
			.resolves({ channels: mockedChannelsQueryResponse });
		await client.queryChannelsAndHydrate();
		expect(Object.keys(client.activeChannels).length).to.be.equal(0);
		expect(Object.keys(client.channelServerConfigs).length).to.be.equal(0);
		sinon.restore();
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
		const stub = sinon
			.stub(client, 'queryChannels')
			.resolves({ channels: mockedChannelsQueryResponse });
		const queryChannelsResponse = await client.queryChannelsAndHydrate();
		expect(queryChannelsResponse.length).to.be.equal(mockedChannelsQueryResponse.length);
		queryChannelsResponse.forEach((item) => {
			expect(item).to.be.instanceOf(Channel);
		});
		stub.restore();
	});

	it('should sync channel data-backed stores when hydrating channels from queryChannels', async () => {
		const client = await getClientWithUser();
		const mockedChannelsQueryResponse = [
			{
				...mockChannelQueryResponse,
				channel: {
					...mockChannelQueryResponse.channel,
					member_count: 7,
					own_capabilities: ['send-message', 'read-events'],
				},
				messages: Array.from(
					{ length: DEFAULT_QUERY_CHANNEL_MESSAGE_LIST_PAGE_SIZE },
					generateMsg,
				),
			},
		];
		const stub = sinon
			.stub(client, 'queryChannels')
			.resolves({ channels: mockedChannelsQueryResponse });

		const [channel] = await client.queryChannelsAndHydrate();

		expect(channel.state.member_count).to.equal(7);
		expect(channel.state.getLatestValue()).to.deep.include({
			ownCapabilities: ['send-message', 'read-events'],
		});

		const previousData = channel.data;
		channel.data = {
			...channel.data,
			member_count: 8,
			own_capabilities: ['send-message'],
		};
		channel.state.syncStateFromChannelData(channel.data, previousData);

		expect(channel.state.member_count).to.equal(8);
		expect(channel.state.getLatestValue()).to.deep.include({
			ownCapabilities: ['send-message'],
		});

		stub.restore();
	});

	it('does not weld a jumped/older window into the newest page when re-hydrating a shared channel on re-query', async () => {
		const client = await getClientWithUser();
		const newest = [
			generateMsg({ id: 'm5', created_at: '2023-11-14T12:00:05.000Z' }),
			generateMsg({ id: 'm6', created_at: '2023-11-14T12:00:06.000Z' }),
			generateMsg({ id: 'm7', created_at: '2023-11-14T12:00:07.000Z' }),
		];
		const stub = sinon.stub(client, 'queryChannels').resolves({
			channels: [{ ...mockChannelQueryResponse, messages: newest }],
		});

		// Initial query seeds the (cold) paginator with the newest window. message_limit === page
		// length so the seed is NOT flagged as the complete set (hasMoreTail stays true: older exist,
		// so an older jumped window stays a separate interval instead of merging at the tail edge).
		const [channel] = await client.queryChannelsAndHydrate({ message_limit: 3 });

		// Simulate the user jumping to an OLDER window, disjoint from the newest, which becomes the
		// active (visible) interval while the newest window stays loaded as a separate interval.
		const older = [
			channel.state.formatMessage(
				generateMsg({ id: 'm1', created_at: '2023-11-14T12:00:01.000Z' }),
			),
			channel.state.formatMessage(
				generateMsg({ id: 'm2', created_at: '2023-11-14T12:00:02.000Z' }),
			),
		];
		channel.messagePaginator.ingestPage({
			page: older,
			isHead: false,
			isTail: false,
			setActive: true,
		});
		const activeBefore = channel.messagePaginator.state
			.getLatestValue()
			.items?.map((m) => m.id);
		expect(activeBefore).to.eql(['m1', 'm2']);

		// A channel-list re-query on reconnect re-hydrates the SAME channel instance with the newest
		// window (disjoint from the jumped one). It must NOT weld them (which would drop m3/m4 in the
		// middle) nor yank the user off the jumped window.
		await client.queryChannelsAndHydrate({ message_limit: 3 });

		const activeAfter = channel.messagePaginator.state
			.getLatestValue()
			.items?.map((m) => m.id);
		expect(activeAfter).to.eql(['m1', 'm2']);

		stub.restore();
	});

	it('reconciles a trailing offline hard-delete on channel-list re-hydrate (cold-boot path)', async () => {
		const client = await getClientWithUser();
		const full = [
			generateMsg({ id: 'm5', created_at: '2023-11-14T12:00:05.000Z' }),
			generateMsg({ id: 'm6', created_at: '2023-11-14T12:00:06.000Z' }),
			generateMsg({ id: 'm7', created_at: '2023-11-14T12:00:07.000Z' }),
		];
		const stub = sinon.stub(client, 'queryChannels').resolves({
			channels: [{ ...mockChannelQueryResponse, messages: full }],
		});

		// First hydrate seeds the (cold) paginator with m5,m6,m7 — m7 is the newest / bottom-most.
		const [channel] = await client.queryChannelsAndHydrate({ message_limit: 3 });
		expect(channel.messagePaginator.getItem('m7')).to.not.be.undefined;

		// While the app was closed, m7 (the last message) was hard-deleted. The next channel-list query
		// returns the window WITHOUT it. m7 is above the newest returned message (m6), so only the
		// pre-fetch head snapshot lets the reconcile prune it — the cold-boot path must supply it.
		stub.resolves({
			channels: [{ ...mockChannelQueryResponse, messages: [full[0], full[1]] }],
		});
		await client.queryChannelsAndHydrate({ message_limit: 3 });

		expect(channel.messagePaginator.getItem('m7')).to.be.undefined;

		stub.restore();
	});

	it('seeds each queried channel paginator with its full message page', async () => {
		const client = await getClientWithUser();
		const mockedChannelsQueryResponse = Array.from({ length: 10 }, (_, index) =>
			generateQueriedChannel({
				index,
				messageCount: DEFAULT_QUERY_CHANNELS_MESSAGE_LIST_PAGE_SIZE,
			}),
		);
		sinon
			.stub(client, 'queryChannels')
			.resolves({ channels: mockedChannelsQueryResponse });
		await client.queryChannelsAndHydrate();
		expect(Object.keys(client.activeChannels).length).to.be.greaterThan(0);
		Object.values(client.activeChannels).forEach((channel) => {
			expect(channel.messagePaginator.items).to.have.length(
				DEFAULT_QUERY_CHANNELS_MESSAGE_LIST_PAGE_SIZE,
			);
		});
		sinon.restore();
	});

	it('seeds each queried channel paginator with its partial message page', async () => {
		const client = await getClientWithUser();
		const mockedChannelQueryResponse = Array.from({ length: 10 }, (_, index) =>
			generateQueriedChannel({
				index,
				messageCount: DEFAULT_QUERY_CHANNELS_MESSAGE_LIST_PAGE_SIZE - 1,
			}),
		);
		sinon
			.stub(client, 'queryChannels')
			.resolves({ channels: mockedChannelQueryResponse });
		await client.queryChannelsAndHydrate();
		expect(Object.keys(client.activeChannels).length).to.be.greaterThan(0);
		Object.values(client.activeChannels).forEach((channel) => {
			expect(channel.messagePaginator.items).to.have.length(
				DEFAULT_QUERY_CHANNELS_MESSAGE_LIST_PAGE_SIZE - 1,
			);
		});
		sinon.restore();
	});
});

describe('StreamChat.queryThreads', () => {
	it('returns threads and next, and hydrates poll cache with parent messages', async () => {
		const client = await getClientWithUser();
		const parentMessage = generateMsg();
		const rawThread = generateThreadResponse(
			mockChannelQueryResponse.channel,
			parentMessage,
		);
		const apiResponse = { threads: [rawThread], next: undefined };

		sinon.stub(client, 'queryThreads').resolves(apiResponse);
		const hydratePollCacheSpy = sinon.spy(client.polls, 'hydratePollCache');

		const result = await client.queryThreadsAndHydrate();

		expect(result.threads).to.have.lengthOf(1);
		expect(result.threads[0].id).to.equal(parentMessage.id);
		expect(result.next).to.be.undefined;
		expect(hydratePollCacheSpy.calledOnce).to.be.true;
		expect(hydratePollCacheSpy.calledWith([parentMessage])).to.be.true;

		sinon.restore();
	});
});

describe('StreamChat.queryReactions', () => {
	let client;
	let dispatchSpy;
	let postStub;
	const messageId = 'msg-1';
	const filter = { type: { $in: ['like', 'love'] } };
	const sort = [{ field: 'created_at', direction: -1 }];
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
		postStub = vi.spyOn(client, 'queryReactions').mockResolvedValueOnce(postResponse);
		client.offlineDb.getReactions.mockResolvedValue(offlineReactions);
	});

	afterEach(() => {
		vi.resetAllMocks();
	});

	it('should query reactions from offlineDb and dispatch offline_reactions.queried event', async () => {
		const request = {
			id: messageId,
			filter,
			sort,
			limit: options.limit,
		};
		const result = await client.queryReactionsAndHydrate(request);

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
		expect(postStub).toHaveBeenCalledWith(request, undefined);

		expect(result).to.eql(postResponse);
	});

	it('should skip querying offlineDb if options.next is true', async () => {
		const request = {
			id: messageId,
			filter,
			sort,
			next: true,
			limit: 20,
		};
		await client.queryReactionsAndHydrate(request);

		expect(client.offlineDb.getReactions).not.toHaveBeenCalled();
		expect(postStub).toHaveBeenCalledWith(request, undefined);
	});

	it('should not dispatch event if offlineDb returns null', async () => {
		client.offlineDb.getReactions.mockResolvedValue(null);

		const request = {
			id: messageId,
			filter,
			sort,
			limit: 50,
		};
		await client.queryReactionsAndHydrate(request);

		expect(client.offlineDb.getReactions).toHaveBeenCalledTimes(1);
		expect(dispatchSpy).not.toHaveBeenCalled();
		expect(postStub).toHaveBeenCalledWith(request, undefined);
	});

	it('should log a warning if offlineDb.getReactions throws', async () => {
		client.offlineDb.getReactions.mockRejectedValue(new Error('DB error'));
		const loggerSpy = vi.fn();
		chatLoggerSystem.configureLoggers({
			default: { sink: loggerSpy, level: 'trace' },
		});

		await client.queryReactionsAndHydrate({
			id: messageId,
			filter,
			sort,
			limit: options.limit,
		});

		expect(loggerSpy).toHaveBeenCalledWith(
			'warn',
			expect.stringContaining('An error occurred while querying offline reactions'),
			expect.objectContaining({
				error: expect.any(Error),
			}),
		);
		expect(dispatchSpy).not.toHaveBeenCalled();
		expect(postStub).toHaveBeenCalledWith(
			{
				id: messageId,
				filter,
				sort,
				limit: 50,
			},
			undefined,
		);

		chatLoggerSystem.restoreDefaults();
	});
});

describe('message deletion', () => {
	const messageId = 'msg-123';

	let client;
	let loggerSpy;
	let queueTaskSpy;

	beforeEach(async () => {
		client = await getClientWithUser();
		const offlineDb = new MockOfflineDB({ client });

		client.setOfflineDBApi(offlineDb);
		await client.offlineDb.init(client.userID);

		loggerSpy = vi.fn();
		chatLoggerSystem.configureLoggers({
			default: { sink: loggerSpy, level: 'trace' },
		});
		queueTaskSpy = vi.spyOn(client.offlineDb, 'queueTask').mockResolvedValue({});
	});

	afterEach(() => {
		chatLoggerSystem.restoreDefaults();
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

		it('routes soft delete through offlineDb.softDeleteMessage and queues the task', async () => {
			const request = { id: messageId };

			await client.deleteMessage(request);

			expect(client.offlineDb.softDeleteMessage).toHaveBeenCalledTimes(1);
			expect(client.offlineDb.softDeleteMessage).toHaveBeenCalledWith({
				id: messageId,
			});
			expect(client.offlineDb.hardDeleteMessage).not.toHaveBeenCalled();

			expect(queueTaskSpy).toHaveBeenCalledTimes(1);
			expect(queueTaskSpy).toHaveBeenCalledWith({
				task: {
					messageId,
					payload: [request],
					type: 'delete-message',
				},
			});
			expect(_deleteMessageSpy).not.toHaveBeenCalled();
		});

		it('routes hard delete through offlineDb.hardDeleteMessage and queues the task', async () => {
			const request = { id: messageId, hard: true };

			await client.deleteMessage(request);

			expect(client.offlineDb.hardDeleteMessage).toHaveBeenCalledTimes(1);
			expect(client.offlineDb.hardDeleteMessage).toHaveBeenCalledWith({
				id: messageId,
			});
			expect(client.offlineDb.softDeleteMessage).not.toHaveBeenCalled();

			expect(queueTaskSpy).toHaveBeenCalledTimes(1);
			expect(queueTaskSpy).toHaveBeenCalledWith({
				task: {
					messageId,
					payload: [request],
					type: 'delete-message',
				},
			});
			expect(_deleteMessageSpy).not.toHaveBeenCalled();
		});

		it('forwards delete_for_me to offlineDb.softDeleteMessage', async () => {
			const request = { id: messageId, delete_for_me: true };

			await client.deleteMessage(request);

			expect(client.offlineDb.softDeleteMessage).toHaveBeenCalledTimes(1);
			expect(client.offlineDb.softDeleteMessage).toHaveBeenCalledWith({
				id: messageId,
				deleteForMe: true,
			});
			expect(client.offlineDb.hardDeleteMessage).not.toHaveBeenCalled();
		});

		it('falls back to _deleteMessage if offlineDb is not set', async () => {
			client.offlineDb = undefined;
			const request = { id: messageId };

			await client.deleteMessage(request);

			expect(_deleteMessageSpy).toHaveBeenCalledTimes(1);
			expect(_deleteMessageSpy).toHaveBeenCalledWith(request);
		});

		it('logs and falls back to _deleteMessage if offline delete throws', async () => {
			client.offlineDb.softDeleteMessage.mockRejectedValue(new Error('Offline failure'));
			const request = { id: messageId };

			await client.deleteMessage(request);

			expect(loggerSpy).toHaveBeenCalledTimes(1);
			expect(queueTaskSpy).not.toHaveBeenCalled();
			expect(_deleteMessageSpy).toHaveBeenCalledTimes(1);
			expect(_deleteMessageSpy).toHaveBeenCalledWith(request);
		});
	});

	describe('_deleteMessage', () => {
		let sendRequestSpy;

		beforeEach(() => {
			sendRequestSpy = vi.spyOn(client.api, 'sendRequest').mockResolvedValue({
				body: { message: { id: messageId } },
				metadata: {},
			});
		});

		afterEach(() => {
			vi.resetAllMocks();
		});

		it('returns the response from the underlying deleteMessage call', async () => {
			const result = await client._deleteMessage({ id: messageId });

			expect(sendRequestSpy).toHaveBeenCalledTimes(1);
			expect(result.message).toMatchObject({ id: messageId });
		});

		it('enriches the message with type="deleted" and deleted_for_me=true when delete_for_me is set', async () => {
			const result = await client._deleteMessage({
				id: messageId,
				delete_for_me: true,
			});

			expect(result.message).toMatchObject({
				id: messageId,
				deleted_for_me: true,
				type: 'deleted',
			});
		});

		it('does not enrich the message when delete_for_me is not set', async () => {
			const result = await client._deleteMessage({ id: messageId, hard: true });

			expect(result.message).toMatchObject({ id: messageId });
			expect(result.message).not.toHaveProperty('deleted_for_me');
			expect(result.message).not.toHaveProperty('type');
		});
	});
});

// Regression coverage for GetStream/stream-chat-js#1736.
// Hard-deleting a user whose cached messages include a self-quote (a message that
// quotes another message from the same user) used to throw inside the message-deletion
// path, aborting the entire dispatchEvent chain — downstream listeners and offline-DB
// writes silently dropped. These tests exercise both event entry points that funnel into
// _deleteUserMessageReference.
describe('user.updated propagates to message + pinned paginators', () => {
	let client;

	beforeEach(async () => {
		client = await getClientWithUser();
	});

	it('reflects the updated user on both messagePaginator and pinnedMessagesPaginator', () => {
		const author = { id: 'author', name: 'Old Name' };
		const channel = client.channel('messaging', 'user-updated-1');
		const message = generateMsg({ id: 'm1', user: author });
		const pinned = generateMsg({
			id: 'p1',
			cid: channel.cid,
			user: author,
			pinned: true,
			pinned_at: '2020-01-01T00:00:00.000Z',
		});

		channel.messagePaginator.setItems({
			valueOrFactory: [message],
			isFirstPage: true,
			isLastPage: true,
		});
		channel.pinnedMessagesPaginator.ingestPage({
			page: [utils.formatMessage(pinned)],
			isHead: true,
			isTail: true,
			setActive: true,
		});

		client._handleClientEvent({
			type: 'user.updated',
			user: { ...author, name: 'New Name' },
		});

		expect(channel.messagePaginator.getItem('m1')?.user?.name).toBe('New Name');
		expect(channel.pinnedMessagesPaginator.getItem('p1')?.user?.name).toBe('New Name');
	});
});

describe('user.updated preserves the own-user-only fields on client.user', () => {
	let client;

	beforeEach(async () => {
		client = await getClientWithUser({ id: 'own-user' });
	});

	// Regression: `OwnUserBase` used to be a hand-maintained field list that had drifted from
	// `OwnUserResponse` — it omitted `latest_hidden_channels`, so every `user.updated` event
	// deleted that field off `client.user`. The list is derived now; this pins the behaviour.
	it('keeps own-user fields the event body does not carry, and drops the rest', () => {
		client.user = {
			...client.user,
			// own-user-only — must all survive an event that omits them
			channel_mutes: [],
			devices: [],
			invisible: false,
			latest_hidden_channels: ['messaging:hidden'],
			mutes: [],
			privacy_settings: { read_receipts: { enabled: true } },
			push_preferences: {},
			total_unread_count: 3,
			total_unread_count_by_team: { red: 1 },
			unread_channels: 1,
			unread_count: 3,
			unread_threads: 0,
			// not an own-user field — the event omitting it means it was cleared server-side
			image: 'https://example.com/old.png',
		};
		client._user = { ...client.user };

		client._handleClientEvent({
			type: 'user.updated',
			user: { id: 'own-user', name: 'New Name' },
		});

		expect(client.user.latest_hidden_channels).toEqual(['messaging:hidden']);
		expect(client.user.total_unread_count).toBe(3);
		expect(client.user.total_unread_count_by_team).toEqual({ red: 1 });
		expect(client.user.unread_threads).toBe(0);
		expect(client.user.privacy_settings).toEqual({ read_receipts: { enabled: true } });
		expect(client.user.invisible).toBe(false);
		expect(client.user.name).toBe('New Name');
		expect(client.user.image).toBeUndefined();
	});
});

describe('user.messages.deleted (client-level, cross-channel)', () => {
	let client;
	const bannedUser = { id: 'banned-user' };
	const otherUser = { id: 'other-user' };

	beforeEach(async () => {
		client = await getClientWithUser();
	});

	// Seeds a channel (registered as active by `client.channel`) with one main + one pinned message
	// from the banned user, plus a pinned message from another user. The client-level loop scans all
	// active channels, so no explicit user->channel reference registration is needed.
	const setupChannel = (id) => {
		const channel = client.channel('messaging', id);
		const main = generateMsg({ id: `${id}-m`, cid: channel.cid, user: bannedUser });
		const pinned = generateMsg({
			id: `${id}-p`,
			cid: channel.cid,
			user: bannedUser,
			pinned: true,
			pinned_at: '2020-01-01T00:00:00.000Z',
		});
		const otherPinned = generateMsg({
			id: `${id}-op`,
			cid: channel.cid,
			user: otherUser,
			pinned: true,
			pinned_at: '2020-01-02T00:00:00.000Z',
		});
		channel.messagePaginator.setItems({
			valueOrFactory: [main],
			isFirstPage: true,
			isLastPage: true,
		});
		channel.pinnedMessagesPaginator.ingestPage({
			page: [pinned, otherPinned].map((m) => utils.formatMessage(m)),
			isHead: true,
			isTail: true,
			setActive: true,
		});
		return channel;
	};

	it('ignores a channel-scoped (cid-carrying) event — the channel owns it', () => {
		const channel = setupChannel('c1');

		client._handleClientEvent({
			type: 'user.messages.deleted',
			cid: channel.cid,
			user: bannedUser,
			hard_delete: true,
			created_at: '2025-01-01T00:00:00.000Z',
		});

		// cid present → the client-level cross-channel loop must be a no-op (no double-delete).
		expect(channel.messagePaginator.items?.map((m) => m.id)).to.include('c1-m');
		expect(channel.pinnedMessagesPaginator.items?.map((m) => m.id)).to.include('c1-p');
	});

	it("soft-deletes the user's main and pinned messages across channels", () => {
		const channels = [setupChannel('c1'), setupChannel('c2')];

		client._handleClientEvent({
			type: 'user.messages.deleted',
			user: bannedUser,
			soft_delete: true,
			created_at: '2025-01-01T00:00:00.000Z',
		});

		channels.forEach((channel) => {
			const id = channel.id;
			expect(channel.messagePaginator.getItem(`${id}-m`)?.type).to.equal('deleted');
			expect(channel.pinnedMessagesPaginator.getItem(`${id}-p`)?.type).to.equal(
				'deleted',
			);
			// the other user's pinned message is untouched
			expect(channel.pinnedMessagesPaginator.getItem(`${id}-op`)?.type).to.not.equal(
				'deleted',
			);
		});
	});

	it("hard-deletes the user's main and pinned messages across channels", () => {
		const channels = [setupChannel('c1'), setupChannel('c2')];

		client._handleClientEvent({
			type: 'user.messages.deleted',
			user: bannedUser,
			hard_delete: true,
			created_at: '2025-01-01T00:00:00.000Z',
		});

		channels.forEach((channel) => {
			const id = channel.id;
			expect(channel.messagePaginator.items?.map((m) => m.id)).to.not.include(`${id}-m`);
			expect(channel.pinnedMessagesPaginator.items?.map((m) => m.id)).to.eql([
				`${id}-op`,
			]);
		});
	});
});

describe('user.messages.deleted — quoted_message regression (#1736)', () => {
	let client;
	const bannedUser = { id: 'banned-user' };

	beforeEach(async () => {
		client = await getClientWithUser();
	});

	const setupChannelWithSelfQuote = (type, id) => {
		const m1 = generateMsg({
			created_at: new Date('2020-01-01T00:00:01.000Z'),
			user: bannedUser,
		});
		const m2 = generateMsg({
			created_at: new Date('2020-01-01T00:00:02.000Z'),
			user: bannedUser,
			quoted_message: m1,
			quoted_message_id: m1.id,
		});
		const channel = client.channel(type, id);
		// `client.channel` registers the channel as active; the client-level deletion loop scans all
		// active channels, and setItems puts the messages in the paginator (the message list source of
		// truth) so the deletion has something to act on.
		channel.messagePaginator.setItems({
			valueOrFactory: [m1, m2],
			isFirstPage: true,
			isLastPage: true,
		});
		return { channel, m1, m2 };
	};

	it('does not throw on user.messages.deleted hard-delete when cached channel contains a same-user self-quote', () => {
		const { channel, m1, m2 } = setupChannelWithSelfQuote('messaging', 'self-quote-1');

		const event = {
			type: 'user.messages.deleted',
			user: bannedUser,
			hard_delete: true,
			created_at: '2025-02-01T14:01:30.000Z',
		};

		expect(() => client._handleClientEvent(event)).not.toThrow();

		// Both messages belong to the banned user, so a hard delete drops both from the
		// active window; the point is that the self-quote (m2 -> m1) does not throw.
		const items = channel.messagePaginator.items ?? [];
		expect(items.find((m) => m.id === m1.id)).toBeUndefined();
		expect(items.find((m) => m.id === m2.id)).toBeUndefined();
	});

	it('still fires downstream client listeners after the self-quote encounter on hard-delete', () => {
		setupChannelWithSelfQuote('messaging', 'self-quote-listener');

		const listener = vi.fn();
		client.on('user.messages.deleted', listener);

		const event = {
			type: 'user.messages.deleted',
			user: bannedUser,
			hard_delete: true,
			created_at: '2025-02-01T14:01:30.000Z',
		};

		expect(() => client.dispatchEvent(event)).not.toThrow();
		expect(listener).toHaveBeenCalledTimes(1);
	});

	it('does not throw on user.deleted hard-delete when cached channel contains a same-user self-quote', () => {
		const { channel, m1, m2 } = setupChannelWithSelfQuote('messaging', 'self-quote-2');

		const event = {
			type: 'user.deleted',
			user: { ...bannedUser, deleted_at: '2025-02-01T14:01:30.000Z' },
			hard_delete: true,
			created_at: '2025-02-01T14:01:30.000Z',
		};

		expect(() => client._handleClientEvent(event)).not.toThrow();

		const items = channel.messagePaginator.items ?? [];
		expect(items.find((m) => m.id === m1.id)).toBeUndefined();
		expect(items.find((m) => m.id === m2.id)).toBeUndefined();
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

	it('SDK integration with appIdentifier', () => {
		client.sdkIdentifier = { name: 'react-native', version: '2.3.4' };
		client.appIdentifier = { name: 'Acme', version: '2.1.0' };
		client.deviceIdentifier = { os: 'iOS 15.0', model: 'iPhone17,4' };
		const userAgent = client.getUserAgent();

		// app / app_version are emitted right after the head, before os / device_model.
		expect(userAgent).toMatchInlineSnapshot(
			`"stream-chat-react-native-v2.3.4-llc-v1.2.3|app=Acme|app_version=2.1.0|os=iOS 15.0|device_model=iPhone17,4|client_bundle=browser-esm"`,
		);
	});

	it('appIdentifier with name only omits the app_version segment', () => {
		client.appIdentifier = { name: 'Acme' };
		const userAgent = client.getUserAgent();

		expect(userAgent).toMatchInlineSnapshot(
			`"stream-chat-js-v1.2.3-node|app=Acme|client_bundle=browser-esm"`,
		);
	});

	it('setUserAgent is now deprecated', () => {
		client.setUserAgent('deprecated');
		const userAgent = client.getUserAgent();

		expect(userAgent).toMatchInlineSnapshot(`"deprecated"`);
	});

	it('memoizes the result permanently and ignores inputs set after the first call', () => {
		const first = client.getUserAgent();
		expect(first).toMatchInlineSnapshot(
			`"stream-chat-js-v1.2.3-node|client_bundle=browser-esm"`,
		);

		// Inputs mutated after the first call must be ignored - the user agent is
		// computed once and the cached value is returned for the client's lifetime.
		client.sdkIdentifier = { name: 'react', version: '2.3.4' };
		client.deviceIdentifier = { os: 'iOS 15.0', model: 'iPhone17,4' };

		expect(client.getUserAgent()).toBe(first);
	});
});

// Regression coverage for GetStream/stream-chat-react#2599.
// When the current user is removed from a channel the server sends a
// `notification.removed_from_channel` event. Previously the client only evicted
// channels from `activeChannels` on deletion, so a removed-from channel lingered:
// later `message.new` / `notification.message_new` events were still delivered to
// it, and connection recovery refreshed it, re-promoting it in downstream lists.
// Eviction is what keeps it out of both paths.
describe('activeChannels eviction when the current user is removed (#2599)', () => {
	let client;
	const currentUserId = 'current-user';

	beforeEach(async () => {
		client = await getClientWithUser({ id: currentUserId });
	});

	const removedFromChannelEvent = (channel) => ({
		type: 'notification.removed_from_channel',
		cid: channel.cid,
		channel_type: channel.type,
		channel_id: channel.id,
	});

	it('evicts the channel from activeChannels and disconnects it on notification.removed_from_channel', () => {
		const channel = client.channel('messaging', 'ch-removed');
		const disconnectSpy = vi.spyOn(channel, '_disconnect');
		expect(client.activeChannels[channel.cid]).to.equal(channel);

		client.dispatchEvent(removedFromChannelEvent(channel));

		expect(disconnectSpy).toHaveBeenCalledTimes(1);
		expect(client.activeChannels[channel.cid]).to.be.undefined;
	});

	it('evicts regardless of channel type (does not special-case the channel type)', () => {
		const channels = [
			client.channel('livestream', 'stream-1'),
			client.channel('team', 'team-1'),
			client.channel('gaming', 'game-1'),
		];
		channels.forEach((channel) => {
			expect(client.activeChannels[channel.cid]).to.equal(channel);
		});

		channels.forEach((channel) => {
			client.dispatchEvent(removedFromChannelEvent(channel));
		});

		channels.forEach((channel) => {
			expect(client.activeChannels[channel.cid]).to.be.undefined;
		});
	});

	it('stops routing channel events (message.new) to the channel once it is evicted', () => {
		const channel = client.channel('messaging', 'ch-events');
		const handleChannelEventSpy = vi.spyOn(channel, '_handleChannelEvent');
		const messageNewEvent = {
			type: 'message.new',
			cid: channel.cid,
			channel_type: channel.type,
			channel_id: channel.id,
			message: generateMsg(),
		};

		// Before removal the event is routed to the channel.
		client.dispatchEvent(messageNewEvent);
		expect(handleChannelEventSpy).toHaveBeenCalledTimes(1);

		client.dispatchEvent(removedFromChannelEvent(channel));
		handleChannelEventSpy.mockClear();

		// After removal the same event is no longer routed to the (evicted) channel —
		// this is the downstream symptom from #2599 (a removed channel kept receiving
		// new messages and got re-promoted in the ChannelList).
		client.dispatchEvent(messageNewEvent);
		expect(handleChannelEventSpy).not.toHaveBeenCalled();
		expect(client.activeChannels[channel.cid]).to.be.undefined;
	});

	it('does not reload the evicted channel on connection recovery', async () => {
		const removed = client.channel('messaging', 'removed');
		const kept = client.channel('messaging', 'kept');
		// Recovery only reloads channels a consumer declared it is reading.
		removed.activate();
		kept.activate();
		const removedReload = vi.spyOn(removed, 'reload').mockResolvedValue(undefined);
		const keptReload = vi.spyOn(kept, 'reload').mockResolvedValue(undefined);

		client.dispatchEvent(removedFromChannelEvent(removed));

		await client.connectionRecovery.recover();

		expect(keptReload).toHaveBeenCalledTimes(1);
		expect(removedReload).not.toHaveBeenCalled();
	});

	it('does not evict when another user is removed (member.removed for a different user)', () => {
		const channel = client.channel('messaging', 'ch-other-member');
		const disconnectSpy = vi.spyOn(channel, '_disconnect');

		client.dispatchEvent({
			type: 'member.removed',
			cid: channel.cid,
			channel_type: channel.type,
			channel_id: channel.id,
			user: { id: 'some-other-user' },
			member: { user_id: 'some-other-user', user: { id: 'some-other-user' } },
		});

		expect(disconnectSpy).not.toHaveBeenCalled();
		expect(client.activeChannels[channel.cid]).to.equal(channel);
	});

	it('still evicts on channel.deleted and notification.channel_deleted (no regression)', () => {
		const deleted = client.channel('messaging', 'deleted-1');
		const notifDeleted = client.channel('messaging', 'deleted-2');
		const deletedDisconnect = vi.spyOn(deleted, '_disconnect');
		const notifDeletedDisconnect = vi.spyOn(notifDeleted, '_disconnect');

		client.dispatchEvent({
			type: 'channel.deleted',
			cid: deleted.cid,
			channel_type: deleted.type,
			channel_id: deleted.id,
		});
		client.dispatchEvent({
			type: 'notification.channel_deleted',
			cid: notifDeleted.cid,
			channel_type: notifDeleted.type,
			channel_id: notifDeleted.id,
		});

		expect(deletedDisconnect).toHaveBeenCalledTimes(1);
		expect(notifDeletedDisconnect).toHaveBeenCalledTimes(1);
		expect(client.activeChannels[deleted.cid]).to.be.undefined;
		expect(client.activeChannels[notifDeleted.cid]).to.be.undefined;
	});
});
