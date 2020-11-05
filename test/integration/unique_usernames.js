import { getTestClient, sleep } from './utils';
import { v4 as uuidv4 } from 'uuid';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';

const expect = chai.expect;

chai.use(chaiAsPromised);

describe.only('enforce unique usernames', function () {
	const serverAuth = getTestClient(true);
	const dupeUserId = uuidv4();

	before(async () => {
		await serverAuth.upsertUser({
			id: uuidv4(),
			name: 'dupes-of-hazard',
			teams: ['red'],
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
			name: 'dupes-of-hazard',
		});

		await expect(p).to.be.rejectedWith(
			'StreamChat error code 4: UpdateUsers failed with error: "username \'dupes-of-hazard\' already exists"',
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
			name: 'dupes-of-hazard',
		});

		await expect(p).to.be.rejectedWith(
			'StreamChat error code 4: UpdateUsers failed with error: "username \'dupes-of-hazard\' already exists"',
		);
	});

	// it('should fail partialUpdateUser with an existing username on app level', async () => {
	//   const id = uuidv4();
	//   await serverAuth.upsertUser({
	//     id,
	//     name: id,
	//   });
	//
	//   const p = serverAuth.partialUpdateUser({
	//     id,
	//     set: {
	//       name: 'dupes-of-hazard',
	//     },
	//   });
	//
	//   await expect(p).to.be.rejectedWith(
	//     'StreamChat error code 4: UpdateUsers failed with error: "username \'dupes-of-hazard\' already exists"',
	//   );
	// });

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
			name: 'dupes-of-hazard',
		});
	});

	it('should fail upsertUser(insert) with an existing username on team level', async () => {
		const p = serverAuth.upsertUser({
			id: uuidv4(),
			name: 'dupes-of-hazard',
			teams: ['red'],
		});

		await expect(p).to.be.rejectedWith(
			"StreamChat error code 4: UpdateUsers failed with error: \"username 'dupes-of-hazard' already exists in team 'red'\"",
		);
	});

	it('should fail upsertUser(update) insert with an existing username on team level', async () => {
		const id = uuidv4();
		await serverAuth.upsertUser({
			id,
			name: id,
			teams: ['red'],
		});

		const p = serverAuth.upsertUser({
			id,
			name: 'dupes-of-hazard',
			teams: ['red'],
		});

		await expect(p).to.be.rejectedWith(
			"StreamChat error code 4: UpdateUsers failed with error: \"username 'dupes-of-hazard' already exists in team 'red'\"",
		);
	});

	// it('should fail upsertUser when adding to team containing username', async () => {
	//   const id = uuidv4();
	//   await serverAuth.upsertUser({
	//     id: id,
	//     name: 'dupes-of-hazard',
	//   });
	//
	//   const p = serverAuth.upsertUser({
	//     id: id,
	//     name: 'dupes-of-hazard',
	//     teams: ['red'],
	//   });
	//
	//   await expect(p).to.be.rejectedWith(
	//     'StreamChat error code 4: UpdateUsers failed with error: "username \'dupes-of-hazard\' already exists in team \'red\'"',
	//   );
	// });

	it('should disable unique usernames', async () => {
		await serverAuth.updateAppSettings({
			enforce_unique_usernames: 'no',
		});

		const response = await serverAuth.getAppSettings();
		expect(response.app.enforce_unique_usernames).to.eql('no');
	});

	// it('should fail to use an existing username', async () => {
	//   const p = serverAuth.upsertUsers([
	//     {
	//       id: uuidv4(),
	//       name: 'dupes-of-hazard',
	//     },
	//   ]);
	//
	//   await expect(p).to.be.rejectedWith(
	//     'error: username "dupes-of-hazard" already exists',
	//   );
	// });
	//
	// it('should succeed with unique usernames within team', async () => {
	//   await serverAuth.upsertUsers([
	//     {
	//       id: uuidv4(),
	//       name: 'dupes-of-hazard',
	//       teams: ["blue"],
	//     },
	//   ]);
	// });
	//
	// it('should fail to use an existing username within team', async () => {
	//   const p = serverAuth.upsertUsers([
	//     {
	//       id: uuidv4(),
	//       name: 'dupes-of-hazard',
	//       teams: ["blue"],
	//     },
	//   ]);
	//
	//   await expect(p).to.be.rejectedWith(
	//     'error: username "dupes-of-hazard" already exists in team "blue"',
	//   );
	// });
});
