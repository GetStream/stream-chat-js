const { StreamChat } = require('../../../dist/index.js');
const apiKey = '892s22ypvt6m';
const apiSecret = '5cssrefv55rs3cnkk38kfjam2k7c2ykwn4h79dqh66ym89gm65cxy4h9jx4cypd6';
module.exports = {
	getTestClient: function getTestClient(serverSide) {
		return new StreamChat(apiKey, serverSide ? apiSecret : null);
	},
	getServerTestClient: function getServerTestClient() {
		return this.getTestClient(true);
	},
	getTestClientForUser2: function getTestClientForUser2(userID, options) {
		const client = this.getTestClient(false);
		client.setUser({ id: userID, ...options }, this.createUserToken(userID));
		return client;
	},
	getTestClientForUser: async function getTestClientForUser(userID, options) {
		const client = this.getTestClient(false);
		const health = await client.setUser(
			{ id: userID, ...options },
			this.createUserToken(userID),
		);
		client.health = health;
		return client;
	},
	createUserToken: function createUserToken(userID) {
		const c = new StreamChat(apiKey, apiSecret);
		return c.createToken(userID);
	},
	sleep: function sleep(ms) {
		return new Promise(resolve => {
			setTimeout(resolve, ms);
		});
	},
	runAndLogPromise: function runAndLogPromise(promiseCallable) {
		promiseCallable()
			.then(() => {})
			.catch(err => {
				console.warn('runAndLogPromise failed with error', err);
			});
	},
	createUsers: async function createUsers(userIDs, additionalInfo) {
		const serverClient = this.getServerTestClient();
		const users = [];
		for (const userID of userIDs) {
			users.push({ id: userID, ...additionalInfo });
		}
		return await serverClient.updateUsers(users);
	},
	getTestChannel: async function getTestChannel(id) {
		const client = this.getTestClient(true);
		const channels = await client.queryChannels({ id });
		return channels[0];
	},
	getTestChannelForUser: async function getTestChannelForUser(
		channelId,
		userID,
		options,
	) {
		const client = this.getTestClient(false);
		const health = await client.setUser(
			{ id: userID, ...options },
			this.createUserToken(userID),
		);
		client.health = health;
		const channels = await client.queryChannels({ id: channelId });
		return channels[0];
	},
};
