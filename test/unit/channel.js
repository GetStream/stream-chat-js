import chai from 'chai';
import { v4 as uuidv4 } from 'uuid';

import { generateChannel } from './test-utils/generateChannel';
import { generateMember } from './test-utils/generateMember';
import { generateMsg } from './test-utils/generateMessage';
import { generateUser } from './test-utils/generateUser';
import { getClientWithUser } from './test-utils/getClient';
import { getOrCreateChannelApi } from './test-utils/getOrCreateChannelApi';

import { StreamChat } from '../../src/client';

const expect = chai.expect;

describe('Channel count unread', function () {
	const user = { id: 'user' };
	const lastRead = new Date('2020-01-01T00:00:00');
	const channelResponse = generateChannel();

	const client = new StreamChat('apiKey');
	client.user = user;
	client.userID = 'user';
	client.userMuteStatus = (targetId) => targetId.startsWith('mute');

	const channel = client.channel(
		channelResponse.channel.type,
		channelResponse.channel.id,
	);
	channel.initialized = true;
	channel.lastRead = () => lastRead;

	const ignoredMessages = [
		generateMsg({ date: '2018-01-01T00:00:00', mentioned_users: [user] }),
		generateMsg({ date: '2019-01-01T00:00:00' }),
		generateMsg({ date: '2020-01-01T00:00:00' }),
		generateMsg({
			date: '2023-01-01T00:00:00',
			shadowed: true,
			mentioned_users: [user],
		}),
		generateMsg({
			date: '2024-01-01T00:00:00',
			silent: true,
			mentioned_users: [user],
		}),
		generateMsg({
			date: '2025-01-01T00:00:00',
			user: { id: 'mute1' },
			mentioned_users: [user],
		}),
	];
	channel.state.addMessagesSorted(ignoredMessages);

	it('_countMessageAsUnread should return false shadowed or silent messages', function () {
		expect(channel._countMessageAsUnread({ shadowed: true })).not.to.be.ok;
		expect(channel._countMessageAsUnread({ silent: true })).not.to.be.ok;
	});

	it('_countMessageAsUnread should return false for current user messages', function () {
		expect(channel._countMessageAsUnread({ user })).not.to.be.ok;
	});

	it('_countMessageAsUnread should return false for system messages', function () {
		expect(channel._countMessageAsUnread({ type: 'system' })).not.to.be.ok;
	});

	it('_countMessageAsUnread should return false for muted user', function () {
		expect(channel._countMessageAsUnread({ user: { id: 'mute1' } })).not.to.be.ok;
	});

	it('_countMessageAsUnread should return true for unmuted user', function () {
		expect(channel._countMessageAsUnread({ user: { id: 'unmute' } })).to.be.ok;
	});

	it('_countMessageAsUnread should return false for muted channel', function () {
		client.mutedChannels = [{ user, channel }];
		expect(channel._countMessageAsUnread({ user: { id: 'unmute' } })).not.to.be.ok;
	});

	it('_countMessageAsUnread should return true for unmuted channel', function () {
		client.mutedChannels = [];
		expect(channel._countMessageAsUnread({ user: { id: 'unmute' } })).to.be.ok;
	});

	it('_countMessageAsUnread should return true for other messages', function () {
		expect(
			channel._countMessageAsUnread({
				shadowed: false,
				silent: false,
				user: { id: 'random' },
			}),
		).to.be.ok;
	});

	it('countUnread should return state.unreadCount without lastRead', function () {
		expect(channel.countUnread()).to.be.equal(channel.state.unreadCount);
		channel.state.unreadCount = 10;
		expect(channel.countUnread()).to.be.equal(10);
		channel.state.unreadCount = 0;
	});

	it('countUnread should return correct count', function () {
		expect(channel.countUnread(lastRead)).to.be.equal(0);
		channel.state.addMessagesSorted([
			generateMsg({ date: '2021-01-01T00:00:00' }),
			generateMsg({ date: '2022-01-01T00:00:00' }),
		]);
		expect(channel.countUnread(lastRead)).to.be.equal(2);
	});

	it('countUnreadMentions should return correct count', function () {
		expect(channel.countUnreadMentions()).to.be.equal(0);
		channel.state.addMessageSorted(
			generateMsg({
				date: '2021-01-01T00:00:00',
				mentioned_users: [user, { id: 'random' }],
			}),
			generateMsg({
				date: '2022-01-01T00:00:00',
				mentioned_users: [{ id: 'random' }],
			}),
		);
		expect(channel.countUnreadMentions()).to.be.equal(1);
	});
});

describe('Channel _handleChannelEvent', function () {
	const user = { id: 'user' };
	const client = new StreamChat('apiKey');
	client.user = user;
	client.userID = user.id;
	client.userMuteStatus = (targetId) => targetId.startsWith('mute');

	const channel = client.channel('messaging', 'id');
	channel.initialized = true;

	it('message.new reset the unreadCount for current user messages', function () {
		channel.state.unreadCount = 100;
		channel._handleChannelEvent({
			type: 'message.new',
			user,
			message: generateMsg(),
		});

		expect(channel.state.unreadCount).to.be.equal(0);
	});

	it('message.new increment unreadCount properly', function () {
		channel.state.unreadCount = 20;
		channel._handleChannelEvent({
			type: 'message.new',
			user: { id: 'id' },
			message: generateMsg({ user: { id: 'id' } }),
		});
		expect(channel.state.unreadCount).to.be.equal(21);
		channel._handleChannelEvent({
			type: 'message.new',
			user: { id: 'id2' },
			message: generateMsg({ user: { id: 'id2' } }),
		});
		expect(channel.state.unreadCount).to.be.equal(22);
	});

	it('message.new skip increment for silent/shadowed/muted messages', function () {
		channel.state.unreadCount = 30;
		channel._handleChannelEvent({
			type: 'message.new',
			user: { id: 'id' },
			message: generateMsg({ silent: true }),
		});
		expect(channel.state.unreadCount).to.be.equal(30);
		channel._handleChannelEvent({
			type: 'message.new',
			user: { id: 'id2' },
			message: generateMsg({ shadowed: true }),
		});
		expect(channel.state.unreadCount).to.be.equal(30);
		channel._handleChannelEvent({
			type: 'message.new',
			user: { id: 'mute1' },
			message: generateMsg({ user: { id: 'mute1' } }),
		});
		expect(channel.state.unreadCount).to.be.equal(30);
	});

	it('message.delete removes quoted messages references', function () {
		const originalMessage = generateMsg({ silent: true });
		channel._handleChannelEvent({
			type: 'message.new',
			user: { id: 'id' },
			message: originalMessage,
		});

		const quotingMessage = generateMsg({
			silent: true,
			quoted_message: originalMessage,
			quoted_message_id: originalMessage.id,
		});

		channel._handleChannelEvent({
			type: 'message.new',
			user: { id: 'id2' },
			message: quotingMessage,
		});

		channel._handleChannelEvent({
			type: 'message.deleted',
			user: { id: 'id' },
			message: { ...originalMessage, deleted_at: new Date().toISOString() },
		});

		expect(
			channel.state.messages.find((msg) => msg.id === quotingMessage.id)
				.quoted_message.deleted_at,
		).to.be.ok;
	});
});

describe('Channels - Constructor', function () {
	const client = new StreamChat('key', 'secret');

	it('canonical form', function (done) {
		const channel = client.channel('messaging', '123', { cool: true });
		expect(channel.cid).to.eql('messaging:123');
		expect(channel.id).to.eql('123');
		expect(channel.data).to.eql({ cool: true });
		done();
	});

	it('default options', function (done) {
		const channel = client.channel('messaging', '123');
		expect(channel.cid).to.eql('messaging:123');
		expect(channel.id).to.eql('123');
		done();
	});

	it('null ID no options', function (done) {
		const channel = client.channel('messaging', null);
		expect(channel.id).to.eq(undefined);
		done();
	});

	it('undefined ID no options', function (done) {
		const channel = client.channel('messaging', undefined);
		expect(channel.id).to.eql(undefined);
		expect(channel.data).to.eql({});
		done();
	});

	it('short version with options', function (done) {
		const channel = client.channel('messaging', { members: ['tommaso', 'thierry'] });
		expect(channel.data).to.eql({ members: ['tommaso', 'thierry'] });
		expect(channel.id).to.eql(undefined);
		done();
	});

	it('null ID with options', function (done) {
		const channel = client.channel('messaging', null, {
			members: ['tommaso', 'thierry'],
		});
		expect(channel.data).to.eql({ members: ['tommaso', 'thierry'] });
		expect(channel.id).to.eql(undefined);
		done();
	});

	it('empty ID  with options', function (done) {
		const channel = client.channel('messaging', '', {
			members: ['tommaso', 'thierry'],
		});
		expect(channel.data).to.eql({ members: ['tommaso', 'thierry'] });
		expect(channel.id).to.eql(undefined);
		done();
	});

	it('empty ID  with options', function (done) {
		const channel = client.channel('messaging', undefined, {
			members: ['tommaso', 'thierry'],
		});
		expect(channel.data).to.eql({ members: ['tommaso', 'thierry'] });
		expect(channel.id).to.eql(undefined);
		done();
	});
});

describe('Ensure single channel per cid on client activeChannels state', () => {
	const clientVish = new StreamChat('', '');
	const user = { id: 'user' };
	const channelType = 'messaging';

	clientVish.connectUser = () => {
		clientVish.user = user;
		clientVish.userID = user.id;
		clientVish.wsPromise = Promise.resolve();
	};

	clientVish.connectUser();

	it('channel created using id - case 1', async () => {
		clientVish.activeChannels = {};

		const channelVishId = uuidv4();
		const mockedChannelResponse = generateChannel({
			channel: {
				id: channelVishId,
			},
		});

		// to mock the channel.watch call
		clientVish.post = () =>
			getOrCreateChannelApi(mockedChannelResponse).response.data;
		const channelVish_copy1 = clientVish.channel('messaging', channelVishId);

		const cid = `${channelType}:${channelVishId}`;

		expect(Object.keys(clientVish.activeChannels)).to.contain(cid);
		expect(clientVish.activeChannels[cid]).to.contain(channelVish_copy1);

		await channelVish_copy1.watch();
		const channelVish_copy2 = clientVish.channel('messaging', channelVishId);
		await channelVish_copy2.watch();
		expect(channelVish_copy1).to.be.equal(channelVish_copy2);
	});
	it('channel created using id - case 2', async () => {
		clientVish.activeChannels = {};

		const channelVishId = uuidv4();
		const mockedChannelResponse = generateChannel({
			channel: {
				id: channelVishId,
			},
		});

		// to mock the channel.watch call
		clientVish.post = () =>
			getOrCreateChannelApi(mockedChannelResponse).response.data;

		const channelVish_copy1 = clientVish.channel('messaging', channelVishId);

		const cid = `${channelType}:${channelVishId}`;

		expect(Object.keys(clientVish.activeChannels)).to.contain(cid);
		expect(clientVish.activeChannels[cid]).to.contain(channelVish_copy1);

		const channelVish_copy2 = clientVish.channel('messaging', channelVishId);

		expect(Object.keys(clientVish.activeChannels)).to.contain(cid);
		expect(clientVish.activeChannels[cid]).to.contain(channelVish_copy1);

		await channelVish_copy1.watch();
		await channelVish_copy2.watch();

		expect(channelVish_copy1).to.be.equal(channelVish_copy2);
	});

	it('channel created using member list - case 1', async () => {
		clientVish.activeChannels = {};

		// Mock channel.watch call.
		const userVish = generateUser();
		const userAmin = generateUser();
		const memberVish = generateMember({ user: userVish });
		const memberAmin = generateMember({ user: userAmin });
		const mockedChannelResponse = generateChannel({
			members: [memberVish, memberAmin],
		});
		clientVish.post = () =>
			getOrCreateChannelApi(mockedChannelResponse).response.data;

		// Lets start testing
		const channelVish_copy1 = clientVish.channel('messaging', {
			members: [userAmin.id, userVish.id],
		});

		const tmpCid = `${channelType}:!members-${[userVish.id, userAmin.id]
			.sort()
			.join(',')}`;

		// activeChannels should have tmpCid now.
		expect(Object.keys(clientVish.activeChannels)).to.contain(tmpCid);
		expect(clientVish.activeChannels[tmpCid]).to.contain(channelVish_copy1);

		await channelVish_copy1.watch();

		// tempCid should be replaced with actual cid at this point.
		expect(Object.keys(clientVish.activeChannels)).to.not.contain(tmpCid);
		expect(Object.keys(clientVish.activeChannels)).to.contain(channelVish_copy1.cid);
		expect(clientVish.activeChannels[channelVish_copy1.cid]).to.contain(
			channelVish_copy1,
		);

		const channelVish_copy2 = clientVish.channel('messaging', {
			members: [userVish.id, userAmin.id],
		});

		// Should not populate tmpCid again.
		expect(Object.keys(clientVish.activeChannels)).to.not.contain(tmpCid);

		await channelVish_copy2.watch();
		expect(channelVish_copy1).to.be.equal(channelVish_copy2);
	});

	it('channel created using member list - case 2', async () => {
		clientVish.activeChannels = {};

		const userVish = generateUser();
		const userAmin = generateUser();

		const memberVish = generateMember({ user: userVish });
		const memberAmin = generateMember({ user: userAmin });

		// Case 1 =======================>
		const mockedChannelResponse = generateChannel({
			members: [memberVish, memberAmin],
		});

		// to mock the channel.watch call
		clientVish.post = () =>
			getOrCreateChannelApi(mockedChannelResponse).response.data;

		// Case 1 =======================>
		const channelVish_copy1 = clientVish.channel('messaging', {
			members: [userAmin.id, userVish.id],
		});

		const tmpCid = `${channelType}:!members-${[userVish.id, userAmin.id]
			.sort()
			.join(',')}`;

		// activeChannels should have tmpCid now.
		expect(Object.keys(clientVish.activeChannels)).to.contain(tmpCid);
		expect(clientVish.activeChannels[tmpCid]).to.contain(channelVish_copy1);

		const channelVish_copy2 = clientVish.channel('messaging', {
			members: [userVish.id, userAmin.id],
		});

		// activeChannels still should have tmpCid now.
		expect(Object.keys(clientVish.activeChannels)).to.contain(tmpCid);
		expect(clientVish.activeChannels[tmpCid]).to.contain(channelVish_copy2);

		await channelVish_copy1.watch();
		await channelVish_copy2.watch();

		expect(channelVish_copy1).to.be.equal(channelVish_copy2);
	});
});

describe('event subscription and unsubscription', () => {
	it('channel.on should return unsubscribe handler', async () => {
		const client = await getClientWithUser();
		const channel = client.channel('messaging', uuidv4());

		const { unsubscribe: unsubscribe1 } = channel.on('message.new', () => {});
		const { unsubscribe: unsubscribe2 } = channel.on(() => {});

		expect(Object.values(channel.listeners).length).to.be.equal(2);

		unsubscribe1();
		expect(channel.listeners['message.new'].length).to.be.equal(0);
		unsubscribe2();
		expect(channel.listeners['all'].length).to.be.equal(0);
	});
});
describe('Channel search', async () => {
	const client = await getClientWithUser();
	const channel = client.channel('messaging', uuidv4());

	it('search with sorting by defined field', async () => {
		client.get = (url, config) => {
			expect(config.payload.sort).to.be.eql([
				{ field: 'updated_at', direction: -1 },
			]);
		};
		await channel.search('query', { sort: [{ updated_at: -1 }] });
	});
	it('search with sorting by custom field', async () => {
		client.get = (url, config) => {
			expect(config.payload.sort).to.be.eql([
				{ field: 'custom_field', direction: -1 },
			]);
		};
		await channel.search('query', { sort: [{ custom_field: -1 }] });
	});
	it('sorting and offset fails', async () => {
		await expect(
			channel.search('query', { offset: 1, sort: [{ custom_field: -1 }] }),
		).to.be.rejectedWith(Error);
	});
	it('next and offset fails', async () => {
		await expect(
			channel.search('query', { offset: 1, next: 'next' }),
		).to.be.rejectedWith(Error);
	});
});
