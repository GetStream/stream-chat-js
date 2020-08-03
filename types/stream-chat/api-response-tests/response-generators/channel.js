const uuidv4 = require('uuid/v4');
const utils = require('../utils');
const fs = require('fs');
const url = require('url');

const johnID = `john-${uuidv4()}`;
const testChannelId = 'Test_ID_For_Types';

async function create() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const id = uuidv4();
	const channel = authClient.channel('messaging', id);
	// Use this to create channel with testChannelId for testing
	// const channel = authClient.channel('messaging', testChannelId);

	return await channel.create();
}

async function watch() {
	const channel = await utils.getTestChannel(testChannelId);
	return await channel.watch();
}

async function query() {
	const channel = await utils.getTestChannelForUser(testChannelId, johnID, {});
	const testText = uuidv4();
	await channel.sendMessage({ text: testText });

	return await channel.query({});
}

async function stopWatching() {
	const channel = await utils.getTestChannelForUser(testChannelId, johnID, {});
	await channel.watch();

	return await channel.stopWatching();
}

async function inviteMembers() {
	const randomID = 'xyz' + uuidv4();
	const channel = await utils.getTestChannelForUser(testChannelId, randomID, {});
	return await channel.inviteMembers([randomID]);
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
	const channel = await utils.getTestChannelForUser(testChannelId, johnID, {});
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
	await channel.watch();

	return await channel.delete();
}

async function truncateChannel() {
	const channel = await utils.getTestChannel(testChannelId);
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
	const channel = await utils.getTestChannelForUser(testChannelId, johnID, {});
	await channel.watch();

	const newMembers = [uuidv4(), uuidv4()];
	await utils.createUsers(newMembers);

	return await channel.addMembers(newMembers);
}

async function addModerators() {
	const channel = await utils.getTestChannel(testChannelId);
	return await channel.addModerators([johnID]);
}

async function demoteModerators() {
	const channel = await utils.getTestChannel(testChannelId);
	await channel.addModerators([johnID]);
	return await channel.demoteModerators([johnID]);
}

async function removeMembers() {
	const channel = await utils.getTestChannelForUser(testChannelId, johnID, {});
	await channel.watch();

	const newMembers = [uuidv4(), uuidv4()];
	await utils.createUsers(newMembers);
	await channel.addMembers(newMembers);

	return await channel.removeMembers(newMembers);
}

async function markRead() {
	const channel = await utils.getTestChannelForUser(testChannelId, johnID, {});
	await channel.watch();

	return await channel.markRead();
}

async function sendFile() {
	const channel = await utils.getTestChannelForUser(testChannelId, johnID, {});
	const rs = fs.createReadStream(
		url.pathToFileURL(
			'./types/stream-chat/api-response-tests/response-generators/index.js',
		),
	);
	return await channel.sendFile(rs, 'testFile');
}

async function sendImage() {
	const channel = await utils.getTestChannelForUser(testChannelId, johnID, {});

	const rs = fs.createReadStream(
		url.pathToFileURL(
			'./types/stream-chat/api-response-tests/response-generators/stream.png',
		),
	);
	return await channel.sendImage(rs, 'testImage');
}

async function deleteFile() {
	const channel = await utils.getTestChannelForUser(testChannelId, johnID, {});
	const rs = fs.createReadStream(
		url.pathToFileURL(
			'./types/stream-chat/api-response-tests/response-generators/index.js',
		),
	);
	const file = await channel.sendFile(rs, 'testFile');
	return channel.deleteFile(file.file);
}

async function deleteImage() {
	const channel = await utils.getTestChannelForUser(testChannelId, johnID, {});

	const rs = fs.createReadStream(
		url.pathToFileURL(
			'./types/stream-chat/api-response-tests/response-generators/stream.png',
		),
	);
	const image = await channel.sendImage(rs, 'testImage');
	return channel.deleteImage(image.file);
}

async function getConfig() {
	const channel = await utils.getTestChannel(testChannelId);

	return await channel.getConfig();
}

async function queryMembers() {
	const channel = await utils.getTestChannel(testChannelId);
	return await channel.queryMembers({}, {}, { limit: 2 });
}

async function mute() {
	const channel = await utils.getTestChannelForUser(testChannelId, johnID, {});
	return await channel.mute();
}

async function unmute() {
	const channel = await utils.getTestChannelForUser(testChannelId, johnID, {});
	return await channel.unmute();
}

async function lastMessage() {
	const channel = await utils.getTestChannelForUser(testChannelId, johnID, {});
	await channel.sendMessage({ text: 'Hello World' });
	return await channel.lastMessage();
}

async function muteStatus() {
	const channel = await utils.getTestChannelForUser(testChannelId, johnID, {});
	return await channel.muteStatus();
}

async function hide() {
	const channel = await utils.getTestChannelForUser(testChannelId, johnID, {});
	return await channel.hide();
}

async function show() {
	const channel = await utils.getTestChannelForUser(testChannelId, johnID, {});
	return await channel.show();
}

module.exports = {
	create,
	hide,
	show,
	addModerators,
	getConfig,
	deleteFile,
	demoteModerators,
	deleteImage,
	inviteMembers,
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
	queryMembers,
	mute,
	unmute,
	lastMessage,
	muteStatus,
};
