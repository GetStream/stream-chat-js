import { getTestClient, createUserToken } from './utils';
import uuidv4 from 'uuid/v4';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

const expect = chai.expect;
chai.use(chaiAsPromised);

describe('Channel permissions', function() {
	const client = getTestClient(true);
	const name = uuidv4();

	before(async function() {
		await client.createChannelType({ name });
	});

	it('messaging should have some defaults', async function() {
		const response = await client.getChannelType('messaging');
		expect(response.roles).not.to.be.undefined;
	});

	it('should have no roles', async function() {
		const response = await client.getChannelType(name);
		expect(response.roles).to.be.undefined;
	});

	it('setup the entire role-set for a channel type', async function() {
		const anonymous = [];
		const guest = [];
		const user = ['Create Channel'];
		const channel_member = user.concat(['Create Message']);
		const channel_moderator = channel_member.concat(['Delete Any Message']);
		const admin = channel_moderator.concat(['Delete Any Channel']);

		await client.updateChannelType(name, {
			roles: { admin, user, channel_member, channel_moderator, anonymous, guest },
			replace_roles: true,
		});
	});

	it('should have the defined roles', async function() {
		const response = await client.getChannelType(name);
		expect(response.roles).to.not.be.undefined;
		expect(response.roles.admin).to.be.eql([
			{
				name: 'Create Channel',
				resource: 'CreateChannel',
				custom: false,
				owner: false,
				same_team: false,
			},
			{
				name: 'Create Message',
				resource: 'CreateMessage',
				custom: false,
				owner: false,
				same_team: false,
			},
			{
				name: 'Delete Any Message',
				resource: 'DeleteMessage',
				custom: false,
				owner: false,
				same_team: false,
			},
			{
				name: 'Delete Any Channel',
				resource: 'DeleteChannel',
				custom: false,
				owner: false,
				same_team: false,
			},
		]);
	});

	it('replace all permissions for one role on a channel type', async function() {
		await client.updateChannelType(name, {
			roles: { guest: ['Delete Own Message'] },
		});
	});

	it('only guest role should be different', async function() {
		const response = await client.getChannelType(name);
		expect(response.roles.user).to.be.eql([
			{
				name: 'Create Channel',
				resource: 'CreateChannel',
				custom: false,
				owner: false,
				same_team: false,
			},
		]);
		expect(response.roles.guest).to.be.eql([
			{
				name: 'Delete Own Message',
				resource: 'DeleteMessage',
				custom: false,
				owner: true,
				same_team: false,
			},
		]);
	});
});

describe('Custom permissions and roles', function() {
	const client = getTestClient(true);
	let userId = uuidv4();
	let v1 = false;

	before(async function() {
		const response = await client.getAppSettings();
		v1 = response.permission_version === 'v2' ? false : true;
	});

	it('listing custom permissions empty', async function() {
		const l = await client.listPermissions();
		expect(l.permissions).to.not.be.undefined;
		expect(l.permissions).to.eql([]);
	});

	it('create new custom permission', async function() {
		const p = client.createPermission({
			name: 'my very custom permission',
			resource: 'DeleteChannel',
			owner: false,
			same_team: true,
		});
		await expect(p).to.not.be.rejected;
	});

	it('listing custom permissions', async function() {
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

	it('update custom permission', async function() {
		const p = client.updatePermission('my very custom permission', {
			resource: 'DeleteChannel',
			same_team: false,
		});
		await expect(p).to.not.be.rejected;
	});

	it('get custom permission', async function() {
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

	it('update custom permission with invalid resource should error', async function() {
		const p = client.updatePermission('my very custom permission', {
			resource: 'dsbvjdfhbv',
		});
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 4: UpdateCustomPermission failed with error: "resource "dsbvjdfhbv" is not a valid resource"',
		);
	});

	it('delete custom permission', async function() {
		const p = client.deletePermission('my very custom permission');
		await expect(p).to.not.be.rejected;
	});

	it('listing custom permissions empty again', async function() {
		const l = await client.listPermissions();
		expect(l.permissions).to.eql([]);
	});

	it('create new custom permission with same name as a built-in permission should error', async function() {
		const p = client.createPermission({
			name: 'Create Channel',
			resource: 'DeleteChannel',
			owner: false,
			same_team: true,
		});
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 4: CreateCreateCustomPermission failed with error: "permission "Create Channel" already exists"',
		);
	});

	it('get missing custom permission should return a 404', async function() {
		const p = client.getPermission('cbsdhbvsdfh');
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 16: CreateGetCustomPermission failed with error: "custom permission "cbsdhbvsdfh" not found"',
		);
	});

	it('create new custom permission for invalid resource', async function() {
		const p = client.createPermission({
			name: 'Custom Create Channel',
			resource: 'yadayada',
		});
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 4: CreateCreateCustomPermission failed with error: "resource "yadayada" is not a valid resource"',
		);
	});

	it('udpate custom permission that does not exist should 404', async function() {
		const p = client.updatePermission('does not exist', {
			resource: 'DeleteChannel',
			same_team: false,
		});
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 16: UpdateCustomPermission failed with error: "custom permission "does not exist" not found"',
		);
	});

	it('create a built-in role should fail', async function() {
		const p = client.createRole('admin');
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 4: CreateCreateCustomRole failed with error: "role "admin" already exists"',
		);
	});

	it('create a custom role', async function() {
		const p = client.createRole('rockstar');
		await expect(p).to.not.be.rejected;
	});

	it('create a user with the new role', async function() {
		if (v1) {
			// eslint-disable-next-line babel/no-invalid-this
			this.skip();
		}

		userId = uuidv4();
		const response = await client.upsertUser({ id: userId, role: 'rockstar' });
		expect(response.users[userId].role).to.eql('rockstar');
	});

	it('list custom roles', async function() {
		const response = await client.listRoles();
		expect(response.roles).to.contain('rockstar');
	});

	it('delete a custom role should not work if in use', async function() {
		if (v1) {
			// eslint-disable-next-line babel/no-invalid-this
			this.skip();
		}
		const p = client.deleteRole('rockstar');
		await expect(p).to.be.rejectedWith(
			`StreamChat error code 4: CreateDeleteCustomRole failed with error: "role "rockstar" cannot be deleted, at least one user is using this role (ie. "${userId}")"`,
		);
	});

	it('query users by custom role and set that back to user', async function() {
		if (v1) {
			// eslint-disable-next-line babel/no-invalid-this
			this.skip();
		}
		const response = await client.queryUsers({ role: 'rockstar' });
		await client.upsertUser({ id: response.users[0].id, role: 'user' });
	});

	it('delete custom role should work now', async function() {
		const p = client.deleteRole('rockstar');
		await expect(p).to.not.be.rejected;
	});

	it('delete a custom role that does not exist', async function() {
		const p = client.deleteRole('rockstar');
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 4: CreateDeleteCustomRole failed with error: "role "rockstar" does not exist"',
		);
	});

	it('delete a built-in role should fail', async function() {
		const p = client.deleteRole('admin');
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 4: CreateDeleteCustomRole failed with error: "role "admin" is a built-in role and cannot be deleted"',
		);
	});
});

describe('User teams field', function() {
	const userId = uuidv4();
	const token = createUserToken(userId);

	before(async function() {
		const client = getTestClient(false);
		await client.setUser({ id: userId }, token);
		await client.disconnect();
	});

	it('should not be possible to set user.team on connect', function(done) {
		const client = getTestClient(false);
		const userToken = uuidv4();
		const p = client.setUser(
			{ id: userToken, teams: ['alpha', 'bravo'] },
			createUserToken(userToken),
		);
		p.then(() => done('connect should have failed with an error')).catch(() =>
			done(),
		);
	});

	it('should not be possible to update user.team on connect', async function() {
		const client = getTestClient(false);
		const p = client.setUser({ id: userId, teams: ['alpha', 'bravo'] }, token);

		await expect(p).to.be.rejectedWith(
			'{"code":4,"message":"user teams cannot be changed at connection time","StatusCode":400,"duration":""}',
		);
	});

	it('create users server-side with team is OK', async function() {
		const client = getTestClient(true);
		const id = uuidv4();
		const p = client.updateUser({ id, teams: ['red'] });
		await expect(p).to.not.be.rejected;
		const response = await p;
		expect(response.users[id].teams).to.eql(['red']);
	});

	it('change a user team server-side is OK', async function() {
		const client = getTestClient(true);
		const p = client.updateUser({ id: userId, teams: ['alpha', 'bravo'] });
		await expect(p).to.not.be.rejected;
		const response = await p;
		expect(response.users[userId].teams).to.eql(['alpha', 'bravo']);
	});

	it('should be possible to send user.team on connect as long as it did not change', async function() {
		const client = getTestClient(false);
		const p = client.setUser({ id: userId, teams: ['bravo', 'alpha'] }, token);

		await expect(p).to.not.be.rejected;
	});

	it('should not be possible to update own user teams with the updateUser endpoint', async function() {
		const client = getTestClient(false);
		await client.setUser({ id: userId }, token);

		const p = client.updateUser({ id: userId, teams: [uuidv4()] });
		await expect(p).to.be.rejectedWith('user teams can only be updated server-side');
	});

	it('should be possible to update own user with the updateUser endpoint if teams are not sent', async function() {
		const client = getTestClient(false);
		const response = await client.setUser({ id: userId }, token);

		const p1 = client.updateUser({ id: userId, teams: response.me.teams });
		await expect(p1).to.not.be.rejected;

		const p2 = client.updateUser({ id: userId, teams: null });
		await expect(p2).to.not.be.rejected;

		const p3 = client.updateUser({ id: userId, teams: [] });
		await expect(p3).to.not.be.rejected;
	});

	it('should not be possible to create a channel without team', async function() {
		const client = getTestClient(false);
		await client.setUser({ id: userId }, token);
		const p = client.channel('messaging', uuidv4()).create();
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 5: GetOrCreateChannel failed with error: "user from teams ["alpha" "bravo"] cannot query or create a channel for team """',
		);
	});

	it('should not be possible to create a channel for a different team', async function() {
		const client = getTestClient(false);
		await client.setUser({ id: userId }, token);
		const p = client.channel('messaging', uuidv4(), { team: 'tango' }).create();
		await expect(p).to.be.rejectedWith(
			'StreamChat error code 5: GetOrCreateChannel failed with error: "user from teams ["alpha" "bravo"] cannot query or create a channel for team "tango""',
		);
	});

	it('should be possible to create a channel for same team', async function() {
		const client = getTestClient(false);
		await client.setUser({ id: userId }, token);
		const p = client.channel('messaging', uuidv4(), { team: 'alpha' }).create();
		await expect(p).to.not.be.rejected;
	});

	it('should not be possible to update channel.team using client side auth', async function() {
		const client = getTestClient(false);
		await client.setUser({ id: userId }, token);

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

	it('change channel team is OK using server side auth', async function() {
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
