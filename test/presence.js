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
	getTestClientForUser2,
	createUsers,
	runAndLogPromise,
	sleep,
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

describe('Presence', function() {
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
		it('calling setUser twice should trigger an error', async function() {
			const testClientP = await getTestClientForUser('jack');

			const setUserAndThrow = () => {
				testClientP.setUser({
					id: 'jimmy',
				});
			};

			expect(setUserAndThrow).to.throw(/setUser was called twice/);
		});

		it('login as a different user', async function() {
			const testClientP = await getTestClientForUser('jones');

			testClientP.disconnect();
			testClientP.setUser(
				{
					id: 'jimmy',
				},
				createUserToken('jimmy'),
			);
		});
	});

	describe('Channel online counts', function() {
		it('stopWatching and online count', async function() {
			// user1 is watching this channel
			const id = 'christmas' + uuidv4();
			const b = user1Client.channel('messaging', id, {
				members: ['doug', 'claire', 'user1', 'james'],
			});
			const results = [];
			const eventPromise = new Promise(resolve => {
				b.on('all', e => {
					results.push([e.watcher_count, e.user.id]);
					// expect to see thierry join, james join and james leave
					if (results.length === 3) {
						const expected = [[1, 'user1'], [2, 'james'], [1, 'james']];
						expect(results).to.deep.equal(expected);
						resolve();
					}
				});
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
	});

	describe('Presence - connections', function() {
		it('connect should mark online and update status', async function() {
			const userID = `john-${uuidv4()}`;
			const testClientP = getTestClientForUser2(userID, 'busy');

			await new Promise(resolve => {
				const subscription = testClientP.on('health.check', event => {
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

		it('should be offline after disconnect', async function() {
			const userID = `timmy-${uuidv4()}`;
			const testClientP = await getTestClientForUser(userID, 'mystatus');
			await testClientP.disconnect();
			const response = await user1Client.queryUsers({ id: { $in: [userID] } });
			const timmy = response.users[0];
			expect(timmy.id).to.equal(userID);
			expect(timmy.status).to.equal('mystatus');
			expect(timmy.online).to.equal(false);
		});

		it('Query Channel and Presence', async function() {
			const channel = uuidv4();
			const userID = `sarah123-${channel}`;

			console.log('start2');
			// create a channel where channel.members contains wendy
			await getTestClient(true).updateUser({ id: userID });
			const b = user1Client.channel('messaging', channel, {
				members: ['sandra', userID, 'user1'],
			});
			console.log('created a channel with user', userID);
			await b.watch({ presence: true });
			// sandra goes online should trigger an event
			console.log('marking user online', userID);

			const eventReceived = new Promise(resolve =>
				user1Client.on('user.presence.changed', event => {
					if (event.user.id === userID) {
						expect(event.user.status).to.equal('going to watch a movie');
						expect(event.user.online).to.equal(true);
						resolve();
					}
				}),
			);
			await getTestClientForUser(userID, 'going to watch a movie');
			await eventReceived;
		});

		it('Query Channels and Presence', function(done) {
			const channelName = uuidv4();
			const director = `Denis Villeneuve - ${uuidv4()}`;
			// same as above, but with the query channels endpoint
			user1Client.on('user.presence.changed', event => {
				console.log(event.type);
				if (event.user.id === paulID) {
					expect(event.user.status).to.equal('rallying fremen');
					expect(event.user.online).to.equal(true);
					done();
				}
			});
			async function runTest() {
				const b = user1Client.channel('messaging', channelName, {
					members: [paulID, 'duncan', 'jessica', 'user1'],
					director,
				});
				await b.create();
				const r = await user1Client.queryChannels(
					{ director },
					{ last_message_at: -1 },
					{ presence: true },
				);
				console.log('waiting for connect..... event');
				await getTestClientForUser(paulID, 'rallying fremen');
			}
			runAndLogPromise(runTest);
		});

		it('Query Users and Presence the other one', function(done) {
			// Same as above but with the query users endpoint
			user1Client.on('user.presence.changed', event => {
				if (event.user.id === 'jessica') {
					expect(event.user.status).to.equal('sayhi');
					expect(event.user.online).to.equal(true);
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
				// jessica goes online should trigger an event
				await getTestClientForUser('jessica', 'sayhi');
			}
			runAndLogPromise(runTest);
		});

		// Invisible user support
		it.skip('Invisible', function(done) {
			user1Client.on('user.presence.changed', event => {
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
