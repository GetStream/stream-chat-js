import { createUsers, getTestClient, getTestClientForUser } from './utils';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { v4 as uuidv4 } from 'uuid';

chai.use(chaiAsPromised);
const expect = chai.expect;
describe('member custom data', () => {
	let ssClient;
	let channel;
	const bob = `bob-${uuidv4()}`;
	const tom = `tom-${uuidv4()}`;
	const jim = `jim-${uuidv4()}`;

	before(async () => {
		ssClient = getTestClient(true);
		await ssClient.upsertUsers([{ id: bob }, { id: tom }, { id: jim }]);
		channel = ssClient.channel('messaging', uuidv4(), {
			created_by_id: bob,
		});
		await channel.create();
	});

	it('distinct channel with custom member data', async () => {
		const resp = await ssClient
			.channel('messaging', {
				members: [
					{ user_id: jim, color: 'blue' },
					{ user_id: tom, color: 'red' },
				],
				created_by_id: tom,
			})
			.create();
		expect(resp.members.length).to.be.equal(2);
		expect(resp.members[0].color).to.be.equal('blue');
		expect(resp.members[1].color).to.be.equal('red');
	});

	it('add a member with custom data to an existing channel', async () => {
		const resp = await channel.addMembers([{ user_id: tom, color: 'blue' }]);
		expect(resp.members.length).to.be.equal(1);
		expect(resp.members[0].color).to.be.equal('blue');
		expect(resp.members[0].user.id).to.be.equal(tom);
	});

	it('overwrite member custom data', async () => {
		const resp = await channel.addMembers([
			{ user_id: tom, color: 'blue', overwritten: true },
		]);
		expect(resp.members.length).to.be.equal(1);
		expect(resp.members[0].color).to.be.equal('blue');
		expect(resp.members[0].overwritten).to.be.equal(true);
		expect(resp.members[0].user.id).to.be.equal(tom);
	});

	it('query members with color blue', async () => {
		const resp = await channel.queryMembers({ color: 'blue' });
		expect(resp.members.length).to.be.equal(1);
		expect(resp.members[0].color).to.be.equal('blue');
	});

	context('invites', () => {
		const acceptInviteId = 'accept-invite-' + uuidv4();
		const rejectInviteId = 'reject-invite-' + uuidv4();
		const acceptId = uuidv4(); // custom field added to the member that accepts the invite
		let inviteChannel;

		before(async () => {
			await createUsers([acceptInviteId, rejectInviteId]);
			inviteChannel = ssClient.channel('messaging', uuidv4(), {
				created_by_id: tom,
			});
			await inviteChannel.create();
		});

		it('invite member after channel creation with custom data', async () => {
			const resp = await inviteChannel.inviteMembers([
				{ user_id: acceptInviteId, invited_by_custom: tom },
				{ user_id: rejectInviteId, invited_by_custom: tom },
			]);
			expect(resp.members.length).to.be.equal(2);
			expect(resp.members[0].invited_by_custom).to.be.equal(tom);
			expect(resp.members[1].invited_by_custom).to.be.equal(tom);
		});

		it('accept invite and change custom member data', async () => {
			const client = await getTestClientForUser(acceptInviteId);
			const ch = client.channel('messaging', inviteChannel.id);
			await ch.query({ state: true });
			expect(ch.state.membership.invited).to.be.true;
			const invited_by_custom = ch.state.membership.invited_by_custom;
			expect(invited_by_custom).to.be.equal(tom);
			//accept channel and overwrite custom field
			const resp = await ch.acceptInvite({
				member_data: { invited_by_custom, acceptId },
			});
			expect(resp.members.length).to.be.equal(2);
			expect(resp.members[0].user.id).to.be.equal(acceptInviteId);
			expect(resp.members[0].acceptId).to.be.equal(acceptId);
		});

		it('reject invite without change custom member data', async () => {
			const client = await getTestClientForUser(rejectInviteId);
			const ch = client.channel('messaging', inviteChannel.id);
			await ch.query({ state: true });
			expect(ch.state.membership.invited).to.be.true;
			expect(ch.state.membership.invited_by_custom).to.be.equal(tom);

			const resp = await ch.rejectInvite();
			expect(resp.members.length).to.be.equal(2);
			expect(resp.members[1].user.id).to.be.equal(rejectInviteId);
			// expect original custom data to be present
			expect(resp.members[1].invited_by_custom).to.be.equal(tom);
		});

		it('invite during channel creation', async () => {
			const c = ssClient.channel('messaging', uuidv4(), {
				members: [
					{ user_id: tom, color: 'blue' },
					{ user_id: bob, color: 'red' },
				],
				invites: [tom, bob],
				created_by_id: jim,
			});
			await c.create();

			const bobClient = await getTestClientForUser(bob);
			const resp = await bobClient.channel(c.type, c.id).query({ state: true });
			expect(resp.membership.invited).to.be.true;
			expect(resp.membership.color).to.be.equal('red');
		});
	});
});

describe.only('query channels by member and user custom data', () => {
	const creator = 'creator' + uuidv4();
	const user1 = { id: '1' + uuidv4(), name: 'user1', rank: 1 };
	const user2 = { id: '2' + uuidv4(), name: 'user2', rank: 1 };
	const user3 = { id: '3' + uuidv4(), name: 'user3', rank: 1 };
	const channel1 = 'ch1' + uuidv4();
	const channel2 = 'ch2' + uuidv4();
	const channel3 = 'ch3' + uuidv4();

	before(async () => {
		const ss = await getTestClient(true);
		await ss.upsertUsers([user1, user2, user3]);

		await ss
			.channel('messaging', channel1, {
				members: [{ user_id: user1.id, data: user1.id }],
				created_by_id: creator,
			})
			.create();

		await ss
			.channel('messaging', channel2, {
				members: [
					{ user_id: user1.id, data: user1.id },
					{ user_id: user2.id, data: user2.id },
				],
				created_by_id: creator,
			})
			.create();

		await ss
			.channel('messaging', channel3, {
				members: [
					{ user_id: user1.id, data: user1.id },
					{ user_id: user2.id, data: user2.id },
					{ user_id: user3.id, data: user3.id },
				],
				created_by_id: creator,
			})
			.create();
	});

	it('user 1 query channels by member custom data', async () => {
		const client = await getTestClientForUser(user1.id);
		const resp = await client.queryChannels({ 'member.data': user1.id }, { cid: 1 });
		expect(resp.length).to.be.equal(3);
		expect(resp[0].id).to.be.equal(channel1);
		expect(resp[1].id).to.be.equal(channel2);
		expect(resp[2].id).to.be.equal(channel3);
	});

	it('user 1 query channels by user name', async () => {
		const client = await getTestClientForUser(user1.id);
		const resp = await client.queryChannels(
			{ 'member.user.name': 'user1' },
			{ cid: 1 },
		);
		expect(resp.length).to.be.equal(3);
		expect(resp[0].id).to.be.equal(channel1);
		expect(resp[1].id).to.be.equal(channel2);
		expect(resp[2].id).to.be.equal(channel3);
	});

	it('query by member data should only match channels with common memberships', async () => {
		const client = await getTestClientForUser(user3.id);
		const resp = await client.queryChannels({ 'member.data': user1.id }, { cid: 1 });
		expect(resp.length).to.be.equal(1);
		expect(resp[0].id).to.be.equal(channel3);
	});

	it('disjunctions work fine', async () => {
		const client = await getTestClientForUser(user2.id);
		const resp = await client.queryChannels(
			{ $or: [{ 'member.user.name': 'user2' }, { 'member.user.name': 'user1' }] },
			{ cid: 1 },
		);
		expect(resp.length).to.be.equal(2);
		expect(resp[0].id).to.be.equal(channel2);
		expect(resp[1].id).to.be.equal(channel3);
	});

	it('combine member and user filters', async () => {
		const client = await getTestClientForUser(user1.id);
		const resp = await client.queryChannels(
			{ 'member.user.name': 'user3', 'member.data': user3.id },
			{ cid: 1 },
		);
		expect(resp.length).to.be.equal(1);
		expect(resp[0].id).to.be.equal(channel3);
	});

	it('member.user.id is equivalent to members', async () => {
		const client = await getTestClientForUser(user1.id);
		const resp = await client.queryChannels(
			{ 'member.user.id': { $in: [user1.id] } },
			{ cid: 1 },
		);
		expect(resp.length).to.be.equal(3);
		expect(resp[0].id).to.be.equal(channel1);
		expect(resp[1].id).to.be.equal(channel2);
		expect(resp[2].id).to.be.equal(channel3);
	});

	it('get channels where members doesnt contain the data property', async () => {
		const client = await getTestClientForUser(user1.id);
		const resp = await client.queryChannels(
			{ 'member.data': { $exists: false } },
			{ cid: 1 },
		);
		expect(resp.length).to.be.equal(0);
	});

	it('get channels that doesnt contain any of the following user ids', async () => {
		const client = await getTestClientForUser(user1.id);
		const resp = await client.queryChannels(
			{ 'member.user.id': { $nin: [user1.id, user2.id, user3.id] } },
			{ cid: 1 },
		);
		expect(resp.length).to.be.equal(0);
	});

	it('get channels by member.user.name prefix', async () => {
		const client = await getTestClientForUser(user1.id);
		const resp = await client.queryChannels(
			{ 'member.user.name': { $autocomplete: 'user' } },
			{ cid: 1 },
		);
		expect(resp.length).to.be.equal(3);
		expect(resp[0].id).to.be.equal(channel1);
		expect(resp[1].id).to.be.equal(channel2);
		expect(resp[2].id).to.be.equal(channel3);
	});
});
