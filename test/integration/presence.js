/* eslint no-unused-vars: "off" */

import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
import Immutable from 'seamless-immutable';
import {
	createUserToken,
	getTestClient,
	getTestClientForUser,
	getTestClientForUser2,
	createUsers,
	runAndLogPromise,
	createEventWaiter,
} from './utils';
import { v4 as uuidv4 } from 'uuid';

const expect = chai.expect;

chai.use(chaiAsPromised);

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

describe('Presence', function () {
	let user1Client;
	let sarahID;
	let paulID;

	before(async () => {
		const serverClient = getTestClient(true);
		sarahID = `sarah-${uuidv4()}`;
		paulID = `paul-${uuidv4()}`;

		await createUsers([
			'user1',
			'jones',
			sarahID,
			paulID,
			'paul',
			'doug',
			'sandra',
			'claire',
			'james',
			'duncan',
			'jessica',
		]);
		user1Client = await getTestClientForUser('user1', 'eating');
	});

	beforeEach(() => {
		user1Client.listeners = {};
	});

	describe('Set User and Disconnect', () => {
		it('calling connectUser twice should trigger an error', async function () {
			const testClientP = await getTestClientForUser('jack');

			const connectUserAndThrow = () => {
				testClientP.connectUser({
					id: 'jimmy',
				});
			};

			expect(connectUserAndThrow).to.throw(/connectUser was called twice/);
		});

		it('login as a different user', async function () {
			const testClientP = await getTestClientForUser('jones');

			testClientP.disconnect(5000);
			testClientP.connectUser(
				{
					id: 'jimmy',
				},
				createUserToken('jimmy'),
			);
		});
	});

	describe('Channel online counts', function () {
		it('stopWatching and watcher count', async function () {
			// user1 is watching this channel
			const id = 'christmas' + uuidv4();
			const b = user1Client.channel('messaging', id, {
				members: ['doug', 'claire', 'user1', 'james'],
			});
			await b.create();
			const results = [];
			const eventPromise = new Promise((resolve) => {
				const handler = (e) => {
					expect(e.watcher_count).to.equal(b.state.watcher_count);
					results.push([e.watcher_count, e.user.id]);
					// expect to see thierry join, james join and james leave
					if (results.length === 3) {
						const expected = [
							[1, 'user1'],
							[2, 'james'],
							[1, 'james'],
						];
						expect(results).to.deep.equal(expected);
						resolve();
					}
				};

				b.on('user.watching.start', handler);
				b.on('user.watching.stop', handler);
			});

			// user1 starts watching
			await b.watch();
			// james start watching it
			const james = await getTestClientForUser('james');
			const channel = james.channel('messaging', id);
			await channel.watch();
			await channel.stopWatching();
			await eventPromise;
		});

		it('disconnect and watcher count', async function () {
			// user1 is watching this channel
			const id = 'christmas' + uuidv4();
			const b = user1Client.channel('messaging', id, {
				members: ['doug', 'claire', 'user1', 'james'],
			});
			await b.create();
			const results = [];
			const eventPromise = new Promise((resolve) => {
				const handler = (e) => {
					results.push([e.watcher_count, e.user.id]);
					expect(e.watcher_count).to.equal(b.state.watcher_count);
					// expect to see thierry join, james join and james leave
					if (results.length === 3) {
						const expected = [
							[1, 'user1'],
							[2, 'james'],
							[1, 'james'],
						];
						expect(results).to.deep.equal(expected);
						resolve();
					}
				};

				b.on('user.watching.start', handler);
				b.on('user.watching.stop', handler);
			});

			// user1 starts watching
			await b.watch();
			const james = await getTestClientForUser('james');
			// A second client to make sure james doesn't go completely offline
			const jamesBackup = await getTestClientForUser('james');
			const channel = james.channel('messaging', id);
			// james start watching it
			await channel.watch();
			// Watching client goes offline
			await james.disconnect(5000);
			await eventPromise;
		});
	});

	describe('Presence - connections', function () {
		it('connect should mark online and update status', async function () {
			const userID = `john-${uuidv4()}`;
			const testClientP = getTestClientForUser2(userID, 'busy');

			await new Promise((resolve) => {
				const subscription = testClientP.on('health.check', (event) => {
					expect(event.me.id).to.equal(userID);
					expect(event.me.status).to.equal('busy');
					expect(event.me.invisible).to.equal(false);
					expect(event.me.online).to.equal(true);
					const last_active = new Date(event.me.last_active);
					const now = new Date();
					const diffInMinutes = (now - last_active) / 1000 / 60;
					expect(diffInMinutes).to.be.below(1);
					subscription.unsubscribe();
					resolve();
				});
			});

			const response = await testClientP.queryUsers({ id: { $in: [userID] } });
			const john = response.users[0];
			expect(john.id).to.equal(userID);
			expect(john.status).to.equal('busy');
			expect(john.invisible).to.equal(undefined);
			expect(john.online).to.equal(true);
			const last_active = new Date(john.last_active);
			const now = new Date();
			const diffInMinutes = (now - last_active) / 1000 / 60;
			expect(diffInMinutes).to.be.below(1);
		});

		it('should be offline after disconnect', async function () {
			const userID = `timmy-${uuidv4()}`;
			const testClientP = await getTestClientForUser(userID, 'mystatus');
			await testClientP.disconnect(5000);
			const response = await user1Client.queryUsers({ id: { $in: [userID] } });
			const timmy = response.users[0];
			expect(timmy.id).to.equal(userID);
			expect(timmy.status).to.equal('mystatus');
			expect(timmy.online).to.equal(false);
		});

		it('Query Channel and Presence', async function () {
			const channel = uuidv4();
			const userID = `sarah123-${channel}`;

			// create a channel where channel.members contains wendy
			await getTestClient(true).upsertUser({ id: userID });
			const b = user1Client.channel('messaging', channel, {
				members: ['sandra', userID, 'user1'],
			});
			const stateResponse = await b.watch({
				presence: true,
				watchers: { limit: 10 },
			});
			// everyone except user1 should be offline
			for (const m of stateResponse.members) {
				const shouldBeOnline = m.user.id === user1Client.userID;
				expect(m.user.online).to.equal(shouldBeOnline);
			}
			expect(b.state.members[userID].user.online).to.equal(false);
			expect(user1Client.state.users[userID].online).to.equal(false);

			// sandra goes online should trigger an event
			const eventReceived = new Promise((resolve) =>
				user1Client.on('user.presence.changed', (event) => {
					if (event.user.id === userID) {
						expect(event.user.status).to.equal('going to watch a movie');
						expect(event.user.online).to.equal(true);
						expect(b.state.members[userID].user.online).to.equal(true);
						expect(user1Client.state.users[userID].online).to.equal(true);

						resolve();
					}
				}),
			);
			await getTestClientForUser(userID, 'going to watch a movie');
			await eventReceived;
		});

		it('Query Users and Presence the other one', function (done) {
			// Same as above but with the query users endpoint
			user1Client.on('user.presence.changed', (event) => {
				if (event.user.id === 'jessica') {
					expect(event.user.status).to.equal('sayhi');
					expect(event.user.online).to.equal(true);
					expect(user1Client.state.users.jessica.online).to.equal(true);
					done();
				}
			});
			async function runTest() {
				const b = user1Client.channel('messaging', 'dune-2020', {
					members: ['paul', 'duncan', 'jessica', 'user1'],
				});
				await b.create();
				// monitor presence of jessica
				const resp = await user1Client.queryUsers(
					{ id: { $in: ['jessica'] } },
					{ last_active2: -1 },
					{ presence: true },
				);
				expect(resp.users[0].online).to.equal(false);
				expect(user1Client.state.users.jessica.online).to.equal(false);
				// jessica goes online should trigger an event
				await getTestClientForUser('jessica', 'sayhi');
			}
			runAndLogPromise(runTest);
		});

		it('State and Query Channels and Presence', function (done) {
			const channelName = uuidv4();
			const director = `Denis Villeneuve - ${uuidv4()}`;
			const b = user1Client.channel('messaging', channelName, {
				members: [paulID, 'duncan', 'jessica', 'user1'],
				director,
			});
			// same as above, but with the query channels endpoint
			user1Client.on('user.presence.changed', (event) => {
				if (event.user.id === paulID) {
					expect(event.user.status).to.equal('rallying fremen');
					expect(event.user.online).to.equal(true);
					expect(b.state.members[paulID].user.online).to.equal(true);
					expect(user1Client.state.users[paulID].online).to.equal(true);
					expect();
					done();
				}
			});
			async function runTest() {
				await b.create();
				const r = await user1Client.queryChannels(
					{ director },
					{ last_message_at: -1 },
					{ presence: true },
				);
				// start out as offline
				expect(r[0].state.members[paulID].user.online).to.equal(false);
				expect(user1Client.state.users[paulID].online).to.equal(false);
				await getTestClientForUser(paulID, 'rallying fremen');
			}
			runAndLogPromise(runTest);
		});

		it('Delete user', function (done) {
			// same as above, but with the query channels endpoint
			user1Client.on('user.deleted', (event) => {
				if (event.user.id === paulID) {
					expect();
					done();
				}
			});
			async function runTest() {
				await user1Client.queryChannels(
					{},
					{ last_message_at: -1 },
					{ presence: true },
				);
				const serverClient = getTestClient(true);
				serverClient.deleteUser(paulID);
			}
			runAndLogPromise(runTest);
		});

		// Invisible user support
		it.skip('Invisible', function (done) {
			user1Client.on('user.presence.changed', (event) => {
				expect(event.user.id).to.equal('sandra');
				expect(event.user.status).to.equal('going to be invisible');
				expect(event.user.online).to.equal(false);
				done();
			});
			async function runTest() {
				// create a channel where channel.members contains wendy
				const b = user1Client.channel('messaging', 'bird-box', {
					members: ['sandra', 'sarah', 'user1'],
				});
				await b.watch({ presence: true });
				// sandra goes online should trigger an event
				const testClientP = await getTestClientForUser(
					'sandra',
					'going to be invisible',
					{ invisible: true },
				);
			}
			runTest();
		});
	});
});

describe('Watchers count', function () {
	const client = getTestClient(false);

	const users = ['tommaso' + uuidv4(), 'nick' + uuidv4(), 'thierry' + uuidv4()];
	const channelID = uuidv4();
	let channel;

	before(async function () {
		await createUsers(users);
		await client.connectUser({ id: users[0] }, createUserToken(users[0]));
		channel = client.channel('messaging', channelID, {
			members: users,
		});
	});

	context('When watch is called', function () {
		const watchStartEvent = createEventWaiter(client, 'user.watching.start');

		it('increase watcher count', async function () {
			const resp = await channel.watch();
			expect(resp.watcher_count).to.eq(1);
		});

		it('sends watch event', function () {
			return expect(watchStartEvent).to.be.fulfilled.then(function (events) {
				expect(events[0].user.id).to.eq(users[0]);
				expect(events[0].watcher_count).to.eq(1);
			});
		});
	});

	context('When new client is connected', function () {
		let newClient;
		let newClientChannel;

		let watchStartEvent;

		before(async function () {
			newClient = await getTestClientForUser(users[1]);
			newClientChannel = await newClient.channel('messaging', channelID);
			watchStartEvent = createEventWaiter(client, 'user.watching.start');
			await newClientChannel.watch();
		});

		it('sends user.watching.start event', function () {
			return expect(watchStartEvent).to.be.fulfilled.then(function (events) {
				expect(events[0].user.id).to.eq(users[1]);
				expect(events[0].watcher_count).to.eq(2);
			});
		});

		it('increase watcher count', async function () {
			let resp = await channel.watch();
			expect(resp.watcher_count).to.eq(2);
			resp = await newClientChannel.watch();
			expect(resp.watcher_count).to.eq(2);
		});

		context('When client calls stopWatching', function () {
			const watchingStopEvent = createEventWaiter(client, 'user.watching.stop');

			before(async function () {
				await newClientChannel.stopWatching();
			});

			it('decrease watcher count', async function () {
				const resp = await channel.watch();
				expect(resp.watcher_count).to.eq(1);
			});

			it('sends user.watching.stop event', function () {
				return expect(watchingStopEvent).to.be.fulfilled.then(function (events) {
					expect(events[0].user.id).to.eq(users[1]);
					expect(events[0].watcher_count).to.eq(1);
				});
			});
		});
	});

	context('When new client is disconnected', function () {
		let newClient, newClientChannel, watchingStopEvent;

		before(async function () {
			newClient = await getTestClientForUser(users[2]);
			newClientChannel = newClient.channel('messaging', channelID);
			watchingStopEvent = createEventWaiter(client, 'user.watching.stop');

			const resp = await newClientChannel.watch();
			expect(resp.watcher_count).to.eq(2);

			await newClient.disconnect(5000);
		});

		it('decrease watcher count', async function () {
			const resp = await channel.watch();
			expect(resp.watcher_count).to.eq(1);
		});

		it('sends user.watching.stop event', function () {
			return expect(watchingStopEvent).to.be.fulfilled.then(function (events) {
				expect(events[0].user.id).to.eq(users[2]);
				expect(events[0].watcher_count).to.eq(1);
			});
		});
	});
});

describe('Count Anonymous users', function () {
	const admin = 'tommaso' + uuidv4();
	const channelID = uuidv4();
	const clients = [];
	let channel;
	const client = getTestClient(false);

	const nClients = 5;

	before(async () => {
		await createUsers([admin]);
		await client.connectUser({ id: admin }, createUserToken(admin));
		channel = client.channel('livestream', channelID);
		await channel.create();
		for (let i = 0; i < nClients; i++) {
			const client1 = getTestClient(false);
			await client1.connectAnonymousUser();
			const channel1 = client1.channel('livestream', channelID);
			clients[i] = { client: client1, channel: channel1 };
		}
	});
	it('each anon client should count as a user', async function () {
		let lastWatcherInfo;
		//connect all the clients
		for (let i = 0; i < nClients; i++) {
			lastWatcherInfo = await clients[i].channel.watch();
			expect(lastWatcherInfo.watcher_count).to.be.equal(i + 1);
		}
		const resp = await channel.query({
			messages: { limit: 10 },
			members: { limit: 50, offset: 0 },
			watchers: { limit: 6, offset: 0 },
		});
		expect(resp.watchers.length).to.be.equal(nClients);
		expect(resp.watcher_count).to.be.equal(nClients);

		//stop watching or disconnect should update the counters properly
		for (let i = 0; i < nClients; i++) {
			if (i % 2 === 0) {
				await clients[i].channel.stopWatching();
			} else {
				await clients[i].client.disconnect(5000);
			}
			const resp = await channel.query({ state: true });
			if (i !== nClients - 1) {
				expect(resp.watcher_count).to.be.equal(nClients - (i + 1));
			} else {
				expect(resp.watcher_count).to.be.undefined;
			}
		}
		const channelResponse = await channel.watch();
		expect(channelResponse.watcher_count).to.be.equal(1);
	});
});

describe('Count Guest users using state', function () {
	const admin = 'tommaso' + uuidv4();
	const channelID = uuidv4();
	const clients = [];
	let channel;
	const client = getTestClient(false);

	const nClients = 5;

	before(async () => {
		await createUsers([admin]);
		await client.connectUser({ id: admin }, createUserToken(admin));
		channel = client.channel('livestream', channelID);
		await channel.create();
		for (let i = 0; i < nClients; i++) {
			const client1 = getTestClient(false);
			await client1.setGuestUser({ id: uuidv4() });
			const channel1 = client1.channel('livestream', channelID);
			clients[i] = { client: client1, channel: channel1 };
		}
	});
	it('validate watcher counts using state', async function () {
		let lastWatcherInfo;
		//connect all the clients
		for (let i = 0; i < nClients; i++) {
			lastWatcherInfo = await clients[i].channel.watch();
			expect(lastWatcherInfo.watcher_count).to.be.equal(i + 1);
		}

		//stop watching or disconnect should update the counters properly
		for (let i = 0; i < nClients; i++) {
			if (i % 2 === 0) {
				await clients[i].channel.stopWatching();
			} else {
				clients[i].client.disconnect(5000);
			}
			const resp = await channel.query({ state: true });
			if (i !== nClients - 1) {
				expect(resp.watcher_count).to.be.equal(nClients - (i + 1));
			} else {
				expect(resp.watcher_count).to.be.undefined;
			}
		}
		const channelResponse = await channel.watch();
		expect(channelResponse.watcher_count).to.be.equal(1);
	});
});
