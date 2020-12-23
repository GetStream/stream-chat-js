const { v4: uuid4 } = require('uuid');
const utils = require('../utils');

async function deactivateUser() {
	const client = utils.getServerTestClient();
	const userID = uuid4();
	await client.upsertUser({
		id: userID,
		name: 'Vishal',
	});

	return await client.deactivateUser(userID);
}

async function deleteUser() {
	const client = utils.getServerTestClient();
	const userID = uuid4();
	await client.upsertUser({
		id: userID,
		name: 'Vishal',
	});

	return client.deleteUser(userID);
}

async function exportUser() {
	const client = utils.getServerTestClient();
	const userID = uuid4();
	await client.upsertUser({
		id: userID,
		name: 'Vishal',
	});

	const channel = await utils.createTestChannelForUser(uuid4(), userID);
	const { message } = await channel.sendMessage({
		text: 'this is great',
		user_id: userID,
	});
	await channel.sendReaction(message.id, { type: 'love', user_id: userID });

	return client.exportUser(userID);
}

async function partialUpdateUser() {
	const client = utils.getServerTestClient();
	const userID = uuid4();
	const unique = uuid4();

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
	const userID = uuid4();
	const userID2 = uuid4();
	const userID3 = uuid4();
	const unique = uuid4();

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

async function reactivateUser() {
	const client = utils.getServerTestClient();
	const userID = uuid4();
	await client.upsertUser({
		id: userID,
		name: 'Vishal',
	});

	await client.deactivateUser(userID);

	return await client.reactivateUser(userID);
}

async function updateUsers() {
	const client = utils.getServerTestClient();
	const userID = uuid4();
	const userID2 = uuid4();
	const userID3 = uuid4();
	const unique = uuid4();

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

async function upsertUser() {
	const client = utils.getServerTestClient();
	const userID = uuid4();
	return await client.upsertUser({
		id: userID,
		name: 'Neil',
		nickname: 'neil',
	});
}

module.exports = {
	deactivateUser,
	deleteUser,
	exportUser,
	partialUpdateUser,
	partialUpdateUsers,
	reactivateUser,
	updateUsers,
	upsertUser,
};
