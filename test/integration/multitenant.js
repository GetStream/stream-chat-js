import { getTestClient, createUserToken, getTestClientForUser } from './utils';
import { v4 as uuidv4 } from 'uuid';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import { BuiltinPermissions } from '../../src';

const expect = chai.expect;
chai.use(chaiAsPromised);

async function clean() {
	const client = getTestClient(true);
	await client.updateAppSettings({
		multi_tenant_enabled: false,
	});
}

describe('Lockdown user search', function () {
	const client = getTestClient(true);

	before(async () => {
		await clean();
	});

	after(async () => {
		await clean();
	});

	it('app config should start with search not locked down', async function () {
		const response = await client.getAppSettings();
		expect(response.app.multi_tenant_enabled).to.be.false;
	});

	it('app config should include the permission version', async function () {
		const response = await client.getAppSettings();
		expect(response.app.permission_version).to.not.be.undefined;
	});

	it('app config should include the default user_search_same_team_only', async function () {
		const response = await client.getAppSettings();
		expect(response.app.multi_tenant_enabled).to.not.be.undefined;
		expect(response.app.multi_tenant_enabled).to.eql(false);
	});

	it('change search permissions - allow it only for same team', async function () {
		await client.updateAppSettings({
			multi_tenant_enabled: true,
		});
	});

	it('app config should now have user_search_same_team_only = true', async function () {
		const response = await client.getAppSettings();
		expect(response.app.multi_tenant_enabled).to.not.be.undefined;
		expect(response.app.multi_tenant_enabled).to.eql(true);
	});
});

describe('Channel permissions', function () {
	const client = getTestClient(true);
	const name = uuidv4();

	before(async function () {
		await client.createChannelType({ name, roles: {} });
	});

	it('messaging should have some defaults', async function () {
		const response = await client.getChannelType('messaging');
		expect(response.roles).not.to.be.undefined;
	});

	it('should have no roles', async function () {
		const response = await client.getChannelType(name);
		expect(response.roles).to.eql({});
	});

	it('should have default messaging roles it created without', async function () {
		const name2 = uuidv4();
		await client.createChannelType({ name: name2 });
		const response = await client.getChannelType(name);
		const response2 = await client.getChannelType('messaging');
		expect(response.roles).to.eql(response2.roles);
	});

	it('setup the entire role-set for a channel type', async function () {
		const anonymous = [];
		const guest = [BuiltinPermissions.CreateChannel];
		const user = [BuiltinPermissions.CreateChannel];
		const channel_member = user.concat([BuiltinPermissions.CreateMessage]);
		const channel_moderator = channel_member.concat([
			BuiltinPermissions.DeleteAnyMessage,
		]);
		const admin = channel_moderator.concat([BuiltinPermissions.DeleteAnyChannel]);

		await client.updateChannelType(name, {
			roles: { admin, user, channel_member, channel_moderator, anonymous, guest },
			replace_roles: true,
		});
	});

	it('should have the defined roles', async function () {
		const response = await client.getChannelType(name);
		expect(response.roles).to.not.be.undefined;
		expect(response.roles.admin).to.be.eql([
			{
				name: BuiltinPermissions.CreateChannel,
				resource: 'CreateChannel',
				custom: false,
				owner: false,
				same_team: false,
			},
			{
				name: BuiltinPermissions.CreateMessage,
				resource: 'CreateMessage',
				custom: false,
				owner: false,
				same_team: false,
			},
			{
				name: BuiltinPermissions.DeleteAnyMessage,
				resource: 'DeleteMessage',
				custom: false,
				owner: false,
				same_team: false,
			},
			{
				name: BuiltinPermissions.DeleteAnyChannel,
				resource: 'DeleteChannel',
				custom: false,
				owner: false,
				same_team: false,
			},
		]);
	});

	it('replace all permissions for one role on a channel type', async function () {
		await client.updateChannelType(name, {
			roles: { guest: [BuiltinPermissions.DeleteOwnMessage] },
		});
	});

	it('only guest role should be different', async function () {
		const response = await client.getChannelType(name);
		expect(response.roles.user).to.be.eql([
			{
				name: BuiltinPermissions.CreateChannel,
				resource: 'CreateChannel',
				custom: false,
				owner: false,
				same_team: false,
			},
		]);
		expect(response.roles.guest).to.be.eql([
			{
				name: BuiltinPermissions.DeleteOwnMessage,
				resource: 'DeleteMessage',
				custom: false,
				owner: true,
				same_team: false,
			},
		]);
	});
});

describe('Custom permissions and roles', function () {
	const client = getTestClient(true);
	let userId = uuidv4();
	let v1 = false;

	before(async () => {
		const response = await client.getAppSettings();
		v1 = response.app.permission_version !== 'v2';
	});

	it('listing custom permissions empty', async function () {
		const l = await client.listPermissions();
		expect(l.permissions).to.not.be.undefined;
		expect(l.permissions).to.eql([]);
	});

	it('create new custom permission', async function () {
		const p = client.createPermission({
			name: 'my very custom permission',
			resource: 'DeleteChannel',
			owner: false,
			same_team: true,
		});
		await expect(p).to.not.be.rejected;
	});

	it('listing custom permissions', async function () {
		const l = await client.listPermissions();
		expect(l.permissions).to.not.be.undefined;
		expect(l.permissions).to.not.eql([]);
		expect(l.permissions[0]).to.eql({
			name: 'my very custom permission',
			resource: 'DeleteChannel',
			same_team: true,
			owner: false,
			custom: true,
		});
	});

	it('update custom permission', async function () {
		const p = client.updatePermission('my very custom permission', {
			resource: 'DeleteChannel',
			same_team: false,
		});
		await expect(p).to.not.be.rejected;
	});

	it('get custom permission', async function () {
		const p = client.getPermission('my very custom permission');
		await expect(p).to.not.be.rejected;
		const response = await p;
		expect(response.permission).to.eql({
			name: 'my very custom permission',
			resource: 'DeleteChannel',
			custom: true,
			same_team: false,
			owner: false,
		});
	});

	it('update custom permission with invalid resource should error', async function () {
		const p = client.updatePermission('my very custom permission', {
			resource: 'dsbvjdfhbv',
		});
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 4: UpdateCustomPermission failed with error: "resource "dsbvjdfhbv" is not a valid resource"',
		);
	});

	it('delete custom permission', async function () {
		const p = client.deletePermission('my very custom permission');
		await expect(p).to.not.be.rejected;
	});

	it('listing custom permissions empty again', async function () {
		const l = await client.listPermissions();
		expect(l.permissions).to.eql([]);
	});

	it('create new custom permission with same name as a built-in permission should error', async function () {
		const p = client.createPermission({
			name: BuiltinPermissions.CreateChannel,
			resource: 'DeleteChannel',
			owner: false,
			same_team: true,
		});
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 4: CreateCustomPermission failed with error: "permission "Create Channel" already exists"',
		);
	});

	it('get missing custom permission should return a 404', async function () {
		const p = client.getPermission('cbsdhbvsdfh');
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 16: GetCustomPermission failed with error: "custom permission "cbsdhbvsdfh" not found"',
		);
	});

	it('create new custom permission for invalid resource', async function () {
		const p = client.createPermission({
			name: 'Custom Create Channel',
			resource: 'yadayada',
		});
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 4: CreateCustomPermission failed with error: "resource "yadayada" is not a valid resource"',
		);
	});

	it('udpate custom permission that does not exist should 404', async function () {
		const p = client.updatePermission('does not exist', {
			resource: 'DeleteChannel',
			same_team: false,
		});
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 16: UpdateCustomPermission failed with error: "custom permission "does not exist" not found"',
		);
	});

	it('create a built-in role should fail', async function () {
		const p = client.createRole('admin');
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 4: CreateCustomRole failed with error: "role "admin" already exists"',
		);
	});

	it('create a custom role', async function () {
		try {
			await client.createRole('rockstar');
		} catch (e) {
			// this might fail if we did not complete the tear-down
		}
	});

	it('list custom roles', async function () {
		const response = await client.listRoles();
		expect(response.roles).to.contain('rockstar');
	});

	it('create a user with the new role', async function () {
		if (v1) {
			// eslint-disable-next-line babel/no-invalid-this
			this.skip();
		}

		userId = uuidv4();
		const response = await client.upsertUser({ id: userId, role: 'rockstar' });
		expect(response.users[userId].role).to.eql('rockstar');
	});

	it('delete a custom role should not work if in use', async function () {
		if (v1) {
			// eslint-disable-next-line babel/no-invalid-this
			this.skip();
		}
		const p = client.deleteRole('rockstar');
		await expect(p).to.be.rejectedWith(
			`StreamChat error code 4: DeleteCustomRole failed with error: "role "rockstar" cannot be deleted, at least one user is using this role (ie. "${userId}")"`,
		);
	});

	it('query users by custom role and set that back to user', async function () {
		if (v1) {
			// eslint-disable-next-line babel/no-invalid-this
			this.skip();
		}
		const response = await client.queryUsers({ role: 'rockstar' });
		await client.upsertUser({ id: response.users[0].id, role: 'user' });
	});

	it('delete custom role should work now', async function () {
		const p = client.deleteRole('rockstar');
		await expect(p).to.not.be.rejected;
	});

	it('delete a custom role that does not exist', async function () {
		const p = client.deleteRole('rockstar');
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 4: DeleteCustomRole failed with error: "role "rockstar" does not exist"',
		);
	});

	it('delete a built-in role should fail', async function () {
		const p = client.deleteRole('admin');
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 4: DeleteCustomRole failed with error: "role "admin" is a built-in role and cannot be deleted"',
		);
	});
});

describe('User teams field', function () {
	const userId = uuidv4();
	const token = createUserToken(userId);

	before(async function () {
		const client = getTestClient(false);
		await client.connectUser({ id: userId }, token);
		await client.disconnect(5000);
	});

	after(async () => {
		await clean();
	});

	it('should work to set up multi tenant', async () => {
		const client = getTestClient(true);
		await client.updateAppSettings({
			multi_tenant_enabled: true,
		});
		const response = await client.getAppSettings();
		expect(response.app.multi_tenant_enabled).to.be.true;
	});

	it('should not be possible to set user.team on connect', function (done) {
		const client = getTestClient(false);
		const userToken = uuidv4();
		const p = client.connectUser(
			{ id: userToken, teams: ['alpha', 'bravo'] },
			createUserToken(userToken),
		);
		p.then(() => done('connect should have failed with an error')).catch(() =>
			done(),
		);
	});

	it('should not be possible to update user.team on connect', async function () {
		const client = getTestClient(false);
		const p = client.connectUser({ id: userId, teams: ['alpha', 'bravo'] }, token);

		await expect(p).to.be.rejectedWith(
			'user teams cannot be changed at connection time',
		);
	});

	it('create users server-side with team is OK', async function () {
		const client = getTestClient(true);
		const id = uuidv4();
		const p = client.upsertUser({ id, teams: ['red'] });
		await expect(p).to.not.be.rejected;
		const response = await p;
		expect(response.users[id].teams).to.eql(['red']);
	});

	it('change a user team server-side is OK', async function () {
		const client = getTestClient(true);
		const p = client.upsertUser({ id: userId, teams: ['alpha', 'bravo'] });
		await expect(p).to.not.be.rejected;
		const response = await p;
		expect(response.users[userId].teams).to.eql(['alpha', 'bravo']);
	});

	it('should be possible to send user.team on connect as long as it did not change', async function () {
		const client = getTestClient(false);
		const p = client.connectUser({ id: userId, teams: ['bravo', 'alpha'] }, token);

		await expect(p).to.not.be.rejected;
	});

	it('should not be possible to update own user teams with the upsertUser endpoint', async function () {
		const client = getTestClient(false);
		await client.connectUser({ id: userId }, token);

		const p = client.upsertUser({ id: userId, teams: [uuidv4()] });
		await expect(p).to.be.rejectedWith('user teams can only be updated server-side');
	});

	it('should be possible to update own user with the upsertUser endpoint if teams are not sent', async function () {
		const client = getTestClient(false);
		const response = await client.connectUser({ id: userId }, token);

		const p1 = client.upsertUser({ id: userId, teams: response.me.teams });
		await expect(p1).to.not.be.rejected;

		const p2 = client.upsertUser({ id: userId, teams: null });
		await expect(p2).to.not.be.rejected;

		const p3 = client.upsertUser({ id: userId, teams: [] });
		await expect(p3).to.not.be.rejected;
	});

	it('should not be possible to create a channel without team', async function () {
		const client = getTestClient(false);
		await client.connectUser({ id: userId }, token);
		const p = client.channel('messaging', uuidv4()).create();
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 5: GetOrCreateChannel failed with error: "user from teams ["alpha" "bravo"] cannot create a channel for team """',
		);
	});

	it('should not be possible to create a channel for a different team', async function () {
		const client = getTestClient(false);
		await client.connectUser({ id: userId }, token);
		const p = client.channel('messaging', uuidv4(), { team: 'tango' }).create();
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 5: GetOrCreateChannel failed with error: "user from teams ["alpha" "bravo"] cannot create a channel for team "tango""',
		);
	});

	it('should be possible to create a channel for same team', async function () {
		const client = getTestClient(false);
		await client.connectUser({ id: userId }, token);
		const p = client.channel('messaging', uuidv4(), { team: 'alpha' }).create();
		await expect(p).to.not.be.rejected;
	});

	it('should not be possible to update channel.team using client side auth', async function () {
		const client = getTestClient(false);
		await client.connectUser({ id: userId }, token);

		const chan = client.channel('messaging', uuidv4(), { team: 'bravo' });
		const p1 = chan.create();
		await expect(p1).to.not.be.rejected;

		const p2 = chan.update({ team: 'tango' });
		await expect(p2).to.be.rejectedWith(
			'StreamChat error code 5: UpdateChannel failed with error: "changing channel team is not allowed client-side"',
		);

		const p3 = chan.update({ team: 'bravo', color: 'red' });
		await expect(p3).to.not.be.rejected;

		const p4 = chan.update({ team: 'alpha' });
		await expect(p4).to.be.rejectedWith(
			'StreamChat error code 5: UpdateChannel failed with error: "changing channel team is not allowed client-side"',
		);
	});

	it('change channel team is OK using server side auth', async function () {
		const client = getTestClient(true);

		const chan = client.channel('messaging', uuidv4(), {
			team: 'bravo',
			created_by_id: uuidv4(),
		});
		const p1 = chan.create();
		await expect(p1).to.not.be.rejected;

		const p2 = chan.update({ team: 'alpha', color: 'red' });
		await expect(p2).to.not.be.rejected;
		expect(chan.data.team).to.be.equal('alpha');
	});
});

describe('Full test', function () {
	const client = getTestClient(true);
	const channelType = uuidv4();
	const team1 = 'blue';
	const team2 = 'red';
	const team1User = uuidv4();
	const team2User = uuidv4();
	let team1Client;
	let team2Client;

	before(async function () {
		await client.updateAppSettings({
			multi_tenant_enabled: true,
		});

		await client.upsertUsers([
			{ id: team1User, teams: [team1] },
			{ id: team2User, teams: [team2] },
		]);

		team1Client = await getTestClientForUser(team1User);
		team2Client = await getTestClientForUser(team2User);

		// setup the messaging channel type for multi-tenant
		await client.createChannelType({
			name: channelType,
		});

		await client.getChannelType(channelType);

		await client
			.channel(channelType, 'blue', {
				created_by_id: team1User,
				team: team1,
				members: [team1User],
			})
			.create();
		await client
			.channel(channelType, 'red', {
				created_by_id: team2User,
				team: team2,
				members: [team2User],
			})
			.create();
	});

	after(async () => {
		await clean();
	});

	it('disable the messaging channel type', async function () {
		let channels = await client.queryChannels(
			{ type: 'messaging' },
			{},
			{ limit: 100 },
		);

		for (let index = 0; index < channels.length; index++) {
			await channels[index].delete();
		}
		channels = await client.queryChannels({ type: 'messaging' }, {}, { limit: 100 });
		if (channels.length > 0) {
			// eslint-disable-next-line babel/no-invalid-this
			this.skip('too many channels exist, skip this test');
		}

		await client.updateChannelType('messaging', {
			roles: {
				admin: [],
				user: [],
				channel_member: [],
				channel_moderator: [],
				anonymous: [],
				guest: [],
			},
		});

		const response = await client.getChannelType('messaging');
		expect(response.roles).to.eql({});

		await client.deleteChannelType('messaging');

		const response2 = await client.getChannelType('messaging');
		expect(response2.roles).to.not.eql({});
		expect(response2.roles.admin).to.be.not.undefined;
	});

	it('should not be allowed to search without team filter', async function () {
		const p = team1Client.queryUsers({ id: { $in: ['asd'] } });
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 17: QueryUsers failed with error: "you must include a team filter to use this endpoint client-side',
		);
	});

	it('should not be allowed to search with other team filter', async function () {
		const p = team1Client.queryUsers({ teams: { $contains: team2 } });
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 17: QueryUsers failed with error: "you must filter on teams that are from the same user',
		);
	});

	it('should be allowed to search same team, but should not return the other team user', async function () {
		const response = await team1Client.queryUsers({
			$and: [{ id: { $in: [team2User] } }, { teams: { $contains: team1 } }],
		});
		expect(response.users).to.eql([]);
	});

	it('should be allowed to search same team', async function () {
		const response = await team1Client.queryUsers({
			$and: [{ id: { $in: [team1User] } }, { teams: { $contains: team1 } }],
		});
		expect(response.users).to.have.length(1);
		expect(response.users[0].id).to.eql(team1User);
	});

	it('query channels should not include channels from other teams', async function () {
		const response1 = await team1Client.queryChannels({ type: channelType });
		expect(response1).to.have.length(1);
		expect(response1[0].data.team).to.eql(team1);

		const response2 = await team2Client.queryChannels({ type: channelType });
		expect(response2).to.have.length(1);
		expect(response2[0].data.team).to.eql(team2);
	});

	it('query using wrong team should raise an error', async function () {
		const p = team1Client.queryChannels({ type: channelType, team: team2 });
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 4: QueryChannels failed with error: "search by team "red" is not allowed"',
		);
	});

	it('query by allowed team should work fine', async function () {
		const response = await team1Client.queryChannels({
			type: channelType,
			team: team1,
		});
		expect(response).to.have.length(1);
		expect(response[0].data.team).to.eql(team1);
	});

	it('logical operator $nor is disallowed when filtering by team', async function () {
		const p = team1Client.queryChannels({ $nor: [{ team: team1 }] });
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 4: QueryChannels failed with error: "cannot use $nor operator when filtering by team"',
		);
	});

	it('only $eq/$in are allowed', async function () {
		let p = team1Client.queryChannels({ team: { $ne: team1 } });
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 4: QueryChannels failed with error: "cannot use operator "$ne" when filtering by team"',
		);
		p = team1Client.queryChannels({ team: { $nin: [team1] } });
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 4: QueryChannels failed with error: "cannot use operator "$nin" when filtering by team"',
		);
	});

	it('wrong values type raise an error', async function () {
		let p = team1Client.queryChannels({ team: { $eq: 1 } });
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 4: QueryChannels failed with error: "field team expect string values',
		);
		p = team1Client.queryChannels({ team: { $in: [1] } });
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 4: QueryChannels failed with error: "field team expect string values',
		);
	});

	it('create and read channel', async function () {
		let channel;
		const jaap = 'jaap' + uuidv4();

		const ss = getTestClient(true);
		await ss.upsertUser({ id: jaap, teams: ['red', 'blue'] });
		channel = ss.channel('messaging', uuidv4(), {
			members: [jaap],
			team: 'blue',
			created_by_id: 'jaap',
		});
		await channel.create();

		const jaapClient = await getTestClientForUser(jaap);
		await jaapClient.channel('messaging', channel.id).query();
	});
});
