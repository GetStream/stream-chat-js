const uuid4 = require('uuid/v4');
const fs = require('fs');
const utils = require('../utils');

const johnID = `john-${uuid4()}`;

async function sendReaction() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const channel = authClient.channel('messaging', `poppins-${uuid4()}`);
	await channel.watch();
	const { message } = await channel.sendMessage({ text: `Test message` });

	return await channel.sendReaction(message.id, { type: 'love' }, johnID);
}

async function deleteReaction() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const channel = authClient.channel('messaging', `poppins-${uuid4()}`);
	await channel.watch();
	const { message } = await channel.sendMessage({ text: `Test message` });

	await channel.sendReaction(message.id, { type: 'love' }, johnID);

	return await channel.deleteReaction(message.id, 'love', johnID);
}

async function getReactions() {
	const authClient = await utils.getTestClientForUser(johnID, {});
	const channel = authClient.channel('messaging', `poppins-${uuid4()}`);
	await channel.watch();
	const text = 'testing reactions list';
	const data = await channel.sendMessage({ text });

	const messageID = data.message.id;
	for (let i = 0; i < 10; i++) {
		await channel.sendReaction(messageID, {
			type: `love-${i}`,
		});
	}

	// paginate
	return await channel.getReactions(messageID, { limit: 3 });
}

module.exports = {
	getReactions,
	sendReaction,
	deleteReaction,
};
