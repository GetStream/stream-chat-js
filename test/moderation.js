import uuidv4 from 'uuid/v4';
import {
	getTestClientForUser,
	createUsers,
	getTestClient,
	createUserToken,
} from './utils';
import chai from 'chai';
import chaiAsPromised from 'chai-as-promised';
const expect = chai.expect;

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

chai.use(chaiAsPromised);

describe('Moderation', function() {
	it('Mute', async function() {
		const user1 = uuidv4();
		const user2 = uuidv4();
		await createUsers([user1, user2]);
		const client1 = await getTestClientForUser(user1);

		const eventPromise = new Promise(resolve => {
			// verify that the notification is sent
			client1.on('notification.mutes_updated', e => {
				expect(e.me.mutes.length).to.equal(1);
				resolve();
			});
		});
		const response = await client1.muteUser(user2);
		expect(response.mute.created_at).to.not.be.undefined;
		expect(response.mute.updated_at).to.not.be.undefined;
		expect(response.mute.user.id).to.equal(user1);
		expect(response.mute.target.id).to.equal(user2);
		// verify we return the right user mute upon connect
		const client = getTestClient(false);
		const connectResponse = await client.setUser(
			{ id: user1 },
			createUserToken(user1),
		);
		expect(connectResponse.me.mutes.length).to.equal(1);
		expect(connectResponse.me.mutes[0].target.id).to.equal(user2);
		await eventPromise;
	});

	it.only('Mute Channel (notification)', async function() {
		const user1 = uuidv4();
		await createUsers([user1]);
		const client1 = await getTestClientForUser(user1);

		const eventPromise = new Promise(resolve => {
			// verify that the notification is sent
			client1.on('notification.channel_mutes_updated', e => {
				expect(e.me.mutes.length).to.equal(1);
				let mute = e.me.mutes[0];
				expect(mute.created_at).to.not.be.undefined;
				expect(mute.updated_at).to.not.be.undefined;
				expect(mute.user.id).to.equal(user1);
				expect(mute.type).to.equal('mute_channel');
				expect(mute.channel_cid).to.equal(channel.cid);
				expect(mute.target).to.be.undefined;
				resolve();
			});
		});

		let channel = client1.channel('messaging', uuidv4(), {
			members: [user1],
		});
		await channel.create();

		const response = await channel.mute();
		console.log(response);
		expect(response.mute.created_at).to.not.be.undefined;
		expect(response.mute.updated_at).to.not.be.undefined;
		expect(response.mute.user.id).to.equal(user1);
		expect(response.mute.type).to.equal('mute_channel');
		expect(response.mute.channel_cid).to.equal(channel.cid);
		expect(response.mute.target).to.be.undefined;
		// verify we return the right user mute upon connect
		const client = getTestClient(false);
		const connectResponse = await client.setUser(
			{ id: user1 },
			createUserToken(user1),
		);
		expect(connectResponse.me.mutes.length).to.equal(1);
		expect(connectResponse.me.mutes[0].target).to.be.undefined;
		expect(connectResponse.me.mutes[0].type).to.be.equal('mute_channel');
		expect(connectResponse.me.mutes[0].channel_cid).to.be.equal(channel.cid);
		await eventPromise;
	});

	it('Mute after sendMessage', async function() {
		const user1 = uuidv4();
		const user2 = uuidv4();
		await createUsers([user1, user2]);
		const client1 = await getTestClientForUser(user1);
		const response = await client1.muteUser(user2);
		expect(response.mute.created_at).to.not.be.undefined;
		expect(response.mute.updated_at).to.not.be.undefined;
		expect(response.mute.user.id).to.equal(user1);
		expect(response.mute.target.id).to.equal(user2);
		await client1.channel('livestream', 'inglorious').create();
		await client1
			.channel('livestream', 'inglorious')
			.sendMessage({ text: 'yototototo' });
		// verify we return the right user mute upon connect
		const client = getTestClient(false);
		const connectResponse = await client.setUser(
			{ id: user1 },
			createUserToken(user1),
		);
		expect(connectResponse.me.mutes.length).to.equal(1);
		expect(connectResponse.me.mutes[0].target.id).to.equal(user2);
	});

	it('Unmute', async function() {
		const user1 = uuidv4();
		const user2 = uuidv4();
		await createUsers([user1, user2]);
		const client1 = await getTestClientForUser(user1);
		await client1.muteUser(user2);

		const eventPromise = new Promise(resolve => {
			// verify that the notification is sent
			client1.on('notification.mutes_updated', e => {
				if (e.me.mutes.length === 0) {
					resolve();
				}
			});
		});

		await client1.unmuteUser(user2);

		// wait notification
		await eventPromise;

		// verify we return the right user mute upon connect
		const client = getTestClient(false);
		const connectResponse = await client.setUser(
			{ id: user1 },
			createUserToken(user1),
		);
		expect(connectResponse.me.mutes.length).to.equal(0);
	});
});
