const uuid4 = require('uuid/v4');
const utils = require('../utils');

async function createCommand() {
	const client = utils.getTestClient(true);
	await client.createCommand({
		name: 'namee',
		description: 'description',
		args: 'args',
	});
}

async function updateCommand() {
	const client = utils.getTestClient(true);
	await client.updateCommand('name', {
		description: 'description',
		args: 'args',
	});
}

async function deleteCommand() {
	const client = utils.getTestClient(true);
	await client.deleteCommand('name');
}

async function getCommand() {
	const client = utils.getTestClient(true);
	await client.getCommand('name');
}

async function listCommands() {
	const client = utils.getTestClient(true);
	await client.listCommands();
}

module.exports = {
	createCommand,
	updateCommand,
	deleteCommand,
	getCommand,
	listCommands,
};
