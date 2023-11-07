import chai from 'chai';
import { v4 as uuidv4 } from 'uuid';

import { generateChannel } from './test-utils/generateChannel';
import { generateMember } from './test-utils/generateMember';
import { generateMsg } from './test-utils/generateMessage';
import { generateUser } from './test-utils/generateUser';
import { getClientWithUser } from './test-utils/getClient';
import { getOrCreateChannelApi } from './test-utils/getOrCreateChannelApi';

import { StreamChat } from '../../src/client';
import { ChannelState } from '../../src';

const expect = chai.expect;

describe('Channel count unread', function () {
	let lastRead;
	let user;
	let channel;
	let client;
	beforeEach(() => {
		user = { id: 'user' };
		lastRead = new Date('2020-01-01T00:00:00');
		const channelResponse = generateChannel();

		client = new StreamChat('apiKey');
		client.user = user;
		client.userID = 'user';
		client.userMuteStatus = (targetId) => targetId.startsWith('mute');

		channel = client.channel(channelResponse.channel.type, channelResponse.channel.id);
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
	});

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

	it('_countMessageAsUnread should return false for channel with read_events off', function () {
		const channel = client.channel('messaging', { members: ['tommaso'], own_capabilities: [] });
		expect(channel._countMessageAsUnread({ user: { id: 'random' } })).not.to.be.ok;
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

	it('countUnread should return correct count when multiple message sets are loaded into state', () => {
		expect(channel.countUnread(lastRead)).to.be.equal(0);
		channel.state.addMessagesSorted([
			generateMsg({ date: '2021-01-01T00:00:00' }),
			generateMsg({ date: '2022-01-01T00:00:00' }),
		]);
		channel.state.addMessagesSorted([generateMsg({ date: '2020-01-01T00:00:00' })], false, true, true, 'new');
		channel.state.messageSets[0].isCurrent = false;
		channel.state.messageSets[1].isCurrent = true;

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

	it('countUnreadMentions should return correct count when multiple message sets are loaded into state', () => {
		expect(channel.countUnreadMentions()).to.be.equal(0);
		channel.state.addMessagesSorted([
			generateMsg({ date: '2021-01-01T00:00:00', mentioned_users: [user, { id: 'random' }] }),
			generateMsg({ date: '2022-01-01T00:00:00' }),
		]);
		channel.state.addMessagesSorted([generateMsg({ date: '2020-01-01T00:00:00' })], false, true, true, 'new');
		channel.state.messageSets[0].isCurrent = false;
		channel.state.messageSets[1].isCurrent = true;

		expect(channel.countUnreadMentions()).to.be.equal(1);
	});

	describe('channel.lastRead', () => {
		let channelResponse;
		beforeEach(() => {
			channelResponse = generateChannel();
			channel = client.channel(channelResponse.channel.type, channelResponse.channel.id);
			channel.initialized = true;
		});

		it('should return null if no last read message', () => {
			expect(channel.lastRead()).to.eq(null);
		});

		it('should return last read message date', () => {
			const last_read = new Date();
			const messages = [generateMsg()];
			channel.state.read[user.id] = {
				last_read,
				last_read_message_id: messages[0].id,
				user: user,
				unread_messages: 0,
			};
			channel.state.addMessagesSorted(messages);
			expect(channel.lastRead()).to.eq(last_read);
		});

		it('should return undefined if client user is not set (server-side client)', () => {
			client = new StreamChat('apiKey', 'secret');
			channel = client.channel(channelResponse.channel.type, channelResponse.channel.id);
			channel.initialized = true;
			expect(channel.lastRead()).to.be.undefined;
		});
	});
});

describe('Channel _handleChannelEvent', function () {
	const user = { id: 'user' };
	let client;
	let channel;

	beforeEach(() => {
		client = new StreamChat('apiKey');
		client.user = user;
		client.userID = user.id;
		client.userMuteStatus = (targetId) => targetId.startsWith('mute');
		channel = client.channel('messaging', 'id');
		channel.initialized = true;
	});

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

	it('message.truncate removes all messages if "truncated_at" is "now"', function () {
		const messages = [
			{ created_at: '2021-01-01T00:01:00' },
			{ created_at: '2021-01-01T00:02:00' },
			{ created_at: '2021-01-01T00:03:00' },
		].map(generateMsg);

		channel.state.addMessagesSorted(messages);
		expect(channel.state.messages.length).to.be.equal(3);

		channel._handleChannelEvent({
			type: 'channel.truncated',
			user: { id: 'id' },
			channel: {
				truncated_at: new Date().toISOString(),
			},
		});

		expect(channel.state.messages.length).to.be.equal(0);
	});

	it('message.truncate removes messages up to specified date', function () {
		const messages = [
			{ created_at: '2021-01-01T00:01:00' },
			{ created_at: '2021-01-01T00:02:00' },
			{ created_at: '2021-01-01T00:03:00' },
		].map(generateMsg);

		channel.state.addMessagesSorted(messages);
		expect(channel.state.messages.length).to.be.equal(3);

		channel._handleChannelEvent({
			type: 'channel.truncated',
			user: { id: 'id' },
			channel: {
				truncated_at: messages[1].created_at,
			},
		});

		expect(channel.state.messages.length).to.be.equal(2);
	});

	it('message.truncate removes pinned messages up to specified date', function () {
		const messages = [
			{ created_at: '2021-01-01T00:01:00', pinned: true, pinned_at: new Date('2021-01-01T00:01:01.010Z') },
			{ created_at: '2021-01-01T00:02:00' },
			{ created_at: '2021-01-01T00:03:00', pinned: true, pinned_at: new Date('2021-01-01T00:02:02.011Z') },
		].map(generateMsg);

		channel.state.addMessagesSorted(messages);
		channel.state.addPinnedMessages(messages.filter((m) => m.pinned));
		expect(channel.state.messages.length).to.be.equal(3);
		expect(channel.state.pinnedMessages.length).to.be.equal(2);

		channel._handleChannelEvent({
			type: 'channel.truncated',
			user: { id: 'id' },
			channel: {
				truncated_at: messages[1].created_at,
			},
		});

		expect(channel.state.messages.length).to.be.equal(2);
		expect(channel.state.pinnedMessages.length).to.be.equal(1);
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

		expect(channel.state.messages.find((msg) => msg.id === quotingMessage.id).quoted_message.deleted_at).to.be.ok;
	});

	it('should include unread_messages for message events from another user', () => {
		channel.state.read['id'] = {
			unread_messages: 2,
		};

		const message = generateMsg();

		const events = [
			'message.read',
			'message.deleted',
			'message.new',
			'message.updated',
			'member.added',
			'member.updated',
			'member.removed',
		];

		for (const event of events) {
			channel.state.read['id'].unread_messages = 2;
			channel._handleChannelEvent({
				type: event,
				user: { id: 'id' },
				message,
			});
			expect(channel.state.read['id'].unread_messages, `${event} should not be undefined`).not.to.be.undefined;
		}
	});

	it('should include unread_messages for message events from the current user', () => {
		channel.state.read[client.user.id] = {
			unread_messages: 2,
		};

		const message = generateMsg({ user: { id: client.userID } });

		const events = [
			'message.read',
			'message.deleted',
			'message.new',
			'message.updated',
			'member.added',
			'member.updated',
			'member.removed',
		];

		for (const event of events) {
			channel.state.read['id'] = {
				unread_messages: 2,
			};

			channel._handleChannelEvent({
				type: event,
				user: { id: client.user.id },
				message,
			});
			expect(channel.state.read[client.user.id].unread_messages, `${event} should not be undefined`).not.to.be
				.undefined;
		}
	});

	it('should extend "message.updated" and "message.deleted" event payloads with "own_reactions"', () => {
		const own_reactions = [
			{ created_at: new Date().toISOString(), updated_at: new Date().toISOString(), type: 'wow' },
		];
		const testCases = [
			[generateMsg({ own_reactions })], // channel message
			[generateMsg({ id: '0' }), generateMsg({ parent_id: '0', own_reactions })], // thread message
		];

		testCases.forEach((messages) => {
			channel.state.addMessagesSorted(messages);
			const message = messages[messages.length - 1];

			const eventTypes = ['message.updated', 'message.deleted'];

			eventTypes.forEach((eventType) => {
				let receivedEvent;
				channel.on(eventType, (e) => (receivedEvent = e));

				const event = {
					type: eventType,
					// own_reactions is always [] in WS events
					message: { ...message, own_reactions: [] },
				};
				channel._handleChannelEvent(event);
				channel._callChannelListeners(event);

				expect(channel.state.findMessage(message.id, message.parent_id).own_reactions.length).to.equal(
					own_reactions.length,
				);
				expect(receivedEvent.message.own_reactions.length).to.equal(own_reactions.length);
			});
		});
	});

	it('should mark channel visible on channel.visible event', () => {
		const channelVisibleEvent = {
			type: 'channel.visible',
			cid: 'messaging:id',
			channel_id: 'id',
			channel_type: 'messaging',
			user: {
				id: 'admin',
				role: 'admin',
				created_at: '2022-03-08T09:46:56.840739Z',
				updated_at: '2022-03-15T08:30:09.796926Z',
				last_active: '2023-05-24T09:20:31.041292724Z',
				banned: false,
				online: true,
			},
			created_at: '2023-05-24T09:20:43.986615426Z',
		};
		channel.data.hidden = true;

		channel._handleChannelEvent(channelVisibleEvent);
		expect(channel.data.hidden).eq(false);
	});

	it('should mark channel hidden on channel.hidden event', () => {
		const channelVisibleEvent = {
			type: 'channel.hidden',
		};
		channel.data.hidden = false;

		channel._handleChannelEvent(channelVisibleEvent);
		expect(channel.data.hidden).eq(true);
	});

	it('should update channel member ban state on user.banned and user.unbanned events', () => {
		const user = { id: 'user_id' };
		const shadowBanEvent = {
			type: 'user.banned',
			shadow: true,
			user,
		};
		const shadowUnbanEvent = {
			type: 'user.unbanned',
			shadow: true,
			user,
		};
		const banEvent = {
			type: 'user.banned',
			user,
		};
		const unbanEvent = {
			type: 'user.unbanned',
			user,
		};

		[
			[shadowBanEvent, banEvent, { shadow_banned: true, banned: false }, { shadow_banned: false, banned: true }],
			[
				shadowBanEvent,
				shadowUnbanEvent,
				{ shadow_banned: true, banned: false },
				{ shadow_banned: false, banned: false },
			],
			[
				shadowBanEvent,
				unbanEvent,
				{ shadow_banned: true, banned: false },
				{ shadow_banned: false, banned: false },
			],
			[banEvent, shadowBanEvent, { shadow_banned: false, banned: true }, { shadow_banned: true, banned: false }],
			[
				banEvent,
				shadowUnbanEvent,
				{ shadow_banned: false, banned: true },
				{ shadow_banned: false, banned: false },
			],
			[banEvent, unbanEvent, { shadow_banned: false, banned: true }, { shadow_banned: false, banned: false }],
		].forEach(([firstEvent, secondEvent, expectAfterFirst, expectAfterSecond]) => {
			channel._handleChannelEvent(firstEvent);
			expect(channel.state.members[user.id].banned).eq(expectAfterFirst.banned);
			expect(channel.state.members[user.id].shadow_banned).eq(expectAfterFirst.shadow_banned);
			channel._handleChannelEvent(secondEvent);
			expect(channel.state.members[user.id].banned).eq(expectAfterSecond.banned);
			expect(channel.state.members[user.id].shadow_banned).eq(expectAfterSecond.shadow_banned);
		});
	});
});

describe('Uninitialized Channel', () => {
	const user = { id: 'user' };
	let client;
	let channel;

	beforeEach(() => {
		client = new StreamChat('apiKey');
		client.user = user;
		client.userID = user.id;
		client.userMuteStatus = (targetId) => targetId.startsWith('mute');
		channel = client.channel('messaging', 'id');
		channel.initialized = false;
		channel.offlineMode = false;
	});

	it('returns 0 mentions in unread messages', () => {
		expect(channel.countUnreadMentions()).to.eq(0);
	});

	it('reports no lastRead data', () => {
		expect(channel.lastRead()).to.eq(null);
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
		clientVish.post = () => getOrCreateChannelApi(mockedChannelResponse).response.data;
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
		clientVish.post = () => getOrCreateChannelApi(mockedChannelResponse).response.data;

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
		clientVish.post = () => getOrCreateChannelApi(mockedChannelResponse).response.data;

		// Lets start testing
		const channelVish_copy1 = clientVish.channel('messaging', {
			members: [userAmin.id, userVish.id],
		});

		const tmpCid = `${channelType}:!members-${[userVish.id, userAmin.id].sort().join(',')}`;

		// activeChannels should have tmpCid now.
		expect(Object.keys(clientVish.activeChannels)).to.contain(tmpCid);
		expect(clientVish.activeChannels[tmpCid]).to.contain(channelVish_copy1);

		await channelVish_copy1.watch();

		// tempCid should be replaced with actual cid at this point.
		expect(Object.keys(clientVish.activeChannels)).to.not.contain(tmpCid);
		expect(Object.keys(clientVish.activeChannels)).to.contain(channelVish_copy1.cid);
		expect(clientVish.activeChannels[channelVish_copy1.cid]).to.contain(channelVish_copy1);

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
		clientVish.post = () => getOrCreateChannelApi(mockedChannelResponse).response.data;

		// Case 1 =======================>
		const channelVish_copy1 = clientVish.channel('messaging', {
			members: [userAmin.id, userVish.id],
		});

		const tmpCid = `${channelType}:!members-${[userVish.id, userAmin.id].sort().join(',')}`;

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

	it('channel created using member list - case 3', async () => {
		clientVish.activeChannels = {};

		// Mock channel.watch call.
		const userVish = generateUser();
		const userAmin = generateUser();
		const memberVish = generateMember({ user: userVish });
		const memberAmin = generateMember({ user: userAmin });
		const mockedChannelResponse = generateChannel({
			members: [memberVish, memberAmin],
		});
		clientVish.post = () => getOrCreateChannelApi(mockedChannelResponse).response.data;

		// Lets start testing
		const channelVish_copy1 = clientVish.channel('messaging', undefined, {
			members: [userAmin.id, userVish.id],
		});

		const tmpCid = `${channelType}:!members-${[userVish.id, userAmin.id].sort().join(',')}`;

		// activeChannels should have tmpCid now.
		expect(Object.keys(clientVish.activeChannels)).to.contain(tmpCid);
		expect(clientVish.activeChannels[tmpCid]).to.contain(channelVish_copy1);

		await channelVish_copy1.watch();

		// tempCid should be replaced with actual cid at this point.
		expect(Object.keys(clientVish.activeChannels)).to.not.contain(tmpCid);
		expect(Object.keys(clientVish.activeChannels)).to.contain(channelVish_copy1.cid);
		expect(clientVish.activeChannels[channelVish_copy1.cid]).to.contain(channelVish_copy1);

		const channelVish_copy2 = clientVish.channel('messaging', undefined, {
			members: [userVish.id, userAmin.id],
		});

		// Should not populate tmpCid again.
		expect(Object.keys(clientVish.activeChannels)).to.not.contain(tmpCid);

		await channelVish_copy2.watch();
		expect(channelVish_copy1).to.be.equal(channelVish_copy2);
	});

	it('channel created using member list - case 4', async () => {
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
		clientVish.post = () => getOrCreateChannelApi(mockedChannelResponse).response.data;

		// Case 1 =======================>
		const channelVish_copy1 = clientVish.channel('messaging', undefined, {
			members: [userAmin.id, userVish.id],
		});

		const tmpCid = `${channelType}:!members-${[userVish.id, userAmin.id].sort().join(',')}`;

		// activeChannels should have tmpCid now.
		expect(Object.keys(clientVish.activeChannels)).to.contain(tmpCid);
		expect(clientVish.activeChannels[tmpCid]).to.contain(channelVish_copy1);

		const channelVish_copy2 = clientVish.channel('messaging', undefined, {
			members: [userVish.id, userAmin.id],
		});

		// activeChannels still should have tmpCid now.
		expect(Object.keys(clientVish.activeChannels)).to.contain(tmpCid);
		expect(clientVish.activeChannels[tmpCid]).to.contain(channelVish_copy2);

		await channelVish_copy1.watch();
		await channelVish_copy2.watch();

		expect(channelVish_copy1).to.be.equal(channelVish_copy2);
	});

	it('channel created using type only', async () => {
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
		clientVish.post = () => getOrCreateChannelApi(mockedChannelResponse).response.data;

		// Case 1 =======================>
		const channelVish_copy1 = clientVish.channel('messaging', undefined, {
			custom: 'X',
		});

		const tmpCid = `${channelType}:!members-${[userVish.id, userAmin.id].sort().join(',')}`;

		// activeChannels should have tmpCid now.
		expect(Object.keys(clientVish.activeChannels)).not.to.contain(tmpCid);

		const channelVish_copy2 = clientVish.channel('messaging', undefined, {
			custom: 'X',
		});

		// activeChannels still should have tmpCid now.
		expect(Object.keys(clientVish.activeChannels)).not.to.contain(tmpCid);

		expect(Object.keys(clientVish.activeChannels)).not.to.contain(channelVish_copy1.cid);
		expect(Object.keys(clientVish.activeChannels)).not.to.contain(channelVish_copy2.cid);

		await channelVish_copy1.watch();
		await channelVish_copy2.watch();

		expect(channelVish_copy1).not.to.be.equal(channelVish_copy2);

		expect(Object.keys(clientVish.activeChannels)).to.contain(channelVish_copy1.cid);
		expect(Object.keys(clientVish.activeChannels)).to.contain(channelVish_copy2.cid);
		expect(clientVish.activeChannels[channelVish_copy1.cid]).not.to.contain(channelVish_copy2);
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
			expect(config.payload.sort).to.be.eql([{ field: 'updated_at', direction: -1 }]);
		};
		await channel.search('query', { sort: [{ updated_at: -1 }] });
	});
	it('search with sorting by custom field', async () => {
		client.get = (url, config) => {
			expect(config.payload.sort).to.be.eql([{ field: 'custom_field', direction: -1 }]);
		};
		await channel.search('query', { sort: [{ custom_field: -1 }] });
	});
	it('sorting and offset works', async () => {
		await expect(channel.search('query', { offset: 1, sort: [{ custom_field: -1 }] })).to.be.fulfilled;
	});
	it('next and offset fails', async () => {
		await expect(channel.search('query', { offset: 1, next: 'next' })).to.be.rejectedWith(Error);
	});
});

describe('Channel lastMessage', async () => {
	const client = await getClientWithUser();
	const channel = client.channel('messaging', uuidv4());

	it('should return last message - messages are in order', () => {
		channel.state = new ChannelState();
		const latestMessageDate = '2018-01-01T00:13:24';
		channel.state.addMessagesSorted([
			generateMsg({ date: '2018-01-01T00:00:00' }),
			generateMsg({ date: '2018-01-01T00:02:00' }),
			generateMsg({ date: latestMessageDate }),
		]);

		expect(channel.lastMessage().created_at.getTime()).to.be.equal(new Date(latestMessageDate).getTime());
	});

	it('should return last message - messages are out of order', () => {
		channel.state = new ChannelState();
		const latestMessageDate = '2018-01-01T00:13:24';
		channel.state.addMessagesSorted([
			generateMsg({ date: latestMessageDate }),
			generateMsg({ date: '2018-01-01T00:02:00' }),
			generateMsg({ date: '2018-01-01T00:00:00' }),
		]);

		expect(channel.lastMessage().created_at.getTime()).to.be.equal(new Date(latestMessageDate).getTime());
	});

	it('should return last message - state has more message sets loaded', () => {
		channel.state = new ChannelState();
		const latestMessageDate = '2018-01-01T00:13:24';
		const latestMessages = [
			generateMsg({ date: latestMessageDate }),
			generateMsg({ date: '2018-01-01T00:02:00' }),
			generateMsg({ date: '2018-01-01T00:00:00' }),
		];
		const otherMessages = [
			generateMsg({ date: '2017-11-21T00:05:33' }),
			generateMsg({ date: '2017-11-21T00:05:35' }),
		];
		channel.state.addMessagesSorted(latestMessages);
		channel.state.addMessagesSorted(otherMessages, 'new');

		expect(channel.lastMessage().created_at.getTime()).to.be.equal(new Date(latestMessageDate).getTime());
	});
});

describe('Channel _initializeState', () => {
	it('should not keep members that have unwatched since last watch', async () => {
		const client = await getClientWithUser();
		const channel = client.channel('messaging', uuidv4());

		const firstState = {
			members: [
				{
					user: {
						id: 'alice',
					},
				},
				{
					user: {
						id: 'bob',
					},
				},
			],
		};

		channel._initializeState(firstState);

		expect(Object.keys(channel.state.members)).deep.to.be.equal(['alice', 'bob']);

		const secondState = {
			members: [
				{
					user: {
						id: 'alice',
					},
				},
			],
		};

		channel._initializeState(secondState);

		expect(Object.keys(channel.state.members)).deep.to.be.equal(['alice']);
	});
});
