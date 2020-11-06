import { getTestClient, sleep } from './utils';
import { v4 as uuidv4 } from 'uuid';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

const expect = chai.expect;

chai.use(chaiAsPromised);

describe('enforce unique usernames', function () {
	const serverAuth = getTestClient(true);
	const dupeUserId = uuidv4();
	const dupeName = uuidv4();
	const dupeTeam = uuidv4();

	before(async () => {
		await serverAuth.updateAppSettings({
			enforce_unique_usernames: 'no',
		});

		await serverAuth.upsertUser({
			id: uuidv4(),
			name: dupeName,
			teams: [dupeTeam],
		});
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
			`StreamChat error code 4: UpdateUsers failed with error: "username '${dupeName}' already exists"`,
		);
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
			`StreamChat error code 4: UpdateUsers failed with error: "username '${dupeName}' already exists"`,
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
			`StreamChat error code 4: UpdateUsersPartial failed with error: "username '${dupeName}' already exists"`,
		);
	});

	it('should only succeed once in race upsertUser(insert) with an existing username on app level', async () => {
		const name = uuidv4();
		const n = 5;
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

	it('should only succeed once in race partialUpdateUser(insert) with an existing username on app level', async () => {
		const id = uuidv4();
		const name = uuidv4();
		const n = 5;
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
			`StreamChat error code 4: UpdateUsers failed with error: "username '${dupeName}' already exists in team '${dupeTeam}'"`,
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
			`StreamChat error code 4: UpdateUsers failed with error: "username '${dupeName}' already exists in team '${dupeTeam}'"`,
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
			`StreamChat error code 4: UpdateUsersPartial failed with error: "username '${dupeName}' already exists in team '${dupeTeam}'"`,
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
			`StreamChat error code 4: UpdateUsers failed with error: "username '${dupeName}' already exists in team '${dupeTeam}'"`,
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
			`StreamChat error code 4: UpdateUsersPartial failed with error: "username '${dupeName}' already exists in team '${dupeTeam}'"`,
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
