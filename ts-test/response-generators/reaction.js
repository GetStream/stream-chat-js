const uuidv4 = require('uuid/v4');
const utils = require('../utils');

const johnID = `john-${uuidv4()}`;

async function deleteReaction() {
	const channel = await utils.createTestChannelForUser(uuidv4(), johnID);
	await channel.watch();
	const { message } = await channel.sendMessage({ text: `Test message` });

	await channel.sendReaction(message.id, { type: 'love' }, johnID);

	return await channel.deleteReaction(message.id, 'love', johnID);
}

async function getReactions() {
	const channel = await utils.createTestChannelForUser(uuidv4(), johnID);
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

async function sendReaction() {
	const channel = await utils.createTestChannelForUser(uuidv4(), johnID);
	await channel.watch();
	const { message } = await channel.sendMessage({ text: `Test message` });

	return await channel.sendReaction(message.id, { type: 'love' }, johnID);
}

module.exports = {
	deleteReaction,
	getReactions,
	sendReaction,
};
