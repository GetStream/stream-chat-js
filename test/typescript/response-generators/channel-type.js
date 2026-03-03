// generateUUIDv4 is not exported from the public API, using test UUID for test data
const uuidv4 = () =>
	'test-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now();
const utils = require('../utils');

async function createChannelType() {
	const client = utils.getTestClient(true);
	const newType = uuidv4();
	return await client.createChannelType({
		name: newType,
		commands: ['all'],
	});
}

async function deleteChannelType() {
	const client = utils.getTestClient(true);
	const newType = uuidv4();
	await client.createChannelType({
		name: newType,
		commands: ['all'],
	});

	return await client.deleteChannelType(newType);
}

async function getChannelType() {
	const client = utils.getTestClient(true);

	return await client.getChannelType('messaging');
}

async function listChannelTypes() {
	const client = utils.getTestClient(true);

	return await client.listChannelTypes();
}

module.exports = {
	createChannelType,
	deleteChannelType,
	getChannelType,
	listChannelTypes,
};
