import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

import {
	createUsers,
	expectHTTPErrorCode,
	getServerTestClient,
	getTestClient,
	getTestClientForUser,
} from './utils';
import { v4 as uuidv4 } from 'uuid';

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

async function createTestInviteChannel() {
	const randomID = 'xyz' + uuidv4();
	const client = await getTestClientForUser(randomID);
	// nick should receive an invite
	const c = client.channel('messaging', {
		name: 'Founder Chat',
		image: 'http://bit.ly/2O35mws',
		members: ['josh', 'nick', 'thierry', randomID],
		invites: ['nick'],
	});
	await c.create();
	return c;
}

describe('Member style server side', () => {
	before(async () => {
		await createUsers(['thierry', 'tommaso']);
	});
	it('member based id server side', async () => {
		const client = getServerTestClient();
		const c = client.channel('messaging', {
			name: 'Founder Chat',
			image: 'http://bit.ly/2O35mws',
			members: ['thierry', 'tommaso'],
			created_by: { id: 'thierry', name: 'Thierry' },
		});
		expect(!!c.id).to.be.false;
		const state = await c.create();
		expect(!!c.id).to.be.true;
		expect(state.members[0].user.id).to.equal('thierry');
		expect(state.members[1].user.id).to.equal('tommaso');
		// doing this a second time should generate the same id...
		const c2 = client.channel('messaging', {
			name: 'Founder Chat',
			image: 'http://bit.ly/2O35mws',
			members: ['thierry', 'tommaso'],
			created_by: { id: 'thierry', name: 'Thierry' },
		});
		const state2 = await c2.create();
		expect(c2.id).to.equal(c.id);
		expect(c2.id.indexOf('!members-')).to.equal(0);
	});
});

describe('Member style channel init', () => {
	before(async () => {
		await createUsers(['thierry', 'tommaso', 'josh', 'scott', 'nick']);
	});
	it('Member list based ids', async () => {
		const client = await getTestClientForUser('thierry');
		// user story 1: social app, you can talk to your friends. but regular users need to send an invite first.
		// user story 2: google talk use case. you send an invite to everyone first before talking.
		// some apps need to fully lock this down and make it secure.
		// for those apps you can only create a channel server side...
		// for apps where the security doesnt matter this much they can do it client side..
		const c = client.channel('messaging', {
			name: 'Founder Chat',
			image: 'http://bit.ly/2O35mws',
			members: ['thierry', 'tommaso'],
		});
		expect(!!c.id).to.be.false;
		const state = await c.create();
		expect(!!c.id).to.be.true;
		expect(state.members[0].user.id).to.equal('thierry');
		expect(state.members[1].user.id).to.equal('tommaso');
		// doing this a second time should generate the same id...
		const c2 = client.channel('messaging', {
			name: 'Founder Chat',
			image: 'http://bit.ly/2O35mws',
			members: ['thierry', 'tommaso'],
		});
		const state2 = await c2.create();
		expect(c2.id).to.equal(c.id);
	});

	it('Create an invite', async () => {
		const nickC = await getTestClientForUser('nick');

		const messageReceived = new Promise((resolve) => {
			nickC.on('notification.invited', (e) => {
				expect(e.channel).to.be.an('object');
				resolve();
			});
		});

		const randomID = 'xyz' + uuidv4();
		const client = await getTestClientForUser(randomID);
		// nick should receive an invite
		const c = client.channel('messaging', {
			name: 'Founder Chat',
			image: 'http://bit.ly/2O35mws',
			members: ['josh', 'nick', 'thierry', randomID],
			invites: ['nick'],
		});
		const state = await c.create();
		expect(state.channel.created_by.id).to.equal(randomID);

		expect(state.members[1].invited).to.equal(true);
		expect(state.members[1].invite_accepted_at).to.equal(undefined);
		expect(state.members[1].invite_rejected_at).to.equal(undefined);

		await messageReceived;
	});

	it('Accept an invite', async () => {
		const nickC = await getTestClientForUser('nick');
		const c = await createTestInviteChannel();
		// accept the invite, very similar to a regular update channel...
		const nickChannel = nickC.channel('messaging', c.id);

		const notificationReceived = new Promise((resolve) => {
			nickC.on('notification.invite_accepted', (e) => {
				expect(e.channel).to.be.an('object');
				resolve();
			});
		});

		let response = await nickChannel.acceptInvite({
			message: { text: 'Nick accepted the chat invite.' },
		});
		await nickChannel.watch();
		expect(response.message.text).to.equal('Nick accepted the chat invite.');
		expect(response.members[1].user.id).to.equal('nick');
		expect(response.members[1].invite_accepted_at).to.not.equal(null);
		await notificationReceived;
		// second time should be a noop
		response = await nickChannel.acceptInvite({
			message: { text: 'Nick accepted the chat invite.' },
		});
		expect(response.members[1].user.id).to.equal('nick');
		expect(response.members[1].invite_accepted_at).to.not.equal(null);
		expect(response.message).to.be.undefined;
	});

	it('Reject an invite', async () => {
		const c = await createTestInviteChannel();
		const nickC = await getTestClientForUser('nick');
		const thierryC = await getTestClientForUser('thierry');
		// accept the invite, very similar to a regular update channel...
		const nickChannel = nickC.channel('messaging', c.id);
		const thierryChannel = thierryC.channel('messaging', c.id);
		const inviteRejected = new Promise((resolve) => {
			nickC.on('notification.invite_rejected', (e) => {
				expect(e.channel).to.be.an('object');
				resolve();
			});
		});

		const updateReceived = new Promise((resolve) => {
			thierryC.on((e) => {
				if (e.type === 'member.updated') {
					expect(e.member.invite_rejected_at).to.not.equal(null);
					resolve();
				}
			});
		});
		await thierryChannel.watch();
		await nickChannel.watch();
		let response = await nickChannel.rejectInvite();
		expect(response.members[1].user.id).to.equal('nick');
		expect(response.members[1].invite_rejected_at).to.not.equal(null);
		await inviteRejected;
		await updateReceived;
		// second time should be a noop
		response = await nickChannel.rejectInvite();
		expect(response.members[1].user.id).to.equal('nick');
		expect(response.members[1].invite_rejected_at).to.not.equal(null);
	});
});

describe('Query invites', function () {
	const users = [
		'thierry-' + uuidv4(),
		'tommaso-' + uuidv4(),
		'josh-' + uuidv4(),
		'scott-' + uuidv4(),
	];
	const channelID = uuidv4();
	let thierryClient;
	let tommasoClient;
	let joshClient;
	let scottClient;

	before(async () => {
		await createUsers(users);
		thierryClient = await getTestClientForUser(users[0]);
		tommasoClient = await getTestClientForUser(users[1]);
		joshClient = await getTestClientForUser(users[2]);
		scottClient = await getTestClientForUser(users[3]);
	});

	describe('Bad Input', async function () {
		it('Invalid invite value', async function () {
			const channels = tommasoClient.queryChannels({
				invite: 'invalid',
			});
			await expect(channels).to.be.rejectedWith(
				'StreamChat error code 4: QueryChannels failed with error: "invalid invite parameter. should be one of pending|accepted|rejected"',
			);
		});
		it('Invalid invite value type number', async function () {
			const channels = tommasoClient.queryChannels({
				invite: 1,
			});
			await expect(channels).to.be.rejectedWith(
				'StreamChat error code 4: QueryChannels failed with error: "field `invite` contains type number. expecting string"',
			);
		});
		it('Invalid invite value type bool', async function () {
			const channels = tommasoClient.queryChannels({
				invite: true,
			});
			await expect(channels).to.be.rejectedWith(
				'StreamChat error code 4: QueryChannels failed with error: "field `invite` contains type bool. expecting string"',
			);
		});
		it('Invalid invite query', async function () {
			const channels = tommasoClient.queryChannels({
				invite: { $gt: 'pending' },
			});
			await expect(channels).to.be.rejectedWith(
				'StreamChat error code 4: QueryChannels failed with error: "invalid invite operator, expecting {invite:"pending"} or {invite:{$eq:"pending"}}"',
			);
		});
		it('Invalid invite operator II', async function () {
			const channels = tommasoClient.queryChannels({
				invite: [null],
			});
			await expect(channels).to.be.rejectedWith(
				'StreamChat error code 4: QueryChannels failed with error: "cannot match array value on field `invite`."',
			);
		});
	});
	it('Querying for invites with server side auth require an user to be set', async function () {
		const ssClient = getTestClient(true);
		const resp = ssClient.queryChannels({ invite: 'pending' });
		expect(resp).to.be.rejectedWith(
			'StreamChat error code 4: QueryChannels failed with error: "invite requires a valid user"',
		);
	});
	it('Thierry creates a channel and invite Tommaso, Josh and Scott', async function () {
		const c = thierryClient.channel('messaging', channelID, {
			name: 'Founder Chat',
			image: 'http://bit.ly/2O35mws',
			members: users,
			color: 'red',
			invites: [users[1], users[2], users[3]],
		});
		const state = await c.create();
		expect(state.channel.id).to.be.equal(channelID);
	});
	it('Querying for invites with server side user should work if the user is provided', async function () {
		const ssClient = getTestClient(true);
		const resp = await ssClient.queryChannels(
			{ invite: 'pending' },
			{},
			{ user_id: users[1] },
		);
		expect(resp.length).to.be.equal(1);
		expect(resp[0].id).to.be.equal(channelID);
	});
	it('Tommaso should have pending invites', async function () {
		const channels = await tommasoClient.queryChannels({ invite: 'pending' });
		expect(channels.length).to.be.equal(1);
		expect(channels[0].id).to.be.equal(channelID);
	});
	it('Mixing Queries should work fine', async function () {
		const channels = await tommasoClient.queryChannels({
			invite: 'pending',
			color: 'red',
		});
		expect(channels.length).to.be.equal(1);
		expect(channels[0].id).to.be.equal(channelID);
	});
	it('Mixing Queries should work fine II', async function () {
		const channels = await tommasoClient.queryChannels({
			invite: 'pending',
			color: 'blue',
		});
		expect(channels.length).to.be.equal(0);
	});
	it('Josh should have pending invites', async function () {
		const channels = await joshClient.queryChannels({ invite: 'pending' });
		expect(channels.length).to.be.equal(1);
		expect(channels[0].id).to.be.equal(channelID);
	});
	it('Scott should have pending invites', async function () {
		const channels = await scottClient.queryChannels({ invite: 'pending' });
		expect(channels.length).to.be.equal(1);
		expect(channels[0].id).to.be.equal(channelID);
	});
	it('Tommaso accept the invite and pending invites go to zero', async function () {
		let channels = await tommasoClient.queryChannels({ invite: 'pending' });
		await channels[0].acceptInvite();

		channels = await tommasoClient.queryChannels({ invite: 'pending' });
		expect(channels.length).to.be.equal(0);
	});
	it('Tommaso queries for accepted invites it should return one result', async function () {
		const channels = await tommasoClient.queryChannels({ invite: 'accepted' });
		expect(channels.length).to.be.equal(1);
		expect(channels[0].id).to.be.equal(channelID);
	});
	it('Tommaso queries for pending invites it should return one result', async function () {
		const channels = await tommasoClient.queryChannels({ invite: 'pending' });
		expect(channels.length).to.be.equal(0);
	});
	it('Josh Reject the invite. the channel state is still available but watch:true and presence:true is a noop for pending and rejected invites', async function () {
		//reject invite
		let channels = await joshClient.queryChannels({ invite: 'pending' });
		expect(channels.length).to.be.equal(1);
		await channels[0].rejectInvite();
		await channels[0].stopWatching();

		channels = await joshClient.queryChannels({ invite: 'pending' });
		expect(channels.length).to.be.equal(0);

		// ensure that we dont deliver events on rejected invites
		const rejectedChannelJosh = joshClient.channel('messaging', channelID);
		rejectedChannelJosh.on(function (e) {
			expect.fail("rejected or pending invites shouldn't receive msg.new events");
		});
		await rejectedChannelJosh.watch({ watch: true, presence: true });

		// ensure that we dont deliver events on pending invites
		const pendingChannelScott = scottClient.channel('messaging', channelID);
		pendingChannelScott.on(function (e) {
			expect.fail("pending invites shouldn't receive msg.new events");
		});
		await pendingChannelScott.watch({ watch: true, presence: true });

		let doneCallback;
		const allEventsReceived = new Promise((resolve) => {
			doneCallback = resolve;
		});
		let numberEvents = 0;

		// ensure that we deliver events on accepted invites
		const acceptedChannel = tommasoClient.channel('messaging', channelID);
		acceptedChannel.on('message.new', function (e) {
			numberEvents++;
			if (numberEvents === 3) {
				expect(e.message.text).to.be.equal('hi 3');
				doneCallback();
			}
		});
		await acceptedChannel.watch({ watch: true, presence: true });
		//send 3 messages
		await acceptedChannel.sendMessage({ text: 'hi 1' });
		await acceptedChannel.sendMessage({ text: 'hi 2' });
		await acceptedChannel.sendMessage({ text: 'hi 3' });

		await allEventsReceived;
	});

	it('Josh Reject should have rejected invites', async function () {
		const channels = await joshClient.queryChannels({ invite: 'rejected' });
		expect(channels.length).to.be.equal(1);
		expect(channels[0].id).to.be.equal(channelID);
	});

	it('Josh Reject should have 0 pending invites', async function () {
		const channels = await joshClient.queryChannels({ invite: 'pending' });
		expect(channels.length).to.be.equal(0);
	});
});

describe('update channel - invites', function () {
	let channel;
	let client;
	const creatorId = uuidv4();
	const invitedId = uuidv4();
	before(async function () {
		await createUsers([creatorId, invitedId]);
		client = await getTestClientForUser(creatorId);
		channel = client.channel('messaging', uuidv4(), {
			members: [creatorId],
		});
		await channel.create();
	});

	it('invite after channel creation', async function () {
		const inviteResp = await channel.inviteMembers([invitedId]);
		expect(inviteResp.members.length).to.be.equal(2);
		expect(inviteResp.members[0].user_id).to.be.equal(creatorId);
		expect(inviteResp.members[0].invited).to.be.undefined;
		expect(inviteResp.members[1].user_id).to.be.equal(invitedId);
		expect(inviteResp.members[1].invited).to.be.equal(true);
	});

	it('accept the invite', async function () {
		const invitedUserClient = await getTestClientForUser(invitedId);
		const invites = await invitedUserClient.queryChannels(
			{ invite: 'pending' },
			{},
			{},
		);
		expect(invites.length).to.be.equal(1);
		await invites[0].acceptInvite();
	});

	it('query for accepted invites', async function () {
		const invitedUserClient = await getTestClientForUser(invitedId);
		const invites = await invitedUserClient.queryChannels(
			{ invite: 'accepted' },
			{},
			{},
		);
		expect(invites.length).to.be.equal(1);
	});

	it('query for rejected invites should return 0', async function () {
		const invitedUserClient = await getTestClientForUser(invitedId);
		const invites = await invitedUserClient.queryChannels(
			{ invite: 'rejected' },
			{},
			{},
		);
		expect(invites.length).to.be.equal(0);
	});

	it('invite on distinct channel is not allowed', async function () {
		const initialMembers = [uuidv4(), uuidv4()];
		const invited = uuidv4();
		await createUsers(initialMembers);
		const client = await getTestClientForUser(initialMembers[0]);
		const distinctChannel = client.channel('messaging', '', {
			members: initialMembers,
		});
		await distinctChannel.create();
		await expect(distinctChannel.inviteMembers([invited])).to.be.rejectedWith(
			'StreamChat error code 17: UpdateChannel failed with error: "cannot invite members to the distinct channel, please create a new distinct channel with the desired members"',
		);
	});

	it('invited members are present in channel.updated event', async function () {
		let channel;
		let client;
		const creatorId = uuidv4();
		const invitedId = uuidv4();

		await createUsers([creatorId, invitedId]);
		client = await getTestClientForUser(creatorId);
		channel = client.channel('messaging', uuidv4(), {
			members: [creatorId],
		});
		await channel.watch();

		const evtReceived = new Promise((resolve) => {
			channel.on('channel.updated', function (e) {
				expect(e.channel.members.length).to.be.equal(2);
				expect(e.channel.member_count).to.be.equal(2);
				expect(e.channel.members[0].user_id).to.be.equal(creatorId);
				expect(e.channel.members[0].invited).to.be.undefined;
				expect(e.channel.members[1].user_id).to.be.equal(invitedId);
				expect(e.channel.members[1].invited).to.be.equal(true);
				resolve();
			});
		});

		await Promise.all([channel.inviteMembers([invitedId]), evtReceived]);
	});
});
