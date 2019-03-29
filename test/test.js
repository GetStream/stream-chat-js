/* eslint no-unused-vars: "off" */

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import Immutable from 'seamless-immutable';
import { StreamChat } from '../src';
import fs from 'fs';

import {
	createUserToken,
	getTestClient,
	getTestClientForUser,
	runAndLogPromise,
	getServerTestClient,
	createUsers,
	sleep,
	getTestClientForUser2,
} from './utils';
import uuidv4 from 'uuid/v4';

const expect = chai.expect;

chai.use(chaiAsPromised);

if (process.env.NODE_ENV !== 'production') {
	require('longjohn');
}

Promise = require('bluebird'); // eslint-disable-line no-global-assign
Promise.config({
	longStackTraces: true,
	warnings: {
		wForgottenReturn: false,
	},
});

describe('Chat', function() {
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

		await serverAuthClient.updateUsers([thierry, tommaso, { id: 'thierry' }]);
		//	delete thierry.role;
		// await isn't needed but makes testing a bit easier
		await authClient.setUser(thierry);

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

	describe('User Update Events', function() {
		it('should trigger user update event', async () => {
			const userID = uuidv4();
			await serverAuthClient.updateUser({
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
			await new Promise(resolve => {
				authClient.on('user.updated', event => {
					expect(event.user.id).to.equal(userID);
					resolve();
				});
				serverAuthClient.updateUser({
					id: userID,
					name: 'jack',
					song: 'welcome to the jungle',
				});
			});
		});
	});

	describe('Failures', function() {
		it.skip('channel query wrong order', async function() {
			const client = getTestClient(false);
			const userID = uuidv4();

			const cPromise = client.setUser({ id: userID }, createUserToken(userID));
			// watch a new channel before setUser completes
			const state = await client.channel('messaging', uuidv4()).watch();
		});
		it('reserved fields in user', function(done) {
			const client = getTestClient(false);
			const userID = uuidv4();

			client
				.setUser(
					{ id: userID, created_at: 'helloworld' },
					createUserToken(userID),
				)
				.then(() => {
					done(new Error('should have failed'));
				})
				.catch(e => {
					done();
				});
		});
	});

	describe('Roundtrip', function() {
		it('Initialize, listen and send message', function(done) {
			async function runtest() {
				// state includes messages, who's read the messages, channel name, info and the list of members
				// initialize also subscribes to the channel so we receive WS events
				await channel.watch();
				// listen  to message.new
				channel.on('message.new', event => {
					if (event.message.text === 'helloworld :world: rocks 123') {
						done();
					}
				});

				// send a message
				const text = 'helloworld :world: rocks 123';
				await channel.sendMessage({ text, customfield: '123' });
			}
			runtest().catch(exc => {
				done(exc);
			});
		});
	});

	describe('Connect', function() {
		it('Insert and update should work', async function() {
			const userID = uuidv4();
			const client = await getTestClientForUser(userID, 'test', { color: 'green' });
			expect(client.health.own_user.color).to.equal('green');
			// connect without a user id shouldnt remove anything...
			const client2 = await getTestClientForUser(userID);
			expect(client2.health.own_user.color).to.equal('green');
			// changing the status shouldnt remove the color
			const client3 = await getTestClientForUser(userID, 'helloworld');
			expect(client3.health.own_user.color).to.equal('green');
			expect(client3.health.own_user.status).to.equal('helloworld');
		});

		it('Verify that we dont do unneeded updates', async function() {
			const userID = uuidv4();
			const client = await getTestClientForUser(userID, 'test', { color: 'green' });
			const updatedAt = client.health.own_user.updated_at;
			// none of these should trigger an update...
			const client2 = await getTestClientForUser(userID);
			const client3 = await getTestClientForUser(userID, 'test', {
				color: 'green',
			});
			expect(client3.health.own_user.updated_at).to.equal(updatedAt);
		});

		it('Update/sync before calling setUser', async function() {
			const userID = uuidv4();
			const serverClient = getServerTestClient();

			const updateResponse = await serverClient.updateUsers([
				{ id: userID, book: 'dune', role: 'admin' },
			]);
			const client = await getTestClientForUser(userID, 'test', { color: 'green' });
			expect(client.health.own_user.role).to.equal('admin');
			expect(client.health.own_user.book).to.equal('dune');
			expect(client.health.own_user.status).to.equal('test');
			expect(client.health.own_user.color).to.equal('green');
		});

		it.skip('Chat disabled', async function() {
			const disabledKey = 'm1113jrsw6e';
			const disabledSecret =
				'8qezxbbbn72p9rtda2uzvupkhvq6u7dmf637weppxgmadzty6g5p64g5nchgr2aaa';
			const serverClient = new StreamChat(disabledKey, disabledSecret);
			const userClient = new StreamChat(disabledKey);
			const responsePromise = userClient.setUser(
				{ id: 'batman' },
				serverClient.createToken('batman'),
			);
			await expect(responsePromise).to.be.rejectedWith(
				'Chat is not enabled for organization with id 5001 and name admin',
			);
		});
	});

	describe('Devices', function() {
		const deviceId = uuidv4();
		const wontBeRemoved = uuidv4();
		const client = getTestClient(false);

		before(async function() {
			await authClient.addDevice(wontBeRemoved, 'apn');
		});

		describe('User is not set', function() {
			it('device management does not work', async function() {
				let p = client.addDevice(deviceId, 'apn');
				await expect(p).to.be.rejected;

				p = client.getDevices();
				await expect(p).to.be.rejected;

				p = client.removeDevice(wontBeRemoved);
				await expect(p).to.be.rejected;
			});
		});

		describe.skip('User is set', function() {
			const userId = uuidv4();

			before(async function() {
				await client.setUser({ id: userId }, createUserToken(userId));
			});

			describe('Adding', function() {
				it('simple add', async function() {
					await client.addDevice(deviceId, 'apn');
					const response = await client.getDevices();
					expect(response.devices.length).to.equal(1);
					expect(response.devices[0].id).to.equal(deviceId);
				});
				it('re-add deleted device', async function() {
					await client.removeDevice(deviceId);

					await client.addDevice(deviceId, 'firebase');
					const response = await client.getDevices();
					expect(response.devices.length).to.equal(1);
					expect(response.devices[0].id).to.equal(deviceId);
					expect(response.devices[0].push_provider).to.equal('firebase');
				});
			});
			describe('Removing', function() {
				it(`can't remove someone else's device`, async function() {
					const p = client.removeDevice(wontBeRemoved);
					await expect(p).to.be.rejected;
				});
				it(`can only remove own device`, async function() {
					await client.removeDevice(deviceId);
					const response = await client.getDevices();
					expect(response.devices.length).to.equal(0);
				});
				it(`can't delete already deleted devices`, async function() {
					const p = client.removeDevice(deviceId);
					await expect(p).to.be.rejected;
				});
				it(`can't delete devices with bogus ids`, async function() {
					const p = client.removeDevice('totes fake');
					await expect(p).to.be.rejected;
				});
			});
		});
	});

	describe('Search', function() {
		it('Basic Query', async function() {
			// add a very special message
			const channel = authClient.channel('messaging', 'poppins');
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
	});

	describe('Server Side Integration', function() {
		it('Create token with expiration', function(done) {
			const token = serverAuthClient.createToken('user-id', 1538709600);
			expect(token.split('.')[1]).to.eq(
				'eyJ1c2VyX2lkIjoidXNlci1pZCIsImV4cCI6MTUzODcwOTYwMH0',
			);
			done();
		});

		it('Create token without expiration', function(done) {
			const token = serverAuthClient.createToken('user-id');
			expect(token.split('.')[1]).to.eq('eyJ1c2VyX2lkIjoidXNlci1pZCJ9');
			done();
		});

		it('Add a Chat Message and a Reaction', async function() {
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

		it('Edit a user', async function() {
			const response = await serverAuthClient.updateUser({
				id: 'tommaso',
				name: 'Tommaso Barbugli',
				role: 'admin',
			});
			console.log('response', response);
			expect(response.users.tommaso.id).to.equal('tommaso');
		});
	});

	describe('Auth', function() {
		it('Token based auth', async function() {
			const token = createUserToken('daenerys');
			const client3 = getTestClient(true);
			await client3.setUser(
				{
					id: 'daenerys',
					name: 'Mother of dragons',
				},
				token,
			);
		});

		it('Tampering with token and user should fail', function(done) {
			const token = createUserToken('fake-daenerys');

			const clientSide = getTestClient();
			expect(() =>
				clientSide.setUser(
					{
						id: 'daenerys',
						name: 'Mother of dragons',
					},
					token,
				),
			).to.throw();
			done();
		});

		it('Secret based auth', async function() {
			const client3 = new getTestClient(true);
			await client3.setUser({
				id: 'daenerys',
				name: 'Mother of dragons',
			});
		});

		it('No secret and no token should raise a client error', function(done) {
			const client2 = getTestClient();
			try {
				client2.setUser({
					id: 'daenerys',
					name: 'Mother of dragons',
				});
				done('should throw');
			} catch {
				done();
			}
		});

		it('Invalid user token', function(done) {
			const client2 = getTestClient();
			expect(() =>
				client2.setUser(
					{
						id: 'daenerys',
						name: 'Mother of dragons',
					},
					'badtokenhere',
				),
			).to.throw();
			done();
		});

		it('Invalid secret should fail setUser', function(done) {
			const client3 = new StreamChat('892s22ypvt6m', 'invalidsecret');
			const connectPromise = client3.setUser({
				id: 'daenerys',
				name: 'Mother of dragons',
			});
			connectPromise
				.then(() => done('should have failed'))
				.catch(() => {
					done();
				});
		});
	});

	describe('Permissions', function() {
		it('Editing someone else message should not be allowed client-side', function(done) {
			(async function() {
				// thierry adds a message
				const response = await channel.sendMessage({
					text: 'testing permissions is fun',
				});
				const message = response.message;

				// this should succeed since the secret is set
				const token = authClient.createToken('johny');

				const client3 = getTestClient();
				await client3.setUser(
					{
						id: 'johny',
						name: 'some random guy',
					},
					token,
				);
				try {
					await client3.updateMessage(message);
					done('should fail');
				} catch (e) {
					expect(e.status).to.eql(403);
					done();
				}
			})();
		});
	});

	describe('User', function() {
		it('Regular Users with extra fields', async function() {
			// verify we correctly store user information
			const userID = 'uthred';
			const client = getTestClient();
			const token = createUserToken(userID);

			// set the user information
			const user = {
				id: userID,
				first: 'Uhtred',
			};

			await client.setUser(user, token);

			const magicChannel = client.channel('livestream', 'harrypotter');
			await magicChannel.watch();

			// make an API call so the data is sent over
			const text = 'Tommaso says hi!';
			const data = await magicChannel.sendMessage({ text });

			const expectedData = Object.assign(
				{},
				{ role: 'user' /* status: 'offline'*/ },
				user,
			);
			// verify the user information is correct
			delete data.message.user.last_active;
			expect(data.message.user).to.contains(expectedData);
			expect(data.message.text).to.equal(text);
		});

		it.skip('Update a user', async function() {
			// update a user, see if message state fully updates...
			await channel.sendMessage({ text: 'updating a user' });
			const state = await channel.query();
			expect(state.messages[state.messages.length - 1].user.name).to.equal(
				'Thierry',
			);
			// TODO: update the user
			authClient.setUser({ id: 'thierry', name: 't' }, 'myusertoken');
			// verify the update propagates
			expect(state.messages[state.messages.length - 1].user.name).to.equal('t');
		});
	});

	describe('Messages', () => {
		describe('Success', () => {
			it('Subscribe to many channels', function(done) {
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
				runtest().catch(exc => {
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

			it('Channel pagination', async function() {
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

			it('Channel Filtering', async function() {
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

			it('Channel Filtering Members', async function() {
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
			});

			it('Add a Chat message with a custom field', async function() {
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

			it('Add a Chat message with a URL and edit it', async function() {
				const url =
					'https://www.reddit.com/r/KidsAreFuckingStupid/comments/9xmd8g/kids_think_costco_clerk_is_maui/';
				const text = `check this reddit :) ${url}`;
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

			it('URL enrichment response format', async function() {
				const url = 'https://unsplash.com/photos/kGSapVfg8Kw';
				const text = `Time for vacation! ${url}`;
				const response = await channel.sendMessage({ text });
				const message = response.message;
				expect(message.attachments.length).to.equal(1);
				expect(message.attachments[0].type).to.equal('image');
			});

			it('Edit a Chat message', async function() {
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

			it('Edit a Chat message with a custom field', async function() {
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

			it('Delete a Chat message', function(done) {
				async function runTest() {
					const text = 'testing the delete flow, does it work?';
					const data = await channel.sendMessage({ text });
					expect(data.message.text).to.equal(text);

					channel.on('message.deleted', event => {
						expect(event.message.deleted_at).to.not.be.null;
						done();
					});
					const deleteResponse = await authClient.deleteMessage(
						data.message.id,
					);
					expect(deleteResponse.message.deleted_at).to.not.be.null;
				}
				runTest().catch(exc => {
					done(exc);
				});
			});

			it('Add a Chat Message with an attachment', async function() {
				const text = 'testing attachment';
				const data = await channel.sendMessage({ text });
			});

			it('Enrichment', async function() {
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

			it('Upload a file', async function() {
				const file = fs.createReadStream('./helloworld.txt');
				const data = await channel.sendFile(file, 'hello_world.txt');
			});

			it('Upload an image', async function() {
				const file = fs.createReadStream('./helloworld.jpg');
				const data = await channel.sendImage(file, 'hello_world.jpg');
			});

			it('File upload entire flow', async function() {
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
				const attachments = results.map(response => ({
					type: 'image',
					thumb_url: response.file,
					asset_url: response.file,
				}));
				const response = await channel.sendMessage({
					text: 'Check out what i uploaded in parallel',
					attachments,
				});
				expect(response.message.attachments).to.deep.equal(attachments);
			});
		});

		describe('Fail', () => {
			// empty message
			it('Add a Chat message with a wrong custom field', function() {
				const message = {
					text: 'helloworld chat test',
					attachments: '123', // we don't allow this its reserved
				};
				const p = channel.sendMessage(message);
				expect(p).to.rejected;
			});

			it('Add a chat message with text that is too long', async function() {
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

			it('Edit a chat message with text that is too long', async function() {
				const disabledChannel = authClient.channel(
					'everythingDisabled',
					'old-school-irc',
				);
				await disabledChannel.watch();

				const response = await disabledChannel.sendMessage({ text: 'a' });

				const message = response.message;
				message.text =
					'This is bigger than the limit of 10 chars for this channel';

				const p = authClient.updateMessage(message);
				await expect(p).to.be.rejected;
			});

			it(`Add a Chat Message that's too large in content`, async function() {
				const p = channel.sendMessage({
					text: 'boop',
					stuff: 'x'.repeat(5 * 1024),
				});
				await expect(p).to.be.rejected;
			});

			it(`Edit a Chat Message that's too large in content`, async function() {
				const resp = await channel.sendMessage({
					text: 'boop',
					stuff: 'super custom',
				});
				const message = resp.message;
				const newMsg = Object.assign({}, message, {
					new_stuff: 'x'.repeat(5 * 1024),
				});
				const p = authClient.updateMessage(newMsg);
				await expect(p).to.be.rejected;
			});
		});
	});

	describe('Slash Commands', () => {
		describe('Success', () => {
			it('Giphy Integration', async function() {
				const text = '/giphy rock';
				const data = await channel.sendMessage({ text });
				expect(data.message.command).to.equal('giphy');
				expect(data.message.type).to.equal('ephemeral');
				expect(data.message.args).to.equal('rock');
			});

			it('Giphy Action Send', async function() {
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

			it('Giphy Action Cancel', async function() {
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

		// TODO: implement after proper error system is in place
		describe.skip('Error', () => {
			it('Invalid Command', async function() {
				const text = '/missing wave';
				const response = channel.sendMessage({ text });
				await expect(response).to.be.rejectedWith(Error());
			});

			it('Empty Command', async function() {
				const text = '/giphy';
				const response = channel.sendMessage({ text });
				await expect(response).to.be.rejectedWith(Error());
			});
		});
	});

	describe('Query Users', function(done) {
		const userMap = {};
		const users = [];
		const unique = uuidv4();
		const username = function(index) {
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
				};

				users[i] = (await serverAuthClient.updateUser(user)).users[username(i)];
				userMap[username(i)] = users[i];
			}
		});
		it('search users', async function() {
			const response = await authClient.queryUsers(
				{ id: 'user-query-' + unique + '-' },
				{},
				{ presence: false },
			);
			expect(response.users.length).equal(10);
		});
		it('get users $in', async function() {
			const response = await authClient.queryUsers(
				{ id: { $in: [username(0)] } },
				{},
				{ presence: false },
			);
			expect(response.users.length).equal(1);
			expect(response.users[0]).to.be.eql(users[0]);
		});
		it('get users $in query bad format', function(done) {
			authClient
				.queryUsers({ id: { $in: username(0) } }, {}, { presence: false })
				.then(() => done('should fail'))
				.catch(() => {
					done();
				});
		});
		it('search users with custom field test_key', async function() {
			const response = await authClient.queryUsers(
				{ test_key: unique },
				{},
				{ presence: false },
			);
			expect(response.users.length).equal(10);
			expect(response.users).to.be.eql(users.reverse());
		});
		it('filter using and logical operator', async function() {
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

	describe('Queries', function() {
		/*
		 * - Get the channel settings
		 * - Number of members
		 * - Number of members that are online
		 * - List of members
		 * - Message History?
		 * - Maybe GraphQL?
		 */
		it.skip('Pagination on Messages', async function() {
			const paginationChannel = authClient.channel('livestream', 'pagination');
			await paginationChannel.create();

			// add 5 messages so we can test pagination
			for (let i = 0; i < 5; i++) {
				const p = paginationChannel.sendMessage({ text: `say hi ${i}` });
				await p;
			}
			// read the first page
			const result = await paginationChannel.query({
				messages: { limit: 2, offset: 0 },
			});
			expect(result.messages.length).to.equal(2);
			// read the second page
			const oldestMessage = result.messages[0];
			const result2 = await paginationChannel.query({
				messages: { limit: 2, id_lt: oldestMessage },
			});
			expect(result2.messages.length).to.equal(2);
			// verify that the id lte filter works
			for (const m of result2.messages) {
				expect(m.created_at).to.be.below(oldestMessage.created_at);
			}
			// the state should have 4 messages
			expect(paginationChannel.state.messages.length).to.equal(4);
		});
		it.skip('Pagination on Members', async function() {
			// add 4 members so we can test pagination
			const c = authClient.channel('commerce', 'ozark-cast', {
				members: ['wendy', 'helen', 'marty', 'charlotte'],
				moderators: [],
				admins: [],
				name: 'everyone along the rivers',
			});
			await c.watch();

			// read the first page
			const result = await c.query({ members: { limit: 2, offset: 0 } });
			expect(result.members.length).to.equal(2);
		});
	});

	describe('Channel Edits', function() {
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

		it('Add and remove members should return the correct member count', async function() {
			// change the access, add members and remove members
			await conversation.addMembers(['tommaso', 'thierry']);
			await conversation.removeMembers(['thierry']);
			await conversation.addMembers(['thierry']);
			const state = await conversation.query();

			expect(state.channel.member_count).to.equal(2);
		});

		it('Change the name and set a custom color', done => {
			async function runTest() {
				let eventCount = 0;
				channel.on('channel.updated', event => {
					expect(event.channel.color).to.equal('green');
					eventCount += 1;
					if (eventCount === 2) {
						channel.listeners = {};
						done();
					}
				});
				channel.on('message.new', event => {
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
			runTest().catch(exc => {
				done(exc);
			});
		});
		it('Freeze a channel', async function() {
			//
			const testChannel = authClient.channel('livestream', 'freeze');
			await testChannel.watch();
			const response = await testChannel.update({
				frozen: true,
			});
			expect(response.channel.frozen).to.be.true;
		});
		it.skip('Add and remove members', async function() {
			// TODO: remove members sometimes doesnt work
			// change the access, add members and remove members
			await conversation.addMembers(['tommaso', 'thierry']);
			await conversation.removeMembers(['tommaso']);
			const state = await conversation.query();
			console.log('state', state);
			expect(state.members.length).to.equal(1);
			expect(state.members[0].user.id).to.eql('thierry');
		});
	});

	describe('Events', function() {
		/*
		 * Events enable the typing start, typing stop and mark read states
		 */
		it('Typing Start', async function() {
			// run for 5 seconds or till typing.stop is received
			await conversation.sendEvent({
				type: 'typing.start',
			});
		});

		it('Typing Stop', function(done) {
			async function runTest() {
				conversation.on('typing.stop', event => {
					// start, stop
					expect(conversation.state.typing.asMutable()).to.deep.equal({});
					conversation.listeners = {};
					done();
				});
				// run for 5 seconds or till typing.stop is received
				await conversation.sendEvent({
					type: 'typing.start',
				});
				await conversation.sendEvent({
					type: 'typing.stop',
				});
			}
			runTest().catch(exc => {
				done(exc);
			});
		});

		it('Typing Helpers', async function() {
			let occurences = 0;
			conversation.on('typing.start', () => {
				occurences += 1;
				if (occurences > 1) {
					throw Error('too many typing.start events');
				}
			});
			await conversation.keystroke();
			await conversation.keystroke();
		});

		it('Message Read', async function() {
			conversation.on('message.read', event => {
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

		it.skip('Message Read & Last Message', async function() {
			for (let i = 1; i <= 7; i++) {
				const text = `message-${i}`;
				await conversation.sendMessage({ text });
			}
			await new Promise(resolve => setTimeout(resolve, 2000));
			const lastMessage = conversation.lastMessage();
			expect(lastMessage.text).to.equal('message-7');
		});

		const events = [
			'message.read',
			'typing.start',
			'typing.stop',
			'user.watching.start',
			'user.watching.stop',
		];

		it('Supported events', async function() {
			const permittedChan = authClient.channel('messaging', 'awesome-group-1');
			await permittedChan.watch();
			for (const event of events) {
				const response = permittedChan.sendEvent({
					type: event,
				});
				await expect(response).to.be.fulfilled;
			}
		});

		it('Unsupported events', async function() {
			const notPermittedChan = authClient.channel('livestream', 'circonflexes');
			await notPermittedChan.watch();
			for (const event of events) {
				const response = notPermittedChan.sendEvent({
					type: event,
				});
				await expect(response).to.be.rejected;
			}
		});
	});

	describe('Channel State', function() {
		it('Remove Message', function() {
			const c = authClient.channel('twitch', 'state');
			const message = { id: 1, text: 'my message' };
			const message2 = { id: 2, text: 'my message 2' };
			c.state.messages = Immutable([message, message2]);
			c.state.removeMessage(message);
			expect(c.state.messages.length).to.equal(1);
		});

		it('Remove Ephemeral Message', function() {
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

		it('Update Message', function() {
			const c = authClient.channel('twitch', 'state');
			const message = { id: 1, text: 'my message' };
			const message2 = { id: 2, text: 'my message 2' };
			c.state.messages = Immutable([message, message2]);
			message2.text = 'hello world';
			c.state.addMessageSorted(message2);
			expect(c.state.messages.length).to.equal(2);
			expect(c.state.messages[1].text).to.equal('hello world');
		});

		it('Add A Message', function() {
			const c = authClient.channel('twitch', 'state');
			const message = { id: 1, text: 'my message' };
			const message2 = { id: 2, text: 'my message 2' };
			c.state.messages = Immutable([message]);
			// this should append
			c.state.addMessageSorted(message2, true);
			expect(c.state.messages.length).to.equal(2);
			expect(c.state.messages[0].text).to.equal('my message');
			expect(c.state.messages[1].text).to.equal('my message 2');
		});
	});

	describe('Channel moderators', function() {
		const chanName = uuidv4();
		let c;
		const userID = uuidv4();
		const client = getTestClient(false);

		before(async () => {
			c = serverAuthClient.channel('livestream', chanName, {
				created_by: { id: uuidv4() },
			});
			await c.create();
			await serverAuthClient.updateUser({
				id: userID,
			});
			await client.setUser({ id: userID }, createUserToken(userID));
			await client.channel('livestream', chanName).watch();
		});

		it('check that is a regular user first', async function() {
			const results = await c.query({
				members: { limit: 2, offset: 0 },
				watchers: { limit: 2, offset: 0 },
			});
			expect(results.members.length).to.equal(0);
			expect(results.watchers[0]).not.to.be.null;
			expect(results.watchers[0].role).to.eql('user');
			expect(results.watchers[0].id).to.eql(userID);
		});

		it('promoting a user to moderator', async function() {
			await c.addModerators([userID]);
			const results = await c.query({
				members: { limit: 2, offset: 0 },
				watchers: { limit: 2, offset: 0 },
			});
			expect(results.watchers[0]).not.to.be.null;
			console.log('result', results.watchers[0]);
			console.log('members', results.members[0]);
			expect(results.watchers[0].role).to.eql('user');
			expect(results.members[0].user.role).to.eql('user');
			expect(results.members[0].role).to.eql('moderator');
		});

		it('demoting a moderator', async function() {
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

	describe('Guest users', function() {
		let client;
		let channel;
		const userID = 'tommaso-' + uuidv4();
		const channelID = `free4all-` + uuidv4();

		it('Create a guest session', async function() {
			client = getTestClient(false);
			await client.setGuestUser({ id: userID });
			const c = serverAuthClient.channel('livestream', channelID, {
				created_by: { id: uuidv4() },
			});
			await c.create();
		});

		it('join a live stream channel', async function() {
			channel = client.channel('livestream', channelID);
			await channel.watch();
		});

		it('query channel', async function() {
			channel = client.channel('livestream', channelID);
			const response = await channel.query({
				watchers: { limit: 10 },
				state: true,
			});
			expect(response.watchers[0].role).to.eql('guest');
		});
	});

	describe('Anonymous users', function() {
		let client;
		let channel;
		let serverChannel;
		const owner = { id: uuidv4() };

		it('Create an anonymous session', async function() {
			client = getTestClient(false);
			await client.setAnonymousUser();
			serverChannel = serverAuthClient.channel('livestream', 'free4all2', {
				created_by: owner,
			});
			await serverChannel.create();
		});

		it('join a live stream channel', async function() {
			channel = client.channel('livestream', 'free4all2');
			await channel.watch();
		});

		it('query channel should not show anon users', async function() {
			channel = client.channel('livestream', 'free4all2');
			const response = await channel.query({ watchers: { limit: 10 } });
			expect(response.watchers).to.not.eql({});
			const fk = Object.keys(response.watchers)[0];
			expect(response.watchers[fk].id).to.eql('!anon');
			expect(response.watchers[fk].role).to.eql('anonymous');
		});

		it('it should receive messages', function(done) {
			channel.on('message.new', event => {
				if (event.message.text === 'helloworld :world: rocks 123') {
					done();
				}
			});

			serverChannel
				.sendMessage({ text: 'helloworld :world: rocks 123', user: owner })
				.catch(e => {
					done('failed to send a message!');
				});
		});
	});

	describe('User custom fields', function() {
		let userClient;
		let chan;
		const userData = {
			id: uuidv4(),
			preferred_editor: 'ed',
			knows_klingon: true,
		};

		before(async () => {
			userClient = getTestClient(false);
			await userClient.setUser(userData, createUserToken(userData.id));
			chan = userClient.channel('livestream', 'dnd');
			await chan.watch();
			await chan.watch();
		});

		it('should be included in channel state created_by', function(done) {
			chan.query()
				.then(state => {
					console.log(state.created_by);
					done();
				})
				.catch(err => done(err));
		});

		it('should be included in channel watchers when doing a query', function(done) {
			chan.query()
				.then(state => {
					console.log(state.channel.watchers);
					done();
				})
				.catch(err => done(err));
		});

		it('test add member behaviour for nick', async () => {
			const response = await authClient
				.channel('livestream', 'dnd')
				.addMembers([userData.id]);
			expect(response.channel.members).to.be.undefined;
			expect(response.members).to.not.be.undefined;
		});

		it('should be included in channel members when doing a query', function(done) {
			authClient
				.channel('livestream', 'dnd')
				.addMembers([userData.id])
				.then(() => {
					chan.query()
						.then(state => {
							done();
						})
						.catch(err => done(err));
				})
				.catch(err => done(err));
		});

		it('should be included on message.new events', function(done) {
			done();
		});
	});

	describe('Moderation', function() {
		serverAuthClient = getTestClient(true);

		const evil = {
			id: 'eviluser',
			name: 'Eviluser',
			status: 'busy',
			image: 'myimageurl',
			role: 'user',
		};

		serverAuthClient.updateUser(evil);

		it('Ban', async function() {
			// ban a user for 60 minutes
			await serverAuthClient.banUser('eviluser', {
				timeout: 60,
				reason: 'Stop spamming your YouTube channel',
			});
		});
		it('Mute', async function() {
			const data = await authClient.muteUser('eviluser');
			expect(data.mute.user.id).to.equal('thierry2');
			expect(data.mute.target.id).to.equal('eviluser');
		});
		it('Unmute', async function() {
			const data = await authClient.unmuteUser('eviluser');
			expect(data).to.not.be.null;
		});
		it('Flag and Unflag a message ', async function() {
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
		it('Flag and Unflag a user ', async function() {
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
		it.skip('Automod Simple', async function() {
			const text = 'MongoDB is such a fucking piece of shit';
			const data = await channel.sendMessage({ text });
			expect(data.message.type).to.equal('error');
		});
		it.skip('Automod AI', async function() {
			const aiChannel = authClient.channel('ai', 'test');
			await aiChannel.watch();
			const text =
				'80% off Loutis Vuitton Handbags Save up to 80% off ! Free shipping! Right Now ! Snap it up 2.vadsv.uk';
			const data = await aiChannel.sendMessage({ text });
			expect(data.message.type).to.equal('error');
		});
	});
});
