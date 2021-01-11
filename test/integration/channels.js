import { v4 as uuidv4 } from 'uuid';

import {
	createUsers,
	createUserToken,
	expectHTTPErrorCode,
	getTestClient,
	getTestClientForUser,
	getServerTestClient,
	sleep,
	createEventWaiter,
	randomUnicodeString,
} from './utils';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { get } from 'https';

const expect = chai.expect;

chai.use(chaiAsPromised);

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

describe('query by frozen', function () {
	let client;
	let channel;
	const user = uuidv4();
	before(async function () {
		await createUsers([user]);
		client = await getTestClientForUser(user);
		channel = client.channel('messaging', uuidv4(), {
			members: [user],
		});
		await channel.create();
	});

	it('frozen:false should return 1 active channels', async function () {
		const resp = await client.queryChannels({
			members: { $in: [user] },
			frozen: false,
		});
		expect(resp.length).to.be.equal(1);
		expect(resp[0].cid).to.be.equal(channel.cid);
	});

	it('frozen:true should return 0 results', async function () {
		const resp = await client.queryChannels({
			members: { $in: [user] },
			frozen: true,
		});
		expect(resp.length).to.be.equal(0);
	});

	it('mark the channel as frozen and search frozen:true should return 1 result', async function () {
		await channel.update({ frozen: true });
		const resp = await client.queryChannels({
			members: { $in: [user] },
			frozen: true,
		});
		expect(resp.length).to.be.equal(1);
		expect(resp[0].cid).to.be.equal(channel.cid);
	});

	it('send messages on a frozen channel should fail', async function () {
		const resp = await channel.sendMessage({ text: 'hi' });
		expect(resp.message.text).to.be.equal(
			'Sorry, this channel has been frozen by the admin',
		);
	});

	it('remove the frozen property and search frozen:false should return 1 result', async function () {
		await channel.update({ frozen: false });
		const resp = await client.queryChannels({
			members: { $in: [user] },
			frozen: false,
		});
		expect(resp.length).to.be.equal(1);
		expect(resp[0].cid).to.be.equal(channel.cid);
	});
});

describe('Channels - Constructor', function () {
	const client = getServerTestClient();

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

describe('Channels - Create', function () {
	const johnID = `john-${uuidv4()}`;

	it('john creates a channel with members', async function () {
		const c = await getTestClientForUser(johnID);
		const channelId = uuidv4();
		const johnChannel = c.channel('messaging', channelId, {
			color: 'green',
			members: [johnID],
		});
		const response = await johnChannel.create();
		expect(response.channel.color).to.equal('green');
		const cid = `messaging:${channelId}`;
		expect(response.channel.cid).to.equal(cid);
		expect(response.channel.members).to.equal(undefined);
		expect(response.members.length).to.equal(1);

		const queryResponse = await c.queryChannels({ cid }, undefined, {
			state: true,
			presence: true,
		});
	});
});

describe('Channels - members', function () {
	const tommasoID = `tommaso-${uuidv4()}`;
	const thierryID = `thierry-${uuidv4()}`;

	const channelGroup = 'messaging';
	const channelId = `test-channels-${uuidv4()}`;
	const tommasoToken = createUserToken(tommasoID);
	const thierryToken = createUserToken(thierryID);

	const tommasoClient = getTestClient();
	const thierryClient = getTestClient();
	const serverClient = getTestClient(true);

	let tommasoChannel, thierryChannel;
	const message = { text: 'nice little chat API' };

	const tommasoChannelEventQueue = [];
	const thierryChannelEventQueue = [];
	let tommasoPromise;
	let thierryPromise1;
	let thierryPromise2;

	let tommasoMessageID;

	before(async () => {
		await tommasoClient.connectUser({ id: tommasoID }, tommasoToken);
		await thierryClient.connectUser({ id: thierryID }, thierryToken);
	});

	it('tommaso creates a new channel', async function () {
		tommasoChannel = tommasoClient.channel(channelGroup, channelId);
		tommasoPromise = new Promise((resolve) => {
			tommasoChannel.on((event) => {
				tommasoChannelEventQueue.push(event);
				if (tommasoChannelEventQueue.length === 4) {
					resolve();
				}
			});
		});
		await tommasoChannel.watch();
	});

	it(`tommaso tries to create a channel that's too large`, async function () {
		await expectHTTPErrorCode(
			413,
			tommasoClient
				.channel(channelGroup, `big-boy-${uuidv4()}`, {
					stuff: 'x'.repeat(6 * 1024),
				})
				.create(),
		);
	});

	it(`tommaso tries to create a channel with a reserved character`, async function () {
		await expectHTTPErrorCode(
			400,
			tommasoClient.channel(channelGroup, `!${channelId}`).watch(),
		);
	});

	it('thierry tries to join the channel', async function () {
		await expectHTTPErrorCode(
			403,
			thierryClient.channel(channelGroup, channelId).watch(),
		);
	});

	it('tommaso adds thierry as channel member', async function () {
		await tommasoChannel.addMembers([thierryID]);
	});

	it('thierry tries to join the channel', async function () {
		thierryChannel = thierryClient.channel(channelGroup, channelId);
		thierryPromise2 = new Promise((resolve2) => {
			thierryPromise1 = new Promise((resolve1) => {
				thierryChannel.on((event) => {
					thierryChannelEventQueue.push(event);
					if (thierryChannelEventQueue.length === 2) {
						resolve1();
					}
					if (thierryChannelEventQueue.length === 4) {
						resolve2();
					}
				});
			});
		});
		await thierryChannel.watch();
	});

	it('tommaso gets an event about Thierry joining', async function () {
		await tommasoPromise;
		let event = tommasoChannelEventQueue.pop();
		expect(event.type).to.eql('user.watching.start');
		expect(event.user.id).to.eql(thierryID);

		event = tommasoChannelEventQueue.pop();
		expect(event.type).to.eql('channel.updated');
		event = tommasoChannelEventQueue.pop();
		expect(event.type).to.eql('member.added');
	});

	it('tommaso posts a message', async function () {
		await tommasoChannel.sendMessage(message);
	});

	it('thierry gets the new message from tommaso', async function () {
		await thierryPromise1;
		const event = thierryChannelEventQueue.pop();
		expect(event.type).to.eql('message.new');
		tommasoMessageID = event.message.id;
	});

	it('thierry tries to update the channel description', async function () {
		await expectHTTPErrorCode(
			403,
			thierryChannel.update({ description: 'taking over this channel now!' }),
		);
	});

	it('tommaso updates the channel description', async function () {
		await tommasoChannel.update({ description: 'taking over this channel now!' });
	});

	it('tommaso updates his own message', async function () {
		await tommasoClient.updateMessage({
			id: tommasoMessageID,
			text: 'I mean, awesome chat',
		});
	});

	it('thierry tries to update tommaso message', async function () {
		await expectHTTPErrorCode(
			403,
			thierryClient.updateMessage({
				id: tommasoMessageID,
				text: 'I mean, awesome chat',
			}),
		);
	});

	it('thierry mutes himself', async function () {
		const response = await thierryChannel.sendMessage({
			text: `/mute @${thierryID}`,
		});
		expect(response.message.type).to.eql('error');
	});

	it('thierry gets promoted', async function () {
		await getTestClient(true).upsertUser({ id: thierryID, role: 'admin' });
	});

	it('correct member count', async function () {
		const members = [uuidv4(), uuidv4()];
		await createUsers(members);

		const channel = tommasoClient.channel('messaging', uuidv4(), { members });
		await channel.create();

		const newMembers = [uuidv4(), uuidv4()];
		await createUsers(newMembers);

		await channel.addMembers([newMembers[0]]);
		await channel.addMembers([newMembers[1]]);

		const resp = await channel.query();
		expect(resp.members.length).to.be.equal(4);
		expect(resp.channel.member_count).to.be.equal(4);
	});

	describe('Channel members', function () {
		const channelId = `test-member-cache-${uuidv4()}`;
		const initialMembers = [tommasoID, thierryID];
		const newMembers = [uuidv4(), uuidv4()];

		let channel;

		before(async function () {
			await createUsers(newMembers);
			channel = tommasoClient.channel('messaging', channelId);
		});

		describe('When creating channel', function () {
			before(async function () {
				await channel.create();
			});

			it('returns empty channel members list', async function () {
				const resp = await channel.watch();

				expect(resp.members.length).to.be.equal(0);
			});
		});

		describe('When adding members to new channel', function () {
			before(async function () {
				await channel.addMembers(initialMembers);
			});

			it('returns channel members', async function () {
				const resp = await channel.watch();

				expect(resp.members.length).to.be.equal(initialMembers.length);
				expect(resp.members.map((m) => m.user.id)).to.have.members(
					initialMembers,
				);
			});
		});

		describe('When adding members to existing channel', function () {
			before(async function () {
				await channel.addMembers(newMembers);
			});

			it('returns existing members and new ones', async function () {
				const resp = await channel.watch();
				expect(resp.members.length).to.be.equal(4);
				expect(resp.members.map((m) => m.user.id)).to.have.members(
					initialMembers.concat(newMembers),
				);
			});

			it('returns channels when searching for members', async function () {
				const resp = await tommasoClient.queryChannels({
					members: { $in: newMembers },
				});
				expect(resp.length).to.be.equal(1);
			});
		});

		describe('When removing members', function () {
			before(async function () {
				await channel.removeMembers(newMembers);
			});

			it('returns members without deleted', async function () {
				const resp = await channel.watch();
				expect(resp.members.length).to.be.equal(2);
				expect(resp.members.map((m) => m.user.id)).to.have.members(
					initialMembers,
				);
			});

			it('returns no channels when searching for members', async function () {
				const resp = await tommasoClient.queryChannels({
					members: { $in: newMembers },
				});
				expect(resp.length).to.be.equal(0);
			});

			it('returns error if adding and removing same member in a single request', async () => {
				const resp = await tommasoClient
					.channel('messaging', { members: [tommasoID, newMembers[0]] })
					.create();
				await expectHTTPErrorCode(
					400,
					thierryClient.post(
						`${thierryClient.baseURL}/channels/messaging/${resp.channel.id}`,
						{
							remove_members: [thierryID],
							add_members: [thierryID],
						},
					),
				);
			});
		});

		describe('Distinct channel manipulations', () => {
			it('successfully joins back if the channel is distinct', async () => {
				const { channel } = await tommasoClient
					.channel('messaging', { members: initialMembers })
					.create();
				await thierryClient
					.channel('messaging', channel.id)
					.removeMembers([thierryID]);
				const { members } = await thierryClient
					.channel('messaging', channel.id)
					.addMembers([thierryID]);
				expect(members.length).to.be.eq(2);
			});

			it('fails to join back if the channel is not distinct', async () => {
				const chanID = uuidv4();
				const chan = await thierryClient.channel('messaging', chanID);
				await chan.create();
				await chan.addMembers([tommasoID, thierryID]);
				// after self-remove, user is not able to join regular channel by himself
				await tommasoClient
					.channel('messaging', chanID)
					.removeMembers([tommasoID]);
				await expectHTTPErrorCode(
					403,
					tommasoClient.channel('messaging', chanID).addMembers([tommasoID]),
				);
			});

			it('fails to join foreign distinct channel', async () => {
				const resp = await thierryClient
					.channel('messaging', { members: [thierryID, newMembers[0]] })
					.create();
				await expectHTTPErrorCode(
					403,
					tommasoClient
						.channel('messaging', resp.channel.id)
						.addMembers([tommasoID]),
				);
			});
			it('X leaves [X,Y] and creates the channel again', async () => {
				// Case 1
				// 1. X creates distinct channel [X,Y]
				// 2. X sends a message
				// 3. X leaves the channel
				// 4. X creates distinct channel [X,Y]
				// 5. X sends a message
				// Expected behavior: X should be added back as a channel member and see all the messages
				const userX = 'x-' + uuidv4();
				const userY = 'y-' + uuidv4();
				await createUsers([userX, userY]);
				const clientX = getTestClient();
				await clientX.connectUser({ id: userX }, createUserToken(userX));
				const clientY = getTestClient();
				await clientY.connectUser({ id: userY }, createUserToken(userY));

				let channelX = clientX.channel('messaging', { members: [userX, userY] });
				await channelX.create();
				const channelCID = channelX.cid;
				await channelX.sendMessage({ text: 'msg1' });
				await channelX.removeMembers([userX]);
				channelX = clientX.channel('messaging', { members: [userX, userY] });
				const { members: membersX } = await channelX.create();
				await channelX.sendMessage({ text: 'msg2' });
				const { messages: messagesX } = await channelX.query({
					messages: { limit: 2 },
				});

				expect(channelCID).to.be.equal(channelX.cid);
				expect(membersX.length).to.be.equal(2);
				expect(messagesX.length).to.be.equal(2);
				expect(messagesX[0].text).to.be.equal('msg1');
				expect(messagesX[1].text).to.be.equal('msg2');

				// The same thing the other way around. When Y creates distinct channel, X should not be added back
				// Case 2 (continuation from case 1)
				// 1. Y creates distinct channel [X,Y] (receives existing channel)
				// 2. Y sends a message
				// 3. X leaves the channel
				// 4. Y creates distinct channel [X,Y] (receives existing channel)
				// 5. Y sends a message
				// Expected behavior: Y should be able to interact with channel freely, but X will not be added back when Y recreates the channel
				await channelX.removeMembers([userX]);
				const channelY = clientY.channel('messaging', {
					members: [userX, userY],
				});
				const { members: membersY } = await channelY.create();
				await channelY.sendMessage({ text: 'msg3' });
				const { messages: messagesY } = await channelY.query({
					messages: { limit: 3 },
				});

				expect(channelY.cid).to.be.equal(channelX.cid);
				expect(membersY.length).to.be.equal(1);
				expect(messagesY.length).to.be.equal(3);
				expect(messagesY[0].text).to.be.equal('msg1');
				expect(messagesY[1].text).to.be.equal('msg2');
				expect(messagesY[2].text).to.be.equal('msg3');
			});
		});

		describe('when managing distinct channel members from server-side', () => {
			it('successfully removes and adds back member', async () => {
				const { channel } = await tommasoClient
					.channel('messaging', { members: initialMembers })
					.create();
				await serverClient
					.channel('messaging', channel.id)
					.removeMembers([thierryID]);
				await serverClient
					.channel('messaging', channel.id)
					.addMembers([thierryID]);
			});
			it('fails to add foreign member', async () => {
				const { channel } = await tommasoClient
					.channel('messaging', { members: initialMembers })
					.create();
				await expectHTTPErrorCode(
					403,
					serverClient
						.channel('messaging', channel.id)
						.addMembers([newMembers[0]]),
				);
			});
		});

		describe('leave channel permissions', () => {
			const minimalPermissions = [
				{
					action: 'Allow',
					name: 'Channel member permissions',
					resources: ['ReadChannel', 'CreateChannel'],
					roles: ['channel_member'],
					owner: false,
					priority: 70,
				},
				{
					action: 'Allow',
					name: 'Users can create channels',
					resources: ['CreateChannel'],
					roles: ['user'],
					owner: false,
					priority: 60,
				},
				{
					action: 'Deny',
					name: 'deny all policy',
					resources: ['*'],
					roles: ['*'],
					owner: false,
					priority: 1,
				},
			];
			let ssClient;
			let client;
			const user = uuidv4();
			before(async () => {
				ssClient = getTestClient(true);
				client = await getTestClientForUser(user);
			});
			it('no permissions to leave', async () => {
				const type = uuidv4();
				await ssClient.createChannelType({
					name: type,
					permissions: minimalPermissions,
				});
				const channel = client.channel(type, uuidv4(), { members: [user] });
				await channel.create();
				await expectHTTPErrorCode(403, channel.removeMembers([user]));
			});
			it('leave channel with RemoveOwnChannelMembership', async () => {
				const type = uuidv4();
				const permissions = minimalPermissions;
				permissions[0].resources = [
					...permissions[0].resources,
					'RemoveOwnChannelMembership',
				];
				await ssClient.createChannelType({
					name: type,
					permissions,
				});
				const channel = client.channel(type, uuidv4(), { members: [user] });
				await channel.create();
				await channel.removeMembers([user]);
			});
			it('leave channel with RemoveOwnChannelMembership', async () => {
				const type = uuidv4();
				const permissions = minimalPermissions;
				permissions[0].resources = [
					...permissions[0].resources,
					'UpdateChannelMembers',
				];
				await ssClient.createChannelType({
					name: type,
					permissions,
				});
				const channel = client.channel(type, uuidv4(), { members: [user] });
				await channel.create();
				await channel.removeMembers([user]);
			});
			it('leave channel with RemoveOwnChannelMembership and UpdateChannelMembers', async () => {
				const type = uuidv4();
				const permissions = minimalPermissions;
				permissions[0].resources = [
					...permissions[0].resources,
					'RemoveOwnChannelMembership',
					'UpdateChannelMembers',
				];
				await ssClient.createChannelType({
					name: type,
					permissions,
				});
				const channel = client.channel(type, uuidv4(), { members: [user] });
				await channel.create();
				await channel.removeMembers([user]);
			});
		});
	});

	it('channel messages and last_message_at are correctly returned', async function () {
		const unique = uuidv4();
		const newMembers = ['member1', 'member2'];
		await createUsers(newMembers);
		const channelId = `channel-messages-cache-${unique}`;
		const channel2Id = `channel-messages-cache2-${unique}`;
		const channel = tommasoClient.channel('messaging', channelId, {
			unique,
		});
		await channel.create();
		const channel2 = tommasoClient.channel('messaging', channel2Id, {
			unique,
		});
		await channel2.create();

		const channel1Messages = [];
		const channel2Messages = [];
		for (let i = 0; i < 10; i++) {
			const msg = channel.sendMessage({ text: 'new message' });
			const op2 = channel.update({ unique, color: 'blue' });
			const op3 = channel.addMembers(newMembers);
			const msg2 = await channel2.sendMessage({ text: 'new message 2' });
			const results = await Promise.all([msg, op2, op3]);

			if (i % 2 === 0) {
				let last_message = results[0].message.created_at;
				if (msg2.message.created_at > last_message) {
					last_message = msg2.message.created_at;
				}
				const channels = await tommasoClient.queryChannels(
					{ unique },
					{ last_message_at: -1 },
					{ state: true },
				);
				expect(channels.length).to.be.equal(2);
				// parse date to avoid precision issues
				expect(Date.parse(channels[0].data.last_message_at)).to.be.equal(
					Date.parse(last_message),
				);
			}
			channel1Messages.push(results[0].message);
			channel2Messages.push(msg2.message);
		}

		const stateChannel1 = await channel.watch();
		const stateChannel2 = await channel2.watch();

		const expectedChannel1Messages = channel1Messages;
		const expectedChannel2Messages = channel2Messages;

		expect(stateChannel1.messages.length).to.be.equal(
			expectedChannel1Messages.length,
		);
		expect(stateChannel2.messages.length).to.be.equal(
			expectedChannel2Messages.length,
		);

		for (let i = 0; i < stateChannel1.messages.length; i++) {
			expect(stateChannel1.messages[i].id).to.be.equal(
				expectedChannel1Messages[i].id,
			);
		}
		for (let i = 0; i < stateChannel2.messages.length; i++) {
			expect(stateChannel2.messages[i].id).to.be.equal(
				expectedChannel2Messages[i].id,
			);
		}
	});
});

describe('Channels - Members are updated correctly', function () {
	const channelId = uuidv4();
	const cid = `messaging:${channelId}`;
	const johnID = `john-${uuidv4()}`;
	const members = [
		{
			id: `member1-${uuidv4()}`,
			role: 'user',
			counter: 0,
		},
		{
			id: `member2-${uuidv4()}`,
			role: 'user',
			counter: 0,
		},
		{
			id: `member3-${uuidv4()}`,
			role: 'user',
			counter: 0,
		},
	];

	const runWithOtherOperations = async function (op) {
		const op2 = channel.update({ color: 'green' }, { text: 'got new message!' });
		const op3 = channel.sendMessage({ text: 'new message' });
		const op4 = channel.sendMessage({ text: 'new message' });
		const results = await Promise.all([op, op2, op3, op4]);
		return results[0];
	};

	let channel;
	let client;
	before(async function () {
		client = await getTestClientForUser(johnID);
		await createUsers(
			members.map(function (member) {
				return member.id;
			}),
		);

		channel = client.channel('messaging', channelId, {
			color: 'green',
			members: [members[0].id],
		});
		const response = await channel.create();
		expect(response.channel.color).to.equal('green');
		expect(response.channel.cid).to.equal(cid);
		expect(response.channel.members).to.equal(undefined);
		expect(response.members.length).to.equal(1);
	});

	it('channel state must be updated after removing a member', async function () {
		const resp = await runWithOtherOperations(channel.removeMembers([members[0].id]));
		expect(resp.members.length).to.be.equal(0);
		const channelState = await channel.watch();
		expect(channelState.members.length).to.be.equal(0);
	});

	it('channel state must be updated after adding a member', async function () {
		const resp = await runWithOtherOperations(channel.addMembers([members[0].id]));
		expect(resp.members.length).to.be.equal(1);
		const channelState = await channel.watch();
		expect(channelState.members.length).to.be.equal(1);
		expect(channelState.members[0].user.id).to.be.equal(members[0].id);
	});

	it('channel state must be updated after adding multiple members', async function () {
		const resp = await runWithOtherOperations(
			channel.addMembers([members[0].id, members[1].id, members[2].id]),
		);
		expect(resp.members.length).to.be.equal(3);
		const channelState = await channel.watch();
		expect(channelState.members.length).to.be.equal(3);
		const memberIDs = channelState.members.map((m) => m.user.id);
		expect(memberIDs).to.deep.members(members.map((m) => m.id));
	});

	it('channel state must be updated after removing multiple members', async function () {
		const resp = await runWithOtherOperations(
			channel.removeMembers([members[0].id, members[1].id, members[2].id]),
		);
		expect(resp.members.length).to.be.equal(0);
		const channelState = await channel.watch();
		expect(channelState.members.length).to.be.equal(0);
	});
});

describe('Channels - Member limit', function () {
	const memberOne = `one-${uuidv4()}`;
	const memberTwo = `two-${uuidv4()}`;
	const memberThree = `three-${uuidv4()}`;
	const unique = uuidv4();

	let channel;
	let ssClient;
	before(async () => {
		ssClient = getServerTestClient();
		await createUsers([memberOne, memberTwo, memberThree]);
		channel = ssClient.channel('messaging', uuidv4(), {
			unique,
			members: [memberOne, memberTwo, memberThree],
			created_by_id: memberOne,
		});
		await channel.create();
		await ssClient.disconnect();
	});

	it('limit 0 should return 0 members', async function () {
		const memberOneClient = await getTestClientForUser(memberOne);
		const channels = await memberOneClient.queryChannels(
			{ unique },
			{},
			{ member_limit: 0 },
		);
		expect(channels.length).to.be.equal(1);
		expect(channels[0].state.members).to.be.empty;
	});

	it('limit 1 should return 1 members', async function () {
		const memberOneClient = await getTestClientForUser(memberOne);
		const channels = await memberOneClient.queryChannels(
			{ unique },
			{},
			{ member_limit: 1 },
		);
		expect(channels.length).to.be.equal(1);
		expect(channels[0].state.members[memberOne]).to.not.be.null;
	});

	it('negative limit should raise an error', async function () {
		const p = ssClient.queryChannels({ unique }, {}, { member_limit: -1 });
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 4: QueryChannels failed with error: "member_limit must be 0 or greater"',
		);
	});

	it('limit > 100 should raise an error', async function () {
		const p = ssClient.queryChannels({ unique }, {}, { member_limit: 101 });
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 4: QueryChannels failed with error: "member_limit must be 100 or less',
		);
	});
});

describe('Channels - Distinct channels', function () {
	const tommasoID = `tommaso-${uuidv4()}`;
	const thierryID = `thierry-${uuidv4()}`;
	const newMember = `member-${uuidv4()}`;

	const channelGroup = 'messaging';
	const tommasoToken = createUserToken(tommasoID);
	const thierryToken = createUserToken(thierryID);

	const tommasoClient = getTestClient();
	const thierryClient = getTestClient();
	let distinctChannel;

	const unique = uuidv4();
	before(async () => {
		await tommasoClient.connectUser({ id: tommasoID }, tommasoToken);
		await thierryClient.connectUser({ id: thierryID }, thierryToken);
		await createUsers([newMember]);
	});

	it('create a distinct channel without specifying members should fail', async function () {
		const channel = thierryClient.channel(channelGroup, '');
		await expectHTTPErrorCode(
			400,
			channel.create(),
			'StreamChat error code 4: GetOrCreateChannel failed with error: "When using member based IDs specify at least 2 members"',
		);
	});

	it('create a distinct channel with only one member should fail', async function () {
		const channel = thierryClient.channel(channelGroup, '', {
			members: [tommasoID],
		});
		await expectHTTPErrorCode(
			400,
			channel.create(),
			'StreamChat error code 4: GetOrCreateChannel failed with error: "When using member based IDs specify at least 2 members"',
		);
	});

	it('create a distinct channel with 2 members should succeed', async function () {
		distinctChannel = thierryClient.channel(channelGroup, null, {
			members: [tommasoID, thierryID],
			unique,
		});
		await distinctChannel.create();
	});

	it('query previous created distinct channel', async function () {
		const channels = await thierryClient.queryChannels({
			members: [tommasoID, thierryID],
			unique,
		});
		expect(channels.length).to.be.equal(1);
		expect(channels[0].data.unique).to.be.equal(unique);
	});

	it('adding members to distinct channel should fail', async function () {
		await expectHTTPErrorCode(
			403,
			distinctChannel.addMembers([newMember]),
			'StreamChat error code 17: UpdateChannel failed with error: "cannot add members to the distinct channel they don\'t belong to, please create a new distinct channel with the desired members"',
		);
	});
});

describe('Query Channels and sort by unread', function () {
	const channels = [];
	const tommaso = 'tommaso' + uuidv4();
	const thierry = 'thierry' + uuidv4();
	let tommasoClient;
	let thierryClient;
	before(async function () {
		thierryClient = await getTestClientForUser(thierry);
		await createUsers([tommaso, thierry]);
		const cidPrefix = uuidv4();
		for (let i = 3; i >= 0; i--) {
			let color;
			if (i % 2 == 0) {
				color = 'blue';
			} else {
				color = 'red';
			}
			const channel = thierryClient.channel('messaging', cidPrefix + i, { color });
			await channel.watch();
			await channel.addMembers([tommaso, thierry]);
			for (let j = 0; j < i + 1; j++) {
				await channel.sendMessage({ text: 'hi' + j });
			}
			channels.push(channel);
		}
	});

	it('sort by has_unread and last_message_at asc should work', async function () {
		tommasoClient = await getTestClientForUser(tommaso);
		const result = await tommasoClient.queryChannels(
			{ members: { $in: [tommaso] } },
			{ has_unread: 1, last_message_at: 1 },
		);

		expect(result.length).to.be.equal(4);
		expect(result[0].cid).to.be.equal(channels[0].cid);
		expect(result[1].cid).to.be.equal(channels[1].cid);
		expect(result[2].cid).to.be.equal(channels[2].cid);
		expect(result[3].cid).to.be.equal(channels[3].cid);
	});

	it('sort by has_unread and last_message_at', async function () {
		tommasoClient = await getTestClientForUser(tommaso);
		const result = await tommasoClient.queryChannels(
			{ members: { $in: [tommaso] } },
			{ has_unread: 1, last_message_at: -1 },
		);

		expect(result.length).to.be.equal(4);
		expect(result[0].cid).to.be.equal(channels[3].cid);
		expect(result[1].cid).to.be.equal(channels[2].cid);
		expect(result[2].cid).to.be.equal(channels[1].cid);
		expect(result[3].cid).to.be.equal(channels[0].cid);
	});

	it.skip('sort by unread_count asc', async function () {
		const result = await tommasoClient.queryChannels(
			{ members: { $in: [tommaso] } },
			{ unread_count: 1 },
		);

		expect(result.length).to.be.equal(4);
		expect(result[0].cid).to.be.equal(channels[3].cid);
		expect(result[1].cid).to.be.equal(channels[2].cid);
		expect(result[2].cid).to.be.equal(channels[1].cid);
		expect(result[3].cid).to.be.equal(channels[0].cid);
	});

	it('sort by unread_count desc', async function () {
		const result = await tommasoClient.queryChannels(
			{ members: { $in: [tommaso] } },
			{ unread_count: -1 },
		);

		expect(result.length).to.be.equal(4);
		expect(result[0].cid).to.be.equal(channels[0].cid);
		expect(result[1].cid).to.be.equal(channels[1].cid);
		expect(result[2].cid).to.be.equal(channels[2].cid);
		expect(result[3].cid).to.be.equal(channels[3].cid);
	});

	it.skip('zero the counts and sort by has_unread and last_message_at asc', async function () {
		tommasoClient = await getTestClientForUser(tommaso);
		await tommasoClient.markAllRead();
		tommasoClient = await getTestClientForUser(tommaso);
		expect(tommasoClient.health.me.total_unread_count).to.be.equal(0);
		expect(tommasoClient.health.me.unread_channels).to.be.equal(0);
		const result = await tommasoClient.queryChannels(
			{ members: { $in: [tommaso] } },
			{ has_unread: 1, last_message_at: 1 },
		);

		expect(result.length).to.be.equal(4);
		expect(result[0].cid).to.be.equal(channels[0].cid);
		expect(result[1].cid).to.be.equal(channels[1].cid);
		expect(result[2].cid).to.be.equal(channels[2].cid);
		expect(result[3].cid).to.be.equal(channels[3].cid);
	});

	it('zero the counts and sort by has_unread and last_message_at desc', async function () {
		tommasoClient = await getTestClientForUser(tommaso);
		await tommasoClient.markAllRead();
		tommasoClient = await getTestClientForUser(tommaso);
		expect(tommasoClient.health.me.total_unread_count).to.be.equal(0);
		expect(tommasoClient.health.me.unread_channels).to.be.equal(0);
		const result = await tommasoClient.queryChannels(
			{ members: { $in: [tommaso] } },
			{ has_unread: 1, last_message_at: -1 },
		);

		expect(result.length).to.be.equal(4);
		expect(result[0].cid).to.be.equal(channels[3].cid);
		expect(result[1].cid).to.be.equal(channels[2].cid);
		expect(result[2].cid).to.be.equal(channels[1].cid);
		expect(result[3].cid).to.be.equal(channels[0].cid);
	});

	it.skip('zero the counts and sort by unread_count and last_message_at asc', async function () {
		tommasoClient = await getTestClientForUser(tommaso);
		await tommasoClient.markAllRead();
		tommasoClient = await getTestClientForUser(tommaso);
		expect(tommasoClient.health.me.total_unread_count).to.be.equal(0);
		expect(tommasoClient.health.me.unread_channels).to.be.equal(0);
		const result = await tommasoClient.queryChannels(
			{ members: { $in: [tommaso] } },
			{ unread_count: 1, last_message_at: 1 },
		);

		expect(result.length).to.be.equal(4);
		expect(result[0].cid).to.be.equal(channels[0].cid);
		expect(result[1].cid).to.be.equal(channels[1].cid);
		expect(result[2].cid).to.be.equal(channels[2].cid);
		expect(result[3].cid).to.be.equal(channels[3].cid);
	});

	it.skip('zero the counts and sort by unread_count and last_message_at desc', async function () {
		tommasoClient = await getTestClientForUser(tommaso);
		await tommasoClient.markAllRead();
		tommasoClient = await getTestClientForUser(tommaso);
		expect(tommasoClient.health.me.total_unread_count).to.be.equal(0);
		expect(tommasoClient.health.me.unread_channels).to.be.equal(0);
		const result = await tommasoClient.queryChannels(
			{ members: { $in: [tommaso] } },
			{ unread_count: 1, last_message_at: -1 },
		);

		expect(result.length).to.be.equal(4);
		expect(result[0].cid).to.be.equal(channels[3].cid);
		expect(result[1].cid).to.be.equal(channels[2].cid);
		expect(result[2].cid).to.be.equal(channels[1].cid);
		expect(result[3].cid).to.be.equal(channels[0].cid);
	});

	it('test "grouping"', async function () {
		tommasoClient = await getTestClientForUser(tommaso);
		await channels[0].sendMessage({ text: 'hi' });
		await sleep(200);
		await channels[1].sendMessage({ text: 'hi' });
		let result = await tommasoClient.queryChannels(
			{ members: { $in: [tommaso] } },
			{ has_unread: -1, last_message_at: -1 },
		);

		expect(result.length).to.be.equal(4);
		expect(result[0].cid).to.be.equal(channels[1].cid);
		expect(result[1].cid).to.be.equal(channels[0].cid);
		expect(result[2].cid).to.be.equal(channels[3].cid);
		expect(result[3].cid).to.be.equal(channels[2].cid);

		result = await tommasoClient.queryChannels(
			{ members: { $in: [tommaso] } },
			{ unread_count: -1, last_message_at: 1 },
		);

		expect(result.length).to.be.equal(4);
		expect(result[0].cid).to.be.equal(channels[0].cid);
		expect(result[1].cid).to.be.equal(channels[1].cid);
		expect(result[2].cid).to.be.equal(channels[2].cid);
		expect(result[3].cid).to.be.equal(channels[3].cid);

		/*result = await tommasoClient.queryChannels(
      { members: { $in: [tommaso] } },
      { unread_count: 1, last_message_at: -1 },
    );

    expect(result.length).to.be.equal(4);
    expect(result[0].cid).to.be.equal(channels[3].cid);
    expect(result[1].cid).to.be.equal(channels[2].cid);
    expect(result[2].cid).to.be.equal(channels[1].cid);
    expect(result[3].cid).to.be.equal(channels[0].cid);

    result = await tommasoClient.queryChannels(
      { members: { $in: [tommaso] } },
      { unread_count: 1, last_message_at: 1 },
    );

    expect(result.length).to.be.equal(4);
    expect(result[0].cid).to.be.equal(channels[2].cid);
    expect(result[1].cid).to.be.equal(channels[3].cid);
    expect(result[2].cid).to.be.equal(channels[0].cid);
    expect(result[3].cid).to.be.equal(channels[1].cid);*/
	});

	it('limit results should work fine', async function () {
		await tommasoClient.markAllRead();
		tommasoClient = await getTestClientForUser(tommaso);
		expect(tommasoClient.health.me.total_unread_count).to.be.equal(0);
		expect(tommasoClient.health.me.unread_channels).to.be.equal(0);
		await channels[0].sendMessage({ text: 'hi' });
		await channels[1].sendMessage({ text: 'hi' });
		let result = await tommasoClient.queryChannels(
			{ members: { $in: [tommaso] } },
			{ unread_count: -1, last_message_at: -1 },
			{ limit: 1 },
		);

		expect(result.length).to.be.equal(1);
		expect(result[0].cid).to.be.equal(channels[1].cid);

		result = await tommasoClient.queryChannels(
			{ members: { $in: [tommaso] } },
			{ unread_count: -1, last_message_at: 1 },
			{ limit: 1 },
		);

		expect(result.length).to.be.equal(1);
		expect(result[0].cid).to.be.equal(channels[0].cid);
	});

	it('unread count + custom query should work', async function () {
		await tommasoClient.markAllRead();
		tommasoClient = await getTestClientForUser(tommaso);
		expect(tommasoClient.health.me.total_unread_count).to.be.equal(0);
		expect(tommasoClient.health.me.unread_channels).to.be.equal(0);
		await channels[0].sendMessage({ text: 'hi' });
		await channels[1].sendMessage({ text: 'hi' });
		const result = await tommasoClient.queryChannels(
			{ members: { $in: [tommaso] }, color: 'blue' },
			{ unread_count: -1, last_message_at: -1 },
		);

		expect(result.length).to.be.equal(2);
		expect(result[0].cid).to.be.equal(channels[1].cid);
		expect(result[0].data.color).to.be.equal('blue');
		expect(result[1].data.color).to.be.equal('blue');
	});

	it('unread count + custom query with limit should work', async function () {
		await tommasoClient.markAllRead();
		tommasoClient = await getTestClientForUser(tommaso);
		expect(tommasoClient.health.me.total_unread_count).to.be.equal(0);
		expect(tommasoClient.health.me.unread_channels).to.be.equal(0);
		await channels[0].sendMessage({ text: 'hi' });
		await channels[1].sendMessage({ text: 'hi' });
		const result = await tommasoClient.queryChannels(
			{ members: { $in: [tommaso] }, color: 'blue' },
			{ unread_count: -1, last_message_at: -1 },
			{ limit: 1 },
		);
		expect(result.length).to.be.equal(1);
		expect(result[0].cid).to.be.equal(channels[1].cid);
		expect(result[0].data.color).to.be.equal('blue');
	});
});

describe('members and unread count', function () {
	let client1;
	let client2;

	const user1 = uuidv4();
	const user2 = uuidv4();

	const channelID = uuidv4();

	before(async function () {
		client1 = await getTestClientForUser(user1);
		await getTestClientForUser(user2);
		await client1
			.channel('messaging', channelID, { members: [user1, user2] })
			.create();
	});

	it('adding a member twice should not mark the channel as read', async function () {
		const channel = client1.channel('messaging', channelID);
		await channel.sendMessage({ text: 'hi 1' });
		await channel.addMembers([user2]);
		client2 = await getTestClientForUser(user2);
		expect(client2.health.me.total_unread_count).to.eq(1);
	});
});

describe('hard delete messages', function () {
	const channelID = uuidv4();
	const user = uuidv4();
	let client, ssclient;
	let channel;
	let firstMessage;
	let secondMeessage;
	let thirdMeessage;

	before(async function () {
		client = await getTestClientForUser(user);
		ssclient = getTestClient(true);
		channel = client.channel('messaging', channelID);
		await channel.create();
	});

	it('send 3 messages to the channel', async function () {
		firstMessage = await channel.sendMessage({ text: 'hi 1' });
		secondMeessage = await channel.sendMessage({ text: 'hi 2' });
		thirdMeessage = await channel.sendMessage({ text: 'hi 3' });
	});

	it('hard delete messages is not allowed client side', function () {
		expect(client.deleteMessage(firstMessage.message.id, true)).to.be.rejectedWith(
			'StreamChat error code 4: DeleteMessage failed with error: "hard delete messages is only allowed with server side auth"',
		);
	});

	it('hard delete the second message should work and not update  channel.last_message_id', async function () {
		channel = ssclient.channel('messaging', channelID, { created_by_id: user });
		await channel.watch();
		expect(channel.data.last_message_at).to.be.equal(
			thirdMeessage.message.created_at,
		);

		const resp = await ssclient.deleteMessage(secondMeessage.message.id, true);
		expect(resp.message.deleted_at).to.not.be.undefined;
		expect(resp.message.type).to.be.equal('deleted');

		channel = ssclient.channel('messaging', channelID, { created_by_id: user });
		await channel.watch();
		expect(channel.data.last_message_at).to.be.equal(
			thirdMeessage.message.created_at,
		);
	});

	it('hard delete the third message should update the channel last_message_at', async function () {
		const resp = await ssclient.deleteMessage(thirdMeessage.message.id, true);
		expect(resp.message.deleted_at).to.not.be.undefined;
		expect(resp.message.type).to.be.equal('deleted');

		channel = ssclient.channel('messaging', channelID, { created_by_id: user });
		await channel.watch();
		expect(channel.data.last_message_at).to.be.equal(firstMessage.message.created_at);
	});

	it('hard delete the last message in the channel should clear channel messages and last_message_at', async function () {
		const resp = await ssclient.deleteMessage(firstMessage.message.id, true);
		expect(resp.message.deleted_at).to.not.be.undefined;
		expect(resp.message.type).to.be.equal('deleted');

		channel = ssclient.channel('messaging', channelID, { created_by_id: user });
		const channelResp = await channel.watch();
		expect(channelResp.channel.last_message_at).to.be.undefined;
		expect(channelResp.messages.length).to.be.equal(0);
	});

	it('messages with reactions are hard deleted properly', async function () {
		let channel = ssclient.channel('messaging', channelID, { created_by_id: user });
		await channel.watch();

		let resp = await channel.sendMessage({ text: 'hi', user_id: user });
		await channel.sendReaction(resp.message.id, { type: 'love' }, user);
		resp = await ssclient.deleteMessage(resp.message.id, true);
		expect(resp.message.deleted_at).to.not.be.undefined;

		channel = ssclient.channel('messaging', channelID, { created_by_id: user });
		const channelResp = await channel.watch();
		expect(channelResp.last_message_at).to.be.undefined;
		expect(channelResp.messages.length).to.be.equal(0);
	});

	it('query the channel should also return correct results', async function () {
		const channels = await ssclient.queryChannels({ cid: 'messaging:' + channelID });
		expect(channels.length).to.be.equal(1);
		const theChannel = channels[0];
		expect(theChannel.data.last_message_at).to.be.undefined;
	});

	it('validate channel.last_message_at correctly updated', async function () {
		const channels = await client.queryChannels({ cid: 'messaging:' + channelID });
		expect(channels.length).to.be.equal(1);
		const theChannel = channels[0];
		expect(theChannel.data.last_message_at).to.be.undefined;

		const messages = [];
		for (let i = 0; i < 10; i++) {
			messages.push(await theChannel.sendMessage({ text: 'hi' + i }));
		}

		for (let i = 9; i >= 0; i--) {
			await ssclient.deleteMessage(messages[i].message.id, true);
			channel = ssclient.channel('messaging', channelID, { created_by_id: user });
			const channelResp = await channel.watch();
			if (i == 0) {
				expect(channelResp.channel.last_message_at).to.be.be.undefined;
			} else {
				expect(channelResp.channel.last_message_at).to.be.equal(
					messages[i - 1].message.created_at,
				);
			}
		}
	});

	it('validate first channel message', async function () {
		const channels = await client.queryChannels({ cid: 'messaging:' + channelID });
		expect(channels.length).to.be.equal(1);
		const theChannel = channels[0];
		expect(theChannel.data.last_message_at).to.be.undefined;

		const messages = [];
		for (let i = 0; i < 10; i++) {
			messages.push(await theChannel.sendMessage({ text: 'hi' + i }));
		}

		for (let i = 0; i < 10; i++) {
			await ssclient.deleteMessage(messages[i].message.id, true);
			channel = ssclient.channel('messaging', channelID, { created_by_id: user });
			const channelResp = await channel.watch();
			//delete last message
			if (i === 9) {
				expect(channelResp.channel.last_message_at).to.be.be.undefined;
			} else {
				expect(channelResp.messages.length).to.be.equal(9 - i);
				expect(channelResp.messages[0].text).to.be.equal('hi' + (i + 1));
			}
		}
	});

	it('hard delete threads should work fine', async function () {
		const channels = await client.queryChannels({ cid: 'messaging:' + channelID });
		expect(channels.length).to.be.equal(1);
		const theChannel = channels[0];
		expect(theChannel.data.last_message_at).to.be.undefined;
		const parent = await theChannel.sendMessage({ text: 'the parent' });
		await theChannel.sendMessage({ text: 'the reply', parent_id: parent.message.id });
		await ssclient.deleteMessage(parent.message.id, true);

		const channels2 = await ssclient.queryChannels({ cid: 'messaging:' + channelID });
		expect(channels2.length).to.be.equal(1);
		const resp = await channels2[0].watch();
		expect(resp.last_message_at).to.be.undefined;
		expect(channels2[0].data.last_message_at).to.be.undefined;
	});
});

describe('query channels by field $exists', function () {
	const creator = uuidv4();
	const testID = uuidv4();
	let client;

	const channelCID = function (i) {
		return 'messaging:' + i + '-' + testID;
	};
	//create 10 channels, even index contains even custom field and odd index contains odd custom field
	before(async function () {
		await createUsers([creator]);
		client = await getTestClientForUser(creator);
		for (let i = 0; i < 10; i++) {
			const custom = {};
			custom['field' + i] = i;
			custom['testid'] = testID;
			if (i % 2 === 0) {
				custom['even'] = true;
			} else {
				custom['odd'] = true;
			}

			await client
				.channel('messaging', i + '-' + testID, {
					...custom,
				})
				.create();
		}
	});

	it('only boolean values are allowed in $exists', async function () {
		await expect(
			client.queryChannels({ testid: testID, even: { $exists: [] } }),
		).to.be.rejectedWith(
			'QueryChannels failed with error: "$exists operator only support boolean values"',
		);
	});

	it('query $exists true on a custom field should work', async function () {
		const resp = await client.queryChannels({
			testid: testID,
			even: { $exists: true },
		});
		expect(resp.length).to.be.equal(5);
		expect(resp.map((c) => c.cid)).to.be.eql([
			channelCID(8),
			channelCID(6),
			channelCID(4),
			channelCID(2),
			channelCID(0),
		]);
	});

	it('query $exists false on a custom field should work', async function () {
		const resp = await client.queryChannels({
			testid: testID,
			even: { $exists: false },
		});
		expect(resp.length).to.be.equal(5);
		expect(resp.map((c) => c.cid)).to.be.eql([
			channelCID(9),
			channelCID(7),
			channelCID(5),
			channelCID(3),
			channelCID(1),
		]);
	});

	it('query $exists true on reserved field', async function () {
		const resp = await client.queryChannels({
			testid: testID,
			cid: { $exists: true },
		});
		expect(resp.length).to.be.equal(10);
		expect(resp.map((c) => c.cid)).to.be.eql([
			channelCID(9),
			channelCID(8),
			channelCID(7),
			channelCID(6),
			channelCID(5),
			channelCID(4),
			channelCID(3),
			channelCID(2),
			channelCID(1),
			channelCID(0),
		]);
	});

	it('query $exists false on reserved field should return 0 results', async function () {
		const resp = await client.queryChannels({
			testid: testID,
			cid: { $exists: false },
		});
		expect(resp.length).to.be.equal(0);
	});

	it('combine multiple $exists should work', async function () {
		const resp = await client.queryChannels({
			testid: testID,
			$or: [{ even: { $exists: true } }, { odd: { $exists: true } }],
		});
		expect(resp.length).to.be.equal(10);
		expect(resp.map((c) => c.cid)).to.be.eql([
			channelCID(9),
			channelCID(8),
			channelCID(7),
			channelCID(6),
			channelCID(5),
			channelCID(4),
			channelCID(3),
			channelCID(2),
			channelCID(1),
			channelCID(0),
		]);
	});
});

describe('query channels members $nin', function () {
	const creator = uuidv4();
	const membersIdS = [uuidv4(), uuidv4(), uuidv4(), uuidv4()];
	let client;

	before(async function () {
		await createUsers(membersIdS);
		await createUsers(creator);
		client = await getTestClientForUser(creator);
		for (let i = 0; i < membersIdS.length; i++) {
			const memberId = membersIdS[i];
			await client
				.channel('messaging', memberId, {
					members: [creator, memberId],
				})
				.create();
		}
	});

	it('query $in/$nin', async function () {
		const resp = await client.queryChannels({
			$and: [
				{ members: { $in: [creator] } },
				{ members: { $nin: [membersIdS[0]] } },
			],
		});

		//expect channel id membersIdS[0] to be excluded from result
		for (let i = 0; i < resp.length; i++) {
			expect(resp[i].id).not.be.equal(membersIdS[0]);
			expect(membersIdS.indexOf(resp[i].id)).not.be.equal(-1);
		}
	});
});

describe('Unread state for non members', function () {
	let client;
	const watcher = uuidv4();
	const otherUser = uuidv4();
	let otherUserClient;
	const emptyChan = uuidv4();
	const chanId = uuidv4();
	let chan;

	before(async function () {
		client = await getTestClientForUser(watcher);
		otherUserClient = await getTestClientForUser(otherUser);
		const c = otherUserClient.channel('livestream', emptyChan, {
			members: [otherUser],
		});
		await c.create();
		chan = otherUserClient.channel('livestream', chanId);
		await chan.create();
		await chan.sendMessage({ text: 'Test Message 1' });
		await chan.sendMessage({ text: 'Test Message 2' });
		await chan.sendMessage({ text: 'Test Message 3' });
	});

	it('connect to empty channel', async function () {
		const c = client.channel('livestream', emptyChan);
		await c.watch();
		const unreadCount = c.countUnread();
		expect(unreadCount).to.be.equal(0);
	});

	it('connect to a channel with 3 messages', async function () {
		const c = client.channel('livestream', chanId);
		await c.watch();
		const unreadCount = c.countUnread();
		expect(unreadCount).to.be.equal(0);
	});

	it('unread count should go up when new messages are received', async function () {
		const c = client.channel('livestream', chanId);
		await c.watch();
		const unreadCount = c.countUnread();
		expect(unreadCount).to.be.equal(0);
		const waiter = createEventWaiter(client, 'message.new');
		await chan.sendMessage({ text: 'Test Message 4' });
		await waiter;
		expect(c.countUnread()).to.be.equal(1);
	});
});

describe('Query channels using last_updated', function () {
	const CHANNELS_ORDER = [1, 2, 0];
	const NUM_OF_CHANNELS = CHANNELS_ORDER.length;
	const CHANGED_CHANNEL = 1;

	const creator = uuidv4();
	const channels = [];
	let client;
	const unique = uuidv4();
	before(async function () {
		client = await getTestClientForUser(creator);
		await createUsers([creator]);
		for (let i = 0; i < NUM_OF_CHANNELS; i++) {
			const channel = client.channel('messaging', 'channelme_' + uuidv4(), {
				unique,
			});
			await channel.create();
			channels.push(channel);
		}

		await channels[CHANGED_CHANNEL].sendMessage({ text: 'Test Message' });
	});

	it('with the parameter', async function () {
		const list = await client.queryChannels({ unique });

		expect(list.length).equal(channels.length);
		for (let i = 0; i < NUM_OF_CHANNELS; i++) {
			expect(list[i].cid).equal(channels[CHANNELS_ORDER[i]].cid);
		}
	});

	it('without parameters', async function () {
		const list = await client.queryChannels({ unique }, { last_updated: -1 });

		expect(list.length).equal(channels.length);
		for (let i = 0; i < NUM_OF_CHANNELS; i++) {
			expect(list[i].cid).equal(channels[CHANNELS_ORDER[i]].cid);
		}
	});

	it('filtering by the parameter', async function () {
		const list = await client.queryChannels({
			unique,
			last_updated: channels[0].data.created_at,
		});

		expect(list.length).equal(1);
		expect(list[0].cid).equal(channels[0].cid);
	});
});

describe('Channels op $in with custom fields', function () {
	const user1 = uuidv4();
	const user2 = uuidv4();
	const channelId = uuidv4();
	const channelId2 = uuidv4();
	const unique = uuidv4(); //used to return consistent results in test
	let user1Client;
	before(async function () {
		await createUsers([user1, user2]);
		user1Client = await getTestClientForUser(user1);

		const channel = user1Client.channel('messaging', channelId, {
			members: [user1, user2],
			color: ['blue', 'red'],
			age: [30, 31],
			array: [[1], [2]],
			object: [{ a: 1 }, { b: 1 }],
			unique,
		});
		await channel.create();
		const channel2 = user1Client.channel('messaging', channelId2, {
			members: [user1, user2],
			customField: [6],
			unique,
		});
		await channel2.create();
	});

	it('query $in on custom string field subset', async function () {
		const channels = await user1Client.queryChannels({
			unique,
			color: { $in: ['red'] },
		});
		expect(channels.length).to.be.equal(1);
		expect(channels[0].cid).to.be.equal(`messaging:${channelId}`);
	});

	it('query $in on custom string $or custom $in int', async function () {
		const channels = await user1Client.queryChannels({
			$or: [{ color: { $in: ['red'] } }, { customField: { $in: [6] } }],
			unique,
		});
		expect(channels.length).to.be.equal(2);
		expect(channels[0].cid).to.be.equal(`messaging:${channelId2}`);
		expect(channels[1].cid).to.be.equal(`messaging:${channelId}`);
	});

	it('query $in on custom string field full set out of order', async function () {
		const channels = await user1Client.queryChannels({
			color: { $in: ['red', 'blue'] },
			unique,
		});
		expect(channels.length).to.be.equal(1);
		expect(channels[0].cid).to.be.equal(`messaging:${channelId}`);
	});

	it('query $in on custom int field subset', async function () {
		const channels = await user1Client.queryChannels({
			unique,
			age: { $in: [30] },
		});
		expect(channels.length).to.be.equal(1);
		expect(channels[0].cid).to.be.equal(`messaging:${channelId}`);
	});

	it('query $in on custom int field full set out of order', async function () {
		const channels = await user1Client.queryChannels({
			unique,
			age: { $in: [31, 30] },
		});
		expect(channels.length).to.be.equal(1);
		expect(channels[0].cid).to.be.equal(`messaging:${channelId}`);
	});

	it('query $in on custom array field subset', async function () {
		const channels = await user1Client.queryChannels({
			unique,
			array: { $in: [[1]] },
		});
		expect(channels.length).to.be.equal(1);
		expect(channels[0].cid).to.be.equal(`messaging:${channelId}`);
	});

	it('query $in on custom array field full set out of order', async function () {
		const channels = await user1Client.queryChannels({
			unique,
			array: { $in: [[2], [1]] },
		});
		expect(channels.length).to.be.equal(1);
		expect(channels[0].cid).to.be.equal(`messaging:${channelId}`);
	});

	it('query $in on custom object field subset', async function () {
		const channels = await user1Client.queryChannels({
			unique,
			object: { $in: [{ a: 1 }] },
		});
		expect(channels.length).to.be.equal(1);
		expect(channels[0].cid).to.be.equal(`messaging:${channelId}`);
	});

	it('query $in on custom object field full set out of order', async function () {
		const channels = await user1Client.queryChannels({
			unique,
			object: { $in: [{ a: 1 }, { b: 1 }] },
		});
		expect(channels.length).to.be.equal(1);
		expect(channels[0].cid).to.be.equal(`messaging:${channelId}`);
	});

	it('query $in on custom field (wrong value types)', async function () {
		const channels = await user1Client.queryChannels({
			unique,
			object: { $in: [3] },
		});
		expect(channels.length).to.be.equal(0);
	});
});

describe('$ne operator', function () {
	let client;
	const channels = [];
	const unique = uuidv4();
	const creator = uuidv4();

	before(async function () {
		client = await getTestClientForUser(creator);
		for (let i = 1; i < 5; i++) {
			const c = client.channel('messaging', uuidv4(), {
				unique,
				number: i,
				string: i.toString(),
				object: { key: i },
				array: [i],
			});
			await c.create();
			channels.push(c);
		}
	});

	it('query $ne on reserved fields', async function () {
		const response = await client.queryChannels({
			unique,
			id: { $ne: channels[0].id },
		});
		expect(response.length).to.be.equal(3);
		expect(
			response.findIndex(function (c) {
				return c.id === channels[0].id;
			}),
		).to.be.equal(-1);
	});

	it('query $ne with invalid type on reserved fields', async function () {
		await expectHTTPErrorCode(
			400,
			client.queryChannels({ unique, id: { $ne: 1 } }),
			'StreamChat error code 4: QueryChannels failed with error: "field `id` contains type number. expecting string"',
		);
	});

	it('query $ne on custom int fields', async function () {
		const response = await client.queryChannels({
			unique,
			number: { $ne: channels[0].data.number },
		});
		expect(response.length).to.be.equal(3);
		expect(
			response.findIndex(function (c) {
				return c.id === channels[0].id;
			}),
		).to.be.equal(-1);
	});

	it('query $ne on custom string fields', async function () {
		const response = await client.queryChannels({
			unique,
			string: { $ne: channels[0].data.string },
		});
		expect(response.length).to.be.equal(3);
		expect(
			response.findIndex(function (c) {
				return c.id === channels[0].id;
			}),
		).to.be.equal(-1);
	});

	it('query $ne on custom object fields', async function () {
		const response = await client.queryChannels({
			unique,
			object: { $ne: channels[0].data.object },
		});
		expect(response.length).to.be.equal(3);
		expect(
			response.findIndex(function (c) {
				return c.id === channels[0].id;
			}),
		).to.be.equal(-1);
	});

	it('query $ne on custom array fields', async function () {
		const response = await client.queryChannels({
			unique,
			array: { $ne: channels[0].data.array },
		});
		expect(response.length).to.be.equal(3);
		expect(
			response.findIndex(function (c) {
				return c.id === channels[0].id;
			}),
		).to.be.equal(-1);
	});
});

describe('query by $autocomplete operator on channels.name', function () {
	let client;
	let channel;
	const user = uuidv4();
	before(async function () {
		await createUsers([user]);
		client = await getTestClientForUser(user);
		channel = client.channel('messaging', uuidv4(), {
			members: [user],
			name: uuidv4(),
		});
		await channel.create();
	});

	it('return 1 result', async function () {
		const resp = await client.queryChannels({
			members: [user],
			name: {
				$autocomplete: channel.data.name.substring(0, 8),
			},
		});
		expect(resp.length).to.be.equal(1);
		expect(resp[0].cid).to.be.equal(channel.cid);
	});

	it('empty $autocomplete query should lead to a status 400 error', async () => {
		let error = false;
		try {
			await client.queryChannels({
				members: [user],
				name: {
					$autocomplete: '',
				},
			});
		} catch (e) {
			error = true;
			expect(e.response).to.not.be.undefined;
			expect(e.response.data).to.not.be.undefined;
			expect(e.response.data.code).to.equal(4);
			expect(e.response.data.StatusCode).to.equal(400);
		}
		expect(error).to.be.true;
	});

	it('$autocomplete with special symbols only should lead to a status 400 error', async () => {
		let error = false;
		try {
			await client.queryChannels({
				members: [user],
				name: {
					$autocomplete: '!@#$%!%&*()',
				},
			});
		} catch (e) {
			error = true;
			expect(e.response).to.not.be.undefined;
			expect(e.response.data).to.not.be.undefined;
			expect(e.response.data.code).to.equal(4);
			expect(e.response.data.StatusCode).to.equal(400);
		}
		expect(error).to.be.true;
	});

	it('$autocomplete query with random characters', async () => {
		for (let i = 0; i < 10; i++) {
			try {
				await client.queryChannels({
					members: [user],
					name: {
						$autocomplete: randomUnicodeString(24),
					},
				});
			} catch (e) {
				expect(e.response).to.not.be.undefined;
				expect(e.response.data).to.not.be.undefined;
				expect(e.response.data.code).to.equal(4);
				expect(e.response.data.StatusCode).to.equal(400);
			}
		}
	});
});

describe('unread counts on hard delete messages', function () {
	let channel;
	let client;
	let ssclient;
	const tommaso = uuidv4();
	const thierry = uuidv4();
	const nick = uuidv4();
	const messages = [];
	before(async function () {
		await createUsers([tommaso, thierry, nick]);
		client = await getTestClientForUser(tommaso);
		ssclient = getTestClient(true);

		channel = client.channel('messaging', uuidv4(), {
			members: [tommaso, thierry, nick],
		});
		await channel.create();
	});

	it('tommaso sends 3 messages', async function () {
		for (let i = 0; i < 3; i++) {
			messages.push(await channel.sendMessage({ text: 'hi' }));
		}
	});

	it('tommaso deletes the 1st message', async function () {
		await ssclient.deleteMessage(messages[0].message.id, true);
	});

	it('validates unread counts for all the users', async function () {
		const tommasoClient = await getTestClientForUser(tommaso);
		// expect 0 conts since tommaso is the sender
		expect(tommasoClient.health.me.unread_count).to.be.equal(0);
		expect(tommasoClient.health.me.unread_channels).to.be.equal(0);

		const thierryClient = await getTestClientForUser(thierry);
		// expect 2 counts since we deleted the first message
		expect(thierryClient.health.me.unread_count).to.be.equal(2);
		expect(thierryClient.health.me.unread_channels).to.be.equal(1);

		const nickClient = await getTestClientForUser(nick);
		// expect 2 counts since  we deleted the first message
		expect(nickClient.health.me.unread_count).to.be.equal(2);
		expect(nickClient.health.me.unread_channels).to.be.equal(1);
	});

	it('nick and thierry mark the channel as read', async function () {
		const nickClient = await getTestClientForUser(nick);
		const nickChannel = nickClient.channel(channel.type, channel.id);
		await nickChannel.watch();
		await nickChannel.markRead();

		const thierryClient = await getTestClientForUser(thierry);
		const thierryChannel = thierryClient.channel(channel.type, channel.id);
		await thierryChannel.watch();
		await thierryChannel.markRead();
	});

	it('tommaso hard delete the remaining messages', async function () {
		await ssclient.deleteMessage(messages[1].message.id, true);
		await ssclient.deleteMessage(messages[2].message.id, true);
	});

	it('unread counts should be zero for all the users', async function () {
		const tommasoClient = await getTestClientForUser(tommaso);
		// expect 0 conts since tommaso is the sender
		expect(tommasoClient.health.me.unread_count).to.be.equal(0);
		expect(tommasoClient.health.me.unread_channels).to.be.equal(0);

		const thierryClient = await getTestClientForUser(thierry);
		// expect 2 counts since we deleted the first message
		expect(thierryClient.health.me.unread_count).to.be.equal(0);
		expect(thierryClient.health.me.unread_channels).to.be.equal(0);

		const nickClient = await getTestClientForUser(nick);
		// expect 2 counts since we deleted the first message
		expect(nickClient.health.me.unread_count).to.be.equal(0);
		expect(nickClient.health.me.unread_channels).to.be.equal(0);
	});
});

describe('channel message search', function () {
	let authClient;
	const userID = uuidv4();
	before(async () => {
		authClient = await getTestClientForUser(userID);
	});

	it('No searchable fails', async () => {
		const channelID = uuidv4();
		// search is disabled for gaming
		const channel = getServerTestClient().channel('gaming', channelID, {
			created_by_id: userID,
			members: [userID],
		});
		await channel.create();
		await expectHTTPErrorCode(400, channel.search('missing'));
		await expectHTTPErrorCode(
			400,
			authClient.channel('gaming', channelID).search('missing'),
		);
	});

	it('Basic Query (old format)', async function () {
		const channelId = uuidv4();
		// add a very special message
		const channel = authClient.channel('messaging', channelId);
		await channel.create();
		const keyword = 'supercalifragilisticexpialidocious';
		await channel.sendMessage({ text: `words ${keyword} what?` });
		await channel.sendMessage({ text: `great movie because of ${keyword}` });

		const filters = { type: 'messaging' };
		const response = await channel.search('supercalifragilisticexpialidocious', {
			limit: 2,
			offset: 0,
		});
		expect(response.results.length).to.equal(2);
		expect(response.results[0].message.text).to.contain(
			'supercalifragilisticexpialidocious',
		);
	});

	it('invalid query argument type should return an error', async function () {
		const unique = uuidv4();
		const channel = authClient.channel('messaging', uuidv4(), {
			unique,
		});
		await channel.create();
		try {
			await channel.search(1);
		} catch (e) {
			expect(e.message).to.be.equal('Invalid type number for query parameter');
		}
	});

	it('query message custom fields', async function () {
		const unique = uuidv4();
		const channel = authClient.channel('messaging', uuidv4(), {
			unique,
		});
		await channel.create();
		await channel.sendMessage({ text: 'hi', unique });

		const messageFilters = { unique };
		const response = await channel.search(messageFilters);
		expect(response.results.length).to.equal(1);
		expect(response.results[0].message.unique).to.equal(unique);
	});

	it('search by message type', async function () {
		const unique = uuidv4();
		const channel = authClient.channel('messaging', uuidv4(), {
			unique,
		});
		await channel.create();
		const regular = await channel.sendMessage({ text: 'regular' });
		const reply = await channel.sendMessage({
			text: 'reply',
			parent_id: regular.message.id,
		});

		let response = await channel.search({ type: 'regular' });
		expect(response.results.length).to.equal(1);
		expect(response.results[0].message.id).to.equal(regular.message.id);

		response = await channel.search({ type: 'reply' });
		expect(response.results.length).to.equal(1);
		expect(response.results[0].message.id).to.equal(reply.message.id);

		response = await channel.search({ type: { $in: ['reply', 'regular'] } });
		expect(response.results.length).to.equal(2);
	});

	describe('search by mentioned users', () => {
		const unique = uuidv4();
		let channel;
		const tommaso = uuidv4();
		const thierry = uuidv4();

		let mention;
		before(async () => {
			channel = authClient.channel('messaging', uuidv4(), {
				unique,
			});
			await createUsers([tommaso, thierry]);
			await channel.create();
			await channel.sendMessage({ text: 'regular' });
			mention = await channel.sendMessage({
				text: 'mentions',
				mentioned_users: [tommaso, thierry],
			});
		});

		it('mentioned_users.id $contains tommaso', async () => {
			const response = await channel.search({
				'mentioned_users.id': { $contains: tommaso },
			});
			expect(response.results.length).to.equal(1);
			expect(response.results[0].message.id).to.equal(mention.message.id);
		});

		it('mentioned_users.id invalid value type', async () => {
			await expectHTTPErrorCode(
				400,
				channel.search({ 'mentioned_users.id': { $contains: [tommaso] } }),
				'StreamChat error code 4: Search failed with error: "field `mentioned_users.id` contains type array. expecting string"',
			);
		});

		it('mentioned_users.id invalid operator', async () => {
			await expectHTTPErrorCode(
				400,
				channel.search({ 'mentioned_users.id': { $eq: tommaso } }),
				'StreamChat error code 4: Search failed with error: "mentioned_users.id only supports $contains operator"',
			);
		});
	});

	it('query message text and custom field', async function () {
		const unique = uuidv4();
		const channel = authClient.channel('messaging', uuidv4(), {
			unique,
		});
		await channel.create();
		await channel.sendMessage({ text: 'hi', unique });
		await channel.sendMessage({ text: 'hi' });

		const messageFilters = { text: 'hi', unique };
		const response = await channel.search(messageFilters);
		expect(response.results.length).to.equal(1);
		expect(response.results[0].message.unique).to.equal(unique);
	});

	it('query messages with attachments', async function () {
		const unique = uuidv4();
		const channel = authClient.channel('messaging', uuidv4(), {
			unique,
		});
		await channel.create();
		const attachments = [
			{
				type: 'hashtag',
				name: 'awesome',
				awesome: true,
			},
		];
		await channel.sendMessage({ text: 'hi', unique });
		await channel.sendMessage({ text: 'hi', attachments });

		const messageFilters = { attachments: { $exists: true } };
		const response = await channel.search(messageFilters);
		expect(response.results.length).to.equal(1);
		expect(response.results[0].message.unique).to.be.undefined;
	});

	it('basic Query using $q syntax', async function () {
		// add a very special message
		const channel = authClient.channel('messaging', uuidv4());
		await channel.create();
		const keyword = 'supercalifragilisticexpialidocious';
		await channel.sendMessage({ text: `words ${keyword} what?` });
		await channel.sendMessage({ text: `great movie because of ${keyword}` });

		const response = await channel.search(
			{ text: { $q: 'supercalifragilisticexpialidocious' } },
			{ limit: 2, offset: 0 },
		);
		expect(response.results.length).to.equal(2);
		expect(response.results[0].message.text).to.contain(
			'supercalifragilisticexpialidocious',
		);
	});

	it('query by message id', async function () {
		// add a very special messsage
		const channel = authClient.channel('messaging', uuidv4());
		await channel.create();
		const smResp = await channel.sendMessage({ text: 'awesome response' });

		const response = await channel.search(
			{ id: smResp.message.id },
			{ limit: 2, offset: 0 },
		);
		expect(response.results.length).to.equal(1);
		expect(response.results[0].message.id).to.equal(smResp.message.id);
	});

	it('query by message parent_id', async function () {
		const channel = authClient.channel('messaging', uuidv4());
		await channel.create();
		const smResp = await channel.sendMessage({ text: 'awesome response' });
		const reply = await channel.sendMessage({
			text: 'awesome response reply',
			parent_id: smResp.message.id,
		});

		const response = await channel.search(
			{ parent_id: smResp.message.id },
			{ limit: 2, offset: 0 },
		);
		expect(response.results.length).to.equal(1);
		expect(response.results[0].message.id).to.equal(reply.message.id);
	});

	it('query parent_id $exists + custom field', async function () {
		const channel = authClient.channel('messaging', uuidv4());
		await channel.create();
		const smResp = await channel.sendMessage({ text: 'awesome response' });
		const reply = await channel.sendMessage({
			text: 'awesome response reply',
			parent_id: smResp.message.id,
			unique: uuidv4(),
		});

		const response = await channel.search(
			{ parent_id: { $exists: true }, unique: reply.message.unique },
			{ limit: 2, offset: 0 },
		);
		expect(response.results.length).to.equal(1);
		expect(response.results[0].message.id).to.equal(reply.message.id);
	});

	it('query by message reply count', async function () {
		const channel = authClient.channel('messaging', uuidv4());
		await channel.create();
		const smResp = await channel.sendMessage({ text: 'awesome response' });
		const reply = await channel.sendMessage({
			text: 'awesome response reply',
			parent_id: smResp.message.id,
		});

		const response = await channel.search(
			{ reply_count: 1 },
			{ limit: 2, offset: 0 },
		);
		expect(response.results.length).to.equal(1);
		expect(response.results[0].message.id).to.equal(smResp.message.id);
	});

	it('message contains own_reactions', async function () {
		// add a very special messsage
		const channel = authClient.channel('messaging', uuidv4());
		await channel.create();
		const smResp = await channel.sendMessage({ text: 'awesome response' });

		await channel.sendReaction(smResp.message.id, { type: 'like' });

		const response = await channel.search(
			{ id: smResp.message.id },
			{ limit: 2, offset: 0 },
		);
		expect(response.results.length).to.equal(1);
		expect(response.results[0].message.id).to.equal(smResp.message.id);
		expect(response.results[0].message.own_reactions.length).to.equal(1);
	});
});

describe('search on deleted channels', function () {
	const user = uuidv4();
	const channelId = uuidv4();
	let channel;
	let client;
	before(async function () {
		client = await getTestClientForUser(user);
		channel = client.channel('messaging', channelId, {
			members: [user],
		});
		await channel.create();
	});

	it('add some messages to the channel', async function () {
		for (let i = 0; i < 5; i++) {
			await channel.sendMessage({
				text: `supercalifragilisticexpialidocious ${i}`,
			});
		}
	});

	it('search by text', async function () {
		const resp = await channel.search('supercalifragilisticexpialidocious');
		expect(resp.results.length).to.be.equal(5);
	});

	it('delete and recreate the channel', async function () {
		await channel.delete();
		channel = client.channel('messaging', channelId, {
			members: [user],
		});
		await channel.create();
	});

	it('search on previously deleted chanel', async function () {
		const resp = await channel.search('supercalifragilisticexpialidocious');
		expect(resp.results.length).to.be.equal(0);
	});
});

describe('pagination with invalid offset', function () {
	let channel;
	let client;
	const user = uuidv4();
	before(async function () {
		client = await getTestClientForUser(user);
		channel = client.channel('messaging', uuidv4());
		await channel.create();

		for (let i = 0; i < 30; i++) {
			const m = await channel.sendMessage({ text: i.toString() });
		}
	});
	it('offset > than total channel messages', async function () {
		const result = await channel.query({ messages: { limit: 10, offset: 35 } });
		expect(result.messages.length).to.be.equal(0);
	});
});

describe('update channel with reserved fields', function () {
	const user = uuidv4();
	const channelType = uuidv4();
	const channelId = uuidv4();
	let channel;
	let client;
	before(async function () {
		client = getServerTestClient();

		await client.createChannelType({
			name: channelType,
			commands: ['giphy'],
		});

		channel = client.channel(channelType, channelId, {
			members: [user],
			created_by_id: user,
		});
		await channel.watch();
	});

	it('should not fail when re-using channel.data', async function () {
		await channel.update(channel.data);
	});

	it('should not fail when re-using channel._data', async function () {
		await channel.update(channel._data);
	});
});

describe('notification.channel_deleted', () => {
	let channel;
	const member = 'member' + uuidv4();

	before(async () => {
		const creator = 'creator' + uuidv4();
		await createUsers([member, creator]);
		const c = getTestClient(true);

		channel = c.channel('messaging', uuidv4(), {
			created_by_id: creator,
			members: [creator, member],
		});
		await channel.create();
	});

	it('member should receive channel delete notification, when not watching the channel', async () => {
		const memberClient = await getTestClientForUser(member);
		const waiter = createEventWaiter(memberClient, 'notification.channel_deleted');
		await channel.delete();
		await waiter;
	});
});

describe('partial update channel', () => {
	let channel;
	let ssClient;
	let ownerClient;
	let modClient;
	let memberClient;
	const moderator = uuidv4();
	const member = uuidv4();
	const owner = uuidv4();

	before(async () => {
		ssClient = getServerTestClient();
		ownerClient = await getTestClientForUser(owner);
		modClient = await getTestClientForUser(moderator);
		memberClient = await getTestClientForUser(member);
		channel = ownerClient.channel('messaging', uuidv4(), {
			members: [owner, moderator, member],
			source: 'user',
			source_detail: { user_id: 123 },
			channel_detail: { topic: 'Plants and Animals', rating: 'pg' },
		});
		await channel.create();
		await ssClient.channel(channel.type, channel.id).addModerators([moderator]);
	});

	it('change the source property', async () => {
		const resp = await channel.updatePartial({ set: { source: 'system' } });
		expect(resp.channel.source).to.be.equal('system');
		expect(resp.channel.source_detail).to.be.eql({ user_id: 123 });
		expect(resp.channel.channel_detail).to.be.eql({
			topic: 'Plants and Animals',
			rating: 'pg',
		});
	});

	it('unset the source_detail', async () => {
		const resp = await channel.updatePartial({ unset: ['source_detail'] });
		expect(resp.channel.source).to.be.equal('system');
		expect(resp.channel.source_detail).to.be.undefined;
		expect(resp.channel.channel_detail).to.be.eql({
			topic: 'Plants and Animals',
			rating: 'pg',
		});
	});

	it('set a nested property', async () => {
		const resp = await channel.updatePartial({
			set: { 'channel_detail.topic': 'Nature' },
		});
		expect(resp.channel.source).to.be.equal('system');
		expect(resp.channel.source_detail).to.be.undefined;
		expect(resp.channel.channel_detail).to.be.eql({
			topic: 'Nature',
			rating: 'pg',
		});
	});

	it('unset a nested property', async () => {
		const resp = await channel.updatePartial({ unset: ['channel_detail.topic'] });
		expect(resp.channel.source).to.be.equal('system');
		expect(resp.channel.source_detail).to.be.undefined;
		expect(resp.channel.channel_detail).to.be.eql({ rating: 'pg' });
	});

	it.skip('partial update concurrently works', async () => {
		// keep in mind that there is no way to ensure ordering...
		const promises = [];
		for (let i = 0; i < 3; i++) {
			const field = 'field' + i.toString();
			const update = { set: {} };
			update.set[field] = field;
			promises.push(channel.updatePartial(update));
		}
		await Promise.all(promises);

		// expect all the fields to be present
		const resp = await channel.query();
		expect(resp.channel.field0).to.be.equal('field0');
		expect(resp.channel.field1).to.be.equal('field1');
		expect(resp.channel.field2).to.be.equal('field2');
	});

	it('moderators and server side can set slowmode field', async () => {
		// moderators can set cooldown
		let resp = await modClient
			.channel(channel.type, channel.id)
			.updatePartial({ set: { cooldown: 10 } });
		expect(resp.channel.cooldown).to.be.equal(10);

		// server side auth can set cooldown
		resp = await ssClient
			.channel(channel.type, channel.id)
			.updatePartial({ set: { cooldown: 0 } });
		expect(resp.channel.cooldown).to.be.undefined;
	});

	it('team cannot be updated by moderators', async () => {
		await expectHTTPErrorCode(
			403,
			modClient
				.channel(channel.type, channel.id)
				.updatePartial({ set: { team: 'blue' } }),
			'StreamChat error code 17: UpdateChannelPartial failed with error: "you are not allowed to update the field `team`"',
		);
	});

	it('ensure that reserved fields cant be updated', async () => {
		for (const field of ['updated_at', 'created_at', 'members', 'member_count']) {
			const update = { set: {} };
			update.set[field] = 0;
			await expectHTTPErrorCode(
				403,
				modClient.channel(channel.type, channel.id).updatePartial(update),
				'StreamChat error code 17: UpdateChannelPartial failed with error: "field `' +
					field +
					'` is reserved and cannot updated"',
			);
		}
	});
});

describe('Quote messages', () => {
	let client, channel, ruud, friend, firstMessage, secondMessage, messageWithQuote;

	before(async () => {
		ruud = 'ruud-' + uuidv4();
		friend = 'friend-' + uuidv4();
		await createUsers([ruud, friend]);
		client = getServerTestClient();
		channel = client.channel('messaging', uuidv4(), {
			created_by_id: ruud,
			members: [ruud, friend],
		});
		await channel.create();
	});

	after(async () => {
		await channel.delete();
		await client.deleteUser(ruud, { hard_delete: true });
		await client.deleteUser(friend, { hard_delete: true });
	});

	describe('Ruud sends a message in the channel', () => {
		it('is possible to create regular messages', async () => {
			const res = await channel.sendMessage({
				text: 'The one message to rule them all',
				user_id: ruud,
			});
			const res2 = await channel.sendMessage({
				text: 'The second message to rule all, except the first message',
				user_id: ruud,
			});
			firstMessage = res.message;
			secondMessage = res2.message;
		});
	});

	describe('Friend replies to the message in a thread', () => {
		it('is possible to reply to the message', async () => {
			const res = await channel.sendMessage({
				text: 'The first threaded reply',
				user_id: friend,
				parent_id: firstMessage.id,
			});

			expect(res.message).to.not.be.undefined;
			expect(res.message.id).to.not.be.empty;
			expect(res.message.parent_id).to.not.be.undefined;
			expect(res.message.type).to.equal('reply');
		});
	});

	describe('Friend quotes message', () => {
		it('is possible to quote a message', async () => {
			const res = await channel.sendMessage({
				text: 'The first message that quotes a message',
				user_id: friend,
				quoted_message_id: firstMessage.id,
			});

			expect(res.message).to.not.be.undefined;
			expect(res.message.id).to.not.be.empty;
			expect(res.message.quoted_message).to.not.be.undefined;
			expect(res.message.quoted_message_id).to.equal(firstMessage.id);
			expect(res.message.quoted_message.id).to.equal(firstMessage.id);
			expect(res.message.quoted_message.text).to.equal(firstMessage.text);
			expect(res.message.type).to.equal('regular');
			expect(res.message.parent_id).to.be.undefined;
			expect(res.message.quoted_message.user).to.not.be.undefined;
			messageWithQuote = res.message;
		});

		it('the quoted message is enriched when querying the channel with its messages', async () => {
			const chan = await client
				.channel('messaging', channel.id)
				.query({ state: true });
			const clm = chan.messages.pop();
			expect(clm).to.not.be.undefined;
			expect(clm.id).to.equal(messageWithQuote.id);
			expect(clm.quoted_message).to.not.be.undefined;
			expect(clm.quoted_message_id).to.equal(firstMessage.id);
			expect(clm.quoted_message.id).to.equal(firstMessage.id);
			expect(clm.quoted_message.user).to.not.be.undefined;
			expect(clm.quoted_message.text).to.equal(firstMessage.text);
			expect(clm.type).to.equal('regular');
			expect(clm.parent_id).to.be.undefined;
		});
	});

	describe('Friend changes the message they quoted', () => {
		it('is possible to change a quoted_message_id', async () => {
			const res = await client.updateMessage(
				{
					id: messageWithQuote.id,
					text: 'The first message that quotes a message',
					quoted_message_id: secondMessage.id,
				},
				friend,
			);

			expect(res.message).to.not.be.undefined;
			expect(res.message.id).to.not.be.empty;
			expect(res.message.quoted_message).to.not.be.undefined;
			expect(res.message.quoted_message_id).to.equal(secondMessage.id);
			expect(res.message.quoted_message.id).to.equal(secondMessage.id);
			expect(res.message.quoted_message.text).to.equal(secondMessage.text);
			expect(res.message.type).to.equal('regular');
			expect(res.message.parent_id).to.be.undefined;
			expect(res.message.quoted_message.user).to.not.be.undefined;
			messageWithQuote = res.message;
		});

		it('the quoted message is enriched with the changed quoted_message_id', async () => {
			const chan = await client
				.channel('messaging', channel.id)
				.query({ state: true });
			const clm = chan.messages.pop();
			expect(clm).to.not.be.undefined;
			expect(clm.id).to.equal(messageWithQuote.id);
			expect(clm.quoted_message).to.not.be.undefined;
			expect(clm.quoted_message_id).to.equal(secondMessage.id);
			expect(clm.quoted_message.id).to.equal(secondMessage.id);
			expect(clm.quoted_message.text).to.equal(secondMessage.text);
			expect(clm.type).to.equal('regular');
			expect(clm.parent_id).to.be.undefined;
			expect(clm.quoted_message.user).to.not.be.undefined;
		});

		it('is possible to change the quoted_message_id back', async () => {
			const res = await client.updateMessage(
				{
					id: messageWithQuote.id,
					text: 'The first message that quotes a message',
					quoted_message_id: firstMessage.id,
				},
				friend,
			);

			expect(res.message).to.not.be.undefined;
			expect(res.message.id).to.not.be.empty;
			expect(res.message.quoted_message).to.not.be.undefined;
			expect(res.message.quoted_message_id).to.equal(firstMessage.id);
			expect(res.message.quoted_message.id).to.equal(firstMessage.id);
			expect(res.message.quoted_message.text).to.equal(firstMessage.text);
			expect(res.message.type).to.equal('regular');
			expect(res.message.parent_id).to.be.undefined;
			expect(res.message.quoted_message.user).to.not.be.undefined;
			messageWithQuote = res.message;
		});
	});

	describe("Ruud quotes the friend's message with the quoted message", () => {
		let quoteQuotedMessage;

		it('is possible to quote a message with a quoted message', async () => {
			const res = await channel.sendMessage({
				text: 'The first message to quote a message with a quoted message',
				user_id: friend,
				quoted_message_id: messageWithQuote.id,
			});

			expect(res.message).to.not.be.undefined;
			expect(res.message.id).to.not.be.empty;
			expect(res.message.quoted_message).to.not.be.undefined;
			expect(res.message.quoted_message_id).to.equal(messageWithQuote.id);
			expect(res.message.quoted_message.id).to.equal(messageWithQuote.id);
			expect(res.message.quoted_message.text).to.equal(messageWithQuote.text);
			expect(res.message.type).to.equal('regular');
			expect(res.message.parent_id).to.be.undefined;
			expect(res.message.quoted_message.user).to.not.be.undefined;
			quoteQuotedMessage = res.message;
		});

		it('the quoted message is enriched when querying the channel with its messages', async () => {
			const chan = await client
				.channel('messaging', channel.id)
				.query({ state: true });
			const clm = chan.messages.pop();
			expect(clm).to.not.be.undefined;
			expect(clm.id).to.equal(quoteQuotedMessage.id);
			expect(clm.quoted_message).to.not.be.undefined;
			expect(clm.quoted_message_id).to.equal(messageWithQuote.id);
			expect(clm.quoted_message.id).to.equal(messageWithQuote.id);
			expect(clm.quoted_message.text).to.not.be.undefined;
			expect(clm.quoted_message.text).to.equal(messageWithQuote.text);
			// No nested quotes
			expect(clm.quoted_message.quoted_message).to.be.undefined;
			expect(clm.quoted_message.user).to.not.be.undefined;
			expect(clm.type).to.equal('regular');
			expect(clm.parent_id).to.be.undefined;
		});
	});

	describe('Ruud and friend send 55 random messages each and try sending a message with a quoted message again', () => {
		let messageWithQuote;

		it('is possible to send random messages', async () => {
			for (let i = 0; i < 55; i++) {
				await channel.sendMessage({ text: uuidv4(), user_id: ruud });
				await channel.sendMessage({ text: uuidv4(), user_id: friend });
			}
		});

		it('is still possible to quote the first message', async () => {
			const res = await channel.sendMessage({
				text: 'The second quoted reply',
				user_id: friend,
				quoted_message_id: firstMessage.id,
			});

			expect(res.message).to.not.be.undefined;
			expect(res.message.id).to.not.be.undefined;
			expect(res.message.quoted_message_id).to.not.be.undefined;
			expect(res.message.quoted_message).to.not.be.undefined;
			expect(res.message.quoted_message_id).to.equal(firstMessage.id);
			expect(res.message.quoted_message.id).to.equal(firstMessage.id);
			expect(res.message.quoted_message.text).to.equal(firstMessage.text);
			expect(res.message.type).to.equal('regular');
			expect(res.message.parent_id).to.be.undefined;
			expect(res.message.quoted_message.user).to.not.be.undefined;
			messageWithQuote = res.message;
		});

		it('the quoted message is still properly enriched when querying the channel with its messages', async () => {
			const chan = await client
				.channel('messaging', channel.id)
				.query({ state: true });
			const clm = chan.messages.pop();
			expect(clm).to.not.be.undefined;
			expect(clm.id).to.equal(messageWithQuote.id);
			expect(clm.quoted_message).to.not.be.undefined;
			expect(clm.quoted_message_id).to.equal(firstMessage.id);
			expect(clm.quoted_message.id).to.equal(firstMessage.id);
			expect(clm.quoted_message.text).to.equal(firstMessage.text);
			expect(clm.type).to.equal('regular');
			expect(clm.parent_id).to.be.undefined;
			expect(clm.quoted_message.user).to.not.be.undefined;
		});
	});
});

describe('Channel - isUpToDate', async () => {
	it('new message should skip state, if channel is not upToDate', async () => {
		const userIdVish = 'vishal';
		const userIdAmin = 'amin';
		await createUsers([userIdVish, userIdAmin]);

		const clientVish = await getTestClientForUser(userIdVish);
		const channelId = uuidv4();
		const channelVish = clientVish.channel('messaging', channelId, {
			members: [userIdAmin, userIdVish],
		});
		await channelVish.watch();

		const serverClient = getServerTestClient();
		const channelAmin = serverClient.channel('messaging', channelId);

		// First lets try with upToDate list.
		let waiter = createEventWaiter(channelVish, 'message.new');
		const { message: message1 } = await channelAmin.sendMessage({
			text: uuidv4(),
			user_id: userIdAmin,
		});
		await waiter;
		expect(
			channelVish.state.messages.findIndex((m) => m.id === message1.id),
		).to.be.equal(0);

		// Now lets check not upToDate list.
		channelVish.state.setIsUpToDate(false);
		waiter = createEventWaiter(channelVish, 'message.new');
		const { message: message2 } = await channelAmin.sendMessage({
			text: uuidv4(),
			user_id: userIdAmin,
		});
		await waiter;
		expect(
			channelVish.state.messages.findIndex((m) => m.id === message2.id),
		).to.be.equal(-1);
	});
});
