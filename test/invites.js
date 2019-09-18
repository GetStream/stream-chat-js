import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

import {
	createUsers,
	expectHTTPErrorCode,
	getServerTestClient,
	getTestClient,
	getTestClientForUser,
	sleep,
} from './utils';
import uuidv4 from 'uuid/v4';

const expect = chai.expect;

chai.use(chaiAsPromised);

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
		const client = await getServerTestClient();
		const c = client.channel('messaging', {
			name: 'Founder Chat',
			image: 'http://bit.ly/2O35mws',
			members: ['thierry', 'tommaso'],
			created_by: {id: 'thierry', name: 'Thierry'},
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
			created_by: {id: 'thierry', name: 'Thierry'},
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

		const messageReceived = new Promise(resolve => {
			nickC.on('notification.invited', e => {
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
		const c = await createTestInviteChannel();
		const nickC = await getTestClientForUser('nick');
		// accept the invite, very similar to a regular update channel...
		const nickChannel = nickC.channel('messaging', c.id);
		const messageReceived = new Promise(resolve => {
			nickChannel.on('message.new', e => {
				expect(e.message.text).to.equal('Nick accepted the chat invite.');
				resolve();
			});
		});
		const notificationReceived = new Promise(resolve => {
			nickC.on('notification.invite_accepted', e => {
				expect(e.channel).to.be.an('object');
				resolve();
			});
		});
		await nickChannel.watch();
		const response = await nickChannel.acceptInvite({
			message: {text: 'Nick accepted the chat invite.'},
		});
		await nickChannel.watch();
		expect(response.message.text).to.equal('Nick accepted the chat invite.');
		expect(response.members[1].user.id).to.equal('nick');
		expect(response.members[1].invite_accepted_at).to.not.equal(null);
		await messageReceived;
		await notificationReceived;
		// second time should fail...
		await expectHTTPErrorCode(
			400,
			nickChannel.acceptInvite({
				message: {text: 'Nick accepted the chat invite.'},
			}),
		);
	});

	it('Reject an invite', async () => {
		const c = await createTestInviteChannel();
		const nickC = await getTestClientForUser('nick');
		// accept the invite, very similar to a regular update channel...
		const nickChannel = nickC.channel('messaging', c.id);
		const updateReceived = new Promise(resolve => {
			nickChannel.on(e => {
				if (e.type === 'member.updated') {
					expect(e.member.invite_rejected_at).to.not.equal(null);
					resolve();
				}
			});
		});

		await nickChannel.watch();
		const response = await nickChannel.rejectInvite();
		expect(response.members[1].user.id).to.equal('nick');
		expect(response.members[1].invite_rejected_at).to.not.equal(null);
		await updateReceived;
		// second time should fail...
		await expectHTTPErrorCode(400, nickChannel.rejectInvite());
	});
});

describe('Query invites', function() {
	let users = [
		'thierry-' + uuidv4(),
		'tommaso-' + uuidv4(),
		'josh-' + uuidv4(),
		'scott-' + uuidv4(),
	];
	let channelID = uuidv4();
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
				invite: {"$gt": 'pending'},
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
		const ssClient = await getTestClient(true);
		const resp = ssClient.queryChannels({invite: 'pending'});
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
		const ssClient = await getTestClient(true);
		const resp = await ssClient.queryChannels(
			{invite: 'pending'},
			{},
			{user_id: users[1]},
		);
		expect(resp.length).to.be.equal(1);
		expect(resp[0].id).to.be.equal(channelID);
	});
	it('Tommaso should have pending invites', async function () {
		let channels = await tommasoClient.queryChannels({invite: 'pending'});
		expect(channels.length).to.be.equal(1);
		expect(channels[0].id).to.be.equal(channelID);
	});

	it('Mixing Queries should work fine', async function () {
		let channels = await tommasoClient.queryChannels({
			invite: 'pending',
			color: 'red',
		});
		expect(channels.length).to.be.equal(1);
		expect(channels[0].id).to.be.equal(channelID);
	});

	it('Mixing Queries should work fine II', async function () {
		let channels = await tommasoClient.queryChannels({
			invite: 'pending',
			color: 'blue',
		});
		expect(channels.length).to.be.equal(0);
	});

	it('Josh should have pending invites', async function () {
		let channels = await joshClient.queryChannels({invite: 'pending'});
		expect(channels.length).to.be.equal(1);
		expect(channels[0].id).to.be.equal(channelID);
	});
	it('Scott should have pending invites', async function () {
		let channels = await scottClient.queryChannels({invite: 'pending'});
		expect(channels.length).to.be.equal(1);
		expect(channels[0].id).to.be.equal(channelID);
	});
	it('Tommaso accept the invite and pending invites go to zero', async function () {
		let channels = await tommasoClient.queryChannels({invite: 'pending'});
		await channels[0].acceptInvite();

		channels = await tommasoClient.queryChannels({invite: 'pending'});
		expect(channels.length).to.be.equal(0);
	});
	it('Tommaso queries for accepted invites it should return one result', async function () {
		let channels = await tommasoClient.queryChannels({invite: 'accepted'});
		expect(channels.length).to.be.equal(1);
		expect(channels[0].id).to.be.equal(channelID);
	});
	it('Tommaso queries for pending invites it should return one result', async function () {
		let channels = await tommasoClient.queryChannels({invite: 'pending'});
		expect(channels.length).to.be.equal(0);
	});

	it('Josh Reject the invite. the channel state is still available but watch:true and presence:true is a noop', async function () {
		let channels = await joshClient.queryChannels({invite: 'pending'});
		await channels[0].rejectInvite();
		await channels[0].stopWatching();

		channels = await joshClient.queryChannels({invite: 'pending'});
		expect(channels.length).to.be.equal(0);

		let rejectedChannel = joshClient.channel('messaging', channelID);
		let resp = await rejectedChannel.watch({presence: true});
		let channelEventsReceived = 0;
		rejectedChannel.on(function (e) {
			channelEventsReceived++;
		});

		let channel = tommasoClient.channel('messaging', channelID);
		await channel.watch({presence: true});
		await channel.sendMessage({text: 'hi'});

		await sleep(1500); //todo improve this
		expect(channelEventsReceived).to.be.equal(0);
	});

	it('Josh Reject should have rejected invites', async function () {
		let channels = await joshClient.queryChannels({invite: 'rejected'});
		expect(channels.length).to.be.equal(1);
		expect(channels[0].id).to.be.equal(channelID);
	});

	it('Josh Reject should have 0 pending invites', async function () {
		let channels = await joshClient.queryChannels({invite: 'pending'});
		expect(channels.length).to.be.equal(0);
	});
});
