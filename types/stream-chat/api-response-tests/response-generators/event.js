const { v4: uuidv4 } = require('uuid');
const utils = require('../utils');

const johnID = `john-${uuidv4()}`;

async function sendMessageReadEvent() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const channel = authClient.channel('messaging', `poppins-${uuidv4()}`);
	await channel.watch();
	const event = {
		type: 'message.read',
	};

	return await channel.sendEvent(event);
}

async function keystroke() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const channel = authClient.channel('messaging', `poppins-${uuidv4()}`);
	await channel.watch();

	return await channel.keystroke();
}

async function stopTyping() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const channel = authClient.channel('messaging', `poppins-${uuidv4()}`);
	await channel.watch();

	return await channel.stopTyping();
}

module.exports = {
	sendMessageReadEvent,
	keystroke,
	stopTyping,
};
