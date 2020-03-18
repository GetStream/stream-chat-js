import uuidv4 from 'uuid/v4';
import {
	getTestClientForUser,
	createUsers,
	getTestClient,
	createUserToken,
	expectHTTPErrorCode,
	sleep,
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

describe('mute channels', function() {
	let user1 = uuidv4();
	let client1;
	let mutedChannelId = uuidv4();
	it('mute channel and expect notification)', async function() {
		await createUsers([user1]);
		client1 = await getTestClientForUser(user1);

		const eventPromise = new Promise(resolve => {
			let onChannelMute = e => {
				expect(e.me.mutes.length).to.equal(1);
				let mute = e.me.mutes[0];
				expect(mute.created_at).to.not.be.undefined;
				expect(mute.updated_at).to.not.be.undefined;
				expect(mute.user.id).to.equal(user1);
				expect(mute.type).to.equal('mute_channel');
				expect(mute.channel.cid).to.equal(channel.cid);
				expect(mute.target).to.be.undefined;
				resolve();
				//cleanup
				client1.off('notification.channel_mutes_updated', onChannelMute);
			};
			// verify that the notification is sent
			client1.on('notification.channel_mutes_updated', onChannelMute);
		});

		let channel = client1.channel('messaging', mutedChannelId, {
			members: [user1],
		});
		await channel.create();

		const response = await channel.mute();
		expect(response.channel_mute.created_at).to.not.be.undefined;
		expect(response.channel_mute.updated_at).to.not.be.undefined;
		expect(response.channel_mute.user.id).to.equal(user1);
		expect(response.channel_mute.type).to.equal('mute_channel');
		expect(response.channel_mute.channel_cid).to.equal(channel.cid);
		expect(response.channel_mute.target).to.be.undefined;
		// verify we return the right channel mute upon connect
		const client = getTestClient(false);
		const connectResponse = await client.setUser(
			{ id: user1 },
			createUserToken(user1),
		);
		expect(connectResponse.me.mutes.length).to.equal(1);
		expect(connectResponse.me.mutes[0].target).to.be.undefined;
		expect(connectResponse.me.mutes[0].type).to.be.equal('mute_channel');
		await eventPromise;
	});

	it('query muted channels', async function() {
		const resp = await client1.queryChannels({ muted: true });
		expect(resp.length).to.be.equal(1);
		expect(resp[0].id).to.be.equal(mutedChannelId);
	});

	it('query muted channels with other filters', async function() {
		const resp = await client1.queryChannels({
			members: { $in: [user1] },
			muted: true,
		});
		expect(resp.length).to.be.equal(1);
		expect(resp[0].id).to.be.equal(mutedChannelId);
	});

	it('exclude muted channels', async function() {
		const resp = await client1.queryChannels({ muted: false });
		expect(resp.length).to.be.equal(0);
	});

	it('unmute channel ', async function() {
		const eventPromise = new Promise(resolve => {
			let onChannelMute = e => {
				expect(e.me.mutes.length).to.equal(0);
				resolve();
				//cleanup
				client1.off('notification.channel_mutes_updated', onChannelMute);
			};
			// verify that the notification is sent
			client1.on('notification.channel_mutes_updated', onChannelMute);
		});

		await client1.channel('messaging', mutedChannelId).unmute();

		// verify we return the right channel mute upon connect
		const client = getTestClient(false);
		const connectResponse = await client.setUser(
			{ id: user1 },
			createUserToken(user1),
		);
		expect(connectResponse.me.mutes.length).to.equal(0);
		await eventPromise;
	});

	it('muted and mute_expires_at are reserved fields', async function() {
		let channel = client1.channel('messaging', uuidv4(), {
			muted: true,
			mute_expires_at: new Date(),
		});
		await expectHTTPErrorCode(
			400,
			channel.create(),
			'StreamChat error code 4: GetOrCreateChannel failed with error: "data.mute_expires_at is a reserved field, data.muted is a reserved field"',
		);
	});

	it('mute non existing channel must fail', async function() {
		const id = uuidv4();
		await expectHTTPErrorCode(
			400,
			client1.channel('messaging', id).mute(),
			`StreamChat error code 4: MuteChannel failed with error: "some channels do not exist or were deleted: (messaging:${id})"`,
		);
	});

	it('ummute non existing channel must fail', async function() {
		const id = uuidv4();
		await expectHTTPErrorCode(
			400,
			client1.channel('messaging', id).unmute(),
			`StreamChat error code 4: UnmuteChannel failed with error: "some channels do not exist or were deleted: (messaging:${id})"`,
		);
	});

	it('mute server side require an user to be specified', async function() {
		const client = getTestClient(true);
		const channel = client.channel('messaging', uuidv4(), {
			created_by_id: user1,
		});
		await channel.create();

		await expectHTTPErrorCode(
			400,
			channel.mute(),
			`StreamChat error code 4: MuteChannel failed with error: "either user or user_id must be provided when using server side auth."`,
		);
	});

	it('unmute server side require an user to be specified', async function() {
		const client = getTestClient(true);
		const channel = client.channel('messaging', uuidv4(), {
			created_by_id: user1,
		});
		await channel.create();

		await expectHTTPErrorCode(
			400,
			channel.unmute(),
			`StreamChat error code 4: UnmuteChannel failed with error: "either user or user_id must be provided when using server side auth."`,
		);
	});

	it('mute channel with expiration', async function() {
		const channel = client1.channel('messaging', uuidv4());
		await channel.create();

		// mute will expire in 500 milliseconds
		await channel.mute({ expiration: 500 });

		let client = await getTestClientForUser(user1);
		expect(client.health.me.mutes.length).to.equal(1);

		await sleep(500);
		// mute should be expired and not returned
		client = await getTestClientForUser(user1);
		expect(client.health.me.mutes.length).to.equal(0);
		// expired muted should not be returned in query channels
		let resp = await client1.queryChannels({ muted: true });
		expect(resp.length).to.be.equal(0);

		// return only non muted channels + other filter
		resp = await client1.queryChannels({ muted: false, cid: channel.cid });
		expect(resp.length).to.be.equal(1);
		expect(resp[0].cid).to.be.equal(channel.cid);
	});
});
