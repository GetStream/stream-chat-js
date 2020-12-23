const { v4: uuidv4 } = require('uuid');
const utils = require('../utils');
const fs = require('fs');
const url = require('url');

const johnID = `john-${uuidv4()}`;

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

async function addMembers() {
	const channel = await utils.createTestChannelForUser(uuidv4(), johnID);
	await channel.watch();

	const newMembers = [uuidv4(), uuidv4()];
	await utils.createUsers(newMembers);

	return await channel.addMembers(newMembers);
}

async function addModerators() {
	const channel = await utils.createTestChannel(uuidv4(), johnID);
	return await channel.addModerators([johnID]);
}

async function create() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const id = uuidv4();
	const channel = authClient.channel('messaging', id);
	return await channel.create();
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

async function deleteChannel() {
	const channel = await utils.createTestChannelForUser(uuidv4(), johnID);
	await channel.watch();

	return await channel.delete();
}

async function deleteFile() {
	const channel = await utils.createTestChannelForUser(uuidv4(), johnID);
	const rs = fs.createReadStream(
		url.pathToFileURL('./test/typescript/response-generators/index.js'),
	);
	const file = await channel.sendFile(rs, 'testFile');
	return channel.deleteFile(file.file);
}

async function deleteImage() {
	const channel = await utils.createTestChannelForUser(uuidv4(), johnID);

	const rs = fs.createReadStream(
		url.pathToFileURL('./test/typescript/response-generators/stream.png'),
	);
	const image = await channel.sendImage(rs, 'testImage');
	return channel.deleteImage(image.file);
}

async function demoteModerators() {
	const channel = await utils.createTestChannel(uuidv4(), johnID);
	await channel.addModerators([johnID]);
	return await channel.demoteModerators([johnID]);
}

async function getConfig() {
	const channel = await utils.createTestChannel(uuidv4(), johnID);

	return await channel.getConfig();
}

async function hide() {
	const channel = await utils.createTestChannelForUser(uuidv4(), johnID);
	await channel.watch();
	return await channel.hide();
}

async function inviteMembers() {
	const randomID = 'xyz' + uuidv4();
	const channel = await utils.createTestChannelForUser(uuidv4(), randomID);
	return await channel.inviteMembers([randomID]);
}

async function lastMessage() {
	const channel = await utils.createTestChannelForUser(uuidv4(), johnID);
	await channel.watch();
	await channel.sendMessage({ text: 'Hello World' });
	await channel.sendMessage({ text: 'Hello World...again' });

	return await channel.lastMessage();
}

async function markRead() {
	const channel = await utils.createTestChannelForUser(uuidv4(), johnID);
	await channel.watch();

	return await channel.markRead();
}

async function mute() {
	const channel = await utils.createTestChannelForUser(uuidv4(), johnID);
	return await channel.mute();
}

async function muteStatus() {
	const channel = await utils.createTestChannelForUser(uuidv4(), johnID);
	await channel.watch();
	return await channel.muteStatus();
}

async function query() {
	const channel = await utils.createTestChannelForUser(uuidv4(), johnID);
	const testText = uuidv4();
	await channel.sendMessage({ text: testText });

	return await channel.query({});
}

async function queryMembers() {
	const channel = await utils.createTestChannel(uuidv4(), johnID);
	return await channel.queryMembers({}, {}, { limit: 2 });
}

async function rejectInvite() {
	const c = await createTestInviteChannel();
	const nickC = await utils.getTestClientForUser('nick');
	// accept the invite, very similar to a regular update channel...
	const nickChannel = nickC.channel('messaging', c.id);
	await nickChannel.watch();

	return await nickChannel.rejectInvite();
}

async function removeMembers() {
	const channel = await utils.createTestChannelForUser(uuidv4(), johnID);
	await channel.watch();

	const newMembers = [uuidv4(), uuidv4()];
	await utils.createUsers(newMembers);
	await channel.addMembers(newMembers);

	return await channel.removeMembers(newMembers);
}

async function sendFile() {
	const channel = await utils.createTestChannelForUser(uuidv4(), johnID);
	const rs = fs.createReadStream(
		url.pathToFileURL('./test/typescript/response-generators/index.js'),
	);
	return await channel.sendFile(rs, 'testFile');
}

async function sendImage() {
	const channel = await utils.createTestChannelForUser(uuidv4(), johnID);

	const rs = fs.createReadStream(
		url.pathToFileURL('./test/typescript/response-generators/stream.png'),
	);
	return await channel.sendImage(rs, 'testImage');
}

async function show() {
	const channel = await utils.createTestChannelForUser(uuidv4(), johnID);
	await channel.watch();
	return await channel.show();
}

async function stopWatching() {
	const channel = await utils.createTestChannelForUser(uuidv4(), johnID);
	await channel.watch();

	return await channel.stopWatching();
}

async function truncateChannel() {
	const channel = await utils.createTestChannelForUser(uuidv4(), johnID);
	await channel.watch();

	return await channel.truncate();
}

async function unmute() {
	const channel = await utils.createTestChannelForUser(uuidv4(), johnID);
	return await channel.unmute();
}

async function updateChannel() {
	const channel = await utils.createTestChannelForUser(uuidv4(), johnID);
	await channel.watch();

	return await channel.update({
		description: 'Taking over this channel now',
	});
}

async function updateChannelFromOriginal() {
	const channel = await utils.createTestChannelForUser(uuidv4(), johnID);
	await channel.watch();
	await channel.update({
		...channel.data,
		frozen: true,
		description: 'Updating original data',
	});
	return await channel.update({
		...channel.data,
		smallTitle: 'Updating original data too/two',
	});
}

async function updateChannelType() {
	const authClient = await utils.getTestClient(true);
	return await authClient.updateChannelType('messaging', { uploads: true });
}

async function watch() {
	const channel = await utils.createTestChannelForUser(uuidv4(), johnID);
	return await channel.watch();
}

module.exports = {
	acceptInvite,
	addMembers,
	addModerators,
	create,
	deleteChannel,
	deleteFile,
	deleteImage,
	demoteModerators,
	getConfig,
	hide,
	inviteMembers,
	lastMessage,
	markRead,
	mute,
	muteStatus,
	query,
	queryMembers,
	rejectInvite,
	removeMembers,
	sendFile,
	sendImage,
	show,
	stopWatching,
	truncateChannel,
	unmute,
	updateChannel,
	updateChannelFromOriginal,
	updateChannelType,
	watch,
};
