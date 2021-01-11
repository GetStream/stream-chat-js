const { v4: uuidv4 } = require('uuid');
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

async function createCommand() {
	const authClient = await utils.getTestClient(true);
	try {
		await authClient.deleteCommand('testCreateCommand');
	} catch {
		// No command to delete
	}
	const result = await authClient.createCommand({
		description: 'testCreateCommand',
		name: 'testCreateCommand',
		set: 'testCreateCommand_set',
	});
	await authClient.deleteCommand('testCreateCommand');
	return result;
}

async function deleteCommand() {
	const authClient = await utils.getTestClient(true);
	try {
		await authClient.deleteCommand('testDeleteCommand');
	} catch {
		// No command to delete
	}
	await authClient.createCommand({
		description: 'testDeleteCommand',
		name: 'testDeleteCommand',
		set: 'testDeleteCommand_set',
	});
	return await authClient.deleteCommand('testDeleteCommand');
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

async function getCommand() {
	const authClient = await utils.getTestClient(true);
	try {
		await authClient.deleteCommand('testGetCommand');
	} catch {
		// No command to delete
	}
	await authClient.createCommand({
		description: 'testGetCommand',
		name: 'testGetCommand',
		set: 'testGetCommand_set',
	});
	const result = await authClient.getCommand('testGetCommand');
	await authClient.deleteCommand('testGetCommand');
	return result;
}

async function getDevices() {
	const user1 = uuidv4();
	await utils.createUsers([user1]);
	const client = await utils.getTestClientForUser(user1);
	await client.addDevice(uuidv4(), 'firebase', user1);
	return await client.getDevices(user1);
}

async function listCommands() {
	const authClient = await utils.getTestClient(true);
	try {
		await authClient.deleteCommand('testListCommand');
	} catch {
		// No command to delete
	}
	await authClient.createCommand({
		description: 'testListCommand',
		name: 'testListCommand',
		set: 'testListCommand_set',
	});
	const result = await authClient.listCommands();
	await authClient.deleteCommand('testListCommand');
	return result;
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
	return authClient.connectUser({ id: user1 }, utils.createUserToken(user1));
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

async function updateAppSettings() {
	const authClient = await utils.getTestClient(true);
	return await authClient.updateAppSettings({
		custom_action_handler_url:
			'https://example.com/webhooks/stream/custom-commands?type={type}',
		enforce_unique_usernames: 'no',
	});
}

async function updateCommand() {
	const authClient = await utils.getTestClient(true);
	try {
		await authClient.createCommand({
			description: 'testUpdateCommand',
			name: 'testUpdateCommand',
			set: 'testUpdateCommand_set',
		});
	} catch {
		// Command exists
	}
	const result = await authClient.updateCommand('testUpdateCommand', {
		set: 'testUpdateCommand_set_two',
		description: 'testUpdateCommand',
	});
	await authClient.deleteCommand('testUpdateCommand');
	return result;
}

module.exports = {
	addDevice,
	connect,
	createCommand,
	deleteCommand,
	disconnect,
	getAppSettings,
	getCommand,
	getDevices,
	listCommands,
	markAllRead,
	queryUsers,
	setAnonymousUser,
	setGuestUser,
	setUser,
	sync,
	updateAppSettings,
	updateCommand,
};
