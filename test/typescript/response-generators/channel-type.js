const { v4: uuidv4 } = require('uuid');
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
