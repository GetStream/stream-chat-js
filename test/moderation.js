import { v4 as uuidv4 } from 'uuid';
import {
	getTestClientForUser,
	createUsers,
	getTestClient,
	createUserToken,
	expectHTTPErrorCode,
	sleep,
	createEventWaiter,
	getServerTestClient,
} from './utils';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

const expect = chai.expect;

if (process.env.NODE_ENV !== 'production') {
	require('longjohn');
}

const Promise = require('bluebird');
Promise.config({
	longStackTraces: true,
	warnings: {
		wForgottenReturn: false,
	},
});

chai.use(chaiAsPromised);

describe('show ban status on member', function () {
	const guyonID = `guyon-${uuidv4()}`;
	const evilID = `evil-${uuidv4()}`;

	const channelID = `channel-${uuidv4()}`;
	let channel;

	const client = getTestClient(true);

	before(async function () {
		await createUsers([guyonID, evilID]);
		channel = client.channel('livestream', channelID, {
			members: [guyonID, evilID],
			created_by_id: guyonID,
		});
		await channel.create();
	});

	it('should show ban status on member on watch() after banUser', async function () {
		await channel.banUser(evilID, { user_id: guyonID });

		const userClient = await getTestClientForUser(evilID);
		const resp = await userClient.channel('livestream', channelID).watch();

		let isBanned;
		resp.members.forEach((member) => {
			if (member.user.id === evilID) isBanned = member.banned;
		});

		expect(isBanned).to.eq(true);
	});

	it('should not show ban status on member on watch() after unbanUser()', async function () {
		await channel.unbanUser(evilID, { user_id: guyonID });

		const userClient = await getTestClientForUser(evilID);
		const resp = await userClient.channel('livestream', channelID).watch();

		let isBanned;
		resp.members.forEach((member) => {
			if (member.user.id === evilID) isBanned = member.banned;
		});

		expect(isBanned).to.eq(false);
	});

	it('should not show ban status on member on watch() after expiration', async function () {
		await channel.banUser(evilID, { user_id: guyonID, timeout: -10 });

		const userClient = await getTestClientForUser(evilID);
		const resp = await userClient.channel('livestream', channelID).watch();

		let isBanned;
		resp.members.forEach((member) => {
			if (member.user.id === evilID) isBanned = member.banned;
		});

		expect(isBanned).to.eq(false);
	});

	it('should still show ban status on member on watch() after re-join', async function () {
		await channel.banUser(evilID, { user_id: guyonID });
		await channel.removeMembers([evilID]);
		await channel.addMembers([evilID]);

		const userClient = await getTestClientForUser(evilID);
		const resp = await userClient.channel('livestream', channelID).watch();

		let isBanned;
		resp.members.forEach((member) => {
			if (member.user.id === evilID) isBanned = member.banned;
		});

		expect(isBanned).to.eq(true);
	});
});

describe('shadow banning users in a channel', function () {
	const client = getTestClient(true);

	const admin = `admin-${uuidv4()}`;
	const bannedFromChannel = `bannedFromChannel-${uuidv4()}`;
	const someoneElse = `someoneElse-${uuidv4()}`;

	const channelID = `channel-${uuidv4()}`;
	let channel;

	let shadowBannedMessageID, notShadowBannedMessageID;

	before(async function () {
		await createUsers([admin, someoneElse, bannedFromChannel]);

		await client.updateUser({ id: admin, role: 'admin' });

		channel = client.channel('livestream', channelID, {
			members: [bannedFromChannel, someoneElse],
			created_by_id: admin,
		});
		await channel.create();
		await channel.addModerators([admin]);
	});

	it('should shadow ban a user from a channel', async function () {
		await channel.shadowBan(bannedFromChannel, { user_id: admin });
	});

	it('should not show messages as "shadowed" to sender in sendMessage() response', async function () {
		const userClient = await getTestClientForUser(bannedFromChannel);
		const chan = userClient.channel('livestream', channelID);
		await chan.watch();
		const response = await chan.sendMessage({
			text: 'hi, this message is shadow banned!',
		});
		shadowBannedMessageID = response.message.id;
		expect(response.message.shadowed).to.eq(false);
	});

	it('should not show messages as "shadowed" to sender in getMessage() response', async function () {
		const userClient = await getTestClientForUser(bannedFromChannel);
		const chan = userClient.channel('livestream', channelID);
		await chan.watch();
		const response = await userClient.getMessage(shadowBannedMessageID);
		expect(response.message.shadowed).to.eq(false);
	});

	it('should show messages as "shadowed" to others', async function () {
		const userClient = await getTestClientForUser(someoneElse);
		const response = await userClient.getMessage(shadowBannedMessageID);
		expect(response.message.shadowed).to.eq(true);
	});

	it('should not show messages as "shadowed" to sender in updateMessage() response', async function () {
		const userClient = await getTestClientForUser(bannedFromChannel);
		const response = await userClient.updateMessage({
			id: shadowBannedMessageID,
			text: 'hi, this message is still definitely shadow banned!',
		});
		expect(response.message.shadowed).to.eq(false);
	});

	it('should not show messages as "shadowed" to sender in getMessage() response after updateMessage()', async function () {
		const userClient = await getTestClientForUser(bannedFromChannel);
		const chan = userClient.channel('livestream', channelID);
		await chan.watch();
		const response = await userClient.getMessage(shadowBannedMessageID);
		expect(response.message.shadowed).to.eq(false);
	});

	it('should still show messages as "shadowed" to others after update()', async function () {
		const userClient = await getTestClientForUser(someoneElse);
		const response = await userClient.getMessage(shadowBannedMessageID);
		expect(response.message.shadowed).to.eq(true);
	});

	it('should not show user as shadowed in queryChannels output to sender', async function () {
		const userClient = await getTestClientForUser(bannedFromChannel);
		const response = await userClient.queryChannels({ id: channelID });
		expect(response[0].state.members[bannedFromChannel].shadow_banned).to.eq(false);
	});

	it('should show user as shadowed in queryChannels output to moderators', async function () {
		const userClient = await getTestClientForUser(admin);
		const response = await userClient.queryChannels({ id: channelID });
		expect(response[0].state.members[bannedFromChannel].shadow_banned).to.eq(true);
	});

	it('should not show user as shadowed in queryMembers output to sender', async function () {
		const userClient = await getTestClientForUser(bannedFromChannel);
		const chan = userClient.channel('livestream', channelID);
		await chan.watch();
		const response = await chan.queryMembers({ id: bannedFromChannel });
		expect(response.members[0].shadow_banned).to.eq(false);
	});

	it('should show user as shadowed in queryMembers output to moderators', async function () {
		const userClient = await getTestClientForUser(admin);
		const chan = userClient.channel('livestream', channelID);
		await chan.watch();
		const response = await chan.queryMembers({ id: bannedFromChannel });
		expect(response.members[0].shadow_banned).to.eq(true);
	});

	it('should remove a shadow ban from a channel', async function () {
		await channel.removeShadowBan(bannedFromChannel);
	});

	it('should still not show messages as "shadowed" to sender in sendMessage() response after removeShadowBan()', async function () {
		const userClient = await getTestClientForUser(bannedFromChannel);
		const chan = userClient.channel('livestream', channelID);
		await chan.watch();
		const response = await chan.sendMessage({
			text: 'hi, this message is NOT shadow banned!',
		});
		notShadowBannedMessageID = response.message.id;
		expect(response.message.shadowed).to.eq(false);
	});

	it('should not show messages as "shadowed" to others after removeShadowBan()', async function () {
		const userClient = await getTestClientForUser(someoneElse);
		const response = await userClient.getMessage(notShadowBannedMessageID);
		expect(response.message.shadowed).to.eq(false);
	});
});

describe('shadow banning users from global app', function () {
	const client = getTestClient(true);

	const admin = `admin-${uuidv4()}`;
	const bannedFromApp = `bannedFromApp-${uuidv4()}`;
	const someoneElse = `someoneElse-${uuidv4()}`;

	const channelID = `channel-${uuidv4()}`;
	let channel;

	let shadowBannedMessageID;

	before(async function () {
		await createUsers([admin, someoneElse, bannedFromApp]);

		await client.updateUser({ id: admin, role: 'admin' });

		channel = client.channel('livestream', channelID, {
			members: [bannedFromApp, someoneElse],
			created_by_id: admin,
		});
		await channel.create();
		await channel.addModerators([admin]);
	});

	it('should shadow ban a user from a global app', async function () {
		await client.shadowBan(bannedFromApp, { user_id: admin });
	});

	it('should not show user or messages as "shadowed" to sender in sendMessage() response', async function () {
		const userClient = await getTestClientForUser(bannedFromApp);
		const chan = userClient.channel('livestream', channelID);
		await chan.watch();
		const response = await chan.sendMessage({
			text: 'hi, this message is shadow banned!',
		});
		shadowBannedMessageID = response.message.id;
		expect(response.message.shadowed).to.eq(false);
	});

	it('should not show user or messages as "shadowed" to sender in getMessage() response', async function () {
		const userClient = await getTestClientForUser(bannedFromApp);
		const chan = userClient.channel('livestream', channelID);
		await chan.watch();
		const response = await userClient.getMessage(shadowBannedMessageID);
		expect(response.message.shadowed).to.eq(false);
	});

	it('should not show user as shadowed in queryChannels output to sender', async function () {
		const userClient = await getTestClientForUser(bannedFromApp);
		const response = await userClient.queryChannels({ id: channelID });
		expect(response[0].state.members[bannedFromApp].shadow_banned).to.eq(false);
	});

	it('should show user as shadowed in queryChannels output to moderators', async function () {
		const userClient = await getTestClientForUser(admin);
		const response = await userClient.queryChannels({ id: channelID });
		expect(response[0].state.members[bannedFromApp].shadow_banned).to.eq(true);
	});

	it('should not show user as shadowed in queryUsers output to sender', async function () {
		const userClient = await getTestClientForUser(bannedFromApp);
		const response = await userClient.queryUsers({ id: bannedFromApp });
		expect(response.users[0].shadow_banned).to.eq(undefined);
	});

	it('should show user as shadowed in queryUsers output to admins', async function () {
		const userClient = await getTestClientForUser(admin);
		const response = await userClient.queryUsers({ id: bannedFromApp });
		expect(response.users[0].shadow_banned).to.eq(true);
	});

	it('should not return shadowed user in queryUsers filter output to sender', async function () {
		const userClient = await getTestClientForUser(bannedFromApp);
		const promise = userClient.queryUsers({ id: bannedFromApp, shadow_banned: true });
		await expect(promise).to.be.rejectedWith(
			'StreamChat error code 17: QueryUsers failed with error: "users with role "user" are not allowed to filter on shadow_banned"',
		);
	});

	it('should return shadowed user in queryUsers filter output to admins', async function () {
		const userClient = await getTestClientForUser(admin);
		let response = await userClient.queryUsers({
			id: bannedFromApp,
			shadow_banned: true,
		});
		expect(response.users.length).to.eq(1);
		response = await userClient.queryUsers({
			id: bannedFromApp,
			shadow_banned: false,
		});
		expect(response.users.length).to.eq(0);
	});

	it('should not show user as shadowed in queryMembers output to sender', async function () {
		const userClient = await getTestClientForUser(bannedFromApp);
		const chan = userClient.channel('livestream', channelID);
		await chan.watch();
		const response = await chan.queryMembers({ id: bannedFromApp });
		expect(response.members[0].shadow_banned).to.eq(false);
	});

	it('should show user as shadowed in queryMembers output to moderators', async function () {
		const userClient = await getTestClientForUser(admin);
		const chan = userClient.channel('livestream', channelID);
		await chan.watch();
		const response = await chan.queryMembers({ id: bannedFromApp });
		expect(response.members[0].shadow_banned).to.eq(true);
	});

	it('should show user and messages as "shadowed" to others', async function () {
		const userClient = await getTestClientForUser(someoneElse);
		const response = await userClient.getMessage(shadowBannedMessageID);
		expect(response.message.shadowed).to.eq(true);
	});

	it('should not show user or messages as "shadowed" to sender in updateMessage() response', async function () {
		const userClient = await getTestClientForUser(bannedFromApp);
		const response = await userClient.updateMessage({
			id: shadowBannedMessageID,
			text: 'hi, this message is still definitely shadow banned!',
		});
		expect(response.message.shadowed).to.eq(false);
	});

	it('should not show user or messages as "shadowed" to sender in getMessage() response after updateMessage()', async function () {
		const userClient = await getTestClientForUser(bannedFromApp);
		const chan = userClient.channel('livestream', channelID);
		await chan.watch();
		const response = await userClient.getMessage(shadowBannedMessageID);
		expect(response.message.shadowed).to.eq(false);
	});

	it('should still show user or messages as "shadowed" to others after update()', async function () {
		const userClient = await getTestClientForUser(someoneElse);
		const response = await userClient.getMessage(shadowBannedMessageID);
		expect(response.message.shadowed).to.eq(true);
	});

	it('should remove a shadow ban from global app', async function () {
		await client.removeShadowBan(bannedFromApp);
	});

	it('should still not show messages as "shadowed" to sender in sendMessage() response after removeShadowBan()', async function () {
		const userClient = await getTestClientForUser(bannedFromApp);
		const chan = userClient.channel('livestream', channelID);
		await chan.watch();
		const response = await chan.sendMessage({
			text: 'hi, this message is NOT shadow banned!',
		});
		shadowBannedMessageID = response.message.id;
		expect(response.message.shadowed).to.eq(false);
	});

	it('should not show messages as "shadowed" to others after removeShadowBan()', async function () {
		const userClient = await getTestClientForUser(someoneElse);
		const response = await userClient.getMessage(shadowBannedMessageID);
		expect(response.message.shadowed).to.eq(false);
	});
});

describe('block list moderation CRUD', () => {
	const client = getServerTestClient();

	it('list available blocklists', async () => {
		const response = await client.listBlockLists();
		expect(response.blocklists).to.have.length(1);
	});

	it('get blocklist profanity_en_2020_v1', async () => {
		const response = await client.getBlockList('profanity_en_2020_v1');
		expect(response.blocklist.name).to.eq('profanity_en_2020_v1');
	});

	it('create a new blocklist', async () => {
		const words = ['fudge', 'cream', 'sugar'];
		await client.createBlockList({
			name: 'no-cakes',
			words,
		});
	});

	it('list available blocklists', async () => {
		const response = await client.listBlockLists();
		expect(response.blocklists).to.have.length(2);
	});

	it('get blocklist info', async () => {
		const response = await client.getBlockList('no-cakes');
		expect(response.blocklist.name).to.eq('no-cakes');
		expect(response.blocklist.words).to.eql(['fudge', 'cream', 'sugar']);
	});

	it('update a default blocklist should fail', async () => {
		const p = client.updateBlockList('profanity_en_2020_v1', {
			words: ['fudge', 'cream', 'sugar', 'vanilla'],
		});
		await expect(p).to.be.rejectedWith(
			`cannot update the builtin block list "profanity_en_2020_v1"`,
		);
	});

	it('update blocklist', async () => {
		await client.updateBlockList('no-cakes', {
			words: ['fudge', 'cream', 'sugar', 'vanilla'],
		});
	});

	it('get blocklist info again', async () => {
		const response = await client.getBlockList('no-cakes');
		expect(response.blocklist.name).to.eq('no-cakes');
		expect(response.blocklist.words).to.eql(['fudge', 'cream', 'sugar', 'vanilla']);
	});

	it('use the blocklist for a channel type', async () => {
		await client.updateChannelType('messaging', {
			blocklist: 'no-cakes',
			blocklist_behavior: 'block',
		});
	});

	it('should block messages that match the blocklist', async () => {
		const userClient = await getTestClientForUser('tommaso');
		const chan = userClient.channel('messaging', 'caaakes');
		await chan.watch();
		const response = await chan.sendMessage({
			text: 'put some sugar and fudge on that!',
		});
		expect(response.message.text).to.eql('Automod blocked your message');
		expect(response.message.type).to.eql('error');
	});

	it('update blocklist again', async () => {
		await client.updateBlockList('no-cakes', {
			words: ['fudge', 'cream', 'sugar', 'vanilla', 'jam'],
		});
	});

	it('should block messages that match the blocklist', async () => {
		const userClient = await getTestClientForUser('tommaso');
		const chan = userClient.channel('messaging', 'caaakes');
		await chan.watch();
		const response = await chan.sendMessage({
			text: 'you should add more jam there ;)',
		});
		expect(response.message.text).to.eql('Automod blocked your message');
		expect(response.message.type).to.eql('error');
	});

	it('delete a blocklist', async () => {
		await client.deleteBlockList('no-cakes');
	});

	it('should not block messages anymore', async () => {
		const userClient = await getTestClientForUser('tommaso');
		const chan = userClient.channel('messaging', 'caaakes');
		await chan.watch();
		const response = await chan.sendMessage({
			text: 'put some sugar and fudge on that!',
		});
		expect(response.message.text).to.eql('put some sugar and fudge on that!');
	});

	it('list available blocklists', async () => {
		const response = await client.listBlockLists();
		expect(response.blocklists).to.have.length(1);
	});

	it('delete a default blocklist should fail', async () => {
		const p = client.deleteBlockList('profanity_en_2020_v1');
		await expect(p).to.be.rejectedWith(
			`cannot delete the builtin block list "profanity_en_2020_v1"`,
		);
	});
});

describe('Moderation', function () {
	it('Mute', async function () {
		const user1 = uuidv4();
		const user2 = uuidv4();
		await createUsers([user1, user2]);
		const client1 = await getTestClientForUser(user1);

		const eventPromise = new Promise((resolve) => {
			// verify that the notification is sent
			client1.on('notification.mutes_updated', (e) => {
				expect(e.me.mutes.length).to.equal(1);
				resolve();
			});
		});
		const response = await client1.muteUser(user2);
		expect(response.mute.created_at).to.not.be.undefined;
		expect(response.mute.updated_at).to.not.be.undefined;
		expect(response.mute.user.id).to.equal(user1);
		expect(response.mute.target.id).to.equal(user2);
		// verify we return the right user mute upon connect
		const client = getTestClient(false);
		const connectResponse = await client.setUser(
			{ id: user1 },
			createUserToken(user1),
		);
		expect(connectResponse.me.mutes.length).to.equal(1);
		expect(connectResponse.me.mutes[0].target.id).to.equal(user2);
		await eventPromise;
	});

	it('Mute with expiration', async function () {
		const user1 = uuidv4();
		const user2 = uuidv4();
		await createUsers([user1, user2]);
		const client1 = await getTestClientForUser(user1);

		const eventPromise = new Promise((resolve) => {
			// verify that the notification is sent
			client1.on('notification.mutes_updated', (e) => {
				expect(e.me.mutes.length).to.equal(1);
				resolve();
			});
		});
		const response = await client1.muteUser(user2, null, { timeout: 10 });
		expect(response.mute.created_at).to.not.be.undefined;
		expect(response.mute.updated_at).to.not.be.undefined;
		expect(response.mute.expires).to.not.be.undefined;
		expect(response.mute.user.id).to.equal(user1);
		expect(response.mute.target.id).to.equal(user2);
		// verify we return the right user mute upon connect
		const client = getTestClient(false);
		const connectResponse = await client.setUser(
			{ id: user1 },
			createUserToken(user1),
		);
		expect(connectResponse.me.mutes.length).to.equal(1);
		expect(connectResponse.me.mutes[0].target.id).to.equal(user2);
		await eventPromise;
	});

	it('Mute after sendMessage', async function () {
		const user1 = uuidv4();
		const user2 = uuidv4();
		await createUsers([user1, user2]);
		const client1 = await getTestClientForUser(user1);
		const response = await client1.muteUser(user2);
		expect(response.mute.created_at).to.not.be.undefined;
		expect(response.mute.updated_at).to.not.be.undefined;
		expect(response.mute.user.id).to.equal(user1);
		expect(response.mute.target.id).to.equal(user2);
		await client1.channel('livestream', 'inglorious').create();
		await client1
			.channel('livestream', 'inglorious')
			.sendMessage({ text: 'yototototo' });
		// verify we return the right user mute upon connect
		const client = getTestClient(false);
		const connectResponse = await client.setUser(
			{ id: user1 },
			createUserToken(user1),
		);
		expect(connectResponse.me.mutes.length).to.equal(1);
		expect(connectResponse.me.mutes[0].target.id).to.equal(user2);
	});

	it('Unmute', async function () {
		const user1 = uuidv4();
		const user2 = uuidv4();
		await createUsers([user1, user2]);
		const client1 = await getTestClientForUser(user1);
		await client1.muteUser(user2);

		const eventPromise = new Promise((resolve) => {
			// verify that the notification is sent
			client1.on('notification.mutes_updated', (e) => {
				if (e.me.mutes.length === 0) {
					resolve();
				}
			});
		});

		await client1.unmuteUser(user2);

		// wait notification
		await eventPromise;

		// verify we return the right user mute upon connect
		const client = getTestClient(false);
		const connectResponse = await client.setUser(
			{ id: user1 },
			createUserToken(user1),
		);
		expect(connectResponse.me.mutes.length).to.equal(0);
	});
});

describe('mute channels', function () {
	const user1 = uuidv4();
	const user2 = uuidv4();
	let client1;
	const mutedChannelId = uuidv4();
	it('mute channel and expect notification)', async function () {
		await createUsers([user1, user2]);
		client1 = await getTestClientForUser(user1);

		const eventPromise = new Promise((resolve) => {
			const onChannelMute = (e) => {
				expect(e.me.channel_mutes.length).to.equal(1);
				const mute = e.me.channel_mutes[0];
				expect(mute.created_at).to.not.be.undefined;
				expect(mute.updated_at).to.not.be.undefined;
				expect(mute.user.id).to.equal(user1);
				expect(mute.channel.cid).to.equal(channel.cid);
				expect(mute.target).to.be.undefined;
				resolve();
				//cleanup
				client1.off('notification.channel_mutes_updated', onChannelMute);
			};
			// verify that the notification is sent
			client1.on('notification.channel_mutes_updated', onChannelMute);
		});

		const channel = client1.channel('messaging', mutedChannelId, {
			members: [user1, user2],
		});
		await channel.create();

		const response = await channel.mute();
		expect(response.channel_mute.created_at).to.not.be.undefined;
		expect(response.channel_mute.updated_at).to.not.be.undefined;
		expect(response.channel_mute.user.id).to.equal(user1);
		expect(response.channel_mute.channel.cid).to.equal(channel.cid);
		expect(response.channel_mute.target).to.be.undefined;

		// verify we return the right channel mute upon connect
		const client = getTestClient(false);
		const connectResponse = await client.setUser(
			{ id: user1 },
			createUserToken(user1),
		);
		expect(connectResponse.me.channel_mutes.length).to.equal(1);
		expect(connectResponse.me.channel_mutes[0].target).to.be.undefined;
		expect(connectResponse.me.channel_mutes[0].channel.cid).to.equal(channel.cid);
		await eventPromise;
	});

	it('sending messages to muted channels dont increment unread counts', async function () {
		const client2 = await getTestClientForUser(user2);
		await client2
			.channel('messaging', mutedChannelId)
			.sendMessage({ text: 'message to muted channel' });

		const client = getTestClient(false);
		const connectResponse = await client.setUser(
			{ id: user1 },
			createUserToken(user1),
		);
		expect(connectResponse.me.total_unread_count).to.equal(0);
		expect(connectResponse.me.unread_channels).to.be.equal(0);
	});

	it('query muted channels', async function () {
		const resp = await client1.queryChannels({
			muted: true,
			members: { $in: [user1] },
		});
		expect(resp.length).to.be.equal(1);
		expect(resp[0].id).to.be.equal(mutedChannelId);
	});

	it('query muted channels with other filters', async function () {
		const resp = await client1.queryChannels({
			members: { $in: [user1] },
			muted: true,
		});
		expect(resp.length).to.be.equal(1);
		expect(resp[0].id).to.be.equal(mutedChannelId);
	});

	it('exclude muted channels', async function () {
		const resp = await client1.queryChannels({
			muted: false,
			members: { $in: [user1] },
		});
		expect(resp.length).to.be.equal(0);
	});

	it('unmute channel ', async function () {
		const eventPromise = new Promise((resolve) => {
			const onChannelMute = (e) => {
				expect(e.me.channel_mutes.length).to.equal(0);
				resolve();
				//cleanup
				client1.off('notification.channel_mutes_updated', onChannelMute);
			};
			// verify that the notification is sent
			client1.on('notification.channel_mutes_updated', onChannelMute);
		});

		await client1.channel('messaging', mutedChannelId).unmute();

		// verify we return the right channel mute upon connect
		const client = getTestClient(false);
		const connectResponse = await client.setUser(
			{ id: user1 },
			createUserToken(user1),
		);
		expect(connectResponse.me.channel_mutes.length).to.equal(0);
		await eventPromise;
	});

	it('muted and mute_expires_at are reserved fields', async function () {
		const channel = client1.channel('messaging', uuidv4(), {
			muted: true,
			mute_expires_at: new Date(),
		});
		await expectHTTPErrorCode(
			400,
			channel.create(),
			'StreamChat error code 4: GetOrCreateChannel failed with error: "data.mute_expires_at is a reserved field, data.muted is a reserved field"',
		);
	});

	it('mute non existing channel must fail', async function () {
		const id = uuidv4();
		await expectHTTPErrorCode(
			400,
			client1.channel('messaging', id).mute(),
			`StreamChat error code 4: MuteChannel failed with error: "some channels do not exist or were deleted: (messaging:${id})"`,
		);
	});

	it('ummute non existing channel must fail', async function () {
		const id = uuidv4();
		await expectHTTPErrorCode(
			400,
			client1.channel('messaging', id).unmute(),
			`StreamChat error code 4: UnmuteChannel failed with error: "some channels do not exist or were deleted: (messaging:${id})"`,
		);
	});

	it('mute server side require an user to be specified', async function () {
		const client = getTestClient(true);
		const channel = client.channel('messaging', uuidv4(), {
			created_by_id: user1,
			members: [user1],
		});
		await channel.create();

		await expectHTTPErrorCode(
			400,
			channel.mute(),
			`StreamChat error code 4: MuteChannel failed with error: "either user or user_id must be provided when using server side auth."`,
		);
	});

	it('unmute server side require an user to be specified', async function () {
		const client = getTestClient(true);
		const channel = client.channel('messaging', uuidv4(), {
			created_by_id: user1,
			members: [user1],
		});
		await channel.create();

		await expectHTTPErrorCode(
			400,
			channel.unmute(),
			`StreamChat error code 4: UnmuteChannel failed with error: "either user or user_id must be provided when using server side auth."`,
		);
	});

	it('mute channel with expiration', async function () {
		const user = uuidv4();
		await createUsers([user]);
		client1 = await getTestClientForUser(user);

		const channel = client1.channel('messaging', uuidv4(), { members: [user] });
		await channel.create();

		// mute will expire in 500 milliseconds
		await channel.mute({ expiration: 500 });

		let client = await getTestClientForUser(user);
		expect(client.health.me.channel_mutes.length).to.equal(1);

		await sleep(500);
		// mute should be expired and not returned
		client = await getTestClientForUser(user);
		expect(client.health.me.channel_mutes.length).to.equal(0);
		// expired muted should not be returned in query channels
		let resp = await client1.queryChannels({
			muted: true,
			members: { $in: [user] },
		});
		expect(resp.length).to.be.equal(0);

		// return only non muted channels
		resp = await client1.queryChannels({ muted: false, members: { $in: [user] } });
		expect(resp.length).to.be.equal(1);

		expect(resp[0].cid).to.be.equal(channel.cid);
	});
});

describe('channel muteStatus', function () {
	let channel;
	const userID = uuidv4();
	let client;

	before(async function () {
		client = await getTestClientForUser(userID);
		channel = client.channel('messaging', uuidv4());
		await channel.watch();
	});

	it('add mute update internal mute state', async function () {
		const muteUpdatedEvent = createEventWaiter(
			client,
			'notification.channel_mutes_updated',
		);
		await channel.mute();
		await expect(muteUpdatedEvent).to.be.fulfilled.then(function (muteEvent) {
			expect(muteEvent.length).to.be.equal(1);
			expect(muteEvent[0].me.channel_mutes.length).to.be.equal(1);
			const muteStatus = channel.muteStatus();
			expect(muteStatus.muted).to.be.true;
			expect(muteStatus.expiresAt).to.be.null;
			expect(muteStatus.createdAt.getTime()).to.be.equal(
				new Date(muteEvent[0].me.channel_mutes[0].created_at).getTime(),
			);
		});
	});

	it('setUser populate internal mute state', async function () {
		const c = await getTestClientForUser(userID);
		expect(c.health.me.channel_mutes.length).to.be.equal(1);
		expect(c.health.me.channel_mutes[0].channel.cid).to.be.equal(channel.cid);
		await c.disconnect(5000);
	});

	it('remove mute update internal mute state', async function () {
		const UnmuteUpdatedEvent = createEventWaiter(
			client,
			'notification.channel_mutes_updated',
		);
		await channel.unmute();
		await expect(UnmuteUpdatedEvent).to.be.fulfilled.then(function (muteEvent) {
			expect(muteEvent.length).to.be.equal(1);
			const muteStatus = channel.muteStatus();
			expect(muteStatus.muted).to.be.false;
			expect(muteStatus.expiresAt).to.be.null;
		});
	});

	it('muteStatus properly detect expired mutes', async function () {
		const MuteUpdatedEvent = createEventWaiter(
			client,
			'notification.channel_mutes_updated',
		);
		await channel.mute({ expiration: 1000 });
		await expect(MuteUpdatedEvent).to.be.fulfilled;

		let muteStatus = channel.muteStatus();
		expect(muteStatus.muted).to.be.true;
		await sleep(1000);
		muteStatus = channel.muteStatus();
		expect(muteStatus.muted).to.be.false;
	});
});
