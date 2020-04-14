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
			{ name: 'Create Channel', resource: 'CreateChannel' },
			{ name: 'Create Message', resource: 'CreateMessage' },
			{ name: 'Delete Any Message', resource: 'DeleteMessage' },
			{ name: 'Delete Any Channel', resource: 'DeleteChannel' },
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
			{ name: 'Create Channel', resource: 'CreateChannel' },
		]);
		expect(response.roles.guest).to.be.eql([
			{ name: 'Delete Own Message', resource: 'DeleteMessage', owner: true },
		]);
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

	it('should not be possible to update channel.team', async function() {
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
	});
});
