const uuidv4 = require('uuid/v4');
const utils = require('../utils');

async function addDevice() {
	const user1 = uuidv4();
	await utils.createUsers([user1]);
	const client = await utils.getTestClientForUser(user1);
	return await client.addDevice(uuidv4(), 'firebase', user1);
}

async function connect() {
	const authClient = await utils.getTestClient(true);
	await authClient.setAnonymousUser();
	return await authClient.connect();
}

async function disconnect() {
	const authClient = await utils.getTestClient(true);
	await authClient.setAnonymousUser();
	await authClient.connect();
	return await authClient.disconnect();
}

async function getAppSettings() {
	const authClient = await utils.getServerTestClient();
	return await authClient.getAppSettings();
}

async function getDevices() {
	const user1 = uuidv4();
	await utils.createUsers([user1]);
	const client = await utils.getTestClientForUser(user1);
	await client.addDevice(uuidv4(), 'firebase', user1);
	return await client.getDevices(user1);
}

async function markAllRead() {
	const user1 = uuidv4();
	await utils.createUsers([user1]);
	const client = await utils.getTestClientForUser(user1);
	return await client.markAllRead({ user_id: user1 });
}

async function queryUsers() {
	const user1 = uuidv4();
	const user2 = uuidv4();
	await utils.createUsers([user1, user2], { nickname: user2 });
	const client = await utils.getTestClientForUser(user1);
	return await client.queryUsers({ nickname: { $eq: user2 } });
}

async function setAnonymousUser() {
	const authClient = await utils.getTestClient(true);
	return await authClient.setAnonymousUser();
}

async function setGuestUser() {
	const authClient = await utils.getTestClient(true);
	return await authClient.setGuestUser({ id: 'steven' });
}

async function setUser() {
	const user1 = uuidv4();
	const user2 = uuidv4();
	await utils.createUsers([user1, user2]);
	const client1 = await utils.getTestClientForUser(user1);

	await client1.muteUser(user2);

	const authClient = await utils.getTestClient(false);
	return authClient.setUser({ id: user1 }, utils.createUserToken(user1));
}

async function sync() {
	const user1 = uuidv4();
	await utils.createUsers([user1]);
	const client = await utils.getTestClientForUser(user1);
	const channelId = uuidv4();
	const channel = await utils.createTestChannelForUser(channelId, user1);
	await channel.sendMessage({
		text: 'New Event?',
		user: { id: user1 },
	});
	return await client.sync(
		[channel.cid],
		new Date(Date.now() - 1000 * 60).toISOString(),
	);
}

module.exports = {
	addDevice,
	connect,
	disconnect,
	getAppSettings,
	getDevices,
	markAllRead,
	queryUsers,
	setAnonymousUser,
	setGuestUser,
	setUser,
	sync,
};
