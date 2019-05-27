import uuidv4 from 'uuid/v4';
import {
	getTestClient,
	getTestClientForUser,
	createUserToken,
	expectHTTPErrorCode,
	createUsers,
} from './utils';
import chai from 'chai';
const expect = chai.expect;

if (process.env.NODE_ENV !== 'production') {
	require('longjohn');
}

Promise = require('bluebird'); // eslint-disable-line no-global-assign
Promise.config({
	longStackTraces: true,
	warnings: {
		wForgottenReturn: false,
	},
});

describe('Channels - Create', function() {
	const johnID = `john-${uuidv4()}`;

	it('john creates a channel with members', async function() {
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

describe('Channels - members', function() {
	const tommasoID = `tommaso-${uuidv4()}`;
	const thierryID = `thierry-${uuidv4()}`;

	const channelGroup = 'messaging';
	const channelId = `test-channels-${uuidv4()}`;
	const tommasoToken = createUserToken(tommasoID);
	const thierryToken = createUserToken(thierryID);

	const tommasoClient = getTestClient();
	const thierryClient = getTestClient();

	let tommasoChannel, thierryChannel;
	const message = { text: 'nice little chat API' };

	const tommasoChannelEventQueue = [];
	const thierryChannelEventQueue = [];
	let tommasoPromise;
	let thierryPromise1;
	let thierryPromise2;

	let tommasoMessageID;

	before(async () => {
		await tommasoClient.setUser({ id: tommasoID }, tommasoToken);
		await thierryClient.setUser({ id: thierryID }, thierryToken);
	});

	it('tommaso creates a new channel', async function() {
		tommasoChannel = tommasoClient.channel(channelGroup, channelId);
		tommasoPromise = new Promise(resolve => {
			tommasoChannel.on(event => {
				tommasoChannelEventQueue.push(event);
				if (tommasoChannelEventQueue.length === 4) {
					resolve();
				}
			});
		});
		await tommasoChannel.watch();
	});

	it(`tommaso tries to create a channel that's too large`, async function() {
		await expectHTTPErrorCode(
			400,
			tommasoClient
				.channel(channelGroup, `big-boy-${uuidv4()}`, {
					stuff: 'x'.repeat(6 * 1024),
				})
				.create(),
		);
	});

	it(`tommaso tries to create a channel with a reserved character`, async function() {
		await expectHTTPErrorCode(
			400,
			tommasoClient.channel(channelGroup, `!${channelId}`).watch(),
		);
	});

	it('thierry tries to join the channel', async function() {
		await expectHTTPErrorCode(
			403,
			thierryClient.channel(channelGroup, channelId).watch(),
		);
	});

	it('tommaso adds thierry as channel member', async function() {
		await tommasoChannel.addMembers([thierryID]);
	});

	it('thierry tries to join the channel', async function() {
		thierryChannel = thierryClient.channel(channelGroup, channelId);
		thierryPromise2 = new Promise(resolve2 => {
			thierryPromise1 = new Promise(resolve1 => {
				thierryChannel.on(event => {
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

	it('tommaso gets an event about Thierry joining', async function() {
		await tommasoPromise;
		let event = tommasoChannelEventQueue.pop();
		expect(event.type).to.eql('user.watching.start');
		expect(event.user.id).to.eql(thierryID);

		event = tommasoChannelEventQueue.pop();
		expect(event.type).to.eql('channel.updated');
		event = tommasoChannelEventQueue.pop();
		expect(event.type).to.eql('member.added');
	});

	it('tommaso posts a message', async function() {
		await tommasoChannel.sendMessage(message);
	});

	it('thierry gets the new message from tommaso', async function() {
		await thierryPromise1;
		const event = thierryChannelEventQueue.pop();
		expect(event.type).to.eql('message.new');
		tommasoMessageID = event.message.id;
	});

	it('thierry tries to update the channel description', async function() {
		await expectHTTPErrorCode(
			403,
			thierryChannel.update({ description: 'taking over this channel now!' }),
		);
	});

	it('tommaso updates the channel description', async function() {
		await tommasoChannel.update({ description: 'taking over this channel now!' });
	});

	it('tommaso updates his own message', async function() {
		await tommasoClient.updateMessage({
			id: tommasoMessageID,
			text: 'I mean, awesome chat',
		});
	});

	it('thierry tries to update tommaso message', async function() {
		await expectHTTPErrorCode(
			403,
			thierryClient.updateMessage({
				id: tommasoMessageID,
				text: 'I mean, awesome chat',
			}),
		);
	});

	it('thierry mutes himself', async function() {
		const response = await thierryChannel.sendMessage({
			text: `/mute @${thierryID}`,
		});
		expect(response.message.type).to.eql('error');
	});

	it('thierry gets promoted', async function() {
		await getTestClient(true).updateUser({ id: thierryID, role: 'admin' });
	});

	it('correct member count', async function() {
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

	it('member list is correctly returned', async function() {
		const newMembers = ['member1', 'member2'];
		await createUsers(newMembers);
		const channelId = `test-member-cache-${uuidv4()}`;
		const initialMembers = [tommasoID, thierryID];
		const channel = tommasoClient.channel('messaging', channelId);
		await channel.create();
		await channel.addMembers([initialMembers[0]]);
		await channel.addMembers([initialMembers[1]]);
		let resp = await channel.watch();

		expect(resp.members.length).to.be.equal(initialMembers.length);
		expect(resp.members[0].user.id).to.be.equal(initialMembers[0]);
		expect(resp.members[1].user.id).to.be.equal(initialMembers[1]);

		for (let i = 0; i < 3; i++) {
			const op1 = channel.sendMessage({ text: 'new message' });
			const op2 = channel.update({ color: 'blue' }, { text: 'got new message!' });
			const op3 = channel.addMembers(newMembers);
			await Promise.all([op1, op2, op3]);
		}
		resp = await channel.watch();
		expect(resp.members.length).to.be.equal(4);
		expect(resp.members[0].user.id).to.be.equal(initialMembers[0]);
		expect(resp.members[1].user.id).to.be.equal(initialMembers[1]);
		expect(resp.members[2].user.id).to.be.equal(newMembers[0]);
		expect(resp.members[3].user.id).to.be.equal(newMembers[1]);

		for (let i = 0; i < 3; i++) {
			const op1 = channel.removeMembers(newMembers);
			const op2 = channel.update({ color: 'blue' }, { text: 'got new message!' });
			const op3 = channel.sendMessage({ text: 'new message' });
			await Promise.all([op1, op2, op3]);
		}

		resp = await channel.watch();
		expect(resp.members.length).to.be.equal(2);
		expect(resp.members[0].user.id).to.be.equal(initialMembers[0]);
		expect(resp.members[1].user.id).to.be.equal(initialMembers[1]);
	});

	it('channel messages and last_message_at are correctly returned', async function() {
		const unique = uuidv4();
		const newMembers = ['member1', 'member2'];
		await createUsers(newMembers);
		const channelId = `channel-messages-cache-${unique}`;
		const channel2Id = `channel-messages-cache2-${unique}`;
		const channel = tommasoClient.channel('messaging', channelId, {
			unique: unique,
		});
		await channel.create();
		const channel2 = tommasoClient.channel('messaging', channel2Id, {
			unique: unique,
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
					{ unique: unique },
					{ last_message_at: -1 },
					{ state: true },
				);
				expect(channels.length).to.be.equal(2);
				expect(channels[0].data.last_message_at).to.be.equal(last_message);
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

describe('Channels - Members are update correctly', function() {
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

	const runWithOtherOperations = async function(op) {
		const op2 = channel.update({ color: 'green' }, { text: 'got new message!' });
		const op3 = channel.sendMessage({ text: 'new message' });
		const op4 = channel.sendMessage({ text: 'new message' });
		const results = await Promise.all([op, op2, op3, op4]);
		return results[0];
	};

	let channel;
	let client;
	before(async function() {
		client = await getTestClientForUser(johnID);
		await createUsers(
			members.map(function(member) {
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

	it('channel state must be updated after removing a member', async function() {
		const resp = await runWithOtherOperations(channel.removeMembers([members[0].id]));
		expect(resp.members.length).to.be.equal(0);
		const channelState = await channel.watch();
		expect(channelState.members.length).to.be.equal(0);
	});

	it('channel state must be updated after adding a member', async function() {
		const resp = await runWithOtherOperations(channel.addMembers([members[0].id]));
		expect(resp.members.length).to.be.equal(1);
		const channelState = await channel.watch();
		expect(channelState.members.length).to.be.equal(1);
		expect(channelState.members[0].user.id).to.be.equal(members[0].id);
	});

	it('channel state must be updated after adding multiple members', async function() {
		const resp = await runWithOtherOperations(
			channel.addMembers([members[0].id, members[1].id, members[2].id]),
		);
		expect(resp.members.length).to.be.equal(3);
		const channelState = await channel.watch();
		expect(channelState.members.length).to.be.equal(3);
		expect(channelState.members[0].user.id).to.be.equal(members[0].id);
		expect(channelState.members[1].user.id).to.be.equal(members[1].id);
		expect(channelState.members[2].user.id).to.be.equal(members[2].id);
	});

	it('channel state must be updated after removing multiple members', async function() {
		const resp = await runWithOtherOperations(
			channel.removeMembers([members[0].id, members[1].id, members[2].id]),
		);
		expect(resp.members.length).to.be.equal(0);
		const channelState = await channel.watch();
		expect(channelState.members.length).to.be.equal(0);
	});
});

describe('Channels - Distinct channels', function() {
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
		await tommasoClient.setUser({ id: tommasoID }, tommasoToken);
		await thierryClient.setUser({ id: thierryID }, thierryToken);
		await createUsers([newMember]);
	});

	it('create a distinct channel without specifying members should fail', async function() {
		const channel = thierryClient.channel(channelGroup, '');
		await expectHTTPErrorCode(
			400,
			channel.create(),
			'StreamChat error code 4: GetOrCreateChannel failed with error: "When using member based IDs specify at least 2 members"',
		);
	});

	it('create a distinct channel with only one member should fail', async function() {
		const channel = thierryClient.channel(channelGroup, '', {
			members: [tommasoID],
		});
		await expectHTTPErrorCode(
			400,
			channel.create(),
			'StreamChat error code 4: GetOrCreateChannel failed with error: "When using member based IDs specify at least 2 members"',
		);
	});

	it('create a distinct channel with 2 members should succeed', async function() {
		distinctChannel = thierryClient.channel(channelGroup, '', {
			members: [tommasoID, thierryID],
			unique: unique,
		});
		await distinctChannel.create();
	});

	it('query previous created distinct channel', async function() {
		const channels = await thierryClient.queryChannels({
			members: [tommasoID, thierryID],
			unique: unique,
		});
		expect(channels.length).to.be.equal(1);
		expect(channels[0].data.unique).to.be.equal(unique);
	});

	it('adding members to distinct channel should fail', async function() {
		await expectHTTPErrorCode(
			400,
			distinctChannel.addMembers([newMember]),
			'StreamChat error code 4: UpdateChannel failed with error: "cannot add or remove members in a distinct channel, please create a new distinct channel with the desired members"',
		);
	});

	it('removing members from a distinct channel should fail', async function() {
		await expectHTTPErrorCode(
			400,
			distinctChannel.removeMembers([tommasoID]),
			'StreamChat error code 4: UpdateChannel failed with error: "cannot add or remove members in a distinct channel, please create a new distinct channel with the desired members"',
		);
	});
});
