import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

import {
	getServerTestClient,
	createUsers,
	getTestClientForUser,
	expectHTTPErrorCode,
} from './utils';
import uuidv4 from 'uuid/v4';

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

describe('Query Members', function() {
	let mod = 'mod-' + uuidv4();
	let rob = 'rob-' + uuidv4();
	let rob2 = 'rob2-' + uuidv4();
	let adam = 'adam-' + uuidv4();
	let invited = 'invited-' + uuidv4();
	let pending = 'pending-' + uuidv4();
	let rejected = 'rejected-' + uuidv4();
	let banned = 'banned-' + uuidv4();
	let channel;
	let ssClient;
	before(async function() {
		ssClient = await getServerTestClient();
		await ssClient.updateUser({ id: rob, name: 'Robert' });
		await ssClient.updateUser({ id: rob2, name: 'Robert2' });
		await ssClient.updateUser({ id: mod, name: 'Tomas' });
		await ssClient.updateUser({ id: adam, name: 'Adame' });
		await ssClient.updateUser({ id: invited, name: 'Mary' });
		await ssClient.updateUser({ id: pending, name: 'Carlos' });
		await ssClient.updateUser({ id: rejected, name: 'Joseph' });
		await ssClient.updateUser({ id: banned, name: 'Evil' });
		await createUsers([mod, rob, adam]);
		channel = ssClient.channel('messaging', uuidv4(), {
			members: [mod, rob, rob2, adam, banned],
			created_by_id: mod,
		});
		await channel.create();
		await channel.addModerators([mod]);
		await channel.inviteMembers([invited, pending, rejected]);

		// mod bans user banned
		await channel.banUser(banned, { user_id: mod });

		//accept the invite
		const clientA = await getTestClientForUser(invited);
		await clientA.channel('messaging', channel.id).acceptInvite();

		//reject the invite
		const clientR = await getTestClientForUser(rejected);
		await clientR.channel('messaging', channel.id).rejectInvite();
	});

	it('query member with name Robert', async function() {
		let results = await channel.queryMembers({ name: 'Robert' });
		expect(results.members.length).to.be.equal(1);
		expect(results.members[0].user.id).to.be.equal(rob);
	});

	it('autocomplete member with name Robert', async function() {
		let results = await channel.queryMembers({ name: { $autocomplete: 'Rob' } });
		expect(results.members.length).to.be.equal(2);
		expect(results.members[0].user.id).to.be.equal(rob);
		expect(results.members[1].user.id).to.be.equal(rob2);
	});

	it('query members by id', async function() {
		let results = await channel.queryMembers({ id: mod });
		expect(results.members.length).to.be.equal(1);
		expect(results.members[0].user.id).to.be.equal(mod);
	});

	it('query multiple users by id', async function() {
		let results = await channel.queryMembers({ id: { $in: [rob, adam] } });
		expect(results.members.length).to.be.equal(2);
		expect(results.members[0].user.id).to.be.equal(rob);
		expect(results.members[1].user.id).to.be.equal(adam);
	});

	it('query members with pending invites', async function() {
		let results = await channel.queryMembers({ invite: 'pending' });
		expect(results.members.length).to.be.equal(1);
		expect(results.members[0].user.id).to.be.equal(pending);
	});

	it('query members with accepted invites', async function() {
		let results = await channel.queryMembers({ invite: 'accepted' });
		expect(results.members.length).to.be.equal(1);
		expect(results.members[0].user.id).to.be.equal(invited);
	});

	it('query members with rejected invites', async function() {
		let results = await channel.queryMembers({ invite: 'rejected' });
		expect(results.members.length).to.be.equal(1);
		expect(results.members[0].user.id).to.be.equal(rejected);
	});

	it('query channel moderators', async function() {
		let results = await channel.queryMembers({ is_moderator: true });
		expect(results.members.length).to.be.equal(1);
		expect(results.members[0].user.id).to.be.equal(mod);
	});

	it('query for banned members', async function() {
		let results = await channel.queryMembers({ banned: true });
		expect(results.members.length).to.be.equal(1);
		expect(results.members[0].user.id).to.be.equal(banned);
	});

	it('query for not banned members', async function() {
		let results = await channel.queryMembers({ banned: false });
		expect(results.members.length).to.be.equal(7);
	});

	it('query by cid is not allowed', async function() {
		let results = channel.queryMembers({ cid: channel.cid });
		await expectHTTPErrorCode(
			400,
			results,
			'StreamChat error code 4: QueryMembers failed with error: "cannot search by cid"',
		);
	});

	it('invalid fields return an error', async function() {
		let results = channel.queryMembers({ invalid: channel.cid });
		await expectHTTPErrorCode(
			400,
			results,
			'StreamChat error code 4: QueryMembers failed with error: "unrecognized field "invalid""',
		);
	});
});
