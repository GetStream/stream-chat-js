import { getTestClient, createUsers, createUserToken } from './utils';
import { assertHTTPErrorCode } from './utils';
import { getTestClientForUser } from './utils';
import { AllowAll, DenyAll } from '../src/permissions';
import uuidv4 from 'uuid/v4';
import chai from 'chai';
import fs from 'fs';
import chaiAsPromised from 'chai-as-promised';

chai.use(require('chai-like'));
chai.use(chaiAsPromised);

const expect = chai.expect;

describe('Query Channels', function() {
	const client = getTestClient(true);

	before(async () => {
		for (let i = 0; i < 10; i++) {
			await client
				.channel('team', uuidv4(), { created_by: { id: 'tommaso' } })
				.create();
		}
	});

	it('watch should error', function(done) {
		client
			.queryChannels({}, {}, { watch: true, presence: false })
			.then(done)
			.catch(() => done());
	});

	it('presence should error', function(done) {
		client
			.queryChannels({}, {}, { watch: false, presence: true })
			.then(done)
			.catch(() => done());
	});

	it('state should work fine', async function() {
		const response = await client.queryChannels(
			{},
			{},
			{ watch: false, presence: false, state: true },
		);
		expect(response).to.have.length(10);
	});
});

describe('Managing users', function() {
	const client = getTestClient(true);
	const user = {
		id: uuidv4(),
	};

	it('edit user inserts if missing', async function() {
		await client.updateUser(user);
		const response = await client.queryUsers(
			{ id: user.id },
			{},
			{ presence: false },
		);
		expect(response.users[0].id).to.eql(user.id);
		expect(response.users[0].role).to.eql('user');
	});

	it('change user data', async function() {
		user.os = 'gnu/linux';
		await client.updateUser(user);
		const response = await client.queryUsers(
			{ id: user.id },
			{},
			{ presence: false },
		);
		expect(response.users[0].id).to.eql(user.id);
		expect(response.users[0].role).to.eql('user');
		expect(response.users[0].os).to.eql('gnu/linux');
	});

	it('change user role', async function() {
		user.role = 'admin';
		await client.updateUser(user);
		const response = await client.queryUsers(
			{ id: user.id },
			{},
			{ presence: false },
		);
		expect(response.users[0].id).to.eql(user.id);
		expect(response.users[0].role).to.eql('admin');
	});

	it('ban user', async function() {
		await client.banUser(user.id);
	});

	it('remove ban', async function() {
		await client.unbanUser(user.id);
	});
});

describe('App configs', function() {
	const client = getTestClient(true);
	const client2 = getTestClient(false);

	const bfadf = { id: 'guyon' };
	const bfadfToken =
		'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiZ3V5b24ifQ.c8ofzBnAuW1yVaznCDv0iGeoJQ-csme7kPpIMOjtkso';

	let secretChannel;

	before(async function() {
		secretChannel = await client
			.channel('messaging', 'secret-place', { created_by: { id: `${uuidv4()}` } })
			.create();
	});

	it('Empty request should not break', async function() {
		await client.updateAppSettings({});
	});

	it('Using a tampered token fails because of auth enabled', function(done) {
		client2
			.setUser(bfadf, bfadfToken)
			.then(() => {
				client2.disconnect();
				done('should have failed!');
			})
			.catch(() => {
				client2.disconnect();
				done();
			});
	});

	it('Using dev token fails because of auth enabled', function(done) {
		client2
			.setUser(bfadf, client2.devToken(bfadf.id))
			.then(() => {
				client2.disconnect();
				done('should have failed!');
			})
			.catch(e => {
				client2.disconnect();
				done();
			});
	});

	it('Disable auth checks', async function() {
		await client.updateAppSettings({
			disable_auth_checks: true,
		});
	});

	it('Using a tampered token does not fail because auth is disabled', function(done) {
		client2
			.setUser(bfadf, bfadfToken)
			.then(() => {
				done();
				client2.disconnect();
			})
			.catch(() => {
				done('should not have failed!');
			});
	});

	it('Using dev token does not fail because auth is disabled', function(done) {
		client2
			.setUser(bfadf, client2.devToken(bfadf.id))
			.then(() => {
				done();
				client2.disconnect();
			})
			.catch(() => {
				done('should not have failed!');
			});
	});

	it('Disable permission checks', async function() {
		await client.updateAppSettings({
			disable_permissions_checks: true,
		});
	});

	it('A user can do super stuff because permission checks are off', async function() {
		await client2.setUser(bfadf, bfadfToken);
		await client2.channel('messaging', 'secret-place').watch();
		client2.disconnect();
	});

	it('Re-enable permission checks', async function() {
		await client.updateAppSettings({
			disable_permissions_checks: false,
		});
	});

	it('A user cannot do super stuff because permission checks are back on', function(done) {
		getTestClientForUser(uuidv4()).then(client => {
			client
				.channel('messaging', 'secret-place')
				.watch()
				.then(() => done('should have failed'))
				.catch(() => done());
		});
	});

	it('Re-enable auth checks', async function() {
		await client.updateAppSettings({
			disable_auth_checks: false,
		});
	});

	describe('Push notifications', function() {
		describe('APN', function() {
			it('Adding bad apn certificate config', function(done) {
				client
					.updateAppSettings({
						apn_config: {
							auth_type: 'certificate',
							p12_cert: 'boogus',
						},
					})
					.then(() => done('should have failed'))
					.catch(() => done());
			});
			it('Adding good apn certificate config', function(done) {
				client
					.updateAppSettings({
						apn_config: {
							auth_type: 'certificate',
							p12_cert: fs.readFileSync(
								'./test/push_test/stream-push-test.p12',
							),
						},
					})
					.then(() => done())
					.catch(e => done(`should not have failed ${e}`));
			});
			it('Describe app settings', async function() {
				const response = await client.getAppSettings();
				expect(response.app).to.be.an('object');
				expect(response.app.push_notifications).to.be.an('object');
				delete response.app.push_notifications.apn.notification_template;
				expect(response.app.push_notifications.apn).to.eql({
					enabled: true,
					auth_type: 'certificate',
					bundle_id: 'stream-test',
					host: 'https://api.development.push.apple.com',
				});
			});
			it('Adding bad apn invalid template', function(done) {
				client
					.updateAppSettings({
						apn_config: {
							auth_type: 'certificate',
							p12_cert: fs.readFileSync(
								'./test/push_test/stream-push-test.p12',
							),
							notification_template: '{ {{ } }',
						},
					})
					.then(() => done('should have failed'))
					.catch(() => done());
			});
			it('Adding bad apn message is not a valid JSON', function(done) {
				client
					.updateAppSettings({
						apn_config: {
							auth_type: 'certificate',
							p12_cert: fs.readFileSync(
								'./test/push_test/stream-push-test.p12',
							),
							notification_template: '{{ message.id }}',
						},
					})
					.then(() => done('should have failed'))
					.catch(() => done());
			});
			it('Adding bad apn token', function(done) {
				client
					.updateAppSettings({
						apn_config: {
							auth_type: 'token',
							bundle_id: 'com.apple.test',
							auth_key: 'supersecret',
							key_id: 'keykey',
							team_id: 'sfd',
						},
					})
					.then(() => done('should have failed'))
					.catch(() => done());
			});
			it('Adding incomplete token data: no bundle_id', function(done) {
				client
					.updateAppSettings({
						apn_config: {
							auth_type: 'token',
							auth_key: fs.readFileSync(
								'./test/push_test/push-test-auth-key.p8',
								'utf-8',
							),
							key_id: 'keykey',
							team_id: 'sfd',
							bundle_id: '',
						},
					})
					.then(() => done('should have failed'))
					.catch(() => done());
			});
			it('Adding incomplete token data: no key_id', function(done) {
				client
					.updateAppSettings({
						apn_config: {
							auth_type: 'token',
							auth_key: fs.readFileSync(
								'./test/push_test/push-test-auth-key.p8',
								'utf-8',
							),
							key_id: '',
							bundle_id: 'bundly',
							team_id: 'sfd',
						},
					})
					.then(() => done('should have failed'))
					.catch(() => done());
			});
			it('Adding incomplete token data: no team', function(done) {
				client
					.updateAppSettings({
						apn_config: {
							auth_type: 'token',
							auth_key: fs.readFileSync(
								'./test/push_test/push-test-auth-key.p8',
								'utf-8',
							),
							key_id: 'keykey',
							bundle_id: 'sfd',
							team_id: '',
						},
					})
					.then(() => done('should have failed'))
					.catch(() => done());
			});
			it('Adding good apn token', function(done) {
				client
					.updateAppSettings({
						apn_config: {
							auth_type: 'token',
							auth_key: fs.readFileSync(
								'./test/push_test/push-test-auth-key.p8',
								'utf-8',
							),
							key_id: 'keykey',
							bundle_id: 'com.apple.test',
							team_id: 'sfd',
						},
					})
					.then(() => done())
					.catch(e => done(`should not have failed ${e}`));
			});
			it('Describe app settings', async function() {
				const response = await client.getAppSettings();
				expect(response.app).to.be.an('object');
				expect(response.app.push_notifications).to.be.an('object');
				delete response.app.push_notifications.apn.notification_template;
				expect(response.app.push_notifications.apn).to.eql({
					enabled: true,
					auth_type: 'token',
					bundle_id: 'com.apple.test',
					host: 'https://api.push.apple.com',
					team_id: 'sfd',
					key_id: 'keykey',
				});
			});
			it('Adding good apn token in dev mode', function(done) {
				client
					.updateAppSettings({
						apn_config: {
							auth_type: 'token',
							auth_key: fs.readFileSync(
								'./test/push_test/push-test-auth-key.p8',
								'utf-8',
							),
							key_id: 'keykey',
							bundle_id: 'com.apple.test',
							team_id: 'sfd',
							development: true,
						},
					})
					.then(() => done())
					.catch(() => done('should not have failed'));
			});
			it('Describe app settings', async function() {
				const response = await client.getAppSettings();
				expect(response.app).to.be.an('object');
				expect(response.app.push_notifications).to.be.an('object');
				delete response.app.push_notifications.apn.notification_template;
				expect(response.app.push_notifications.apn).to.eql({
					enabled: true,
					auth_type: 'token',
					bundle_id: 'com.apple.test',
					team_id: 'sfd',
					key_id: 'keykey',
					host: 'https://api.development.push.apple.com',
				});
			});
			it('Disable APN', function(done) {
				client
					.updateAppSettings({
						apn_config: {
							disabled: true,
						},
					})
					.then(() => done())
					.catch(e => done(`should not have failed ${e}`));
			});
			it('Describe app settings', async function() {
				const response = await client.getAppSettings();
				expect(response.app).to.be.an('object');
				expect(response.app.push_notifications).to.be.an('object');
				delete response.app.push_notifications.apn.notification_template;
				expect(response.app.push_notifications.apn).to.eql({
					enabled: false,
					host: 'https://api.push.apple.com',
				});
			});
		});
		describe('Firebase', function() {
			it('Adding bad template', function(done) {
				client
					.updateAppSettings({
						firebase_config: {
							notification_template: '{ {{ } }',
						},
					})
					.then(() => done('should have failed'))
					.catch(() => done());
			});
			it('Adding invalid json template', function(done) {
				client
					.updateAppSettings({
						apn_config: {
							notification_template: '{{ message.id }}',
						},
					})
					.then(() => done('should have failed'))
					.catch(() => done());
			});
			it('Adding invalid server key', function(done) {
				client
					.updateAppSettings({
						firebase_config: {
							api_key: 'asdasd',
							notification_template: '{ }',
						},
					})
					.then(() => done('should have failed'))
					.catch(() => done());
			});
			it('Adding good server key', function(done) {
				client
					.updateAppSettings({
						firebase_config: {
							api_key:
								'AAAAyMwm738:APA91bEpRfUKal8ZeVMbpe8eLyo6T1LK7IhMCETwEOrXoPXFTHHsu7JGQVDElTgVyboNhNmoPoAjQxfRWOR6NOQm5eo7cLA5Uf-PB5qRIGDdl62dIrDkTxMv7UjoGvNDYzr4EFFfoE2u',
							notification_template: '{ }',
						},
					})
					.then(() => done())
					.catch(() => done('should not have failed'));
			});
			it('Describe app settings', async function() {
				const response = await client.getAppSettings();
				expect(response.app).to.be.an('object');
				expect(response.app.push_notifications).to.be.an('object');
				delete response.app.push_notifications.firebase.notification_template;
				expect(response.app.push_notifications.firebase).to.eql({
					enabled: true,
				});
			});
			it('Disable firebase', function(done) {
				client
					.updateAppSettings({
						firebase_config: {
							disabled: true,
						},
					})
					.then(() => done())
					.catch(e => done(`should not have failed ${e}`));
			});
			it('Describe app settings', async function() {
				const response = await client.getAppSettings();
				expect(response.app).to.be.an('object');
				expect(response.app.push_notifications).to.be.an('object');
				delete response.app.push_notifications.firebase.notification_template;
				expect(response.app.push_notifications.firebase).to.eql({
					enabled: false,
				});
			});
		});
	});

	it('Using a tampered token fails because auth is back on', function(done) {
		client2
			.setUser(bfadf, bfadfToken)
			.then(() => {
				client2.disconnect();
				done('should have failed!');
			})
			.catch(() => {
				client2.disconnect();
				done();
			});
	});
});

describe('Devices', function() {
	const client = getTestClient(true);
	const deviceId = uuidv4();

	describe('No user id provided', function() {
		it(`can't add devices`, async function() {
			const p = client.addDevice(deviceId, 'apn');
			await expect(p).to.be.rejected;
		});
		it(`cant't list devices`, async function() {
			const p = client.getDevices();
			await expect(p).to.be.rejected;
		});
	});

	describe('User id provided', function() {
		const users = [uuidv4(), uuidv4()];
		const devices = [uuidv4(), uuidv4()];

		it('can add devices to any user', async function() {
			for (const i of Array(2).keys()) {
				await client.addDevice(devices[i], 'apn', users[i]);
			}
		});
		it('can fetch devices from any user', async function() {
			for (const i of Array(2).keys()) {
				const result = await client.getDevices(users[i]);
				expect(result.devices.length).to.equal(1);
				expect(result.devices[0].id).to.equal(devices[i]);
			}
		});
		it('can delete any device', async function() {
			await client.removeDevice(devices[1], users[1]);
			const result = await client.getDevices(devices[1], users[1]);
			expect(result.devices.length).to.equal(0);
		});
	});
});

describe('Moderation', function() {
	const srvClient = getTestClient(true);
	const [srcUser, targetUser] = [uuidv4(), uuidv4()];

	before(async function() {
		await createUsers([srcUser, targetUser]);
	});

	describe('Mutes', function() {
		it('source user not set', async function() {
			const p = srvClient.muteUser(targetUser);
			await expect(p).to.be.rejected;
		});
		it('source user set', async function() {
			const data = await srvClient.muteUser(targetUser, srcUser);
			expect(data.mute.user.id).to.equal(srcUser);
			expect(data.mute.target.id).to.equal(targetUser);

			const client = getTestClient(false);
			const connectResponse = await client.setUser(
				{ id: srcUser },
				createUserToken(srcUser),
			);
			expect(connectResponse.own_user.mutes.length).to.equal(1);
			expect(connectResponse.own_user.mutes[0].target.id).to.equal(targetUser);
		});
	});

	describe('Unmutes', function() {
		it('source user not set', async function() {
			const p = srvClient.unmuteUser(targetUser);
			await expect(p).to.be.rejected;
		});
		it('source user set', async function() {
			await srvClient.unmuteUser(targetUser, srcUser);

			const client = getTestClient(false);
			const connectResponse = await client.setUser(
				{ id: srcUser },
				createUserToken(srcUser),
			);
			expect(connectResponse.own_user.mutes.length).to.equal(0);
		});
	});
});

describe('User management', function() {
	const srvClient = getTestClient(true);
	const userClient = getTestClient(false);
	it('Admin with extra fields', async function() {
		// verify we correctly store user information
		const userID = uuidv4();
		const user = {
			id: userID,
			name: 'jelte',
			role: 'admin',
		};
		const response = await srvClient.updateUser(user);
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

		userClient.setUser(user, createUserToken(userID));
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

describe('Channel types', function() {
	const client = getTestClient(true);
	const newType = uuidv4();

	describe('Creating channel types', function() {
		let newChannelType;

		it('should work fine', function(done) {
			client
				.createChannelType({ name: newType, commands: ['all'] })
				.then(response => {
					newChannelType = response;
					done();
				})
				.catch(done);
		});

		it('should have the right defaults and name', function(done) {
			const expectedData = {
				automod: 'AI',
				commands: ['giphy', 'flag', 'ban', 'unban', 'mute', 'unmute'],
				connect_events: true,
				max_message_length: 5000,
				message_retention: 'infinite',
				mutes: true,
				name: `${newType}`,
				reactions: true,
				replies: true,
				search: false,
				read_events: true,
				typing_events: true,
			};
			expect(newChannelType).like(expectedData);
			done();
		});

		it('should have the default permissions', function(done) {
			expect(newChannelType.permissions).to.have.length(7);
			done();
		});

		it('should fail to create an already existing type', function(done) {
			const p = client.createChannelType({ name: newType });
			assertHTTPErrorCode(p, done, 400);
		});
	});

	describe('Updating channel types', function() {
		let channelType, channelTypeName;
		let channelPermissions;

		it('updating a not existing one should fail', function(done) {
			const p = client.updateChannelType(`${uuidv4()}`, {});
			assertHTTPErrorCode(p, done, 404);
		});

		it('create a new one with defaults', function(done) {
			channelTypeName = uuidv4();
			client
				.createChannelType({ name: channelTypeName, commands: ['ban'] })
				.then(response => {
					channelType = response;
					channelPermissions = response.permissions;
					expect(channelPermissions).to.have.length(7);
					done();
				})
				.catch(done);
		});

		it('defaults should be there via channel.watch', function(done) {
			getTestClientForUser('tommaso')
				.then(client => {
					client
						.channel(channelTypeName, 'test')
						.watch()
						.then(data => {
							const expectedData = {
								automod: 'AI',
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
								name: `${channelTypeName}`,
								reactions: true,
								replies: true,
								search: false,
								read_events: true,
								typing_events: true,
							};
							expect(data.channel.config).like(expectedData);
							done();
						})
						.catch(e => done(e));
				})
				.catch(e => done(e));
		});

		it('flip replies config to false', function(done) {
			client
				.updateChannelType(channelTypeName, { replies: false })
				.then(response => {
					expect(response.replies).to.be.false;
					done();
				})
				.catch(done);
		});

		it('new configs should be returned from channel.query', function(done) {
			getTestClientForUser('tommaso')
				.then(client => {
					client
						.channel(channelTypeName, 'test')
						.watch()
						.then(data => {
							const expectedData = {
								automod: 'AI',
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
								name: `${channelTypeName}`,
								reactions: true,
								replies: false,
								search: false,
								read_events: true,
								typing_events: true,
							};
							expect(data.channel.config).like(expectedData);
							done();
						})
						.catch(e => done(e));
				})
				.catch(e => done(e));
		});

		it('changing permissions', function(done) {
			client
				.updateChannelType(channelTypeName, {
					permissions: [AllowAll, DenyAll],
				})
				.then(response => {
					expect(response.permissions).to.have.length(2);
					done();
				})
				.catch(done);
		});

		it('changing commands to a bad one', function(done) {
			const p = client.updateChannelType(channelTypeName, {
				commands: ['bogus'],
			});
			assertHTTPErrorCode(p, done, 400);
		});

		it('changing commands to all', function(done) {
			client
				.updateChannelType(channelTypeName, {
					commands: ['all'],
				})
				.then(response => {
					expect(response.commands).to.have.length(6);
					done();
				})
				.catch(done);
		});

		it('changing commands to fun_set', function(done) {
			client
				.updateChannelType(channelTypeName, {
					commands: ['fun_set'],
				})
				.then(response => {
					expect(response.commands).to.have.length(1);
					done();
				})
				.catch(done);
		});

		it('changing the name should fail', function(done) {
			const p = client.updateChannelType(channelTypeName, {
				name: 'something-else',
			});
			assertHTTPErrorCode(p, done, 400);
		});

		it('changing the updated_at field should fail', function(done) {
			const p = client.updateChannelType(channelTypeName, {
				updated_at: 'something-else',
			});
			assertHTTPErrorCode(p, done, 400);
		});
	});

	describe('Deleting channel types', function() {
		const name = uuidv4();

		it('should fail to delete a missing type', function(done) {
			const p = client.deleteChannelType(uuidv4());
			assertHTTPErrorCode(p, done, 404);
		});

		it('should work fine', function(done) {
			client
				.createChannelType({ name })
				.then(() => {
					client
						.deleteChannelType(name)
						.then(() => done())
						.catch(done);
				})
				.catch(done);
		});

		it('should fail to delete a deleted type', function(done) {
			const p = client.deleteChannelType(name);
			assertHTTPErrorCode(p, done, 404);
		});

		describe('deleting a channel type with active channels should fail', function() {
			const typeName = uuidv4();

			it('create a new type', function(done) {
				client
					.createChannelType({ name: typeName })
					.then(() => done())
					.catch(done);
			});

			it('create a channel of the new type', function(done) {
				getTestClientForUser('tommaso')
					.then(client => {
						client
							.channel(typeName, 'general')
							.watch()
							.then(() => {
								done();
							})
							.catch(done);
					})
					.catch(done);
			});

			it('create a channel of the new type', function(done) {
				const p = client.deleteChannelType(typeName);
				assertHTTPErrorCode(p, done, 400);
			});
		});
	});

	describe('Get channel type', function() {
		let channelData;

		it('should fail to get a missing type', function(done) {
			const p = client.getChannelType(uuidv4());
			assertHTTPErrorCode(p, done, 404);
		});

		it('should return messaging type correctly', function(done) {
			client
				.getChannelType('messaging')
				.then(response => {
					channelData = response;
					done();
				})
				.catch(done);
		});

		it('should have default permissions', function(done) {
			expect(channelData.permissions).to.have.length(7);
			expect(channelData.permissions[0].action).to.eq('Allow');
			expect(channelData.permissions[1].action).to.eq('Deny');
			done();
		});

		it('should return configs correctly', function(done) {
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
						description: 'Flag a user',
						name: 'flag',
						set: 'moderation_set',
					},
					{
						args: '[@username] [text]',
						description: 'Ban a user',
						name: 'ban',
						set: 'moderation_set',
					},
					{
						args: '[@username]',
						description: 'Unban a user',
						name: 'unban',
						set: 'moderation_set',
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
				name: 'messaging',
				reactions: true,
				replies: true,
				search: true,
				read_events: true,
				typing_events: true,
			};
			expect(channelData).like(expectedData);
			done();
		});
	});

	describe('List channel types', function() {
		let channelTypes;

		it('should return at least the defaults channel types', function(done) {
			client
				.listChannelTypes()
				.then(response => {
					channelTypes = response;
					expect(Object.keys(channelTypes.channel_types).length).to.gte(10);
					done();
				})
				.catch(done);
		});

		it('default messaging channel type should have default permissions', function(done) {
			expect(channelTypes.channel_types.messaging.permissions).to.have.length(7);
			done();
		});

		it('should return configs correctly for channel type messaging', function(done) {
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
						description: 'Flag a user',
						name: 'flag',
						set: 'moderation_set',
					},
					{
						args: '[@username] [text]',
						description: 'Ban a user',
						name: 'ban',
						set: 'moderation_set',
					},
					{
						args: '[@username]',
						description: 'Unban a user',
						name: 'unban',
						set: 'moderation_set',
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
				name: 'messaging',
				reactions: true,
				replies: true,
				search: true,
				read_events: true,
				typing_events: true,
			};
			expect(channelTypes.channel_types.messaging).like(expectedData);
			done();
		});
	});

	describe('Client-side validation', function() {
		let client2;

		before(async () => {
			client2 = await getTestClientForUser('tommaso');
		});

		it('should fail to create', function(done) {
			const p = client2.createChannelType({ name: uuidv4() });
			assertHTTPErrorCode(p, done, 403);
		});

		it('should fail to delete', function(done) {
			const p = client2.deleteChannelType('messaging');
			assertHTTPErrorCode(p, done, 403);
		});

		it('should fail to update', function(done) {
			const p = client2.updateChannelType('messaging', {});
			assertHTTPErrorCode(p, done, 403);
		});
	});
});
