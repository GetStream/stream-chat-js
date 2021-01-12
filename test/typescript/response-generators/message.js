const { v4: uuidv4 } = require('uuid');
const utils = require('../utils');

const johnID = `john-${uuidv4()}`;

async function deleteMessage() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const channel = authClient.channel('messaging', `poppins-${uuidv4()}`);
	await channel.watch();
	const { message } = await channel.sendMessage({ text: `Test message` });

	return await authClient.deleteMessage(message.id);
}

async function getMessage() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const channel = authClient.channel('messaging', `poppins-${uuidv4()}`);
	await channel.watch();
	const { message } = await channel.sendMessage({ text: `Test message` });
	return await authClient.getMessage(message.id);
}

async function getMessagesById() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const channel = authClient.channel('messaging', `poppins-${uuidv4()}`);
	await channel.watch();
	const { message } = await channel.sendMessage({ text: `Test message` });

	return await channel.getMessagesById([message.id]);
}

async function getMessageWithReply() {
	const authClient = await utils.getTestClientForUser(johnID, { testString: 'test' });
	const channel = authClient.channel('messaging', `poppins-${uuidv4()}`);
	await channel.watch();
	const { message } = await channel.sendMessage({ text: `Test message` });
	await channel.sendMessage({
		text: 'Hey, I am replying to a message!',
		parent_id: message.id,
		show_in_channel: false,
	});
	return await authClient.getMessage(message.id);
}

async function getReplies() {
	const serverAuthClient = utils.getTestClient(true);
	const userID = 'tommaso-' + uuidv4();
	const channelID = `free4all-` + uuidv4();
	const thierry = {
		id: uuidv4(),
		instrument: 'saxophone',
	};

	await utils.getTestClient(true).updateUser(thierry);
	await utils.getTestClient(true).updateUser({ id: userID, instrument: 'guitar' });
	const channel = serverAuthClient.channel('team', channelID, {
		created_by: { id: thierry.id },
		members: [userID, thierry.id],
	});
	await channel.create();

	const response = await channel.sendMessage({
		text: '@thierry how are you doing?',
		user: { id: userID },
		mentioned_users: [thierry.id],
	});
	await channel.sendMessage({
		text: '@tommaso I am doing great?',
		user: { id: thierry.id },
		mentioned_users: [userID],
		parent_id: response.message.id,
	});
	await channel.query();
	const parent = channel.state.messages[channel.state.messages.length - 1];

	return await channel.getReplies(parent.id);
}

async function sendAction() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const channel = authClient.channel('messaging', `poppins-${uuidv4()}`);
	await channel.watch();
	const { message } = await channel.sendMessage({ text: `/giphy wave` });

	const messageID = message.id;
	return await channel.sendAction(messageID, {
		image_action: 'shuffle',
	});
}

async function sendMessage() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const channel = authClient.channel('messaging', `poppins-${uuidv4()}`);
	await channel.watch();
	return await channel.sendMessage({ text: `Test message` });
}

async function translateMessage() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const channel = authClient.channel('messaging', `poppins-${uuidv4()}`);
	await channel.watch();
	const { message } = await channel.sendMessage({ text: `Test message` });

	return await authClient.translateMessage(message.id, 'da');
}

async function updateMessage() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const userID = 'tommaso-' + uuidv4();
	await utils.getTestClient(true).updateUser({ id: userID });
	const channel = authClient.channel('messaging', `poppins-${uuidv4()}`, {
		members: [userID],
	});
	await channel.watch();
	const { message } = await channel.sendMessage({ text: `Test message` });
	return await authClient.updateMessage({
		id: message.id,
		text: 'I mean, awesome chat',
		mentioned_users: [userID],
	});
}

module.exports = {
	deleteMessage,
	getMessage,
	getMessagesById,
	getMessageWithReply,
	getReplies,
	sendAction,
	sendMessage,
	translateMessage,
	updateMessage,
};
