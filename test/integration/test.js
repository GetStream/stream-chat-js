/* eslint no-unused-vars: "off" */

import https from 'https';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import chaiLike from 'chai-like';
import Immutable from 'seamless-immutable';
import { StreamChat, decodeBase64, encodeBase64 } from '../../src';
import { expectHTTPErrorCode, getTestClientWithWarmUp, createEventWaiter } from './utils';
import fs from 'fs';
import assertArrays from 'chai-arrays';
const mockServer = require('mockttp').getLocal();

import {
	createUserToken,
	getTestClient,
	getTestClientForUser,
	getServerTestClient,
	createUsers,
	sleep,
} from './utils';
import { v4 as uuidv4 } from 'uuid';

const expect = chai.expect;
chai.use(assertArrays);
chai.use(chaiAsPromised);
chai.use(chaiLike);

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

describe('Chat', () => {
	let authClient;
	let serverAuthClient;
	let channel;
	let conversation;

	before(async () => {
		// Prefix the API key with the app id to make it harder to make mistakes copy and pasting
		authClient = getTestClient(true);
		serverAuthClient = getTestClient(true);

		const thierry = {
			id: 'thierry2',
			name: 'Thierry',
			status: 'busy',
			image: 'myimageurl',
			role: 'admin',
		};

		const tommaso = {
			id: 'tommaso',
			name: 'Tommaso',
			image: 'myimageurl',
			role: 'admin',
		};

		await serverAuthClient.upsertUsers([thierry, tommaso, { id: 'thierry' }]);
		//	delete thierry.role;
		// await isn't needed but makes testing a bit easier
		await authClient.connectUser(thierry);

		channel = authClient.channel('livestream', 'ninja', {
			mysearchablefield: 'hi',
		});

		await channel.watch();

		// Tricky bit is if you should reuse the same id for the same members or not..
		conversation = authClient.channel('messaging', 'thierry-tommaso-1', {
			name: 'Founder Chat',
			image: 'http://bit.ly/2O35mws',
			members: ['thierry', 'tommaso'],
		});

		await conversation.watch();
	});

	describe('User Update Events', () => {
		it('should trigger user update event', async () => {
			const userID = uuidv4();
			await serverAuthClient.upsertUser({
				id: userID,
				name: 'jack',
				song: 'purple rain',
			});

			// subscribe to user presence
			const response = await authClient.queryUsers(
				{ id: { $in: [userID] } },
				{},
				{ presence: true },
			);

			expect(response.users.length).to.equal(1);

			// this update should trigger the user.updated event..
			await new Promise((resolve) => {
				authClient.on('user.updated', (event) => {
					expect(event.user.id).to.equal(userID);
					resolve();
				});
				serverAuthClient.upsertUser({
					id: userID,
					name: 'jack',
					song: 'welcome to the jungle',
				});
			});
		});

		// If user.updated event corresponds to current user of client, then updated data of user should reflect in user set on client as well.
		it('should update client user', async () => {
			const u1 = uuidv4();
			const authClient = getTestClient(true);
			const serverAuthClient = getTestClient(true);

			await serverAuthClient.upsertUser({
				id: u1,
				name: 'Awesome user',
			});

			await authClient.connectUser({ id: u1 });

			// subscribe to user presence
			const response = await authClient.queryUsers(
				{ id: { $in: [u1] } },
				{},
				{ presence: true },
			);

			expect(response.users.length).to.equal(1);

			// this update should trigger the user.updated event..
			await new Promise((resolve) => {
				authClient.on('user.updated', (event) => {
					expect(event.user.id).to.equal(u1);
					expect(event.user.name).to.equal('Not so awesome');
					expect(authClient.user.name).equal('Not so awesome');
					resolve();
				});
				serverAuthClient.upsertUser({
					id: u1,
					name: 'Not so awesome',
				});
			});
		});
	});

	describe('Failures', () => {
		it.skip('channel query wrong order', async () => {
			const client = getTestClient(false);
			const userID = uuidv4();

			const cPromise = client.connectUser({ id: userID }, createUserToken(userID));
			// watch a new channel before connectUser completes
			const state = await client.channel('messaging', uuidv4()).watch();
		});
		it('reserved fields in user', async () => {
			const client = getTestClient(false);
			const userID = uuidv4();

			await expectHTTPErrorCode(
				400,
				client.connectUser(
					{ id: userID, created_at: 'helloworld' },
					createUserToken(userID),
				),
			);
		});
	});

	describe('Roundtrip', () => {
		it('Initialize, listen and send message', function (done) {
			async function runtest() {
				// state includes messages, who's read the messages, channel name, info and the list of members
				// initialize also subscribes to the channel so we receive WS events
				await channel.watch();
				// listen  to message.new
				channel.on('message.new', (event) => {
					if (event.message.text === 'helloworld :world: rocks 123') {
						done();
					}
				});

				// send a message
				const text = 'helloworld :world: rocks 123';
				await channel.sendMessage({ text, customfield: '123' });
			}
			runtest().catch((exc) => {
				done(exc);
			});
		});
	});

	describe('Connect', () => {
		it('Insert and update should work', async () => {
			const userID = uuidv4();
			const client = await getTestClientForUser(userID, 'test', { color: 'green' });
			expect(client.health.me.color).to.equal('green');
			// connect without a user id shouldnt remove anything...
			const client2 = await getTestClientForUser(userID);
			expect(client2.health.me.color).to.equal('green');
			// changing the status shouldnt remove the color
			const client3 = await getTestClientForUser(userID, 'helloworld');
			expect(client3.health.me.color).to.equal('green');
			expect(client3.health.me.status).to.equal('helloworld');
		});

		it('Role isnt editable', async () => {
			const userID = uuidv4();
			const client = await getTestClientForUser(userID, 'test', {
				color: 'green',
				role: 'admin',
			});
			expect(client.health.me.color).to.equal('green');
			expect(client.health.me.role).to.equal('user');
		});

		it('Verify that we dont do unneeded updates', async () => {
			const userID = uuidv4();
			const client = await getTestClientForUser(userID, 'test', { color: 'green' });
			const updatedAt = client.health.me.updated_at;
			// none of these should trigger an update...
			const client2 = await getTestClientForUser(userID);
			const client3 = await getTestClientForUser(userID, 'test', {
				color: 'green',
			});
			expect(client3.health.me.updated_at).to.equal(updatedAt);
		});

		it('Update/sync before calling connectUser', async () => {
			const userID = uuidv4();
			const serverClient = getServerTestClient();

			const updateResponse = await serverClient.upsertUsers([
				{ id: userID, book: 'dune', role: 'admin' },
			]);
			const client = await getTestClientForUser(userID, 'test', { color: 'green' });
			expect(client.health.me.role).to.equal('admin');
			expect(client.health.me.book).to.equal('dune');
			expect(client.health.me.status).to.equal('test');
			expect(client.health.me.color).to.equal('green');
		});

		it.skip('Chat disabled', async () => {
			const disabledKey = 'm1113jrsw6e';
			const disabledSecret =
				'8qezxbbbn72p9rtda2uzvupkhvq6u7dmf637weppxgmadzty6g5p64g5nchgr2aaa';
			const serverClient = new StreamChat(disabledKey, disabledSecret);
			const userClient = new StreamChat(disabledKey);
			const responsePromise = userClient.connectUser(
				{ id: 'batman' },
				serverClient.createToken('batman'),
			);
			await expect(responsePromise).to.be.rejectedWith(
				'Chat is not enabled for organization with id 5001 and name admin',
			);
		});

		it('connectUser and upsertUsers flow', async () => {
			const userID = uuidv4();
			const client = getTestClient(false);
			const token = createUserToken(userID);
			const serverClient = getServerTestClient();
			// example for docs
			const response = await client.connectUser(
				{ id: userID, role: 'admin', favorite_color: 'green' },
				token,
			);
			// user object is now {id: userID, role: 'user', favorite_color: 'green'}
			// note how you are not allowed to make the user admin via this endpoint
			const updateResponse = await serverClient.upsertUsers([
				{ id: userID, role: 'admin', book: 'dune' },
			]);
			// user object is now {id: userID, role: 'admin', book: 'dune'}
			// note how the user became admin and how the favorite_color field was removed
			expect(response.me.role).to.equal('user');
			expect(response.me.favorite_color).to.equal('green');
			const updatedUser = updateResponse.users[userID];
			expect(updatedUser.role).to.equal('admin');
			expect(updatedUser.favorite_color).to.equal(undefined);
			expect(updatedUser.book).to.equal('dune');
		});

		it('manual disconnect and reconnect flow', async () => {
			const userID = uuidv4();
			const client = getTestClient(false);
			const token = createUserToken(userID);
			await client.connectUser({ id: userID }, token);

			await client.wsConnection.disconnect(5000);
			expect(client.wsConnection.isHealthy).to.equal(false);
			expect(client.wsConnection.wsID).to.equal(2);
			expect(client.wsConnection.ws).to.equal(undefined);

			await client._setupConnection();
			expect(client.wsConnection.isHealthy).to.equal(true);
			expect(client.wsConnection.ws).to.not.equal(undefined);
		});
		context('When user is banned', () => {
			const banned = uuidv4();
			const token = createUserToken(banned);
			const client = getTestClient(false);

			before(async () => {
				const admin = { id: uuidv4(), role: 'admin' };
				const serverClient = getTestClient(true);

				await serverClient.upsertUsers([{ id: banned }, admin]);
				await serverClient.banUser(banned, { banned_by_id: admin.id });
			});

			it('returns banned field on connectUser', async () => {
				const response = await client.connectUser(
					{ id: banned, role: 'user', favorite_color: 'green' },
					token,
				);
				expect(response.me.banned).to.eq(true);
			});

			it('query for banned', async () => {
				const bannedUsers = await client.queryUsers(
					{ banned: true },
					{ updated_at: -1 },
					{},
				);
				let bannedUserFound = false;
				bannedUsers.users.forEach(function (user) {
					expect(user.banned).to.be.true;
					if (user.id === banned) {
						bannedUserFound = true;
					}
				});
				expect(bannedUserFound).to.be.true;
			});
		});

		context('When ban is expired', () => {
			const banned = uuidv4();
			const token = createUserToken(banned);
			const client = getTestClient(false);

			before(async () => {
				const admin = { id: uuidv4(), role: 'admin' };
				const serverClient = getTestClient(true);

				await serverClient.upsertUsers([{ id: banned }, admin]);
				await serverClient.banUser(banned, {
					timeout: -1,
					banned_by_id: admin.id,
				});
			});

			it('banned is set to false', async () => {
				const response = await client.connectUser(
					{ id: banned, role: 'user', favorite_color: 'green' },
					token,
				);
				expect(response.me.banned).to.eq(false);
			});
		});
	});

	describe('Devices', () => {
		const deviceId = uuidv4();
		const wontBeRemoved = uuidv4();
		const client = getTestClient(false);

		describe('User is not set', () => {
			it('device management does not work', async () => {
				const errorMsg = `Both secret and user tokens are not set. Either client.setUser wasn't called or client.disconnect was called`;
				await expect(client.addDevice(deviceId, 'apn')).to.be.rejectedWith(
					errorMsg,
				);

				await expect(client.getDevices()).to.be.rejectedWith(errorMsg);

				await expect(client.removeDevice(wontBeRemoved)).to.be.rejectedWith(
					errorMsg,
				);
			});
		});

		describe('User is set', () => {
			const userId = uuidv4();

			before(async () => {
				await client.connectUser({ id: userId }, createUserToken(userId));
			});

			describe('Adding', () => {
				it('there must be no devices', async () => {
					const response = await client.getDevices();
					expect(response.devices.length).to.equal(0);
				});

				it('simple add', async () => {
					await client.addDevice(deviceId, 'apn');
					const response = await client.getDevices();
					expect(response.devices.length).to.equal(1);
					expect(response.devices[0].id).to.equal(deviceId);
				});

				it('add same device again', async () => {
					await client.addDevice(deviceId, 'apn');
					const response = await client.getDevices();
					expect(response.devices.length).to.equal(1);
					expect(response.devices[0].id).to.equal(deviceId);
				});

				it('re-add deleted device', async () => {
					await client.removeDevice(deviceId);
					await client.addDevice(deviceId, 'firebase');
					const response = await client.getDevices();
					expect(response.devices.length).to.equal(1);
					expect(response.devices[0].id).to.equal(deviceId);
					expect(response.devices[0].push_provider).to.equal('firebase');
				});

				it('add another device', async () => {
					await client.addDevice(uuidv4(), 'apn');
					const response = await client.getDevices();
					expect(response.devices.length).to.equal(2);
					expect(response.devices[1].id).to.equal(deviceId);
					await client.removeDevice(response.devices[0].id);
				});
			});
			describe('Removing', () => {
				it(`can't remove someone else's device`, async () => {
					await expectHTTPErrorCode(404, client.removeDevice(wontBeRemoved));
				});
				it(`can only remove own device`, async () => {
					await client.removeDevice(deviceId);
					const response = await client.getDevices();
					expect(response.devices.length).to.equal(0);
				});

				it.skip(`can't delete already deleted devices`, async () => {
					await expectHTTPErrorCode(404, client.removeDevice(deviceId));
				});
				it.skip(`can't delete devices with bogus ids`, async () => {
					await expectHTTPErrorCode(404, client.removeDevice('totes fake'));
				});
			});

			describe('Moving device to new user', () => {
				const deviceID = uuidv4();
				let newClient;

				before(async () => {
					newClient = await getTestClientForUser(uuidv4());

					await client.addDevice(deviceID, 'apn');
					await newClient.addDevice(deviceID, 'apn');
				});

				it('removes device from old user', async () => {
					const response = await client.getDevices();
					expect(response.devices.map((d) => d.id)).to.not.have.members([
						deviceID,
					]);
				});

				it('adds device to new user', async () => {
					const response = await newClient.getDevices();
					expect(response.devices.map((d) => d.id)).to.have.members([deviceID]);
				});
			});
		});
	});

	describe('Search', () => {
		it('No searchable fails', async () => {
			const userID = uuidv4();
			const channelID = uuidv4();
			// search is disabled for gaming
			const channel = getServerTestClient().channel('gaming', channelID, {
				created_by_id: userID,
				members: [userID],
			});
			await channel.create();
			await authClient.channel('gaming', channelID).sendMessage({ text: 'mine' });

			await expectHTTPErrorCode(
				400,
				authClient.search({ type: 'gaming' }, 'mine', { limit: 2 }),
			);
		});

		it('Basic Query (old format)', async () => {
			const channelId = uuidv4();
			// add a very special message
			const channel = authClient.channel('messaging', channelId);
			await channel.create();
			const keyword = 'supercalifragilisticexpialidocious';
			await channel.sendMessage({ text: `words ${keyword} what?` });
			await channel.sendMessage({ text: `great movie because of ${keyword}` });

			const filters = { type: 'messaging' };
			const response = await authClient.search(
				filters,
				'supercalifragilisticexpialidocious',
				{ limit: 2, offset: 0 },
			);
			expect(response.results.length).to.equal(2);
			expect(response.results[0].message.text).to.contain(
				'supercalifragilisticexpialidocious',
			);
		});

		it('invalid query argument type should return an error', async () => {
			const unique = uuidv4();
			const channel = authClient.channel('messaging', uuidv4(), {
				unique,
			});
			await channel.create();
			try {
				await authClient.search({ cid: '1' }, 1);
			} catch (e) {
				expect(e.message).to.be.equal('Invalid type number for query parameter');
			}
		});

		it('query message custom fields', async () => {
			const unique = uuidv4();
			const channel = authClient.channel('messaging', uuidv4(), {
				unique,
			});
			await channel.create();
			await channel.sendMessage({ text: 'hi', unique });

			const channelFilters = { unique };
			const messageFilters = { unique };
			const response = await authClient.search(channelFilters, messageFilters);
			expect(response.results.length).to.equal(1);
			expect(response.results[0].message.unique).to.equal(unique);
		});

		it('query message text and custom field', async () => {
			const unique = uuidv4();
			const channel = authClient.channel('messaging', uuidv4(), {
				unique,
			});
			await channel.create();
			await channel.sendMessage({ text: 'hi', unique });
			await channel.sendMessage({ text: 'hi' });

			const channelFilters = { unique };
			const messageFilters = { text: 'hi', unique };
			const response = await authClient.search(channelFilters, messageFilters);
			expect(response.results.length).to.equal(1);
			expect(response.results[0].message.unique).to.equal(unique);
		});

		it('query messages with attachments', async () => {
			const unique = uuidv4();
			const channel = authClient.channel('messaging', uuidv4(), {
				unique,
			});
			await channel.create();
			const attachments = [
				{
					type: 'hashtag',
					name: 'awesome',
					awesome: true,
				},
			];
			await channel.sendMessage({ text: 'hi', unique });
			await channel.sendMessage({ text: 'hi', attachments });

			const channelFilters = { unique };
			const messageFilters = { attachments: { $exists: true } };
			const response = await authClient.search(channelFilters, messageFilters);
			expect(response.results.length).to.equal(1);
			expect(response.results[0].message.unique).to.be.undefined;
		});

		it('query messages by attachment type', async () => {
			const authClientTommaso = getTestClient(true);
			const userTommaso = { id: uuidv4(), name: 'Tommaso Barbugli' };

			await serverAuthClient.upsertUser(userTommaso);
			await authClientTommaso.connectUser(userTommaso);

			const attachments = [
				{
					type: 'image',
					image_url: 'https://some_url_for_image',
				},
			];

			const channel = authClientTommaso.channel('messaging', uuidv4(), {
				members: [userTommaso.id],
			});
			await channel.create();

			const { message } = await channel.sendMessage({
				text: 'Check my images',
				attachments,
			});

			const channelFilters = { cid: { $in: [channel.cid] } };
			const messageFilters = { 'attachments.type': { $in: ['image'] } };
			const response = await authClientTommaso.search(
				channelFilters,
				messageFilters,
			);
			expect(response.results.length).to.equal(1);
			expect(response.results[0].message.id).to.be.equal(message.id);
			expect(response.results[0].message.channel.id).to.be.equal(channel.id);
		});

		it('query messages with empty text', async () => {
			const unique = uuidv4();
			const channel = authClient.channel('messaging', uuidv4(), {
				unique,
			});
			await channel.create();
			const attachments = [
				{
					type: 'hashtag',
					name: 'awesome',
					awesome: true,
				},
			];
			const resp = await channel.sendMessage({ attachments });

			const channelFilters = { unique };
			const messageFilters = { text: '' };
			const response = await authClient.search(channelFilters, messageFilters);
			expect(response.results.length).to.equal(1);
			expect(response.results[0].message.id).to.be.equal(resp.message.id);
		});

		it('Basic Query using $q syntax', async () => {
			// add a very special message
			const channel = authClient.channel('messaging', 'poppins');
			await channel.create();
			const keyword = 'supercalifragilisticexpialidocious';
			await channel.sendMessage({ text: `words ${keyword} what?` });
			await channel.sendMessage({ text: `great movie because of ${keyword}` });

			const filters = { type: 'messaging' };
			const response = await authClient.search(
				filters,
				{ text: { $q: 'supercalifragilisticexpialidocious' } },
				{ limit: 2, offset: 0 },
			);
			expect(response.results.length).to.equal(2);
			expect(response.results[0].message.text).to.contain(
				'supercalifragilisticexpialidocious',
			);
		});

		it('Basic Query using $q syntax on a field thats not supported', () => {
			const filters = { type: 'messaging' };
			const searchPromise = authClient.search(
				filters,
				{ mycustomfield: { $q: 'supercalifragilisticexpialidocious' } },
				{ limit: 2, offset: 0 },
			);
			expect(searchPromise).to.be.rejectedWith(
				'StreamChat error code 4: Search failed with error: "search is not enabled for field messages.mycustomfield."',
			);
		});
	});

	describe('Server Side Integration', () => {
		it('Create token with expiration', function (done) {
			const token = serverAuthClient.createToken('user-id', 1538709600);
			expect(token.split('.')[1]).to.eq(
				'eyJ1c2VyX2lkIjoidXNlci1pZCIsImV4cCI6MTUzODcwOTYwMH0',
			);
			done();
		});

		it('Create token without expiration', function (done) {
			const token = serverAuthClient.createToken('user-id');
			expect(token.split('.')[1]).to.eq('eyJ1c2VyX2lkIjoidXNlci1pZCJ9');
			done();
		});

		it('Add a Chat Message and a Reaction', async () => {
			const elon = {
				id: 'elon',
				name: 'Elon Musk',
				image:
					'https://cdn.geekwire.com/wp-content/uploads/2018/09/180907-musk-630x455.jpg',
			};
			const tommaso = {
				id: 'tommaso',
				name: 'Tommaso Barbugli',
			};
			const image =
				'https://www.teslarati.com/wp-content/uploads/2018/09/BFR-2018-spaceship-and-booster-sep-SpaceX-1c.jpg';
			// Client side we use .initialize to initialize a channel
			// .initialize - creates the channel, creates the subscription, gets the state...
			// Server side I just want to create the channel and do nothing else...
			// It also makes sense to be able to batch create channels..
			// You'll also want to be able to batch create messages or reactions...
			// You never want to establish a WS connection
			// .create only creates the channel and does nothing else...
			const spacexChannel = serverAuthClient.channel('team', 'spacex', {
				image,
				created_by: elon,
			});
			const createResponse = await spacexChannel.create();
			const text = 'I was gonna get to mars but then I got high';
			const message = {
				text,
				user: elon,
			};

			const response = await spacexChannel.sendMessage(message);
			expect(response.message.text).to.equal(text);
			expect(response.message.user.id).to.equal(elon.id);

			const reactionResponse = await spacexChannel.sendReaction(
				response.message.id,
				{
					type: 'lol',
					user: tommaso,
				},
			);
			expect(reactionResponse.reaction.type).to.equal('lol');
			expect(reactionResponse.reaction.user.id).to.equal(tommaso.id);
		});

		it('Edit a user', async () => {
			const response = await serverAuthClient.upsertUser({
				id: 'tommaso',
				name: 'Tommaso Barbugli',
				role: 'admin',
			});
			expect(response.users.tommaso.id).to.equal('tommaso');
		});
	});

	describe('base64', () => {
		it('encodes correctly', () => {
			const testCases = [
				'vishal',
				'vishy',
				'jaap',
				'eugene',
				'luke=',
				'Marcello!?',
			];

			testCases.forEach((name) => {
				const b64str = encodeBase64(name);
				const str = decodeBase64(b64str);
				expect(str).to.equal(name);
			});
		});
	});

	describe('Auth', () => {
		it('Token based auth', async () => {
			const token = createUserToken('daenerys');
			const client3 = getTestClient(true);
			await client3.connectUser(
				{
					id: 'daenerys',
					name: 'Mother of dragons',
				},
				token,
			);
		});

		it('Tampering with token and user should fail', async () => {
			const token = createUserToken('fake-daenerys');

			const clientSide = getTestClient();
			await expect(
				clientSide.connectUser(
					{
						id: 'daenerys',
						name: 'Mother of dragons',
					},
					token,
				),
			).to.be.rejectedWith(Error);
		});

		it('Secret based auth', async () => {
			const client3 = new getTestClient(true);
			await client3.connectUser({
				id: 'daenerys',
				name: 'Mother of dragons',
			});
		});

		it('No secret and no token should raise a client error', async () => {
			const client2 = getTestClient();
			await expect(
				client2.connectUser({
					id: 'daenerys',
					name: 'Mother of dragons',
				}),
			).to.be.rejectedWith(Error);
		});

		it('Invalid user token', async () => {
			const client2 = getTestClient();
			await expect(
				client2.connectUser(
					{
						id: 'daenerys',
						name: 'Mother of dragons',
					},
					'badtokenhere',
				),
			).to.be.rejectedWith(Error);
		});

		it('Invalid secret should fail connectUser', async () => {
			const client3 = new StreamChat('892s22ypvt6m', 'invalidsecret');
			await expectHTTPErrorCode(
				401,
				client3.connectUser({
					id: 'daenerys',
					name: 'Mother of dragons',
				}),
			);
		});

		it('Calling a method after disconnect should raise a clear error', async () => {
			const client2 = await getTestClientForUser('bob');
			const chan = client2.channel('messaging', uuidv4());
			await chan.watch();
			await client2.disconnect(5000);

			const errorMsg = `Both secret and user tokens are not set. Either client.setUser wasn't called or client.disconnect was called`;

			let p = client2.addDevice('deviceID', 'apn');
			await expect(p).to.be.rejectedWith(errorMsg);

			p = chan.stopWatching();
			await expect(p).to.be.rejectedWith(
				`You can't use a channel after client.disconnect() was called`,
			);

			const anonClient = getTestClient(false);
			await anonClient.connectAnonymousUser();
			await anonClient.disconnect(5000);

			p = anonClient.addDevice('deviceID', 'apn');
			await expect(p).to.be.rejectedWith(errorMsg);
		});

		it('disconnect should always return promise irrespective of wsConnection status', async () => {
			const client2 = await getTestClientForUser('bob');
			const chan = client2.channel('messaging', uuidv4());
			await chan.watch();
			let disconnect = client2.disconnect(5000);
			await expect(disconnect).to.be.fulfilled;

			// Lets try disconnect second time on same client.
			disconnect = client2.disconnect(5000);
			await expect(disconnect).to.be.fulfilled;

			// Lets try deleting websocket connection object.
			client2.wsConnection = null;
			disconnect = client2.disconnect();
			await expect(disconnect).to.be.fulfilled;
		});
	});

	describe('Permissions', () => {
		it('Editing someone else message should not be allowed client-side', async () => {
			// thierry adds a message
			const response = await channel.sendMessage({
				text: 'testing permissions is fun',
			});
			const message = response.message;

			// this should succeed since the secret is set
			const token = authClient.createToken('johny');

			const client3 = getTestClient();
			await client3.connectUser(
				{
					id: 'johny',
					name: 'some random guy',
				},
				token,
			);
			await expectHTTPErrorCode(403, client3.updateMessage(message));
		});
	});

	describe('User management', () => {
		it('Regular Users with extra fields', async () => {
			// verify we correctly store user information
			const userID = 'uthred-' + uuidv4();
			const client = getTestClient();
			const token = createUserToken(userID);

			// set the user information
			const user = {
				id: userID,
				first: 'Uhtred',
			};

			const response = await client.connectUser(user, token);

			const compareUser = (userResponse) => {
				const expectedData = { role: 'user', ...user };
				expect(userResponse).to.contains(expectedData);
				expect(userResponse.online).to.equal(true);
				expect(userResponse.created_at).to.be.ok;
				expect(userResponse.updated_at).to.be.ok;
				expect(userResponse.last_active).to.be.ok;
				expect(userResponse.created_at).to.not.equal('0001-01-01T00:00:00Z');
				expect(userResponse.updated_at).to.not.equal('0001-01-01T00:00:00Z');
				expect(userResponse.last_active).to.not.equal('0001-01-01T00:00:00Z');
				expect(userResponse.created_at.substr(-1)).to.equal('Z');
				expect(userResponse.updated_at.substr(-1)).to.equal('Z');
				expect(userResponse.last_active.substr(-1)).to.equal('Z');
			};
			compareUser(response.me);

			const magicChannel = client.channel('livestream', 'harrypotter');
			await magicChannel.watch();

			// make an API call so the data is sent over
			const text = 'Tommaso says hi!';
			const data = await magicChannel.sendMessage({ text });

			// verify the user information is correct
			compareUser(data.message.user);
			expect(data.message.text).to.equal(text);
		});

		it.skip('Update a user', async () => {
			// update a user, see if message state fully updates...
			await channel.sendMessage({ text: 'updating a user' });
			const state = await channel.query();
			expect(state.messages[state.messages.length - 1].user.name).to.equal(
				'Thierry',
			);
			// TODO: update the user
			authClient.connectUser({ id: 'thierry', name: 't' }, 'myusertoken');
			// verify the update propagates
			expect(state.messages[state.messages.length - 1].user.name).to.equal('t');
		});

		describe('partial update', () => {
			const user = {
				id: 'thierry2',
			};

			it('not changing user role', async () => {
				await expectHTTPErrorCode(
					403,
					authClient.partialUpdateUser({
						id: user.id,
						set: {
							role: 'admin',
						},
					}),
				);
			});

			it('change custom field', async () => {
				const res = await authClient.partialUpdateUser({
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
				const res = await authClient.partialUpdateUser({
					id: user.id,
					unset: ['fields.subfield1'],
				});

				expect(res.users[user.id].fields).to.eql({
					subfield2: 'value2',
				});
			});

			it.skip('sends user.updated event', async () => {
				// subscribe to user presence
				await authClient.queryUsers(
					{ id: { $in: [user.id] } },
					{},
					{ presence: true },
				);

				await new Promise((resolve) => {
					authClient.on('user.updated', (event) => {
						expect(event.user.id).to.equal(user.id);
						resolve();
					});

					authClient.upsertUser({
						id: user.id,
						role: 'admin',
						set: { test: 'true' },
					});
				});
			});

			it("doesn't allow .. in key names", async () => {
				await expectHTTPErrorCode(
					400,
					authClient.partialUpdateUser({
						id: user.id,
						set: { 'test..test': '111' },
					}),
				);

				await expectHTTPErrorCode(
					400,
					authClient.partialUpdateUser({
						id: user.id,
						unset: ['test..test'],
					}),
				);
			});

			it("doesn't allow spaces in key names", async () => {
				await expectHTTPErrorCode(
					400,
					authClient.partialUpdateUser({
						id: user.id,
						set: { ' test.test': '111' },
					}),
				);
				await expectHTTPErrorCode(
					400,
					authClient.partialUpdateUser({
						id: user.id,
						set: { 'test. test': '111' },
					}),
				);
				await expectHTTPErrorCode(
					400,
					authClient.partialUpdateUser({
						id: user.id,
						set: { 'test.test ': '111' },
					}),
				);

				await expectHTTPErrorCode(
					400,
					authClient.partialUpdateUser({
						id: user.id,
						unset: [' test.test'],
					}),
				);
				await expectHTTPErrorCode(
					400,
					authClient.partialUpdateUser({
						id: user.id,
						unset: [' test. test'],
					}),
				);
				await expectHTTPErrorCode(
					400,
					authClient.partialUpdateUser({
						id: user.id,
						unset: [' test.test '],
					}),
				);
			});

			it("doesn't allow start or end with dot in key names", async () => {
				await expectHTTPErrorCode(
					400,
					authClient.partialUpdateUser({
						id: user.id,
						set: { '.test.test': '111' },
					}),
				);
				await expectHTTPErrorCode(
					400,
					authClient.partialUpdateUser({
						id: user.id,
						set: { 'test.test.': '111' },
					}),
				);
			});
		});
	});

	describe('Messages', () => {
		describe('Success', () => {
			it('Subscribe to many channels', function (done) {
				async function runtest() {
					// A Messenger or Intercom type of application needs to query many channels at once and subscribe to all
					// It requires basic filtering and sorting.
					// returns a list of initialized channels
					const filter = {};
					const sort = { last_message_at: -1 };

					const channels = await authClient.queryChannels(filter, sort);
					for (const c of channels) {
						expect(c.initialized).to.be.true;
						expect(authClient.configs[c.type].message_retention).to.equal(
							'infinite',
						);
					}
					done();
				}
				runtest().catch((exc) => {
					done(exc);
				});
			});

			it('Query channels by cid', async () => {
				// verify that querying channels by cid works, this is needed for recovering state
				const channelID = uuidv4();
				const cid = `livestream:${channelID}`;
				const channel = authClient.channel('livestream', channelID);
				await channel.create();

				const filter = { cid: { $in: [cid] } };
				const sort = { last_message_at: -1 };
				const channels = await authClient.queryChannels(filter, sort);
				expect(channels.length).to.equal(1);
				expect(channels[0].cid).to.equal(cid);
			});

			it('Query channels by id', async () => {
				// verify that querying channels by cid works, this is needed for recovering state
				const channelID = uuidv4();
				const cid = `livestream:${channelID}`;
				const channel = authClient.channel('livestream', channelID);
				await channel.create();

				const sort = { last_message_at: -1 };
				const filter2 = { id: { $in: [channelID] } };
				const channels2 = await authClient.queryChannels(filter2, sort);
				expect(channels2.length).to.equal(1);
				expect(channels2[0].cid).to.equal(cid);
			});

			it('Channel order by created_at', async () => {
				// create the list of channels
				const special = uuidv4();
				for (let x = 0; x < 5; x++) {
					await authClient
						.channel('livestream', `${special}-${x}`, {
							order: x,
							special,
						})
						.create();
				}
				const filter = { order: { $gte: 0 }, special };
				const sort = { updated_at: -1 };
				const options = { state: false, subscribe: false };

				let channels = await authClient.queryChannels(filter, sort, options);
				expect(channels.length).to.equal(5);
				expect(channels.length).to.equal(5);
				expect(channels.map((c) => c.data.order)).to.eql([4, 3, 2, 1, 0]);

				channels = await authClient.queryChannels(
					filter,
					{ updated_at: 1 },
					options,
				);
				expect(channels.length).to.equal(5);
				expect(channels.map((c) => c.data.order)).to.eql([0, 1, 2, 3, 4]);
			});

			it('Channel order by updated_at', async () => {
				// create the list of channels
				const special = uuidv4();
				for (let x = 0; x < 5; x++) {
					await authClient
						.channel('livestream', `${special}-${x}`, {
							order: x,
							special,
						})
						.create();
				}
				const filter = { order: { $gte: 0 }, special };
				const sort = { created_at: -1 };
				const options = { state: false, subscribe: false };

				let channels = await authClient.queryChannels(filter, sort, options);
				expect(channels.length).to.equal(5);
				expect(channels.length).to.equal(5);
				expect(channels.map((c) => c.data.order)).to.eql([4, 3, 2, 1, 0]);

				channels = await authClient.queryChannels(
					filter,
					{ created_at: 1 },
					options,
				);
				expect(channels.length).to.equal(5);
				expect(channels.map((c) => c.data.order)).to.eql([0, 1, 2, 3, 4]);
			});

			it('Channel pagination', async () => {
				// create the list of channels
				const special = uuidv4();
				for (let x = 0; x < 4; x++) {
					await authClient
						.channel('livestream', `${special}-${x}`, {
							order: x,
							special,
						})
						.create();
				}
				// test pagination
				const filter = { order: { $gte: 0 }, special };
				const sort = { order: -1 };
				const options = { limit: 3, offset: 1, state: false, subscribe: false };

				// verify we got the 2nd item from the top, ordered desc
				const channels = await authClient.queryChannels(filter, sort, options);
				expect(channels.length).to.equal(3);
				expect(channels[0].data.order).to.equal(2);
			});

			it('Channel Filtering', async () => {
				const uniqueChannel = authClient.channel(
					'livestream',
					'myuniquechannel',
					{
						unique: 1,
						test_string: 'hi',
						test_date: new Date('1995-12-17T03:24:00'),
					},
				);
				await uniqueChannel.watch();
				const filter = {
					unique: 1,
					test_string: 'hi',
					test_date: { $gte: new Date('1994-12-17T03:24:00') },
				};
				const sort = { last_message_at: -1 };

				const channels = await authClient.queryChannels(filter, sort);
				expect(channels.length).to.equal(1);
				const channel = channels[0];

				expect(channel.cid).to.equal('livestream:myuniquechannel');
				expect(channel.data.unique).to.equal(1);
				for (const c of channels) {
					expect(c.initialized).to.be.true;
					expect(authClient.configs[c.type].message_retention).to.equal(
						'infinite',
					);
				}
			});

			it('Channel Filtering Members', async () => {
				const uuid = uuidv4();

				const uniqueMember = `jackjones-${uuid}`;
				await createUsers([uniqueMember]);
				const channelID = `chat-with-${uuid}`;
				const memberChannel = authClient.channel('messaging', channelID, {
					members: [authClient.userID, uniqueMember],
				});

				await memberChannel.create();

				const sort = { last_message_at: -1 };
				const filter = { members: { $in: [uniqueMember] } };

				const channels = await authClient.queryChannels(filter, sort);
				expect(channels.length).to.equal(1);
				expect(channels[0].data.id).to.equal(channelID);

				const state = channels[0].state;

				expect(state.membership).to.not.equal(null);
				expect(state.membership.user).to.not.equal(null);
				expect(state.membership.user.id).to.equal(authClient.userID);
				expect(state.membership.role).to.equal('admin');
				expect(state.membership.user.role).to.equal('admin');
			});

			it.skip('Channel Filtering equal Members', async () => {
				const uuid = uuidv4();

				const uniqueMember = `jackjones-${uuid}`;
				const uniqueMember2 = `jackjones2-${uuid}`;
				await createUsers([uniqueMember, uniqueMember2]);
				const channelID = `chat-with-${uuid}`;
				const channelID2 = `chat-with2-${uuid}`;
				const memberChannel = authClient.channel('messaging', channelID, {
					members: [uniqueMember, uniqueMember2],
				});
				await memberChannel.create();
				const memberChannels2 = authClient.channel('messaging', channelID2, {
					members: [uniqueMember, uniqueMember2],
				});
				await memberChannels2.create();

				const sort = { last_message_at: -1 };
				const filter = { members: { $eq: [uniqueMember, uniqueMember2] } };
				const channels = await authClient.queryChannels(filter, sort);
				expect(channels.length).to.equal(2);
				expect(channels[0].data.id).to.be.containingAnyOf([
					channelID,
					channelID2,
				]);
				expect(channels[1].data.id).to.be.containingAnyOf([
					channelID,
					channelID2,
				]);
				//members out of order
				const filter2 = { members: { $eq: [uniqueMember2, uniqueMember] } };
				const channels2 = await authClient.queryChannels(filter2, sort);
				expect(channels2.length).to.equal(2);
				expect(channels2[0].data.id).to.be.containingAnyOf([
					channelID,
					channelID2,
				]);
				expect(channels2[1].data.id).to.be.containingAnyOf([
					channelID,
					channelID2,
				]);
			});

			it.skip('Channel Filtering equal Members short mode', async () => {
				const uuid = uuidv4();

				const uniqueMember = `jackjones-${uuid}`;
				const uniqueMember2 = `jackjones2-${uuid}`;
				await createUsers([uniqueMember, uniqueMember2]);
				const channelID = `chat-with-${uuid}`;
				const channelID2 = `chat-with2-${uuid}`;
				const memberChannel = authClient.channel('messaging', channelID, {
					members: [uniqueMember, uniqueMember2],
				});
				await memberChannel.create();
				const memberChannels2 = authClient.channel('messaging', channelID2, {
					members: [uniqueMember, uniqueMember2],
				});
				await memberChannels2.create();

				const sort = { last_message_at: -1 };
				const filter = { members: [uniqueMember, uniqueMember2] };
				const channels = await authClient.queryChannels(filter, sort);
				expect(channels.length).to.equal(2);
				expect(channels[0].data.id).to.be.containingAnyOf([
					channelID,
					channelID2,
				]);
				expect(channels[1].data.id).to.be.containingAnyOf([
					channelID,
					channelID2,
				]);
			});

			it.skip('Channel Filtering equal array custom field', async () => {
				const uuid = uuidv4();

				const uniqueMember = `jackjones-${uuid}`;
				await createUsers([uniqueMember]);
				const channelID = `chat-with-${uuid}`;
				const memberChannel = authClient.channel('messaging', channelID, {
					custom_array_field: [1, 2, 3, 4],
					unique: uuid,
				});
				await memberChannel.create();

				const sort = { last_message_at: -1 };
				const filter = { custom_array_field: [1, 2, 3, 4], unique: uuid };
				const channels = await authClient.queryChannels(filter, sort);
				expect(channels.length).to.equal(1);
				expect(channels[0].data.id).to.equal(channelID);
				//query out of order
				const filter2 = { custom_array_field: [4, 3, 2, 1], unique: uuid };
				const channels2 = await authClient.queryChannels(filter2, sort);
				expect(channels2.length).to.equal(1);
				expect(channels2[0].data.id).to.equal(channelID);
			});

			it.skip('Channel Filtering equal Members and custom field', async () => {
				const uuid = uuidv4();

				const uniqueMember = `jackjones-${uuid}`;
				const uniqueMember2 = `jackjones2-${uuid}`;
				await createUsers([uniqueMember, uniqueMember2]);
				const channelID = `chat-with-${uuid}`;
				const channelID2 = `chat-with2-${uuid}`;
				const memberChannel = authClient.channel('messaging', channelID, {
					members: [uniqueMember, uniqueMember2],
					abc: 2,
				});
				await memberChannel.create();
				const memberChannels2 = authClient.channel('messaging', channelID2, {
					members: [uniqueMember, uniqueMember2],
					abc: 2,
				});
				await memberChannels2.create();

				const sort = { last_message_at: -1 };
				const filter = {
					$and: [
						{ members: { $eq: [uniqueMember, uniqueMember2] } },
						{ abc: 2 },
					],
				};
				const channels = await authClient.queryChannels(filter, sort);
				expect(channels.length).to.equal(2);
				expect(channels[0].data.id).to.be.containingAnyOf([
					channelID,
					channelID2,
				]);
				expect(channels[1].data.id).to.be.containingAnyOf([
					channelID,
					channelID2,
				]);
			});

			it('Add a Chat message with a custom field', async () => {
				const message = {
					text: 'helloworld chat test',
					myfield: '123',
					tmp_id: 'localidthatwereallyneedcustomfield',
				};
				const response = await channel.sendMessage(message);
				const messageID = response.message.id;
				delete channel.data.created_by;
				const data = await channel.query();
				const last = data.messages.length - 1;
				expect(data.messages[last].id).to.equal(messageID);
				expect(data.messages[last].text).to.equal(message.text);
				expect(data.messages[last].tmp_id).to.equal(
					'localidthatwereallyneedcustomfield',
				);
				//expect(data.messages[last].status).to.equal('received');
				expect(data.messages[last].type).to.equal('regular');
				expect(data.messages[last].myfield).to.equal(message.myfield);
				expect(authClient.configs[channel.type].message_retention).to.equal(
					'infinite',
				);
			});

			it.skip('Add a Chat message with a URL and edit it', async () => {
				const url = 'https://unsplash.com/photos/kGSapVfg8Kw';
				const text = `check this one :) ${url}`;
				const response = await channel.sendMessage({ text });
				const message = response.message;
				expect(message.attachments.length).to.equal(1);
				expect(message.attachments[0].type).to.equal('image');
				// verify that changing the url changes the attachment..
				const url2 = 'https://www.youtube.com/watch?v=79DijItQXMM';
				const text2 = `nvm its on youtube as well ${url2}`;
				message.text = text2;
				const response2 = await authClient.updateMessage(message);
				const message2 = response2.message;
				expect(message2.attachments.length).to.equal(1);
				expect(message2.attachments[0].type).to.equal('video');
			});

			it('Mix URLs and attachments', async () => {
				const url = '#awesome https://unsplash.com/photos/kGSapVfg8Kw';
				const text = `Time for vacation! ${url}`;
				const attachments = [
					{
						type: 'hashtag',
						name: 'awesome',
						awesome: true,
					},
				];
				let response = await channel.sendMessage({ text, attachments });
				let message = response.message;
				expect(message.attachments.length).to.equal(2);
				expect(message.attachments[0].type).to.equal('hashtag');
				expect(message.attachments[1].type).to.equal('image');

				response = await authClient.updateMessage({
					id: message.id,
					text: '#awesome text only',
					attachments: [attachments[0]],
				});
				message = response.message;
				expect(message.attachments.length).to.equal(1);
				expect(message.attachments[0].type).to.equal('hashtag');
			});

			it('URL enrichment response format', async () => {
				const url = 'https://unsplash.com/photos/kGSapVfg8Kw';
				const text = `Time for vacation! ${url}`;
				const response = await channel.sendMessage({ text });
				const message = response.message;
				expect(message.attachments.length).to.equal(1);
				expect(message.attachments[0].type).to.equal('image');
			});

			it('Edit a Chat message', async () => {
				const text = 'helloworld :world: rocks';
				const data = await channel.sendMessage({ text });
				expect(data.message.text).to.equal(text);
				const editedText = 'no hello world today';
				data.message.text = editedText;
				const updateResponse = await authClient.updateMessage(data.message);

				const state = await channel.query();
				const m = state.messages[state.messages.length - 1];
				expect(m.text).to.equal(editedText);
				// verify the HTML also updated
				expect(m.html).to.equal(`<p>${editedText}</p>\n`);
				const m2 = channel.state.messages[channel.state.messages.length - 1];
				expect(m2.text).to.equal(editedText);
				expect(new Date() - m2.created_at).to.be.most(1000);
			});

			it('Edit a Chat message with a custom field', async () => {
				const text = 'testing custom message edits';
				const magic = 41;
				const data = await channel.sendMessage({
					text,
					magic,
					algo: 'randomforest',
				});
				expect(data.message.text).to.equal(text);
				expect(data.message.magic).to.equal(41);
				// correct the magic number to 42
				data.message.magic = 42;
				const response = await authClient.updateMessage(data.message);

				expect(response.message.magic).to.equal(42);
				expect(response.message.algo).to.equal('randomforest');
			});

			it('Delete a Chat message', function (done) {
				async function runTest() {
					const channel = authClient.channel('messaging', uuidv4());
					await channel.watch();

					const text = 'testing the delete flow, does it work?';
					const data = await channel.sendMessage({ text });
					expect(data.message.text).to.equal(text);

					channel.on('message.deleted', (event) => {
						expect(event.message.deleted_at).to.not.be.null;
						expect(event.message.type).to.be.equal('deleted');
						expect(event.hard_delete).to.be.undefined;
						expect(channel.state.messages).to.be.deep.equal([
							channel.state.messageToImmutable(event.message),
						]);
						done();
					});
					const deleteResponse = await authClient.deleteMessage(
						data.message.id,
					);
					expect(deleteResponse.message.deleted_at).to.not.be.null;
				}
				runTest().catch((exc) => {
					done(exc);
				});
			});

			it('Hard Delete a Chat message', function (done) {
				(async () => {
					const channel = authClient.channel('messaging', uuidv4());
					await channel.watch();

					channel.on('message.deleted', (event) => {
						expect(event.message.deleted_at).to.not.be.null;
						expect(event.message.type).to.be.equal('deleted');
						expect(event.hard_delete).to.be.true;
						expect(channel.state.messages).to.be.deep.equal([]);
						done();
					});

					const data = await channel.sendMessage({ text: 'hard delete event' });
					await serverAuthClient.deleteMessage(data.message.id, true);
				})().catch(done);
			});

			it('Add a Chat Message with an attachment', async () => {
				const text = 'testing attachment';
				const data = await channel.sendMessage({ text });
			});

			it.skip('Enrichment', async () => {
				const text =
					'this youtube link is awesome https://www.youtube.com/watch?v=Q0CbN8sfihY';
				const data = await channel.sendMessage({ text });
				const m = data.message;
				const a = m.attachments[0];
				expect(a.image_url).to.equal(
					'https://i.ytimg.com/vi/Q0CbN8sfihY/maxresdefault.jpg',
				);
				expect(a.asset_url).to.equal('https://www.youtube.com/embed/Q0CbN8sfihY');
				expect(a.type).to.equal('video');
			});
		});

		describe('Fail', () => {
			it('Add a Chat message with a wrong custom field', async () => {
				const message = {
					text: 'helloworld chat test',
					attachments: '123', // we don't allow this its reserved
				};
				await expectHTTPErrorCode(400, channel.sendMessage(message));
			});

			it('Add a chat message with text that is too long', async () => {
				const message = {
					text: 'This is bigger than the limit of 10 chars for this channel',
				};
				const disabledChannel = authClient.channel(
					'everythingDisabled',
					'old-school-irc',
				);
				await disabledChannel.watch();

				const resp = await disabledChannel.sendMessage(message);
				expect(resp.message.type).to.equal('error');
			});

			it('Add a chat message with same ID twice', async () => {
				const id = uuidv4();
				const message = {
					id,
					text: 'yo',
				};
				await channel.sendMessage(message);
				await expectHTTPErrorCode(400, channel.sendMessage(message));
			});

			it('Edit a chat message with text that is too long', async () => {
				const disabledChannel = authClient.channel(
					'everythingDisabled',
					'old-school-irc',
				);
				await disabledChannel.watch();

				const response = await disabledChannel.sendMessage({ text: 'a' });

				const message = response.message;
				message.text =
					'This is bigger than the limit of 10 chars for this channel';

				await expectHTTPErrorCode(400, authClient.updateMessage(message));
			});

			it(`Add a Chat Message that's too large in content`, async () => {
				await expectHTTPErrorCode(
					413,
					channel.sendMessage({
						text: 'boop',
						stuff: 'x'.repeat(5 * 1024),
					}),
				);
			});

			it(`Edit a Chat Message that's too large in content`, async () => {
				const resp = await channel.sendMessage({
					text: 'boop',
					stuff: 'super custom',
				});
				const message = resp.message;
				const newMsg = Object.assign({}, message, {
					new_stuff: 'x'.repeat(5 * 1024),
				});
				await expectHTTPErrorCode(413, authClient.updateMessage(newMsg));
			});
		});
	});

	describe.skip('Opengraph', () => {
		it('og link should be processed by Opengraph parser', async () => {
			const data = await channel.sendMessage({
				text: 'https://imgur.com/gallery/jj1QKWc',
			});
			const exp = {
				author_name: 'Imgur',
				image_url: 'https://i.imgur.com/jj1QKWc.gif?noredirect',
				og_scrape_url: 'https://imgur.com/gallery/jj1QKWc',
				thumb_url: 'https://i.imgur.com/jj1QKWc.gif?noredirect',
				title: 'Fat cat almost gets stuck in door',
				title_link: 'https://i.imgur.com/jj1QKWc.gif?noredirect',
				type: 'image',
			};
			expect(data.message.attachments[0]).like(exp);
		});

		it('direct image link should be attached', async () => {
			const data = await channel.sendMessage({
				text: 'https://i.imgur.com/jj1QKWc.gif',
			});
			const exp = {
				image_url: 'https://i.imgur.com/jj1QKWc.gif',
				og_scrape_url: 'https://i.imgur.com/jj1QKWc.gif',
				thumb_url: 'https://i.imgur.com/jj1QKWc.gif',
				type: 'image',
			};
			expect(data.message.attachments[0]).like(exp);
		});

		beforeEach(() => mockServer.start());
		afterEach(() => mockServer.stop());
		// mockServer.enableDebug();

		it('direct link on image with wrong content-type should not be attached', async () => {
			await mockServer
				.get('/fake-image.jpg')
				.thenReply(200, ':/', { 'content-type': 'fake' });

			const data = await channel.sendMessage({
				text: mockServer.urlFor('/fake-image.jpg'),
			});
			expect(data.message.attachments.length).to.equal(0);
		});

		it('direct link on fake image with right content-type should not be attached', async () => {
			await mockServer
				.get('/fake-image2.jpg')
				.thenReply(200, ':/', { 'content-type': 'image/gif' });

			const data = await channel.sendMessage({
				text: mockServer.urlFor('/fake-image2.jpg'),
			});
			expect(data.message.attachments.length).to.equal(0);
		});
	});

	describe('MML messages', () => {
		describe('Error', () => {
			it('Send invalid MML message', async () => {
				const cmdChannel = authClient.channel('ai', 'excuse-test');
				await cmdChannel.watch();
				const cmd = '/mml-examples non-existing';
				const data = await cmdChannel.sendMessage({ text: cmd });
				expect(data.message.type).to.equal('error');
			});
		});

		describe('Success', () => {
			it('Send MML message', async () => {
				const cmdChannel = authClient.channel('ai', 'excuse-test');
				await cmdChannel.watch();
				const cmd = '/mml-examples hi';
				const data = await cmdChannel.sendMessage({ text: cmd });
				expect(data.message.text).to.equal(cmd);
				expect(data.message.mml).to.equal(
					'\n\t\t<mml name="message">\n\t\t\t<text>Hi!</text>\n\t\t</mml>\n\t',
				);
			});
		});
	});

	describe('Slash Commands', () => {
		describe('Success', () => {
			it('Giphy Integration', async () => {
				const text = '/giphy rock';
				const data = await channel.sendMessage({ text });
				expect(data.message.command).to.equal('giphy');
				expect(data.message.type).to.equal('ephemeral');
				expect(data.message.args).to.equal('rock');
			});

			it('Giphy Action Send', async () => {
				const text = '/giphy wave';
				const data = await channel.sendMessage({ text });
				const firstImage = data.message.attachments[0].thumb_url;
				const messageID = data.message.id;
				const actionData = await channel.sendAction(messageID, {
					image_action: 'shuffle',
				});
				const selectedImage = actionData.message.attachments[0].thumb_url;
				expect(selectedImage).to.not.equal(firstImage);
				expect(actionData.message.type).to.equal('ephemeral');
				const sendData = await channel.sendAction(messageID, {
					image_action: 'send',
				});
				expect(sendData.message.type).to.equal('regular');
				expect(sendData.message.attachments[0].thumb_url).to.equal(selectedImage);
			});

			it('Giphy Action Cancel', async () => {
				const text = '/giphy wave';
				let response;
				try {
					response = await channel.sendMessage({ text });
				} catch (e) {
					return;
				}

				const messageID = response.message.id;
				const actionResponse = await channel.sendAction(messageID, {
					image_action: 'cancel',
				});
				expect(actionResponse.message).to.equal(null);
			});
		});
	});

	describe('Query Users', () => {
		const userMap = {};
		const users = [];
		const unique = uuidv4();
		const username = function (index) {
			return 'user-query-' + unique + '-' + index.toString();
		};
		before(async () => {
			//create 10 users
			for (let i = 0; i < 10; i++) {
				const user = {
					id: username(i),
					name: username(i),
					test_key: unique,
					status: 'busy',
					image: 'myimageurl',
					role: 'user',
					shadow_banned: false,
				};

				users[i] = (await serverAuthClient.upsertUser(user)).users[username(i)];
				userMap[username(i)] = users[i];
			}
		});
		it.skip('search users', async () => {
			//todo adjust to use $autocomplete
			const response = await authClient.queryUsers(
				{ id: 'user-query-' + unique + '-' },
				{},
				{ presence: false },
			);
			expect(response.users.length).equal(10);
		});
		it('get users $in', async () => {
			const response = await authClient.queryUsers(
				{ id: { $in: [username(0)] } },
				{},
				{ presence: false },
			);
			expect(response.users.length).equal(1);
			expect(response.users[0]).to.be.eql(users[0]);
		});
		it('get users $in query bad format', function (done) {
			authClient
				.queryUsers({ id: { $in: username(0) } }, {}, { presence: false })
				.then(() => done('should fail'))
				.catch(() => {
					done();
				});
		});
		it('search users with custom field test_key', async () => {
			const response = await authClient.queryUsers(
				{ test_key: unique },
				{},
				{ presence: false },
			);
			expect(response.users.length).equal(10);
			expect(response.users).to.be.eql(users.reverse());
		});
		it('filter using and logical operator', async () => {
			const response = await authClient.queryUsers(
				{ $and: [{ test_key: unique }, { id: { $gte: username(8) } }] },
				{},
				{ presence: false },
			);
			expect(response.users.length).equal(2);
			expect(response.users).to.be.eql([
				userMap[username(9)],
				userMap[username(8)],
			]);
		});
	});

	describe('Queries', () => {
		/*
		 * - Get the channel settings
		 * - Number of members
		 * - Number of members that are online
		 * - List of members
		 * - Message History?
		 * - Maybe GraphQL?
		 */
		it('Pagination on Messages', async () => {
			const id = uuidv4();
			const paginationChannel = authClient.channel('livestream', id);
			await paginationChannel.create();

			// add 5 messages so we can test pagination
			for (let i = 0; i < 5; i++) {
				const p = paginationChannel.sendMessage({ text: `say hi ${i}` });
				await p;
			}
			// read the first page
			let result = await paginationChannel.query({
				messages: { limit: 2, offset: 0 },
			});
			expect(result.messages.length).to.equal(2);
			// read the second page
			const oldestMessage = result.messages[0];
			result = await paginationChannel.query({
				messages: { limit: 2, id_lt: oldestMessage.id },
			});
			expect(result.messages.length).to.equal(2);
			// verify that the id lte filter works
			for (const m of result.messages) {
				const createdAt = new Date(m.created_at);
				const oldestMessageCreatedAt = new Date(oldestMessage.created_at);
				expect(createdAt).to.be.below(oldestMessageCreatedAt);
			}
			// the state should have 4 messages
			expect(paginationChannel.state.messages.length).to.equal(4);

			// read non-existing page
			result = await paginationChannel.query({
				messages: { limit: 2, offset: 6 },
			});

			expect(result.messages.length).to.equal(0);
		});
		it('Pagination on Members', async () => {
			const id = uuidv4();
			await serverAuthClient.upsertUsers([
				{ id: 'wendy' },
				{ id: 'helen' },
				{ id: 'marty' },
				{ id: 'charlotte' },
			]);
			// add 4 members so we can test pagination
			const c = authClient.channel('commerce', id, {
				members: ['wendy', 'helen', 'marty', 'charlotte'],
				moderators: [],
				admins: [],
				name: 'everyone along the rivers',
			});
			await c.watch();

			// read the first page
			let result = await c.query({ members: { limit: 2, offset: 0 } });
			expect(result.members.length).to.equal(2);

			result = await c.query({ members: { limit: 2, offset: 2 } });
			expect(result.members.length).to.equal(2);

			// read non-existing page
			result = await c.query({ members: { limit: 2, offset: 4 } });
			expect(result.members.length).to.equal(0);
		});
	});

	describe('Channel Edits', () => {
		/*
		 * You can subscribe to a channel. Subscriptions are not stored and go away.
		 * Members are someone who is permanently attached to the conversation. (You get a push update)
		 */

		before(async () => {
			await createUsers(['wendy', 'helen']);
		});

		it('Init channel with members', async () => {
			const b = authClient.channel('commerce', 'ozark', {
				members: ['helen', 'wendy'],
				name: 'a very dark conversation',
			});
			const state = await b.watch();
			expect(state.members.length).to.equal(2);
			expect(state.members[0].user.id).to.equal('helen');
			expect(state.members[1].user.id).to.equal('wendy');
		});

		it('thierry should not be in membership', async () => {
			const b = authClient.channel('commerce', 'ozark', {
				members: ['helen', 'wendy'],
				name: 'a very dark conversation',
			});
			const state = await b.watch();
			expect(state.membership).to.equal(null);
		});

		it('helen should not be in membership', async () => {
			const client = await getTestClientForUser('helen');
			const b = client.channel('commerce', 'ozark', {
				members: ['helen', 'wendy'],
				name: 'a very dark conversation',
			});
			const state = await b.watch();
			expect(state.membership).to.not.equal(null);
			expect(state.membership.user).to.not.equal(null);
			expect(state.membership.user.id).to.equal('helen');
			expect(state.membership.role).to.equal('member');
			expect(state.membership.user.role).to.equal('user');
		});

		it('Add and remove members should return the correct member count', async () => {
			// change the access, add members and remove members
			await conversation.addMembers(['tommaso', 'thierry']);
			await conversation.removeMembers(['thierry']);
			await conversation.addMembers(['thierry']);
			const state = await conversation.query();

			expect(state.channel.member_count).to.equal(2);
		});

		it('Change the name and set a custom color', (done) => {
			async function runTest() {
				let eventCount = 0;
				channel.on('channel.updated', (event) => {
					expect(event.channel.color).to.equal('green');
					eventCount += 1;
					if (eventCount === 2) {
						channel.listeners = {};
						done();
					}
				});
				channel.on('message.new', (event) => {
					expect(event.message.type).to.equal('system');

					eventCount += 1;
					if (eventCount === 2) {
						channel.listeners = {};
						done();
					}
				});

				// we would like to show a message:
				// thierry changed the channel color to green
				const response = await channel.update(
					{
						name: 'myspecialchannel',
						color: 'green',
					},
					{ text: 'Thierry changed the channel color to green' },
				);
				expect(response.channel.color).to.equal('green');
				expect(response.channel.name).to.equal('myspecialchannel');
			}
			runTest().catch((exc) => {
				done(exc);
			});
		});
		it('Freeze a channel', async () => {
			//
			const testChannel = authClient.channel('livestream', 'freeze');
			await testChannel.watch();
			const response = await testChannel.update({
				frozen: true,
			});
			expect(response.channel.frozen).to.be.true;
		});
		it.skip('Add and remove members', async () => {
			// TODO: remove members sometimes doesnt work
			// change the access, add members and remove members
			await conversation.addMembers(['tommaso', 'thierry']);
			await conversation.removeMembers(['tommaso']);
			const state = await conversation.query();
			expect(state.members.length).to.equal(1);
			expect(state.members[0].user.id).to.eql('thierry');
		});
	});

	describe('Events', () => {
		it('Message Read', async () => {
			conversation.on('message.read', (event) => {
				expect(event.user.id).to.equal('thierry2');
				expect(conversation.state.read.thierry2).to.not.be.null;
			});
			const data = await conversation.sendEvent({
				type: 'message.read',
			});
			expect(data.event.user.id).to.equal('thierry2');
			expect(data.event.type).to.equal('message.read');
			// verify that we persisently tracked this in the channel state
			const state = await conversation.query();
			expect(state.read.thierry2).to.not.be.null;
		});

		it.skip('Message Read & Last Message', async () => {
			for (let i = 1; i <= 7; i++) {
				const text = `message-${i}`;
				await conversation.sendMessage({ text });
			}
			await new Promise((resolve) => setTimeout(resolve, 2000));
			const lastMessage = conversation.lastMessage();
			expect(lastMessage.text).to.equal('message-7');
		});

		const events = ['message.read', 'typing.start', 'typing.stop'];

		it('Supported events', async () => {
			const permittedChan = authClient.channel('messaging', 'awesome-group-1');
			await permittedChan.watch();
			for (const event of events) {
				const response = permittedChan.sendEvent({
					type: event,
				});
				await expect(response).to.be.fulfilled;
			}
		});

		it('Unsupported events', async () => {
			const notPermittedChan = authClient.channel('livestream', 'circonflexes');
			await notPermittedChan.watch();
			for (const event of events) {
				await expectHTTPErrorCode(
					400,
					notPermittedChan.sendEvent({
						type: event,
					}),
				);
			}
		});

		it('should allow .off() on unwatched channels', () => {
			const client = getTestClient(false);
			const userID = uuidv4();

			client.connectUser({ id: userID }, createUserToken(userID));
			const channel = client.channel('messaging', uuidv4());
			let result;
			try {
				channel.off('message.new');
				result = true;
			} catch (e) {
				result = false;
			}

			expect(result).to.be.ok;
		});
	});

	describe('Typing Events', () => {
		let eventChannel;
		beforeEach(async () => {
			eventChannel = authClient.channel('messaging', uuidv4(), {
				members: ['thierry', 'tommaso'],
			});
			await eventChannel.watch();
		});

		/*
		 * Events enable the typing start, typing stop and mark read states
		 */
		it('Typing Start', async () => {
			// run for 5 seconds or till typing.stop is received
			await eventChannel.sendEvent({ type: 'typing.start' });
		});

		it('Typing Stop', function (done) {
			(async () => {
				eventChannel.on('typing.stop', (event) => {
					// start, stop
					expect(event.parent_id).to.be.equal(undefined);
					expect(eventChannel.state.typing.asMutable()).to.deep.equal({});
					done();
				});

				eventChannel.on('typing.start', (event) => {
					expect(event.parent_id).to.be.equal(undefined);
				});

				// run for 5 seconds or till typing.stop is received
				await eventChannel.sendEvent({ type: 'typing.start' });
				await eventChannel.sendEvent({ type: 'typing.stop' });
			})().catch(done);
		});

		it('Typing events in Thread', function (done) {
			(async () => {
				const {
					message: { id },
				} = await eventChannel.sendMessage({ text: 'message' });

				const timeout = setTimeout(() => {
					throw new Error('Typing tests took too long');
				}, 15000);

				let started = false;
				eventChannel.on('typing.stop', (event) => {
					if (!started) throw new Error('typing.start event failed');

					expect(event.parent_id).to.be.equal(id);
					expect(eventChannel.state.typing.asMutable()).to.deep.equal({});
					clearTimeout(timeout);
					done();
				});

				eventChannel.on('typing.start', (event) => {
					expect(event.parent_id).to.be.equal(id);
					expect(eventChannel.state.typing.asMutable()).to.not.be.empty;
					started = true;
				});

				await eventChannel.sendEvent({ type: 'typing.start', parent_id: id });
				await eventChannel.sendEvent({ type: 'typing.stop', parent_id: id });
			})().catch(done);
		});

		it('Keystroke in thread', (done) => {
			(async () => {
				const {
					message: { id },
				} = await eventChannel.sendMessage({ text: 'message' });

				eventChannel.on('typing.start', (event) => {
					expect(event.parent_id).to.be.equal(id);
					done();
				});

				await eventChannel.keystroke(id);
			})().catch(done);
		});

		it('Typing Helpers', async () => {
			const waiter = createEventWaiter(eventChannel, 'typing.start');

			await eventChannel.keystroke();
			await eventChannel.keystroke();

			const events = await waiter;

			expect(events).to.have.length(1);
		});
	});

	describe('Channel State', () => {
		it('Should include last_message_at', async () => {
			const c = authClient.channel('messaging', uuidv4());
			await c.query();
			expect(c.state.last_message_at).to.be.null;
		});

		it('Should include last_message_at', async () => {
			const id = uuidv4();
			let c = authClient.channel('messaging', id);
			await c.create({ created_by: { id: uuidv4() } });
			await c.sendMessage({ text: uuidv4() });
			c = authClient.channel('messaging', id);
			await c.query();
			expect(c.state.last_message_at).to.be.not.null;
		});

		it('Should update last_message_at', async () => {
			const id = uuidv4();
			let c = authClient.channel('messaging', id);
			await c.create({ created_by: { id: uuidv4() } });
			await c.sendMessage({ text: uuidv4() });
			c = authClient.channel('messaging', id);
			await c.query({ watch: true });
			const lastMsg = c.state.last_message_at;
			expect(c.state.last_message_at).to.be.not.null;
			await sleep(1000);
			await c.sendMessage({ text: uuidv4() });
			await sleep(2000);
			expect(c.state.last_message_at).to.be.not.null;
			expect(c.state.last_message_at).to.be.not.eq(lastMsg);
			expect(Math.floor(c.state.last_message_at - lastMsg)).to.be.gt(0);
		});

		// This is to make sure event is handled on client and channel level before listeners are executed on them.
		it.skip('Should update before event listeners are executed', function (done) {
			async function runTest() {
				const id = uuidv4();
				const c = authClient.channel('messaging', id);
				const messageTexts = [uuidv4(), uuidv4(), uuidv4()];
				let numberOfMessages;

				authClient.on('message.new', () => {
					expect(c.state.messages.length).to.be.equal(numberOfMessages);
					expect(
						c.state.messages[c.state.messages.length - 1].text,
					).to.be.equal(messageTexts[numberOfMessages - 1]);
					numberOfMessages += 1;
					if (numberOfMessages === messageTexts.length - 1) done();
				});
				await c.watch();

				numberOfMessages = 1;
				await c.sendMessage({ text: messageTexts[0] });
				await c.sendMessage({ text: messageTexts[1] });
				await c.sendMessage({ text: messageTexts[2] });
			}

			runTest().catch((exc) => {
				done(exc);
			});
		});

		it('Remove Message', () => {
			const c = authClient.channel('twitch', 'state');
			const message = { id: 1, text: 'my message' };
			const message2 = { id: 2, text: 'my message 2' };
			c.state.messages = Immutable([message, message2]);
			c.state.removeMessage(message);
			expect(c.state.messages.length).to.equal(1);
		});

		it('Remove Ephemeral Message', () => {
			const c = authClient.channel('twitch', 'state');
			const message = { id: 1, text: 'my regular message', type: 'regular' };
			const message2 = {
				tmp_id: 2,
				text: 'my ephemeral message',
				type: 'ephemeral',
			};
			const message3 = {
				tmp_id: 3,
				text: 'my error message',
				type: 'error',
			};

			c.state.messages = Immutable([message, message2, message3]);
			c.state.filterErrorMessages(message);
			expect(c.state.messages.length).to.equal(2);
		});
	});

	describe('Channel moderators', () => {
		const chanName = uuidv4();
		let c;
		const userID = uuidv4();
		const client = getTestClient(false);

		before(async () => {
			c = serverAuthClient.channel('livestream', chanName, {
				created_by: { id: uuidv4() },
			});
			await c.create();
			await serverAuthClient.upsertUser({
				id: userID,
			});
			await client.connectUser({ id: userID }, createUserToken(userID));
			await client.channel('livestream', chanName).watch();
		});

		it('check that is a regular user first', async () => {
			const results = await c.query({
				members: { limit: 2, offset: 0 },
				watchers: { limit: 2, offset: 0 },
			});
			expect(results.members.length).to.equal(0);
			expect(results.watchers).to.exist;
			expect(results.watchers[0]).not.to.be.null;
			expect(results.watchers[0].role).to.eql('user');
			expect(results.watchers[0].id).to.eql(userID);
		});

		it('promoting a user to moderator', async () => {
			await c.addModerators([userID]);
			const results = await c.query({
				members: { limit: 2, offset: 0 },
				watchers: { limit: 2, offset: 0 },
			});
			expect(results.watchers[0]).not.to.be.null;
			expect(results.watchers[0].role).to.eql('user');
			expect(results.members[0].user.role).to.eql('user');
			expect(results.members[0].role).to.eql('moderator');
		});

		it('demoting a moderator', async () => {
			await c.demoteModerators([userID]);
			const results = await c.query({
				members: { limit: 2, offset: 0 },
				watchers: { limit: 2, offset: 0 },
			});
			expect(results.watchers[0]).not.to.be.null;
			expect(results.watchers[0].id).to.eql(userID);
			expect(results.watchers[0].role).to.eql('user');
			expect(results.members[0].role).to.eql('member');
			expect(results.members[0].user.id).to.eql(userID);
		});
	});

	describe('Guest users', () => {
		let client;
		let channel;
		const userID = 'tommaso-' + uuidv4();
		const channelID = `free4all-` + uuidv4();

		it('Create a guest session', async () => {
			client = getTestClient(false);
			await client.setGuestUser({ id: userID });
			const c = serverAuthClient.channel('livestream', channelID, {
				created_by: { id: uuidv4() },
			});
			await c.create();
		});

		it('join a live stream channel', async () => {
			channel = client.channel('livestream', channelID);
			await channel.watch();
		});

		it('query channel', async () => {
			channel = client.channel('livestream', channelID);
			const response = await channel.query({
				watchers: { limit: 10 },
				state: true,
			});
			expect(response.watchers[0].role).to.eql('guest');
		});
	});

	describe('Custom events', () => {
		let channel;
		let client;
		let serverChannel;
		const channelID = uuidv4();
		let client2;
		let otherUserChannel;
		const userID = uuidv4();
		const otherUserID = uuidv4();

		it('enable custom events for livesteam', async () => {
			await serverAuthClient.updateChannelType('livestream', {
				custom_events: true,
			});
		});

		it('send a custom event to a livestream channel', async () => {
			client = await getTestClientForUser(userID);
			client2 = await getTestClientForUser(otherUserID);

			serverChannel = serverAuthClient.channel('livestream', channelID, {
				created_by: { id: uuidv4() },
			});

			channel = client.channel('livestream', channelID);
			await channel.watch();

			otherUserChannel = client2.channel('livestream', channelID);
			await otherUserChannel.watch();

			const waiter = createEventWaiter(otherUserChannel, 'custom-event');
			await channel.sendEvent({ type: 'custom-event' });

			const eventsReceived = await waiter;

			expect(eventsReceived).to.have.length(1);
			expect(eventsReceived[0].type).to.eql('custom-event');
			expect(eventsReceived[0].user).to.not.be.undefined;
			expect(eventsReceived[0].user.id).to.not.be.undefined;
		});

		it('send a custom event with custom data', async () => {
			const waiter = createEventWaiter(otherUserChannel, 'custom-event-with-data');
			await channel.sendEvent({ type: 'custom-event-with-data', color: 'red' });

			const eventsReceived = await waiter;
			expect(eventsReceived).to.have.length(1);
			expect(eventsReceived[0].type).to.eql('custom-event-with-data');
			expect(eventsReceived[0].color).to.eql('red');
		});

		it('disable custom events for livestream', async () => {
			await serverAuthClient.updateChannelType('livestream', {
				custom_events: false,
			});
			const p = channel.sendEvent({ type: 'custom-event-with-data', color: 'red' });
			await expect(p).to.be.rejectedWith(
				'Channel type livestream does not support custom events',
			);
		});

		it('re-enable custom events for livesteam', async () => {
			await serverAuthClient.updateChannelType('livestream', {
				custom_events: true,
			});
		});

		it('send a custom event to messaging channel - permission checks', async () => {
			let chan = serverAuthClient.channel('messaging', channelID, {
				created_by: { id: uuidv4() },
				members: [userID],
			});
			await chan.create();

			chan = client.channel('messaging', channelID);
			await chan.watch();
			await chan.sendEvent({ type: 'custom-event' });

			chan = client2.channel('messaging', channelID);
			chan.initialized = true; // force event sending by changing internal state
			const p = chan.sendEvent({ type: 'custom-event' });

			await expect(p).to.be.rejectedWith(
				`User '${otherUserID}' with role user is not allowed to access Resource SendCustomEvent on channel type messaging`,
			);
		});
	});

	describe('Anonymous users', () => {
		let client;
		let channel;
		let serverChannel;
		const channelID = uuidv4();
		const owner = { id: uuidv4() };

		it('Create an anonymous session', async () => {
			client = getTestClient(false);
			await client.connectAnonymousUser();
			serverChannel = serverAuthClient.channel('livestream', channelID, {
				created_by: owner,
			});
			await serverChannel.create();
		});

		it('join a live stream channel', async () => {
			channel = client.channel('livestream', channelID);
			await channel.watch();
		});

		it('query channel should not show anon users', async () => {
			channel = client.channel('livestream', channelID);
			const response = await channel.query({ watchers: { limit: 10 } });
			expect(response.watchers).to.not.eql({});
			const fk = Object.keys(response.watchers)[0];
			expect(response.watchers[fk].id.slice(0, 5)).to.eql('!anon');
			expect(response.watchers[fk].role).to.eql('anonymous');
		});

		it('it should receive messages', function (done) {
			channel.on('message.new', (event) => {
				if (event.message.text === 'helloworld :world: rocks 123') {
					done();
				}
			});

			serverChannel
				.sendMessage({ text: 'helloworld :world: rocks 123', user: owner })
				.catch((e) => {
					done('failed to send a message!');
				});
		});
	});

	describe('User custom fields', () => {
		let userClient;
		let chan;
		const userData = {
			id: uuidv4(),
			preferred_editor: 'ed',
			knows_klingon: true,
		};

		const oversizeUserData = {
			id: uuidv4(),
			oversize1: 'x'.repeat(3 * 1024),
			oversize2: 'x'.repeat(3 * 1024),
		};

		before(async () => {
			userClient = getTestClient(false);
			await userClient.connectUser(userData, createUserToken(userData.id));
			chan = userClient.channel('livestream', 'dnd');
			await chan.watch();
			await chan.watch();
		});

		it('test add member behaviour for nick', async () => {
			const response = await authClient
				.channel('livestream', 'dnd')
				.addMembers([userData.id]);
			expect(response.channel.members).to.be.undefined;
			expect(response.members).to.not.be.undefined;
		});

		it('connectUser should not remove custom fields', async () => {
			userClient = getTestClient(false);
			const response = await userClient.connectUser(
				{ id: userData.id, new_field: 'yes' },
				createUserToken(userData.id),
			);
			expect(response.me.knows_klingon).to.eq(true);
			expect(response.me.new_field).to.eq('yes');
		});

		it('custom fields must be less than 5KB total', async () => {
			const client = getTestClient(false);
			await expectHTTPErrorCode(
				413,
				client.connectUser(
					oversizeUserData,
					createUserToken(oversizeUserData.id),
				),
			);
		});
	});

	describe('Get message', () => {
		let serverClient;
		let channel;
		const channelID = uuidv4();
		const thierry = {
			id: uuidv4(),
		};
		let message;

		before(async () => {
			serverClient = getServerTestClient();
			await serverClient.upsertUser(thierry);
			channel = serverClient.channel('team', channelID, {
				created_by: { id: thierry.id },
				members: [thierry.id],
			});
			await channel.create();
			const r = await channel.sendMessage({
				text: '@thierry how are you doing?',
				user: thierry,
			});
			message = r.message;
			delete message.user.online;
			delete message.user.last_active;
			delete message.user.updated_at;
		});

		it('should return a 404 for a message that does not exist', () => {
			const p = serverClient.getMessage('bad message');
			expect(p).to.be.rejectedWith('message with id bad message not found');
		});

		it('server side get a message should work', async () => {
			const r = await serverClient.getMessage(message.id);
			expect(r.message.channel.id).to.eq(channelID);
			expect(r.message.channel.created_by.id).to.eq(thierry.id);
			delete r.message.user.online;
			delete r.message.user.last_active;
			delete r.message.user.updated_at;
			delete r.message.channel;
			expect(r.message).to.deep.eq(message);
		});

		it('client side get a message should work', async () => {
			const client = await getTestClientForUser(thierry.id);
			const r = await client.getMessage(message.id);
			expect(r.message.channel.id).to.eq(channelID);
			expect(r.message.channel.created_by.id).to.eq(thierry.id);
			delete r.message.user.online;
			delete r.message.user.last_active;
			delete r.message.user.updated_at;
			delete r.message.channel;
			expect(r.message).to.deep.eq(message);
		});

		it('client side get a message does permission checking', async () => {
			const uid = uuidv4();
			const client = await getTestClientForUser(uid);
			expect(client.getMessage(message.id)).to.be.rejectedWith(
				`User '${uid}' with role user is not allowed to access Resource ReadChannel on channel type team`,
			);
		});
	});

	describe('Mentions', () => {
		let channel;
		const userID = 'tommaso-' + uuidv4();
		const channelID = `free4all-` + uuidv4();
		const thierry = {
			id: uuidv4(),
			instrument: 'saxophone',
		};
		let msg;

		before(async () => {
			await getTestClient(true).upsertUser(thierry);
			await getTestClient(true).upsertUser({ id: userID, instrument: 'guitar' });
			channel = serverAuthClient.channel('team', channelID, {
				created_by: { id: thierry.id },
				members: [userID, thierry.id],
			});
			await channel.create();
		});

		it('should validate that mentioned_users is a list of existing user IDs', (done) => {
			channel
				.sendMessage({
					text: '@thierry how are you doing?',
					user: { id: userID },
					mentioned_users: thierry.id,
				})
				.then(() => done('should have failed but it did not'))
				.catch(() => done());
		});

		it('mentioned_users on sendMessage should be accepted', async () => {
			msg = await channel.sendMessage({
				text: '@thierry how are you doing?',
				user: { id: userID },
				mentioned_users: [thierry.id],
			});
		});

		it('mentioned_users should be returned as a list of full users by send message', () => {
			expect(msg.message.mentioned_users).to.be.an('array');
			expect(msg.message.mentioned_users).to.have.length(1);
			expect(msg.message.mentioned_users[0]).to.be.an('object');
			expect(msg.message.mentioned_users[0].id).to.eq(thierry.id);
		});

		it('mentioned_users should be returned as a list of full users in channel state', async () => {
			await channel.query();
			msg = channel.state.messages[0];
			expect(msg.mentioned_users).to.be.an('array');
			expect(msg.mentioned_users).to.have.length(1);
			expect(msg.mentioned_users[0]).to.be.an('object');
			expect(msg.mentioned_users[0].id).to.eq(thierry.id);
			expect(msg.mentioned_users[0].instrument).to.eq('saxophone');
		});

		it('channel.countUnreadMentions should return 1', async () => {
			const client = await getTestClientForUser(thierry.id);
			const channel = client.channel('team', channelID);
			await channel.watch();
			expect(channel.countUnreadMentions()).to.eq(1);
		});

		it('channel.countUnreadMentions should return 0 for own messages', async () => {
			const client = await getTestClientForUser(userID);
			const channel = client.channel('team', channelID);
			await channel.watch();
			expect(channel.countUnreadMentions()).to.eq(0);
		});

		it('should be possible to edit the list of mentioned users', async () => {
			const client = getTestClient(true);
			const response = await client.updateMessage(
				{ id: msg.id, text: msg.text, mentioned_users: [userID] },
				thierry.id,
			);
			expect(response.message.mentioned_users[0].instrument).to.eq('guitar');
			channel = serverAuthClient.channel('team', channelID);
			await channel.query();
			msg = channel.state.messages[0];
			expect(msg.mentioned_users).to.be.an('array');
			expect(msg.mentioned_users).to.have.length(1);
			expect(msg.mentioned_users[0]).to.be.an('object');
			expect(msg.mentioned_users[0].id).to.eq(userID);
			expect(msg.mentioned_users[0].instrument).to.eq('guitar');
		});

		it('channel.countUnreadMentions should return 0 for another user', async () => {
			const client = await getTestClientForUser(thierry.id);
			const channel = client.channel('team', channelID);
			await channel.watch();
			await channel.markRead();
			await sleep(500);
			expect(channel.countUnreadMentions()).to.eq(0);
		});

		it('channel.countUnreadMentions should return 0 after calling markRead', async () => {
			const client = await getTestClientForUser(userID);
			const channel = client.channel('team', channelID);
			await channel.watch();
			await channel.markRead();
			await sleep(500);
			expect(channel.countUnreadMentions()).to.eq(0);
		});

		it('mentions inside replies should be enriched correctly', async () => {
			const response = await channel.sendMessage({
				text: '@thierry how are you doing?',
				user: { id: userID },
				mentioned_users: [thierry.id],
			});
			const replyResponse = await channel.sendMessage({
				text: '@tommaso I am doing great?',
				user: { id: thierry.id },
				mentioned_users: [userID],
				parent_id: response.message.id,
			});
			expect(replyResponse.message.mentioned_users).to.be.an('array');
			expect(replyResponse.message.mentioned_users).to.have.length(1);
			expect(replyResponse.message.mentioned_users[0]).to.be.an('object');
			expect(replyResponse.message.mentioned_users[0].id).to.eq(userID);
			expect(replyResponse.message.mentioned_users[0].instrument).to.eq('guitar');

			channel = serverAuthClient.channel('team', channelID);
			await channel.query();
			const parent = channel.state.messages[channel.state.messages.length - 1];
			const replies = await channel.getReplies(parent.id);
			expect(replies.messages[0].mentioned_users).to.be.an('array');
			expect(replies.messages[0].mentioned_users).to.have.length(1);
			expect(replies.messages[0].mentioned_users[0]).to.be.an('object');
			expect(replies.messages[0].mentioned_users[0].id).to.eq(userID);
			expect(replies.messages[0].mentioned_users[0].instrument).to.eq('guitar');
		});
	});

	describe('Hiding channels', () => {
		let client, channel, channel2;
		const userID = uuidv4();
		const hiddenID = uuidv4();
		const notHiddenID = uuidv4();
		const unique = uuidv4();

		before(async () => {
			client = await getTestClientForUser(userID, 'test', { color: 'green' });
			channel = client.channel('team', hiddenID, {
				unique,
			});
			await channel.watch();
			channel2 = client.channel('messaging', notHiddenID, {
				unique,
			});
			await channel2.watch();
		});

		it('Hide a channel for a user', async () => {
			await channel.hide();
		});

		it('Hidden channel should not be in query channels results', async () => {
			const channels = await client.queryChannels({ unique });
			expect(channels).to.have.length(1);
			expect(channels[0].id).to.be.equal(notHiddenID);
		});

		it('Hidden channel should not be in query channels results when hidden false', async () => {
			const channels = await client.queryChannels({ unique, hidden: false });
			expect(channels).to.have.length(1);
			expect(channels[0].id).to.be.equal(notHiddenID);
		});

		it('Query channels allows you to list hidden channels', async () => {
			const channels = await client.queryChannels({ unique, hidden: true });
			expect(channels).to.have.length(1);
			expect(channels[0].id).to.be.equal(hiddenID);
		});

		it('When a new message is sent to the hidden channel', async () => {
			serverAuthClient = getTestClient(true);
			await createUsers([uuidv4()]);
			const channel2 = serverAuthClient.channel('team', hiddenID);
			await channel2.sendMessage({ text: 'wake up!', user_id: userID });
		});

		it('Should be listed by the query channels', async () => {
			const channels = await client.queryChannels({ id: hiddenID });
			expect(channels).to.have.length(1);
		});

		it('Show/Hide a channel', async () => {
			await channel.hide();
			await channel.show();
			const channels = await client.queryChannels({ id: hiddenID });
			expect(channels).to.have.length(1);
		});

		context('When hide channel with remove messages', () => {
			const channelID = uuidv4();
			const userID = uuidv4();

			let event;

			before(async () => {
				client = await getTestClientForUser(userID, 'test', { color: 'green' });
				channel = client.channel('team', channelID, { members: [userID] });
				await channel.watch();

				await channel.sendMessage({ text: 'channel hide test' });

				event = new Promise((resolve) => {
					channel.on('channel.hidden', (event) => {
						if (event.clear_history) {
							resolve();
						}
					});
				});

				await channel.hide(userID, true);

				await channel.show();
			});

			it('receives event', () => expect(event).to.be.fulfilled);

			it('removes messages for the channel', () => {
				expect(channel.state.messages).to.have.length(0);
			});

			it('removes messages for query channels', async () => {
				const channels = await client.queryChannels({ id: channelID });
				expect(channels).to.have.length(1);
				expect(channels[0].state.messages).to.have.length(0);
			});
		});
	});

	describe('Moderation', () => {
		serverAuthClient = getTestClient(true);

		const evil = {
			id: 'eviluser',
			name: 'Eviluser',
			status: 'busy',
			image: 'myimageurl',
			role: 'user',
		};

		const modUserID = uuidv4();

		before(async () => {
			await createUsers([modUserID]);
			await serverAuthClient.upsertUser(evil);
		});

		it('Ban', async () => {
			// ban a user for 60 minutes
			await serverAuthClient.banUser('eviluser', {
				timeout: 60,
				reason: 'Stop spamming your YouTube channel',
				banned_by_id: modUserID,
			});
		});
		it('Mute', async () => {
			const data = await authClient.muteUser('eviluser');
			expect(data.mute.user.id).to.equal('thierry2');
			expect(data.mute.target.id).to.equal('eviluser');
		});
		it('Unmute', async () => {
			const data = await authClient.unmuteUser('eviluser');
			expect(data).to.not.be.null;
		});
		it('Flag and Unflag a message ', async () => {
			//flag the message
			const text = 'Flag me, i dare you mods!';
			const messageResponse = await channel.sendMessage({ text });
			const data = await authClient.flagMessage(messageResponse.message.id);
			expect(data.flag.target_message_id.toString()).to.equal(
				messageResponse.message.id.toString(),
			);
			//flag the message again should fail
			try {
				await authClient.flagMessage(messageResponse.message.id);
				expect().fail('cannot flag twice');
			} catch (e) {
				expect(e).not.to.be.null;
			}
			//unflag the message
			const unflagData = await authClient.unflagMessage(messageResponse.message.id);
			expect(unflagData.flag.target_message_id).to.equal(
				messageResponse.message.id,
			);
			//unflag the message again should fail
			try {
				await authClient.unflagMessage(messageResponse.message.id);
				expect().fail('cannot unflag twice');
			} catch (e) {
				expect(e).not.to.be.null;
			}
		});

		it('Flag and Unflag a message server side', async () => {
			//flag the message
			const text = 'Flag me, i dare you mods!';
			const { message } = await channel.sendMessage({ text });
			const data = await serverAuthClient.flagMessage(message.id, {
				user_id: modUserID,
			});

			expect(data.flag.target_message_id.toString()).to.equal(
				message.id.toString(),
			);
			expect(data.flag.user.id).to.equal(modUserID);

			//unflag the message
			const unflagData = await serverAuthClient.unflagMessage(message.id, {
				user_id: modUserID,
			});
			expect(unflagData.flag.target_message_id).to.equal(message.id);
			expect(unflagData.flag.user.id).to.equal(modUserID);
		});

		it('Flag and Unflag a user ', async () => {
			//flag the user
			const data = await authClient.flagUser('eviluser');
			expect(data.flag.target_user.id).to.equal('eviluser');
			//flag the message again should fail
			try {
				await authClient.flagUser('eviluser');
				expect().fail('cannot flag a user twice');
			} catch (e) {
				expect(e).not.to.be.null;
			}
			//unflag the user
			const unflagData = await authClient.unflagUser('eviluser');
			expect(unflagData.flag.target_user.id).to.equal('eviluser');
			//unflag the message again should fail
			try {
				await authClient.unflagUser('eviluser');
				expect().fail('cannot unflag the user twice');
			} catch (e) {
				expect(e).not.to.be.null;
			}
		});

		it('Flag and Unflag a user server side ', async () => {
			//flag the user
			const data = await serverAuthClient.flagUser('eviluser', {
				user_id: modUserID,
			});
			expect(data.flag.target_user.id).to.equal('eviluser');
			expect(data.flag.user.id).to.equal(modUserID);

			//unflag the user
			const unflagData = await serverAuthClient.unflagUser('eviluser', {
				user_id: modUserID,
			});
			expect(unflagData.flag.target_user.id).to.equal('eviluser');
			expect(unflagData.flag.user.id).to.equal(modUserID);
		});

		it.skip('Automod Simple', async () => {
			const text = 'MongoDB is such a fucking piece of shit';
			const data = await channel.sendMessage({ text });
			expect(data.message.type).to.equal('error');
		});
		it.skip('Automod AI', async () => {
			const aiChannel = authClient.channel('ai', 'test');
			await aiChannel.watch();
			const text =
				'80% off Loutis Vuitton Handbags Save up to 80% off ! Free shipping! Right Now ! Snap it up 2.vadsv.uk';
			const data = await aiChannel.sendMessage({ text });
			expect(data.message.type).to.equal('error');
		});
	});

	describe('channel.getMessagesById', () => {
		let channel;
		const user = uuidv4();
		const msgIds = [uuidv4(), uuidv4()];

		before(async () => {
			const client = await getTestClientForUser(user);
			channel = client.channel('messaging', uuidv4(), {
				members: [user],
			});
			await channel.create();
			await channel.sendMessage({ id: msgIds[0], text: 'text' });
			await channel.sendMessage({ id: msgIds[1], text: 'text' });
			await channel.sendReaction(msgIds[0], { type: 'like' });
			await channel.sendReaction(msgIds[1], { type: 'like' });
		});

		it('empty list', async () => {
			const p = channel.getMessagesById([]);
			await expect(p).to.be.rejectedWith(
				'StreamChat error code 4: GetManyMessages failed with error: "ids is a required field',
			);
		});

		it('get one message and check reactions are populated', async () => {
			const response = await channel.getMessagesById([msgIds[0]]);
			expect(response.messages).to.be.an('array');
			expect(response.messages).to.have.length(1);
			expect(response.messages[0].id).to.eq(msgIds[0]);
			expect(response.messages[0].own_reactions).to.be.an('array');
			expect(response.messages[0].own_reactions).to.have.length(1);
			expect(response.messages[0].latest_reactions).to.be.an('array');
			expect(response.messages[0].latest_reactions).to.have.length(1);
		});

		it('get two message', async () => {
			const response = await channel.getMessagesById(msgIds);
			expect(response.messages).to.be.an('array');
			expect(response.messages).to.have.length(2);
			expect(msgIds.indexOf(response.messages[0].id)).to.not.eq(-1);
			expect(msgIds.indexOf(response.messages[1].id)).to.not.eq(-1);
		});
	});

	describe('unread counts for messages send by muted users', () => {
		const user1 = uuidv4();
		const user2 = uuidv4(); //muted by user 1
		const user3 = uuidv4();
		let channel;
		let client1, client2, client3;

		//create a channel with 3 users
		before(async () => {
			await createUsers([user1, user2, user3]);
			client1 = await getTestClientForUser(user1);
			client2 = await getTestClientForUser(user2);
			client3 = await getTestClientForUser(user3);
			channel = client1.channel('messaging', uuidv4(), {
				members: [user1, user2, user3],
			});
			await channel.create();
		});
		it('user1 mute user2', async () => {
			await client1.muteUser(user2);
		});
		it('messages sent by user2 dont increase unread counts for user 1', async () => {
			const ch = client2.channel(channel.type, channel.id);
			await ch.sendMessage({
				text: 'this message should only increase unread counts for user 3',
			});
			client1 = await getTestClientForUser(user1);
			expect(client1.health.me.total_unread_count).to.be.equal(0);
			expect(client1.health.me.unread_channels).to.be.equal(0);
			client2 = await getTestClientForUser(user2);
			expect(client2.health.me.total_unread_count).to.be.equal(0);
			expect(client2.health.me.unread_channels).to.be.equal(0);
			client3 = await getTestClientForUser(user3);
			expect(client3.health.me.total_unread_count).to.be.equal(1);
			expect(client3.health.me.unread_channels).to.be.equal(1);
		});
	});

	describe('Upload', () => {
		context('When channel type has uploads enabled', () => {
			const channelType = uuidv4();

			let client;
			let channel;

			before(async () => {
				const serverClient = getServerTestClient();
				const newChannelType = await serverClient.createChannelType({
					name: channelType,
					commands: ['all'],
					uploads: true,
				});
				client = await getTestClientForUser(uuidv4());
				channel = await client.channel(channelType, uuidv4());
				await channel.watch();
			});

			it('Upload a file with specific name', async () => {
				const file = fs.createReadStream('./helloworld.txt');
				const data = await channel.sendFile(file, 'XX.txt');

				expect(data.file).to.be.not.empty;
				expect(data.file.includes('XX.txt?')).to.be.ok;
			});

			it('Upload a file without name', async () => {
				const file = fs.createReadStream('./helloworld.txt');
				const data = await channel.sendFile(file);

				expect(data.file).to.be.not.empty;
				expect(data.file.includes('helloworld.txt?')).to.be.ok;
			});

			it('Upload a stream', (done) => {
				https.get('https://nodejs.org/static/legacy/images/logo.png', (file) => {
					channel.sendFile(file).then((data) => {
						expect(data.file).to.be.not.empty;
						expect(data.file.includes('logo.png?')).to.be.ok;
						done();
					});
				});
			});

			it('Upload a buffer', async () => {
				const file = Buffer.from('random string');
				const data = await channel.sendFile(file, 'hello_world.txt');
				expect(data.file).to.be.not.empty;
				expect(data.file.includes('hello_world.txt?')).to.be.ok;
			});

			it('Upload an image', async () => {
				const file = fs.createReadStream('./helloworld.jpg');
				const data = await channel.sendImage(file, 'hello_world.jpg');
				expect(data.file).to.be.not.empty;
				expect(data.file.includes('hello_world.jpg?')).to.be.ok;
			});

			it('Upload a less common image format', async () => {
				const file = fs.createReadStream('./helloworld.heic');
				const data = await channel.sendImage(file, 'hello_world.heic');
				expect(data.file).to.be.not.empty;
				expect(data.file.includes('hello_world.heic?')).to.be.ok;
			});

			it('File upload entire flow', async () => {
				const promises = [
					channel.sendImage(
						fs.createReadStream('./helloworld.jpg'),
						'hello_world1.jpg',
					),
					channel.sendImage(
						fs.createReadStream('./helloworld.jpg'),
						'hello_world2.jpg',
					),
				];
				const results = await Promise.all(promises);
				const attachments = results.map((response) => ({
					type: 'image',
					thumb_url: response.file,
					asset_url: response.file,
				}));
				const response = await channel.sendMessage({
					text: 'Check out what is uploaded in parallel',
					attachments,
				});
				expect(response.message.attachments).to.deep.equal(attachments);
			});
		});

		context('When channel type has uploads disabled', () => {
			const channelType = uuidv4();
			const errorMessage = new RegExp(
				`channel type ${channelType} has upload disabled`,
			);

			let client;
			let channel;

			before(async () => {
				const serverClient = getServerTestClient();
				const newChannelType = await serverClient.createChannelType({
					name: channelType,
					commands: ['all'],
					uploads: false,
				});
				client = await getTestClientForUser(uuidv4());
				channel = await client.channel(channelType, uuidv4());
				await channel.watch();
			});

			it('Do not upload a file', () => {
				const file = fs.createReadStream('./helloworld.txt');
				return expect(
					channel.sendFile(file, 'hello_world.txt'),
				).to.be.rejectedWith(errorMessage);
			});

			it('Do not upload an image', () => {
				const file = fs.createReadStream('./helloworld.jpg');
				return expect(
					channel.sendImage(file, 'hello_world.jpg'),
				).to.be.rejectedWith(errorMessage);
			});
		});
	});
});

describe('paginate order with id_gt{,e}', () => {
	let channel;
	let client;
	const user = uuidv4();
	before(async () => {
		client = await getTestClientForUser(user);
		channel = client.channel('messaging', uuidv4());
		await channel.create();
		for (let i = 1; i <= 10; i++) {
			await channel.sendMessage({
				text: user + i.toString(),
				id: user + i.toString(),
			});
		}
	});
	it('id_gte=5 should return message 5 to 6', async () => {
		const result = await channel.query({
			messages: { limit: 2, id_gte: user + (5).toString() },
		});
		expect(result.messages.length).to.be.equal(2);
		expect(result.messages[0].id).to.be.equal(user + (5).toString());
		expect(result.messages[1].id).to.be.equal(user + (6).toString());
	});

	it('id_gt=5 should return message 6 to 7', async () => {
		const result = await channel.query({
			messages: { limit: 2, id_gt: user + (5).toString() },
		});
		expect(result.messages.length).to.be.equal(2);
		expect(result.messages[0].id).to.be.equal(user + (6).toString());
		expect(result.messages[1].id).to.be.equal(user + (7).toString());
	});

	it('id_lte=5 should return message 4 to 5', async () => {
		const result = await channel.query({
			messages: { limit: 2, id_lte: user + (5).toString() },
		});
		expect(result.messages.length).to.be.equal(2);
		expect(result.messages[0].id).to.be.equal(user + (4).toString());
		expect(result.messages[1].id).to.be.equal(user + (5).toString());
	});

	it('id_lt=5 should return message 3 to 4', async () => {
		const result = await channel.query({
			messages: { limit: 2, id_lt: user + (5).toString() },
		});
		expect(result.messages.length).to.be.equal(2);
		expect(result.messages[0].id).to.be.equal(user + (3).toString());
		expect(result.messages[1].id).to.be.equal(user + (4).toString());
	});
});

describe('warm up', () => {
	let channel;
	let client;
	const user = uuidv4();
	it('shouldReuseConnection', async () => {
		const baseUrl = 'https://chat-us-east-1.stream-io-api.com';
		const client = getTestClient(true);
		client.setBaseURL(baseUrl);
		const health = await client.connectUser({ id: user }, createUserToken(user));
		client.health = health;
		channel = await client.channel('messaging', uuidv4());

		// populate cache
		await channel.query();

		// first client uses warmUp
		const warmUpClient = getTestClientWithWarmUp();
		warmUpClient.setBaseURL(baseUrl);
		warmUpClient.health = await warmUpClient.connectUser(
			{ id: user },
			createUserToken(user),
		);

		let t0 = new Date().getTime();
		await warmUpClient.channel(channel.type, channel.id).query();
		let t1 = new Date().getTime();
		const withWarmUpDur = t1 - t0;
		console.log('time taken with warm up ' + withWarmUpDur + ' milliseconds.');

		// second client without warmUp
		const noWarmUpClient = getTestClient(false);
		noWarmUpClient.setBaseURL(baseUrl);
		noWarmUpClient.health = await noWarmUpClient.connectUser(
			{ id: user },
			createUserToken(user),
		);
		t0 = new Date().getTime();
		await noWarmUpClient.channel(channel.type, channel.id).query();
		t1 = new Date().getTime();
		const withoutWarmUpDur = t1 - t0;
		console.log('time taken without warm up ' + withoutWarmUpDur + ' milliseconds.');
		expect(withWarmUpDur).to.be.lessThan(withoutWarmUpDur);
	});
});

describe('paginate by message created_at', () => {
	let channel;
	let client;
	const user = uuidv4();
	const messages = [];
	const messageID = (user, i) => {
		return i.toString() + '-' + user;
	};
	before(async () => {
		client = await getTestClientForUser(user);
		channel = client.channel('messaging', uuidv4());
		await channel.create();
		for (let i = 1; i <= 10; i++) {
			messages.push(
				(
					await channel.sendMessage({
						text: user + i.toString(),
						id: messageID(user, i),
					})
				).message,
			);
			await sleep(5);
		}
	});

	it('invalid date should return an error', async () => {
		await expect(
			channel.query({
				messages: { limit: 2, created_at_after: 'invalid' },
			}),
		).to.be.rejectedWith(
			'StreamChat error code 4: GetOrCreateChannel failed with error: "expected date for field "messages.created_at_after" but got "invalid"',
		);
	});

	it('created_at_after (message 5) should return message 6 to 7', async () => {
		const result = await channel.query({
			messages: { limit: 2, created_at_after: messages[4].created_at },
		});
		expect(result.messages.length).to.be.equal(2);
		expect(result.messages[0].id).to.be.equal(messageID(user, 6));
		expect(result.messages[1].id).to.be.equal(messageID(user, 7));
	});

	it('created_at_after_or_equal (message 5) should return message 5 to 6', async () => {
		const result = await channel.query({
			messages: { limit: 2, created_at_after_or_equal: messages[4].created_at },
		});
		expect(result.messages.length).to.be.equal(2);
		expect(result.messages[0].id).to.be.equal(messageID(user, 5));
		expect(result.messages[1].id).to.be.equal(messageID(user, 6));
	});

	it('created_at_before (message_5) should return message 3 to 4', async () => {
		const result = await channel.query({
			messages: { limit: 2, created_at_before: messages[4].created_at },
		});
		expect(result.messages.length).to.be.equal(2);
		expect(result.messages[0].id).to.be.equal(messageID(user, 3));
		expect(result.messages[1].id).to.be.equal(messageID(user, 4));
	});

	it('created_at_before_or_equal (message_5) should return message 4 to 5', async () => {
		const result = await channel.query({
			messages: { limit: 2, created_at_before_or_equal: messages[4].created_at },
		});
		expect(result.messages.length).to.be.equal(2);
		expect(result.messages[0].id).to.be.equal(messageID(user, 4));
		expect(result.messages[1].id).to.be.equal(messageID(user, 5));
	});

	it('created_at_before (message_5) and created_at_after (message_3) should return message 4', async () => {
		const result = await channel.query({
			messages: {
				limit: 2,
				created_at_before: messages[4].created_at,
				created_at_after: messages[2].created_at,
			},
		});
		expect(result.messages.length).to.be.equal(1);
		expect(result.messages[0].id).to.be.equal(messageID(user, 4));
	});
});
