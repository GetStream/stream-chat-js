import uuidv4 from 'uuid/v4';

import {
	createUsers,
	createUserToken,
	expectHTTPErrorCode,
	getTestClient,
	getTestClientForUser,
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

	describe('Channel members', function() {
		const channelId = `test-member-cache-${uuidv4()}`;
		const initialMembers = [tommasoID, thierryID];
		const newMembers = [uuidv4(), uuidv4()];

		let channel;

		before(async function() {
			await createUsers(newMembers);
			channel = tommasoClient.channel('messaging', channelId);
		});

		describe('When creating channel', function() {
			before(async function() {
				await channel.create();
			});

			it('returns empty channel members list', async function() {
				const resp = await channel.watch();

				expect(resp.members.length).to.be.equal(0);
			});
		});

		describe('When adding members to new channel', function() {
			before(async function() {
				await channel.addMembers(initialMembers);
			});

			it('returns channel members', async function() {
				const resp = await channel.watch();

				expect(resp.members.length).to.be.equal(initialMembers.length);
				expect(resp.members.map(m => m.user.id)).to.have.members(initialMembers);
			});
		});

		describe('When adding members to existing channel', function() {
			before(async function() {
				await channel.addMembers(newMembers);
			});

			it('returns existing members and new ones', async function() {
				const resp = await channel.watch();
				expect(resp.members.length).to.be.equal(4);
				expect(resp.members.map(m => m.user.id)).to.have.members(
					initialMembers.concat(newMembers),
				);
			});
		});

		describe('When removing members', function() {
			before(async function() {
				await channel.removeMembers(newMembers);
			});

			it('returns members without deleted', async function() {
				const resp = await channel.watch();
				expect(resp.members.length).to.be.equal(2);
				expect(resp.members.map(m => m.user.id)).to.have.members(initialMembers);
			});
		});
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
		const memberIDs = channelState.members.map(m => m.user.id);
		expect(memberIDs).to.deep.members(members.map(m => m.id));
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

describe('Query Channels and sort by unread', function() {
	const channels = [];
	const tommaso = 'tommaso' + uuidv4();
	const thierry = 'thierry' + uuidv4();
	let tommasoClient;
	let thierryClient;
	before(async function() {
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

	it('sort by has_unread and last_message_at asc should work', async function() {
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

	it('sort by has_unread and last_message_at', async function() {
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

	it('sort by unread_count asc', async function() {
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

	it('sort by unread_count desc', async function() {
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

	it('zero the counts and sort by has_unread and last_message_at asc', async function() {
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

	it('zero the counts and sort by has_unread and last_message_at desc', async function() {
		tommasoClient = await getTestClientForUser(tommaso);
		await tommasoClient.markAllRead();
		tommasoClient = await getTestClientForUser(tommaso);
		expect(tommasoClient.health.me.total_unread_count).to.be.equal(0);
		expect(tommasoClient.health.me.unread_channels).to.be.equal(0);
		let result = await tommasoClient.queryChannels(
			{ members: { $in: [tommaso] } },
			{ has_unread: 1, last_message_at: -1 },
		);

		expect(result.length).to.be.equal(4);
		expect(result[0].cid).to.be.equal(channels[3].cid);
		expect(result[1].cid).to.be.equal(channels[2].cid);
		expect(result[2].cid).to.be.equal(channels[1].cid);
		expect(result[3].cid).to.be.equal(channels[0].cid);
	});

	it('zero the counts and sort by unread_count and last_message_at asc', async function() {
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

	it('zero the counts and sort by unread_count and last_message_at desc', async function() {
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

	it('test "grouping"', async function() {
		tommasoClient = await getTestClientForUser(tommaso);
		await channels[0].sendMessage({ text: 'hi' });
		await channels[1].sendMessage({ text: 'hi' });
		let result = await tommasoClient.queryChannels(
			{ members: { $in: [tommaso] } },
			{ unread_count: -1, last_message_at: -1 },
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

		result = await tommasoClient.queryChannels(
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
		expect(result[3].cid).to.be.equal(channels[1].cid);
	});

	it('limit results should work fine', async function() {
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

	it('unread count + custom query should work', async function() {
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

	it('unread count + custom query with limit should work', async function() {
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

describe('hard delete messages', function() {
	const channelID = uuidv4();
	const user = uuidv4();
	let client, ssclient;
	let channel;
	let firstMessage;
	let secondMeessage;
	let thirdMeessage;

	before(async function() {
		client = await getTestClientForUser(user);
		ssclient = await getTestClient(true);
		channel = client.channel('messaging', channelID);
		await channel.create();
	});

	it('send 3 messages to the channel', async function() {
		firstMessage = await channel.sendMessage({ text: 'hi 1' });
		secondMeessage = await channel.sendMessage({ text: 'hi 2' });
		thirdMeessage = await channel.sendMessage({ text: 'hi 3' });
	});

	it('hard delete messages is not allowed client side', function() {
		expect(client.deleteMessage(firstMessage.message.id, true)).to.be.rejectedWith(
			'StreamChat error code 4: DeleteMessage failed with error: "hard delete messages is only allowed with server side auth"',
		);
	});

	it('hard delete the second message should work and not update  channel.last_message_id', async function() {
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

	it('hard delete the third message should update the channel last_message_at', async function() {
		const resp = await ssclient.deleteMessage(thirdMeessage.message.id, true);
		expect(resp.message.deleted_at).to.not.be.undefined;
		expect(resp.message.type).to.be.equal('deleted');

		channel = ssclient.channel('messaging', channelID, { created_by_id: user });
		await channel.watch();
		expect(channel.data.last_message_at).to.be.equal(firstMessage.message.created_at);
	});

	it('hard delete the last message in the channel should clear channel messages and last_message_at', async function() {
		const resp = await ssclient.deleteMessage(firstMessage.message.id, true);
		expect(resp.message.deleted_at).to.not.be.undefined;
		expect(resp.message.type).to.be.equal('deleted');

		channel = ssclient.channel('messaging', channelID, { created_by_id: user });
		const channelResp = await channel.watch();
		expect(channelResp.channel.last_message_at).to.be.undefined;
		expect(channelResp.messages.length).to.be.equal(0);
	});

	it('messages with reactions are hard deleted properly', async function() {
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

	it('query the channel should also return correct results', async function() {
		let channels = await ssclient.queryChannels({ cid: 'messaging:' + channelID });
		expect(channels.length).to.be.equal(1);
		const theChannel = channels[0];
		expect(theChannel.data.last_message_at).to.be.undefined;
	});

	it('validate channel.last_message_at correctly updated', async function() {
		let channels = await client.queryChannels({ cid: 'messaging:' + channelID });
		expect(channels.length).to.be.equal(1);
		const theChannel = channels[0];
		expect(theChannel.data.last_message_at).to.be.undefined;

		let messages = [];
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

	it('validate first channel message', async function() {
		let channels = await client.queryChannels({ cid: 'messaging:' + channelID });
		expect(channels.length).to.be.equal(1);
		const theChannel = channels[0];
		expect(theChannel.data.last_message_at).to.be.undefined;

		let messages = [];
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

	it('hard delete threads should work fine', async function() {
		let channels = await client.queryChannels({ cid: 'messaging:' + channelID });
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

describe('query channels by field $exists', function() {
	const creator = uuidv4();
	const testID = uuidv4();
	let client;

	let channelCID = function(i) {
		return 'messaging:' + i + '-' + testID;
	};
	//create 10 channels, even index contains even custom field and odd index contains odd custom field
	before(async function() {
		await createUsers([creator]);
		client = await getTestClientForUser(creator);
		for (let i = 0; i < 10; i++) {
			let custom = {};
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

	it('only boolean values are allowed in $exists', async function() {
		expect(
			client.queryChannels({ testid: testID, even: { $exists: [] } }),
		).to.be.rejectedWith(
			'QueryChannels failed with error: "$exists operator only support boolean values"',
		);
	});

	it('query $exists true on a custom field should work', async function() {
		const resp = await client.queryChannels({
			testid: testID,
			even: { $exists: true },
		});
		expect(resp.length).to.be.equal(5);
		expect(
			resp.map(c => {
				return c.cid;
			}),
		).to.be.eql([
			channelCID(8),
			channelCID(6),
			channelCID(4),
			channelCID(2),
			channelCID(0),
		]);
	});

	it('query $exists false on a custom field should work', async function() {
		const resp = await client.queryChannels({
			testid: testID,
			even: { $exists: false },
		});
		expect(resp.length).to.be.equal(5);
		expect(
			resp.map(c => {
				return c.cid;
			}),
		).to.be.eql([
			channelCID(9),
			channelCID(7),
			channelCID(5),
			channelCID(3),
			channelCID(1),
		]);
	});

	it('query $exists true on reserved field', async function() {
		const resp = await client.queryChannels({
			testid: testID,
			cid: { $exists: true },
		});
		expect(resp.length).to.be.equal(10);
		expect(
			resp.map(c => {
				return c.cid;
			}),
		).to.be.eql([
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

	it('query $exists false on reserved field should return 0 results', async function() {
		const resp = await client.queryChannels({
			testid: testID,
			cid: { $exists: false },
		});
		expect(resp.length).to.be.equal(0);
	});

	it('combine multiple $exists should work', async function() {
		const resp = await client.queryChannels({
			testid: testID,
			$or: [{ even: { $exists: true } }, { odd: { $exists: true } }],
		});
		expect(resp.length).to.be.equal(10);
		expect(
			resp.map(c => {
				return c.cid;
			}),
		).to.be.eql([
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

describe('query channels members $nin', function() {
	let creator = uuidv4();
	let membersIdS = [uuidv4(), uuidv4(), uuidv4(), uuidv4()];
	let client;

	before(async function() {
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

	it('query $in/$nin', async function() {
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
