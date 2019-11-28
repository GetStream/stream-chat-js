const uuid4 = require('uuid/v4');
const fs = require('fs');
const utils = require('../utils');

const johnID = `john-${uuid4()}`;

async function sendMessageReadEvent() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const channel = authClient.channel('messaging', `poppins-${uuid4()}`);
	await channel.watch();
	const event = {
		type: 'message.read',
	};

	return await channel.sendEvent(event);
}

async function keystroke() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const channel = authClient.channel('messaging', `poppins-${uuid4()}`);
	await channel.watch();

	return await channel.keystroke();
}

async function stopTyping() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const channel = authClient.channel('messaging', `poppins-${uuid4()}`);
	await channel.watch();

	return await channel.stopTyping();
}

module.exports = {
	sendMessageReadEvent,
	keystroke,
	stopTyping,
};
