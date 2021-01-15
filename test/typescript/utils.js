const { StreamChat } = require('../../dist');
require('dotenv').config();
const apiKey = '892s22ypvt6m';
const apiSecret = '5cssrefv55rs3cnkk38kfjam2k7c2ykwn4h79dqh66ym89gm65cxy4h9jx4cypd6';

module.exports = {
	createUsers: async function createUsers(userIDs, additionalInfo) {
		const serverClient = this.getServerTestClient();
		const users = [];
		for (const userID of userIDs) {
			users.push({ id: userID, ...additionalInfo });
		}
		return await serverClient.updateUsers(users);
	},
	createUserToken: function createUserToken(userID) {
		const c = new StreamChat(apiKey, apiSecret);
		return c.createToken(userID);
	},
	createTestChannel: async function createTestChannel(id, userID) {
		const client = this.getTestClient(true);
		const channel = client.channel('messaging', id, {
			created_by_id: userID,
		});
		await channel.create();
		return channel;
	},
	createTestChannelForUser: async function createTestChannelForUser(
		id,
		userID,
		options = {},
	) {
		const client = await this.getTestClientForUser(userID, options);
		const channel = client.channel('messaging', id);
		await channel.create();
		return channel;
	},
	getServerTestClient: function getServerTestClient() {
		return this.getTestClient(true);
	},
	getTestClient: function getTestClient(serverSide) {
		return new StreamChat(apiKey, serverSide ? apiSecret : null, {
			timeout: 8000,
			allowServerSideConnect: true,
		});
	},
	getTestClientForUser: async function getTestClientForUser(userID, options = {}) {
		const client = this.getTestClient(false);
		const health = await client.connectUser(
			{ id: userID, ...options },
			this.createUserToken(userID),
		);
		client.health = health;
		return client;
	},
	getTestClientForUser2: function getTestClientForUser2(userID, options) {
		const client = this.getTestClient(false);
		client.connectUser({ id: userID, ...options }, this.createUserToken(userID));
		return client;
	},
	runAndLogPromise: function runAndLogPromise(promiseCallable) {
		promiseCallable()
			.then(() => {})
			.catch((err) => {
				console.warn('runAndLogPromise failed with error', err);
			});
	},
	sleep: function sleep(ms) {
		return new Promise((resolve) => {
			setTimeout(resolve, ms);
		});
	},
};
