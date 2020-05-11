const { v4: uuidv4 } = require('uuid');
const utils = require('../utils');

async function updateUsers() {
	const client = utils.getServerTestClient();
	const userID = uuidv4();
	const userID2 = uuidv4();
	const userID3 = uuidv4();
	const unique = uuidv4();

	return await client.updateUsers([
		{
			id: userID,
			unique,
			name: 'Curiosity Rover',
		},
		{
			id: userID2,
			unique,
			name: 'Roxy',
		},
		{
			id: userID3,
			unique,
			name: 'Roxanne',
		},
	]);
}

async function partialUpdateUser() {
	const client = utils.getServerTestClient();
	const userID = uuidv4();
	const unique = uuidv4();

	await client.updateUsers([
		{
			id: userID,
			unique,
			name: 'Curiosity Rover',
			company: 'Stream',
			gender: 'Male',
		},
	]);

	return await client.partialUpdateUser({
		id: userID,
		set: {
			gender: 'Female',
		},
		unset: ['company'],
	});
}

async function partialUpdateUsers() {
	const client = utils.getServerTestClient();
	const userID = uuidv4();
	const userID2 = uuidv4();
	const userID3 = uuidv4();
	const unique = uuidv4();

	await client.updateUsers([
		{
			id: userID,
			unique,
			name: 'Curiosity Rover',
			company: 'Stream',
			gender: 'Male',
		},
		{
			id: userID2,
			unique,
			name: 'Roxy',
			company: 'Stream',
			gender: 'Male',
		},
		{
			id: userID3,
			unique,
			name: 'Roxanne',
			company: 'Stream',
			gender: 'Female',
		},
	]);

	return await client.partialUpdateUsers([
		{
			id: userID,
			set: {
				gender: 'Female',
			},
			unset: ['company'],
		},
		{
			id: userID2,
			set: {
				gender: 'Female',
			},
			unset: ['company'],
		},
		{
			id: userID3,
			set: {
				gender: 'Male',
				work: 'Stream',
			},
			unset: ['company'],
		},
	]);
}

async function deactivateUser() {
	const client = utils.getServerTestClient();
	const userID = uuidv4();
	await client.upsertUser({
		id: userID,
		name: 'Vishal',
	});

	return await client.deactivateUser(userID);
}

async function reactivateUser() {
	const client = utils.getServerTestClient();
	const userID = uuidv4();
	await client.upsertUser({
		id: userID,
		name: 'Vishal',
	});

	await client.deactivateUser(userID);

	return await client.reactivateUser(userID);
}

async function deleteUser() {
	const client = utils.getServerTestClient();
	const userID = uuidv4();
	await client.upsertUser({
		id: userID,
		name: 'Vishal',
	});

	return client.deleteUser(userID);
}

async function exportUser() {
	const client = utils.getServerTestClient();
	const userID = uuidv4();
	await client.upsertUser({
		id: userID,
		name: 'Vishal',
	});

	const id = uuidv4();
	const channel = client.channel('messaging', id, { created_by_id: userID });
	await channel.create();
	const { message } = await channel.sendMessage({
		text: 'this is great',
		user_id: userID,
	});
	await channel.sendReaction(message.id, { type: 'love', user_id: userID });

	return client.exportUser(userID);
}

module.exports = {
	deactivateUser,
	reactivateUser,
	deleteUser,
	exportUser,
	updateUsers,
	partialUpdateUser,
	partialUpdateUsers,
};
