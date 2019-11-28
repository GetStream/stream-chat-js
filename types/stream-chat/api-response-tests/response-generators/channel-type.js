const uuidv4 = require('uuid/v4');
const fs = require('fs');
const utils = require('../utils');

const johnID = `john-${uuidv4()}`;

async function createChannelType() {
	const client = utils.getTestClient(true);
	const newType = uuidv4();
	return await client.createChannelType({
		name: newType,
		commands: ['all'],
	});
}

async function getChannelType() {
	const client = utils.getTestClient(true);

	return await client.getChannelType('messaging');
}

async function listChannelTypes() {
	const client = utils.getTestClient(true);

	return await client.listChannelTypes();
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

module.exports = {
	createChannelType,
	getChannelType,
	listChannelTypes,
	deleteChannelType,
};
