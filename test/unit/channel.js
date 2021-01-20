import chai from 'chai';
import { Channel } from '../../src/channel';
import { StreamChat } from '../../src/client';
import { v4 as uuidv4 } from 'uuid';
import { generateMsg } from './test-utils/generateMessage';
import { generateMember } from './test-utils/generateMember';
import { generateUser } from './test-utils/generateUser';
import { getOrCreateChannelApi } from './test-utils/getOrCreateChannelApi';
import { generateChannel } from './test-utils/generateChannel';

const expect = chai.expect;

describe('Channel count unread', function () {
	const user = { id: 'user' };
	const lastRead = new Date('2020-01-01T00:00:00');

	const channel = new Channel({}, 'messaging', 'id');
	channel.lastRead = () => lastRead;
	channel.getClient = () => ({
		user,
		userID: 'user',
		userMuteStatus: (targetId) => targetId.startsWith('mute'),
	});

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

	it('_countMessageAsUnread should return false for muted user', function () {
		expect(channel._countMessageAsUnread({ user: { id: 'mute1' } })).not.to.be.ok;
	});

	it('_countMessageAsUnread should return true for unmuted user', function () {
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
	const channel = new Channel(
		{
			logger: () => null,
			user,
			userID: user.id,
			userMuteStatus: (targetId) => targetId.startsWith('mute'),
		},
		'messaging',
		'id',
	);

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
