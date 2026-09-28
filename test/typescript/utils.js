const { StreamChat } = require('../../dist/cjs/index.node.js');

require('dotenv').config({ path: `${process.cwd()}/test/typescript/.env` });

const apiKey = process.env.API_KEY;
const apiSecret = process.env.API_SECRET;

const multiTenancySecret = process.env.MULTITENANCY_API_SECRET;
const multiTenancyKey = process.env.MULTITENANCY_API_KEY;

module.exports = {
	createMultiTenancyUsers: async function createMultiTenancyUsers(
		userIDs,
		teams = [],
		additionalInfo,
	) {
		const serverClient = await this.getMultiTenancyServerTestClient();
		const users = [];
		for (const userID of userIDs) {
			users.push({ id: userID, teams, ...additionalInfo });
		}
		return await serverClient.upsertUsers(users);
	},
	createUsers: async function createUsers(userIDs, additionalInfo) {
		const serverClient = this.getServerTestClient();
		const users = [];
		for (const userID of userIDs) {
			users.push({ id: userID, ...additionalInfo });
		}
		return await serverClient.upsertUsers(users);
	},
	createMultiTenancyUserToken: function createUserToken(userID) {
		const chat = new StreamChat(multiTenancyKey, multiTenancySecret);
		return chat.createToken(userID);
	},
	createUserToken: function createUserToken(userID) {
		const chat = new StreamChat(apiKey, apiSecret);
		return chat.createToken(userID);
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
		const channel = client.channel('messaging', id, { members: [userID] });
		await channel.create();
		return channel;
	},
	createTestMultiTenancyChannelForUser:
		async function createTestMultiTenancyChannelForUser(id, userID, team, options = {}) {
			const client = await this.getMultiTenancyTestClientForUser(userID, options);
			const channel = client.channel('messaging', id, { members: [userID], team });
			await channel.create();
			return channel;
		},
	getMultiTenancyTestClient: async function getMultiTenancyTestClient(serverSide) {
		const client = new StreamChat(
			multiTenancyKey,
			serverSide ? multiTenancySecret : null,
			{
				timeout: 8000,
				allowServerSideConnect: true,
			},
		);
		if (serverSide) {
			await client.updateAppSettings({
				multi_tenant_enabled: true,
			});
		}
		return client;
	},
	getMultiTenancyTestClientForUser: async function getMultiTenancyTestClientForUser(
		userID,
		options = {},
	) {
		const client = await this.getMultiTenancyTestClient(false);
		const health = await client.connectUser(
			{ id: userID, ...options },
			this.createMultiTenancyUserToken(userID),
		);
		client.health = health;
		return client;
	},
	getMultiTenancyServerTestClient: async function getMultiTenancyServerTestClient() {
		return await this.getMultiTenancyTestClient(true);
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
		promiseCallable().catch((err) => {
			console.warn('runAndLogPromise failed with error', err);
		});
	},
	sleep: function sleep(ms) {
		return new Promise((resolve) => {
			setTimeout(resolve, ms);
		});
	},
	// polls until predicate returns truthy, for state that arrives via WS events
	waitFor: async function waitFor(predicate, { timeout = 10000, interval = 100 } = {}) {
		const deadline = Date.now() + timeout;
		while (!predicate()) {
			if (Date.now() > deadline) throw new Error(`waitFor timed out after ${timeout}ms`);
			await this.sleep(interval);
		}
	},
	// retries fn on error, for eventually consistent backend reads
	retry: async function retry(fn, { attempts = 5, delay = 2000 } = {}) {
		for (let i = 1; ; i++) {
			try {
				return await fn();
			} catch (err) {
				if (i >= attempts) throw err;
				await this.sleep(delay);
			}
		}
	},
};
