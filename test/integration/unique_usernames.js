import { createUsers, getTestClient, sleep } from './utils';
import { v4 as uuidv4 } from 'uuid';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

const expect = chai.expect;

chai.use(chaiAsPromised);

describe('enforce unique usernames', function () {
	const serverAuth = getTestClient(true);
	const dupeName = uuidv4();
	const dupeTeam = uuidv4();
	let channel;

	before(async () => {
		await serverAuth.updateAppSettings({
			enforce_unique_usernames: 'no',
		});

		await serverAuth.upsertUser({
			id: uuidv4(),
			name: dupeName,
			teams: [dupeTeam],
		});

		const normalUser = `normal-${uuidv4()}`;
		await createUsers([normalUser]);

		channel = serverAuth.channel('livestream', uuidv4(), {
			members: [normalUser],
			created_by_id: normalUser,
		});
		await channel.create();
	});

	after(async () => {
		await serverAuth.updateAppSettings({
			enforce_unique_usernames: 'no',
		});
	});

	it('should fail with invalid setting', async () => {
		const p = serverAuth.updateAppSettings({
			enforce_unique_usernames: 'foobar',
		});

		await expect(p).to.be.rejectedWith(
			'StreamChat error code 4: UpdateApp failed with error: "enforce_unique_usernames must be one of [no app team]"',
		);
	});

	it('should enable unique usernames on app level', async () => {
		await serverAuth.updateAppSettings({
			enforce_unique_usernames: 'app',
		});

		const response = await serverAuth.getAppSettings();
		expect(response.app.enforce_unique_usernames).to.eql('app');
	});

	it('should fail upsertUser(insert) with an existing username on app level', async () => {
		const p = serverAuth.upsertUser({
			id: uuidv4(),
			name: dupeName,
		});

		await expect(p).to.be.rejectedWith(
			`StreamChat error code 6: UpdateUsers failed with error: "username '${dupeName}' already exists"`,
		);
	});

	it('should fail multi-user upsertUsers(insert) with duplicate usernames on app level', async () => {
		const name = uuidv4();
		const p = serverAuth.upsertUsers([
			{
				id: uuidv4(),
				name: name,
			},
			{
				id: uuidv4(),
				name: name,
			},
		]);

		await expect(p).to.be.rejectedWith(
			`StreamChat error code 6: UpdateUsers failed with error: "username '${name}' already exists"`,
		);
	});

	it('should allow to rename deactivated user to solve uniqueness problem', async () => {
		const id = uuidv4();
		const name = uuidv4();
		await serverAuth.upsertUsers([
			{
				id,
				name,
			},
		]);

		await serverAuth.deactivateUser(id);

		await serverAuth.upsertUsers([
			{
				id: uuidv4(),
				name,
			},
		]);

		const p = serverAuth.reactivateUser(id);
		await expect(p).to.be.rejectedWith(
			`StreamChat error code 6: ReactivateUser failed with error: "username '${name}' already exists"`,
		);

		await serverAuth.reactivateUser(id, { name: uuidv4() });
	});

	it('should fail upsertUser(update) insert with an existing username on app level', async () => {
		const id = uuidv4();
		await serverAuth.upsertUser({
			id,
			name: id,
		});

		const p = serverAuth.upsertUser({
			id,
			name: dupeName,
		});

		await expect(p).to.be.rejectedWith(
			`StreamChat error code 6: UpdateUsers failed with error: "username '${dupeName}' already exists"`,
		);
	});

	it('should fail partialUpdateUser with an existing username on app level', async () => {
		const id = uuidv4();
		await serverAuth.upsertUser({
			id,
			name: id,
		});

		const p = serverAuth.partialUpdateUser({
			id,
			set: {
				name: dupeName,
			},
		});

		await expect(p).to.be.rejectedWith(
			`StreamChat error code 6: UpdateUsersPartial failed with error: "username '${dupeName}' already exists"`,
		);
	});

	it('should fail multi-user partialUpdateUser with duplicate usernames on app level', async () => {
		const id = uuidv4();
		await serverAuth.upsertUsers([
			{
				id: `${id}-1`,
				name: `${id}-1`,
			},
			{
				id: `${id}-2`,
				name: `${id}-2`,
			},
		]);

		const p = serverAuth.partialUpdateUsers([
			{
				id: `${id}-1`,
				set: {
					name: id,
				},
			},
			{
				id: `${id}-2`,
				set: {
					name: id,
				},
			},
		]);

		await expect(p).to.be.rejectedWith(
			`StreamChat error code 6: UpdateUsersPartial failed with error: "username '${id}' already exists"`,
		);
	});

	it('should only succeed once in race upsertUser(insert) with an existing username on app level', async () => {
		const name = uuidv4();
		const n = 25;
		const p = [];

		for (let i = 0; i < n; i++) {
			p.push(
				serverAuth.upsertUser({
					id: uuidv4(),
					name,
				}),
			);
		}

		const results = await Promise.allSettled(p);
		expect(results.filter((p) => p.status === 'fulfilled').length).to.eql(1);
	});

	it('should only succeed once in race partialUpdateUser(update) with an existing username on app level', async () => {
		const id = uuidv4();
		const name = uuidv4();
		const n = 25;
		let p = [];

		for (let i = 0; i < n; i++) {
			p.push(
				serverAuth.upsertUser({
					id: `${id}-${i}`,
					name: `${uuidv4()}`,
				}),
			);
		}

		await Promise.all(p);

		p = [];
		for (let i = 0; i < n; i++) {
			p.push(
				serverAuth.partialUpdateUser({
					id: `${id}-${i}`,
					set: {
						name,
					},
				}),
			);
		}
		const result = await Promise.allSettled(p);
		expect(result.filter((p) => p.status === 'fulfilled').length).to.eql(1);
	});

	it('should only succeed once in race client.connectUser(insert) with an existing username on app level', async () => {
		const name = uuidv4();
		const n = 25;
		const p = [];

		for (let i = 0; i < n; i++) {
			const client = getTestClient(true);
			p.push(client.connectUser({ id: uuidv4(), name }));
		}

		const result = await Promise.allSettled(p);
		expect(result.filter((p) => p.status === 'fulfilled').length).to.eql(1);
	});

	it('should only succeed once in race channel.sendMessage(insert) with an existing username on app level', async () => {
		const name = uuidv4();
		const n = 25;
		const p = [];

		await channel.sendMessage({
			text: 'what do you call a fake noodle? an impasta!',
			user: { id: uuidv4(), name: uuidv4() },
		});

		for (let i = 0; i < n; i++) {
			p.push(
				channel.sendMessage({
					text: 'what do you call a fake noodle? an impasta!',
					user: { id: uuidv4(), name },
				}),
			);
		}

		const result = await Promise.allSettled(p);
		expect(result.filter((p) => p.status === 'fulfilled').length).to.eql(1);
	});

	it('should only succeed once in race client.Channel(created_by) with an existing username on app level', async () => {
		const name = uuidv4();
		const n = 25;
		const p = [];

		for (let i = 0; i < n; i++) {
			p.push(
				serverAuth
					.channel('livestream', uuidv4(), {
						members: [],
						created_by: { id: uuidv4(), name },
					})
					.create(),
			);
		}

		const result = await Promise.allSettled(p);
		expect(result.filter((p) => p.status === 'fulfilled').length).to.eql(1);
	});

	it('should enable unique usernames on team level', async () => {
		await serverAuth.updateAppSettings({
			enforce_unique_usernames: 'team',
		});

		const response = await serverAuth.getAppSettings();
		expect(response.app.enforce_unique_usernames).to.eql('team');
	});

	it('should still succeed upsertUser with an existing username on app level', async () => {
		await serverAuth.upsertUser({
			id: uuidv4(),
			name: dupeName,
		});
	});

	it('should fail upsertUser(insert) with an existing username on team level', async () => {
		const p = serverAuth.upsertUser({
			id: uuidv4(),
			name: dupeName,
			teams: [dupeTeam],
		});

		await expect(p).to.be.rejectedWith(
			`StreamChat error code 6: UpdateUsers failed with error: "username '${dupeName}' already exists in team '${dupeTeam}'"`,
		);
	});

	it('should fail upsertUser(update) insert with an existing username on team level', async () => {
		const id = uuidv4();
		await serverAuth.upsertUser({
			id,
			name: id,
			teams: [dupeTeam],
		});

		const p = serverAuth.upsertUser({
			id,
			name: dupeName,
			teams: [dupeTeam],
		});

		await expect(p).to.be.rejectedWith(
			`StreamChat error code 6: UpdateUsers failed with error: "username '${dupeName}' already exists in team '${dupeTeam}'"`,
		);
	});

	it('should fail partialUpdateUser with an existing username on team level', async () => {
		const id = uuidv4();
		await serverAuth.upsertUser({
			id,
			name: id,
			teams: [dupeTeam],
		});

		const p = serverAuth.partialUpdateUser({
			id,
			set: {
				name: dupeName,
			},
		});

		await expect(p).to.be.rejectedWith(
			`StreamChat error code 6: UpdateUsersPartial failed with error: "username '${dupeName}' already exists in team '${dupeTeam}'"`,
		);
	});

	it('should fail upsertUser when updating to team containing username', async () => {
		const id = uuidv4();
		await serverAuth.upsertUser({
			id: id,
			name: dupeName,
		});

		const p = serverAuth.upsertUser({
			id: id,
			name: dupeName,
			teams: [dupeTeam],
		});

		await expect(p).to.be.rejectedWith(
			`StreamChat error code 6: UpdateUsers failed with error: "username '${dupeName}' already exists in team '${dupeTeam}'"`,
		);
	});

	it('should fail partialUpdateUser when updating to team containing username', async () => {
		const id = uuidv4();
		await serverAuth.upsertUser({
			id: id,
			name: dupeName,
		});

		const p = serverAuth.partialUpdateUser({
			id: id,
			set: {
				teams: [dupeTeam],
			},
		});

		await expect(p).to.be.rejectedWith(
			`StreamChat error code 6: UpdateUsersPartial failed with error: "username '${dupeName}' already exists in team '${dupeTeam}'"`,
		);
	});

	it('should disable unique usernames', async () => {
		await serverAuth.updateAppSettings({
			enforce_unique_usernames: 'no',
		});

		const response = await serverAuth.getAppSettings();
		expect(response.app.enforce_unique_usernames).to.eql('no');
	});
});
