import {
	createUsers,
	createUserToken,
	expectHTTPErrorCode,
	getServerTestClient,
	getTestClient,
	getTestClientForUser,
	sleep,
} from './utils';
import {
	Allow,
	AllowAll,
	AnyResource,
	AnyRole,
	DenyAll,
	Permission,
} from '../../src/permissions';
import { v4 as uuidv4 } from 'uuid';
import chai from 'chai';
import fs from 'fs';
import chaiLike from 'chai-like';
import chaiAsPromised from 'chai-as-promised';
import chaiSorted from 'chai-sorted';

chai.use(chaiLike);
chai.use(chaiAsPromised);
chai.use(chaiSorted);

const expect = chai.expect;

describe('Query Channels', function () {
	const client = getTestClient(true);

	before(async () => {
		for (let i = 0; i < 10; i++) {
			await client
				.channel('team', uuidv4(), { created_by: { id: 'tommaso' } })
				.create();
		}
	});

	it('watch should error', async () => {
		await expectHTTPErrorCode(
			400,
			client.queryChannels({}, {}, { watch: true, presence: false }),
		);
	});

	it('presence should error', async () => {
		await expectHTTPErrorCode(
			400,
			client.queryChannels({}, {}, { watch: false, presence: true }),
		);
	});

	it('state should work fine', async () => {
		const response = await client.queryChannels(
			{},
			{},
			{ watch: false, presence: false, state: true },
		);
		expect(response).to.have.length(10);
	});
});

describe('Channels server side - Create', function () {
	const channelCreator = {
		id: uuidv4(),
		name: 'creator',
		role: 'user',
	};
	const client = getTestClient(true);

	it('creating server side channels require created_by or created_by_id', async () => {
		const channelId = uuidv4();
		try {
			await client
				.channel('messaging', channelId, {
					color: 'green',
				})
				.create();
			expect().fail('should fail user ou user_id');
		} catch (e) {
			expect(e.message).to.be.equal(
				'StreamChat error code 4: GetOrCreateChannel failed with error: "either data.created_by or data.created_by_id must be provided when using server side auth."',
			);
		}
	});

	it('specify both user created_by and created_by_id should fail', async () => {
		const channelId = uuidv4();

		try {
			await client
				.channel('messaging', channelId, {
					color: 'green',
					created_by: channelCreator,
					created_by_id: channelCreator.id,
				})
				.create();
			expect().fail('should fail user ou user_id');
		} catch (e) {
			expect(e.message).to.be.equal(
				'StreamChat error code 4: GetOrCreateChannel failed with error: "cannot set both data.created_by and data.created_by_id."',
			);
		}
	});

	it('create server side channel with created_by', async () => {
		const channelId = uuidv4();

		const resp = await client
			.channel('messaging', channelId, {
				color: 'green',
				created_by: channelCreator,
			})
			.create();
		expect(resp.channel.created_by.id).to.be.equal(channelCreator.id);
	});

	it('create server side channel with created_by_id', async () => {
		const channelId = uuidv4();

		const resp = await client
			.channel('messaging', channelId, {
				color: 'green',
				created_by_id: channelCreator.id,
			})
			.create();
		expect(resp.channel.created_by.id).to.be.equal(channelCreator.id);
	});
});

describe('Channels server side - Send Message', function () {
	const channelCreator = {
		id: uuidv4(),
		name: 'creator',
		role: 'user',
	};
	const messageOwner = {
		id: uuidv4(),
		name: 'message-owner',
		role: 'user',
	};

	const channelID = uuidv4();
	const client = getTestClient(true);
	let channel;

	before(async () => {
		channel = client.channel('messaging', channelID, {
			color: 'green',
			created_by: channelCreator,
		});
		await channel.create();
	});

	it('creating server side message require user or user_id', async () => {
		try {
			await channel.sendMessage({ text: 'hi' });
			expect().fail('should fail user ou user_id');
		} catch (e) {
			expect(e.message).to.be.equal(
				'StreamChat error code 4: SendMessage failed with error: "either message.user or message.user_id must be provided when using server side auth."',
			);
		}
	});

	it('specify both user user and user_id should fail', async () => {
		try {
			await channel.sendMessage({
				text: 'hi',
				user: channelCreator,
				user_id: channelCreator.id,
			});
			expect().fail('should fail user ou user_id');
		} catch (e) {
			expect(e.message).to.be.equal(
				'StreamChat error code 4: SendMessage failed with error: "cannot set both message.user and message.user_id."',
			);
		}
	});

	it('create server side message with user', async () => {
		const resp = await channel.sendMessage({ text: 'hi', user: messageOwner });
		expect(resp.message.user.id).to.be.equal(messageOwner.id);
	});

	it('create server side channel with user_id', async () => {
		const resp = await channel.sendMessage({ text: 'hi', user_id: messageOwner.id });
		expect(resp.message.user.id).to.be.equal(messageOwner.id);
	});
});

describe('Mark Read Server Side', function () {
	const channelCreator = {
		id: uuidv4(),
		name: 'creator',
		role: 'user',
	};
	const markReadUser = {
		id: uuidv4(),
		name: 'message-owner',
		role: 'admin',
	};

	const channelID = 'mark-read-ss-' + uuidv4();
	const client = getTestClient(true);
	let channel;

	before(async () => {
		await createUsers([markReadUser.id]);
		channel = client.channel('messaging', channelID, {
			color: 'green',
			created_by: channelCreator,
		});
		await channel.create();
		await channel.sendMessage({ text: 'hi', user: channelCreator });
	});
	it('mark read in server side auth require user or user_id', async () => {
		try {
			await channel.markRead();
			expect().fail('should fail missing user ou user_id');
		} catch (e) {
			expect(e.message).to.be.equal(
				'StreamChat error code 4: MarkRead failed with error: "either user or user_id must be provided when using server side auth."',
			);
		}
	});
	it('specify both user user and user_id should fail', async () => {
		try {
			await channel.markRead({
				user: channelCreator,
				user_id: channelCreator.id,
			});
			expect().fail('should fail user ou user_id');
		} catch (e) {
			expect(e.message).to.be.equal(
				'StreamChat error code 4: MarkRead failed with error: "cannot set both user and user_id."',
			);
		}
	});
	it('create server side event with user', async () => {
		const resp = await channel.markRead({ user: markReadUser });
		expect(resp.event.user.id).to.be.equal(markReadUser.id);
	});
	it('create server side event with user_id', async () => {
		const resp = await channel.markRead({ user_id: markReadUser.id });
		expect(resp.event.user.id).to.be.equal(markReadUser.id);
	});
});

describe('Mark Read All Server Side', function () {
	const channelCreator = {
		id: uuidv4(),
		name: 'creator',
		role: 'user',
	};
	const markReadUser = {
		id: uuidv4(),
		name: 'message-owner',
		role: 'admin',
	};

	const channelID = 'mark-read-ss-' + uuidv4();
	const client = getTestClient(true);
	let channel;

	before(async () => {
		await createUsers([markReadUser.id]);
		channel = client.channel('messaging', channelID, {
			color: 'green',
			created_by: channelCreator,
		});
		await channel.create();
		await channel.sendMessage({ text: 'hi', user: channelCreator });
	});

	it('mark read in server side auth require user or user_id', async () => {
		try {
			await client.markAllRead();
			expect().fail('should fail missing user ou user_id');
		} catch (e) {
			expect(e.message).to.be.equal(
				'StreamChat error code 4: MarkAllRead failed with error: "either user or user_id must be provided when using server side auth."',
			);
		}
	});

	it('specify both user user and user_id should fail', async () => {
		try {
			await client.markAllRead({
				user: channelCreator,
				user_id: channelCreator.id,
			});
			expect().fail('should fail user ou user_id');
		} catch (e) {
			expect(e.message).to.be.equal(
				'StreamChat error code 4: MarkAllRead failed with error: "cannot set both user and user_id."',
			);
		}
	});

	it('create server side event with user', async () => {
		await client.markAllRead({ user: markReadUser });
	});

	it('create server side event with user_id', async () => {
		await client.markAllRead({ user_id: markReadUser.id });
	});
});

describe('Send Event Server Side', function () {
	const channelCreator = {
		id: uuidv4(),
		name: 'creator',
		role: 'user',
	};
	const eventUser = {
		id: uuidv4(),
		name: 'message-owner',
		role: 'admin',
	};

	const channelID = 'events-' + uuidv4();
	const client = getTestClient(true);
	let eventChannel;

	before(async () => {
		await createUsers([eventUser.id]);
		eventChannel = client.channel('messaging', channelID, {
			color: 'green',
			created_by: channelCreator,
		});
		await eventChannel.create();
		await eventChannel.sendMessage({ text: 'hi', user: channelCreator });
	});

	it('creating server side event require user or user_id', async () => {
		const event = {
			type: 'message.read',
		};
		try {
			await eventChannel.sendEvent(event);
			expect().fail('should fail user ou user_id');
		} catch (e) {
			expect(e.message).to.be.equal(
				'StreamChat error code 4: SendEvent failed with error: "either event.user or event.user_id must be provided when using server side auth."',
			);
		}
	});

	it('specify both user user and user_id should fail', async () => {
		const event = {
			type: 'message.read',
			user: eventUser,
			user_id: eventUser.id,
		};
		try {
			await eventChannel.sendEvent(event);
			expect().fail('should fail user ou user_id');
		} catch (e) {
			expect(e.message).to.be.equal(
				'StreamChat error code 4: SendEvent failed with error: "cannot set both event.user and event.user_id."',
			);
		}
	});

	it('update server side event using user_id', async () => {
		const event = {
			type: 'message.read',
			user_id: eventUser.id,
		};
		const resp = await eventChannel.sendEvent(event);
		expect(resp.event.user.id).to.be.equal(eventUser.id);
	});

	it('update server side event using user object', async () => {
		const event = {
			type: 'message.read',
			user: eventUser,
		};
		const resp = await eventChannel.sendEvent(event);
		expect(resp.event.user.id).to.be.equal(eventUser.id);
	});
});

describe('Update Message Server Side', function () {
	const channelCreator = {
		id: uuidv4(),
		name: 'creator',
		role: 'user',
	};
	const messageOwner = {
		id: uuidv4(),
		name: 'message-owner',
		role: 'user',
	};

	const channelID = uuidv4();
	const client = getTestClient(true);
	let channel;
	let message;

	before(async () => {
		channel = client.channel('messaging', channelID, {
			color: 'green',
			created_by: channelCreator,
		});
		await channel.create();
		const resp = await channel.sendMessage({ text: 'hi', user: messageOwner });
		message = resp.message;
	});

	it('creating server side message require user or user_id', async () => {
		try {
			await client.updateMessage(message, null);
			expect().fail('should fail user ou user_id');
		} catch (e) {
			expect(e.message).to.be.equal(
				'StreamChat error code 4: UpdateMessage failed with error: "either message.user or message.user_id must be provided when using server side auth."',
			);
		}
	});

	it('update server side message using user_id', async () => {
		const resp = await client.updateMessage(message, messageOwner.id);
		expect(resp.message.user.id).to.be.equal(messageOwner.id);
	});

	it('update server side message using user object', async () => {
		const resp = await client.updateMessage(message, messageOwner);
		expect(resp.message.user.id).to.be.equal(messageOwner.id);
	});
});

describe('Managing users', function () {
	const client = getTestClient(true);
	const user = {
		id: uuidv4(),
	};

	const evilUser = 'evil-user' + uuidv4();
	before(async () => {
		await createUsers([evilUser, user.id]);
	});

	it('edit user inserts if missing', async () => {
		await client.upsertUser(user);
		const response = await client.queryUsers(
			{ id: user.id },
			{},
			{ presence: false },
		);
		expect(response.users[0].id).to.eql(user.id);
		expect(response.users[0].role).to.eql('user');
	});

	it('change user data', async () => {
		user.os = 'gnu/linux';
		await client.upsertUser(user);
		const response = await client.queryUsers(
			{ id: user.id },
			{},
			{ presence: false },
		);
		expect(response.users[0].id).to.eql(user.id);
		expect(response.users[0].role).to.eql('user');
		expect(response.users[0].os).to.eql('gnu/linux');
	});

	describe('partial update', function () {
		it('change user role', async () => {
			const res = await client.partialUpdateUser({
				id: user.id,
				set: {
					role: 'admin',
				},
			});

			expect(res.users[user.id].role).to.eql('admin');
		});

		it('change custom field', async () => {
			const res = await client.partialUpdateUser({
				id: user.id,
				set: {
					fields: {
						subfield1: 'value1',
						subfield2: 'value2',
					},
				},
			});

			expect(res.users[user.id].fields).to.eql({
				subfield1: 'value1',
				subfield2: 'value2',
			});
		});

		it('removes custom fields', async () => {
			const res = await client.partialUpdateUser({
				id: user.id,
				unset: ['fields.subfield1'],
			});

			expect(res.users[user.id].fields).to.eql({
				subfield2: 'value2',
			});
		});

		it("doesn't allow .. in key names", async () => {
			await expectHTTPErrorCode(
				400,
				client.partialUpdateUser({
					id: user.id,
					set: { 'test..test': '111' },
				}),
			);

			await expectHTTPErrorCode(
				400,
				client.partialUpdateUser({
					id: user.id,
					unset: ['test..test'],
				}),
			);
		});

		it("doesn't allow spaces in key names", async () => {
			await expectHTTPErrorCode(
				400,
				client.partialUpdateUser({
					id: user.id,
					set: { ' test.test': '111' },
				}),
			);
			await expectHTTPErrorCode(
				400,
				client.partialUpdateUser({
					id: user.id,
					set: { ' test. test': '111' },
				}),
			);
			await expectHTTPErrorCode(
				400,
				client.partialUpdateUser({
					id: user.id,
					set: { ' test.test ': '111' },
				}),
			);

			await expectHTTPErrorCode(
				400,
				client.partialUpdateUser({
					id: user.id,
					unset: [' test.test'],
				}),
			);
			await expectHTTPErrorCode(
				400,
				client.partialUpdateUser({
					id: user.id,
					unset: [' test. test'],
				}),
			);
			await expectHTTPErrorCode(
				400,
				client.partialUpdateUser({
					id: user.id,
					unset: [' test.test '],
				}),
			);
		});

		it("doesn't allow start or end with dot in key names", async () => {
			await expectHTTPErrorCode(
				400,
				client.partialUpdateUser({
					id: user.id,
					set: { '.test.test': '111' },
				}),
			);
			await expectHTTPErrorCode(
				400,
				client.partialUpdateUser({
					id: user.id,
					set: { 'test.test.': '111' },
				}),
			);
		});
	});

	it('change user role', async () => {
		user.role = 'admin';
		await client.upsertUser(user);
		const response = await client.queryUsers(
			{ id: user.id },
			{},
			{ presence: false },
		);
		expect(response.users[0].id).to.eql(user.id);
		expect(response.users[0].role).to.eql('admin');
	});

	it('ban user', async () => {
		await client.banUser(evilUser, {
			banned_by_id: user.id,
		});
	});

	it('remove ban', async () => {
		await client.unbanUser(evilUser);
	});
});

describe('CreatedBy storage', function () {
	const createdById = uuidv4();
	const channelId = uuidv4();
	const client = getTestClient(true);

	it('Created by should be stored', async () => {
		const channel = client.channel('messaging', channelId, {
			created_by: { id: createdById },
		});
		const createResponse = await channel.create();

		expect(createResponse.channel.created_by.id).to.equal(createdById);
		expect(channel._data.created_by.id).to.equal(createdById);
		expect(channel.data.created_by.id).to.equal(createdById);
	});
});

describe('App configs', function () {
	const client = getTestClient(true);
	const client2 = getTestClient(false);

	const user = { id: 'guyon' };
	const createdById = uuidv4();
	const userToken =
		'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiZ3V5b24ifQ.c8ofzBnAuW1yVaznCDv0iGeoJQ-csme7kPpIMOjtkso';

	let channel;

	before(async () => {
		channel = client.channel('messaging', 'secret-place', {
			created_by: { id: `${createdById}` },
		});
		await channel.create();
	});

	it('Empty request should not break', async () => {
		await client.updateAppSettings({});
	});

	it('Using a tampered token fails because of auth enabled', async () => {
		await client.updateAppSettings({
			disable_auth_checks: false,
		});
		await expectHTTPErrorCode(401, client2.connectUser(user, userToken));
		client2.disconnect(5000);
	});

	it('Using dev token fails because of auth enabled', async () => {
		await expectHTTPErrorCode(
			401,
			client2.connectUser(user, client2.devToken(user.id)),
		);
		client2.disconnect(5000);
	});

	it('Disable auth checks', async () => {
		await client.updateAppSettings({
			disable_auth_checks: true,
		});
		await sleep(1000);
	});

	it('Using a tampered token does not fail because auth is disabled', async () => {
		await client2.connectUser(user, userToken);
		client2.disconnect(5000);
	});

	it('Using dev token does not fail because auth is disabled', async () => {
		await client2.connectUser(user, client2.devToken(user.id));
		client2.disconnect(5000);
	});

	it('Disable permission checks', async () => {
		await client.updateAppSettings({
			disable_permissions_checks: true,
		});
		await sleep(1000);
	});

	it('A user can do super stuff because permission checks are off', async () => {
		await client2.connectUser(user, userToken);
		await client2.channel('messaging', 'secret-place').watch();
		client2.disconnect(5000);
	});

	it('Re-enable permission checks', async () => {
		await client.updateAppSettings({
			disable_permissions_checks: false,
		});
		await sleep(1000);
	});

	it('A user cannot do super stuff because permission checks are back on', async () => {
		const client = await getTestClientForUser(uuidv4());
		await expectHTTPErrorCode(
			403,
			client.channel('messaging', 'secret-place').watch(),
		);
	});

	it('Re-enable auth checks', async () => {
		await client.updateAppSettings({
			disable_auth_checks: false,
		});
		await sleep(1000);
	});

	it('Using a tampered token fails because auth is back on', async () => {
		await expectHTTPErrorCode(401, client2.connectUser(user, userToken));
		client2.disconnect(5000);
	});

	describe('Push notifications configuration', function () {
		const disableProviders = {
			apn_config: { disabled: true },
			firebase_config: { disabled: true },
		};

		const v1 = { push_config: { version: 'v1' }, ...disableProviders };
		const v2 = { push_config: { version: 'v2' }, ...disableProviders };
		const vWrong = { push_config: { version: 'vWrong' }, ...disableProviders };

		describe('Version set', () => {
			context('When setting push version', () => {
				it('success for v1', async () => {
					await client.updateAppSettings(v1);
				});
				it('success for v2', async () => {
					await client.updateAppSettings(v2);
				});
				it('400 for wrong version', async () => {
					await expectHTTPErrorCode(400, client.updateAppSettings(vWrong));
				});
			});
		});

		describe('APN v1', () => {
			before(async () => {
				await client.updateAppSettings(v1);
			});

			context('When using certificate', function () {
				context('When adding bad certificate', function () {
					it('returns 400 error code', function () {
						return expectHTTPErrorCode(
							400,
							client.updateAppSettings({
								apn_config: {
									auth_type: 'certificate',
									p12_cert: 'boogus',
								},
							}),
						);
					});
				});

				context('When adding outdated certificate', function () {
					it('returns 400 error code', function () {
						return expectHTTPErrorCode(
							400,
							client.updateAppSettings({
								apn_config: {
									auth_type: 'certificate',
									p12_cert: fs.readFileSync(
										'./test/integration/push_test/stream-push-test-outdated.p12',
									),
								},
							}),
						);
					});
				});

				context('When adding good apn certificate', function () {
					context('When development is true', function () {
						before(async () => {
							await client.updateAppSettings({
								apn_config: {
									auth_type: 'certificate',
									p12_cert: fs.readFileSync(
										'./test/integration/push_test/stream-push-test.p12',
									),
									bundle_id: 'io.getstream.PushNotifTest',
									development: true,
								},
							});
						});

						it('App contains valid details', async () => {
							const response = await client.getAppSettings();
							expect(response.app).to.be.an('object');
							expect(response.app.push_notifications).to.be.an('object');
							expect(response.app.push_notifications.version).to.be.eq(
								'v1',
							);
							delete response.app.push_notifications.apn
								.notification_template;
							expect(response.app.push_notifications.apn).to.eql({
								enabled: true,
								development: true,
								auth_type: 'certificate',
								bundle_id: 'io.getstream.PushNotifTest',
								host: 'https://api.development.push.apple.com',
							});
						});
					});

					context('When development is false', function () {
						before(async () => {
							await client.updateAppSettings({
								apn_config: {
									auth_type: 'certificate',
									p12_cert: fs.readFileSync(
										'./test/integration/push_test/stream-push-test.p12',
									),
									bundle_id: 'io.getstream.PushNotifTest',
									development: false,
								},
							});
						});

						it('App contains valid details', async () => {
							const response = await client.getAppSettings();
							expect(response.app).to.be.an('object');
							expect(response.app.push_notifications).to.be.an('object');
							expect(response.app.push_notifications.version).to.be.eq(
								'v1',
							);
							delete response.app.push_notifications.apn
								.notification_template;
							expect(response.app.push_notifications.apn).to.eql({
								enabled: true,
								development: false,
								auth_type: 'certificate',
								bundle_id: 'io.getstream.PushNotifTest',
								host: 'https://api.push.apple.com',
							});
						});
					});
				});
			});

			context('When using apn token', function () {
				context('When token is bad', function () {
					it('returns 400 error code', function () {
						return expectHTTPErrorCode(
							400,
							client.updateAppSettings({
								apn_config: {
									auth_type: 'token',
									bundle_id: 'com.apple.test',
									auth_key: 'supersecret',
									key_id: 'keykey',
									team_id: 'sfd',
								},
							}),
						);
					});
				});

				context('When token without bundle_id', function () {
					it('return 400 error code', function () {
						return expectHTTPErrorCode(
							400,
							client.updateAppSettings({
								apn_config: {
									auth_type: 'token',
									auth_key: fs.readFileSync(
										'./test/integration/push_test/push-test-auth-key.p8',
										'utf-8',
									),
									key_id: 'keykey',
									team_id: 'sfd',
									bundle_id: '',
								},
							}),
						);
					});
				});

				context('When token without key_id', function () {
					it('return 400 error code', function () {
						return expectHTTPErrorCode(
							400,
							client.updateAppSettings({
								apn_config: {
									auth_type: 'token',
									auth_key: fs.readFileSync(
										'./test/integration/push_test/push-test-auth-key.p8',
										'utf-8',
									),
									key_id: '',
									bundle_id: 'bundly',
									team_id: 'sfd',
								},
							}),
						);
					});
				});

				context('When token without team', function () {
					it('return 400 error code', async () => {
						await expectHTTPErrorCode(
							400,
							client.updateAppSettings({
								apn_config: {
									auth_type: 'token',
									auth_key: fs.readFileSync(
										'./test/integration/push_test/push-test-auth-key.p8',
										'utf-8',
									),
									key_id: 'keykey',
									bundle_id: 'sfd',
									team_id: '',
								},
							}),
						);
					});
				});

				context('When good production apn token', function () {
					let app;
					before(async () => {
						await client.updateAppSettings({
							apn_config: {
								auth_type: 'token',
								auth_key: fs.readFileSync(
									'./test/integration/push_test/push-test-auth-key.p8',
									'utf-8',
								),
								key_id: 'keykey',
								bundle_id: 'com.apple.test',
								development: false,
								team_id: 'sfd',
							},
						});

						const response = await client.getAppSettings();
						expect(response.app).to.be.an('object');
						app = response.app;
					});

					it('returns correct app settings', function () {
						expect(app.push_notifications).to.be.an('object');
						expect(app.push_notifications.version).to.be.eq('v1');
						delete app.push_notifications.apn.notification_template;
						expect(app.push_notifications.apn).to.eql({
							enabled: true,
							development: false,
							auth_type: 'token',
							bundle_id: 'com.apple.test',
							host: 'https://api.push.apple.com',
							team_id: 'sfd',
							key_id: 'keykey',
						});
					});
				});

				context('When good development apn token', function () {
					before(async () => {
						await client.updateAppSettings({
							apn_config: {
								auth_type: 'token',
								auth_key: fs.readFileSync(
									'./test/integration/push_test/push-test-auth-key.p8',
									'utf-8',
								),
								key_id: 'keykey',
								bundle_id: 'com.apple.test',
								team_id: 'sfd',
								development: true,
							},
						});
					});

					it('returns correct app settings', async () => {
						const response = await client.getAppSettings();
						expect(response.app).to.be.an('object');
						expect(response.app.push_notifications).to.be.an('object');
						expect(response.app.push_notifications.version).to.be.eq('v1');
						delete response.app.push_notifications.apn.notification_template;
						expect(response.app.push_notifications.apn).to.eql({
							enabled: true,
							development: true,
							auth_type: 'token',
							bundle_id: 'com.apple.test',
							team_id: 'sfd',
							key_id: 'keykey',
							host: 'https://api.development.push.apple.com',
						});
					});
				});
			});

			context('When adding bad apn template', function () {
				it('returns 400 error code', function () {
					return expectHTTPErrorCode(
						400,
						client.updateAppSettings({
							apn_config: {
								auth_type: 'certificate',
								p12_cert: fs.readFileSync(
									'./test/integration/push_test/stream-push-test.p12',
								),
								notification_template: '{ {{ } }',
							},
						}),
					);
				});

				context('When template is valid but not json', function () {
					it('returns 400 error code', function () {
						return expectHTTPErrorCode(
							400,
							client.updateAppSettings({
								apn_config: {
									auth_type: 'certificate',
									p12_cert: fs.readFileSync(
										'./test/integration/push_test/stream-push-test.p12',
									),
									notification_template: '{{ message.id }}',
								},
							}),
						);
					});
				});
			});

			context('When APN is disabled', function () {
				before(async () => {
					await client.updateAppSettings({
						apn_config: {
							disabled: true,
						},
					});
				});

				it('Returns app settings with disabled mode', async () => {
					const response = await client.getAppSettings();
					expect(response.app).to.be.an('object');
					expect(response.app.push_notifications).to.be.an('object');
					expect(response.app.push_notifications.version).to.be.eq('v1');
					delete response.app.push_notifications.apn.notification_template;
					expect(response.app.push_notifications.apn.enabled).to.be.false;
				});
			});
		});
		describe('APN v2', () => {
			before(async () => {
				await client.updateAppSettings(v2);
			});

			context('When using certificate', () => {
				context('When using good certificate', () => {
					it('returns 400 error code', async () => {
						await expectHTTPErrorCode(
							400,
							client.updateAppSettings({
								apn_config: {
									auth_type: 'certificate',
									p12_cert: fs.readFileSync(
										'./test/integration/push_test/stream-push-test.p12',
									),
									bundle_id: 'io.getstream.PushNotifTest',
									development: true,
								},
							}),
						);
					});
				});
			});

			context('When using token', () => {
				context('When token is bad', () => {
					it('returns 400 error code', function () {
						return expectHTTPErrorCode(
							400,
							client.updateAppSettings({
								apn_config: {
									auth_type: 'token',
									bundle_id: 'com.apple.test',
									auth_key: 'supersecret',
									key_id: 'keykey',
									team_id: 'sfd',
								},
							}),
						);
					});
				});

				context('When token without bundle_id', () => {
					it('return 400 error code', function () {
						return expectHTTPErrorCode(
							400,
							client.updateAppSettings({
								apn_config: {
									auth_type: 'token',
									auth_key: fs.readFileSync(
										'./test/integration/push_test/push-test-auth-key.p8',
										'utf-8',
									),
									key_id: 'keykey',
									team_id: 'sfd',
									bundle_id: '',
								},
							}),
						);
					});
				});

				context('When token without key_id', function () {
					it('return 400 error code', function () {
						return expectHTTPErrorCode(
							400,
							client.updateAppSettings({
								apn_config: {
									auth_type: 'token',
									auth_key: fs.readFileSync(
										'./test/integration/push_test/push-test-auth-key.p8',
										'utf-8',
									),
									key_id: '',
									bundle_id: 'bundly',
									team_id: 'sfd',
								},
							}),
						);
					});
				});

				context('When token without team', function () {
					it('return 400 error code', async () => {
						await expectHTTPErrorCode(
							400,
							client.updateAppSettings({
								apn_config: {
									auth_type: 'token',
									auth_key: fs.readFileSync(
										'./test/integration/push_test/push-test-auth-key.p8',
										'utf-8',
									),
									key_id: 'keykey',
									bundle_id: 'sfd',
									team_id: '',
								},
							}),
						);
					});
				});

				context('When good production apn token', function () {
					let app;
					before(async () => {
						await client.updateAppSettings({
							apn_config: {
								auth_type: 'token',
								auth_key: fs.readFileSync(
									'./test/integration/push_test/push-test-auth-key.p8',
									'utf-8',
								),
								key_id: 'keykey',
								bundle_id: 'com.apple.test',
								development: false,
								team_id: 'sfd',
							},
						});

						const response = await client.getAppSettings();
						expect(response.app).to.be.an('object');
						app = response.app;
					});

					it('returns correct app settings', function () {
						expect(app.push_notifications).to.be.an('object');
						expect(app.push_notifications.version).to.be.eq('v2');
						delete app.push_notifications.apn.notification_template;
						expect(app.push_notifications.apn).to.eql({
							enabled: true,
							development: false,
							auth_type: 'token',
							bundle_id: 'com.apple.test',
							host: 'https://api.push.apple.com',
							team_id: 'sfd',
							key_id: 'keykey',
						});
					});
				});

				context('When good development apn token', () => {
					before(async () => {
						await client.updateAppSettings({
							apn_config: {
								auth_type: 'token',
								auth_key: fs.readFileSync(
									'./test/integration/push_test/push-test-auth-key.p8',
									'utf-8',
								),
								key_id: 'keykey',
								bundle_id: 'com.apple.test',
								team_id: 'sfd',
								development: true,
							},
						});
					});

					it('returns correct app settings', async () => {
						const response = await client.getAppSettings();
						expect(response.app).to.be.an('object');
						expect(response.app.push_notifications).to.be.an('object');
						expect(response.app.push_notifications.version).to.be.eq('v2');
						delete response.app.push_notifications.apn.notification_template;
						expect(response.app.push_notifications.apn).to.eql({
							enabled: true,
							development: true,
							auth_type: 'token',
							bundle_id: 'com.apple.test',
							team_id: 'sfd',
							key_id: 'keykey',
							host: 'https://api.development.push.apple.com',
						});
					});
				});
			});
		});
		describe('Firebase v1', () => {
			before(async () => {
				await client.updateAppSettings(v1);
			});

			it('Adding bad template', async () => {
				await expectHTTPErrorCode(
					400,
					client.updateAppSettings({
						firebase_config: {
							notification_template: '{ {{ } }',
						},
					}),
				);
			});

			it('Adding invalid json template', async () => {
				await expectHTTPErrorCode(
					400,
					client.updateAppSettings({
						firebase_config: {
							notification_template: '{{ message.id }}',
						},
					}),
				);
			});
			it('Adding bad data template', async () => {
				await expectHTTPErrorCode(
					400,
					client.updateAppSettings({
						firebase_config: {
							data_template: '{ {{ } }',
						},
					}),
				);
			});

			it('Adding invalid json data template', async () => {
				await expectHTTPErrorCode(
					400,
					client.updateAppSettings({
						firebase_config: {
							data_template: '{{ message.id }}',
						},
					}),
				);
			});
			it('Adding invalid server key', async () => {
				await expectHTTPErrorCode(
					400,
					client.updateAppSettings({
						firebase_config: {
							server_key: 'asdasd',
							notification_template: '{ }',
						},
					}),
				);
			});
			it('Adding good server key', async () => {
				await client.updateAppSettings({
					firebase_config: {
						server_key:
							'AAAAyMwm738:APA91bEpRfUKal8ZeVMbpe8eLyo6T1LK7IhMCETwEOrXoPXFTHHsu7JGQVDElTgVyboNhNmoPoAjQxfRWOR6NOQm5eo7cLA5Uf-PB5qRIGDdl62dIrDkTxMv7UjoGvNDYzr4EFFfoE2u',
						notification_template: '{ }',
					},
				});
			});
			it('Describe app settings', async () => {
				const response = await client.getAppSettings();
				expect(response.app).to.be.an('object');
				expect(response.app.push_notifications).to.be.an('object');
				expect(response.app.push_notifications.version).to.be.eq('v1');
				delete response.app.push_notifications.firebase.notification_template;
				delete response.app.push_notifications.firebase.data_template;
				expect(response.app.push_notifications.firebase).to.eql({
					enabled: true,
				});
			});
			it('Disable firebase', async () => {
				await client.updateAppSettings({
					firebase_config: {
						disabled: true,
					},
				});
			});
			it('Describe app settings', async () => {
				const response = await client.getAppSettings();
				expect(response.app).to.be.an('object');
				expect(response.app.push_notifications).to.be.an('object');
				expect(response.app.push_notifications.version).to.be.eq('v1');
				delete response.app.push_notifications.firebase.notification_template;
				delete response.app.push_notifications.firebase.data_template;
				expect(response.app.push_notifications.firebase).to.eql({
					enabled: false,
				});
			});
		});
		describe('Firebase v2', () => {
			before(async () => {
				await client.updateAppSettings(v2);
			});

			context('When using server key', () => {
				it('Adding good server key fails', async () => {
					await expectHTTPErrorCode(
						400,
						client.updateAppSettings({
							firebase_config: {
								server_key:
									'AAAAyMwm738:APA91bEpRfUKal8ZeVMbpe8eLyo6T1LK7IhMCETwEOrXoPXFTHHsu7JGQVDElTgVyboNhNmoPoAjQxfRWOR6NOQm5eo7cLA5Uf-PB5qRIGDdl62dIrDkTxMv7UjoGvNDYzr4EFFfoE2u',
								notification_template: '{ }',
								credentials_json: '',
							},
						}),
					);
				});
			});

			context('When using service account', () => {
				it('Adding bad credentials', async () => {
					await expectHTTPErrorCode(
						400,
						client.updateAppSettings({
							firebase_config: {
								credentials_json: 'bogus',
							},
						}),
					);
				});

				it('Adding good credentials', async () => {
					await client.updateAppSettings({
						firebase_config: {
							credentials_json: fs.readFileSync(
								'./test/integration/push_test/push-test-credentials.json',
								'utf-8',
							),
						},
					});
				});

				it('Describe app settings', async () => {
					const response = await client.getAppSettings();
					expect(response.app).to.be.an('object');
					expect(response.app.push_notifications).to.be.an('object');
					expect(response.app.push_notifications.version).to.be.eq('v2');
					delete response.app.push_notifications.firebase.notification_template;
					delete response.app.push_notifications.firebase.data_template;
					expect(response.app.push_notifications.firebase).to.eql({
						enabled: true,
					});
				});
			});
			context('When disabled', () => {
				it('Disable firebase', async () => {
					await client.updateAppSettings({
						firebase_config: {
							disabled: true,
						},
					});
				});
				it('Describe app settings', async () => {
					const response = await client.getAppSettings();
					expect(response.app).to.be.an('object');
					expect(response.app.push_notifications).to.be.an('object');
					expect(response.app.push_notifications.version).to.be.eq('v2');
					delete response.app.push_notifications.firebase.notification_template;
					delete response.app.push_notifications.firebase.data_template;
					expect(response.app.push_notifications.firebase).to.eql({
						enabled: false,
					});
				});
			});
		});
	});

	describe('Push notifications test endpoint v1', function () {
		const apnDevice = uuidv4();
		const firebaseDevice = uuidv4();
		const userID = uuidv4();
		let user = {};
		const apn_config = {
			auth_key: fs.readFileSync(
				'./test/integration/push_test/push-test-auth-key.p8',
				'utf-8',
			),
			key_id: 'whatever',
			team_id: 'stream',
			bundle_id: 'bundle',
			auth_type: 'token',
		};
		const firebase_config = {
			server_key:
				'AAAAyMwm738:APA91bEpRfUKal8ZeVMbpe8eLyo6T1LK7IhMCETwEOrXoPXFTHHsu7JGQVDElTgVyboNhNmoPoAjQxfRWOR6NOQm5eo7cLA5Uf-PB5qRIGDdl62dIrDkTxMv7UjoGvNDYzr4EFFfoE2u',
		};

		before(async () => {
			await client.addDevice(apnDevice, 'apn', userID);
			await client.addDevice(firebaseDevice, 'firebase', userID);
			const resp = await client.upsertUser({ id: userID, name: uuidv4() });
			user = resp.users[userID];
		});

		after(async () => {
			await client.removeDevice(apnDevice, userID);
			await client.removeDevice(firebaseDevice, userID);
		});

		beforeEach(async () => {
			await client.updateAppSettings({
				push_config: {
					version: 'v1',
				},
				apn_config: {
					disabled: true,
				},
				firebase_config: {
					disabled: true,
				},
			});
			await sleep(200);
		});

		it('User has no devices', async () => {
			await client.removeDevice(apnDevice, userID);
			await client.updateAppSettings({ apn_config });
			const p = client.testPushSettings(userID);
			await expect(p).to.be.rejectedWith(`User has no enabled devices associated`);
		});

		it('User has no devices but skips devices', async () => {
			const response = await client.testPushSettings(userID, {
				apnTemplate: `{"text": "some"}`,
				skipDevices: true,
			});
			expect(response.skip_devices).to.eq(true);
			expect(response.rendered_apn_template).to.eq(`{"text": "some"}`);
		});

		it('App has push disabled', async () => {
			const p = client.testPushSettings(userID);
			await expect(p).to.be.rejectedWith(
				`Your app doesn't have push notifications enabled`,
			);
		});

		it('No APN + APN template', async () => {
			await client.updateAppSettings({ firebase_config });
			await client.addDevice(apnDevice, 'apn', userID);

			const p = client.testPushSettings(userID, { apnTemplate: '{}' });
			await expect(p).to.be.rejectedWith(
				`APN template provided, but app doesn't have APN push notifications configured`,
			);
		});

		it('No Firebase + firebase template', async () => {
			await client.updateAppSettings({ apn_config });

			const p = client.testPushSettings(userID, { firebaseTemplate: '{}' });
			await expect(p).to.be.rejectedWith(
				`Firebase template provided, but app doesn't have firebase push notifications configured`,
			);
		});

		it('No Firebase + firebase data template', async () => {
			await client.updateAppSettings({ apn_config });

			const p = client.testPushSettings(userID, { firebaseDataTemplate: '{}' });
			await expect(p).to.be.rejectedWith(
				`Firebase template provided, but app doesn't have firebase push notifications configured`,
			);
		});

		it('Bad message id', async () => {
			await client.updateAppSettings({ apn_config });
			const msgID = uuidv4();
			const p = client.testPushSettings(userID, { messageID: msgID });
			await expect(p).to.be.rejectedWith(`Message with id ${msgID} not found`);
		});

		it('Random message', async () => {
			await client.updateAppSettings({ apn_config });

			const chan = client.channel('messaging', uuidv4(), {
				members: [userID],
				created_by: { id: userID },
			});
			await chan.create();

			const msg = await chan.sendMessage({ text: uuidv4(), user_id: userID });

			const response = await client.testPushSettings(userID, {
				apnTemplate:
					'{"stuff": "{{ sender.id }} {{ sender.name }} {{ message.text }} {{ channel.id }}"}',
			});
			expect(response.rendered_apn_template).to.eq(
				`{"stuff": "${userID} ${user.name} ${msg.message.text} ${chan.id}"}`,
			);
		});

		it('Specific message', async () => {
			await client.updateAppSettings({ apn_config });

			const chan = client.channel('messaging', uuidv4(), {
				members: [userID],
				created_by: { id: userID },
			});
			await chan.create();

			const msg = await chan.sendMessage({ text: uuidv4(), user_id: userID });
			await chan.sendMessage({ text: uuidv4(), user_id: userID });
			await chan.sendMessage({ text: uuidv4(), user_id: userID });
			await chan.sendMessage({ text: uuidv4(), user_id: userID });

			const response = await client.testPushSettings(userID, {
				apnTemplate:
					'{"stuff": "{{ sender.id }} {{ sender.name }} {{ message.text }} {{ channel.id }}"}',
				messageID: msg.message.id,
			});
			expect(response.rendered_apn_template).to.eq(
				`{"stuff": "${userID} ${user.name} ${msg.message.text} ${chan.id}"}`,
			);
		});

		it('Bad apn template error gets returned in response', async () => {
			await client.updateAppSettings({ apn_config });

			const response = await client.testPushSettings(userID, {
				apnTemplate: '{{}',
			});
			expect(response).to.not.have.property('rendered_apn_template');
			expect(response.general_errors).to.have.length(1);
			expect(response.general_errors).to.have.members([
				'APN template is invalid: notification_template is not a valid handlebars template',
			]);
		});

		it('Bad firebase notification template error gets returned in response', async () => {
			await client.updateAppSettings({ firebase_config });

			const response = await client.testPushSettings(userID, {
				firebaseTemplate: '{{}',
			});
			expect(response).to.not.have.property('rendered_firebase_template');
			expect(response.general_errors).to.have.length(1);
			expect(response.general_errors).to.have.members([
				'Firebase template is invalid: notification_template is not a valid handlebars template',
			]);
		});

		it('Bad firebase data template error gets returned in response', async () => {
			await client.updateAppSettings({ firebase_config });

			const response = await client.testPushSettings(userID, {
				firebaseDataTemplate: '{{}',
			});
			expect(response).to.not.have.property('rendered_firebase_template');
			expect(response.general_errors).to.have.length(1);
			expect(response.general_errors).to.have.members([
				'Firebase data template is invalid: data_template is not a valid handlebars template',
			]);
		});

		it('Good notification template', async () => {
			await client.updateAppSettings({ firebase_config });

			const response = await client.testPushSettings(userID, {
				messageID: 'very-fake-message',
				firebaseTemplate: '{"id": "{{message.id}}"}',
			});
			const firebaseMsg = JSON.parse(response.rendered_firebase_template);
			expect(firebaseMsg.notification.id).to.be.equal('very-fake-message');
		});

		it('Good data template', async () => {
			await client.updateAppSettings({ firebase_config });

			const response = await client.testPushSettings(userID, {
				messageID: 'very-fake-message',
				firebaseDataTemplate: '{"id": "{{message.id}}"}',
			});

			const firebaseMsg = JSON.parse(response.rendered_firebase_template);
			expect(firebaseMsg.data.id).to.be.equal('very-fake-message');
		});

		it('All good', async () => {
			await client.updateAppSettings({ firebase_config });

			const response = await client.testPushSettings(userID, {
				firebaseTemplate: '{}',
				firebaseDataTemplate: '{}',
			});
			const firebaseMsg = JSON.parse(response.rendered_firebase_template);
			expect(firebaseMsg.notification).to.be.empty;
		});

		it('Members in the template using helper', async () => {
			await client.updateAppSettings({ apn_config });

			const members = [
				{
					id: uuidv4(),
					name: uuidv4(),
				},
				{
					id: uuidv4(),
					name: uuidv4(),
				},
				{
					id: uuidv4(),
					name: uuidv4(),
				},
			];
			await client.upsertUsers(members);

			const chan = client.channel('messaging', uuidv4(), {
				members: [userID],
				created_by: { id: userID },
			});
			await chan.create();

			for (const m of members) {
				await chan.addMembers([m.id]);
			}

			const msg = await chan.sendMessage({ text: uuidv4(), user_id: userID });
			await chan.sendMessage({ text: uuidv4(), user_id: userID });
			await chan.sendMessage({ text: uuidv4(), user_id: userID });
			await chan.sendMessage({ text: uuidv4(), user_id: userID });

			const response = await client.testPushSettings(userID, {
				apnTemplate:
					'{"stuff": "{{implodeMembers otherMembers limit=2 suffixFmt="en %d anderen"}}: {{ message.text }}"}',
				messageID: msg.message.id,
			});

			expect(response.general_errors).to.be.undefined;
			expect(response.rendered_apn_template).to.eq(
				`{"stuff": "${members[0].name}, ${members[1].name} en 1 anderen: ${msg.message.text}"}`,
			);
		});

		it('Members in the template using handlebars', async () => {
			await client.updateAppSettings({ apn_config });

			const members = [
				{
					id: uuidv4(),
					name: uuidv4(),
				},
				{
					id: uuidv4(),
					name: uuidv4(),
				},
				{
					id: uuidv4(),
					name: uuidv4(),
				},
			];
			await client.upsertUsers(members);

			const chan = client.channel('messaging', uuidv4(), {
				members: [userID],
				created_by: { id: userID },
			});
			await chan.create();

			for (const m of members) {
				await chan.addMembers([m.id]);
			}

			const msg = await chan.sendMessage({ text: uuidv4(), user_id: userID });
			await chan.sendMessage({ text: uuidv4(), user_id: userID });
			await chan.sendMessage({ text: uuidv4(), user_id: userID });
			await chan.sendMessage({ text: uuidv4(), user_id: userID });

			const response = await client.testPushSettings(userID, {
				apnTemplate: `{"stuff": "
					{{~#each otherMembers}}
						{{#ifLte @index 0}}
							{{~this.name}}{{#ifLt @index 0 }}, {{/ifLt~}}
						{{~else if @last~}}
								{{{ " " }}} en {{remainder otherMembers 1}} anderen: {{message.text}}
						{{~/ifLte~}}
					{{/each~}}
					"}`,
				messageID: msg.message.id,
			});

			expect(response.general_errors).to.be.undefined;
			expect(response.rendered_apn_template).to.eq(
				`{"stuff": "${members[0].name} en 2 anderen: ${msg.message.text}"}`,
			);
		});
	});

	describe('Push notifications test endpoint v2', function () {
		const apnDevice = uuidv4();
		const firebaseDevice = uuidv4();
		const userID = uuidv4();
		let user = {};
		const apn_config = {
			auth_key: fs.readFileSync(
				'./test/integration/push_test/push-test-auth-key.p8',
				'utf-8',
			),
			key_id: 'whatever',
			team_id: 'stream',
			bundle_id: 'bundle',
			auth_type: 'token',
		};
		const firebase_config = {
			credentials_json: fs.readFileSync(
				'./test/integration/push_test/push-test-credentials.json',
				'utf-8',
			),
		};

		before(async () => {
			await client.addDevice(apnDevice, 'apn', userID);
			await client.addDevice(firebaseDevice, 'firebase', userID);
			const resp = await client.upsertUser({ id: userID, name: uuidv4() });
			user = resp.users[userID];
		});

		after(async () => {
			await client.removeDevice(apnDevice, userID);
			await client.removeDevice(firebaseDevice, userID);
		});

		beforeEach(async () => {
			await client.updateAppSettings({
				push_config: {
					version: 'v2',
				},
				apn_config: {
					disabled: true,
				},
				firebase_config: {
					disabled: true,
				},
			});
			await sleep(200);
		});

		it('User has no devices', async () => {
			await client.removeDevice(apnDevice, userID);
			await client.updateAppSettings({ apn_config });
			const p = client.testPushSettings(userID);
			await expect(p).to.be.rejectedWith(`User has no enabled devices associated`);
		});

		it('User has no devices but skips devices', async () => {
			const response = await client.testPushSettings(userID, {
				firebaseTemplate: `{"text": "some"}`, // ignored due to v2
				skipDevices: true,
			});
			expect(response.skip_devices).to.eq(true);
			expect(response.rendered_message).to.not.eq(undefined);
		});

		it('App has push disabled', async () => {
			const p = client.testPushSettings(userID);
			await expect(p).to.be.rejectedWith(
				`Your app doesn't have push notifications enabled`,
			);
		});

		it('No APN even if apn device', async () => {
			await client.updateAppSettings({ firebase_config });
			await client.addDevice(apnDevice, 'apn', userID);

			const response = await client.testPushSettings(userID, { apnTemplate: '{}' });
			expect(response.rendered_message).to.be.an('object');
			expect(response.rendered_message.type).to.be.eq('message.new');
			expect(response).to.not.have.property('rendered_apn_template');
			expect(response).to.not.have.property('rendered_firebase_template');
		});

		it('No Firebase even if firebase device when requested with notification template', async () => {
			await client.updateAppSettings({ apn_config });

			const response = await client.testPushSettings(userID, {
				firebaseTemplate: '{}',
			});
			expect(response.rendered_message).to.be.an('object');
			expect(response.rendered_message.type).to.be.eq('message.new');
			expect(response).to.not.have.property('rendered_apn_template');
			expect(response).to.not.have.property('rendered_firebase_template');
		});

		it('No Firebase even if firebase device when requested with data template', async () => {
			await client.updateAppSettings({ apn_config });

			const response = await client.testPushSettings(userID, {
				firebaseDataTemplate: '{}',
			});
			expect(response.rendered_message).to.be.an('object');
			expect(response.rendered_message.type).to.be.eq('message.new');
			expect(response).to.not.have.property('rendered_apn_template');
			expect(response).to.not.have.property('rendered_firebase_template');
		});

		it('Bad message id', async () => {
			await client.updateAppSettings({ apn_config });
			const msgID = uuidv4();
			const p = client.testPushSettings(userID, { messageID: msgID });
			await expect(p).to.be.rejectedWith(`Message with id ${msgID} not found`);
		});

		it('Random message', async () => {
			await client.updateAppSettings({ apn_config });

			const chan = client.channel('messaging', uuidv4(), {
				members: [userID],
				created_by: { id: userID },
			});
			await chan.create();

			const msg = await chan.sendMessage({ text: uuidv4(), user_id: userID });

			const response = await client.testPushSettings(userID);
			expect(response.rendered_message).to.be.an('object');
			expect(response.rendered_message.type).to.be.eq('message.new');
			expect(response.rendered_message.id).to.be.eq(msg.message.id);
			expect(response).to.not.have.property('rendered_apn_template');
			expect(response).to.not.have.property('rendered_firebase_template');
		});

		it('Specific message', async () => {
			await client.updateAppSettings({ apn_config });

			const chan = client.channel('messaging', uuidv4(), {
				members: [userID],
				created_by: { id: userID },
			});
			await chan.create();

			const msg = await chan.sendMessage({ text: uuidv4(), user_id: userID });
			await chan.sendMessage({ text: uuidv4(), user_id: userID });
			await chan.sendMessage({ text: uuidv4(), user_id: userID });
			await chan.sendMessage({ text: uuidv4(), user_id: userID });

			const response = await client.testPushSettings(userID, {
				messageID: msg.message.id,
			});
			expect(response.rendered_message).to.be.an('object');
			expect(response.rendered_message.type).to.be.eq('message.new');
			expect(response.rendered_message.id).to.be.eq(msg.message.id);
			expect(response).to.not.have.property('rendered_apn_template');
			expect(response).to.not.have.property('rendered_firebase_template');
		});

		it('Bad apn template error is ignored', async () => {
			await client.updateAppSettings({ apn_config });

			const response = await client.testPushSettings(userID, {
				apnTemplate: '{{}',
			});
			expect(response.rendered_message).to.be.an('object');
			expect(response.rendered_message.type).to.be.eq('message.new');
			expect(response).to.not.have.property('rendered_apn_template');
			expect(response).to.not.have.property('rendered_firebase_template');
			expect(response).to.not.have.property('general_errors');
		});

		it('Bad firebase template error is ignored', async () => {
			await client.updateAppSettings({ firebase_config });

			const response = await client.testPushSettings(userID, {
				firebaseTemplate: '{{}',
			});
			expect(response.rendered_message).to.be.an('object');
			expect(response.rendered_message.type).to.be.eq('message.new');
			expect(response).to.not.have.property('rendered_apn_template');
			expect(response).to.not.have.property('rendered_firebase_template');
			expect(response).to.not.have.property('general_errors');
		});

		it('Bad firebase data template error is ignored', async () => {
			await client.updateAppSettings({ firebase_config });

			const response = await client.testPushSettings(userID, {
				firebaseDataTemplate: '{{}',
			});
			expect(response.rendered_message).to.be.an('object');
			expect(response.rendered_message.type).to.be.eq('message.new');
			expect(response).to.not.have.property('rendered_apn_template');
			expect(response).to.not.have.property('rendered_firebase_template');
			expect(response).to.not.have.property('general_errors');
		});

		it('Good notification template', async () => {
			await client.updateAppSettings({ firebase_config });

			const response = await client.testPushSettings(userID, {
				messageID: 'very-fake-message',
				firebaseTemplate: '{"id": "{{message.id}}"}',
			});
			expect(response.rendered_message).to.be.an('object');
			expect(response.rendered_message.type).to.be.eq('message.new');
			expect(response.rendered_message.id).to.be.eq('very-fake-message');
			expect(response).to.not.have.property('rendered_apn_template');
			expect(response).to.not.have.property('rendered_firebase_template');
			expect(response).to.not.have.property('general_errors');
		});

		it('Good data template', async () => {
			await client.updateAppSettings({ firebase_config });

			const response = await client.testPushSettings(userID, {
				messageID: 'very-fake-message',
				firebaseDataTemplate: '{"id": "{{message.id}}"}',
			});

			expect(response.rendered_message).to.be.an('object');
			expect(response.rendered_message.type).to.be.eq('message.new');
			expect(response.rendered_message.id).to.be.eq('very-fake-message');
			expect(response).to.not.have.property('rendered_apn_template');
			expect(response).to.not.have.property('rendered_firebase_template');
			expect(response).to.not.have.property('general_errors');
		});

		it('All good', async () => {
			await client.updateAppSettings({ firebase_config });

			const response = await client.testPushSettings(userID, {
				firebaseTemplate: '{}',
				firebaseDataTemplate: '{}',
			});

			expect(response.rendered_message).to.be.an('object');
			expect(response.rendered_message.type).to.be.eq('message.new');
			expect(response).to.not.have.property('rendered_apn_template');
			expect(response).to.not.have.property('rendered_firebase_template');
			expect(response).to.not.have.property('general_errors');
		});

		it('Members in the template using helper', async () => {
			await client.updateAppSettings({ apn_config });

			const members = [
				{
					id: uuidv4(),
					name: uuidv4(),
				},
				{
					id: uuidv4(),
					name: uuidv4(),
				},
				{
					id: uuidv4(),
					name: uuidv4(),
				},
			];
			await client.upsertUsers(members);

			const chan = client.channel('messaging', uuidv4(), {
				members: [userID],
				created_by: { id: userID },
			});
			await chan.create();

			for (const m of members) {
				await chan.addMembers([m.id]);
			}

			const msg = await chan.sendMessage({ text: uuidv4(), user_id: userID });
			await chan.sendMessage({ text: uuidv4(), user_id: userID });
			await chan.sendMessage({ text: uuidv4(), user_id: userID });
			await chan.sendMessage({ text: uuidv4(), user_id: userID });

			const response = await client.testPushSettings(userID, {
				apnTemplate:
					'{"stuff": "{{implodeMembers otherMembers limit=2 suffixFmt="en %d anderen"}}: {{ message.text }}"}',
				messageID: msg.message.id,
			});

			expect(response.rendered_message).to.be.an('object');
			expect(response.rendered_message.type).to.be.eq('message.new');
			expect(response.rendered_message.id).to.be.eq(msg.message.id);
			expect(response).to.not.have.property('rendered_apn_template');
			expect(response).to.not.have.property('rendered_firebase_template');
			expect(response).to.not.have.property('general_errors');
		});

		it('Members in the template using handlebars', async () => {
			await client.updateAppSettings({ apn_config });

			const members = [
				{
					id: uuidv4(),
					name: uuidv4(),
				},
				{
					id: uuidv4(),
					name: uuidv4(),
				},
				{
					id: uuidv4(),
					name: uuidv4(),
				},
			];
			await client.upsertUsers(members);

			const chan = client.channel('messaging', uuidv4(), {
				members: [userID],
				created_by: { id: userID },
			});
			await chan.create();

			for (const m of members) {
				await chan.addMembers([m.id]);
			}

			const msg = await chan.sendMessage({ text: uuidv4(), user_id: userID });
			await chan.sendMessage({ text: uuidv4(), user_id: userID });
			await chan.sendMessage({ text: uuidv4(), user_id: userID });
			await chan.sendMessage({ text: uuidv4(), user_id: userID });

			const response = await client.testPushSettings(userID, {
				apnTemplate: `{"stuff": "
					{{~#each otherMembers}}
						{{#ifLte @index 0}}
							{{~this.name}}{{#ifLt @index 0 }}, {{/ifLt~}}
						{{~else if @last~}}
								{{{ " " }}} en {{remainder otherMembers 1}} anderen: {{message.text}}
						{{~/ifLte~}}
					{{/each~}}
					"}`,
				messageID: msg.message.id,
			});

			expect(response.rendered_message).to.be.an('object');
			expect(response.rendered_message.type).to.be.eq('message.new');
			expect(response.rendered_message.id).to.be.eq(msg.message.id);
			expect(response).to.not.have.property('rendered_apn_template');
			expect(response).to.not.have.property('rendered_firebase_template');
			expect(response).to.not.have.property('general_errors');
		});
	});

	describe('Set custom_action_handler_url', function () {
		let originalUrl;

		before(async () => {
			const response = await client.getAppSettings();
			originalUrl = response.app.custom_action_handler_url;
		});

		after(async () => {
			// Reset custom command endpoint url to original
			await client.updateAppSettings({
				custom_action_handler_url: originalUrl,
			});
		});

		it('Sets valid URL', async () => {
			// Set custom command endpoint url
			const custom_action_handler_url = 'http://example.com';
			await client.updateAppSettings({
				custom_action_handler_url,
			});

			const response = await client.getAppSettings();
			expect(response.app.custom_action_handler_url).to.be.eq(
				custom_action_handler_url,
			);
		});

		it('Rejects invalid URL', async () => {
			// reject invalid url
			await expectHTTPErrorCode(
				400,
				client.updateAppSettings({
					custom_action_handler_url: 'gibbrish',
				}),
			);
		});

		it('Accepts empty URL', async () => {
			// reset custom endpoint url
			await client.updateAppSettings({
				custom_action_handler_url: '',
			});

			const response = await client.getAppSettings();
			expect(response.app.custom_action_handler_url).to.be.eq('');
		});
	});
});

describe('Devices', function () {
	const client = getServerTestClient();
	const deviceId = uuidv4();

	describe('No user id provided', function () {
		it(`can't add devices`, async () => {
			await expectHTTPErrorCode(400, client.addDevice(deviceId, 'apn'));
		});
		it(`can't list devices`, async () => {
			await expectHTTPErrorCode(400, client.getDevices());
		});
	});

	describe('User id provided', function () {
		const users = [uuidv4(), uuidv4()];
		const devices = [uuidv4(), uuidv4()];

		it('can add devices to any user', async () => {
			for (let i = 0; i < users.length; i += 1) {
				await client.addDevice(devices[i], 'apn', users[i]);
			}
		});
		it('can fetch devices from any user', async () => {
			for (let i = 0; i < users.length; i += 1) {
				const result = await client.getDevices(users[i]);
				expect(result.devices.length).to.equal(1);
				expect(result.devices[0].id).to.equal(devices[i]);
				expect(result.devices[0].created_at).to.not.be.empty;
				expect(result.devices[0].disabled).to.equal(undefined);
				expect(result.devices[0].disabled_reason).to.equal(undefined);
			}
		});
		it('can delete any device', async () => {
			for (let i = 0; i < users.length; i += 1) {
				await client.removeDevice(devices[i], users[i]);
				const result = await client.getDevices(users[i]);
				expect(result.devices.length).to.equal(0);
			}
		});
	});

	it('user has custom data', async () => {
		const user = {
			id: uuidv4(),
			name: 'bob',
			hobby: 'painting',
		};
		await client.upsertUser(user);

		await client.addDevice(uuidv4(), 'apn', user.id);

		const result = await client.getDevices(user.id);
		expect(result.devices).to.have.length(1);
	});

	describe('device limit', function () {
		const maxDevices = 25;
		let user;

		beforeEach(async () => {
			user = {
				id: uuidv4(),
				name: 'bob',
				hobby: 'painting',
			};
			await client.upsertUser(user);
		});

		it('oldest device gets scrapped', async () => {
			for (const _ of Array(maxDevices).keys()) {
				await client.addDevice(uuidv4(), 'apn', user.id);
				await sleep(100);
			}
			const { devices } = await client.getDevices(user.id);
			expect(devices).to.have.length(maxDevices);

			const deviceIDS = devices.map((x) => x.id);

			const deviceID = uuidv4();
			await client.addDevice(deviceID, 'apn', user.id);

			deviceIDS.pop();
			deviceIDS.unshift(deviceID);

			let result = await client.getDevices(user.id);
			expect(result.devices).to.have.length(maxDevices);
			let newDeviceIDS = result.devices.map((x) => x.id);
			expect(newDeviceIDS).to.deep.equal(deviceIDS);

			result = await client.getDevices(user.id);
			expect(result.devices).to.have.length(maxDevices);
			newDeviceIDS = result.devices.map((x) => x.id);
			expect(newDeviceIDS).to.deep.equal(deviceIDS);
		});

		it('adding same device does not do anything', async () => {
			for (const _ of Array(maxDevices).keys()) {
				await client.addDevice(uuidv4(), 'apn', user.id);
				await sleep(100);
			}
			const { devices } = await client.getDevices(user.id);
			expect(devices).to.have.length(maxDevices);

			const deviceIDS = devices.map((x) => x.id);

			await client.addDevice(deviceIDS[5], 'apn', user.id);

			let result = await client.getDevices(user.id);
			expect(result.devices).to.have.length(maxDevices);
			let newDeviceIDS = result.devices.map((x) => x.id);
			expect(newDeviceIDS).to.deep.equal(deviceIDS);

			result = await client.getDevices(user.id);
			expect(result.devices).to.have.length(maxDevices);
			newDeviceIDS = result.devices.map((x) => x.id);
			expect(newDeviceIDS).to.deep.equal(deviceIDS);
		});
	});

	describe('Device caching', () => {
		it('Updating user on connect does not clear user devices', async () => {
			const userID = uuidv4();
			await client.upsertUser({ id: userID });
			const deviceID = uuidv4();

			const deviceLength = 2;
			for (let i = 0; i < deviceLength; i += 1) {
				await client.addDevice(`${deviceID}-${i}`, 'apn', userID);
			}

			let response = await client.getDevices(userID);
			expect(response.devices).to.have.length(deviceLength);

			await getTestClientForUser(userID);

			response = await client.getDevices(userID);
			expect(response.devices).to.have.length(deviceLength);
		});
	});

	describe('Device invalidation', function () {
		let userID;
		let deviceID;
		const push_config = { version: 'v1' };
		const apn_config = {
			auth_key: fs.readFileSync(
				'./test/integration/push_test/push-test-auth-key.p8',
				'utf-8',
			),
			key_id: 'whatever',
			team_id: 'stream',
			bundle_id: 'bundle',
			auth_type: 'token',
		};
		const firebase_config = {
			server_key:
				'AAAAyMwm738:APA91bEpRfUKal8ZeVMbpe8eLyo6T1LK7IhMCETwEOrXoPXFTHHsu7JGQVDElTgVyboNhNmoPoAjQxfRWOR6NOQm5eo7cLA5Uf-PB5qRIGDdl62dIrDkTxMv7UjoGvNDYzr4EFFfoE2u',
		};

		beforeEach(async () => {
			userID = uuidv4();
			await client.upsertUser({ id: userID });

			deviceID = uuidv4();
			await client.updateAppSettings({
				push_config,
				apn_config,
				firebase_config,
			});
			await sleep(100);
		});

		it('changing apn notification template does not invalidate device', async () => {
			await client.addDevice(deviceID, 'apn', userID);
			await client.updateAppSettings({
				apn_config: {
					notification_template: '{ "key": {{ foo }} }',
				},
			});
			const { devices } = await client.getDevices(userID);
			expect(devices).to.have.length(1);
		});

		it('changing firebase notification template does not invalidate device', async () => {
			await client.addDevice(deviceID, 'firebase', userID);
			await client.updateAppSettings({
				firebase_config: {
					notification_template: '{ "key": {{ foo }} }',
				},
			});
			const { devices } = await client.getDevices(userID);
			expect(devices).to.have.length(1);
		});

		it('changing firebase data template does not invalidate device', async () => {
			await client.addDevice(deviceID, 'firebase', userID);
			await client.updateAppSettings({
				firebase_config: {
					data_template: '{ "key": {{ foo }} }',
				},
			});
			const { devices } = await client.getDevices(userID);
			expect(devices).to.have.length(1);
		});

		it('changing apn config does not invalidates device', async () => {
			await client.addDevice(deviceID, 'apn', userID);
			await client.updateAppSettings({
				apn_config: {
					team_id: 'A TEAM',
				},
			});
			const { devices } = await client.getDevices(userID);
			expect(devices).to.have.length(1);
		});

		it('disabling apn config doesnt skip apn devices', async () => {
			await client.updateAppSettings({
				apn_config: {
					disabled: true,
				},
			});
			await client.addDevice(deviceID, 'apn', userID);
			const { devices } = await client.getDevices(userID);
			expect(devices).to.have.length(1);
		});

		it('no-op update does not invalidate device', async () => {
			await client.addDevice(deviceID, 'apn', userID);
			await client.updateAppSettings({
				apn_config: {
					team_id: apn_config.team_id,
				},
			});
			const { devices } = await client.getDevices(userID);
			expect(devices).to.have.length(1);
		});

		it('changing apn config and notification template doesnt invalidate device', async () => {
			await client.addDevice(deviceID, 'apn', userID);
			await client.updateAppSettings({
				apn_config: {
					team_id: 'A TEAM',
					notification_template: '{ "key": {{ foo }} }',
				},
			});
			const { devices } = await client.getDevices(userID);
			expect(devices).to.have.length(1);
		});

		it('re-adding device after config change does not error', async () => {
			await client.addDevice(deviceID, 'apn', userID);
			await client.updateAppSettings({
				apn_config: {
					team_id: 'A TEAM',
				},
			});
			await client.addDevice(deviceID, 'apn', userID);
			const { devices } = await client.getDevices(userID);
			expect(devices).to.have.length(1);
		});

		it('adding same device twice does not error', async () => {
			await client.addDevice(deviceID, 'apn', userID);
			await client.updateAppSettings({
				apn_config: {
					team_id: 'A TEAM',
				},
			});
			await client.addDevice(deviceID, 'apn', userID);
			await client.addDevice(deviceID, 'apn', userID);
			const { devices } = await client.getDevices(userID);
			expect(devices).to.have.length(1);
		});

		it('changing apn config doesnt invalidate device', async () => {
			await client.addDevice(deviceID, 'apn', userID);
			await client.updateAppSettings({
				apn_config: {
					team_id: 'A TEAM',
				},
			});
			await client.removeDevice(deviceID, userID);
		});

		it('changing push version doesnt invalidate device', async () => {
			await client.addDevice(deviceID, 'firebase', userID);
			await client.updateAppSettings({
				push_config: { version: 'v2' },
				firebase_config: {
					credentials_json: fs.readFileSync(
						'./test/integration/push_test/push-test-credentials.json',
						'utf-8',
					),
				},
			});
			await client.removeDevice(deviceID, userID);
		});
	});
});

describe('Moderation', function () {
	const srvClient = getTestClient(true);
	const [srcUser, targetUser] = [uuidv4(), uuidv4()];

	before(async () => {
		await createUsers([srcUser, targetUser]);
	});

	describe('Mutes', function () {
		it('source user not set', async () => {
			await expectHTTPErrorCode(400, srvClient.muteUser(targetUser));
		});
		it('source user set', async () => {
			const data = await srvClient.muteUser(targetUser, srcUser);
			expect(data.mute.user.id).to.equal(srcUser);
			expect(data.mute.target.id).to.equal(targetUser);

			const client = getTestClient(false);
			const connectResponse = await client.connectUser(
				{ id: srcUser },
				createUserToken(srcUser),
			);
			expect(connectResponse.me.mutes.length).to.equal(1);
			expect(connectResponse.me.mutes[0].target.id).to.equal(targetUser);
		});
	});

	describe('Unmutes', function () {
		it('source user not set', async () => {
			await expectHTTPErrorCode(400, srvClient.unmuteUser(targetUser));
		});
		it('source user set', async () => {
			await srvClient.unmuteUser(targetUser, srcUser);

			const client = getTestClient(false);
			const connectResponse = await client.connectUser(
				{ id: srcUser },
				createUserToken(srcUser),
			);
			expect(connectResponse.me.mutes.length).to.equal(0);
		});
	});
});

describe('Import via Webhook compat', function () {
	// based on the use case that you are importing data to stream via
	// a webhook integration...
	const srvClient = getTestClient(true);
	const userID = uuidv4();
	let userClient;
	const channelID = uuidv4();
	const created_by = { id: uuidv4() };
	before(async () => {
		userClient = await getTestClientForUser(userID);
	});

	it('Created At shouldnt work', async () => {
		const channel = srvClient.channel('messaging', channelID, { created_by });
		await channel.create();
		const response = channel.sendMessage({
			text: 'an old message',
			created_at: '2017-04-08T17:36:10.540Z',
			user: created_by,
		});
		await expect(response).to.be.rejectedWith(
			'StreamChat error code 4: SendMessage failed with error: "message.created_at is a reserved field"',
		);
	});

	it('Updated At shouldnt work', async () => {
		const channel = srvClient.channel('messaging', channelID, { created_by });
		await channel.create();
		const response = channel.sendMessage({
			text: 'an old message',
			updated_at: '2017-04-08T17:36:10.540Z',
			user: created_by,
		});
		await expect(response).to.be.rejectedWith(
			'StreamChat error code 4: SendMessage failed with error: "message.updated_at is a reserved field"',
		);
	});

	it('HTML should work', async () => {
		const channel = srvClient.channel('messaging', channelID, { created_by });
		await channel.create();
		const html = 'search with <a href="https://google.com/">google</a>';
		const response = await channel.sendMessage({
			html,
			user: created_by,
		});
		expect(response.message.html).to.equal(html);
	});

	it('clientside HTML should raise an error', async () => {
		const userID = uuidv4();
		const userClient = await getTestClientForUser(userID);
		const channel = userClient.channel('livestream', channelID);
		await channel.create();
		const html = 'search with <a href="https://google.com/">google</a>';
		const sendPromise = channel.sendMessage({
			html,
			user: created_by,
		});
		expect(sendPromise).to.be.rejectedWith('message.html');
	});

	it('Client side should also raise an error', async () => {
		const channel = userClient.channel('livestream', channelID);
		await channel.create();
		const responsePromise = channel.sendMessage({
			text: 'an old message',
			created_at: '2017-04-08T17:36:10.540Z',
		});
		await expect(responsePromise).to.be.rejectedWith(
			'StreamChat error code 4: SendMessage failed with error: "message.created_at is a reserved field"',
		);
	});

	it('Mark Read should fail without a user', async () => {
		const channel = srvClient.channel('messaging', channelID, { created_by });
		await channel.create();
		const responsePromise = channel.markRead();
		await expect(responsePromise).to.be.rejectedWith(
			'StreamChat error code 4: MarkRead failed with error: "either user or user_id must be provided when using server side auth."',
		);
	});

	it('Mark Read should work server side', async () => {
		const channel = srvClient.channel('messaging', channelID, { created_by });
		await channel.create();
		await channel.markRead({ user: { id: userID } });
	});

	it('Mark Read should should fail server side if the provided user doesnt exists', async () => {
		const channel = srvClient.channel('messaging', channelID, { created_by });
		await channel.create();
		const nonExistingUser = uuidv4();
		const response = channel.markRead({ user: { id: nonExistingUser } });
		await expect(response).to.be.rejectedWith(
			`the user ${nonExistingUser} does not exist`,
		);
	});

	it('Mark Read server side specific message', async () => {
		const userID = `a-${uuidv4()}`;
		const userID2 = `b-${uuidv4()}`;
		await createUsers([userID, userID2]);
		const channelID = uuidv4();
		const channel = srvClient.channel('messaging', channelID, {
			created_by,
			members: [userID, userID2],
		});
		await channel.create();
		const response1 = await channel.sendMessage({ text: '1', user: created_by });
		await channel.sendMessage({ text: '2', user: created_by });
		const userClientBeforeMarkRead = await getTestClientForUser(userID);
		expect(userClientBeforeMarkRead.health.me.total_unread_count).to.equal(2);

		let userClient2 = await getTestClientForUser(userID2);
		let userChannel2 = userClient2.channel('messaging', channelID);
		await userChannel2.watch();
		expect(userChannel2.countUnread()).to.equal(2);

		// user 2 unread count should be 0 since we marked all as read.
		await channel.markRead({ user: { id: userID2 } });
		userChannel2 = userClient2.channel('messaging', channelID);
		userClient2 = await getTestClientForUser(userID2);
		expect(userClient2.health.me.total_unread_count).to.equal(0);
		const unread2 = userChannel2.countUnread();
		expect(unread2).to.equal(0);

		// user 1 unread count should be 1
		await channel.markRead({
			user: { id: userID },
			message_id: response1.message.id,
		});

		const userClient = await getTestClientForUser(userID);
		const userChannel = userClient.channel('messaging', channelID);
		const r = await userChannel.watch();
		const unread = userChannel.countUnread();
		expect(userClient.health.me.total_unread_count).to.equal(1);
		expect(unread).to.equal(1);
	});
});

describe('User management', function () {
	const srvClient = getTestClient(true);
	const userClient = getTestClient(false);
	it('Admin with extra fields', async () => {
		// verify we correctly store user information
		const userID = uuidv4();
		const user = {
			id: userID,
			name: 'jelte',
			role: 'admin',
		};
		const response = await srvClient.upsertUser(user);
		const compareUser = (userResponse, online) => {
			const expectedData = { role: 'user', ...user };
			expect(userResponse).to.contains(expectedData);
			expect(userResponse.online).to.equal(online);
			expect(userResponse.created_at).to.be.ok;
			expect(userResponse.updated_at).to.be.ok;
			expect(userResponse.created_at).to.not.equal('0001-01-01T00:00:00Z');
			expect(userResponse.updated_at).to.not.equal('0001-01-01T00:00:00Z');
			expect(userResponse.created_at.substr(-1)).to.equal('Z');
			expect(userResponse.updated_at.substr(-1)).to.equal('Z');
		};
		compareUser(response.users[userID], false);

		const channelID = uuidv4();

		userClient.connectUser(user, createUserToken(userID));
		const channel = userClient.channel('livestream', channelID);
		await channel.watch();

		// make an API call so the data is sent over
		const text = 'Jelte says hi!';
		const data = await channel.sendMessage({ text });

		// verify the user information is correct
		compareUser(data.message.user, true);
		expect(data.message.text).to.equal(text);
	});
});

describe('Custom Commands', function () {
	const client = getTestClient(true);
	const newName = uuidv4(),
		newDesc = 'My amazing custom command',
		newArgs = '[@username] [greeting]',
		newSet = 'new_set';

	let updatedCommand;

	it('Should fail on empty name', async () => {
		await expectHTTPErrorCode(
			400,
			client.createCommand({
				name: '',
				description: newDesc,
				args: newArgs,
				set: newSet,
			}),
		);
	});

	it('Should fail on invalid name with spaces', async () => {
		await expectHTTPErrorCode(
			400,
			client.createCommand({
				name: 'invalid name',
				description: newDesc,
				args: newArgs,
				set: newSet,
			}),
		);
	});

	it('Should fail on empty args', async () => {
		await expectHTTPErrorCode(
			400,
			client.createCommand({
				name: 'invalid name',
				description: newDesc,
				args: '',
				set: newSet,
			}),
		);
	});

	it('Should fail on empty description', async () => {
		await expectHTTPErrorCode(
			400,
			client.createCommand({
				name: 'invalid name',
				description: '',
				args: newArgs,
				set: newSet,
			}),
		);
	});

	it('Should fail on empty set', async () => {
		await expectHTTPErrorCode(
			400,
			client.createCommand({
				name: 'invalid name',
				description: newDesc,
				args: newArgs,
				set: '',
			}),
		);
	});

	it('Should fail on reserved name', async () => {
		await expectHTTPErrorCode(
			400,
			client.createCommand({
				name: 'giphy',
				description: newDesc,
				args: newArgs,
				set: newSet,
			}),
		);
	});

	it('Should create a new command', async () => {
		let response = await client.createCommand({
			name: newName,
			description: newDesc,
			args: newArgs,
			set: newSet,
		});
		expect(response.command.name).to.equal(newName);
		expect(response.command.description).to.equal(newDesc);
		expect(response.command.args).to.equal(newArgs);
		expect(response.command.set).to.equal('new_set');
		expect(response.command.created_at).to.not.equal('0001-01-01T00:00:00Z');
		expect(response.command.updated_at).to.not.equal('0001-01-01T00:00:00Z');
		await sleep(1000);
	});

	it('Should retrieve command', async () => {
		let response = await client.getCommand(newName);
		expect(response.name).to.equal(newName);
		expect(response.description).to.equal(newDesc);
		expect(response.args).to.equal(newArgs);
		expect(response.set).to.equal('new_set');
		expect(response.created_at).to.not.equal('0001-01-01T00:00:00Z');
		expect(response.updated_at).to.not.equal('0001-01-01T00:00:00Z');
		await sleep(1000);
	});

	it('Should fail non-existing get command', async () => {
		await expectHTTPErrorCode(404, client.getCommand('non-existent'));
	});

	it('Should update command', async () => {
		let response = await client.updateCommand(newName, {
			name: newName,
			description: 'updated description',
			args: 'updated args',
			set: 'updated_set',
		});
		updatedCommand = response.command;
		expect(updatedCommand.name).to.equal(newName);
		expect(updatedCommand.description).to.equal('updated description');
		expect(updatedCommand.args).to.equal('updated args');
		expect(updatedCommand.set).to.equal('updated_set');
		await sleep(1000);
	});

	it('Should ignore AppPK on update command', async () => {
		let response = await client.updateCommand(newName, {
			name: newName,
			description: 'updated description',
			args: 'updated args',
			set: 'updated_set',
			app_pk: 0,
		});
		updatedCommand = response.command;
		expect(updatedCommand.app_pk).to.not.equal(0);
		expect(updatedCommand.name).to.equal(newName);
		expect(updatedCommand.description).to.equal('updated description');
		expect(updatedCommand.args).to.equal('updated args');
		expect(updatedCommand.set).to.equal('updated_set');
		await sleep(1000);
	});

	it('Should fail non-existing update command', async () => {
		await expectHTTPErrorCode(
			404,
			client.updateCommand('non-existent', {
				name: 'something-else',
				description: 'updated description',
				args: 'updated args',
				set: 'updated_set',
			}),
		);
	});

	it('Should ignore name on update command', async () => {
		let response = await client.updateCommand(newName, {
			name: 'giphy',
			description: 'updated description',
			args: 'updated args',
			set: 'updated_set',
		});
		updatedCommand = response.command;
		expect(updatedCommand.name).to.equal(newName);
		expect(updatedCommand.description).to.equal('updated description');
		expect(updatedCommand.args).to.equal('updated args');
		expect(updatedCommand.set).to.equal('updated_set');
		await sleep(1000);
	});

	it('Should list commands', async () => {
		let response = await client.listCommands();
		expect(response.commands).to.not.be.empty;
		await sleep(1000);
	});

	it('Should delete command', async () => {
		let response = await client.deleteCommand(newName);
		expect(response.name).to.equal(newName);
		await sleep(1000);
	});

	it('Should fail non-existing delete command', async () => {
		await expectHTTPErrorCode(404, client.deleteCommand('non-existent'));
	});

	it('Should fail delete command if command is in use', async () => {
		await client.createCommand({
			name: newName,
			description: newDesc,
			args: newArgs,
			set: newSet,
		});
		await client.createChannelType({
			name: newName,
			commands: [newName],
		});

		await expectHTTPErrorCode(400, client.deleteCommand(newName));

		await client.deleteChannelType(newName);
		client.deleteCommand(newName);
	});
});

describe('Channel types', function () {
	const client = getTestClient(true);
	const newType = uuidv4();
	let newChannelTypeCustomCmd;

	describe('Creating channel types', function () {
		let newChannelType;

		it('should work fine', async () => {
			newChannelType = await client.createChannelType({
				name: newType,
				commands: ['all'],
			});
			await sleep(1000);
		});

		it('should have the right defaults and name', function () {
			const expectedData = {
				automod: 'disabled',
				automod_behavior: 'flag',
				commands: ['giphy', 'flag', 'ban', 'unban', 'mute', 'unmute', 'excuse'],
				connect_events: true,
				max_message_length: 5000,
				message_retention: 'infinite',
				mutes: true,
				uploads: true,
				name: `${newType}`,
				reactions: true,
				replies: true,
				search: true,
				read_events: true,
				typing_events: true,
			};
			expect(newChannelType).like(expectedData);
		});

		it('should have the default permissions', function () {
			expect(newChannelType.permissions).to.have.length(7);
			expect(newChannelType.permissions).to.be.sortedBy('priority', {
				descending: true,
			});
		});

		it('should fail to create an already existing type', async () => {
			await expectHTTPErrorCode(400, client.createChannelType({ name: newType }));
		});

		it('permissions should be created', async () => {
			const name = uuidv4();
			const permissions = [
				new Permission(uuidv4(), 20, AnyResource, AnyRole, false, Allow),
				new Permission(uuidv4(), 32, AnyResource, AnyRole, false, Allow),
				new Permission(uuidv4(), 2, AnyResource, AnyRole, false, Allow),
			];
			const newChanType = await client.createChannelType({
				name,
				permissions,
				commands: ['all'],
			});
			await sleep(500);

			permissions.sort((lhs, rhs) => (lhs.priority > rhs.priority ? -1 : 1));

			const expectedData = {
				automod: 'disabled',
				automod_behavior: 'flag',
				commands: ['giphy', 'flag', 'ban', 'unban', 'mute', 'unmute', 'excuse'],
				connect_events: true,
				max_message_length: 5000,
				message_retention: 'infinite',
				mutes: true,
				uploads: true,
				name: `${name}`,
				reactions: true,
				replies: true,
				search: true,
				read_events: true,
				typing_events: true,
				permissions,
			};
			expect(newChanType).like(expectedData);
			expect(newChanType.permissions).to.be.sortedBy('priority', {
				descending: true,
			});
		});

		it('missing role should be handled correctly', async () => {
			const name = uuidv4();
			const permissions = [
				new Permission(uuidv4(), 20, AnyResource, null, false, Allow),
				new Permission(uuidv4(), 32, AnyResource, null, false, Allow),
				new Permission(uuidv4(), 2, AnyResource, null, false, Allow),
			];
			const newChanType = await client.createChannelType({
				name,
				permissions,
				commands: ['all'],
			});
			await sleep(500);

			permissions.forEach(function (p) {
				p.roles = [];
			});

			permissions.sort((lhs, rhs) => (lhs.priority > rhs.priority ? -1 : 1));

			const expectedData = {
				automod: 'disabled',
				automod_behavior: 'flag',
				commands: ['giphy', 'flag', 'ban', 'unban', 'mute', 'unmute', 'excuse'],
				connect_events: true,
				max_message_length: 5000,
				message_retention: 'infinite',
				mutes: true,
				name: `${name}`,
				reactions: true,
				replies: true,
				search: true,
				read_events: true,
				typing_events: true,
				permissions,
			};
			expect(newChanType).like(expectedData);
			expect(newChanType.permissions).to.be.sortedBy('priority', {
				descending: true,
			});
		});
	});

	describe('Creating channel types with custom command', function () {
		it('should work fine', async () => {
			newChannelTypeCustomCmd = await client.createChannelType({
				name: uuidv4(),
				commands: ['excuse', 'fun_set', 'ban'],
			});
			await sleep(1000);
		});

		it('should have the right commands', function () {
			expect(newChannelTypeCustomCmd.commands).like(['excuse', 'giphy', 'ban']);
		});

		it('Should fail non-existing command', async () => {
			await expectHTTPErrorCode(
				400,
				client.createChannelType({
					name: uuidv4(),
					commands: ['xyz'],
				}),
			);
		});
	});

	describe('Updating channel types', function () {
		let channelType, channelTypeName;
		let channelPermissions;

		it('default is fine', async () => {
			const response = await client.updateChannelType('messaging', {
				mutes: false,
				reactions: false,
				replies: true,
			});

			// as changed
			expect(response.reactions).to.have.false;
			expect(response.mutes).to.have.false;
			expect(response.replies).to.have.true;

			// shouldn't change from default
			expect(response.search).to.have.true;
			expect(response.max_message_length).to.be.eq(5000);

			// revert the config and check if correctly reverted
			const reverted = await client.updateChannelType('messaging', {
				mutes: true,
				reactions: true,
			});

			expect(reverted.reactions).to.have.true;
			expect(reverted.mutes).to.have.true;
			expect(reverted.replies).to.have.true;
		});

		it('updating a not existing one should fail', async () => {
			await expectHTTPErrorCode(404, client.updateChannelType(`${uuidv4()}`, {}));
		});

		it('create a new one with defaults', async () => {
			channelTypeName = uuidv4();
			channelType = await client.createChannelType({
				name: channelTypeName,
				commands: ['ban'],
				roles: {
					user: ['Create Channel', 'Read Any Channel'],
				},
			});
			channelPermissions = channelType.permissions;
			expect(channelPermissions).to.have.length(7);
			expect(channelPermissions).to.be.sortedBy('priority', {
				descending: true,
			});
			await sleep(1000);
		});

		it('defaults should be there via channel.watch', async () => {
			const client = await getTestClientForUser('tommaso');
			const data = await client.channel(channelTypeName, 'test').watch();
			const expectedData = {
				automod: 'disabled',
				automod_behavior: 'flag',
				commands: [
					{
						args: '[@username] [text]',
						description: 'Ban a user',
						name: 'ban',
						set: 'moderation_set',
					},
				],
				connect_events: true,
				max_message_length: 5000,
				message_retention: 'infinite',
				mutes: true,
				uploads: true,
				name: `${channelTypeName}`,
				reactions: true,
				replies: true,
				search: true,
				read_events: true,
				typing_events: true,
			};
			expect(data.channel.config).like(expectedData);
		});

		it('flip replies config to false', async () => {
			const response = await client.updateChannelType(channelTypeName, {
				replies: false,
			});
			expect(response.replies).to.be.false;
			await sleep(1000);
		});

		it('flip url_enrichment config to false', async () => {
			const response = await client.updateChannelType(channelTypeName, {
				url_enrichment: false,
			});
			expect(response.url_enrichment).to.be.false;
			await sleep(1000);
		});

		it('new configs should be returned from channel.query', async () => {
			const client = await getTestClientForUser('tommaso');
			const data = await client.channel(channelTypeName, 'test').watch();
			const expectedData = {
				automod: 'disabled',
				automod_behavior: 'flag',
				commands: [
					{
						args: '[@username] [text]',
						description: 'Ban a user',
						name: 'ban',
						set: 'moderation_set',
					},
				],
				connect_events: true,
				max_message_length: 5000,
				message_retention: 'infinite',
				mutes: true,
				uploads: true,
				name: `${channelTypeName}`,
				reactions: true,
				replies: false,
				search: true,
				read_events: true,
				typing_events: true,
			};
			expect(data.channel.config).like(expectedData);
		});

		it('changing permissions', async () => {
			const response = await client.updateChannelType(channelTypeName, {
				permissions: [
					AllowAll,
					DenyAll,
					new Permission(uuidv4(), 20, AnyResource, AnyRole, false, Allow),
					new Permission(uuidv4(), 32, AnyResource, AnyRole, false, Allow),
					new Permission(uuidv4(), 2, AnyResource, AnyRole, false, Allow),
				],
			});
			expect(response.permissions).to.have.length(5);
			expect(response.permissions).to.be.sortedBy('priority', {
				descending: true,
			});
		});

		it('changing commands to a bad one', async () => {
			const p = client.updateChannelType(channelTypeName, {
				commands: ['bogus'],
			});
			await expectHTTPErrorCode(400, p);
		});

		it('changing commands to all', async () => {
			const response = await client.updateChannelType(channelTypeName, {
				commands: ['all'],
			});
			expect(response.commands).to.have.length(7);
		});

		it('changing commands to fun_set', async () => {
			const response = await client.updateChannelType(channelTypeName, {
				commands: ['fun_set'],
			});
			expect(response.commands).to.have.length(1);
		});

		it('changing the name should fail', async () => {
			const p = client.updateChannelType(channelTypeName, {
				name: 'something-else',
			});
			await expectHTTPErrorCode(400, p);
		});

		it('changing the updated_at field should fail', async () => {
			const p = client.updateChannelType(channelTypeName, {
				updated_at: 'something-else',
			});
			await expectHTTPErrorCode(400, p);
		});
	});

	describe('Updating channel types with custom command', function () {
		it('default is fine', async () => {
			const response = await client.updateChannelType(
				newChannelTypeCustomCmd.name,
				{
					commands: ['excuse', 'fun_set', 'ban'],
				},
			);

			expect(response.commands).like(['excuse', 'giphy', 'ban']);
		});

		it('updating to a non existing command should fail', async () => {
			await expectHTTPErrorCode(
				400,
				client.updateChannelType(newChannelTypeCustomCmd.name, {
					commands: ['xyz'],
				}),
			);
		});
	});

	describe('Deleting channel types', function () {
		const name = uuidv4();

		it('should fail to delete a missing type', async () => {
			await expectHTTPErrorCode(404, client.deleteChannelType(uuidv4()));
		});

		it('should work fine', async () => {
			await client.createChannelType({ name });
			await sleep(1000);
			await client.deleteChannelType(name);
			await sleep(1000);
		});

		it('should fail to delete a deleted type', async () => {
			await expectHTTPErrorCode(404, client.deleteChannelType(name));
		});

		describe('deleting a channel type with active channels should fail', function () {
			const typeName = uuidv4();

			it('create a new type', async () => {
				await client.createChannelType({
					name: typeName,
					roles: {
						user: ['Create Channel', 'Read Any Channel'],
					},
				});
				await sleep(1000);
			});

			it('create a channel of the new type', async () => {
				const tClient = await getTestClientForUser('tommaso');
				await tClient.channel(typeName, 'general').watch();
			});

			it('create a channel of the new type', async () => {
				await expectHTTPErrorCode(400, client.deleteChannelType(typeName));
			});
		});
	});

	describe('Get channel type', function () {
		let channelData;

		it('should fail to get a missing type', async () => {
			await expectHTTPErrorCode(404, client.getChannelType(uuidv4()));
		});

		it('should return messaging type correctly', async () => {
			channelData = await client.getChannelType('messaging');
		});

		it('should have default permissions', function () {
			expect(channelData.permissions).to.have.length(7);
			expect(channelData.permissions).to.be.sortedBy('priority', {
				descending: true,
			});
			expect(channelData.permissions[0].action).to.eq('Allow');
			expect(channelData.permissions[1].action).to.eq('Deny');
		});

		it('should return configs correctly', function () {
			const expectedData = {
				automod: 'disabled',
				automod_behavior: 'flag',
				commands: [
					{
						args: '[text]',
						description: 'Post a random gif to the channel',
						name: 'giphy',
						set: 'fun_set',
					},
					{
						args: '[@username]',
						description: 'Mute a user',
						name: 'mute',
						set: 'moderation_set',
					},
					{
						args: '[@username]',
						description: 'Unmute a user',
						name: 'unmute',
						set: 'moderation_set',
					},
				],
				connect_events: true,
				max_message_length: 5000,
				message_retention: 'infinite',
				mutes: true,
				uploads: true,
				name: 'messaging',
				reactions: true,
				replies: true,
				search: true,
				read_events: true,
				typing_events: true,
				url_enrichment: true,
			};
			expect(channelData).like(expectedData);
		});
	});

	describe('List channel types', function () {
		let channelTypes;

		it('should return at least the defaults channel types', async () => {
			channelTypes = await client.listChannelTypes();
			expect(Object.keys(channelTypes.channel_types).length).to.gte(10);
		});

		it('default messaging channel type should have default permissions', function () {
			expect(channelTypes.channel_types.messaging.permissions).to.have.length(7);
			expect(channelTypes.channel_types.messaging.permissions).to.be.sortedBy(
				'priority',
				{
					descending: true,
				},
			);
		});

		it('should return configs correctly for channel type messaging', function () {
			const expectedData = {
				automod: 'disabled',
				commands: [
					{
						args: '[text]',
						description: 'Post a random gif to the channel',
						name: 'giphy',
						set: 'fun_set',
					},
					{
						args: '[@username]',
						description: 'Mute a user',
						name: 'mute',
						set: 'moderation_set',
					},
					{
						args: '[@username]',
						description: 'Unmute a user',
						name: 'unmute',
						set: 'moderation_set',
					},
				],
				connect_events: true,
				max_message_length: 5000,
				message_retention: 'infinite',
				mutes: true,
				uploads: true,
				name: 'messaging',
				reactions: true,
				replies: true,
				search: true,
				read_events: true,
				typing_events: true,
				url_enrichment: true,
			};
			expect(channelTypes.channel_types.messaging).like(expectedData);
		});
	});

	describe('Client-side validation', function () {
		let client2;

		before(async () => {
			client2 = await getTestClientForUser('tommaso');
		});

		it('should fail to create', async () => {
			await expectHTTPErrorCode(403, client2.createChannelType({ name: uuidv4() }));
		});

		it('should fail to delete', async () => {
			await expectHTTPErrorCode(403, client2.deleteChannelType('messaging'));
		});

		it('should fail to update', async () => {
			await expectHTTPErrorCode(403, client2.updateChannelType('messaging', {}));
		});
	});
});

describe('Unread counts are properly initialised', function () {
	const userCreatedByConnect = `connect-${uuidv4()}`;
	const userCreatedByUpdateUsers = `createdBy-${uuidv4()}`;
	const userCreatedByCreateChannel = `channel-${uuidv4()}`;
	let serverSideClient;
	const channelID = `group-${uuidv4()}`;

	before(async () => {
		//create 3 user in 3 different ways
		//it is possible to create users by
		//   * client.connectUser
		//   * client.upsertUser
		//   * client.sendMessage/channel.create
		serverSideClient = getTestClient(true);
		await serverSideClient.upsertUser({ id: userCreatedByUpdateUsers });
		let channel = serverSideClient.channel('messaging', channelID, {
			created_by_id: userCreatedByCreateChannel,
		});
		await channel.create();
		await serverSideClient.connectUser({ id: userCreatedByConnect });
		serverSideClient = getTestClient(true);
		channel = serverSideClient.channel('messaging', channelID);
		await channel.addMembers([
			userCreatedByConnect,
			userCreatedByUpdateUsers,
			userCreatedByCreateChannel,
		]);
	});

	it('validate unread counts', async () => {
		//send a message with user created  by ws connect
		let client = await getTestClientForUser(userCreatedByConnect);
		const channel = client.channel('messaging', channelID);
		await channel.sendMessage({ text: 'hi' });
		//validate unread for user created by client.UpdateUser
		client = await getTestClientForUser(userCreatedByUpdateUsers);
		expect(client.health.me.total_unread_count).to.be.equal(1);
		expect(client.health.me.unread_channels).to.be.equal(1);
		await client.channel('messaging', channelID).sendMessage({ text: 'hello' });

		//validate unread for user created by channel.created_by_id
		client = await getTestClientForUser(userCreatedByCreateChannel);
		expect(client.health.me.total_unread_count).to.be.equal(2);
		expect(client.health.me.unread_channels).to.be.equal(1);

		//validate unread for user created by ws connect
		client = await getTestClientForUser(userCreatedByConnect);
		expect(client.health.me.total_unread_count).to.be.equal(1);
		expect(client.health.me.unread_channels).to.be.equal(1);
	});
});
