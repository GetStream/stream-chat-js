import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

import {
	getServerTestClient,
	createUsers,
	getTestClientForUser,
	expectHTTPErrorCode,
	sleep,
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

describe('Query Members', function () {
	const mod = 'mod-' + uuidv4();
	const rob = 'rob-' + uuidv4();
	const rob2 = 'rob2-' + uuidv4();
	const adam = 'adam-' + uuidv4();
	const invited = 'invited-' + uuidv4();
	const pending = 'pending-' + uuidv4();
	const rejected = 'rejected-' + uuidv4();
	const banned = 'banned-' + uuidv4();
	let channel;
	let ssClient;
	before(async function () {
		ssClient = getServerTestClient();
		await ssClient.upsertUser({ id: rob, name: 'Robert' });
		await ssClient.upsertUser({ id: rob2, name: 'Robert2' });
		await ssClient.upsertUser({ id: mod, name: 'Tomas' });
		await ssClient.upsertUser({ id: adam, name: 'Adame' });
		await ssClient.upsertUser({ id: invited, name: 'Mary' });
		await ssClient.upsertUser({ id: pending, name: 'Carlos' });
		await ssClient.upsertUser({ id: rejected, name: 'Joseph' });
		await ssClient.upsertUser({ id: banned, name: 'Evil' });

		channel = ssClient.channel('messaging', uuidv4(), {
			created_by_id: mod,
		});
		await channel.create();
		await channel.addModerators([mod]);
		await channel.addMembers([rob]);
		await channel.addMembers([rob2]);
		await channel.addMembers([adam]);
		await channel.addMembers([banned]);
		await channel.inviteMembers([invited, pending, rejected]);

		// mod bans user banned
		await channel.banUser(banned, { banned_by_id: mod });

		// accept the invite
		const clientA = await getTestClientForUser(invited);
		await clientA.channel('messaging', channel.id).acceptInvite();

		// reject the invite
		const clientR = await getTestClientForUser(rejected);
		await clientR.channel('messaging', channel.id).rejectInvite();
	});

	it('with multiple filters client side', async function () {
		const csClient = await getTestClientForUser(mod);
		const csChannel = csClient.channel('messaging', channel.id);
		const { members } = await csChannel.queryMembers({
			$or: [
				{ name: { $autocomplete: 'Rob' } }, // rob, rob2
				{ banned: true }, // banned
				{ is_moderator: true }, // mod
				{
					// invited
					$and: [
						{ name: { $q: 'Mar' } },
						{ invite: 'accepted' },
						{
							$or: [
								{ name: { $autocomplete: 'mar' } },
								{ invite: 'rejected' },
							],
						},
					],
				},
				{
					// no match
					$nor: [
						{
							$and: [{ name: { $q: 'Car' } }, { invite: 'accepted' }],
						},
					],
				},
			],
		});

		expect(members.length).to.be.equal(5);
		expect(members[0].user.id).to.be.equal(mod);
		expect(members[1].user.id).to.be.equal(rob);
		expect(members[2].user.id).to.be.equal(rob2);
		expect(members[3].user.id).to.be.equal(banned);
		expect(members[4].user.id).to.be.equal(invited);
	});

	it('with name Robert', async function () {
		const { members } = await channel.queryMembers({ name: 'Robert' });
		expect(members.length).to.be.equal(1);
		expect(members[0].user.id).to.be.equal(rob);
	});

	it('autocomplete member with name Robert', async function () {
		const { members } = await channel.queryMembers({
			name: { $autocomplete: 'Rob' },
		});

		expect(members.length).to.be.equal(2);
		expect(members[0].user.id).to.be.equal(rob);
		expect(members[1].user.id).to.be.equal(rob2);
	});

	it('query without filters return all the members and sort by name', async function () {
		const { members } = await channel.queryMembers({}, { name: 1 });
		expect(members.length).to.be.equal(8);

		expect(members[0].user.name).to.be.equal('Adame');
		expect(members[1].user.name).to.be.equal('Carlos');
		expect(members[2].user.name).to.be.equal('Evil');
		expect(members[3].user.name).to.be.equal('Joseph');
		expect(members[4].user.name).to.be.equal('Mary');
		expect(members[5].user.name).to.be.equal('Robert');
		expect(members[6].user.name).to.be.equal('Robert2');
		expect(members[7].user.name).to.be.equal('Tomas');
	});

	it('paginate members', async function () {
		const { members } = await channel.queryMembers({});
		expect(members.length).to.be.equal(8);
		for (let i = 0; i < members.length; i++) {
			const { members: single } = await channel.queryMembers(
				{},
				{},
				{ limit: 1, offset: i },
			);
			expect(single.length).to.be.equal(1);
			expect(members[i].user.id).to.be.equal(single[0].user.id);
		}
	});

	it('member with name containing Robert', async function () {
		const { members } = await channel.queryMembers({ name: { $q: 'Rob' } });
		expect(members.length).to.be.equal(2);
		expect(members[0].user.id).to.be.equal(rob);
		expect(members[1].user.id).to.be.equal(rob2);
	});

	it('query members by id', async function () {
		const { members } = await channel.queryMembers({ id: mod });
		expect(members.length).to.be.equal(1);
		expect(members[0].user.id).to.be.equal(mod);
	});

	it('query multiple users by id', async function () {
		const { members } = await channel.queryMembers({ id: { $in: [rob, adam] } });
		expect(members.length).to.be.equal(2);
		expect(members[0].user.id).to.be.equal(rob);
		expect(members[1].user.id).to.be.equal(adam);
	});

	it('query multiple users by name', async function () {
		const { members } = await channel.queryMembers({
			name: { $in: ['Robert', 'Robert2'] },
		});
		expect(members.length).to.be.equal(2);
		expect(members[0].user.id).to.be.equal(rob);
		expect(members[1].user.id).to.be.equal(rob2);
	});

	it('query members with pending invites', async function () {
		const { members } = await channel.queryMembers({ invite: 'pending' });
		expect(members.length).to.be.equal(1);
		expect(members[0].user.id).to.be.equal(pending);
	});

	it('query members with accepted invites', async function () {
		const { members } = await channel.queryMembers({ invite: 'accepted' });
		expect(members.length).to.be.equal(1);
		expect(members[0].user.id).to.be.equal(invited);
	});

	it('query members with rejected invites', async function () {
		const { members } = await channel.queryMembers({ invite: 'rejected' });
		expect(members.length).to.be.equal(1);
		expect(members[0].user.id).to.be.equal(rejected);
	});

	it('query channel moderators', async function () {
		const { members } = await channel.queryMembers({ is_moderator: true });
		expect(members.length).to.be.equal(1);
		expect(members[0].user.id).to.be.equal(mod);
	});

	it('query for banned members', async function () {
		const { members } = await channel.queryMembers({ banned: true });
		expect(members.length).to.be.equal(1);
		expect(members[0].user.id).to.be.equal(banned);
	});

	it('query for members not banned', async function () {
		const { members } = await channel.queryMembers({ banned: false });
		expect(members.length).to.be.equal(7);
	});

	it('weird queries work fine', async function () {
		const { members } = await channel.queryMembers({
			$or: [{ $nor: [{ is_moderator: true }] }, { is_moderator: true }],
		});
		expect(members.length).to.be.equal(8);
	});

	it('query by cid is not allowed', async function () {
		const results = channel.queryMembers({ cid: channel.cid });
		await expectHTTPErrorCode(
			400,
			results,
			'StreamChat error code 4: QueryMembers failed with error: "cannot search by cid"',
		);
	});

	it('invalid fields return an error', async function () {
		const results = channel.queryMembers({ invalid: channel.cid });
		await expectHTTPErrorCode(
			400,
			results,
			'StreamChat error code 4: QueryMembers failed with error: "unrecognized field "invalid""',
		);
	});

	it('invalid operator for field', async function () {
		const results = channel.queryMembers({ id: { $q: 's' } });
		await expectHTTPErrorCode(
			400,
			results,
			'StreamChat error code 4: QueryMembers failed with error: "operator "$q" is not allowed for field "id""',
		);
	});

	it('invalid invite value', async function () {
		const results = channel.queryMembers({ invite: 'sd' });
		await expectHTTPErrorCode(
			400,
			results,
			'StreamChat error code 4: QueryMembers failed with error: "invite value must be either "pending", "accepted" or "rejected""',
		);
	});

	it('query members fills role correctly', async function () {
		const { members } = await channel.queryMembers({ id: mod });
		expect(members.length).to.be.equal(1);
		expect(members[0].user.id).to.be.equal(mod);
		expect(members[0].role).to.be.equal('owner');
	});

	it('queryMembers in distinct channels', async function () {
		const creatorClient = await getTestClientForUser(rob);
		const distinctChannel = creatorClient.channel('messaging', {
			members: [rob, adam, mod],
		});
		await distinctChannel.create();
		const results = await distinctChannel.queryMembers({});
		expect(results.members.length).to.be.equal(3);
		await distinctChannel.watch();
		const result = await distinctChannel.queryMembers({ id: rob });
		expect(result.members.length).to.be.equal(1);
		expect(result.members[0].user.id).to.be.equal(rob);
	});

	describe('query by user last_active', function () {
		let channel;
		const user1 = 'u1-' + uuidv4();
		const user2 = 'u2-' + uuidv4();
		const user3 = 'u3-' + uuidv4(); // null last_active

		let user1LastActive;
		let user2LastActive;

		before(async function () {
			await createUsers([user1, user2, user3]);

			channel = ssClient.channel('messaging', uuidv4(), {
				created_by_id: user1,
			});
			await channel.create();
			await channel.addMembers([user1]);
			await channel.addMembers([user2]);
			await channel.addMembers([user3]);

			const user1Client = await getTestClientForUser(user1);

			await sleep(100);
			const user2Client = await getTestClientForUser(user2);
			await user1Client.disconnect();
			await user2Client.disconnect();

			const resp = await ssClient.queryUsers(
				{ id: { $in: [user1, user2] } },
				{},
				{},
			);

			const getUser = function (user) {
				return function (u) {
					return u.id === user;
				};
			};

			user1LastActive = resp.users.filter(getUser(user1))[0].last_active;
			user2LastActive = resp.users.filter(getUser(user2))[0].last_active;
		});

		it('$eq match ', async function () {
			const resp = await channel.queryMembers({ last_active: user1LastActive });
			expect(resp.members).to.be.length(1);
			expect(resp.members[0].user.id).to.be.equal(user1);
		});

		it('null match ', async function () {
			const resp = await channel.queryMembers({ last_active: null });
			expect(resp.members).to.be.length(1);
			expect(resp.members[0].user.id).to.be.equal(user3);
		});

		it('$gt', async function () {
			const resp = await channel.queryMembers({
				last_active: { $gt: user1LastActive },
			});
			expect(resp.members).to.be.length(1);
			expect(resp.members[0].user.id).to.be.equal(user2);
		});

		it('$gte', async function () {
			const resp = await channel.queryMembers({
				last_active: { $gte: user1LastActive },
			});
			expect(resp.members).to.be.length(2);
			expect(resp.members[0].user.id).to.be.equal(user1);
			expect(resp.members[1].user.id).to.be.equal(user2);
		});

		it('$lt', async function () {
			const resp = await channel.queryMembers({
				last_active: { $lt: user1LastActive },
			});
			expect(resp.members).to.be.length(0);
		});

		it('$lte', async function () {
			const resp = await channel.queryMembers({
				last_active: { $lte: user1LastActive },
			});
			expect(resp.members).to.be.length(1);
			expect(resp.members[0].user.id).to.be.equal(user1);
		});

		it('$ne null', async function () {
			const resp = await channel.queryMembers({ last_active: { $ne: null } });
			expect(resp.members).to.be.length(2);
			expect(resp.members[0].user.id).to.be.equal(user1);
			expect(resp.members[1].user.id).to.be.equal(user2);
		});

		it('$ne null reverse', async function () {
			const resp = await channel.queryMembers(
				{ last_active: { $ne: null } },
				{ created_at: -1 },
			);
			expect(resp.members).to.be.length(2);
			expect(resp.members[0].user.id).to.be.equal(user2);
			expect(resp.members[1].user.id).to.be.equal(user1);
		});

		it('unsupported operator', async function () {
			const p = channel.queryMembers({
				last_active: { $in: [user1LastActive] },
			});

			await expect(p).to.be.rejectedWith(
				'StreamChat error code 4: QueryMembers failed with error: "operator "$in" is not allowed for field "last_active"',
			);
		});
	});

	describe('query by member.user.name', function () {
		const zappa = { id: 'frank-' + uuidv4(), name: 'Frank Zappa' };
		let zappaClient;
		const nick = { id: 'nick-m-' + uuidv4(), name: 'Nick Cave' };
		let nickClient;
		const peter = { id: 'peter-' + uuidv4(), name: 'Peter Murphy' };
		let peterClient;
		const noname = { id: 'Arya-' + uuidv4() };
		let nonameClient;

		let channel;
		let nonameChannel;
		let ssClient;
		const identifier = uuidv4();
		before(async function () {
			ssClient = getServerTestClient();
			await ssClient.upsertUsers([zappa, nick, peter, noname]);
			channel = ssClient.channel('messaging', uuidv4(), {
				created_by: zappa,
				identifier,
				members: [zappa.id, nick.id, peter.id, noname.id],
			});
			await channel.create();
			nonameChannel = ssClient.channel('messaging', uuidv4(), {
				created_by: noname,
				identifier,
				members: [noname.id],
			});
			await nonameChannel.create();
			nickClient = await getTestClientForUser(nick.id);
			peterClient = await getTestClientForUser(peter.id);
			zappaClient = await getTestClientForUser(zappa.id);
			nonameClient = await getTestClientForUser(noname.id);
		});

		it('search by last name', async function () {
			const resp = await nickClient.queryChannels({
				'member.user.name': { $autocomplete: 'Zappa' },
			});
			expect(resp.length).to.be.equal(1);
			expect(resp[0].cid).to.be.equal(channel.cid);
		});

		it('search by similar member name should match', async function () {
			let resp = await nickClient.queryChannels({
				'member.user.name': { $autocomplete: 'Nick' },
			});
			expect(resp.length).to.be.equal(1);
			expect(resp[0].cid).to.be.equal(channel.cid);
			resp = await nickClient.queryChannels({
				'member.user.name': { $autocomplete: 'Peter' },
			});
			expect(resp.length).to.be.equal(1);
			expect(resp[0].cid).to.be.equal(channel.cid);
			resp = await nickClient.queryChannels({
				'member.user.name': { $autocomplete: 'Frank' },
			});
			expect(resp.length).to.be.equal(1);
			expect(resp[0].cid).to.be.equal(channel.cid);
		});

		it('search by exact name', async function () {
			const resp = await nickClient.queryChannels({
				'member.user.name': nickClient.name,
				identifier,
			});
			expect(resp.length).to.be.equal(1);
			expect(resp[0].cid).to.be.equal(channel.cid);
		});

		it('search by null match should return 2 entries for noname', async function () {
			const resp = await nonameClient.queryChannels({
				'member.user.name': null,
				identifier,
			});
			expect(resp.length).to.be.equal(2);
			expect(resp[0].cid).to.be.equal(nonameChannel.cid);
			expect(resp[1].cid).to.be.equal(channel.cid);
		});

		it('search by null match should return 1 entries for zappaClient', async function () {
			const resp = await zappaClient.queryChannels({
				'member.user.name': null,
				identifier,
			});
			expect(resp.length).to.be.equal(1);
			expect(resp[0].cid).to.be.equal(channel.cid);
		});

		it('return all entries for server side', async function () {
			const resp = await ssClient.queryChannels({
				'member.user.name': null,
				identifier,
			});
			expect(resp.length).to.be.equal(2);
			expect(resp[0].cid).to.be.equal(nonameChannel.cid);
			expect(resp[1].cid).to.be.equal(channel.cid);
		});
	});
});
