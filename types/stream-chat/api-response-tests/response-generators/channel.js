const uuidv4 = require('uuid/v4');
const utils = require('../utils');
const fs = require('fs');
const url = require('url');

const johnID = `john-${uuidv4()}`;

async function create() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const id = uuidv4();
	const channel = authClient.channel('messaging', id);

	return await channel.create();
}

async function watch() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const id = uuidv4();
	const channel = authClient.channel('messaging', id);
	await channel.create();

	return await channel.watch();
}

async function query() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const id = uuidv4();
	const channel = authClient.channel('messaging', id);

	return await channel.query({});
}

async function stopWatching() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const id = uuidv4();
	const channel = authClient.channel('messaging', id);
	await channel.create();

	await channel.watch();

	return await channel.stopWatching();
}

async function createTestInviteChannel() {
	const randomID = 'xyz' + uuidv4();
	const client = await utils.getTestClientForUser(randomID);
	// nick should receive an invite
	const c = client.channel('messaging', {
		name: 'Founder Chat',
		image: 'http://bit.ly/2O35mws',
		members: ['josh', 'nick', 'thierry', randomID],
		invites: ['nick'],
	});
	await c.create();
	return c;
}

async function updateChannel() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const id = uuidv4();
	const channel = authClient.channel('messaging', id);
	await channel.create();
	await channel.watch();

	return await channel.update({
		description: 'Taking over this channel now',
	});
}

async function updateChannelType() {
	const authClient = await utils.getTestClient(true);
	return await authClient.updateChannelType('messaging', { uploads: true });
}

async function deleteChannel() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const id = uuidv4();
	const channel = authClient.channel('messaging', id);
	await channel.create();
	await channel.watch();

	return await channel.delete();
}

async function truncateChannel() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const id = uuidv4();
	const channel = authClient.channel('messaging', id);
	await channel.create();
	await channel.watch();

	return await channel.truncate();
}

async function acceptInvite() {
	const c = await createTestInviteChannel();
	const nickC = await utils.getTestClientForUser('nick');
	// accept the invite, very similar to a regular update channel...
	const nickChannel = nickC.channel('messaging', c.id);
	await nickChannel.watch();

	return await nickChannel.acceptInvite({
		message: { text: 'Nick accepted the chat invite.' },
	});
}

async function rejectInvite() {
	const c = await createTestInviteChannel();
	const nickC = await utils.getTestClientForUser('nick');
	// accept the invite, very similar to a regular update channel...
	const nickChannel = nickC.channel('messaging', c.id);
	await nickChannel.watch();

	return await nickChannel.rejectInvite();
}

async function addMembers() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const id = uuidv4();
	const channel = authClient.channel('messaging', id);
	await channel.create();
	await channel.watch();

	const newMembers = [uuidv4(), uuidv4()];
	await utils.createUsers(newMembers);

	return await channel.addMembers(newMembers);
}

async function removeMembers() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const id = uuidv4();
	const channel = authClient.channel('messaging', id);
	await channel.create();
	await channel.watch();

	const newMembers = [uuidv4(), uuidv4()];
	await utils.createUsers(newMembers);
	await channel.addMembers(newMembers);

	return await channel.removeMembers(newMembers);
}

async function markRead() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const id = uuidv4();
	const channel = authClient.channel('messaging', id);
	await channel.create();
	await channel.watch();

	return await channel.markRead();
}

async function sendFile() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const id = uuidv4();
	const channel = authClient.channel('messaging', id);

	await channel.create();
	const rs = fs.createReadStream(
		url.pathToFileURL(
			'./types/stream-chat/api-response-tests/response-generators/index.js',
		),
	);
	return await channel.sendFile(rs, 'testFile');
}

async function sendImage() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const id = uuidv4();
	const channel = authClient.channel('messaging', id);

	await channel.create();
	const rs = fs.createReadStream(
		url.pathToFileURL(
			'./types/stream-chat/api-response-tests/response-generators/stream.png',
		),
	);
	return await channel.sendImage(rs, 'testFile');
}

module.exports = {
	create,
	query,
	watch,
	stopWatching,
	updateChannel,
	updateChannelType,
	deleteChannel,
	truncateChannel,
	acceptInvite,
	rejectInvite,
	addMembers,
	removeMembers,
	markRead,
	sendFile,
	sendImage,
};
