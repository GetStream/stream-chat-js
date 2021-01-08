const { v4: uuidv4 } = require('uuid');
const utils = require('../utils');

async function cleanupBucketList(client, name) {
	try {
		await client.deleteBlockList(name); // cleanup for previous failed tests
	} catch (err) {
		// do nothing
	}
}

async function banUsers() {
	const client = utils.getTestClient(true);
	const user = {
		id: uuidv4(),
	};

	const evilUser = 'evil-user' + uuidv4();
	await utils.createUsers([evilUser, user.id]);
	return await client.banUser(evilUser, {
		user_id: user.id,
	});
}

async function shadowBan() {
	const client = utils.getTestClient(true);
	const user = {
		id: uuidv4(),
	};

	const evilUser = 'evil-shadow-user' + uuidv4();
	await utils.createUsers([evilUser, user.id]);
	return await client.banUser(evilUser, {
		user_id: user.id,
		shadow: true,
	});
}

async function createBlockList() {
	const name = 'FWord';
	const client = utils.getTestClient(true);
	await cleanupBucketList(client, name);

	const returnValue = await client.createBlockList({ name, words: ['F*!k'] });
	await client.deleteBlockList(name);
	return returnValue;
}

async function createPermission() {
	const authClient = await utils.getTestClient(true);
	return await authClient.createPermission({
		name: 'TestCreatePermission',
		resource: 'ReadChannel',
	});
}

async function createRole() {
	const authClient = await utils.getTestClient(true);
	return await authClient.createRole(uuidv4());
}

async function deleteBlockList() {
	const name = 'FWord';
	const name2 = 'SWord';
	const client = await utils.getTestClient(true);
	await cleanupBucketList(client, name);
	await cleanupBucketList(client, name2);

	await client.createBlockList({ name, words: ['F*!k'] });
	await client.createBlockList({ name: name2, words: ['S!*t'] });

	const returnValue = await client.deleteBlockList(name);
	await client.deleteBlockList(name2);
	return returnValue;
}

async function deletePermission() {
	const authClient = await utils.getTestClient(true);
	await authClient.createPermission({
		name: 'TestDeletePermission',
		resource: 'DeleteChannel',
	});
	return await authClient.deletePermission('TestDeletePermission');
}

async function deleteRole() {
	const name = uuidv4();
	const authClient = await utils.getTestClient(true);
	await authClient.createRole(name);
	return await authClient.deleteRole(name);
}

async function flagMessage() {
	//flag the user
	const authClient = utils.getTestClient(true);
	const serverAuthClient = utils.getTestClient(true);
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
	await authClient.connectUser(thierry);

	const channel = authClient.channel('livestream', `ninja-${uuidv4()}`, {
		mysearchablefield: 'hi',
	});

	await channel.watch();

	const text = 'Flag me, i dare you mods!';
	const messageResponse = await channel.sendMessage({ text });
	return await authClient.flagMessage(messageResponse.message.id);
}

async function flagUser() {
	//flag the user
	const authClient = utils.getTestClient(true);
	const serverAuthClient = utils.getTestClient(true);
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
	await authClient.connectUser(thierry);
	const evilId = uuidv4();
	const evil = {
		id: evilId,
		name: 'Eviluser',
		status: 'busy',
		image: 'myimageurl',
		role: 'user',
	};

	const modUserID = uuidv4();

	await utils.createUsers([modUserID]);
	await serverAuthClient.updateUser(evil);

	return await authClient.flagUser(evilId);
}

async function getBlockList() {
	const name = 'FWord';
	const client = await utils.getTestClient(true);
	await cleanupBucketList(client, name);

	await client.createBlockList({ name, words: ['F*!k'] });

	const returnValue = await client.getBlockList(name);
	await client.deleteBlockList(name);
	return returnValue;
}

async function getPermission() {
	const authClient = await utils.getTestClient(true);
	await authClient.createPermission({
		name: 'TestGetPermission',
		resource: 'ReadChannel',
	});
	return await authClient.getPermission('TestGetPermission');
}

async function listBlockLists() {
	const name = 'FWord';
	const client = await utils.getTestClient(true);
	await client.createBlockList({ name, words: ['F*!k'] });

	const returnValue = await client.listBlockLists();
	await client.deleteBlockList(name);
	return returnValue;
}

async function listPermissions() {
	const authClient = await utils.getTestClient(true);
	await authClient.createPermission({
		name: 'TestListPermissions',
		resource: 'ReadChannel',
	});
	return await authClient.listPermissions();
}

async function listRoles() {
	const authClient = await utils.getTestClient(true);
	await authClient.createRole('TestListRole');
	authClient.listRoles();
}

async function muteUser() {
	const user1 = uuidv4();
	const user2 = uuidv4();
	await utils.createUsers([user1, user2]);
	const client1 = await utils.getTestClientForUser(user1);

	return await client1.muteUser(user2);
}

async function unbanUsers() {
	const client = utils.getTestClient(true);
	const user = {
		id: uuidv4(),
	};

	const evilUser = 'evil-user' + uuidv4();
	await utils.createUsers([evilUser, user.id]);

	return await client.unbanUser(evilUser);
}

async function removeShadowBan() {
	const client = utils.getTestClient(true);
	const user = {
		id: uuidv4(),
	};

	const evilUser = 'evil-shadow-user' + uuidv4();
	await utils.createUsers([evilUser, user.id]);

	return await client.unbanUser(evilUser);
}

async function unflagMessage() {
	//flag the user
	const authClient = utils.getTestClient(true);
	const serverAuthClient = utils.getTestClient(true);
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
	await authClient.connectUser(thierry);

	const channel = authClient.channel('livestream', `ninja-${uuidv4()}`, {
		mysearchablefield: 'hi',
	});

	await channel.watch();

	const text = 'Flag me, i dare you mods!';
	const messageResponse = await channel.sendMessage({ text });
	await authClient.flagMessage(messageResponse.message.id);

	return await authClient.unflagMessage(messageResponse.message.id);
}

async function unflagUser() {
	//flag the user
	const authClient = utils.getTestClient(true);
	const serverAuthClient = utils.getTestClient(true);
	const evilId = uuidv4();
	const evil = {
		id: evilId,
		name: 'Eviluser',
		status: 'busy',
		image: 'myimageurl',
		role: 'user',
	};
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
	await authClient.connectUser(thierry);
	const modUserID = uuidv4();

	await utils.createUsers([modUserID]);
	await serverAuthClient.updateUser(evil);

	await authClient.flagUser(evilId);

	return await authClient.unflagUser(evilId);
}

async function unmuteUser() {
	const user1 = uuidv4();
	const user2 = uuidv4();
	await utils.createUsers([user1, user2]);
	const client1 = await utils.getTestClientForUser(user1);

	await client1.muteUser(user2);
	return await client1.unmuteUser(user2);
}

async function updateBlockList() {
	const name = 'FWord';
	const client = await utils.getTestClient(true);
	await cleanupBucketList(client, name);

	await client.createBlockList({ name, words: ['F*!k'] });

	const returnValue = await client.updateBlockList(name, {
		words: ['S*!t'],
	});
	await client.deleteBlockList(name);
	return returnValue;
}

async function updatePermission() {
	const authClient = await utils.getTestClient(true);
	await authClient.createPermission({
		name: 'TestUpdatePermission',
		resource: 'ReadChannel',
	});
	return await authClient.updatePermission('TestUpdatePermission', {
		resource: 'DeleteChannel',
	});
}

module.exports = {
	banUsers,
	createBlockList,
	createPermission,
	createRole,
	deleteBlockList,
	deletePermission,
	deleteRole,
	flagMessage,
	flagUser,
	getBlockList,
	getPermission,
	listBlockLists,
	listPermissions,
	listRoles,
	muteUser,
	unbanUsers,
	unflagMessage,
	unflagUser,
	unmuteUser,
	updateBlockList,
	updatePermission,
	shadowBan,
	removeShadowBan,
};
